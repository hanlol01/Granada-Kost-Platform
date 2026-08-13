import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerWorkspace } from "@/components/property-owners/PropertyOwnerWorkspace";
import { PropertyOwnerPortal } from "@/components/property-owner-portal/PropertyOwnerPortal";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/property-owners")({ component: PropertyOwnersRoute });

function PropertyOwnersRoute() {
  const { hasRole } = useAuth();
  return hasRole("property_owner") ? <PropertyOwnerPortal /> : <PropertyOwnerWorkspace />;
}
