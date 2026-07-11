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

const SAFE_MESSAGES: Readonly<Record<NormalizedAdminError["kind"], string>> = {
  unauthenticated: "Sesi Anda telah berakhir. Silakan masuk kembali.",
  forbidden: "Anda tidak memiliki izin untuk melakukan tindakan ini.",
  "not-found": "Data yang diminta tidak ditemukan atau tidak dapat diakses.",
  conflict: "Data berubah saat diproses. Segarkan halaman lalu tinjau kembali.",
  validation: "Data belum valid. Periksa kembali isian yang ditandai.",
  network: "Koneksi ke server bermasalah. Coba lagi dalam beberapa saat.",
  server: "Terjadi gangguan pada server. Coba lagi nanti.",
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
