import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { invalidateMaintenanceDispatch } from "@/lib/admin-maintenance";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { AdminWorkOrder, WorkOrderStatus } from "@/lib/admin-maintenance";

type WorkOrderMutationInput = {
  workOrderId: string;
  propertyId: string;
  reason?: string;
};

type WorkOrderMutation = WorkOrderMutationInput & { action: WorkOrderStatusAction };
type WorkOrderStatusAction = "start" | "complete" | "verify" | "rework" | "cancel";

const SUCCESS_MESSAGES: Record<WorkOrderStatusAction, string> = {
  start: "Pekerjaan dimulai",
  complete: "Pekerjaan ditandai selesai",
  verify: "Pekerjaan diverifikasi",
  rework: "Pekerjaan dikembalikan untuk perbaikan",
  cancel: "Work order dibatalkan",
};

function useWorkOrderMutation(action: WorkOrderStatusAction) {
  const queryClient = useQueryClient();
  return useMutation<AdminWorkOrder, unknown, WorkOrderMutationInput>({
    mutationFn: ({ workOrderId, reason }) =>
      apiClient.post<AdminWorkOrder>(
        `/work-orders/${workOrderId}/${action}`,
        action === "rework" || action === "cancel" ? { reason } : undefined,
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: async (_workOrder, input) => {
      await invalidateMaintenanceDispatch(queryClient, input.propertyId);
      toastMutationSuccess(SUCCESS_MESSAGES[action]);
    },
    onError: (error) =>
      toastMutationError(error, `Gagal memperbarui status work order (${action}).`),
  });
}

export function useStartWorkOrder() {
  return useWorkOrderMutation("start");
}

export function useCompleteWorkOrder() {
  return useWorkOrderMutation("complete");
}

export function useVerifyWorkOrder() {
  return useWorkOrderMutation("verify");
}

export function useReworkWorkOrder() {
  return useWorkOrderMutation("rework");
}

export function useCancelWorkOrder() {
  return useWorkOrderMutation("cancel");
}
