import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/useAuth";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { useProperty } from "@/lib/property/useProperty";
import {
  archiveNotificationCenter,
  canReadNotificationCenter,
  getNotificationCenter,
  markAllNotificationsRead,
  markNotificationCenterRead,
  type NotificationCenterPriority,
  type NotificationCenterStatus,
} from "@/lib/admin-ux-notification-center";

export type AdminNotificationCenterFilters = {
  status?: NotificationCenterStatus;
  priority?: NotificationCenterPriority;
  notificationType?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function useAdminNotificationCenter(filters: AdminNotificationCenterFilters = {}) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const hasAccess = canReadNotificationCenter({
    roles: user?.roles,
    permissions: user?.permissions,
  });
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const queryKey = adminUxQueryKeys.notifications.list(currentPropertyId ?? "no-property", {
    status: filters.status,
    priority: filters.priority,
    notificationType: filters.notificationType,
    search: filters.search,
    from: filters.from,
    to: filters.to,
    limit,
    offset,
  });
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      getNotificationCenter(
        { propertyId: currentPropertyId as string, ...filters, limit, offset },
        signal,
      ),
    enabled: Boolean(currentPropertyId) && hasAccess,
    retry: (failureCount, error) =>
      (error as { status?: number }).status !== 403 && failureCount < 1,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: adminUxQueryKeys.notifications.list(currentPropertyId ?? "no-property"),
    });
  const read = useMutation({
    mutationFn: (id: string) => markNotificationCenterRead(currentPropertyId as string, id),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveNotificationCenter(currentPropertyId as string, id),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(currentPropertyId as string),
    onSuccess: invalidate,
  });
  return { ...query, hasAccess, read, archive, readAll };
}
