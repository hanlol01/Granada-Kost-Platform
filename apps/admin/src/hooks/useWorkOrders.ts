import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  maintenanceQueryKeys,
  parseTechnicianMutation,
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

export type CreateMaintenanceTechnicianInput = {
  propertyId: string;
  displayName: string;
  skillTags: string;
};

export type SetMaintenanceTechnicianActiveInput = {
  propertyId: string;
  technicianId: string;
  isActive: boolean;
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

export function useCreateMaintenanceTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMaintenanceTechnicianInput) =>
      parseTechnicianMutation(
        await apiClient.post<unknown>("/maintenance/technicians", {
          property_id: input.propertyId,
          display_name: input.displayName,
          skill_tags: input.skillTags,
        }),
      ),
    onSuccess: async (_technician, input) => {
      await queryClient.invalidateQueries({
        queryKey: maintenanceQueryKeys.technicians(input.propertyId),
      });
    },
  });
}

export function useSetMaintenanceTechnicianActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetMaintenanceTechnicianActiveInput) =>
      parseTechnicianMutation(
        await apiClient.patch<unknown>(
          `/maintenance/technicians/${encodeURIComponent(input.technicianId)}/status`,
          { property_id: input.propertyId, is_active: input.isActive },
        ),
      ),
    onSuccess: async (_technician, input) => {
      await queryClient.invalidateQueries({
        queryKey: maintenanceQueryKeys.technicians(input.propertyId),
      });
    },
  });
}
