export const reportTabs = [
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
  {
    type: "property-owners",
    route: "/reports/property-owners",
    label: "Realisasi Owner",
    description: "Hak Owner, transfer, dan publikasi",
  },
] as const;

export type ReportTabType = (typeof reportTabs)[number]["type"];
