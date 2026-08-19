import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/reports")({
  component: OwnerReportsRoute,
});

function OwnerReportsRoute() {
  return <PropertyOwnerPortal view="reports" />;
}
