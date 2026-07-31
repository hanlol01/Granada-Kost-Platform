import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { requestLeaseActivation, type LeaseActivationResponse } from "@/lib/admin-lease-activation";
import { invalidateAdminUxMutation } from "@/lib/admin-ux-query-keys";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

export function useLeaseActivation() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<
    LeaseActivationResponse,
    unknown,
    { leaseId: string; idempotencyKey: string; activatedAt?: string }
  >({
    mutationFn: ({ leaseId, idempotencyKey, activatedAt }) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestLeaseActivation(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        leaseId,
        currentPropertyId,
        idempotencyKey,
        activatedAt,
      );
    },
    onSuccess: async () => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, "lease-create", currentPropertyId);
      }
      toastMutationSuccess("Lease diaktifkan dan kamar resmi ditempati");
    },
    onError: (error) => toastMutationError(error, "Lease belum dapat diaktifkan"),
  });
}
