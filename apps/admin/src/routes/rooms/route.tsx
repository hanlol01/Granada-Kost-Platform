import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rooms")({
  component: RoomsRouteLayout,
});

function RoomsRouteLayout() {
  return <Outlet />;
}
