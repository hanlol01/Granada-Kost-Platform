import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  createLeaseExitOfficialDocumentPdf,
  type LeaseExitOfficialDocumentKind,
  type LeaseExitOfficialDocumentSnapshot,
} from '../billing/helpers/billing-document.helper';
import { nextFinancialTransactionCode } from '../billing/helpers/financial-transaction-code.helper';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  CancelLeaseCheckoutDto,
  ApproveLeaseCheckoutDto,
  CompleteLeaseCheckoutDto,
  CreateLeaseCheckoutNoticeDto,
  RecordLeaseCheckoutHandoverDto,
  RecordLeaseCheckoutInspectionDto,
  SettleRefundDto,
  WaiveRefundDto,
} from './lease.dto';
import {
  buildLeaseExitFinancialQuote,
  buildLeaseExitNoticeQuote,
} from './helpers/lease-exit-policy.helper';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type { IdempotentResult, LeaseAuditContext } from './lease.types';

type CheckoutRow = {
  id: string;
  property_id: string;
  lease_id: string;
  occupancy_id: string;
  resident_id: string;
  room_id: string;
  state: string;
  effective_date: string;
  notice_recorded_date: string;
  notice_reason: string;
  notice_exception_reason: string | null;
  exit_type: 'resident_early_termination' | 'normal_expiry' | null;
  request_source: string | null;
  notice_days: number | null;
  missing_notice_days: number | null;
  payment_period_days: number | null;
  daily_rate_amount: string | null;
  recommended_short_notice_charge: string | null;
  approved_short_notice_charge: string | null;
  short_notice_waiver_reason: string | null;
  approved_at: Date | null;
  physical_checkout_confirmed_at: Date | null;
  actual_checkout_date: string | null;
  inspection_room_status?: 'inspection_required' | 'maintenance' | null;
  final_settlement_id?: string | null;
  recommended_refund_amount?: string | null;
  final_refund_amount?: string | null;
  final_rent_refund_amount?: string | null;
  final_deposit_refund_amount?: string | null;
  refund_adjustment_amount?: string | null;
  amount_due?: string | null;
  settlement_decision_status?: string | null;
  exit_refund_id?: string | null;
  exit_refund_amount?: string | null;
  exit_refund_status?: string | null;
  exit_refund_due_date?: string | null;
  documents?: Array<{
    id: string;
    document_code: string;
    document_kind: LeaseExitOfficialDocumentKind;
    issued_at: string;
  }>;
};
type LeaseRow = {
  id: string;
  property_id: string;
  occupancy_id: string;
  resident_id: string;
  room_id: string;
  lease_status: string;
  start_date: string;
  end_date: string;
  snapshot_monthly_price: string;
  contract_rent_amount: string;
};
type InvoiceRow = {
  id: string;
  total_amount: string;
  credit_amount: string;
  net_allocated: string;
};
type LedgerRow = { direction: 'credit' | 'debit'; amount: string };
type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_status: number | null;
  response_body: unknown;
};

type ExitDocumentContextRow = {
  issued_at: Date;
  property_name: string;
  property_address: string | null;
  resident_name: string;
  room_number: string;
  building_code: string;
  category_name: string;
  room_checkout_result: string;
  lease_start_date: string;
  lease_planned_end_date: string;
  contract_rent_amount: string;
  monthly_rate_amount: string;
  policy_version: string | null;
  exit_type: 'resident_early_termination' | 'normal_expiry';
  actual_checkout_date: string;
  checkout_confirmed_by: string;
  checkout_confirmed_at: Date;
  inspection_recorded_by: string;
  inspection_recorded_at: Date;
  notice_recorded_date: string;
  effective_date: string;
  notice_days: number;
  missing_notice_days: number;
  notice_reason: string;
  approved_short_notice_charge: string;
  short_notice_waiver_reason: string | null;
  verified_rent_payment_amount: string;
  existing_invoice_credit_amount: string;
  recognized_rent_credit_amount: string;
  earned_rent_amount: string;
  unearned_invoice_credit_amount: string;
  contract_outstanding_amount: string;
  rent_refundable_amount: string;
  rent_amount_due_before_deposit_offset: string;
  deposit_liability_amount: string;
  deposit_deduction_amount: string;
  deposit_rent_offset_amount: string;
  refundable_deposit_amount: string;
  recommended_refund_amount: string;
  final_refund_amount: string;
  final_rent_refund_amount: string;
  final_deposit_refund_amount: string;
  refund_adjustment_amount: string;
  refund_adjustment_reason: string | null;
  amount_due: string;
  decision_status: string;
  refund_status: string | null;
  refund_due_date: string | null;
  refund_payment_method: string | null;
  refund_external_reference: string | null;
  refund_transaction_code: string | null;
  refund_settled_at: Date | null;
};

type ExitDocumentPaymentRow = {
  payment_code: string;
  payment_purpose: string;
  amount: string;
  paid_at: Date | null;
  payment_method: string;
  payment_status: string;
  receipt_code: string | null;
};

type ExitDocumentDamageRow = { reason: string; amount: string };

type ExitDocumentRecord = {
  id: string;
  document_code: string;
  document_kind: LeaseExitOfficialDocumentKind;
  issued_at: Date;
};

/** W07D sole general-checkout authority. W07A termination remains separate. */
@Injectable()
export class LeaseCheckoutService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly w06Billing: W06BillingService,
  ) {}

  async list(user: UserAccessContext, leaseId: string) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    const result = await this.leases.query<CheckoutRow>(
      `SELECT command.id,command.property_id,command.lease_id,command.occupancy_id,command.resident_id,
              command.room_id,command.state,command.effective_date::text,command.notice_recorded_date::text,
              command.notice_reason,command.notice_exception_reason,command.exit_type,command.request_source,
              command.notice_days,command.missing_notice_days,command.payment_period_days,
              command.daily_rate_amount,command.recommended_short_notice_charge,
              command.approved_short_notice_charge,command.short_notice_waiver_reason,command.approved_at,
              command.physical_checkout_confirmed_at,command.actual_checkout_date::text,
              command.inspection_room_status,
              settlement.id AS final_settlement_id,
              settlement.recommended_refund_amount,settlement.final_refund_amount,
              settlement.final_rent_refund_amount,settlement.final_deposit_refund_amount,
              settlement.refund_adjustment_amount,settlement.amount_due,
              settlement.decision_status AS settlement_decision_status,
              refund.id AS exit_refund_id,refund.amount AS exit_refund_amount,
              refund.refund_status AS exit_refund_status,refund.refund_due_date::text AS exit_refund_due_date,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id',document.id,'document_code',document.document_code,
                  'document_kind',document.document_kind,'issued_at',document.issued_at
                ) ORDER BY document.issued_at,document.id)
                FROM lease_exit_documents document
                WHERE document.checkout_command_id=command.id
                  AND document.property_id=command.property_id
              ),'[]'::jsonb) AS documents
       FROM lease_checkout_commands command
       LEFT JOIN lease_exit_final_settlements settlement ON settlement.checkout_command_id=command.id
       LEFT JOIN lease_exit_refunds refund ON refund.final_settlement_id=settlement.id
       WHERE command.lease_id=$1 ORDER BY command.created_at DESC`,
      [leaseId],
    );
    return { data: { commands: result.rows } };
  }

  async documentFile(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    documentId: string,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    const result = await this.leases.query<{
      document_code: string;
      document_content: Buffer;
    }>(
      `SELECT document.document_code,document.document_content
       FROM lease_exit_documents document
       WHERE document.id=$1 AND document.property_id=$2
         AND document.lease_id=$3 AND document.checkout_command_id=$4`,
      [documentId, scope.property_id, leaseId, commandId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'LEASE_EXIT_DOCUMENT_NOT_FOUND',
        message: 'Lease exit document not found',
      });
    return {
      filename: `${row.document_code.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}.pdf`,
      content: row.document_content,
    };
  }

  async myDocumentFile(user: UserAccessContext, documentId: string) {
    const result = await this.leases.query<{
      document_code: string;
      document_content: Buffer;
    }>(
      `SELECT document.document_code,document.document_content
       FROM lease_exit_documents document
       JOIN residents resident
         ON resident.id=document.resident_id AND resident.property_id=document.property_id
       WHERE document.id=$1 AND resident.user_id=$2`,
      [documentId, user.id],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'LEASE_EXIT_DOCUMENT_NOT_FOUND',
        message: 'Lease exit document not found',
      });
    return {
      filename: `${row.document_code.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}.pdf`,
      content: row.document_content,
    };
  }

  async notice(
    user: UserAccessContext,
    leaseId: string,
    dto: CreateLeaseCheckoutNoticeDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout`,
      key,
      dto,
      context,
      201,
      async (client, today) => {
        const lease = await this.lockLease(client, leaseId);
        this.assertActive(lease);
        if (dto.effective_date < today)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_EFFECTIVE_DATE_PAST',
            message: 'Checkout effective date cannot be in the past',
          });
        const exceptionReason = dto.notice_exception_reason?.trim() || null;
        let quote;
        try {
          quote = buildLeaseExitNoticeQuote({
            exitType: dto.exit_type,
            leaseStartDate: lease.start_date,
            plannedEndDate: lease.end_date,
            noticeDate: today,
            effectiveDate: dto.effective_date,
            monthlyRateAmount: Number(lease.snapshot_monthly_price),
          });
        } catch (error) {
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_EXIT_POLICY_INVALID',
            message: error instanceof Error ? error.message : 'Checkout exit policy is invalid',
          });
        }
        const requestSource =
          dto.exit_type === 'normal_expiry'
            ? 'admin_recorded_normal_expiry'
            : 'admin_recorded_resident_request';
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM lease_checkout_commands WHERE lease_id=$1 AND state IN ('notice_received','scheduled','inspection_required','settlement_pending') FOR UPDATE`,
          [lease.id],
        );
        if (existing.rows[0])
          throw new ConflictException({
            code: 'CHECKOUT_ALREADY_OPEN',
            message: 'Lease already has a non-terminal checkout command',
          });
        const inserted = await client.query<CheckoutRow>(
          `INSERT INTO lease_checkout_commands(
             property_id,lease_id,occupancy_id,resident_id,room_id,effective_date,notice_recorded_date,notice_reason,notice_exception_reason,created_by_user_id,
             exit_type,request_source,requested_by_user_id,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
             planned_lease_end_date
           )
         VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,$11,$12,$10,$13,$14,$15,$16,$17,$18::date)
         ON CONFLICT DO NOTHING
          RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                    exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                    approved_short_notice_charge,short_notice_waiver_reason,approved_at,
                    physical_checkout_confirmed_at,actual_checkout_date::text`,
          [
            scope.property_id,
            lease.id,
            lease.occupancy_id,
            lease.resident_id,
            lease.room_id,
            dto.effective_date,
            today,
            dto.reason.trim(),
            exceptionReason,
            user.id,
            dto.exit_type,
            requestSource,
            quote.noticeDays,
            quote.missingNoticeDays,
            quote.paymentPeriodDays,
            quote.dailyRateAmount,
            quote.recommendedShortNoticeCharge,
            lease.end_date,
          ],
        );
        const checkout = inserted.rows[0];
        if (!checkout)
          throw new ConflictException({
            code: 'CHECKOUT_ALREADY_OPEN',
            message: 'Lease already has a non-terminal checkout command',
          });
        await this.history(
          client,
          scope.property_id,
          lease.id,
          'checkout_notice_received',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            reason: dto.reason.trim(),
            notice_exception: Boolean(exceptionReason),
            exit_type: dto.exit_type,
            notice_days: quote.noticeDays,
            recommended_short_notice_charge: quote.recommendedShortNoticeCharge,
          },
        );
        await this.audit(
          client,
          user.id,
          scope.property_id,
          'lease.checkout.notice',
          'lease_checkout_command',
          checkout.id,
          undefined,
          { state: checkout.state, effective_date: dto.effective_date },
          context,
        );
        await this.outbox(
          client,
          scope.property_id,
          `lease.checkout_notice:${checkout.id}`,
          'lease.checkout.notice_recorded',
          'lease_checkout_command',
          checkout.id,
          user.id,
          context,
          {
            checkout_command_id: checkout.id,
            lease_id: lease.id,
            effective_date: dto.effective_date,
            exit_type: dto.exit_type,
            recommended_short_notice_charge: quote.recommendedShortNoticeCharge,
          },
        );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: checkout.id,
          data: { checkout },
        };
      },
    );
  }

  async schedule(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: ApproveLeaseCheckoutDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'schedule',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'notice_received');
        const recommended = Number(checkout.recommended_short_notice_charge ?? 0);
        if (dto.approved_short_notice_charge > recommended)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_SHORT_NOTICE_CHARGE_EXCEEDS_RECOMMENDATION',
            message: 'Approved short-notice charge cannot exceed the server recommendation',
          });
        const waiverReason = dto.short_notice_waiver_reason?.trim() || null;
        if (
          dto.approved_short_notice_charge < recommended &&
          (!waiverReason || waiverReason.length < 3)
        )
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_SHORT_NOTICE_WAIVER_REASON_REQUIRED',
            message: 'Reducing the recommended short-notice charge requires a waiver reason',
          });
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands
           SET state='scheduled',scheduled_by_user_id=$2,scheduled_at=now(),approved_by_user_id=$2,approved_at=now(),
               approved_short_notice_charge=$3,short_notice_waiver_reason=$4,updated_at=now()
           WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                   exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                   approved_short_notice_charge,short_notice_waiver_reason,approved_at,
                   physical_checkout_confirmed_at,actual_checkout_date::text`,
          [checkout.id, user.id, dto.approved_short_notice_charge, waiverReason],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_scheduled',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            exit_type: checkout.exit_type,
            approved_short_notice_charge: dto.approved_short_notice_charge,
            short_notice_waived: dto.approved_short_notice_charge < recommended,
          },
        );
        return updated.rows[0];
      },
    );
  }

  async handover(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: RecordLeaseCheckoutHandoverDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'handover',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'scheduled');
        this.assertHandoverConfirmations(dto);
        this.assertHandoverDetails(dto);
        if (checkout.exit_type) {
          if (!checkout.approved_at)
            throw new ConflictException({
              code: 'CHECKOUT_APPROVAL_REQUIRED',
              message: 'Checkout requires explicit Admin approval before physical handover',
            });
          if (today < checkout.effective_date)
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_EFFECTIVE_DATE_NOT_REACHED',
              message: 'Physical checkout cannot be confirmed before its effective date',
            });
          const lease = await this.lockLease(client, checkout.lease_id);
          this.assertActive(lease);
          this.assertCheckoutTuple(checkout, lease);
          await this.lockOccupancyAndRoom(client, checkout);
          await this.lockResidentParking(client, checkout.property_id, checkout.resident_id);
        }
        await this.insertEvidence(
          client,
          checkout,
          'keys_access',
          dto.key_access_file_ids,
          user.id,
          {
            confirmed: true,
            items: dto.key_access_items ?? [],
            notes: dto.notes?.trim() || null,
          },
        );
        await this.insertEvidence(client, checkout, 'inventory', dto.inventory_file_ids, user.id, {
          confirmed: true,
          items: dto.inventory_items ?? [],
          notes: dto.notes?.trim() || null,
        });
        await this.insertEvidence(client, checkout, 'parking', dto.parking_file_ids, user.id, {
          confirmed: true,
          notes: dto.notes?.trim() || null,
        });
        await this.insertEvidence(client, checkout, 'utilities', undefined, user.id, {
          readings: dto.utility_readings ?? [],
          notes: dto.notes?.trim() || null,
        });
        if (checkout.exit_type) {
          await this.releaseResidentParking(client, checkout, user.id);
          const endedOccupancy = await client.query(
            `UPDATE occupancies SET occupancy_status='ended',end_date=$2::date,closed_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND property_id=$4 AND occupancy_status='active'`,
            [checkout.occupancy_id, today, user.id, checkout.property_id],
          );
          if (endedOccupancy.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_OCCUPANCY_CONFLICT',
              message: 'Active occupancy cannot be closed',
            });
          await client.query(
            `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
             VALUES($1,$2,$3,$4,'check_out','active','ended',$5::date,$6,$7::jsonb)`,
            [
              checkout.occupancy_id,
              checkout.property_id,
              checkout.room_id,
              checkout.resident_id,
              today,
              user.id,
              JSON.stringify({
                source: 'lease_checkout',
                checkout_command_id: checkout.id,
                exit_type: checkout.exit_type,
              }),
            ],
          );
          const endedLease = await client.query(
            `UPDATE leases SET lease_status='ended',end_date=$2::date,closed_at=now(),closed_by_user_id=$3,
                    close_reason=$4,updated_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND property_id=$5 AND lease_status='active'`,
            [checkout.lease_id, today, user.id, checkout.exit_type, checkout.property_id],
          );
          if (endedLease.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_LEASE_CONFLICT',
              message: 'Active lease cannot be closed',
            });
          const roomUpdated = await client.query(
            `UPDATE rooms SET room_status='inspection_required',updated_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND property_id=$2 AND room_status='occupied'`,
            [checkout.room_id, checkout.property_id, user.id],
          );
          if (roomUpdated.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_ROOM_CONFLICT',
              message: 'Room could not enter inspection-required state',
            });
          await this.outbox(
            client,
            checkout.property_id,
            `lease.checkout_access_reconcile:${checkout.id}`,
            'lease.checkout.access_reconciliation_requested',
            'lease_checkout_command',
            checkout.id,
            user.id,
            context,
            {
              checkout_command_id: checkout.id,
              resident_id: checkout.resident_id,
              room_id: checkout.room_id,
            },
          );
        }
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands
           SET state='inspection_required',handover_recorded_by_user_id=$2,handover_recorded_at=now(),
               physical_checkout_confirmed_by_user_id=CASE WHEN exit_type IS NOT NULL THEN $2 ELSE physical_checkout_confirmed_by_user_id END,
               physical_checkout_confirmed_at=CASE WHEN exit_type IS NOT NULL THEN now() ELSE physical_checkout_confirmed_at END,
               actual_checkout_date=CASE WHEN exit_type IS NOT NULL THEN $3::date ELSE actual_checkout_date END,
               updated_at=now()
           WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                   exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                   approved_short_notice_charge,short_notice_waiver_reason,approved_at,physical_checkout_confirmed_at,actual_checkout_date::text`,
          [checkout.id, user.id, today],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_handover_recorded',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            physical_checkout_confirmed: Boolean(checkout.exit_type),
            exit_type: checkout.exit_type,
          },
        );
        return updated.rows[0];
      },
    );
  }

  async inspection(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: RecordLeaseCheckoutInspectionDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'inspection',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'inspection_required');
        if (checkout.exit_type && !checkout.physical_checkout_confirmed_at)
          throw new ConflictException({
            code: 'CHECKOUT_PHYSICAL_CONFIRMATION_REQUIRED',
            message: 'Room inspection requires confirmed physical checkout',
          });
        await this.insertEvidence(
          client,
          checkout,
          'inspection',
          dto.inspection_file_ids,
          user.id,
          { notes_present: Boolean(dto.notes) },
        );
        if (checkout.exit_type) {
          const roomUpdated = await client.query(
            `UPDATE rooms SET room_status=$2,updated_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND property_id=$4 AND room_status IN ('inspection_required','maintenance')`,
            [checkout.room_id, dto.room_status_after, user.id, checkout.property_id],
          );
          if (roomUpdated.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_ROOM_CONFLICT',
              message: 'Room inspection result could not be recorded',
            });
        }
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='settlement_pending',inspection_room_status=$2,inspection_recorded_by_user_id=$3,inspection_recorded_at=now(),updated_at=now() WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                   exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                   approved_short_notice_charge,short_notice_waiver_reason,approved_at,physical_checkout_confirmed_at,actual_checkout_date::text`,
          [checkout.id, dto.room_status_after, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_inspection_recorded',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  async complete(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CompleteLeaseCheckoutDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout/${commandId}/complete`,
      key,
      dto,
      context,
      200,
      async (client, today) => {
        await this.lockProperty(client, scope.property_id);
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        this.requireState(checkout, 'settlement_pending');
        if (today < checkout.effective_date)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_EFFECTIVE_DATE_NOT_REACHED',
            message: 'Checkout cannot complete before its effective date',
          });
        const inspectionResult = await client.query<{ inspection_room_status: string }>(
          `SELECT inspection_room_status FROM lease_checkout_commands WHERE id=$1 FOR UPDATE`,
          [checkout.id],
        );
        if (inspectionResult.rows[0]?.inspection_room_status !== dto.room_status_after)
          throw new ConflictException({
            code: 'CHECKOUT_INSPECTION_RESULT_CONFLICT',
            message: 'Completion room result must match the recorded inspection result',
          });
        const lease = await this.lockLease(client, leaseId);
        this.assertCheckoutTuple(checkout, lease);
        if (checkout.exit_type) {
          if (!checkout.physical_checkout_confirmed_at || lease.lease_status !== 'ended')
            throw new ConflictException({
              code: 'CHECKOUT_PHYSICAL_CONFIRMATION_REQUIRED',
              message: 'Final settlement requires a completed physical checkout',
            });
          await this.lockEndedOccupancyAndRoom(client, checkout);
        } else {
          this.assertActive(lease);
          await this.lockOccupancyAndRoom(client, checkout);
        }
        await this.assertEvidenceComplete(client, checkout);
        const invoices = await this.lockInvoices(client, lease.id);
        const balance = await this.lockDepositBalance(client, lease.id);
        if (!checkout.exit_type)
          await this.lockResidentParking(client, checkout.property_id, checkout.resident_id);
        let credited = 0;
        let unearnedInvoiceCredit = 0;
        if (!checkout.exit_type) {
          const invoiceCredits = await this.applyInvoiceCredits(
            client,
            checkout,
            invoices,
            balance,
            user.id,
          );
          credited = invoiceCredits.reduce((sum, row) => sum + row.amount, 0);
        }
        const damage = dto.damage_deductions ?? [];
        const damageTotal = damage.reduce((sum, row) => sum + row.amount, 0);
        if (damageTotal > balance - credited)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_DEPOSIT_EXCEEDED',
            message: 'Damage deductions exceed remaining deposit balance',
          });
        for (const deduction of damage) {
          await this.assertFiles(client, checkout.property_id, [deduction.evidence_file_id]);
          const entry = await client.query<{ id: string }>(
            `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id)
           VALUES($1,$2,'deduction','debit',$3,'checkout_damage',$4,$5,'settled',now(),$6,$7::jsonb,$6) RETURNING id`,
            [
              checkout.property_id,
              lease.id,
              deduction.amount,
              deduction.reason.trim(),
              deduction.evidence_file_id,
              user.id,
              JSON.stringify({ checkout_command_id: checkout.id }),
            ],
          );
          await this.insertEvidence(
            client,
            checkout,
            'damage',
            [deduction.evidence_file_id],
            user.id,
            { deposit_transaction_id: entry.rows[0].id, amount: deduction.amount },
          );
        }
        let refundAmount = balance - credited - damageTotal;
        let refundId: string | null = null;
        let refundDueDate: string | null = null;
        let finalSettlementId: string | null = null;
        let finalDepositRefundAmount = 0;
        let finalRentRefundAmount = 0;
        let amountDue = 0;
        let issuedDocuments: ExitDocumentRecord[] = [];
        if (checkout.exit_type) {
          const depositOffset = dto.deposit_rent_offset_amount ?? 0;
          const offsetReason = dto.deposit_rent_offset_reason?.trim() || null;
          const offsetEvidence = dto.deposit_rent_offset_evidence_file_id ?? null;
          if (depositOffset > 0 && (!offsetReason || !offsetEvidence))
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_DEPOSIT_OFFSET_EVIDENCE_REQUIRED',
              message: 'A deposit-to-rent offset requires a reason and evidence',
            });
          if (offsetEvidence)
            await this.assertFiles(client, checkout.property_id, [offsetEvidence]);
          const quote = this.buildFinalSettlementQuote(
            checkout,
            lease,
            invoices,
            balance,
            damageTotal,
            depositOffset,
            checkout.actual_checkout_date ?? today,
          );
          unearnedInvoiceCredit = await this.applyUnearnedRentCredits(
            client,
            checkout,
            invoices,
            quote.earnedRentAmountDueBeforeDepositOffset,
            user.id,
          );
          if (depositOffset > 0) {
            const offsetCredits = await this.applyInvoiceCredits(
              client,
              checkout,
              invoices,
              depositOffset,
              user.id,
              {
                reason: offsetReason!,
                evidenceFileId: offsetEvidence!,
              },
            );
            credited = offsetCredits.reduce((sum, row) => sum + row.amount, 0);
            const standaloneOffset = depositOffset - credited;
            if (standaloneOffset > 0)
              await client.query(
                `INSERT INTO lease_deposit_transactions(
                   property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,
                   settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
                 ) VALUES($1,$2,'deduction','debit',$3,'checkout_final_settlement_offset',$4,$5,
                          'settled',now(),$6,$7::jsonb,$6)`,
                [
                  checkout.property_id,
                  lease.id,
                  standaloneOffset,
                  offsetReason,
                  offsetEvidence,
                  user.id,
                  JSON.stringify({ checkout_command_id: checkout.id }),
                ],
              );
            await this.insertEvidence(
              client,
              checkout,
              'deposit_offset',
              [offsetEvidence!],
              user.id,
              {
                amount: depositOffset,
                invoice_credit_amount: credited,
                final_settlement_offset_amount: standaloneOffset,
                reason: offsetReason,
              },
            );
          }
          const finalRefund = dto.final_refund_amount ?? quote.recommendedRefundAmount;
          const adjustmentReason = dto.refund_adjustment_reason?.trim() || null;
          const adjustmentEvidence = dto.refund_adjustment_evidence_file_id ?? null;
          if (!Number.isSafeInteger(finalRefund) || finalRefund < 0)
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_FINAL_REFUND_INVALID',
              message: 'Final refund must be a non-negative safe integer',
            });
          if (finalRefund > quote.recommendedRefundAmount)
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_REFUND_EXCEEDS_RECOMMENDATION',
              message: 'Final refund cannot exceed the server recommendation',
            });
          if (
            finalRefund !== quote.recommendedRefundAmount &&
            (!adjustmentReason || !adjustmentEvidence)
          )
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_REFUND_ADJUSTMENT_AUTHORITY_REQUIRED',
              message: 'Changing the recommended refund requires a reason and evidence',
            });
          if (adjustmentEvidence)
            await this.assertFiles(client, checkout.property_id, [adjustmentEvidence]);
          refundAmount = finalRefund;
          finalDepositRefundAmount = Math.min(finalRefund, quote.refundableDepositAmount);
          finalRentRefundAmount = finalRefund - finalDepositRefundAmount;
          const refundAdjustmentAmount = quote.recommendedRefundAmount - finalRefund;
          amountDue = quote.amountDue;
          const decisionStatus =
            finalRefund > 0 ? 'refund_pending' : amountDue > 0 ? 'amount_due' : 'closed';
          const settlement = await client.query<{ id: string }>(
            `INSERT INTO lease_exit_final_settlements(
               property_id,checkout_command_id,lease_id,resident_id,room_id,exit_type,actual_checkout_date,
               contract_rent_amount,verified_rent_payment_amount,existing_invoice_credit_amount,
               recognized_rent_credit_amount,earned_rent_amount,earned_rent_amount_due_before_deposit_offset,
               contract_outstanding_amount,
               approved_short_notice_charge,rent_refundable_amount,rent_amount_due_before_deposit_offset,
               deposit_liability_amount,deposit_deduction_amount,deposit_rent_offset_amount,refundable_deposit_amount,
               recommended_refund_amount,final_refund_amount,final_rent_refund_amount,final_deposit_refund_amount,
               refund_adjustment_amount,refund_adjustment_reason,refund_adjustment_evidence_file_id,
               amount_due,decision_status,approved_by_user_id
             ) VALUES($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
             RETURNING id`,
            [
              checkout.property_id,
              checkout.id,
              checkout.lease_id,
              checkout.resident_id,
              checkout.room_id,
              checkout.exit_type,
              checkout.actual_checkout_date ?? today,
              quote.contractRentAmount,
              quote.verifiedRentPaymentAmount,
              quote.existingInvoiceCreditAmount,
              quote.recognizedRentCreditAmount,
              quote.earnedRentAmount,
              quote.earnedRentAmountDueBeforeDepositOffset,
              quote.contractOutstandingAmount,
              quote.approvedShortNoticeCharge,
              quote.rentRefundableAmount,
              quote.rentAmountDueBeforeDepositOffset,
              quote.depositLiabilityAmount,
              quote.depositDeductionAmount,
              quote.depositRentOffsetAmount,
              quote.refundableDepositAmount,
              quote.recommendedRefundAmount,
              finalRefund,
              finalRentRefundAmount,
              finalDepositRefundAmount,
              refundAdjustmentAmount,
              adjustmentReason,
              adjustmentEvidence,
              quote.amountDue,
              decisionStatus,
              user.id,
            ],
          );
          finalSettlementId = settlement.rows[0].id;
          await this.insertEvidence(
            client,
            checkout,
            'settlement',
            adjustmentEvidence ? [adjustmentEvidence] : [],
            user.id,
            {
              final_settlement_id: finalSettlementId,
              recommended_refund_amount: quote.recommendedRefundAmount,
              final_refund_amount: finalRefund,
              final_rent_refund_amount: finalRentRefundAmount,
              final_deposit_refund_amount: finalDepositRefundAmount,
              refund_adjustment_amount: refundAdjustmentAmount,
              amount_due: quote.amountDue,
            },
          );
          const depositAdjustmentAmount = quote.refundableDepositAmount - finalDepositRefundAmount;
          if (depositAdjustmentAmount > 0)
            await client.query(
              `INSERT INTO lease_deposit_transactions(
                 property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,
                 settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
               ) VALUES($1,$2,'deduction','debit',$3,'checkout_refund_adjustment',$4,$5,
                        'settled',now(),$6,$7::jsonb,$6)`,
              [
                checkout.property_id,
                lease.id,
                depositAdjustmentAmount,
                adjustmentReason,
                adjustmentEvidence,
                user.id,
                JSON.stringify({
                  checkout_command_id: checkout.id,
                  final_settlement_id: finalSettlementId,
                }),
              ],
            );
        }
        if (refundAmount > 0) {
          const due = await client.query<{ due_date: string }>(
            `SELECT max(day)::date::text AS due_date FROM (
             SELECT day FROM generate_series(($1::date + 1),($1::date + 14),'1 day'::interval) day
             WHERE extract(isodow FROM day) < 6 ORDER BY day LIMIT 7
           ) weekdays`,
            [today],
          );
          refundDueDate = due.rows[0]?.due_date ?? null;
          let depositRefundTransactionId: string | null = null;
          if (checkout.exit_type && finalDepositRefundAmount > 0) {
            const depositRefund = await client.query<{ id: string }>(
              `INSERT INTO lease_deposit_transactions(
                 property_id,lease_id,transaction_type,direction,amount,reason_type,reason,
                 settlement_status,refund_due_date,metadata,created_by_user_id
               ) VALUES($1,$2,'refund','debit',$3,'checkout_exit_refund','Approved exit deposit refund',
                        'pending',$4::date,$5::jsonb,$6)
               RETURNING id`,
              [
                checkout.property_id,
                lease.id,
                finalDepositRefundAmount,
                refundDueDate,
                JSON.stringify({
                  checkout_command_id: checkout.id,
                  final_settlement_id: finalSettlementId,
                }),
                user.id,
              ],
            );
            depositRefundTransactionId = depositRefund.rows[0].id;
          }
          const refund = checkout.exit_type
            ? await client.query<{ id: string }>(
                `INSERT INTO lease_exit_refunds(
                   property_id,final_settlement_id,checkout_command_id,lease_id,deposit_transaction_id,
                   amount,refund_due_date,created_by_user_id
                 ) VALUES($1,$2,$3,$4,$5,$6,$7::date,$8) RETURNING id`,
                [
                  checkout.property_id,
                  finalSettlementId,
                  checkout.id,
                  lease.id,
                  depositRefundTransactionId,
                  refundAmount,
                  refundDueDate,
                  user.id,
                ],
              )
            : await client.query<{ id: string }>(
                `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,reason_type,reason,settlement_status,refund_due_date,metadata,created_by_user_id)
                 VALUES($1,$2,'refund','debit',$3,'checkout_refund',$4,'pending',$5::date,$6::jsonb,$7) RETURNING id`,
                [
                  checkout.property_id,
                  lease.id,
                  refundAmount,
                  dto.refund_reason?.trim() || 'Checkout security-deposit refund',
                  refundDueDate,
                  JSON.stringify({ checkout_command_id: checkout.id }),
                  user.id,
                ],
              );
          refundId = refund.rows[0].id;
          await this.insertEvidence(client, checkout, 'refund', [], user.id, {
            refund_id: refundId,
            final_settlement_id: finalSettlementId,
            amount: refundAmount,
            refund_due_date: refundDueDate,
          });
        }
        if (checkout.exit_type && finalSettlementId) {
          issuedDocuments = await this.issueExitOfficialDocuments(
            client,
            checkout,
            finalSettlementId,
            refundId,
            user.id,
            context,
            ['checkout_handover', 'final_settlement'],
          );
        }
        if (!checkout.exit_type) {
          await this.releaseResidentParking(client, checkout, user.id);
          const endedOccupancy = await client.query(
            `UPDATE occupancies SET occupancy_status='ended',end_date=$2::date,closed_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND occupancy_status='active'`,
            [checkout.occupancy_id, today, user.id],
          );
          if (endedOccupancy.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_OCCUPANCY_CONFLICT',
              message: 'Active occupancy cannot be closed',
            });
          await client.query(
            `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
             VALUES($1,$2,$3,$4,'check_out','active','ended',$5::date,$6,$7::jsonb)`,
            [
              checkout.occupancy_id,
              checkout.property_id,
              checkout.room_id,
              checkout.resident_id,
              today,
              user.id,
              JSON.stringify({ source: 'lease_checkout', checkout_command_id: checkout.id }),
            ],
          );
          const endedLease = await client.query(
            `UPDATE leases SET lease_status='ended',end_date=$2::date,closed_at=now(),closed_by_user_id=$3,
                    close_reason='checkout',updated_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND lease_status='active'`,
            [lease.id, today, user.id],
          );
          if (endedLease.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_LEASE_CONFLICT',
              message: 'Active lease cannot be closed',
            });
          const roomUpdated = await client.query(
            `UPDATE rooms SET room_status=$2,updated_by_user_id=$3,updated_at=now()
             WHERE id=$1 AND property_id=$4`,
            [checkout.room_id, dto.room_status_after, user.id, checkout.property_id],
          );
          if (roomUpdated.rowCount !== 1)
            throw new ConflictException({
              code: 'CHECKOUT_ROOM_CONFLICT',
              message: 'Room result could not be recorded',
            });
        }
        await this.deactivateResidentAfterCheckout(
          client,
          checkout.property_id,
          checkout.resident_id,
          user.id,
        );
        const completed = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='completed',completion_room_status=$2,completed_by_user_id=$3,completed_at=now(),updated_at=now() WHERE id=$1
           RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                     exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                     approved_short_notice_charge,short_notice_waiver_reason,approved_at,
                     physical_checkout_confirmed_at,actual_checkout_date::text`,
          [checkout.id, dto.room_status_after, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          lease.id,
          'checkout_completed',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            invoice_credit_amount: credited,
            unearned_invoice_credit_amount: unearnedInvoiceCredit,
            damage_deduction_amount: damageTotal,
            refund_amount: refundAmount,
            refund_due_date: refundDueDate,
            final_settlement_id: finalSettlementId,
            amount_due: amountDue,
            room_status_after: dto.room_status_after,
          },
        );
        await this.audit(
          client,
          user.id,
          checkout.property_id,
          'lease.checkout.complete',
          'lease_checkout_command',
          checkout.id,
          { state: 'settlement_pending' },
          {
            state: 'completed',
            final_settlement_id: finalSettlementId,
            refund_due_date: refundDueDate,
            amount_due: amountDue,
          },
          context,
        );
        await this.outbox(
          client,
          checkout.property_id,
          `lease.checkout_completed:${checkout.id}`,
          'lease.checkout.completed',
          'lease_checkout_command',
          checkout.id,
          user.id,
          context,
          {
            checkout_command_id: checkout.id,
            lease_id: lease.id,
            room_id: checkout.room_id,
            refund_transaction_id: refundId,
            refund_due_date: refundDueDate,
            final_settlement_id: finalSettlementId,
            amount_due: amountDue,
            document_ids: issuedDocuments.map((document) => document.id),
          },
        );
        if (!checkout.exit_type)
          await this.outbox(
            client,
            checkout.property_id,
            `lease.checkout_access_reconcile:${checkout.id}`,
            'lease.checkout.access_reconciliation_requested',
            'lease_checkout_command',
            checkout.id,
            user.id,
            context,
            {
              checkout_command_id: checkout.id,
              resident_id: checkout.resident_id,
              room_id: checkout.room_id,
            },
          );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: checkout.id,
          data: {
            checkout: completed.rows[0],
            refund_due_date: refundDueDate,
            refund_transaction_id: refundId,
            final_settlement_id: finalSettlementId,
            invoice_credit_amount: credited,
            unearned_invoice_credit_amount: unearnedInvoiceCredit,
            amount_due: amountDue,
            documents: issuedDocuments.map((document) => ({
              id: document.id,
              document_code: document.document_code,
              document_kind: document.document_kind,
              issued_at: document.issued_at.toISOString(),
            })),
          },
        };
      },
    );
  }

  async previewSettlement(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CompleteLeaseCheckoutDto,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.leases.transaction(async (client) => {
      await this.lockProperty(client, scope.property_id);
      const checkout = await this.lockCheckout(client, commandId, leaseId);
      this.requireState(checkout, 'settlement_pending');
      if (!checkout.exit_type)
        throw new ConflictException({
          code: 'CHECKOUT_M5_SETTLEMENT_PREVIEW_REQUIRED',
          message: 'The authoritative settlement preview is available for M5 exits only',
        });
      const inspectionResult = await client.query<{ inspection_room_status: string }>(
        `SELECT inspection_room_status FROM lease_checkout_commands WHERE id=$1 FOR UPDATE`,
        [checkout.id],
      );
      if (inspectionResult.rows[0]?.inspection_room_status !== dto.room_status_after)
        throw new ConflictException({
          code: 'CHECKOUT_INSPECTION_RESULT_CONFLICT',
          message: 'Settlement preview must match the recorded inspection result',
        });
      const lease = await this.lockLease(client, leaseId);
      this.assertCheckoutTuple(checkout, lease);
      if (!checkout.physical_checkout_confirmed_at || lease.lease_status !== 'ended')
        throw new ConflictException({
          code: 'CHECKOUT_PHYSICAL_CONFIRMATION_REQUIRED',
          message: 'Settlement preview requires a completed physical checkout',
        });
      await this.lockEndedOccupancyAndRoom(client, checkout);
      await this.assertEvidenceComplete(client, checkout);
      const invoices = await this.lockInvoices(client, lease.id);
      const balance = await this.lockDepositBalance(client, lease.id);
      const damageTotal = (dto.damage_deductions ?? []).reduce((sum, row) => sum + row.amount, 0);
      if (!Number.isSafeInteger(damageTotal) || damageTotal < 0 || damageTotal > balance)
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_DEPOSIT_EXCEEDED',
          message: 'Damage deductions exceed the authoritative deposit balance',
        });
      const quote = this.buildFinalSettlementQuote(
        checkout,
        lease,
        invoices,
        balance,
        damageTotal,
        dto.deposit_rent_offset_amount ?? 0,
        checkout.actual_checkout_date,
      );
      return {
        data: {
          quote: {
            contract_rent_amount: quote.contractRentAmount,
            verified_rent_payment_amount: quote.verifiedRentPaymentAmount,
            existing_invoice_credit_amount: quote.existingInvoiceCreditAmount,
            recognized_rent_credit_amount: quote.recognizedRentCreditAmount,
            earned_rent_amount: quote.earnedRentAmount,
            earned_rent_amount_due_before_deposit_offset:
              quote.earnedRentAmountDueBeforeDepositOffset,
            contract_outstanding_amount: quote.contractOutstandingAmount,
            approved_short_notice_charge: quote.approvedShortNoticeCharge,
            rent_refundable_amount: quote.rentRefundableAmount,
            rent_amount_due_before_deposit_offset: quote.rentAmountDueBeforeDepositOffset,
            deposit_liability_amount: quote.depositLiabilityAmount,
            deposit_deduction_amount: quote.depositDeductionAmount,
            deposit_rent_offset_amount: quote.depositRentOffsetAmount,
            refundable_deposit_amount: quote.refundableDepositAmount,
            recommended_refund_amount: quote.recommendedRefundAmount,
            amount_due: quote.amountDue,
          },
        },
      };
    });
  }

  async settleRefund(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    refundId: string,
    dto: SettleRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.settleCheckoutRefund(
      user,
      scope.property_id,
      leaseId,
      commandId,
      refundId,
      'settled',
      dto,
      key,
      context,
    );
  }

  async waiveRefund(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    refundId: string,
    dto: WaiveRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.settleCheckoutRefund(
      user,
      scope.property_id,
      leaseId,
      commandId,
      refundId,
      'waived',
      dto,
      key,
      context,
    );
  }

  async cancel(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CancelLeaseCheckoutDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'cancel',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        if (!['notice_received', 'scheduled'].includes(checkout.state))
          throw new ConflictException({
            code: 'CHECKOUT_CANCELLATION_FORBIDDEN',
            message: 'Checkout can only be cancelled before handover',
          });
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='cancelled',cancelled_by_user_id=$2,cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE id=$1
           RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
                     exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
                     approved_short_notice_charge,short_notice_waiver_reason,approved_at,
                     physical_checkout_confirmed_at,actual_checkout_date::text`,
          [checkout.id, user.id, dto.reason.trim()],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_cancelled',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  private async transition(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    action: string,
    key: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    mutate: (client: PoolClient, checkout: CheckoutRow, today: string) => Promise<CheckoutRow>,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout/${commandId}/${action}`,
      key,
      payload,
      context,
      200,
      async (client, today) => {
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        const updated = await mutate(client, checkout, today);
        await this.audit(
          client,
          user.id,
          scope.property_id,
          `lease.checkout.${action}`,
          'lease_checkout_command',
          commandId,
          { state: checkout.state },
          { state: updated.state },
          context,
        );
        await this.outbox(
          client,
          scope.property_id,
          `lease.checkout_${action}:${commandId}`,
          `lease.checkout.${action}`,
          'lease_checkout_command',
          commandId,
          user.id,
          context,
          { checkout_command_id: commandId, lease_id: leaseId, state: updated.state },
        );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: commandId,
          data: { checkout: updated },
        };
      },
    );
  }

  private async settleCheckoutRefund(
    user: UserAccessContext,
    propertyId: string,
    leaseId: string,
    commandId: string,
    refundId: string,
    status: 'settled' | 'waived',
    dto: SettleRefundDto | WaiveRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.command(
      user,
      propertyId,
      `POST /leases/${leaseId}/checkout/${commandId}/refunds/${refundId}/${status}`,
      key,
      dto,
      context,
      200,
      async (client, today) => {
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        this.requireState(checkout, 'completed');
        const refund = checkout.exit_type
          ? await client.query<{
              id: string;
              amount: string;
              refund_due_date: string | null;
              deposit_transaction_id: string | null;
              final_settlement_id: string;
            }>(
              `SELECT id,amount,refund_due_date::text,deposit_transaction_id,final_settlement_id
               FROM lease_exit_refunds
               WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND checkout_command_id=$4
                 AND refund_status='pending'
               FOR UPDATE`,
              [refundId, propertyId, leaseId, commandId],
            )
          : await client.query<{
              id: string;
              amount: string;
              refund_due_date: string | null;
              deposit_transaction_id?: string | null;
              final_settlement_id?: string;
            }>(
              `SELECT id,amount,refund_due_date::text
               FROM lease_deposit_transactions
               WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND transaction_type='refund'
                 AND settlement_status='pending' AND metadata->>'checkout_command_id'=$4
               FOR UPDATE`,
              [refundId, propertyId, leaseId, commandId],
            );
        const row = refund.rows[0];
        if (!row)
          throw new ConflictException({
            code: 'CHECKOUT_REFUND_STATE_CONFLICT',
            message: 'Checkout refund is not pending',
          });
        const late = row.refund_due_date !== null && today > row.refund_due_date;
        const settled = status === 'settled' ? (dto as SettleRefundDto) : null;
        const waived = status === 'waived' ? (dto as WaiveRefundDto) : null;
        const transactionCode =
          status === 'settled'
            ? await nextFinancialTransactionCode(client, 'REF', 'CHECKOUT')
            : null;
        if (checkout.exit_type) {
          if (status === 'settled' && !settled?.evidence_file_id)
            throw new UnprocessableEntityException({
              code: 'CHECKOUT_REFUND_EVIDENCE_REQUIRED',
              message: 'Settling an exit refund requires payout evidence',
            });
          if (settled?.evidence_file_id)
            await this.assertFiles(client, propertyId, [settled.evidence_file_id]);
          await client.query(
            `UPDATE lease_exit_refunds
             SET refund_status=$2,payment_method=$3,external_reference=$4,evidence_file_id=$5,
                  settlement_reason=$6,settled_by_user_id=$7,settled_at=now(),transaction_code=$8
             WHERE id=$1`,
            [
              refundId,
              status,
              settled?.payment_method ?? null,
              settled?.external_reference ?? null,
              settled?.evidence_file_id ?? null,
              status === 'settled' ? settled?.notes?.trim() || null : waived?.reason.trim(),
              user.id,
              transactionCode,
            ],
          );
          if (settled?.evidence_file_id)
            await this.insertEvidence(
              client,
              checkout,
              'refund',
              [settled.evidence_file_id],
              user.id,
              {
                refund_id: refundId,
                payment_method: settled.payment_method,
                external_reference: settled.external_reference,
              },
            );
          if (row.deposit_transaction_id) {
            const depositDisposition = await client.query(
              `UPDATE lease_deposit_transactions
               SET settlement_status=$2,external_reference=$3,settled_at=now(),settled_by_user_id=$4
               WHERE id=$1 AND lease_id=$5 AND transaction_type='refund' AND settlement_status='pending'`,
              [
                row.deposit_transaction_id,
                status,
                settled?.external_reference ?? null,
                user.id,
                leaseId,
              ],
            );
            if (depositDisposition.rowCount !== 1)
              throw new ConflictException({
                code: 'CHECKOUT_DEPOSIT_REFUND_STATE_CONFLICT',
                message: 'The linked deposit refund is no longer pending',
              });
          }
          await client.query(
            `UPDATE lease_exit_final_settlements settlement
             SET decision_status=CASE WHEN settlement.amount_due>0 THEN 'amount_due' ELSE 'closed' END
             FROM lease_exit_refunds refund
             WHERE refund.id=$1 AND settlement.id=refund.final_settlement_id`,
            [refundId],
          );
        } else {
          await client.query(
            `INSERT INTO lease_refund_settlements(property_id,deposit_transaction_id,settlement_status,payment_method,external_reference,reason,settled_by_user_id,metadata,transaction_code)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
            [
              propertyId,
              refundId,
              status,
              settled?.payment_method ?? null,
              settled?.external_reference ?? null,
              waived?.reason.trim() ?? null,
              user.id,
              JSON.stringify({ checkout_command_id: commandId, late_settlement: late }),
              transactionCode,
            ],
          );
          await client.query(
            `UPDATE lease_deposit_transactions
             SET settlement_status=$2,external_reference=$3,settled_at=now(),settled_by_user_id=$4
             WHERE id=$1`,
            [refundId, status, settled?.external_reference ?? null, user.id],
          );
        }
        const refundDocuments =
          checkout.exit_type && status === 'settled' && row.final_settlement_id
            ? await this.issueExitOfficialDocuments(
                client,
                checkout,
                row.final_settlement_id,
                refundId,
                user.id,
                context,
                ['refund_receipt'],
              )
            : [];
        const resourceType = checkout.exit_type ? 'lease_exit_refund' : 'lease_deposit_transaction';
        await this.audit(
          client,
          user.id,
          propertyId,
          `lease.checkout.refund_${status}`,
          resourceType,
          refundId,
          { settlement_status: 'pending', refund_due_date: row.refund_due_date },
          { settlement_status: status, late_settlement: late, amount: Number(row.amount) },
          context,
        );
        await this.outbox(
          client,
          propertyId,
          `lease.checkout_refund_${status}:${refundId}`,
          `lease.checkout.refund_${status}`,
          'lease_checkout_command',
          commandId,
          user.id,
          context,
          {
            checkout_command_id: commandId,
            lease_id: leaseId,
            refund_transaction_id: refundId,
            late_settlement: late,
          },
        );
        return {
          resourceType,
          resourceId: refundId,
          data: {
            refund_id: refundId,
            settlement_status: status,
            late_settlement: late,
            documents: refundDocuments.map((document) => ({
              id: document.id,
              document_code: document.document_code,
              document_kind: document.document_kind,
              issued_at: document.issued_at.toISOString(),
            })),
          },
        };
      },
    );
  }

  private async issueExitOfficialDocuments(
    client: PoolClient,
    checkout: CheckoutRow,
    finalSettlementId: string,
    refundId: string | null,
    actorId: string,
    auditContext: LeaseAuditContext,
    kinds: LeaseExitOfficialDocumentKind[],
  ): Promise<ExitDocumentRecord[]> {
    if (!checkout.exit_type)
      throw new ConflictException({
        code: 'LEASE_EXIT_DOCUMENT_AUTHORITY_REQUIRED',
        message: 'Official exit documents require an authoritative exit type',
      });
    const contextResult = await client.query<ExitDocumentContextRow>(
      `SELECT now() AS issued_at,
              property.name AS property_name,property.address AS property_address,
              resident.full_name AS resident_name,room.number AS room_number,
              building.building_code,lease.snapshot_kost_type_name AS category_name,
              COALESCE(command.completion_room_status,command.inspection_room_status,'inspection_required') AS room_checkout_result,
              lease.start_date::text AS lease_start_date,
              COALESCE(command.planned_lease_end_date,lease.end_date)::text AS lease_planned_end_date,
              lease.contract_rent_amount,lease.snapshot_monthly_price AS monthly_rate_amount,
              policy.policy_version,command.exit_type,command.actual_checkout_date::text,
              checkout_actor.display_name AS checkout_confirmed_by,
              command.physical_checkout_confirmed_at AS checkout_confirmed_at,
              inspector.display_name AS inspection_recorded_by,
              command.inspection_recorded_at,
              command.notice_recorded_date::text,command.effective_date::text,
              command.notice_days,command.missing_notice_days,command.notice_reason,
              settlement.approved_short_notice_charge,command.short_notice_waiver_reason,
              settlement.verified_rent_payment_amount,settlement.existing_invoice_credit_amount,
              settlement.recognized_rent_credit_amount,settlement.earned_rent_amount,
              COALESCE(invoice_adjustment.amount,0) AS unearned_invoice_credit_amount,
              settlement.contract_outstanding_amount,settlement.rent_refundable_amount,
              settlement.rent_amount_due_before_deposit_offset,
              settlement.deposit_liability_amount,settlement.deposit_deduction_amount,
              settlement.deposit_rent_offset_amount,settlement.refundable_deposit_amount,
              settlement.recommended_refund_amount,settlement.final_refund_amount,
              settlement.final_rent_refund_amount,settlement.final_deposit_refund_amount,
              settlement.refund_adjustment_amount,settlement.refund_adjustment_reason,
              settlement.amount_due,settlement.decision_status,
              refund.refund_status,refund.refund_due_date::text AS refund_due_date,
               refund.payment_method AS refund_payment_method,
               refund.external_reference AS refund_external_reference,
               refund.transaction_code AS refund_transaction_code,
               refund.settled_at AS refund_settled_at
       FROM lease_exit_final_settlements settlement
       JOIN lease_checkout_commands command
         ON command.id=settlement.checkout_command_id AND command.property_id=settlement.property_id
       JOIN leases lease ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
       JOIN properties property ON property.id=settlement.property_id
       JOIN residents resident
         ON resident.id=settlement.resident_id AND resident.property_id=settlement.property_id
       JOIN rooms room ON room.id=settlement.room_id AND room.property_id=settlement.property_id
       JOIN room_buildings building
         ON building.id=room.building_id AND building.property_id=settlement.property_id
       JOIN users checkout_actor ON checkout_actor.id=command.physical_checkout_confirmed_by_user_id
       JOIN users inspector ON inspector.id=command.inspection_recorded_by_user_id
       LEFT JOIN lease_settlement_policy_snapshots policy
         ON policy.lease_id=lease.id AND policy.property_id=lease.property_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(adjustment.amount),0) AS amount
         FROM lease_exit_invoice_adjustments adjustment
         WHERE adjustment.checkout_command_id=command.id
           AND adjustment.property_id=command.property_id
       ) invoice_adjustment ON true
       LEFT JOIN lease_exit_refunds refund
         ON refund.id=$4::uuid AND refund.final_settlement_id=settlement.id
       WHERE settlement.id=$1 AND settlement.checkout_command_id=$2
         AND settlement.property_id=$3`,
      [finalSettlementId, checkout.id, checkout.property_id, refundId],
    );
    const authority = contextResult.rows[0];
    if (!authority)
      throw new ConflictException({
        code: 'LEASE_EXIT_DOCUMENT_CONTEXT_INVALID',
        message: 'Authoritative lease exit document context is unavailable',
      });
    const [evidenceResult, paymentResult, damageResult] = await Promise.all([
      client.query<{
        categories: string[];
        metadata_by_category: Record<string, Record<string, unknown>>;
      }>(
        `SELECT COALESCE(array_agg(evidence_category),'{}'::text[]) AS categories,
                COALESCE(jsonb_object_agg(evidence_category,metadata),'{}'::jsonb) AS metadata_by_category
         FROM (
           SELECT DISTINCT ON (evidence_category) evidence_category,metadata
           FROM lease_checkout_evidence
           WHERE checkout_command_id=$1 AND property_id=$2
           ORDER BY evidence_category,recorded_at DESC,id DESC
         ) latest_evidence`,
        [checkout.id, checkout.property_id],
      ),
      client.query<ExitDocumentPaymentRow>(
        `SELECT payment.payment_code,payment.payment_purpose,payment.amount,payment.paid_at,
                payment.payment_method,
                CASE WHEN reversal.id IS NOT NULL THEN 'reversed' ELSE payment.payment_status END AS payment_status,
                receipt.receipt_code
         FROM payments payment
         LEFT JOIN payment_reversals reversal ON reversal.payment_id=payment.id
         LEFT JOIN payment_receipts receipt
           ON receipt.payment_id=payment.id AND receipt.receipt_kind='payment'
         WHERE payment.property_id=$1 AND payment.lease_id=$2
           AND payment.payment_status='verified'
         ORDER BY payment.paid_at,payment.id`,
        [checkout.property_id, checkout.lease_id],
      ),
      client.query<ExitDocumentDamageRow>(
        `SELECT reason,amount
         FROM lease_deposit_transactions
         WHERE property_id=$1 AND lease_id=$2 AND transaction_type='deduction'
           AND reason_type='checkout_damage' AND metadata->>'checkout_command_id'=$3
         ORDER BY created_at,id`,
        [checkout.property_id, checkout.lease_id, checkout.id],
      ),
    ]);
    const evidence = new Set(evidenceResult.rows[0]?.categories ?? []);
    const evidenceMetadata = evidenceResult.rows[0]?.metadata_by_category ?? {};
    const inventoryMetadata = evidenceMetadata.inventory ?? {};
    const keyAccessMetadata = evidenceMetadata.keys_access ?? {};
    const utilityMetadata = evidenceMetadata.utilities ?? {};
    const issuedAt = authority.issued_at.toISOString();
    const baseSnapshot = {
      issued_at: issuedAt,
      property: { name: authority.property_name, address: authority.property_address },
      resident: { name: authority.resident_name },
      room: {
        number: authority.room_number,
        building_code: authority.building_code,
        category_name: authority.category_name,
        checkout_result: authority.room_checkout_result,
      },
      lease: {
        start_date: authority.lease_start_date,
        planned_end_date: authority.lease_planned_end_date,
        actual_checkout_date: authority.actual_checkout_date,
        contract_rent_amount: Number(authority.contract_rent_amount),
        monthly_rate_amount: Number(authority.monthly_rate_amount),
        policy_version: authority.policy_version ?? 'legacy_recorded_policy',
        exit_type: authority.exit_type,
      },
      authority: {
        checkout_confirmed_by: authority.checkout_confirmed_by,
        checkout_confirmed_at: authority.checkout_confirmed_at.toISOString(),
        inspection_recorded_by: authority.inspection_recorded_by,
        inspection_recorded_at: authority.inspection_recorded_at.toISOString(),
      },
      notice: {
        recorded_date: authority.notice_recorded_date,
        effective_date: authority.effective_date,
        required_days: 14,
        actual_days: authority.notice_days,
        missing_days: authority.missing_notice_days,
        reason: authority.notice_reason,
        approved_short_notice_charge: Number(authority.approved_short_notice_charge),
        waiver_reason: authority.short_notice_waiver_reason,
      },
      handover: {
        keys_access_confirmed: evidence.has('keys_access'),
        inventory_confirmed: evidence.has('inventory'),
        parking_confirmed: evidence.has('parking'),
        inspection_confirmed: evidence.has('inspection'),
        key_access_items: (Array.isArray(keyAccessMetadata.items)
          ? keyAccessMetadata.items
          : []) as LeaseExitOfficialDocumentSnapshot['handover']['key_access_items'],
        inventory_items: (Array.isArray(inventoryMetadata.items)
          ? inventoryMetadata.items
          : []) as LeaseExitOfficialDocumentSnapshot['handover']['inventory_items'],
        utility_readings: (Array.isArray(utilityMetadata.readings)
          ? utilityMetadata.readings
          : []) as LeaseExitOfficialDocumentSnapshot['handover']['utility_readings'],
        notes:
          typeof inventoryMetadata.notes === 'string'
            ? inventoryMetadata.notes
            : typeof keyAccessMetadata.notes === 'string'
              ? keyAccessMetadata.notes
              : null,
      },
      payments: paymentResult.rows.map((payment) => ({
        payment_code: payment.payment_code,
        payment_purpose: payment.payment_purpose,
        amount: Number(payment.amount),
        paid_at: payment.paid_at?.toISOString() ?? null,
        payment_method: payment.payment_method,
        payment_status: payment.payment_status,
        receipt_code: payment.receipt_code,
      })),
      damages: damageResult.rows.map((damage, index) => ({
        reference: `EV-DMG-${String(index + 1).padStart(2, '0')}`,
        reason: damage.reason,
        amount: Number(damage.amount),
      })),
      settlement: {
        verified_rent_payment_amount: Number(authority.verified_rent_payment_amount),
        existing_invoice_credit_amount: Number(authority.existing_invoice_credit_amount),
        recognized_rent_credit_amount: Number(authority.recognized_rent_credit_amount),
        earned_rent_amount: Number(authority.earned_rent_amount),
        unearned_invoice_credit_amount: Number(authority.unearned_invoice_credit_amount),
        contract_outstanding_amount: Number(authority.contract_outstanding_amount),
        rent_refundable_amount: Number(authority.rent_refundable_amount),
        rent_amount_due_before_deposit_offset: Number(
          authority.rent_amount_due_before_deposit_offset,
        ),
        deposit_liability_amount: Number(authority.deposit_liability_amount),
        deposit_deduction_amount: Number(authority.deposit_deduction_amount),
        deposit_rent_offset_amount: Number(authority.deposit_rent_offset_amount),
        refundable_deposit_amount: Number(authority.refundable_deposit_amount),
        recommended_refund_amount: Number(authority.recommended_refund_amount),
        final_refund_amount: Number(authority.final_refund_amount),
        final_rent_refund_amount: Number(authority.final_rent_refund_amount),
        final_deposit_refund_amount: Number(authority.final_deposit_refund_amount),
        refund_adjustment_amount: Number(authority.refund_adjustment_amount),
        refund_adjustment_reason: authority.refund_adjustment_reason,
        amount_due: Number(authority.amount_due),
        decision_status: authority.decision_status,
      },
      refund: {
        status: authority.refund_status,
        due_date: authority.refund_due_date,
        payment_method: authority.refund_payment_method,
        external_reference: authority.refund_external_reference,
        transaction_code: authority.refund_transaction_code,
        settled_at: authority.refund_settled_at?.toISOString() ?? null,
      },
    };
    const records: ExitDocumentRecord[] = [];
    for (const kind of kinds) {
      const documentKind = kind === 'refund_receipt' ? 'checkout_refund' : kind;
      const numberResult = await client.query<{ document_code: string }>(
        `SELECT next_billing_document_number($1,$2,$3) AS document_code`,
        [checkout.property_id, documentKind, authority.issued_at],
      );
      const documentCode = numberResult.rows[0]?.document_code;
      if (!documentCode)
        throw new ConflictException({
          code: 'LEASE_EXIT_DOCUMENT_NUMBER_UNAVAILABLE',
          message: 'Official lease-exit document number could not be issued',
        });
      const snapshot: LeaseExitOfficialDocumentSnapshot = {
        document_code: documentCode,
        document_kind: kind,
        ...baseSnapshot,
      };
      const rendered = await createLeaseExitOfficialDocumentPdf(kind, snapshot);
      const checksum = createHash('sha256').update(rendered.content).digest('hex');
      const documentRefundId = kind === 'refund_receipt' ? refundId : null;
      const inserted = await client.query<ExitDocumentRecord>(
        `INSERT INTO lease_exit_documents(
           property_id,checkout_command_id,final_settlement_id,exit_refund_id,lease_id,resident_id,
           document_code,document_kind,safe_snapshot,document_content,content_sha256,
           issued_by_user_id,issued_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
         ON CONFLICT(checkout_command_id,document_kind) DO NOTHING
         RETURNING id,document_code,document_kind,issued_at`,
        [
          checkout.property_id,
          checkout.id,
          finalSettlementId,
          documentRefundId,
          checkout.lease_id,
          checkout.resident_id,
          documentCode,
          kind,
          JSON.stringify(snapshot),
          rendered.content,
          checksum,
          actorId,
          authority.issued_at,
        ],
      );
      const record =
        inserted.rows[0] ??
        (
          await client.query<ExitDocumentRecord>(
            `SELECT id,document_code,document_kind,issued_at
             FROM lease_exit_documents
             WHERE checkout_command_id=$1 AND document_kind=$2`,
            [checkout.id, kind],
          )
        ).rows[0];
      if (!record)
        throw new ConflictException({
          code: 'LEASE_EXIT_DOCUMENT_ISSUANCE_FAILED',
          message: 'Official lease exit document could not be issued',
        });
      records.push(record);
      if (inserted.rows[0]) {
        await this.audit(
          client,
          actorId,
          checkout.property_id,
          'lease.checkout.document_issued',
          'lease_exit_document',
          record.id,
          undefined,
          { document_kind: kind, document_code: documentCode, content_sha256: checksum },
          auditContext,
        );
        await this.outbox(
          client,
          checkout.property_id,
          `lease.checkout_document_issued:${record.id}`,
          'lease.checkout.document_issued',
          'lease_exit_document',
          record.id,
          actorId,
          auditContext,
          {
            checkout_command_id: checkout.id,
            lease_id: checkout.lease_id,
            document_kind: kind,
            document_code: documentCode,
          },
        );
      }
    }
    return records;
  }

  private buildFinalSettlementQuote(
    checkout: CheckoutRow,
    lease: LeaseRow,
    invoices: InvoiceRow[],
    depositBalance: number,
    damageTotal: number,
    depositOffset: number,
    actualCheckoutDate: string | null,
  ) {
    const verifiedRentPayment = invoices.reduce(
      (sum, invoice) => sum + Math.min(Number(invoice.total_amount), Number(invoice.net_allocated)),
      0,
    );
    const existingInvoiceCredit = invoices.reduce(
      (sum, invoice) =>
        sum +
        Math.min(
          Math.max(Number(invoice.total_amount) - Number(invoice.net_allocated), 0),
          Number(invoice.credit_amount),
        ),
      0,
    );
    try {
      return buildLeaseExitFinancialQuote({
        leaseStartDate: lease.start_date,
        actualCheckoutDate: actualCheckoutDate ?? checkout.effective_date,
        contractRentAmount: Number(lease.contract_rent_amount),
        monthlyRateAmount: Number(lease.snapshot_monthly_price),
        verifiedRentPaymentAmount: verifiedRentPayment,
        existingInvoiceCreditAmount: existingInvoiceCredit,
        depositLiabilityAmount: depositBalance,
        depositDeductionAmount: damageTotal,
        approvedShortNoticeCharge: Number(checkout.approved_short_notice_charge ?? 0),
        depositRentOffsetAmount: depositOffset,
      });
    } catch (error) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_FINAL_SETTLEMENT_INVALID',
        message: error instanceof Error ? error.message : 'Final settlement is invalid',
      });
    }
  }

  private async applyUnearnedRentCredits(
    client: PoolClient,
    checkout: CheckoutRow,
    invoices: InvoiceRow[],
    earnedRentDue: number,
    actorId: string,
  ) {
    const currentOutstanding = invoices.reduce(
      (sum, invoice) =>
        sum +
        Math.max(
          Number(invoice.total_amount) -
            Number(invoice.credit_amount) -
            Number(invoice.net_allocated),
          0,
        ),
      0,
    );
    let remainingCredit = Math.max(currentOutstanding - earnedRentDue, 0);
    let credited = 0;
    for (const invoice of [...invoices].reverse()) {
      if (remainingCredit === 0) break;
      const outstanding = Math.max(
        Number(invoice.total_amount) -
          Number(invoice.credit_amount) -
          Number(invoice.net_allocated),
        0,
      );
      const amount = Math.min(remainingCredit, outstanding);
      if (!amount) continue;
      await client.query(
        `INSERT INTO lease_exit_invoice_adjustments(
           property_id,checkout_command_id,lease_id,invoice_id,adjustment_type,amount,
           invoice_credit_before_amount,created_by_user_id
         ) VALUES($1,$2,$3,$4,'unearned_rent_termination',$5,$6,$7)`,
        [
          checkout.property_id,
          checkout.id,
          checkout.lease_id,
          invoice.id,
          amount,
          Number(invoice.credit_amount),
          actorId,
        ],
      );
      await client.query(
        `UPDATE invoices SET credit_amount=credit_amount+$2,updated_at=now()
         WHERE id=$1 AND property_id=$3`,
        [invoice.id, amount, checkout.property_id],
      );
      await this.w06Billing.reconcileInvoiceLifecycleInTransaction(
        client,
        checkout.property_id,
        invoice.id,
      );
      invoice.credit_amount = String(Number(invoice.credit_amount) + amount);
      remainingCredit -= amount;
      credited += amount;
    }
    if (remainingCredit !== 0)
      throw new ConflictException({
        code: 'CHECKOUT_UNEARNED_RENT_CREDIT_CONFLICT',
        message: 'Unearned rent could not be reconciled against authoritative invoices',
      });
    return credited;
  }

  private async applyInvoiceCredits(
    client: PoolClient,
    checkout: CheckoutRow,
    invoices: InvoiceRow[],
    balance: number,
    actorId: string,
    explicitOffset?: { reason: string; evidenceFileId: string },
  ) {
    let remaining = balance;
    const credits: { invoiceId: string; amount: number }[] = [];
    for (const invoice of invoices) {
      const outstanding = Math.max(
        0,
        Number(invoice.total_amount) -
          Number(invoice.credit_amount) -
          Number(invoice.net_allocated),
      );
      const amount = Math.min(remaining, outstanding);
      if (!amount) continue;
      const deposit = await client.query<{ id: string }>(
        `INSERT INTO lease_deposit_transactions(
           property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,
           settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
         ) VALUES($1,$2,'deduction','debit',$3,'checkout_invoice_offset',$4,$5,'settled',now(),$6,$7::jsonb,$6)
         RETURNING id`,
        [
          checkout.property_id,
          checkout.lease_id,
          amount,
          explicitOffset?.reason ?? 'Checkout deposit offset for invoice',
          explicitOffset?.evidenceFileId ?? null,
          actorId,
          JSON.stringify({ checkout_command_id: checkout.id, invoice_id: invoice.id }),
        ],
      );
      await client.query(
        `INSERT INTO lease_checkout_invoice_credits(property_id,checkout_command_id,lease_id,invoice_id,deposit_transaction_id,amount,invoice_credit_before_amount,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          checkout.property_id,
          checkout.id,
          checkout.lease_id,
          invoice.id,
          deposit.rows[0].id,
          amount,
          Number(invoice.credit_amount),
          actorId,
        ],
      );
      await client.query(
        `UPDATE invoices SET credit_amount=credit_amount+$2,updated_at=now() WHERE id=$1 AND property_id=$3`,
        [invoice.id, amount, checkout.property_id],
      );
      await this.w06Billing.reconcileInvoiceLifecycleInTransaction(
        client,
        checkout.property_id,
        invoice.id,
      );
      credits.push({ invoiceId: invoice.id, amount });
      remaining -= amount;
    }
    return credits;
  }

  private async assertEvidenceComplete(client: PoolClient, checkout: CheckoutRow) {
    const result = await client.query<{ evidence_category: string }>(
      `SELECT DISTINCT evidence_category FROM lease_checkout_evidence WHERE checkout_command_id=$1 AND property_id=$2`,
      [checkout.id, checkout.property_id],
    );
    const categories = new Set(result.rows.map((row) => row.evidence_category));
    for (const category of ['keys_access', 'inventory', 'parking', 'inspection'])
      if (!categories.has(category))
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_EVIDENCE_REQUIRED',
          message: `Checkout ${category} evidence is required`,
        });
  }
  private assertHandoverConfirmations(dto: RecordLeaseCheckoutHandoverDto) {
    const missing = [
      !dto.key_access_confirmed && 'keys/access',
      !dto.inventory_confirmed && 'inventory',
      !dto.parking_confirmed && 'parking',
    ].filter(Boolean);
    if (missing.length)
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_HANDOVER_CONFIRMATION_REQUIRED',
        message: `Checkout handover must confirm ${missing.join(', ')}`,
      });
  }
  private assertHandoverDetails(dto: RecordLeaseCheckoutHandoverDto) {
    if (!dto.inventory_items?.length || !dto.key_access_items?.length)
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_HANDOVER_DETAIL_REQUIRED',
        message: 'Checkout handover requires itemised inventory and key/access details',
      });

    const assertUniqueNames = (items: Array<{ name: string }>, category: string) => {
      const names = items.map((item) => item.name.trim().toLocaleLowerCase('id-ID'));
      if (new Set(names).size !== names.length)
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_HANDOVER_DETAIL_DUPLICATE',
          message: `Checkout ${category} item names must be unique`,
        });
    };
    assertUniqueNames(dto.inventory_items, 'inventory');
    assertUniqueNames(dto.key_access_items, 'key/access');

    for (const item of [...dto.inventory_items, ...dto.key_access_items])
      if (item.returned_quantity > item.expected_quantity)
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_HANDOVER_QUANTITY_INVALID',
          message: `Returned quantity cannot exceed expected quantity for ${item.name}`,
        });

    const utilityKeys = (dto.utility_readings ?? []).map((reading) =>
      `${reading.utility_type.trim()}::${reading.meter_number?.trim() ?? ''}`.toLocaleLowerCase(
        'id-ID',
      ),
    );
    if (new Set(utilityKeys).size !== utilityKeys.length)
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_UTILITY_READING_DUPLICATE',
        message: 'Checkout utility meter readings must be unique',
      });
  }
  private async insertEvidence(
    client: PoolClient,
    checkout: CheckoutRow,
    category: string,
    fileIds: string[] | undefined,
    actorId: string,
    metadata: Record<string, unknown>,
  ) {
    const ids = [...new Set(fileIds ?? [])];
    if (ids.length !== (fileIds?.length ?? 0))
      throw new BadRequestException({
        code: 'CHECKOUT_EVIDENCE_DUPLICATE',
        message: 'Checkout evidence file ids must be unique',
      });
    await this.assertFiles(client, checkout.property_id, ids);
    if (!ids.length)
      await client.query(
        `INSERT INTO lease_checkout_evidence(property_id,checkout_command_id,evidence_category,metadata,recorded_by_user_id) VALUES($1,$2,$3,$4::jsonb,$5)`,
        [checkout.property_id, checkout.id, category, JSON.stringify(metadata), actorId],
      );
    for (const fileId of ids)
      await client.query(
        `INSERT INTO lease_checkout_evidence(property_id,checkout_command_id,evidence_category,file_id,metadata,recorded_by_user_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [checkout.property_id, checkout.id, category, fileId, JSON.stringify(metadata), actorId],
      );
  }
  private async assertFiles(client: PoolClient, propertyId: string, ids: string[]) {
    if (!ids.length) return;
    const files = await client.query<{ id: string }>(
      `SELECT id FROM files WHERE id=ANY($1::uuid[]) AND property_id=$2 AND is_deleted=false FOR SHARE`,
      [ids, propertyId],
    );
    if (files.rows.length !== ids.length)
      throw new ConflictException({
        code: 'CHECKOUT_EVIDENCE_SCOPE_INVALID',
        message: 'Checkout evidence file is unavailable',
      });
  }
  private async lockInvoices(client: PoolClient, leaseId: string) {
    const result = await client.query<InvoiceRow>(
      `SELECT i.id,i.total_amount,i.credit_amount,COALESCE(allocation.net,0) AS net_allocated FROM invoices i LEFT JOIN LATERAL (SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id) allocation ON true WHERE i.lease_id=$1 AND i.invoice_status<>'void' ORDER BY i.due_date,i.id FOR UPDATE OF i`,
      [leaseId],
    );
    return result.rows;
  }
  private async lockDepositBalance(client: PoolClient, leaseId: string) {
    const result = await client.query<LedgerRow>(
      `SELECT direction,amount FROM lease_deposit_transactions WHERE lease_id=$1 ORDER BY created_at,id FOR UPDATE`,
      [leaseId],
    );
    const balance = result.rows.reduce(
      (sum, row) => sum + (row.direction === 'credit' ? Number(row.amount) : -Number(row.amount)),
      0,
    );
    if (balance < 0)
      throw new ConflictException({
        code: 'CHECKOUT_DEPOSIT_LEDGER_INVALID',
        message: 'Deposit ledger is negative',
      });
    return balance;
  }
  private async lockResidentParking(client: PoolClient, propertyId: string, residentId: string) {
    await client.query(
      `SELECT slot.id FROM parking_slots slot JOIN parking_zones zone ON zone.id=slot.zone_id JOIN vehicles vehicle ON vehicle.id=slot.vehicle_id WHERE zone.property_id=$1 AND vehicle.property_id=$1 AND vehicle.resident_id=$2 ORDER BY slot.id FOR UPDATE OF slot, vehicle`,
      [propertyId, residentId],
    );
  }
  private async releaseResidentParking(client: PoolClient, checkout: CheckoutRow, actorId: string) {
    await client.query(
      `WITH released AS (
         SELECT slot.id,slot.vehicle_id,zone.property_id
         FROM parking_slots slot
         JOIN parking_zones zone ON zone.id=slot.zone_id
         JOIN vehicles vehicle ON vehicle.id=slot.vehicle_id
         WHERE zone.property_id=$1 AND vehicle.property_id=$1 AND vehicle.resident_id=$2
           AND slot.slot_status='occupied'
         FOR UPDATE OF slot,vehicle
       )
       INSERT INTO parking_assignment_histories(property_id,slot_id,vehicle_id,action,reason,actor_user_id,metadata)
       SELECT property_id,id,vehicle_id,'released','Physical checkout confirmed',$3,
              jsonb_build_object('source','lease_checkout','checkout_command_id',$4::uuid)
       FROM released`,
      [checkout.property_id, checkout.resident_id, actorId, checkout.id],
    );
    await client.query(
      `UPDATE parking_slots slot SET slot_status='available',vehicle_id=NULL,updated_at=now()
       FROM parking_zones zone JOIN vehicles vehicle ON vehicle.id=slot.vehicle_id
       WHERE slot.zone_id=zone.id AND zone.property_id=$1 AND vehicle.property_id=$1
         AND vehicle.resident_id=$2 AND slot.slot_status='occupied'`,
      [checkout.property_id, checkout.resident_id],
    );
  }
  private async lockOccupancyAndRoom(client: PoolClient, checkout: CheckoutRow) {
    const occupancy = await client.query<{ id: string }>(
      `SELECT id FROM occupancies WHERE id=$1 AND property_id=$2 AND occupancy_status='active' FOR UPDATE`,
      [checkout.occupancy_id, checkout.property_id],
    );
    if (!occupancy.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_OCCUPANCY_CONFLICT',
        message: 'Active occupancy is required',
      });
    const room = await client.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id=$1 AND property_id=$2 AND room_status='occupied' FOR UPDATE`,
      [checkout.room_id, checkout.property_id],
    );
    if (!room.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_ROOM_CONFLICT',
        message: 'Occupied room is required',
      });
  }
  private async lockEndedOccupancyAndRoom(client: PoolClient, checkout: CheckoutRow) {
    const occupancy = await client.query<{ id: string }>(
      `SELECT id FROM occupancies
       WHERE id=$1 AND property_id=$2 AND occupancy_status='ended' FOR UPDATE`,
      [checkout.occupancy_id, checkout.property_id],
    );
    if (!occupancy.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_OCCUPANCY_CONFLICT',
        message: 'Physical checkout requires an ended occupancy',
      });
    const room = await client.query<{ id: string }>(
      `SELECT id FROM rooms
       WHERE id=$1 AND property_id=$2 AND room_status IN ('inspection_required','maintenance')
       FOR UPDATE`,
      [checkout.room_id, checkout.property_id],
    );
    if (!room.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_ROOM_CONFLICT',
        message: 'Checked-out room must remain under inspection or maintenance',
      });
  }
  private async lockProperty(client: PoolClient, propertyId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM properties WHERE id=$1 AND status='active' FOR UPDATE`,
      [propertyId],
    );
    if (!result.rows[0])
      throw new UnprocessableEntityException({
        code: 'PROPERTY_NOT_ACTIVE',
        message: 'Property is not active',
      });
  }
  private async lockLease(client: PoolClient, leaseId: string) {
    const result = await client.query<LeaseRow>(
      `SELECT id,property_id,occupancy_id,resident_id,room_id,lease_status,start_date::text,end_date::text,
              snapshot_monthly_price,contract_rent_amount
       FROM leases WHERE id=$1 FOR UPDATE`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }
  private async lockCheckout(client: PoolClient, id: string, leaseId: string) {
    const result = await client.query<CheckoutRow>(
      `SELECT id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason,
              exit_type,request_source,notice_days,missing_notice_days,payment_period_days,daily_rate_amount,recommended_short_notice_charge,
              approved_short_notice_charge,short_notice_waiver_reason,approved_at,
              physical_checkout_confirmed_at,actual_checkout_date::text
       FROM lease_checkout_commands WHERE id=$1 AND lease_id=$2 FOR UPDATE`,
      [id, leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'CHECKOUT_COMMAND_NOT_FOUND',
        message: 'Checkout command not found',
      });
    return result.rows[0];
  }
  private async lookupScope(leaseId: string) {
    const result = await this.leases.query<{ property_id: string }>(
      `SELECT property_id FROM leases WHERE id=$1`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }
  private assertAdmin(user: UserAccessContext, propertyId: string, financial = false) {
    if (
      !user.roles.includes('admin') ||
      !user.permissions.includes('lease.manage') ||
      (financial && !user.permissions.includes('billing.manage')) ||
      !user.propertyIds.includes(propertyId)
    )
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an in-scope Admin with lease.manage may mutate checkout',
      });
  }
  private assertActive(lease: LeaseRow) {
    if (lease.lease_status !== 'active')
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Only an active lease may be checked out',
      });
  }
  private assertCheckoutTuple(checkout: CheckoutRow, lease: LeaseRow) {
    if (
      lease.property_id !== checkout.property_id ||
      lease.occupancy_id !== checkout.occupancy_id ||
      lease.room_id !== checkout.room_id ||
      lease.resident_id !== checkout.resident_id
    )
      throw new ConflictException({
        code: 'CHECKOUT_LIFECYCLE_CONFLICT',
        message: 'Checkout no longer matches the lease, occupancy, resident, and room tuple',
      });
  }
  private requireState(checkout: CheckoutRow, expected: string) {
    if (checkout.state !== expected)
      throw new ConflictException({
        code: 'CHECKOUT_STATE_CONFLICT',
        message: `Checkout must be ${expected}`,
      });
  }
  private async jakartaToday(client: PoolClient) {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }
  private async deactivateResidentAfterCheckout(
    client: PoolClient,
    propertyId: string,
    residentId: string,
    actorId: string,
  ) {
    await client.query(
      `UPDATE residents resident
          SET resident_status='inactive',updated_by_user_id=$3,updated_at=now()
        WHERE resident.id=$1 AND resident.property_id=$2
          AND resident.resident_status='active'
          AND NOT EXISTS (
            SELECT 1 FROM leases operational_lease
             WHERE operational_lease.property_id=resident.property_id
               AND operational_lease.resident_id=resident.id
               AND operational_lease.lease_status IN ('awaiting_activation','active')
          )`,
      [residentId, propertyId, actorId],
    );
  }
  private async history(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    type: string,
    actorId: string,
    date: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata) VALUES($1,$2,$3,$4,$5::date,$6::jsonb)`,
      [propertyId, leaseId, type, actorId, date, JSON.stringify(metadata)],
    );
  }
  private async audit(
    client: PoolClient,
    actor: string,
    property: string,
    action: string,
    type: string,
    id: string,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown>,
    context: LeaseAuditContext,
  ) {
    await client.query(
      `INSERT INTO audit_logs(actor_user_id,property_id,action,resource_type,resource_id,before_data,after_data,result_status,ip_address,user_agent,correlation_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'success',$8::inet,$9,$10)`,
      [
        actor,
        property,
        action,
        type,
        id,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
        context.ipAddress ?? null,
        context.userAgent ?? null,
        context.correlationId ?? null,
      ],
    );
  }
  private async outbox(
    client: PoolClient,
    property: string,
    eventKey: string,
    eventType: string,
    aggregate: string,
    id: string,
    actor: string,
    context: LeaseAuditContext,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(event_key) DO NOTHING`,
      [
        property,
        eventKey,
        eventType,
        aggregate,
        id,
        JSON.stringify(payload),
        context.correlationId ?? null,
        actor,
      ],
    );
  }
  private async command<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    rawKey: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    status: number,
    operation: (
      client: PoolClient,
      today: string,
    ) => Promise<{ resourceType: string; resourceId: string; data: T }>,
  ): Promise<IdempotentResult<T>> {
    const key = rawKey?.trim();
    if (!key || key.length < 16 || key.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required',
      });
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ route, actor: user.id, propertyId, payload }))
      .digest('hex');
    return this.leases.transaction(async (client) => {
      const inserted = await client.query<IdempotencyRow>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,correlation_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING request_fingerprint,command_status,response_status,response_body`,
        [propertyId, user.id, route, key, fingerprint, context.correlationId ?? null],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_fingerprint,command_status,response_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [user.id, route, key],
        );
        const row = existing.rows[0];
        if (!row || row.command_status === 'pending' || !row.response_status || !row.response_body)
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command is unavailable for replay',
          });
        if (row.request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used with a different request payload',
          });
        return {
          status: row.response_status,
          body: row.response_body as { data: T },
          replayed: true,
        };
      }
      const result = await operation(client, await this.jakartaToday(client));
      const body = { data: result.data };
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded',response_status=$2,response_body=$3::jsonb,resource_type=$4,resource_id=$5,completed_at=now() WHERE actor_user_id=$1 AND route=$6 AND idempotency_key=$7`,
        [user.id, status, JSON.stringify(body), result.resourceType, result.resourceId, route, key],
      );
      return { status, body, replayed: false };
    });
  }
}
