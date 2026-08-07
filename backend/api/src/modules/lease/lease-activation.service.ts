import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { ActivateLeaseDto } from './dto/activate-lease.dto';

type ActivationLeaseRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string;
  lease_status: string;
  start_date: string;
  end_date: string | null;
  onboarding_commitment_id: string | null;
  room_status: string;
  room_number: string;
  room_property_id: string;
  room_category: 'rukost' | 'apartkost';
  room_gender_policy: 'male' | 'female' | 'mixed';
  building_property_id: string;
  building_category: 'rukost' | 'apartkost';
  building_gender_policy: 'male' | 'female';
  kost_type_property_id: string;
  kost_type_category: 'rukost' | 'apartkost';
  kost_type_status: 'active' | 'inactive';
  kost_type_deleted_at: string | null;
  resident_property_id: string;
  resident_gender: 'male' | 'female';
  commitment_id: string;
  commitment_property_id: string;
  commitment_resident_id: string;
  commitment_room_id: string;
  commitment_lease_id: string | null;
  commitment_category: 'rukost' | 'apartkost';
  commitment_gender: 'male' | 'female';
  commitment_status: string;
  dp_required_amount: string;
  security_deposit_required_amount: string;
};

type ActivationHoldRow = {
  id: string;
  property_id: string;
  room_id: string;
  onboarding_commitment_id: string | null;
  is_current: boolean;
};

type ActivationReplayRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: { data: LeaseActivationResponse } | null;
};

type ContractSettlementActivationRow = {
  id: string;
  state: 'awaiting_activation' | 'open' | 'termination_pending' | 'terminated' | 'paid';
};

type LeaseActivationResponse = {
  leaseId: string;
  leaseStatus: 'active';
  occupancyStatus: 'active';
  roomNumber: string;
};

@Injectable()
export class LeaseActivationService {
  private readonly route = '/leases/:leaseId/activate';
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}
  async activate(
    actor: UserAccessContext,
    leaseId: string,
    dto: ActivateLeaseDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = key?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    const fingerprint = createHash('sha256').update(JSON.stringify({ leaseId, dto })).digest('hex');
    await this.properties.assertCanReadProperty(actor, dto.property_id);
    return this.database.transaction(async (client) => {
      const propertyId = dto.property_id;
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [propertyId],
      );
      const claim = await client.query<{ id: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id) VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
        [
          propertyId,
          actor.id,
          this.route,
          idempotencyKey,
          fingerprint,
          context.correlationId ?? null,
        ],
      );
      if (!claim.rowCount)
        return { data: await this.replay(client, actor.id, idempotencyKey, fingerprint) };
      const row = await client.query<ActivationLeaseRow>(
        `SELECT
           l.id,l.property_id,l.resident_id,l.room_id,l.lease_status,l.start_date,l.end_date,
           l.onboarding_commitment_id,r.room_status,r.number AS room_number,
           l.dp_required_amount,l.security_deposit_required_amount,
           r.property_id AS room_property_id,r.category AS room_category,
           r.gender_policy AS room_gender_policy,
           rb.property_id AS building_property_id,rb.category AS building_category,
           rb.gender_policy AS building_gender_policy,
           kt.property_id AS kost_type_property_id,kt.category AS kost_type_category,
           kt.status AS kost_type_status,kt.deleted_at AS kost_type_deleted_at,
           resident.property_id AS resident_property_id,resident.gender AS resident_gender,
           commitment.id AS commitment_id,
           commitment.property_id AS commitment_property_id,
           commitment.resident_id AS commitment_resident_id,
           commitment.room_id AS commitment_room_id,
           commitment.lease_id AS commitment_lease_id,
           commitment.category AS commitment_category,
           commitment.gender AS commitment_gender,
           commitment.status AS commitment_status
         FROM leases l
         JOIN properties property ON property.id=l.property_id
         JOIN onboarding_commitments commitment ON commitment.id=l.onboarding_commitment_id
         JOIN residents resident ON resident.id=l.resident_id
         JOIN rooms r ON r.id=l.room_id
         JOIN room_buildings rb ON rb.id=r.building_id
         JOIN kost_types kt ON kt.id=l.kost_type_id AND kt.id=r.kost_type_id
         WHERE l.id=$1 AND l.property_id=$2
         FOR UPDATE OF property,l,commitment,resident,r,rb,kt`,
        [leaseId, propertyId],
      );
      const lease = row.rows[0];
      if (!lease)
        throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease is unavailable' });
      if (lease.lease_status !== 'awaiting_activation')
        throw new ConflictException({
          code: 'LEASE_NOT_READY',
          message: 'Lease is not awaiting activation',
        });
      const tupleMatches =
        lease.onboarding_commitment_id === lease.commitment_id &&
        lease.commitment_lease_id === lease.id &&
        lease.commitment_resident_id === lease.resident_id &&
        lease.commitment_room_id === lease.room_id &&
        lease.commitment_status === 'committed' &&
        lease.room_property_id === propertyId &&
        lease.building_property_id === propertyId &&
        lease.kost_type_property_id === propertyId &&
        lease.resident_property_id === propertyId &&
        lease.commitment_property_id === propertyId &&
        lease.room_category === lease.building_category &&
        lease.room_category === lease.kost_type_category &&
        lease.room_category === lease.commitment_category &&
        lease.commitment_gender === lease.resident_gender &&
        (lease.room_gender_policy === 'mixed' ||
          lease.room_gender_policy === lease.resident_gender) &&
        lease.building_gender_policy === lease.resident_gender &&
        lease.kost_type_status === 'active' &&
        lease.kost_type_deleted_at === null;
      if (!tupleMatches)
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_AUTHORITY_MISMATCH',
          message: 'Lease activation authority requires reconciliation',
        });
      const settlementResult = await client.query<ContractSettlementActivationRow>(
        `SELECT id,state
         FROM lease_contract_settlements
         WHERE property_id=$1 AND lease_id=$2
         FOR UPDATE`,
        [propertyId, lease.id],
      );
      if (settlementResult.rows.length > 1)
        throw new ConflictException({
          code: 'LEASE_CONTRACT_SETTLEMENT_AMBIGUOUS',
          message: 'Contract-settlement authority requires reconciliation',
        });
      const contractSettlement = settlementResult.rows[0] ?? null;
      if (contractSettlement && contractSettlement.state !== 'awaiting_activation')
        throw new ConflictException({
          code: 'LEASE_CONTRACT_SETTLEMENT_NOT_READY',
          message: 'Contract settlement is not awaiting activation',
        });
      const financials = await client.query<{
        dp_verified_amount: string;
        deposit_balance: string;
        first_due_date: string | null;
        first_invoice_status: string | null;
      }>(
        `SELECT
           COALESCE((
             SELECT sum(payment.amount)
             FROM payments payment
             LEFT JOIN payment_reversals reversal ON reversal.payment_id=payment.id
             WHERE payment.property_id=$1 AND payment.lease_id=$2
               AND payment.payment_purpose='dp' AND payment.payment_status='verified'
               AND reversal.id IS NULL
               AND EXISTS (SELECT 1 FROM payment_allocations allocation WHERE allocation.payment_id=payment.id)
           ),0) AS dp_verified_amount,
           COALESCE((
             SELECT sum(CASE ledger.direction WHEN 'credit' THEN ledger.amount ELSE -ledger.amount END)
             FROM lease_deposit_transactions ledger
             WHERE ledger.property_id=$1 AND ledger.lease_id=$2
           ),0) AS deposit_balance,
           (SELECT installment.due_date::text FROM lease_installments installment
             WHERE installment.property_id=$1 AND installment.lease_id=$2
             ORDER BY installment.sequence_number LIMIT 1) AS first_due_date,
           (SELECT invoice.invoice_status FROM lease_installments installment
             JOIN invoices invoice ON invoice.id=installment.invoice_id
             WHERE installment.property_id=$1 AND installment.lease_id=$2
             ORDER BY installment.sequence_number LIMIT 1) AS first_invoice_status`,
        [propertyId, lease.id],
      );
      const financial = financials.rows[0];
      if (
        !financial ||
        Number(financial.deposit_balance) < Number(lease.security_deposit_required_amount)
      )
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_FINANCIAL_OBLIGATION_UNMET',
          message: 'Security-deposit ledger obligations must be satisfied',
        });
      if (
        !financial.first_due_date ||
        !financial.first_invoice_status ||
        !['issued', 'partially_paid', 'paid', 'overdue'].includes(financial.first_invoice_status)
      )
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_BILLING_AUTHORITY_MISSING',
          message: 'The first contract installment must have an issued invoice',
        });
      // Pre-W07A leases retain their original installment-due activation rule.
      // A new contract settlement starts its two-month deadline only after this
      // activation succeeds, so it must not be blocked by a pre-activation date.
      if (!contractSettlement) {
        const dueBoundary = await client.query<{ due_is_valid: boolean }>(
          `SELECT $1::date <= (COALESCE($2::timestamptz,now()) AT TIME ZONE 'Asia/Jakarta')::date AS due_is_valid`,
          [financial.first_due_date, dto.activated_at ?? null],
        );
        if (!dueBoundary.rows[0]?.due_is_valid)
          throw new ConflictException({
            code: 'LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE',
            message: 'First installment must be due no later than activation',
          });
      }
      if (lease.room_status !== 'reserved' && lease.room_status !== 'vacant')
        throw new ConflictException({
          code: 'ROOM_NOT_AVAILABLE',
          message: 'Room is not available for activation',
        });
      const holds = await client.query<ActivationHoldRow>(
        `SELECT id,property_id,room_id,onboarding_commitment_id,
                (hold_status='active' AND expires_at>now()) AS is_current
         FROM booking_lead_holds
         WHERE property_id=$1
           AND hold_status='active'
           AND (onboarding_commitment_id=$2 OR room_id=$3)
         ORDER BY id
         FOR UPDATE`,
        [propertyId, lease.commitment_id, lease.room_id],
      );
      if (holds.rows.length > 1)
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_HOLD_AMBIGUOUS',
          message: 'Lease activation hold authority is ambiguous',
        });
      const hold = holds.rows[0];
      if (
        hold &&
        (hold.property_id !== propertyId ||
          hold.room_id !== lease.room_id ||
          hold.onboarding_commitment_id !== lease.commitment_id)
      )
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_HOLD_MISMATCH',
          message: 'Lease activation hold authority requires reconciliation',
        });
      // A reservation may be backed by a Booking Lead hold or directly by the
      // committed awaiting-activation lease. The latter is the normal
      // /tenants flow and intentionally has no Booking Lead hold.
      if (hold && !hold.is_current)
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_HOLD_REQUIRED',
          message: 'The linked onboarding hold is no longer active',
        });
      const occupancies = await client.query<{ id: string }>(
        `SELECT id
         FROM occupancies
         WHERE property_id=$1
           AND occupancy_status='active'
           AND (resident_id=$2 OR room_id=$3)
         ORDER BY id
         FOR UPDATE`,
        [propertyId, lease.resident_id, lease.room_id],
      );
      const activeLeases = await client.query<{ id: string }>(
        `SELECT id
         FROM leases
         WHERE property_id=$1
           AND lease_status='active'
           AND id<>$2
           AND (resident_id=$3 OR room_id=$4)
         ORDER BY id
         FOR UPDATE`,
        [propertyId, lease.id, lease.resident_id, lease.room_id],
      );
      if (occupancies.rows.length > 1 || activeLeases.rows.length > 1)
        throw new ConflictException({
          code: 'RESIDENT_LIFECYCLE_AMBIGUOUS',
          message: 'Resident lifecycle authority requires reconciliation',
        });
      if (occupancies.rows.length === 1 || activeLeases.rows.length === 1)
        throw new ConflictException({
          code: 'RESIDENT_LIFECYCLE_CONFLICT',
          message: 'Resident already has an active lifecycle record',
        });
      const occupancy = await client.query<{ id: string }>(
        `INSERT INTO occupancies(property_id,room_id,resident_id,start_date,occupancy_status,created_by_user_id) VALUES($1,$2,$3,$4::date,'active',$5) RETURNING id`,
        [propertyId, lease.room_id, lease.resident_id, lease.start_date, actor.id],
      );
      if (occupancy.rowCount !== 1)
        throw new ConflictException({
          code: 'OCCUPANCY_CREATE_FAILED',
          message: 'Occupancy could not be activated',
        });
      await client.query(
        `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
         VALUES($1,$2,$3,$4,'check_in',NULL,'active',$5::date,$6,$7::jsonb)`,
        [
          occupancy.rows[0].id,
          propertyId,
          lease.room_id,
          lease.resident_id,
          lease.start_date,
          actor.id,
          JSON.stringify({ source: 'lease_activation' }),
        ],
      );
      await client.query(
        `UPDATE leases SET lease_status='active',occupancy_id=$2,activated_at=COALESCE($3::timestamptz,now()),updated_at=now() WHERE id=$1 AND property_id=$4 AND lease_status='awaiting_activation'`,
        [leaseId, occupancy.rows[0].id, dto.activated_at ?? null, propertyId],
      );
      if (contractSettlement) {
        const activatedSettlement = await client.query(
          `WITH activation AS (
             SELECT COALESCE($3::timestamptz, now()) AS activated_at
           )
           UPDATE lease_contract_settlements settlement
              SET state='open',
                  activated_at=activation.activated_at,
                  original_due_at=(
                    (((activation.activated_at AT TIME ZONE 'Asia/Jakarta')::date + INTERVAL '2 months'
                      + INTERVAL '1 day' - INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta')
                  ),
                  updated_at=now()
             FROM activation
            WHERE settlement.id=$1
              AND settlement.property_id=$2
              AND settlement.state='awaiting_activation'`,
          [contractSettlement.id, propertyId, dto.activated_at ?? null],
        );
        if (activatedSettlement.rowCount !== 1)
          throw new ConflictException({
            code: 'LEASE_CONTRACT_SETTLEMENT_ACTIVATION_FAILED',
            message: 'Contract settlement could not be activated',
          });
      }
      await client.query(
        `UPDATE rooms SET room_status='occupied',updated_at=now() WHERE id=$1 AND property_id=$2`,
        [lease.room_id, propertyId],
      );
      await client.query(
        `UPDATE residents SET resident_status='active',updated_at=now() WHERE id=$1 AND property_id=$2`,
        [lease.resident_id, propertyId],
      );
      await client.query(
        `UPDATE onboarding_commitments SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND status='committed'`,
        [lease.onboarding_commitment_id, propertyId, lease.id],
      );
      await client.query(
        `UPDATE booking_lead_holds SET hold_status='released',released_at=now(),released_by_user_id=$2,release_reason='lease_activated',updated_at=now() WHERE onboarding_commitment_id=$1 AND property_id=$3 AND room_id=$4 AND hold_status='active'`,
        [lease.onboarding_commitment_id, actor.id, propertyId, lease.room_id],
      );
      await client.query(
        `UPDATE booking_leads SET status='leased',leased_at=now(),lease_id=$2,updated_at=now() WHERE property_id=$3 AND (lease_id=$1 OR id=(SELECT booking_lead_id FROM leases WHERE id=$1 AND property_id=$3))`,
        [leaseId, leaseId, propertyId],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId,
          action: 'lease.activate',
          resourceType: 'lease',
          resourceId: leaseId,
          afterData: { lease_status: 'active', room_number: lease.room_number },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload) VALUES($1,$2,'lease.activated','lease',$3,$4,$5,$6::jsonb)`,
        [
          propertyId,
          `lease.activated:${leaseId}`,
          leaseId,
          context.correlationId ?? null,
          actor.id,
          JSON.stringify({ lease_id: leaseId, room_number: lease.room_number }),
        ],
      );
      const response = {
        leaseId,
        leaseStatus: 'active' as const,
        occupancyStatus: 'active' as const,
        roomNumber: lease.room_number,
      };
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded',response_status=200,response_body=$4::jsonb,resource_type='lease',resource_id=$5,completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [actor.id, this.route, idempotencyKey, JSON.stringify({ data: response }), leaseId],
      );
      return { data: response };
    });
  }

  private async replay(
    client: PoolClient,
    actorId: string,
    key: string,
    fingerprint: string,
  ): Promise<LeaseActivationResponse> {
    const result = await client.query<ActivationReplayRow>(
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
        message: 'Lease activation is still in progress',
      });
    return command.response_body.data;
  }
}
