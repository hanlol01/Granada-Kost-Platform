import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { selectRevenueSummary, type RevenueSummary } from "@/lib/reports-selectors";
import type { PaymentRecord } from "@/hooks/useBilling";
import { useProperty } from "@/lib/property";

function getJakartaYear(): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date()),
  );
}

export const dashboardRevenueQueryKey = (propertyId: string, year: number) =>
  ["dashboard", "revenue", propertyId, year] as const;

const REVENUE_PAGE_SIZE = 100;

async function fetchAllPayments(
  propertyId: string,
  signal?: AbortSignal,
): Promise<PaymentRecord[]> {
  const payments: PaymentRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await apiClient.get<PaymentRecord[]>("/payments", {
      query: { property_id: propertyId, limit: REVENUE_PAGE_SIZE, offset },
      signal,
    });

    payments.push(...page);
    if (page.length < REVENUE_PAGE_SIZE) return payments;
    offset += page.length;
  }
}

/**
 * Reads the existing payment authority for the dashboard chart.
 * Only verified payments are included in the revenue selector; pending and
 * void records remain available for the status summary and are never counted
 * as income.
 */
export function useDashboardRevenue(enabled: boolean) {
  const { currentPropertyId } = useProperty();
  const propertyId = currentPropertyId ?? "";
  const year = useMemo(getJakartaYear, []);
  const queryKey = useMemo(() => dashboardRevenueQueryKey(propertyId, year), [propertyId, year]);
  const query = useQuery<PaymentRecord[]>({
    queryKey,
    queryFn: ({ signal }) => fetchAllPayments(propertyId, signal),
    enabled: Boolean(propertyId) && enabled,
    staleTime: 60_000,
    retry: false,
  });

  const revenue = useMemo<RevenueSummary>(
    () => selectRevenueSummary(query.data ?? [], year),
    [query.data, year],
  );

  return {
    revenue: enabled && !query.error ? revenue : null,
    year,
    isLoading: enabled && query.isLoading,
    error: enabled ? query.error : null,
    refetch: query.refetch,
  } as const;
}
