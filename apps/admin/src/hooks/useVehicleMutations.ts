// Vehicle status transitions. Backend (vehicle.controller.ts):
//   POST /vehicles/:id/approve
//   POST /vehicles/:id/reject       — body: { reason }
//   POST /vehicles/:id/suspend      — body: { reason }
//   POST /vehicles/:id/reactivate
//   POST /vehicles/:id/deactivate   — body: { reason }
// All require vehicle.manage and owner|manager|admin.
//
// CREATE/EDIT are NOT wired in M11E: the UI needs a resident picker because
// resident_id is required and the backend rejects mismatched property scope.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { VehicleRecord } from "./useVehicles";

type IdInput = { vehicleId: string };
type ReasonInput = IdInput & { reason: string };

export function useApproveVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRecord, unknown, IdInput>({
    mutationFn: ({ vehicleId }) =>
      apiClient.post<VehicleRecord>(`/vehicles/${vehicleId}/approve`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Kendaraan disetujui");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menyetujui kendaraan"),
  });
}

export function useRejectVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRecord, unknown, ReasonInput>({
    mutationFn: ({ vehicleId, reason }) =>
      apiClient.post<VehicleRecord>(
        `/vehicles/${vehicleId}/reject`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Kendaraan ditolak");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menolak kendaraan"),
  });
}

export function useSuspendVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRecord, unknown, ReasonInput>({
    mutationFn: ({ vehicleId, reason }) =>
      apiClient.post<VehicleRecord>(
        `/vehicles/${vehicleId}/suspend`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Kendaraan disuspend");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal suspend kendaraan"),
  });
}

export function useReactivateVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRecord, unknown, IdInput>({
    mutationFn: ({ vehicleId }) =>
      apiClient.post<VehicleRecord>(`/vehicles/${vehicleId}/reactivate`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Kendaraan diaktifkan kembali");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal mengaktifkan kendaraan"),
  });
}

export function useDeactivateVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRecord, unknown, ReasonInput>({
    mutationFn: ({ vehicleId, reason }) =>
      apiClient.post<VehicleRecord>(
        `/vehicles/${vehicleId}/deactivate`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Kendaraan dinonaktifkan");
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menonaktifkan kendaraan"),
  });
}
