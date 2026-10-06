import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";
import { parseOwnerRealizationDestination } from "@/lib/owner-realization-destination";

export const Route = createFileRoute("/property-owners/portal/reports")({
  validateSearch: parseOwnerRealizationDestination,
  component: OwnerReportsRoute,
});

function OwnerReportsRoute() {
  return <PropertyOwnerPortal view="reports" />;
}
