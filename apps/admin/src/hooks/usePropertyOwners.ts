import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { propertyOwnerApi, type PropertyOwnerStatus } from "@/lib/admin-property-owner";

export function usePropertyOwners(filters: {
  q?: string;
  status?: PropertyOwnerStatus;
  offset?: number;
  limit?: number;
}) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.propertyOwners.list(currentPropertyId ?? "none", filters),
    enabled: Boolean(currentPropertyId),
    queryFn: () => propertyOwnerApi.list(currentPropertyId!, filters),
  });
}
export function usePropertyOwnerDetail(ownerId: string | null) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.propertyOwners.detail(
      currentPropertyId ?? "none",
      ownerId ?? "none",
    ),
    enabled: Boolean(currentPropertyId && ownerId),
    queryFn: () => propertyOwnerApi.detail(currentPropertyId!, ownerId!),
  });
}
export function useOwnerAssetOptions(effectiveDate?: string) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.propertyOwners.assetOptions(
      currentPropertyId ?? "none",
      effectiveDate,
    ),
    enabled: Boolean(currentPropertyId),
    queryFn: () => propertyOwnerApi.assetOptions(currentPropertyId!, effectiveDate),
  });
}
export function usePropertyOwnerMutations() {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const scopeRef = useRef(currentPropertyId);
  const idempotencyKeysRef = useRef(new Map<string, string>());
  scopeRef.current = currentPropertyId;
  const refresh = async (ownerId?: string) => {
    const propertyId = scopeRef.current;
    if (!propertyId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: adminUxQueryKeys.propertyOwners.all(propertyId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["propertyOwnerAssetOptions", propertyId],
      }),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => queryKey[0] === "roomDetail" && queryKey[2] === propertyId,
      }),
    ]);
    if (ownerId)
      await queryClient.invalidateQueries({
        queryKey: adminUxQueryKeys.propertyOwners.detail(propertyId, ownerId),
      });
  };
  const guarded =
    <T>(
      operation: string,
      fn: (propertyId: string, key: string) => Promise<T>,
      success: string,
      ownerId?: string,
    ) =>
    async () => {
      const propertyId = scopeRef.current;
      if (!propertyId) throw new Error("Properti aktif belum dipilih.");
      const keyId = `${propertyId}:${operation}`;
      const key = idempotencyKeysRef.current.get(keyId) ?? newIdempotencyKey();
      idempotencyKeysRef.current.set(keyId, key);
      try {
        const result = await fn(propertyId, key);
        if (scopeRef.current !== propertyId)
          throw new Error("Properti aktif berubah sebelum proses selesai.");
        await refresh(ownerId);
        idempotencyKeysRef.current.delete(keyId);
        toastMutationSuccess(success);
        return result;
      } catch (error) {
        if (scopeRef.current !== propertyId) idempotencyKeysRef.current.delete(keyId);
        throw error;
      }
    };
  return {
    create: useMutation({
      mutationFn: (input: {
        fullName: string;
        email?: string;
        phone: string;
        address?: string;
        initialPassword: string;
      }) =>
        guarded(
          `create:${[input.fullName, input.email, input.phone, input.address, input.initialPassword]
            .map((value) => value?.trim() ?? "")
            .join("|")}`,
          (propertyId, key) =>
            propertyOwnerApi.create(
              {
                property_id: propertyId,
                full_name: input.fullName,
                email: input.email || undefined,
                phone: input.phone,
                address: input.address || undefined,
                initial_password: input.initialPassword,
              },
              key,
            ),
          "Owner Property berhasil dibuat",
        )(),
      onError: (error) => toastMutationError(error, "Gagal membuat Owner Property"),
    }),
    update: useMutation({
      mutationFn: (input: {
        ownerId: string;
        fullName: string;
        email?: string;
        phone: string;
        address?: string;
      }) =>
        guarded(
          `update:${input.ownerId}:${[input.fullName, input.email, input.phone, input.address]
            .map((value) => value?.trim() ?? "")
            .join("|")}`,
          (propertyId, key) =>
            propertyOwnerApi.update(
              input.ownerId,
              {
                property_id: propertyId,
                full_name: input.fullName,
                email: input.email || undefined,
                phone: input.phone,
                address: input.address || undefined,
              },
              key,
            ),
          "Profil owner diperbarui",
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Gagal memperbarui owner"),
    }),
    archive: useMutation({
      mutationFn: (ownerId: string) =>
        guarded(
          `archive:${ownerId}`,
          (propertyId, key) => propertyOwnerApi.archive(ownerId, propertyId, key),
          "Owner Property diarsipkan",
          ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Owner belum dapat diarsipkan"),
    }),
    deletePermanently: useMutation({
      mutationFn: (ownerId: string) =>
        guarded(
          `delete-permanently:${ownerId}`,
          (propertyId, key) => propertyOwnerApi.deletePermanently(ownerId, propertyId, key),
          "Akun Owner Property dihapus permanen",
        )(),
      onError: (error) => toastMutationError(error, "Owner belum dapat dihapus permanen"),
    }),
    resetPassword: useMutation({
      mutationFn: (input: { ownerId: string; newPassword: string }) =>
        guarded(
          `reset:${input.ownerId}:${input.newPassword}`,
          (propertyId, key) =>
            propertyOwnerApi.resetPassword(
              input.ownerId,
              { property_id: propertyId, new_password: input.newPassword },
              key,
            ),
          "Password owner berhasil direset",
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Gagal mereset password owner"),
    }),
    closeReportPeriod: useMutation({
      mutationFn: (input: { ownerId: string; period: string; notes?: string }) =>
        guarded(
          `close-report-period:${input.ownerId}:${input.period}:${input.notes?.trim() ?? ""}`,
          (propertyId, key) =>
            propertyOwnerApi.closeReportPeriod(
              input.ownerId,
              {
                property_id: propertyId,
                period: input.period,
                notes: input.notes?.trim() || undefined,
              },
              key,
            ),
          `Laporan Owner periode ${input.period} telah ditutup`,
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Laporan Owner belum dapat ditutup"),
    }),
    assignBuildings: useMutation({
      mutationFn: (input: { ownerId: string; buildingId: string; reason?: string }) =>
        guarded(
          `assign-building:${input.ownerId}:${input.buildingId}:${input.reason?.trim() ?? ""}`,
          (propertyId, key) =>
            propertyOwnerApi.assignBuildings(
              input.ownerId,
              {
                property_id: propertyId,
                building_id: input.buildingId,
                reason: input.reason?.trim() || undefined,
              },
              key,
            ),
          "Kepemilikan Rumah Kost tersimpan",
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Kepemilikan Rumah Kost belum tersimpan"),
    }),
    assignRooms: useMutation({
      mutationFn: (input: { ownerId: string; roomIds: string[]; reason?: string }) =>
        guarded(
          `assign-room:${input.ownerId}:${[...input.roomIds].sort().join(",")}:${input.reason?.trim() ?? ""}`,
          (propertyId, key) =>
            propertyOwnerApi.assignRooms(
              input.ownerId,
              {
                property_id: propertyId,
                room_ids: input.roomIds,
                reason: input.reason?.trim() || undefined,
              },
              key,
            ),
          "Kepemilikan kamar Apart Kost tersimpan",
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Kepemilikan kamar belum tersimpan"),
    }),
    release: useMutation({
      mutationFn: (input: {
        ownerId: string;
        assignmentId: string;
        kind: "building" | "room";
        reason?: string;
      }) =>
        guarded(
          `release:${input.kind}:${input.ownerId}:${input.assignmentId}:${input.reason?.trim() ?? ""}`,
          (propertyId, key) =>
            input.kind === "building"
              ? propertyOwnerApi.releaseBuilding(
                  input.ownerId,
                  input.assignmentId,
                  {
                    property_id: propertyId,
                    reason: input.reason?.trim() || undefined,
                  },
                  key,
                )
              : propertyOwnerApi.releaseRoom(
                  input.ownerId,
                  input.assignmentId,
                  {
                    property_id: propertyId,
                    reason: input.reason?.trim() || undefined,
                  },
                  key,
                ),
          "Kepemilikan aset berhasil dilepaskan",
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Pelepasan kepemilikan belum tersimpan"),
    }),
    releaseBatch: useMutation({
      mutationFn: (input: {
        ownerId: string;
        assignmentIds: string[];
        kind: "building" | "room";
        reason?: string;
      }) =>
        guarded(
          `release-batch:${input.kind}:${input.ownerId}:${[...input.assignmentIds].sort().join(",")}:${input.reason?.trim() ?? ""}`,
          (propertyId, key) => {
            const body = {
              property_id: propertyId,
              assignment_ids: input.assignmentIds,
              reason: input.reason?.trim() || undefined,
            };
            return input.kind === "building"
              ? propertyOwnerApi.releaseBuildingBatch(input.ownerId, body, key)
              : propertyOwnerApi.releaseRoomBatch(input.ownerId, body, key);
          },
          `${input.assignmentIds.length} kepemilikan aset berhasil dilepaskan`,
          input.ownerId,
        )(),
      onError: (error) => toastMutationError(error, "Pelepasan kepemilikan belum tersimpan"),
    }),
  };
}
