import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import {
  DANGEROUS_FILE_EXTENSIONS,
  FILE_PURPOSE_POLICIES,
  FILE_STORAGE_PROVIDER,
  FILE_UPLOAD_RATE_LIMITS,
  MIME_TO_EXTENSIONS,
} from './constants/file.constants';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileRepository } from './file.repository';
import type { FileStorageProvider } from './storage/file-storage.provider';
import {
  FileContent,
  FilePurpose,
  FileRecord,
  RequestAuditContext,
  SupportedMimeType,
  UploadedFileBuffer,
} from './types/file.types';

type DetectedFileType = {
  ext: string;
  mime: string;
};

type FileTypeModule = {
  fileTypeFromBuffer(buffer: Uint8Array | ArrayBuffer): Promise<DetectedFileType | undefined>;
};

const PRIVILEGED_FILE_ROLES = new Set(['owner', 'manager', 'admin', 'property_owner']);
const HUNIAN_GALLERY_UPLOAD_ROLES = new Set(['owner', 'manager', 'admin']);
const RESIDENT_UPLOAD_PURPOSES = new Set<FilePurpose>(['payment_proof', 'complaint_attachment']);
const TECHNICIAN_UPLOAD_PURPOSES = new Set<FilePurpose>(['maintenance_attachment']);

@Injectable()
export class FileService {
  constructor(
    private readonly files: FileRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
  ) {}

  async upload(
    user: UserAccessContext,
    dto: UploadFileDto,
    file: UploadedFileBuffer | undefined,
    context: RequestAuditContext,
  ): Promise<FileRecord> {
    try {
      await this.assertCanUpload(user, dto.property_id, dto.file_purpose);
      await this.consumeUploadRateLimit(user.id, dto.property_id);
      this.assertFilePresent(file);

      const validation = await this.validateUpload(file, dto.file_purpose);
      await this.assertQuotaAvailable(dto.property_id, file.size);

      const fileId = randomUUID();
      const checksumSha256 = createHash('sha256').update(file.buffer!).digest('hex');
      const storagePath = await this.storage.save(
        fileId,
        dto.property_id,
        dto.file_purpose,
        file.buffer!,
        validation.extension,
      );

      const record = await this.files.create({
        id: fileId,
        propertyId: dto.property_id,
        uploaderUserId: user.id,
        originalFilename: file.originalname,
        sanitizedFilename: validation.sanitizedFilename,
        mimeType: validation.mimeType,
        fileExtension: validation.extension,
        fileSizeBytes: file.size,
        filePurpose: dto.file_purpose,
        storageDriver: 'local',
        storagePath,
        checksumSha256,
        metadata: {
          detected_mime_type: validation.detectedMimeType,
          detected_extension: validation.detectedExtension,
        },
      });

      await this.audit.write({
        ...context,
        propertyId: record.propertyId,
        action: 'file.upload',
        resourceType: 'file',
        resourceId: record.id,
        resultStatus: 'success',
        afterData: this.auditPayload(record),
      });

      return record;
    } catch (error) {
      await this.writeUploadFailureAudit(user, dto, file, context, error);
      throw error;
    }
  }

  async getMetadata(
    user: UserAccessContext,
    fileId: string,
    context: RequestAuditContext,
  ): Promise<FileRecord> {
    const record = await this.requireActiveFile(fileId);
    await this.assertCanAccess(user, record, 'file.metadata.denied', context);
    return record;
  }

  async readContent(
    user: UserAccessContext,
    fileId: string,
    context: RequestAuditContext,
  ): Promise<FileContent> {
    const record = await this.requireActiveFile(fileId);
    await this.assertCanAccess(user, record, 'file.download.denied', context);

    const exists = await this.storage.exists(record.storagePath);
    if (!exists) {
      throw new NotFoundException({
        code: 'FILE_CONTENT_NOT_FOUND',
        message: 'File content is missing from storage',
      });
    }

    const buffer = await this.storage.read(record.storagePath);
    await this.audit.write({
      ...context,
      propertyId: record.propertyId,
      action: 'file.download',
      resourceType: 'file',
      resourceId: record.id,
      resultStatus: 'success',
      afterData: this.auditPayload(record),
    });

    return { record, buffer };
  }

  async readStoredContent(record: FileRecord): Promise<FileContent> {
    if (record.isDeleted) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'File not found' });
    }

    const exists = await this.storage.exists(record.storagePath);
    if (!exists) {
      throw new NotFoundException({
        code: 'FILE_CONTENT_NOT_FOUND',
        message: 'File content is missing from storage',
      });
    }

    const buffer = await this.storage.read(record.storagePath);
    return { record, buffer };
  }

  async softDelete(
    user: UserAccessContext,
    fileId: string,
    context: RequestAuditContext,
  ): Promise<{ success: true; file: FileRecord }> {
    const before = await this.requireActiveFile(fileId);
    await this.assertCanAccess(user, before, 'file.delete.denied', context);

    const deleted = await this.files.softDelete(fileId, user.id);
    if (!deleted) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'File not found' });
    }

    await this.audit.write({
      ...context,
      propertyId: deleted.propertyId,
      action: 'file.delete',
      resourceType: 'file',
      resourceId: deleted.id,
      beforeData: this.auditPayload(before),
      afterData: this.auditPayload(deleted),
      resultStatus: 'success',
    });

    return { success: true, file: deleted };
  }

  toResponse(record: FileRecord) {
    return {
      id: record.id,
      property_id: record.propertyId,
      uploader_user_id: record.uploaderUserId,
      original_filename: record.originalFilename,
      sanitized_filename: record.sanitizedFilename,
      mime_type: record.mimeType,
      file_extension: record.fileExtension,
      file_size_bytes: record.fileSizeBytes,
      file_purpose: record.filePurpose,
      storage_driver: record.storageDriver,
      checksum_sha256: record.checksumSha256,
      is_deleted: record.isDeleted,
      deleted_at: record.deletedAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  private assertFilePresent(file: UploadedFileBuffer | undefined): asserts file is UploadedFileBuffer {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Multipart field "file" is required',
      });
    }
  }

  private async validateUpload(file: UploadedFileBuffer, purpose: FilePurpose) {
    const policy = FILE_PURPOSE_POLICIES[purpose];
    const sanitizedFilename = this.sanitizeFilename(file.originalname);
    const extension = this.extensionFromFilename(sanitizedFilename);

    if (!extension || DANGEROUS_FILE_EXTENSIONS.has(extension)) {
      throw new BadRequestException({
        code: 'FILE_EXTENSION_NOT_ALLOWED',
        message: 'File extension is not allowed',
      });
    }

    const detected = await this.detectMagicBytes(file.buffer!);
    if (!detected) {
      throw new BadRequestException({
        code: 'FILE_TYPE_UNSUPPORTED',
        message: 'File type could not be detected',
      });
    }

    const detectedMimeType = detected.mime as SupportedMimeType;
    if (!policy.allowedMimeTypes.includes(detectedMimeType)) {
      throw new BadRequestException({
        code: 'FILE_TYPE_UNSUPPORTED',
        message: 'File MIME type is not allowed for this purpose',
      });
    }

    const configuredMaxBytes = this.config.getOrThrow<number>('upload.maxFileSizeMb') * 1024 * 1024;
    if (file.size > configuredMaxBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the configured upload size limit',
        details: { max_bytes: configuredMaxBytes, actual_bytes: file.size },
      });
    }

    if (file.mimetype !== detectedMimeType) {
      throw new BadRequestException({
        code: 'FILE_MIME_MISMATCH',
        message: 'Declared MIME type does not match file content',
      });
    }

    const allowedExtensions = MIME_TO_EXTENSIONS[detectedMimeType] ?? [];
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException({
        code: 'FILE_EXTENSION_MISMATCH',
        message: 'File extension does not match file content',
      });
    }

    const maxBytes = policy.maxBytesByMimeType[detectedMimeType] ?? 0;
    if (file.size > maxBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE_FOR_PURPOSE',
        message: 'File exceeds the purpose-specific size limit',
        details: { max_bytes: maxBytes, actual_bytes: file.size, file_purpose: purpose },
      });
    }

    return {
      sanitizedFilename,
      extension,
      mimeType: detectedMimeType,
      detectedMimeType,
      detectedExtension: detected.ext,
    };
  }

  private async detectMagicBytes(buffer: Buffer): Promise<DetectedFileType | undefined> {
    // file-type is ESM-only; this preserves native import() under the API's CommonJS build.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const importFileType = new Function('return import("file-type")') as () => Promise<FileTypeModule>;
    const fileType = await importFileType();
    return fileType.fileTypeFromBuffer(buffer);
  }

  private sanitizeFilename(filename: string): string {
    const fallback = 'upload';
    const normalized = filename
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return (normalized || fallback).slice(0, 180);
  }

  private extensionFromFilename(filename: string): string | null {
    const extension = extname(filename).replace('.', '').toLowerCase();
    return extension || null;
  }

  private async assertQuotaAvailable(propertyId: string, incomingBytes: number): Promise<void> {
    const quotaMb = this.config.get<number>('upload.propertyQuotaMb');
    if (!quotaMb || quotaMb <= 0) {
      return;
    }

    const usedBytes = await this.files.activeBytesForProperty(propertyId);
    const maxBytes = quotaMb * 1024 * 1024;
    if (usedBytes + incomingBytes > maxBytes) {
      throw new HttpException(
        {
          code: 'FILE_STORAGE_QUOTA_EXCEEDED',
          message: 'Property upload quota would be exceeded',
          details: { quota_bytes: maxBytes, used_bytes: usedBytes, incoming_bytes: incomingBytes },
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  private async consumeUploadRateLimit(userId: string, propertyId: string): Promise<void> {
    const checks = [
      {
        key: `rate-limit:file:user:minute:${userId}`,
        ...FILE_UPLOAD_RATE_LIMITS.perUserMinute,
      },
      {
        key: `rate-limit:file:user:hour:${userId}`,
        ...FILE_UPLOAD_RATE_LIMITS.perUserHour,
      },
      {
        key: `rate-limit:file:property:hour:${propertyId}`,
        ...FILE_UPLOAD_RATE_LIMITS.perPropertyHour,
      },
    ];

    const client = this.redis.client;
    if (client.status === 'wait') {
      await client.connect();
    }

    for (const check of checks) {
      const count = await client.incr(check.key);
      if (count === 1) {
        await client.expire(check.key, check.windowSeconds);
      }
      if (count > check.limit) {
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: 'Too many file upload attempts. Please try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async assertCanUpload(
    user: UserAccessContext,
    propertyId: string,
    purpose: FilePurpose,
  ): Promise<void> {
    await this.properties.assertCanReadProperty(user, propertyId);

    if (purpose === 'hunian_gallery') {
      if (user.roles.some((role) => HUNIAN_GALLERY_UPLOAD_ROLES.has(role))) {
        return;
      }

      throw new ForbiddenException({
        code: 'FILE_PURPOSE_DENIED',
        message: 'User is not allowed to upload hunian gallery files',
      });
    }

    if (this.hasPrivilegedFileRole(user)) {
      return;
    }

    if (user.roles.includes('resident') && RESIDENT_UPLOAD_PURPOSES.has(purpose)) {
      return;
    }

    if (user.roles.includes('technician') && TECHNICIAN_UPLOAD_PURPOSES.has(purpose)) {
      return;
    }

    throw new ForbiddenException({
      code: 'FILE_PURPOSE_DENIED',
      message: 'User is not allowed to upload this file purpose',
    });
  }

  private async assertCanAccess(
    user: UserAccessContext,
    record: FileRecord,
    deniedAction: string,
    context: RequestAuditContext,
  ): Promise<void> {
    try {
      await this.properties.assertCanReadProperty(user, record.propertyId);

      if (this.hasPrivilegedFileRole(user) || record.uploaderUserId === user.id) {
        return;
      }
    } catch (error) {
      await this.writeDeniedAudit(user, record, deniedAction, context);
      throw error;
    }

    await this.writeDeniedAudit(user, record, deniedAction, context);
    throw new ForbiddenException({
      code: 'FILE_ACCESS_DENIED',
      message: 'User is not allowed to access this file',
    });
  }

  private hasPrivilegedFileRole(user: UserAccessContext): boolean {
    return user.roles.some((role) => PRIVILEGED_FILE_ROLES.has(role));
  }

  private async requireActiveFile(fileId: string): Promise<FileRecord> {
    const record = await this.files.findById(fileId);
    if (!record || record.isDeleted) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'File not found' });
    }
    return record;
  }

  private async writeUploadFailureAudit(
    user: UserAccessContext,
    dto: UploadFileDto,
    file: UploadedFileBuffer | undefined,
    context: RequestAuditContext,
    error: unknown,
  ): Promise<void> {
    const status = error instanceof ForbiddenException ? 'denied' : 'failed';
    await this.audit.write({
      ...context,
      propertyId: dto.property_id,
      action: status === 'denied' ? 'file.upload.denied' : 'file.upload.failed',
      resourceType: 'file',
      resultStatus: status,
      afterData: {
        file_purpose: dto.file_purpose,
        original_filename: file?.originalname,
        declared_mime_type: file?.mimetype,
        file_size_bytes: file?.size,
        error_code: this.errorCode(error),
      },
    });
  }

  private async writeDeniedAudit(
    user: UserAccessContext,
    record: FileRecord,
    action: string,
    context: RequestAuditContext,
  ): Promise<void> {
    await this.audit.write({
      ...context,
      actorUserId: user.id,
      propertyId: record.propertyId,
      action,
      resourceType: 'file',
      resourceId: record.id,
      resultStatus: 'denied',
      afterData: this.auditPayload(record),
    });
  }

  private auditPayload(record: FileRecord): Record<string, unknown> {
    return {
      file_id: record.id,
      property_id: record.propertyId,
      file_purpose: record.filePurpose,
      mime_type: record.mimeType,
      file_size_bytes: record.fileSizeBytes,
      checksum_sha256: record.checksumSha256,
      is_deleted: record.isDeleted,
    };
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        return String(response.code);
      }
    }
    return 'FILE_UPLOAD_FAILED';
  }
}
