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
  parseAdminPaymentTransaction,
  parseAdminPaymentTransactionList,
  type AdminPaymentTransaction,
} from "@/lib/admin-ux-payment-gateway";
import { useProperty } from "@/lib/property";

export type PaymentTransactionRecord = AdminPaymentTransaction;

export function usePaymentTransactions(
  filters: QueryFilters = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<PaymentTransactionRecord[]> {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const pagination = normalizePagination(filters);
  const hasAccess = canReadAdminPaymentTransactions({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  });
  const propertyId = currentPropertyId ?? "";

  return useQuery<PaymentTransactionRecord[]>({
    queryKey: adminUxQueryKeys.payments.list(propertyId, filters),
    queryFn: async () =>
      parseAdminPaymentTransactionList(
        await apiClient.get<unknown>("/admin/payment-transactions", {
          query: {
            property_id: propertyId,
            limit: Number(pagination.limit),
            offset: Number(pagination.offset),
          },
        }),
      ),
    enabled: Boolean(currentPropertyId) && hasAccess && (options.enabled ?? true),
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
      parseAdminPaymentTransaction(
        await apiClient.get<unknown>(`/admin/payment-transactions/${id}`),
      ),
    enabled:
      Boolean(currentPropertyId) &&
      Boolean(transactionId) &&
      hasAccess &&
      (options.enabled ?? true),
  });
}
