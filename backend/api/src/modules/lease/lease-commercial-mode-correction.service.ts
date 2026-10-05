import { ConflictException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { UserAccessContext } from '../iam/types/iam.types';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { ContractScheduleIssuanceService } from '../billing/services/contract-schedule-issuance.service';
import type { ContractPaymentPlan } from '../billing/helpers/contract-schedule.helper';
import {
  LeaseSponsorshipCorrectionService,
  type SponsorshipCorrectionInput,
  type SponsorshipPolicySnapshot,
} from './lease-sponsorship-correction.service';
import type { LeaseRevisionDecision } from './lease-revision-policy.helper';

export type CommercialModeCorrectionFacts = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  sourceMode: 'rent' | 'owner_sponsored';
  targetMode: 'rent' | 'owner_sponsored';
  leaseStatus: string;
  servicePeriodState: string;
  activatedAt: string | null;
  onboardingCommitmentId: string | null;
  startDate: string;
  endDate: string;
  termMonths: number;
  billingCycle: 'monthly' | 'yearly';
  paymentPlanType: ContractPaymentPlan;
  policy: LeaseRevisionDecision;
  lock: boolean;
};
type InvoiceFact = {
  id: string;
  invoice_code: string;
  invoice_purpose: string;
  invoice_status: string;
  credit_amount: string;
  allocated_amount: string;
  proof_count: number;
};
export type CommercialModeCorrectionPlan = {
  previousBilling: {
    invoices: InvoiceFact[];
    settlement: (Record<string, unknown> & { id: string; state: string }) | null;
    term: (Record<string, unknown> & { id: string; term_status: string }) | null;
  };
  newSponsorship: SponsorshipPolicySnapshot | null;
  sequenceOffset: number;
  targetBuildingCode: string | null;
};

/** One aggregate transaction; immutable history, canonical W06 void and W05 issuance. */
@Injectable()
export class LeaseCommercialModeCorrectionService {
  constructor(
    private readonly billing: W06BillingService,
    private readonly issuance: ContractScheduleIssuanceService,
    private readonly sponsorship: LeaseSponsorshipCorrectionService,
  ) {}

  async preview(
    client: PoolClient,
    facts: CommercialModeCorrectionFacts,
    input: SponsorshipCorrectionInput,
  ): Promise<CommercialModeCorrectionPlan | null> {
    if (facts.sourceMode === facts.targetMode) return null;
    this.assertReview(facts);
    if (
      facts.targetMode === 'rent' &&
      [
        input.sponsoring_owner_profile_id,
        input.management_fee_mode,
        input.management_fee_payer,
        input.management_fee_payer_name,
        input.owner_sponsorship_reason,
      ].some((value) => value != null)
    )
      throw new ConflictException({
        code: 'LEASE_MODE_CORRECTION_SPONSORSHIP_NOT_APPLICABLE',
        message:
          'Isian penanggung Owner hanya berlaku untuk Hunian Tanggungan Owner. Lepaskan isian tersebut bila hasil koreksi adalah Penyewaan Berbayar, lalu tinjau ulang.',
      });
    if (
      !facts.onboardingCommitmentId ||
      !['awaiting_activation', 'active'].includes(facts.leaseStatus) ||
      !['legacy', 'pending_check_in', 'started'].includes(facts.servicePeriodState) ||
      (facts.leaseStatus === 'active' &&
        (!facts.activatedAt || !Number.isFinite(Date.parse(facts.activatedAt))))
    )
      this.invalidFacts(
        'Catatan komitmen, periode layanan, atau tanggal aktivasi belum lengkap. Tinjau pencatatan aktivasi sebelum mengubah jenis hunian.',
      );
    const invoices = await client.query<InvoiceFact>(
      `SELECT /* revision_mode_invoices */ invoice.id,invoice.invoice_code,
      invoice.invoice_purpose,invoice.invoice_status,invoice.credit_amount::text,
      COALESCE(allocation.amount,0)::text AS allocated_amount,
      (SELECT count(*)::int FROM payment_proofs proof WHERE proof.invoice_id=invoice.id) AS proof_count
      FROM invoices invoice LEFT JOIN LATERAL (
        SELECT COALESCE(sum(allocated_amount),0) AS amount FROM payment_allocations WHERE invoice_id=invoice.id
      ) allocation ON true WHERE invoice.lease_id=$1 AND invoice.property_id=$2 AND invoice.invoice_status<>'void'
      ORDER BY invoice.id ${facts.lock ? 'FOR UPDATE OF invoice' : ''}`,
      [facts.leaseId, facts.propertyId],
    );
    const proofHistory = await client.query<{ count: number }>(
      `SELECT /* revision_mode_proof_history */ count(*)::int AS count
      FROM payment_proofs proof JOIN invoices invoice ON invoice.id=proof.invoice_id AND invoice.property_id=$2
      WHERE invoice.lease_id=$1 OR (invoice.lease_id IS NULL AND invoice.occupancy_id=(
        SELECT occupancy_id FROM leases WHERE id=$1 AND property_id=$2))`,
      [facts.leaseId, facts.propertyId],
    );
    if (
      proofHistory.rows[0]?.count !== 0 ||
      invoices.rows.some(
        (invoice) =>
          !invoice.id ||
          !invoice.invoice_code ||
          invoice.invoice_purpose !== 'rent' ||
          !['draft', 'issued', 'overdue'].includes(invoice.invoice_status) ||
          invoice.credit_amount !== '0' ||
          invoice.allocated_amount !== '0' ||
          invoice.proof_count !== 0,
      )
    ) {
      throw new ConflictException({
        code: 'LEASE_MODE_CORRECTION_BILLING_REVIEW_REQUIRED',
        message:
          'Jenis hunian belum dapat diubah karena tagihan memiliki bukti, alokasi, kredit, atau kewajiban lain. Tinjau penyelesaian tagihan terlebih dahulu; dokumen lama tidak dihapus.',
      });
    }
    const settlement = await client.query<{
      data: NonNullable<CommercialModeCorrectionPlan['previousBilling']['settlement']>;
    }>(
      `SELECT /* revision_mode_settlement */ to_jsonb(settlement) AS data FROM lease_contract_settlements settlement
       WHERE lease_id=$1 AND property_id=$2 ${facts.lock ? 'FOR UPDATE' : ''}`,
      [facts.leaseId, facts.propertyId],
    );
    const term = await client.query<{
      data: NonNullable<CommercialModeCorrectionPlan['previousBilling']['term']>;
    }>(
      `SELECT /* revision_mode_term */ to_jsonb(term) AS data FROM owner_sponsored_lease_terms term
       WHERE lease_id=$1 AND property_id=$2 ${facts.lock ? 'FOR UPDATE' : ''}`,
      [facts.leaseId, facts.propertyId],
    );
    if (settlement.rows.length > 1 || term.rows.length > 1) this.invalidFacts();
    const oldSettlement = settlement.rows[0]?.data ?? null,
      oldTerm = term.rows[0]?.data ?? null;
    if (
      facts.sourceMode === 'rent' &&
      (!oldSettlement ||
        !['awaiting_activation', 'open'].includes(oldSettlement.state) ||
        !invoices.rows.some((invoice) => invoice.id === oldSettlement.invoice_id))
    )
      this.invalidFacts(
        'Tagihan sewa belum cocok dengan catatan pelunasan aktif. Tinjau rincian tagihan penyewaan sebelum mengubah jenis hunian.',
      );
    if (
      facts.sourceMode === 'owner_sponsored' &&
      (!oldTerm ||
        oldTerm.term_status !== 'active' ||
        invoices.rows.length > 0 ||
        (oldSettlement && oldSettlement.state !== 'cancelled'))
    )
      this.invalidFacts(
        'Ketentuan penanggung Owner belum aktif atau masih ada tagihan sewa yang belum dibatalkan. Tinjau ketentuan Owner dan riwayat tagihan sebelum melanjutkan.',
      );
    if (facts.sourceMode === 'rent' && oldTerm && oldTerm.term_status !== 'cancelled')
      this.invalidFacts();
    const sequence = await client.query<{ maximum: number }>(
      `SELECT /* revision_mode_sequence */ COALESCE(max(sequence_number),0)::int AS maximum
      FROM lease_installments WHERE lease_id=$1 AND property_id=$2`,
      [facts.leaseId, facts.propertyId],
    );
    const offset = sequence.rows[0]?.maximum;
    if (!Number.isSafeInteger(offset) || offset < 0) this.invalidFacts();
    const newSponsorship =
      facts.targetMode === 'owner_sponsored'
        ? await this.sponsorship.prepareNewPolicy(
            client,
            {
              leaseId: facts.leaseId,
              propertyId: facts.propertyId,
              residentId: facts.residentId,
              roomId: facts.roomId,
              commercialMode: 'owner_sponsored',
              startDate: facts.startDate,
              endDate: facts.endDate,
              termMonths: facts.termMonths,
              policy: facts.policy,
              lock: facts.lock,
            },
            input,
          )
        : null;
    const targetBuilding = await client.query<{ building_code: string | null }>(
      `SELECT /* revision_mode_target_building */ building.building_code
      FROM rooms room JOIN room_buildings building ON building.id=room.building_id AND building.property_id=room.property_id
      WHERE room.id=$1 AND room.property_id=$2`,
      [facts.roomId, facts.propertyId],
    );
    if (targetBuilding.rows.length !== 1) this.invalidFacts();
    return {
      previousBilling: { invoices: invoices.rows, settlement: oldSettlement, term: oldTerm },
      newSponsorship,
      sequenceOffset: offset,
      targetBuildingCode: targetBuilding.rows[0].building_code,
    };
  }

  async record(
    client: PoolClient,
    facts: CommercialModeCorrectionFacts,
    correctionId: string,
    actorId: string,
    previous: Record<string, unknown>,
    corrected: Record<string, unknown>,
  ) {
    this.assertLocked(facts);
    await client.query(
      `INSERT INTO lease_commercial_mode_revisions(property_id,lease_id,correction_id,from_mode,to_mode,
      effective_from,previous_state,corrected_state,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6::date,$7::jsonb,$8::jsonb,$9)`,
      [
        facts.propertyId,
        facts.leaseId,
        correctionId,
        facts.sourceMode,
        facts.targetMode,
        facts.startDate,
        JSON.stringify(previous),
        JSON.stringify(corrected),
        actorId,
      ],
    );
  }

  async retireSource(
    client: PoolClient,
    facts: CommercialModeCorrectionFacts,
    plan: CommercialModeCorrectionPlan,
    actor: UserAccessContext,
    reason: string,
  ) {
    this.assertLocked(facts);
    if (facts.sourceMode === 'owner_sponsored') {
      const retired = await client.query(
        `UPDATE owner_sponsored_lease_terms SET term_status='cancelled',updated_at=now()
        WHERE id=$1 AND lease_id=$2 AND property_id=$3 AND term_status='active'`,
        [plan.previousBilling.term!.id, facts.leaseId, facts.propertyId],
      );
      if (retired.rowCount !== 1) this.stale();
    }
    for (const invoice of plan.previousBilling.invoices)
      await this.billing.voidInvoiceInTransaction(
        client,
        actor,
        invoice.id,
        { property_id: facts.propertyId, reason: `Koreksi jenis hunian: ${reason}` },
        {},
        facts.leaseId,
      );
    if (facts.sourceMode === 'rent') {
      const cancelled = await client.query(
        `UPDATE lease_contract_settlements
        SET state='cancelled',activated_at=NULL,original_due_at=NULL,extension_due_at=NULL,extension_reason=NULL,
            extension_granted_at=NULL,extension_granted_by_user_id=NULL,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND state=$4`,
        [
          plan.previousBilling.settlement!.id,
          facts.propertyId,
          facts.leaseId,
          plan.previousBilling.settlement!.state,
        ],
      );
      if (cancelled.rowCount !== 1) this.stale();
    }
  }

  async applyTarget(
    client: PoolClient,
    facts: CommercialModeCorrectionFacts,
    plan: CommercialModeCorrectionPlan,
    correctionId: string,
    actorId: string,
    commercial: {
      agreedMonthlyPrice: number;
      contractRentAmount: number;
      roomNumber?: string;
      kostTypeName?: string;
    },
  ) {
    this.assertLocked(facts);
    if (facts.targetMode === 'owner_sponsored') {
      const policy = plan.newSponsorship!;
      const inserted = await client.query(
        `INSERT INTO owner_sponsored_lease_terms(property_id,lease_id,onboarding_commitment_id,resident_id,room_id,
        owner_profile_id,ownership_kind,ownership_assignment_id,management_fee_mode,management_fee_payer,management_fee_payer_name,
        sponsorship_reason,snapshot_monthly_management_fee,projected_management_fee_amount,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT(lease_id) DO UPDATE SET room_id=EXCLUDED.room_id,owner_profile_id=EXCLUDED.owner_profile_id,
          ownership_kind=EXCLUDED.ownership_kind,ownership_assignment_id=EXCLUDED.ownership_assignment_id,
          management_fee_mode=EXCLUDED.management_fee_mode,management_fee_payer=EXCLUDED.management_fee_payer,
          management_fee_payer_name=EXCLUDED.management_fee_payer_name,sponsorship_reason=EXCLUDED.sponsorship_reason,
          snapshot_monthly_management_fee=EXCLUDED.snapshot_monthly_management_fee,
          projected_management_fee_amount=EXCLUDED.projected_management_fee_amount,term_status='active',updated_at=now()
        WHERE owner_sponsored_lease_terms.term_status='cancelled' AND owner_sponsored_lease_terms.property_id=EXCLUDED.property_id
          AND owner_sponsored_lease_terms.onboarding_commitment_id=EXCLUDED.onboarding_commitment_id
          AND owner_sponsored_lease_terms.resident_id=EXCLUDED.resident_id`,
        [
          facts.propertyId,
          facts.leaseId,
          facts.onboardingCommitmentId,
          facts.residentId,
          facts.roomId,
          policy.ownerProfileId,
          policy.ownershipKind,
          policy.ownershipAssignmentId,
          policy.managementFeeMode,
          policy.managementFeePayer,
          policy.managementFeePayerName,
          policy.sponsorshipReason,
          policy.monthlyManagementFee,
          policy.projectedManagementFeeAmount,
          actorId,
        ],
      );
      if (inserted.rowCount !== 1) this.stale();
    } else
      await this.issuance.issueScheduleInTransaction(client, {
        propertyId: facts.propertyId,
        leaseId: facts.leaseId,
        startDate: facts.startDate,
        termMonths: facts.termMonths,
        paymentPlanType: facts.paymentPlanType,
        contractRentAmount: commercial.contractRentAmount,
        billingCycle: facts.billingCycle,
        snapshotMonthlyPrice: commercial.agreedMonthlyPrice,
        snapshotRoomNumber: commercial.roomNumber!,
        snapshotBuildingCode: plan.targetBuildingCode,
        snapshotCategoryName: commercial.kostTypeName!,
        initialRentCredit: 0,
        commandFingerprintPrefix: `lease-mode-correction:${correctionId}`,
        actorUserId: actorId,
        correction: {
          correctionId,
          sequenceOffset: plan.sequenceOffset,
          previousSettlementId: plan.previousBilling.settlement?.id ?? null,
          activateFrom: facts.leaseStatus === 'active' ? facts.activatedAt : null,
        },
      });
  }

  private assertReview(facts: CommercialModeCorrectionFacts) {
    if (facts.policy?.allowed !== true)
      throw new ConflictException({
        code: facts.policy?.code ?? 'LEASE_REVISION_FACTS_INVALID',
        message:
          facts.policy?.message ??
          'Hubungan keuangan belum dapat dipastikan. Perbarui tinjauan sebelum mengubah jenis hunian.',
      });
  }
  private assertLocked(facts: CommercialModeCorrectionFacts) {
    this.assertReview(facts);
    if (!facts.lock) this.stale();
  }
  private invalidFacts(
    message = 'Otoritas penyewaan, aktivasi, atau tagihan belum lengkap untuk perubahan jenis hunian. Perbarui data dan tinjau riwayat sebelum menyimpan; catatan lama tetap aman.',
  ): never {
    throw new ConflictException({ code: 'LEASE_MODE_CORRECTION_FACTS_INVALID', message });
  }
  private stale(): never {
    throw new ConflictException({
      code: 'LEASE_MODE_CORRECTION_STALE',
      message:
        'Data jenis hunian berubah saat koreksi disimpan. Tidak ada perubahan diterapkan; perbarui tinjauan dan coba lagi.',
    });
  }
}
