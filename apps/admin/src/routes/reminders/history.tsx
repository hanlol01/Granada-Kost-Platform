import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarDays,
  History,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { newIdempotencyKey } from "@/lib/idempotency";
import {
  reminderHistoryChannelLabels,
  reminderHistoryStatusLabels,
  type ReminderHistoryChannel,
  type ReminderHistoryMilestone,
  type ReminderHistoryResponse,
  type ReminderHistoryStatus,
} from "@/lib/admin-reminder-history";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/reminders/history")({ component: ReminderHistoryPage });

const PAGE_SIZE = 20;

const leaseMilestoneLabels: Record<ReminderHistoryMilestone, string> = {
  h60: "H-60 · Niat perpanjangan",
  h30: "H-30 · Keputusan perpanjangan",
  h14: "H-14 · Persiapan checkout",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusClass(status: ReminderHistoryStatus) {
  if (status === "manual_sent") {
    return "border-success/35 bg-success/10 text-success";
  }
  if (status === "external_opened") {
    return "border-primary/35 bg-primary/10 text-primary";
  }
  if (status === "failed") {
    return "border-destructive/50 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

function channelClass(channel: ReminderHistoryChannel) {
  return channel === "whatsapp_manual"
    ? "border-success/35 bg-success/10 text-success"
    : "border-primary/35 bg-primary/10 text-primary";
}

function ReminderHistoryPage() {
  const { currentPropertyId } = useProperty();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReminderHistoryStatus | "all">("all");
  const [channel, setChannel] = useState<ReminderHistoryChannel | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [data, setData] = useState<ReminderHistoryResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(
    async (nextOffset = offset) => {
      if (!currentPropertyId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await adminUxV2Requester.get<ReminderHistoryResponse>(
          "/admin/reminders/history",
          {
            query: {
              property_id: currentPropertyId,
              search: searchRef.current.trim() || undefined,
              outcome_status: status === "all" ? undefined : status,
              channel: channel === "all" ? undefined : channel,
              include_archived: includeArchived || undefined,
              limit: PAGE_SIZE,
              offset: nextOffset,
            },
          },
        );
        setData(response);
      } catch (cause) {
        setError(cause);
      } finally {
        setLoading(false);
      }
    },
    [currentPropertyId, status, channel, includeArchived, offset],
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function archive(id: string) {
    if (!currentPropertyId) return;
    setBusyId(id);
    try {
      await adminUxV2Requester.post(
        `/admin/reminders/history/${encodeURIComponent(id)}/archive`,
        undefined,
        { query: { property_id: currentPropertyId }, idempotencyKey: newIdempotencyKey() },
      );
      await load();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusyId(null);
    }
  }

  function reset() {
    setSearch("");
    setStatus("all");
    setChannel("all");
    setIncludeArchived(false);
    setOffset(0);
    setRefreshKey((value) => value + 1);
  }

  const forbidden = (error as { status?: number } | null)?.status === 403;
  const total = data?.meta.total ?? 0;
  const rangeStart = total > 0 ? offset + 1 : 0;
  const rangeEnd = Math.min(offset + (data?.data.length ?? 0), total);
  const hasPrevious = offset > 0;
  const hasNext = offset + (data?.data.length ?? 0) < total;
  return (
    <AppShell
      title="Riwayat Pengingat"
      subtitle="Bukti preview dan tindak lanjut manual; bukan laporan pengiriman provider"
      actions={
        <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary">
          <History className="mr-1 h-3.5 w-3.5" /> Riwayat tersimpan
        </Badge>
      }
    >
      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">Filter riwayat</h2>
              <p className="text-sm text-muted-foreground">
                Cari berdasarkan nama penghuni atau nomor kamar.
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setOffset(0);
                    void load(0);
                  }
                }}
                placeholder="Cari penghuni atau kamar..."
                className="pl-9"
                aria-label="Cari riwayat pengingat"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as ReminderHistoryStatus | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger aria-label="Filter hasil pengingat">
                <SelectValue placeholder="Semua hasil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua hasil</SelectItem>
                {Object.entries(reminderHistoryStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={channel}
              onValueChange={(value) => {
                setChannel(value as ReminderHistoryChannel | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger aria-label="Filter kanal pengingat">
                <SelectValue placeholder="Semua kanal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kanal</SelectItem>
                {Object.entries(reminderHistoryChannelLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              className="min-h-10 rounded-lg bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={reset}
            >
              Reset filter
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => {
                setIncludeArchived(event.target.checked);
                setOffset(0);
              }}
            />{" "}
            Tampilkan yang diarsipkan
          </label>
        </CardContent>
      </Card>

      {forbidden ? (
        <ForbiddenState description="Akun Anda tidak memiliki izin melihat riwayat pengingat properti ini." />
      ) : loading ? (
        <LoadingState label="Memuat riwayat pengingat..." />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => void load()}
          title="Gagal memuat riwayat pengingat"
        />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="Belum ada riwayat pengingat"
          description="Riwayat akan muncul setelah Admin membuat preview atau mencatat tindak lanjut manual."
        />
      ) : (
        <div className="space-y-3">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="divide-y divide-border p-0">
              {data.data.map((attempt) => (
                <article key={attempt.id} className="space-y-3 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {attempt.recipient_name} · {attempt.room_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(attempt.created_at)} ·{" "}
                        {attempt.reminder_kind === "lease_ending" && attempt.milestone
                          ? `${leaseMilestoneLabels[attempt.milestone]} · pengingat masa sewa`
                          : `${attempt.invoice_count} tagihan · versi template ${attempt.template_version}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={statusClass(attempt.outcome_status)}>
                        {reminderHistoryStatusLabels[attempt.outcome_status]}
                      </Badge>
                      <Badge variant="outline" className={channelClass(attempt.channel)}>
                        {reminderHistoryChannelLabels[attempt.channel]}
                      </Badge>
                      {attempt.reminder_kind === "lease_ending" ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 bg-warning/10 text-warning-foreground"
                        >
                          Masa sewa
                        </Badge>
                      ) : null}
                      {attempt.archived_at ? (
                        <Badge
                          variant="outline"
                          className="border-border bg-muted/60 text-muted-foreground"
                        >
                          Diarsipkan
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Sisa tercatat{" "}
                      <strong className="text-foreground">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          maximumFractionDigits: 0,
                        }).format(attempt.total_outstanding_amount)}
                      </strong>
                    </span>
                    {!attempt.archived_at ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="min-h-10 rounded-lg bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                        onClick={() => void archive(attempt.id)}
                        disabled={busyId === attempt.id}
                      >
                        <Archive className="mr-2 h-4 w-4" /> Arsipkan
                      </Button>
                    ) : null}
                  </div>
                  {attempt.outcome_note ? (
                    <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                      Catatan: {attempt.outcome_note}
                    </p>
                  ) : null}
                </article>
              ))}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Menampilkan{" "}
              <span className="font-semibold text-foreground">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              dari <span className="font-semibold text-foreground">{total}</span> riwayat
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={!hasPrevious || loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={!hasNext || loading}
              >
                Lanjut <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
