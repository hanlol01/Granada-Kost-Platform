// Booking lead write paths. A lead is interest only: neither create nor status
// markers mutate room, resident, occupancy, invoice, or payment lifecycle state.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RoomGenderPolicy } from "@/lib/admin-ux-master-api";
import {
  bookingLeadListScopeKey,
  requestArchiveAdminBookingLead,
  requestCreateAdminBookingLead,
  requestUpdateAdminBookingLeadStatusCommand,
  type BookingLeadRecord,
  type QuickBookingDraft,
} from "@/lib/admin-booking-lead";
import { apiClient } from "@/lib/api";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";
import { BOOKING_LEAD_STATUS_LABEL, type BookingLeadStatus } from "./useBookingLeads";

export function useArchiveBookingLead() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();

  return useMutation<
    { archived: true },
    unknown,
    { propertyId: string; leadId: string; idempotencyKey: string }
  >({
    mutationFn: async (input) => {
      if (!currentPropertyId || input.propertyId !== currentPropertyId) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      return requestArchiveAdminBookingLead(
        (path, options) => adminUxV2Requester.delete<unknown>(path, options),
        input,
      );
    },
    onSuccess: (_, input) => {
      if (currentPropertyId !== input.propertyId) return;
      void queryClient.invalidateQueries({
        queryKey: bookingLeadListScopeKey(input.propertyId),
      });
      void queryClient.invalidateQueries({
        queryKey: [
          "booking-leads",
          "progress",
          { propertyId: input.propertyId, leadId: input.leadId },
        ],
      });
      toastMutationSuccess("Minat booking dihapus dari daftar");
    },
    onError: (error) => toastMutationError(error, "Gagal menghapus minat booking"),
  });
}

export function useCreateAdminBookingLead() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();

  return useMutation<
    BookingLeadRecord,
    unknown,
    {
      propertyId: string;
      roomId: string;
      genderPolicy?: RoomGenderPolicy | null;
      draft: QuickBookingDraft;
      idempotencyKey: string;
    }
  >({
    mutationFn: async (input) => {
      if (!currentPropertyId || input.propertyId !== currentPropertyId) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      return requestCreateAdminBookingLead(
        (path, body, options) => apiClient.post<unknown>(path, body, options),
        input,
      );
    },
    onSuccess: async (lead) => {
      await queryClient.invalidateQueries({
        queryKey: bookingLeadListScopeKey(lead.propertyId),
      });
      toastMutationSuccess("Minat booking berhasil dicatat");
    },
    onError: (error) => toastMutationError(error, "Gagal mencatat minat booking"),
  });
}

export function useUpdateBookingLeadStatus() {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();

  return useMutation<
    BookingLeadRecord,
    unknown,
    { propertyId: string; leadId: string; status: BookingLeadStatus; idempotencyKey: string }
  >({
    mutationFn: async (input) => {
      if (!currentPropertyId || input.propertyId !== currentPropertyId) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      return requestUpdateAdminBookingLeadStatusCommand(
        (path, body, options) => adminUxV2Requester.patch<unknown>(path, body, options),
        {
          propertyId: input.propertyId,
          leadId: input.leadId,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
        },
      );
    },
    onSuccess: (lead, input) => {
      if (lead.propertyId !== input.propertyId || currentPropertyId !== input.propertyId) return;
      toastMutationSuccess(
        `Status lead diubah ke ${BOOKING_LEAD_STATUS_LABEL[input.status] ?? input.status}`,
      );
      void queryClient.invalidateQueries({
        queryKey: bookingLeadListScopeKey(lead.propertyId),
      });
    },
    onError: (error) => toastMutationError(error, "Gagal mengubah status lead"),
  });
}
