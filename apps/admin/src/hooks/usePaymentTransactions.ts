// Payment gateway (online) transaction hooks for the Admin console (M15C-E2A).
//
// Backend (M15C-C/M15C-D, payment-gateway module):
//   GET /admin/payment-transactions
//   GET /admin/payment-transactions/:id
//
// Responses are provider-neutral and sanitized by the backend: no raw
// provider payload, no signatures, no server/client keys. RBAC and property
// scope are enforced server-side (property owner receives 403).
//
// The record shape below is intentionally defensive (optional/nullable
// fields) because M15C-E2B validation confirms the exact backend response.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export type PaymentTransactionStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "denied"
  | "challenge"
  | "requires_review"
  | "unknown";

export type PaymentTransactionRecord = {
  id: string;
  invoiceId?: string | null;
  propertyId?: string | null;
  residentId?: string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  providerTransactionId?: string | null;
  amount?: number | null;
  currency?: string | null;
  status: PaymentTransactionStatus | string;
  paymentMethod?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Optional denormalized display fields, if the backend provides them.
  invoiceCode?: string | null;
  residentName?: string | null;
};

// The list endpoint may return a plain array or a wrapped { items, total }
// shape; normalize both so the UI does not depend on the wrapper.
function normalizeTransactionList(data: unknown): PaymentTransactionRecord[] {
  if (Array.isArray(data)) return data as PaymentTransactionRecord[];
  if (data && typeof data === "object") {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as PaymentTransactionRecord[];
    const rows = (data as { data?: unknown }).data;
    if (Array.isArray(rows)) return rows as PaymentTransactionRecord[];
  }
  return [];
}

export function usePaymentTransactions(
  filters: { limit?: number; offset?: number } = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<PaymentTransactionRecord[]> {
  return useQuery<PaymentTransactionRecord[]>({
    queryKey: ["payment-gateway", "transactions", filters] as const,
    queryFn: async () =>
      normalizeTransactionList(
        await apiClient.get<unknown>("/admin/payment-transactions", {
          query: { limit: filters.limit ?? 100, offset: filters.offset },
        }),
      ),
    enabled: options.enabled ?? true,
  });
}

export function usePaymentTransactionDetail(
  transactionId: string | null,
): UseQueryResult<PaymentTransactionRecord> {
  return useQuery<PaymentTransactionRecord>({
    queryKey: ["payment-gateway", "transaction", transactionId] as const,
    queryFn: () =>
      apiClient.get<PaymentTransactionRecord>(`/admin/payment-transactions/${transactionId}`),
    enabled: Boolean(transactionId),
  });
}
