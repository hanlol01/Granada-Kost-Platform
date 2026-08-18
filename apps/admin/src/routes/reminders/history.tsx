import { createFileRoute } from "@tanstack/react-router";
import { Archive, BellRing, CalendarDays, History, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  type ReminderHistoryResponse,
  type ReminderHistoryStatus,
} from "@/lib/admin-reminder-history";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/reminders/history")({ component: ReminderHistoryPage });

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusClass(status: ReminderHistoryStatus) {
  if (status === "manual_sent") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "external_opened") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (status === "failed") {
    return "border-destructive/50 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

function ReminderHistoryPage() {
  const { currentPropertyId } = useProperty();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReminderHistoryStatus | "all">("all");
  const [channel, setChannel] = useState<ReminderHistoryChannel | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [data, setData] = useState<ReminderHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!currentPropertyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await adminUxV2Requester.get<ReminderHistoryResponse>(
        "/admin/reminders/history",
        {
          query: {
            property_id: currentPropertyId,
            search: search.trim() || undefined,
            outcome_status: status === "all" ? undefined : status,
            channel: channel === "all" ? undefined : channel,
            include_archived: includeArchived || undefined,
            limit: 20,
            offset: 0,
          },
        },
      );
      setData(response);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [currentPropertyId, status, channel, includeArchived]);

  const activeFilters = useMemo(
    () =>
      [search.trim(), status !== "all" ? status : "", channel !== "all" ? channel : ""].filter(
        Boolean,
      ),
    [search, status, channel],
  );

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
  }

  const forbidden = (error as { status?: number } | null)?.status === 403;
  return (
    <AppShell
      title="Riwayat Pengingat"
      subtitle="Bukti preview dan tindak lanjut manual; bukan laporan pengiriman provider"
      actions={
        <Badge
          variant="outline"
          className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        >
          <History className="mr-1 h-3.5 w-3.5" /> W08C
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
                  if (event.key === "Enter") void load();
                }}
                placeholder="Cari penghuni atau kamar..."
                className="pl-9"
                aria-label="Cari riwayat pengingat"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ReminderHistoryStatus | "all")}
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
              onValueChange={(value) => setChannel(value as ReminderHistoryChannel | "all")}
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
              variant="outline"
              onClick={reset}
              disabled={activeFilters.length === 0 && !includeArchived}
            >
              Reset filter
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
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
                      {formatDate(attempt.created_at)} · {attempt.invoice_count} tagihan · versi
                      template {attempt.template_version}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={statusClass(attempt.outcome_status)}>
                      {reminderHistoryStatusLabels[attempt.outcome_status]}
                    </Badge>
                    <Badge variant="outline">{reminderHistoryChannelLabels[attempt.channel]}</Badge>
                    {attempt.archived_at ? <Badge variant="secondary">Diarsipkan</Badge> : null}
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
                      variant="outline"
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
      )}
    </AppShell>
  );
}
