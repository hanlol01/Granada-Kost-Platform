// File upload utilities for the Admin app.
// Provides client-side validation (UX only), image compression, authorized blob
// fetch for previews, and WhatsApp admin fallback URL builder.
//
// Reference: docs/12-product-readiness/GENERIC_UPLOAD_ENGINE_PLAN.md
// Reference: docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md
//
// IMPORTANT: Frontend is NOT the policy enforcement point. Backend is authoritative.
// All validation here is UX-only to provide instant feedback.

import {
  DANGEROUS_FILE_EXTENSIONS,
  FILE_PURPOSE_POLICIES,
  IMAGE_COMPRESSION,
  type FilePurpose,
  type FileValidationResult,
  type SupportedMimeType,
} from "@granada-kost/domain";
import { env } from "./env";
import { getAccessToken } from "./api";

// ---------------------------------------------------------------------------
// Client-side file validation (UX only — backend is authoritative)
// ---------------------------------------------------------------------------

type FileValidationOptions = {
  skipSize?: boolean;
};

const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

const NORMALIZED_MIME: Readonly<Record<string, SupportedMimeType>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "application/pdf": "application/pdf",
};

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

export class FilePreparationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FilePreparationError";
  }
}

export type PreparedUploadFile = {
  file: File;
  originalSizeBytes: number;
  wasCompressed: boolean;
  savedBytes: number;
};

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function stemOf(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 120) || "file"
  );
}

function filenameForMime(filename: string, mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType]?.[0] ?? "bin";
  return `${stemOf(filename)}.${extension}`;
}

export function validateFileForPurpose(
  file: File,
  purpose: FilePurpose,
  options: FileValidationOptions = {},
): FileValidationResult {
  const policy = FILE_PURPOSE_POLICIES[purpose];
  const mimeType = NORMALIZED_MIME[file.type.toLowerCase()] ?? file.type.toLowerCase();

  // 1. MIME type check
  if (!policy.allowedMimeTypes.includes(mimeType as SupportedMimeType)) {
    const allowed = policy.allowedMimeTypes
      .map((m) =>
        m === "image/jpeg"
          ? "JPEG"
          : m === "image/png"
            ? "PNG"
            : m === "image/webp"
              ? "WebP"
              : "PDF",
      )
      .join(", ");
    return {
      valid: false,
      code: "CLIENT_MIME_NOT_ALLOWED",
      message: `Format file tidak didukung. Gunakan ${allowed}.`,
    };
  }

  // 2. Size check (purpose-specific)
  const maxBytes = policy.maxBytesByMimeType[mimeType as SupportedMimeType] ?? 0;
  if (!options.skipSize && maxBytes > 0 && file.size > maxBytes) {
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      code: "CLIENT_FILE_TOO_LARGE",
      message: `File terlalu besar. Maksimum ${maxMB} MB untuk ${policy.label.toLowerCase()}.`,
    };
  }

  // 3. Dangerous extension check
  const ext = extensionOf(file.name);
  if (DANGEROUS_FILE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      code: "CLIENT_EXTENSION_DANGEROUS",
      message: "Jenis file ini tidak diizinkan.",
    };
  }

  return { valid: true };
}

export async function detectFileContentType(file: Blob): Promise<SupportedMimeType | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") {
    return "application/pdf";
  }
  return null;
}

export async function prepareFileForUpload(
  source: File,
  purpose: FilePurpose,
  options: {
    compress?: boolean;
    compressor?: (file: File) => Promise<Blob>;
  } = {},
): Promise<PreparedUploadFile> {
  const policy = FILE_PURPOSE_POLICIES[purpose];
  const extension = extensionOf(source.name);
  if (DANGEROUS_FILE_EXTENSIONS.has(extension)) {
    throw new FilePreparationError("CLIENT_EXTENSION_DANGEROUS", "Jenis file ini tidak diizinkan.");
  }

  const detectedMime = await detectFileContentType(source);
  if (!detectedMime) {
    throw new FilePreparationError(
      "CLIENT_FILE_CONTENT_UNSUPPORTED",
      "Isi file tidak dikenali sebagai JPG, PNG, WebP, atau PDF yang valid.",
    );
  }
  if (!policy.allowedMimeTypes.includes(detectedMime)) {
    throw new FilePreparationError(
      "CLIENT_MIME_NOT_ALLOWED",
      `Isi file tidak sesuai format yang diizinkan untuk ${policy.label.toLowerCase()}.`,
    );
  }

  const normalizedSource = new File([source], filenameForMime(source.name, detectedMime), {
    type: detectedMime,
    lastModified: source.lastModified,
  });
  const shouldCompress =
    (options.compress ?? policy.compressImages) && detectedMime.startsWith("image/");

  if (shouldCompress && source.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new FilePreparationError(
      "CLIENT_SOURCE_IMAGE_TOO_LARGE",
      "Foto terlalu besar untuk diproses. Gunakan foto berukuran maksimal 25 MB.",
    );
  }

  let prepared = normalizedSource;
  if (shouldCompress) {
    let compressed: Blob;
    try {
      compressed = await (options.compressor ?? compressImage)(normalizedSource);
    } catch {
      throw new FilePreparationError(
        "CLIENT_IMAGE_DECODE_FAILED",
        "Foto tidak dapat dibaca. Ekspor ulang sebagai JPG atau PNG, lalu coba lagi.",
      );
    }
    const compressedMime = await detectFileContentType(compressed);
    if (!compressedMime || !policy.allowedMimeTypes.includes(compressedMime)) {
      throw new FilePreparationError(
        "CLIENT_IMAGE_DECODE_FAILED",
        "Hasil kompresi foto tidak valid. Ekspor ulang sebagai JPG atau PNG, lalu coba lagi.",
      );
    }
    prepared = new File([compressed], filenameForMime(source.name, compressedMime), {
      type: compressedMime,
      lastModified: source.lastModified,
    });
  }

  const validation = validateFileForPurpose(prepared, purpose);
  if (!validation.valid) {
    throw new FilePreparationError(
      validation.code === "CLIENT_FILE_TOO_LARGE" && shouldCompress
        ? "CLIENT_FILE_TOO_LARGE_AFTER_COMPRESSION"
        : validation.code,
      validation.code === "CLIENT_FILE_TOO_LARGE" && shouldCompress
        ? "Foto masih terlalu besar setelah dikompresi. Kurangi resolusi foto lalu coba lagi."
        : validation.message,
    );
  }

  return {
    file: prepared,
    originalSizeBytes: source.size,
    wasCompressed: prepared.size < source.size || prepared.type !== detectedMime,
    savedBytes: Math.max(0, source.size - prepared.size),
  };
}

// ---------------------------------------------------------------------------
// Client-side image compression (native <canvas> — no external dependency)
// ---------------------------------------------------------------------------

export async function compressImage(file: File): Promise<Blob> {
  const { maxWidthPx, jpegQuality, outputFormat } = IMAGE_COMPRESSION;

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Only downscale, never upscale.
      if (width > maxWidthPx) {
        height = Math.round((height * maxWidthPx) / width);
        width = maxWidthPx;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          // Only use compressed version if it is actually smaller.
          resolve(blob.size < file.size ? blob : file);
        },
        outputFormat,
        jpegQuality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Gagal memuat gambar untuk kompresi"));
    };

    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Authorized blob fetch for file preview / download
// ---------------------------------------------------------------------------

/**
 * Fetches file content from backend via authorized request and returns an
 * object URL suitable for <img src> or window.open(). The caller MUST revoke
 * the returned URL via URL.revokeObjectURL() when the component unmounts.
 *
 * Uses getAccessToken() from lib/api.ts — same proxyTokenProvider used by
 * the ApiClient singleton. No second auth source (ADR-FE-003).
 */
export async function fetchFileBlob(fileId: string): Promise<string> {
  const token = getAccessToken();
  const baseUrl = env.VITE_API_BASE_URL;
  const url = `${baseUrl}/files/${fileId}/content`;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil file: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// WhatsApp admin fallback
// ---------------------------------------------------------------------------

/**
 * Builds a wa.me deep link with a pre-filled Indonesian message for cases
 * when upload fails, file is too large, or service is unavailable.
 */
export function buildWhatsAppFallbackUrl(adminPhone: string, context: string): string {
  const message = encodeURIComponent(
    `Halo Admin, saya ingin mengirim ${context} tapi tidak dapat mengupload melalui aplikasi. Mohon bantuan.`,
  );
  return `https://wa.me/${adminPhone}?text=${message}`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Formats bytes into a human-readable size string (e.g., "1.5 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns true if the MIME type represents an image. */
export function isImageMime(mimeType: string): boolean {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

/** Returns true if the MIME type represents a PDF. */
export function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}
