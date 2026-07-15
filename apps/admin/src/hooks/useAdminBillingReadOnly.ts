import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/useAuth";
import {
  canReadAdminBilling,
  getAdminInvoices,
  getAdminPayments,
  type AdminInvoiceStatus,
  type AdminPaymentStatus,
} from "@/lib/admin-ux-billing-read-only";
import { normalizePagination } from "@/lib/admin-ux-query-keys";
import { useProperty } from "@/lib/property/useProperty";

type Filters<TStatus> = { status?: TStatus; limit?: number; offset?: number };

function retry(failureCount: number, error: unknown): boolean {
  return (error as { status?: unknown }).status !== 403 && failureCount < 1;
}

export function useAdminInvoices(filters: Filters<AdminInvoiceStatus>, enabled = true) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadAdminBilling({ roles: user?.roles, permissions: user?.permissions });
  const normalized = normalizePagination(filters);
  const result = useQuery({
    queryKey: ["adminBillingInvoices", currentPropertyId ?? "no-property", normalized] as const,
    queryFn: ({ signal }) =>
      getAdminInvoices(
        {
          propertyId: currentPropertyId as string,
          status: filters.status,
          limit: normalized.limit as number,
          offset: normalized.offset as number,
        },
        signal,
      ),
    enabled: enabled && Boolean(currentPropertyId) && hasAccess,
    retry,
  });
  return { ...result, hasAccess };
}

export function useAdminPayments(filters: Filters<AdminPaymentStatus>, enabled = true) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadAdminBilling({ roles: user?.roles, permissions: user?.permissions });
  const normalized = normalizePagination(filters);
  const result = useQuery({
    queryKey: ["adminBillingPayments", currentPropertyId ?? "no-property", normalized] as const,
    queryFn: ({ signal }) =>
      getAdminPayments(
        {
          propertyId: currentPropertyId as string,
          status: filters.status,
          limit: normalized.limit as number,
          offset: normalized.offset as number,
        },
        signal,
      ),
    enabled: enabled && Boolean(currentPropertyId) && hasAccess,
    retry,
  });
  return { ...result, hasAccess };
}
