// Resident write paths. Backend endpoints (resident.controller.ts):
//   POST   /residents
//   PATCH  /residents/:residentId
//   PATCH  /residents/:residentId/status
// Required permission: resident.manage.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  parseResidentAccountReceipt,
  parseResidentAccountSummary,
  parseResidentPasswordResetReceipt,
  type ResidentAccountReceipt,
  type ResidentAccountSummary,
  type ResidentPasswordResetReceipt,
  type ResidentDetail,
} from "@/lib/admin-resident";
import { useProperty } from "@/lib/property";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { ResidentStatus } from "./useResidents";

type ResidentRecord = ResidentDetail;

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
  ktpFileId?: string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  address?: string | null;
  university?: string | null;
  faculty?: string | null;
  major?: string | null;
  cohort?: string | null;
  instagram?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  maritalStatus?: string | null;
  emergencyPhone?: string | null;
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
    ktp_file_id: input.ktpFileId ?? undefined,
    date_of_birth: input.dateOfBirth ?? undefined,
    place_of_birth: input.placeOfBirth ?? undefined,
    address: input.address ?? undefined,
    university: input.university ?? undefined,
    faculty: input.faculty ?? undefined,
    major: input.major ?? undefined,
    cohort: input.cohort ?? undefined,
    instagram: input.instagram ?? undefined,
    parent_name: input.parentName ?? undefined,
    parent_phone: input.parentPhone ?? undefined,
    marital_status: input.maritalStatus ?? undefined,
    emergency_phone: input.emergencyPhone ?? undefined,
    gender: input.gender ?? undefined,
    emergency_contacts: toContacts(input.emergencyContacts),
  };
}

function toUpdateBody(input: UpdateResidentInput) {
  const includesKtpFile = Object.prototype.hasOwnProperty.call(input, "ktpFileId");
  return {
    full_name: input.fullName,
    phone: input.phone ?? undefined,
    email: input.email ?? undefined,
    ktp_number: input.ktpNumber ?? undefined,
    ktp_file_id: includesKtpFile ? (input.ktpFileId ?? null) : undefined,
    date_of_birth: input.dateOfBirth ?? undefined,
    place_of_birth: input.placeOfBirth ?? undefined,
    address: input.address ?? undefined,
    university: input.university ?? undefined,
    faculty: input.faculty ?? undefined,
    major: input.major ?? undefined,
    cohort: input.cohort ?? undefined,
    instagram: input.instagram ?? undefined,
    parent_name: input.parentName ?? undefined,
    parent_phone: input.parentPhone ?? undefined,
    marital_status: input.maritalStatus ?? undefined,
    emergency_phone: input.emergencyPhone ?? undefined,
    gender: input.gender ?? undefined,
    emergency_contacts: toContacts(input.emergencyContacts),
  };
}

export function useCreateResident() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<ResidentRecord, unknown, CreateResidentInput>({
    mutationKey: ["residents", "create", { propertyId: currentPropertyId }],
    mutationFn: async (input) => {
      const propertyId = currentPropertyId;
      if (!propertyId) throw new Error("Property scope belum aktif.");
      const result = await apiClient.post<ResidentRecord>(
        "/residents",
        toCreateBody(propertyId, input),
        {
          idempotencyKey: newIdempotencyKey(),
        },
      );
      if (result.propertyId !== propertyId) throw new Error("Resident property scope berubah.");
      return result;
    },
    onSuccess: (result) => {
      toastMutationSuccess("Penghuni berhasil dibuat");
      void qc.invalidateQueries({
        queryKey: ["residents", "list", { propertyId: result.propertyId }],
      });
    },
    onError: (err) => toastMutationError(err, "Gagal membuat penghuni"),
  });
}

export function useUpdateResident() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<ResidentRecord, unknown, { residentId: string; input: UpdateResidentInput }>({
    mutationKey: ["residents", "update", { propertyId: currentPropertyId }],
    mutationFn: async ({ residentId, input }) => {
      const propertyId = currentPropertyId;
      if (!propertyId) throw new Error("Property scope belum aktif.");
      const result = await apiClient.patch<ResidentRecord>(
        `/residents/${encodeURIComponent(residentId)}`,
        toUpdateBody(input),
        {
          idempotencyKey: newIdempotencyKey(),
        },
      );
      if (result.propertyId !== propertyId) throw new Error("Resident property scope berubah.");
      return result;
    },
    onSuccess: (result) => {
      toastMutationSuccess("Data penghuni diperbarui");
      void qc.invalidateQueries({
        queryKey: ["residents", "list", { propertyId: result.propertyId }],
      });
      void qc.invalidateQueries({
        queryKey: ["residents", "detail", { propertyId: result.propertyId, residentId: result.id }],
      });
    },
    onError: (err) => toastMutationError(err, "Gagal memperbarui penghuni"),
  });
}

export function useUpdateResidentStatus() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  return useMutation<ResidentRecord, unknown, { residentId: string; status: ResidentStatus }>({
    mutationKey: ["residents", "status", { propertyId: currentPropertyId }],
    mutationFn: async ({ residentId, status }) => {
      const propertyId = currentPropertyId;
      if (!propertyId) throw new Error("Property scope belum aktif.");
      const result = await apiClient.patch<ResidentRecord>(
        `/residents/${encodeURIComponent(residentId)}/status`,
        { status },
        { idempotencyKey: newIdempotencyKey() },
      );
      if (result.propertyId !== propertyId) throw new Error("Resident property scope berubah.");
      return result;
    },
    onSuccess: (result, { status }) => {
      toastMutationSuccess(status === "active" ? "Penghuni diaktifkan" : "Penghuni dinonaktifkan");
      void qc.invalidateQueries({
        queryKey: ["residents", "list", { propertyId: result.propertyId }],
      });
      void qc.invalidateQueries({
        queryKey: ["residents", "detail", { propertyId: result.propertyId, residentId: result.id }],
      });
    },
    onError: (err) => toastMutationError(err, "Gagal mengubah status penghuni"),
  });
}

export function useProvisionResidentAccount() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  const propertyRef = useRef(currentPropertyId);
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  propertyRef.current = currentPropertyId;

  const mutateAsync = useCallback(
    async ({ residentId, idempotencyKey }: { residentId: string; idempotencyKey: string }) => {
      const propertyId = propertyRef.current;
      if (!propertyId) throw new Error("Property scope belum aktif.");
      if (pendingRef.current) throw new Error("Provisioning akun sedang berjalan.");
      pendingRef.current = true;
      setIsPending(true);
      try {
        const receipt = parseResidentAccountReceipt(
          await adminUxV2Requester.post(
            `/residents/${encodeURIComponent(residentId)}/account`,
            { property_id: propertyId },
            { idempotencyKey },
          ),
        );
        if (propertyRef.current !== propertyId) {
          throw new Error("Property scope berubah sebelum provisioning selesai.");
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["residents", "list", { propertyId }] }),
          qc.invalidateQueries({ queryKey: ["residents", "detail", { propertyId, residentId }] }),
        ]);
        return receipt;
      } catch (error) {
        toastMutationError(error, "Gagal menyiapkan akun Penghuni");
        throw error;
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    },
    [qc],
  );

  return { mutateAsync, isPending };
}

export function useResidentAccountSummary(residentId: string | null) {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentAccountSummary>({
    queryKey: [
      "residents",
      "account",
      { propertyId: currentPropertyId ?? "none", residentId: residentId ?? "none" },
    ],
    queryFn: async ({ signal }) => {
      if (!currentPropertyId || !residentId) throw new Error("Property scope belum aktif.");
      return parseResidentAccountSummary(
        await adminUxV2Requester.get(`/residents/${encodeURIComponent(residentId)}/account`, {
          query: { property_id: currentPropertyId },
          signal,
        }),
      );
    },
    enabled: Boolean(currentPropertyId && residentId),
  });
}

export function useResetResidentPassword() {
  const qc = useQueryClient();
  const { currentPropertyId } = useProperty();
  const propertyRef = useRef(currentPropertyId);
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  propertyRef.current = currentPropertyId;

  const mutateAsync = useCallback(
    async ({ residentId }: { residentId: string }): Promise<ResidentPasswordResetReceipt> => {
      const propertyId = propertyRef.current;
      if (!propertyId) throw new Error("Property scope belum aktif.");
      if (pendingRef.current) throw new Error("Reset password sedang berjalan.");
      pendingRef.current = true;
      setIsPending(true);
      try {
        const receipt = parseResidentPasswordResetReceipt(
          await adminUxV2Requester.post(
            `/residents/${encodeURIComponent(residentId)}/account/reset-password`,
            { property_id: propertyId },
          ),
        );
        if (propertyRef.current !== propertyId) {
          throw new Error("Property scope berubah sebelum reset password selesai.");
        }
        await qc.invalidateQueries({
          queryKey: ["residents", "account", { propertyId, residentId }],
        });
        toastMutationSuccess("Password sementara berhasil direset");
        return receipt;
      } catch (error) {
        toastMutationError(error, "Gagal mereset password Penghuni");
        throw error;
      } finally {
        pendingRef.current = false;
        setIsPending(false);
      }
    },
    [qc],
  );

  return { mutateAsync, isPending };
}
