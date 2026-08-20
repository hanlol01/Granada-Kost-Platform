// Parking zones + slots. Backend: @Controller('parking') with sub-paths
// /zones, /slots. The slot endpoint requires zone_id, so the slots hook is
// disabled until a zone is selected by the UI.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type ParkingZoneType = "motorcycle" | "car" | "mixed";
export type ParkingSlotType = "motorcycle" | "car";
export type ParkingSlotStatus = "available" | "occupied" | "reserved" | "maintenance";

export type ParkingZoneRecord = {
  id: string;
  propertyId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: ParkingZoneType;
  capacity: number;
  locationDescription: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ParkingSlotRecord = {
  id: string;
  zoneId: string;
  slotNumber: string;
  slotType: ParkingSlotType;
  slotStatus: ParkingSlotStatus;
  vehicleId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ParkingAssignmentHistoryRecord = {
  id: string;
  propertyId: string;
  slotId: string;
  vehicleId: string;
  action: "assigned" | "released";
  reason: string | null;
  actorUserId: string | null;
  effectiveAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function useParkingZones(activeOnly = true): UseQueryResult<ParkingZoneRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<ParkingZoneRecord[]>({
    queryKey: ["parking", "zones", { propertyId: currentPropertyId }, { activeOnly }] as const,
    queryFn: () =>
      apiClient.get<ParkingZoneRecord[]>("/parking/zones", {
        query: {
          property_id: currentPropertyId ?? undefined,
          active_only: activeOnly,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useParkingSlots(
  zoneId: string | null,
  status?: ParkingSlotStatus,
): UseQueryResult<ParkingSlotRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<ParkingSlotRecord[]>({
    queryKey: ["parking", "slots", { propertyId: currentPropertyId }, { zoneId, status }] as const,
    queryFn: () =>
      apiClient.get<ParkingSlotRecord[]>("/parking/slots", {
        query: { zone_id: zoneId ?? undefined, status },
      }),
    enabled: Boolean(zoneId) && Boolean(currentPropertyId),
  });
}

export function useParkingAssignmentHistory(
  slotId: string | null,
): UseQueryResult<ParkingAssignmentHistoryRecord[]> {
  return useQuery<ParkingAssignmentHistoryRecord[]>({
    queryKey: ["parking", "history", slotId] as const,
    queryFn: () =>
      apiClient.get<ParkingAssignmentHistoryRecord[]>(`/parking/slots/${slotId}/history`),
    enabled: Boolean(slotId),
  });
}
