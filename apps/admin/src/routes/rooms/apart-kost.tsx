import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/rooms/apart-kost")({
  component: ApartKostRoute,
});

function ApartKostRoute() {
  return (
    <RouteFoundationPage
      title="Apart Kost"
      subtitle="Inventori dan tipe kost"
      milestone="M4 — UI master kamar"
    />
  );
}
