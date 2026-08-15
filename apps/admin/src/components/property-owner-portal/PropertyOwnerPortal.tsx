import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  Eye,
  FileText,
  House,
  LayoutDashboard,
  Menu,
  Moon,
  ReceiptText,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ErrorState, LoadingState } from "@/components/state";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuth } from "@/lib/auth";
import {
  downloadOwnerReport,
  filterOwnerAssets,
  formatOwnerMoney,
  getOwnerPortalViewState,
  groupOwnerAssets,
  ownerPortalNavigation,
  propertyOwnerPortalApi,
  type OwnerPortal,
  type OwnerAssetFilters,
  type OwnerKostType,
  type OwnerPortalTab,
  type OwnerReport,
} from "@/lib/property-owner-portal";

const icons: Record<OwnerPortalTab, LucideIcon> = {
  dashboard: LayoutDashboard,
  assets: Building2,
  finance: CircleDollarSign,
  reports: ReceiptText,
  issues: Wrench,
  notifications: Bell,
  account: UserRound,
};

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
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        warning
          ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : muted
            ? "border-border bg-muted/50 text-muted-foreground"
            : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {labelOf(value)}
    </span>
  );
}

function Metric({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardContent className="flex gap-4 p-5">
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
        />
        <Metric
          label="Status hunian"
          value={`${portal.occupancy.occupiedCount} terisi`}
          description={`${portal.occupancy.vacantCount} kosong · ${portal.occupancy.reservedCount} dipesan`}
          icon={House}
        />
        <Metric
          label="Komplain terbuka"
          value={String(portal.issues.openComplaints)}
          description="Hanya ringkasan aset dalam cakupan Anda"
          icon={ClipboardList}
        />
        <Metric
          label="Maintenance aktif"
          value={String(portal.issues.openMaintenance)}
          description="Tanpa catatan internal atau rincian biaya"
          icon={Wrench}
        />
      </section>

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
  const [filters, setFilters] = useState<OwnerAssetFilters>({
    query: "",
    roomStatus: "all",
    leaseStatus: "all",
  });
  const [expanded, setExpanded] = useState<Record<OwnerKostType, boolean>>({
    rukost: true,
    apartkost: true,
  });
  const groups = groupOwnerAssets(filterOwnerAssets(portal.assets, filters));
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
                  <input
                    aria-label="Cari aset owner"
                    value={filters.query}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, query: event.target.value }))
                    }
                    placeholder="Kode kamar atau nama bangunan"
                    className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-10 pr-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </span>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Status kamar
                <select
                  aria-label="Filter status kamar"
                  value={filters.roomStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      roomStatus: event.target.value as OwnerAssetFilters["roomStatus"],
                    }))
                  }
                  className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Semua status</option>
                  <option value="vacant">Kosong</option>
                  <option value="reserved">Dipesan</option>
                  <option value="occupied">Terisi</option>
                  <option value="maintenance">Perawatan</option>
                  <option value="inactive">Tidak aktif</option>
                  <option value="requires_review">Perlu peninjauan</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Status sewa
                <select
                  aria-label="Filter status sewa"
                  value={filters.leaseStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      leaseStatus: event.target.value as OwnerAssetFilters["leaseStatus"],
                    }))
                  }
                  className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Semua status</option>
                  <option value="draft">Draf</option>
                  <option value="awaiting_activation">Menunggu aktivasi</option>
                  <option value="active">Aktif</option>
                  <option value="ended">Berakhir</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Dibatalkan</option>
                  <option value="transferred">Dialihkan</option>
                </select>
              </label>
              {hasFilter ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setFilters({ query: "", roomStatus: "all", leaseStatus: "all" })}
                >
                  Bersihkan
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {groups.length ? (
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
          <input
            aria-label="Periode laporan"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
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

function Finance({ report }: { report: OwnerReport }) {
  return (
    <div className="space-y-6">
      <ReportSummary report={report} />
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-base">Rekonsiliasi periode</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/70">
          <FinanceRow
            label="Penyesuaian owner"
            value={formatOwnerMoney(report.summary.ownerAdjustments)}
          />
          <FinanceRow label="Settlement" value={String(report.settlements.length)} />
          <FinanceRow label="Payout / reversal" value={String(report.payouts.length)} />
        </CardContent>
      </Card>
      <Rows
        title="Pendapatan yang diakui"
        rows={report.earnings.map((row) => ({
          Kamar: row.roomCode,
          Cakupan: `${localDate(row.serviceFrom)} s.d. ${localDate(row.serviceUntil)}`,
          Status: labelOf(row.earningStatus),
          Entitlement: formatOwnerMoney(row.ownerEntitlement),
        }))}
      />
      <Rows
        title="Penyesuaian"
        rows={report.adjustments.map((row) => ({
          Bulan: localDate(row.effectiveMonth),
          Jenis: labelOf(row.adjustmentKind),
          Nilai: formatOwnerMoney(row.ownerAmountDelta),
        }))}
      />
      <Rows
        title="Settlement dan payout"
        rows={[
          ...report.settlements.map((row) => ({
            Periode: `${localDate(row.periodStart)} s.d. ${localDate(row.periodEnd)}`,
            Status: labelOf(row.settlementStatus),
            Entitlement: formatOwnerMoney(row.ownerAmount),
          })),
          ...report.payouts.map((row) => ({
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

function Issues({ report }: { report: OwnerReport }) {
  return (
    <div className="space-y-6">
      <Rows
        title="Komplain read-only"
        rows={report.complaints.map((row) => ({
          Kode: row.complaintCode,
          Status: labelOf(row.complaintStatus),
          Prioritas: labelOf(row.priority),
          Tanggal: localDate(row.createdAt),
        }))}
      />
      <Rows
        title="Maintenance read-only"
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

function Notifications({ report }: { report: OwnerReport }) {
  return (
    <Rows
      title="Notifikasi akun"
      rows={report.notifications.map((row) => ({
        Tipe: row.notificationType,
        Status: labelOf(row.notificationStatus),
        Prioritas: labelOf(row.priority),
        Judul: row.title,
        Tanggal: localDate(row.createdAt),
      }))}
    />
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
    enabled: Boolean(period),
  });

  useEffect(() => {
    if (initialPeriod) setPeriod(initialPeriod);
  }, [initialPeriod]);

  const onExport = (format: "pdf" | "xlsx") => void downloadOwnerReport(period, format);

  return (
    <PortalSection
      eyebrow="Laporan read-only"
      title={
        tab === "finance"
          ? "Pendapatan & settlement"
          : (ownerPortalNavigation.find((item) => item.id === tab)?.label ?? "Laporan")
      }
      description="Pilih periode untuk melihat data agregat yang berada dalam cakupan kepemilikan Anda."
    >
      <PeriodToolbar period={period} setPeriod={setPeriod} onExport={onExport} />
      {report.isLoading ? (
        <LoadingState label="Memuat laporan owner..." />
      ) : report.error ? (
        <ErrorState
          error={report.error}
          onRetry={() => void report.refetch()}
          title="Laporan owner tidak dapat dimuat"
        />
      ) : report.data ? (
        tab === "finance" ? (
          <Finance report={report.data} />
        ) : tab === "reports" ? (
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

function Account({ portal }: { portal: OwnerPortal }) {
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
            <h3 className="text-lg font-semibold text-foreground">{portal.owner?.displayName}</h3>
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
    </PortalSection>
  );
}

function Content({
  tab,
  portal,
  ownerId,
  initialPeriod,
  onNavigate,
}: {
  tab: OwnerPortalTab;
  portal: OwnerPortal;
  ownerId: string;
  initialPeriod: string | null;
  onNavigate: (tab: OwnerPortalTab) => void;
}) {
  if (tab === "dashboard") return <Dashboard portal={portal} onNavigate={onNavigate} />;
  if (tab === "assets") return <Assets portal={portal} />;
  if (tab === "finance" || tab === "reports" || tab === "issues" || tab === "notifications")
    return <ReportPanel tab={tab} ownerId={ownerId} initialPeriod={initialPeriod} />;
  return <Account portal={portal} />;
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
              <ErrorState error={error} onRetry={onRetry} title="Portal owner tidak dapat dimuat" />
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

export function PropertyOwnerPortal() {
  const { user } = useAuth();
  const [tab, setTab] = useState<OwnerPortalTab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const portal = useQuery({
    queryKey: ["property-owner", "portal", user?.id],
    queryFn: propertyOwnerPortalApi.get,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });

  useEffect(() => {
    const isDark = localStorage.getItem("theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    setTab("dashboard");
    setMenuOpen(false);
  }, [user?.id]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const viewState = getOwnerPortalViewState(
    portal.data,
    portal.isLoading || !user?.id,
    Boolean(portal.error),
  );
  if (
    viewState === "loading" ||
    viewState === "error" ||
    viewState === "empty" ||
    viewState === "scheduled"
  ) {
    return (
      <OwnerPortalBoundary
        state={viewState}
        error={portal.error}
        onRetry={() => void portal.refetch()}
      />
    );
  }
  if (!portal.data || portal.data.owner === null) return null;

  const historical = viewState === "historical";
  const displayTab = historical && (tab === "dashboard" || tab === "assets") ? "reports" : tab;
  const activeLabel =
    ownerPortalNavigation.find((item) => item.id === displayTab)?.label ?? "Dashboard";
  const initialPeriod = historical ? portal.data.scope.latestHistoricalPeriod : null;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="border-b border-sidebar-border px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">Kostation</p>
              <p className="mt-0.5 text-xs text-sidebar-foreground/65">Portal Pemilik Properti</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-5">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/35 px-4 py-3">
            <p className="truncate text-sm font-semibold">{portal.data.owner.displayName}</p>
            <p className="mt-1 text-xs text-sidebar-foreground/65">Akses hanya baca</p>
          </div>
        </div>
        <OwnerNavigation active={displayTab} onSelect={setTab} historical={historical} />
        <div className="mt-auto border-t border-sidebar-border px-6 py-5 text-xs leading-5 text-sidebar-foreground/60">
          Data ditampilkan sesuai cakupan kepemilikan dan periode yang berlaku.
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Portal Owner
              </p>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {activeLabel}
              </h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {portal.data.owner.displayName} · Informasi sesuai penugasan kepemilikan
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button
                variant="outline"
                className="min-h-10 lg:hidden"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
              >
                <Menu className="mr-2 h-4 w-4" /> Menu
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Ubah tema"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTab("notifications")}
                aria-label="Buka notifikasi"
                className="relative text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Bell className="h-4 w-4" />
                {portal.data.issues.unreadNotifications ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                ) : null}
              </Button>
              <div className="border-l border-border pl-3">
                <UserMenu />
              </div>
            </div>
          </div>
          {menuOpen ? (
            <div className="border-t border-border bg-background px-4 py-3 lg:hidden">
              <OwnerNavigation
                active={displayTab}
                onSelect={(next) => {
                  setTab(next);
                  setMenuOpen(false);
                }}
                historical={historical}
              />
            </div>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-7 pb-24 md:px-8 lg:py-8">
          {historical ? (
            <div className="mb-7 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Penugasan kepemilikan telah berakhir. Kondisi operasional saat ini tidak tersedia;
                hanya laporan dan keuangan historis pada periode kepemilikan yang dapat dibuka.
              </p>
            </div>
          ) : null}
          <Content
            tab={displayTab}
            portal={portal.data}
            ownerId={user?.id ?? "owner"}
            initialPeriod={historical ? portal.data.scope.latestHistoricalPeriod : null}
            onNavigate={setTab}
          />
        </main>
      </div>
    </div>
  );
}

function OwnerNavigation({
  active,
  onSelect,
  historical,
}: {
  active: OwnerPortalTab;
  onSelect: (tab: OwnerPortalTab) => void;
  historical: boolean;
}) {
  const navigation = historical
    ? ownerPortalNavigation.filter((item) => !["dashboard", "assets"].includes(item.id))
    : ownerPortalNavigation;
  return (
    <nav
      aria-label="Navigasi portal owner"
      className="flex gap-1 overflow-x-auto px-4 pb-4 lg:flex-col lg:px-4"
    >
      {navigation.map((item) => {
        const Icon = icons[item.id];
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={selected ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
              selected
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
