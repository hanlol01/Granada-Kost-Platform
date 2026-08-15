import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PropertyOwnerWorkspace } from "@/components/property-owners/PropertyOwnerWorkspace";

export const Route = createFileRoute("/property-owners/$ownerId")({
  parseParams: (params) => {
    const ownerId = params.ownerId.trim();
    const containsControlCharacter = Array.from(ownerId).some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (!ownerId || ownerId.length > 120 || containsControlCharacter) {
      throw new Error("PROPERTY_OWNER_ID_INVALID");
    }
    return { ownerId };
  },
  component: PropertyOwnerDetailRoute,
});

function PropertyOwnerDetailRoute() {
  const { ownerId } = Route.useParams();

  return (
    <AppShell title="Detail Owner" subtitle="Profil, kredensial aman, dan kepemilikan aset">
      <PropertyOwnerWorkspace ownerId={ownerId} />
    </AppShell>
  );
}
