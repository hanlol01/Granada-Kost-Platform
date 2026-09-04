import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  createBillingReceiptPdf,
  type BillingReceiptDocument,
} from '../billing/helpers/billing-document.helper';
import {
  nextFinancialTransactionCode,
  type FinancialTransactionPurpose,
} from '../billing/helpers/financial-transaction-code.helper';
import {
  W06BillingService,
  type CancelInitialOnboardingFinancialsSummary,
} from '../billing/services/w06-billing.service';
import { CompleteBookingLeadDto } from './dto/complete-booking-lead.dto';
import { CancelBookingLeadPaymentCommitmentDto } from './dto/cancel-booking-lead-payment-commitment.dto';
import { AdminPaymentVerificationPolicyService } from '../billing/services/admin-payment-verification-policy.service';

type ContextRow = {
  lead_id: string;
  property_id: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;
  visitor_university: string | null;
  category: string;
  gender: 'male' | 'female';
  lead_status: string;
  hold_id: string | null;
  hold_status: string | null;
  expires_at: string | Date | null;
  room_id: string | null;
  room_number: string | null;
  room_kost_type_id: string | null;
  room_gender_policy: string | null;
  building_property_id: string | null;
  building_category: string | null;
  kost_type_property_id: string | null;
  kost_type_category: string | null;
  room_status: string | null;
  monthly_price: string | number | null;
  yearly_price: string | number | null;
};

type CommitmentRow = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  hold_id: string;
  room_id: string;
  payment_type: string;
  receipt_code: string;
  transaction_code: string | null;
  rent_credit_amount: string | number;
  security_deposit_amount: string | number;
  payment_method: string;
  verification_status: string;
  payment_note: string | null;
  payment_evidence_file_ids: string[];
  paid_at: Date;
  start_date: string | Date;
  term_months: number;
  end_date: string | Date;
  contract_rent_amount: string | number | null;
  billing_cycle: string;
  payment_plan_type: string;
  materialized_onboarding_commitment_id: string | null;
};

type MaterializedOnboardingTargetRow = {
  resident_id: string;
  lease_id: string;
  lease_status: string;
  room_id: string;
};

export type BookingLeadCompletionContext = {
  lead: {
    id: string;
    visitor_name: string;
    visitor_phone: string;
    visitor_email: string | null;
    visitor_university: string | null;
    category: string;
    gender: 'male' | 'female';
  };
  hold: { id: string; room_id: string; expires_at: string };
  room: {
    id: string;
    kost_type_id: string;
    number: string;
    category: string;
    gender_policy: string;
    monthly_price: number;
    yearly_price: number;
  };
  payment_commitment: LeadPaymentCommitmentResponse;
};

export type LeadPaymentCommitmentResponse = {
  id: string;
  transaction_code: string | null;
  property_id: string;
  booking_lead_id: string;
  hold_id: string;
  room_id: string;
  payment_type: string;
  rent_credit_amount: number;
  security_deposit_amount: number;
  payment_method: string;
  verification_status: string;
  payment_note: string | null;
  payment_evidence_file_ids: string[];
  start_date: string;
  term_months: number;
  end_date: string;
  billing_cycle: string;
  payment_plan_type: string;
  materialized_onboarding_commitment_id: string | null;
};

export type BookingLeadCompletionQuote = {
  property_id: string;
  start_date: string;
  term_months: number;
  billing_cycle: 'monthly' | 'yearly';
  end_date: string;
  contract_rent_amount: number;
  suggested_dp_amount: number;
  lead: {
    id: string;
    category: string;
    gender: 'male' | 'female';
  };
  hold: { id: string; room_id: string; expires_at: string };
  room: {
    id: string;
    kost_type_id: string;
    number: string;
    category: string;
    gender_policy: string;
    monthly_price: number;
    yearly_price: number;
  };
};

type ProgressRow = {
  property_id: string;
  lead_status: string;
  source: string;
  created_at: Date;
  lease_id: string | null;
  room_number: string | null;
  hold_status: string | null;
  hold_room_number: string | null;
  hold_starts_at: Date | null;
  hold_expires_at: Date | null;
  hold_released_at: Date | null;
  hold_release_reason: string | null;
  payment_commitment_id: string | null;
  payment_type: string | null;
  rent_credit_amount: string | number | null;
  security_deposit_amount: string | number | null;
  payment_method: string | null;
  verification_status: string | null;
  payment_start_date: string | Date | null;
  payment_end_date: string | Date | null;
  payment_term_months: number | null;
  payment_materialized_at: Date | null;
  refund_id: string | null;
  refund_amount: string | number | null;
  refund_method: string | null;
  refund_note: string | null;
  refund_evidence_file_ids: string[] | null;
  refunded_at: Date | null;
  onboarding_status: string | null;
  onboarding_committed_at: Date | null;
  lease_status: string | null;
  resident_id: string | null;
  lease_start_date: string | Date | null;
  lease_end_date: string | Date | null;
  lease_term_months: number | null;
  contract_rent_amount: string | number | null;
  occupancy_status: string | null;
  occupancy_started_at: string | Date | null;
  activation_state: string | null;
};

export type BookingLeadProgressResponse = {
  property_id: string;
  source: string;
  lead_status: string;
  recorded_at: string;
  target_room_number: string | null;
  hold: {
    status: string;
    room_number: string | null;
    starts_at: string;
    expires_at: string;
    released_at: string | null;
    release_reason: string | null;
  } | null;
  payment_commitment: {
    id: string;
    payment_type: string;
    rent_credit_amount: number;
    security_deposit_amount: number;
    payment_method: string;
    verification_status: string;
    start_date: string;
    end_date: string;
    term_months: number;
    materialized_at: string | null;
  } | null;
  cancellation: {
    id: string;
    refund_amount: number;
    refund_method: 'cash' | 'bank_transfer';
    refund_note: string | null;
    refund_evidence_file_ids: string[];
    refunded_at: string;
  } | null;
  onboarding: { status: string; committed_at: string | null } | null;
  tenancy: {
    resident_id: string;
    lease_status: string;
    start_date: string;
    end_date: string | null;
    term_months: number | null;
    contract_rent_amount: number;
    occupancy_status: string | null;
    occupancy_started_at: string | null;
    activation_state: string | null;
  } | null;
  payment_summary: {
    verified_amount: number;
    pending_amount: number;
    payment_count: number;
    security_deposit_balance: number;
  };
};

@Injectable()
export class BookingLeadCompletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly billing: W06BillingService,
    @Optional()
    private readonly paymentVerificationPolicy?: AdminPaymentVerificationPolicyService,
  ) {}

  async complete(
    leadId: string,
    dto: CompleteBookingLeadDto,
    actorUserId: string,
    idempotencyKey: string | undefined,
    correlationId?: string,
  ) {
    const key = this.idempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({ lead_id: leadId, payload: dto, actor_id: actorUserId });
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [dto.property_id],
      );
      const replay = await this.claim(
        client,
        dto.property_id,
        actorUserId,
        key,
        fingerprint,
        correlationId,
      );
      if (replay) {
        await client.query('COMMIT');
        return replay;
      }

      const context = await this.lockContext(client, leadId, dto.property_id, true, dto.start_date);
      this.assertEligible(context);
      const rentTotal = this.contractRent(context, dto);
      this.assertPayment(dto, rentTotal);
      const endDate = await this.endDate(client, dto.start_date, dto.term_months);
      const verificationDecision = this.paymentVerificationPolicy?.decide(
        dto.property_id,
        dto.payment_method,
      ) ?? {
        status:
          dto.payment_method === 'cash' ? ('verified' as const) : ('pending_confirmation' as const),
        automaticallyVerified: false,
        policy: { requiresActualPaymentDate: false },
      };
      const verificationStatus = verificationDecision.status;
      if (verificationDecision.policy.requiresActualPaymentDate && !dto.payment_paid_at) {
        throw new BadRequestException({
          code: 'PAYMENT_PAID_AT_REQUIRED',
          message: 'Actual payment date is required while historical-entry mode is active',
        });
      }
      if (dto.payment_method === 'bank_transfer' && !dto.payment_evidence_file_ids?.length) {
        throw new BadRequestException({
          code: 'BOOKING_LEAD_PAYMENT_EVIDENCE_REQUIRED',
          message: 'Bank transfer requires at least one payment evidence file',
        });
      }
      await this.assertPaymentEvidence(
        client,
        dto.payment_evidence_file_ids ?? [],
        dto.property_id,
        actorUserId,
      );
      const inserted = await client.query<CommitmentRow>(
        `INSERT INTO booking_lead_payment_commitments(
            property_id, booking_lead_id, hold_id, room_id, payment_type, receipt_code, transaction_code,
            rent_credit_amount, security_deposit_amount, payment_method, verification_status,
            payment_note, payment_evidence_file_ids, paid_at, start_date, term_months, end_date,
            billing_cycle, payment_plan_type, contract_rent_amount, created_by_user_id
          ) VALUES(
            $1,$2,$3,$4,$5,
            next_billing_document_number(
              $1,
              CASE $5
                WHEN 'booking_fee' THEN 'receipt_booking_fee'
                WHEN 'down_payment' THEN 'receipt_down_payment'
                ELSE 'receipt_full_settlement'
              END,
              now()
            ),
            next_financial_transaction_code(
              'TRX',
              CASE $5
                WHEN 'booking_fee' THEN 'BOOKING'
                WHEN 'down_payment' THEN 'DP'
                ELSE 'LUNAS'
              END,
              COALESCE($12::timestamptz,now())
            ),
            $6,$7,$8,$9,$10,$11::uuid[],COALESCE($12::timestamptz,now()),
            $13::date,$14,$15::date,$16,$17,$18,$19
          )
          RETURNING *`,
        [
          dto.property_id,
          leadId,
          context.hold_id,
          context.room_id,
          dto.payment_type,
          dto.rent_credit_amount,
          dto.security_deposit_amount,
          dto.payment_method,
          verificationStatus,
          dto.payment_note ?? null,
          dto.payment_evidence_file_ids ?? [],
          dto.payment_paid_at ?? null,
          dto.start_date,
          dto.term_months,
          endDate,
          dto.billing_cycle,
          dto.payment_plan_type,
          rentTotal,
          actorUserId,
        ],
      );
      const commitment = inserted.rows[0];
      if (!commitment)
        throw new ConflictException({
          code: 'BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS',
          message: 'Lead already has a payment commitment',
        });
      const promotedHold = await client.query(
        `UPDATE booking_lead_holds
            SET hold_status='committed', updated_at=now()
          WHERE id=$1 AND property_id=$2 AND booking_lead_id=$3 AND room_id=$4
            AND hold_status='active'
          RETURNING id`,
        [context.hold_id, dto.property_id, leadId, context.room_id],
      );
      if (promotedHold.rowCount !== 1) {
        throw new ConflictException({
          code: 'BOOKING_LEAD_HOLD_REQUIRED',
          message: 'Booking lead hold changed before the payment commitment was recorded',
        });
      }
      await client.query(
        `UPDATE booking_leads
         SET status='onboarding', visitor_name=COALESCE($3, visitor_name), visitor_phone=COALESCE($4, visitor_phone),
             visitor_email=COALESCE($5, visitor_email), visitor_university=COALESCE($6, visitor_university), updated_at=now()
         WHERE id=$1 AND property_id=$2`,
        [
          leadId,
          dto.property_id,
          dto.visitor_name ?? null,
          dto.visitor_phone ?? null,
          dto.visitor_email ?? null,
          dto.visitor_university ?? null,
        ],
      );
      const response = this.response(commitment);
      const body = { data: response };
      await this.auditAndOutbox(
        client,
        dto.property_id,
        commitment.id,
        leadId,
        actorUserId,
        correlationId,
        {
          ...response,
          verification_source: verificationDecision.automaticallyVerified
            ? 'automatic_historical_admin_entry'
            : verificationStatus === 'verified'
              ? 'cash_admin_entry'
              : 'manual_review_required',
        },
      );
      await this.completeClaim(client, actorUserId, key, body, commitment.id);
      await client.query('COMMIT');
      return body;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Cancels a Booking Fee/DP commitment before rental completion or while its lease awaits activation. */
  async cancelPaymentCommitment(
    leadId: string,
    dto: CancelBookingLeadPaymentCommitmentDto,
    actorUserId: string,
    idempotencyKey: string | undefined,
    correlationId?: string,
  ) {
    const key = this.idempotencyKey(idempotencyKey);
    const route = 'POST /booking-leads/:leadId/cancel-payment-commitment';
    const fingerprint = this.fingerprint({ lead_id: leadId, payload: dto, actor_id: actorUserId });
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [dto.property_id],
      );
      const replay = await this.claim(
        client,
        dto.property_id,
        actorUserId,
        key,
        fingerprint,
        correlationId,
        route,
      );
      if (replay) {
        await client.query('COMMIT');
        return replay;
      }

      const context = await this.lockContext(client, leadId, dto.property_id);
      if (context.lead_status !== 'onboarding' || context.hold_status !== 'committed') {
        throw new ConflictException({
          code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
          message: 'Only a paid booking lead awaiting activation can be cancelled',
        });
      }
      const commitmentResult = await client.query<CommitmentRow>(
        `SELECT * FROM booking_lead_payment_commitments
         WHERE property_id=$1 AND booking_lead_id=$2
         FOR UPDATE`,
        [dto.property_id, leadId],
      );
      const commitment = commitmentResult.rows[0];
      if (!commitment) {
        throw new ConflictException({
          code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
          message: 'The booking payment commitment is unavailable',
        });
      }
      if (commitment.payment_type === 'full_settlement') {
        throw new ConflictException({
          code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
          message: 'A fully paid booking cannot be cancelled through the Booking Fee / DP flow',
        });
      }
      let materializedTarget: MaterializedOnboardingTargetRow | null = null;
      if (commitment.materialized_onboarding_commitment_id) {
        const target = await client.query<MaterializedOnboardingTargetRow>(
          `SELECT oc.resident_id,oc.lease_id,l.lease_status,l.room_id
           FROM onboarding_commitments oc
           JOIN leases l ON l.id=oc.lease_id AND l.property_id=oc.property_id
           WHERE oc.id=$1 AND oc.property_id=$2 AND oc.booking_lead_id=$3
           FOR UPDATE OF oc,l`,
          [commitment.materialized_onboarding_commitment_id, dto.property_id, leadId],
        );
        materializedTarget = target.rows[0] ?? null;
        if (!materializedTarget || materializedTarget.lease_status !== 'awaiting_activation') {
          throw new ConflictException({
            code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
            message: 'Cancellation is only available while the lease is awaiting activation',
          });
        }
      }
      // A pending bank transfer is not money received yet. The lead may still
      // be cancelled, but it must never create a financial refund for an
      // unverified amount.
      const financialCancellation: CancelInitialOnboardingFinancialsSummary = materializedTarget
        ? await this.billing.cancelInitialOnboardingFinancialsInTransaction(client, {
            propertyId: dto.property_id,
            leaseId: materializedTarget.lease_id,
            actorId: actorUserId,
            reason: dto.refund_note?.trim() || 'Pembatalan penyewaan sebelum aktivasi',
            context: { correlationId },
          })
        : {
            refundedAmount:
              commitment.verification_status === 'verified'
                ? Number(commitment.rent_credit_amount) + Number(commitment.security_deposit_amount)
                : 0,
            reversalIds: [],
            rejectedPaymentIds: [],
            voidedInvoiceIds: [],
          };
      const refundAmount = financialCancellation.refundedAmount;
      const refundEvidenceFileIds = dto.refund_evidence_file_ids ?? [];
      if (
        refundAmount > 0 &&
        dto.refund_method === 'bank_transfer' &&
        refundEvidenceFileIds.length === 0
      ) {
        throw new BadRequestException({
          code: 'BOOKING_LEAD_REFUND_EVIDENCE_REQUIRED',
          message: 'Bank-transfer refunds require a refund proof',
        });
      }
      await this.assertPaymentEvidence(client, refundEvidenceFileIds, dto.property_id, actorUserId);
      const refundTransactionPurpose: FinancialTransactionPurpose = materializedTarget
        ? 'SEWA'
        : commitment.payment_type === 'booking_fee'
          ? 'BOOKING'
          : commitment.payment_type === 'down_payment'
            ? 'DP'
            : 'LUNAS';
      const refundTransactionCode = await nextFinancialTransactionCode(
        client,
        refundAmount > 0 ? 'REF' : 'BTL',
        refundAmount > 0 ? refundTransactionPurpose : 'CANCEL',
      );
      const inserted = await client.query<{
        id: string;
        receipt_code: string;
        refunded_at: string | Date;
      }>(
        `INSERT INTO booking_lead_payment_commitment_refunds(
           property_id,booking_lead_id,commitment_id,hold_id,receipt_code,transaction_code,
           refund_amount,refund_method,refund_note,refund_evidence_file_ids,refunded_by_user_id
          ) VALUES(
            $1,$2,$3,$4,next_billing_document_number($1,'receipt_booking_refund',now()),
            $10,
            $5,$6,$7,$8,$9
         )
         RETURNING id,receipt_code,refunded_at`,
        [
          dto.property_id,
          leadId,
          commitment.id,
          context.hold_id,
          refundAmount,
          dto.refund_method,
          dto.refund_note ?? null,
          refundEvidenceFileIds,
          actorUserId,
          refundTransactionCode,
        ],
      );
      const refund = inserted.rows[0];
      if (!refund)
        throw new ConflictException({
          code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
          message: 'Refund could not be recorded',
        });
      if (materializedTarget) {
        const reason = dto.refund_note?.trim() || 'Pembatalan penyewaan sebelum aktivasi';
        await client.query(
          `UPDATE lease_contract_settlements
           SET state='cancelled',updated_at=now()
           WHERE property_id=$1 AND lease_id=$2 AND state='awaiting_activation'`,
          [dto.property_id, materializedTarget.lease_id],
        );
        await client.query(
          `UPDATE onboarding_commitments
           SET status='cancelled',cancelled_at=now(),cancel_reason=$3,updated_at=now()
           WHERE id=$1 AND property_id=$2 AND status='committed'`,
          [commitment.materialized_onboarding_commitment_id, dto.property_id, reason],
        );
        const cancelledLease = await client.query(
          `UPDATE leases
           SET lease_status='cancelled',closed_at=now(),closed_by_user_id=$3,
               close_reason=$4,updated_at=now()
           WHERE id=$1 AND property_id=$2 AND lease_status='awaiting_activation'`,
          [materializedTarget.lease_id, dto.property_id, actorUserId, reason],
        );
        if (cancelledLease.rowCount !== 1)
          throw new ConflictException({
            code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
            message: 'The lease changed before cancellation was completed',
          });
        await client.query(
          `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
           VALUES($1,$2,'closed',$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`,
          [
            dto.property_id,
            materializedTarget.lease_id,
            actorUserId,
            JSON.stringify({ reason, source: 'booking_lead_cancellation', refund_id: refund.id }),
          ],
        );
        await client.query(
          `UPDATE residents resident
           SET resident_status='archived',archive_reason=$3,
               archive_source='pre_activation_cancellation',archived_at=now(),
               archived_by_user_id=$4,updated_at=now()
           WHERE resident.id=$1 AND resident.property_id=$2
             AND NOT EXISTS (
               SELECT 1 FROM leases lease
               WHERE lease.resident_id=resident.id AND lease.property_id=resident.property_id
                 AND lease.lease_status IN ('awaiting_activation','active')
             )`,
          [materializedTarget.resident_id, dto.property_id, reason, actorUserId],
        );
      }
      const released = await client.query(
        `UPDATE booking_lead_holds SET hold_status='released',released_at=now(),released_by_user_id=$2,updated_at=now()
         WHERE id=$1 AND property_id=$3 AND hold_status='committed'
         RETURNING room_id`,
        [context.hold_id, actorUserId, dto.property_id],
      );
      if (released.rowCount !== 1)
        throw new ConflictException({
          code: 'BOOKING_LEAD_REFUND_UNAVAILABLE',
          message: 'The paid room hold changed before cancellation',
        });
      await client.query(
        `UPDATE rooms room SET room_status='vacant', updated_at=now()
         WHERE room.id=$1 AND room.property_id=$2 AND room.room_status='reserved'
           AND NOT EXISTS (
             SELECT 1 FROM booking_lead_holds hold
             WHERE hold.room_id=room.id AND hold.property_id=room.property_id
               AND hold.hold_status IN ('active','committed')
           )
            AND NOT EXISTS (
              SELECT 1 FROM occupancies occupancy
              WHERE occupancy.room_id=room.id AND occupancy.property_id=room.property_id AND occupancy.occupancy_status='active'
            )
            AND NOT EXISTS (
              SELECT 1 FROM leases lease
              WHERE lease.room_id=room.id AND lease.property_id=room.property_id
                AND lease.lease_status IN ('awaiting_activation','active')
            )`,
        [context.room_id, dto.property_id],
      );
      await client.query(
        `UPDATE booking_leads SET status='cancelled',updated_at=now() WHERE id=$1 AND property_id=$2 AND status='onboarding'`,
        [leadId, dto.property_id],
      );
      const snapshot = {
        refund_id: refund.id,
        commitment_id: commitment.id,
        transaction_code: refundTransactionCode,
        refund_amount: refundAmount,
        refund_method: dto.refund_method,
        refund_evidence_file_ids: refundEvidenceFileIds,
        refunded_at: this.iso(refund.refunded_at),
        lease_id: materializedTarget?.lease_id ?? null,
        reversal_ids: financialCancellation.reversalIds,
        rejected_payment_ids: financialCancellation.rejectedPaymentIds,
        voided_invoice_ids: financialCancellation.voidedInvoiceIds,
      };
      await client.query(
        `INSERT INTO audit_logs(actor_user_id,property_id,action,resource_type,resource_id,after_data,result_status,correlation_id)
         VALUES($1,$2,'booking_lead.payment_commitment_refunded','booking_lead_payment_commitment_refund',$3,$4::jsonb,'success',$5)`,
        [actorUserId, dto.property_id, refund.id, JSON.stringify(snapshot), correlationId ?? null],
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id)
         VALUES($1,$2,'booking_lead.payment_commitment_refunded','booking_lead',$3,$4::jsonb,$5,$6)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          dto.property_id,
          `booking_lead.payment_commitment_refunded:${refund.id}`,
          leadId,
          JSON.stringify(snapshot),
          correlationId ?? null,
          actorUserId,
        ],
      );
      const body = { data: snapshot };
      await this.completeClaim(
        client,
        actorUserId,
        key,
        body,
        refund.id,
        route,
        'booking_lead_payment_commitment_refund',
      );
      await client.query('COMMIT');
      return body;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async context(
    leadId: string,
    propertyId: string,
  ): Promise<{ data: BookingLeadCompletionContext }> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const value = await this.lockContext(client, leadId, propertyId, false);
      this.assertEligible(value, true);
      const commitmentResult = await client.query<CommitmentRow>(
        `SELECT * FROM booking_lead_payment_commitments WHERE booking_lead_id=$1 AND property_id=$2`,
        [leadId, propertyId],
      );
      const commitment = commitmentResult.rows[0];
      if (!commitment)
        throw new ConflictException({
          code: 'BOOKING_LEAD_COMPLETION_UNAVAILABLE',
          message: 'Lead has no usable rental completion context',
        });
      if (commitment.materialized_onboarding_commitment_id) {
        const targetResult = await client.query<MaterializedOnboardingTargetRow>(
          `SELECT resident_id,lease_id
             FROM onboarding_commitments
            WHERE id=$1 AND booking_lead_id=$2 AND property_id=$3`,
          [commitment.materialized_onboarding_commitment_id, leadId, propertyId],
        );
        const target = targetResult.rows[0];
        if (!target) {
          throw new ConflictException({
            code: 'BOOKING_LEAD_COMPLETION_UNAVAILABLE',
            message: 'Lead has no usable rental completion context',
          });
        }
        throw new ConflictException({
          code: 'BOOKING_LEAD_ALREADY_ONBOARDED',
          message: 'Booking lead has already been converted to an onboarding commitment',
          details: { resident_id: target.resident_id, lease_id: target.lease_id },
        });
      }
      await client.query('COMMIT');
      return {
        data: {
          lead: {
            id: value.lead_id,
            visitor_name: value.visitor_name,
            visitor_phone: value.visitor_phone,
            visitor_email: value.visitor_email,
            visitor_university: value.visitor_university,
            category: value.category,
            gender: value.gender,
          },
          hold: {
            id: value.hold_id!,
            room_id: value.room_id!,
            expires_at: this.iso(value.expires_at!),
          },
          room: {
            id: value.room_id!,
            kost_type_id: value.room_kost_type_id!,
            number: value.room_number!,
            category: value.category,
            gender_policy: value.room_gender_policy!,
            monthly_price: Number(value.monthly_price),
            yearly_price: Number(value.yearly_price),
          },
          payment_commitment: this.response(commitment),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async quote(
    leadId: string,
    propertyId: string,
    startDate: string,
    termMonths: number,
  ): Promise<{ data: BookingLeadCompletionQuote }> {
    this.assertQuoteTerms(startDate, termMonths);
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const value = await this.lockContext(client, leadId, propertyId, false, startDate);
      // A quote is also used by /tenants after the lead has been completed to
      // re-check its held room and commercial authority before onboarding.
      // `complete()` remains the only command that rejects a second completion.
      this.assertEligible(value, value.lead_status === 'onboarding');
      const billingCycle = termMonths % 12 === 0 ? 'yearly' : 'monthly';
      const contractRentAmount = this.contractRent(value, {
        billing_cycle: billingCycle,
        term_months: termMonths,
      });
      const endDate = await this.endDate(client, startDate, termMonths);
      await client.query('COMMIT');
      return {
        data: {
          property_id: propertyId,
          start_date: startDate,
          term_months: termMonths,
          billing_cycle: billingCycle,
          end_date: endDate,
          contract_rent_amount: contractRentAmount,
          suggested_dp_amount: Math.ceil(contractRentAmount * 0.25),
          lead: {
            id: value.lead_id,
            category: value.category,
            gender: value.gender,
          },
          hold: {
            id: value.hold_id!,
            room_id: value.room_id!,
            expires_at: this.iso(value.expires_at!),
          },
          room: {
            id: value.room_id!,
            kost_type_id: value.room_kost_type_id!,
            number: value.room_number!,
            category: value.category,
            gender_policy: value.room_gender_policy!,
            monthly_price: Number(value.monthly_price),
            yearly_price: Number(value.yearly_price),
          },
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * The booking stage has no payment_receipt row yet, but its document must
   * look and behave exactly like the established billing receipt once it is
   * downloaded.  The immutable commitment id supplies the stable document
   * number until the payment is materialized into the ledger.
   */
  async paymentCommitmentReceiptDocument(
    leadId: string,
    propertyId: string,
  ): Promise<BillingReceiptDocument> {
    const result = await this.database.client.query<{
      commitment_id: string;
      receipt_code: string;
      transaction_code: string | null;
      payment_type: string;
      payment_method: string;
      verification_status: string;
      rent_credit_amount: string | number;
      paid_at: Date;
      created_at: Date;
      visitor_name: string;
      room_number: string;
      building_code: string | null;
      start_date: string;
      end_date: string | null;
      term_months: number;
      contract_rent_amount: string | number | null;
      property_name: string;
      property_address: string;
      issued_by_name: string | null;
    }>(
      `SELECT commitment.id AS commitment_id,commitment.receipt_code,commitment.transaction_code,
              commitment.payment_type,commitment.payment_method,
              commitment.verification_status,commitment.rent_credit_amount,
              commitment.paid_at,commitment.created_at,
              lead.visitor_name,room.number AS room_number,building.building_code AS building_code,
              commitment.start_date::text AS start_date,commitment.end_date::text AS end_date,
              commitment.term_months,commitment.contract_rent_amount,
              property.name AS property_name,property.address AS property_address,
              issuer.display_name AS issued_by_name
         FROM booking_lead_payment_commitments commitment
         JOIN properties property ON property.id=commitment.property_id
         JOIN booking_leads lead ON lead.id=commitment.booking_lead_id
           AND lead.property_id=commitment.property_id
         JOIN rooms room ON room.id=commitment.room_id AND room.property_id=commitment.property_id
         LEFT JOIN room_buildings building ON building.id=room.building_id AND building.property_id=room.property_id
         LEFT JOIN users issuer ON issuer.id=commitment.created_by_user_id
        WHERE commitment.booking_lead_id=$1 AND commitment.property_id=$2`,
      [leadId, propertyId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'BOOKING_LEAD_RECEIPT_NOT_FOUND',
        message: 'Initial booking payment document is unavailable',
      });
    const verified = row.verification_status === 'verified';
    const documentSubject =
      row.payment_type === 'booking_fee'
        ? 'BOOKING FEE / TAHAN KAMAR'
        : row.payment_type === 'down_payment'
          ? 'DOWN PAYMENT / UANG MUKA'
          : 'PELUNASAN SEWA';
    return createBillingReceiptPdf({
      receiptCode: row.receipt_code,
      paymentCode: row.transaction_code ?? `BKG-${this.documentSuffix(row.commitment_id)}`,
      paymentMethod: row.payment_method,
      paymentPurpose: row.payment_type,
      residentName: row.visitor_name,
      roomNumber: row.room_number,
      buildingCode: row.building_code,
      amount: Number(row.rent_credit_amount),
      paidAt: verified ? row.paid_at : null,
      issuedAt: row.created_at,
      allocations: [],
      documentTitle: `${verified ? 'KUITANSI' : 'NOTA'} ${documentSubject}`,
      documentFootnote: verified
        ? 'Kuitansi ini membuktikan penerimaan pembayaran awal sebelum data penyewaan dikomit.'
        : 'Nota ini belum membuktikan penerimaan dana sampai transfer diverifikasi admin.',
      propertyName: row.property_name,
      propertyAddress: row.property_address,
      issuedByName: row.issued_by_name,
      leaseStart: row.start_date,
      leaseEnd: row.end_date,
      leaseTermMonths: row.term_months,
      periodLabel: row.payment_type === 'booking_fee' ? 'Rencana periode sewa' : 'Periode sewa',
      contractRentAmount:
        row.contract_rent_amount == null ? null : Number(row.contract_rent_amount),
    });
  }

  async cancellationReceiptDocument(
    leadId: string,
    propertyId: string,
  ): Promise<BillingReceiptDocument> {
    const result = await this.database.client.query<{
      refund_id: string;
      receipt_code: string;
      transaction_code: string | null;
      refund_amount: string | number;
      refund_method: string;
      refund_note: string | null;
      refunded_at: Date;
      visitor_name: string;
      room_number: string | null;
      building_code: string | null;
      start_date: string;
      end_date: string;
      term_months: number;
      property_name: string;
      property_address: string;
      issued_by_name: string | null;
    }>(
      `SELECT refund.id AS refund_id,refund.receipt_code,refund.transaction_code,
               refund.refund_amount,refund.refund_method,refund.refund_note,
               refund.refunded_at,lead.visitor_name,room.number AS room_number,
               building.building_code AS building_code,
               commitment.start_date::text AS start_date,commitment.end_date::text AS end_date,
               commitment.term_months
               ,property.name AS property_name,property.address AS property_address,
               issuer.display_name AS issued_by_name
         FROM booking_lead_payment_commitment_refunds refund
         JOIN properties property ON property.id=refund.property_id
         JOIN booking_leads lead ON lead.id=refund.booking_lead_id
           AND lead.property_id=refund.property_id
         JOIN booking_lead_payment_commitments commitment
           ON commitment.id=refund.commitment_id AND commitment.property_id=refund.property_id
         JOIN booking_lead_holds hold ON hold.id=refund.hold_id AND hold.property_id=refund.property_id
         LEFT JOIN rooms room ON room.id=hold.room_id AND room.property_id=refund.property_id
         LEFT JOIN room_buildings building ON building.id=room.building_id AND building.property_id=room.property_id
         LEFT JOIN users issuer ON issuer.id=refund.refunded_by_user_id
        WHERE refund.booking_lead_id=$1 AND refund.property_id=$2`,
      [leadId, propertyId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'BOOKING_LEAD_CANCELLATION_DOCUMENT_NOT_FOUND',
        message: 'Cancellation document is unavailable',
      });
    return createBillingReceiptPdf({
      receiptCode: row.receipt_code,
      paymentCode: row.transaction_code ?? `CNL-${this.documentSuffix(row.refund_id)}`,
      paymentMethod: row.refund_method,
      paymentPurpose: 'payment_commitment_refund',
      residentName: row.visitor_name,
      roomNumber: row.room_number ?? 'Kamar tahanan dibatalkan',
      buildingCode: row.building_code,
      amount: Number(row.refund_amount),
      paidAt: row.refunded_at,
      issuedAt: row.refunded_at,
      allocations: [],
      documentTitle: 'KUITANSI REFUND PEMBATALAN',
      documentFootnote:
        row.refund_note ??
        'Dokumen ini mencatat pengembalian pembayaran awal setelah minat booking dibatalkan.',
      propertyName: row.property_name,
      propertyAddress: row.property_address,
      issuedByName: row.issued_by_name,
      leaseStart: row.start_date,
      leaseEnd: row.end_date,
      leaseTermMonths: row.term_months,
      periodLabel: 'Rencana periode sewa',
    });
  }

  /**
   * Read-only operational detail for the Admin booking queue.  A lead may
   * legitimately stop at any point in this journey, so every relationship is
   * projected independently instead of treating a lead as a lease or an
   * occupancy by implication.
   */
  async progress(
    leadId: string,
    propertyId: string,
  ): Promise<{ data: BookingLeadProgressResponse }> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await client.query<ProgressRow>(
        `SELECT lead.property_id,lead.status AS lead_status,lead.source,lead.created_at,
                COALESCE(lead.lease_id,onboarding.lease_id) AS lease_id,
                target_room.number AS room_number,
                hold.hold_status,held_room.number AS hold_room_number,hold.starts_at AS hold_starts_at,
                hold.expires_at AS hold_expires_at,hold.released_at AS hold_released_at,hold.release_reason AS hold_release_reason,
                commitment.id AS payment_commitment_id,
                commitment.payment_type,commitment.rent_credit_amount,commitment.security_deposit_amount,
                commitment.payment_method,commitment.verification_status,commitment.start_date AS payment_start_date,
                commitment.end_date AS payment_end_date,commitment.term_months AS payment_term_months,
                commitment.materialized_at AS payment_materialized_at,
                refund.id AS refund_id,refund.refund_amount,refund.refund_method,refund.refund_note,
                refund.refund_evidence_file_ids,refund.refunded_at,
                onboarding.status AS onboarding_status,onboarding.committed_at AS onboarding_committed_at,
                lease.resident_id,lease.lease_status,lease.start_date AS lease_start_date,lease.end_date AS lease_end_date,
                lease.term_months AS lease_term_months,lease.contract_rent_amount,
                occupancy.occupancy_status,occupancy.start_date AS occupancy_started_at,
                activation.state AS activation_state
         FROM booking_leads lead
         LEFT JOIN rooms target_room
           ON target_room.id=lead.room_id AND target_room.property_id=lead.property_id
         LEFT JOIN LATERAL (
           SELECT id,hold_status,room_id,starts_at,expires_at,released_at,release_reason
           FROM booking_lead_holds
           WHERE booking_lead_id=lead.id AND property_id=lead.property_id
           ORDER BY CASE hold_status WHEN 'committed' THEN 0 WHEN 'active' THEN 1 WHEN 'released' THEN 2 ELSE 3 END,
                    starts_at DESC,id DESC
           LIMIT 1
         ) hold ON true
         LEFT JOIN rooms held_room
           ON held_room.id=hold.room_id AND held_room.property_id=lead.property_id
         LEFT JOIN booking_lead_payment_commitments commitment
           ON commitment.booking_lead_id=lead.id AND commitment.property_id=lead.property_id
         LEFT JOIN booking_lead_payment_commitment_refunds refund
           ON refund.booking_lead_id=lead.id AND refund.property_id=lead.property_id
         LEFT JOIN onboarding_commitments onboarding
           ON onboarding.id=lead.onboarding_commitment_id AND onboarding.property_id=lead.property_id
         LEFT JOIN leases lease
           ON lease.id=COALESCE(lead.lease_id,onboarding.lease_id)
          AND lease.property_id=lead.property_id
         LEFT JOIN occupancies occupancy
           ON occupancy.id=lease.occupancy_id AND occupancy.property_id=lead.property_id
         LEFT JOIN lease_activation_lifecycles activation
           ON activation.lease_id=lease.id AND activation.property_id=lead.property_id
         WHERE lead.id=$1 AND lead.property_id=$2`,
        [leadId, propertyId],
      );
      const row = result.rows[0];
      if (!row)
        throw new NotFoundException({
          code: 'BOOKING_LEAD_NOT_FOUND',
          message: 'Booking lead not found in this property',
        });

      const financial =
        row.lease_status && row.lease_id
          ? await client.query<{
              verified_amount: string | number;
              pending_amount: string | number;
              payment_count: string | number;
              security_deposit_balance: string | number;
            }>(
              `SELECT
               COALESCE(sum(CASE WHEN payment.payment_status='verified' AND reversal.id IS NULL THEN payment.amount ELSE 0 END),0) AS verified_amount,
               COALESCE(sum(CASE WHEN payment.payment_status='pending_confirmation' THEN payment.amount ELSE 0 END),0) AS pending_amount,
               count(payment.id)::int AS payment_count,
               COALESCE((SELECT sum(CASE ledger.direction WHEN 'credit' THEN ledger.amount ELSE -ledger.amount END)
                         FROM lease_deposit_transactions ledger
                         WHERE ledger.property_id=$1 AND ledger.lease_id=$2),0) AS security_deposit_balance
             FROM payments payment
             LEFT JOIN payment_reversals reversal ON reversal.payment_id=payment.id
             WHERE payment.property_id=$1 AND payment.lease_id=$2`,
              [propertyId, row.lease_id],
            )
          : null;
      const totals = financial?.rows[0] ?? {
        verified_amount: 0,
        pending_amount: 0,
        payment_count: 0,
        security_deposit_balance: 0,
      };
      await client.query('COMMIT');
      return { data: this.progressResponse(row, totals) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private progressResponse(
    row: ProgressRow,
    totals: {
      verified_amount: string | number;
      pending_amount: string | number;
      payment_count: string | number;
      security_deposit_balance: string | number;
    },
  ): BookingLeadProgressResponse {
    return {
      property_id: row.property_id,
      source: row.source,
      lead_status: row.lead_status,
      recorded_at: this.iso(row.created_at),
      target_room_number: row.room_number,
      hold: row.hold_status
        ? {
            status: row.hold_status,
            room_number: row.hold_room_number,
            starts_at: this.iso(row.hold_starts_at!),
            expires_at: this.iso(row.hold_expires_at!),
            released_at: row.hold_released_at ? this.iso(row.hold_released_at) : null,
            release_reason: row.hold_release_reason,
          }
        : null,
      payment_commitment: row.payment_type
        ? {
            id: row.payment_commitment_id!,
            payment_type: row.payment_type,
            rent_credit_amount: Number(row.rent_credit_amount),
            security_deposit_amount: Number(row.security_deposit_amount),
            payment_method: row.payment_method!,
            verification_status: row.verification_status!,
            start_date: this.date(row.payment_start_date!),
            end_date: this.date(row.payment_end_date!),
            term_months: row.payment_term_months!,
            materialized_at: row.payment_materialized_at
              ? this.iso(row.payment_materialized_at)
              : null,
          }
        : null,
      cancellation: row.refund_id
        ? {
            id: row.refund_id,
            refund_amount: Number(row.refund_amount),
            refund_method: row.refund_method as 'cash' | 'bank_transfer',
            refund_note: row.refund_note,
            refund_evidence_file_ids: row.refund_evidence_file_ids ?? [],
            refunded_at: this.iso(row.refunded_at!),
          }
        : null,
      onboarding: row.onboarding_status
        ? {
            status: row.onboarding_status,
            committed_at: row.onboarding_committed_at
              ? this.iso(row.onboarding_committed_at)
              : null,
          }
        : null,
      tenancy: row.lease_status
        ? {
            resident_id: row.resident_id!,
            lease_status: row.lease_status,
            start_date: this.date(row.lease_start_date!),
            end_date: row.lease_end_date ? this.date(row.lease_end_date) : null,
            term_months: row.lease_term_months,
            contract_rent_amount: Number(row.contract_rent_amount),
            occupancy_status: row.occupancy_status,
            occupancy_started_at: row.occupancy_started_at
              ? this.date(row.occupancy_started_at)
              : null,
            activation_state: row.activation_state,
          }
        : null,
      payment_summary: {
        verified_amount: Number(totals.verified_amount),
        pending_amount: Number(totals.pending_amount),
        payment_count: Number(totals.payment_count),
        security_deposit_balance: Number(totals.security_deposit_balance),
      },
    };
  }

  private async lockContext(
    client: PoolClient,
    leadId: string,
    propertyId: string,
    lock = true,
    commercialEffectiveDate: string | null = null,
  ): Promise<ContextRow> {
    const result = await client.query<ContextRow>(
      `SELECT lead.id AS lead_id, lead.property_id, lead.visitor_name, lead.visitor_phone, lead.visitor_email, lead.visitor_university, lead.category, lead.gender, lead.status AS lead_status,
        hold.id AS hold_id, hold.hold_status, hold.expires_at, room.id AS room_id, room.number AS room_number, room.kost_type_id AS room_kost_type_id, room.gender_policy AS room_gender_policy,
        building.property_id AS building_property_id, building.category AS building_category,
        kost_type.property_id AS kost_type_property_id, kost_type.category AS kost_type_category,
        room.room_status,
        commercial.monthly_price, commercial.annual_contract_value AS yearly_price
       FROM booking_leads lead
         LEFT JOIN booking_lead_holds hold ON hold.booking_lead_id=lead.id AND hold.property_id=lead.property_id AND hold.hold_status IN ('active','committed')
       LEFT JOIN rooms room ON room.id=hold.room_id AND room.property_id=lead.property_id
       LEFT JOIN room_buildings building ON building.id=room.building_id AND building.property_id=lead.property_id
       LEFT JOIN kost_types kost_type ON kost_type.id=room.kost_type_id AND kost_type.property_id=lead.property_id
       CROSS JOIN LATERAL (
         SELECT COALESCE(
           $3::date,
           (now() AT TIME ZONE 'Asia/Jakarta')::date
         ) AS target_date
       ) commercial_effective
       LEFT JOIN LATERAL (
         SELECT commercial_version.monthly_price,
                commercial_version.annual_contract_value,
                commercial_version.effective_date
           FROM kost_type_commercial_versions commercial_version
          WHERE commercial_version.kost_type_id=kost_type.id
            AND (
              commercial_version.effective_date <= commercial_effective.target_date
              OR lead.status = 'onboarding'
            )
          ORDER BY
            CASE
              WHEN commercial_version.effective_date <= commercial_effective.target_date
                THEN 0
              ELSE 1
            END,
            CASE
              WHEN commercial_version.effective_date <= commercial_effective.target_date
                THEN commercial_version.effective_date
            END DESC,
            commercial_version.effective_date ASC
          LIMIT 1
       ) commercial ON true
       WHERE lead.id=$1 AND lead.property_id=$2
       ORDER BY commercial.effective_date DESC NULLS LAST
       LIMIT 1${lock ? ' FOR UPDATE OF lead' : ''}`,
      [leadId, propertyId, commercialEffectiveDate],
    );
    const context = result.rows[0];
    if (!context)
      throw new NotFoundException({
        code: 'BOOKING_LEAD_NOT_FOUND',
        message: 'Booking lead not found in this property',
      });
    if (lock && context.hold_id && context.room_id) {
      const locked = await client.query<{ hold_id: string }>(
        `SELECT hold.id AS hold_id
         FROM booking_lead_holds hold
         JOIN rooms room ON room.id=hold.room_id AND room.property_id=hold.property_id
         WHERE hold.id=$1 AND hold.booking_lead_id=$2 AND hold.property_id=$3
         FOR UPDATE OF hold, room`,
        [context.hold_id, leadId, propertyId],
      );
      if (locked.rowCount !== 1)
        throw new ConflictException({
          code: 'BOOKING_LEAD_HOLD_CONTEXT_INVALID',
          message: 'Held room is no longer compatible with this booking lead',
        });
    }
    return context;
  }

  private assertEligible(row: ContextRow, allowCompleted = false): void {
    if (!row.hold_id || !this.hasUsableHold(row, allowCompleted))
      throw new ConflictException({
        code: 'BOOKING_LEAD_HOLD_REQUIRED',
        message: 'An active room hold is required before rental data can be completed',
      });
    if (!allowCompleted && row.lead_status === 'onboarding')
      throw new ConflictException({
        code: 'BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS',
        message: 'Lead rental data has already been completed',
      });
    if (
      !allowCompleted &&
      !['new', 'contacted', 'visit_scheduled', 'negotiating', 'awaiting_dp'].includes(
        row.lead_status,
      )
    )
      throw new ConflictException({
        code: 'BOOKING_LEAD_COMPLETION_UNAVAILABLE',
        message: 'This booking lead cannot be completed in its current status',
      });
    if (allowCompleted && row.lead_status !== 'onboarding')
      throw new ConflictException({
        code: 'BOOKING_LEAD_COMPLETION_UNAVAILABLE',
        message: 'Lead rental data has not been completed',
      });
    if (
      !row.room_id ||
      !row.room_kost_type_id ||
      !row.room_number ||
      !row.monthly_price ||
      !row.yearly_price ||
      row.room_status !== 'reserved' ||
      row.building_property_id !== row.property_id ||
      row.kost_type_property_id !== row.property_id ||
      row.building_category !== row.category ||
      row.kost_type_category !== row.category ||
      (row.room_gender_policy !== 'mixed' && row.room_gender_policy !== row.gender)
    )
      throw new ConflictException({
        code: 'BOOKING_LEAD_HOLD_CONTEXT_INVALID',
        message: 'Held room is no longer compatible with this booking lead',
      });
  }

  private hasUsableHold(row: ContextRow, allowCompleted: boolean): boolean {
    if (!row.hold_id || !row.hold_status) return false;
    if (allowCompleted && row.hold_status === 'committed') return true;
    return (
      row.hold_status === 'active' &&
      !!row.expires_at &&
      new Date(row.expires_at).getTime() > Date.now()
    );
  }

  private contractRent(
    row: ContextRow,
    terms: Pick<CompleteBookingLeadDto, 'billing_cycle' | 'term_months'>,
  ): number {
    const monthly = Number(row.monthly_price);
    const yearly = Number(row.yearly_price);
    return terms.billing_cycle === 'yearly'
      ? yearly * (terms.term_months / 12)
      : monthly * terms.term_months;
  }

  private assertQuoteTerms(startDate: string, termMonths: number): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    const parsed = match ? new Date(`${startDate}T00:00:00.000Z`) : null;
    if (
      !match ||
      !parsed ||
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== Number(match[1]) ||
      parsed.getUTCMonth() + 1 !== Number(match[2]) ||
      parsed.getUTCDate() !== Number(match[3])
    )
      throw new BadRequestException({
        code: 'BOOKING_LEAD_QUOTE_START_DATE_INVALID',
        message: 'Quote requires a valid lease start date',
      });
    if (!Number.isSafeInteger(termMonths) || termMonths < 3 || termMonths > 120)
      throw new BadRequestException({
        code: 'BOOKING_LEAD_QUOTE_TERM_INVALID',
        message: 'Quote requires a lease term between 3 and 120 months',
      });
  }

  private assertPayment(dto: CompleteBookingLeadDto, rentTotal: number): void {
    if (dto.payment_type === 'down_payment' && dto.rent_credit_amount <= 0)
      throw new BadRequestException({
        code: 'DOWN_PAYMENT_AMOUNT_INVALID',
        message: 'DP must be greater than Rp0',
      });
    if (dto.payment_type === 'booking_fee' && dto.rent_credit_amount !== 1000000)
      throw new BadRequestException({
        code: 'BOOKING_FEE_AMOUNT_INVALID',
        message: 'Booking Fee must be exactly Rp1.000.000',
      });
    if (dto.payment_type !== 'full_settlement' && dto.rent_credit_amount > rentTotal)
      throw new BadRequestException({
        code: 'PAYMENT_AMOUNT_EXCEEDS_CONTRACT_RENT',
        message: 'Initial rent payment cannot exceed the contract rent',
      });
    if (dto.payment_type === 'full_settlement' && dto.rent_credit_amount !== rentTotal)
      throw new BadRequestException({
        code: 'FULL_SETTLEMENT_AMOUNT_INVALID',
        message: 'Full settlement must equal the contract rent',
      });
    if (dto.payment_type === 'full_settlement' && dto.payment_plan_type !== 'annual_full')
      throw new BadRequestException({
        code: 'FULL_SETTLEMENT_PLAN_INVALID',
        message: 'Full settlement requires the full-payment plan',
      });
  }

  private async endDate(client: PoolClient, start: string, term: number): Promise<string> {
    const result = await client.query<{ end_date: string }>(
      `SELECT ($1::date + make_interval(months => $2))::date::text AS end_date`,
      [start, term],
    );
    const row = result.rows[0];
    if (!row)
      throw new ConflictException({
        code: 'BOOKING_LEAD_END_DATE_INVALID',
        message: 'Lease end date could not be calculated',
      });
    return row.end_date;
  }

  private async assertPaymentEvidence(
    client: PoolClient,
    fileIds: string[],
    propertyId: string,
    actorUserId: string,
  ): Promise<void> {
    if (fileIds.length === 0) return;
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM files
       WHERE property_id=$1
         AND uploader_user_id=$2
         AND file_purpose='payment_proof'
         AND is_deleted=false
         AND id = ANY($3::uuid[])
       FOR KEY SHARE`,
      [propertyId, actorUserId, fileIds],
    );
    if (result.rows.length !== new Set(fileIds).size) {
      throw new BadRequestException({
        code: 'BOOKING_LEAD_PAYMENT_EVIDENCE_INVALID',
        message: 'Payment evidence is unavailable in the active property',
      });
    }
  }

  private async claim(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
    route = 'POST /booking-leads/:leadId/complete',
  ): Promise<Record<string, unknown> | null> {
    const inserted = await client.query(
      `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,correlation_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rowCount === 1) return null;
    const existing = await client.query<{
      request_fingerprint: string;
      command_status: string;
      response_body: Record<string, unknown> | null;
    }>(
      `SELECT request_fingerprint,command_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row || row.request_fingerprint !== fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was used with another request',
      });
    if (row.command_status !== 'succeeded' || !row.response_body)
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Rental completion is still being processed',
      });
    return row.response_body;
  }

  private async completeClaim(
    client: PoolClient,
    actor: string,
    key: string,
    body: Record<string, unknown>,
    resourceId: string,
    route = 'POST /booking-leads/:leadId/complete',
    resourceType = 'booking_lead_payment_commitment',
  ) {
    await client.query(
      `UPDATE idempotency_commands SET command_status='succeeded',response_status=201,response_body=$3::jsonb,resource_type=$4,resource_id=$5,completed_at=now() WHERE actor_user_id=$1 AND route=$6 AND idempotency_key=$2`,
      [actor, key, JSON.stringify(body), resourceType, resourceId, route],
    );
  }

  private async auditAndOutbox(
    client: PoolClient,
    propertyId: string,
    commitmentId: string,
    leadId: string,
    actor: string,
    correlationId: string | undefined,
    snapshot: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_logs(actor_user_id,property_id,action,resource_type,resource_id,after_data,result_status,correlation_id) VALUES($1,$2,'booking_lead.completed','booking_lead_payment_commitment',$3,$4::jsonb,'success',$5)`,
      [actor, propertyId, commitmentId, JSON.stringify(snapshot), correlationId ?? null],
    );
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id) VALUES($1,$2,'booking_lead.completed','booking_lead',$3,$4::jsonb,$5,$6) ON CONFLICT(event_key) DO NOTHING`,
      [
        propertyId,
        `booking_lead.completed:${commitmentId}`,
        leadId,
        JSON.stringify(snapshot),
        correlationId ?? null,
        actor,
      ],
    );
  }

  response(row: CommitmentRow): LeadPaymentCommitmentResponse {
    return {
      id: row.id,
      transaction_code: row.transaction_code,
      property_id: row.property_id,
      booking_lead_id: row.booking_lead_id,
      hold_id: row.hold_id,
      room_id: row.room_id,
      payment_type: row.payment_type,
      rent_credit_amount: Number(row.rent_credit_amount),
      security_deposit_amount: Number(row.security_deposit_amount),
      payment_method: row.payment_method,
      verification_status: row.verification_status,
      payment_note: row.payment_note,
      payment_evidence_file_ids: row.payment_evidence_file_ids ?? [],
      start_date: this.date(row.start_date),
      term_months: row.term_months,
      end_date: this.date(row.end_date),
      billing_cycle: row.billing_cycle,
      payment_plan_type: row.payment_plan_type,
      materialized_onboarding_commitment_id: row.materialized_onboarding_commitment_id,
    };
  }
  private idempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 16 || key.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required',
      });
    return key;
  }
  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private documentSuffix(id: string): string {
    return id.replace(/-/g, '').slice(0, 16).toUpperCase();
  }
  private iso(value: string | Date): string {
    return new Date(value).toISOString();
  }
  private date(value: string | Date): string {
    return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  }
}
