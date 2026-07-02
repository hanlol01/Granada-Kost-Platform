import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { CreateFileRecordInput, FileRecord, FileStorageDriver, SupportedMimeType } from './types/file.types';
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
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class FileRepository {
  constructor(private readonly database: DatabaseService) {}

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
         deleted_by_user_id, created_at, updated_at`,
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
         deleted_by_user_id, created_at, updated_at
       FROM files
       WHERE id = $1`,
      [fileId],
    );

    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async softDelete(fileId: string, deletedByUserId: string): Promise<FileRecord | null> {
    const result = await this.database.client.query<FileRow>(
      `UPDATE files
       SET is_deleted = true,
           deleted_at = now(),
           deleted_by_user_id = $2,
           updated_at = now()
       WHERE id = $1 AND is_deleted = false
       RETURNING
         id, property_id, uploader_user_id, original_filename, sanitized_filename,
         mime_type, file_extension, file_size_bytes, file_purpose, storage_driver,
         storage_path, checksum_sha256, metadata, is_deleted, deleted_at,
         deleted_by_user_id, created_at, updated_at`,
      [fileId, deletedByUserId],
    );

    return result.rows[0] ? this.map(result.rows[0]) : null;
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
      deletedAt: row.deleted_at,
      deletedByUserId: row.deleted_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
