import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { UserAccessContext } from '../iam/types/iam.types';
import { LeaseRepository } from './lease.repository';
import { evaluateLeaseRevisionPolicies } from './lease-revision-policy.helper';

type RevisionLease = {
  id: string;
  property_id: string;
  lease_code: string;
  resident_id: string;
  resident_name: string;
  resident_gender: 'male' | 'female' | 'other';
  room_id: string;
  room_number: string;
  manager_room_label: string | null;
  plot_number: string | null;
  room_category: 'rukost' | 'apartkost';
  lease_status: string;
  commercial_mode: 'rent' | 'owner_sponsored';
  start_date: string;
  end_date: string;
  term_months: number;
  planned_start_date: string | null;
  service_period_state: string;
  checked_in_date: string | null;
  physical_check_in_recorded: boolean;
  checkout_state: string | null;
  scheduled_transfer: boolean;
  pending_renewal: boolean;
  snapshot_monthly_price: string;
  snapshot_reference_monthly_price: string;
  contract_rent_amount: string;
  pricing_source: string;
  pricing_agreement_reason: string | null;
  owner_sponsorship: Record<string, unknown> | null;
};

type FinancialFacts = {
  payment_count: string;
  payment_proof_count: string;
  pending_proof_claimed_amount: string;
  verified_payment_amount: string;
  pending_payment_amount: string;
  reversal_count: string;
  deposit_transaction_count: string;
  refund_count: string;
  owner_realization_linked: boolean;
  recognized_income_amount: string;
  current_rent_invoice_amount: string;
};

@Injectable()
export class LeaseRevisionContextService {
  constructor(private readonly leases: LeaseRepository) {}

  async get(user: UserAccessContext, leaseId: string) {
    return this.leases.transaction(async (client) => {
      // Read both identity and relationships from one consistent, non-mutating snapshot.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return this.readInTransaction(client, user, leaseId);
    });
  }

  /** Mutation callers retain their aggregate lock and must re-read these facts. */
  async readInTransaction(client: PoolClient, user: UserAccessContext, leaseId: string) {
    const { rows } = await client.query<RevisionLease>(
      `SELECT lease.id,lease.property_id,lease.lease_code,lease.resident_id,
                resident.full_name AS resident_name,resident.gender AS resident_gender,
                lease.room_id,room.number AS room_number,
                room.manager_room_label,room.plot_number,room.category AS room_category,
                lease.lease_status,lease.commercial_mode,
                lease.start_date::text,lease.end_date::text,lease.term_months,
                lease.planned_start_date::text,lease.service_period_state,
                COALESCE(latest.corrected_snapshot->>'checkedInDate',
                  (lifecycle.checked_in_at AT TIME ZONE 'Asia/Jakarta')::date::text,
                  occupancy.start_date::text) AS checked_in_date,
                (lease.occupancy_id IS NOT NULL OR lifecycle.checked_in_at IS NOT NULL
                  OR EXISTS (SELECT 1 FROM room_transfer_records transfer
                    WHERE transfer.property_id=lease.property_id
                      AND (transfer.from_lease_id=lease.id OR transfer.to_lease_id=lease.id)))
                  AS physical_check_in_recorded,
                checkout.state AS checkout_state,
                EXISTS (SELECT 1 FROM lease_transfer_commands command
                  WHERE command.property_id=lease.property_id AND command.from_lease_id=lease.id
                    AND command.state='scheduled') AS scheduled_transfer,
                EXISTS (SELECT 1 FROM lease_renewal_commands command
                  WHERE command.property_id=lease.property_id
                    AND (command.predecessor_lease_id=lease.id OR command.successor_lease_id=lease.id)
                    AND command.state IN ('draft','approved')) AS pending_renewal,
                lease.snapshot_monthly_price::text,lease.snapshot_reference_monthly_price::text,
                lease.contract_rent_amount::text,lease.pricing_source,lease.pricing_agreement_reason,
                CASE WHEN term.id IS NULL OR term.term_status<>'active' OR lease.commercial_mode<>'owner_sponsored'
                  THEN NULL ELSE jsonb_build_object(
                  'owner_profile_id',term.owner_profile_id,'owner_name',owner.full_name,
                  'ownership_kind',term.ownership_kind,'ownership_assignment_id',term.ownership_assignment_id,
                  'sponsorship_reason',term.sponsorship_reason,'management_fee_mode',term.management_fee_mode,
                  'management_fee_payer',term.management_fee_payer,
                  'management_fee_payer_name',term.management_fee_payer_name,
                  'snapshot_monthly_management_fee',term.snapshot_monthly_management_fee,
                  'projected_management_fee_amount',progress.current_projected_management_fee_amount,
                  'verified_management_fee_amount',progress.verified_paid_amount,
                  'term_status',term.term_status) END AS owner_sponsorship
           FROM leases lease
           JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
           JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
           LEFT JOIN occupancies occupancy ON occupancy.id=lease.occupancy_id AND occupancy.property_id=lease.property_id
           LEFT JOIN lease_activation_lifecycles lifecycle ON lifecycle.lease_id=lease.id AND lifecycle.property_id=lease.property_id
           LEFT JOIN LATERAL (
             SELECT corrected_snapshot FROM lease_data_corrections correction
              WHERE correction.lease_id=lease.id AND correction.property_id=lease.property_id
                AND correction.corrected_snapshot ? 'checkedInDate'
              ORDER BY sequence_number DESC LIMIT 1
           ) latest ON true
           LEFT JOIN LATERAL (
             SELECT state FROM lease_checkout_commands command
              WHERE command.lease_id=lease.id AND command.property_id=lease.property_id AND command.state<>'cancelled'
              ORDER BY command.created_at DESC,command.id DESC LIMIT 1
           ) checkout ON true
           LEFT JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id
           LEFT JOIN property_owner_profiles owner ON owner.id=term.owner_profile_id AND owner.property_id=lease.property_id
           LEFT JOIN owner_sponsored_management_fee_progress progress ON progress.id=term.id
          WHERE lease.id=$1`,
      [leaseId],
    );
    const lease = rows[0];
    if (!lease)
      throw new NotFoundException({
        code: 'LEASE_NOT_FOUND',
        message:
          'Penyewaan tidak ditemukan. Kembali ke daftar penghuni dan pilih data yang masih tersedia.',
      });
    this.assertAdmin(user, lease.property_id);
    const financial = await this.readFinancialFacts(client, leaseId, lease.property_id);
    const counts = [
      financial.payment_count,
      financial.reversal_count,
      financial.deposit_transaction_count,
      financial.refund_count,
      financial.payment_proof_count,
    ].map(this.safeNumber);
    const relatedTransactionCount = counts.reduce((sum, value) => sum + value, 0);
    const verified = this.safeNumber(financial.verified_payment_amount);
    const pending = this.safeNumber(financial.pending_payment_amount);
    const pendingProofClaims = this.safeNumber(financial.pending_proof_claimed_amount);
    const recognized = this.safeNumber(financial.recognized_income_amount);
    const invoiceAmount = this.safeNumber(financial.current_rent_invoice_amount);
    if (
      ![
        ...counts,
        relatedTransactionCount,
        verified,
        pending,
        pendingProofClaims,
        recognized,
        invoiceAmount,
        this.safeNumber(lease.contract_rent_amount),
        this.safeNumber(lease.snapshot_monthly_price),
        this.safeNumber(lease.snapshot_reference_monthly_price),
      ].every((value) => Number.isSafeInteger(value) && value >= 0)
    ) {
      throw new ConflictException({
        code: 'LEASE_REVISION_FACTS_INVALID',
        message:
          'Ringkasan keuangan penyewaan belum dapat dipastikan. Perbarui data dan coba kembali sebelum melakukan koreksi atau pembatalan.',
      });
    }
    const policies = evaluateLeaseRevisionPolicies({
      leaseStatus: lease.lease_status,
      physicalCheckInRecorded: lease.physical_check_in_recorded,
      checkoutState: lease.checkout_state,
      scheduledTransfer: lease.scheduled_transfer,
      pendingRenewal: lease.pending_renewal,
      relatedTransactionCount,
      recognizedIncomeAmount: recognized,
      ownerRealizationLinked: financial.owner_realization_linked,
    });
    return {
      data: {
        lease: {
          id: lease.id,
          property_id: lease.property_id,
          lease_code: lease.lease_code,
          resident_id: lease.resident_id,
          resident_name: lease.resident_name,
          resident_gender: lease.resident_gender,
          lease_status: lease.lease_status,
          commercial_mode: lease.commercial_mode,
          term_months: Number(lease.term_months),
          planned_start_date: lease.planned_start_date,
          recorded_start_date: lease.start_date,
          recorded_end_date: lease.end_date,
          effective_start_date:
            lease.service_period_state === 'pending_check_in' ? null : lease.start_date,
          effective_end_date:
            lease.service_period_state === 'pending_check_in' ? null : lease.end_date,
          service_period_state: lease.service_period_state,
          checked_in_date: lease.checked_in_date,
          physical_check_in_recorded: lease.physical_check_in_recorded,
          agreed_monthly_price: this.safeNumber(lease.snapshot_monthly_price),
          reference_monthly_price: this.safeNumber(lease.snapshot_reference_monthly_price),
          contract_rent_amount: this.safeNumber(lease.contract_rent_amount),
          pricing_source: lease.pricing_source,
          pricing_agreement_reason: lease.pricing_agreement_reason,
        },
        room: {
          id: lease.room_id,
          number: lease.room_number,
          manager_room_label: lease.manager_room_label,
          plot_number: lease.plot_number,
          category: lease.room_category,
        },
        owner_sponsorship: lease.owner_sponsorship,
        financial: {
          related_transaction_count: relatedTransactionCount,
          payment_count: counts[0],
          payment_proof_count: counts[4],
          pending_proof_claimed_amount: pendingProofClaims,
          reversal_count: counts[1],
          deposit_transaction_count: counts[2],
          refund_count: counts[3],
          verified_payment_amount: verified,
          pending_payment_amount: pending,
          recognized_income_amount: recognized,
          current_rent_invoice_amount: invoiceAmount,
          owner_realization_linked: financial.owner_realization_linked,
        },
        policies,
      },
    };
  }

  private async readFinancialFacts(client: PoolClient, leaseId: string, propertyId: string) {
    const { rows } = await client.query<FinancialFacts>(
      `WITH revision_financial_facts AS (
         SELECT payment.id,payment.amount,payment.payment_status FROM payments payment
          WHERE payment.property_id=$2 AND (payment.lease_id=$1 OR EXISTS (
            SELECT 1 FROM payment_allocations allocation JOIN invoices invoice ON invoice.id=allocation.invoice_id
             WHERE allocation.payment_id=payment.id AND invoice.property_id=$2
                AND (allocation.lease_id=$1 OR invoice.lease_id=$1 OR (
                  allocation.lease_id IS NULL AND invoice.lease_id IS NULL
                  AND invoice.occupancy_id=(SELECT occupancy_id FROM leases WHERE id=$1 AND property_id=$2)))))
       ), revision_payment_proofs AS (
         SELECT proof.proof_status,proof.claimed_amount
           FROM payment_proofs proof
           JOIN invoices invoice ON invoice.id=proof.invoice_id AND invoice.property_id=proof.property_id
          WHERE proof.property_id=$2 AND (proof.lease_id=$1 OR invoice.lease_id=$1 OR (
            proof.lease_id IS NULL AND invoice.lease_id IS NULL
            AND invoice.occupancy_id=(SELECT occupancy_id FROM leases WHERE id=$1 AND property_id=$2)))
       ) SELECT
         (SELECT count(*)::text FROM revision_financial_facts) AS payment_count,
         (SELECT count(*)::text FROM revision_payment_proofs) AS payment_proof_count,
         (SELECT COALESCE(sum(claimed_amount) FILTER (WHERE proof_status='pending_review'),0)::text
           FROM revision_payment_proofs) AS pending_proof_claimed_amount,
         (SELECT COALESCE(sum(amount) FILTER (WHERE payment_status='verified'),0)::text FROM revision_financial_facts) AS verified_payment_amount,
         (SELECT COALESCE(sum(amount) FILTER (WHERE payment_status='pending_confirmation'),0)::text FROM revision_financial_facts) AS pending_payment_amount,
         (SELECT count(*)::text FROM payment_reversals reversal JOIN revision_financial_facts payment ON payment.id=reversal.payment_id WHERE reversal.property_id=$2) AS reversal_count,
         (SELECT count(*)::text FROM lease_deposit_transactions WHERE lease_id=$1 AND property_id=$2) AS deposit_transaction_count,
         ((SELECT count(*) FROM lease_exit_refunds WHERE lease_id=$1 AND property_id=$2)
           + (SELECT count(*) FROM lease_refund_settlements settlement JOIN lease_deposit_transactions deposit ON deposit.id=settlement.deposit_transaction_id
               WHERE deposit.lease_id=$1 AND deposit.property_id=$2 AND settlement.property_id=$2)
           + (SELECT count(*) FROM booking_lead_payment_commitment_refunds refund
               JOIN booking_lead_payment_commitments commitment ON commitment.id=refund.commitment_id
               JOIN onboarding_commitments onboarding ON onboarding.id=commitment.materialized_onboarding_commitment_id
               WHERE onboarding.lease_id=$1 AND onboarding.property_id=$2 AND refund.property_id=$2))::text AS refund_count,
         EXISTS (SELECT 1 FROM property_owner_realization_lease_locks lock
           JOIN property_owner_realizations realization ON realization.id=lock.realization_id AND realization.property_id=lock.property_id
           WHERE lock.lease_id=$1 AND lock.property_id=$2
             AND (lock.lock_status='locked' OR realization.realization_status<>'void')) AS owner_realization_linked,
         (SELECT COALESCE(sum(gross_collected_amount) FILTER (WHERE earning_status='recognized'),0)::text
             FROM property_owner_earnings earning WHERE earning.property_id=$2
               AND (earning.lease_id=$1 OR (earning.lease_id IS NULL
                 AND earning.payment_id IN (SELECT id FROM revision_financial_facts)))) AS recognized_income_amount,
         (SELECT COALESCE(sum(GREATEST(total_amount-credit_amount,0)),0)::text
             FROM invoices WHERE property_id=$2 AND invoice_purpose='rent' AND invoice_status<>'void'
               AND (lease_id=$1 OR (lease_id IS NULL AND occupancy_id=(SELECT occupancy_id FROM leases WHERE id=$1 AND property_id=$2)))) AS current_rent_invoice_amount`,
      [leaseId, propertyId],
    );
    if (!rows[0])
      throw new ConflictException({
        code: 'LEASE_REVISION_FACTS_INVALID',
        message: 'Hubungan keuangan penyewaan belum tersedia. Perbarui data dan coba kembali.',
      });
    return rows[0];
  }

  private safeNumber(this: void, value: unknown): number {
    return (typeof value === 'string' && /^\d+$/.test(value)) || typeof value === 'number'
      ? Number(value)
      : NaN;
  }

  private assertAdmin(user: UserAccessContext, propertyId: string) {
    if (
      !user.roles.includes('admin') ||
      !user.permissions.includes('lease.manage') ||
      (!user.roles.includes('owner') && !user.propertyIds.includes(propertyId))
    ) {
      throw new ForbiddenException({
        code: 'LEASE_REVISION_FORBIDDEN',
        message:
          'Koreksi dan pembatalan hanya tersedia untuk Admin properti terkait. Gunakan akun Admin dengan akses pengelolaan penyewaan.',
      });
    }
  }
}
