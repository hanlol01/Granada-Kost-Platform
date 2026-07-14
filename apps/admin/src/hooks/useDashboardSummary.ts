import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  canReadDashboard,
  isDashboardEnabledForProperty,
  parseDashboardSummary,
  type DashboardSummary,
} from "@/lib/admin-ux-dashboard";
import { useProperty } from "@/lib/property";

export const dashboardSummaryQueryKey = (propertyId: string) =>
  ["dashboard", "summary", propertyId] as const;

export function useDashboardSummary() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyId = currentPropertyId ?? "";
  const hasAccess = canReadDashboard({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  });
  const rolloutEnabled = isDashboardEnabledForProperty(user?.propertyRollouts, currentPropertyId);
  const enabled = Boolean(currentPropertyId) && hasAccess && rolloutEnabled;
  const queryKey = useMemo(() => dashboardSummaryQueryKey(propertyId), [propertyId]);

  const query = useQuery<DashboardSummary>({
    queryKey,
    queryFn: async ({ signal }) =>
      parseDashboardSummary(
        await apiClient.get<unknown>("/dashboard/summary", {
          query: { property_id: propertyId },
          signal,
        }),
      ),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const forbidden =
    query.error !== null &&
    typeof query.error === "object" &&
    "status" in query.error &&
    query.error.status === 403;

  useEffect(() => {
    if (enabled && !forbidden) return;
    void queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.removeQueries({ queryKey, exact: true });
  }, [enabled, forbidden, queryClient, queryKey]);

  return {
    summary: enabled && !query.error ? (query.data ?? null) : null,
    isLoading: enabled && query.isLoading,
    error: enabled ? query.error : null,
    refetch: query.refetch,
    hasAccess,
    rolloutEnabled,
  } as const;
}
