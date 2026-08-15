import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomFacilityDto } from './dto/create-room-facility.dto';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { UpdateRoomDto, UpdateRoomStatusDto } from './dto/update-room.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { RoomRepository } from './repositories/room.repository';

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly database: DatabaseService,
  ) {}

  async listRooms(user: UserAccessContext, query: ListRoomsQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    return this.rooms.listRooms(query, this.scopeIds(user));
  }

  async getRoom(user: UserAccessContext, roomId: string) {
    const room = await this.requireRoom(roomId);
    await this.properties.assertCanReadProperty(user, room.propertyId);
    return room;
  }

  async createRoom(user: UserAccessContext, dto: CreateRoomDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const room = await this.rooms.createRoom(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: room.propertyId,
      action: 'room.create',
      resourceType: 'room',
      resourceId: room.id,
      afterData: room,
      resultStatus: 'success',
      ...context,
    });
    return room;
  }

  async updateRoom(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.rooms.updateRoom(roomId, dto, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'room.update',
      resourceType: 'room',
      resourceId: roomId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async updateRoomStatus(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomStatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutateProperty(user, before.propertyId);
    // W07B decision 5: a room awaiting transfer inspection can only leave
    // inspection_required through the authorized inspection-resolution
    // command. Fail closed against every direct status patch.
    if (before.roomStatus === 'inspection_required') {
      throw new ConflictException({
        code: 'ROOM_INSPECTION_LOCKED',
        message:
          'Room is awaiting transfer inspection; use POST /rooms/:roomId/inspection-resolution to resolve it',
      });
    }
    const updated = await this.rooms.updateRoomStatus(roomId, dto.status, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'room.status_update',
      resourceType: 'room',
      resourceId: roomId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async availability(user: UserAccessContext, propertyId?: string) {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return this.rooms.availability(propertyId);
    }

    if (user.roles.includes('owner')) {
      return this.rooms.availability();
    }

    const results = [];
    for (const id of user.propertyIds) {
      results.push(...(await this.rooms.availability(id)));
    }
    return results;
  }

  async listRoomTypes(user: UserAccessContext) {
    return this.rooms.listRoomTypes(this.scopeIds(user));
  }

  async createRoomType(
    user: UserAccessContext,
    dto: CreateRoomTypeDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const roomType = await this.rooms.createRoomType(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: roomType.propertyId,
      action: 'room_type.create',
      resourceType: 'room_type',
      resourceId: roomType.id,
      afterData: roomType,
      resultStatus: 'success',
      ...context,
    });
    return roomType;
  }

  async updateRoomType(
    user: UserAccessContext,
    roomTypeId: string,
    dto: UpdateRoomTypeDto,
    context: RequestAuditContext,
  ) {
    const before = await this.rooms.findRoomType(roomTypeId);
    if (!before) {
      throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND', message: 'Room type not found' });
    }
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.rooms.updateRoomType(roomTypeId, dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: before.propertyId,
      action: 'room_type.update',
      resourceType: 'room_type',
      resourceId: roomTypeId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async listFacilities(user: UserAccessContext) {
    return this.rooms.listFacilities(this.scopeIds(user));
  }

  async createFacility(
    user: UserAccessContext,
    dto: CreateRoomFacilityDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const facility = await this.rooms.createFacility(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: facility.propertyId,
      action: 'room_facility.create',
      resourceType: 'room_facility',
      resourceId: facility.id,
      afterData: facility,
      resultStatus: 'success',
      ...context,
    });
    return facility;
  }

  /**
   * W07B smallest authorized inspection-resolution boundary (lead decision 5).
   * Pass -> vacant, Fail -> maintenance, matching the documented room
   * lifecycle. Full W07D inspection/disposition policy is out of scope.
   *
   * W07B revision 4: the command is property-scoped, transactional,
   * replay-safe, audited, and outbox-backed. Idempotency-Key is mandatory;
   * an identical replay returns the original stored result, while a reused
   * key with a different payload fails closed.
   */
  async resolveRoomInspection(
    user: UserAccessContext,
    roomId: string,
    input: { outcome: 'pass' | 'fail'; notes?: string },
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const route = `POST /rooms/${roomId}/inspection-resolution`;
    const key = this.requireIdempotencyKey(idempotencyKey);
    const notes = input.notes?.trim() || null;
    const fingerprint = this.requestFingerprint({
      route,
      actor_id: user.id,
      property_id: before.propertyId,
      payload: { outcome: input.outcome, notes },
    });

    return this.database.transaction(async (client) => {
      const replayed = await this.claimInspectionCommand(
        client,
        before.propertyId,
        user.id,
        route,
        key,
        fingerprint,
        context.correlationId,
      );
      if (replayed) {
        return { status: replayed.status, body: replayed.body, replayed: true };
      }

      const locked = await client.query<{ id: string; property_id: string; room_status: string }>(
        `SELECT id, property_id, room_status FROM rooms WHERE id = $1 FOR UPDATE`,
        [roomId],
      );
      const room = locked.rows[0];
      if (!room) {
        throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      }
      if (room.property_id !== before.propertyId) {
        throw new ForbiddenException({
          code: 'PROPERTY_SCOPE_MISMATCH',
          message: 'Room does not belong to the expected property',
        });
      }
      if (room.room_status !== 'inspection_required') {
        throw new ConflictException({
          code: 'ROOM_INSPECTION_NOT_PENDING',
          message: 'Room is not awaiting transfer inspection',
        });
      }
      const nextStatus = input.outcome === 'pass' ? 'vacant' : 'maintenance';
      await client.query(
        `UPDATE rooms SET room_status = $2, updated_by_user_id = $3, updated_at = now()
           WHERE id = $1`,
        [roomId, nextStatus, user.id],
      );
      await client.query(
        `INSERT INTO audit_logs (
             actor_user_id, property_id, action, resource_type, resource_id,
             before_data, after_data, result_status, ip_address, user_agent, correlation_id
           ) VALUES ($1, $2, 'room.inspection_resolution', 'room', $3, $4::jsonb, $5::jsonb, 'success', $6::inet, $7, $8)`,
        [
          user.id,
          room.property_id,
          roomId,
          JSON.stringify({ room_status: 'inspection_required' }),
          JSON.stringify({ room_status: nextStatus, outcome: input.outcome, notes }),
          context.ipAddress ?? null,
          context.userAgent ?? null,
          context.correlationId ?? null,
        ],
      );
      await client.query(
        `INSERT INTO business_events (
             property_id, event_key, event_type, aggregate_type, aggregate_id,
             payload, correlation_id, actor_user_id
           ) VALUES ($1, $2, 'room.inspection_resolved', 'room', $3, $4::jsonb, $5, $6)
           ON CONFLICT (event_key) DO NOTHING`,
        [
          room.property_id,
          `room.inspection_resolved:${roomId}:${key}`,
          roomId,
          JSON.stringify({
            room_id: roomId,
            outcome: input.outcome,
            next_status: nextStatus,
            notes,
          }),
          context.correlationId ?? null,
          user.id,
        ],
      );

      const data = {
        id: roomId,
        property_id: room.property_id,
        previous_room_status: 'inspection_required',
        room_status: nextStatus,
        outcome: input.outcome,
        notes,
      };
      const body = { data };
      await client.query(
        `UPDATE idempotency_commands
           SET command_status = 'succeeded', response_status = $2, response_body = $3::jsonb,
               resource_type = 'room', resource_id = $4, completed_at = now()
           WHERE actor_user_id = $1 AND route = $5 AND idempotency_key = $6`,
        [user.id, 200, JSON.stringify(body), roomId, route, key],
      );
      return { status: 200, body, replayed: false };
    });
  }

  private async claimInspectionCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<{ status: number; body: { data: unknown } } | null> {
    const inserted = await client.query<{
      request_fingerprint: string;
      command_status: 'pending' | 'succeeded' | 'failed';
      response_status: number | null;
      response_body: unknown;
    }>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_status, response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<{
      request_fingerprint: string;
      command_status: 'pending' | 'succeeded' | 'failed';
      response_status: number | null;
      response_body: unknown;
    }>(
      `SELECT request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row || row.command_status === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    if (row.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (!row.response_status || !row.response_body || typeof row.response_body !== 'object') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    return { status: row.response_status, body: row.response_body as { data: unknown } };
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private scopeIds(user: UserAccessContext): string[] | undefined {
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(
    user: UserAccessContext,
    propertyId: string,
  ): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate operational data',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async requireRoom(roomId: string) {
    const room = await this.rooms.findRoom(roomId);
    if (!room) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    return room;
  }
}
