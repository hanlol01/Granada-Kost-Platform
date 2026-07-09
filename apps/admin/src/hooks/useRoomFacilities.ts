// Room facilities list hook. Read-only.
// Backend: GET /api/v1/room-facilities (room-facility.controller.ts).
// Response shape: RoomFacility[] (array, no envelope wrapper).
// Property scope enforced server-side; query key includes propertyId.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type RoomFacility = {
  id: string;
  name: string;
  description?: string | null;
};

export function useRoomFacilities(): UseQueryResult<RoomFacility[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<RoomFacility[]>({
    queryKey: ["room-facilities", "list", { propertyId: currentPropertyId }] as const,
    queryFn: () =>
      apiClient.get<RoomFacility[]>("/room-facilities", {
        query: { property_id: currentPropertyId ?? undefined },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
