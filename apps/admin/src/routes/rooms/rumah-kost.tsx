import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/rooms/rumah-kost")({
  component: RumahKostRoute,
});

function RumahKostRoute() {
  return (
    <RouteFoundationPage
      title="Rumah Kost"
      subtitle="Inventori dan tipe kost"
      milestone="M4 — UI master kamar"
    />
  );
}
