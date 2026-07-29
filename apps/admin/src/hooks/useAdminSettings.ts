import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  canManageAdminSettings,
  requestAdminPropertyProfile,
  requestPersonalNotificationPreference,
  runSettingsSubmissionOnce,
  settingsResponseMatchesScope,
  updateAdminPropertyProfile,
  updatePersonalNotificationPreference,
  type ActiveSettingsSubmission,
  type AdminPropertyProfile,
  type AdminPropertyProfileDraft,
  type PersonalNotificationPreference,
} from "@/lib/admin-settings";
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

function toastSafeSettingsError(error: unknown, fallback: string): void {
  toast.error(fallback, { description: safeErrorMessage(error) });
}

export function useAdminSettings() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyId = currentPropertyId ?? "";
  const userId = user?.id ?? "";
  const roles = user?.roles ?? [];
  const permissions = user?.permissions ?? [];
  const hasRoleAndPermission =
    roles.some((role) => role === "owner" || role === "manager") &&
    permissions.includes("property.manage");
  const canManageProfile = canManageAdminSettings(roles, permissions, currentPropertyId);
  const propertyRef = useRef(currentPropertyId);
  const userRef = useRef(userId);
  const mountedRef = useRef(true);
  const activeProfileSubmission = useRef<ActiveSettingsSubmission<AdminPropertyProfile> | null>(
    null,
  );
  const activePreferenceSubmission =
    useRef<ActiveSettingsSubmission<PersonalNotificationPreference> | null>(null);

  propertyRef.current = currentPropertyId;
  userRef.current = userId;

  const profileKey = useMemo(() => adminUxQueryKeys.settings.profile(propertyId), [propertyId]);
  const preferenceKey = useMemo(() => adminUxQueryKeys.settings.preference(userId), [userId]);

  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => requestAdminPropertyProfile(apiClient, propertyId, signal),
    enabled: canManageProfile,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { scope: "property" },
  });
  const preferenceQuery = useQuery({
    queryKey: preferenceKey,
    queryFn: ({ signal }) => requestPersonalNotificationPreference(apiClient, signal),
    enabled: hasRoleAndPermission && Boolean(userId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    meta: { scope: "user" },
  });

  const profileMutation = useMutation({
    mutationFn: ({
      submittedPropertyId,
      draft,
    }: {
      submittedPropertyId: string;
      draft: AdminPropertyProfileDraft;
    }) => updateAdminPropertyProfile(apiClient, submittedPropertyId, draft),
  });
  const preferenceMutation = useMutation({
    mutationFn: ({ emailEnabled }: { submittedUserId: string; emailEnabled: boolean }) =>
      updatePersonalNotificationPreference(apiClient, emailEnabled),
  });
  const profileMutationIsCurrent =
    profileMutation.variables?.submittedPropertyId === currentPropertyId;
  const preferenceMutationIsCurrent = preferenceMutation.variables?.submittedUserId === userId;

  useEffect(() => {
    if (canManageProfile && !isForbidden(profileQuery.error)) return;
    void queryClient.cancelQueries({ queryKey: profileKey, exact: true });
    queryClient.removeQueries({ queryKey: profileKey, exact: true });
  }, [canManageProfile, profileKey, profileQuery.error, queryClient]);
  useEffect(() => {
    if (hasRoleAndPermission && !isForbidden(preferenceQuery.error)) return;
    void queryClient.cancelQueries({ queryKey: preferenceKey, exact: true });
    queryClient.removeQueries({ queryKey: preferenceKey, exact: true });
  }, [hasRoleAndPermission, preferenceKey, preferenceQuery.error, queryClient]);

  const resetProfileMutation = profileMutation.reset;
  const resetPreferenceMutation = preferenceMutation.reset;
  useEffect(() => {
    activeProfileSubmission.current = null;
    resetProfileMutation();
  }, [currentPropertyId, resetProfileMutation]);
  useEffect(() => {
    activePreferenceSubmission.current = null;
    resetPreferenceMutation();
  }, [resetPreferenceMutation, userId]);
  useEffect(
    () => () => {
      mountedRef.current = false;
      activeProfileSubmission.current = null;
      activePreferenceSubmission.current = null;
    },
    [],
  );

  const saveProfile = useCallback(
    (draft: AdminPropertyProfileDraft) => {
      const submittedPropertyId = currentPropertyId;
      if (!canManageProfile || !submittedPropertyId) {
        return Promise.reject(new Error("SETTINGS_PROPERTY_UNAVAILABLE"));
      }
      const fingerprint = `profile:${submittedPropertyId}:${JSON.stringify(draft)}`;
      return runSettingsSubmissionOnce(activeProfileSubmission, fingerprint, async () => {
        try {
          const response = await profileMutation.mutateAsync({ submittedPropertyId, draft });
          if (
            !mountedRef.current ||
            !settingsResponseMatchesScope(response.propertyId, propertyRef.current)
          ) {
            throw new Error("SETTINGS_SCOPE_CHANGED");
          }
          queryClient.setQueryData(
            adminUxQueryKeys.settings.profile(submittedPropertyId),
            response,
          );
          toastMutationSuccess("Profil properti berhasil disimpan");
          return response;
        } catch (error) {
          if (
            mountedRef.current &&
            settingsResponseMatchesScope(submittedPropertyId, propertyRef.current)
          ) {
            toastSafeSettingsError(error, "Profil properti gagal disimpan");
          }
          throw error;
        }
      });
    },
    [canManageProfile, currentPropertyId, profileMutation, queryClient],
  );

  const savePreference = useCallback(
    (emailEnabled: boolean) => {
      const submittedUserId = userId;
      if (!hasRoleAndPermission || !submittedUserId) {
        return Promise.reject(new Error("SETTINGS_PREFERENCE_UNAVAILABLE"));
      }
      const fingerprint = `preference:${submittedUserId}:${String(emailEnabled)}`;
      return runSettingsSubmissionOnce(activePreferenceSubmission, fingerprint, async () => {
        try {
          const response = await preferenceMutation.mutateAsync({
            submittedUserId,
            emailEnabled,
          });
          if (!mountedRef.current || userRef.current !== submittedUserId) {
            throw new Error("SETTINGS_USER_CHANGED");
          }
          queryClient.setQueryData(adminUxQueryKeys.settings.preference(submittedUserId), response);
          toastMutationSuccess("Preferensi notifikasi berhasil disimpan");
          return response;
        } catch (error) {
          if (mountedRef.current && userRef.current === submittedUserId) {
            toastSafeSettingsError(error, "Preferensi notifikasi gagal disimpan");
          }
          throw error;
        }
      });
    },
    [hasRoleAndPermission, preferenceMutation, queryClient, userId],
  );

  return {
    hasRouteAccess: hasRoleAndPermission,
    hasActiveProperty: Boolean(currentPropertyId),
    preferenceAccountId: hasRoleAndPermission ? userId : null,
    profile: canManageProfile ? (profileQuery.data ?? null) : null,
    preference: hasRoleAndPermission ? (preferenceQuery.data ?? null) : null,
    profileLoading: canManageProfile && profileQuery.isLoading,
    preferenceLoading: hasRoleAndPermission && preferenceQuery.isLoading,
    profileError: canManageProfile ? profileQuery.error : null,
    preferenceError: hasRoleAndPermission ? preferenceQuery.error : null,
    profileMutationError:
      canManageProfile && profileMutationIsCurrent ? profileMutation.error : null,
    preferenceMutationError:
      hasRoleAndPermission && preferenceMutationIsCurrent ? preferenceMutation.error : null,
    profileForbidden: isForbidden(profileQuery.error),
    preferenceForbidden: isForbidden(preferenceQuery.error),
    profileSaving:
      (profileMutationIsCurrent && profileMutation.isPending) ||
      activeProfileSubmission.current !== null,
    preferenceSaving:
      (preferenceMutationIsCurrent && preferenceMutation.isPending) ||
      activePreferenceSubmission.current !== null,
    retryProfile: profileQuery.refetch,
    retryPreference: preferenceQuery.refetch,
    saveProfile,
    savePreference,
  } as const;
}

export type AdminSettingsViewModel = ReturnType<typeof useAdminSettings>;
