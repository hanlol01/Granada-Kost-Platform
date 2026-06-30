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
          // Do not retry auth/permission errors.
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

// Centralized query key conventions: [domain, resource, scope?, filters?].
export const qk = {
  auth: {
    me: () => ["auth", "me"] as const,
    sessions: () => ["auth", "sessions"] as const,
  },
  rooms: {
    list: (propertyId?: string, filters?: Record<string, unknown>) =>
      ["rooms", "list", { propertyId }, { ...filters }] as const,
    detail: (id: string) => ["rooms", "detail", id] as const,
  },
  residents: {
    list: (propertyId?: string, filters?: Record<string, unknown>) =>
      ["residents", "list", { propertyId }, { ...filters }] as const,
    detail: (id: string) => ["residents", "detail", id] as const,
  },
  billing: {
    invoices: (propertyId?: string, filters?: Record<string, unknown>) =>
      ["billing", "invoices", { propertyId }, { ...filters }] as const,
    paymentProofs: (propertyId?: string) =>
      ["billing", "payment-proofs", { propertyId }] as const,
  },
  complaints: {
    list: (propertyId?: string, filters?: Record<string, unknown>) =>
      ["complaints", "list", { propertyId }, { ...filters }] as const,
  },
  notifications: {
    list: () => ["notifications", "list"] as const,
  },
} as const;
