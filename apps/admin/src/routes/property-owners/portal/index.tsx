import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/")({
  component: OwnerDashboardRoute,
});

function OwnerDashboardRoute() {
  return <PropertyOwnerPortal view="dashboard" />;
}
