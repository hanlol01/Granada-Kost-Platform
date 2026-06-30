// Resident write paths. Backend endpoints (resident.controller.ts):
//   POST   /residents
//   PATCH  /residents/:residentId
//   PATCH  /residents/:residentId/status
// Required permission: resident.manage.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { ResidentRecord, ResidentStatus } from "./useResidents";

export type EmergencyContactInput = {
  contactName: string;
  relationship?: string | null;
  phone: string;
};

export type CreateResidentInput = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  ktpNumber?: string | null;
  gender?: "male" | "female" | "other" | null;
  emergencyContacts?: EmergencyContactInput[];
};

export type UpdateResidentInput = Partial<CreateResidentInput>;

function toContacts(list?: EmergencyContactInput[]) {
  if (!list || list.length === 0) return undefined;
  return list.map((c) => ({
    contact_name: c.contactName,
    relationship: c.relationship ?? undefined,
    phone: c.phone,
  }));
}

function toCreateBody(propertyId: string, input: CreateResidentInput) {
  return {
    property_id: propertyId,
    full_name: input.fullName,
    phone: input.phone ?? undefined,
    email: input.email ?? undefined,
    ktp_number: input.ktpNumber ?? undefined,
    gender: input.gender ?? undefined,
    emergency_contacts: toContacts(input.emergencyContacts),
  };
}

function toUpdateBody(input: UpdateResidentInput) {
  return {
    full_name: input.fullName,
    phone: input.phone ?? undefined,
    email: input.email ?? undefined,
    ktp_number: input.ktpNumber ?? undefined,
    gender: input.gender ?? undefined,
    emergency_contacts: toContacts(input.emergencyContacts),
  };
}

export function useCreateResident() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<ResidentRecord, unknown, CreateResidentInput>({
    mutationFn: async (input) => {
      if (!currentPropertyId) throw new Error("Property scope belum aktif.");
      return apiClient.post<ResidentRecord>("/residents", toCreateBody(currentPropertyId, input), {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: () => {
      toastMutationSuccess("Penghuni berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat penghuni"),
  });
}

export function useUpdateResident() {
  const qc = useQueryClient();
  return useMutation<ResidentRecord, unknown, { residentId: string; input: UpdateResidentInput }>({
    mutationFn: async ({ residentId, input }) =>
      apiClient.patch<ResidentRecord>(`/residents/${residentId}`, toUpdateBody(input), {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Data penghuni diperbarui");
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
    onError: (err) => toastMutationError(err, "Gagal memperbarui penghuni"),
  });
}

export function useUpdateResidentStatus() {
  const qc = useQueryClient();
  return useMutation<ResidentRecord, unknown, { residentId: string; status: ResidentStatus }>({
    mutationFn: async ({ residentId, status }) =>
      apiClient.patch<ResidentRecord>(
        `/residents/${residentId}/status`,
        { status },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: (_data, { status }) => {
      toastMutationSuccess(status === "active" ? "Penghuni diaktifkan" : "Penghuni dinonaktifkan");
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
    onError: (err) => toastMutationError(err, "Gagal mengubah status penghuni"),
  });
}
