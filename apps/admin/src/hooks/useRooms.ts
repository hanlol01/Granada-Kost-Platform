// Rooms domain hook. Read-only for M11D.
// Backend: GET /api/v1/rooms (controller @Controller('rooms'), see room.controller.ts).
// Response shape: RoomRecord[] (array, no envelope wrapper).
// Property scope is enforced server-side via property_id; the hook keeps it
// in the query key per ADR-FE-005 to prevent cache bleed on property switch.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type RoomStatus =
  | "vacant"
  | "reserved"
  | "occupied"
  | "maintenance"
  | "inactive";

export type RoomRecord = {
  id: string;
  propertyId: string;
  roomTypeId: string | null;
  number: string;
  unitCode: string | null;
  genderPolicy: "male" | "female" | "mixed";
  floor: string | null;
  sizeLabel: string | null;
  monthlyPrice: number;
  depositAmount: number;
  roomStatus: RoomStatus;
  primaryPhotoFileId: string | null;
  facilities: { id: string; name: string }[];
};

export type UseRoomsFilters = {
  status?: RoomStatus;
  floor?: string;
  roomTypeId?: string;
};

export function useRooms(filters: UseRoomsFilters = {}): UseQueryResult<RoomRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<RoomRecord[]>({
    queryKey: ["rooms", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<RoomRecord[]>("/rooms", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          floor: filters.floor,
          room_type_id: filters.roomTypeId,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
