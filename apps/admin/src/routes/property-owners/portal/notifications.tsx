import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/notifications")({
  component: OwnerNotificationsRoute,
});

function OwnerNotificationsRoute() {
  return <PropertyOwnerPortal view="notifications" />;
}
