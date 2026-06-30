// Maintenance work orders. Backend: @Controller('work-orders'), requires
// 'maintenance.manage' permission. Read-only at M11G (used for the Reports
// Maintenance Summary). Aligns with the rest of M11D hook conventions.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type WorkOrderStatus =
  | "created"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "verified"
  | "reworking"
  | "cancelled";

export type WorkOrderPriority = "low" | "medium" | "high" | "urgent";

export type WorkOrderRecord = {
  id: string;
  propertyId: string;
  roomId: string | null;
  complaintId: string | null;
  workOrderCode: string;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  workOrderStatus: WorkOrderStatus;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UseWorkOrdersFilters = {
  status?: WorkOrderStatus;
  limit?: number;
  offset?: number;
};

export function useWorkOrders(
  filters: UseWorkOrdersFilters = {},
): UseQueryResult<WorkOrderRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<WorkOrderRecord[]>({
    queryKey: ["work-orders", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<WorkOrderRecord[]>("/work-orders", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          limit: filters.limit ?? 100,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
