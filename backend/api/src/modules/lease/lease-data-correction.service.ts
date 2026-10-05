import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { resolveLeaseCommercialAgreement } from '../billing/helpers/duration-pricing.helper';
import { buildLeaseSettlementPolicyScheduleV4 } from '../billing/helpers/lease-settlement-policy.helper';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { ContractScheduleIssuanceService } from '../billing/services/contract-schedule-issuance.service';
import {
  LeaseCommercialModeCorrectionService,
  type CommercialModeCorrectionFacts,
  type CommercialModeCorrectionPlan,
} from './lease-commercial-mode-correction.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import type { CommitLeaseDataCorrectionDto, PreviewLeaseDataCorrectionDto } from './lease.dto';
import {
  calculateCorrectedLeaseEndDate,
  calculateLeaseCorrectionImpact,
} from './lease-data-correction.helper';
import { LeaseRepository } from './lease.repository';
import { readLeaseCommercialReference } from './lease-commercial-reference.helper';
import { LeaseServicePeriodService } from './lease-service-period.service';
import { LeaseRevisionContextService } from './lease-revision-context.service';
import {
  LeaseRoomRecordingCorrectionService,
  type RoomRecordingCorrectionFacts,
  type RoomRecordingCorrectionPlan,
} from './lease-room-recording-correction.service';
import {
  LeaseSponsorshipCorrectionService,
  type SponsorshipCorrectionFacts,
  type SponsorshipCorrectionPlan,
  type SponsorshipPolicySnapshot,
} from './lease-sponsorship-correction.service';

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
  onboarding_commitment_id: string | null;
  service_period_state: string;
};

type CorrectionSnapshot = {
  commercialMode?: 'rent' | 'owner_sponsored';
  commercialTransition?: CommercialModeCorrectionPlan;
  ownerSponsorship?: SponsorshipPolicySnapshot;
  roomId?: string;
  roomNumber?: string;
  roomManagerLabel?: string | null;
  roomPlotNumber?: string | null;
  kostTypeName?: string;
  roomEvidenceFileIds?: string[];
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
  roomCorrection?: { facts: RoomRecordingCorrectionFacts; plan: RoomRecordingCorrectionPlan };
  sponsorshipCorrection?: { facts: SponsorshipCorrectionFacts; plan: SponsorshipCorrectionPlan };
  modeCorrection?: { facts: CommercialModeCorrectionFacts; plan: CommercialModeCorrectionPlan };
  consequences?: Awaited<ReturnType<LeaseDataCorrectionService['previewConsequences']>>;
};

@Injectable()
export class LeaseDataCorrectionService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly billing: W06BillingService,
    private readonly periods: LeaseServicePeriodService,
    private readonly revisions: LeaseRevisionContextService = new LeaseRevisionContextService(
      leases,
    ),
    private readonly roomCorrections: LeaseRoomRecordingCorrectionService = new LeaseRoomRecordingCorrectionService(),
    private readonly sponsorshipCorrections: LeaseSponsorshipCorrectionService = new LeaseSponsorshipCorrectionService(),
    private readonly modeCorrections: LeaseCommercialModeCorrectionService = new LeaseCommercialModeCorrectionService(
      billing,
      new ContractScheduleIssuanceService(),
      sponsorshipCorrections,
    ),
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

  async listForResident(user: UserAccessContext, residentId: string, propertyId: string) {
    if (
      !user.roles.includes('admin') ||
      !user.permissions.includes('lease.read') ||
      (!user.roles.includes('owner') && !user.propertyIds.includes(propertyId))
    ) {
      throw new ForbiddenException({
        code: 'LEASE_CORRECTION_HISTORY_FORBIDDEN',
        message: 'Riwayat koreksi hanya tersedia untuk Admin properti terkait.',
      });
    }
    const resident = await this.leases.query(
      'SELECT id FROM residents WHERE id = $1 AND property_id = $2',
      [residentId, propertyId],
    );
    if (!resident.rows.length) {
      throw new NotFoundException({
        code: 'RESIDENT_NOT_FOUND',
        message: 'Penghuni tidak ditemukan.',
      });
    }
    const rows = await this.leases.query<
      LeaseCorrectionRow & {
        created_by_name: string | null;
        room_number: string | null;
      }
    >(
      `SELECT correction.*, actor.display_name AS created_by_name,
               COALESCE(correction.corrected_snapshot->>'roomNumber', origin.number, room.number, lease.snapshot_room_number) AS room_number
       FROM lease_data_corrections correction
       JOIN leases lease ON lease.id = correction.lease_id AND lease.property_id = correction.property_id
       LEFT JOIN users actor ON actor.id = correction.created_by_user_id
       LEFT JOIN rooms room ON room.id = lease.room_id AND room.property_id = lease.property_id
       LEFT JOIN LATERAL (
         SELECT source.number FROM room_transfer_records transfer
         JOIN rooms source ON source.id = transfer.from_room_id AND source.property_id = transfer.property_id
         WHERE transfer.from_lease_id = lease.id AND transfer.property_id = lease.property_id
         ORDER BY transfer.created_at, transfer.id LIMIT 1
       ) origin ON true
       WHERE lease.resident_id = $1 AND correction.property_id = $2
       ORDER BY correction.created_at DESC, correction.sequence_number DESC, correction.id DESC`,
      [residentId, propertyId],
    );
    return {
      data: {
        corrections: rows.rows.map((row) => ({
          ...this.toCorrectionResponse(row),
          created_by_name: row.created_by_name,
          room_number: row.room_number,
        })),
      },
    };
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
      // Match onboarding's property -> lease -> room ordering. Room changes must
      // not race a booking hold, a physical cutover or new onboarding commitment.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text, 0))`,
        [leaseScope.rows[0].property_id],
      );
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [
        leaseScope.rows[0].property_id,
      ]);
      const lockedScope = await client.query<{ property_id: string }>(
        // Claim the aggregate lock before checking replay. A retry waiting for
        // another commit must see its amendment before previewing current values.
        'SELECT property_id FROM leases WHERE id=$1 FOR UPDATE',
        [leaseId],
      );
      if (
        !lockedScope.rows[0] ||
        lockedScope.rows[0].property_id !== leaseScope.rows[0].property_id
      )
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

      // Preserve the locked source policy before any room or period projection changes.
      if (preview.modeCorrection) {
        await this.modeCorrections.record(
          client,
          preview.modeCorrection.facts,
          correctionId,
          user.id,
          preview.previous,
          preview.corrected,
        );
        await this.modeCorrections.retireSource(
          client,
          preview.modeCorrection.facts,
          preview.modeCorrection.plan,
          user,
          dto.reason.trim(),
        );
      }
      if (preview.sponsorshipCorrection)
        await this.sponsorshipCorrections.record(
          client,
          preview.sponsorshipCorrection.facts,
          preview.sponsorshipCorrection.plan,
          correctionId,
          user.id,
        );
      if (preview.roomCorrection)
        await this.roomCorrections.apply(
          client,
          preview.roomCorrection.facts,
          preview.roomCorrection.plan,
          correctionId,
          user.id,
        );
      const checkInPeriodAmended =
        !!preview.previous.checkedInDate &&
        (preview.previous.checkedInDate !== preview.corrected.checkedInDate ||
          preview.previous.startDate !== preview.corrected.startDate);
      if (checkInPeriodAmended)
        await this.periods.finalizeLocked(client, {
          leaseId,
          propertyId: preview.propertyId,
          checkedInAt: new Date(`${preview.corrected.checkedInDate}T00:00:00+07:00`),
          actorId: user.id,
          reason: dto.reason,
          commandFingerprint,
          source: 'lease_data_correction',
        });
      await this.applyEffectiveLease(client, user.id, leaseId, preview);
      if (preview.modeCorrection)
        await this.modeCorrections.applyTarget(
          client,
          preview.modeCorrection.facts,
          preview.modeCorrection.plan,
          correctionId,
          user.id,
          preview.corrected,
        );
      if (preview.sponsorshipCorrection)
        await this.sponsorshipCorrections.apply(
          client,
          preview.sponsorshipCorrection.facts,
          preview.sponsorshipCorrection.plan,
          correctionId,
        );
      if (!preview.modeCorrection && preview.impact.contractCredit > 0)
        await this.applyContractCredit(client, correctionId, user.id, preview);
      if (!preview.modeCorrection && preview.impact.additionalCharge > 0)
        await this.createAdditionalCharge(client, correctionId, user.id, preview);
      if (
        !checkInPeriodAmended &&
        !preview.modeCorrection &&
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
          (!checkInPeriodAmended && preview.previous.startDate !== preview.corrected.startDate) ||
            preview.previous.termMonths !== preview.corrected.termMonths ||
            !!preview.roomCorrection,
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
               lease.snapshot_kost_type_name,lease.activated_at,lease.onboarding_commitment_id,lease.service_period_state,lifecycle.checked_in_at AS lifecycle_checked_in_at,
              COALESCE(
                latest_correction.corrected_snapshot->>'checkedInDate',
                (lifecycle.checked_in_at AT TIME ZONE 'Asia/Jakarta')::date::text,
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

    const revision = await this.revisions.readInTransaction(client, user, leaseId);
    if (!revision.data.policies.correction.allowed)
      throw new ConflictException({
        code: revision.data.policies.correction.code,
        message: revision.data.policies.correction.message,
      });
    const targetMode = dto.commercial_mode ?? lease.commercial_mode;
    if (!['rent', 'owner_sponsored'].includes(targetMode))
      throw new UnprocessableEntityException({
        code: 'LEASE_MODE_CORRECTION_MODE_INVALID',
        message:
          'Pilih jenis hunian Penyewaan Berbayar atau Hunian Tanggungan Owner, lalu tinjau ulang.',
      });
    const modeChanged = targetMode !== lease.commercial_mode;
    if (modeChanged && revision.data.policies.commercial_mode_change.allowed !== true)
      throw new ConflictException({
        code: revision.data.policies.commercial_mode_change.code,
        message: revision.data.policies.commercial_mode_change.message,
      });
    if (!modeChanged && (dto.payment_plan_type != null || dto.billing_cycle != null))
      throw new ConflictException({
        code: 'LEASE_MODE_CORRECTION_SCHEDULE_REVIEW_REQUIRED',
        message:
          'Pilihan jadwal ini hanya untuk perubahan jenis hunian. Pertahankan jadwal lama atau tinjau perubahan jenis hunian terlebih dahulu.',
      });

    const previous: CorrectionSnapshot = {
      roomId: lease.room_id,
      roomNumber: revision.data.room?.number ?? lease.snapshot_room_number,
      roomManagerLabel: revision.data.room?.manager_room_label ?? null,
      roomPlotNumber: revision.data.room?.plot_number ?? null,
      kostTypeName: lease.snapshot_kost_type_name,
      roomEvidenceFileIds: [],
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
    const isCheckInDateAmendment =
      !!dto.checked_in_date &&
      !!previous.checkedInDate &&
      (dto.checked_in_date !== previous.checkedInDate ||
        previous.startDate !== dto.checked_in_date);
    if (modeChanged && isCheckInDateAmendment)
      throw new ConflictException({
        code: 'LEASE_MODE_CORRECTION_SEPARATE_CHECK_IN_REVIEW_REQUIRED',
        message:
          'Simpan koreksi tanggal check-in terlebih dahulu. Setelah periode benar, tinjau perubahan jenis hunian sebagai koreksi terpisah.',
      });
    const roomChanged = !!dto.room_id && dto.room_id !== lease.room_id;
    const combinedSponsorshipRoomReview =
      roomChanged &&
      !modeChanged &&
      lease.commercial_mode === 'owner_sponsored' &&
      [
        dto.sponsoring_owner_profile_id,
        dto.management_fee_mode,
        dto.management_fee_payer,
        dto.management_fee_payer_name,
        dto.owner_sponsorship_reason,
      ].some((value) => value != null);
    if (
      combinedSponsorshipRoomReview &&
      revision.data.policies.sponsorship_policy_change.allowed !== true
    )
      throw new ConflictException({
        code: revision.data.policies.sponsorship_policy_change.code,
        message: revision.data.policies.sponsorship_policy_change.message,
      });
    if (roomChanged && isCheckInDateAmendment)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_SEPARATE_CHECK_IN_REVIEW_REQUIRED',
        message:
          'Simpan koreksi tanggal check-in terlebih dahulu agar periode sewa tetap benar. Setelah itu tinjau koreksi kamar sebagai perubahan terpisah.',
      });
    if (!roomChanged && dto.room_correction_evidence_file_ids?.length)
      throw new UnprocessableEntityException({
        code: 'LEASE_ROOM_CORRECTION_TARGET_REQUIRED',
        message:
          'Bukti koreksi kamar memerlukan kamar pengganti. Pilih kamar yang benar atau lepaskan bukti bila kamar tetap sama.',
      });
    if (
      isCheckInDateAmendment &&
      ((dto.term_months != null && dto.term_months !== previous.termMonths) ||
        (dto.agreed_monthly_price != null &&
          dto.agreed_monthly_price !== previous.agreedMonthlyPrice) ||
        (dto.pricing_source != null && dto.pricing_source !== previous.pricingSource))
    )
      throw new ConflictException({
        code: 'LEASE_CHECK_IN_CORRECTION_SEPARATE_COMMERCIAL_REVIEW_REQUIRED',
        message:
          'Koreksi tanggal check-in mempertahankan durasi dan tarif yang disepakati. Simpan koreksi tanggal terlebih dahulu; tinjau perubahan tarif atau durasi sebagai koreksi terpisah.',
      });
    const startDate = isCheckInDateAmendment
      ? dto.checked_in_date!
      : (dto.start_date ?? previous.startDate);
    const termMonths = dto.term_months ?? previous.termMonths;
    const checkedInDate = dto.checked_in_date ?? previous.checkedInDate;
    if (previous.checkedInDate && dto.start_date && dto.start_date !== checkedInDate)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_CHECK_IN_ANCHOR_REQUIRED',
        message:
          'Tanggal mulai sewa harus mengikuti check-in fisik. Ubah tanggal check-in pada koreksi ini jika pencatatan sebelumnya keliru; pembayaran tetap menggunakan tanggal aslinya.',
      });
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
      [dto.room_id ?? lease.room_id, lease.property_id, leaseId, startDate, endDate],
    );
    if (overlap.rows[0])
      throw new ConflictException({
        code: 'LEASE_DATA_CORRECTION_ROOM_CONFLICT',
        message: 'Periode hasil koreksi bertabrakan dengan penyewaan lain pada kamar ini',
      });

    const roomFacts: RoomRecordingCorrectionFacts = {
      leaseId,
      propertyId: lease.property_id,
      residentId: lease.resident_id,
      sourceRoomId: lease.room_id,
      targetRoomId: dto.room_id,
      occupancyId: lease.occupancy_id,
      leaseStatus: lease.lease_status,
      // The target sponsorship is reviewed separately; do not require the old Owner on the new room.
      commercialMode: modeChanged || combinedSponsorshipRoomReview ? 'rent' : lease.commercial_mode,
      startDate,
      endDate,
      physicalCheckInRecorded:
        revision.data.lease?.physical_check_in_recorded ?? !!lease.occupancy_id,
      recordingErrorConfirmed: dto.room_recording_error_confirmed,
      evidenceFileIds: dto.room_correction_evidence_file_ids ?? [],
      relatedTransactionCount: revision.data.financial?.related_transaction_count ?? NaN,
      ownerSponsorship: revision.data.owner_sponsorship,
      policy: revision.data.policies.room_correction,
      lock,
    };
    const roomPlan = await this.roomCorrections.preview(client, roomFacts);
    const periodChanged = startDate !== previous.startDate || termMonths !== previous.termMonths;
    const pricingChanged =
      dto.pricing_source != null ||
      dto.agreed_monthly_price != null ||
      dto.pricing_agreement_reason != null;
    if (targetMode === 'owner_sponsored' && pricingChanged)
      throw new UnprocessableEntityException({
        code: 'LEASE_DATA_CORRECTION_OWNER_SPONSORED_PRICING_IMMUTABLE',
        message:
          'Hunian Tanggungan Owner tidak menggunakan tarif sewa. Koreksi hanya dapat mengubah tanggal atau durasi.',
      });
    let corrected: CorrectionSnapshot;
    if (isCheckInDateAmendment) {
      await this.periods.validateAmendmentLocked(
        client,
        leaseId,
        lease.property_id,
        checkedInDate!,
      );
      const locks = await client.query(
        `SELECT 1 FROM property_owner_realization_lease_locks WHERE lease_id=$1 AND lock_status='locked' LIMIT 1`,
        [leaseId],
      );
      if (locks.rowCount)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_CORRECTION_OWNER_REALIZATION_BLOCKED',
          message:
            'Tanggal check-in terkait realisasi Owner yang sudah disiapkan. Batalkan realisasi yang belum ditransfer atau catat koreksi melalui alur realisasi sebelum mengubah tanggal; dokumen terbit tetap dipertahankan.',
        });
      corrected = { ...previous, startDate, endDate, checkedInDate };
    } else if (!periodChanged && !pricingChanged && !roomChanged && !modeChanged) {
      // A historical check-in correction must not silently re-price the contract.
      corrected = { ...previous, checkedInDate };
    } else {
      const commercial = await this.commercialAt(client, dto.room_id ?? lease.room_id, startDate);
      if (targetMode === 'owner_sponsored') {
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
          : (dto.pricing_source ??
            (previous.pricingSource === 'owner_sponsored'
              ? termMonths < 3
                ? 'negotiated'
                : 'standard'
              : previous.pricingSource));
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
              pricingSource,
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
    corrected = {
      ...corrected,
      roomId: roomPlan?.corrected.id ?? previous.roomId,
      roomNumber: roomPlan?.corrected.number ?? previous.roomNumber,
      roomManagerLabel: roomPlan
        ? roomPlan.corrected.manager_room_label
        : previous.roomManagerLabel,
      roomPlotNumber: roomPlan ? roomPlan.corrected.plot_number : previous.roomPlotNumber,
      kostTypeName: roomPlan?.corrected.kost_type_name ?? previous.kostTypeName,
      roomEvidenceFileIds: roomPlan?.evidenceFileIds ?? [],
    };
    const sponsorshipFacts: SponsorshipCorrectionFacts = {
      leaseId,
      propertyId: lease.property_id,
      residentId: lease.resident_id,
      roomId: corrected.roomId ?? lease.room_id,
      sourceRoomId: lease.room_id,
      commercialMode: lease.commercial_mode,
      startDate,
      endDate,
      termMonths,
      policy: revision.data.policies.sponsorship_policy_change,
      lock,
    };
    const sponsorshipPlan = modeChanged
      ? null
      : await this.sponsorshipCorrections.preview(client, sponsorshipFacts, dto);
    if (sponsorshipPlan) {
      if (isCheckInDateAmendment)
        throw new ConflictException({
          code: 'LEASE_CHECK_IN_CORRECTION_SEPARATE_SPONSORSHIP_REVIEW_REQUIRED',
          message:
            'Simpan koreksi tanggal check-in terlebih dahulu. Setelah periode benar, tinjau perubahan penanggung atau ketentuan biaya sebagai koreksi terpisah; pembayaran lama tetap tersimpan.',
        });
      previous.ownerSponsorship = sponsorshipPlan.previous;
      corrected.ownerSponsorship = sponsorshipPlan.corrected;
    }
    const modeFacts: CommercialModeCorrectionFacts = {
      leaseId,
      propertyId: lease.property_id,
      residentId: lease.resident_id,
      roomId: corrected.roomId ?? lease.room_id,
      sourceMode: lease.commercial_mode,
      targetMode,
      leaseStatus: lease.lease_status,
      servicePeriodState: lease.service_period_state,
      activatedAt: lease.activated_at?.toISOString() ?? null,
      onboardingCommitmentId: lease.onboarding_commitment_id,
      startDate,
      endDate,
      termMonths,
      billingCycle: dto.billing_cycle ?? lease.billing_cycle,
      paymentPlanType: dto.payment_plan_type ?? lease.payment_plan_type,
      policy: revision.data.policies.commercial_mode_change,
      lock,
    };
    const modePlan = modeChanged
      ? await this.modeCorrections.preview(client, modeFacts, dto)
      : null;
    if (modePlan) {
      previous.commercialMode = lease.commercial_mode;
      corrected.commercialMode = targetMode;
      corrected.commercialTransition = modePlan;
      corrected.ownerSponsorship = modePlan.newSponsorship ?? undefined;
      const source = revision.data.owner_sponsorship;
      if (lease.commercial_mode === 'owner_sponsored' && source)
        previous.ownerSponsorship = {
          ownerProfileId: source.owner_profile_id as string,
          ownershipKind: source.ownership_kind as 'building' | 'room',
          ownershipAssignmentId: source.ownership_assignment_id as string,
          managementFeeMode: source.management_fee_mode as 'charged' | 'waived',
          managementFeePayer: source.management_fee_payer as 'resident' | 'owner' | 'other' | null,
          managementFeePayerName: source.management_fee_payer_name as string | null,
          sponsorshipReason: source.sponsorship_reason as string,
          monthlyManagementFee: Number(source.snapshot_monthly_management_fee),
          projectedManagementFeeAmount: Number(source.projected_management_fee_amount),
          roomId: lease.room_id,
          startDate: previous.startDate,
          endDate: previous.endDate,
          termMonths: previous.termMonths,
        };
    }
    if (isDeepStrictEqual(previous, corrected))
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
    const consequences = await this.previewConsequences(client, leaseId, lease.property_id, previous,
      corrected, revision.data.owner_sponsorship);
    return {
      leaseId,
      propertyId: lease.property_id,
      commercialMode: targetMode,
      previous,
      corrected,
      impact: calculateLeaseCorrectionImpact(
        previous.contractRentAmount,
        corrected.contractRentAmount,
        Number(paid.rows[0]?.amount ?? 0),
      ),
      correctionKind,
      consequences,
      pricingChoiceRequired:
        lease.commercial_mode === 'rent' &&
        periodChanged &&
        previous.pricingTier !== corrected.pricingTier &&
        dto.pricing_source == null,
      roomCorrection: roomPlan ? { facts: roomFacts, plan: roomPlan } : undefined,
      sponsorshipCorrection: sponsorshipPlan
        ? { facts: sponsorshipFacts, plan: sponsorshipPlan }
        : undefined,
      modeCorrection: modePlan ? { facts: modeFacts, plan: modePlan } : undefined,
    };
  }

  private async commercialAt(client: PoolClient, roomId: string, date: string) {
    return readLeaseCommercialReference(client, roomId, date);
  }

  private async previewConsequences(client: PoolClient, leaseId: string, propertyId: string,
    previous: CorrectionSnapshot, corrected: CorrectionSnapshot, sourceSponsorship?: Record<string, unknown> | null) {
    const ownerProjection = async (snapshot: CorrectionSnapshot, before: boolean) => {
      const sponsored = snapshot.commercialMode === 'owner_sponsored' || snapshot.pricingSource === 'owner_sponsored';
      const policy = snapshot.ownerSponsorship;
      const ownerId = sponsored ? policy?.ownerProfileId ?? sourceSponsorship?.owner_profile_id ?? null : null;
      const result = await client.query<{ owner_profile_id: string | null; owner_name: string | null; monthly_fee: string | null }>(
        `SELECT /* revision_owner_impact */ owner.id AS owner_profile_id,owner.full_name AS owner_name,fee.monthly_fee_amount::text AS monthly_fee
         FROM rooms room LEFT JOIN LATERAL (
           SELECT choice.owner_profile_id FROM (
             SELECT owner_profile_id,0 AS priority FROM room_owner_assignments
               WHERE property_id=$1 AND room_id=room.id AND assignment_status='active'
             UNION ALL SELECT owner_profile_id,1 FROM building_owner_assignments
               WHERE property_id=$1 AND building_id=room.building_id AND assignment_status='active'
           ) choice ORDER BY priority LIMIT 1
         ) assignment ON true
         LEFT JOIN property_owner_profiles owner ON owner.id=COALESCE($4::uuid,assignment.owner_profile_id)
           AND owner.property_id=$1 AND ($4::uuid IS NOT NULL OR owner.profile_status='active')
         LEFT JOIN LATERAL (SELECT monthly_fee_amount FROM property_management_fee_versions
           WHERE property_id=$1 AND effective_date<=$3::date ORDER BY effective_date DESC LIMIT 1) fee ON true
         WHERE room.property_id=$1 AND room.id=$2`,
        [propertyId, snapshot.roomId, snapshot.startDate, ownerId]);
      const row = result.rows[0];
      const monthly = Number(sponsored ? policy?.monthlyManagementFee ?? sourceSponsorship?.snapshot_monthly_management_fee : row?.monthly_fee ?? 0);
      const waived = sponsored && (policy?.managementFeeMode ?? sourceSponsorship?.management_fee_mode) === 'waived';
      const fee = waived ? 0 : sponsored && before
        ? Number(policy?.projectedManagementFeeAmount ?? sourceSponsorship?.projected_management_fee_amount)
        : monthly * snapshot.termMonths;
      const entitlement = sponsored ? 0 : snapshot.contractRentAmount - fee;
      if (![monthly, fee, entitlement].every(value => Number.isSafeInteger(value) && value >= 0))
        throw new ConflictException({ code: 'LEASE_CORRECTION_OWNER_IMPACT_INVALID',
          message: 'Perhitungan biaya pengelolaan dan hak Owner belum dapat dipastikan. Periksa tarif serta ketentuan biaya pada periode ini, lalu tinjau ulang; belum ada perubahan yang disimpan.' });
      return { owner_profile_id: sponsored ? ownerId as string | null : row?.owner_profile_id ?? null,
        owner_name: row?.owner_name ?? (sponsored ? sourceSponsorship?.owner_name as string | null : null) ?? null,
        monthly_management_fee: monthly, management_fee_amount: fee, projected_owner_entitlement: entitlement };
    };
    const ownerBefore = await ownerProjection(previous, true);
    const ownerAfter = await ownerProjection(corrected, false);
    const documents = await client.query<{ document_type: 'invoice' | 'payment_receipt' | 'contract_paid_confirmation';
      document_code: string; current_status: string }>(
      `SELECT /* revision_document_impact */ 'invoice'::text AS document_type,invoice_code AS document_code,invoice_status AS current_status
         FROM invoices WHERE lease_id=$1 AND property_id=$2
       UNION ALL SELECT 'payment_receipt',receipt.receipt_code,'issued' FROM payment_receipts receipt
         LEFT JOIN payment_reversals reversal ON reversal.receipt_id=receipt.id
         JOIN payments payment ON payment.id=COALESCE(receipt.payment_id,reversal.payment_id) AND payment.property_id=receipt.property_id
         WHERE receipt.property_id=$2 AND (payment.lease_id=$1 OR EXISTS (
           SELECT 1 FROM payment_allocations allocation JOIN invoices invoice ON invoice.id=allocation.invoice_id AND invoice.property_id=$2
           WHERE allocation.payment_id=payment.id AND invoice.lease_id=$1))
       UNION ALL SELECT 'contract_paid_confirmation',document_code,
         CASE WHEN invalidated_at IS NULL THEN 'issued' ELSE 'invalidated' END
         FROM lease_contract_paid_documents WHERE lease_id=$1 AND property_id=$2
       ORDER BY document_type,document_code`, [leaseId, propertyId]);
    const modeChanged = (previous.commercialMode ?? (previous.pricingSource === 'owner_sponsored' ? 'owner_sponsored' : 'rent')) !==
      (corrected.commercialMode ?? (corrected.pricingSource === 'owner_sponsored' ? 'owner_sponsored' : 'rent'));
    const checkInAmended = !!previous.checkedInDate && (previous.checkedInDate !== corrected.checkedInDate || previous.startDate !== corrected.startDate);
    // Match the existing commit invalidation rule. Check-in-only changes use the
    // effective service-period version; amounts and historic documents are retained.
    const confirmationChanged = previous.contractRentAmount !== corrected.contractRentAmount ||
      (!checkInAmended && previous.startDate !== corrected.startDate) || previous.termMonths !== corrected.termMonths || previous.roomId !== corrected.roomId;
    return { owner_impact: { previous: ownerBefore, corrected: ownerAfter, projection_only: true as const,
      transfer_amount_unchanged: true as const,
      notice: 'Estimasi hak Owner mengikuti nilai kontrak dan biaya pengelolaan seluruh durasi, bukan transfer. Realisasi tetap memerlukan sewa berbayar yang lunas dan check-in fisik; hunian tanggungan Owner tidak menghasilkan hak sewa. Transfer dan realisasi yang sudah tercatat tidak berubah.' },
      document_impact: documents.rows.map(document => {
        const effect = document.current_status === 'invalidated' ? 'already_invalidated' as const
          : document.document_type === 'contract_paid_confirmation' && confirmationChanged ? 'invalidated' as const
          : document.document_type === 'invoice' && document.current_status !== 'void' && modeChanged ? 'voided' as const : 'retained' as const;
        return { ...document, effect, notice: effect === 'invalidated' ? 'Tidak berlaku untuk hasil koreksi; riwayat tetap tersimpan. Tinjau pelunasan sebelum menerbitkan dokumen baru.'
          : effect === 'voided' ? 'Tagihan lama dibatalkan, bukan dihapus. Jadwal baru mengikuti hasil koreksi.'
          : effect === 'already_invalidated' ? 'Sudah tidak berlaku sebelumnya; koreksi ini tidak mengaktifkannya kembali.'
          : 'Catatan dan nilai transaksi tetap tersimpan. Unduhan terkait periode mengikuti ketentuan tanggal efektif tanpa mengubah pembayaran.' };
      }) };
  }

  private async applyEffectiveLease(
    client: PoolClient,
    actorId: string,
    leaseId: string,
    preview: PreviewResult,
  ) {
    const commercialChanged =
      !!preview.modeCorrection ||
      !!preview.roomCorrection ||
      preview.previous.termMonths !== preview.corrected.termMonths ||
      preview.previous.agreedMonthlyPrice !== preview.corrected.agreedMonthlyPrice ||
      preview.previous.pricingSource !== preview.corrected.pricingSource;
    await client.query(
      `UPDATE leases SET start_date=$2::date,end_date=$3::date,term_months=$4,
               planned_start_date=CASE WHEN service_period_state='pending_check_in' THEN $2::date ELSE planned_start_date END,
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
              billing_anchor_day=15,
              next_billing_date=CASE WHEN lease_status='awaiting_activation' THEN
                CASE WHEN EXTRACT(DAY FROM $2::date) <= 15 THEN date_trunc('month',$2::date)::date + 14
                     ELSE (date_trunc('month',$2::date) + INTERVAL '1 month')::date + 14 END
                ELSE next_billing_date END,
               commercial_mode=$14,
               payment_plan_type=CASE WHEN $17 THEN $15 ELSE payment_plan_type END,
               billing_cycle=CASE WHEN $17 THEN $16 ELSE billing_cycle END,
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
        preview.commercialMode,
        preview.modeCorrection?.facts.paymentPlanType ?? null,
        preview.modeCorrection?.facts.billingCycle ?? null,
        !!preview.modeCorrection,
      ],
    );
    if (
      !preview.modeCorrection &&
      !preview.sponsorshipCorrection &&
      preview.commercialMode === 'owner_sponsored' &&
      commercialChanged
    )
      await client.query(
        `UPDATE owner_sponsored_lease_terms term
            SET projected_management_fee_amount=progress.current_projected_management_fee_amount,
                updated_at=now()
           FROM owner_sponsored_management_fee_progress progress
          WHERE progress.id=term.id AND term.lease_id=$1 AND term.property_id=$2`,
        [leaseId, preview.propertyId],
      );
    if (preview.corrected.checkedInDate !== preview.previous.checkedInDate) {
      await client.query(
        `UPDATE lease_activation_lifecycles
            SET checked_in_at=(($3::date+TIME '00:00') AT TIME ZONE 'Asia/Jakarta'),
                updated_at=now()
          WHERE lease_id=$1 AND property_id=$2 AND checked_in_at IS NOT NULL`,
        [leaseId, preview.propertyId, preview.corrected.checkedInDate],
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
    const coverageStart =
      preview.corrected.startDate < preview.previous.startDate
        ? preview.corrected.startDate
        : preview.corrected.endDate > preview.previous.endDate
          ? preview.previous.endDate
          : this.shiftIsoDate(preview.corrected.endDate, -1);
    const coverageEndExclusive =
      preview.corrected.startDate < preview.previous.startDate
        ? preview.previous.startDate
        : preview.corrected.endDate;
    await client.query(
      `INSERT INTO lease_installments(
         id,property_id,lease_id,sequence_number,coverage_start_date,coverage_end_date,
          due_date,scheduled_amount,installment_status,correction_id
        ) VALUES($1,$2,$3,$4,$5::date,$6::date-1,$7::date,$8,'issued',$9)`,
      [
        installmentId,
        preview.propertyId,
        preview.leaseId,
        installmentSequence,
        coverageStart,
        coverageEndExclusive,
        dueDate,
        preview.impact.additionalCharge,
        correctionId,
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
        coverageStart,
        coverageEndExclusive,
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
    const schedule = buildLeaseSettlementPolicyScheduleV4({
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
    if (!isDeepStrictEqual(previous.ownerSponsorship, corrected.ownerSponsorship))
      return 'combined';
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
      ...(preview.consequences ?? {}),
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
      sponsorship_change: preview.sponsorshipCorrection
        ? {
            effective_from: preview.sponsorshipCorrection.plan.effectiveFrom,
            previous: this.sponsorshipResponse(preview.sponsorshipCorrection.plan.previous),
            corrected: this.sponsorshipResponse(preview.sponsorshipCorrection.plan.corrected),
            notice:
              'Perubahan dicatat sebagai koreksi keputusan penanggung. Kebijakan sebelumnya dan transaksi lama tetap tersimpan; pembebasan biaya bukan pengembalian dana.',
          }
        : null,
      room_change: preview.roomCorrection
        ? {
            previous_room_number: preview.roomCorrection.plan.previous.number,
            corrected_room_number: preview.roomCorrection.plan.corrected.number,
            target_status: preview.roomCorrection.plan.targetStatus,
            evidence_file_ids: preview.roomCorrection.plan.evidenceFileIds,
            notice:
              'Kamar sebelumnya salah dicatat. Riwayat asal dan dokumen lama tetap tersimpan; perubahan ini bukan perpindahan fisik.',
          }
        : null,
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
      commercial_mode:
        snapshot.commercialMode ??
        (snapshot.pricingSource === 'owner_sponsored' ? 'owner_sponsored' : 'rent'),
      commercial_change: snapshot.commercialTransition
        ? {
            invoices_to_void: snapshot.commercialTransition.previousBilling.invoices.map(
              (invoice) => ({
                invoice_code: invoice.invoice_code,
                invoice_status: invoice.invoice_status,
              }),
            ),
            notice:
              'Jenis hunian sebelumnya salah dicatat. Tagihan lama tetap tersimpan dengan status dibatalkan; jadwal dan ketentuan baru mengikuti hasil koreksi. Ini bukan pengembalian pembayaran.',
          }
        : null,
      owner_sponsorship: this.sponsorshipResponse(snapshot.ownerSponsorship),
      room_id: snapshot.roomId ?? null,
      room_number: snapshot.roomNumber ?? null,
      manager_room_label: snapshot.roomManagerLabel ?? null,
      plot_number: snapshot.roomPlotNumber ?? null,
      kost_type_name: snapshot.kostTypeName ?? null,
      room_correction_evidence_file_ids: snapshot.roomEvidenceFileIds ?? [],
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

  private sponsorshipResponse(snapshot?: SponsorshipPolicySnapshot) {
    if (!snapshot) return null;
    return {
      owner_profile_id: snapshot.ownerProfileId,
      ownership_kind: snapshot.ownershipKind,
      ownership_assignment_id: snapshot.ownershipAssignmentId,
      management_fee_mode: snapshot.managementFeeMode,
      management_fee_payer: snapshot.managementFeePayer,
      management_fee_payer_name: snapshot.managementFeePayerName,
      sponsorship_reason: snapshot.sponsorshipReason,
      monthly_management_fee: snapshot.monthlyManagementFee,
      projected_management_fee_amount: snapshot.projectedManagementFeeAmount,
      room_id: snapshot.roomId,
      start_date: snapshot.startDate,
      end_date: snapshot.endDate,
      term_months: snapshot.termMonths,
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

  private shiftIsoDate(value: string, days: number) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
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
