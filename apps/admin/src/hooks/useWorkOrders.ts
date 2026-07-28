import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  maintenanceQueryKeys,
  requestTechnicianReferences,
  requestWorkOrderCoverage,
  type TechnicianReference,
  type WorkOrderCoverage,
  type WorkOrderStatus,
} from "@/lib/admin-maintenance";
import { useProperty } from "@/lib/property";

export type { WorkOrderStatus } from "@/lib/admin-maintenance";

export type WorkOrderRecord = {
  workOrderStatus: WorkOrderStatus;
};

export type UseWorkOrdersFilters = {
  status?: WorkOrderStatus;
};

export function useWorkOrders(
  filters: UseWorkOrdersFilters = {},
  enabled = true,
): UseQueryResult<WorkOrderCoverage> {
  const { currentPropertyId } = useProperty();
  return useQuery<WorkOrderCoverage>({
    queryKey: currentPropertyId
      ? maintenanceQueryKeys.workOrders(currentPropertyId, filters.status)
      : ["maintenance", "work-orders", null, filters.status ?? null],
    queryFn: ({ signal }) =>
      requestWorkOrderCoverage(
        (path, options) => adminUxV2Requester.get<unknown>(path, options),
        currentPropertyId!,
        filters.status,
        signal,
      ),
    enabled: enabled && Boolean(currentPropertyId),
  });
}

export function useMaintenanceTechnicians(enabled = true): UseQueryResult<TechnicianReference[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<TechnicianReference[]>({
    queryKey: currentPropertyId
      ? maintenanceQueryKeys.technicians(currentPropertyId)
      : ["maintenance", "technicians", null],
    queryFn: ({ signal }) =>
      requestTechnicianReferences(
        (path, options) => adminUxV2Requester.get<unknown>(path, options),
        currentPropertyId!,
        signal,
      ),
    enabled: enabled && Boolean(currentPropertyId),
  });
}
