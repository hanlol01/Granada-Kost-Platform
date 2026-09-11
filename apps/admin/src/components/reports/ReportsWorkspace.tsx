import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useM4AllRoomBuildings } from "@/hooks/useAdminUxMaster";
import {
  downloadAdminReport,
  getAdminReport,
  type AdminReportFilters,
  type AdminReportType,
  type ReportScalar,
} from "@/lib/admin-reports";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const reportTabs = [
  {
    type: "leases",
    route: "/reports/leases",
    label: "Penyewaan",
    description: "Kontrak dan masa sewa",
  },
  {
    type: "payments",
    route: "/reports/payments",
    label: "Pembayaran",
    description: "Kas masuk terverifikasi",
  },
  {
    type: "expenses",
    route: "/reports/expenses",
    label: "Pengeluaran",
    description: "Biaya operasional",
  },
  {
    type: "finance",
    route: "/reports/finance",
    label: "Keuangan",
    description: "Arus kas operasional",
  },
] as const;

const summaryLabels: Record<string, string> = {
  total_contracts: "Total kontrak",
  active_contracts: "Kontrak aktif",
  started_contracts: "Mulai pada periode",
  ended_contracts: "Berakhir pada periode",
  ending_soon: "Berakhir ≤ 30 hari",
  contract_value: "Nilai kontrak",
  total_payments: "Total pembayaran",
  verified_rent: "Sewa terverifikasi",
  deposit_collected: "Deposit diterima",
  other_income: "Penerimaan lainnya",
  pending_amount: "Menunggu verifikasi",
  reversed_amount: "Pembayaran dibalik",
  total_expenses: "Total pengeluaran",
  paid_amount: "Sudah dibayar",
  pending_expense_amount: "Belum dibayar",
  approved_amount: "Sudah disetujui",
  cancelled_or_reversed: "Dibatalkan / dibalik",
  rent_cash_in: "Kas masuk sewa",
  other_cash_in: "Kas masuk lainnya",
  deposit_refunded: "Deposit dikembalikan",
  expenses_paid: "Kas keluar operasional",
  receivables: "Piutang belum dibayar",
  management_fee: "Management fee",
  owner_entitlement_recorded: "Hak Owner tercatat",
  owner_paid: "Sudah dibayarkan ke Owner",
  owner_unpaid: "Belum dibayarkan ke Owner",
  net_operational_cash: "Arus kas operasional bersih",
};

const moneyKeys = new Set([
  "contract_value",
  "monthly_price",
  "amount",
  "verified_rent",
  "deposit_collected",
  "other_income",
  "pending_amount",
  "reversed_amount",
  "paid_amount",
  "pending_expense_amount",
  "approved_amount",
  "cancelled_or_reversed",
  "rent_cash_in",
  "other_cash_in",
  "deposit_refunded",
  "expenses_paid",
  "receivables",
  "management_fee",
  "owner_entitlement_recorded",
  "owner_paid",
  "owner_unpaid",
  "net_operational_cash",
]);

const columnLabels: Record<string, string> = {
  lease_code: "Kode kontrak",
  resident_name: "Penghuni",
  gender: "Gender",
  room_code: "Kamar",
  building_name: "Bangunan",
  category: "Tipe kost",
  lease_status: "Status",
  start_date: "Mulai",
  end_date: "Berakhir",
  term_months: "Durasi",
  payment_plan: "Rencana bayar",
  pricing_tier: "Paket harga",
  monthly_price: "Tarif / bulan",
  contract_value: "Nilai kontrak",
  payment_code: "Kode pembayaran",
  purpose: "Jenis",
  method: "Metode",
  status: "Status",
  amount: "Nominal",
  has_evidence: "Bukti",
  payment_date: "Tanggal",
  reference_number: "Referensi",
  expense_date: "Tanggal",
  vendor_name: "Vendor",
  notes: "Catatan",
  event_date: "Tanggal",
  reference: "Referensi",
  description: "Aktivitas",
  movement: "Arah",
};

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultFilters(propertyId: string): AdminReportFilters {
  const today = localDate();
  return {
    property_id: propertyId,
    date_from: `${today.slice(0, 7)}-01`,
    date_to: today,
    limit: PAGE_SIZE,
    offset: 0,
  };
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

const valueLabels: Record<string, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
  male: "Putra",
  female: "Putri",
  active: "Aktif",
  awaiting_activation: "Menunggu aktivasi",
  ended: "Berakhir",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  transferred: "Pindah kamar",
  verified: "Terverifikasi",
  pending_confirmation: "Menunggu konfirmasi",
  rejected: "Ditolak",
  reversed: "Dibalik",
  paid: "Dibayar",
  pending_approval: "Menunggu persetujuan",
  approved: "Disetujui",
  rent: "Sewa",
  dp: "Uang muka",
  security_deposit: "Deposit keamanan",
  other_charge: "Pembayaran lainnya",
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  ewallet: "E-wallet",
  other: "Lainnya",
  cash_in: "Kas masuk",
  cash_out: "Kas keluar",
  deposit: "Deposit masuk",
  deposit_refund: "Deposit dikembalikan",
};

function display(key: string, value: ReportScalar) {
  if (value === null || value === "") return "—";
  if (moneyKeys.has(key) && typeof value === "number") return rupiah(value);
  if (key === "term_months") return `${value} bulan`;
  if ((key.endsWith("_date") || key === "event_date") && typeof value === "string") {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
      new Date(`${value}T00:00:00`),
    );
  }
  if (typeof value === "boolean") return value ? "Ada" : "Tidak ada";
  return valueLabels[String(value)] ?? String(value).replaceAll("_", " ");
}

const visibleColumns: Record<AdminReportType, string[]> = {
  leases: [
    "lease_code",
    "resident_name",
    "room_code",
    "lease_status",
    "start_date",
    "end_date",
    "term_months",
    "monthly_price",
    "contract_value",
  ],
  payments: [
    "payment_code",
    "resident_name",
    "room_code",
    "payment_date",
    "purpose",
    "method",
    "status",
    "amount",
    "has_evidence",
  ],
  expenses: [
    "expense_date",
    "category",
    "building_name",
    "vendor_name",
    "method",
    "status",
    "amount",
    "has_evidence",
  ],
  finance: [
    "event_date",
    "reference",
    "description",
    "room_code",
    "building_name",
    "movement",
    "amount",
  ],
};

export function ReportsWorkspace({ type }: { type: AdminReportType }) {
  const { currentPropertyId } = useProperty();
  const buildings = useM4AllRoomBuildings();
  const [draft, setDraft] = useState<AdminReportFilters>(() =>
    defaultFilters(currentPropertyId ?? ""),
  );
  const [applied, setApplied] = useState<AdminReportFilters>(() =>
    defaultFilters(currentPropertyId ?? ""),
  );
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  useEffect(() => {
    if (!currentPropertyId) return;
    const restored: AdminReportFilters = defaultFilters(currentPropertyId);
    const params = new URLSearchParams(window.location.search);
    const keys: Array<keyof AdminReportFilters> = [
      "date_from",
      "date_to",
      "q",
      "status",
      "category",
      "building_id",
      "gender",
      "method",
      "purpose",
      "payment_plan",
      "date_basis",
      "has_evidence",
    ];
    keys.forEach((key) => {
      const value = params.get(key);
      if (value) restored[key] = value as never;
    });
    const offset = Number(params.get("offset"));
    restored.offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    setDraft(restored);
    setApplied(restored);
  }, [currentPropertyId, type]);

  const filters = useMemo(
    () => ({ ...applied, property_id: currentPropertyId ?? "", limit: PAGE_SIZE }),
    [applied, currentPropertyId],
  );
  const query = useQuery({
    queryKey: ["admin-report", type, filters],
    queryFn: () => getAdminReport(type, filters),
    enabled: Boolean(currentPropertyId),
    placeholderData: (previous) => previous,
  });

  const update = (key: keyof AdminReportFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value || undefined }));
  const apply = () => {
    const next = { ...draft, property_id: currentPropertyId ?? "", limit: PAGE_SIZE, offset: 0 };
    setApplied(next);
    const url = new URL(window.location.href);
    Object.entries(next).forEach(([key, value]) =>
      value ? url.searchParams.set(key, String(value)) : url.searchParams.delete(key),
    );
    history.replaceState(null, "", url);
  };
  const reset = () => {
    const next = defaultFilters(currentPropertyId ?? "");
    setDraft(next);
    setApplied(next);
    history.replaceState(null, "", window.location.pathname);
  };
  const page = (offset: number) => {
    const nextOffset = Math.max(0, offset);
    setApplied((current) => ({ ...current, offset: nextOffset }));
    const url = new URL(window.location.href);
    url.searchParams.set("offset", String(nextOffset));
    history.replaceState(null, "", url);
  };
  const exportReport = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      await downloadAdminReport(type, format, { ...filters, offset: 0 });
      toast.success(`Laporan ${format.toUpperCase()} berhasil dibuat.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekspor laporan gagal.");
    } finally {
      setExporting(null);
    }
  };

  if (!currentPropertyId)
    return (
      <AppShell title="Laporan">
        <LoadingState label="Menyiapkan properti..." />
      </AppShell>
    );

  const data = query.data;
  const columns = visibleColumns[type];
  const start = data?.meta.total ? data.meta.offset + 1 : 0;
  const end = data ? Math.min(data.meta.offset + data.rows.length, data.meta.total) : 0;

  return (
    <AppShell title="Laporan" subtitle="Ringkasan resmi untuk operasional dan keuangan properti">
      <div className="space-y-5">
        <nav
          aria-label="Jenis laporan"
          className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {reportTabs.map((tab) => (
            <Button
              key={tab.type}
              asChild
              variant={tab.type === type ? "default" : "ghost"}
              className="h-auto justify-start px-4 py-3 text-left"
            >
              <Link to={tab.route}>
                <span>
                  <span className="block font-semibold">{tab.label}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs",
                      tab.type === type ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {tab.description}
                  </span>
                </span>
              </Link>
            </Button>
          ))}
        </nav>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              Filter {reportTabs.find((tab) => tab.type === type)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm font-medium">
              Dari tanggal
              <Input
                type="date"
                value={draft.date_from}
                onChange={(event) => update("date_from", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Sampai tanggal
              <Input
                type="date"
                value={draft.date_to}
                onChange={(event) => update("date_to", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium xl:col-span-2">
              Pencarian
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={draft.q ?? ""}
                  onChange={(event) => update("q", event.target.value)}
                  placeholder="Cari penghuni, kamar, kode, bangunan, atau referensi"
                />
              </div>
            </label>
            {type !== "expenses" ? (
              <label className="space-y-1 text-sm font-medium">
                Tipe kost
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.category ?? ""}
                  onChange={(event) => update("category", event.target.value)}
                >
                  <option value="">Semua tipe</option>
                  <option value="rukost">Rumah Kost</option>
                  <option value="apartkost">Apart Kost</option>
                </select>
              </label>
            ) : (
              <label className="space-y-1 text-sm font-medium">
                Kategori pengeluaran
                <Input
                  value={draft.category ?? ""}
                  onChange={(event) => update("category", event.target.value)}
                  placeholder="Contoh: Perawatan AC"
                />
              </label>
            )}
            <label className="space-y-1 text-sm font-medium">
              Bangunan
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.building_id ?? ""}
                onChange={(event) => update("building_id", event.target.value)}
              >
                <option value="">Semua bangunan</option>
                {(buildings.data ?? []).map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.buildingName}
                  </option>
                ))}
              </select>
            </label>
            {type === "leases" ? (
              <>
                <label className="space-y-1 text-sm font-medium">
                  Dasar tanggal
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.date_basis ?? "active"}
                    onChange={(event) => update("date_basis", event.target.value)}
                  >
                    <option value="active">Aktif dalam periode</option>
                    <option value="started">Mulai dalam periode</option>
                    <option value="ended">Berakhir dalam periode</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Status kontrak
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.status ?? ""}
                    onChange={(event) => update("status", event.target.value)}
                  >
                    <option value="">Semua status</option>
                    <option value="active">Aktif</option>
                    <option value="awaiting_activation">Menunggu aktivasi</option>
                    <option value="ended">Berakhir</option>
                    <option value="completed">Selesai</option>
                    <option value="cancelled">Dibatalkan</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Gender penghuni
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.gender ?? ""}
                    onChange={(event) => update("gender", event.target.value)}
                  >
                    <option value="">Semua gender</option>
                    <option value="male">Putra</option>
                    <option value="female">Putri</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Rencana pembayaran
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.payment_plan ?? ""}
                    onChange={(event) => update("payment_plan", event.target.value)}
                  >
                    <option value="">Semua rencana</option>
                    <option value="annual_full">Lunas penuh</option>
                    <option value="monthly_installments">Angsuran bulanan</option>
                    <option value="two_month_installments">Angsuran dua bulanan</option>
                  </select>
                </label>
              </>
            ) : null}
            {type === "payments" ? (
              <>
                <label className="space-y-1 text-sm font-medium">
                  Status pembayaran
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.status ?? ""}
                    onChange={(event) => update("status", event.target.value)}
                  >
                    <option value="">Semua status</option>
                    <option value="verified">Terverifikasi</option>
                    <option value="pending_confirmation">Menunggu konfirmasi</option>
                    <option value="rejected">Ditolak</option>
                    <option value="reversed">Dibalik</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Jenis pembayaran
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.purpose ?? ""}
                    onChange={(event) => update("purpose", event.target.value)}
                  >
                    <option value="">Semua jenis</option>
                    <option value="rent">Sewa</option>
                    <option value="dp">Uang muka</option>
                    <option value="security_deposit">Deposit</option>
                    <option value="other_charge">Lainnya</option>
                  </select>
                </label>
              </>
            ) : null}
            {type === "expenses" ? (
              <label className="space-y-1 text-sm font-medium">
                Status pengeluaran
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.status ?? ""}
                  onChange={(event) => update("status", event.target.value)}
                >
                  <option value="">Semua status</option>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Menunggu persetujuan</option>
                  <option value="approved">Disetujui</option>
                  <option value="paid">Dibayar</option>
                  <option value="cancelled">Dibatalkan</option>
                  <option value="reversed">Dibalik</option>
                </select>
              </label>
            ) : null}
            {type === "payments" || type === "expenses" ? (
              <>
                <label className="space-y-1 text-sm font-medium">
                  Metode
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.method ?? ""}
                    onChange={(event) => update("method", event.target.value)}
                  >
                    <option value="">Semua metode</option>
                    <option value="cash">Tunai</option>
                    <option value="bank_transfer">Transfer bank</option>
                    <option value="qris">QRIS</option>
                    <option value="ewallet">E-wallet</option>
                    <option value="other">Lainnya</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Bukti transaksi
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.has_evidence ?? ""}
                    onChange={(event) => update("has_evidence", event.target.value)}
                  >
                    <option value="">Semua data</option>
                    <option value="yes">Ada bukti</option>
                    <option value="no">Tanpa bukti</option>
                  </select>
                </label>
              </>
            ) : null}
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
              <Button onClick={apply} disabled={query.isFetching}>
                <FileText />
                Tampilkan
              </Button>
              <Button variant="destructive" onClick={reset}>
                <RefreshCcw />
                Reset filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {query.isLoading ? <LoadingState label="Menyiapkan laporan..." /> : null}
        {query.error ? (
          <ErrorState
            title="Laporan gagal dimuat"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {data ? (
          <>
            <section
              aria-label="Ringkasan laporan"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {Object.entries(data.summary).map(([key, value]) => (
                <Card
                  key={key}
                  className={cn(key === "net_operational_cash" && "border-primary/40 bg-primary/5")}
                >
                  <CardContent className="p-5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {summaryLabels[key] ?? key}
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-tight">
                      {moneyKeys.has(key)
                        ? rupiah(value)
                        : new Intl.NumberFormat("id-ID").format(value)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card>
              <CardHeader className="gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{data.title}</CardTitle>
                  <p className="mt-1 text-sm font-medium text-foreground">{data.property_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{data.methodology}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void exportReport("pdf")} disabled={Boolean(exporting)}>
                    <Download />
                    {exporting === "pdf" ? "Membuat PDF..." : "Unduh PDF"}
                  </Button>
                  <Button
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => void exportReport("xlsx")}
                    disabled={Boolean(exporting)}
                  >
                    <FileSpreadsheet />
                    {exporting === "xlsx" ? "Membuat XLSX..." : "Unduh XLSX"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.rows.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <FileText className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-3 font-medium">Tidak ada data pada filter ini</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ubah periode atau hapus sebagian filter untuk melihat data lain.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                          <tr>
                            {columns.map((key) => (
                              <th key={key} className="px-4 py-3 font-semibold">
                                {columnLabels[key] ?? key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.rows.map((row, index) => (
                            <tr key={String(row.id ?? index)} className="border-t">
                              {columns.map((key) => (
                                <td
                                  key={key}
                                  className={cn(
                                    "px-4 py-3 align-top",
                                    moneyKeys.has(key) && "font-semibold",
                                  )}
                                >
                                  {key === "status" ||
                                  key === "lease_status" ||
                                  key === "movement" ? (
                                    <Badge variant="outline" className="capitalize">
                                      {display(key, row[key])}
                                    </Badge>
                                  ) : (
                                    display(key, row[key])
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="divide-y md:hidden">
                      {data.rows.map((row, index) => (
                        <article key={String(row.id ?? index)} className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{display(columns[0], row[columns[0]])}</p>
                            {row.status || row.lease_status || row.movement ? (
                              <Badge variant="outline" className="capitalize">
                                {display("status", row.status ?? row.lease_status ?? row.movement)}
                              </Badge>
                            ) : null}
                          </div>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {columns.slice(1).map((key) => (
                              <div key={key}>
                                <dt className="text-xs text-muted-foreground">
                                  {columnLabels[key] ?? key}
                                </dt>
                                <dd
                                  className={cn(
                                    "mt-0.5 text-sm",
                                    moneyKeys.has(key) && "font-semibold",
                                  )}
                                >
                                  {display(key, row[key])}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan{" "}
                    <span className="font-medium text-foreground">
                      {start}–{end}
                    </span>{" "}
                    dari <span className="font-medium text-foreground">{data.meta.total}</span> data
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      onClick={() => page(data.meta.offset - PAGE_SIZE)}
                      disabled={data.meta.offset === 0 || query.isFetching}
                    >
                      <ArrowLeft />
                      Kembali
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => page(data.meta.offset + PAGE_SIZE)}
                      disabled={end >= data.meta.total || query.isFetching}
                    >
                      Lanjut
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
