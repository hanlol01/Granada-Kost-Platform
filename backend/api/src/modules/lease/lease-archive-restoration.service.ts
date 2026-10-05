import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { resolveLeaseCommercialAgreement } from '../billing/helpers/duration-pricing.helper';
import { ContractScheduleIssuanceService } from '../billing/services/contract-schedule-issuance.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import type { RestoreArchivedLeaseDto } from './lease-archive.dto';
import { evaluateLeaseArchiveRestoration } from './lease-archive-restoration-policy.helper';
import { readLeaseCommercialReference } from './lease-commercial-reference.helper';
import { LeaseRepository } from './lease.repository';
import { LeaseRevisionContextService } from './lease-revision-context.service';
import { LeaseSponsorshipCorrectionService } from './lease-sponsorship-correction.service';

type Context = Awaited<ReturnType<LeaseRevisionContextService['readInTransaction']>>['data'];
type ArchiveFacts = {
  id: string; property_id: string; lease_id: string; archive_status: string;
  financial_resolution_state: string;
  previous_snapshot: { context: Context; bindings: {
    resident_status: string; commitment_status: string; lease_state: Record<string, unknown>;
    settlement: { id: string } | null; sponsored_term: Record<string, unknown> | null;
  } };
  cancellation_result: { resident_profile_archived: boolean };
  current_lease: {
    onboarding_commitment_id: string; resident_id: string; room_id: string;
    payment_plan_type: 'annual_full' | 'two_month_installments' | 'monthly_installments';
    billing_cycle: 'monthly' | 'yearly'; snapshot_room_number: string;
    snapshot_kost_type_name: string;
  };
  current_commitment: { id: string; status: string } | null;
  current_settlement: { id: string; state: string } | null;
  current_term: Record<string, unknown> | null;
  activated_at: string | null; room_status: string; resident_status: string; building_code: string;
  room_available: boolean; resident_available: boolean; period_valid: boolean;
  binding_valid: boolean; room_type_valid: boolean; proof_count: number;
  invoice_count: number; sequence_offset: number;
  file_purge_unresolved: boolean;
};

/** Restores an unchanged no-money commitment. It never establishes physical occupancy. */
@Injectable()
export class LeaseArchiveRestorationService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly revisions: LeaseRevisionContextService,
    private readonly issuance: ContractScheduleIssuanceService,
    private readonly sponsorship: LeaseSponsorshipCorrectionService,
  ) {}

  async preview(user: UserAccessContext, archiveId: string, propertyId: string) {
    this.assertAdmin(user, propertyId);
    return this.leases.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const review = await this.review(client, user, archiveId, propertyId, false);
      return { data: {
        archive_id: archiveId, property_id: propertyId, original_context: review.facts.previous_snapshot.context,
        financial_resolution_state: review.facts.financial_resolution_state,
        decision: review.decision, review_fingerprint: review.fingerprint,
        lease_status_after: review.targetStatus, room_status_after: review.targetRoom,
        consequence: 'Riwayat lama tetap tersimpan. Tagihan tanpa pembayaran diterbitkan ulang melalui alur tagihan, bukan menghidupkan kuitansi lama. Check-in fisik tidak dibuat oleh pemulihan. Berkas yang telah dihapus permanen tidak dapat dikembalikan.',
      } };
    });
  }

  async restore(user: UserAccessContext, archiveId: string, dto: RestoreArchivedLeaseDto, idempotencyKey?: string) {
    this.assertAdmin(user, dto.property_id);
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) this.invalid('IDEMPOTENCY_KEY_REQUIRED', 'Pengajuan pemulihan belum memiliki kunci pengiriman. Buka tinjauan baru sebelum menyimpan.');
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason.length < 3 || reason.length > 1000) this.invalid('LEASE_ARCHIVE_RESTORE_REASON_REQUIRED', 'Isi alasan pemulihan 3–1.000 karakter, lalu tinjau kembali.');
    if (dto.restoration_confirmed !== true) this.invalid('LEASE_ARCHIVE_RESTORE_CONFIRMATION_REQUIRED', 'Konfirmasikan pemulihan setelah membaca akibatnya. Arsip belum diubah.');
    const intent = this.hash(`${dto.property_id}:${archiveId}:${user.id}:${key}`);
    const requestHash = this.hash(JSON.stringify({ property_id: dto.property_id, reason,
      review_fingerprint: dto.review_fingerprint, restoration_confirmed: true }));
    return this.leases.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text,0))", [dto.property_id]);
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [dto.property_id]);
      const scope = await client.query<{ lease_id: string }>('SELECT lease_id FROM lease_archives WHERE id=$1 AND property_id=$2', [archiveId, dto.property_id]);
      const leaseId = scope.rows[0]?.lease_id;
      if (!leaseId) this.missing();
      await client.query('SELECT id FROM leases WHERE id=$1 AND property_id=$2 FOR UPDATE', [leaseId, dto.property_id]);
      await client.query('SELECT id FROM lease_archives WHERE id=$1 AND property_id=$2 FOR UPDATE', [archiveId, dto.property_id]);
      const replay = await client.query<{ request_fingerprint: string; result_snapshot: Record<string, unknown> }>(
        'SELECT request_fingerprint,result_snapshot FROM lease_archive_restore_commands WHERE property_id=$1 AND command_fingerprint=$2', [dto.property_id, intent]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== requestHash) this.conflict('IDEMPOTENCY_KEY_REUSED', 'Pengajuan pemulihan yang sama memiliki isian berbeda. Coba ulang dengan isian semula atau buka tinjauan baru.');
        return { data: { restoration: replay.rows[0].result_snapshot }, idempotent: true };
      }
      const review = await this.review(client, user, archiveId, dto.property_id, true);
      if (!review.decision.allowed) this.conflict(review.decision.code!, review.decision.message!);
      if (dto.review_fingerprint !== review.fingerprint) this.stale();
      const { facts, current, targetStatus, targetRoom } = review;
      const source = facts.previous_snapshot.context;
      const commandId = randomUUID();
      const restored = { archive_id: archiveId, property_id: dto.property_id, lease_id: leaseId,
        resident_id: current.lease.resident_id, room_id: current.room.id, room_number: current.room.number,
        lease_code: current.lease.lease_code, archive_status: 'restored', lease_status: targetStatus,
        room_status: targetRoom, financial_resolution_state: 'not_required', reason };
      await client.query(`INSERT INTO lease_archive_restore_commands
        (id,archive_id,property_id,lease_id,command_fingerprint,request_fingerprint,created_by_user_id,reason,previous_snapshot,result_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
      [commandId, archiveId, dto.property_id, leaseId, intent, requestHash, user.id, reason,
        JSON.stringify({ facts, current, decision: review.decision }), JSON.stringify(restored)]);
      if (current.lease.commercial_mode === 'rent') {
        await this.issuance.issueScheduleInTransaction(client, {
          propertyId: dto.property_id, leaseId, startDate: current.lease.recorded_start_date,
          termMonths: current.lease.term_months, paymentPlanType: facts.current_lease.payment_plan_type,
          billingCycle: facts.current_lease.billing_cycle, contractRentAmount: current.lease.contract_rent_amount,
          snapshotMonthlyPrice: current.lease.agreed_monthly_price, snapshotRoomNumber: facts.current_lease.snapshot_room_number,
          snapshotBuildingCode: facts.building_code, snapshotCategoryName: facts.current_lease.snapshot_kost_type_name,
          initialRentCredit: 0, actorUserId: user.id, commandFingerprintPrefix: `archive-restore:${commandId}`,
          restoration: { commandId, sequenceOffset: facts.sequence_offset,
            previousSettlementId: facts.current_settlement!.id, activateFrom: targetStatus === 'active' ? facts.activated_at : null },
        });
      } else {
        this.one(await client.query(`UPDATE owner_sponsored_lease_terms SET term_status='active',updated_at=now()
          WHERE lease_id=$1 AND property_id=$2 AND term_status='cancelled' AND id=$3`,
        [leaseId, dto.property_id, facts.current_term!.id]));
      }
      this.one(await client.query(`UPDATE onboarding_commitments SET status=$4,cancelled_at=NULL,cancel_reason=NULL,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND status='cancelled' AND hold_id IS NULL AND booking_lead_id IS NULL`,
      [facts.current_commitment!.id, dto.property_id, leaseId, facts.previous_snapshot.bindings.commitment_status]));
      this.one(await client.query(`UPDATE leases SET lease_status=$3,closed_at=NULL,closed_by_user_id=NULL,close_reason=NULL,updated_at=now(),updated_by_user_id=$4
        WHERE id=$1 AND property_id=$2 AND lease_status='cancelled' AND occupancy_id IS NULL`,
      [leaseId, dto.property_id, targetStatus, user.id]));
      this.one(await client.query(`UPDATE rooms SET room_status=$3,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND room_status='vacant'`, [current.room.id, dto.property_id, targetRoom]));
      if (facts.cancellation_result.resident_profile_archived) {
        this.one(await client.query(`UPDATE residents SET resident_status=$3,archive_reason=NULL,archive_source=NULL,
          archived_at=NULL,archived_by_user_id=NULL,updated_at=now()
          WHERE id=$1 AND property_id=$2 AND resident_status='archived' AND archive_source='mistaken_lease_cancellation'`,
        [current.lease.resident_id, dto.property_id, facts.previous_snapshot.bindings.resident_status]));
      }
      this.one(await client.query(`UPDATE lease_archives SET archive_status='restored',restored_at=now(),restored_by_user_id=$3,restoration_command_id=$4
        WHERE id=$1 AND property_id=$2 AND archive_status='archived' AND financial_resolution_state='not_required'`,
      [archiveId, dto.property_id, user.id, commandId]));
      await client.query(`INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
        VALUES($1,$2,'archive_restored',$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`,
      [dto.property_id, leaseId, user.id, JSON.stringify({ action: 'lease_archive_restored', archive_id: archiveId,
        reason, room_number: current.room.number, original_status: source.lease.lease_status })]);
      return { data: { restoration: restored }, idempotent: false };
    });
  }

  private async review(client: PoolClient, user: UserAccessContext, archiveId: string, propertyId: string, lock: boolean) {
    const found = await client.query<ArchiveFacts>(`SELECT /* archive_restore_facts */ archive.id,archive.property_id,archive.lease_id,
      archive.archive_status,archive.financial_resolution_state,command.previous_snapshot,command.result_snapshot AS cancellation_result,
      to_jsonb(lease) AS current_lease,to_jsonb(commitment) AS current_commitment,to_jsonb(settlement) AS current_settlement,
      to_jsonb(term) AS current_term,lease.activated_at::text AS activated_at,room.room_status,resident.resident_status,building.building_code,
      (room.room_status='vacant' AND NOT EXISTS(SELECT 1 FROM leases other WHERE other.property_id=$2 AND other.room_id=room.id AND other.id<>lease.id AND other.lease_status IN ('draft','awaiting_activation','active'))
        AND NOT EXISTS(SELECT 1 FROM occupancies other WHERE other.property_id=$2 AND other.room_id=room.id AND other.occupancy_status='active')
        AND NOT EXISTS(SELECT 1 FROM onboarding_commitments other WHERE other.property_id=$2 AND other.room_id=room.id AND other.lease_id IS DISTINCT FROM lease.id AND other.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
        AND NOT EXISTS(SELECT 1 FROM booking_lead_holds other WHERE other.property_id=$2 AND other.room_id=room.id AND (other.hold_status='committed' OR other.hold_status='active' AND other.expires_at>now()))
        AND NOT EXISTS(SELECT 1 FROM lease_transfer_commands other WHERE other.property_id=$2 AND other.to_room_id=room.id AND other.state='scheduled')) AS room_available,
      (NOT EXISTS(SELECT 1 FROM leases other WHERE other.property_id=$2 AND other.resident_id=resident.id AND other.id<>lease.id AND other.lease_status IN ('draft','awaiting_activation','active'))
        AND NOT EXISTS(SELECT 1 FROM occupancies other WHERE other.property_id=$2 AND other.resident_id=resident.id AND other.occupancy_status='active')
        AND NOT EXISTS(SELECT 1 FROM onboarding_commitments other WHERE other.property_id=$2 AND other.resident_id=resident.id AND other.lease_id IS DISTINCT FROM lease.id AND other.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
        AND (resident.resident_status=command.previous_snapshot#>>'{bindings,resident_status}' OR resident.resident_status='archived' AND resident.archive_source='mistaken_lease_cancellation')) AS resident_available,
      (lease.end_date>(now() AT TIME ZONE 'Asia/Jakarta')::date AND lease.end_date>lease.start_date AND lease.term_months BETWEEN 1 AND 120 AND lease.service_period_state='pending_check_in') AS period_valid,
      (commitment.id IS NOT NULL AND commitment.status='cancelled' AND commitment.lease_id=lease.id AND commitment.resident_id=lease.resident_id AND commitment.room_id=lease.room_id
        AND commitment.hold_id IS NULL AND commitment.booking_lead_id IS NULL AND lease.booking_lead_id IS NULL
        AND command.previous_snapshot#>>'{bindings,commitment_status}' IN ('committed','completed')
        AND lease.occupancy_id IS NULL AND lifecycle.checked_in_at IS NULL
        AND lease.activated_at IS NOT DISTINCT FROM (command.previous_snapshot#>>'{bindings,lease_state,activated_at}')::timestamptz
        AND (command.previous_snapshot#>>'{context,lease,lease_status}'='awaiting_activation' AND lease.activated_at IS NULL
          OR command.previous_snapshot#>>'{context,lease,lease_status}'='active' AND lease.activated_at IS NOT NULL AND lifecycle.id IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM smart_lock_access_grants access JOIN smart_lock_devices device ON device.id=access.smart_lock_device_id
          WHERE access.property_id=$2 AND device.room_id=room.id AND access.resident_id=resident.id AND access.grant_status='active' AND access.grant_type='resident')) AS binding_valid,
      (type.status='active' AND type.deleted_at IS NULL AND type.property_id=$2 AND building.property_id=$2
        AND room.category=type.category AND building.category=room.category
        AND building.gender_policy=resident.gender AND room.gender_policy IN (resident.gender,'mixed')) AS room_type_valid,
      (SELECT count(*)::int FROM payment_proofs proof JOIN invoices invoice ON invoice.id=proof.invoice_id WHERE invoice.lease_id=lease.id AND invoice.property_id=$2) AS proof_count,
      (SELECT count(*)::int FROM invoices invoice WHERE invoice.lease_id=lease.id AND invoice.property_id=$2 AND invoice.invoice_status<>'void') AS invoice_count,
      (SELECT COALESCE(max(sequence_number),0)::int FROM lease_installments WHERE lease_id=lease.id AND property_id=$2) AS sequence_offset,
      EXISTS(SELECT 1 FROM lease_file_purge_items item JOIN lease_file_purge_commands purge ON purge.id=item.command_id AND purge.property_id=item.property_id
        WHERE purge.archive_id=archive.id AND item.property_id=$2 AND item.status<>'deleted') AS file_purge_unresolved
      FROM lease_archives archive JOIN lease_archive_commands command ON command.id=archive.cancellation_command_id
      JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
      JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
      JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
      JOIN kost_types type ON type.id=room.kost_type_id JOIN room_buildings building ON building.id=room.building_id
      LEFT JOIN onboarding_commitments commitment ON commitment.id=lease.onboarding_commitment_id AND commitment.property_id=$2
      LEFT JOIN lease_activation_lifecycles lifecycle ON lifecycle.lease_id=lease.id AND lifecycle.property_id=$2
      LEFT JOIN lease_contract_settlements settlement ON settlement.lease_id=lease.id AND settlement.property_id=$2
      LEFT JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=$2
      WHERE archive.id=$1 AND archive.property_id=$2`, [archiveId, propertyId]);
    const facts = found.rows[0];
    if (!facts) this.missing();
    if (found.rows.length !== 1 || !facts.previous_snapshot?.context?.lease || !facts.previous_snapshot.bindings) this.badFacts();
    const { data: current } = await this.revisions.readInTransaction(client, user, facts.lease_id);
    if (lock) {
      await client.query('SELECT id FROM rooms WHERE id=$1 AND property_id=$2 FOR UPDATE', [current.room.id, propertyId]);
      await client.query('SELECT id FROM residents WHERE id=$1 AND property_id=$2 FOR UPDATE', [current.lease.resident_id, propertyId]);
    }
    const original = facts.previous_snapshot.context;
    let commercialValid = facts.room_type_valid === true && current.lease.commercial_mode === original.lease.commercial_mode &&
      current.lease.recorded_start_date === original.lease.recorded_start_date && current.lease.recorded_end_date === original.lease.recorded_end_date &&
      current.lease.term_months === original.lease.term_months && current.room.id === original.room.id &&
      current.lease.agreed_monthly_price === original.lease.agreed_monthly_price && current.lease.contract_rent_amount === original.lease.contract_rent_amount &&
      current.lease.pricing_source === original.lease.pricing_source && current.lease.pricing_agreement_reason === original.lease.pricing_agreement_reason &&
      current.lease.resident_id === original.lease.resident_id && facts.invoice_count === 0 && Number.isSafeInteger(facts.sequence_offset) &&
      facts.sequence_offset >= 0 && facts.sequence_offset <= 2147483527;
    let sponsorshipValid = current.lease.commercial_mode === 'rent';
    if (commercialValid && current.lease.commercial_mode === 'rent') {
      commercialValid = facts.current_settlement?.state === 'cancelled' &&
        facts.current_settlement.id === facts.previous_snapshot.bindings.settlement?.id &&
        ['annual_full','two_month_installments','monthly_installments'].includes(facts.current_lease.payment_plan_type) &&
        ['monthly','yearly'].includes(facts.current_lease.billing_cycle);
      if (commercialValid) {
        try {
          const reference = await readLeaseCommercialReference(client, current.room.id, current.lease.recorded_start_date);
          const agreement = resolveLeaseCommercialAgreement({ shortStayMonthlyPrice: Number(reference.short_stay_monthly_price),
            mediumStayMonthlyPrice: Number(reference.medium_stay_monthly_price), longStayMonthlyPrice: Number(reference.long_stay_monthly_price) },
          { termMonths: current.lease.term_months, pricingSource: current.lease.pricing_source as 'standard' | 'negotiated',
            agreedMonthlyPrice: current.lease.agreed_monthly_price, managementFeeAmount: Number(reference.management_fee_amount),
            agreementReason: current.lease.pricing_agreement_reason,
            // Preserve only the already-approved agreement; a changed reference is rejected below.
            varianceAcknowledged: true });
          commercialValid = agreement.referenceMonthlyPrice === original.lease.reference_monthly_price && agreement.contractRent === original.lease.contract_rent_amount;
        } catch (error) { if (error instanceof RangeError || error instanceof ConflictException) commercialValid = false; else throw error; }
      }
    } else if (commercialValid && current.lease.commercial_mode === 'owner_sponsored') {
      const previous = original.owner_sponsorship;
      sponsorshipValid = !!previous && facts.current_term?.term_status === 'cancelled' &&
        facts.current_term.id === facts.previous_snapshot.bindings.sponsored_term?.id;
      if (sponsorshipValid && previous) {
        try {
          const policy = await this.sponsorship.prepareNewPolicy(client, { leaseId: facts.lease_id, propertyId,
            residentId: current.lease.resident_id, roomId: current.room.id, commercialMode: 'owner_sponsored',
            startDate: current.lease.recorded_start_date, endDate: current.lease.recorded_end_date, termMonths: current.lease.term_months,
            policy: { allowed: true, code: null, message: null }, lock },
          { sponsoring_owner_profile_id: String(previous.owner_profile_id), management_fee_mode: previous.management_fee_mode as 'charged' | 'waived',
            ...(previous.management_fee_mode === 'charged' ? { management_fee_payer: previous.management_fee_payer as 'resident' | 'owner' | 'other',
              ...(previous.management_fee_payer === 'other' ? { management_fee_payer_name: String(previous.management_fee_payer_name) } : {}) } : {}),
            owner_sponsorship_reason: String(previous.sponsorship_reason) });
          sponsorshipValid = policy.ownershipAssignmentId === previous.ownership_assignment_id && policy.ownershipKind === previous.ownership_kind &&
            policy.monthlyManagementFee === Number(previous.snapshot_monthly_management_fee) && policy.projectedManagementFeeAmount === Number(previous.projected_management_fee_amount) &&
            facts.current_term!.owner_profile_id === previous.owner_profile_id && facts.current_term!.management_fee_mode === previous.management_fee_mode &&
            facts.current_term!.management_fee_payer === previous.management_fee_payer && facts.current_term!.management_fee_payer_name === previous.management_fee_payer_name &&
            facts.current_term!.sponsorship_reason === previous.sponsorship_reason;
        } catch (error) { if (error instanceof ConflictException || error instanceof UnprocessableEntityException) sponsorshipValid = false; else throw error; }
      }
    }
    const decision = evaluateLeaseArchiveRestoration({ archiveStatus: facts.archive_status, leaseStatus: current.lease.lease_status,
      physicalCheckInRecorded: current.lease.physical_check_in_recorded,
      relatedTransactionCount: Math.max(current.financial.related_transaction_count, original.financial.related_transaction_count),
      paymentProofCount: facts.proof_count, recognizedIncomeAmount: current.financial.recognized_income_amount,
      ownerRealizationLinked: current.financial.owner_realization_linked,
      roomAvailable: facts.room_available, residentAvailable: facts.resident_available, periodValid: facts.period_valid,
      bindingsRestorable: facts.binding_valid && facts.financial_resolution_state === 'not_required',
      commercialTermsValid: commercialValid, sponsorshipValid, filePurgeUnresolved: facts.file_purge_unresolved });
    const targetStatus = original.lease.lease_status === 'active' ? 'active' : 'awaiting_activation';
    const targetRoom = targetStatus === 'active' ? 'awaiting_check_in' : 'reserved';
    return { facts, current, decision, targetStatus, targetRoom,
      fingerprint: this.hash(JSON.stringify({ facts, current, decision, targetStatus, targetRoom })) };
  }

  private assertAdmin(user: UserAccessContext, propertyId: string) {
    if (!user.roles.includes('admin') || !user.permissions.includes('lease.manage') || !user.roles.includes('owner') && !user.propertyIds.includes(propertyId))
      throw new ForbiddenException({ code: 'LEASE_ARCHIVE_FORBIDDEN', message: 'Pemulihan hanya tersedia untuk Admin properti dengan izin pengelolaan penyewaan.' });
  }
  private one(result: { rowCount: number | null }) { if (result.rowCount !== 1) this.stale(); }
  private stale(): never { this.conflict('LEASE_ARCHIVE_RESTORE_REVIEW_STALE', 'Data kamar atau arsip berubah setelah ditinjau. Tidak ada pemulihan disimpan; perbarui data lalu tinjau kembali.'); }
  private badFacts(): never { this.conflict('LEASE_ARCHIVE_RESTORE_FACTS_INVALID', 'Hubungan arsip belum lengkap. Perbarui data dan tinjau riwayat sebelum memulihkan.'); }
  private missing(): never { throw new NotFoundException({ code: 'LEASE_ARCHIVE_NOT_FOUND', message: 'Arsip tidak ditemukan di properti ini. Pilih kembali dari daftar arsip.' }); }
  private invalid(code: string, message: string): never { throw new UnprocessableEntityException({ code, message }); }
  private conflict(code: string, message: string): never { throw new ConflictException({ code, message }); }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
