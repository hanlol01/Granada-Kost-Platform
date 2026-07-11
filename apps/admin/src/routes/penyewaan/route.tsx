import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/penyewaan")({
  component: PenyewaanRouteLayout,
});

function PenyewaanRouteLayout() {
  return <Outlet />;
}
