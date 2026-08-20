import { createFileRoute } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { Input } from "@/components/ui/input";
import { NoticeAlert } from "@/components/ui/notice-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminNotificationCenter } from "@/hooks/useAdminNotificationCenter";
import type {
  NotificationCenterPriority,
  NotificationCenterStatus,
} from "@/lib/admin-ux-notification-center";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

const PAGE_LIMIT = 20;

const TYPE_LABELS: Record<string, string> = {
  "billing.invoice_issued": "Tagihan diterbitkan",
  "billing.invoice_overdue": "Tagihan jatuh tempo",
  "complaint.created": "Komplain dibuat",
  "complaint.resolved": "Komplain selesai",
  "maintenance.work_order_assigned": "Work order ditugaskan",
  "vehicle.approved": "Kendaraan disetujui",
  "occupancy.check_in_completed": "Check-in selesai",
  "occupancy.check_out_finalized": "Check-out selesai",
  other: "Notifikasi lainnya",
};

const STATUS_LABELS: Record<NotificationCenterStatus, string> = {
  unread: "Belum dibaca",
  read: "Sudah dibaca",
  archived: "Diarsipkan",
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function NotificationsPage() {
  const { currentPropertyId } = useProperty();
  const [status, setStatus] = useState<NotificationCenterStatus | "all">("all");
  const [priority, setPriority] = useState<NotificationCenterPriority | "all">("all");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<{ propertyId: string | null; offset: number }>({
    propertyId: currentPropertyId,
    offset: 0,
  });
  const offset = pagination.propertyId === currentPropertyId ? pagination.offset : 0;
  const query = useAdminNotificationCenter({
    status: status === "all" ? undefined : status,
    priority: priority === "all" ? undefined : priority,
    search: search.trim() || undefined,
    limit: PAGE_LIMIT,
    offset,
  });
  const forbidden =
    !query.hasAccess || (query.error as { status?: unknown } | null | undefined)?.status === 403;
  const unreadCount = query.data?.meta.unread_count ?? 0;
  const activeCriteria = [
    status !== "all" ? `status: ${STATUS_LABELS[status]}` : null,
    priority !== "all" ? `prioritas: ${priority}` : null,
    search.trim() ? `pencarian: ${search.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  const handleStatusChange = (value: string) => {
    setStatus(value as NotificationCenterStatus | "all");
    setPagination({ propertyId: currentPropertyId, offset: 0 });
  };

  const handlePriorityChange = (value: string) => {
    setPriority(value as NotificationCenterPriority | "all");
    setPagination({ propertyId: currentPropertyId, offset: 0 });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setPriority("all");
    setPagination({ propertyId: currentPropertyId, offset: 0 });
  };

  const setOffset = (nextOffset: number) => {
    setPagination({ propertyId: currentPropertyId, offset: Math.max(0, nextOffset) });
  };

  return (
    <AppShell
      title="Notifikasi"
      subtitle="Catatan notifikasi properti yang aman dan read-only"
      actions={
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-44" aria-label="Filter status notifikasi">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="unread">Belum dibaca</SelectItem>
              <SelectItem value="read">Sudah dibaca</SelectItem>
              <SelectItem value="archived">Diarsipkan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="w-40" aria-label="Filter prioritas notifikasi">
              <SelectValue placeholder="Semua prioritas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua prioritas</SelectItem>
              <SelectItem value="urgent">Mendesak</SelectItem>
              <SelectItem value="high">Tinggi</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Rendah</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            onClick={() => query.readAll.mutate()}
            disabled={query.readAll.isPending || query.data?.meta.unread_count === 0}
          >
            Tandai semua dibaca
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination({ propertyId: currentPropertyId, offset: 0 });
            }}
            placeholder="Cari judul atau keterangan notifikasi..."
            aria-label="Cari notifikasi"
            className="pl-9"
          />
        </div>
        <Button variant="destructive" onClick={resetFilters} disabled={activeCriteria.length === 0}>
          Reset filter
        </Button>
      </div>
      {forbidden ? (
        <ForbiddenState description="Akun Anda tidak memiliki izin untuk melihat notifikasi properti ini." />
      ) : query.isPending ? (
        <LoadingState label="Memuat notifikasi..." />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Gagal memuat notifikasi"
        />
      ) : query.data.data.length === 0 ? (
        <div className="space-y-4">
          <NoticeAlert
            tone={status === "all" ? "info" : "warning"}
            title={
              status === "all" ? "Belum ada notifikasi baru" : "Filter belum menemukan notifikasi"
            }
            description="Notifikasi bersifat read-only. Periksa status dan kedaluwarsa sebelum mengambil tindakan pada data terkait."
          />
          <FilterResultNotice
            key={status}
            entityLabel="notifikasi"
            resultCount={0}
            activeFilterCount={activeCriteria.length}
            criteria={activeCriteria}
          />
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title="Belum ada notifikasi"
            description="Tidak ada catatan notifikasi untuk filter dan properti ini."
          />
          {query.data.meta.offset > 0 ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setOffset(query.data.meta.offset - query.data.meta.limit)}
              >
                Sebelumnya
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <NoticeAlert
            tone={unreadCount > 0 ? "info" : "success"}
            title={
              unreadCount > 0
                ? `${unreadCount} notifikasi belum dibaca`
                : "Semua notifikasi pada halaman ini sudah dibaca"
            }
            description="Notifikasi bersifat read-only. Periksa status dan kedaluwarsa sebelum mengambil tindakan pada data terkait."
          />
          {!query.isFetching ? (
            <FilterResultNotice
              key={status}
              entityLabel="notifikasi"
              resultCount={query.data.data.length}
              activeFilterCount={activeCriteria.length}
              criteria={activeCriteria}
            />
          ) : null}
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {query.data.data.map((notification) => (
                <article key={notification.id} className="space-y-3 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {notification.title ||
                          TYPE_LABELS[notification.notification_type] ||
                          "Notifikasi"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Dibuat {formatTimestamp(notification.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {STATUS_LABELS[notification.notification_status]}
                      </Badge>
                      <Badge
                        variant={
                          notification.priority === "urgent" || notification.priority === "high"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        Prioritas {notification.priority}
                      </Badge>
                    </div>
                  </div>
                  {notification.expires_at ? (
                    <p className="text-xs text-muted-foreground">
                      Kedaluwarsa {formatTimestamp(notification.expires_at)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {notification.notification_status === "unread" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => query.read.mutate(notification.id)}
                        disabled={query.read.isPending}
                      >
                        Tandai dibaca
                      </Button>
                    ) : null}
                    {notification.notification_status !== "archived" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => query.archive.mutate(notification.id)}
                        disabled={query.archive.isPending}
                      >
                        Arsipkan
                      </Button>
                    ) : null}
                    {notification.deep_link ? (
                      <Button size="sm" variant="link" asChild>
                        <a href={notification.deep_link}>Buka terkait</a>
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Menampilkan {query.data.meta.offset + 1}–
              {Math.min(query.data.meta.offset + query.data.data.length, query.data.meta.total)}{" "}
              dari {query.data.meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={query.data.meta.offset === 0}
                onClick={() => setOffset(query.data.meta.offset - query.data.meta.limit)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                disabled={query.data.meta.offset + query.data.meta.limit >= query.data.meta.total}
                onClick={() => setOffset(query.data.meta.offset + query.data.meta.limit)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
