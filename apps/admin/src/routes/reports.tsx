import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/reports")({ component: ReportsCompatibilityPage });

function ReportsCompatibilityPage() {
  return (
    <RouteFoundationPage
      title="Laporan"
      subtitle="Route kompatibilitas laporan"
      milestone="KMO-W10"
      stateTitle="Laporan belum tersedia"
      description="Authority laporan Penyewaan, Pembayaran, Pengeluaran, dan Keuangan akan tersedia setelah KMO-W10. Route ini tetap aman tanpa menampilkan ringkasan atau ekspor yang belum authoritative."
    />
  );
}
