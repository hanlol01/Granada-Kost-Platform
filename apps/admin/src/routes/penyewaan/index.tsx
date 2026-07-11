import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/penyewaan/")({
  component: PenyewaanIndexRoute,
});

function PenyewaanIndexRoute() {
  return (
    <RouteFoundationPage
      title="Penyewaan"
      subtitle="Daftar penyewaan dan status komersial"
      milestone="M6 — UX penyewaan"
    />
  );
}
