// Parking slot assignments. Backend (parking.controller.ts):
//   POST /parking/slots/:slotId/assign   — body: { vehicle_id }
//   POST /parking/slots/:slotId/release
// Both require parking.manage permission.
//
// Zone/Slot creation endpoints exist on the backend but are intentionally NOT
// wired in M11E. They are master-data flows that need dedicated form layouts
// not present in the Lovable design; adding them would exceed the M11E scope.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { ParkingSlotRecord } from "./useParking";

export function useAssignParkingSlot() {
  const qc = useQueryClient();
  return useMutation<ParkingSlotRecord, unknown, { slotId: string; vehicleId: string }>({
    mutationFn: ({ slotId, vehicleId }) =>
      apiClient.post<ParkingSlotRecord>(
        `/parking/slots/${slotId}/assign`,
        { vehicle_id: vehicleId },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Slot parkir di-assign");
      qc.invalidateQueries({ queryKey: ["parking"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal assign slot"),
  });
}

export function useReleaseParkingSlot() {
  const qc = useQueryClient();
  return useMutation<ParkingSlotRecord, unknown, { slotId: string }>({
    mutationFn: ({ slotId }) =>
      apiClient.post<ParkingSlotRecord>(`/parking/slots/${slotId}/release`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Slot parkir dibebaskan");
      qc.invalidateQueries({ queryKey: ["parking"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal melepas slot"),
  });
}
