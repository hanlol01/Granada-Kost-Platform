import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

export const Route = createFileRoute("/syarat-ketentuan")({
  component: SyaratKetentuanRoute,
});

function SyaratKetentuanRoute() {
  return (
    <RouteFoundationPage
      title="Syarat & Ketentuan"
      subtitle="Aturan global dan per tipe kost"
      milestone="M4 — UI master kamar"
    />
  );
}
