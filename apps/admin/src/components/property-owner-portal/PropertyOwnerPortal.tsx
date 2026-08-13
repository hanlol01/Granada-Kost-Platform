import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileText,
  LayoutDashboard,
  Menu,
  ReceiptText,
  UserRound,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { useAuth } from "@/lib/auth";
import {
  downloadOwnerReport,
  formatOwnerMoney,
  getOwnerPortalViewState,
  ownerPortalNavigation,
  propertyOwnerPortalApi,
  type OwnerPortal,
  type OwnerPortalTab,
  type OwnerReport,
} from "@/lib/property-owner-portal";

const icons = {
  dashboard: LayoutDashboard,
  assets: Building2,
  finance: CircleDollarSign,
  reports: ReceiptText,
  issues: Wrench,
  notifications: Bell,
  account: UserRound,
};
const periodNow = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="border-t border-border px-1 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
function FinanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Dashboard({ portal }: { portal: OwnerPortal }) {
  return (
    <div className="space-y-7">
      <section className="grid gap-x-6 gap-y-6 border-y border-border py-6 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aset aktif"
          value={`${portal.scope.buildingCount} bangunan / ${portal.scope.roomCount} kamar`}
          description="Hanya aset penugasan aktif."
        />
        <Metric
          label="Hunian"
          value={`${portal.occupancy.occupiedCount} terisi`}
          description={`${portal.occupancy.vacantCount} kosong, ${portal.occupancy.reservedCount} dipesan`}
        />
        <Metric
          label="Komplain terbuka"
          value={String(portal.issues.openComplaints)}
          description="Terbatas pada aset aktif."
        />
        <Metric
          label="Maintenance aktif"
          value={String(portal.issues.openMaintenance)}
          description="Tanpa catatan internal atau biaya."
        />
      </section>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Batas akses owner</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Pembayaran, pendapatan yang diakui, entitlement owner, settlement, dan payout adalah
          otoritas yang berbeda. Detail keuangan tersedia pada periode laporan yang sah.
        </CardContent>
      </Card>
    </div>
  );
}

function Assets({ portal }: { portal: OwnerPortal }) {
  if (!portal.assets.length)
    return (
      <EmptyState
        title="Belum ada aset aktif"
        description="Aset tampil saat penugasan kepemilikan mulai berlaku."
      />
    );
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b bg-muted/35 px-4 py-3 text-xs font-medium text-muted-foreground">
        <span>Aset</span>
        <span>Status kamar</span>
        <span>Sewa</span>
      </div>
      {portal.assets.map((asset) => (
        <div
          key={asset.roomCode}
          className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border px-4 py-4 text-sm last:border-0"
        >
          <div>
            <p className="font-medium">{asset.roomCode}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {asset.buildingName ?? asset.buildingCode ?? "Bangunan"}
            </p>
          </div>
          <span className="capitalize text-muted-foreground">{asset.roomStatus}</span>
          <span className="capitalize text-muted-foreground">
            {asset.leaseStatus ?? "Tidak aktif"}
          </span>
        </div>
      ))}
    </div>
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
    <div className="flex flex-wrap items-end gap-3 border-b border-border pb-5">
      <label className="grid gap-1 text-sm font-medium">
        Periode laporan
        <input
          aria-label="Periode laporan"
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
        />
      </label>
      <Button className="min-h-11" variant="outline" onClick={() => onExport("pdf")}>
        <FileText className="mr-2 h-4 w-4" /> PDF
      </Button>
      <Button className="min-h-11" variant="outline" onClick={() => onExport("xlsx")}>
        <Download className="mr-2 h-4 w-4" /> XLSX
      </Button>
    </div>
  );
}

function ReportSummary({ report }: { report: OwnerReport }) {
  return (
    <section className="grid gap-x-6 gap-y-6 border-y border-border py-6 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Gross earned rent"
        value={formatOwnerMoney(report.summary.grossEarnedRent)}
        description="Collected and earned for this period."
      />
      <Metric
        label="Owner entitlement"
        value={formatOwnerMoney(report.summary.ownerEntitlement)}
        description="Bukan pembayaran langsung."
      />
      <Metric
        label="Kostation service fee"
        value={formatOwnerMoney(report.summary.managementFee)}
        description="Terpisah dari entitlement owner."
      />
      <Metric
        label="Payout tercatat"
        value={formatOwnerMoney(report.summary.paidOut)}
        description="Hanya payout dari settlement berwenang."
      />
    </section>
  );
}
function Rows({ title, rows }: { title: string; rows: Array<Record<string, string>> }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="divide-y divide-border text-sm">
            {rows.map((row, index) => (
              <div key={`${title}-${index}`} className="grid gap-1 py-3 sm:grid-cols-2">
                {Object.entries(row).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{key}</span>
                    <span className="text-right">{value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tidak ada data dalam periode ini.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Finance({ report }: { report: OwnerReport }) {
  return (
    <div className="space-y-6">
      <ReportSummary report={report} />
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Rekonsiliasi periode</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border text-sm">
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
          Cakupan: `${row.serviceFrom} s.d. ${row.serviceUntil}`,
          Status: row.earningStatus,
          Entitlement: formatOwnerMoney(row.ownerEntitlement),
        }))}
      />
      <Rows
        title="Penyesuaian"
        rows={report.adjustments.map((row) => ({
          Bulan: row.effectiveMonth,
          Jenis: row.adjustmentKind,
          Owner: formatOwnerMoney(row.ownerAmountDelta),
        }))}
      />
      <Rows
        title="Settlement dan payout"
        rows={[
          ...report.settlements.map((row) => ({
            Periode: `${row.periodStart} s.d. ${row.periodEnd}`,
            Status: row.settlementStatus,
            Entitlement: formatOwnerMoney(row.ownerAmount),
          })),
          ...report.payouts.map((row) => ({
            Tercatat: row.recordedAt,
            Status: row.payoutKind,
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
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{report.watermark}</p>
        <p className="mt-1 font-mono text-xs">Scope checksum: {report.scopeChecksum}</p>
      </div>
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
          Status: row.complaintStatus,
          Prioritas: row.priority,
          Tanggal: row.createdAt,
        }))}
      />
      <Rows
        title="Maintenance"
        rows={report.maintenance.map((row) => ({
          Kode: row.workOrderCode,
          Status: row.workOrderStatus,
          Prioritas: row.priority,
          Tanggal: row.createdAt,
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
          Status: row.complaintStatus,
          Prioritas: row.priority,
          Tanggal: row.createdAt,
        }))}
      />
      <Rows
        title="Maintenance read-only"
        rows={report.maintenance.map((row) => ({
          Kode: row.workOrderCode,
          Status: row.workOrderStatus,
          Prioritas: row.priority,
          Tanggal: row.createdAt,
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
        Status: row.notificationStatus,
        Prioritas: row.priority,
        Judul: row.title,
        Tanggal: row.createdAt,
      }))}
    />
  );
}

function ReportPanel({
  tab,
  ownerId,
}: {
  tab: Exclude<OwnerPortalTab, "dashboard" | "assets" | "account">;
  ownerId: string;
}) {
  const [period, setPeriod] = useState(periodNow);
  const report = useQuery({
    queryKey: ["property-owner", "report", ownerId, period],
    queryFn: () => propertyOwnerPortalApi.preview(period),
    enabled: Boolean(period),
  });
  const onExport = (format: "pdf" | "xlsx") => void downloadOwnerReport(period, format);
  return (
    <div className="space-y-6">
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
    </div>
  );
}

function Content({
  tab,
  portal,
  ownerId,
}: {
  tab: OwnerPortalTab;
  portal: OwnerPortal;
  ownerId: string;
}) {
  if (tab === "dashboard") return <Dashboard portal={portal} />;
  if (tab === "assets") return <Assets portal={portal} />;
  if (tab === "finance" || tab === "reports" || tab === "issues" || tab === "notifications")
    return <ReportPanel tab={tab} ownerId={ownerId} />;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Profil Akun</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Pengaturan profil dan kredensial dikelola oleh administrator Kostation.
        </p>
      </CardContent>
    </Card>
  );
}

export function PropertyOwnerPortal() {
  const { user } = useAuth();
  const [tab, setTab] = useState<OwnerPortalTab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const portal = useQuery({
    queryKey: ["property-owner", "portal", user?.id],
    queryFn: propertyOwnerPortalApi.get,
    staleTime: 30_000,
  });
  useEffect(() => {
    setTab("dashboard");
  }, [user?.id]);
  const viewState = getOwnerPortalViewState(portal.data, portal.isLoading, Boolean(portal.error));
  if (viewState === "loading") return <LoadingState label="Memuat portal owner..." />;
  if (viewState === "error")
    return (
      <ErrorState
        error={portal.error}
        onRetry={() => void portal.refetch()}
        title="Portal owner tidak dapat dimuat"
      />
    );
  if (viewState === "empty" || viewState === "scheduled")
    return (
      <EmptyState
        title={
          viewState === "scheduled" ? "Penugasan aset terjadwal" : "Belum ada aset yang ditugaskan"
        }
        description={
          viewState === "scheduled"
            ? `Aset tersedia pada atau setelah ${portal.data?.scope.nextScheduledDate ?? "tanggal efektif"}. Data pemilik saat ini tidak ditampilkan.`
            : "Akun Anda aktif, tetapi belum ada aset dalam cakupan kepemilikan. Tidak ada total properti yang ditampilkan."
        }
        icon={<Building2 className="h-5 w-5" />}
      />
    );
  if (!portal.data || portal.data.owner === null) return null;
  const historical = viewState === "historical";
  const active = ownerPortalNavigation.find((item) => item.id === tab)?.label ?? "Dashboard";
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-card lg:block">
        <OwnerNavigation active={tab} onSelect={setTab} historical={historical} />
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                Portal Owner · Read-only
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">{active}</h1>
            </div>
            <Button
              variant="outline"
              className="min-h-11 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
            >
              <Menu className="mr-2 h-4 w-4" /> Menu
            </Button>
          </div>
          {menuOpen ? (
            <div className="mx-auto mt-4 max-w-6xl border-t pt-3 lg:hidden">
              <OwnerNavigation
                active={tab}
                onSelect={(next) => {
                  setTab(next);
                  setMenuOpen(false);
                }}
                historical={historical}
              />
            </div>
          ) : null}
        </header>
        <div className="mx-auto max-w-6xl px-4 py-7 pb-24 md:px-8">
          <div className="mb-7">
            <p className="text-sm text-muted-foreground">
              {portal.data.owner.displayName} · Data ditampilkan sesuai aset dan periode penugasan
              kepemilikan.
            </p>
            {historical ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Penugasan telah berakhir. Kondisi operasional saat ini tidak tersedia; hanya laporan
                dan keuangan historis dalam periode kepemilikan dapat dibuka.
              </p>
            ) : null}
          </div>
          <Content
            tab={historical && (tab === "dashboard" || tab === "assets") ? "reports" : tab}
            portal={portal.data}
            ownerId={user?.id ?? "owner"}
          />
        </div>
      </main>
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
      className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:p-5"
    >
      <div className="hidden border-b border-border pb-5 lg:block">
        <p className="text-sm font-semibold">Kostation</p>
        <p className="mt-1 text-xs text-muted-foreground">Akses Owner Read-only</p>
      </div>
      {navigation.map((item) => {
        const Icon = icons[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${active === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
