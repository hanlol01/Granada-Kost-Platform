import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { resolveLeaseCommercialAgreement } from '../billing/helpers/duration-pricing.helper';
import { buildLeaseSettlementPolicyScheduleV3 } from '../billing/helpers/lease-settlement-policy.helper';
import { W06BillingService } from '../billing/services/w06-billing.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import type { CommitLeaseDataCorrectionDto, PreviewLeaseDataCorrectionDto } from './lease.dto';
import {
  calculateCorrectedLeaseEndDate,
  calculateLeaseCorrectionImpact,
} from './lease-data-correction.helper';
import { LeaseRepository } from './lease.repository';

type LeaseCorrectionRow = {
  id: string;
  property_id: string;
  lease_id: string;
  sequence_number: number;
  correction_kind: string;
  previous_snapshot: Record<string, unknown>;
  corrected_snapshot: Record<string, unknown>;
  contract_amount_delta: string;
  additional_charge_amount: string;
  contract_credit_amount: string;
  verified_rent_payment_amount: string;
  outstanding_amount_after: string;
  overpayment_amount_after: string;
  reason: string;
  created_by_user_id: string;
  created_at: Date;
};

type CorrectionContextRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string | null;
  lease_status: string;
  start_date: string;
  end_date: string;
  term_months: number;
  commercial_mode: 'rent' | 'owner_sponsored';
  billing_cycle: 'monthly' | 'yearly';
  billing_anchor_day: number;
  payment_plan_type: 'annual_full' | 'two_month_installments' | 'monthly_installments';
  snapshot_monthly_price: string;
  snapshot_yearly_price: string;
  snapshot_reference_monthly_price: string;
  snapshot_pricing_tier: 'short_stay' | 'medium_stay' | 'long_stay';
  snapshot_commercial_effective_date: string;
  contract_rent_amount: string;
  pricing_source: 'standard' | 'negotiated' | 'owner_sponsored';
  pricing_agreement_reason: string | null;
  snapshot_room_number: string;
  snapshot_kost_type_name: string;
  activated_at: Date | null;
  lifecycle_checked_in_at: Date | null;
  effective_checked_in_date: string | null;
};

type CommercialRow = {
  short_stay_monthly_price: string;
  medium_stay_monthly_price: string;
  long_stay_monthly_price: string;
  annual_contract_value: string;
  effective_date: string;
  management_fee_amount: string | null;
};

type CorrectionSnapshot = {
  startDate: string;
  endDate: string;
  termMonths: number;
  checkedInDate: string | null;
  pricingTier: 'short_stay' | 'medium_stay' | 'long_stay';
  referenceMonthlyPrice: number;
  agreedMonthlyPrice: number;
  contractRentAmount: number;
  pricingSource: 'standard' | 'negotiated' | 'owner_sponsored';
  pricingAgreementReason: string | null;
};

type PreviewResult = {
  leaseId: string;
  propertyId: string;
  commercialMode: 'rent' | 'owner_sponsored';
  previous: CorrectionSnapshot;
  corrected: CorrectionSnapshot;
  impact: ReturnType<typeof calculateLeaseCorrectionImpact>;
  correctionKind: LeaseCorrectionRow['correction_kind'];
  pricingChoiceRequired: boolean;
};

@Injectable()
export class LeaseDataCorrectionService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly billing: W06BillingService,
  ) {}

  async preview(user: UserAccessContext, leaseId: string, dto: PreviewLeaseDataCorrectionDto) {
    return this.leases.transaction(async (client) => {
      const preview = await this.buildPreview(client, user, leaseId, dto, false);
      return { data: this.toPreviewResponse(preview) };
    });
  }

  async list(user: UserAccessContext, leaseId: string) {
    const lease = await this.leases.query<{ property_id: string }>(
      'SELECT property_id FROM leases WHERE id=$1',
      [leaseId],
    );
    if (!lease.rows[0])
      throw new NotFoundException({
        code: 'LEASE_NOT_FOUND',
        message: 'Penyewaan tidak ditemukan',
      });
    this.assertAdmin(user, lease.rows[0].property_id);
    const rows = await this.leases.query<LeaseCorrectionRow>(
      `SELECT id,property_id,lease_id,sequence_number,correction_kind,previous_snapshot,
              corrected_snapshot,contract_amount_delta,additional_charge_amount,
              contract_credit_amount,verified_rent_payment_amount,outstanding_amount_after,
              overpayment_amount_after,reason,created_by_user_id,created_at
         FROM lease_data_corrections
        WHERE lease_id=$1 AND property_id=$2
        ORDER BY sequence_number DESC`,
      [leaseId, lease.rows[0].property_id],
    );
    return { data: { corrections: rows.rows.map((row) => this.toCorrectionResponse(row)) } };
  }

  async commit(
    user: UserAccessContext,
    leaseId: string,
    dto: CommitLeaseDataCorrectionDto,
    idempotencyKey: string | undefined,
  ) {
    const key = idempotencyKey?.trim();
    if (!key)
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Kunci pengiriman koreksi wajib tersedia',
      });
    return this.leases.transaction(async (client) => {
      const leaseScope = await client.query<{ property_id: string }>(
        'SELECT property_id FROM leases WHERE id=$1',
        [leaseId],
      );
      if (!leaseScope.rows[0])
        throw new NotFoundException({
          code: 'LEASE_NOT_FOUND',
          message: 'Penyewaan tidak ditemukan',
        });
      this.assertAdmin(user, leaseScope.rows[0].property_id);
      const commandFingerprint = this.hash(`${leaseScope.rows[0].property_id}:${leaseId}:${key}`);
      const requestFingerprint = this.hash(JSON.stringify(dto));
      const existing = await client.query<LeaseCorrectionRow & { request_fingerprint: string }>(
        `SELECT id,property_id,lease_id,sequence_number,correction_kind,previous_snapshot,
                corrected_snapshot,contract_amount_delta,additional_charge_amount,
                contract_credit_amount,verified_rent_payment_amount,outstanding_amount_after,
                overpayment_amount_after,reason,created_by_user_id,created_at,request_fingerprint
           FROM lease_data_corrections
          WHERE property_id=$1 AND command_fingerprint=$2`,
        [leaseScope.rows[0].property_id, commandFingerprint],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== requestFingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Pengiriman koreksi yang sama dipakai untuk data berbeda',
          });
        return {
          data: { correction: this.toCorrectionResponse(existing.rows[0]) },
          idempotent: true,
        };
      }

      const preview = await this.buildPreview(client, user, leaseId, dto, true);

      const sequence = await client.query<{ next: number }>(
        `SELECT COALESCE(max(sequence_number),0)+1 AS next
           FROM lease_data_corrections WHERE lease_id=$1`,
        [leaseId],
      );
      const correctionId = randomUUID();
      const inserted = await client.query<LeaseCorrectionRow>(
        `INSERT INTO lease_data_corrections(
           id,property_id,lease_id,sequence_number,correction_kind,previous_snapshot,
           corrected_snapshot,contract_amount_delta,additional_charge_amount,
           contract_credit_amount,verified_rent_payment_amount,outstanding_amount_after,
           overpayment_amount_after,reason,created_by_user_id,command_fingerprint,request_fingerprint
         ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id,property_id,lease_id,sequence_number,correction_kind,previous_snapshot,
           corrected_snapshot,contract_amount_delta,additional_charge_amount,
           contract_credit_amount,verified_rent_payment_amount,outstanding_amount_after,
           overpayment_amount_after,reason,created_by_user_id,created_at`,
        [
          correctionId,
          preview.propertyId,
          leaseId,
          Number(sequence.rows[0]?.next ?? 1),
          preview.correctionKind,
          JSON.stringify(preview.previous),
          JSON.stringify(preview.corrected),
          preview.impact.contractDelta,
          preview.impact.additionalCharge,
          preview.impact.contractCredit,
          preview.impact.verifiedRentPayment,
          preview.impact.outstandingAfter,
          preview.impact.overpaymentAfter,
          dto.reason.trim(),
          user.id,
          commandFingerprint,
          requestFingerprint,
        ],
      );

      await this.applyEffectiveLease(client, user.id, leaseId, preview);
      if (preview.impact.contractCredit > 0)
        await this.applyContractCredit(client, correctionId, user.id, preview);
      if (preview.impact.additionalCharge > 0)
        await this.createAdditionalCharge(client, correctionId, user.id, preview);
      if (
        preview.commercialMode === 'rent' &&
        (preview.previous.startDate !== preview.corrected.startDate ||
          preview.previous.termMonths !== preview.corrected.termMonths ||
          preview.previous.agreedMonthlyPrice !== preview.corrected.agreedMonthlyPrice)
      )
        await this.replaceSettlementPolicy(client, user.id, preview);

      await client.query(
        `UPDATE lease_contract_paid_documents
            SET invalidated_at=now(),invalidated_by_lease_correction_id=$3,
                invalidation_reason='Nilai atau periode kontrak dikoreksi oleh Admin'
          WHERE property_id=$1 AND lease_id=$2 AND invalidated_at IS NULL
            AND ($4::bigint<>0 OR $5::boolean)`,
        [
          preview.propertyId,
          leaseId,
          correctionId,
          preview.impact.contractDelta,
          preview.previous.startDate !== preview.corrected.startDate ||
            preview.previous.termMonths !== preview.corrected.termMonths,
        ],
      );
      await client.query(
        `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
         VALUES($1,$2,'lease_data_corrected',$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`,
        [
          preview.propertyId,
          leaseId,
          user.id,
          JSON.stringify({
            correction_id: correctionId,
            sequence_number: Number(sequence.rows[0]?.next ?? 1),
            correction_kind: preview.correctionKind,
            previous: preview.previous,
            corrected: preview.corrected,
            impact: preview.impact,
            reason: dto.reason.trim(),
          }),
        ],
      );
      return {
        data: { correction: this.toCorrectionResponse(inserted.rows[0]) },
        idempotent: false,
      };
    });
  }

  private async buildPreview(
    client: PoolClient,
    user: UserAccessContext,
    leaseId: string,
    dto: PreviewLeaseDataCorrectionDto,
    lock: boolean,
  ): Promise<PreviewResult> {
    const leaseResult = await client.query<CorrectionContextRow>(
      `SELECT lease.id,lease.property_id,lease.resident_id,lease.room_id,lease.occupancy_id,
              lease.lease_status,lease.start_date::text,lease.end_date::text,lease.term_months,lease.commercial_mode,
              lease.billing_cycle,lease.billing_anchor_day,lease.payment_plan_type,
              lease.snapshot_monthly_price,lease.snapshot_yearly_price,
              lease.snapshot_reference_monthly_price,lease.snapshot_pricing_tier,
              lease.snapshot_commercial_effective_date::text,lease.contract_rent_amount,
              lease.pricing_source,lease.pricing_agreement_reason,lease.snapshot_room_number,
              lease.snapshot_kost_type_name,lease.activated_at,lifecycle.checked_in_at AS lifecycle_checked_in_at,
              COALESCE(
                latest_correction.corrected_snapshot->>'checkedInDate',
                lifecycle.checked_in_at::date::text,
                check_in_history.event_date::text,
                occupancy.start_date::text
              ) AS effective_checked_in_date
         FROM leases lease
         LEFT JOIN lease_activation_lifecycles lifecycle
           ON lifecycle.lease_id=lease.id AND lifecycle.property_id=lease.property_id
         LEFT JOIN occupancies occupancy ON occupancy.id=lease.occupancy_id
         LEFT JOIN LATERAL (
           SELECT correction.corrected_snapshot
             FROM lease_data_corrections correction
            WHERE correction.lease_id=lease.id AND correction.property_id=lease.property_id
              AND correction.corrected_snapshot ? 'checkedInDate'
            ORDER BY correction.sequence_number DESC LIMIT 1
         ) latest_correction ON true
         LEFT JOIN LATERAL (
           SELECT history.event_date
             FROM occupancy_history history
            WHERE history.occupancy_id=lease.occupancy_id AND history.event_type='check_in'
            ORDER BY history.created_at ASC,history.id ASC LIMIT 1
         ) check_in_history ON true
        WHERE lease.id=$1 ${lock ? 'FOR UPDATE OF lease' : ''}`,
      [leaseId],
    );
    const lease = leaseResult.rows[0];
    if (!lease)
      throw new NotFoundException({
        code: 'LEASE_NOT_FOUND',
        message: 'Penyewaan tidak ditemukan',
      });
    this.assertAdmin(user, lease.property_id);
    if (!['awaiting_activation', 'active'].includes(lease.lease_status))
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_STATUS_INVALID',
        message: 'Koreksi hanya tersedia untuk penyewaan yang belum selesai',
      });
    const checkout = await client.query<{ id: string }>(
      `SELECT id FROM lease_checkout_commands
        WHERE lease_id=$1 AND property_id=$2 AND state<>'cancelled' LIMIT 1`,
      [leaseId, lease.property_id],
    );
    if (checkout.rows[0])
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_CHECKOUT_BLOCKED',
        message: 'Batalkan proses check-out sebelum mengoreksi data penyewaan',
      });

    const previous: CorrectionSnapshot = {
      startDate: lease.start_date,
      endDate: lease.end_date,
      termMonths: Number(lease.term_months),
      checkedInDate: lease.effective_checked_in_date,
      pricingTier: lease.snapshot_pricing_tier,
      referenceMonthlyPrice: Number(lease.snapshot_reference_monthly_price),
      agreedMonthlyPrice: Number(lease.snapshot_monthly_price),
      contractRentAmount: Number(lease.contract_rent_amount),
      pricingSource: lease.pricing_source,
      pricingAgreementReason: lease.pricing_agreement_reason,
    };
    const startDate = dto.start_date ?? previous.startDate;
    const termMonths = dto.term_months ?? previous.termMonths;
    const checkedInDate = dto.checked_in_date ?? previous.checkedInDate;
    const endDate = calculateCorrectedLeaseEndDate(startDate, termMonths);
    const today = this.today();
    if (endDate <= today)
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_END_PASSED',
        message: 'Tanggal akhir hasil koreksi sudah lewat. Gunakan proses check-out',
      });
    if (checkedInDate && startDate > checkedInDate)
      throw new UnprocessableEntityException({
        code: 'LEASE_DATA_CORRECTION_START_AFTER_CHECK_IN',
        message: 'Tanggal mulai kontrak tidak boleh setelah tanggal check-in',
      });
    if (dto.checked_in_date && !previous.checkedInDate)
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_CHECK_IN_NOT_RECORDED',
        message: 'Gunakan alur check-in untuk penghuni yang belum pernah tercatat check-in',
      });
    if (checkedInDate && checkedInDate > today)
      throw new UnprocessableEntityException({
        code: 'LEASE_DATA_CORRECTION_CHECK_IN_FUTURE',
        message: 'Tanggal check-in tidak boleh berada di masa depan',
      });
    const overlap = await client.query<{ id: string }>(
      `SELECT id FROM leases
        WHERE room_id=$1 AND property_id=$2 AND id<>$3
          AND lease_status IN ('draft','awaiting_activation','active')
          AND daterange(start_date,end_date,'[)') && daterange($4::date,$5::date,'[)')
        LIMIT 1`,
      [lease.room_id, lease.property_id, leaseId, startDate, endDate],
    );
    if (overlap.rows[0])
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_ROOM_CONFLICT',
        message: 'Periode hasil koreksi bertabrakan dengan penyewaan lain pada kamar ini',
      });

    const periodChanged = startDate !== previous.startDate || termMonths !== previous.termMonths;
    const pricingChanged =
      dto.pricing_source != null ||
      dto.agreed_monthly_price != null ||
      dto.pricing_agreement_reason != null;
    if (lease.commercial_mode === 'owner_sponsored' && pricingChanged)
      throw new UnprocessableEntityException({
        code: 'LEASE_DATA_CORRECTION_OWNER_SPONSORED_PRICING_IMMUTABLE',
        message:
          'Hunian Tanggungan Owner tidak menggunakan tarif sewa. Koreksi hanya dapat mengubah tanggal atau durasi.',
      });
    let corrected: CorrectionSnapshot;
    if (!periodChanged && !pricingChanged) {
      // A historical check-in correction must not silently re-price the contract.
      corrected = { ...previous, checkedInDate };
    } else {
      const commercial = await this.commercialAt(client, lease.room_id, startDate);
      if (lease.commercial_mode === 'owner_sponsored') {
        const pricingTier =
          termMonths <= 5 ? 'short_stay' : termMonths <= 11 ? 'medium_stay' : 'long_stay';
        const referenceMonthlyPrice = Number(
          pricingTier === 'short_stay'
            ? commercial.short_stay_monthly_price
            : pricingTier === 'medium_stay'
              ? commercial.medium_stay_monthly_price
              : commercial.long_stay_monthly_price,
        );
        corrected = {
          startDate,
          endDate,
          termMonths,
          checkedInDate,
          pricingTier,
          referenceMonthlyPrice,
          agreedMonthlyPrice: 0,
          contractRentAmount: 0,
          pricingSource: 'owner_sponsored',
          pricingAgreementReason: null,
        };
      } else {
        const pricingSource = periodChanged
          ? (dto.pricing_source ?? (termMonths < 3 ? 'negotiated' : 'standard'))
          : (dto.pricing_source ?? previous.pricingSource);
        let agreement;
        try {
          agreement = resolveLeaseCommercialAgreement(
            {
              shortStayMonthlyPrice: Number(commercial.short_stay_monthly_price),
              mediumStayMonthlyPrice: Number(commercial.medium_stay_monthly_price),
              longStayMonthlyPrice: Number(commercial.long_stay_monthly_price),
            },
            {
              termMonths,
              pricingSource: pricingSource as 'standard' | 'negotiated',
              agreedMonthlyPrice:
                pricingSource === 'negotiated'
                  ? (dto.agreed_monthly_price ?? previous.agreedMonthlyPrice)
                  : undefined,
              managementFeeAmount: Number(commercial.management_fee_amount ?? 0),
              agreementReason:
                pricingSource === 'negotiated'
                  ? (dto.pricing_agreement_reason ?? previous.pricingAgreementReason ?? undefined)
                  : undefined,
              varianceAcknowledged: dto.pricing_variance_acknowledged,
            },
          );
        } catch (error) {
          throw new UnprocessableEntityException({
            code: 'LEASE_DATA_CORRECTION_COMMERCIAL_INVALID',
            message:
              error instanceof Error
                ? this.localizeCommercialError(error.message)
                : 'Tarif hasil koreksi tidak valid',
          });
        }
        corrected = {
          startDate,
          endDate,
          termMonths,
          checkedInDate,
          pricingTier: agreement.pricingTier,
          referenceMonthlyPrice: agreement.referenceMonthlyPrice,
          agreedMonthlyPrice: agreement.agreedMonthlyPrice,
          contractRentAmount: agreement.contractRent,
          pricingSource: agreement.pricingSource,
          pricingAgreementReason: agreement.agreementReason,
        };
      }
    }
    if (JSON.stringify(previous) === JSON.stringify(corrected))
      throw new UnprocessableEntityException({
        code: 'LEASE_DATA_CORRECTION_NO_CHANGES',
        message: 'Belum ada data yang berubah',
      });
    const paid = await client.query<{ amount: string }>(
      `SELECT COALESCE(sum(allocation.allocated_amount-COALESCE(reversal.amount,0)),0)::text AS amount
         FROM payment_allocations allocation
         JOIN payments payment ON payment.id=allocation.payment_id AND payment.payment_status='verified'
         JOIN invoices invoice ON invoice.id=allocation.invoice_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(item.reversed_amount),0) AS amount
             FROM payment_reversal_allocations item
            WHERE item.original_allocation_id=allocation.id
         ) reversal ON true
        WHERE allocation.lease_id=$1 AND allocation.allocation_status='active'
          AND invoice.invoice_purpose='rent' AND invoice.invoice_status<>'void'`,
      [leaseId],
    );
    const correctionKind = this.correctionKind(previous, corrected);
    return {
      leaseId,
      propertyId: lease.property_id,
      commercialMode: lease.commercial_mode,
      previous,
      corrected,
      impact: calculateLeaseCorrectionImpact(
        previous.contractRentAmount,
        corrected.contractRentAmount,
        Number(paid.rows[0]?.amount ?? 0),
      ),
      correctionKind,
      pricingChoiceRequired:
        lease.commercial_mode === 'rent' &&
        periodChanged &&
        previous.pricingTier !== corrected.pricingTier &&
        dto.pricing_source == null,
    };
  }

  private async commercialAt(client: PoolClient, roomId: string, date: string) {
    const result = await client.query<CommercialRow>(
      `SELECT commercial.short_stay_monthly_price::text,
              commercial.medium_stay_monthly_price::text,
              commercial.long_stay_monthly_price::text,
              commercial.annual_contract_value::text,commercial.effective_date::text,
              fee.monthly_fee_amount::text AS management_fee_amount
         FROM rooms room
         JOIN LATERAL (
           SELECT short_stay_monthly_price,medium_stay_monthly_price,
                  long_stay_monthly_price,annual_contract_value,effective_date
             FROM kost_type_commercial_versions
            WHERE kost_type_id=room.kost_type_id AND effective_date<=$2::date
            ORDER BY effective_date DESC,id DESC LIMIT 1
         ) commercial ON true
         LEFT JOIN LATERAL (
           SELECT monthly_fee_amount FROM property_management_fee_versions
            WHERE property_id=room.property_id AND effective_date<=$2::date
            ORDER BY effective_date DESC,id DESC LIMIT 1
         ) fee ON true
        WHERE room.id=$1`,
      [roomId, date],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_PRICING_MISSING',
        message: 'Tarif yang berlaku pada tanggal hasil koreksi tidak tersedia',
      });
    return result.rows[0];
  }

  private async applyEffectiveLease(
    client: PoolClient,
    actorId: string,
    leaseId: string,
    preview: PreviewResult,
  ) {
    const commercialChanged =
      preview.previous.startDate !== preview.corrected.startDate ||
      preview.previous.termMonths !== preview.corrected.termMonths ||
      preview.previous.agreedMonthlyPrice !== preview.corrected.agreedMonthlyPrice ||
      preview.previous.pricingSource !== preview.corrected.pricingSource;
    await client.query(
      `UPDATE leases SET start_date=$2::date,end_date=$3::date,term_months=$4,
              snapshot_monthly_price=CASE WHEN $13 THEN $5 ELSE snapshot_monthly_price END,
              snapshot_yearly_price=CASE WHEN $13 THEN $5*12 ELSE snapshot_yearly_price END,
              contract_rent_amount=CASE WHEN $13 THEN $6 ELSE contract_rent_amount END,
              dp_required_amount=CASE WHEN $13 THEN CEIL($6::numeric*0.25)::bigint ELSE dp_required_amount END,
              snapshot_pricing_tier=CASE WHEN $13 THEN $7 ELSE snapshot_pricing_tier END,
              snapshot_commercial_effective_date=CASE WHEN $13 THEN $2::date ELSE snapshot_commercial_effective_date END,
              snapshot_reference_monthly_price=CASE WHEN $13 THEN $8 ELSE snapshot_reference_monthly_price END,
              pricing_source=CASE WHEN $13 THEN $9 ELSE pricing_source END,
              pricing_agreement_reason=CASE WHEN $13 THEN $10 ELSE pricing_agreement_reason END,
              pricing_agreed_by_user_id=CASE WHEN $13 THEN $11 ELSE pricing_agreed_by_user_id END,
              pricing_agreed_at=CASE WHEN $13 THEN now() ELSE pricing_agreed_at END,
              next_billing_date=CASE WHEN lease_status='awaiting_activation' THEN $2::date ELSE next_billing_date END,
              updated_by_user_id=$11,updated_at=now()
        WHERE id=$1 AND property_id=$12`,
      [
        leaseId,
        preview.corrected.startDate,
        preview.corrected.endDate,
        preview.corrected.termMonths,
        preview.corrected.agreedMonthlyPrice,
        preview.corrected.contractRentAmount,
        preview.corrected.pricingTier,
        preview.corrected.referenceMonthlyPrice,
        preview.corrected.pricingSource,
        preview.corrected.pricingAgreementReason,
        actorId,
        preview.propertyId,
        commercialChanged,
      ],
    );
    if (preview.commercialMode === 'owner_sponsored' && commercialChanged)
      await client.query(
        `UPDATE owner_sponsored_lease_terms term
            SET projected_management_fee_amount=progress.current_projected_management_fee_amount,
                updated_at=now()
           FROM owner_sponsored_management_fee_progress progress
          WHERE progress.term_id=term.id AND term.lease_id=$1 AND term.property_id=$2`,
        [leaseId, preview.propertyId],
      );
    if (preview.corrected.checkedInDate !== preview.previous.checkedInDate) {
      await client.query(
        `UPDATE lease_activation_lifecycles
            SET checked_in_at=(($3::date+TIME '00:00') AT TIME ZONE 'Asia/Jakarta'),
                checked_in_by_user_id=$4,updated_at=now()
          WHERE lease_id=$1 AND property_id=$2 AND checked_in_at IS NOT NULL`,
        [leaseId, preview.propertyId, preview.corrected.checkedInDate, actorId],
      );
      await client.query(
        `UPDATE occupancies SET start_date=$3::date,updated_at=now()
          WHERE id=(SELECT occupancy_id FROM leases WHERE id=$1 AND property_id=$2)`,
        [leaseId, preview.propertyId, preview.corrected.checkedInDate],
      );
    }
    await client.query(
      `UPDATE lease_activation_lifecycles lifecycle
          SET cutoff_at=(($3::date+TIME '00:05') AT TIME ZONE 'Asia/Jakarta'),
              check_in_due_at=(($3::date+1+TIME '00:05') AT TIME ZONE 'Asia/Jakarta'),
              updated_at=now()
        WHERE lifecycle.lease_id=$1 AND lifecycle.property_id=$2 AND lifecycle.state='scheduled'`,
      [leaseId, preview.propertyId, preview.corrected.startDate],
    );
  }

  private async applyContractCredit(
    client: PoolClient,
    correctionId: string,
    actorId: string,
    preview: PreviewResult,
  ) {
    const invoices = await client.query<{
      id: string;
      total_amount: string;
      credit_amount: string;
    }>(
      `SELECT id,total_amount,credit_amount FROM invoices
        WHERE lease_id=$1 AND property_id=$2 AND invoice_purpose='rent'
          AND authority_source='contract_schedule' AND invoice_status<>'void'
        ORDER BY due_date DESC,id DESC FOR UPDATE`,
      [preview.leaseId, preview.propertyId],
    );
    let remaining = preview.impact.contractCredit;
    for (const invoice of invoices.rows) {
      if (remaining === 0) break;
      const available = Math.max(Number(invoice.total_amount) - Number(invoice.credit_amount), 0);
      const amount = Math.min(remaining, available);
      if (amount === 0) continue;
      await client.query(
        `INSERT INTO lease_data_correction_invoice_credits(
           property_id,correction_id,lease_id,invoice_id,amount,
           invoice_credit_before_amount,created_by_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          preview.propertyId,
          correctionId,
          preview.leaseId,
          invoice.id,
          amount,
          Number(invoice.credit_amount),
          actorId,
        ],
      );
      await client.query(
        'UPDATE invoices SET credit_amount=credit_amount+$2,updated_at=now() WHERE id=$1 AND property_id=$3',
        [invoice.id, amount, preview.propertyId],
      );
      await this.billing.reconcileInvoiceLifecycleInTransaction(
        client,
        preview.propertyId,
        invoice.id,
      );
      remaining -= amount;
    }
    if (remaining !== 0)
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_CREDIT_EXCEEDS_AUTHORITY',
        message: 'Kredit koreksi melebihi nilai tagihan sewa yang tersimpan',
      });
  }

  private async createAdditionalCharge(
    client: PoolClient,
    correctionId: string,
    actorId: string,
    preview: PreviewResult,
  ) {
    const sequence = await client.query<{ next: number }>(
      'SELECT COALESCE(max(sequence_number),0)+1 AS next FROM lease_installments WHERE lease_id=$1',
      [preview.leaseId],
    );
    const installmentId = randomUUID();
    const invoiceId = randomUUID();
    const installmentSequence = Number(sequence.rows[0]?.next ?? 1);
    const dueDate =
      preview.corrected.startDate > this.today() ? preview.corrected.startDate : this.today();
    await client.query(
      `INSERT INTO lease_installments(
         id,property_id,lease_id,sequence_number,coverage_start_date,coverage_end_date,
         due_date,scheduled_amount,installment_status
       ) VALUES($1,$2,$3,$4,$5::date,$6::date-1,$7::date,$8,'issued')`,
      [
        installmentId,
        preview.propertyId,
        preview.leaseId,
        installmentSequence,
        preview.corrected.startDate,
        preview.corrected.endDate,
        dueDate,
        preview.impact.additionalCharge,
      ],
    );
    await client.query(
      `INSERT INTO invoices(
         id,property_id,resident_id,room_id,occupancy_id,billing_period_id,lease_id,installment_id,
         invoice_code,invoice_status,subtotal_amount,total_amount,due_date,issued_at,
         snapshot_period_key,snapshot_period_start_date,snapshot_period_end_date,
         snapshot_room_number,snapshot_resident_name,snapshot_monthly_price,
         cycle_start_date,cycle_end_date,snapshot_billing_cycle,snapshot_rent_amount,
         generation_source,invoice_purpose,authority_source,snapshot_building_code,
         snapshot_category_name,snapshot_contract_rent_amount,snapshot_payment_plan_type,
         command_fingerprint,created_by_user_id
       ) SELECT $1,$2,lease.resident_id,lease.room_id,lease.occupancy_id,NULL,lease.id,$3,
           $4,'issued',$5,$5,$6::date,now(),$7,$8::date,$9::date-1,
           lease.snapshot_room_number,resident.full_name,$10,$8::date,$9::date-1,
           lease.billing_cycle,$5,'manual','rent','contract_schedule',building.building_code,
           lease.snapshot_kost_type_name,$11,lease.payment_plan_type,$12,$13
         FROM leases lease JOIN residents resident ON resident.id=lease.resident_id
         JOIN rooms room ON room.id=lease.room_id
         JOIN room_buildings building ON building.id=room.building_id
        WHERE lease.id=$14 AND lease.property_id=$2`,
      [
        invoiceId,
        preview.propertyId,
        installmentId,
        `KOREKSI-${preview.leaseId.slice(0, 8).toUpperCase()}-${installmentSequence}`,
        preview.impact.additionalCharge,
        dueDate,
        `LEASE-CORRECTION-${correctionId}`,
        preview.corrected.startDate,
        preview.corrected.endDate,
        preview.corrected.agreedMonthlyPrice,
        preview.corrected.contractRentAmount,
        `lease-correction:${correctionId}`,
        actorId,
        preview.leaseId,
      ],
    );
    await client.query(
      `INSERT INTO invoice_line_items(invoice_id,line_type,description,quantity,unit_amount,total_amount,sort_order,metadata)
       VALUES($1,'adjustment','Tambahan kewajiban dari koreksi data penyewaan',1,$2,$2,0,$3::jsonb)`,
      [invoiceId, preview.impact.additionalCharge, JSON.stringify({ correction_id: correctionId })],
    );
    await client.query('UPDATE lease_installments SET invoice_id=$2 WHERE id=$1', [
      installmentId,
      invoiceId,
    ]);
    await this.billing.reconcileInvoiceLifecycleInTransaction(
      client,
      preview.propertyId,
      invoiceId,
    );
  }

  private async replaceSettlementPolicy(
    client: PoolClient,
    actorId: string,
    preview: PreviewResult,
  ) {
    const settlement = await client.query<{ id: string; state: string }>(
      'SELECT id,state FROM lease_contract_settlements WHERE lease_id=$1 AND property_id=$2 FOR UPDATE',
      [preview.leaseId, preview.propertyId],
    );
    if (!settlement.rows[0]) return;
    const schedule = buildLeaseSettlementPolicyScheduleV3({
      leaseStartDate: preview.corrected.startDate,
      termMonths: preview.corrected.termMonths,
      monthlyRentAmount: preview.corrected.agreedMonthlyPrice,
    });
    const policyId = randomUUID();
    await client.query(
      `INSERT INTO lease_settlement_policy_snapshots(
         id,property_id,lease_id,policy_version,term_months,checkpoint_anchor_day,
         monthly_rent_amount,initial_month_minimum_amount,final_settlement_offset_months,
         grace_period_days,maximum_extension_days,early_termination_notice_days,created_by_user_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,3,14,14,$10)`,
      [
        policyId,
        preview.propertyId,
        preview.leaseId,
        schedule.policyVersion,
        preview.corrected.termMonths,
        schedule.checkpointAnchorDay,
        preview.corrected.agreedMonthlyPrice,
        schedule.initialMonthMinimumAmount,
        schedule.finalSettlementOffsetMonths,
        actorId,
      ],
    );
    for (const checkpoint of schedule.checkpoints) {
      const checkpointId = randomUUID();
      await client.query(
        `INSERT INTO lease_settlement_checkpoints(
           id,property_id,lease_id,policy_snapshot_id,checkpoint_code,checkpoint_sequence,
           settlement_mode,due_at,minimum_required_amount
         ) VALUES($1,$2,$3,$4,$5,$6,$7,
           (($8::date+INTERVAL '1 day'-INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta'),$9)`,
        [
          checkpointId,
          preview.propertyId,
          preview.leaseId,
          policyId,
          checkpoint.code,
          checkpoint.sequence,
          checkpoint.settlementMode,
          checkpoint.dueDate,
          checkpoint.minimumRequiredAmount,
        ],
      );
      await client.query(
        `INSERT INTO lease_settlement_checkpoint_events(
           property_id,lease_id,checkpoint_id,event_type,actor_user_id,metadata
         ) VALUES($1,$2,$3,'scheduled',$4,$5::jsonb)`,
        [
          preview.propertyId,
          preview.leaseId,
          checkpointId,
          actorId,
          JSON.stringify({ source: 'lease_data_correction', due_date: checkpoint.dueDate }),
        ],
      );
    }
    await client.query(
      `UPDATE lease_contract_settlements SET policy_snapshot_id=$3,
              state=CASE WHEN state='awaiting_activation' THEN state
                         WHEN $4::bigint=0 THEN 'paid' ELSE 'open' END,
              updated_at=now()
        WHERE lease_id=$1 AND property_id=$2`,
      [preview.leaseId, preview.propertyId, policyId, preview.impact.outstandingAfter],
    );
  }

  private correctionKind(previous: CorrectionSnapshot, corrected: CorrectionSnapshot) {
    const checkIn = previous.checkedInDate !== corrected.checkedInDate;
    const start = previous.startDate !== corrected.startDate;
    const term = previous.termMonths !== corrected.termMonths;
    if (checkIn && !start && !term) return 'check_in_date';
    if (start && term && !checkIn) return 'contract_period';
    if (start && !term && !checkIn) return 'contract_start';
    if (term && !start && !checkIn) return 'contract_term';
    return 'combined';
  }

  private toPreviewResponse(preview: PreviewResult) {
    return {
      lease_id: preview.leaseId,
      property_id: preview.propertyId,
      previous: this.snapshotResponse(preview.previous),
      corrected: this.snapshotResponse(preview.corrected),
      impact: {
        contract_amount_delta: preview.impact.contractDelta,
        additional_charge_amount: preview.impact.additionalCharge,
        contract_credit_amount: preview.impact.contractCredit,
        verified_rent_payment_amount: preview.impact.verifiedRentPayment,
        outstanding_amount_after: preview.impact.outstandingAfter,
        overpayment_amount_after: preview.impact.overpaymentAfter,
      },
      correction_kind: preview.correctionKind,
      pricing_choice_required: preview.pricingChoiceRequired,
    };
  }

  private toCorrectionResponse(row: LeaseCorrectionRow) {
    return {
      id: row.id,
      property_id: row.property_id,
      lease_id: row.lease_id,
      sequence_number: Number(row.sequence_number),
      correction_kind: row.correction_kind,
      previous: this.snapshotResponse(row.previous_snapshot as unknown as CorrectionSnapshot),
      corrected: this.snapshotResponse(row.corrected_snapshot as unknown as CorrectionSnapshot),
      impact: {
        contract_amount_delta: Number(row.contract_amount_delta),
        additional_charge_amount: Number(row.additional_charge_amount),
        contract_credit_amount: Number(row.contract_credit_amount),
        verified_rent_payment_amount: Number(row.verified_rent_payment_amount),
        outstanding_amount_after: Number(row.outstanding_amount_after),
        overpayment_amount_after: Number(row.overpayment_amount_after),
      },
      reason: row.reason,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at.toISOString(),
    };
  }

  private snapshotResponse(snapshot: CorrectionSnapshot) {
    return {
      start_date: snapshot.startDate,
      end_date: snapshot.endDate,
      term_months: snapshot.termMonths,
      checked_in_date: snapshot.checkedInDate,
      pricing_tier: snapshot.pricingTier,
      reference_monthly_price: snapshot.referenceMonthlyPrice,
      agreed_monthly_price: snapshot.agreedMonthlyPrice,
      contract_rent_amount: snapshot.contractRentAmount,
      pricing_source: snapshot.pricingSource,
      pricing_agreement_reason: snapshot.pricingAgreementReason,
    };
  }

  private assertAdmin(user: UserAccessContext, propertyId: string) {
    if (
      !user.roles.includes('admin') ||
      !user.permissions.includes('lease.manage') ||
      (!user.roles.includes('owner') && !user.propertyIds.includes(propertyId))
    )
      throw new ForbiddenException({
        code: 'LEASE_DATA_CORRECTION_FORBIDDEN',
        message: 'Hanya Admin properti yang dapat mengoreksi data penyewaan',
      });
  }

  private today() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private localizeCommercialError(message: string) {
    if (message.includes('One- and two-month'))
      return 'Durasi 1-2 bulan wajib memakai tarif kesepakatan';
    if (message.includes('agreement reason'))
      return 'Catatan kesepakatan tarif wajib diisi 3-500 karakter';
    if (message.includes('management fee'))
      return 'Tarif kesepakatan harus lebih besar dari biaya pengelolaan';
    if (message.includes('explicit acknowledgement'))
      return 'Perubahan tarif yang besar wajib dikonfirmasi oleh Admin';
    return 'Tarif hasil koreksi tidak valid';
  }
}
