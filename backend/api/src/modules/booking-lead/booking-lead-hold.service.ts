import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { BookingLeadHoldFeatureService } from './booking-lead-hold-feature.service';
import { ListBookingLeadHoldsQueryDto } from './dto/list-booking-lead-holds-query.dto';
import {
  BookingLeadHoldIdempotencyClaim,
  BookingLeadHoldRepository,
} from './repositories/booking-lead-hold.repository';
import {
  BookingLeadHoldCommandResult,
  BookingLeadHoldRecord,
  BookingLeadHoldRequestContext,
  BookingLeadHoldResponse,
} from './types/booking-lead-hold.types';

const CREATE_ROUTE = 'POST /booking-leads/:leadId/hold';
const RELEASE_ROUTE = 'POST /booking-leads/:leadId/hold/release';
const ELIGIBLE_LEAD_STATUSES = new Set(['new', 'contacted', 'visit_scheduled']);

type CommandOperation = {
  status: number;
  body: Record<string, unknown>;
  succeeded: boolean;
  resourceId: string | null;
};

@Injectable()
export class BookingLeadHoldService {
  constructor(
    private readonly holds: BookingLeadHoldRepository,
    private readonly features: BookingLeadHoldFeatureService,
  ) {}

  async create(
    leadId: string,
    propertyId: string,
    requestedRoomId: string | undefined,
    idempotencyKey: string | undefined,
    context: BookingLeadHoldRequestContext,
  ): Promise<BookingLeadHoldCommandResult> {
    await this.features.assertCreateEnabled(propertyId);
    try {
      return await this.executeCommand(
        CREATE_ROUTE,
        'create',
        leadId,
        propertyId,
        { room_id: requestedRoomId ?? null },
        idempotencyKey,
        context,
        async (client) =>
          this.createInsideTransaction(client, leadId, propertyId, requestedRoomId, context),
      );
    } catch (error) {
      this.rethrowKnownDatabaseConflict(error);
    }
  }

  async release(
    leadId: string,
    propertyId: string,
    idempotencyKey: string | undefined,
    context: BookingLeadHoldRequestContext,
  ): Promise<BookingLeadHoldCommandResult> {
    return this.executeCommand(
      RELEASE_ROUTE,
      'release',
      leadId,
      propertyId,
      { room_id: null },
      idempotencyKey,
      context,
      async (client) => this.releaseInsideTransaction(client, leadId, propertyId, context),
    );
  }

  async list(query: ListBookingLeadHoldsQueryDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const result = await this.holds.list(query.property_id, limit, offset);
    return {
      data: result.records.map((record) => this.response(record)),
      meta: { limit, offset, total: result.total },
    };
  }

  private async createInsideTransaction(
    client: PoolClient,
    leadId: string,
    propertyId: string,
    requestedRoomId: string | undefined,
    context: BookingLeadHoldRequestContext,
  ): Promise<CommandOperation> {
    await this.holds.lockPropertyLifecycle(client, propertyId);
    if (!(await this.holds.lockProperty(client, propertyId))) this.throwFeatureDisabled();
    await this.features.assertCreateEnabled(propertyId, client);

    const lead = await this.holds.lockLead(client, leadId);
    if (!lead) {
      throw new NotFoundException({
        code: 'BOOKING_HOLD_LEAD_NOT_FOUND',
        message: 'Booking lead not found',
      });
    }
    if (lead.propertyId !== propertyId) this.throwPropertyDenied();
    if (
      lead.source === 'admin_quick_entry' &&
      lead.roomId &&
      requestedRoomId &&
      lead.roomId !== requestedRoomId
    ) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_TARGET_LOCKED',
        message: 'Quick-entry booking lead must retain its original target room',
      });
    }
    if (lead.source === 'public_kamar' && !requestedRoomId) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_REQUIRED',
        message: 'A public booking lead requires an administrator-selected room',
      });
    }
    const roomId =
      lead.source === 'admin_quick_entry' ? lead.roomId : (requestedRoomId ?? lead.roomId);
    if (!roomId) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_REQUIRED',
        message: 'Booking lead must reference a room before creating a hold',
      });
    }
    if (!ELIGIBLE_LEAD_STATUSES.has(lead.status)) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_LEAD_NOT_ELIGIBLE',
        message: 'Booking lead status is not eligible for a room hold',
      });
    }

    let room = await this.holds.lockRoom(client, roomId);
    this.assertRoomLink(room, propertyId, roomId, lead.category, lead.gender);

    if (
      lead.source === 'public_kamar' &&
      !(await this.holds.assignLeadRoom(client, lead.id, propertyId, roomId))
    ) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_TARGET_LOCKED',
        message: 'Booking lead target room changed while the hold was being created',
      });
    }

    const matching = await this.holds.lockMatchingHolds(client, propertyId, leadId, roomId);
    const staleHolds = matching.filter((hold) => hold.stale);
    const staleRoomIds = [
      ...new Set(
        staleHolds.map((hold) => hold.roomId).filter((staleRoomId) => staleRoomId !== roomId),
      ),
    ].sort();
    for (const roomId of staleRoomIds) {
      this.assertHoldRoom(await this.holds.lockRoom(client, roomId), propertyId, roomId);
    }
    for (const hold of staleHolds) {
      const expired = await this.holds.markExpired(client, hold.id);
      await this.holds.restoreRoomIfSafe(client, propertyId, expired.roomId, context.actorUserId);
      await this.writeLifecycle(client, 'expire', expired, context, 'active');
    }

    room = await this.holds.lockRoom(client, roomId);
    this.assertRoomLink(room, propertyId, roomId, lead.category, lead.gender);
    const blockers = await this.holds.roomBlockers(client, propertyId, roomId);
    if (blockers.active_hold) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ALREADY_ACTIVE',
        message: 'An active room hold already exists',
      });
    }
    if (blockers.active_occupancy) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ACTIVE_OCCUPANCY',
        message: 'Room has an active occupancy',
      });
    }
    if (blockers.active_lease) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ACTIVE_LEASE',
        message: 'Room has an active lease',
      });
    }
    if (room?.roomStatus !== 'vacant') {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_NOT_VACANT',
        message: 'Room must be vacant before creating a booking lead hold',
      });
    }

    const hold = await this.holds.insertActiveHold(
      client,
      propertyId,
      leadId,
      roomId,
      context.actorUserId,
    );
    if (
      !(await this.holds.transitionRoomToReserved(client, propertyId, roomId, context.actorUserId))
    ) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_NOT_VACANT',
        message: 'Room must be vacant before creating a booking lead hold',
      });
    }
    await this.writeLifecycle(client, 'create', hold, context);
    return {
      status: 201,
      body: { data: this.response(hold) },
      succeeded: true,
      resourceId: hold.id,
    };
  }

  private async releaseInsideTransaction(
    client: PoolClient,
    leadId: string,
    propertyId: string,
    context: BookingLeadHoldRequestContext,
  ): Promise<CommandOperation> {
    await this.holds.lockPropertyLifecycle(client, propertyId);
    const current = await this.holds.lockLatestHold(client, leadId);
    if (!current) {
      throw new NotFoundException({
        code: 'BOOKING_HOLD_NOT_FOUND',
        message: 'Booking lead hold not found',
      });
    }
    if (current.propertyId !== propertyId) this.throwPropertyDenied();
    if (current.holdStatus !== 'active') this.throwNotActive();

    const room = await this.holds.lockRoom(client, current.roomId);
    if (!room || room.propertyId !== propertyId) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_LINK_INVALID',
        message: 'Booking lead room linkage is not eligible for a hold',
      });
    }

    if (current.stale) {
      const expired = await this.holds.markExpired(client, current.id);
      await this.holds.restoreRoomIfSafe(client, propertyId, expired.roomId, context.actorUserId);
      await this.writeLifecycle(client, 'expire', expired, context, 'active');
      return {
        status: 409,
        body: this.errorBody(
          'BOOKING_HOLD_NOT_ACTIVE',
          'Booking lead hold is no longer active',
          context.correlationId,
        ),
        succeeded: false,
        resourceId: expired.id,
      };
    }

    const released = await this.holds.markReleased(client, current.id, context.actorUserId);
    await this.holds.restoreRoomIfSafe(client, propertyId, released.roomId, context.actorUserId);
    await this.writeLifecycle(client, 'release', released, context, 'active');
    return {
      status: 200,
      body: { data: this.response(released) },
      succeeded: true,
      resourceId: released.id,
    };
  }

  private async executeCommand(
    route: string,
    action: 'create' | 'release',
    leadId: string,
    propertyId: string,
    payload: Record<string, unknown>,
    rawKey: string | undefined,
    context: BookingLeadHoldRequestContext,
    operation: (client: PoolClient) => Promise<CommandOperation>,
  ): Promise<BookingLeadHoldCommandResult> {
    const idempotencyKey = this.requireIdempotencyKey(rawKey);
    const fingerprint = this.requestFingerprint({
      route,
      action,
      actor_id: context.actorUserId,
      property_id: propertyId,
      booking_lead_id: leadId,
      payload: { property_id: propertyId, ...payload },
    });

    return this.holds.transaction(async (client) => {
      const claim = await this.holds.claimCommand(client, {
        propertyId,
        actorUserId: context.actorUserId,
        route,
        idempotencyKey,
        fingerprint,
        correlationId: context.correlationId,
      });
      if (claim) return this.replayCommand(claim, fingerprint);

      const result = await operation(client);
      await this.holds.completeCommand(client, {
        actorUserId: context.actorUserId,
        route,
        idempotencyKey,
        status: result.status,
        body: result.body,
        succeeded: result.succeeded,
        resourceId: result.resourceId,
      });
      return { status: result.status, body: result.body, replayed: false };
    });
  }

  private replayCommand(
    claim: BookingLeadHoldIdempotencyClaim,
    fingerprint: string,
  ): BookingLeadHoldCommandResult {
    if (claim.commandStatus === 'unavailable') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Command claim is unavailable; retry with the same key',
      });
    }
    if (claim.requestFingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (claim.commandStatus === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    if (!claim.responseStatus || !claim.responseBody) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    return { status: claim.responseStatus, body: claim.responseBody, replayed: true };
  }

  private async writeLifecycle(
    client: PoolClient,
    transition: 'create' | 'release' | 'expire',
    hold: BookingLeadHoldRecord,
    context: BookingLeadHoldRequestContext,
    beforeStatus?: BookingLeadHoldRecord['holdStatus'],
  ): Promise<void> {
    await this.holds.writeAudit(client, {
      action: `booking_lead_hold.${transition}`,
      hold,
      actorUserId: context.actorUserId,
      beforeStatus,
      context,
    });
    const suffix = transition === 'create' ? 'created' : `${transition}d`;
    await this.holds.writeOutbox(client, {
      eventType: `booking_lead_hold.${suffix}` as
        | 'booking_lead_hold.created'
        | 'booking_lead_hold.released'
        | 'booking_lead_hold.expired',
      hold,
      actorUserId: context.actorUserId,
      correlationId: context.correlationId,
    });
  }

  private assertRoomLink(
    room: Awaited<ReturnType<BookingLeadHoldRepository['lockRoom']>>,
    propertyId: string,
    roomId: string,
    leadCategory: string,
    leadGender: 'male' | 'female',
  ): void {
    if (
      !room ||
      room.id !== roomId ||
      room.propertyId !== propertyId ||
      !room.buildingId ||
      room.buildingPropertyId !== propertyId ||
      !room.category ||
      room.category !== leadCategory ||
      room.buildingCategory !== room.category ||
      (room.genderPolicy !== 'mixed' && room.genderPolicy !== leadGender)
    ) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_LINK_INVALID',
        message: 'Booking lead room linkage is not eligible for a hold',
      });
    }
  }

  private assertHoldRoom(
    room: Awaited<ReturnType<BookingLeadHoldRepository['lockRoom']>>,
    propertyId: string,
    roomId: string,
  ): void {
    if (!room || room.id !== roomId || room.propertyId !== propertyId) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_ROOM_LINK_INVALID',
        message: 'Booking lead room linkage is not eligible for a hold',
      });
    }
  }

  private response(hold: BookingLeadHoldRecord): BookingLeadHoldResponse {
    return {
      id: hold.id,
      property_id: hold.propertyId,
      booking_lead_id: hold.bookingLeadId,
      room_id: hold.roomId,
      hold_status: hold.holdStatus,
      starts_at: hold.startsAt,
      expires_at: hold.expiresAt,
      released_at: hold.releasedAt,
    };
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

  private errorBody(code: string, message: string, correlationId?: string) {
    return {
      success: false,
      error: { code, message },
      correlation_id: correlationId ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  private throwPropertyDenied(): never {
    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  private throwFeatureDisabled(): never {
    throw new ForbiddenException({
      code: 'BOOKING_HOLD_WRITE_DISABLED',
      message: 'Booking lead room hold creation is not enabled for this property',
    });
  }

  private throwNotActive(): never {
    throw new ConflictException({
      code: 'BOOKING_HOLD_NOT_ACTIVE',
      message: 'Booking lead hold is no longer active',
    });
  }

  private rethrowKnownDatabaseConflict(error: unknown): never {
    if (error instanceof Error && 'code' in error) {
      const databaseError = error as Error & { code?: string; constraint?: string };
      if (
        databaseError.code === '23505' &&
        (databaseError.constraint === 'uq_booking_lead_holds_active_room' ||
          databaseError.constraint === 'uq_booking_lead_holds_active_lead')
      ) {
        throw new ConflictException({
          code: 'BOOKING_HOLD_ALREADY_ACTIVE',
          message: 'An active room hold already exists',
        });
      }
    }
    throw error;
  }
}
