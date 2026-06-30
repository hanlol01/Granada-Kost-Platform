// Occupancy workflow mutations.
// Backend endpoints:
//   POST /check-ins           — completeCheckIn (lease.manage permission)
//   POST /check-outs          — create check-out request (checkout.manage)
//   POST /check-outs/:id/approve|reject|finalize — workflow transitions
//
// Scope of M11E:
//   - completeCheckIn is wired. The Tenants page collects the room and
//     start_date, then calls this hook.
//   - The check-out lifecycle (create/approve/reject/finalize) is NOT wired
//     in M11E because the Admin UI does not yet expose an active-occupancy
//     picker or a check-out queue. Backend is ready; the UI shell is
//     deferred so this milestone does not introduce new pages.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type CompleteCheckInInput = {
  propertyId: string;
  roomId: string;
  residentId: string;
  startDate: string;
  notes?: string;
};

export function useCompleteCheckIn() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, CompleteCheckInInput>({
    mutationFn: async (input) =>
      apiClient.post(
        "/check-ins",
        {
          property_id: input.propertyId,
          room_id: input.roomId,
          resident_id: input.residentId,
          start_date: input.startDate,
          notes: input.notes,
        },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Check-in berhasil");
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["residents"] });
      qc.invalidateQueries({ queryKey: ["occupancies"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menyelesaikan check-in"),
  });
}
