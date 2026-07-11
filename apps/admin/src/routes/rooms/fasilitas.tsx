import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/rooms/fasilitas")({
  component: FasilitasRoute,
});

function FasilitasRoute() {
  return (
    <RouteFoundationPage
      title="Fasilitas"
      subtitle="Master fasilitas tipe kost"
      milestone="M4 — UI master kamar"
    />
  );
}
