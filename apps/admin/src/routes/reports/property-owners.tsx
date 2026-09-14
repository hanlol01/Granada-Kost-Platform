import { createFileRoute } from "@tanstack/react-router";
import { OwnerSettlementWorkspace } from "@/components/reports/OwnerSettlementWorkspace";

export const Route = createFileRoute("/reports/property-owners")({
  component: OwnerSettlementWorkspace,
});
