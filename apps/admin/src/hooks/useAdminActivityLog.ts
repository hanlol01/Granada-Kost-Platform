import { useQuery } from "@tanstack/react-query";
import {
  canReadActivityLog,
  getActivityActors,
  getActivityLog,
  getActivityLogDetail,
  type ActivityLogFilters,
} from "@/lib/admin-activity-log";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { useAuth } from "@/lib/auth/useAuth";
import { useProperty } from "@/lib/property/useProperty";

export function useAdminActivityLog(filters: Omit<ActivityLogFilters, "propertyId">) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadActivityLog({ roles: user?.roles, permissions: user?.permissions });
  const query = useQuery({
    queryKey: adminUxQueryKeys.activityLogs.list(currentPropertyId ?? "no-property", filters),
    queryFn: ({ signal }) =>
      getActivityLog({ propertyId: currentPropertyId as string, ...filters }, signal),
    enabled: Boolean(currentPropertyId) && hasAccess,
    retry: (failureCount, error) =>
      (error as { status?: number }).status !== 403 && failureCount < 1,
  });
  return { ...query, hasAccess };
}

export function useAdminActivityLogDetail(activityId: string | null) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadActivityLog({ roles: user?.roles, permissions: user?.permissions });
  return useQuery({
    queryKey: adminUxQueryKeys.activityLogs.detail(
      currentPropertyId ?? "no-property",
      activityId ?? "none",
    ),
    queryFn: ({ signal }) =>
      getActivityLogDetail(currentPropertyId as string, activityId as string, signal),
    enabled: Boolean(currentPropertyId && activityId) && hasAccess,
  });
}

export function useAdminActivityActors(range: { from?: string; to?: string }) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasAccess = canReadActivityLog({ roles: user?.roles, permissions: user?.permissions });
  return useQuery({
    queryKey: adminUxQueryKeys.activityLogs.actors(currentPropertyId ?? "no-property", range),
    queryFn: ({ signal }) => getActivityActors(currentPropertyId as string, range, signal),
    enabled: Boolean(currentPropertyId) && hasAccess,
  });
}
