import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PropertyOwnerWorkspace } from "@/components/property-owners/PropertyOwnerWorkspace";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/property-owners/")({
  component: PropertyOwnersIndexRoute,
});

function PropertyOwnersIndexRoute() {
  const { hasRole } = useAuth();
  if (hasRole("property_owner")) return <Navigate to="/property-owners/portal" replace />;

  return (
    <AppShell title="Owner Property" subtitle="Kelola pemilik aset Rumah Kost dan Apart Kost">
      <PropertyOwnerWorkspace />
    </AppShell>
  );
}
