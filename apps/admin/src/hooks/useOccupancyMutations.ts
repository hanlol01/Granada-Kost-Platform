// Legacy compatibility checkout mutations. New move-in and normal move-out are
// owned by the Lease lifecycle; these hooks exist only for reconciled historical
// occupancies explicitly marked by the Rooms V2 read model.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { RoomInventory } from "@/lib/admin-ux-master-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type CreateLegacyCheckoutInput = {
  propertyId: string;
  occupancyId: string;
  requestedCheckOutDate: string;
};

export type FinalizeLegacyCheckoutInput = {
  propertyId: string;
  checkOutId: string;
  endDate: string;
  roomStatusAfter: "vacant" | "maintenance";
};

export function legacyCheckoutRoomQueryKey(propertyId: string) {
  return adminUxQueryKeys.rooms.all(propertyId);
}

export function canUseCompatibilityCheckout(input: {
  roles: readonly string[];
  permissions: readonly string[];
  propertyId: string | null;
  room: RoomInventory | null;
}): boolean {
  return Boolean(
    input.room &&
    input.propertyId &&
    input.room.propertyId === input.propertyId &&
    input.room.leaseReconciliationRequired &&
    input.room.activeOccupancy?.id &&
    input.roles.some((role) => ["owner", "manager", "admin"].includes(role)) &&
    input.permissions.includes("checkout.manage"),
  );
}

function checkoutId(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { id?: unknown }).id !== "string" ||
    !(value as { id: string }).id
  ) {
    throw new Error("Invalid compatibility checkout response.");
  }
  return (value as { id: string }).id;
}

export function useCreateLegacyCheckout() {
  return useMutation<string, unknown, CreateLegacyCheckoutInput>({
    mutationFn: async (input) =>
      checkoutId(
        await apiClient.post<unknown>("/check-outs", {
          occupancy_id: input.occupancyId,
          requested_check_out_date: input.requestedCheckOutDate,
        }),
      ),
    onError: (error) => toastMutationError(error, "Gagal memulai rekonsiliasi penyewaan"),
  });
}

export function useFinalizeLegacyCheckout() {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, FinalizeLegacyCheckoutInput>({
    mutationFn: async (input) =>
      apiClient.post(`/check-outs/${encodeURIComponent(input.checkOutId)}/finalize`, {
        end_date: input.endDate,
        room_status_after: input.roomStatusAfter,
      }),
    onSuccess: (_data, input) => {
      toastMutationSuccess("Data lama berhasil direkonsiliasi");
      queryClient.invalidateQueries({
        queryKey: legacyCheckoutRoomQueryKey(input.propertyId),
      });
    },
    onError: (error) => toastMutationError(error, "Gagal menyelesaikan rekonsiliasi penyewaan"),
  });
}
