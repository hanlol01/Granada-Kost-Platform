import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getAdminReport, type AdminReportFilters, type AdminReportType } from "@/lib/admin-reports";
import { ReportNotificationsCard, type ReportNoticeItem } from "./ReportNotificationsCard";

type ReportAttentionDefinition = {
  key: string;
  label: string;
  description: string;
  group: ReportNoticeItem["group"];
  tone: ReportNoticeItem["tone"];
  filters: Partial<AdminReportFilters>;
};

const definitions: Record<Exclude<AdminReportType, "finance">, ReportAttentionDefinition[]> = {
  leases: [
    {
      key: "inspection_required",
      label: "Check-out menunggu pemeriksaan",
      description: "Kamar perlu diperiksa sebelum proses check-out dilanjutkan.",
      group: "action",
      tone: "warning",
      filters: { checkout_status: "inspection_required" },
    },
    {
      key: "settlement_pending",
      label: "Check-out menunggu penyelesaian",
      description: "Penyelesaian akhir belum ditetapkan.",
      group: "action",
      tone: "warning",
      filters: { checkout_status: "settlement_pending" },
    },
    {
      key: "refund_pending",
      label: "Pengembalian akhir tertunda",
      description: "Pengembalian dana check-out belum selesai.",
      group: "action",
      tone: "warning",
      filters: { financial_status: "refund_pending" },
    },
    {
      key: "amount_due",
      label: "Tagihan akhir belum lunas",
      description: "Penghuni masih memiliki kewajiban setelah check-out.",
      group: "action",
      tone: "danger",
      filters: { financial_status: "amount_due" },
    },
    {
      key: "ended",
      label: "Kontrak berakhir pada periode ini",
      description: "Kontrak dengan tanggal akhir dalam rentang laporan.",
      group: "information",
      tone: "info",
      filters: { date_basis: "ended" },
    },
  ],
  payments: [
    {
      key: "pending_confirmation",
      label: "Pembayaran menunggu konfirmasi",
      description: "Pembayaran belum diverifikasi dan belum dihitung sebagai kas masuk.",
      group: "action",
      tone: "warning",
      filters: { status: "pending_confirmation" },
    },
    {
      key: "reversed",
      label: "Pembayaran dibalik",
      description: "Transaksi yang dibalik tetap tercatat untuk pemeriksaan riwayat.",
      group: "information",
      tone: "info",
      filters: { status: "reversed" },
    },
  ],
  expenses: [
    {
      key: "pending_approval",
      label: "Pengeluaran menunggu persetujuan",
      description: "Catatan pengeluaran masih menunggu keputusan.",
      group: "action",
      tone: "warning",
      filters: { status: "pending_approval" },
    },
    {
      key: "approved",
      label: "Pengeluaran disetujui, belum dibayar",
      description: "Pengeluaran yang telah disetujui belum menjadi kas keluar.",
      group: "action",
      tone: "warning",
      filters: { status: "approved" },
    },
    {
      key: "draft",
      label: "Draft pengeluaran",
      description: "Catatan yang belum diajukan untuk persetujuan.",
      group: "information",
      tone: "info",
      filters: { status: "draft" },
    },
  ],
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function tanggal(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}

export function ReportNotifications({
  type,
  propertyId,
  dateFrom,
  dateTo,
  onSelect,
}: {
  type: AdminReportType;
  propertyId: string;
  dateFrom: string;
  dateTo: string;
  onSelect: (filters: Partial<AdminReportFilters>) => void;
}) {
  const navigate = useNavigate();
  const entries = type === "finance" ? [] : definitions[type];
  const requests = useQueries({
    queries: (type === "finance" ? [{ key: "finance", filters: {} }] : entries).map((entry) => ({
      queryKey: ["report-notification", type, propertyId, dateFrom, dateTo, entry.key],
      queryFn: () =>
        getAdminReport(type, {
          property_id: propertyId,
          date_from: dateFrom,
          date_to: dateTo,
          ...entry.filters,
          limit: 1,
          offset: 0,
        }),
      enabled: Boolean(propertyId && dateFrom && dateTo),
      staleTime: 30_000,
    })),
  });
  const isLoading = requests.some((request) => request.isPending);
  const isError = requests.some((request) => request.isError);
  const items: ReportNoticeItem[] =
    type === "finance"
      ? (() => {
          const summary = requests[0]?.data?.summary;
          const receivables = summary?.receivables ?? 0;
          const netCash = summary?.net_operational_cash ?? 0;
          return [
            {
              key: "receivables",
              label: "Piutang jatuh tempo",
              description: `Tagihan yang masih belum lunas dengan tenggat hingga ${tanggal(dateTo)}. Buka daftar tagihan belum dibayar.`,
              value: rupiah(receivables),
              active: receivables > 0,
              group: "action",
              tone: "warning",
              onSelect: () => void navigate({ to: "/payments" }),
            },
            {
              key: "negative_cash",
              label: "Arus kas operasional negatif",
              description: "Kas keluar operasional melebihi kas masuk pada rentang ini.",
              value: rupiah(Math.abs(netCash)),
              active: netCash < 0,
              group: "information",
              tone: "info",
              onSelect: () => onSelect({}),
            },
          ];
        })()
      : entries.map((entry, index) => {
          const count = requests[index]?.data?.meta.total ?? 0;
          return {
            key: entry.key,
            label: entry.label,
            description: entry.description,
            value: new Intl.NumberFormat("id-ID").format(count),
            active: count > 0,
            group: entry.group,
            tone: entry.tone,
            onSelect: () => onSelect(entry.filters),
          };
        });

  return (
    <ReportNotificationsCard
      id={`report-notifications-${type}`}
      items={items}
      context={`Periode ${tanggal(dateFrom)} sampai ${tanggal(dateTo)}.`}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void Promise.all(requests.map((request) => request.refetch()))}
    />
  );
}
