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

export function validateFileForPurpose(file: File, purpose: FilePurpose): FileValidationResult {
  const policy = FILE_PURPOSE_POLICIES[purpose];

  // 1. MIME type check
  if (!policy.allowedMimeTypes.includes(file.type as SupportedMimeType)) {
    const allowed = policy.allowedMimeTypes
      .map((m) => (m === "image/jpeg" ? "JPEG" : m === "image/png" ? "PNG" : "PDF"))
      .join(", ");
    return {
      valid: false,
      code: "CLIENT_MIME_NOT_ALLOWED",
      message: `Format file tidak didukung. Gunakan ${allowed}.`,
    };
  }

  // 2. Size check (purpose-specific)
  const maxBytes = policy.maxBytesByMimeType[file.type as SupportedMimeType] ?? 0;
  if (maxBytes > 0 && file.size > maxBytes) {
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      code: "CLIENT_FILE_TOO_LARGE",
      message: `File terlalu besar. Maksimum ${maxMB} MB untuk ${policy.label.toLowerCase()}.`,
    };
  }

  // 3. Dangerous extension check
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (DANGEROUS_FILE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      code: "CLIENT_EXTENSION_DANGEROUS",
      message: "Jenis file ini tidak diizinkan.",
    };
  }

  return { valid: true };
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
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

/** Returns true if the MIME type represents a PDF. */
export function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}
