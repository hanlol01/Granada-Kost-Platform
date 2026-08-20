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
import type {
  ParkingSlotRecord,
  ParkingZoneRecord,
  ParkingZoneType,
  ParkingSlotType,
} from "./useParking";

export type CreateParkingZoneInput = {
  propertyId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: ParkingZoneType;
  capacity?: number;
  locationDescription?: string;
};

export type CreateParkingSlotInput = {
  zoneId: string;
  slotNumber: string;
  slotType: ParkingSlotType;
};

export function useCreateParkingZone() {
  const qc = useQueryClient();
  return useMutation<ParkingZoneRecord, unknown, CreateParkingZoneInput>({
    mutationFn: ({ propertyId, zoneCode, zoneName, zoneType, capacity, locationDescription }) =>
      apiClient.post<ParkingZoneRecord>(
        "/parking/zones",
        {
          property_id: propertyId,
          zone_code: zoneCode.trim(),
          zone_name: zoneName.trim(),
          zone_type: zoneType,
          capacity: capacity ?? undefined,
          location_description: locationDescription?.trim() || undefined,
        },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Zona parkir berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["parking", "zones"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat zona parkir"),
  });
}

export function useCreateParkingSlot() {
  const qc = useQueryClient();
  return useMutation<ParkingSlotRecord, unknown, CreateParkingSlotInput>({
    mutationFn: ({ zoneId, slotNumber, slotType }) =>
      apiClient.post<ParkingSlotRecord>(
        "/parking/slots",
        { zone_id: zoneId, slot_number: slotNumber.trim(), slot_type: slotType },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Slot parkir berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["parking"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat slot parkir"),
  });
}

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
