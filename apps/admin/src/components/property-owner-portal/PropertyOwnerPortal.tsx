import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleDollarSign,
  CircleAlert,
  ClipboardList,
  Download,
  Eye,
  FileText,
  House,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/state";
import { OwnerPortalShell } from "@/components/property-owner-portal/OwnerPortalShell";
import { useAuth } from "@/lib/auth";
import { getOwnerPortalRoute } from "@/lib/property-owner-route-registry";
import {
  downloadOwnerReport,
  formatOwnerMoney,
  getOwnerPortalViewState,
  groupOwnerAssets,
  ownerPortalNavigation,
  propertyOwnerPortalApi,
  type OwnerPortal,
  type OwnerAssetFilters,
  type OwnerKostType,
  type OwnerPortalTab,
  type OwnerFinance,
  type OwnerReport,
} from "@/lib/property-owner-portal";

const statusLabel: Record<string, string> = {
  vacant: "Kosong",
  reserved: "Dipesan",
  occupied: "Terisi",
  maintenance: "Perawatan",
  inactive: "Tidak aktif",
  requires_review: "Perlu peninjauan",
  draft: "Draf",
  awaiting_activation: "Menunggu aktivasi",
  active: "Aktif",
  ended: "Berakhir",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  transferred: "Dialihkan",
  recognized: "Diakui",
  reversed: "Dibatalkan",
  reversal: "Pembalikan",
  refund: "Pengembalian",
  transfer_proration: "Prorata pengalihan",
  clawback: "Koreksi penarikan",
  ready_for_review: "Siap ditinjau",
  approved: "Disetujui",
  paid: "Dibayarkan",
  void: "Dibatalkan",
  payout: "Payout",
  unavailable: "Belum tersedia",
  awaiting_payout: "Menunggu payout",
  reconciled: "Terealisasi",
  scheduled: "Akan datang",
  historical: "Historis",
  empty: "Belum ada cakupan",
  current: "Berjalan",
  partially_paid: "Sebagian dibayar",
  overdue: "Terlambat",
  settled: "Lunas",
  not_available: "Belum tersedia",
  submitted: "Diajukan",
  acknowledged: "Diterima",
  in_progress: "Diproses",
  on_hold: "Ditunda",
  escalated: "Dieskalasi",
  resolved: "Terselesaikan",
  reopened: "Dibuka kembali",
  closed: "Ditutup",
  open: "Terbuka",
  assigned: "Ditugaskan",
  rework_required: "Perlu perbaikan",
  verified: "Terverifikasi",
  unread: "Belum dibaca",
  read: "Dibaca",
  archived: "Diarsipkan",
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
  normal: "Normal",
};

const periodNow = (): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month") => parts.find((item) => item.type === type)?.value;
  return `${part("year") ?? "1970"}-${part("month") ?? "01"}`;
};

const localDate = (value: string | null): string => {
  if (!value) return "Tidak tercatat";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const labelOf = (value: string | null | undefined): string =>
  value ? (statusLabel[value] ?? value) : "Tidak aktif";

function StatusPill({ value }: { value: string | null | undefined }) {
  const warning = ["maintenance", "requires_review", "on_hold", "urgent", "high"].includes(
    value ?? "",
  );
  const muted = ["vacant", "inactive", "ended", "cancelled", "archived", "low"].includes(
    value ?? "",
  );
  return (
    <Badge
      variant="outline"
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        warning
          ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : muted
            ? "border-border bg-muted/50 text-muted-foreground"
            : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {labelOf(value)}
    </Badge>
  );
}

function Metric({
  label,
  value,
  description,
  icon: Icon,
  href,
  actionLabel,
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {href && actionLabel ? (
          <Link
            to={href as never}
            className="mt-auto inline-flex min-h-9 items-center justify-between gap-2 rounded-lg border border-border/80 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PortalSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Dashboard({
  portal,
  onNavigate,
}: {
  portal: OwnerPortal;
  onNavigate: (tab: OwnerPortalTab) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.045] shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <House className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              Ringkasan kepemilikan
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Aset Anda dalam satu tampilan yang aman.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Informasi di bawah mengikuti cakupan penugasan kepemilikan yang berlaku untuk akun
              Anda. Tidak ada data penghuni atau tindakan operasional yang ditampilkan.
            </p>
          </div>
          <Button className="min-h-11 shrink-0" onClick={() => onNavigate("assets")}>
            Lihat aset saya
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aset aktif"
          value={`${portal.scope.buildingCount} bangunan`}
          description={`${portal.scope.roomCount} kamar dalam cakupan Anda`}
          icon={Building2}
          href="/property-owners/portal/assets"
          actionLabel="Buka aset"
        />
        <Metric
          label="Status hunian"
          value={`${portal.occupancy.occupiedCount} terisi`}
          description={`${portal.occupancy.vacantCount} kosong · ${portal.occupancy.reservedCount} dipesan`}
          icon={House}
          href="/property-owners/portal/occupancy"
          actionLabel="Lihat hunian"
        />
        <Metric
          label="Komplain terbuka"
          value={String(portal.issues.openComplaints)}
          description="Hanya ringkasan aset dalam cakupan Anda"
          icon={ClipboardList}
          href="/property-owners/portal/issues"
          actionLabel="Buka komplain"
        />
        <Metric
          label="Maintenance aktif"
          value={String(portal.issues.openMaintenance)}
          description="Tanpa catatan internal atau rincian biaya"
          icon={Wrench}
          href="/property-owners/portal/issues"
          actionLabel="Buka maintenance"
        />
      </section>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" /> Perlu perhatian
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ringkasan ini berasal dari data operasional yang sudah dibatasi ke aset Anda.
            </p>
          </div>
          <StatusPill
            value={
              portal.issues.openComplaints > 0 ||
              portal.issues.openMaintenance > 0 ||
              portal.issues.unreadNotifications > 0
                ? "open"
                : "reconciled"
            }
          />
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          {portal.issues.unreadNotifications > 0 ? (
            <Link
              to="/property-owners/portal/notifications"
              className="group rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <p className="text-sm font-semibold text-foreground">Notifikasi belum dibaca</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-primary">
                {portal.issues.unreadNotifications}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Buka notifikasi{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : null}
          {portal.issues.openComplaints > 0 ? (
            <Link
              to="/property-owners/portal/issues"
              className="group rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <p className="text-sm font-semibold text-foreground">Komplain terbuka</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-300">
                {portal.issues.openComplaints}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Lihat komplain{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : null}
          {portal.issues.openMaintenance > 0 ? (
            <Link
              to="/property-owners/portal/issues"
              className="group rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <p className="text-sm font-semibold text-foreground">Maintenance aktif</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-300">
                {portal.issues.openMaintenance}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Lihat maintenance{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : null}
          {portal.issues.unreadNotifications === 0 &&
          portal.issues.openComplaints === 0 &&
          portal.issues.openMaintenance === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:col-span-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-foreground">Tidak ada perhatian baru</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tidak ada notifikasi belum dibaca, komplain terbuka, atau maintenance aktif pada
                  cakupan saat ini.
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-base">Akses cepat</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Buka halaman Owner tanpa kembali ke menu utama.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {ownerPortalNavigation
            .filter((route) => route.id !== "dashboard" && route.id !== "account")
            .map((route) => {
              const destination = getOwnerPortalRoute(route.id);
              return destination ? (
                <Link
                  key={route.id}
                  to={destination.to as never}
                  className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span>{route.label}</span>
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : null;
            })}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Batas akses owner</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pembayaran, pendapatan yang diakui, entitlement owner, settlement, dan payout adalah
              otoritas berbeda. Keuangan hanya disajikan sebagai laporan pada periode yang sah.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const assetGroupLabel: Record<OwnerKostType, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

function AssetCard({ asset }: { asset: OwnerPortal["assets"][number] }) {
  return (
    <Card className="border-border/80 shadow-sm transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-md">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{asset.roomCode}</CardTitle>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {asset.buildingName ?? asset.buildingCode ?? "Bangunan terdaftar"}
          </p>
        </div>
        <StatusPill value={asset.roomStatus} />
      </CardHeader>
      <CardContent className="space-y-4 border-t border-border/70 pt-4">
        <dl className="grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status sewa</dt>
            <dd className="font-medium text-foreground">{labelOf(asset.leaseStatus)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Berakhir sewa</dt>
            <dd className="font-medium text-foreground">{localDate(asset.leaseEndDate)}</dd>
          </div>
        </dl>
        <Button asChild variant="outline" className="min-h-10 w-full">
          <Link to="/property-owners/portal/assets/$roomCode" params={{ roomCode: asset.roomCode }}>
            <Eye className="mr-2 h-4 w-4" /> Detail kamar
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AssetCategory({
  kostType,
  assets,
  open,
  onOpenChange,
}: {
  kostType: OwnerKostType;
  assets: OwnerPortal["assets"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="rounded-2xl border border-border/80 bg-card shadow-sm"
    >
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {kostType === "rukost" ? (
              <House className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{assetGroupLabel[kostType]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {assets.length} kamar dalam cakupan kepemilikan aktif
            </p>
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="min-h-10 shrink-0">
            {open ? (
              <ChevronUp className="mr-2 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-2 h-4 w-4" />
            )}
            {open ? "Ciutkan" : "Tampilkan"}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="border-t border-border/70">
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard key={asset.roomCode} asset={asset} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Assets({ portal }: { portal: OwnerPortal }) {
  const pageSize = 12;
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<OwnerAssetFilters>({
    query: "",
    roomStatus: "all",
    leaseStatus: "all",
  });
  const [expanded, setExpanded] = useState<Record<OwnerKostType, boolean>>({
    rukost: true,
    apartkost: true,
  });
  const assetsQuery = useQuery({
    queryKey: ["property-owner", "assets", filters, offset],
    queryFn: () =>
      propertyOwnerPortalApi.getAssets({
        q: filters.query || undefined,
        room_status: filters.roomStatus === "all" ? undefined : filters.roomStatus,
        lease_status: filters.leaseStatus === "all" ? undefined : filters.leaseStatus,
        limit: pageSize,
        offset,
      }),
    staleTime: 20_000,
  });
  const serverAssets =
    assetsQuery.data?.items.map((asset) => ({
      roomCode: asset.roomCode,
      roomStatus: asset.roomStatus,
      kostType: asset.kostType,
      buildingCode: asset.buildingCode,
      buildingName: asset.buildingName,
      leaseStatus: asset.lease?.status ?? null,
      leaseEndDate: asset.lease?.endDate ?? null,
    })) ?? portal.assets;
  const groups = groupOwnerAssets(serverAssets);
  const hasFilter = filters.query || filters.roomStatus !== "all" || filters.leaseStatus !== "all";

  return (
    <PortalSection
      eyebrow="Cakupan aktif"
      title="Aset saya"
      description="Daftar berikut ditentukan oleh penugasan kepemilikan yang berlaku, bukan oleh cache atau pilihan di antarmuka."
    >
      {portal.assets.length ? (
        <div className="space-y-5">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(11rem,0.45fr)_minmax(11rem,0.45fr)_auto] md:items-end">
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Cari aset
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Cari aset owner"
                    value={filters.query}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, query: event.target.value }));
                      setOffset(0);
                    }}
                    placeholder="Kode kamar atau nama bangunan"
                    className="min-h-11 rounded-lg bg-background pl-10"
                  />
                </span>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Status kamar
                <Select
                  value={filters.roomStatus}
                  onValueChange={(value) => {
                    setFilters((current) => ({
                      ...current,
                      roomStatus: value as OwnerAssetFilters["roomStatus"],
                    }));
                    setOffset(0);
                  }}
                >
                  <SelectTrigger aria-label="Filter status kamar" className="min-h-11 rounded-lg">
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="vacant">Kosong</SelectItem>
                    <SelectItem value="reserved">Dipesan</SelectItem>
                    <SelectItem value="occupied">Terisi</SelectItem>
                    <SelectItem value="maintenance">Perawatan</SelectItem>
                    <SelectItem value="inactive">Tidak aktif</SelectItem>
                    <SelectItem value="requires_review">Perlu peninjauan</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Status sewa
                <Select
                  value={filters.leaseStatus}
                  onValueChange={(value) => {
                    setFilters((current) => ({
                      ...current,
                      leaseStatus: value as OwnerAssetFilters["leaseStatus"],
                    }));
                    setOffset(0);
                  }}
                >
                  <SelectTrigger aria-label="Filter status sewa" className="min-h-11 rounded-lg">
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="draft">Draf</SelectItem>
                    <SelectItem value="awaiting_activation">Menunggu aktivasi</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="ended">Berakhir</SelectItem>
                    <SelectItem value="completed">Selesai</SelectItem>
                    <SelectItem value="cancelled">Dibatalkan</SelectItem>
                    <SelectItem value="transferred">Dialihkan</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {hasFilter ? (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setFilters({ query: "", roomStatus: "all", leaseStatus: "all" });
                    setOffset(0);
                  }}
                >
                  Reset filter
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {assetsQuery.error ? (
            <ErrorState
              error={assetsQuery.error}
              onRetry={() => void assetsQuery.refetch()}
              title="Aset Owner tidak dapat dimuat"
              backTo="/property-owners/portal/assets"
            />
          ) : groups.length ? (
            groups.map((group) => (
              <AssetCategory
                key={group.kostType}
                kostType={group.kostType}
                assets={group.assets}
                open={expanded[group.kostType]}
                onOpenChange={(open) =>
                  setExpanded((current) => ({ ...current, [group.kostType]: open }))
                }
              />
            ))
          ) : (
            <Card className="border-dashed border-border/90 shadow-none">
              <CardContent className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
                <Search className="h-5 w-5 text-muted-foreground" />
                <h3 className="mt-3 font-semibold">Aset tidak ditemukan</h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  Ubah atau bersihkan filter untuk melihat aset dalam cakupan Anda.
                </p>
              </CardContent>
            </Card>
          )}
          {assetsQuery.data && assetsQuery.data.total > pageSize ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Menampilkan {offset + 1}–{Math.min(offset + pageSize, assetsQuery.data.total)} dari{" "}
                {assetsQuery.data.total} aset
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + pageSize >= assetsQuery.data.total}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Card className="border-dashed border-border/90 shadow-none">
          <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold">Belum ada aset aktif</h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              Aset akan tampil otomatis saat penugasan kepemilikan mulai berlaku.
            </p>
          </CardContent>
        </Card>
      )}
    </PortalSection>
  );
}

function PeriodToolbar({
  period,
  setPeriod,
  onExport,
}: {
  period: string;
  setPeriod: (period: string) => void;
  onExport: (format: "pdf" | "xlsx") => void;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Periode laporan
          <MonthYearPicker value={period} onChange={setPeriod} label="Periode laporan Owner" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="outline" onClick={() => onExport("pdf")}>
            <FileText className="mr-2 h-4 w-4" /> Unduh PDF
          </Button>
          <Button className="min-h-11" variant="outline" onClick={() => onExport("xlsx")}>
            <Download className="mr-2 h-4 w-4" /> Unduh XLSX
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportSummary({ report }: { report: OwnerReport }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Pendapatan diakui"
        value={formatOwnerMoney(report.summary.grossEarnedRent)}
        description="Pendapatan yang diakui pada periode ini"
        icon={ReceiptText}
      />
      <Metric
        label="Entitlement owner"
        value={formatOwnerMoney(report.summary.ownerEntitlement)}
        description="Bukan transaksi pembayaran langsung"
        icon={CircleDollarSign}
      />
      <Metric
        label="Biaya layanan"
        value={formatOwnerMoney(report.summary.managementFee)}
        description="Terpisah dari entitlement owner"
        icon={ShieldCheck}
      />
      <Metric
        label="Payout tercatat"
        value={formatOwnerMoney(report.summary.paidOut)}
        description="Hanya payout settlement yang berwenang"
        icon={CheckCircle2}
      />
    </section>
  );
}

function FinanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Rows({ title, rows }: { title: string; rows: Array<Record<string, string>> }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <div className="divide-y divide-border/70">
            {rows.map((row, index) => (
              <dl
                key={`${title}-${index}`}
                className="grid gap-x-8 gap-y-3 px-5 py-4 sm:grid-cols-2"
              >
                {Object.entries(row).map(([key, value]) => (
                  <div key={key} className="flex min-w-0 items-start justify-between gap-4 text-sm">
                    <dt className="shrink-0 text-muted-foreground">{key}</dt>
                    <dd className="min-w-0 text-right font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            Tidak ada data pada periode ini.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Finance({ finance }: { finance: OwnerFinance }) {
  const [query, setQuery] = useState("");
  const [earningStatus, setEarningStatus] = useState("all");
  const [settlementStatus, setSettlementStatus] = useState("all");
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const earnings = finance.earnings.filter((row) => {
    const room = row.roomCode.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      (!normalizedQuery || room.includes(normalizedQuery)) &&
      (earningStatus === "all" || row.earningStatus === earningStatus)
    );
  });
  const settlements = finance.settlements.filter(
    (row) => settlementStatus === "all" || row.settlementStatus === settlementStatus,
  );
  const resetFilters = () => {
    setQuery("");
    setEarningStatus("all");
    setSettlementStatus("all");
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pendapatan diakui"
          value={formatOwnerMoney(finance.summary.grossEarnedRent)}
          description="Pengakuan pendapatan periode ini"
          icon={ReceiptText}
        />
        <Metric
          label="Hak owner setelah penyesuaian"
          value={formatOwnerMoney(finance.summary.adjustedOwnerEntitlement)}
          description="Entitlement bukan pembayaran penghuni"
          icon={CircleDollarSign}
        />
        <Metric
          label="Biaya layanan"
          value={formatOwnerMoney(finance.summary.managementFee)}
          description="Terpisah dari hak owner"
          icon={ShieldCheck}
        />
        <Metric
          label="Payout tercatat"
          value={formatOwnerMoney(finance.summary.paidOut)}
          description="Payout atau pembalikan yang tercatat"
          icon={CheckCircle2}
        />
      </section>
      <Card className="border-primary/25 bg-primary/[0.045] shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Status settlement periode</CardTitle>
            <StatusPill value={finance.summary.settlementState} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-0 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <FinanceRow
            label="Penyesuaian owner"
            value={formatOwnerMoney(finance.summary.ownerAdjustments)}
          />
          <FinanceRow
            label="Settlement dalam periode"
            value={String(
              finance.summary.settlementCounts.draft +
                finance.summary.settlementCounts.readyForReview +
                finance.summary.settlementCounts.approved +
                finance.summary.settlementCounts.paid +
                finance.summary.settlementCounts.void,
            )}
          />
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(11rem,0.45fr)_minmax(11rem,0.45fr)_auto] md:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Cari kamar
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contoh: AK0503 atau RK-01-01"
              className="min-h-11"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status pendapatan
            <Select value={earningStatus} onValueChange={setEarningStatus}>
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="recognized">Diakui</SelectItem>
                <SelectItem value="reversed">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status settlement
            <Select value={settlementStatus} onValueChange={setSettlementStatus}>
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="draft">Draf</SelectItem>
                <SelectItem value="ready_for_review">Siap ditinjau</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="paid">Dibayarkan</SelectItem>
                <SelectItem value="void">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button className="min-h-11" variant="outline" onClick={resetFilters}>
            Reset filter
          </Button>
        </CardContent>
      </Card>
      <Rows
        title="Pendapatan yang diakui"
        rows={earnings.map((row) => ({
          Kamar: row.roomCode,
          Cakupan: `${localDate(row.serviceFrom)} s.d. ${localDate(row.serviceUntil)}`,
          Status: labelOf(row.earningStatus),
          Entitlement: formatOwnerMoney(row.ownerEntitlement),
        }))}
      />
      <Rows
        title="Penyesuaian"
        rows={finance.adjustments.map((row) => ({
          Bulan: localDate(row.effectiveMonth),
          Jenis: labelOf(row.adjustmentKind),
          Nilai: formatOwnerMoney(row.ownerAmountDelta),
        }))}
      />
      <Rows
        title="Settlement dan payout"
        rows={[
          ...settlements.map((row) => ({
            Periode: `${localDate(row.periodStart)} s.d. ${localDate(row.periodEnd)}`,
            Status: labelOf(row.settlementStatus),
            Entitlement: formatOwnerMoney(row.ownerAmount),
          })),
          ...finance.payouts.map((row) => ({
            Tercatat: localDate(row.recordedAt),
            Status: labelOf(row.payoutKind),
            Nilai: formatOwnerMoney(row.payoutAmount),
          })),
        ]}
      />
    </div>
  );
}

function Reports({ report }: { report: OwnerReport }) {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/[0.045] shadow-sm">
        <CardContent className="flex gap-4 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{report.watermark}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cakupan laporan mengikuti penugasan kepemilikan yang berlaku pada periode ini.
            </p>
          </div>
        </CardContent>
      </Card>
      <ReportSummary report={report} />
      <Rows
        title="Ringkasan operasional"
        rows={[
          {
            "Aset dalam periode": String(report.summary.assetCount),
            "Hunian aktif": String(report.summary.occupiedCount),
            "Sewa aktif": String(report.summary.activeLeaseCount),
          },
        ]}
      />
      <Rows
        title="Komplain"
        rows={report.complaints.map((row) => ({
          Kode: row.complaintCode,
          Status: labelOf(row.complaintStatus),
          Prioritas: labelOf(row.priority),
          Tanggal: localDate(row.createdAt),
        }))}
      />
      <Rows
        title="Maintenance"
        rows={report.maintenance.map((row) => ({
          Kode: row.workOrderCode,
          Status: labelOf(row.workOrderStatus),
          Prioritas: labelOf(row.priority),
          Tanggal: localDate(row.createdAt),
        }))}
      />
    </div>
  );
}

function OperationalFilters({
  query,
  onQueryChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
  fromDate,
  onFromDateChange,
  untilDate,
  onUntilDateChange,
  statusOptions,
  onReset,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  priority: string;
  onPriorityChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  fromDate: string | undefined;
  onFromDateChange: (value: string | undefined) => void;
  untilDate: string | undefined;
  onUntilDateChange: (value: string | undefined) => void;
  statusOptions: Array<{ value: string; label: string }>;
  onReset: () => void;
}) {
  return (
    <Card className="border-border/90 bg-card shadow-sm">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Cari kode, kamar, atau bangunan
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Contoh: AK0503 atau Apart Kost Unit 05"
              className="min-h-11 bg-background pl-10"
            />
          </span>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Prioritas
          <Select value={priority} onValueChange={onPriorityChange}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua prioritas</SelectItem>
              <SelectItem value="urgent">Mendesak</SelectItem>
              <SelectItem value="high">Tinggi</SelectItem>
              <SelectItem value="medium">Sedang</SelectItem>
              <SelectItem value="low">Rendah</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Status
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button type="button" variant="outline" className="min-h-11" onClick={onReset}>
          Reset filter
        </Button>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
          <HeroUiDatePicker
            id="owner-filter-from"
            label="Dari tanggal"
            value={fromDate}
            onChange={onFromDateChange}
          />
          <HeroUiDatePicker
            id="owner-filter-until"
            label="Sampai tanggal"
            value={untilDate}
            onChange={onUntilDateChange}
            minDate={fromDate}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalResult({
  code,
  status,
  priority,
  title,
  date,
  roomCode,
  buildingName,
}: {
  code: string;
  status: string;
  priority: string;
  title: string;
  date: string;
  roomCode: string;
  buildingName: string;
}) {
  return (
    <article className="grid gap-4 border-b border-border/70 px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">{title}</p>
          <StatusPill value={priority} />
          <StatusPill value={status} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {code} · {roomCode} · {buildingName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Dicatat {localDate(date)}</p>
      </div>
      <Button asChild variant="outline" className="min-h-10 shrink-0">
        <Link to="/property-owners/portal/assets/$roomCode" params={{ roomCode }}>
          <Eye className="mr-2 h-4 w-4" /> Detail aset
        </Link>
      </Button>
    </article>
  );
}

function Issues({ report }: { report: OwnerReport }) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState<string>();
  const [untilDate, setUntilDate] = useState<string>();
  const normalized = query
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]/g, "");
  const matches = <
    T extends {
      priority: string;
      createdAt: string;
      roomCode: string;
      buildingCode: string;
      buildingName: string;
    },
  >(
    row: T,
    state: string,
    code: string,
  ) => {
    const searchable = [code, row.roomCode, row.buildingCode, row.buildingName]
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .replace(/[^a-z0-9]/g, "");
    const day = row.createdAt.slice(0, 10);
    return (
      (!normalized || searchable.includes(normalized)) &&
      (priority === "all" || row.priority === priority) &&
      (status === "all" || state === status) &&
      (!fromDate || day >= fromDate) &&
      (!untilDate || day <= untilDate)
    );
  };
  const complaints = report.complaints.filter((row) =>
    matches(row, row.complaintStatus, row.complaintCode),
  );
  const maintenance = report.maintenance.filter((row) =>
    matches(row, row.workOrderStatus, row.workOrderCode),
  );
  const reset = () => {
    setQuery("");
    setPriority("all");
    setStatus("all");
    setFromDate(undefined);
    setUntilDate(undefined);
  };
  return (
    <div className="space-y-6">
      <OperationalFilters
        query={query}
        onQueryChange={setQuery}
        priority={priority}
        onPriorityChange={setPriority}
        status={status}
        onStatusChange={setStatus}
        fromDate={fromDate}
        onFromDateChange={setFromDate}
        untilDate={untilDate}
        onUntilDateChange={setUntilDate}
        onReset={reset}
        statusOptions={[
          { value: "submitted", label: "Komplain diajukan" },
          { value: "acknowledged", label: "Diterima" },
          { value: "in_progress", label: "Diproses" },
          { value: "on_hold", label: "Ditunda" },
          { value: "escalated", label: "Dieskalasi" },
          { value: "resolved", label: "Terselesaikan" },
          { value: "closed", label: "Ditutup" },
          { value: "open", label: "Maintenance terbuka" },
          { value: "assigned", label: "Maintenance ditugaskan" },
          { value: "completed", label: "Maintenance selesai" },
          { value: "verified", label: "Maintenance terverifikasi" },
        ]}
      />
      <Card className="border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-base">Komplain ({complaints.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {complaints.length ? (
            complaints.map((row) => (
              <OperationalResult
                key={row.complaintId}
                code={row.complaintCode}
                title="Komplain aset"
                status={row.complaintStatus}
                priority={row.priority}
                date={row.createdAt}
                roomCode={row.roomCode}
                buildingName={row.buildingName}
              />
            ))
          ) : (
            <p className="px-5 py-9 text-sm text-muted-foreground">
              Tidak ada komplain yang sesuai filter.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-base">Maintenance ({maintenance.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {maintenance.length ? (
            maintenance.map((row) => (
              <OperationalResult
                key={row.workOrderId}
                code={row.workOrderCode}
                title="Pekerjaan maintenance"
                status={row.workOrderStatus}
                priority={row.priority}
                date={row.createdAt}
                roomCode={row.roomCode}
                buildingName={row.buildingName}
              />
            ))
          ) : (
            <p className="px-5 py-9 text-sm text-muted-foreground">
              Tidak ada maintenance yang sesuai filter.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Notifications({ report }: { report: OwnerReport }) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState<string>();
  const [untilDate, setUntilDate] = useState<string>();
  const normalized = query
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]/g, "");
  const notifications = useMemo(
    () =>
      report.notifications.filter((row) => {
        const searchable = [row.title, row.roomCode, row.buildingCode, row.buildingName]
          .join(" ")
          .toLocaleLowerCase("id-ID")
          .replace(/[^a-z0-9]/g, "");
        const day = row.createdAt.slice(0, 10);
        return (
          (!normalized || searchable.includes(normalized)) &&
          (priority === "all" || row.priority === priority) &&
          (status === "all" || row.notificationStatus === status) &&
          (!fromDate || day >= fromDate) &&
          (!untilDate || day <= untilDate)
        );
      }),
    [report.notifications, normalized, priority, status, fromDate, untilDate],
  );
  const reset = () => {
    setQuery("");
    setPriority("all");
    setStatus("all");
    setFromDate(undefined);
    setUntilDate(undefined);
  };
  return (
    <div className="space-y-6">
      <OperationalFilters
        query={query}
        onQueryChange={setQuery}
        priority={priority}
        onPriorityChange={setPriority}
        status={status}
        onStatusChange={setStatus}
        fromDate={fromDate}
        onFromDateChange={setFromDate}
        untilDate={untilDate}
        onUntilDateChange={setUntilDate}
        onReset={reset}
        statusOptions={[
          { value: "unread", label: "Belum dibaca" },
          { value: "read", label: "Sudah dibaca" },
          { value: "archived", label: "Diarsipkan" },
        ]}
      />
      <Card className="border-border/90 shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-base">Notifikasi ({notifications.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {notifications.length ? (
            notifications.map((row) => (
              <OperationalResult
                key={row.notificationId}
                code={labelOf(row.notificationStatus)}
                title={row.title}
                status={row.notificationStatus}
                priority={row.priority}
                date={row.createdAt}
                roomCode={row.roomCode}
                buildingName={row.buildingName}
              />
            ))
          ) : (
            <p className="px-5 py-9 text-sm text-muted-foreground">
              Tidak ada notifikasi yang sesuai filter.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportPanel({
  tab,
  ownerId,
  initialPeriod,
}: {
  tab: Exclude<OwnerPortalTab, "dashboard" | "assets" | "account">;
  ownerId: string;
  initialPeriod: string | null;
}) {
  const [period, setPeriod] = useState(initialPeriod ?? periodNow);
  const report = useQuery({
    queryKey: ["property-owner", "report", ownerId, period],
    queryFn: () => propertyOwnerPortalApi.preview(period),
    enabled: tab !== "finance" && Boolean(period),
  });
  const finance = useQuery({
    queryKey: ["property-owner", "finance", ownerId, period],
    queryFn: () => propertyOwnerPortalApi.finance(period),
    enabled: tab === "finance" && Boolean(period),
  });

  useEffect(() => {
    if (initialPeriod) setPeriod(initialPeriod);
  }, [initialPeriod]);

  const onExport = (format: "pdf" | "xlsx") => void downloadOwnerReport(period, format);
  const activeQuery = tab === "finance" ? finance : report;

  return (
    <PortalSection
      eyebrow="Laporan read-only"
      title={
        tab === "finance"
          ? "Pendapatan & settlement"
          : (getOwnerPortalRoute(tab)?.label ?? "Laporan")
      }
      description="Pilih periode untuk melihat data agregat yang berada dalam cakupan kepemilikan Anda."
    >
      <PeriodToolbar period={period} setPeriod={setPeriod} onExport={onExport} />
      {activeQuery.isLoading ? (
        <LoadingState label="Memuat laporan owner..." />
      ) : activeQuery.error ? (
        <ErrorState
          error={activeQuery.error}
          onRetry={() => void activeQuery.refetch()}
          title="Laporan owner tidak dapat dimuat"
          backTo={getOwnerPortalRoute(tab)?.to ?? "/property-owners/portal"}
        />
      ) : tab === "finance" && finance.data ? (
        <Finance finance={finance.data} />
      ) : report.data ? (
        tab === "reports" ? (
          <Reports report={report.data} />
        ) : tab === "issues" ? (
          <Issues report={report.data} />
        ) : (
          <Notifications report={report.data} />
        )
      ) : null}
    </PortalSection>
  );
}

function Account({ portal, accountEmail }: { portal: OwnerPortal; accountEmail: string | null }) {
  const scopeLabel =
    portal.scope.state === "active"
      ? "Cakupan aktif"
      : portal.scope.state === "scheduled"
        ? "Penugasan akan datang"
        : portal.scope.state === "historical"
          ? "Cakupan historis"
          : "Belum ada cakupan";
  return (
    <PortalSection
      eyebrow="Akun"
      title="Profil akun"
      description="Informasi akses ditampilkan tanpa mengekspos kredensial atau data privat yang tidak diperlukan."
    >
      <Card className="border-border/80 shadow-sm">
        <CardContent className="grid gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {portal.owner?.displayName ?? "Profil owner belum tersedia"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {accountEmail ?? "Email akun tidak tersedia"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Property Owner
              </span>
              <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                Akses hanya baca
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Perubahan profil, kredensial, dan penugasan aset dikelola oleh administrator Kostation
              untuk menjaga otoritas dan jejak audit tetap konsisten.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-base">Cakupan kepemilikan</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Status dan jumlah berikut berasal dari penugasan efektif di server.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="rounded-xl border border-border/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Status
              </p>
              <div className="mt-2">
                <StatusPill value={portal.scope.state} />
              </div>
            </div>
            <div className="rounded-xl border border-border/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Ringkasan
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {portal.scope.buildingCount} bangunan · {portal.scope.roomCount} kamar
              </p>
            </div>
            <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
              {scopeLabel}. Data hanya dapat dilihat; perubahan penugasan dan profil dilakukan oleh
              Admin.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-base">Bantuan dan keamanan</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Portal ini tidak menyediakan perubahan data atau akses ke informasi privat penghuni.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-border/80 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                Jika nama, email, atau cakupan aset perlu diperbarui, hubungi administrator
                Kostation.
              </p>
            </div>
            <Link
              to="/property-owners/portal/assets"
              className="inline-flex min-h-10 w-full items-center justify-between rounded-lg border border-border/80 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Tinjau aset saya <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </PortalSection>
  );
}

function OccupancyFoundation({ portal }: { portal: OwnerPortal }) {
  const pageSize = 12;
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [roomStatus, setRoomStatus] = useState("all");
  const [leaseStatus, setLeaseStatus] = useState("all");
  const [billingState, setBillingState] = useState("all");
  const occupancy = useQuery({
    queryKey: ["property-owner", "occupancy", query, roomStatus, leaseStatus, billingState, offset],
    queryFn: () =>
      propertyOwnerPortalApi.getOccupancy({
        q: query || undefined,
        room_status: roomStatus === "all" ? undefined : roomStatus,
        lease_status: leaseStatus === "all" ? undefined : leaseStatus,
        billing_state: billingState === "all" ? undefined : billingState,
        limit: pageSize,
        offset,
      }),
    staleTime: 20_000,
  });
  const hasFilter =
    Boolean(query) || roomStatus !== "all" || leaseStatus !== "all" || billingState !== "all";
  return (
    <PortalSection
      eyebrow="Hunian aktif"
      title="Hunian & penyewaan"
      description="Daftar ini berasal dari proyeksi server dan hanya memuat kamar dalam cakupan kepemilikan Anda."
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Terisi"
          value={String(portal.occupancy.occupiedCount)}
          description="Kamar dengan hunian aktif"
          icon={House}
        />
        <Metric
          label="Dipesan"
          value={String(portal.occupancy.reservedCount)}
          description="Kamar yang sedang dicadangkan"
          icon={ClipboardList}
        />
        <Metric
          label="Kosong"
          value={String(portal.occupancy.vacantCount)}
          description="Kamar tersedia dalam cakupan"
          icon={Building2}
        />
        <Metric
          label="Perawatan"
          value={String(portal.occupancy.maintenanceCount)}
          description="Kamar yang sedang ditangani"
          icon={Wrench}
        />
      </section>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)_minmax(10rem,0.45fr)_minmax(10rem,0.45fr)_auto] md:items-end">
          <label className="grid gap-2 text-sm font-semibold">
            Cari hunian
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder="Kode kamar atau bangunan"
              className="min-h-11"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status kamar
            <Select
              value={roomStatus}
              onValueChange={(value) => {
                setRoomStatus(value);
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="occupied">Terisi</SelectItem>
                <SelectItem value="reserved">Dipesan</SelectItem>
                <SelectItem value="vacant">Kosong</SelectItem>
                <SelectItem value="maintenance">Perawatan</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status sewa
            <Select
              value={leaseStatus}
              onValueChange={(value) => {
                setLeaseStatus(value);
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="awaiting_activation">Menunggu aktivasi</SelectItem>
                <SelectItem value="draft">Draf</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status tagihan
            <Select
              value={billingState}
              onValueChange={(value) => {
                setBillingState(value);
                setOffset(0);
              }}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="current">Berjalan</SelectItem>
                <SelectItem value="partially_paid">Sebagian dibayar</SelectItem>
                <SelectItem value="overdue">Terlambat</SelectItem>
                <SelectItem value="settled">Lunas</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {hasFilter ? (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setQuery("");
                setRoomStatus("all");
                setLeaseStatus("all");
                setBillingState("all");
                setOffset(0);
              }}
            >
              Reset filter
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {occupancy.isLoading ? (
        <LoadingState label="Memuat hunian owner..." />
      ) : occupancy.error ? (
        <ErrorState
          error={occupancy.error}
          onRetry={() => void occupancy.refetch()}
          title="Hunian owner tidak dapat dimuat"
          backTo="/property-owners/portal/occupancy"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {occupancy.data?.items.length ? (
            occupancy.data.items.map((item) => (
              <Card key={item.roomCode} className="border-border/80 shadow-sm">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">{item.roomCode}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.buildingName ?? item.buildingCode ?? "Bangunan terdaftar"}
                    </p>
                  </div>
                  <StatusPill value={item.roomStatus} />
                </CardHeader>
                <CardContent className="grid gap-3 border-t border-border/70 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Penghuni</span>
                    <p className="font-medium">
                      {item.resident?.displayName ?? "Belum ada hunian aktif"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status tagihan</span>
                    <p className="font-medium">{labelOf(item.billingState)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Periode sewa</span>
                    <p className="font-medium">
                      {item.lease
                        ? `${localDate(item.lease.startDate)} – ${localDate(item.lease.endDate)}`
                        : "Belum tercatat"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Korelasi</span>
                    <p className="font-medium">
                      {item.transferState ??
                        item.renewalState ??
                        item.checkoutState ??
                        "Tidak ada proses khusus"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Isu terbuka</span>
                    <p className="font-medium">
                      {item.openComplaints + item.openMaintenance === 0
                        ? "Tidak ada"
                        : `${item.openComplaints} komplain · ${item.openMaintenance} maintenance`}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="min-h-10 sm:col-span-2">
                    <Link
                      to="/property-owners/portal/assets/$roomCode"
                      params={{ roomCode: item.roomCode }}
                    >
                      <Eye className="mr-2 h-4 w-4" /> Detail kamar
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="border-dashed md:col-span-2">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Tidak ada hunian yang sesuai filter.
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {occupancy.data && occupancy.data.total > pageSize ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Menampilkan {offset + 1}–{Math.min(offset + pageSize, occupancy.data.total)} dari{" "}
            {occupancy.data.total} kamar
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              disabled={offset + pageSize >= occupancy.data.total}
              onClick={() => setOffset(offset + pageSize)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      ) : null}
    </PortalSection>
  );
}

function Content({
  tab,
  portal,
  ownerId,
  accountEmail,
  initialPeriod,
  onNavigate,
}: {
  tab: OwnerPortalTab;
  portal: OwnerPortal;
  ownerId: string;
  accountEmail: string | null;
  initialPeriod: string | null;
  onNavigate: (tab: OwnerPortalTab) => void;
}) {
  if (tab === "dashboard") return <Dashboard portal={portal} onNavigate={onNavigate} />;
  if (tab === "assets") return <Assets portal={portal} />;
  if (tab === "occupancy") return <OccupancyFoundation portal={portal} />;
  if (tab === "finance" || tab === "reports" || tab === "issues" || tab === "notifications")
    return <ReportPanel tab={tab} ownerId={ownerId} initialPeriod={initialPeriod} />;
  return <Account portal={portal} accountEmail={accountEmail} />;
}

function OwnerPortalBoundary({
  state,
  error,
  onRetry,
}: {
  state: "loading" | "error" | "empty" | "scheduled";
  error: unknown;
  onRetry: () => void;
}) {
  const scheduled = state === "scheduled";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-xl border-border/80 shadow-lg">
        <CardContent className="p-7 text-center sm:p-9">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            {state === "error" ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <Building2 className="h-6 w-6" />
            )}
          </div>
          {state === "loading" ? (
            <div className="mt-5">
              <LoadingState label="Memuat portal owner..." />
            </div>
          ) : state === "error" ? (
            <div className="mt-5">
              <ErrorState
                error={error}
                onRetry={onRetry}
                title="Portal owner tidak dapat dimuat"
                backTo="/property-owners/portal"
              />
            </div>
          ) : (
            <>
              <h1 className="mt-5 text-xl font-semibold tracking-tight">
                {scheduled ? "Penugasan aset terjadwal" : "Belum ada aset yang ditugaskan"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {scheduled
                  ? "Aset akan muncul pada tanggal efektif penugasan. Hingga saat itu, data operasional tidak ditampilkan."
                  : "Akun Anda aktif, tetapi belum memiliki aset dalam cakupan kepemilikan. Hubungi administrator Kostation bila diperlukan."}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PropertyOwnerPortal({ view = "dashboard" }: { view?: OwnerPortalTab }) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const portal = useQuery({
    queryKey: ["property-owner", "portal", user?.id],
    queryFn: propertyOwnerPortalApi.get,
    enabled: Boolean(user?.id && hasRole("property_owner")),
    staleTime: 30_000,
  });

  const viewState = getOwnerPortalViewState(
    portal.data,
    portal.isLoading || !user?.id,
    Boolean(portal.error),
  );

  useEffect(() => {
    if (!hasRole("property_owner")) {
      void navigate({ to: "/property-owners" });
      return;
    }
    if (
      viewState === "historical" &&
      (view === "dashboard" || view === "assets" || view === "occupancy")
    ) {
      void navigate({ to: "/property-owners/portal/reports", replace: true });
    }
  }, [hasRole, navigate, view, viewState]);

  if (!hasRole("property_owner")) return null;
  if (
    viewState === "loading" ||
    viewState === "error" ||
    (view !== "account" && (viewState === "empty" || viewState === "scheduled"))
  ) {
    return (
      <OwnerPortalBoundary
        state={viewState}
        error={portal.error}
        onRetry={() => void portal.refetch()}
      />
    );
  }
  if (!portal.data) return null;
  if (portal.data.owner === null && view !== "account") return null;

  const historical = viewState === "historical";
  const displayTab =
    historical && (view === "dashboard" || view === "assets" || view === "occupancy")
      ? "reports"
      : view;
  const initialPeriod = historical ? portal.data.scope.latestHistoricalPeriod : null;
  const navigateTo = (next: OwnerPortalTab) => {
    const target = getOwnerPortalRoute(next);
    if (target) void navigate({ to: target.to as never });
  };

  return (
    <OwnerPortalShell
      activeRoute={displayTab}
      ownerName={portal.data.owner?.displayName ?? "Property Owner"}
      historical={historical}
      unreadNotifications={portal.data.issues.unreadNotifications}
    >
      {historical ? (
        <div className="mb-7 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Penugasan kepemilikan telah berakhir. Kondisi operasional saat ini tidak tersedia; hanya
            laporan dan keuangan historis pada periode kepemilikan yang dapat dibuka.
          </p>
        </div>
      ) : null}
      <Content
        tab={displayTab}
        portal={portal.data}
        ownerId={user?.id ?? "owner"}
        accountEmail={user?.email ?? null}
        initialPeriod={initialPeriod}
        onNavigate={navigateTo}
      />
    </OwnerPortalShell>
  );
}
