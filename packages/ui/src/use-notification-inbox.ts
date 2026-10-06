import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@granada-kost/api-client";
import {
  notificationErrorMessage,
  type NotificationFilters,
  type NotificationItem,
  type NotificationPage,
  type NotificationRole,
} from "./notification-model";

export interface NotificationInboxOptions {
  client: ApiClient;
  accountKey: string;
  role: NotificationRole;
  propertyId?: string | null;
  enabled?: boolean;
  listEnabled?: boolean;
  filters?: NotificationFilters;
}

export const notificationInboxKey = (
  accountKey: string,
  role: NotificationRole,
  propertyId?: string | null,
) => ["notification-inbox", accountKey, role, propertyId ?? "self"] as const;

export function useNotificationInbox({
  client,
  accountKey,
  role,
  propertyId,
  enabled = true,
  listEnabled = true,
  filters = {},
}: NotificationInboxOptions) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const scope = notificationInboxKey(accountKey, role, propertyId);
  const active =
    enabled && Boolean(accountKey) && (role !== "admin" || Boolean(propertyId));
  const context = propertyId ? { property_id: propertyId } : {};
  const query = useQuery({
    queryKey: [...scope, "list", filters],
    enabled: active && listEnabled,
    queryFn: ({ signal }) =>
      client.get<NotificationPage>("/my/notification-center", {
        signal,
        query: { ...context, ...filters, status: filters.status ?? "unread" },
      }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: (failures, error) =>
      ![401, 403].includes((error as { status?: number }).status ?? 0) &&
      failures < 1,
  });
  const count = useQuery({
    queryKey: [...scope, "unread-count"],
    enabled: active,
    queryFn: ({ signal }) =>
      client.get<{ unreadCount: number }>(
        "/my/notification-center/unread-count",
        { signal, query: context },
      ),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const action = useMutation({
    mutationFn: async ({
      operation,
      id,
    }: {
      operation: "read" | "archive" | "read-all" | "archive-read";
      id?: string;
    }) => {
      const options = { query: context, idempotencyKey: crypto.randomUUID() };
      return id
        ? client.patch<NotificationItem>(
            `/my/notification-center/${encodeURIComponent(id)}/${operation}`,
            {},
            options,
          )
        : client.post<{ updatedCount: number }>(
            `/my/notification-center/${operation}`,
            {},
            options,
          );
    },
    onMutate: () => {
      setActionError(null);
      setFeedback(null);
    },
    onSuccess: async (result, variables) => {
      setFeedback(
        variables.operation === "read-all"
          ? `${"updatedCount" in result ? result.updatedCount : 0} notifikasi ditandai sudah dibaca.`
          : variables.operation === "archive-read"
            ? `${"updatedCount" in result ? result.updatedCount : 0} notifikasi yang sudah dibaca diarsipkan.`
            : variables.operation === "archive"
              ? "Notifikasi diarsipkan. Data terkait tidak diubah."
              : null,
      );
      await queryClient.invalidateQueries({ queryKey: scope });
    },
    onError: (error) => setActionError(notificationErrorMessage(error)),
  });
  const run = (
    operation: "read" | "archive" | "read-all" | "archive-read",
    id?: string,
  ) => action.mutateAsync({ operation, id });
  return {
    ...query,
    unreadCount: count.data?.unreadCount ?? query.data?.unreadCount ?? 0,
    countError: count.error,
    actionError,
    feedback,
    pending: action.isPending,
    hasError: query.isError,
    enabled: active,
    read: (id: string) => run("read", id),
    archive: (id: string) => run("archive", id),
    readAll: () => run("read-all"),
    archiveRead: () => run("archive-read"),
    refetch: async () => {
      await Promise.all([query.refetch(), count.refetch()]);
    },
  };
}
