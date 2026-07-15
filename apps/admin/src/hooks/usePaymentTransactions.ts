// M7-B2 payment gateway Admin read-only hooks.
// Only the two endpoints frozen by M7-B0/B1 are allowed here.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  adminUxQueryKeys,
  normalizePagination,
  type QueryFilters,
} from "@/lib/admin-ux-query-keys";
import {
  canReadAdminPaymentTransactions,
  parseAdminPaymentTransactionDetail,
  parseAdminPaymentTransactionList,
  type AdminPaymentTransaction,
  type AdminPaymentTransactionPage,
  type AdminPaymentTransactionStatus,
} from "@/lib/admin-ux-payment-gateway";
import { useProperty } from "@/lib/property";

export type PaymentTransactionRecord = AdminPaymentTransaction;
export type PaymentTransactionFilters = {
  status?: AdminPaymentTransactionStatus;
  limit?: number;
  offset?: number;
};

function retry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown }).status;
  return status !== 403 && status !== 404 && failureCount < 1;
}

export function usePaymentTransactions(
  filters: PaymentTransactionFilters = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<AdminPaymentTransactionPage> {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const pagination = normalizePagination(filters);
  const hasAccess = canReadAdminPaymentTransactions({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  });
  const propertyId = currentPropertyId ?? "";
  const keyFilters: QueryFilters = {
    status: filters.status ?? null,
    limit: Number(pagination.limit),
    offset: Number(pagination.offset),
  };

  return useQuery<AdminPaymentTransactionPage>({
    queryKey: adminUxQueryKeys.payments.list(propertyId, keyFilters),
    queryFn: async () =>
      parseAdminPaymentTransactionList(
        await apiClient.get<unknown>("/admin/payment-transactions", {
          query: {
            property_id: propertyId,
            ...(filters.status ? { status: filters.status } : {}),
            limit: Number(pagination.limit),
            offset: Number(pagination.offset),
          },
        }),
      ),
    enabled: Boolean(currentPropertyId) && hasAccess && (options.enabled ?? true),
    retry,
  });
}

export function usePaymentTransactionDetail(
  transactionId: string | null,
  options: { enabled?: boolean } = {},
): UseQueryResult<PaymentTransactionRecord> {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadAdminPaymentTransactions({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  });
  const propertyId = currentPropertyId ?? "";
  const id = transactionId ?? "";

  return useQuery<PaymentTransactionRecord>({
    queryKey: adminUxQueryKeys.payments.detail(propertyId, id),
    queryFn: async () =>
      parseAdminPaymentTransactionDetail(
        await apiClient.get<unknown>(`/admin/payment-transactions/${id}`),
      ),
    enabled:
      Boolean(currentPropertyId) &&
      Boolean(transactionId) &&
      hasAccess &&
      (options.enabled ?? true),
    retry,
  });
}
