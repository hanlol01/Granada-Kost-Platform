import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import type { LeaseRevisionDecision } from './lease-revision-policy.helper';

export type SponsorshipCorrectionInput = {
  sponsoring_owner_profile_id?: string;
  management_fee_mode?: 'charged' | 'waived';
  management_fee_payer?: 'resident' | 'owner' | 'other';
  management_fee_payer_name?: string;
  owner_sponsorship_reason?: string;
  negotiated_monthly_management_fee?: number;
  management_fee_agreement_note?: string;
  /** Internal preservation marker; never accepted from an external correction request. */
  management_fee_source?: 'property_policy' | 'negotiated_snapshot';
};

export type SponsorshipCorrectionFacts = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  sourceRoomId?: string;
  commercialMode: 'rent' | 'owner_sponsored';
  startDate: string;
  endDate: string;
  termMonths: number;
  policy: LeaseRevisionDecision;
  lock: boolean;
};

export type SponsorshipPolicySnapshot = {
  ownerProfileId: string;
  ownershipKind: 'building' | 'room';
  ownershipAssignmentId: string;
  managementFeeMode: 'charged' | 'waived';
  managementFeePayer: 'resident' | 'owner' | 'other' | null;
  managementFeePayerName: string | null;
  sponsorshipReason: string;
  managementFeeSource: 'property_policy' | 'negotiated_snapshot';
  managementFeeAgreementNote: string | null;
  monthlyManagementFee: number;
  projectedManagementFeeAmount: number;
  roomId: string;
  startDate: string;
  endDate: string;
  termMonths: number;
};

export type SponsorshipCorrectionPlan = {
  termId: string;
  effectiveFrom: string;
  /** A pre-payment negotiated agreement is the sole exception to the broad finance-review gate. */
  negotiatedAgreementOnly: boolean;
  previous: SponsorshipPolicySnapshot;
  corrected: SponsorshipPolicySnapshot;
};

type TermRow = {
  id: string;
  property_id: string;
  lease_id: string;
  resident_id: string;
  room_id: string;
  owner_profile_id: string;
  ownership_kind: 'building' | 'room';
  ownership_assignment_id: string;
  management_fee_mode: 'charged' | 'waived';
  management_fee_payer: 'resident' | 'owner' | 'other' | null;
  management_fee_payer_name: string | null;
  sponsorship_reason: string;
  management_fee_source: 'property_policy' | 'negotiated_snapshot';
  management_fee_agreement_note: string | null;
  snapshot_monthly_management_fee: string;
  current_projected_management_fee_amount: string;
  start_date: string;
  end_date: string;
  term_months: number;
  term_status: string;
};

/** Amend recorded sponsorship facts; never erase payments or original onboarding inputs. */
@Injectable()
export class LeaseSponsorshipCorrectionService {
  async preview(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
    input: SponsorshipCorrectionInput,
  ): Promise<SponsorshipCorrectionPlan | null> {
    const keys: (keyof SponsorshipCorrectionInput)[] = [
      'sponsoring_owner_profile_id',
      'management_fee_mode',
      'management_fee_payer',
      'management_fee_payer_name',
      'owner_sponsorship_reason',
      'negotiated_monthly_management_fee',
      'management_fee_agreement_note',
    ];
    if (!keys.some((key) => input[key] != null)) return null;
    if (facts.commercialMode !== 'owner_sponsored')
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_MODE_REQUIRED',
        message:
          'Ketentuan penanggung dan biaya ini hanya berlaku untuk Hunian Tanggungan Owner. Tinjau jenis hunian terlebih dahulu; data penyewaan berbayar tidak diubah.',
      });
    const result = await client.query<TermRow>(
      `SELECT /* revision_sponsorship_term */ term.*,lease.start_date::text,lease.end_date::text,
              lease.term_months,progress.current_projected_management_fee_amount::text
         FROM owner_sponsored_lease_terms term
         JOIN leases lease ON lease.id=term.lease_id AND lease.property_id=term.property_id
         JOIN owner_sponsored_management_fee_progress progress ON progress.id=term.id
        WHERE term.lease_id=$1 AND term.property_id=$2 ${facts.lock ? 'FOR UPDATE OF term' : ''}`,
      [facts.leaseId, facts.propertyId],
    );
    const term = result.rows.length === 1 ? result.rows[0] : null;
    if (
      !term ||
      term.term_status !== 'active' ||
      term.resident_id !== facts.residentId ||
      term.property_id !== facts.propertyId ||
      term.lease_id !== facts.leaseId ||
      term.room_id !== (facts.sourceRoomId ?? facts.roomId)
    )
      this.invalidFacts();
    const previous: SponsorshipPolicySnapshot = {
      ownerProfileId: term.owner_profile_id,
      ownershipKind: term.ownership_kind,
      ownershipAssignmentId: term.ownership_assignment_id,
      managementFeeMode: term.management_fee_mode,
      managementFeePayer: term.management_fee_payer,
      managementFeePayerName: term.management_fee_payer_name,
      sponsorshipReason: term.sponsorship_reason,
      managementFeeSource: term.management_fee_source,
      managementFeeAgreementNote: term.management_fee_agreement_note,
      monthlyManagementFee: this.amount(term.snapshot_monthly_management_fee),
      projectedManagementFeeAmount: this.amount(term.current_projected_management_fee_amount),
      roomId: term.room_id,
      startDate: term.start_date,
      endDate: term.end_date,
      termMonths: Number(term.term_months),
    };
    if (
      !['charged', 'waived'].includes(previous.managementFeeMode) ||
      !['property_policy', 'negotiated_snapshot'].includes(previous.managementFeeSource) ||
      !['building', 'room'].includes(previous.ownershipKind) ||
      !previous.ownerProfileId ||
      !previous.ownershipAssignmentId ||
      !Number.isSafeInteger(previous.termMonths) ||
      previous.termMonths < 1 ||
      previous.termMonths > 120 ||
      (previous.managementFeeMode === 'charged' &&
        (!['resident', 'owner', 'other'].includes(previous.managementFeePayer ?? '') ||
          previous.monthlyManagementFee <= 0 ||
          previous.projectedManagementFeeAmount <= 0 ||
          (previous.managementFeeSource === 'negotiated_snapshot' &&
            (!previous.managementFeeAgreementNote ||
              previous.managementFeeAgreementNote.trim().length < 3)))) ||
      (previous.managementFeeMode === 'waived' &&
        (previous.managementFeePayer !== null ||
          previous.managementFeePayerName !== null ||
          previous.monthlyManagementFee !== 0 ||
          previous.projectedManagementFeeAmount !== 0))
    )
      this.invalidFacts();
    const proposed = this.normalizeInput(input, previous);
    if (
      (facts.sourceRoomId ?? facts.roomId) === facts.roomId &&
      isDeepStrictEqual(proposed, {
        ownerProfileId: previous.ownerProfileId,
        managementFeeMode: previous.managementFeeMode,
        managementFeePayer: previous.managementFeePayer,
        managementFeePayerName: previous.managementFeePayerName,
        sponsorshipReason: previous.sponsorshipReason,
        managementFeeSource: previous.managementFeeSource,
        managementFeeAgreementNote: previous.managementFeeAgreementNote,
        monthlyManagementFee: previous.monthlyManagementFee,
      })
    )
      return null;
    const negotiatedAgreementOnly =
      previous.managementFeeSource === 'negotiated_snapshot' &&
      (input.negotiated_monthly_management_fee != null ||
        input.management_fee_agreement_note != null) &&
      input.sponsoring_owner_profile_id == null &&
      input.management_fee_mode == null &&
      input.management_fee_payer == null &&
      input.management_fee_payer_name == null &&
      input.owner_sponsorship_reason == null;
    if (negotiatedAgreementOnly) {
      await this.assertNoActiveNegotiatedFeePayment(client, facts);
      if (facts.policy?.code !== 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED')
        this.assertReview(facts);
    } else {
      this.assertReview(facts);
    }
    return {
      termId: term.id,
      effectiveFrom: facts.startDate,
      negotiatedAgreementOnly,
      previous,
      corrected: await this.resolvePolicy(client, facts, proposed, previous.monthlyManagementFee),
    };
  }

  /** Same Owner/fee authority for a rent-to-sponsored correction; no fabricated source term. */
  async prepareNewPolicy(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
    input: SponsorshipCorrectionInput,
  ) {
    this.assertReview(facts);
    return this.resolvePolicy(client, facts, this.normalizeInput(input), 0);
  }

  private normalizeInput(input: SponsorshipCorrectionInput, previous?: SponsorshipPolicySnapshot) {
    const ownerProfileId = input.sponsoring_owner_profile_id ?? previous?.ownerProfileId;
    if (!ownerProfileId)
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_OWNER_REQUIRED',
        message: 'Pilih Owner pemilik kamar yang menjadi penanggung hunian, lalu tinjau ulang.',
      });
    const mode = input.management_fee_mode ?? previous?.managementFeeMode;
    if (mode !== 'charged' && mode !== 'waived')
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_FEE_MODE_REQUIRED',
        message: 'Pilih ketentuan biaya pengelolaan: dikenakan atau dibebaskan, lalu tinjau ulang.',
      });
    const payer =
      mode === 'charged'
        ? (input.management_fee_payer ?? previous?.managementFeePayer ?? null)
        : null;
    if (mode === 'charged' && !['resident', 'owner', 'other'].includes(payer ?? ''))
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_PAYER_REQUIRED',
        message:
          'Pilih pihak yang menanggung biaya pengelolaan: Penghuni, Owner, atau pihak lain, lalu tinjau ulang.',
      });
    if (
      mode === 'waived' &&
      (input.management_fee_payer != null || input.management_fee_payer_name != null)
    )
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_WAIVED_PAYER_INVALID',
        message:
          'Biaya yang dibebaskan tidak memiliki pembayar. Kosongkan pilihan pembayar dan namanya, lalu tinjau ulang.',
      });
    const payerName =
      payer === 'other'
        ? ((
            input.management_fee_payer_name ??
            (previous?.managementFeePayer === 'other' ? previous.managementFeePayerName : null)
          )?.trim() ?? null)
        : null;
    if (payer === 'other' && (!payerName || payerName.length < 2 || payerName.length > 160))
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_PAYER_NAME_REQUIRED',
        message:
          'Isi nama pihak lain yang menanggung biaya pengelolaan, 2–160 karakter, lalu tinjau ulang.',
      });
    const reason = (input.owner_sponsorship_reason ?? previous?.sponsorshipReason)?.trim();
    if (!reason || reason.length < 3 || reason.length > 500)
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_REASON_REQUIRED',
        message:
          'Isi keterangan persetujuan hunian tanggungan Owner, 3–500 karakter. Alasan koreksi tetap dicatat terpisah.',
      });
    const managementFeeSource =
      previous?.managementFeeSource ?? input.management_fee_source ?? 'negotiated_snapshot';
    if (!['property_policy', 'negotiated_snapshot'].includes(managementFeeSource))
      this.invalidFacts();
    if (
      previous?.managementFeeSource === 'property_policy' &&
      (input.negotiated_monthly_management_fee != null ||
        input.management_fee_agreement_note != null)
    )
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_LEGACY_FEE_SNAPSHOT_UNSUPPORTED',
        message:
          'Kontrak lama tetap memakai kebijakan biaya yang sudah tercatat. Nominal kesepakatan baru hanya dapat dipakai untuk penyewaan Owner baru.',
      });
    const monthlyManagementFee =
      managementFeeSource === 'negotiated_snapshot'
        ? (input.negotiated_monthly_management_fee ?? previous?.monthlyManagementFee ?? 0)
        : (previous?.monthlyManagementFee ?? 0);
    const managementFeeAgreementNote =
      managementFeeSource === 'negotiated_snapshot'
        ? (
            input.management_fee_agreement_note ??
            previous?.managementFeeAgreementNote ??
            null
          )?.trim() || null
        : null;
    if (
      mode === 'charged' &&
      managementFeeSource === 'negotiated_snapshot' &&
      (!Number.isSafeInteger(monthlyManagementFee) ||
        monthlyManagementFee <= 0 ||
        !managementFeeAgreementNote ||
        managementFeeAgreementNote.length < 3 ||
        managementFeeAgreementNote.length > 500)
    )
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_NEGOTIATED_FEE_REQUIRED',
        message:
          'Nominal dan catatan kesepakatan biaya pengelolaan wajib diisi untuk Hunian Tanggungan Owner.',
      });
    if (
      mode === 'waived' &&
      (input.negotiated_monthly_management_fee != null ||
        input.management_fee_agreement_note != null)
    )
      throw new UnprocessableEntityException({
        code: 'LEASE_SPONSORSHIP_WAIVED_NEGOTIATED_FEE_INVALID',
        message:
          'Hunian tanpa biaya pengelolaan tidak memerlukan nominal atau catatan kesepakatan biaya.',
      });
    return {
      ownerProfileId,
      managementFeeMode: mode,
      managementFeePayer: payer,
      managementFeePayerName: payerName,
      sponsorshipReason: reason,
      managementFeeSource,
      managementFeeAgreementNote: mode === 'charged' ? managementFeeAgreementNote : null,
      monthlyManagementFee: mode === 'charged' ? monthlyManagementFee : 0,
    };
  }

  private assertReview(facts: SponsorshipCorrectionFacts) {
    if (facts.policy?.allowed !== true)
      throw new ConflictException({
        code: facts.policy?.code ?? 'LEASE_REVISION_FACTS_INVALID',
        message:
          facts.policy?.message ??
          'Hubungan keuangan belum dapat dipastikan. Perbarui data sebelum mengubah penanggung atau ketentuan biaya.',
      });
  }

  private async assertNoActiveNegotiatedFeePayment(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
  ): Promise<void> {
    const activePayment = await client.query<{ id: string }>(
      `SELECT id
         FROM payments
        WHERE property_id=$1 AND lease_id=$2
          AND payment_purpose='management_fee'
          AND payment_status IN ('pending_confirmation','verified')
        LIMIT 1${facts.lock ? ' FOR UPDATE' : ''}`,
      [facts.propertyId, facts.leaseId],
    );
    if (activePayment.rowCount) {
      throw new ConflictException({
        code: 'LEASE_SPONSORSHIP_NEGOTIATED_FEE_PAYMENT_LOCKED',
        message:
          'Nominal atau catatan kesepakatan biaya tidak dapat diubah karena sudah ada pembayaran biaya pengelolaan yang menunggu konfirmasi atau terverifikasi.',
      });
    }
  }

  private async resolvePolicy(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
    proposed: ReturnType<LeaseSponsorshipCorrectionService['normalizeInput']>,
    fallbackFee: number,
  ): Promise<SponsorshipPolicySnapshot> {
    const owners = await client.query<{
      id: string;
      property_id: string;
      owner_profile_id: string;
      room_id: string;
      ownership_kind: 'building' | 'room';
    }>(
      `SELECT /* revision_sponsorship_owner */ assignment.id,assignment.property_id,assignment.owner_profile_id,
              room.id AS room_id,'building'::text AS ownership_kind
         FROM building_owner_assignments assignment
         JOIN rooms room ON room.building_id=assignment.building_id AND room.property_id=assignment.property_id
         JOIN property_owner_profiles profile ON profile.id=assignment.owner_profile_id AND profile.property_id=assignment.property_id
        WHERE room.id=$1 AND room.property_id=$2 AND room.category='rukost' AND assignment.assignment_status='active'
        ${facts.lock ? 'FOR SHARE OF assignment,profile' : ''}`,
      [facts.roomId, facts.propertyId],
    );
    const roomOwners = await client.query<(typeof owners.rows)[number]>(
      `SELECT /* revision_sponsorship_room_owner */ assignment.id,assignment.property_id,assignment.owner_profile_id,
              room.id AS room_id,'room'::text AS ownership_kind
         FROM room_owner_assignments assignment
         JOIN rooms room ON room.id=assignment.room_id AND room.property_id=assignment.property_id
         JOIN property_owner_profiles profile ON profile.id=assignment.owner_profile_id AND profile.property_id=assignment.property_id
          WHERE room.id=$1 AND room.property_id=$2 AND room.category='apartkost' AND assignment.assignment_status='active'
        ${facts.lock ? 'FOR SHARE OF assignment,profile' : ''}`,
      [facts.roomId, facts.propertyId],
    );
    const assignments = [...owners.rows, ...roomOwners.rows];
    const owner = assignments.length === 1 ? assignments[0] : null;
    if (
      !owner ||
      owner.property_id !== facts.propertyId ||
      owner.room_id !== facts.roomId ||
      owner.owner_profile_id !== proposed.ownerProfileId ||
      !['building', 'room'].includes(owner.ownership_kind)
    )
      throw new ConflictException({
        code: 'LEASE_SPONSORSHIP_OWNER_SCOPE_INVALID',
        message:
          'Owner penanggung tidak cocok dengan kepemilikan aktif kamar ini. Pilih Owner pemilik kamar yang benar atau tinjau data kepemilikannya; penanggung lama tetap tersimpan.',
      });
    let monthlyFee = 0;
    let projectedFee = 0;
    if (
      proposed.managementFeeMode === 'charged' &&
      proposed.managementFeeSource === 'negotiated_snapshot'
    ) {
      monthlyFee = proposed.monthlyManagementFee;
      projectedFee = monthlyFee * facts.termMonths;
      if (!Number.isSafeInteger(projectedFee) || projectedFee <= 0) this.missingFee();
    } else if (proposed.managementFeeMode === 'charged') {
      const fees = await client.query<{ month_index: number; monthly_fee: string }>(
        `SELECT /* revision_sponsorship_fee */ month_index.value AS month_index,
                COALESCE(fee.monthly_fee_amount,$4::bigint)::text AS monthly_fee
           FROM generate_series(0,$3::integer-1) AS month_index(value)
           LEFT JOIN LATERAL (
             SELECT monthly_fee_amount FROM property_management_fee_versions
              WHERE property_id=$1 AND effective_date<=($2::date+(month_index.value||' months')::interval)::date
              ORDER BY effective_date DESC,id DESC LIMIT 1
           ) fee ON true ORDER BY month_index.value`,
        [facts.propertyId, facts.startDate, facts.termMonths, fallbackFee],
      );
      if (
        !Number.isSafeInteger(facts.termMonths) ||
        facts.termMonths < 1 ||
        facts.termMonths > 120 ||
        fees.rows.length !== facts.termMonths ||
        fees.rows.some(
          (row, index) =>
            Number(row.month_index) !== index ||
            !/^\d+$/.test(String(row.monthly_fee)) ||
            !Number.isSafeInteger(Number(row.monthly_fee)) ||
            Number(row.monthly_fee) <= 0,
        )
      )
        this.missingFee();
      monthlyFee = Number(fees.rows[0].monthly_fee);
      projectedFee = fees.rows.reduce((sum, row) => sum + Number(row.monthly_fee), 0);
      if (!Number.isSafeInteger(projectedFee)) this.missingFee();
    }
    return {
      ...proposed,
      ownershipKind: owner.ownership_kind,
      ownershipAssignmentId: owner.id,
      managementFeeSource: proposed.managementFeeSource,
      managementFeeAgreementNote: proposed.managementFeeAgreementNote,
      monthlyManagementFee: monthlyFee,
      projectedManagementFeeAmount: projectedFee,
      roomId: facts.roomId,
      startDate: facts.startDate,
      endDate: facts.endDate,
      termMonths: facts.termMonths,
    };
  }

  async record(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
    plan: SponsorshipCorrectionPlan,
    correctionId: string,
    actorId: string,
  ) {
    this.assertLocked(facts, plan);
    await client.query(
      `INSERT INTO owner_sponsored_policy_revisions(
         property_id,lease_id,term_id,correction_id,effective_from,previous_policy,corrected_policy,created_by_user_id)
       VALUES($1,$2,$3,$4,$5::date,$6::jsonb,$7::jsonb,$8)`,
      [
        facts.propertyId,
        facts.leaseId,
        plan.termId,
        correctionId,
        plan.effectiveFrom,
        JSON.stringify(plan.previous),
        JSON.stringify(plan.corrected),
        actorId,
      ],
    );
  }

  async apply(
    client: PoolClient,
    facts: SponsorshipCorrectionFacts,
    plan: SponsorshipCorrectionPlan,
    correctionId: string,
  ) {
    this.assertLocked(facts, plan);
    if (plan.negotiatedAgreementOnly) await this.assertNoActiveNegotiatedFeePayment(client, facts);
    const next = plan.corrected;
    const updated = await client.query(
      `UPDATE owner_sponsored_lease_terms
          SET owner_profile_id=$4,ownership_kind=$5,ownership_assignment_id=$6,
              management_fee_mode=$7,management_fee_payer=$8,management_fee_payer_name=$9,
              sponsorship_reason=$10,snapshot_monthly_management_fee=$11,
              projected_management_fee_amount=$12,management_fee_source=$13,
              management_fee_agreement_note=$14,room_id=$15,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND term_status='active'
          AND owner_profile_id=$16 AND management_fee_mode=$17
          AND management_fee_payer IS NOT DISTINCT FROM $18::text
          AND management_fee_payer_name IS NOT DISTINCT FROM $19::text
          AND sponsorship_reason=$20
          AND management_fee_source=$21
          AND management_fee_agreement_note IS NOT DISTINCT FROM $22::text
          AND room_id=$24
          AND ownership_kind=$25 AND ownership_assignment_id=$26
          AND EXISTS (SELECT 1 FROM owner_sponsored_policy_revisions revision
            WHERE revision.correction_id=$23 AND revision.term_id=$1
              AND revision.property_id=$2 AND revision.lease_id=$3)`,
      [
        plan.termId,
        facts.propertyId,
        facts.leaseId,
        next.ownerProfileId,
        next.ownershipKind,
        next.ownershipAssignmentId,
        next.managementFeeMode,
        next.managementFeePayer,
        next.managementFeePayerName,
        next.sponsorshipReason,
        next.monthlyManagementFee,
        next.projectedManagementFeeAmount,
        next.managementFeeSource,
        next.managementFeeAgreementNote,
        next.roomId,
        plan.previous.ownerProfileId,
        plan.previous.managementFeeMode,
        plan.previous.managementFeePayer,
        plan.previous.managementFeePayerName,
        plan.previous.sponsorshipReason,
        plan.previous.managementFeeSource,
        plan.previous.managementFeeAgreementNote,
        correctionId,
        plan.previous.roomId,
        plan.previous.ownershipKind,
        plan.previous.ownershipAssignmentId,
      ],
    );
    if (updated.rowCount !== 1)
      throw new ConflictException({
        code: 'LEASE_SPONSORSHIP_STALE',
        message:
          'Ketentuan penanggung berubah saat koreksi disimpan. Tidak ada perubahan yang diterapkan; perbarui data dan tinjau ulang.',
      });
  }

  private assertLocked(facts: SponsorshipCorrectionFacts, plan: SponsorshipCorrectionPlan) {
    const allowsPrePaymentAgreementCorrection =
      plan.negotiatedAgreementOnly &&
      facts.policy?.code === 'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED';
    if (!facts.lock || (facts.policy?.allowed !== true && !allowsPrePaymentAgreementCorrection))
      throw new ConflictException({
        code: 'LEASE_SPONSORSHIP_COMMIT_REVIEW_REQUIRED',
        message:
          'Ketentuan penanggung harus diperiksa kembali saat penyimpanan. Perbarui ringkasan dan kirim ulang koreksi.',
      });
  }

  private amount(value: unknown): number {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) this.invalidFacts();
    return Number(value);
  }
  private invalidFacts(): never {
    throw new ConflictException({
      code: 'LEASE_SPONSORSHIP_FACTS_INVALID',
      message:
        'Catatan penanggung atau biaya pengelolaan belum dapat dipastikan. Perbarui data dan tinjau hunian Owner sebelum menyimpan koreksi.',
    });
  }
  private missingFee(): never {
    throw new ConflictException({
      code: 'LEASE_SPONSORSHIP_FEE_POLICY_MISSING',
      message:
        'Biaya pengelolaan yang berlaku untuk seluruh durasi belum tersedia atau tidak valid. Tinjau pengaturan biaya dan periode, lalu coba kembali.',
    });
  }
}
