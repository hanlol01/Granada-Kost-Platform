import { ApiError } from "@granada-kost/api-client";

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
  UNAUTHENTICATED: {
    title: "Sesi masuk telah berakhir",
    description: "Silakan masuk kembali untuk melanjutkan pekerjaan Anda.",
  },
  LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE: {
    title: "Aktivasi kamar belum dapat dilakukan",
    description:
      "Tanggal tagihan pertama masih setelah tanggal aktivasi. Periksa kembali tanggal mulai sewa dan jadwal tagihan sebelum mengaktifkan kamar.",
  },
  BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS: {
    title: "Minat booking sudah diselesaikan",
    description:
      "Komitmen pembayaran calon penghuni ini sudah tercatat. Buka data Minat Booking lalu pilih Lengkapi Data Penyewaan.",
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

/**
 * Returns only reviewed Indonesian operator copy. Raw API text and correlation
 * identifiers remain in devtools/server logs, never in customer-facing alerts.
 */
export function adminErrorNotice(error: unknown, fallback?: string): AdminErrorNotice {
  const normalized = normalizeAdminError(error);
  const specific = CODE_NOTICES[normalized.code];

  return {
    title:
      specific?.title ??
      (normalized.kind === "server"
        ? (fallback ?? KIND_TITLES.server)
        : KIND_TITLES[normalized.kind]),
    description: specific?.description ?? normalized.message,
    code: normalized.code,
    kind: normalized.kind,
  };
}
