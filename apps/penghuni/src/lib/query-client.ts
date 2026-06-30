// TanStack Query defaults per ADR-FE-002.
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (ApiError.isApiError(error)) {
            if (error.status === 401 || error.status === 403 || error.status === 404) return false;
            if (error.status === 422 || error.status === 409) return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Query keys for the Penghuni app. Self-scoped; no propertyId segment (ADR-FE-005).
export const qk = {
  auth: {
    me: () => ["auth", "me"] as const,
    sessions: () => ["auth", "sessions"] as const,
  },
  penghuni: {
    me: () => ["penghuni", "me"] as const,
    room: () => ["penghuni", "room"] as const,
    billingCurrent: () => ["penghuni", "billing", "current"] as const,
    billingHistory: (filters?: Record<string, unknown>) =>
      ["penghuni", "billing", "history", { ...filters }] as const,
    complaints: (filters?: Record<string, unknown>) =>
      ["penghuni", "complaints", { ...filters }] as const,
    notifications: () => ["penghuni", "notifications"] as const,
  },
  info: {
    announcements: () => ["info", "announcements"] as const,
    rules: () => ["info", "rules"] as const,
    faqs: () => ["info", "faqs"] as const,
  },
} as const;
