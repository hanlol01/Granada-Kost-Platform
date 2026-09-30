import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  requestOrganizationSettings,
  requestPropertyDocumentSettings,
  updateOrganizationSettings,
  updatePropertyDocumentSettings,
  type OrganizationSettingsDraft,
  type PropertyDocumentSettingsDraft,
} from "@/lib/general-settings";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { safeErrorMessage } from "@/lib/error-normalizer";
import { toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

function isForbidden(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: unknown }).status === 403,
  );
}

export function useGeneralSettings() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyId = currentPropertyId ?? "";
  const permissions = user?.permissions ?? [];
  const canManage =
    Boolean(currentPropertyId) &&
    user?.roles.includes("admin") === true &&
    permissions.includes("property_owner.manage");
  const organizationKey = useMemo(
    () => adminUxQueryKeys.settings.organization(propertyId),
    [propertyId],
  );
  const documentKey = useMemo(
    () => adminUxQueryKeys.settings.document(propertyId),
    [propertyId],
  );
  const organizationQuery = useQuery({
    queryKey: organizationKey,
    queryFn: ({ signal }) => requestOrganizationSettings(apiClient, propertyId, signal),
    enabled: canManage,
    staleTime: 0,
    retry: false,
    meta: { scope: "property" },
  });
  const documentQuery = useQuery({
    queryKey: documentKey,
    queryFn: ({ signal }) => requestPropertyDocumentSettings(apiClient, propertyId, signal),
    enabled: canManage,
    staleTime: 0,
    retry: false,
    meta: { scope: "property" },
  });
  const organizationMutation = useMutation({
    mutationFn: (draft: OrganizationSettingsDraft) =>
      updateOrganizationSettings(apiClient, propertyId, draft),
  });
  const documentMutation = useMutation({
    mutationFn: (draft: PropertyDocumentSettingsDraft) =>
      updatePropertyDocumentSettings(apiClient, propertyId, draft),
  });

  const saveOrganization = useCallback(
    async (draft: OrganizationSettingsDraft) => {
      try {
        const result = await organizationMutation.mutateAsync(draft);
        queryClient.setQueryData(organizationKey, result);
        toastMutationSuccess("Identitas organisasi berhasil disimpan");
        return result;
      } catch (error) {
        toast.error("Identitas organisasi gagal disimpan", { description: safeErrorMessage(error) });
        throw error;
      }
    },
    [organizationKey, organizationMutation, queryClient],
  );
  const saveDocumentSettings = useCallback(
    async (draft: PropertyDocumentSettingsDraft) => {
      try {
        const result = await documentMutation.mutateAsync(draft);
        queryClient.setQueryData(documentKey, result);
        toastMutationSuccess("Pengaturan dokumen berhasil disimpan");
        return result;
      } catch (error) {
        toast.error("Pengaturan dokumen gagal disimpan", { description: safeErrorMessage(error) });
        throw error;
      }
    },
    [documentKey, documentMutation, queryClient],
  );

  return {
    canManage,
    hasActiveProperty: Boolean(currentPropertyId),
    organization: organizationQuery.data ?? null,
    documentSettings: documentQuery.data ?? null,
    organizationLoading: canManage && organizationQuery.isLoading,
    documentLoading: canManage && documentQuery.isLoading,
    organizationError: organizationQuery.error,
    documentError: documentQuery.error,
    organizationForbidden: isForbidden(organizationQuery.error),
    documentForbidden: isForbidden(documentQuery.error),
    organizationSaving: organizationMutation.isPending,
    documentSaving: documentMutation.isPending,
    saveOrganization,
    saveDocumentSettings,
    retryOrganization: organizationQuery.refetch,
    retryDocumentSettings: documentQuery.refetch,
  } as const;
}

export type GeneralSettingsViewModel = ReturnType<typeof useGeneralSettings>;
