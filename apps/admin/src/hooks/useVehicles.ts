// Vehicles domain hook. Backend: @Controller('vehicles') with vehicle.manage
// permission. Read-only at M11D.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type VehicleType = "motorcycle" | "car" | "bicycle" | "electric_scooter" | "other";
export type VehicleStatus =
  | "pending_approval"
  | "active"
  | "rejected"
  | "suspended"
  | "transfer_pending"
  | "inactive";

export type VehicleRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: VehicleType;
  brand: string;
  color: string;
  year: string | null;
  vehicleStatus: VehicleStatus;
  notes: string | null;
  approvedAt: string | null;
  snapshotResidentName: string;
  snapshotRoomNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UseVehiclesFilters = {
  status?: VehicleStatus;
  vehicleType?: VehicleType;
  limit?: number;
  offset?: number;
};

export function useVehicles(
  filters: UseVehiclesFilters = {},
): UseQueryResult<VehicleRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<VehicleRecord[]>({
    queryKey: ["vehicles", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<VehicleRecord[]>("/vehicles", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          vehicle_type: filters.vehicleType,
          limit: filters.limit ?? 50,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
