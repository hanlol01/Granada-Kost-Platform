import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  BookingLeadHoldLockedLead,
  BookingLeadHoldLockedMatch,
  BookingLeadHoldLockedRoom,
  BookingLeadHoldRecord,
  BookingLeadHoldRequestContext,
} from '../types/booking-lead-hold.types';

type Queryable = {
  query<T extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type HoldRow = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  room_id: string;
  hold_status: BookingLeadHoldRecord['holdStatus'];
  starts_at: Date | string;
  expires_at: Date | string;
  released_at: Date | string | null;
  stale?: boolean;
};

type LeadRow = {
  id: string;
  property_id: string;
  room_id: string | null;
  category: string;
  gender: 'male' | 'female';
  source: 'public_kamar' | 'admin_quick_entry';
  status: string;
};

type RoomRow = {
  id: string;
  property_id: string;
  category: string | null;
  room_status: string;
  building_id: string | null;
  building_property_id: string | null;
  building_category: string | null;
  gender_policy: 'male' | 'female' | 'mixed' | null;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
};

export type BookingLeadHoldIdempotencyClaim = {
  requestFingerprint: string;
  commandStatus: IdempotencyRow['command_status'] | 'unavailable';
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
};

@Injectable()
export class BookingLeadHoldRepository {
  constructor(private readonly database: DatabaseService) {}

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async readFeatureFlags(propertyId: string, client?: PoolClient) {
    const queryable: Queryable = client ?? this.database.client;
    const result = await queryable.query<{
      admin_ux_read: boolean | null;
      booking_hold_write: boolean | null;
    }>(
      `SELECT admin_ux_read, booking_hold_write
       FROM property_feature_flags
       WHERE property_id = $1${client ? ' FOR SHARE' : ''}`,
      [propertyId],
    );
    return {
      adminUxRead: result.rows[0]?.admin_ux_read === true,
      bookingHoldWrite: result.rows[0]?.booking_hold_write === true,
    };
  }

  async list(propertyId: string, limit: number, offset: number) {
    const count = await this.database.client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM booking_lead_holds
       WHERE property_id = $1`,
      [propertyId],
    );
    const total = Number(count.rows[0]?.total ?? 0);
    if (total === 0 || offset >= total) return { records: [], total };

    const result = await this.database.client.query<HoldRow>(
      `SELECT ${this.holdColumns()}
       FROM booking_lead_holds
       WHERE property_id = $1
       ORDER BY starts_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [propertyId, limit, offset],
    );
    return { records: result.rows.map((row) => this.mapHold(row)), total };
  }

  async claimCommand(
    client: PoolClient,
    input: {
      propertyId: string;
      actorUserId: string;
      route: string;
      idempotencyKey: string;
      fingerprint: string;
      correlationId?: string;
    },
  ): Promise<BookingLeadHoldIdempotencyClaim | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_status, response_body`,
      [
        input.propertyId,
        input.actorUserId,
        input.route,
        input.idempotencyKey,
        input.fingerprint,
        input.correlationId ?? null,
      ],
    );
    if (inserted.rows[0]) return null;

    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [input.actorUserId, input.route, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) {
      return {
        requestFingerprint: input.fingerprint,
        commandStatus: 'unavailable',
        responseStatus: null,
        responseBody: null,
      };
    }
    return {
      requestFingerprint: row.request_fingerprint,
      commandStatus: row.command_status,
      responseStatus: row.response_status,
      responseBody: row.response_body,
    };
  }

  async completeCommand(
    client: PoolClient,
    input: {
      actorUserId: string;
      route: string;
      idempotencyKey: string;
      status: number;
      body: Record<string, unknown>;
      succeeded: boolean;
      resourceId: string | null;
    },
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = $4, response_status = $5, response_body = $6::jsonb,
           resource_type = $7, resource_id = $8, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [
        input.actorUserId,
        input.route,
        input.idempotencyKey,
        input.succeeded ? 'succeeded' : 'failed',
        input.status,
        JSON.stringify(input.body),
        input.resourceId ? 'booking_lead_hold' : null,
        input.resourceId,
      ],
    );
  }

  async lockProperty(client: PoolClient, propertyId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM properties
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [propertyId],
    );
    return Boolean(result.rows[0]);
  }

  async lockPropertyLifecycle(client: PoolClient, propertyId: string): Promise<void> {
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('booking_lead_hold:' || $1::text, 0)
       )`,
      [propertyId],
    );
  }

  async lockLead(client: PoolClient, leadId: string): Promise<BookingLeadHoldLockedLead | null> {
    const result = await client.query<LeadRow>(
      `SELECT id, property_id, room_id, category, gender, source, status
       FROM booking_leads
       WHERE id = $1
       FOR UPDATE`,
      [leadId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          propertyId: row.property_id,
          roomId: row.room_id,
          category: row.category,
          gender: row.gender,
          source: row.source,
          status: row.status,
        }
      : null;
  }

  async lockRoom(client: PoolClient, roomId: string): Promise<BookingLeadHoldLockedRoom | null> {
    const result = await client.query<RoomRow>(
      `SELECT room.id, room.property_id, room.category, room.room_status, room.building_id,
              building.property_id AS building_property_id,
              building.category AS building_category,
              COALESCE(room.gender_policy, building.gender_policy) AS gender_policy
       FROM rooms room
       LEFT JOIN room_buildings building ON building.id = room.building_id
       WHERE room.id = $1
       FOR UPDATE OF room`,
      [roomId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          propertyId: row.property_id,
          category: row.category,
          roomStatus: row.room_status,
          buildingId: row.building_id,
          buildingPropertyId: row.building_property_id,
          buildingCategory: row.building_category,
          genderPolicy: row.gender_policy,
        }
      : null;
  }

  async lockMatchingHolds(
    client: PoolClient,
    propertyId: string,
    leadId: string,
    roomId: string,
  ): Promise<BookingLeadHoldLockedMatch[]> {
    const result = await client.query<HoldRow>(
      `SELECT ${this.holdColumns()}, expires_at <= now() AS stale
       FROM booking_lead_holds
       WHERE property_id = $1
         AND hold_status IN ('active', 'committed')
         AND (booking_lead_id = $2 OR room_id = $3)
       ORDER BY id
       FOR UPDATE`,
      [propertyId, leadId, roomId],
    );
    return result.rows.map((row) => ({ ...this.mapHold(row), stale: row.stale === true }));
  }

  async lockLatestHold(
    client: PoolClient,
    leadId: string,
  ): Promise<BookingLeadHoldLockedMatch | null> {
    const result = await client.query<HoldRow>(
      `SELECT ${this.holdColumns()}, expires_at <= now() AS stale
       FROM booking_lead_holds
       WHERE booking_lead_id = $1
       ORDER BY CASE hold_status WHEN 'committed' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, starts_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [leadId],
    );
    const row = result.rows[0];
    return row ? { ...this.mapHold(row), stale: row.stale === true } : null;
  }

  async roomBlockers(client: PoolClient, propertyId: string, roomId: string) {
    const result = await client.query<{
      active_hold: boolean;
      active_occupancy: boolean;
      active_lease: boolean;
    }>(
      `SELECT
         EXISTS (
           SELECT 1 FROM booking_lead_holds
           WHERE property_id = $1 AND room_id = $2 AND hold_status IN ('active', 'committed')
         ) AS active_hold,
         EXISTS (
           SELECT 1 FROM occupancies
           WHERE property_id = $1 AND room_id = $2 AND occupancy_status = 'active'
         ) AS active_occupancy,
         EXISTS (
           SELECT 1 FROM leases
           WHERE property_id = $1 AND room_id = $2 AND lease_status = 'active'
         ) AS active_lease`,
      [propertyId, roomId],
    );
    return (
      result.rows[0] ?? {
        active_hold: false,
        active_occupancy: false,
        active_lease: false,
      }
    );
  }

  async insertActiveHold(
    client: PoolClient,
    propertyId: string,
    leadId: string,
    roomId: string,
    actorUserId: string,
  ): Promise<BookingLeadHoldRecord> {
    const result = await client.query<HoldRow>(
      `INSERT INTO booking_lead_holds (
         property_id, booking_lead_id, room_id, hold_status, created_by_user_id
       ) VALUES ($1, $2, $3, 'active', $4)
       RETURNING ${this.holdColumns()}`,
      [propertyId, leadId, roomId, actorUserId],
    );
    return this.mapHold(result.rows[0]);
  }

  async assignLeadRoom(
    client: PoolClient,
    leadId: string,
    propertyId: string,
    roomId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE booking_leads
        SET room_id = $3, updated_at = now()
        WHERE id = $1 AND property_id = $2 AND source = 'public_kamar'`,
      [leadId, propertyId, roomId],
    );
    return result.rowCount === 1;
  }

  async transitionRoomToReserved(
    client: PoolClient,
    propertyId: string,
    roomId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE rooms
       SET room_status = 'reserved', updated_by_user_id = $3, updated_at = now()
       WHERE id = $1 AND property_id = $2 AND room_status = 'vacant'`,
      [roomId, propertyId, actorUserId],
    );
    return result.rowCount === 1;
  }

  async markExpired(client: PoolClient, holdId: string): Promise<BookingLeadHoldRecord> {
    const result = await client.query<HoldRow>(
      `UPDATE booking_lead_holds
       SET hold_status = 'expired', released_at = NULL, updated_at = now()
       WHERE id = $1 AND hold_status = 'active'
       RETURNING ${this.holdColumns()}`,
      [holdId],
    );
    return this.mapHold(result.rows[0]);
  }

  async markReleased(
    client: PoolClient,
    holdId: string,
    actorUserId: string,
  ): Promise<BookingLeadHoldRecord> {
    const result = await client.query<HoldRow>(
      `UPDATE booking_lead_holds
       SET hold_status = 'released', released_at = now(), released_by_user_id = $2,
           updated_at = now()
       WHERE id = $1 AND hold_status = 'active'
       RETURNING ${this.holdColumns()}`,
      [holdId, actorUserId],
    );
    return this.mapHold(result.rows[0]);
  }

  async restoreRoomIfSafe(
    client: PoolClient,
    propertyId: string,
    roomId: string,
    actorUserId?: string,
  ): Promise<void> {
    await client.query(
      `UPDATE rooms
       SET room_status = 'vacant',
           updated_by_user_id = COALESCE($3::uuid, updated_by_user_id),
           updated_at = now()
       WHERE id = $1
         AND property_id = $2
         AND room_status = 'reserved'
         AND NOT EXISTS (
           SELECT 1 FROM booking_lead_holds hold
           WHERE hold.property_id = $2 AND hold.room_id = $1 AND hold.hold_status IN ('active', 'committed')
         )
         AND NOT EXISTS (
           SELECT 1 FROM occupancies occupancy
           WHERE occupancy.property_id = $2 AND occupancy.room_id = $1
             AND occupancy.occupancy_status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1 FROM leases lease
           WHERE lease.property_id = $2 AND lease.room_id = $1 AND lease.lease_status = 'active'
         )`,
      [roomId, propertyId, actorUserId ?? null],
    );
  }

  async writeAudit(
    client: PoolClient,
    input: {
      action: 'booking_lead_hold.create' | 'booking_lead_hold.release' | 'booking_lead_hold.expire';
      hold: BookingLeadHoldRecord;
      actorUserId?: string;
      beforeStatus?: BookingLeadHoldRecord['holdStatus'];
      context?: Omit<BookingLeadHoldRequestContext, 'actorUserId'>;
    },
  ): Promise<void> {
    const beforeData = input.beforeStatus
      ? JSON.stringify({ id: input.hold.id, hold_status: input.beforeStatus })
      : null;
    const afterData = JSON.stringify(this.auditSnapshot(input.hold));
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, property_id, action, resource_type, resource_id,
         before_data, after_data, result_status, ip_address, user_agent, correlation_id
       ) VALUES ($1, $2, $3, 'booking_lead_hold', $4, $5::jsonb, $6::jsonb,
                 'success', $7::inet, $8, $9)`,
      [
        input.actorUserId ?? null,
        input.hold.propertyId,
        input.action,
        input.hold.id,
        beforeData,
        afterData,
        input.context?.ipAddress ?? null,
        input.context?.userAgent ?? null,
        input.context?.correlationId ?? null,
      ],
    );
  }

  async writeOutbox(
    client: PoolClient,
    input: {
      eventType:
        | 'booking_lead_hold.created'
        | 'booking_lead_hold.released'
        | 'booking_lead_hold.expired';
      hold: BookingLeadHoldRecord;
      actorUserId?: string;
      correlationId?: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, 'booking_lead_hold', $4, $5::jsonb, $6, $7)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.hold.propertyId,
        `${input.eventType}:${input.hold.id}`,
        input.eventType,
        input.hold.id,
        JSON.stringify(this.auditSnapshot(input.hold)),
        input.correlationId ?? null,
        input.actorUserId ?? null,
      ],
    );
  }

  async expireDueBatch(limit: number, runId: string): Promise<number> {
    return this.transaction(async (client) => {
      const candidateProperties = await client.query<{ property_id: string }>(
        `SELECT DISTINCT candidate.property_id
         FROM (
           SELECT property_id, expires_at, id
           FROM booking_lead_holds
           WHERE hold_status = 'active' AND expires_at <= now()
           ORDER BY expires_at, id
           LIMIT $1
         ) candidate
         ORDER BY candidate.property_id`,
        [limit],
      );
      if (candidateProperties.rows.length === 0) return 0;

      const propertyIds = candidateProperties.rows.map((row) => row.property_id);
      for (const propertyId of propertyIds) {
        await this.lockPropertyLifecycle(client, propertyId);
      }

      const due = await client.query<HoldRow>(
        `SELECT ${this.holdColumns()}
         FROM booking_lead_holds
         WHERE hold_status = 'active'
           AND expires_at <= now()
           AND property_id = ANY($2::uuid[])
         ORDER BY expires_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit, propertyIds],
      );
      for (const row of due.rows) {
        const current = this.mapHold(row);
        await this.lockRoom(client, current.roomId);
        const expired = await this.markExpired(client, current.id);
        await this.restoreRoomIfSafe(client, expired.propertyId, expired.roomId);
        await this.writeAudit(client, {
          action: 'booking_lead_hold.expire',
          hold: expired,
          beforeStatus: 'active',
          context: { correlationId: runId },
        });
        await this.writeOutbox(client, {
          eventType: 'booking_lead_hold.expired',
          hold: expired,
          correlationId: runId,
        });
      }
      return due.rows.length;
    });
  }

  private holdColumns(): string {
    return `id, property_id, booking_lead_id, room_id, hold_status,
            starts_at, expires_at, released_at`;
  }

  private mapHold(row: HoldRow): BookingLeadHoldRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      bookingLeadId: row.booking_lead_id,
      roomId: row.room_id,
      holdStatus: row.hold_status,
      startsAt: this.iso(row.starts_at),
      expiresAt: this.iso(row.expires_at),
      releasedAt: row.released_at ? this.iso(row.released_at) : null,
    };
  }

  private auditSnapshot(hold: BookingLeadHoldRecord): Record<string, unknown> {
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

  private iso(value: Date | string): string {
    return new Date(value).toISOString();
  }
}
