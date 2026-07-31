import { createFileRoute } from "@tanstack/react-router";
import { RoomDetailPage } from "@/components/rooms/RoomDetailPage";

export const Route = createFileRoute("/rooms/$roomNumber")({
  parseParams: (params) => {
    const roomNumber = params.roomNumber.trim();
    const containsControlCharacter = Array.from(roomNumber).some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (!roomNumber || roomNumber.length > 80 || containsControlCharacter) {
      throw new Error("ROOM_NUMBER_INVALID");
    }
    return { roomNumber };
  },
  component: RoomDetailRoute,
});

function RoomDetailRoute() {
  const { roomNumber } = Route.useParams();
  return <RoomDetailPage roomNumber={roomNumber} />;
}
