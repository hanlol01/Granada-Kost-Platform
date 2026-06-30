// Shared toast helpers for mutation outcomes. Centralizing the format keeps
// every domain hook consistent with ADR-FE-008 (UI taxonomy) and ADR-FE-011
// (correlationId surfaced for audit handoff). Never log PII; only the API
// error code, status, and correlation id are emitted to console.

import { toast } from "sonner";
import { ApiError } from "@granada-kost/api-client";

export function toastMutationSuccess(message: string): void {
  toast.success(message);
}

export function toastMutationError(
  err: unknown,
  fallback: string,
): { status: number | null; code: string | null; correlationId: string | null } {
  if (ApiError.isApiError(err)) {
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
