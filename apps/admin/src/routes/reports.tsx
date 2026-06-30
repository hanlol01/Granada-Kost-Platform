// Admin Reports page (M11G).
//
// Composes operational summaries from existing live endpoints via the shared
// selectors. No dedicated /reports/* endpoint exists in Phase 1, so this page
// aggregates client-side using the same logic as useDashboardSummary, which
// guarantees Dashboard and Reports never disagree on the same number.
//
// UI keeps the Lovable layout primitives (Card, Select, Table) and adds the
// state machine required by ADR-FE-008: loading skeleton, empty, filtered
// empty, error with correlation id + retry. Export action is rendered but
// disabled because /reports/exports is not implemented; the disabled label
// states the gate. Audit viewer section renders a placeholder until the
// /audit endpoint ships (useAuditLogs returns available:false).

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, BarChart3, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/state";
import { useAuth } from "@/lib/auth";
import { useReports } from "@/hooks/useReports";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { formatIDR } from "@/lib/format";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function yearRange(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2];
}

function ReportsPage() {
  const { hasRole } = useAuth();
  // UX-only RBAC gate; backend remains the final authority.
  if (!hasRole(["owner", "manager", "admin"])) {
    return (
      <AppShell title="Laporan" subtitle="Akses dibatasi">
        <ForbiddenState description="Reports hanya tersedia untuk owner, manager, atau admin." />
      </AppShell>
    );
  }

  const years = yearRange();
  const [year, setYear] = useState<number>(years[0]!);
  const { data, isLoading, error, refetch } = useReports({ year });

  return (
    <AppShell
      title="Laporan"
      subtitle="Ringkasan operasional dari data backend"
      actions={
        <TooltipProvider>
          <UiTooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" disabled aria-disabled="true">
                  <Download className="h-4 w-4 mr-1" />
                  Export (segera)
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Export laporan tersedia setelah backend membuka /reports/exports.
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="sm:w-32" aria-label="Tahun laporan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} title="Gagal memuat laporan" />
      ) : isLoading || !data ? (
        <ReportsSkeleton />
      ) : (
        <ReportsBody data={data} year={year} />
      )}

      <AuditSection />
    </AppShell>
  );
}

function ReportsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-7 w-24" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

type ReportsBodyProps = {
  data: NonNullable<ReturnType<typeof useReports>["data"]>;
  year: number;
};

function ReportsBody({ data, year }: ReportsBodyProps) {
  const { occupancy, residents, billingAging, revenue, complaints, vehicles, parking, maintenance } =
    data;

  const occupancyChart = [
    { name: "Terisi", value: occupancy.occupied, color: "var(--color-primary)" },
    { name: "Kosong", value: occupancy.vacant, color: "var(--color-success)" },
    { name: "Reserved", value: occupancy.reserved, color: "var(--color-chart-3)" },
    { name: "Maintenance", value: occupancy.maintenance, color: "var(--color-warning)" },
    { name: "Inactive", value: occupancy.inactive, color: "var(--color-muted-foreground)" },
  ].filter((d) => d.value > 0);

  const revenueChart = revenue.monthly.map((m) => ({
    month: MONTH_LABELS[m.month],
    income: m.amount,
  }));
  const hasRevenueData = revenue.monthly.some((m) => m.amount > 0);

  return (
    <>
      {/* KPI strip (consistent with Dashboard) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Pendapatan Terverifikasi ({year})
            </p>
            <p className="text-2xl font-semibold mt-2">{formatIDR(revenue.totalAmount)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {revenue.verifiedPayments} pembayaran terverifikasi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Rata-rata Bulanan
            </p>
            <p className="text-2xl font-semibold mt-2">{formatIDR(revenue.averageMonthlyAmount)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {revenue.bestMonth
                ? `Bulan terbaik: ${MONTH_LABELS[revenue.bestMonth.month]} (${formatIDR(revenue.bestMonth.amount)})`
                : "Belum ada bulan dengan pemasukan"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Piutang
            </p>
            <p className="text-2xl font-semibold mt-2">{formatIDR(billingAging.outstandingAmount)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {billingAging.unpaid} belum dibayar, {billingAging.overdue} overdue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pendapatan Bulanan</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Dari pembayaran terverifikasi tahun {year}
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {!hasRevenueData ? (
                <EmptyState
                  title="Belum ada pemasukan"
                  description={`Belum ada pembayaran terverifikasi pada tahun ${year}. Coba pilih tahun lain di filter di atas.`}
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChart}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${v}`)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => formatIDR(v)}
                    />
                    <Bar dataKey="income" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Okupansi Kamar</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {occupancy.occupancyPercent}% terisi dari inventaris aktif
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {occupancyChart.length === 0 ? (
                <EmptyState
                  title="Belum ada kamar"
                  description="Tambahkan kamar di halaman Kamar untuk melihat ringkasan okupansi."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={occupancyChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                    >
                      {occupancyChart.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        <SummaryCard
          title="Billing Aging"
          rows={[
            { label: "Total invoice", value: String(billingAging.totalInvoices) },
            { label: "Belum dibayar", value: String(billingAging.unpaid) },
            { label: "Overdue", value: String(billingAging.overdue) },
            { label: "Lunas", value: String(billingAging.paid) },
            { label: "Void", value: String(billingAging.voided) },
            { label: "Total piutang", value: formatIDR(billingAging.outstandingAmount) },
            { label: "Piutang overdue", value: formatIDR(billingAging.overdueAmount) },
          ]}
        />
        <SummaryCard
          title="Pembayaran"
          rows={[
            { label: "Terverifikasi", value: String(revenue.verifiedPayments) },
            { label: "Menunggu verifikasi", value: String(revenue.pendingPayments) },
            { label: "Void", value: String(revenue.voidedPayments) },
            { label: `Nilai (${year})`, value: formatIDR(revenue.verifiedAmount) },
          ]}
        />
        <SummaryCard
          title="Komplain"
          rows={[
            { label: "Total", value: String(complaints.total) },
            { label: "Aktif", value: String(complaints.open) },
            { label: "Resolved", value: String(complaints.resolved) },
            { label: "Closed", value: String(complaints.closed) },
            { label: "SLA terlanggar", value: String(complaints.slaBreached) },
          ]}
        />
        <SummaryCard
          title="Maintenance"
          rows={[
            { label: "Total work order", value: String(maintenance.total) },
            { label: "Aktif", value: String(maintenance.open) },
            { label: "In progress", value: String(maintenance.inProgress) },
            { label: "Completed", value: String(maintenance.completed) },
            { label: "Verified", value: String(maintenance.verified) },
            { label: "Cancelled", value: String(maintenance.cancelled) },
          ]}
        />
        <SummaryCard
          title="Kendaraan"
          rows={[
            { label: "Total", value: String(vehicles.total) },
            { label: "Active", value: String(vehicles.active) },
            { label: "Pending approval", value: String(vehicles.pendingApproval) },
            { label: "Suspended", value: String(vehicles.suspended) },
            { label: "Rejected", value: String(vehicles.rejected) },
            { label: "Inactive", value: String(vehicles.inactive) },
          ]}
        />
        <SummaryCard
          title="Parkir"
          rows={[
            { label: "Total zona aktif", value: String(parking.totalZones) },
            { label: "Kapasitas total", value: String(parking.totalCapacity) },
            { label: "Slot tercatat", value: String(parking.totalSlotsKnown) },
            { label: "Terisi", value: String(parking.occupied) },
            { label: "Tersedia", value: String(parking.available) },
            { label: "Reserved", value: String(parking.reserved) },
            { label: "Maintenance", value: String(parking.maintenance) },
            { label: "Utilisasi", value: `${parking.utilizationPercent}%` },
          ]}
        />
      </div>

      {/* Resident snapshot (compact, since residents endpoint already powers Dashboard) */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Penghuni</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Snapshot status penghuni saat ini</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-lg font-semibold">{residents.total}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Total</p>
            </div>
            <div className="rounded-lg bg-success/15 p-3">
              <p className="text-lg font-semibold text-success">{residents.active}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Aktif</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-lg font-semibold">{residents.inactive}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Nonaktif</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  const isEmpty = rows.every((r) => r.value === "0" || r.value === formatIDR(0));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">
            Belum ada data pada properti ini.
          </p>
        ) : (
          <dl className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit Viewer (placeholder until backend exposes /audit endpoint)
// ---------------------------------------------------------------------------

function AuditSection() {
  const { hasRole } = useAuth();
  if (!hasRole(["owner", "manager"])) return null;

  const audit = useAuditLogs();

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Audit Viewer
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Riwayat aksi sensitif (actor, action, resource, timestamp, correlation id).
        </p>
      </CardHeader>
      <CardContent>
        {audit.available ? (
          <div className="text-sm text-muted-foreground">
            {/* Reserved layout for next milestone: when audit endpoint ships, render
                a table here without restructuring the page. */}
            <BarChart3 className="inline h-4 w-4 mr-2" />
            {audit.data.length} entri audit ditemukan.
          </div>
        ) : (
          <EmptyState
            title="Audit Viewer belum tersedia"
            description={audit.reason}
            icon={<ShieldAlert className="h-5 w-5" />}
          />
        )}
      </CardContent>
    </Card>
  );
}
