import { createFileRoute } from "@tanstack/react-router";
import { PropertyOwnerResidentDetailPage } from "@/components/property-owner-portal/PropertyOwnerResidentDetailPage";

export const Route = createFileRoute("/property-owners/portal/occupancy/$roomCode")({
  parseParams: (params) => {
    const roomCode = params.roomCode.trim();
    const containsControlCharacter = Array.from(roomCode).some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (!roomCode || roomCode.length > 80 || containsControlCharacter) {
      throw new Error("PROPERTY_OWNER_OCCUPANCY_ROOM_CODE_INVALID");
    }
    return { roomCode };
  },
  component: OwnerOccupancyResidentDetailRoute,
});

function OwnerOccupancyResidentDetailRoute() {
  const { roomCode } = Route.useParams();
  return <PropertyOwnerResidentDetailPage roomCode={roomCode} />;
}
