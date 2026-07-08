// Shared file upload types, purposes, and validation policies.
// Mirrors backend file.constants.ts for client-side use.
// This module is framework-agnostic — no React, no Node.js, no fetch.
//
// Source of truth: docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md
// Backend source: backend/api/src/modules/file/constants/file.constants.ts

// ---------------------------------------------------------------------------
// Purposes
// ---------------------------------------------------------------------------

export const FILE_PURPOSES = [
  "payment_proof",
  "complaint_attachment",
  "maintenance_attachment",
  "vehicle_photo",
  "vehicle_document",
  "room_photo",
  "property_logo",
  "ktp",
  "hunian_gallery",
] as const;

export type FilePurpose = (typeof FILE_PURPOSES)[number];

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

export type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

// ---------------------------------------------------------------------------
// Purpose policies
// ---------------------------------------------------------------------------

export type FilePurposePolicy = {
  purpose: FilePurpose;
  allowedMimeTypes: SupportedMimeType[];
  maxBytesByMimeType: Partial<Record<SupportedMimeType, number>>;
  maxFilesPerEntity: number;
  /** Indonesian UI label shown to users. */
  label: string;
  /** Whether to apply client-side image compression before upload. */
  compressImages: boolean;
};

export const FILE_PURPOSE_POLICIES: Record<FilePurpose, FilePurposePolicy> = {
  payment_proof: {
    purpose: "payment_proof",
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
      "application/pdf": 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 3,
    label: "Bukti pembayaran",
    compressImages: true,
  },
  complaint_attachment: {
    purpose: "complaint_attachment",
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 5,
    label: "Foto keluhan",
    compressImages: true,
  },
  maintenance_attachment: {
    purpose: "maintenance_attachment",
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 5,
    label: "Foto pekerjaan",
    compressImages: true,
  },
  vehicle_photo: {
    purpose: "vehicle_photo",
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 3,
    label: "Foto kendaraan",
    compressImages: true,
  },
  vehicle_document: {
    purpose: "vehicle_document",
    allowedMimeTypes: ["application/pdf"],
    maxBytesByMimeType: {
      "application/pdf": 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 2,
    label: "Dokumen kendaraan",
    compressImages: false,
  },
  room_photo: {
    purpose: "room_photo",
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 10,
    label: "Foto kamar",
    compressImages: true,
  },
  property_logo: {
    purpose: "property_logo",
    allowedMimeTypes: ["image/jpeg", "image/png"],
    maxBytesByMimeType: {
      "image/jpeg": 1 * 1024 * 1024,
      "image/png": 1 * 1024 * 1024,
    },
    maxFilesPerEntity: 1,
    label: "Logo properti",
    compressImages: false,
  },
  ktp: {
    purpose: "ktp",
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxBytesByMimeType: {
      "image/jpeg": 2 * 1024 * 1024,
      "image/png": 2 * 1024 * 1024,
      "application/pdf": 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 1,
    label: "KTP",
    compressImages: false,
  },
  // M19B/M19C hunian gallery. Backend policy (015_hunian_gallery.sql + file
  // constants): JPEG/PNG/WebP only, max 3 MB, max 10 active images per public
  // catalog item. publicVisible defaults to false backend-side.
  hunian_gallery: {
    purpose: "hunian_gallery",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytesByMimeType: {
      "image/jpeg": 3 * 1024 * 1024,
      "image/png": 3 * 1024 * 1024,
      "image/webp": 3 * 1024 * 1024,
    },
    maxFilesPerEntity: 10,
    label: "Foto galeri hunian",
    compressImages: true,
  },
};

// ---------------------------------------------------------------------------
// Backend API response shape (matches FileService.toResponse())
// ---------------------------------------------------------------------------

export type FileResponse = {
  id: string;
  property_id: string;
  uploader_user_id: string | null;
  original_filename: string;
  sanitized_filename: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  file_purpose: string;
  storage_driver: string;
  checksum_sha256: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Client-side validation result
// ---------------------------------------------------------------------------

export type FileValidationResult =
  | { valid: true }
  | { valid: false; code: string; message: string };

// ---------------------------------------------------------------------------
// Backend file error codes
// ---------------------------------------------------------------------------

export const FILE_ERROR_CODES = {
  FILE_REQUIRED: "FILE_REQUIRED",
  FILE_EXTENSION_NOT_ALLOWED: "FILE_EXTENSION_NOT_ALLOWED",
  FILE_TYPE_UNSUPPORTED: "FILE_TYPE_UNSUPPORTED",
  FILE_MIME_MISMATCH: "FILE_MIME_MISMATCH",
  FILE_EXTENSION_MISMATCH: "FILE_EXTENSION_MISMATCH",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FILE_TOO_LARGE_FOR_PURPOSE: "FILE_TOO_LARGE_FOR_PURPOSE",
  FILE_STORAGE_QUOTA_EXCEEDED: "FILE_STORAGE_QUOTA_EXCEEDED",
  FILE_PURPOSE_DENIED: "FILE_PURPOSE_DENIED",
  FILE_ACCESS_DENIED: "FILE_ACCESS_DENIED",
} as const;

// ---------------------------------------------------------------------------
// Image compression settings (client-side, native canvas)
// ---------------------------------------------------------------------------

export const IMAGE_COMPRESSION = {
  maxWidthPx: 1600,
  jpegQuality: 0.75,
  outputFormat: "image/jpeg" as const,
} as const;

// ---------------------------------------------------------------------------
// Dangerous extension blocklist (same as backend)
// ---------------------------------------------------------------------------

export const DANGEROUS_FILE_EXTENSIONS = new Set([
  "exe", "sh", "bat", "cmd", "ps1", "vbs", "js",
  "html", "htm", "svg", "xml", "php", "asp", "jar", "war",
]);
