import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { ActivateLeaseDto } from './dto/activate-lease.dto';

type ActivationLeaseRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string | null;
  lease_status: string;
  start_date: string;
  end_date: string | null;
  renewed_from_lease_id: string | null;
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

type ActivationLifecycleState =
  | 'scheduled'
  | 'activation_attention_required'
  | 'awaiting_check_in'
  | 'check_in_confirmation_required'
  | 'checked_in';

type ActivationLifecycleRow = {
  id: string;
  state: ActivationLifecycleState;
  cutoff_at: Date;
  check_in_due_at: Date;
};

type ContractSettlementActivationRow = {
  id: string;
  state: 'awaiting_activation' | 'open' | 'termination_pending' | 'terminated' | 'paid';
  policy_snapshot_id: string | null;
  initial_month_minimum_amount: string | null;
  final_checkpoint_due_at: Date | null;
};

export type LeaseActivationResponse = {
  leaseId: string;
  leaseStatus: 'active';
  occupancyStatus: 'active' | 'awaiting_check_in';
  roomNumber: string;
};

export type AutomaticLeaseActivationOutcome =
  | { state: 'activated'; leaseId: string }
  | { state: 'already_satisfied'; leaseId: string }
  | { state: 'attention_required'; leaseId: string; code: string }
  | { state: 'technical_failure'; leaseId: string; code: string };

const AUTOMATIC_BUSINESS_FAILURE_CODES = new Set([
  'LEASE_AUTOMATIC_ACTIVATION_NOT_SCHEDULED',
  'LEASE_ACTIVATION_AUTHORITY_MISMATCH',
  'LEASE_CONTRACT_SETTLEMENT_AMBIGUOUS',
  'LEASE_CONTRACT_SETTLEMENT_NOT_READY',
  'LEASE_ACTIVATION_FINANCIAL_OBLIGATION_UNMET',
  'LEASE_ACTIVATION_BILLING_AUTHORITY_MISSING',
  'LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE',
  'ROOM_NOT_AVAILABLE',
  'LEASE_ACTIVATION_HOLD_AMBIGUOUS',
  'LEASE_ACTIVATION_HOLD_MISMATCH',
  'LEASE_ACTIVATION_HOLD_REQUIRED',
  'RESIDENT_LIFECYCLE_AMBIGUOUS',
  'RESIDENT_LIFECYCLE_CONFLICT',
  'LEASE_SETTLEMENT_POLICY_CHECKPOINT_MISSING',
]);

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
      await this.lockPropertyScope(client, dto.property_id);
      const claim = await client.query<{ id: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id)
         VALUES($1,$2,$3,$4,$5,'pending',$6)
         ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING
         RETURNING id`,
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

      const response = await this.activateLocked(client, {
        propertyId: dto.property_id,
        leaseId,
        activatedAt: dto.activated_at ?? null,
        actorId: actor.id,
        source: 'manual_exception',
        correlationId: context.correlationId ?? null,
      });
      await client.query(
        `UPDATE idempotency_commands
            SET command_status='succeeded',response_status=200,response_body=$4::jsonb,
                resource_type='lease',resource_id=$5,completed_at=now()
          WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [actor.id, this.route, idempotencyKey, JSON.stringify({ data: response }), leaseId],
      );
      return { data: response };
    });
  }

  async activateAutomatically(
    propertyId: string,
    leaseId: string,
    businessDate: string,
    runId: string,
  ): Promise<AutomaticLeaseActivationOutcome> {
    const attemptKey = `lease-activation:auto:${leaseId}:${runId}`;
    const attemptType = (await this.hasPriorTechnicalFailure(propertyId, leaseId))
      ? 'technical_retry'
      : 'automatic_cutoff';
    try {
      const response = await this.database.transaction(async (client) => {
        await this.lockPropertyScope(client, propertyId);
        return this.activateLocked(client, {
          propertyId,
          leaseId,
          activatedAt: null,
          actorId: null,
          source: 'automatic_cutoff',
          correlationId: runId,
          businessDate,
          attemptKey,
          attemptType,
        });
      });
      return {
        state: response.occupancyStatus === 'awaiting_check_in' ? 'activated' : 'already_satisfied',
        leaseId,
      };
    } catch (error) {
      const code = this.errorCode(error);
      if (code === 'LEASE_NOT_READY' && (await this.isAlreadyActivated(propertyId, leaseId))) {
        await this.recordAutomaticAttempt({
          propertyId,
          leaseId,
          attemptKey,
          attemptType: 'technical_retry',
          outcome: 'already_satisfied',
          code: null,
          detail: {},
          runId,
          businessDate,
          requireScheduled: false,
        });
        return { state: 'already_satisfied', leaseId };
      }
      const businessFailure = AUTOMATIC_BUSINESS_FAILURE_CODES.has(code);
      await this.recordAutomaticAttempt({
        propertyId,
        leaseId,
        attemptKey,
        attemptType,
        outcome: businessFailure ? 'business_attention' : 'technical_failure',
        code,
        detail: { message: this.errorMessage(error) },
        runId,
        businessDate,
        requireScheduled: true,
      });
      return businessFailure
        ? { state: 'attention_required', leaseId, code }
        : { state: 'technical_failure', leaseId, code };
    }
  }

  async reconcileNoShow(
    propertyId: string,
    leaseId: string,
    businessDate: string,
    runId: string,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      await this.lockPropertyScope(client, propertyId);
      const result = await client.query<{
        lifecycle_id: string;
        room_id: string;
        resident_id: string;
        room_status: string;
        lease_status: string;
        occupancy_id: string | null;
      }>(
        `SELECT lifecycle.id AS lifecycle_id,lease.room_id,lease.resident_id,
                room.room_status,lease.lease_status,lease.occupancy_id
           FROM lease_activation_lifecycles lifecycle
           JOIN leases lease ON lease.id=lifecycle.lease_id AND lease.property_id=lifecycle.property_id
           JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
          WHERE lifecycle.property_id=$1 AND lifecycle.lease_id=$2
            AND lifecycle.state='awaiting_check_in'
          FOR UPDATE OF lifecycle,lease,room`,
        [propertyId, leaseId],
      );
      const row = result.rows[0];
      if (!row) return false;
      if (
        row.lease_status !== 'active' ||
        row.occupancy_id !== null ||
        row.room_status !== 'awaiting_check_in'
      )
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_LIFECYCLE_CONFLICT',
          message: 'Lease check-in lifecycle requires reconciliation',
        });

      const updated = await client.query(
        `UPDATE lease_activation_lifecycles
            SET state='check_in_confirmation_required',updated_at=now()
          WHERE id=$1 AND state='awaiting_check_in'`,
        [row.lifecycle_id],
      );
      if (updated.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_LIFECYCLE_CONFLICT',
          message: 'Lease check-in lifecycle was changed by another command',
        });
      await this.insertAttempt(client, {
        lifecycleId: row.lifecycle_id,
        propertyId,
        leaseId,
        attemptKey: `lease-activation:no-show:${leaseId}`,
        attemptType: 'no_show_reconciler',
        outcome: 'confirmation_required',
        failureCode: null,
        failureDetail: {},
        actorId: null,
        correlationId: runId,
      });
      await client.query(
        `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
         VALUES($1,$2,'check_in_confirmation_required',NULL,$3::date,$4::jsonb)`,
        [propertyId, leaseId, businessDate, JSON.stringify({ source: 'no_show_reconciler' })],
      );
      await this.audit.write(
        {
          propertyId,
          action: 'lease.check_in_confirmation_required',
          resourceType: 'lease',
          resourceId: leaseId,
          afterData: { activation_state: 'check_in_confirmation_required' },
          resultStatus: 'success',
          correlationId: runId,
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload)
         VALUES($1,$2,'lease.check_in_confirmation_required','lease',$3,$4,NULL,$5::jsonb)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          propertyId,
          `lease.check_in_confirmation_required:${leaseId}`,
          leaseId,
          runId,
          JSON.stringify({ lease_id: leaseId, resident_id: row.resident_id, room_id: row.room_id }),
        ],
      );
      return true;
    });
  }

  private async activateLocked(
    client: PoolClient,
    input: {
      propertyId: string;
      leaseId: string;
      activatedAt: string | null;
      actorId: string | null;
      source: 'manual_exception' | 'automatic_cutoff';
      correlationId: string | null;
      businessDate?: string;
      attemptKey?: string;
      attemptType?: 'automatic_cutoff' | 'technical_retry';
    },
  ): Promise<LeaseActivationResponse> {
    const { propertyId, leaseId } = input;
    const row = await client.query<ActivationLeaseRow>(
      `SELECT
         l.id,l.property_id,l.resident_id,l.room_id,l.occupancy_id,l.lease_status,l.start_date,l.end_date,
         l.renewed_from_lease_id,l.onboarding_commitment_id,r.room_status,r.number AS room_number,
         l.security_deposit_required_amount,
         r.property_id AS room_property_id,r.category AS room_category,
         r.gender_policy AS room_gender_policy,
         rb.property_id AS building_property_id,rb.category AS building_category,
         rb.gender_policy AS building_gender_policy,
         kt.property_id AS kost_type_property_id,kt.category AS kost_type_category,
         kt.status AS kost_type_status,kt.deleted_at AS kost_type_deleted_at,
         resident.property_id AS resident_property_id,resident.gender AS resident_gender,
         commitment.id AS commitment_id,commitment.property_id AS commitment_property_id,
         commitment.resident_id AS commitment_resident_id,commitment.room_id AS commitment_room_id,
         commitment.lease_id AS commitment_lease_id,commitment.category AS commitment_category,
         commitment.gender AS commitment_gender,commitment.status AS commitment_status
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
    if (input.source === 'manual_exception' && lease.renewed_from_lease_id)
      throw new ConflictException({
        code: 'RENEWAL_ACTIVATION_REQUIRES_W07C_COMMAND',
        message: 'Renewal successors must be activated through the authorized renewal command',
      });
    if (lease.lease_status !== 'awaiting_activation')
      throw new ConflictException({
        code: 'LEASE_NOT_READY',
        message: 'Lease is not awaiting activation',
      });

    const lifecycleResult = await client.query<ActivationLifecycleRow>(
      `SELECT id,state,cutoff_at,check_in_due_at
         FROM lease_activation_lifecycles
        WHERE property_id=$1 AND lease_id=$2
        FOR UPDATE`,
      [propertyId, leaseId],
    );
    const lifecycle = lifecycleResult.rows[0] ?? null;
    if (input.source === 'automatic_cutoff' && (!lifecycle || lifecycle.state !== 'scheduled'))
      throw new ConflictException({
        code: 'LEASE_AUTOMATIC_ACTIVATION_NOT_SCHEDULED',
        message: 'Lease is not eligible for automatic activation',
      });

    const activationWindow = await client.query<{
      activation_is_available: boolean;
      effective_is_valid: boolean;
    }>(
      `SELECT
         $1::date <= COALESCE($2::date,(now() AT TIME ZONE 'Asia/Jakarta')::date) AS activation_is_available,
         COALESCE(($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::date,$1::date)
           BETWEEN $1::date AND COALESCE($2::date,(now() AT TIME ZONE 'Asia/Jakarta')::date) AS effective_is_valid`,
      [lease.start_date, input.businessDate ?? null, input.activatedAt],
    );
    if (!activationWindow.rows[0]?.activation_is_available)
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_NOT_YET_AVAILABLE',
        message: 'Lease cannot be activated before its Jakarta start date',
      });
    if (!activationWindow.rows[0]?.effective_is_valid)
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_EFFECTIVE_TIME_INVALID',
        message: 'Activation time must be between the planned start date and today in Jakarta',
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
      (lease.room_gender_policy === 'mixed' || lease.room_gender_policy === lease.resident_gender) &&
      lease.building_gender_policy === lease.resident_gender &&
      lease.kost_type_status === 'active' &&
      lease.kost_type_deleted_at === null;
    if (!tupleMatches)
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_AUTHORITY_MISMATCH',
        message: 'Lease activation authority requires reconciliation',
      });

    const settlementResult = await client.query<ContractSettlementActivationRow>(
      `SELECT settlement.id,settlement.state,settlement.policy_snapshot_id,
              policy.initial_month_minimum_amount,
              checkpoint.due_at AS final_checkpoint_due_at
         FROM lease_contract_settlements settlement
         LEFT JOIN lease_settlement_policy_snapshots policy ON policy.id=settlement.policy_snapshot_id
         LEFT JOIN lease_settlement_checkpoints checkpoint
           ON checkpoint.policy_snapshot_id=settlement.policy_snapshot_id
          AND checkpoint.checkpoint_code='final_settlement'
        WHERE settlement.property_id=$1 AND settlement.lease_id=$2
        FOR UPDATE OF settlement`,
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
      deposit_balance: string;
      first_due_date: string | null;
      first_invoice_status: string | null;
      verified_rent_credit: string;
    }>(
      `SELECT
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
           ORDER BY installment.sequence_number LIMIT 1) AS first_invoice_status,
         COALESCE((
           SELECT sum(allocation.allocated_amount - COALESCE(reversal_allocation.reversed_amount,0))
             FROM payment_allocations allocation
             JOIN payments payment ON payment.id=allocation.payment_id
             JOIN invoices invoice ON invoice.id=allocation.invoice_id
             LEFT JOIN payment_reversals reversal ON reversal.payment_id=payment.id
             LEFT JOIN payment_reversal_allocations reversal_allocation
               ON reversal_allocation.original_allocation_id=allocation.id
            WHERE payment.property_id=$1 AND payment.lease_id=$2
              AND payment.payment_status='verified' AND reversal.id IS NULL
              AND allocation.allocation_status='active'
              AND invoice.property_id=$1 AND invoice.lease_id=$2
              AND invoice.authority_source='contract_schedule'
              AND ($3::timestamptz IS NULL OR payment.paid_at <= $3::timestamptz)
         ),0) AS verified_rent_credit`,
      [propertyId, lease.id, input.source === 'automatic_cutoff' ? lifecycle?.cutoff_at : null],
    );
    const financial = financials.rows[0];
    if (
      !financial?.first_due_date ||
      !financial.first_invoice_status ||
      !['issued', 'partially_paid', 'paid', 'overdue'].includes(financial.first_invoice_status)
    )
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_BILLING_AUTHORITY_MISSING',
        message: 'The first contract installment must have an issued invoice',
      });
    if (contractSettlement?.policy_snapshot_id) {
      if (
        !contractSettlement.initial_month_minimum_amount ||
        Number(financial.verified_rent_credit) < Number(contractSettlement.initial_month_minimum_amount)
      )
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_FINANCIAL_OBLIGATION_UNMET',
          message: 'At least one full monthly rent credit must be verified before activation',
        });
    } else {
      if (Number(financial.deposit_balance) < Number(lease.security_deposit_required_amount))
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_FINANCIAL_OBLIGATION_UNMET',
          message: 'Security-deposit ledger obligations must be satisfied',
        });
      const dueBoundary = await client.query<{ due_is_valid: boolean }>(
        `SELECT $1::date <= (COALESCE($2::timestamptz,now()) AT TIME ZONE 'Asia/Jakarta')::date AS due_is_valid`,
        [financial.first_due_date, input.activatedAt],
      );
      if (!dueBoundary.rows[0]?.due_is_valid)
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE',
          message: 'First installment must be due no later than activation',
        });
    }

    if (!['reserved', 'vacant'].includes(lease.room_status))
      throw new ConflictException({
        code: 'ROOM_NOT_AVAILABLE',
        message: 'Room is not available for activation',
      });
    const holds = await client.query<ActivationHoldRow>(
      `SELECT id,property_id,room_id,onboarding_commitment_id,
              (hold_status='committed' OR (hold_status='active' AND expires_at>now())) AS is_current
         FROM booking_lead_holds
        WHERE property_id=$1 AND hold_status IN ('active','committed')
          AND (onboarding_commitment_id=$2 OR room_id=$3)
        ORDER BY id FOR UPDATE`,
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
    if (hold && !hold.is_current)
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_HOLD_REQUIRED',
        message: 'The linked onboarding hold is no longer active',
      });

    const occupancies = await client.query<{ id: string }>(
      `SELECT id FROM occupancies
        WHERE property_id=$1 AND occupancy_status='active'
          AND (resident_id=$2 OR room_id=$3)
        ORDER BY id FOR UPDATE`,
      [propertyId, lease.resident_id, lease.room_id],
    );
    const activeLeases = await client.query<{ id: string }>(
      `SELECT id FROM leases
        WHERE property_id=$1 AND lease_status='active' AND id<>$2
          AND (resident_id=$3 OR room_id=$4)
        ORDER BY id FOR UPDATE`,
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

    const activatedAt = input.activatedAt;
    const activatedLease = await client.query(
      `UPDATE leases
          SET lease_status='active',occupancy_id=NULL,
              activated_at=COALESCE($3::timestamptz,now()),updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_status='awaiting_activation'`,
      [leaseId, propertyId, activatedAt],
    );
    if (activatedLease.rowCount !== 1)
      throw new ConflictException({
        code: 'LEASE_ACTIVATION_WRITE_CONFLICT',
        message: 'Lease activation was changed by another command',
      });

    if (contractSettlement) {
      if (contractSettlement.policy_snapshot_id && !contractSettlement.final_checkpoint_due_at)
        throw new ConflictException({
          code: 'LEASE_SETTLEMENT_POLICY_CHECKPOINT_MISSING',
          message: 'Lease settlement policy requires one final checkpoint',
        });
      const activatedSettlement = contractSettlement.policy_snapshot_id
        ? await client.query(
            `UPDATE lease_contract_settlements
                SET state='open',activated_at=COALESCE($3::timestamptz,now()),
                    original_due_at=$4::timestamptz,updated_at=now()
              WHERE id=$1 AND property_id=$2 AND state='awaiting_activation'`,
            [contractSettlement.id, propertyId, activatedAt, contractSettlement.final_checkpoint_due_at],
          )
        : await client.query(
            `WITH activation AS (SELECT COALESCE($3::timestamptz,now()) AS activated_at)
             UPDATE lease_contract_settlements settlement
                SET state='open',activated_at=activation.activated_at,
                    original_due_at=((
                      (activation.activated_at AT TIME ZONE 'Asia/Jakarta')::date
                      + INTERVAL '2 months' + INTERVAL '1 day' - INTERVAL '1 microsecond'
                    ) AT TIME ZONE 'Asia/Jakarta'),updated_at=now()
               FROM activation
              WHERE settlement.id=$1 AND settlement.property_id=$2
                AND settlement.state='awaiting_activation'`,
            [contractSettlement.id, propertyId, activatedAt],
          );
      if (activatedSettlement.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_CONTRACT_SETTLEMENT_ACTIVATION_FAILED',
          message: 'Contract settlement could not be activated',
        });
    }

    await client.query(
      `UPDATE rooms SET room_status='awaiting_check_in',updated_at=now()
        WHERE id=$1 AND property_id=$2`,
      [lease.room_id, propertyId],
    );
    await client.query(
      `UPDATE onboarding_commitments
          SET status='completed',completed_at=now(),updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND status='committed'`,
      [lease.onboarding_commitment_id, propertyId, lease.id],
    );
    await client.query(
      `UPDATE booking_lead_holds
          SET hold_status='released',released_at=now(),released_by_user_id=$2,
              release_reason='lease_activated',updated_at=now()
        WHERE onboarding_commitment_id=$1 AND property_id=$3 AND room_id=$4
          AND hold_status IN ('active','committed')`,
      [lease.onboarding_commitment_id, input.actorId, propertyId, lease.room_id],
    );
    await client.query(
      `UPDATE booking_leads
          SET status='leased',leased_at=now(),lease_id=$2,updated_at=now()
        WHERE property_id=$3
          AND (lease_id=$1 OR id=(SELECT booking_lead_id FROM leases WHERE id=$1 AND property_id=$3))`,
      [leaseId, leaseId, propertyId],
    );

    let lifecycleId = lifecycle?.id ?? null;
    if (lifecycle) {
      const updated = await client.query<{ id: string }>(
        `UPDATE lease_activation_lifecycles
            SET state='awaiting_check_in',cutoff_evaluated_at=COALESCE(cutoff_evaluated_at,now()),
                activated_at=COALESCE($2::timestamptz,now()),attention_code=NULL,
                attention_detail='{}'::jsonb,updated_at=now()
          WHERE id=$1 AND state IN ('scheduled','activation_attention_required')
          RETURNING id`,
        [lifecycle.id, activatedAt],
      );
      if (updated.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_ACTIVATION_LIFECYCLE_CONFLICT',
          message: 'Lease activation lifecycle requires reconciliation',
        });
      lifecycleId = updated.rows[0].id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO lease_activation_lifecycles(
           property_id,lease_id,state,cutoff_at,cutoff_evaluated_at,activated_at,check_in_due_at
         ) VALUES(
           $1,$2,'awaiting_check_in',
           (($3::date + TIME '00:05') AT TIME ZONE 'Asia/Jakarta'),now(),
           COALESCE($4::timestamptz,now()),
           (($3::date + 1 + TIME '00:05') AT TIME ZONE 'Asia/Jakarta')
         ) RETURNING id`,
        [propertyId, leaseId, lease.start_date, activatedAt],
      );
      lifecycleId = inserted.rows[0].id;
    }

    await this.insertAttempt(client, {
      lifecycleId,
      propertyId,
      leaseId,
      attemptKey:
        input.attemptKey ??
        `lease-activation:manual:${leaseId}:${input.correlationId ?? input.actorId ?? 'unknown'}`,
      attemptType: input.attemptType ?? input.source,
      outcome: 'activated',
      failureCode: null,
      failureDetail: {},
      actorId: input.actorId,
      correlationId: input.correlationId,
    });
    await client.query(
      `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
       VALUES($1,$2,'activated',$3,(COALESCE($4::timestamptz,now()) AT TIME ZONE 'Asia/Jakarta')::date,$5::jsonb)`,
      [
        propertyId,
        leaseId,
        input.actorId,
        activatedAt,
        JSON.stringify({ source: input.source, room_status: 'awaiting_check_in' }),
      ],
    );
    await this.audit.write(
      {
        actorUserId: input.actorId ?? undefined,
        propertyId,
        action: 'lease.activate',
        resourceType: 'lease',
        resourceId: leaseId,
        afterData: {
          lease_status: 'active',
          room_status: 'awaiting_check_in',
          room_number: lease.room_number,
          source: input.source,
        },
        resultStatus: 'success',
        correlationId: input.correlationId ?? undefined,
      },
      client,
    );
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload)
       VALUES($1,$2,'lease.activated','lease',$3,$4,$5,$6::jsonb)
       ON CONFLICT(event_key) DO NOTHING`,
      [
        propertyId,
        `lease.activated:${leaseId}`,
        leaseId,
        input.correlationId,
        input.actorId,
        JSON.stringify({
          lease_id: leaseId,
          room_number: lease.room_number,
          room_status: 'awaiting_check_in',
          source: input.source,
        }),
      ],
    );
    return {
      leaseId,
      leaseStatus: 'active',
      occupancyStatus: 'awaiting_check_in',
      roomNumber: lease.room_number,
    };
  }

  private async recordAutomaticAttempt(input: {
    propertyId: string;
    leaseId: string;
    attemptKey: string;
    attemptType: 'automatic_cutoff' | 'technical_retry';
    outcome: 'business_attention' | 'technical_failure' | 'already_satisfied';
    code: string | null;
    detail: Record<string, unknown>;
    runId: string;
    businessDate: string;
    requireScheduled: boolean;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.lockPropertyScope(client, input.propertyId);
      const lifecycleResult = await client.query<ActivationLifecycleRow>(
        `SELECT id,state,cutoff_at,check_in_due_at
           FROM lease_activation_lifecycles
          WHERE property_id=$1 AND lease_id=$2
          FOR UPDATE`,
        [input.propertyId, input.leaseId],
      );
      const lifecycle = lifecycleResult.rows[0];
      if (!lifecycle || (input.requireScheduled && lifecycle.state !== 'scheduled')) return;

      if (input.outcome === 'business_attention') {
        await client.query(
          `UPDATE lease_activation_lifecycles
              SET state='activation_attention_required',cutoff_evaluated_at=now(),
                  attention_code=$2,attention_detail=$3::jsonb,updated_at=now()
            WHERE id=$1 AND state='scheduled'`,
          [lifecycle.id, input.code, JSON.stringify(input.detail)],
        );
        await client.query(
          `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
           VALUES($1,$2,'activation_attention_required',NULL,$3::date,$4::jsonb)`,
          [
            input.propertyId,
            input.leaseId,
            input.businessDate,
            JSON.stringify({ source: 'automatic_cutoff', code: input.code }),
          ],
        );
        await client.query(
          `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload)
           VALUES($1,$2,'lease.activation_attention_required','lease',$3,$4,NULL,$5::jsonb)
           ON CONFLICT(event_key) DO NOTHING`,
          [
            input.propertyId,
            `lease.activation_attention_required:${input.leaseId}`,
            input.leaseId,
            input.runId,
            JSON.stringify({ lease_id: input.leaseId, code: input.code }),
          ],
        );
      }
      await this.insertAttempt(client, {
        lifecycleId: lifecycle.id,
        propertyId: input.propertyId,
        leaseId: input.leaseId,
        attemptKey: input.attemptKey,
        attemptType: input.attemptType,
        outcome: input.outcome,
        failureCode: input.code,
        failureDetail: input.detail,
        actorId: null,
        correlationId: input.runId,
      });
      await this.audit.write(
        {
          propertyId: input.propertyId,
          action:
            input.outcome === 'business_attention'
              ? 'lease.activation_attention_required'
              : 'lease.automatic_activation_failed',
          resourceType: 'lease',
          resourceId: input.leaseId,
          afterData: { outcome: input.outcome, code: input.code },
          resultStatus: input.outcome === 'already_satisfied' ? 'success' : 'failed',
          correlationId: input.runId,
        },
        client,
      );
    });
  }

  private async insertAttempt(
    client: PoolClient,
    input: {
      lifecycleId: string;
      propertyId: string;
      leaseId: string;
      attemptKey: string;
      attemptType:
        | 'automatic_cutoff'
        | 'technical_retry'
        | 'manual_exception'
        | 'no_show_reconciler'
        | 'physical_check_in';
      outcome:
        | 'activated'
        | 'business_attention'
        | 'technical_failure'
        | 'already_satisfied'
        | 'confirmation_required'
        | 'checked_in';
      failureCode: string | null;
      failureDetail: Record<string, unknown>;
      actorId: string | null;
      correlationId: string | null;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_activation_attempts(
         property_id,lease_id,lifecycle_id,attempt_key,attempt_type,outcome,
         failure_code,failure_detail,actor_user_id,correlation_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       ON CONFLICT(attempt_key) DO NOTHING`,
      [
        input.propertyId,
        input.leaseId,
        input.lifecycleId,
        input.attemptKey,
        input.attemptType,
        input.outcome,
        input.failureCode,
        JSON.stringify(input.failureDetail),
        input.actorId,
        input.correlationId,
      ],
    );
  }

  private async lockPropertyScope(client: PoolClient, propertyId: string): Promise<void> {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
      [propertyId],
    );
  }

  private async isAlreadyActivated(propertyId: string, leaseId: string): Promise<boolean> {
    const result = await this.database.client.query<{ activated: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM leases lease
         JOIN lease_activation_lifecycles lifecycle
           ON lifecycle.lease_id=lease.id AND lifecycle.property_id=lease.property_id
         WHERE lease.id=$1 AND lease.property_id=$2 AND lease.lease_status='active'
           AND lifecycle.state IN ('awaiting_check_in','check_in_confirmation_required','checked_in')
       ) AS activated`,
      [leaseId, propertyId],
    );
    return result.rows[0]?.activated === true;
  }

  private async hasPriorTechnicalFailure(propertyId: string, leaseId: string): Promise<boolean> {
    const result = await this.database.client.query<{ has_failure: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM lease_activation_attempts
          WHERE property_id=$1 AND lease_id=$2 AND outcome='technical_failure'
       ) AS has_failure`,
      [propertyId, leaseId],
    );
    return result.rows[0]?.has_failure === true;
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object' && 'code' in response) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string' && code.trim()) return code;
      }
    }
    return error instanceof Error && error.message ? error.message.slice(0, 160) : 'UNKNOWN_ERROR';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string') return message.slice(0, 500);
      }
    }
    return error instanceof Error ? error.message.slice(0, 500) : 'Unknown activation failure';
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
