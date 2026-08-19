import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";

export const Route = createFileRoute("/property-owners/portal/account")({
  component: OwnerAccountRoute,
});

function OwnerAccountRoute() {
  return <PropertyOwnerPortal view="account" />;
}
