// Penghuni notifications domain hook.
//
// Backend endpoints (snake_case JSON response, see
// backend/api/src/modules/notification/controllers/my-notification.controller.ts
// and notification-controller.util.ts > toNotificationResponse):
//   GET    /my/notifications?status=unread|read|archived&limit=&offset=
//   GET    /my/notifications/unread-count   -> { unread_count: number }
//   POST   /my/notifications/:id/read       -> notification
//   POST   /my/notifications/read-all       -> array
//
// Backend remains final authority for self-scope (request body never carries
// recipient_user_id; the controller resolves identity from the token).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type MyNotificationStatus = "unread" | "read" | "archived";

// API response shape (snake_case) as serialized by the backend.
export type MyNotificationRecord = {
  id: string;
  property_id: string;
  notification_type: string;
  notification_status: MyNotificationStatus;
  priority: "urgent" | "high" | "normal" | "low";
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  source_event_type: string | null;
  source_resource_id: string | null;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type UseNotificationsFilters = {
  status?: MyNotificationStatus;
  limit?: number;
  offset?: number;
};

export function useNotifications(
  filters: UseNotificationsFilters = {},
): UseQueryResult<MyNotificationRecord[]> {
  return useQuery<MyNotificationRecord[]>({
    queryKey: [...qk.penghuni.notifications(), filters] as const,
    queryFn: () =>
      apiClient.get<MyNotificationRecord[]>("/my/notifications", {
        query: {
          status: filters.status,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
  });
}

export function useUnreadCount(): UseQueryResult<number> {
  return useQuery<number>({
    queryKey: [...qk.penghuni.notifications(), "unread-count"] as const,
    queryFn: async () => {
      const res = await apiClient.get<{ unread_count: number }>(
        "/my/notifications/unread-count",
      );
      return res.unread_count ?? 0;
    },
    // The badge polls more often than lists; still under TanStack defaults.
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<MyNotificationRecord, unknown, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.post<MyNotificationRecord>(`/my/notifications/${id}/read`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    // Optimistic update is allowed for mark-as-read per ADR-FE-002.
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: qk.penghuni.notifications() });
      const previousLists = queryClient.getQueriesData<MyNotificationRecord[]>({
        queryKey: qk.penghuni.notifications(),
      });
      for (const [key, list] of previousLists) {
        if (!Array.isArray(list)) continue;
        queryClient.setQueryData<MyNotificationRecord[]>(
          key,
          list.map((n) =>
            n.id === id
              ? { ...n, notification_status: "read", read_at: new Date().toISOString() }
              : n,
          ),
        );
      }
      return { previousLists };
    },
    onError: (err, _vars, context) => {
      const ctx = context as { previousLists?: Array<[readonly unknown[], unknown]> } | undefined;
      if (ctx?.previousLists) {
        for (const [key, value] of ctx.previousLists) {
          queryClient.setQueryData(key, value);
        }
      }
      toastMutationError(err, "Gagal menandai notifikasi");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.notifications() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<MyNotificationRecord[], unknown, void>({
    mutationFn: () =>
      apiClient.post<MyNotificationRecord[]>("/my/notifications/read-all", undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: async () => {
      toastMutationSuccess("Semua notifikasi ditandai dibaca");
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.notifications() });
    },
    onError: (err) => toastMutationError(err, "Gagal menandai semua notifikasi"),
  });
}
