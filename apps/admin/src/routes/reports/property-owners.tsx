import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/property-owners")({
  component: ReportsPropertyOwnersLayout,
});

function ReportsPropertyOwnersLayout() {
  return <Outlet />;
}
