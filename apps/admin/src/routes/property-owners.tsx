import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/property-owners")({
  component: PropertyOwnersRouteLayout,
});

function PropertyOwnersRouteLayout() {
  return <Outlet />;
}
