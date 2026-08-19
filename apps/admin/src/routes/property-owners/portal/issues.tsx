import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/issues")({
  component: OwnerIssuesRoute,
});

function OwnerIssuesRoute() {
  return <PropertyOwnerPortal view="issues" />;
}
