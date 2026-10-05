import { ApiError } from "@granada-kost/api-client";
import { LeaseRevisionContractError } from "./lease-revision-contract.ts";
import { LEASE_REVISION_ERROR_NOTICES } from "./lease-revision-notices.ts";

export type NormalizedAdminError = {
  status: number;
  code: string;
  kind:
    | "unauthenticated"
    | "forbidden"
    | "not-found"
    | "conflict"
    | "validation"
    | "network"
    | "server";
  message: string;
};

export type AdminErrorNotice = {
  title: string;
  description: string;
  code: string;
  kind: NormalizedAdminError["kind"];
};

const SAFE_MESSAGES: Readonly<Record<NormalizedAdminError["kind"], string>> = {
  unauthenticated: "Sesi Anda telah berakhir. Silakan masuk kembali.",
  forbidden: "Anda tidak memiliki izin untuk melakukan tindakan ini.",
  "not-found": "Data yang diminta tidak ditemukan atau tidak dapat diakses.",
  conflict: "Data berubah saat diproses. Segarkan halaman lalu tinjau kembali.",
  validation: "Data belum valid. Periksa kembali isian yang ditandai.",
  network: "Koneksi ke server bermasalah. Coba lagi dalam beberapa saat.",
  server: "Terjadi gangguan pada server. Coba lagi nanti.",
};

/**
 * Copy shown to an operator. This is intentionally separate from API messages:
 * API messages can be technical, English, or include implementation details.
 */
const CODE_NOTICES: Readonly<Record<string, Pick<AdminErrorNotice, "title" | "description">>> = {
  ...LEASE_REVISION_ERROR_NOTICES,
  CONTRACT_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE: {
    title: "Nominal melebihi sisa sewa",
    description:
      "Nominal pembayaran lebih besar dari sisa sewa terbaru. Tutup form, perbarui data penghuni, lalu catat kembali dengan nominal yang ditampilkan. Periksa juga apakah ada pembayaran lain yang baru tercatat.",
  },
  CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED: {
    title: "Pelunasan penuh diperlukan",
    description:
      "Batas pembayaran sebagian telah berakhir atau penyelesaian kontrak sedang berlangsung. Pilih Lunasi Sekarang untuk membayar seluruh sisa sewa terbaru.",
  },
  UNAUTHENTICATED: {
    title: "Sesi masuk telah berakhir",
    description: "Silakan masuk kembali untuk melanjutkan pekerjaan Anda.",
  },
  LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE: {
    title: "Aktivasi kamar belum dapat dilakukan",
    description:
      "Tanggal tagihan pertama masih setelah tanggal aktivasi. Periksa kembali tanggal mulai sewa dan jadwal tagihan sebelum mengaktifkan kamar.",
  },
  LEASE_ACTIVATION_NOT_YET_AVAILABLE: {
    title: "Aktivasi kamar belum tersedia",
    description:
      "Kamar hanya dapat diaktifkan pada atau setelah tanggal mulai sewa. Tunggu sampai jadwal check-in tiba.",
  },
  LEASE_SERVICE_PERIOD_REASON_REQUIRED: {
    title: "Alasan pencatatan check-in diperlukan",
    description:
      "Tanggal check-in berbeda dari tanggal rencana atau dicatat mundur. Isi alasan pencatatan pada form untuk melanjutkan. Untuk check-in sesuai jadwal, alasan tidak wajib; jika pesan ini muncul padahal tanggalnya sesuai, minta Pihak Pengelola memperbarui layanan lalu coba lagi.",
  },
  BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS: {
    title: "Minat booking sudah diselesaikan",
    description:
      "Komitmen pembayaran calon penghuni ini sudah tercatat. Buka data Minat Booking lalu pilih Lengkapi Data Penyewaan.",
  },
  PROPERTY_OWNER_ASSIGNMENTS_STILL_ACTIVE: {
    title: "Owner masih memiliki aset",
    description:
      "Lepaskan seluruh kepemilikan Rumah Kost dan Apart Kost sebelum mengarsipkan owner ini.",
  },
  PROPERTY_OWNER_PERMANENT_DELETE_BLOCKED: {
    title: "Owner tidak dapat dihapus permanen",
    description:
      "Akun yang pernah memiliki aset atau aktivitas keuangan harus dipertahankan sebagai arsip.",
  },
  OWNER_SPONSORED_ACTIVE_ASSIGNMENT_RELEASE_BLOCKED: {
    title: "Aset masih dipakai hunian tanggungan Owner",
    description:
      "Aset tidak dapat dilepas selama masih dipakai hunian tanggungan Owner yang aktif. Selesaikan atau akhiri hunian tersebut terlebih dahulu.",
  },
  FILE_EXTENSION_MISMATCH: {
    title: "Format file tidak sesuai",
    description:
      "Nama file tidak cocok dengan isi sebenarnya. Simpan atau ekspor ulang sebagai JPG, PNG, atau PDF lalu pilih kembali.",
  },
  FILE_MIME_MISMATCH: {
    title: "Format file tidak sesuai",
    description:
      "Isi file berbeda dari format yang dilaporkan perangkat. Simpan ulang gambar sebagai JPG atau PNG lalu coba lagi.",
  },
  FILE_TOO_LARGE: {
    title: "Ukuran file terlalu besar",
    description:
      "Foto akan dikompresi otomatis. Jika tetap gagal, kurangi resolusi gambar; untuk PDF gunakan file maksimal 5 MB.",
  },
  FILE_TOO_LARGE_FOR_PURPOSE: {
    title: "Ukuran file terlalu besar",
    description:
      "Ukuran hasil file melewati batas untuk dokumen ini. Kurangi resolusi atau pilih file lain.",
  },
  CLIENT_FILE_TOO_LARGE_AFTER_COMPRESSION: {
    title: "Foto masih terlalu besar",
    description: "Kompresi otomatis belum cukup. Kurangi resolusi foto lalu pilih kembali.",
  },
  CLIENT_SOURCE_IMAGE_TOO_LARGE: {
    title: "Foto terlalu besar untuk diproses",
    description:
      "Gunakan foto sumber maksimal 25 MB agar perangkat dapat mengompresnya dengan aman.",
  },
  CLIENT_IMAGE_DECODE_FAILED: {
    title: "Foto tidak dapat dibaca",
    description: "Ekspor ulang foto sebagai JPG atau PNG standar, lalu pilih kembali.",
  },
  CLIENT_FILE_CONTENT_UNSUPPORTED: {
    title: "Isi file tidak didukung",
    description: "Pilih file JPG, PNG, WebP, atau PDF asli—bukan file yang hanya diganti namanya.",
  },
};

const KIND_TITLES: Readonly<Record<NormalizedAdminError["kind"], string>> = {
  unauthenticated: "Sesi masuk telah berakhir",
  forbidden: "Akses ditolak",
  "not-found": "Data tidak ditemukan",
  conflict: "Tindakan belum dapat diselesaikan",
  validation: "Periksa data yang diisi",
  network: "Koneksi bermasalah",
  server: "Tindakan belum dapat diproses",
};

function kindForStatus(status: number): NormalizedAdminError["kind"] {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 0) return "network";
  return "server";
}

/**
 * Error UI only receives an allowlisted status/code/message. Never surface raw
 * server payloads, URL paths, identifiers, or potentially sensitive input.
 */
export function normalizeAdminError(error: unknown): NormalizedAdminError {
  if (error instanceof LeaseRevisionContractError) {
    return { status: 409, code: error.code, kind: "conflict", message: SAFE_MESSAGES.conflict };
  }
  if (ApiError.isApiError(error)) {
    const kind = kindForStatus(error.status);
    return {
      status: error.status,
      code: error.code,
      kind,
      message: SAFE_MESSAGES[kind],
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    kind: "server",
    message: SAFE_MESSAGES.server,
  };
}

export function safeErrorMessage(error: unknown): string {
  return normalizeAdminError(error).message;
}

/** Only a validated, shortened request reference may reach an unexpected-error notice. */
export function adminSupportReference(error: unknown): string {
  if (
    !ApiError.isApiError(error) ||
    (error.status !== 0 && error.status < 500) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(error.correlationId ?? "")
  )
    return "";
  return ` Kode bantuan: ${error.correlationId!.slice(0, 8).toUpperCase()}.`;
}

/** Reviewed Indonesian copy, never raw payloads. Preserve the original failure when wrapping an uncertain command. */
export function adminErrorNotice(
  error: unknown,
  fallback?: string,
  incidentError: unknown = error,
): AdminErrorNotice {
  const normalized = normalizeAdminError(error);
  const specific = CODE_NOTICES[normalized.code];

  return {
    title:
      specific?.title ??
      (normalized.kind === "server"
        ? (fallback ?? KIND_TITLES.server)
        : KIND_TITLES[normalized.kind]),
    description: `${specific?.description ?? normalized.message}${adminSupportReference(incidentError)}`,
    code: normalized.code,
    kind: normalized.kind,
  };
}
