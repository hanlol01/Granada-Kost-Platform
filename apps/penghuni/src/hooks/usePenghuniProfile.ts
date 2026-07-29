// Penghuni profile domain hook.
//
// Source of truth: GET /my/resident-context for resident/hunian facts and
// GET /auth/me (already fetched by AuthProvider) for account email. For active
// session list + revoke we go to /auth/sessions and DELETE /auth/sessions/:id.
//
// Note: there is no PATCH /penghuni/me or PATCH /residents/me endpoint in
// Phase 1. Edit profile is therefore intentionally NOT exposed here.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { AuthSession } from "@granada-kost/domain";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import {
  residentContextState,
  useResidentContext,
  type ResidentContextState,
} from "@/lib/resident-context";

export type PenghuniProfileView = {
  displayName: string | null;
  email: string | null;
  initials: string;
  phone: string | null;
  propertyName: string | null;
  roomNumber: string | null;
  occupancyStart: string | null;
  contextState: ResidentContextState;
  contextError: unknown;
  refetchContext: () => Promise<void>;
};

function deriveInitials(name: string | null | undefined): string {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  const ab = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return ab.toUpperCase();
}

export function usePenghuniProfile(): PenghuniProfileView {
  const { user } = useAuth();
  const context = useResidentContext();
  const state = residentContextState(context);
  const resident = state === "ready" ? (context.data ?? null) : null;
  const displayName = resident?.displayName ?? null;

  return {
    displayName,
    email: user?.email ?? null,
    initials: deriveInitials(displayName),
    phone: resident?.phone ?? null,
    propertyName: resident?.propertyName ?? null,
    roomNumber: resident?.roomNumber ?? null,
    occupancyStart: resident?.occupancyStart ?? null,
    contextState: state,
    contextError: context.error,
    refetchContext: async () => {
      await context.refetch();
    },
  };
}

export function useActiveSessions(): UseQueryResult<AuthSession[]> {
  return useQuery<AuthSession[]>({
    queryKey: qk.auth.sessions(),
    queryFn: () => apiClient.get<AuthSession[]>("/auth/sessions"),
    staleTime: 30_000,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation<{ success: true }, unknown, { sessionId: string }>({
    mutationFn: ({ sessionId }) =>
      apiClient.delete<{ success: true }>(`/auth/sessions/${sessionId}`),
    onSuccess: async () => {
      toastMutationSuccess("Sesi dicabut");
      await queryClient.invalidateQueries({ queryKey: qk.auth.sessions() });
    },
    onError: (err) => toastMutationError(err, "Gagal mencabut sesi"),
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation<{ success: true }, unknown, void>({
    mutationFn: () => apiClient.post<{ success: true }>("/auth/logout-all"),
    onSuccess: async () => {
      toastMutationSuccess("Semua sesi dicabut");
      queryClient.clear();
    },
    onError: (err) => toastMutationError(err, "Gagal logout semua perangkat"),
  });
}

export function useChangePassword() {
  return useMutation<
    { success: true },
    unknown,
    { current_password: string; new_password: string }
  >({
    mutationFn: (body) =>
      apiClient.patch<{ success: true }>("/auth/password", body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => toastMutationSuccess("Kata sandi diperbarui. Silakan masuk kembali."),
    onError: (err) => toastMutationError(err, "Gagal memperbarui kata sandi"),
  });
}
