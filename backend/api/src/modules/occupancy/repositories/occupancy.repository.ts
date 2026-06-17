import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateCheckInDto } from '../dto/create-check-in.dto';
import { CreateCheckOutRequestDto } from '../dto/create-check-out.dto';
import { FinalizeCheckOutDto } from '../dto/finalize-check-out.dto';
import { ListOccupanciesQueryDto } from '../dto/list-occupancies-query.dto';
import { CheckOutRequestRecord, OccupancyRecord } from '../types/occupancy.types';

type OccupancyRow = {
  id: string;
  property_id: string;
  room_id: string;
  resident_id: string;
  start_date: string;
  end_date: string | null;
  occupancy_status: OccupancyRecord['occupancyStatus'];
  created_at: Date;
  updated_at: Date;
};

type CheckOutRow = {
  id: string;
  property_id: string;
  occupancy_id: string;
  room_id: string;
  resident_id: string;
  requested_check_out_date: string;
  reason: string | null;
  check_out_status: CheckOutRequestRecord['checkOutStatus'];
  created_at: Date;
  finalized_at: Date | null;
};

@Injectable()
export class OccupancyRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListOccupanciesQueryDto, propertyIds?: string[]): Promise<OccupancyRecord[]> {
    const result = await this.database.client.query<OccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, start_date::text, end_date::text,
              occupancy_status, created_at, updated_at
       FROM occupancies
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR property_id = $2)
         AND ($3::text IS NULL OR occupancy_status = $3)
       ORDER BY created_at DESC`,
      [propertyIds?.length ? propertyIds : null, query.property_id ?? null, query.status ?? null],
    );
    return result.rows.map((row) => this.mapOccupancy(row));
  }

  async findById(id: string): Promise<OccupancyRecord | null> {
    const result = await this.database.client.query<OccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, start_date::text, end_date::text,
              occupancy_status, created_at, updated_at
       FROM occupancies
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapOccupancy(result.rows[0]) : null;
  }

  async findActiveByRoom(roomId: string): Promise<OccupancyRecord | null> {
    const result = await this.database.client.query<OccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, start_date::text, end_date::text,
              occupancy_status, created_at, updated_at
       FROM occupancies
       WHERE room_id = $1 AND occupancy_status = 'active'
       LIMIT 1`,
      [roomId],
    );
    return result.rows[0] ? this.mapOccupancy(result.rows[0]) : null;
  }

  async completeCheckIn(dto: CreateCheckInDto, actorUserId: string): Promise<OccupancyRecord> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const room = await client.query<{ room_status: string; property_id: string }>(
        `SELECT property_id, room_status FROM rooms WHERE id = $1 FOR UPDATE`,
        [dto.room_id],
      );
      const resident = await client.query<{ property_id: string; resident_status: string }>(
        `SELECT property_id, resident_status FROM residents WHERE id = $1 FOR UPDATE`,
        [dto.resident_id],
      );

      if (!room.rows[0] || !resident.rows[0]) {
        throw new UnprocessableEntityException({
          code: 'CHECK_IN_RESOURCE_INVALID',
          message: 'Room or resident was not found',
        });
      }
      if (room.rows[0].property_id !== dto.property_id || resident.rows[0].property_id !== dto.property_id) {
        throw new UnprocessableEntityException({
          code: 'PROPERTY_SCOPE_MISMATCH',
          message: 'Room and resident must belong to the same property',
        });
      }
      if (room.rows[0].room_status === 'occupied' || room.rows[0].room_status === 'maintenance') {
        throw new ConflictException({
          code: 'ROOM_NOT_AVAILABLE',
          message: 'Room is not available for check-in',
        });
      }
      if (resident.rows[0].resident_status !== 'active') {
        throw new ConflictException({
          code: 'RESIDENT_NOT_ACTIVE',
          message: 'Resident must be active before check-in',
        });
      }

      const occupancy = await client.query<OccupancyRow>(
        `INSERT INTO occupancies (
           property_id, room_id, resident_id, start_date, occupancy_status, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, 'active', $5)
         RETURNING id, property_id, room_id, resident_id, start_date::text, end_date::text,
                   occupancy_status, created_at, updated_at`,
        [dto.property_id, dto.room_id, dto.resident_id, dto.start_date, actorUserId],
      );

      await client.query(
        `INSERT INTO check_in_records (
           property_id, room_id, resident_id, occupancy_id, handled_by_user_id, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dto.property_id, dto.room_id, dto.resident_id, occupancy.rows[0].id, actorUserId, dto.notes ?? null],
      );

      await client.query(
        `INSERT INTO occupancy_history (
           occupancy_id, property_id, room_id, resident_id, event_type,
           from_status, to_status, event_date, actor_user_id
         )
         VALUES ($1, $2, $3, $4, 'check_in', NULL, 'active', $5, $6)`,
        [occupancy.rows[0].id, dto.property_id, dto.room_id, dto.resident_id, dto.start_date, actorUserId],
      );

      await client.query(
        `UPDATE rooms SET room_status = 'occupied', updated_by_user_id = $2, updated_at = now() WHERE id = $1`,
        [dto.room_id, actorUserId],
      );
      await client.query('COMMIT');
      return this.mapOccupancy(occupancy.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createCheckOutRequest(dto: CreateCheckOutRequestDto, actorUserId: string): Promise<CheckOutRequestRecord> {
    const occupancy = await this.findById(dto.occupancy_id);
    if (!occupancy || occupancy.occupancyStatus !== 'active') {
      throw new ConflictException({
        code: 'ACTIVE_OCCUPANCY_REQUIRED',
        message: 'Check-out requires an active occupancy',
      });
    }
    const result = await this.database.client.query<CheckOutRow>(
      `INSERT INTO check_out_requests (
         property_id, occupancy_id, room_id, resident_id, requested_check_out_date, reason, requested_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                 reason, check_out_status, created_at, finalized_at`,
      [
        occupancy.propertyId,
        occupancy.id,
        occupancy.roomId,
        occupancy.residentId,
        dto.requested_check_out_date,
        dto.reason ?? null,
        actorUserId,
      ],
    );
    return this.mapCheckOut(result.rows[0]);
  }

  async updateCheckOutStatus(
    checkOutId: string,
    status: 'approved' | 'rejected',
    actorUserId: string,
  ): Promise<CheckOutRequestRecord | null> {
    const result = await this.database.client.query<CheckOutRow>(
      `UPDATE check_out_requests
       SET check_out_status = $2,
           reviewed_by_user_id = $3,
           updated_at = now()
       WHERE id = $1 AND check_out_status = 'requested'
       RETURNING id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                 reason, check_out_status, created_at, finalized_at`,
      [checkOutId, status, actorUserId],
    );
    return result.rows[0] ? this.mapCheckOut(result.rows[0]) : null;
  }

  async findCheckOutById(checkOutId: string): Promise<CheckOutRequestRecord | null> {
    const result = await this.database.client.query<CheckOutRow>(
      `SELECT id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
              reason, check_out_status, created_at, finalized_at
       FROM check_out_requests
       WHERE id = $1`,
      [checkOutId],
    );
    return result.rows[0] ? this.mapCheckOut(result.rows[0]) : null;
  }

  async finalizeCheckOut(checkOutId: string, dto: FinalizeCheckOutDto, actorUserId: string): Promise<CheckOutRequestRecord | null> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const checkOut = await client.query<CheckOutRow>(
        `SELECT id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                reason, check_out_status, created_at, finalized_at
         FROM check_out_requests
         WHERE id = $1
         FOR UPDATE`,
        [checkOutId],
      );
      const row = checkOut.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      if (!['requested', 'approved'].includes(row.check_out_status)) {
        throw new ConflictException({
          code: 'CHECK_OUT_NOT_FINALIZABLE',
          message: 'Check-out request cannot be finalized from its current status',
        });
      }

      const occupancyUpdate = await client.query(
        `UPDATE occupancies
         SET occupancy_status = 'ended',
             end_date = $2,
             closed_by_user_id = $3,
             updated_at = now()
         WHERE id = $1 AND occupancy_status = 'active'`,
        [row.occupancy_id, dto.end_date, actorUserId],
      );
      if (occupancyUpdate.rowCount === 0) {
        throw new ConflictException({
          code: 'ACTIVE_OCCUPANCY_REQUIRED',
          message: 'Check-out finalization requires an active occupancy',
        });
      }

      await client.query(
        `INSERT INTO occupancy_history (
           occupancy_id, property_id, room_id, resident_id, event_type,
           from_status, to_status, event_date, actor_user_id, metadata
         )
         VALUES ($1, $2, $3, $4, 'check_out', 'active', 'ended', $5, $6, $7::jsonb)`,
        [
          row.occupancy_id,
          row.property_id,
          row.room_id,
          row.resident_id,
          dto.end_date,
          actorUserId,
          JSON.stringify({ room_status_after: dto.room_status_after }),
        ],
      );
      await client.query(
        `UPDATE rooms
         SET room_status = $2,
             updated_by_user_id = $3,
             updated_at = now()
         WHERE id = $1`,
        [row.room_id, dto.room_status_after, actorUserId],
      );
      const finalized = await client.query<CheckOutRow>(
        `UPDATE check_out_requests
         SET check_out_status = 'finalized',
             finalized_by_user_id = $2,
             finalized_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                   reason, check_out_status, created_at, finalized_at`,
        [checkOutId, actorUserId],
      );
      await client.query('COMMIT');
      return this.mapCheckOut(finalized.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listCheckOutRequests(propertyIds?: string[]): Promise<CheckOutRequestRecord[]> {
    const result = await this.database.client.query<CheckOutRow>(
      `SELECT id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
              reason, check_out_status, created_at, finalized_at
       FROM check_out_requests
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
       ORDER BY created_at DESC`,
      [propertyIds?.length ? propertyIds : null],
    );
    return result.rows.map((row) => this.mapCheckOut(row));
  }

  private mapOccupancy(row: OccupancyRow): OccupancyRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      roomId: row.room_id,
      residentId: row.resident_id,
      startDate: row.start_date,
      endDate: row.end_date,
      occupancyStatus: row.occupancy_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCheckOut(row: CheckOutRow): CheckOutRequestRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      occupancyId: row.occupancy_id,
      roomId: row.room_id,
      residentId: row.resident_id,
      requestedCheckOutDate: row.requested_check_out_date,
      reason: row.reason,
      checkOutStatus: row.check_out_status,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at,
    };
  }
}
