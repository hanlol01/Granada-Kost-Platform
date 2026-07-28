import { createFileRoute } from "@tanstack/react-router";
import { KostTypeInventoryPage } from "@/components/rooms/KostTypeInventoryPage";
import { normalizeRoomCreateRequest, normalizeRoomSearch } from "@/lib/admin-ux-master-helpers";

type RoomCategoryRouteSearch = {
  q: string;
  building_id?: string;
  floor?: string;
  status?: "vacant" | "reserved" | "occupied" | "maintenance" | "inactive" | "requires_review";
  visibility?: "visible" | "hidden";
  offset: number;
  limit: number;
  room_id?: string;
  create?: boolean;
};

function validateSearch(raw: Record<string, unknown>): RoomCategoryRouteSearch {
  const search = normalizeRoomSearch(raw);
  return {
    q: search.q,
    building_id: search.buildingId,
    floor: search.floor,
    status: search.status,
    visibility: search.visibility,
    offset: search.offset,
    limit: search.limit,
    room_id: search.roomId,
    create: normalizeRoomCreateRequest(raw.create) || undefined,
  };
}

export const Route = createFileRoute("/rooms/apart-kost")({
  validateSearch,
  component: ApartKostRoute,
});

function ApartKostRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <KostTypeInventoryPage
      category="apartkost"
      search={{
        q: search.q,
        buildingId: search.building_id,
        floor: search.floor,
        status: search.status,
        visibility: search.visibility,
        offset: search.offset,
        limit: search.limit,
        roomId: search.room_id,
      }}
      createRequested={search.create === true}
      onCreateConsumed={() =>
        navigate({
          replace: true,
          search: (current) => ({ ...current, create: undefined }),
        })
      }
      onSearchChange={(next) =>
        navigate({
          search: (current) => ({
            q: Object.prototype.hasOwnProperty.call(next, "q") ? (next.q ?? "") : current.q,
            building_id: Object.prototype.hasOwnProperty.call(next, "buildingId")
              ? next.buildingId
              : current.building_id,
            floor: Object.prototype.hasOwnProperty.call(next, "floor") ? next.floor : current.floor,
            status: Object.prototype.hasOwnProperty.call(next, "status")
              ? next.status
              : current.status,
            visibility: Object.prototype.hasOwnProperty.call(next, "visibility")
              ? next.visibility
              : current.visibility,
            offset: Object.prototype.hasOwnProperty.call(next, "offset")
              ? (next.offset ?? 0)
              : current.offset,
            limit: current.limit,
            room_id: Object.prototype.hasOwnProperty.call(next, "roomId")
              ? next.roomId
              : current.room_id,
            create: current.create,
          }),
        })
      }
    />
  );
}
