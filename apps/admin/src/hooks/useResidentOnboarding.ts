import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@granada-kost/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { createOnboardingIdempotencyLedger } from "@/lib/onboarding-idempotency";
import { useProperty } from "@/lib/property";
import {
  requestAdminOnboarding,
  type OnboardingPayload,
  type OnboardingResponse,
} from "@/lib/admin-onboarding";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { LeaseRevisionContractError } from "@/lib/lease-revision-contract";
import { toast } from "sonner";

export type SafeOnboardingResponse = Omit<OnboardingResponse, "temporaryPassword">;
export { createOnboardingIdempotencyLedger } from "@/lib/onboarding-idempotency";

export function separateOnboardingCredential(response: OnboardingResponse): {
  safeResponse: SafeOnboardingResponse;
  temporaryPassword: string | null;
} {
  const { temporaryPassword, ...safeResponse } = response;
  return { safeResponse, temporaryPassword };
}

export function isOnboardingScopeCurrent(
  requestPropertyId: string,
  currentPropertyId: string | null,
): boolean {
  return requestPropertyId === currentPropertyId;
}

export function isOnboardingRequestCurrent(
  requestGeneration: number,
  currentGeneration: number,
  requestPropertyId: string,
  currentPropertyId: string | null,
): boolean {
  return (
    requestGeneration === currentGeneration &&
    isOnboardingScopeCurrent(requestPropertyId, currentPropertyId)
  );
}

export function onboardingInvalidationKeys(propertyId: string): readonly (readonly unknown[])[] {
  return [
    ["booking-leads", "list", { propertyId }],
    adminUxQueryKeys.residents.all(propertyId),
    adminUxQueryKeys.leases.all(propertyId),
    adminUxQueryKeys.rooms.all(propertyId),
    adminUxQueryKeys.rooms.availabilityAll(propertyId),
    adminUxQueryKeys.dashboard.summary(propertyId),
    ["lease-archives", propertyId],
    ["lease-archive-detail", propertyId],
    ["lease-archive-restoration-preview", propertyId],
  ];
}

export function useResidentOnboarding(setTemporaryPassword: (password: string | null) => void) {
  const queryClient = useQueryClient();
  const { currentPropertyId } = useProperty();
  const propertyRef = useRef(currentPropertyId);
  const receiptRef = useRef(setTemporaryPassword);
  const ledgerRef = useRef(createOnboardingIdempotencyLedger());
  const generationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [refreshIncomplete, setRefreshIncomplete] = useState(false);
  propertyRef.current = currentPropertyId;
  receiptRef.current = setTemporaryPassword;

  const mutation = useMutation<SafeOnboardingResponse, unknown, OnboardingPayload>({
    mutationFn: async (payload) => {
      const requestPropertyId = payload.property_id;
      const requestGeneration = generationRef.current + 1;
      generationRef.current = requestGeneration;
      activeGenerationRef.current = requestGeneration;
      if (!isOnboardingScopeCurrent(requestPropertyId, currentPropertyId))
        throw new Error("PROPERTY_SCOPE_CHANGED");
      const result = await requestAdminOnboarding(
        (path, body, options) => adminUxV2Requester.post<unknown>(path, body, options),
        payload,
        ledgerRef.current.keyFor(payload),
      );
      if (
        !isOnboardingRequestCurrent(
          requestGeneration,
          generationRef.current,
          requestPropertyId,
          propertyRef.current,
        )
      )
        throw new Error("PROPERTY_SCOPE_CHANGED");
      const { safeResponse, temporaryPassword } = separateOnboardingCredential(result);
      ledgerRef.current.resolve();
      setSubmissionUncertain(false);
      receiptRef.current(temporaryPassword);
      return safeResponse;
    },
    onMutate: () => {
      receiptRef.current(null);
      setRefreshIncomplete(false);
    },
    onSuccess: async (_result, payload) => {
      if (
        activeGenerationRef.current === null ||
        !isOnboardingRequestCurrent(
          activeGenerationRef.current,
          generationRef.current,
          payload.property_id,
          propertyRef.current,
        )
      )
        return;
      const propertyId = payload.property_id;
      const refreshed = await Promise.allSettled(
        onboardingInvalidationKeys(propertyId).map((queryKey) =>
          Promise.resolve().then(() =>
            queryClient.invalidateQueries({ queryKey }, { throwOnError: true }),
          ),
        ),
      );
      if (
        activeGenerationRef.current === null ||
        !isOnboardingRequestCurrent(
          activeGenerationRef.current,
          generationRef.current,
          payload.property_id,
          propertyRef.current,
        )
      )
        return;
      toastMutationSuccess(
        payload.source_archive_id
          ? "Penyewaan pengganti berhasil dibuat; riwayat lama tetap tersedia di arsip"
          : "Penyewaan berhasil dibuat dan menunggu aktivasi kamar",
      );
      if (refreshed.some((result) => result.status === "rejected")) {
        setRefreshIncomplete(true);
        toast.warning("Penyewaan tersimpan, tetapi daftar belum diperbarui", {
          description:
            "Jangan simpan ulang. Buka detail penyewaan atau perbarui daftar untuk melihat hasil yang sudah tersimpan.",
        });
      }
    },
    onError: (error, payload) => {
      if (
        payload.source_archive_id &&
        isOnboardingScopeCurrent(payload.property_id, propertyRef.current) &&
        (!ApiError.isApiError(error) || error.status === 0 || error.status >= 500)
      ) {
        ledgerRef.current.freeze(payload);
        setSubmissionUncertain(true);
        toastMutationError(
          new LeaseRevisionContractError("LEASE_ARCHIVE_SUCCESSOR_SUBMISSION_UNCERTAIN", ""),
          "Hasil penyewaan pengganti belum dapat dipastikan",
          error,
        );
        return;
      }
      toastMutationError(error, "Penyewaan belum dapat dibuat");
    },
  });

  const resetMutation = mutation.reset;
  const resetCommand = useCallback(
    (force = false) => {
      if (!ledgerRef.current.reset(force)) return;
      generationRef.current += 1;
      activeGenerationRef.current = null;
      setSubmissionUncertain(false);
      setRefreshIncomplete(false);
      receiptRef.current(null);
      resetMutation();
    },
    [resetMutation],
  );
  useEffect(() => {
    resetCommand(true);
  }, [currentPropertyId, resetCommand]);

  const resultIsCurrent =
    activeGenerationRef.current !== null &&
    mutation.variables !== undefined &&
    isOnboardingRequestCurrent(
      activeGenerationRef.current,
      generationRef.current,
      mutation.variables.property_id,
      currentPropertyId,
    );
  return {
    ...mutation,
    data: resultIsCurrent ? mutation.data : undefined,
    error: resultIsCurrent ? mutation.error : null,
    reset: () => resetCommand(),
    submissionUncertain,
    refreshIncomplete: resultIsCurrent && refreshIncomplete,
    retryOriginalSubmission: async () => {
      const original = ledgerRef.current.uncertainPayload();
      if (original) return mutation.mutateAsync(original);
    },
  };
}
