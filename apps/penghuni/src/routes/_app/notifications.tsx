import { createFileRoute } from "@tanstack/react-router";
import { NotificationInboxPage } from "@granada-kost/ui";
import { AppHeader } from "@/components/AppHeader";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, status } = useAuth();

  return (
    <>
      <AppHeader title="Notifikasi" subtitle="Pemberitahuan untuk akun Anda" back />
      <div className="px-5 py-5">
        {status === "authenticated" && user ? (
          <NotificationInboxPage
            key={user.id}
            client={apiClient}
            accountKey={user.id}
            role="resident"
          />
        ) : null}
      </div>
    </>
  );
}
