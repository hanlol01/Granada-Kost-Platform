import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type ResidentVehicleStatus =
  | "pending_approval"
  | "active"
  | "rejected"
  | "suspended"
  | "transfer_pending"
  | "inactive";
export type ResidentVehicleType = "motorcycle" | "car" | "bicycle" | "electric_scooter" | "other";

export type ResidentVehicle = {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: ResidentVehicleType;
  brand: string;
  color: string;
  year: string | null;
  vehicleStatus: ResidentVehicleStatus;
  notes: string | null;
  snapshotRoomNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateResidentVehicleInput = {
  plate_number: string;
  vehicle_type: ResidentVehicleType;
  brand: string;
  color: string;
  year?: string;
  notes?: string;
};

export function useMyVehicles(): UseQueryResult<ResidentVehicle[]> {
  return useQuery<ResidentVehicle[]>({
    queryKey: qk.penghuni.vehicles(),
    queryFn: () =>
      apiClient.get<ResidentVehicle[]>("/my/vehicles", { query: { limit: 50, offset: 0 } }),
  });
}

export function useCreateMyVehicle() {
  const queryClient = useQueryClient();
  return useMutation<ResidentVehicle, unknown, CreateResidentVehicleInput>({
    mutationFn: (body) =>
      apiClient.post<ResidentVehicle>("/my/vehicles", body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: async () => {
      toastMutationSuccess("Kendaraan berhasil didaftarkan");
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.vehicles() });
    },
    onError: (error) => toastMutationError(error, "Kendaraan belum dapat didaftarkan"),
  });
}
