import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  CreateFileRecordInput,
  FileRecord,
  FileStorageDriver,
  SupportedMimeType,
} from './types/file.types';
import type { FilePurpose } from './types/file.types';

type FileRow = {
  id: string;
  property_id: string;
  uploader_user_id: string | null;
  original_filename: string;
  sanitized_filename: string;
  mime_type: SupportedMimeType;
  file_extension: string;
  file_size_bytes: string;
  file_purpose: FilePurpose;
  storage_driver: FileStorageDriver;
  storage_path: string;
  checksum_sha256: string;
  metadata: Record<string, unknown>;
  is_deleted: boolean;
  archive_purge_command_id?: string | null;
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class FileRepository {
  constructor(private readonly database: DatabaseService) {}

  async isOwnerRealizationEvidenceAttached(fileId: string): Promise<boolean> {
    const result = await this.database.client.query<{ attached: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM property_owner_realization_evidence_files WHERE file_id=$1) AS attached`,
      [fileId],
    );
    return result.rows[0]?.attached === true;
  }

  async isDocumentSignatureAttached(fileId: string): Promise<boolean> {
    const result = await this.database.client.query<{ attached: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM property_document_signatories
         WHERE signature_file_id=$1
       ) AS attached`,
      [fileId],
    );
    return result.rows[0]?.attached === true;
  }

  async create(input: CreateFileRecordInput): Promise<FileRecord> {
    const result = await this.database.client.query<FileRow>(
      `INSERT INTO files (
         id, property_id, uploader_user_id, original_filename, sanitized_filename,
         mime_type, file_extension, file_size_bytes, file_purpose,
         storage_driver, storage_path, checksum_sha256, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       RETURNING
         id, property_id, uploader_user_id, original_filename, sanitized_filename,
         mime_type, file_extension, file_size_bytes, file_purpose, storage_driver,
         storage_path, checksum_sha256, metadata, is_deleted, deleted_at,
          deleted_by_user_id, created_at, updated_at, archive_purge_command_id`,
      [
        input.id,
        input.propertyId,
        input.uploaderUserId,
        input.originalFilename,
        input.sanitizedFilename,
        input.mimeType,
        input.fileExtension,
        input.fileSizeBytes,
        input.filePurpose,
        input.storageDriver,
        input.storagePath,
        input.checksumSha256,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return this.map(result.rows[0]);
  }

  async findById(fileId: string): Promise<FileRecord | null> {
    const result = await this.database.client.query<FileRow>(
      `SELECT
         id, property_id, uploader_user_id, original_filename, sanitized_filename,
         mime_type, file_extension, file_size_bytes, file_purpose, storage_driver,
         storage_path, checksum_sha256, metadata, is_deleted, deleted_at,
          deleted_by_user_id, created_at, updated_at, archive_purge_command_id
       FROM files
       WHERE id = $1`,
      [fileId],
    );

    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async softDelete(
    fileId: string,
    deletedByUserId: string,
    purpose?: FilePurpose,
  ): Promise<FileRecord | null> {
    const operation = async (queryable: Pick<DatabaseService['client'], 'query'>) => {
      if (purpose === 'lease_revision_evidence') {
        // Serialize attachment and removal on the file row. Re-read relationships
        // after waiting for a correction commit, not before acquiring this lock.
        await queryable.query('SELECT id FROM files WHERE id=$1 FOR UPDATE', [fileId]);
        const attached = await queryable.query<{ attached: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM lease_data_correction_evidence WHERE file_id=$1) AS attached`,
          [fileId],
        );
        if (attached.rows[0]?.attached !== false)
          throw new ConflictException({
            code: 'LEASE_CORRECTION_EVIDENCE_ATTACHED',
            message:
              'Bukti sudah tercatat pada riwayat koreksi dan tidak dapat dihapus sebagai unggahan biasa. Tinjau penghapusan berkas melalui arsip penyewaan.',
          });
      }
      const result = await queryable.query<FileRow>(
        `UPDATE files
       SET is_deleted = true,
           deleted_at = now(),
           deleted_by_user_id = $2,
           updated_at = now()
        WHERE id = $1 AND is_deleted = false AND archive_purge_command_id IS NULL
       RETURNING
         id, property_id, uploader_user_id, original_filename, sanitized_filename,
         mime_type, file_extension, file_size_bytes, file_purpose, storage_driver,
         storage_path, checksum_sha256, metadata, is_deleted, deleted_at,
          deleted_by_user_id, created_at, updated_at, archive_purge_command_id`,
        [fileId, deletedByUserId],
      );

      return result.rows[0] ? this.map(result.rows[0]) : null;
    };
    return purpose === 'lease_revision_evidence'
      ? this.database.transaction(operation)
      : operation(this.database.client);
  }

  /** Availability is not deletion. Never update a claimed or changed file. */
  async recordContentAvailability(record: FileRecord, available: boolean): Promise<void> {
    await this.database.client.query(
      `UPDATE files SET metadata = CASE WHEN $6 THEN metadata - 'storage_content_unavailable'
          ELSE metadata || '{"storage_content_unavailable":true}'::jsonb END, updated_at = now()
       WHERE id = $1 AND property_id = $2
         AND storage_path = $3 AND checksum_sha256 = $4 AND file_size_bytes = $5
         AND is_deleted = false AND archive_purge_command_id IS NULL
         AND COALESCE(metadata->>'storage_content_unavailable','false') <> CASE WHEN $6 THEN 'false' ELSE 'true' END`,
      [record.id, record.propertyId, record.storagePath, record.checksumSha256, record.fileSizeBytes, available],
    );
  }

  /** Invoked only after authorization; codes never contain people's names. */
  async downloadContext(
    record: FileRecord,
  ): Promise<{ label: string; code: string; sequence: string }> {
    if (record.filePurpose === 'lease_revision_evidence') {
      const correction = await this.database.client.query<{ code: string; sequence: string }>(
        `WITH numbered AS (SELECT evidence.file_id,lease.lease_code || '-KOREKSI-' || correction.sequence_number::text AS code,
                row_number() OVER (PARTITION BY evidence.correction_id ORDER BY evidence.created_at,evidence.id)::text AS sequence
           FROM lease_data_correction_evidence evidence
           JOIN lease_data_corrections correction ON correction.id=evidence.correction_id AND correction.property_id=evidence.property_id
           JOIN leases lease ON lease.id=evidence.lease_id AND lease.property_id=evidence.property_id
          WHERE evidence.property_id=$2 AND evidence.correction_id=(SELECT correction_id FROM lease_data_correction_evidence WHERE file_id=$1 AND property_id=$2 ORDER BY created_at,id LIMIT 1))
          SELECT code,sequence FROM numbered WHERE file_id=$1`,
        [record.id, record.propertyId],
      );
      if (correction.rows[0]) return { label: 'Bukti-Koreksi-Penyewaan', ...correction.rows[0] };
    }
    const result = await this.database.client.query<{
      label: string;
      code: string;
      sequence: string;
    }>(
      `WITH context AS (
         SELECT 1 AS priority, 'Bukti-Transfer' AS label, p.payment_code AS code,
                e.created_at, e.id, e.file_id, p.id::text AS group_id
           FROM payment_evidence_files e JOIN payments p ON p.id=e.payment_id
          WHERE e.property_id=$2 AND p.property_id=$2
         UNION ALL
         SELECT 2, 'Bukti-Pembayaran', COALESCE(p.payment_code,i.invoice_code),
                e.created_at,e.id,e.file_id,proof.id::text
           FROM payment_proof_files e JOIN payment_proofs proof ON proof.id=e.payment_proof_id
           JOIN invoices i ON i.id=proof.invoice_id LEFT JOIN payments p ON p.id=proof.payment_id
          WHERE proof.property_id=$2 AND i.property_id=$2
         UNION ALL
         SELECT 3, CASE WHEN e.entity_kind='transfer' THEN 'Bukti-Transfer-Owner'
                        WHEN e.entity_kind='recovery_event' THEN 'Bukti-Pengembalian-Owner'
                        ELSE 'Bukti-Penyesuaian-Owner' END,
                COALESCE(t.receipt_number,r.realization_reference),e.created_at,e.id,e.file_id,e.entity_id::text
           FROM property_owner_realization_evidence_files e
           JOIN property_owner_realizations r ON r.id=e.realization_id
           LEFT JOIN property_owner_realization_transfers t ON t.id=e.entity_id AND e.entity_kind='transfer'
          WHERE e.property_id=$2 AND r.property_id=$2
         UNION ALL
         SELECT 4, 'Bukti-Tagihan',i.invoice_code,e.created_at,e.id,e.file_id,i.id::text
           FROM invoice_evidence_files e JOIN invoices i ON i.id=e.invoice_id WHERE e.property_id=$2 AND i.property_id=$2
         UNION ALL
         SELECT 5, 'Bukti-Pengembalian',l.lease_code,e.created_at,e.id,e.evidence_file_id,l.id::text
           FROM lease_exit_refunds e JOIN leases l ON l.id=e.lease_id WHERE e.property_id=$2 AND l.property_id=$2
         UNION ALL
         SELECT 6, 'Bukti-Check-Out',l.lease_code,e.recorded_at,e.id,e.file_id,c.id::text
           FROM lease_checkout_evidence e JOIN lease_checkout_commands c ON c.id=e.checkout_command_id
           JOIN leases l ON l.id=c.lease_id WHERE e.property_id=$2 AND l.property_id=$2
         UNION ALL
         SELECT 7, 'Bukti-Booking',c.transaction_code,c.created_at,c.id,e.file_id,c.id::text
           FROM booking_lead_payment_commitments c CROSS JOIN LATERAL unnest(c.payment_evidence_file_ids) AS e(file_id) WHERE c.property_id=$2
         UNION ALL
         SELECT 8, 'Bukti-Pengembalian-Booking',c.transaction_code,c.created_at,c.id,e.file_id,c.id::text
           FROM booking_lead_payment_commitment_refunds c CROSS JOIN LATERAL unnest(c.refund_evidence_file_ids) AS e(file_id) WHERE c.property_id=$2
         UNION ALL
         SELECT 9, 'Lampiran-Komplain',c.complaint_code,e.created_at,e.id,e.file_id,c.id::text
           FROM complaint_files e JOIN complaints c ON c.id=e.complaint_id WHERE c.property_id=$2
         UNION ALL
         SELECT 10, 'Lampiran-Perawatan',c.work_order_code,e.created_at,e.id,e.file_id,c.id::text
           FROM maintenance_work_order_files e JOIN maintenance_work_orders c ON c.id=e.work_order_id WHERE c.property_id=$2
         UNION ALL
         SELECT 11, 'Berkas-Kendaraan',c.vehicle_code,e.created_at,e.id,e.file_id,c.id::text
           FROM vehicle_files e JOIN vehicles c ON c.id=e.vehicle_id WHERE c.property_id=$2
       ), numbered AS (
         SELECT *,row_number() OVER (PARTITION BY priority,group_id ORDER BY created_at,id,file_id)::text AS sequence FROM context
       )
       SELECT label,code,sequence FROM numbered WHERE file_id=$1 ORDER BY priority LIMIT 1`,
      [record.id, record.propertyId],
    );
    if (result.rows[0]) return result.rows[0];
    const fallback = await this.database.client.query<{ sequence: string; code: string }>(
      `SELECT to_char(f.created_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS code,
              (SELECT count(*) FROM files earlier
                WHERE earlier.property_id=f.property_id AND earlier.file_purpose=f.file_purpose
                  AND (earlier.created_at AT TIME ZONE 'Asia/Jakarta')::date=(f.created_at AT TIME ZONE 'Asia/Jakarta')::date
                  AND (earlier.created_at,earlier.id)<=(f.created_at,f.id))::text AS sequence
         FROM files f WHERE f.id=$1 AND f.property_id=$2`,
      [record.id, record.propertyId],
    );
    return {
      label: 'Berkas',
      code: fallback.rows[0]?.code ?? record.createdAt.toISOString().slice(0, 10),
      sequence: fallback.rows[0]?.sequence ?? '1',
    };
  }

  async activeBytesForProperty(propertyId: string): Promise<number> {
    const result = await this.database.client.query<{ total_bytes: string | null }>(
      `SELECT COALESCE(SUM(file_size_bytes), 0)::text AS total_bytes
       FROM files
       WHERE property_id = $1 AND is_deleted = false`,
      [propertyId],
    );

    return Number(result.rows[0]?.total_bytes ?? 0);
  }

  private map(row: FileRow): FileRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      uploaderUserId: row.uploader_user_id,
      originalFilename: row.original_filename,
      sanitizedFilename: row.sanitized_filename,
      mimeType: row.mime_type,
      fileExtension: row.file_extension,
      fileSizeBytes: Number(row.file_size_bytes),
      filePurpose: row.file_purpose,
      storageDriver: row.storage_driver,
      storagePath: row.storage_path,
      checksumSha256: row.checksum_sha256,
      metadata: row.metadata ?? {},
      isDeleted: row.is_deleted,
      archivePurgeCommandId: row.archive_purge_command_id ?? null,
      deletedAt: row.deleted_at,
      deletedByUserId: row.deleted_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
