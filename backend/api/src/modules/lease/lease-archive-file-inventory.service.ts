import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { downloadFilename } from '../../shared/utils/download-filename';
import type { UserAccessContext } from '../iam/types/iam.types';
import { LeaseRepository } from './lease.repository';
import { evaluateArchiveFile, type ArchiveFileReference } from './lease-archive-file-policy';
import { ARCHIVE_FILE_OWNERSHIP_SQL, DESCRIPTIVE_FILE_JSON_TABLES, LEASE_FILE_OWNING_COLUMNS } from './lease-archive-file-references.sql';

type ReferenceRow = {
  file_id: string; property_id: string; lease_ids: (string | null)[];
  relationship: string; record_code: string | null; source: string;
  group_id: string; available_evidence_count: number;
};
type FileRow = {
  id: string; property_id: string; file_purpose: string; file_extension: string;
  file_size_bytes: string; is_deleted: boolean; storage_driver: string;
  storage_path: string; checksum_sha256: string; duplicate_path: boolean;
};
type Column = { table_name: string; column_name: string; kind: string };
const nonOwningPurgeTables = new Set(['lease_file_purge_commands', 'lease_file_purge_items', 'lease_file_purge_attempts']);
const protectedLabels: Record<string, string> = {
  residents: 'Identitas atau profil penghuni', rooms: 'Foto inventori kamar',
  hunian_gallery_images: 'Galeri hunian', property_document_signatories: 'Tanda tangan dokumen',
  property_owner_realization_evidence_files: 'Bukti Realisasi Owner',
  property_owner_earning_adjustments: 'Penyesuaian pendapatan Owner', property_owner_payouts: 'Pencairan dana Owner',
  complaints: 'Komplain', complaint_files: 'Lampiran komplain',
  expenses: 'Bukti pengeluaran', maintenance_work_order_files: 'Lampiran perawatan',
  vehicle_files: 'Berkas kendaraan', files: 'Hubungan penyimpanan berkas lain',
};

/** Read-only inventory. A reviewed ownership decision is not an authority to unlink bytes. */
@Injectable()
export class LeaseArchiveFileInventoryService {
  constructor(private readonly leases: LeaseRepository) {}

  async inventory(user: UserAccessContext, archiveId: string, propertyId: string) {
    this.assertAdmin(user, propertyId);
    return this.leases.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return { data: await this.readInTransaction(client, archiveId, propertyId) };
    });
  }

  async readInTransaction(client: PoolClient, archiveId: string, propertyId: string) {
    const archiveResult = await client.query<{
      id: string; property_id: string; lease_id: string; archive_status: string;
      resident_id: string; lease_code: string; lease_status: string;
    }>(`SELECT archive.id,archive.property_id,archive.lease_id,archive.archive_status,lease.resident_id,
      command.result_snapshot->>'lease_code' AS lease_code,lease.lease_status
      FROM lease_archives archive JOIN lease_archive_commands command ON command.id=archive.cancellation_command_id
      JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
      WHERE archive.id=$1 AND archive.property_id=$2`, [archiveId, propertyId]);
    const archive = archiveResult.rows[0];
    if (!archive) throw new NotFoundException({ code: 'LEASE_ARCHIVE_NOT_FOUND',
      message: 'Arsip penyewaan tidak ditemukan pada properti ini. Kembali ke daftar arsip dan pilih data yang tersedia.' });
    const ownership = (await client.query<ReferenceRow>(ARCHIVE_FILE_OWNERSHIP_SQL, [propertyId])).rows;
    const candidateIds = new Set(ownership.filter((reference) => reference.lease_ids.includes(archive.lease_id))
      .map((reference) => reference.file_id));
    // Identity appears in the inventory to explain protection, never as a selectable upload.
    const identity = await client.query<{ file_id: string }>(`SELECT file_id FROM residents resident
      CROSS JOIN LATERAL unnest(ARRAY[resident.ktp_file_id,resident.profile_photo_file_id]) reference(file_id)
      WHERE resident.id=$1 AND resident.property_id=$2 AND file_id IS NOT NULL`, [archive.resident_id, propertyId]);
    identity.rows.forEach((row) => candidateIds.add(row.file_id));
    const ids = [...candidateIds].sort();
    const references = new Map<string, ArchiveFileReference[]>();
    const add = (id: string, reference: ArchiveFileReference) => {
      if (!candidateIds.has(id)) return;
      const current = references.get(id) ?? [];
      current.push(reference); references.set(id, current);
    };
    for (const reference of ownership) add(reference.file_id, {
      relationship: reference.relationship,
      recordCode: reference.property_id === propertyId ? reference.record_code : null,
      propertyId: reference.property_id,
      leaseIds: reference.lease_ids.filter((id): id is string => typeof id === 'string'),
      protected: reference.lease_ids.some((id) => id === null),
      availableEvidenceCount: reference.available_evidence_count,
    });

    const columns = await this.referenceColumns(client);
    const coverageVerified = await this.coverageVerified(client, columns);
    if (ids.length) for (const column of columns) {
      const source = `${column.table_name}.${column.column_name}`;
      if (LEASE_FILE_OWNING_COLUMNS.has(source) || nonOwningPurgeTables.has(column.table_name)
        || column.kind === 'json' && DESCRIPTIVE_FILE_JSON_TABLES.has(column.table_name)) continue;
      const table = this.identifier(column.table_name);
      const field = this.identifier(column.column_name);
      const query = column.kind === 'json'
        ? `SELECT DISTINCT candidate.file_id FROM public.${table} record
            CROSS JOIN unnest($1::uuid[]) candidate(file_id)
            WHERE record.${field}::text ILIKE '%'||candidate.file_id::text||'%'`
        : column.kind === 'array'
          ? `SELECT DISTINCT reference.file_id FROM public.${table} record
              CROSS JOIN LATERAL unnest(record.${field}) reference(file_id) WHERE reference.file_id=ANY($1::uuid[])`
          : `SELECT DISTINCT record.${field} AS file_id FROM public.${table} record WHERE record.${field}=ANY($1::uuid[])`;
      for (const linked of (await client.query<{ file_id: string }>(query, [ids])).rows)
        add(linked.file_id, { relationship: protectedLabels[column.table_name] ?? 'Catatan terkait lainnya',
          recordCode: null, propertyId, leaseIds: [], protected: true, availableEvidenceCount: 0 });
    }
    const claimsAvailable = (await client.query<{ available: boolean }>(
      "SELECT to_regclass('public.lease_file_purge_items') IS NOT NULL AS available")).rows[0]?.available === true;
    const claims = claimsAvailable && ids.length ? (await client.query<{ file_id: string; command_id: string }>(
      'SELECT file_id,command_id FROM lease_file_purge_items WHERE file_id=ANY($1::uuid[]) ORDER BY file_id', [ids])).rows : [];
    const claimed = new Map(claims.map((row) => [row.file_id, row.command_id]));
    const files = ids.length ? (await client.query<FileRow>(`SELECT file.id,file.property_id,file.file_purpose,
      file.file_extension,file.file_size_bytes::text,file.is_deleted,file.storage_driver,file.storage_path,file.checksum_sha256,
      EXISTS(SELECT 1 FROM files other WHERE other.id<>file.id AND other.storage_driver=file.storage_driver
        AND other.storage_path=file.storage_path) AS duplicate_path
      FROM files file WHERE file.id=ANY($1::uuid[]) ORDER BY file.created_at,file.id`, [ids])).rows : [];
    if (files.length !== ids.length) throw new ConflictException({ code: 'LEASE_FILE_PURGE_FACTS_INVALID',
      message: 'Ada hubungan berkas yang datanya belum lengkap. Tidak ada berkas dihapus; perbarui inventaris dan minta Pihak Pengelola memeriksa catatan terkait.' });
    const items = files.map((file, index) => {
      const relationships = references.get(file.id) ?? [];
      const decision = evaluateArchiveFile({ propertyId, leaseId: archive.lease_id,
        archiveStatus: archive.lease_status === 'cancelled' ? archive.archive_status : 'restored',
        coverageVerified,
        file: { propertyId: file.property_id, purpose: file.file_purpose, sizeBytes: Number(file.file_size_bytes),
          isDeleted: file.is_deleted, claimId: claimed.get(file.id) ?? null, duplicatePath: file.duplicate_path },
        references: relationships });
      return {
        file_id: file.id, filename: downloadFilename(`Bukti-Arsip-${archive.lease_code}-${String(index+1).padStart(2, '0')}.${file.file_extension}`),
        file_purpose: file.file_purpose, size_bytes: Number(file.file_size_bytes),
        metadata_removed: file.is_deleted,
        ...decision, claim_command_id: claimed.get(file.id) ?? null,
        relationships: relationships.map((reference) => ({ relationship: reference.relationship,
          record_code: reference.recordCode, protected: reference.protected,
          shared_with_another_lease: reference.leaseIds.some((id) => id !== archive.lease_id) })),
      };
    });
    // Capture metadata and all binding facts, not just the number of files.
    const fingerprint = createHash('sha256').update(JSON.stringify({ archive, columns, files,
      references: [...references], claims, coverageVerified })).digest('hex');
    return { archive_id: archive.id, property_id: propertyId, lease_id: archive.lease_id,
      lease_code: archive.lease_code, archive_status: archive.archive_status,
      coverage_verified: coverageVerified, review_fingerprint: fingerprint, items,
      selectable_count: items.filter((item) => item.selectable).length,
      estimated_bytes: items.reduce((total, item) => total + item.estimatedBytes, 0),
      capacity_note: 'Ukuran ini perkiraan. Ruang yang benar-benar dibebaskan hanya dihitung setelah penghapusan fisik terverifikasi. Dokumen yang dibuat dari catatan transaksi bukan berkas tersimpan yang dapat dipilih di sini.',
    };
  }

  private async referenceColumns(client: PoolClient) {
    return (await client.query<Column>(`SELECT DISTINCT table_row.relname AS table_name,column_row.attname AS column_name,
        'uuid'::text AS kind
      FROM pg_constraint fk JOIN pg_class table_row ON table_row.oid=fk.conrelid
      JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
      CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(source_key,target_key)
      JOIN pg_attribute column_row ON column_row.attrelid=table_row.oid AND column_row.attnum=keys.source_key
      JOIN pg_attribute target ON target.attrelid=fk.confrelid AND target.attnum=keys.target_key
      WHERE fk.contype='f' AND fk.confrelid=to_regclass('public.files') AND target.attname='id' AND namespace.nspname='public'
      UNION SELECT columns.table_name,columns.column_name,CASE WHEN udt_name='_uuid' THEN 'array' WHEN data_type IN ('json','jsonb') THEN 'json' ELSE 'uuid' END
      FROM information_schema.columns columns JOIN information_schema.tables tables
        ON tables.table_schema=columns.table_schema AND tables.table_name=columns.table_name AND tables.table_type='BASE TABLE'
      WHERE columns.table_schema='public'
        AND (data_type IN ('json','jsonb') OR udt_name IN ('uuid','_uuid') AND column_name ILIKE '%file%')
      ORDER BY table_name,column_name,kind`)).rows;
  }

  private async coverageVerified(client: PoolClient, columns: Column[]) {
    const available = (await client.query<{ available: boolean }>(
      "SELECT to_regclass('public.lease_file_reference_guards') IS NOT NULL AS available")).rows[0]?.available;
    if (!available) return false;
    const guarded = (await client.query<Column>(`SELECT guard.table_name,guard.column_name,guard.kind
      FROM lease_file_reference_guards guard JOIN pg_class relation ON relation.relname=guard.table_name
        AND relation.relnamespace='public'::regnamespace
      JOIN pg_trigger trigger ON trigger.tgrelid=relation.oid AND trigger.tgname=guard.trigger_name
      WHERE NOT trigger.tgisinternal AND trigger.tgenabled='O'
        AND trigger.tgtype=23 AND trigger.tgnargs=1
        AND encode(trigger.tgargs,'hex')=encode(convert_to(guard.column_name,'UTF8'),'hex')||'00'
        AND trigger.tgfoid=to_regprocedure('public.guard_lease_file_purge_reference()')`)).rows;
    const keys = new Set(guarded.map((column) => `${column.table_name}.${column.column_name}:${column.kind}`));
    const parents = (await client.query<{ guarded: boolean }>(`SELECT count(*)=5 AS guarded FROM pg_trigger
      WHERE tgname=ANY(ARRAY['trg_h08_file_parent_payments','trg_h08_file_parent_allocations','trg_h08_file_parent_invoices',
        'trg_h08_file_parent_proofs','trg_h08_file_parent_onboarding']) AND NOT tgisinternal AND tgenabled='O'
        AND tgtype=23 AND tgfoid=to_regprocedure('public.guard_lease_file_purge_parent()')`)).rows[0]?.guarded === true;
    return parents && columns.filter((column) => !nonOwningPurgeTables.has(column.table_name)
      && !(column.kind === 'json' && DESCRIPTIVE_FILE_JSON_TABLES.has(column.table_name)))
      .every((column) => keys.has(`${column.table_name}.${column.column_name}:${column.kind}`));
  }

  private identifier(value: string) {
    if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new ConflictException({ code: 'LEASE_FILE_PURGE_COVERAGE_UNVERIFIED',
      message: 'Hubungan berkas belum dapat diperiksa lengkap. Tidak ada berkas dihapus; minta pemeriksaan sistem sebelum melanjutkan.' });
    return `"${value}"`;
  }

  private assertAdmin(user: UserAccessContext, propertyId: string) {
    if (!user.roles.includes('admin') || !user.permissions.includes('lease.read') || !user.propertyIds.includes(propertyId))
      throw new ForbiddenException({ code: 'LEASE_FILE_PURGE_FORBIDDEN',
        message: 'Inventaris berkas hanya tersedia untuk Admin pada properti terkait. Gunakan akun dengan izin membaca penyewaan.' });
  }
}
