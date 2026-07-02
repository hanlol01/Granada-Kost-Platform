import type { FILE_PURPOSES, FILE_STORAGE_DRIVERS } from '../constants/file.constants';

export type FilePurpose = (typeof FILE_PURPOSES)[number];
export type FileStorageDriver = (typeof FILE_STORAGE_DRIVERS)[number];
export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

export type FilePurposePolicy = {
  purpose: FilePurpose;
  allowedMimeTypes: SupportedMimeType[];
  maxBytesByMimeType: Partial<Record<SupportedMimeType, number>>;
};

export type FileRecord = {
  id: string;
  propertyId: string;
  uploaderUserId: string | null;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: SupportedMimeType;
  fileExtension: string;
  fileSizeBytes: number;
  filePurpose: FilePurpose;
  storageDriver: FileStorageDriver;
  storagePath: string;
  checksumSha256: string;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFileRecordInput = {
  id: string;
  propertyId: string;
  uploaderUserId: string;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: SupportedMimeType;
  fileExtension: string;
  fileSizeBytes: number;
  filePurpose: FilePurpose;
  storageDriver: FileStorageDriver;
  storagePath: string;
  checksumSha256: string;
  metadata?: Record<string, unknown>;
};

export type UploadedFileBuffer = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
};

export type RequestAuditContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type FileContent = {
  record: FileRecord;
  buffer: Buffer;
};
