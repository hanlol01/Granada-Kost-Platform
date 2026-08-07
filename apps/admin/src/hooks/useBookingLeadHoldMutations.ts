import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  assertBookingHoldMutationProperty,
  bookingHoldErrorRequiresInvalidation,
  invalidateBookingHoldState,
  requestCreateBookingLeadHold,
  requestReleaseBookingLeadHold,
  type BookingLeadHoldRecord,
} from "@/lib/admin-booking-lead-hold";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

type HoldMutationInput = {
  propertyId: string;
  leadId: string;
  idempotencyKey: string;
  roomId?: string;
};

export function useCreateBookingLeadHold() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<BookingLeadHoldRecord, unknown, HoldMutationInput>({
    mutationFn: async (input) => {
      assertBookingHoldMutationProperty(currentPropertyId, input.propertyId);
      return requestCreateBookingLeadHold(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        input,
      );
    },
    onSuccess: async (hold) => {
      await invalidateBookingHoldState(queryClient, hold.propertyId);
      toastMutationSuccess("Kamar ditahan selama 24 jam");
    },
    onError: async (error, input) => {
      if (bookingHoldErrorRequiresInvalidation(error)) {
        await invalidateBookingHoldState(queryClient, input.propertyId);
      }
      toastMutationError(error, "Gagal menahan kamar");
    },
  });
}

export function useReleaseBookingLeadHold() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<BookingLeadHoldRecord, unknown, HoldMutationInput>({
    mutationFn: async (input) => {
      assertBookingHoldMutationProperty(currentPropertyId, input.propertyId);
      return requestReleaseBookingLeadHold(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        input,
      );
    },
    onSuccess: async (hold) => {
      await invalidateBookingHoldState(queryClient, hold.propertyId);
      toastMutationSuccess("Tahanan kamar dilepaskan");
    },
    onError: async (error, input) => {
      if (bookingHoldErrorRequiresInvalidation(error)) {
        await invalidateBookingHoldState(queryClient, input.propertyId);
      }
      toastMutationError(error, "Gagal melepaskan tahanan kamar");
    },
  });
}
