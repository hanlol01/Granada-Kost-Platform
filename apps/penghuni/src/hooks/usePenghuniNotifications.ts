import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { notificationInboxKey } from "@granada-kost/ui";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Home, the header panel, and the full page share the same account-scoped
// unread-count cache. Notification actions invalidate this prefix together.
export function useUnreadCount(): UseQueryResult<number> {
  const { user, status } = useAuth();

  return useQuery({
    queryKey: [...notificationInboxKey(user?.id ?? "anonymous", "resident"), "unread-count"],
    enabled: status === "authenticated" && Boolean(user?.id),
    queryFn: ({ signal }) =>
      apiClient.get<{ unreadCount: number }>("/my/notification-center/unread-count", { signal }),
    select: (response) => response.unreadCount,
    staleTime: 15_000,
    refetchOnWindowFocus: "always",
  });
}
