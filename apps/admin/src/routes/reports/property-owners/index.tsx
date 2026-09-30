import { createFileRoute } from "@tanstack/react-router";
import { OwnerRealizationWorkspace } from "@/components/reports/OwnerRealizationWorkspace";

export const Route = createFileRoute("/reports/property-owners/")({
  component: OwnerRealizationWorkspace,
});
