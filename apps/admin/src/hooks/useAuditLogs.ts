// Audit viewer hook (M11G).
//
// Backend has no /audit endpoint surface in Phase 1: `app.module.ts` does not
// register any audit controller and api/planning lists /audit/* as Phase 1
// scope that has not shipped. To stay aligned with the milestone rule "do not
// create new endpoints" the hook exposes a stable contract that resolves to
// `available: false` so the UI can render a clean placeholder.
//
// When the backend ships /audit/logs, swap the body for an apiClient.get call
// and start returning `available: true` plus a typed AuditLogEntry[].
// The component contract here is intentionally narrow so that swap is a
// one-file change.

import type { ApiError } from "@granada-kost/api-client";

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  occurredAt: string;
  correlationId?: string | null;
};

export type UseAuditLogsResult = {
  available: boolean;
  data: AuditLogEntry[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  // Human-readable reason rendered by the placeholder when `available` is false.
  reason: string;
};

export function useAuditLogs(): UseAuditLogsResult {
  return {
    available: false,
    data: [],
    isLoading: false,
    error: null,
    refetch: () => undefined,
    reason:
      "Audit Viewer akan tersedia setelah backend membuka endpoint audit.",
  };
}
