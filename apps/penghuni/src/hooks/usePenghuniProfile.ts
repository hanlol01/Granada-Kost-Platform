// Penghuni profile domain hook.
//
// Source of truth: GET /auth/me (already fetched by AuthProvider). For active
// session list + revoke we go to /auth/sessions and DELETE /auth/sessions/:id.
// Change password uses PATCH /auth/password. Backend remains final authority
// for every write; this hook only orchestrates queries/mutations.
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

export type PenghuniProfileView = {
  id: string | null;
  displayName: string;
  email: string | null;
  initials: string;
  // Fields below are not provided by /auth/me in Phase 1; UI must show
  // "Belum tersedia" instead of guessing.
  phone: null;
  joinDate: null;
  roomLabel: string | null;
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
  // /auth/me returns { id, email, displayName, roles, permissions, propertyIds, ... }.
  // The shared AuthMe type declares optional `name` and `properties` for
  // backwards compatibility, so we read both keys without inventing data.
  const u = (user ?? null) as
    | (typeof user & {
        displayName?: string;
        propertyIds?: string[];
      })
    | null;
  const displayName = u?.displayName ?? u?.name ?? "Penghuni";
  const propertyName = u?.properties?.[0]?.name ?? null;
  return {
    id: u?.id ?? null,
    displayName,
    email: u?.email ?? null,
    initials: deriveInitials(displayName),
    phone: null,
    joinDate: null,
    roomLabel: propertyName,
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
