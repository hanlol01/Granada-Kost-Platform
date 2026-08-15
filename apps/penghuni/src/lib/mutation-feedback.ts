// Shared toast helpers for mutation outcomes on Penghuni. Mirrors the Admin
// helper so error taxonomy (ADR-FE-008) and correlationId surfacing
// (ADR-FE-011) stay consistent across apps. No PII is emitted to console.

import { toast } from "sonner";
import { ApiError } from "@granada-kost/api-client";

const FILE_ERROR_NOTICES: Readonly<Record<string, { title: string; description: string }>> = {
  FILE_EXTENSION_MISMATCH: {
    title: "Format file tidak sesuai",
    description: "Simpan atau ekspor ulang file sebagai JPG, PNG, atau PDF lalu pilih kembali.",
  },
  FILE_MIME_MISMATCH: {
    title: "Format file tidak sesuai",
    description: "Isi file berbeda dari format perangkat. Simpan ulang sebagai JPG atau PNG.",
  },
  FILE_TOO_LARGE: {
    title: "Ukuran file terlalu besar",
    description: "Kurangi resolusi foto atau gunakan PDF maksimal 5 MB.",
  },
  FILE_TOO_LARGE_FOR_PURPOSE: {
    title: "Ukuran file terlalu besar",
    description: "Ukuran hasil file melewati batas unggahan. Pilih file yang lebih kecil.",
  },
  CLIENT_FILE_TOO_LARGE_AFTER_COMPRESSION: {
    title: "Foto masih terlalu besar",
    description: "Kompresi otomatis belum cukup. Kurangi resolusi foto lalu pilih kembali.",
  },
  CLIENT_SOURCE_IMAGE_TOO_LARGE: {
    title: "Foto terlalu besar untuk diproses",
    description: "Gunakan foto sumber maksimal 25 MB.",
  },
  CLIENT_IMAGE_DECODE_FAILED: {
    title: "Foto tidak dapat dibaca",
    description: "Ekspor ulang foto sebagai JPG atau PNG standar.",
  },
  CLIENT_FILE_CONTENT_UNSUPPORTED: {
    title: "Isi file tidak didukung",
    description: "Pilih file JPG, PNG, WebP, atau PDF asli.",
  },
};

export function fileUploadErrorMessage(err: unknown, fallback: string): string {
  if (!ApiError.isApiError(err)) return fallback;
  const notice = FILE_ERROR_NOTICES[err.code];
  if (notice) return `${notice.title}. ${notice.description}`;
  if (err.status === 0) {
    return "File belum dapat diproses. Periksa file dan koneksi, lalu coba kembali.";
  }
  return err.correlationId ? `${fallback}. Referensi bantuan: ${err.correlationId}` : fallback;
}

export function toastMutationSuccess(message: string): void {
  toast.success(message);
}

export function toastMutationError(
  err: unknown,
  fallback: string,
): { status: number | null; code: string | null; correlationId: string | null } {
  if (ApiError.isApiError(err)) {
    const fileNotice = FILE_ERROR_NOTICES[err.code];
    if (fileNotice) {
      toast.error(fileNotice.title, { description: fileNotice.description });
      return { status: err.status, code: err.code, correlationId: err.correlationId ?? null };
    }
    const desc = err.correlationId ? `${err.message} (ref: ${err.correlationId})` : err.message;
    if (err.status === 403) {
      toast.error("Tidak diizinkan oleh server", { description: desc });
    } else if (err.status === 429) {
      toast.error("Terlalu banyak permintaan", { description: desc });
    } else if (err.status === 409) {
      toast.error("Terjadi konflik data", { description: desc });
    } else if (err.status === 422) {
      toast.error("Validasi gagal", { description: desc });
    } else if (err.status === 502 || err.status === 503) {
      toast.error("Layanan tidak tersedia", { description: desc });
    } else if (err.status === 0) {
      toast.error("Jaringan terputus", { description: desc });
    } else {
      toast.error(fallback, { description: desc });
    }
    return { status: err.status, code: err.code, correlationId: err.correlationId ?? null };
  }
  toast.error(fallback);
  return { status: null, code: null, correlationId: null };
}
