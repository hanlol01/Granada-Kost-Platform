import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notifications as seed } from "@/lib/mock-data";
import { CreditCard, MessageSquareWarning, Cctv, Users, CheckCheck, Bell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

const iconMap = {
  payment: { i: CreditCard, c: "bg-success/15 text-success" },
  complaint: { i: MessageSquareWarning, c: "bg-warning/20 text-warning-foreground" },
  cctv: { i: Cctv, c: "bg-destructive/15 text-destructive" },
  tenant: { i: Users, c: "bg-primary-soft text-primary" },
} as const;

function NotificationsPage() {
  const [items, setItems] = useState(seed);
  const unread = items.filter((i) => !i.read).length;

  const markAll = () => {
    setItems((p) => p.map((i) => ({ ...i, read: true })));
    toast.success("Semua notifikasi ditandai dibaca");
  };

  return (
    <AppShell
      title="Notifikasi"
      subtitle={`${unread} notifikasi belum dibaca`}
      actions={<Button variant="outline" size="sm" onClick={markAll}><CheckCheck className="h-4 w-4 mr-1" /> Tandai semua dibaca</Button>}
    >
      {items.length === 0 ? (
        <div className="py-24 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Tidak ada notifikasi</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-2">
            <div className="divide-y divide-border">
              {items.map((n) => {
                const meta = iconMap[n.type];
                const Icon = meta.i;
                return (
                  <button
                    key={n.id}
                    onClick={() => setItems((p) => p.map((i) => i.id === n.id ? { ...i, read: true } : i))}
                    className={`w-full text-left flex items-start gap-3 p-4 rounded-lg hover:bg-muted transition-colors ${!n.read && "bg-primary-soft/30"}`}
                  >
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${meta.c}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{n.title}</p>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{n.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
