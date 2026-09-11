import { createFileRoute } from "@tanstack/react-router";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";

export const Route = createFileRoute("/reports/payments")({
  component: () => <ReportsWorkspace type="payments" />,
});
