import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { AdminNotificationInbox } from "@/components/notifications/RoleNotifications";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  return (
    <AppShell title="Notifikasi" subtitle="Pemberitahuan untuk akun Anda pada properti aktif">
      <AdminNotificationInbox />
    </AppShell>
  );
}
