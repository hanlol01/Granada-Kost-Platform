import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  CalendarPlus,
  Clock3,
  Eye,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeaseCreatePage } from "@/components/leases/LeaseCreatePage";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useResidents,
  type ContractSettlementStage,
  type RentPaymentStatus,
  type ResidentListRecord,
  type ResidentStatus,
} from "@/hooks/useResidents";
import { useAuth } from "@/lib/auth";
import { isAdminUxLeaseEnabled } from "@/lib/features";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

type TenantRouteSearch = { flow?: "new-lease"; bookingLeadId?: string };
type DeadlineTarget = "settlement" | "lease_end";

const DEADLINE_DAY_OPTIONS = [7, 14, 30] as const;

const deadlineTargetCopy: Record<DeadlineTarget, { resultLabel: string }> = {
  settlement: {
    resultLabel: "tenggat checkpoint",
  },
  lease_end: {
    resultLabel: "masa sewa berakhir",
  },
};

function validateSearch(raw: Record<string, unknown>): TenantRouteSearch {
  const bookingLeadId =
    typeof raw.bookingLeadId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.bookingLeadId)
      ? raw.bookingLeadId
      : undefined;
  return { flow: raw.flow === "new-lease" ? "new-lease" : undefined, bookingLeadId };
}

export const Route = createFileRoute("/tenants")({
  validateSearch,
  component: TenantsRoute,
});

const PAGE_SIZE = 20;

function TenantsRoute() {
  const showsResidentDetail = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/tenants/$residentId"),
  });

  return showsResidentDetail ? <Outlet /> : <TenantsPage />;
}

export function ResidentStatusPill({ status }: { status: ResidentListRecord["residentStatus"] }) {
  const presentation: Record<ResidentStatus, { label: string; className: string }> = {
    draft: { label: "Draf", className: "bg-muted text-muted-foreground" },
    pending_activation: { label: "Menunggu aktivasi", className: "bg-warning/15 text-warning" },
    active: { label: "Aktif", className: "bg-success/15 text-success" },
    inactive: { label: "Nonaktif", className: "bg-muted text-muted-foreground" },
    archived: { label: "Diarsipkan", className: "bg-muted text-muted-foreground" },
  };
  const current = presentation[status];
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", current.className)}
    >
      {current.label}
    </span>
  );
}

export function AccountStatusPill({ status }: { status: ResidentListRecord["accountStatus"] }) {
  const label = {
    active: "Akun aktif",
    inactive: "Akun nonaktif",
    suspended: "Akun ditangguhkan",
    not_provisioned: "Belum memiliki akun",
  }[status];
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

export function RentPaymentStatusPill({
  status,
}: {
  status: ResidentListRecord["rentPaymentStatus"];
}) {
  const presentation: Record<RentPaymentStatus, { label: string; className: string }> = {
    none: { label: "Belum ada pembayaran", className: "bg-muted text-muted-foreground" },
    pending_verification: {
      label: "Menunggu verifikasi",
      className: "bg-warning/15 text-warning",
    },
    booking_fee: {
      label: "Booking fee",
      className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    },
    down_payment: { label: "DP / uang muka", className: "bg-primary-soft text-primary" },
    initial_month_payment: {
      label: "Pembayaran awal 1 bulan",
      className: "bg-primary-soft text-primary",
    },
    partial_payment: { label: "Bayar sebagian", className: "bg-warning/15 text-warning" },
    paid_in_full: { label: "Lunas", className: "bg-success/15 text-success" },
    reversed_refunded: {
      label: "Direversal / Refund",
      className: "bg-destructive/15 text-destructive",
    },
    outstanding_balance: {
      label: "Ada saldo tunggakan",
      className: "bg-destructive/15 text-destructive",
    },
  };
  const current = presentation[status];
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", current.className)}
    >
      {current.label}
    </span>
  );
}

export function SettlementStagePill({
  stage,
}: {
  stage: ResidentListRecord["contractSettlementStage"];
}) {
  const presentation: Record<ContractSettlementStage, { label: string; className: string }> = {
    none: { label: "Belum ada penyewaan", className: "bg-muted text-muted-foreground" },
    awaiting_activation: { label: "Menunggu aktivasi", className: "bg-warning/15 text-warning" },
    checkpoint_one_pending: { label: "Checkpoint 1", className: "bg-primary-soft text-primary" },
    checkpoint_one_met: {
      label: "Checkpoint 1 terpenuhi",
      className: "bg-success/15 text-success",
    },
    checkpoint_two_pending: { label: "Checkpoint 2", className: "bg-primary-soft text-primary" },
    checkpoint_two_met: {
      label: "Checkpoint 2 terpenuhi",
      className: "bg-success/15 text-success",
    },
    final_settlement_due: { label: "Pelunasan akhir", className: "bg-warning/15 text-warning" },
    overdue: { label: "Tunggakan checkpoint", className: "bg-destructive/15 text-destructive" },
    overdue_grace: { label: "Masa toleransi", className: "bg-warning/15 text-warning" },
    extended: { label: "Perpanjangan aktif", className: "bg-primary-soft text-primary" },
    admin_action_required: {
      label: "Tindakan admin diperlukan",
      className: "bg-destructive/15 text-destructive",
    },
    termination_eligible: {
      label: "Tindakan admin diperlukan",
      className: "bg-destructive/15 text-destructive",
    },
    termination_pending: {
      label: "Proses pemberhentian",
      className: "bg-destructive/15 text-destructive",
    },
    paid_in_full: { label: "Lunas", className: "bg-success/15 text-success" },
    preactivation_cancelled: {
      label: "Dibatalkan pra-aktivasi",
      className: "bg-muted text-muted-foreground",
    },
  };
  const current = presentation[stage];
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", current.className)}
    >
      {current.label}
    </span>
  );
}

export function formatResidentDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function leaseDuration(record: ResidentListRecord): string {
  if (record.leaseAuthorityCount > 1) return "Perlu rekonsiliasi";
  if (!record.leaseStart || !record.leaseEnd) return "Belum ada penyewaan";
  const start = new Date(`${record.leaseStart}T00:00:00Z`);
  const end = new Date(`${record.leaseEnd}T00:00:00Z`);
  const months = Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth(),
  );
  return `${months} bulan · ${formatResidentDate(record.leaseStart)} – ${formatResidentDate(record.leaseEnd)}`;
}

function TenantsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const [residentStatus, setResidentStatus] = useState<ResidentStatus | "all">("all");
  const [rentPaymentStatus, setRentPaymentStatus] = useState<
    Exclude<RentPaymentStatus, "none"> | "all"
  >("all");
  const [gender, setGender] = useState<"male" | "female" | "other" | "all">("all");
  const [tenancyStatus, setTenancyStatus] = useState<
    "awaiting_activation" | "active" | "none" | "all"
  >("all");
  const [settlementStage, setSettlementStage] = useState<
    Exclude<ContractSettlementStage, "none"> | "all"
  >("all");
  const [deadlineTarget, setDeadlineTarget] = useState<DeadlineTarget>("settlement");
  const [deadlineWithinDays, setDeadlineWithinDays] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [offset, setOffset] = useState(0);
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const hasLeaseAuthority =
    (user?.roles ?? []).some((role) => ["owner", "manager", "admin"].includes(role)) &&
    hasPermission("lease.read") &&
    hasPermission("lease.manage") &&
    Boolean(currentPropertyId);
  const leaseCreateEnabled = hasLeaseAuthority && isAdminUxLeaseEnabled();
  const residents = useResidents({
    q,
    status: residentStatus === "all" ? undefined : residentStatus,
    rentPaymentStatus: rentPaymentStatus === "all" ? undefined : rentPaymentStatus,
    gender: gender === "all" ? undefined : gender,
    tenancyStatus: tenancyStatus === "all" ? undefined : tenancyStatus,
    settlementStage: settlementStage === "all" ? undefined : settlementStage,
    settlementDueWithinDays:
      deadlineTarget === "settlement" && deadlineWithinDays !== ""
        ? Number(deadlineWithinDays)
        : undefined,
    leaseEndWithinDays:
      deadlineTarget === "lease_end" && deadlineWithinDays !== ""
        ? Number(deadlineWithinDays)
        : undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const list = residents.data?.data ?? [];
  const total = residents.data?.meta.total ?? 0;
  const hasFilter =
    q.trim() !== "" ||
    residentStatus !== "all" ||
    rentPaymentStatus !== "all" ||
    gender !== "all" ||
    tenancyStatus !== "all" ||
    settlementStage !== "all" ||
    deadlineWithinDays !== "" ||
    Boolean(createdFrom) ||
    Boolean(createdTo);
  const activeFilterCount =
    Number(q.trim() !== "") +
    Number(residentStatus !== "all") +
    Number(rentPaymentStatus !== "all") +
    Number(gender !== "all") +
    Number(tenancyStatus !== "all") +
    Number(settlementStage !== "all") +
    Number(deadlineWithinDays !== "") +
    Number(Boolean(createdFrom)) +
    Number(Boolean(createdTo));
  const filterSignature = [
    q.trim(),
    residentStatus,
    rentPaymentStatus,
    gender,
    tenancyStatus,
    settlementStage,
    deadlineTarget,
    deadlineWithinDays,
    createdFrom,
    createdTo,
  ].join("|");
  const filterCriteria = [
    q.trim() ? `pencarian "${q.trim()}"` : "",
    residentStatus !== "all"
      ? `status penghuni: ${
          {
            draft: "Draf",
            pending_activation: "Menunggu aktivasi",
            active: "Aktif",
            inactive: "Nonaktif",
            archived: "Diarsipkan",
          }[residentStatus]
        }`
      : "",
    rentPaymentStatus !== "all"
      ? `status pembayaran: ${
          {
            pending_verification: "Menunggu verifikasi",
            booking_fee: "Booking fee",
            down_payment: "DP / uang muka",
            initial_month_payment: "Pembayaran awal 1 bulan",
            partial_payment: "Bayar sebagian",
            paid_in_full: "Lunas",
            reversed_refunded: "Direversal / Refund",
            outstanding_balance: "Ada saldo tunggakan",
          }[rentPaymentStatus]
        }`
      : "",
    gender !== "all"
      ? `jenis kelamin: ${{ male: "Putra", female: "Putri", other: "Lainnya" }[gender]}`
      : "",
    tenancyStatus !== "all"
      ? `status penyewaan: ${
          {
            awaiting_activation: "Menunggu aktivasi kamar",
            active: "Penyewaan aktif",
            none: "Belum ada penyewaan",
          }[tenancyStatus]
        }`
      : "",
    settlementStage !== "all"
      ? `tahap pelunasan: ${
          {
            awaiting_activation: "Menunggu aktivasi",
            checkpoint_one_pending: "Checkpoint 1",
            checkpoint_one_met: "Checkpoint 1 terpenuhi",
            checkpoint_two_pending: "Checkpoint 2",
            checkpoint_two_met: "Checkpoint 2 terpenuhi",
            final_settlement_due: "Pelunasan akhir",
            overdue: "Tunggakan checkpoint",
            overdue_grace: "Masa toleransi",
            extended: "Perpanjangan aktif",
            admin_action_required: "Tindakan admin diperlukan",
            termination_eligible: "Pemberhentian tersedia",
            termination_pending: "Dalam proses pemberhentian",
            paid_in_full: "Lunas",
            preactivation_cancelled: "Dibatalkan pra-aktivasi",
            none: "Belum ada penyewaan",
          }[settlementStage]
        }`
      : "",
    deadlineWithinDays !== ""
      ? `${deadlineTargetCopy[deadlineTarget].resultLabel} dalam ${deadlineWithinDays} hari`
      : "",
    createdFrom && createdTo
      ? `dibuat ${formatResidentDate(createdFrom)} sampai ${formatResidentDate(createdTo)}`
      : createdFrom
        ? `dibuat mulai ${formatResidentDate(createdFrom)}`
        : createdTo
          ? `dibuat sampai ${formatResidentDate(createdTo)}`
          : "",
  ].filter(Boolean);

  useEffect(() => {
    setOffset(0);
  }, [currentPropertyId]);

  const resetFilters = () => {
    setQ("");
    setResidentStatus("all");
    setRentPaymentStatus("all");
    setGender("all");
    setTenancyStatus("all");
    setSettlementStage("all");
    setDeadlineTarget("settlement");
    setDeadlineWithinDays("");
    setCreatedFrom("");
    setCreatedTo("");
    setOffset(0);
  };

  if (search.flow === "new-lease") {
    return (
      <LeaseCreatePage
        bookingLeadId={search.bookingLeadId}
        onCreated={async () => {
          await residents.refetch();
          await navigate({ search: {}, replace: true });
        }}
      />
    );
  }

  return (
    <AppShell
      title="Data Penghuni & Penyewaan"
      subtitle={residents.data ? `${total} penghuni terdaftar` : "Memuat..."}
      actions={
        leaseCreateEnabled ? (
          <Button asChild className="min-h-11">
            <Link to="/tenants" search={{ flow: "new-lease" }}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Tambah Penyewaan
            </Link>
          </Button>
        ) : null
      }
    >
      <Card className="mb-5 border-border bg-muted/15">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Filter penghuni
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="relative md:col-span-2 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setOffset(0);
                }}
                placeholder="Cari nama, WhatsApp, email, unit, atau pendidikan..."
                className="min-h-11 pl-9"
                aria-label="Cari penghuni"
              />
            </div>
            <Select
              value={residentStatus}
              onValueChange={(value) => {
                setResidentStatus(value as ResidentStatus | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status penghuni">
                <SelectValue placeholder="Status penghuni" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Operasional (aktif & menunggu aktivasi)</SelectItem>
                <SelectItem value="pending_activation">Menunggu aktivasi</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
                <SelectItem value="draft">Draf</SelectItem>
                <SelectItem value="archived">Diarsipkan</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-2 xl:col-span-2">
              <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-2">
                <HeroUiDatePicker
                  ariaLabel="Tanggal pendaftaran awal"
                  id="resident-created-from"
                  maxDate={createdTo || undefined}
                  onChange={(value) => {
                    setCreatedFrom(value ?? "");
                    setOffset(0);
                  }}
                  placeholder="dd/mm/yyyy"
                  value={createdFrom}
                />
                <span
                  aria-hidden="true"
                  className="text-center text-base font-semibold text-muted-foreground"
                >
                  -
                </span>
                <HeroUiDatePicker
                  ariaLabel="Tanggal pendaftaran akhir"
                  id="resident-created-to"
                  minDate={createdFrom || undefined}
                  onChange={(value) => {
                    setCreatedTo(value ?? "");
                    setOffset(0);
                  }}
                  placeholder="dd/mm/yyyy"
                  value={createdTo}
                />
              </div>
            </div>
            <Select
              value={rentPaymentStatus}
              onValueChange={(value) => {
                setRentPaymentStatus(value as Exclude<RentPaymentStatus, "none"> | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status pembayaran sewa">
                <SelectValue placeholder="Status pembayaran sewa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status pembayaran</SelectItem>
                <SelectItem value="pending_verification">Menunggu verifikasi</SelectItem>
                <SelectItem value="booking_fee">Booking fee</SelectItem>
                <SelectItem value="down_payment">DP / uang muka</SelectItem>
                <SelectItem value="initial_month_payment">Pembayaran awal 1 bulan</SelectItem>
                <SelectItem value="partial_payment">Bayar sebagian</SelectItem>
                <SelectItem value="paid_in_full">Lunas</SelectItem>
                <SelectItem value="reversed_refunded">Direversal / Refund</SelectItem>
                <SelectItem value="outstanding_balance">Ada saldo tunggakan</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={gender}
              onValueChange={(value) => {
                setGender(value as "male" | "female" | "other" | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter jenis kelamin">
                <SelectValue placeholder="Jenis kelamin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis kelamin</SelectItem>
                <SelectItem value="male">Putra</SelectItem>
                <SelectItem value="female">Putri</SelectItem>
                <SelectItem value="other">Lainnya</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={tenancyStatus}
              onValueChange={(value) => {
                setTenancyStatus(value as "awaiting_activation" | "active" | "none" | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter status penyewaan">
                <SelectValue placeholder="Status penyewaan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status penyewaan</SelectItem>
                <SelectItem value="awaiting_activation">Menunggu aktivasi kamar</SelectItem>
                <SelectItem value="active">Penyewaan aktif</SelectItem>
                <SelectItem value="none">Belum ada penyewaan</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={settlementStage}
              onValueChange={(value) => {
                setSettlementStage(value as Exclude<ContractSettlementStage, "none"> | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11" aria-label="Filter tahap pelunasan">
                <SelectValue placeholder="Tahap pelunasan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tahap pelunasan</SelectItem>
                <SelectItem value="awaiting_activation">Menunggu aktivasi</SelectItem>
                <SelectItem value="checkpoint_one_pending">Checkpoint 1</SelectItem>
                <SelectItem value="checkpoint_one_met">Checkpoint 1 terpenuhi</SelectItem>
                <SelectItem value="checkpoint_two_pending">Checkpoint 2</SelectItem>
                <SelectItem value="checkpoint_two_met">Checkpoint 2 terpenuhi</SelectItem>
                <SelectItem value="final_settlement_due">Pelunasan akhir</SelectItem>
                <SelectItem value="overdue">Tunggakan checkpoint</SelectItem>
                <SelectItem value="overdue_grace">Masa toleransi</SelectItem>
                <SelectItem value="extended">Perpanjangan aktif</SelectItem>
                <SelectItem value="admin_action_required">Tindakan admin diperlukan</SelectItem>
                <SelectItem value="termination_pending">Dalam proses pemberhentian</SelectItem>
                <SelectItem value="paid_in_full">Lunas</SelectItem>
                <SelectItem value="preactivation_cancelled">Dibatalkan pra-aktivasi</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid gap-2 md:col-span-2 sm:grid-cols-2 xl:col-span-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
              <Select
                value={deadlineTarget}
                onValueChange={(value) => {
                  setDeadlineTarget(value as DeadlineTarget);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="min-h-11" aria-label="Sasaran tenggat yang dipantau">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="settlement">Tenggat checkpoint pembayaran</SelectItem>
                  <SelectItem value="lease_end">Akhir masa sewa</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                {deadlineWithinDays === "" ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    Tenggat maksimal (hari)
                  </span>
                ) : null}
                <Input
                  type="number"
                  min="0"
                  max="3650"
                  inputMode="numeric"
                  value={deadlineWithinDays}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "" || (/^\d+$/.test(next) && Number(next) <= 3650)) {
                      setDeadlineWithinDays(next);
                      setOffset(0);
                    }
                  }}
                  placeholder="Tenggat ≤ hari"
                  className="min-h-11 pl-9 placeholder:text-transparent"
                  aria-label="Tenggat maksimal dalam hari"
                />
              </div>
              <div
                className="grid grid-cols-3 gap-2 sm:col-span-2 xl:col-span-1"
                role="group"
                aria-label="Pilihan cepat jangka waktu tenggat"
              >
                {DEADLINE_DAY_OPTIONS.map((days) => {
                  const value = String(days);
                  const selected = deadlineWithinDays === value;
                  return (
                    <Button
                      key={days}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      className="min-h-11 px-2"
                      aria-pressed={selected}
                      aria-label={`${days} hari`}
                      title={`${days} hari`}
                      onClick={() => {
                        setDeadlineWithinDays(selected ? "" : value);
                        setOffset(0);
                      }}
                    >
                      {days}
                    </Button>
                  );
                })}
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:col-span-2 xl:col-start-6 xl:col-span-1"
              disabled={!hasFilter}
              onClick={resetFilters}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Reset Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {!residents.isLoading && !residents.isFetching && !residents.error ? (
        <FilterResultNotice
          key={filterSignature}
          className="mb-5"
          entityLabel="penghuni"
          resultCount={total}
          activeFilterCount={activeFilterCount}
          searchTerm={q}
          criteria={filterCriteria}
        />
      ) : null}

      {residents.error ? (
        <ErrorState
          error={residents.error}
          onRetry={() => residents.refetch()}
          title="Gagal memuat penghuni"
        />
      ) : residents.isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border" role="status" aria-label="Memuat penghuni">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={hasFilter ? "Tidak ada penghuni cocok" : "Belum ada penghuni"}
              description={
                hasFilter
                  ? "Ubah kata kunci pencarian atau kosongkan filter."
                  : "Penyewaan baru disiapkan dari halaman ini."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">No</th>
                    <th className="px-4 py-3 font-medium">Nama Penghuni</th>
                    <th className="px-4 py-3 font-medium">No Unit Kamar</th>
                    <th className="px-4 py-3 font-medium">Universitas</th>
                    <th className="px-4 py-3 font-medium">Durasi Sewa</th>
                    <th className="px-4 py-3 font-medium">Status Pembayaran</th>
                    <th className="px-4 py-3 font-medium">Tahap Pelunasan</th>
                    <th className="px-4 py-3 font-medium">Status Penghuni</th>
                    <th className="px-4 py-3 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((resident, index) => (
                    <tr
                      key={resident.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-muted-foreground">{offset + index + 1}</td>
                      <td className="px-4 py-3 font-medium">{resident.fullName}</td>
                      <td className="px-4 py-3">{resident.roomNumber ?? "Belum ditempatkan"}</td>
                      <td className="px-4 py-3">{resident.university ?? "Belum diisi"}</td>
                      <td className="px-4 py-3">
                        <p>{leaseDuration(resident)}</p>
                        {deadlineTarget === "lease_end" && deadlineWithinDays !== "" && resident.leaseEnd ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Akhir sewa: {formatResidentDate(resident.leaseEnd)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <RentPaymentStatusPill status={resident.rentPaymentStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <SettlementStagePill stage={resident.contractSettlementStage} />
                          {resident.contractSettlementDueDate ? (
                            <p className="text-xs text-muted-foreground">
                              Tenggat checkpoint: {formatResidentDate(resident.contractSettlementDueDate)}
                            </p>
                          ) : null}
                          {resident.leaseExpiredAdminActionRequired ? (
                            <span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                              Masa sewa berakhir â€” tindakan admin
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ResidentStatusPill status={resident.residentStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="default" size="sm" className="min-h-11">
                          <Link
                            to="/tenants/$residentId"
                            params={{ residentId: resident.id }}
                            aria-label={`Lihat detail ${resident.fullName}`}
                          >
                            <Eye className="mr-1 h-4 w-4" /> Detail
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {list.map((resident) => (
                <Link
                  key={resident.id}
                  to="/tenants/$residentId"
                  params={{ residentId: resident.id }}
                  className="flex min-h-11 items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                    {resident.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{resident.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {resident.roomNumber ?? "Belum ditempatkan"} · {leaseDuration(resident)}
                    </p>
                    {deadlineWithinDays !== "" &&
                    (deadlineTarget === "settlement"
                      ? resident.contractSettlementDueDate
                      : resident.leaseEnd) ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {deadlineTarget === "settlement" ? "Tenggat checkpoint" : "Akhir sewa"}: {formatResidentDate(
                          deadlineTarget === "settlement"
                            ? resident.contractSettlementDueDate!
                            : resident.leaseEnd!,
                        )}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <RentPaymentStatusPill status={resident.rentPaymentStatus} />
                      <SettlementStagePill stage={resident.contractSettlementStage} />
                      {resident.leaseExpiredAdminActionRequired ? (
                        <span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                          Masa sewa berakhir â€” tindakan admin
                        </span>
                      ) : null}
                      <ResidentStatusPill status={resident.residentStatus} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
              <p className="text-xs text-muted-foreground">
                {offset + 1}–{Math.min(offset + list.length, total)} dari {total} penghuni
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
