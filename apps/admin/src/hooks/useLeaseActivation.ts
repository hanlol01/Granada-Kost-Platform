import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      note?: string;
    }
  >({
    mutationFn: ({ leaseId, idempotencyKey, activatedAt, confirmCheckIn, checkedInAt, note }) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestLeaseActivation(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        leaseId,
        currentPropertyId,
        idempotencyKey,
        activatedAt,
        confirmCheckIn,
        checkedInAt,
        note,
      );
    },
    onSuccess: async (result) => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, "lease-create", currentPropertyId);
        await queryClient.invalidateQueries({
          queryKey: ["lease-service-period-history", currentPropertyId],
        });
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
    { leaseId: string; idempotencyKey: string; checkedInAt?: string; notes?: string }
  >({
    mutationFn: ({ leaseId, idempotencyKey, checkedInAt, notes }) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestLeaseCheckIn(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        leaseId,
        currentPropertyId,
        idempotencyKey,
        checkedInAt,
        notes,
      );
    },
    onSuccess: async () => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, "lease-create", currentPropertyId);
        await queryClient.invalidateQueries({
          queryKey: ["lease-service-period-history", currentPropertyId],
        });
      }
      toastMutationSuccess("Check-in fisik dikonfirmasi dan kamar resmi ditempati");
    },
    onError: (error) => toastMutationError(error, "Check-in belum dapat dikonfirmasi"),
  });
}

export function useLeaseCheckInPreview(
  leaseId: string | undefined,
  checkedInAt: string | undefined,
  enabled: boolean,
) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: ["lease-check-in-preview", currentPropertyId, leaseId, checkedInAt],
    enabled: enabled && !!currentPropertyId && !!leaseId && !!checkedInAt,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await adminUxV2Requester.post<{
        data: {
          plannedStartDate: string;
          startDate: string;
          endDate: string;
          termMonths: number;
          contractRentAmount: number;
          verifiedPaymentAmount: number;
          documentCount: number;
        };
      }>(
        `/leases/${encodeURIComponent(leaseId!)}/check-in/preview`,
        { property_id: currentPropertyId, checked_in_at: checkedInAt },
        { signal },
      );
      const data = response?.data;
      if (
        !data ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate) ||
        !Number.isSafeInteger(data.termMonths) ||
        data.termMonths < 1 ||
        !Number.isSafeInteger(data.contractRentAmount) ||
        !Number.isSafeInteger(data.verifiedPaymentAmount) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.plannedStartDate) ||
        !Number.isSafeInteger(data.documentCount) ||
        data.documentCount < 0
      )
        throw new Error("Ringkasan check-in belum dapat dibaca. Muat ulang sebelum melanjutkan.");
      return data;
    },
  });
}
