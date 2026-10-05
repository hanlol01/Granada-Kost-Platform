import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { W06BillingService } from '../billing/services/w06-billing.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import { LeaseRepository } from './lease.repository';
import { LeaseRevisionContextService } from './lease-revision-context.service';
import type { CancelAndArchiveLeaseDto, LeaseArchiveQueryDto } from './lease-archive.dto';

type Context = Awaited<ReturnType<LeaseRevisionContextService['readInTransaction']>>['data'];
type Bindings = {
  room_status: string;
  resident_status: string;
  commitment_id: string | null;
  commitment_status: string | null;
  hold_id: string | null;
  hold_status: string | null;
  booking_lead_id: string | null;
  booking_lead_status: string | null;
  lease_state?: Record<string, unknown>;
  settlement: Record<string, unknown> | null;
  sponsored_term: Record<string, unknown> | null;
  binding_valid: boolean;
  room_conflict: boolean;
  active_access: boolean;
};
type ArchiveCommand = {
  id: string;
  property_id: string;
  lease_id: string;
  request_fingerprint: string;
  created_by_user_id: string;
  reason: string;
  previous_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
  created_at: Date;
};

/** Cancel mistaken onboarding, not a real occupancy, refund or physical file deletion. */
@Injectable()
export class LeaseArchiveService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly revisions: LeaseRevisionContextService,
    private readonly billing: W06BillingService,
  ) {}

  async previewCancellation(user: UserAccessContext, leaseId: string) {
    this.assertAdmin(user);
    return this.leases.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const review = await this.review(client, user, leaseId, false);
      return { data: {
        ...review.context,
        review_fingerprint: review.fingerprint,
        room_after: 'vacant',
        financial_resolution_state: review.context.policies.cancellation.financial_resolution_required ? 'pending_review' : 'not_required',
        invoice_count: review.invoices.length,
        consequence: review.context.policies.cancellation.financial_resolution_required
          ? 'Penyewaan masuk arsip dan kamar dilepas. Transaksi, tagihan dan bukti tetap tersimpan; penyelesaian keuangan belum dianggap selesai.'
          : 'Penyewaan masuk arsip dan kamar dilepas. Tagihan yang belum memiliki riwayat transaksi dibatalkan melalui alur tagihan; riwayat tetap tersimpan.',
      } };
    });
  }

  async cancel(user: UserAccessContext, leaseId: string, dto: CancelAndArchiveLeaseDto, idempotencyKey?: string) {
    this.assertAdmin(user);
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) this.invalid('IDEMPOTENCY_KEY_REQUIRED', 'Pengajuan belum memiliki kunci pengiriman yang valid. Muat ulang tinjauan sebelum menyimpan.');
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason.length < 3 || reason.length > 1000) this.invalid('LEASE_CANCELLATION_REASON_REQUIRED', 'Isi alasan pembatalan 3–1.000 karakter yang menjelaskan kesalahan pencatatan.');
    if (dto.cancellation_confirmed !== true) this.invalid('LEASE_CANCELLATION_CONFIRMATION_REQUIRED', 'Konfirmasikan pembatalan dan akibatnya setelah membaca tinjauan. Tidak ada data yang dibatalkan.');
    const requestFingerprint = this.hash(JSON.stringify({
      reason, review_fingerprint: dto.review_fingerprint,
      cancellation_confirmed: dto.cancellation_confirmed,
      mistaken_activation_confirmed: dto.mistaken_activation_confirmed === true,
    }));
    return this.leases.transaction(async (client) => {
      const scope = await client.query<{ property_id: string }>('SELECT /* archive_scope */ property_id FROM leases WHERE id=$1', [leaseId]);
      const propertyId = scope.rows[0]?.property_id;
      if (!propertyId) this.missing();
      this.assertAdmin(user, propertyId);
      // Same aggregate order as onboarding, correction and W06 payments.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text,0))", [propertyId]);
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [propertyId]);
      const locked = await client.query('SELECT id FROM leases WHERE id=$1 AND property_id=$2 FOR UPDATE', [leaseId, propertyId]);
      if (locked.rowCount !== 1) this.missing();
      const commandFingerprint = this.hash(`${propertyId}:${leaseId}:${user.id}:${key}`);
      const replay = await client.query<ArchiveCommand>(
        'SELECT /* archive_replay */ * FROM lease_archive_commands WHERE property_id=$1 AND command_fingerprint=$2',
        [propertyId, commandFingerprint],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== requestFingerprint || replay.rows[0].created_by_user_id !== user.id)
          this.conflict('IDEMPOTENCY_KEY_REUSED', 'Pengajuan yang sama dipakai untuk isian berbeda. Pertahankan isian awal untuk mencoba ulang, atau buka tinjauan baru.');
        return { data: { archive: replay.rows[0].result_snapshot }, idempotent: true };
      }
      const review = await this.review(client, user, leaseId, true);
      if (dto.review_fingerprint !== review.fingerprint)
        this.conflict('LEASE_CANCELLATION_REVIEW_STALE', 'Data berubah setelah tinjauan pembatalan. Tidak ada perubahan disimpan; perbarui data dan tinjau kembali sebelum membatalkan.');
      if (review.context.policies.cancellation.requires_mistaken_activation_confirmation && dto.mistaken_activation_confirmed !== true)
        this.conflict('LEASE_CANCELLATION_ACTIVATION_CONFIRMATION_REQUIRED', 'Penyewaan sudah diaktivasi. Konfirmasikan terpisah bahwa aktivasi keliru dan penghuni belum pernah menerima atau menghuni kamar; gunakan check-out bila hunian benar-benar berlangsung.');

      const { context, bindings, invoices } = review;
      const financePending = context.policies.cancellation.financial_resolution_required;
      // Archiving never reverses money or fabricates a refund. Only no-history
      // invoices can be voided, through their existing W06 authority.
      if (!financePending) {
        for (const invoice of invoices)
          await this.billing.voidInvoiceInTransaction(client, user, invoice.id,
            { property_id: propertyId, reason: `Pembatalan penyewaan keliru: ${reason}` }, {}, leaseId);
      }
      if (bindings.settlement && bindings.settlement.state !== 'cancelled') {
        this.one(await client.query(
          `UPDATE lease_contract_settlements SET state='cancelled',activated_at=NULL,original_due_at=NULL,
             extension_due_at=NULL,extension_reason=NULL,extension_granted_at=NULL,extension_granted_by_user_id=NULL,updated_at=now()
           WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND state=$4`,
          [bindings.settlement.id, propertyId, leaseId, bindings.settlement.state],
        ));
      }
      if (bindings.sponsored_term?.term_status === 'active')
        this.one(await client.query("UPDATE owner_sponsored_lease_terms SET term_status='cancelled',updated_at=now() WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND term_status='active'",
          [bindings.sponsored_term.id, propertyId, leaseId]));
      if (bindings.commitment_id)
        this.one(await client.query(`UPDATE onboarding_commitments SET status='cancelled',cancelled_at=now(),cancel_reason=$4,updated_at=now()
          WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND status=$5`,
        [bindings.commitment_id, propertyId, leaseId, reason, bindings.commitment_status]));
      if (bindings.hold_id && ['active', 'committed'].includes(bindings.hold_status!))
        this.one(await client.query(`UPDATE booking_lead_holds SET hold_status='released',released_at=now(),released_by_user_id=$4,
          release_reason=$5,updated_at=now() WHERE id=$1 AND property_id=$2 AND onboarding_commitment_id=$3 AND hold_status=$6`,
        [bindings.hold_id, propertyId, bindings.commitment_id, user.id, reason, bindings.hold_status]));
      if (bindings.booking_lead_id)
        this.one(await client.query("UPDATE booking_leads SET status='cancelled',updated_at=now() WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND status=$4",
          [bindings.booking_lead_id, propertyId, leaseId, bindings.booking_lead_status]));
      this.one(await client.query(`UPDATE leases SET lease_status='cancelled',closed_at=now(),closed_by_user_id=$3,close_reason=$4,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND lease_status=$5 AND occupancy_id IS NULL`,
      [leaseId, propertyId, user.id, reason, context.lease.lease_status]));
      this.one(await client.query(`UPDATE /* archive_release_room */ rooms room SET room_status='vacant',updated_at=now()
        WHERE room.id=$1 AND room.property_id=$2 AND room.room_status=$3
          AND NOT EXISTS (SELECT 1 FROM leases other WHERE other.room_id=room.id AND other.property_id=room.property_id AND other.lease_status IN ('draft','awaiting_activation','active'))
          AND NOT EXISTS (SELECT 1 FROM occupancies occupancy WHERE occupancy.room_id=room.id AND occupancy.property_id=room.property_id AND occupancy.occupancy_status='active')
          AND NOT EXISTS (SELECT 1 FROM onboarding_commitments commitment WHERE commitment.room_id=room.id AND commitment.property_id=room.property_id AND commitment.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
          AND NOT EXISTS (SELECT 1 FROM booking_lead_holds hold WHERE hold.room_id=room.id AND hold.property_id=room.property_id AND (hold.hold_status='committed' OR hold.hold_status='active' AND hold.expires_at>now()))
          AND NOT EXISTS (SELECT 1 FROM lease_transfer_commands transfer WHERE transfer.to_room_id=room.id AND transfer.property_id=room.property_id AND transfer.state='scheduled')`,
      [context.room.id, propertyId, bindings.room_status]));
      const archivedResident = await client.query(`UPDATE /* archive_resident */ residents resident SET resident_status='archived',
        archive_reason=$3,archive_source='mistaken_lease_cancellation',archived_at=now(),archived_by_user_id=$4,updated_at=now()
        WHERE resident.id=$1 AND resident.property_id=$2 AND resident.resident_status=$5
          AND NOT EXISTS (SELECT 1 FROM leases other WHERE other.resident_id=resident.id AND other.property_id=resident.property_id AND other.lease_status IN ('draft','awaiting_activation','active'))`,
      [context.lease.resident_id, propertyId, reason, user.id, bindings.resident_status]);
      const archiveId = randomUUID();
      const commandId = randomUUID();
      const result = {
        id: archiveId, property_id: propertyId, lease_id: leaseId,
        lease_code: context.lease.lease_code, resident_id: context.lease.resident_id,
        room_id: context.room.id, room_number: context.room.number, room_status: 'vacant',
        archive_status: 'archived', financial_resolution_state: financePending ? 'pending_review' : 'not_required',
        resident_profile_archived: archivedResident.rowCount === 1,
        reason, voided_invoice_ids: financePending ? [] : invoices.map((invoice) => invoice.id),
      };
      await client.query(`INSERT INTO lease_archive_commands /* archive_record */
        (id,property_id,lease_id,command_fingerprint,request_fingerprint,created_by_user_id,reason,previous_snapshot,result_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [commandId, propertyId, leaseId, commandFingerprint, requestFingerprint, user.id, reason,
        JSON.stringify({ context, bindings, invoices }), JSON.stringify(result)]);
      await client.query(`INSERT INTO lease_archives(id,property_id,lease_id,cancellation_command_id,financial_resolution_state)
        VALUES($1,$2,$3,$4,$5)`, [archiveId, propertyId, leaseId, commandId, result.financial_resolution_state]);
      const metadata = JSON.stringify({ action: 'lease_cancelled_and_archived', archive_id: archiveId,
        reason, financial_resolution_state: result.financial_resolution_state, room_number: context.room.number });
      await client.query(`INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
        VALUES($1,$2,'closed',$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`, [propertyId, leaseId, user.id, metadata]);
      return { data: { archive: result }, idempotent: false };
    });
  }

  async list(user: UserAccessContext, query: LeaseArchiveQueryDto) {
    this.assertAdmin(user, query.property_id, 'lease.read');
    const result = await this.leases.query<{ items: Record<string, unknown>[]; total: number }>(`WITH filtered AS (SELECT archive.id,archive.property_id,archive.lease_id,archive.archive_status,
      archive.financial_resolution_state,command.reason,command.created_at AS archived_at,actor.display_name AS archived_by,
      command.result_snapshot->>'lease_code' AS lease_code,command.previous_snapshot#>>'{context,lease,commercial_mode}' AS commercial_mode,
      command.previous_snapshot#>>'{context,lease,resident_name}' AS resident_name,command.result_snapshot->>'room_number' AS room_number,room.plot_number
      FROM lease_archives archive JOIN lease_archive_commands command ON command.id=archive.cancellation_command_id
      JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
      JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
      JOIN rooms room ON room.id=(command.result_snapshot->>'room_id')::uuid AND room.property_id=archive.property_id
      JOIN users actor ON actor.id=command.created_by_user_id
      WHERE archive.property_id=$1
        AND ($2::text IS NULL OR resident.full_name ILIKE '%'||$2||'%' OR lease.lease_code ILIKE '%'||$2||'%' OR room.number ILIKE '%'||$2||'%')
        AND ($3::text IS NULL OR command.previous_snapshot#>>'{context,lease,commercial_mode}'=$3) AND ($4::text IS NULL OR archive.financial_resolution_state=$4)
      ), page AS (SELECT * FROM filtered ORDER BY archived_at DESC,id DESC LIMIT $5 OFFSET $6)
      SELECT (SELECT count(*)::int FROM filtered) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY archived_at DESC,id DESC) FROM page),'[]'::jsonb) AS items`,
    [query.property_id, query.q?.trim() || null, query.commercial_mode ?? null,
      query.financial_resolution_state ?? null, query.limit ?? 20, query.offset ?? 0]);
    return { data: { items: result.rows[0]?.items ?? [],
      total: Number(result.rows[0]?.total ?? 0), limit: query.limit ?? 20, offset: query.offset ?? 0 } };
  }

  async detail(user: UserAccessContext, archiveId: string, propertyId: string) {
    this.assertAdmin(user, propertyId, 'lease.read');
    const result = await this.leases.query(`SELECT archive.id,archive.property_id,archive.lease_id,archive.archive_status,
      archive.financial_resolution_state,command.reason,command.created_at AS archived_at,actor.display_name AS archived_by,
      command.previous_snapshot->'context' AS original_context,command.result_snapshot AS cancellation_result,
      room.room_status AS current_room_status,archive.restored_at,restore.reason AS restoration_reason,
      restoration_actor.display_name AS restored_by,successor.successor_lease_id,
      successor.created_at AS replaced_at,successor.reason AS replacement_reason,
      successor_actor.display_name AS replaced_by
      FROM lease_archives archive JOIN lease_archive_commands command ON command.id=archive.cancellation_command_id
      JOIN users actor ON actor.id=command.created_by_user_id
      JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
      JOIN rooms room ON room.id=(command.result_snapshot->>'room_id')::uuid AND room.property_id=archive.property_id
      LEFT JOIN lease_archive_restore_commands restore ON restore.id=archive.restoration_command_id
      LEFT JOIN users restoration_actor ON restoration_actor.id=restore.created_by_user_id
      LEFT JOIN lease_archive_successor_commands successor ON successor.id=archive.successor_command_id
      LEFT JOIN users successor_actor ON successor_actor.id=successor.created_by_user_id
      WHERE archive.id=$1 AND archive.property_id=$2`, [archiveId, propertyId]);
    if (!result.rows[0]) this.missing();
    return { data: result.rows[0] };
  }

  private async review(client: PoolClient, user: UserAccessContext, leaseId: string, lock: boolean) {
    const { data: context } = await this.revisions.readInTransaction(client, user, leaseId);
    this.assertAdmin(user, context.lease.property_id);
    const policy = context.policies.cancellation;
    if (policy.allowed !== true) this.conflict(policy.code ?? 'LEASE_CANCELLATION_FACTS_INVALID', policy.message ?? 'Data belum dapat dipastikan. Tinjau riwayat penyewaan sebelum membatalkan.');
    if (lock) {
      await client.query('SELECT id FROM rooms WHERE id=$1 AND property_id=$2 FOR UPDATE', [context.room.id, context.lease.property_id]);
      await client.query('SELECT id FROM residents WHERE id=$1 AND property_id=$2 FOR UPDATE', [context.lease.resident_id, context.lease.property_id]);
    }
    const result = await client.query<Bindings>(`SELECT /* archive_bindings */ room.room_status,resident.resident_status,
      commitment.id AS commitment_id,commitment.status AS commitment_status,hold.id AS hold_id,hold.hold_status,
      lead.id AS booking_lead_id,lead.status AS booking_lead_status,to_jsonb(lease) AS lease_state,
      to_jsonb(settlement) AS settlement,to_jsonb(term) AS sponsored_term,
      (lease.occupancy_id IS NULL AND (lease.onboarding_commitment_id IS NULL OR
        commitment.id IS NOT NULL AND commitment.lease_id=lease.id AND commitment.resident_id=lease.resident_id
        AND commitment.room_id=lease.room_id AND commitment.status IN ('committed','completed'))
        AND (commitment.hold_id IS NULL OR hold.id IS NOT NULL AND hold.onboarding_commitment_id=commitment.id AND hold.room_id=lease.room_id)
        AND (lease.booking_lead_id IS NULL OR lead.id IS NOT NULL AND lead.lease_id=lease.id)
        AND NOT EXISTS (SELECT 1 FROM onboarding_commitments other WHERE other.lease_id=lease.id
          AND other.id IS DISTINCT FROM lease.onboarding_commitment_id AND other.status<>'cancelled')) AS binding_valid,
      EXISTS (SELECT 1 FROM leases other WHERE other.property_id=lease.property_id AND other.room_id=lease.room_id
        AND other.id<>lease.id AND other.lease_status IN ('draft','awaiting_activation','active'))
      OR EXISTS (SELECT 1 FROM occupancies occupancy WHERE occupancy.property_id=lease.property_id AND occupancy.room_id=lease.room_id AND occupancy.occupancy_status='active')
      OR EXISTS (SELECT 1 FROM onboarding_commitments other WHERE other.property_id=lease.property_id AND other.room_id=lease.room_id
        AND other.lease_id IS DISTINCT FROM lease.id AND other.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
      OR EXISTS (SELECT 1 FROM booking_lead_holds other WHERE other.property_id=lease.property_id AND other.room_id=lease.room_id
        AND other.id IS DISTINCT FROM hold.id AND (other.hold_status='committed' OR other.hold_status='active' AND other.expires_at>now()))
      OR EXISTS (SELECT 1 FROM lease_transfer_commands transfer WHERE transfer.property_id=lease.property_id AND transfer.to_room_id=lease.room_id AND transfer.state='scheduled') AS room_conflict,
      EXISTS (SELECT 1 FROM smart_lock_access_grants grant_record JOIN smart_lock_devices device ON device.id=grant_record.smart_lock_device_id
        WHERE grant_record.property_id=lease.property_id AND device.property_id=lease.property_id AND device.room_id=lease.room_id
          AND grant_record.grant_status='active' AND grant_record.resident_id=lease.resident_id AND grant_record.grant_type='resident') AS active_access
      FROM leases lease JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
      JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
      LEFT JOIN onboarding_commitments commitment ON commitment.id=lease.onboarding_commitment_id AND commitment.property_id=lease.property_id
      LEFT JOIN booking_lead_holds hold ON hold.id=commitment.hold_id AND hold.property_id=lease.property_id
      LEFT JOIN booking_leads lead ON lead.id=lease.booking_lead_id AND lead.property_id=lease.property_id
      LEFT JOIN lease_contract_settlements settlement ON settlement.lease_id=lease.id AND settlement.property_id=lease.property_id AND settlement.state<>'cancelled'
      LEFT JOIN owner_sponsored_lease_terms term ON term.lease_id=lease.id AND term.property_id=lease.property_id AND term.term_status='active'
      WHERE lease.id=$1 AND lease.property_id=$2`, [leaseId, context.lease.property_id]);
    const bindings = result.rows[0];
    if (result.rows.length !== 1 || !bindings || bindings.binding_valid !== true ||
      bindings.room_status !== (context.lease.lease_status === 'active' ? 'awaiting_check_in' : 'reserved'))
      this.conflict('LEASE_CANCELLATION_BINDINGS_INVALID', 'Catatan kamar, aktivasi atau pemesanan tidak sesuai. Kamar tidak dilepas; periksa riwayat kamar dan penyewaan dahulu.');
    if (bindings.room_conflict !== false)
      this.conflict('LEASE_CANCELLATION_ROOM_CONFLICT', 'Kamar juga terkait hunian atau pemesanan lain. Kamar tidak dilepas; selesaikan hubungan yang bertentangan sebelum membatalkan.');
    if (bindings.active_access !== false)
      this.conflict('LEASE_CANCELLATION_ACCESS_REVIEW_REQUIRED', 'Akses kunci penghuni masih aktif. Cabut akses yang keliru melalui pengelolaan kunci sebelum membatalkan; gunakan check-out bila kamar benar-benar dihuni.');
    const invoices = await client.query<{ id: string; invoice_status: string }>(
      `SELECT /* archive_invoices */ id,invoice_status FROM invoices WHERE lease_id=$1 AND property_id=$2 AND invoice_status<>'void' ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
      [leaseId, context.lease.property_id]);
    return { context, bindings, invoices: invoices.rows, fingerprint: this.hash(JSON.stringify({ context, bindings, invoices: invoices.rows })) };
  }

  private assertAdmin(user: UserAccessContext, propertyId?: string, permission = 'lease.manage') {
    if (!user.roles.includes('admin') || !user.permissions.includes(permission) ||
      propertyId && !user.roles.includes('owner') && !user.propertyIds.includes(propertyId))
      throw new ForbiddenException({ code: 'LEASE_ARCHIVE_FORBIDDEN', message: 'Arsip dan pembatalan hanya tersedia bagi Admin properti dengan izin pengelolaan yang sesuai.' });
  }
  private one(result: { rowCount: number | null }) {
    if (result.rowCount !== 1) this.conflict('LEASE_CANCELLATION_REVIEW_STALE', 'Hubungan kamar atau penyewaan berubah saat pembatalan. Seluruh perubahan dibatalkan; muat data terbaru lalu tinjau kembali.');
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private missing(): never { throw new NotFoundException({ code: 'LEASE_ARCHIVE_NOT_FOUND', message: 'Penyewaan atau arsip tidak ditemukan pada properti ini. Kembali ke daftar dan pilih data yang masih tersedia.' }); }
  private conflict(code: string, message: string): never { throw new ConflictException({ code, message }); }
  private invalid(code: string, message: string): never { throw new UnprocessableEntityException({ code, message }); }
}
