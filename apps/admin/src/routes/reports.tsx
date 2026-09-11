import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reports")({ component: ReportsRouteLayout });

function ReportsRouteLayout() {
  return <Outlet />;
}
