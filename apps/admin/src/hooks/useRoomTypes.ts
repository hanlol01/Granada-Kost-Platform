// Room types list hook. Read-only.
// Backend: GET /api/v1/room-types (room-type.controller.ts).
// Response shape: RoomType[] (array, no envelope wrapper).
// Property scope enforced server-side; query key includes propertyId.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type RoomType = {
  id: string;
  name: string;
  description?: string | null;
};

export function useRoomTypes(): UseQueryResult<RoomType[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<RoomType[]>({
    queryKey: ["room-types", "list", { propertyId: currentPropertyId }] as const,
    queryFn: () =>
      apiClient.get<RoomType[]>("/room-types", {
        query: { property_id: currentPropertyId ?? undefined },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
