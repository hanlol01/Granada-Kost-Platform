import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/finance")({
  component: OwnerFinanceRoute,
});

function OwnerFinanceRoute() {
  return <PropertyOwnerPortal view="finance" />;
}
