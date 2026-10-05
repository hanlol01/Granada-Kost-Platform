import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { FILE_STORAGE_PROVIDER } from '../file/constants/file.constants';
import type { FileStorageProvider, StoredFilePurgeTarget, VerifiedFilePurgeResult } from '../file/storage/file-storage.provider';
import type { FilePurpose } from '../file/types/file.types';
import type { UserAccessContext } from '../iam/types/iam.types';
import { LeaseRepository } from './lease.repository';
import { LeaseArchiveFileInventoryService } from './lease-archive-file-inventory.service';
import type { PurgeArchivedLeaseFilesDto, RetryArchivedLeaseFilePurgeDto } from './lease-archive-file-purge.dto';

type FileSnapshot = StoredFilePurgeTarget & { filename: string; storageDriver: string; relationships: unknown[];
  metadataRemoved: boolean; previousMetadataDeletedAt: Date | null; previousMetadataDeletedByUserId: string | null };
type ItemRow = { id: string; command_id: string; property_id: string; lease_id: string; file_id: string;
  file_snapshot: FileSnapshot; status: 'deleted' | 'failed' | 'retry_pending'; attempt_count: number;
  freed_bytes: string; verified_deleted_at: Date | null };
type CommandRow = { id: string; property_id: string; archive_id: string; lease_id: string;
  request_fingerprint: string; created_by_user_id: string; reason: string; created_at: Date; created_by: string };

/** Reserve claims before filesystem work; each verified outcome is an independent durable transaction. */
@Injectable()
export class LeaseArchiveFilePurgeService {
  constructor(private readonly leases: LeaseRepository, private readonly inventory: LeaseArchiveFileInventoryService,
    @Inject(FILE_STORAGE_PROVIDER) private readonly storage: FileStorageProvider, private readonly audit: AuditRepository) {}

  async purge(user: UserAccessContext, archiveId: string, dto: PurgeArchivedLeaseFilesDto, idempotencyKey?: string) {
    this.assertAdmin(user, dto.property_id);
    const key = idempotencyKey?.trim();
    if (!key || key.length>200) this.invalid('IDEMPOTENCY_KEY_REQUIRED',
      'Pengajuan belum memiliki kunci pengiriman yang valid. Tidak ada berkas dihapus; muat ulang tinjauan sebelum melanjutkan.');
    if (dto.permanent_deletion_confirmed !== true) this.invalid('LEASE_FILE_PURGE_CONFIRMATION_REQUIRED',
      'Baca akibat penghapusan dan konfirmasikan bahwa berkas terpilih tidak dapat dipulihkan. Tidak ada berkas dihapus.');
    const reason = typeof dto.reason==='string' ? dto.reason.trim() : '';
    if (reason.length<3 || reason.length>1000) this.invalid('LEASE_FILE_PURGE_REASON_REQUIRED',
      'Isi alasan penghapusan 3–1.000 karakter sebelum melanjutkan. Tidak ada berkas dihapus.');
    const selected = this.selection(dto.selected_file_ids);
    if (!/^[a-f0-9]{64}$/.test(dto.review_fingerprint ?? '')) this.invalid('LEASE_FILE_PURGE_REVIEW_REQUIRED',
      'Tinjauan berkas belum tersedia. Perbarui inventaris dan pilih berkas sebelum mengonfirmasi penghapusan.');
    const fingerprint = this.hash(JSON.stringify({ selected, reason, review: dto.review_fingerprint,
      permanent_deletion_confirmed: true }));
    const reservation = await this.leases.transaction(async (client) => {
      await this.lockAggregate(client, archiveId, dto.property_id);
      const commandFingerprint = this.hash(`${dto.property_id}:${archiveId}:${user.id}:${key}`);
      const replay = await client.query<CommandRow>('SELECT * FROM lease_file_purge_commands WHERE property_id=$1 AND command_fingerprint=$2',
        [dto.property_id, commandFingerprint]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint!==fingerprint || replay.rows[0].created_by_user_id!==user.id)
          this.conflict('IDEMPOTENCY_KEY_REUSED', 'Pengajuan yang sama digunakan untuk pilihan atau alasan berbeda. Pertahankan isian awal untuk memeriksa hasil pengajuan; jangan membuat pengajuan baru sebelum hasilnya diketahui.');
        return { id: replay.rows[0].id, idempotent: true };
      }
      // New attachments also lock the file row. Read relationships only after this lock.
      const locked = await client.query(`SELECT id FROM files WHERE property_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [dto.property_id, selected]);
      if (locked.rowCount!==selected.length) this.conflict('LEASE_FILE_PURGE_SELECTION_INVALID',
        'Ada berkas yang tidak tersedia pada properti ini. Tidak ada berkas dihapus; perbarui inventaris dan pilih ulang.');
      const review = await this.inventory.readInTransaction(client, archiveId, dto.property_id);
      if (review.review_fingerprint!==dto.review_fingerprint) this.conflict('LEASE_FILE_PURGE_REVIEW_STALE',
        'Hubungan atau keadaan berkas berubah setelah tinjauan. Tidak ada berkas dihapus; perbarui inventaris dan tinjau pilihan kembali.');
      const chosen = selected.map((id) => review.items.find((item) => item.file_id===id));
      if (chosen.some((item) => !item || !item.selectable)) {
        const rejected = chosen.find((item) => !item?.selectable);
        this.conflict(rejected?.code ?? 'LEASE_FILE_PURGE_SELECTION_INVALID', rejected?.message ??
          'Berkas terpilih tidak termasuk bukti penyewaan ini. Tidak ada berkas dihapus; periksa hubungan yang ditampilkan.');
      }
      const metadata = await client.query<{ id: string; property_id: string; file_purpose: FilePurpose; file_extension: string;
        file_size_bytes: string; storage_driver: string; storage_path: string; checksum_sha256: string;
        is_deleted: boolean; deleted_at: Date | null; deleted_by_user_id: string | null }>(
        'SELECT * FROM files WHERE property_id=$1 AND id=ANY($2::uuid[]) ORDER BY id', [dto.property_id, selected]);
      const id = randomUUID();
      await client.query(`INSERT INTO lease_file_purge_commands(id,archive_id,property_id,lease_id,command_fingerprint,
        request_fingerprint,review_fingerprint,created_by_user_id,reason,selected_file_ids,previous_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11::jsonb)`,
        [id,archiveId,dto.property_id,review.lease_id,commandFingerprint,fingerprint,dto.review_fingerprint,user.id,reason,selected,JSON.stringify(review)]);
      for (const file of metadata.rows) {
        const reviewed = review.items.find((item) => item.file_id===file.id)!;
        const snapshot: FileSnapshot = { id: file.id, propertyId: file.property_id, purpose: file.file_purpose,
          extension: file.file_extension, storagePath: file.storage_path, sizeBytes: Number(file.file_size_bytes),
          checksumSha256: file.checksum_sha256, storageDriver: file.storage_driver,
          filename: reviewed.filename, relationships: reviewed.relationships, metadataRemoved: file.is_deleted,
          previousMetadataDeletedAt: file.deleted_at, previousMetadataDeletedByUserId: file.deleted_by_user_id };
        await client.query(`INSERT INTO lease_file_purge_items(command_id,property_id,lease_id,file_id,file_snapshot)
          VALUES($1,$2,$3,$4,$5::jsonb)`, [id,dto.property_id,review.lease_id,file.id,JSON.stringify(snapshot)]);
        const claimed = await client.query(`UPDATE files SET archive_purge_command_id=$3,updated_at=now()
          WHERE id=$1 AND property_id=$2 AND archive_purge_command_id IS NULL`, [file.id,dto.property_id,id]);
        if (claimed.rowCount!==1) this.conflict('LEASE_FILE_PURGE_ALREADY_CLAIMED',
          'Berkas sudah masuk pengajuan lain. Tidak ada berkas dihapus dari pengajuan ini; periksa hasil pengajuan sebelumnya.');
      }
      await this.audit.write({ actorUserId: user.id, propertyId: dto.property_id,
        action: 'lease.archive.file_purge_requested', resourceType: 'lease_file_purge_command', resourceId: id,
        resultStatus: 'success', afterData: { archive_id: archiveId, lease_id: review.lease_id, reason,
          selected_file_ids: selected, selected_count: selected.length } }, client);
      return { id, idempotent: false };
    });
    // A rollback here cannot erase the durable reservation. Never unlink before it commits.
    await this.processSelection(user, archiveId, reservation.id, dto.property_id, selected);
    return { data: await this.read(user, archiveId, reservation.id, dto.property_id), idempotent: reservation.idempotent };
  }

  async retry(user: UserAccessContext, archiveId: string, commandId: string, dto: RetryArchivedLeaseFilePurgeDto) {
    this.assertAdmin(user, dto.property_id);
    const selected = this.selection(dto.selected_file_ids);
    const current = await this.read(user, archiveId, commandId, dto.property_id);
    if (selected.some((id) => !current.items.some((item) => item.file_id===id && item.status!=='deleted')))
      this.conflict('LEASE_FILE_PURGE_RETRY_SELECTION_INVALID',
        'Coba ulang hanya berkas yang gagal atau belum dapat dipastikan pada pengajuan ini. Berkas yang telah dihapus tidak diproses kembali.');
    await this.processSelection(user, archiveId, commandId, dto.property_id, selected);
    return { data: await this.read(user, archiveId, commandId, dto.property_id) };
  }

  async read(user: UserAccessContext, archiveId: string, commandId: string, propertyId: string) {
    this.assertAdmin(user, propertyId, 'lease.read');
    const command = (await this.leases.query<CommandRow>(`SELECT command.*,actor.display_name AS created_by FROM lease_file_purge_commands command
      JOIN users actor ON actor.id=command.created_by_user_id WHERE command.id=$1 AND command.archive_id=$2 AND command.property_id=$3`,
      [commandId,archiveId,propertyId])).rows[0];
    if (!command) this.missing();
    const rows = (await this.leases.query<ItemRow & { result: VerifiedFilePurgeResult | null }>(`SELECT item.*,attempt.result
      FROM lease_file_purge_items item LEFT JOIN lease_file_purge_attempts attempt ON attempt.id=item.last_attempt_id
      WHERE item.command_id=$1 AND item.property_id=$2 ORDER BY item.file_id`, [commandId,propertyId])).rows;
    const items = rows.map((item) => ({ file_id: item.file_id, filename: item.file_snapshot.filename,
      size_bytes: item.file_snapshot.sizeBytes, relationships: item.file_snapshot.relationships,
      status: item.status, attempt_count: item.attempt_count, freed_bytes: Number(item.freed_bytes),
      verified_deleted_at: item.verified_deleted_at, result_code: item.result?.state==='deleted' ? null : item.result?.code ?? 'FILE_PURGE_STORAGE_UNVERIFIED',
      message: this.resultMessage(item.result), availability: item.result?.state==='deleted' ? 'absent' : item.result?.availability ?? 'unknown' }));
    return { command_id: commandId, archive_id: archiveId, property_id: propertyId, lease_id: command.lease_id,
      reason: command.reason, created_at: command.created_at, created_by: command.created_by, items, selected_count: items.length,
      deleted_count: items.filter((item) => item.status==='deleted').length,
      failed_count: items.filter((item) => item.status==='failed').length,
      retry_pending_count: items.filter((item) => item.status==='retry_pending').length,
      freed_bytes: items.reduce((total,item) => total+item.freed_bytes,0) };
  }

  async list(user: UserAccessContext, archiveId: string, propertyId: string, limit=20, offset=0) {
    this.assertAdmin(user, propertyId, 'lease.read');
    if (!Number.isInteger(limit) || limit<1 || limit>50 || !Number.isInteger(offset) || offset<0)
      this.invalid('LEASE_FILE_PURGE_PAGE_INVALID', 'Halaman pengajuan tidak sesuai. Buka kembali daftar pengajuan dari arsip.');
    const archive = await this.leases.query('SELECT id FROM lease_archives WHERE id=$1 AND property_id=$2', [archiveId,propertyId]);
    if (!archive.rows[0]) this.missing();
    const page = await this.leases.query<{ items: Record<string, unknown>[]; total: number }>(`WITH commands AS (
      SELECT command.id AS command_id,command.archive_id,command.property_id,command.lease_id,command.reason,
        command.created_at,actor.display_name AS created_by,count(item.id)::int AS selected_count,
        count(item.id) FILTER(WHERE item.status='deleted')::int AS deleted_count,
        count(item.id) FILTER(WHERE item.status='failed')::int AS failed_count,
        count(item.id) FILTER(WHERE item.status='retry_pending')::int AS retry_pending_count,
        COALESCE(sum(item.freed_bytes),0)::bigint AS freed_bytes
      FROM lease_file_purge_commands command JOIN users actor ON actor.id=command.created_by_user_id
      LEFT JOIN lease_file_purge_items item ON item.command_id=command.id AND item.property_id=command.property_id
      WHERE command.archive_id=$1 AND command.property_id=$2 GROUP BY command.id,actor.display_name
    ), page AS (SELECT * FROM commands ORDER BY created_at DESC,command_id DESC LIMIT $3 OFFSET $4)
    SELECT (SELECT count(*)::int FROM commands) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,command_id DESC) FROM page),'[]'::jsonb) AS items`,
    [archiveId,propertyId,limit,offset]);
    return { data: { items: page.rows[0]?.items ?? [], total: page.rows[0]?.total ?? 0, limit, offset } };
  }

  private async processSelection(user: UserAccessContext, archiveId: string, commandId: string, propertyId: string, selected: string[]) {
    for (const fileId of selected) {
      try {
        // Persist uncertainty before touching storage, including on a retry of a
        // previously definitive failure. A later DB rollback must not expose the
        // old "present" result after bytes may have been removed.
        await this.leases.transaction(async (client) => {
          await this.lockAggregate(client, archiveId, propertyId);
          const row = (await client.query<ItemRow>(`SELECT item.* FROM lease_file_purge_items item
            JOIN lease_file_purge_commands command ON command.id=item.command_id AND command.archive_id=$4
            WHERE item.command_id=$1 AND item.property_id=$2 AND item.file_id=$3 FOR UPDATE OF item`,
            [commandId,propertyId,fileId,archiveId])).rows[0];
          if (!row) this.missing();
          if (row.status==='deleted') return;
          await this.recordOutcome(client, user, row,
            { state: 'retry_pending', code: 'FILE_PURGE_STORAGE_UNVERIFIED', availability: 'unknown' });
        });
        await this.leases.transaction(async (client) => {
          await this.lockAggregate(client, archiveId, propertyId);
          const row = (await client.query<ItemRow>(`SELECT item.* FROM lease_file_purge_items item
            JOIN lease_file_purge_commands command ON command.id=item.command_id AND command.archive_id=$4
            WHERE item.command_id=$1 AND item.property_id=$2 AND item.file_id=$3 FOR UPDATE OF item`,
            [commandId,propertyId,fileId,archiveId])).rows[0];
          if (!row) this.missing();
          if (row.status==='deleted') return;
          const file = await client.query(`SELECT id FROM files WHERE id=$1 AND property_id=$2 AND archive_purge_command_id=$3 FOR UPDATE`,
            [fileId,propertyId,commandId]);
          if (file.rowCount!==1) this.conflict('LEASE_FILE_PURGE_FACTS_INVALID',
            'Hubungan pengajuan berkas belum dapat dipastikan. Penghapusan tidak dilanjutkan; periksa kembali pengajuan sebelum mencoba ulang.');
          const snapshot = row.file_snapshot;
          const result: VerifiedFilePurgeResult = this.storage.purgeVerified && snapshot.storageDriver==='local'
            ? await this.storage.purgeVerified(snapshot)
            : { state: 'retry_pending', code: 'FILE_PURGE_STORAGE_UNVERIFIED', availability: 'unknown' };
          await this.recordOutcome(client, user, row, result);
        });
      } catch {
        // No fabricated failed/deleted projection after an interrupted transaction.
        // Its durable claim/current status remains visible; retry verifies the same target again.
      }
    }
  }

  private async recordOutcome(client: PoolClient, user: UserAccessContext, row: ItemRow, result: VerifiedFilePurgeResult) {
    const attemptId = randomUUID();
    const freed = result.state==='deleted' ? result.freedBytes : 0;
    await client.query(`INSERT INTO lease_file_purge_attempts(id,item_id,command_id,property_id,file_id,
      sequence_number,actor_user_id,status,result,freed_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [attemptId,row.id,row.command_id,row.property_id,row.file_id,row.attempt_count+1,user.id,result.state,JSON.stringify(result),freed]);
    if (result.state==='deleted') {
      const tombstone = await client.query(`UPDATE files SET is_deleted=true,deleted_at=now(),deleted_by_user_id=$4,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND archive_purge_command_id=$3`, [row.file_id,row.property_id,row.command_id,user.id]);
      if (tombstone.rowCount!==1) this.conflict('LEASE_FILE_PURGE_FACTS_INVALID',
        'Hasil penyimpanan sudah diperiksa tetapi pencatatannya belum dapat dipastikan. Periksa ulang pengajuan yang sama; jangan membuat pengajuan baru.');
    }
    await client.query(`UPDATE lease_file_purge_items SET status=$2,last_attempt_id=$3,attempt_count=attempt_count+1,freed_bytes=$4,
      verified_deleted_at=CASE WHEN $2='deleted' THEN (SELECT created_at FROM lease_file_purge_attempts WHERE id=$3) ELSE NULL END,updated_at=now()
      WHERE id=$1`, [row.id,result.state,attemptId,freed]);
    await this.audit.write({ actorUserId: user.id, propertyId: row.property_id,
      action: 'lease.archive.file_purge_outcome', resourceType: 'lease_file_purge_attempt', resourceId: attemptId,
      resultStatus: result.state==='deleted' ? 'success' : 'failed',
      afterData: { command_id: row.command_id, lease_id: row.lease_id, file_id: row.file_id,
        filename: row.file_snapshot.filename, result, freed_bytes: freed } }, client);
  }

  private async lockAggregate(client: PoolClient, archiveId: string, propertyId: string) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:'||$1::text,0))", [propertyId]);
    await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [propertyId]);
    const archive = (await client.query<{ lease_id: string; archive_status: string; lease_status: string }>(
      `SELECT archive.lease_id,archive.archive_status,lease.lease_status FROM lease_archives archive
        JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
        WHERE archive.id=$1 AND archive.property_id=$2 FOR UPDATE OF lease,archive`, [archiveId,propertyId])).rows[0];
    if (!archive) this.missing();
    if (!['archived','superseded'].includes(archive.archive_status) || archive.lease_status!=='cancelled')
      this.conflict('LEASE_FILE_PURGE_ARCHIVE_ACTIVE', 'Penyewaan sudah dipulihkan atau tidak lagi dibatalkan. Berkas tidak dihapus; tinjau keadaan arsip sebelum melanjutkan.');
    return archive;
  }

  private selection(value: unknown): string[] {
    if (!Array.isArray(value) || !value.length || value.length>100
      || value.some((id) => typeof id!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))
      || new Set(value).size!==value.length)
      this.invalid('LEASE_FILE_PURGE_SELECTION_INVALID', 'Pilih 1–100 berkas yang dapat dihapus dari arsip ini tanpa pilihan ganda. Tidak ada berkas dihapus.');
    return [...value].sort();
  }
  private assertAdmin(user: UserAccessContext, propertyId: string, permission='lease.manage') {
    if (!user.roles.includes('admin') || !user.permissions.includes(permission) || !user.propertyIds.includes(propertyId))
      throw new ForbiddenException({ code: 'LEASE_FILE_PURGE_FORBIDDEN', message: 'Penghapusan berkas hanya tersedia untuk Admin pada properti terkait. Gunakan akun dengan izin pengelolaan penyewaan.' });
  }
  private resultMessage(result: VerifiedFilePurgeResult | null) {
    if (result?.state==='deleted') return 'Berkas terverifikasi telah dihapus permanen. Memulihkan penyewaan tidak akan mengembalikan berkas ini.';
    if (result?.state==='failed') return result.code==='FILE_PURGE_CONTENT_CHANGED'
      ? 'Isi berkas berbeda dari catatan pengajuan. Berkas tidak dihapus; minta pemeriksaan penyimpanan sebelum mencoba ulang.'
      : 'Lokasi berkas tidak cocok dengan catatan penyimpanan. Berkas tidak dihapus; minta pemeriksaan penyimpanan sebelum mencoba ulang.';
    return 'Keadaan berkas di penyimpanan belum dapat dipastikan. Coba ulang pengajuan ini untuk memeriksa dan menyelesaikan berkas; belum ada ruang yang dinyatakan dibebaskan.';
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private invalid(code: string, message: string): never { throw new UnprocessableEntityException({ code, message }); }
  private conflict(code: string, message: string): never { throw new ConflictException({ code, message }); }
  private missing(): never { throw new NotFoundException({ code: 'LEASE_FILE_PURGE_NOT_FOUND', message: 'Pengajuan atau arsip berkas tidak ditemukan pada properti ini. Kembali ke daftar arsip dan periksa pengajuan yang tersedia.' }); }
}
