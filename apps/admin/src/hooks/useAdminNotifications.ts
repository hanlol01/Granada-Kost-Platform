import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/useAuth";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import {
  canReadAdminNotifications,
  getAdminNotifications,
  type AdminNotificationStatus,
} from "@/lib/admin-ux-notifications";
import { useProperty } from "@/lib/property/useProperty";

export type AdminNotificationFilters = {
  status?: AdminNotificationStatus;
  limit?: number;
  offset?: number;
};

export function useAdminNotifications(filters: AdminNotificationFilters = {}) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const hasAccess = canReadAdminNotifications({
    roles: user?.roles,
    permissions: user?.permissions,
  });

  const query = useQuery({
    queryKey: adminUxQueryKeys.notifications.list(currentPropertyId ?? "no-property", {
      status: filters.status,
      limit,
      offset,
    }),
    queryFn: ({ signal }) =>
      getAdminNotifications(
        {
          propertyId: currentPropertyId as string,
          status: filters.status,
          limit,
          offset,
        },
        signal,
      ),
    enabled: Boolean(currentPropertyId) && hasAccess,
    retry: (failureCount, error) => {
      const status = (error as { status?: unknown }).status;
      return status !== 403 && failureCount < 1;
    },
  });

  return { ...query, hasAccess };
}
