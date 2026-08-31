import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { type ContractPaymentPlan } from '../billing/helpers/contract-schedule.helper';
import { ContractScheduleIssuanceService } from '../billing/services/contract-schedule-issuance.service';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  ApproveLeaseRenewalDto,
  AuthorizeLeaseRenewalActivationDto,
  CancelLeaseRenewalDto,
  CreateLeaseRenewalIntentDto,
  PrepareLeaseRenewalFinancialsDto,
} from './lease.dto';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type { BillingCycle, IdempotentResult, LeaseAuditContext } from './lease.types';

type LeaseRow = {
  id: string;
  property_id: string;
  lease_code: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string | null;
  kost_type_id: string;
  lease_status: string;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  snapshot_monthly_price: string;
  snapshot_yearly_price: string;
  snapshot_deposit_amount: string;
  snapshot_room_number: string;
  snapshot_kost_type_name: string;
  term_months: number | null;
  payment_plan_type: ContractPaymentPlan | null;
  contract_rent_amount: string | null;
  dp_required_amount: string | null;
  security_deposit_required_amount: string | null;
  renewed_from_lease_id: string | null;
};

type CommercialRoomRow = {
  id: string;
  property_id: string;
  room_number: string;
  room_status: string;
  kost_type_id: string | null;
  kost_type_name: string | null;
  kost_type_status: string | null;
  kost_type_deleted_at: string | null;
  building_code: string | null;
  monthly_price: string | null;
  yearly_price: string | null;
};

type RenewalCommandRow = {
  id: string;
  property_id: string;
  predecessor_lease_id: string;
  successor_lease_id: string | null;
  resident_id: string;
  room_id: string;
  effective_date: string;
  requested_terms: Record<string, unknown>;
  commercial_snapshot: Record<string, unknown>;
  state: 'draft' | 'approved' | 'activated' | 'cancelled' | 'failed';
  approved_by_user_id: string | null;
  approved_at: string | null;
  financial_prepared_by_user_id: string | null;
  financial_prepared_at: string | null;
  first_invoice_id: string | null;
  activation_authorized_by_user_id: string | null;
  activation_authorized_at: string | null;
  activated_by_user_id: string | null;
  activated_at: string | null;
  cancelled_by_user_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  failure_code: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: unknown;
};

type CommandOutput<T> = { resourceType: string; resourceId: string; data: T };

type CommercialSnapshot = {
  term_months: number;
  billing_cycle: BillingCycle;
  payment_plan_type: ContractPaymentPlan;
  contract_rent_amount: number;
  dp_recommended_amount: number;
  snapshot_monthly_price: number;
  snapshot_yearly_price: number;
  snapshot_deposit_amount: number;
  room_number: string;
  kost_type_id: string;
  kost_type_name: string;
  building_code: string | null;
  predecessor_end_date: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * W07C is deliberately a successor-term lifecycle, never an in-place extension.
 * It preserves the active physical occupancy through the predecessor/successor
 * cutover, leaves W06 payment/allocation authority untouched, and allows a
 * scheduler to execute only an already-approved, financially-prepared, and
 * explicitly activation-authorized command.
 */
@Injectable()
export class LeaseRenewalService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly contractScheduleIssuance: ContractScheduleIssuanceService,
  ) {}

  async createIntent(
    user: UserAccessContext,
    leaseId: string,
    dto: CreateLeaseRenewalIntentDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminLeaseActor(user, scope.property_id);
    await this.features.assertRenewalEnabled(scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/renewals`,
      idempotencyKey,
      dto,
      context,
      201,
      async (client, today) => {
        await this.features.assertRenewalEnabled(scope.property_id, client);
        const predecessor = await this.lockLease(client, leaseId);
        this.assertRenewablePredecessor(predecessor, today);
        const effectiveDate = this.nextDate(predecessor.end_date as string);
        const daysUntilBoundary = this.daysBetween(today, effectiveDate);
        if (daysUntilBoundary > 60) {
          throw new UnprocessableEntityException({
            code: 'RENEWAL_INTENT_TOO_EARLY',
            message: 'Renewal intent may be recorded no earlier than H-60',
          });
        }
        if (dto.effective_date !== effectiveDate) {
          throw new UnprocessableEntityException({
            code: 'RENEWAL_EFFECTIVE_DATE_INVALID',
            message: 'Renewal must start on the day after the predecessor end date',
          });
        }
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM lease_renewal_commands
           WHERE predecessor_lease_id=$1 AND state IN ('draft','approved')
           FOR SHARE`,
          [predecessor.id],
        );
        if (existing.rows[0]) {
          throw new ConflictException({
            code: 'RENEWAL_ALREADY_OPEN',
            message: 'The predecessor already has an open renewal command',
          });
        }
        const requestedTerms = this.requestedTerms(dto);
        const command = await client.query<RenewalCommandRow>(
          `INSERT INTO lease_renewal_commands(
             property_id,predecessor_lease_id,resident_id,room_id,effective_date,
             requested_terms,created_by_user_id
           ) VALUES($1,$2,$3,$4,$5::date,$6::jsonb,$7)
           RETURNING ${this.commandColumns()}`,
          [
            scope.property_id,
            predecessor.id,
            predecessor.resident_id,
            predecessor.room_id,
            effectiveDate,
            JSON.stringify(requestedTerms),
            user.id,
          ],
        );
        await this.insertHistory(
          client,
          scope.property_id,
          predecessor.id,
          'renewal_intent',
          user.id,
          today,
          { renewal_command_id: command.rows[0].id, effective_date: effectiveDate },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.renewal.intent',
          'lease_renewal_command',
          command.rows[0].id,
          {},
          { state: 'draft', predecessor_lease_id: predecessor.id, effective_date: effectiveDate },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.renewal_intent:${command.rows[0].id}`,
          eventType: 'lease.renewal_intent',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.rows[0].id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            renewal_command_id: command.rows[0].id,
            predecessor_lease_id: predecessor.id,
            effective_date: effectiveDate,
          },
        });
        return {
          resourceType: 'lease_renewal_command',
          resourceId: command.rows[0].id,
          data: { renewal: this.safeCommand(command.rows[0]) },
        };
      },
    );
  }

  async approve(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: ApproveLeaseRenewalDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminLeaseActor(user, scope.property_id);
    await this.features.assertRenewalEnabled(scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/renewals/${commandId}/approve`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.features.assertRenewalEnabled(scope.property_id, client);
        const command = await this.lockCommand(client, commandId);
        this.assertCommandLeaseScope(command, leaseId, scope.property_id);
        if (command.state !== 'draft') {
          throw new ConflictException({
            code: 'RENEWAL_NOT_APPROVABLE',
            message: 'Renewal intent is not awaiting approval',
          });
        }
        const predecessor = await this.lockLease(client, leaseId);
        this.assertRenewablePredecessor(predecessor, today);
        if (
          command.resident_id !== predecessor.resident_id ||
          command.room_id !== predecessor.room_id
        ) {
          throw new ConflictException({
            code: 'RENEWAL_AUTHORITY_MISMATCH',
            message: 'Renewal command no longer matches its predecessor',
          });
        }
        const expectedEffectiveDate = this.nextDate(predecessor.end_date as string);
        if (command.effective_date !== expectedEffectiveDate) {
          throw new ConflictException({
            code: 'RENEWAL_BOUNDARY_STALE',
            message: 'Predecessor term boundary changed after intent',
          });
        }
        const terms = this.approvedTerms(dto);
        const room = await this.lockCommercialRoom(
          client,
          predecessor.room_id,
          expectedEffectiveDate,
        );
        this.assertCommercialRoom(room, scope.property_id);
        const snapshot = this.buildCommercialSnapshot(predecessor, room, terms);
        const successorEndDate = this.addMonthsInclusive(expectedEffectiveDate, terms.term_months);
        const successor = await client.query<{ id: string; lease_code: string }>(
          `INSERT INTO leases(
             property_id,lease_code,resident_id,room_id,occupancy_id,kost_type_id,lease_status,
             start_date,end_date,billing_cycle,billing_anchor_day,next_billing_date,
             snapshot_monthly_price,snapshot_yearly_price,snapshot_deposit_amount,
             snapshot_room_number,snapshot_kost_type_name,renewed_from_lease_id,
             term_months,payment_plan_type,contract_rent_amount,dp_required_amount,
             security_deposit_required_amount,signed_at,created_by_user_id,updated_by_user_id
           ) VALUES(
             $1,$2,$3,$4,NULL,$5,'awaiting_activation',$6::date,$7::date,$8,$9,$6::date,
             $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,now(),$20,$20
           ) RETURNING id,lease_code`,
          [
            scope.property_id,
            this.newLeaseCode(today),
            predecessor.resident_id,
            predecessor.room_id,
            snapshot.kost_type_id,
            expectedEffectiveDate,
            successorEndDate,
            snapshot.billing_cycle,
            predecessor.billing_anchor_day,
            snapshot.snapshot_monthly_price,
            snapshot.snapshot_yearly_price,
            snapshot.snapshot_deposit_amount,
            snapshot.room_number,
            snapshot.kost_type_name,
            predecessor.id,
            snapshot.term_months,
            snapshot.payment_plan_type,
            snapshot.contract_rent_amount,
            snapshot.dp_recommended_amount,
            user.id,
          ],
        );
        if (!successor.rows[0])
          throw new ConflictException({
            code: 'RENEWAL_SUCCESSOR_CREATE_FAILED',
            message: 'Renewal successor could not be created',
          });
        const updated = await client.query<RenewalCommandRow>(
          `UPDATE lease_renewal_commands
             SET state='approved',successor_lease_id=$2,commercial_snapshot=$3::jsonb,
                 approved_by_user_id=$4,approved_at=now(),updated_at=now()
           WHERE id=$1 AND state='draft'
           RETURNING ${this.commandColumns()}`,
          [command.id, successor.rows[0].id, JSON.stringify(snapshot), user.id],
        );
        if (!updated.rows[0])
          throw new ConflictException({
            code: 'RENEWAL_NOT_APPROVABLE',
            message: 'Renewal approval raced another command',
          });
        await this.insertHistory(
          client,
          scope.property_id,
          predecessor.id,
          'renewal_approved',
          user.id,
          today,
          {
            renewal_command_id: command.id,
            successor_lease_id: successor.rows[0].id,
            effective_date: expectedEffectiveDate,
          },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.renewal.approve',
          'lease_renewal_command',
          command.id,
          { state: 'draft' },
          {
            state: 'approved',
            successor_lease_id: successor.rows[0].id,
            effective_date: expectedEffectiveDate,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.renewal_approved:${command.id}`,
          eventType: 'lease.renewal_approved',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            renewal_command_id: command.id,
            predecessor_lease_id: predecessor.id,
            successor_lease_id: successor.rows[0].id,
            effective_date: expectedEffectiveDate,
          },
        });
        return {
          resourceType: 'lease_renewal_command',
          resourceId: command.id,
          data: { renewal: this.safeCommand(updated.rows[0]) },
        };
      },
    );
  }

  async prepareFinancials(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: PrepareLeaseRenewalFinancialsDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminFinancialActor(user, scope.property_id);
    await this.features.assertRenewalEnabled(scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/renewals/${commandId}/financials`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.features.assertRenewalEnabled(scope.property_id, client);
        const command = await this.lockCommand(client, commandId);
        this.assertCommandLeaseScope(command, leaseId, scope.property_id);
        if (command.state !== 'approved' || !command.successor_lease_id) {
          throw new ConflictException({
            code: 'RENEWAL_NOT_FINANCIALLY_PREPARABLE',
            message: 'Renewal must be approved before financial preparation',
          });
        }
        if (command.financial_prepared_at || command.first_invoice_id) {
          throw new ConflictException({
            code: 'RENEWAL_FINANCIALS_ALREADY_PREPARED',
            message: 'Renewal financial authority is already prepared',
          });
        }
        const predecessor = await this.lockLease(client, leaseId);
        const successor = await this.lockLease(client, command.successor_lease_id);
        this.assertSuccessorTuple(predecessor, successor, command);
        const snapshot = this.snapshot(command);
        // H-30 means the approved successor is actionable payment work. The
        // command is intentionally allowed earlier too: Admin can prepare it
        // in advance, while the H-30 worklist remains derived from its state.
        const daysUntilBoundary = this.daysBetween(today, command.effective_date);
        void daysUntilBoundary;
        // Canonical W05/W06 issuance authority: the successor's snapshot-derived
        // schedule, invoices/line items, and awaiting-activation contract
        // settlement are all created by the shared service. Renewal issues only
        // the first installment (no pre-recorded rent credit) and keeps no
        // duplicate invoice/installment lifecycle SQL of its own.
        const issued = await this.contractScheduleIssuance.issueScheduleInTransaction(client, {
          propertyId: scope.property_id,
          leaseId: successor.id,
          startDate: command.effective_date,
          termMonths: snapshot.term_months,
          paymentPlanType: snapshot.payment_plan_type,
          contractRentAmount: snapshot.contract_rent_amount,
          billingCycle: snapshot.billing_cycle,
          snapshotMonthlyPrice: snapshot.snapshot_monthly_price,
          snapshotRoomNumber: snapshot.room_number,
          snapshotBuildingCode: snapshot.building_code,
          snapshotCategoryName: snapshot.kost_type_name,
          initialRentCredit: 0,
          commandFingerprintPrefix: `renewal:${command.id}`,
          actorUserId: user.id,
        });
        const firstInvoiceId = issued.firstInvoiceId;
        const updated = await client.query<RenewalCommandRow>(
          `UPDATE lease_renewal_commands
             SET first_invoice_id=$2,financial_prepared_by_user_id=$3,financial_prepared_at=now(),updated_at=now()
           WHERE id=$1 AND state='approved' AND financial_prepared_at IS NULL
           RETURNING ${this.commandColumns()}`,
          [command.id, firstInvoiceId, user.id],
        );
        if (!updated.rows[0])
          throw new ConflictException({
            code: 'RENEWAL_FINANCIALS_ALREADY_PREPARED',
            message: 'Renewal financial preparation raced another command',
          });
        await this.insertHistory(
          client,
          scope.property_id,
          successor.id,
          'renewal_financial_prepared',
          user.id,
          today,
          { renewal_command_id: command.id, first_invoice_id: firstInvoiceId },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.renewal.financial_prepare',
          'lease_renewal_command',
          command.id,
          { financial_prepared_at: null },
          {
            financial_prepared_at: updated.rows[0].financial_prepared_at,
            first_invoice_id: firstInvoiceId,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.renewal_financial_prepared:${command.id}`,
          eventType: 'lease.renewal_financial_prepared',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            renewal_command_id: command.id,
            successor_lease_id: successor.id,
            first_invoice_id: firstInvoiceId,
          },
        });
        return {
          resourceType: 'lease_renewal_command',
          resourceId: command.id,
          data: { renewal: this.safeCommand(updated.rows[0]) },
        };
      },
    );
  }

  async authorizeActivation(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: AuthorizeLeaseRenewalActivationDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminFinancialActor(user, scope.property_id);
    await this.features.assertRenewalEnabled(scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/renewals/${commandId}/authorize-activation`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.features.assertRenewalEnabled(scope.property_id, client);
        const command = await this.lockCommand(client, commandId);
        this.assertCommandLeaseScope(command, leaseId, scope.property_id);
        if (
          command.state !== 'approved' ||
          !command.successor_lease_id ||
          !command.first_invoice_id ||
          !command.financial_prepared_at
        ) {
          throw new ConflictException({
            code: 'RENEWAL_FINANCIAL_AUTHORITY_MISSING',
            message:
              'Renewal schedule and first invoice must exist before activation authorization',
          });
        }
        if (command.activation_authorized_at) {
          throw new ConflictException({
            code: 'RENEWAL_ACTIVATION_ALREADY_AUTHORIZED',
            message: 'Renewal activation has already been authorized',
          });
        }
        await this.assertVerifiedInitialRentCredit(client, command, command.first_invoice_id);
        const updated = await client.query<RenewalCommandRow>(
          `UPDATE lease_renewal_commands
             SET activation_authorized_by_user_id=$2,activation_authorized_at=now(),updated_at=now()
           WHERE id=$1 AND state='approved' AND activation_authorized_at IS NULL
           RETURNING ${this.commandColumns()}`,
          [command.id, user.id],
        );
        if (!updated.rows[0])
          throw new ConflictException({
            code: 'RENEWAL_ACTIVATION_ALREADY_AUTHORIZED',
            message: 'Renewal activation authorization raced another command',
          });
        await this.insertHistory(
          client,
          scope.property_id,
          command.successor_lease_id,
          'renewal_activation_authorized',
          user.id,
          today,
          { renewal_command_id: command.id, first_invoice_id: command.first_invoice_id },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.renewal.authorize_activation',
          'lease_renewal_command',
          command.id,
          { activation_authorized_at: null },
          {
            activation_authorized_at: updated.rows[0].activation_authorized_at,
            first_invoice_id: command.first_invoice_id,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.renewal_activation_authorized:${command.id}`,
          eventType: 'lease.renewal_activation_authorized',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            renewal_command_id: command.id,
            successor_lease_id: command.successor_lease_id,
            first_invoice_id: command.first_invoice_id,
          },
        });
        return {
          resourceType: 'lease_renewal_command',
          resourceId: command.id,
          data: { renewal: this.safeCommand(updated.rows[0]) },
        };
      },
    );
  }

  async cancel(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CancelLeaseRenewalDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminLeaseActor(user, scope.property_id);
    await this.features.assertRenewalEnabled(scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/renewals/${commandId}/cancel`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.features.assertRenewalEnabled(scope.property_id, client);
        const command = await this.lockCommand(client, commandId);
        this.assertCommandLeaseScope(command, leaseId, scope.property_id);
        if (!['draft', 'approved'].includes(command.state)) {
          throw new ConflictException({
            code: 'RENEWAL_NOT_CANCELLABLE',
            message: 'Renewal is no longer cancellable',
          });
        }
        if (command.activation_authorized_at) {
          throw new ConflictException({
            code: 'RENEWAL_ACTIVATION_ALREADY_AUTHORIZED',
            message: 'An activation-authorized renewal may not be cancelled',
          });
        }
        if (command.financial_prepared_at) {
          throw new ConflictException({
            code: 'RENEWAL_FINANCIAL_REVERSAL_REQUIRED',
            message:
              'Prepared renewal invoices require W06-authorized reversal before cancellation',
          });
        }
        if (command.successor_lease_id) {
          await client.query(
            `UPDATE leases SET lease_status='cancelled',closed_at=now(),closed_by_user_id=$2,close_reason='renewal_cancelled',updated_at=now(),updated_by_user_id=$2
             WHERE id=$1 AND lease_status='awaiting_activation'`,
            [command.successor_lease_id, user.id],
          );
        }
        const updated = await client.query<RenewalCommandRow>(
          `UPDATE lease_renewal_commands
             SET state='cancelled',cancelled_by_user_id=$2,cancelled_at=now(),cancel_reason=$3,updated_at=now()
           WHERE id=$1 AND state IN ('draft','approved')
           RETURNING ${this.commandColumns()}`,
          [command.id, user.id, dto.reason.trim()],
        );
        if (!updated.rows[0])
          throw new ConflictException({
            code: 'RENEWAL_NOT_CANCELLABLE',
            message: 'Renewal cancellation raced another command',
          });
        await this.insertHistory(
          client,
          scope.property_id,
          leaseId,
          'renewal_cancelled',
          user.id,
          today,
          { renewal_command_id: command.id, cancel_reason: dto.reason.trim() },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.renewal.cancel',
          'lease_renewal_command',
          command.id,
          { state: command.state },
          { state: 'cancelled', cancel_reason: dto.reason.trim() },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.renewal_cancelled:${command.id}`,
          eventType: 'lease.renewal_cancelled',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            renewal_command_id: command.id,
            predecessor_lease_id: leaseId,
            successor_lease_id: command.successor_lease_id,
            cancel_reason: dto.reason.trim(),
          },
        });
        return {
          resourceType: 'lease_renewal_command',
          resourceId: command.id,
          data: { renewal: this.safeCommand(updated.rows[0]) },
        };
      },
    );
  }

  async listRenewalCommands(
    user: UserAccessContext,
    leaseId: string,
  ): Promise<{ data: { items: Record<string, unknown>[] } }> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    const rows = await this.leases.query<RenewalCommandRow>(
      `SELECT ${this.commandColumns()}
       FROM lease_renewal_commands
       WHERE predecessor_lease_id=$1 AND property_id=$2
       ORDER BY created_at DESC,id DESC
       LIMIT 50`,
      [leaseId, scope.property_id],
    );
    return { data: { items: rows.rows.map((row) => this.safeCommand(row)) } };
  }

  /**
   * Query-derived lease-ending renewal eligibility (Finding #2).
   *
   * This is a read-only projection over the lease, its latest open renewal
   * command, and the successor's verified rent credit. It surfaces the exact
   * H-60/H-30/H-14 reminder facts the existing worklist/reminder authority is
   * expected to consume; it never records or delivers a reminder (W08) and
   * never mutates state.
   *
   * - H-60 (window opens at 60 days before the boundary) is CLEARED once a
   *   renewal intent is recorded for this term.
   * - H-30 exposes unresolved approved-renewal/payment work at the boundary. It
   *   stays UNRESOLVED while the approved command still needs financial
   *   preparation, activation authorization, or execution; a recorded payment
   *   ALONE does not clear it.
   * - H-14 is CLEARED only when the renewal is effective (successor activated).
   */
  async renewalEligibility(
    user: UserAccessContext,
    leaseId: string,
  ): Promise<{ data: { eligibility: Record<string, unknown> } }> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertAdminLeaseActor(user, scope.property_id);
    const today = (
      await this.leases.query<{ today: string }>(
        `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
      )
    ).rows[0].today;
    const leaseRow = await this.leases.query<{
      id: string;
      property_id: string;
      lease_status: string;
      end_date: string | null;
    }>(
      `SELECT id,property_id,lease_status,end_date::text FROM leases WHERE id=$1 AND property_id=$2`,
      [leaseId, scope.property_id],
    );
    if (!leaseRow.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    const lease = leaseRow.rows[0];
    const latest = await this.leases.query<RenewalCommandRow>(
      `SELECT ${this.commandColumns()}
       FROM lease_renewal_commands
       WHERE predecessor_lease_id=$1 AND property_id=$2
         AND state IN ('draft','approved','activated')
       ORDER BY created_at DESC,id DESC
       LIMIT 1`,
      [leaseId, scope.property_id],
    );
    const command = latest.rows[0] ?? null;
    const daysUntilEnding =
      lease.end_date === null ? null : this.daysBetween(today, lease.end_date);
    const intentRecorded = command !== null && command.state !== 'cancelled';
    const approved =
      command !== null && (command.state === 'approved' || command.state === 'activated');
    const effective = command !== null && command.state === 'activated';
    // Verified rent credit on the successor's first invoice is a payment FACT.
    // It is surfaced for transparency but deliberately does NOT clear H-30.
    let verifiedCreditRecorded = false;
    if (command !== null && command.successor_lease_id && command.first_invoice_id) {
      const credit = await this.leases.query<{ verified_credit: string }>(
        `SELECT
           COALESCE(sum(allocation.allocated_amount),0)
           - COALESCE(sum(reversal_allocation.reversed_amount),0) AS verified_credit
         FROM payment_allocations allocation
         JOIN payments payment ON payment.id=allocation.payment_id
         JOIN invoices invoice ON invoice.id=allocation.invoice_id
         LEFT JOIN payment_reversal_allocations reversal_allocation
           ON reversal_allocation.original_allocation_id=allocation.id
         WHERE allocation.invoice_id=$1
           AND allocation.lease_id=$2
           AND payment.property_id=$3
           AND payment.lease_id=$2
           AND payment.payment_purpose IN ('dp','rent')
           AND payment.payment_status='verified'
           AND invoice.property_id=$3
           AND invoice.lease_id=$2`,
        [command.first_invoice_id, command.successor_lease_id, scope.property_id],
      );
      verifiedCreditRecorded = Number(credit.rows[0]?.verified_credit ?? 0) > 0;
    }
    const financialsPrepared = command !== null && Boolean(command.first_invoice_id);
    const activationAuthorized = command !== null && Boolean(command.activation_authorized_at);
    const withinH60 = daysUntilEnding !== null && daysUntilEnding >= 31 && daysUntilEnding <= 60;
    const withinH30 = daysUntilEnding !== null && daysUntilEnding >= 0 && daysUntilEnding <= 30;
    const withinH14 = daysUntilEnding !== null && daysUntilEnding >= 0 && daysUntilEnding <= 14;
    // H-30 unresolved work is any approved renewal that has not yet become
    // effective, i.e. still awaiting financial prep, activation authorization,
    // or the scheduler cutover. A payment alone never clears it.
    const h30UnresolvedWork =
      approved && !effective
        ? !financialsPrepared
          ? 'financial_preparation'
          : !activationAuthorized
            ? 'activation_authorization'
            : 'activation_execution'
        : null;
    const eligibility = {
      lease_id: lease.id,
      property_id: lease.property_id,
      lease_status: lease.lease_status,
      lease_end_date: lease.end_date,
      as_of_date: today,
      days_until_ending: daysUntilEnding,
      renewal_command_id: command?.id ?? null,
      renewal_state: command?.state ?? null,
      reminders: {
        h60: {
          window_open: withinH60,
          // H-60 clears once intent is recorded for this term.
          cleared: intentRecorded,
          action_required: withinH60 && !intentRecorded && lease.lease_status === 'active',
        },
        h30: {
          window_open: withinH30,
          // H-30 is only cleared when the approved renewal is fully effective.
          cleared: effective,
          unresolved_work: withinH30 ? h30UnresolvedWork : null,
          payment_recorded: verifiedCreditRecorded,
          // Every active lease at H-30 needs a resolution. No renewal command
          // and a draft command are still actionable; an approved command adds
          // the more specific unresolved_work above. An effective transfer or
          // checkout no longer leaves this predecessor lease active.
          action_required: withinH30 && lease.lease_status === 'active' && !effective,
        },
        h14: {
          window_open: withinH14,
          // H-14 clears only when the renewal is effective (successor active).
          cleared: effective,
          action_required: withinH14 && !effective && lease.lease_status === 'active',
        },
      },
    };
    return { data: { eligibility } };
  }

  async executeAuthorizedRenewal(
    commandId: string,
    runId: string,
  ): Promise<{ state: 'activated' | 'skipped' | 'failed'; late: boolean; failure_code?: string }> {
    let late = false;
    try {
      const outcome = await this.leases.transaction(async (client) => {
        const command = await this.lockCommand(client, commandId);
        if (command.state !== 'approved') return { state: 'skipped' as const };
        if (!(await this.features.isRenewalSchedulerEnabled(command.property_id, client)))
          return { state: 'skipped' as const };
        // Missing financial preparation/authorization is an intentional retryable
        // state: no lifecycle row is touched until all prerequisites exist.
        if (
          !command.financial_prepared_at ||
          !command.first_invoice_id ||
          !command.activation_authorized_at
        )
          return { state: 'skipped' as const };
        const today = await this.jakartaToday(client);
        if (command.effective_date > today) return { state: 'skipped' as const };
        late = command.effective_date < today;
        await this.activateInTransaction(client, command, today, runId, late);
        return { state: 'activated' as const };
      });
      return outcome.state === 'activated'
        ? { state: 'activated', late }
        : { state: 'skipped', late };
    } catch (error) {
      const terminalCode = this.classifyTerminalFailure(error);
      if (terminalCode === null) throw error;
      await this.markCommandFailed(commandId, terminalCode, error, runId, late);
      return { state: 'failed', late, failure_code: terminalCode };
    }
  }

  private async activateInTransaction(
    client: PoolClient,
    command: RenewalCommandRow,
    today: string,
    runId: string,
    late: boolean,
  ): Promise<void> {
    if (!command.successor_lease_id || !command.first_invoice_id) {
      throw new ConflictException({
        code: 'RENEWAL_FINANCIAL_AUTHORITY_MISSING',
        message: 'Renewal successor or first invoice is missing',
      });
    }
    const predecessor = await this.lockLease(client, command.predecessor_lease_id);
    const successor = await this.lockLease(client, command.successor_lease_id);
    this.assertSuccessorTuple(predecessor, successor, command);
    if (predecessor.lease_status !== 'active' || successor.lease_status !== 'awaiting_activation') {
      throw new ConflictException({
        code: 'RENEWAL_LIFECYCLE_CONFLICT',
        message: 'Renewal lifecycle is no longer ready for activation',
      });
    }
    if (
      command.effective_date !== this.nextDate(predecessor.end_date as string) ||
      successor.start_date !== command.effective_date
    ) {
      throw new ConflictException({
        code: 'RENEWAL_BOUNDARY_STALE',
        message: 'Renewal boundary no longer matches the linked terms',
      });
    }
    const occupancy = await client.query<{
      id: string;
      occupancy_status: string;
      room_id: string;
      resident_id: string;
    }>(`SELECT id,occupancy_status,room_id,resident_id FROM occupancies WHERE id=$1 FOR UPDATE`, [
      predecessor.occupancy_id,
    ]);
    const activeOccupancy = occupancy.rows[0];
    if (
      !activeOccupancy ||
      activeOccupancy.occupancy_status !== 'active' ||
      activeOccupancy.room_id !== predecessor.room_id ||
      activeOccupancy.resident_id !== predecessor.resident_id
    ) {
      throw new ConflictException({
        code: 'RENEWAL_OCCUPANCY_CONFLICT',
        message: 'Predecessor occupancy is not the active physical-stay authority',
      });
    }
    const room = await client.query<{ id: string; property_id: string; room_status: string }>(
      `SELECT id,property_id,room_status FROM rooms WHERE id=$1 FOR UPDATE`,
      [predecessor.room_id],
    );
    if (
      !room.rows[0] ||
      room.rows[0].property_id !== command.property_id ||
      room.rows[0].room_status !== 'occupied'
    ) {
      throw new ConflictException({
        code: 'RENEWAL_ROOM_CONFLICT',
        message: 'Renewal room is not continuously occupied by the predecessor',
      });
    }
    const competing = await client.query<{ id: string }>(
      `SELECT id FROM leases WHERE property_id=$1 AND lease_status='active' AND id<>$2 AND (resident_id=$3 OR room_id=$4) FOR UPDATE`,
      [command.property_id, predecessor.id, predecessor.resident_id, predecessor.room_id],
    );
    if (competing.rows[0])
      throw new ConflictException({
        code: 'RENEWAL_LIFECYCLE_CONFLICT',
        message: 'Another active lifecycle conflicts with this renewal',
      });
    await this.assertVerifiedInitialRentCredit(client, command, command.first_invoice_id);
    // Canonical occupancy authority: the predecessor occupancy is closed and a
    // new distinct successor occupancy is opened for the same resident and room
    // in this one transaction, following the W05/W07B lifecycle conventions.
    // The physical stay stays continuous through contiguous occupancy records;
    // the room is never toggled to vacant, so there is no observable gap. The
    // predecessor occupancy and lease are ended before the successor occupancy
    // and lease are activated so the one-active room/resident partial-unique
    // indexes on occupancies and leases hold at every step.
    const endedOccupancy = await client.query(
      `UPDATE occupancies
          SET occupancy_status='ended',end_date=$2::date,closed_by_user_id=$3,updated_at=now()
        WHERE id=$1 AND occupancy_status='active'`,
      [activeOccupancy.id, command.effective_date, command.activation_authorized_by_user_id],
    );
    if (endedOccupancy.rowCount !== 1)
      throw new ConflictException({
        code: 'RENEWAL_OCCUPANCY_CONFLICT',
        message: 'Predecessor occupancy could not be closed for renewal',
      });
    await client.query(
      `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
       VALUES($1,$2,$3,$4,'check_out','active','ended',$5::date,$6,$7::jsonb)`,
      [
        activeOccupancy.id,
        command.property_id,
        predecessor.room_id,
        predecessor.resident_id,
        command.effective_date,
        command.activation_authorized_by_user_id,
        JSON.stringify({ source: 'lease_renewal', renewal_command_id: command.id }),
      ],
    );
    const ended = await client.query(
      `UPDATE leases
          SET lease_status='ended',closed_at=now(),closed_by_user_id=$2,close_reason='renewed',updated_at=now(),updated_by_user_id=$2
        WHERE id=$1 AND lease_status='active'`,
      [predecessor.id, command.activation_authorized_by_user_id],
    );
    if (ended.rowCount !== 1)
      throw new ConflictException({
        code: 'RENEWAL_LIFECYCLE_CONFLICT',
        message: 'Predecessor could not be ended for renewal',
      });
    const successorOccupancy = await client.query<{ id: string }>(
      `INSERT INTO occupancies(property_id,room_id,resident_id,start_date,occupancy_status,created_by_user_id)
       VALUES($1,$2,$3,$4::date,'active',$5) RETURNING id`,
      [
        command.property_id,
        predecessor.room_id,
        predecessor.resident_id,
        successor.start_date,
        command.activation_authorized_by_user_id,
      ],
    );
    if (successorOccupancy.rowCount !== 1 || !successorOccupancy.rows[0])
      throw new ConflictException({
        code: 'RENEWAL_OCCUPANCY_CONFLICT',
        message: 'Successor occupancy could not be opened for renewal',
      });
    const successorOccupancyId = successorOccupancy.rows[0].id;
    await client.query(
      `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
       VALUES($1,$2,$3,$4,'check_in',NULL,'active',$5::date,$6,$7::jsonb)`,
      [
        successorOccupancyId,
        command.property_id,
        predecessor.room_id,
        predecessor.resident_id,
        successor.start_date,
        command.activation_authorized_by_user_id,
        JSON.stringify({
          source: 'lease_renewal',
          renewal_command_id: command.id,
          predecessor_occupancy_id: activeOccupancy.id,
        }),
      ],
    );
    const activated = await client.query(
      `UPDATE leases
          SET lease_status='active',occupancy_id=$2,activated_at=now(),updated_at=now(),updated_by_user_id=$3
        WHERE id=$1 AND lease_status='awaiting_activation'`,
      [successor.id, successorOccupancyId, command.activation_authorized_by_user_id],
    );
    if (activated.rowCount !== 1)
      throw new ConflictException({
        code: 'RENEWAL_LIFECYCLE_CONFLICT',
        message: 'Successor could not be activated for renewal',
      });
    const settlementAuthority = await client.query<{
      id: string;
      policy_snapshot_id: string | null;
      final_checkpoint_due_at: Date | null;
    }>(
      `SELECT settlement.id,
              settlement.policy_snapshot_id,
              final_checkpoint.due_at AS final_checkpoint_due_at
         FROM lease_contract_settlements settlement
         LEFT JOIN lease_settlement_checkpoints final_checkpoint
           ON final_checkpoint.property_id=settlement.property_id
          AND final_checkpoint.lease_id=settlement.lease_id
          AND final_checkpoint.policy_snapshot_id=settlement.policy_snapshot_id
          AND final_checkpoint.checkpoint_code='final_settlement'
        WHERE settlement.property_id=$1
          AND settlement.lease_id=$2
          AND settlement.invoice_id=$3
          AND settlement.state='awaiting_activation'
        FOR UPDATE OF settlement`,
      [command.property_id, successor.id, command.first_invoice_id],
    );
    if (settlementAuthority.rowCount !== 1 || !settlementAuthority.rows[0])
      throw new ConflictException({
        code: 'RENEWAL_CONTRACT_SETTLEMENT_NOT_READY',
        message: 'Successor contract settlement is not awaiting activation',
      });
    const settlementAuthorityRow = settlementAuthority.rows[0];
    if (
      settlementAuthorityRow.policy_snapshot_id &&
      !settlementAuthorityRow.final_checkpoint_due_at
    )
      throw new ConflictException({
        code: 'RENEWAL_CONTRACT_SETTLEMENT_POLICY_INCOMPLETE',
        message: 'Successor contract settlement final checkpoint is missing',
      });
    const settlement = settlementAuthorityRow.policy_snapshot_id
      ? await client.query(
          `UPDATE lease_contract_settlements
              SET state='open',activated_at=now(),original_due_at=$2,updated_at=now()
            WHERE id=$1 AND state='awaiting_activation'`,
          [settlementAuthorityRow.id, settlementAuthorityRow.final_checkpoint_due_at],
        )
      : await client.query(
          `WITH activation AS (SELECT now() AS activated_at)
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
              AND settlement.state='awaiting_activation'`,
          [settlementAuthorityRow.id],
        );
    if (settlement.rowCount !== 1)
      throw new ConflictException({
        code: 'RENEWAL_CONTRACT_SETTLEMENT_NOT_READY',
        message: 'Successor contract settlement is not awaiting activation',
      });
    await this.insertHistory(
      client,
      command.property_id,
      predecessor.id,
      'renewed_out',
      command.activation_authorized_by_user_id,
      today,
      { renewal_command_id: command.id, successor_lease_id: successor.id, late_execution: late },
    );
    await this.insertHistory(
      client,
      command.property_id,
      successor.id,
      'renewed_in',
      command.activation_authorized_by_user_id,
      today,
      {
        renewal_command_id: command.id,
        predecessor_lease_id: predecessor.id,
        predecessor_occupancy_id: activeOccupancy.id,
        occupancy_id: successorOccupancyId,
        late_execution: late,
      },
    );
    const updated = await client.query<RenewalCommandRow>(
      `UPDATE lease_renewal_commands
          SET state='activated',activated_by_user_id=$2,activated_at=now(),updated_at=now()
        WHERE id=$1 AND state='approved' AND activation_authorized_at IS NOT NULL
        RETURNING ${this.commandColumns()}`,
      [command.id, command.activation_authorized_by_user_id],
    );
    if (!updated.rows[0])
      throw new ConflictException({
        code: 'RENEWAL_ACTIVATION_NOT_AUTHORIZED',
        message: 'Renewal activation authorization is unavailable',
      });
    await this.writeAudit(
      client,
      command.activation_authorized_by_user_id as string,
      command.property_id,
      'lease.renewal.activate',
      'lease_renewal_command',
      command.id,
      { state: 'approved' },
      {
        state: 'activated',
        predecessor_lease_id: predecessor.id,
        successor_lease_id: successor.id,
        predecessor_occupancy_id: activeOccupancy.id,
        occupancy_id: successorOccupancyId,
        late_execution: late,
      },
      { correlationId: runId },
    );
    await this.writeOutbox(client, {
      propertyId: command.property_id,
      eventKey: `lease.renewal_activated:${command.id}`,
      eventType: 'lease.renewal_activated',
      aggregateType: 'lease_renewal_command',
      aggregateId: command.id,
      actorUserId: command.activation_authorized_by_user_id,
      correlationId: runId,
      payload: {
        renewal_command_id: command.id,
        predecessor_lease_id: predecessor.id,
        successor_lease_id: successor.id,
        predecessor_occupancy_id: activeOccupancy.id,
        occupancy_id: successorOccupancyId,
        effective_date: command.effective_date,
        late_execution: late,
      },
    });
  }

  private async assertVerifiedInitialRentCredit(
    client: PoolClient,
    command: RenewalCommandRow,
    invoiceId: string,
  ): Promise<void> {
    const credit = await client.query<{
      verified_credit: string;
      invoice_status: string | null;
      invoice_lease_id: string | null;
    }>(
      `SELECT
         COALESCE((
           SELECT sum(
             allocation.allocated_amount
             - COALESCE((
               SELECT sum(reversed.reversed_amount)
               FROM payment_reversal_allocations reversed
               WHERE reversed.original_allocation_id=allocation.id
             ),0)
           )
           FROM payment_allocations allocation
           JOIN payments payment ON payment.id=allocation.payment_id
           LEFT JOIN payment_reversals payment_reversal ON payment_reversal.payment_id=payment.id
           WHERE allocation.invoice_id=$1
             AND allocation.lease_id=$2
             AND payment.property_id=$3
             AND payment.lease_id=$2
             AND payment.payment_purpose IN ('dp','rent')
             AND payment.payment_status='verified'
             AND payment_reversal.id IS NULL
         ),0) AS verified_credit,
         (SELECT invoice_status FROM invoices WHERE id=$1 AND property_id=$3) AS invoice_status,
         (SELECT lease_id FROM invoices WHERE id=$1 AND property_id=$3) AS invoice_lease_id`,
      [invoiceId, command.successor_lease_id, command.property_id],
    );
    const row = credit.rows[0];
    if (
      !row ||
      row.invoice_lease_id !== command.successor_lease_id ||
      !['issued', 'partially_paid', 'paid', 'overdue'].includes(row.invoice_status ?? '') ||
      Number(row.verified_credit) <= 0
    ) {
      throw new ConflictException({
        code: 'RENEWAL_INITIAL_RENT_CREDIT_UNVERIFIED',
        message:
          'An issued successor first invoice needs an actual verified W06 rent credit allocation',
      });
    }
  }

  private async markCommandFailed(
    commandId: string,
    failureCode: string,
    error: unknown,
    runId: string,
    late: boolean,
  ): Promise<void> {
    try {
      await this.leases.transaction(async (client) => {
        const updated = await client.query<RenewalCommandRow>(
          `UPDATE lease_renewal_commands
             SET state='failed',failure_code=$2,failure_detail=$3::jsonb,updated_at=now()
           WHERE id=$1 AND state='approved'
           RETURNING ${this.commandColumns()}`,
          [
            commandId,
            failureCode,
            JSON.stringify({
              message: error instanceof Error ? error.message : String(error),
              run_id: runId,
              late_execution: late,
            }),
          ],
        );
        const command = updated.rows[0];
        if (!command) return;
        const today = await this.jakartaToday(client);
        await this.insertHistory(
          client,
          command.property_id,
          command.predecessor_lease_id,
          'renewal_failed',
          command.activation_authorized_by_user_id,
          today,
          { renewal_command_id: command.id, failure_code: failureCode, late_execution: late },
        );
        if (command.activation_authorized_by_user_id)
          await this.writeAudit(
            client,
            command.activation_authorized_by_user_id,
            command.property_id,
            'lease.renewal.failed',
            'lease_renewal_command',
            command.id,
            { state: 'approved' },
            { state: 'failed', failure_code: failureCode },
            { correlationId: runId },
          );
        await this.writeOutbox(client, {
          propertyId: command.property_id,
          eventKey: `lease.renewal_failed:${command.id}`,
          eventType: 'lease.renewal_failed',
          aggregateType: 'lease_renewal_command',
          aggregateId: command.id,
          actorUserId: command.activation_authorized_by_user_id,
          correlationId: runId,
          payload: {
            renewal_command_id: command.id,
            predecessor_lease_id: command.predecessor_lease_id,
            successor_lease_id: command.successor_lease_id,
            failure_code: failureCode,
            late_execution: late,
          },
        });
      });
    } catch {
      // Failure bookkeeping itself must not turn a retryable command into a
      // partial lifecycle mutation. A later scheduler run will re-evaluate it.
    }
  }

  private classifyTerminalFailure(error: unknown): string | null {
    if (error instanceof HttpException) return this.errorCode(error) ?? 'RENEWAL_EXECUTION_FAILED';
    const code = this.databaseErrorCode(error);
    return code?.startsWith('23') ? 'RENEWAL_CONSTRAINT_CONFLICT' : null;
  }

  private async executeCommand<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    status: number,
    operation: (client: PoolClient, today: string) => Promise<CommandOutput<T>>,
  ): Promise<IdempotentResult<T>> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.requestFingerprint({
      route,
      actor_id: user.id,
      property_id: propertyId,
      payload,
    });
    return this.leases.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        propertyId,
        user.id,
        route,
        key,
        fingerprint,
        context.correlationId,
      );
      if (replay)
        return { status: replay.status, body: replay.body as { data: T }, replayed: true };
      const result = await operation(client, await this.jakartaToday(client));
      const body = { data: result.data };
      await client.query(
        `UPDATE idempotency_commands
            SET command_status='succeeded',response_status=$2,response_body=$3::jsonb,
                resource_type=$4,resource_id=$5,completed_at=now()
          WHERE actor_user_id=$1 AND route=$6 AND idempotency_key=$7`,
        [user.id, status, JSON.stringify(body), result.resourceType, result.resourceId, route, key],
      );
      return { status, body, replayed: false };
    });
  }

  private async claimCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<{ status: number; body: { data: unknown } } | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,correlation_id)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING
       RETURNING request_fingerprint,command_status,response_status,response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint,command_status,response_status,response_body
       FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row || row.command_status === 'pending')
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    if (row.request_fingerprint !== fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    if (!row.response_status || !row.response_body || typeof row.response_body !== 'object')
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    return { status: row.response_status, body: row.response_body as { data: unknown } };
  }

  private async lookupLeaseScope(leaseId: string): Promise<{ property_id: string }> {
    const result = await this.leases.query<{ property_id: string }>(
      `SELECT property_id FROM leases WHERE id=$1`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }

  private async lockLease(client: PoolClient, leaseId: string): Promise<LeaseRow> {
    const result = await client.query<LeaseRow>(
      `SELECT id,property_id,lease_code,resident_id,room_id,occupancy_id,kost_type_id,lease_status,
              start_date::text,end_date::text,billing_cycle,billing_anchor_day,next_billing_date::text,
              snapshot_monthly_price,snapshot_yearly_price,snapshot_deposit_amount,snapshot_room_number,
              snapshot_kost_type_name,term_months,payment_plan_type,contract_rent_amount,dp_required_amount,
              security_deposit_required_amount,renewed_from_lease_id
       FROM leases WHERE id=$1 FOR UPDATE`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }

  private async lockCommercialRoom(
    client: PoolClient,
    roomId: string,
    effectiveDate: string,
  ): Promise<CommercialRoomRow> {
    const result = await client.query<CommercialRoomRow>(
      `SELECT r.id,r.property_id,r.number AS room_number,r.room_status,r.kost_type_id,
              kt.name AS kost_type_name,kt.status AS kost_type_status,kt.deleted_at::text AS kost_type_deleted_at,
              rb.building_code,kcv.monthly_price::text AS monthly_price,kcv.annual_contract_value::text AS yearly_price
       FROM rooms r
       JOIN room_buildings rb ON rb.id=r.building_id
       JOIN kost_types kt ON kt.id=r.kost_type_id
       JOIN LATERAL (
         SELECT monthly_price,annual_contract_value FROM kost_type_commercial_versions
          WHERE kost_type_id=kt.id AND effective_date<=$2::date
          ORDER BY effective_date DESC,id DESC LIMIT 1
       ) kcv ON true
       WHERE r.id=$1
       FOR UPDATE OF r,rb,kt`,
      [roomId, effectiveDate],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: 'RENEWAL_COMMERCIAL_AUTHORITY_MISSING',
        message: 'Renewal room commercial authority is unavailable',
      });
    return result.rows[0];
  }

  private async lockCommand(client: PoolClient, commandId: string): Promise<RenewalCommandRow> {
    const result = await client.query<RenewalCommandRow>(
      `SELECT ${this.commandColumns()} FROM lease_renewal_commands WHERE id=$1 FOR UPDATE`,
      [commandId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'RENEWAL_COMMAND_NOT_FOUND',
        message: 'Renewal command not found',
      });
    return result.rows[0];
  }

  private assertRenewablePredecessor(lease: LeaseRow, today: string): void {
    if (lease.lease_status !== 'active' || !lease.end_date || !lease.occupancy_id)
      throw new ConflictException({
        code: 'RENEWAL_PREDECESSOR_INVALID',
        message: 'Only an active, dated lease with active occupancy can renew',
      });
    if (lease.end_date < today)
      throw new ConflictException({
        code: 'RENEWAL_PREDECESSOR_EXPIRED',
        message: 'An already-ended renewal boundary requires reconciliation',
      });
  }

  private assertCommercialRoom(room: CommercialRoomRow, propertyId: string): void {
    if (
      room.property_id !== propertyId ||
      room.room_status !== 'occupied' ||
      !room.kost_type_id ||
      room.kost_type_status !== 'active' ||
      room.kost_type_deleted_at ||
      room.monthly_price === null ||
      room.yearly_price === null ||
      !room.kost_type_name
    ) {
      throw new ConflictException({
        code: 'RENEWAL_COMMERCIAL_AUTHORITY_MISSING',
        message: 'Renewal room commercial authority is not active',
      });
    }
  }

  private assertSuccessorTuple(
    predecessor: LeaseRow,
    successor: LeaseRow,
    command: RenewalCommandRow,
  ): void {
    if (
      successor.property_id !== predecessor.property_id ||
      successor.resident_id !== predecessor.resident_id ||
      successor.room_id !== predecessor.room_id ||
      successor.renewed_from_lease_id !== predecessor.id ||
      command.successor_lease_id !== successor.id ||
      command.resident_id !== predecessor.resident_id ||
      command.room_id !== predecessor.room_id
    ) {
      throw new ConflictException({
        code: 'RENEWAL_AUTHORITY_MISMATCH',
        message: 'Renewal predecessor/successor linkage requires reconciliation',
      });
    }
  }

  private assertCommandLeaseScope(
    command: RenewalCommandRow,
    leaseId: string,
    propertyId: string,
  ): void {
    if (command.predecessor_lease_id !== leaseId || command.property_id !== propertyId)
      throw new NotFoundException({
        code: 'RENEWAL_COMMAND_NOT_FOUND',
        message: 'Renewal command not found for this lease',
      });
  }

  private assertAdminLeaseActor(user: UserAccessContext, propertyId: string): void {
    this.assertPropertyScope(user, propertyId);
    if (!user.roles.includes('admin') || !user.permissions.includes('lease.manage'))
      throw new ForbiddenException({
        code: 'RENEWAL_ACTOR_INVALID',
        message: 'Only an Admin with lease.manage may manage renewals',
      });
  }

  private assertAdminFinancialActor(user: UserAccessContext, propertyId: string): void {
    this.assertAdminLeaseActor(user, propertyId);
    if (!user.permissions.includes('billing.manage'))
      throw new ForbiddenException({
        code: 'RENEWAL_FINANCIAL_ACTOR_INVALID',
        message:
          'Only an Admin with lease.manage and billing.manage may prepare or authorize renewal activation',
      });
  }

  private assertPropertyScope(user: UserAccessContext, propertyId: string): void {
    if (user.roles.includes('owner') || user.propertyIds.includes(propertyId)) return;
    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  private buildCommercialSnapshot(
    predecessor: LeaseRow,
    room: CommercialRoomRow,
    terms: {
      term_months: number;
      billing_cycle: BillingCycle;
      payment_plan_type: ContractPaymentPlan;
    },
  ): CommercialSnapshot {
    const monthly = Number(room.monthly_price);
    const yearly = Number(room.yearly_price);
    const rent =
      terms.billing_cycle === 'yearly'
        ? yearly * (terms.term_months / 12)
        : monthly * terms.term_months;
    if (!Number.isSafeInteger(rent) || rent < 0)
      throw new ConflictException({
        code: 'RENEWAL_COMMERCIAL_INVALID',
        message: 'Renewal commercial snapshot is invalid',
      });
    return {
      ...terms,
      contract_rent_amount: rent,
      dp_recommended_amount: Math.ceil(rent * 0.25),
      snapshot_monthly_price: monthly,
      snapshot_yearly_price: yearly,
      snapshot_deposit_amount: Number(predecessor.snapshot_deposit_amount),
      room_number: room.room_number,
      kost_type_id: room.kost_type_id as string,
      kost_type_name: room.kost_type_name as string,
      building_code: room.building_code,
      predecessor_end_date: predecessor.end_date as string,
    };
  }

  private requestedTerms(dto: CreateLeaseRenewalIntentDto): Record<string, unknown> {
    return { requested_at: 'H-60', note: dto.note?.trim() || null };
  }

  private approvedTerms(dto: ApproveLeaseRenewalDto): {
    term_months: number;
    billing_cycle: BillingCycle;
    payment_plan_type: ContractPaymentPlan;
  } {
    if (dto.billing_cycle === 'yearly' && dto.term_months % 12 !== 0)
      throw new UnprocessableEntityException({
        code: 'RENEWAL_YEARLY_TERM_INVALID',
        message: 'Yearly renewal terms must be exact 12-month multiples',
      });
    if (dto.payment_plan_type === 'two_month_installments' && dto.term_months % 2 !== 0)
      throw new UnprocessableEntityException({
        code: 'RENEWAL_PAYMENT_PLAN_INVALID',
        message: 'Two-month installments require an even term',
      });
    return {
      term_months: dto.term_months,
      billing_cycle: dto.billing_cycle,
      payment_plan_type: dto.payment_plan_type,
    };
  }

  private snapshot(command: RenewalCommandRow): CommercialSnapshot {
    const value = command.commercial_snapshot;
    if (
      !value ||
      typeof value !== 'object' ||
      !Number.isSafeInteger(value.term_months) ||
      !['monthly', 'yearly'].includes(String(value.billing_cycle)) ||
      !['annual_full', 'two_month_installments', 'monthly_installments'].includes(
        String(value.payment_plan_type),
      ) ||
      !Number.isSafeInteger(value.contract_rent_amount) ||
      !Number.isSafeInteger(value.snapshot_monthly_price) ||
      !Number.isSafeInteger(value.snapshot_yearly_price) ||
      typeof value.room_number !== 'string' ||
      typeof value.kost_type_name !== 'string'
    ) {
      throw new ConflictException({
        code: 'RENEWAL_COMMERCIAL_SNAPSHOT_INVALID',
        message: 'Approved renewal snapshot requires reconciliation',
      });
    }
    return value as unknown as CommercialSnapshot;
  }

  private commandColumns(): string {
    return `id,property_id,predecessor_lease_id,successor_lease_id,resident_id,room_id,effective_date::text,
            requested_terms,commercial_snapshot,state,approved_by_user_id,approved_at,
            financial_prepared_by_user_id,financial_prepared_at,first_invoice_id,
            activation_authorized_by_user_id,activation_authorized_at,activated_by_user_id,activated_at,
            cancelled_by_user_id,cancelled_at,cancel_reason,failure_code,created_by_user_id,created_at`;
  }

  private safeCommand(command: RenewalCommandRow): Record<string, unknown> {
    const snapshot = command.commercial_snapshot ?? {};
    return {
      id: command.id,
      predecessor_lease_id: command.predecessor_lease_id,
      successor_lease_id: command.successor_lease_id,
      effective_date: command.effective_date,
      state: command.state,
      term_months: snapshot.term_months ?? null,
      billing_cycle: snapshot.billing_cycle ?? null,
      payment_plan_type: snapshot.payment_plan_type ?? null,
      contract_rent_amount: snapshot.contract_rent_amount ?? null,
      dp_recommended_amount: snapshot.dp_recommended_amount ?? null,
      first_invoice_id: command.first_invoice_id,
      financial_prepared_at: command.financial_prepared_at,
      activation_authorized_at: command.activation_authorized_at,
      activated_at: command.activated_at,
      cancel_reason: command.cancel_reason,
      failure_code: command.failure_code,
      created_at: command.created_at,
    };
  }

  private async insertHistory(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    eventType: string,
    actorUserId: string | null,
    eventDate: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata) VALUES($1,$2,$3,$4,$5::date,$6::jsonb)`,
      [propertyId, leaseId, eventType, actorUserId, eventDate, JSON.stringify(metadata)],
    );
  }

  private async writeAudit(
    client: PoolClient,
    actorUserId: string,
    propertyId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>,
    context: LeaseAuditContext,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs(actor_user_id,property_id,action,resource_type,resource_id,before_data,after_data,result_status,ip_address,user_agent,correlation_id)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'success',$8::inet,$9,$10)`,
      [
        actorUserId,
        propertyId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(beforeData),
        JSON.stringify(afterData),
        context.ipAddress ?? null,
        context.userAgent ?? null,
        context.correlationId ?? null,
      ],
    );
  }

  private async writeOutbox(
    client: PoolClient,
    input: {
      propertyId: string;
      eventKey: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      actorUserId: string | null;
      correlationId?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.actorUserId,
      ],
    );
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    if (key.length < 16 || key.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    return key;
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }
  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${this.canonicalJson((value as Record<string, unknown>)[key])}`,
        )
        .join(',')}}`;
    return JSON.stringify(value);
  }
  private newLeaseCode(today: string): string {
    return `LS-${today.replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  }
  private async jakartaToday(client: PoolClient): Promise<string> {
    return (
      await client.query<{ today: string }>(
        `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
      )
    ).rows[0].today;
  }
  private nextDate(value: string): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  private addMonthsInclusive(start: string, months: number): string {
    const date = new Date(`${start}T00:00:00.000Z`);
    const day = date.getUTCDate();
    date.setUTCMonth(date.getUTCMonth() + months);
    if (date.getUTCDate() !== day) date.setUTCDate(0);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  private daysBetween(from: string, to: string): number {
    return Math.floor(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS,
    );
  }
  private errorCode(error: HttpException): string | null {
    const response = error.getResponse();
    const code =
      typeof response === 'object' && response !== null
        ? (response as { code?: unknown }).code
        : null;
    return typeof code === 'string' ? code : null;
  }
  private databaseErrorCode(error: unknown): string | null {
    return error instanceof Error &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  }
}
