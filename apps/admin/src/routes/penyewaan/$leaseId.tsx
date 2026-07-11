import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/penyewaan/$leaseId")({
  component: DetailPenyewaanRoute,
});

function DetailPenyewaanRoute() {
  return (
    <RouteFoundationPage
      title="Detail Penyewaan"
      subtitle="Detail komersial penyewaan"
      milestone="M6 — UX penyewaan"
    />
  );
}
