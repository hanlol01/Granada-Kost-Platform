import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  requestLeaseActivation,
  requestLeaseCheckIn,
  type LeaseActivationResponse,
  type LeaseCheckInResponse,
} from "@/lib/admin-lease-activation";
import { invalidateAdminUxMutation } from "@/lib/admin-ux-query-keys";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

export function useLeaseActivation() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<
    LeaseActivationResponse,
    unknown,
    {
      leaseId: string;
      idempotencyKey: string;
      activatedAt?: string;
      confirmCheckIn?: boolean;
      checkedInAt?: string;
    }
  >({
    mutationFn: ({ leaseId, idempotencyKey, activatedAt, confirmCheckIn, checkedInAt }) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestLeaseActivation(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        leaseId,
        currentPropertyId,
        idempotencyKey,
        activatedAt,
        confirmCheckIn,
        checkedInAt,
      );
    },
    onSuccess: async (result) => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, "lease-create", currentPropertyId);
      }
      toastMutationSuccess(
        result.occupancyStatus === "active"
          ? "Penyewaan aktif dan kamar resmi ditempati"
          : "Penyewaan aktif; kamar menunggu konfirmasi check-in fisik",
      );
    },
    onError: (error) => toastMutationError(error, "Lease belum dapat diaktifkan"),
  });
}

export function useLeaseCheckIn() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<
    LeaseCheckInResponse,
    unknown,
    { leaseId: string; idempotencyKey: string; checkedInAt?: string }
  >({
    mutationFn: ({ leaseId, idempotencyKey, checkedInAt }) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestLeaseCheckIn(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        leaseId,
        currentPropertyId,
        idempotencyKey,
        checkedInAt,
      );
    },
    onSuccess: async () => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, "lease-create", currentPropertyId);
      }
      toastMutationSuccess("Check-in fisik dikonfirmasi dan kamar resmi ditempati");
    },
    onError: (error) => toastMutationError(error, "Check-in belum dapat dikonfirmasi"),
  });
}
