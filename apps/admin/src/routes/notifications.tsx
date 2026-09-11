import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Bell, Search } from "lucide-react";
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

const NOTIFICATION_TYPE_OPTIONS = [
  { value: "all", label: "Semua jenis notifikasi" },
  { value: "billing.invoice_issued", label: TYPE_LABELS["billing.invoice_issued"] },
  { value: "billing.invoice_overdue", label: TYPE_LABELS["billing.invoice_overdue"] },
  { value: "complaint.created", label: TYPE_LABELS["complaint.created"] },
  { value: "complaint.resolved", label: TYPE_LABELS["complaint.resolved"] },
  {
    value: "maintenance.work_order_assigned",
    label: TYPE_LABELS["maintenance.work_order_assigned"],
  },
  { value: "vehicle.approved", label: TYPE_LABELS["vehicle.approved"] },
  { value: "occupancy.check_in_completed", label: TYPE_LABELS["occupancy.check_in_completed"] },
  {
    value: "occupancy.check_out_finalized",
    label: TYPE_LABELS["occupancy.check_out_finalized"],
  },
  { value: "other", label: TYPE_LABELS.other },
] as const;

type NotificationTypeFilter = (typeof NOTIFICATION_TYPE_OPTIONS)[number]["value"];

const STATUS_LABELS: Record<NotificationCenterStatus, string> = {
  unread: "Belum dibaca",
  read: "Sudah dibaca",
  archived: "Diarsipkan",
};

const PRIORITY_LABELS: Record<NotificationCenterPriority, string> = {
  urgent: "Mendesak",
  high: "Tinggi",
  normal: "Normal",
  low: "Rendah",
};

function statusBadgeClass(status: NotificationCenterStatus): string {
  if (status === "unread") {
    return "rounded-full border-primary/35 bg-primary/10 text-primary";
  }
  if (status === "read") {
    return "rounded-full border-success/35 bg-success/10 text-success";
  }
  return "rounded-full border-border bg-muted text-muted-foreground";
}

function priorityBadgeClass(priority: NotificationCenterPriority): string {
  if (priority === "urgent" || priority === "high") {
    return "rounded-full border-destructive/35 bg-destructive/10 text-destructive";
  }
  if (priority === "normal") {
    return "rounded-full border-primary/25 bg-primary/10 text-primary";
  }
  return "rounded-full border-border bg-muted text-muted-foreground";
}

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
  const [notificationType, setNotificationType] = useState<NotificationTypeFilter>("all");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<{ propertyId: string | null; offset: number }>({
    propertyId: currentPropertyId,
    offset: 0,
  });
  const offset = pagination.propertyId === currentPropertyId ? pagination.offset : 0;
  const query = useAdminNotificationCenter({
    status: status === "all" ? undefined : status,
    priority: priority === "all" ? undefined : priority,
    notificationType: notificationType === "all" ? undefined : notificationType,
    search: search.trim() || undefined,
    limit: PAGE_LIMIT,
    offset,
  });
  const forbidden =
    !query.hasAccess || (query.error as { status?: unknown } | null | undefined)?.status === 403;
  const unreadCount = query.data?.meta.unread_count ?? 0;
  const activeCriteria = [
    status !== "all" ? `status: ${STATUS_LABELS[status]}` : null,
    priority !== "all" ? `prioritas: ${PRIORITY_LABELS[priority]}` : null,
    notificationType !== "all" ? `jenis: ${TYPE_LABELS[notificationType]}` : null,
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

  const handleNotificationTypeChange = (value: string) => {
    setNotificationType(value as NotificationTypeFilter);
    setPagination({ propertyId: currentPropertyId, offset: 0 });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setPriority("all");
    setNotificationType("all");
    setPagination({ propertyId: currentPropertyId, offset: 0 });
  };

  const setOffset = (nextOffset: number) => {
    setPagination({ propertyId: currentPropertyId, offset: Math.max(0, nextOffset) });
  };

  return (
    <AppShell title="Notifikasi" subtitle="Catatan notifikasi properti yang aman dan read-only">
      <div className="mb-5 rounded-xl border border-border/80 bg-card p-3 shadow-sm md:p-4">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem_auto_auto] lg:items-center">
          <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
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
              className="h-10 pl-9"
            />
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-10 w-full" aria-label="Filter status notifikasi">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="unread">Belum dibaca</SelectItem>
              <SelectItem value="read">Sudah dibaca</SelectItem>
              <SelectItem value="archived">Diarsipkan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={notificationType} onValueChange={handleNotificationTypeChange}>
            <SelectTrigger className="h-10 w-full" aria-label="Filter jenis notifikasi">
              <SelectValue placeholder="Semua jenis notifikasi" />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={handlePriorityChange}>
            <SelectTrigger className="h-10 w-full" aria-label="Filter prioritas notifikasi">
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
            className="h-10 w-full lg:w-auto"
            onClick={() => query.readAll.mutate()}
            disabled={query.readAll.isPending || query.data?.meta.unread_count === 0}
          >
            Tandai semua dibaca
          </Button>
          <Button
            variant="destructive"
            className="h-10 w-full lg:w-auto"
            onClick={resetFilters}
            disabled={activeCriteria.length === 0}
          >
            Reset filter
          </Button>
        </div>
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
            key={activeCriteria.join("|") || "no-filters"}
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
                className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setOffset(query.data.meta.offset - query.data.meta.limit)}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
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
              key={activeCriteria.join("|") || "no-filters"}
              entityLabel="notifikasi"
              resultCount={query.data.data.length}
              activeFilterCount={activeCriteria.length}
              criteria={activeCriteria}
            />
          ) : null}
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {query.data.data.map((notification) => (
                <article key={notification.id} className="flex flex-col gap-4 p-4 md:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold tracking-[-0.01em] text-foreground">
                        {notification.title ||
                          TYPE_LABELS[notification.notification_type] ||
                          "Notifikasi"}
                      </p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Dibuat {formatTimestamp(notification.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(notification.notification_status)}
                      >
                        {STATUS_LABELS[notification.notification_status]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={priorityBadgeClass(notification.priority)}
                      >
                        Prioritas {PRIORITY_LABELS[notification.priority]}
                      </Badge>
                    </div>
                  </div>
                  {notification.expires_at ? (
                    <p className="text-xs text-muted-foreground">
                      Kedaluwarsa {formatTimestamp(notification.expires_at)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                    {notification.notification_status === "unread" ? (
                      <Button
                        size="sm"
                        variant="info"
                        className="min-h-10"
                        onClick={() => query.read.mutate(notification.id)}
                        disabled={query.read.isPending}
                      >
                        Tandai dibaca
                      </Button>
                    ) : null}
                    {notification.notification_status !== "archived" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="min-h-10"
                        onClick={() => query.archive.mutate(notification.id)}
                        disabled={query.archive.isPending}
                      >
                        Arsipkan
                      </Button>
                    ) : null}
                    {notification.deep_link ? (
                      <Button size="sm" variant="default" className="min-h-10" asChild>
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
                className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={query.data.meta.offset === 0}
                onClick={() => setOffset(query.data.meta.offset - query.data.meta.limit)}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Sebelumnya
              </Button>
              <Button
                className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={query.data.meta.offset + query.data.meta.limit >= query.data.meta.total}
                onClick={() => setOffset(query.data.meta.offset + query.data.meta.limit)}
              >
                Berikutnya
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
