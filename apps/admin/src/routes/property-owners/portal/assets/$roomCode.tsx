import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerAssetDetailPage } from "@/components/property-owner-portal/PropertyOwnerAssetDetailPage";

export const Route = createFileRoute("/property-owners/portal/assets/$roomCode")({
  parseParams: (params) => {
    const roomCode = params.roomCode.trim();
    const containsControlCharacter = Array.from(roomCode).some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (!roomCode || roomCode.length > 80 || containsControlCharacter) {
      throw new Error("PROPERTY_OWNER_ASSET_CODE_INVALID");
    }
    return { roomCode };
  },
  component: PropertyOwnerAssetDetailRoute,
});

function PropertyOwnerAssetDetailRoute() {
  const { roomCode } = Route.useParams();
  return <PropertyOwnerAssetDetailPage roomCode={roomCode} />;
}
