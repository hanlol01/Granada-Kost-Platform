import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarClock,
  CreditCard,
  Eye,
  History,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeaseReminderDialog } from "@/components/billing/LeaseReminderDialog";
import { ReminderComposerDialog } from "@/components/billing/ReminderComposerDialog";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProperty } from "@/lib/property/useProperty";
import {
  getReminderWorkspace,
  type ReminderMilestone,
  type ReminderWorkspace,
  type ReminderWorkspaceLease,
} from "@/lib/admin-reminder-workspace";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reminders/h-30")({ component: ReminderWorkspacePage });

const MILESTONES: Array<{ key: ReminderMilestone | "bills"; label: string; hint: string }> = [
  { key: "h30", label: "H-30 · Prioritas", hint: "Perpanjangan dan pekerjaan pembayaran" },
  { key: "h60", label: "H-60 · Niat perpanjangan", hint: "Mulai siapkan keputusan perpanjangan" },
  { key: "h14", label: "H-14 · Checkout", hint: "Persiapan akhir masa sewa" },
  { key: "bills", label: "Tagihan bulan berjalan", hint: "Invoice yang masih memiliki sisa" },
];

const PAGE_SIZE = 10;

const MILESTONE_STYLES: Record<ReminderMilestone | "bills", { active: string; idle: string }> = {
  h30: {
    active: "border-primary bg-primary text-primary-foreground shadow-sm",
    idle: "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
  },
  h60: {
    active: "border-primary bg-primary text-primary-foreground shadow-sm",
    idle: "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
  },
  h14: {
    active: "border-primary bg-primary text-primary-foreground shadow-sm",
    idle: "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
  },
  bills: {
    active: "border-primary bg-primary text-primary-foreground shadow-sm",
    idle: "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
  },
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function reminderStatusLabel(status: "previewed" | "external_opened" | "manual_sent" | "failed") {
  return {
    previewed: "Preview dibuat",
    external_opened: "WhatsApp dibuka",
    manual_sent: "Dikirim manual",
    failed: "Gagal",
  }[status];
}

function LeaseRow({
  item,
  propertyId,
  onReminderRecorded,
}: {
  item: ReminderWorkspaceLease;
  propertyId: string | null;
  onReminderRecorded: () => void;
}) {
  return (
    <article className="flex flex-col gap-4 border-b border-border p-4 last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">{item.resident_name}</p>
          <Badge
            variant={item.milestone === "h14" ? "destructive" : "secondary"}
            className={
              item.milestone === "h14"
                ? "bg-warning/15 text-warning-foreground"
                : "bg-primary/10 text-primary"
            }
          >
            {item.milestone.toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Kamar {item.room_number} · {item.snapshot_kost_type_name} · selesai{" "}
          {dateLabel(item.lease_end_date)}
        </p>
        <p className="text-sm text-muted-foreground">
          Sisa {item.days_remaining} hari · tagihan belum dibayar{" "}
          {formatIDR(item.outstanding_amount)}
        </p>
        <p className="text-xs text-muted-foreground">
          Reminder terakhir:{" "}
          {item.latest_reminder
            ? `${reminderStatusLabel(item.latest_reminder.outcome_status)} · ${dateLabel(item.latest_reminder.created_at)}`
            : "Belum ada reminder tercatat"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          asChild
          size="sm"
          variant="default"
          className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Link to="/tenants/$residentId" params={{ residentId: item.resident_id }}>
            <Eye className="mr-2 h-4 w-4" /> Lihat detail
          </Link>
        </Button>
        <LeaseReminderDialog
          propertyId={propertyId}
          leaseId={item.lease_id}
          milestone={item.milestone}
          residentName={item.resident_name}
          roomNumber={item.room_number}
          leaseEndDate={item.lease_end_date}
          daysRemaining={item.days_remaining}
          outstandingAmount={item.outstanding_amount}
          onRecorded={onReminderRecorded}
          triggerClassName="border-success bg-success text-success-foreground shadow-sm hover:bg-success/90"
        />
      </div>
    </article>
  );
}

function ReminderPagination({
  offset,
  total,
  visibleCount,
  loading,
  onPrevious,
  onNext,
}: {
  offset: number;
  total: number;
  visibleCount: number;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const rangeStart = total > 0 ? offset + 1 : 0;
  const rangeEnd = Math.min(offset + visibleCount, total);
  const hasPrevious = offset > 0;
  const hasNext = offset + visibleCount < total;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Menampilkan{" "}
        <span className="font-semibold text-foreground">
          {rangeStart}–{rangeEnd}
        </span>{" "}
        dari <span className="font-semibold text-foreground">{total}</span> data
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="default"
          className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          onClick={onPrevious}
          disabled={!hasPrevious || loading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
        </Button>
        <Button
          type="button"
          variant="default"
          className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          onClick={onNext}
          disabled={!hasNext || loading}
        >
          Lanjut <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReminderWorkspacePage() {
  const { currentPropertyId } = useProperty();
  const [workspace, setWorkspace] = useState<ReminderWorkspace | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReminderMilestone | "bills">("h30");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    if (!currentPropertyId) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await getReminderWorkspace(currentPropertyId));
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [currentPropertyId]);
  useEffect(() => void load(), [load]);
  useEffect(() => setOffset(0), [tab, search]);

  const filteredLeases = useMemo(() => {
    if (!workspace || tab === "bills") return [];
    const q = search.trim().toLocaleLowerCase();
    return workspace.data.groups[tab].filter(
      (item) =>
        !q ||
        [item.resident_name, item.room_number, item.snapshot_kost_type_name].some((value) =>
          value.toLocaleLowerCase().includes(q),
        ),
    );
  }, [search, tab, workspace]);
  const filteredBills = useMemo(() => {
    if (!workspace || tab !== "bills") return [];
    const q = search.trim().toLocaleLowerCase();
    return workspace.data.current_month_bills.data.filter(
      (item) =>
        !q ||
        [item.resident_name, item.room_number, item.invoice_code].some((value) =>
          value.toLocaleLowerCase().includes(q),
        ),
    );
  }, [search, tab, workspace]);
  const activeTotal = tab === "bills" ? filteredBills.length : filteredLeases.length;
  const visibleLeases = useMemo(
    () => filteredLeases.slice(offset, offset + PAGE_SIZE),
    [filteredLeases, offset],
  );
  const visibleBills = useMemo(
    () => filteredBills.slice(offset, offset + PAGE_SIZE),
    [filteredBills, offset],
  );
  const hasAccess = Boolean(currentPropertyId);

  return (
    <AppShell
      title="Pusat pengingat"
      subtitle="Satu ruang kerja untuk tagihan dan masa sewa yang perlu ditindaklanjuti"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="default"
            size="sm"
            className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Link to="/reminders/history">
              <History className="mr-2 h-4 w-4" /> Riwayat pengingat
            </Link>
          </Button>
          <Badge variant="secondary" className="bg-primary/10 px-3 py-1.5 text-primary">
            <BellRing className="mr-2 h-4 w-4" /> {workspace?.data.badge_count ?? 0} perlu perhatian
          </Badge>
        </div>
      }
    >
      {!hasAccess ? (
        <ForbiddenState description="Properti aktif belum tersedia untuk akun ini." />
      ) : loading && !workspace ? (
        <LoadingState label="Memuat pusat pengingat..." />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => void load()}
          title="Gagal memuat pusat pengingat"
        />
      ) : workspace ? (
        <div className="space-y-5">
          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">
                    Acuan data: {dateLabel(workspace.data.as_of_date)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Daftar berubah otomatis ketika kondisi tagihan atau masa sewa terselesaikan.
                  </p>
                </div>
              </div>
              <Button
                variant="success"
                className="h-10 rounded-lg border-success bg-success text-success-foreground hover:bg-success/90"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Segarkan
              </Button>
            </CardContent>
          </Card>
          <div
            className="grid gap-2 rounded-xl border border-border bg-card p-2 md:grid-cols-4"
            role="tablist"
            aria-label="Kelompok pengingat"
          >
            {MILESTONES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => {
                  setTab(item.key);
                  setSearch("");
                  setOffset(0);
                }}
                className={cn(
                  "min-h-11 rounded-xl border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === item.key
                    ? MILESTONE_STYLES[item.key].active
                    : `border-transparent text-muted-foreground ${MILESTONE_STYLES[item.key].idle}`,
                )}
              >
                <span className="block font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs opacity-80">{item.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Cari penghuni, kamar, atau kode invoice..."
                aria-label="Cari pusat pengingat"
              />
            </div>
            <Button
              variant="destructive"
              className="min-h-10 rounded-lg bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
              onClick={() => setSearch("")}
              disabled={!search}
            >
              Reset filter
            </Button>
          </div>
          {tab === "bills" ? (
            filteredBills.length ? (
              <div className="space-y-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      <CreditCard className="mr-2 inline h-4 w-4 text-primary" />
                      Tagihan yang perlu ditindaklanjuti
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {visibleBills.map((bill) => (
                      <article
                        key={bill.id}
                        className="flex flex-col gap-3 border-b border-border p-4 last:border-0 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-semibold">
                            {bill.resident_name} · {bill.invoice_code}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Kamar {bill.room_number} · jatuh tempo {dateLabel(bill.due_date)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Sisa {formatIDR(bill.outstanding_amount)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            asChild
                            size="sm"
                            variant="default"
                            className="min-h-10 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                          >
                            <Link
                              to="/tenants/$residentId"
                              params={{ residentId: bill.resident_id }}
                            >
                              <Eye className="mr-2 h-4 w-4" /> Lihat detail
                            </Link>
                          </Button>
                          <ReminderComposerDialog
                            propertyId={currentPropertyId}
                            residentId={bill.resident_id}
                            invoices={[bill]}
                            currentMonthInvoiceId={bill.id}
                            triggerClassName="min-h-10 rounded-lg border-success bg-success text-success-foreground shadow-sm hover:bg-success/90"
                          />
                        </div>
                      </article>
                    ))}
                  </CardContent>
                </Card>
                <ReminderPagination
                  offset={offset}
                  total={activeTotal}
                  visibleCount={visibleBills.length}
                  loading={loading}
                  onPrevious={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  onNext={() => setOffset(offset + PAGE_SIZE)}
                />
              </div>
            ) : (
              <EmptyState
                icon={<CreditCard className="h-5 w-5" />}
                title="Tidak ada tagihan aktif"
                description="Semua tagihan bulan berjalan sudah lunas atau belum tersedia."
              />
            )
          ) : filteredLeases.length ? (
            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {MILESTONES.find((item) => item.key === tab)?.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {visibleLeases.map((item) => (
                    <LeaseRow
                      key={item.lease_id}
                      item={item}
                      propertyId={currentPropertyId}
                      onReminderRecorded={() => void load()}
                    />
                  ))}
                </CardContent>
              </Card>
              <ReminderPagination
                offset={offset}
                total={activeTotal}
                visibleCount={visibleLeases.length}
                loading={loading}
                onPrevious={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                onNext={() => setOffset(offset + PAGE_SIZE)}
              />
            </div>
          ) : (
            <EmptyState
              icon={<BellRing className="h-5 w-5" />}
              title="Tidak ada pekerjaan pada kelompok ini"
              description="Item akan muncul kembali jika kondisi yang mendasarinya membutuhkan tindakan."
            />
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
