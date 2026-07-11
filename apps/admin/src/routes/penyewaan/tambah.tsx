import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/penyewaan/tambah")({
  component: TambahPenyewaanRoute,
});

function TambahPenyewaanRoute() {
  return (
    <RouteFoundationPage
      title="Tambah Penyewaan"
      subtitle="Buat penyewaan baru"
      milestone="M6 — UX penyewaan"
    />
  );
}
