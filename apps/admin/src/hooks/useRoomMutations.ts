// Room write paths. Backend endpoints (room.controller.ts):
//   POST   /rooms
//   PATCH  /rooms/:roomId
//   PATCH  /rooms/:roomId/status
// Required permission: room.manage.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { RoomRecord, RoomStatus } from "./useRooms";

export type CreateRoomInput = {
  number: string;
  roomTypeId?: string | null;
  unitCode?: string | null;
  genderPolicy?: "male" | "female" | "mixed";
  floor?: string | null;
  sizeLabel?: string | null;
  monthlyPrice: number;
  depositAmount: number;
  facilityIds?: string[];
};

export type UpdateRoomInput = Partial<Omit<CreateRoomInput, "number">> & {
  number?: string;
};

function toCreateBody(propertyId: string, input: CreateRoomInput) {
  return {
    property_id: propertyId,
    number: input.number,
    room_type_id: input.roomTypeId ?? undefined,
    unit_code: input.unitCode ?? undefined,
    gender_policy: input.genderPolicy,
    floor: input.floor ?? undefined,
    size_label: input.sizeLabel ?? undefined,
    monthly_price: input.monthlyPrice,
    deposit_amount: input.depositAmount,
    facility_ids: input.facilityIds,
  };
}

function toUpdateBody(input: UpdateRoomInput) {
  return {
    number: input.number,
    room_type_id: input.roomTypeId ?? undefined,
    unit_code: input.unitCode ?? undefined,
    gender_policy: input.genderPolicy,
    floor: input.floor ?? undefined,
    size_label: input.sizeLabel ?? undefined,
    monthly_price: input.monthlyPrice,
    deposit_amount: input.depositAmount,
    facility_ids: input.facilityIds,
  };
}

export function useCreateRoom() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<RoomRecord, unknown, CreateRoomInput>({
    mutationFn: async (input) => {
      if (!currentPropertyId) throw new Error("Property scope belum aktif.");
      return apiClient.post<RoomRecord>("/rooms", toCreateBody(currentPropertyId, input), {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: () => {
      toastMutationSuccess("Kamar berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat kamar"),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation<RoomRecord, unknown, { roomId: string; input: UpdateRoomInput }>({
    mutationFn: async ({ roomId, input }) =>
      apiClient.patch<RoomRecord>(`/rooms/${roomId}`, toUpdateBody(input), {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Kamar diperbarui");
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (err) => toastMutationError(err, "Gagal memperbarui kamar"),
  });
}

export function useUpdateRoomStatus() {
  const qc = useQueryClient();
  return useMutation<RoomRecord, unknown, { roomId: string; status: RoomStatus }>({
    mutationFn: async ({ roomId, status }) =>
      apiClient.patch<RoomRecord>(
        `/rooms/${roomId}/status`,
        { status },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: (_data, { status }) => {
      toastMutationSuccess(`Status kamar diubah ke ${status}`);
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (err) => toastMutationError(err, "Gagal mengubah status kamar"),
  });
}
