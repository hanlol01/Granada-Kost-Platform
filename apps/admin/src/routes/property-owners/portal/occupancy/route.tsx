import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/property-owners/portal/occupancy")({
  component: OwnerOccupancyRouteLayout,
});

function OwnerOccupancyRouteLayout() {
  return <Outlet />;
}
