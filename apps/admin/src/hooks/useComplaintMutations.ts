// Complaint workflow mutations. Backend (complaint.controller.ts):
//   POST /complaints/:id/acknowledge
//   POST /complaints/:id/assign           — body: { assigned_to_user_id }
//   POST /complaints/:id/resolve
//   POST /complaints/:id/close
//   POST /complaints/:id/reopen
//   POST /complaints/:id/cancel           — body: { reason }
// All require complaint.manage and owner|manager|admin role.
//
// Assign is NOT wired: there is no Admin endpoint that lists technicians/users
// yet, so the UI cannot offer a picker. The route keeps the disabled button.

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { ComplaintRecord } from "./useComplaints";

type IdInput = { complaintId: string };

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
  return useSimpleTransition(qc, "resolve", "Komplain ditandai selesai", "Gagal menyelesaikan komplain");
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
