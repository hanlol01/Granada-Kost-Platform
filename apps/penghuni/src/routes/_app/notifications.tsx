import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { notifications } from "@/lib/dummy-data";
import { Receipt, Wrench, Megaphone, BellOff } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

const iconMap = {
  bill: Receipt,
  ticket: Wrench,
  announce: Megaphone,
} as const;

function NotificationsPage() {
  return (
    <>
      <AppHeader title="Notifikasi" subtitle="Pemberitahuan terbaru" />
      <div className="flex flex-col gap-2 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        {notifications.length === 0 ? (
          <Empty />
        ) : (
          notifications.map((n) => {
            const Icon = iconMap[n.type as keyof typeof iconMap] ?? Megaphone;
            return (
              <div
                key={n.id}
                className={
                  "flex items-start gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)] " +
                  (n.read ? "opacity-80" : "")
                }
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary">
        <BellOff className="h-7 w-7" />
      </div>
      <p className="text-sm font-semibold">Belum ada notifikasi</p>
      <p className="text-xs text-muted-foreground">Pemberitahuan akan muncul di sini.</p>
    </div>
  );
}
