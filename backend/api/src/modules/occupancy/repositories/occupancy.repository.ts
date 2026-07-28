import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
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
      [
        propertyIds === undefined ? null : propertyIds,
        query.property_id ?? null,
        query.status ?? null,
      ],
    );
    return result.rows.map((row) => this.mapOccupancy(row));
  }

  async findById(id: string, propertyIds?: string[]): Promise<OccupancyRecord | null> {
    const result = await this.database.client.query<OccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, start_date::text, end_date::text,
              occupancy_status, created_at, updated_at
       FROM occupancies
       WHERE id = $1
         AND ($2::uuid[] IS NULL OR property_id = ANY($2::uuid[]))`,
      [id, propertyIds === undefined ? null : propertyIds],
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

  async assertLegacyCheckoutEligible(occupancy: OccupancyRecord): Promise<void> {
    const result = await this.database.client.query<{ active_lease_exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM leases lease
         WHERE lease.occupancy_id = occupancy.id
           AND lease.property_id = occupancy.property_id
           AND lease.room_id = occupancy.room_id
           AND lease.resident_id = occupancy.resident_id
           AND lease.lease_status = 'active'
       ) AS active_lease_exists
       FROM occupancies occupancy
       WHERE occupancy.id = $1
         AND occupancy.property_id = $2
         AND occupancy.room_id = $3
         AND occupancy.resident_id = $4
         AND occupancy.occupancy_status = 'active'`,
      [occupancy.id, occupancy.propertyId, occupancy.roomId, occupancy.residentId],
    );
    if (!result.rows[0]) {
      throw new ConflictException({
        code: 'ACTIVE_OCCUPANCY_REQUIRED',
        message: 'Check-out requires an active occupancy',
      });
    }
    if (result.rows[0].active_lease_exists) this.throwLeaseCloseRequired();
  }

  async createCheckOutRequest(
    dto: CreateCheckOutRequestDto,
    actorUserId: string,
    occupancy: OccupancyRecord,
  ): Promise<CheckOutRequestRecord> {
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
    checkOut: CheckOutRequestRecord,
    status: 'approved' | 'rejected',
    actorUserId: string,
  ): Promise<CheckOutRequestRecord | null> {
    const result = await this.database.client.query<CheckOutRow>(
      `UPDATE check_out_requests
       SET check_out_status = $6,
           reviewed_by_user_id = $7,
           updated_at = now()
       WHERE id = $1
         AND property_id = $2
         AND occupancy_id = $3
         AND room_id = $4
         AND resident_id = $5
         AND check_out_status = 'requested'
       RETURNING id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                 reason, check_out_status, created_at, finalized_at`,
      [
        checkOut.id,
        checkOut.propertyId,
        checkOut.occupancyId,
        checkOut.roomId,
        checkOut.residentId,
        status,
        actorUserId,
      ],
    );
    return result.rows[0] ? this.mapCheckOut(result.rows[0]) : null;
  }

  async findCheckOutById(
    checkOutId: string,
    propertyIds?: string[],
  ): Promise<CheckOutRequestRecord | null> {
    const result = await this.database.client.query<CheckOutRow>(
      `SELECT id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
              reason, check_out_status, created_at, finalized_at
       FROM check_out_requests
       WHERE id = $1
         AND ($2::uuid[] IS NULL OR property_id = ANY($2::uuid[]))`,
      [checkOutId, propertyIds === undefined ? null : propertyIds],
    );
    return result.rows[0] ? this.mapCheckOut(result.rows[0]) : null;
  }

  async finalizeCheckOut(
    expected: CheckOutRequestRecord,
    dto: FinalizeCheckOutDto,
    actorUserId: string,
  ): Promise<CheckOutRequestRecord | null> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const checkOut = await client.query<CheckOutRow>(
        `SELECT id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                reason, check_out_status, created_at, finalized_at
         FROM check_out_requests
         WHERE id = $1
           AND property_id = $2
           AND occupancy_id = $3
           AND room_id = $4
           AND resident_id = $5
         FOR UPDATE`,
        [
          expected.id,
          expected.propertyId,
          expected.occupancyId,
          expected.roomId,
          expected.residentId,
        ],
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

      const room = await client.query<{ id: string }>(
        `SELECT id
         FROM rooms
         WHERE id = $1 AND property_id = $2
         FOR UPDATE`,
        [row.room_id, row.property_id],
      );
      if (!room.rows[0]) {
        throw new ConflictException({
          code: 'CHECK_OUT_OCCUPANCY_MISMATCH',
          message: 'Check-out request does not match its room',
        });
      }

      const occupancy = await client.query<{ id: string }>(
        `SELECT occupancy.id
         FROM occupancies occupancy
         WHERE occupancy.id = $1
           AND occupancy.property_id = $2
           AND occupancy.room_id = $3
           AND occupancy.resident_id = $4
           AND occupancy.occupancy_status = 'active'
         FOR UPDATE`,
        [row.occupancy_id, row.property_id, row.room_id, row.resident_id],
      );
      if (!occupancy.rows[0]) {
        throw new ConflictException({
          code: 'ACTIVE_OCCUPANCY_REQUIRED',
          message: 'Check-out finalization requires an active occupancy',
        });
      }
      const activeLease = await client.query<{ id: string }>(
        `SELECT id
         FROM leases
         WHERE occupancy_id = $1
           AND property_id = $2
           AND room_id = $3
           AND resident_id = $4
           AND lease_status = 'active'
         LIMIT 1
         FOR SHARE`,
        [row.occupancy_id, row.property_id, row.room_id, row.resident_id],
      );
      if (activeLease.rows[0]) this.throwLeaseCloseRequired();

      const occupancyUpdate = await client.query(
        `UPDATE occupancies
         SET occupancy_status = 'ended',
             end_date = $2,
             closed_by_user_id = $3,
             updated_at = now()
         WHERE id = $1
           AND property_id = $4
           AND room_id = $5
           AND resident_id = $6
           AND occupancy_status = 'active'`,
        [
          row.occupancy_id,
          dto.end_date,
          actorUserId,
          row.property_id,
          row.room_id,
          row.resident_id,
        ],
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
         WHERE id = $1 AND property_id = $4`,
        [row.room_id, dto.room_status_after, actorUserId, row.property_id],
      );
      const finalized = await client.query<CheckOutRow>(
        `UPDATE check_out_requests
         SET check_out_status = 'finalized',
             finalized_by_user_id = $2,
             finalized_at = now(),
             updated_at = now()
         WHERE id = $1
           AND property_id = $3
           AND occupancy_id = $4
           AND room_id = $5
           AND resident_id = $6
         RETURNING id, property_id, occupancy_id, room_id, resident_id, requested_check_out_date::text,
                   reason, check_out_status, created_at, finalized_at`,
        [row.id, actorUserId, row.property_id, row.occupancy_id, row.room_id, row.resident_id],
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
      [propertyIds === undefined ? null : propertyIds],
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

  private throwLeaseCloseRequired(): never {
    throw new ConflictException({
      code: 'LEASE_CLOSE_REQUIRED',
      message: 'Active lease must be closed through lease lifecycle',
    });
  }
}
