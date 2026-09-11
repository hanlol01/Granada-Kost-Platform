import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/")({ component: ReportsIndexRoute });

function ReportsIndexRoute() {
  return <Navigate to="/reports/leases" replace />;
}
