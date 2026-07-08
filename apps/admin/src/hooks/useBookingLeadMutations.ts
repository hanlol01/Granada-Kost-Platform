// Booking lead write path (M17C). Backend (M17B):
//   PATCH /booking-leads/:leadId/status - JWT + RBAC (manager|admin, room.manage),
//   property-scoped by the lead's property_id, audited backend-side.
// A status change is a manual admin marker only (M17A freeze): "converted" does
// NOT create a resident, occupancy, invoice, payment, or room reservation.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import {
  BOOKING_LEAD_STATUS_LABEL,
  type BookingLeadRecord,
  type BookingLeadStatus,
} from "./useBookingLeads";

export function useUpdateBookingLeadStatus() {
  const qc = useQueryClient();
  return useMutation<BookingLeadRecord, unknown, { leadId: string; status: BookingLeadStatus }>({
    mutationFn: async ({ leadId, status }) =>
      apiClient.patch<BookingLeadRecord>(
        `/booking-leads/${leadId}/status`,
        { status },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: (_data, { status }) => {
      toastMutationSuccess(`Status lead diubah ke ${BOOKING_LEAD_STATUS_LABEL[status] ?? status}`);
      qc.invalidateQueries({ queryKey: ["booking-leads"] });
    },
    onError: (err) => toastMutationError(err, "Gagal mengubah status lead"),
  });
}
