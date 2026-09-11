import { createFileRoute } from "@tanstack/react-router";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export const Route = createFileRoute("/reports/leases")({
  component: () => <ReportsWorkspace type="leases" />,
});
