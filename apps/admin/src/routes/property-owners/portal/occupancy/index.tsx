import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/occupancy/")({
  component: OwnerOccupancyRoute,
});

function OwnerOccupancyRoute() {
  return <PropertyOwnerPortal view="occupancy" />;
}
