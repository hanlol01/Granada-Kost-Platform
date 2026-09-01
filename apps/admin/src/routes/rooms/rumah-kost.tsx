import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KostTypeInventoryPage } from "@/components/rooms/KostTypeInventoryPage";
import { normalizeRoomCreateRequest, normalizeRoomSearch } from "@/lib/admin-ux-master-helpers";

export type RoomCategoryRouteSearch = {
  q: string;
  building_id?: string;
  floor_code?: "A" | "B";
  status?:
    | "vacant"
    | "reserved"
    | "awaiting_check_in"
    | "occupied"
    | "maintenance"
    | "inactive"
    | "requires_review";
  gender_policy?: "male" | "female";
  active_occupancy?: boolean;
  reconciliation_state?: "normal" | "requires_review";
  sort?:
    | "room_number"
    | "building"
    | "category"
    | "gender_policy"
    | "status"
    | "active_resident"
    | "updated_at";
  order?: "asc" | "desc";
  offset: number;
  limit: number;
  create?: boolean;
};

function validateSearch(raw: Record<string, unknown>): RoomCategoryRouteSearch {
  const search = normalizeRoomSearch(raw);
  return {
    q: search.q,
    building_id: search.buildingId,
    floor_code: search.floorCode,
    status: search.status,
    gender_policy: search.genderPolicy,
    active_occupancy: search.activeOccupancy,
    reconciliation_state: search.reconciliationState,
    sort: search.sort,
    order: search.order,
    offset: search.offset,
    limit: search.limit,
    create: normalizeRoomCreateRequest(raw.create) || undefined,
  };
}

export const Route = createFileRoute("/rooms/rumah-kost")({
  validateSearch,
  component: RumahKostRoute,
});

function RumahKostRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (search.create) {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, create: undefined }),
      });
    }
  }, [navigate, search.create]);
  return (
    <KostTypeInventoryPage
      category="rukost"
      search={{
        q: search.q,
        buildingId: search.building_id,
        floorCode: search.floor_code,
        status: search.status,
        genderPolicy: search.gender_policy,
        activeOccupancy: search.active_occupancy,
        reconciliationState: search.reconciliation_state,
        sort: search.sort,
        order: search.order,
        offset: search.offset,
        limit: search.limit,
      }}
      onSearchChange={(next) =>
        navigate({
          resetScroll: false,
          search: (current) => ({
            q: Object.prototype.hasOwnProperty.call(next, "q") ? (next.q ?? "") : current.q,
            building_id: Object.prototype.hasOwnProperty.call(next, "buildingId")
              ? next.buildingId
              : current.building_id,
            floor_code: Object.prototype.hasOwnProperty.call(next, "floorCode")
              ? next.floorCode
              : current.floor_code,
            status: Object.prototype.hasOwnProperty.call(next, "status")
              ? next.status
              : current.status,
            gender_policy: Object.prototype.hasOwnProperty.call(next, "genderPolicy")
              ? next.genderPolicy
              : current.gender_policy,
            active_occupancy: Object.prototype.hasOwnProperty.call(next, "activeOccupancy")
              ? next.activeOccupancy
              : current.active_occupancy,
            reconciliation_state: Object.prototype.hasOwnProperty.call(next, "reconciliationState")
              ? next.reconciliationState
              : current.reconciliation_state,
            sort: Object.prototype.hasOwnProperty.call(next, "sort") ? next.sort : current.sort,
            order: Object.prototype.hasOwnProperty.call(next, "order") ? next.order : current.order,
            offset: Object.prototype.hasOwnProperty.call(next, "offset")
              ? (next.offset ?? 0)
              : current.offset,
            limit: current.limit,
            create: undefined,
          }),
        })
      }
    />
  );
}
