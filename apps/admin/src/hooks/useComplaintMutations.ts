// Complaint workflow mutations. Backend (complaint.controller.ts):
//   POST /complaints/:id/acknowledge
//   POST /complaints/:id/assign           — body: { assigned_to_user_id }
//   POST /complaints/:id/resolve
//   POST /complaints/:id/close
//   POST /complaints/:id/reopen
//   POST /complaints/:id/cancel           — body: { reason }
// Lifecycle transitions require complaint.manage; dispatch additionally requires maintenance.manage.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { apiClient } from "@/lib/api";
import {
  invalidateMaintenanceDispatch,
  requestComplaintDispatch,
  type MaintenanceDispatchInput,
  type MaintenanceDispatchResult,
} from "@/lib/admin-maintenance";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { ComplaintRecord } from "./useComplaints";

type IdInput = { complaintId: string };

export function useDispatchComplaint() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceDispatchResult, unknown, MaintenanceDispatchInput>({
    mutationFn: (input) =>
      requestComplaintDispatch(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        input,
      ),
    onSuccess: async (_result, input) => {
      await invalidateMaintenanceDispatch(queryClient, input.propertyId);
    },
  });
}

function useSimpleTransition(
  qc: QueryClient,
  path: string,
  okMessage: string,
  failMessage: string,
) {
  return useMutation<ComplaintRecord, unknown, IdInput>({
    mutationFn: ({ complaintId }) =>
      apiClient.post<ComplaintRecord>(`/complaints/${complaintId}/${path}`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess(okMessage);
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err) => toastMutationError(err, failMessage),
  });
}

export function useAcknowledgeComplaint() {
  const qc = useQueryClient();
  return useSimpleTransition(qc, "acknowledge", "Komplain diakui", "Gagal mengakui komplain");
}

export function useResolveComplaint() {
  const qc = useQueryClient();
  return useSimpleTransition(
    qc,
    "resolve",
    "Komplain ditandai selesai",
    "Gagal menyelesaikan komplain",
  );
}

export function useCloseComplaint() {
  const qc = useQueryClient();
  return useSimpleTransition(qc, "close", "Komplain ditutup", "Gagal menutup komplain");
}

export function useReopenComplaint() {
  const qc = useQueryClient();
  return useSimpleTransition(qc, "reopen", "Komplain dibuka ulang", "Gagal membuka ulang komplain");
}

export function useCancelComplaint() {
  const qc = useQueryClient();
  return useMutation<ComplaintRecord, unknown, { complaintId: string; reason: string }>({
    mutationFn: ({ complaintId, reason }) =>
      apiClient.post<ComplaintRecord>(
        `/complaints/${complaintId}/cancel`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Komplain dibatalkan");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membatalkan komplain"),
  });
}
