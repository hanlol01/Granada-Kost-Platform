import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { ConfirmLeaseCheckInDto } from './dto/confirm-lease-check-in.dto';

type CheckInReplayRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: { data: LeaseCheckInResponse } | null;
};

type CheckInAuthorityRow = {
  lifecycle_id: string;
  lifecycle_state: 'awaiting_check_in' | 'check_in_confirmation_required' | 'checked_in';
  lease_status: string;
  activated_at: Date | null;
  occupancy_id: string | null;
  resident_id: string;
  resident_status: string;
  room_id: string;
  room_number: string;
  room_status: string;
  start_date: string;
};

export type LeaseCheckInResponse = {
  leaseId: string;
  occupancyId: string;
  occupancyStatus: 'active';
  roomStatus: 'occupied';
  checkedInAt: string;
};

@Injectable()
export class LeaseCheckInService {
  private readonly route = '/leases/:leaseId/check-in';

  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async confirm(
    actor: UserAccessContext,
    leaseId: string,
    dto: ConfirmLeaseCheckInDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    await this.properties.assertCanReadProperty(actor, dto.property_id);
    const fingerprint = createHash('sha256').update(JSON.stringify({ leaseId, dto })).digest('hex');

    return this.database.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [dto.property_id],
      );
      const claim = await client.query<{ id: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id)
         VALUES($1,$2,$3,$4,$5,'pending',$6)
         ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
        [
          dto.property_id,
          actor.id,
          this.route,
          idempotencyKey,
          fingerprint,
          context.correlationId ?? null,
        ],
      );
      if (!claim.rowCount)
        return { data: await this.replay(client, actor.id, idempotencyKey, fingerprint) };

      const authority = await client.query<CheckInAuthorityRow>(
        `SELECT lifecycle.id AS lifecycle_id,lifecycle.state AS lifecycle_state,
                lease.lease_status,lease.activated_at,lease.occupancy_id,
                lease.resident_id,resident.resident_status,lease.room_id,
                room.number AS room_number,room.room_status,lease.start_date::text
           FROM leases lease
           JOIN lease_activation_lifecycles lifecycle
             ON lifecycle.lease_id=lease.id AND lifecycle.property_id=lease.property_id
           JOIN residents resident
             ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
           JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
          WHERE lease.id=$1 AND lease.property_id=$2
          FOR UPDATE OF lease,lifecycle,resident,room`,
        [leaseId, dto.property_id],
      );
      const row = authority.rows[0];
      if (!row)
        throw new NotFoundException({
          code: 'LEASE_CHECK_IN_NOT_FOUND',
          message: 'Active lease check-in authority was not found',
        });
      if (
        row.lease_status !== 'active' ||
        row.occupancy_id !== null ||
        !['awaiting_check_in', 'check_in_confirmation_required'].includes(row.lifecycle_state) ||
        row.room_status !== 'awaiting_check_in'
      )
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_NOT_READY',
          message: 'Lease is not awaiting a physical check-in confirmation',
        });

      const time = await client.query<{ checked_in_at: Date; valid: boolean }>(
        `WITH chosen AS (SELECT COALESCE($1::timestamptz,now()) AS checked_in_at)
         SELECT chosen.checked_in_at,
                chosen.checked_in_at >= $2::timestamptz
                AND chosen.checked_in_at <= now()
                AND (chosen.checked_in_at AT TIME ZONE 'Asia/Jakarta')::date >= $3::date AS valid
           FROM chosen`,
        [dto.checked_in_at ?? null, row.activated_at, row.start_date],
      );
      if (!row.activated_at || !time.rows[0]?.valid)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_TIME_INVALID',
          message: 'Physical check-in time must be after activation and not in the future',
        });
      const checkedInAt = time.rows[0].checked_in_at;

      const conflicts = await client.query<{ occupancy_count: string; lease_count: string }>(
        `SELECT
           (SELECT count(*) FROM occupancies occupancy
             WHERE occupancy.property_id=$1 AND occupancy.occupancy_status='active'
               AND (occupancy.resident_id=$2 OR occupancy.room_id=$3))::text AS occupancy_count,
           (SELECT count(*) FROM leases other
             WHERE other.property_id=$1 AND other.lease_status='active' AND other.id<>$4
               AND (other.resident_id=$2 OR other.room_id=$3))::text AS lease_count`,
        [dto.property_id, row.resident_id, row.room_id, leaseId],
      );
      if (
        Number(conflicts.rows[0]?.occupancy_count ?? 0) > 0 ||
        Number(conflicts.rows[0]?.lease_count ?? 0) > 0
      )
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_CONFLICT',
          message: 'Resident or room already has another active lifecycle',
        });

      const occupancy = await client.query<{ id: string }>(
        `INSERT INTO occupancies(
           property_id,room_id,resident_id,start_date,occupancy_status,created_by_user_id
         ) VALUES(
           $1,$2,$3,($4::timestamptz AT TIME ZONE 'Asia/Jakarta')::date,'active',$5
         ) RETURNING id`,
        [dto.property_id, row.room_id, row.resident_id, checkedInAt, actor.id],
      );
      const occupancyId = occupancy.rows[0].id;
      await client.query(
        `INSERT INTO occupancy_history(
           occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,
           event_date,actor_user_id,metadata
         ) VALUES(
           $1,$2,$3,$4,'check_in',NULL,'active',
           ($5::timestamptz AT TIME ZONE 'Asia/Jakarta')::date,$6,$7::jsonb
         )`,
        [
          occupancyId,
          dto.property_id,
          row.room_id,
          row.resident_id,
          checkedInAt,
          actor.id,
          JSON.stringify({ source: 'lease_physical_check_in', lease_id: leaseId, notes: dto.notes ?? null }),
        ],
      );
      const leaseUpdated = await client.query(
        `UPDATE leases SET occupancy_id=$2,updated_at=now()
          WHERE id=$1 AND property_id=$3 AND lease_status='active' AND occupancy_id IS NULL`,
        [leaseId, occupancyId, dto.property_id],
      );
      if (leaseUpdated.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_WRITE_CONFLICT',
          message: 'Lease check-in was changed by another command',
        });
      const roomUpdated = await client.query(
        `UPDATE rooms SET room_status='occupied',updated_at=now()
          WHERE id=$1 AND property_id=$2 AND room_status='awaiting_check_in'`,
        [row.room_id, dto.property_id],
      );
      if (roomUpdated.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_ROOM_CONFLICT',
          message: 'Room check-in state was changed by another command',
        });
      await client.query(
        `UPDATE residents SET resident_status='active',updated_at=now()
          WHERE id=$1 AND property_id=$2`,
        [row.resident_id, dto.property_id],
      );
      const lifecycleUpdated = await client.query(
        `UPDATE lease_activation_lifecycles
            SET state='checked_in',checked_in_at=$2::timestamptz,updated_at=now()
          WHERE id=$1 AND state IN ('awaiting_check_in','check_in_confirmation_required')`,
        [row.lifecycle_id, checkedInAt],
      );
      if (lifecycleUpdated.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_LIFECYCLE_CONFLICT',
          message: 'Lease check-in lifecycle was changed by another command',
        });
      await client.query(
        `INSERT INTO lease_activation_attempts(
           property_id,lease_id,lifecycle_id,attempt_key,attempt_type,outcome,
           failure_detail,actor_user_id,correlation_id
         ) VALUES($1,$2,$3,$4,'physical_check_in','checked_in','{}'::jsonb,$5,$6)
         ON CONFLICT(attempt_key) DO NOTHING`,
        [
          dto.property_id,
          leaseId,
          row.lifecycle_id,
          `lease-check-in:${leaseId}:${idempotencyKey}`,
          actor.id,
          context.correlationId ?? null,
        ],
      );
      await client.query(
        `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
         VALUES($1,$2,'check_in_confirmed',$3,($4::timestamptz AT TIME ZONE 'Asia/Jakarta')::date,$5::jsonb)`,
        [
          dto.property_id,
          leaseId,
          actor.id,
          checkedInAt,
          JSON.stringify({ occupancy_id: occupancyId, room_id: row.room_id }),
        ],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'lease.check_in_confirm',
          resourceType: 'lease',
          resourceId: leaseId,
          afterData: {
            occupancy_id: occupancyId,
            room_status: 'occupied',
            checked_in_at: checkedInAt.toISOString(),
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload)
         VALUES($1,$2,'lease.check_in_confirmed','lease',$3,$4,$5,$6::jsonb)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          dto.property_id,
          `lease.check_in_confirmed:${leaseId}`,
          leaseId,
          context.correlationId ?? null,
          actor.id,
          JSON.stringify({ lease_id: leaseId, occupancy_id: occupancyId, room_id: row.room_id }),
        ],
      );

      const response: LeaseCheckInResponse = {
        leaseId,
        occupancyId,
        occupancyStatus: 'active',
        roomStatus: 'occupied',
        checkedInAt: checkedInAt.toISOString(),
      };
      await client.query(
        `UPDATE idempotency_commands
            SET command_status='succeeded',response_status=200,response_body=$4::jsonb,
                resource_type='occupancy',resource_id=$5,completed_at=now()
          WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [actor.id, this.route, idempotencyKey, JSON.stringify({ data: response }), occupancyId],
      );
      return { data: response };
    });
  }

  private async replay(
    client: PoolClient,
    actorId: string,
    key: string,
    fingerprint: string,
  ): Promise<LeaseCheckInResponse> {
    const result = await client.query<CheckInReplayRow>(
      `SELECT request_fingerprint,command_status,response_body
         FROM idempotency_commands
        WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3
        FOR UPDATE`,
      [actorId, this.route, key],
    );
    const command = result.rows[0];
    if (!command || command.request_fingerprint !== fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used for another command',
      });
    if (command.command_status !== 'succeeded' || !command.response_body)
      throw new ConflictException({
        code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
        message: 'Lease check-in is still in progress',
      });
    return command.response_body.data;
  }
}
