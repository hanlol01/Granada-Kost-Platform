import { createFileRoute } from "@tanstack/react-router";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export const Route = createFileRoute("/reports/finance")({
  component: () => <ReportsWorkspace type="finance" />,
});
