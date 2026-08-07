// Shared toast helpers for mutation outcomes. Centralizing the format keeps
// every domain hook consistent with ADR-FE-008 (UI taxonomy) and ADR-FE-011
// (correlationId surfaced for audit handoff). Never log PII; only the API
// error code, status, and correlation id are emitted to console.

import { toast } from "sonner";
import { ApiError } from "@granada-kost/api-client";
import { adminErrorNotice } from "./error-normalizer";

export function toastMutationSuccess(message: string): void {
  toast.success(message);
}

export function toastMutationError(
  err: unknown,
  fallback: string,
): { status: number | null; code: string | null; correlationId: string | null } {
  const notice = adminErrorNotice(err, fallback);

  if (ApiError.isApiError(err)) {
    toast.error(notice.title, { description: notice.description });
    return { status: err.status, code: err.code, correlationId: err.correlationId ?? null };
  }
  toast.error(notice.title, { description: notice.description });
  return { status: null, code: null, correlationId: null };
}
