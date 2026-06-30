import { createFileRoute } from "@tanstack/react-router";
import { Receipt, Wrench, Megaphone, Bell, CheckCheck, ShieldAlert } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type MyNotificationRecord,
} from "@/hooks/usePenghuniNotifications";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function iconForType(type: string) {
  if (type.startsWith("billing") || type.startsWith("payment") || type.startsWith("invoice")) {
    return Receipt;
  }
  if (type.startsWith("complaint") || type.startsWith("work_order") || type.startsWith("maintenance")) {
    return Wrench;
  }
  if (type.startsWith("announce")) return Megaphone;
  if (type.startsWith("smart_lock") || type.startsWith("security")) return ShieldAlert;
  return Bell;
}

function NotificationsPage() {
  const list = useNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = list.data ?? [];
  const unreadCount = items.filter((n) => n.notification_status === "unread").length;

  return (
    <>
      <AppHeader
        title="Notifikasi"
        subtitle={`${unreadCount} belum dibaca`}
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold transition active:scale-95 disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {markAllRead.isPending ? "Memproses..." : "Tandai semua"}
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        {list.isLoading ? (
          <LoadingState label="Memuat notifikasi..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada notifikasi"
            description="Pemberitahuan dari pengelola akan muncul di sini."
            icon={<Bell className="h-5 w-5" />}
          />
        ) : (
          items.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onRead={() => {
                if (n.notification_status === "unread") markRead.mutate({ id: n.id });
              }}
            />
          ))
        )}
      </div>
    </>
  );
}

function NotificationCard({
  notification,
  onRead,
}: {
  notification: MyNotificationRecord;
  onRead: () => void;
}) {
  const Icon = iconForType(notification.notification_type);
  const isUnread = notification.notification_status === "unread";
  return (
    <button
      type="button"
      onClick={onRead}
      className={
        "flex w-full items-start gap-3 rounded-2xl bg-card p-4 text-left shadow-[var(--shadow-soft)] transition active:scale-[0.99] " +
        (isUnread ? "" : "opacity-80")
      }
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold">{notification.title}</p>
          {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatRelative(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
