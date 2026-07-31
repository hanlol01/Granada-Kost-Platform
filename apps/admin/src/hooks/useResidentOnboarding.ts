import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import {
  requestAdminOnboarding,
  type OnboardingPayload,
  type OnboardingResponse,
} from "@/lib/admin-onboarding";

export type SafeOnboardingResponse = Omit<OnboardingResponse, "temporaryPassword">;

function fingerprintPayload(payload: OnboardingPayload): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function createOnboardingIdempotencyLedger(createKey: () => string = newIdempotencyKey): {
  keyFor: (payload: OnboardingPayload) => string;
  reset: () => void;
} {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(payload) {
      const fingerprint = fingerprintPayload(payload);
      if (!current || current.fingerprint !== fingerprint) {
        current = { fingerprint, key: createKey() };
      }
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}

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
      receiptRef.current(temporaryPassword);
      return safeResponse;
    },
    onMutate: () => {
      receiptRef.current(null);
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
      await Promise.all(
        onboardingInvalidationKeys(propertyId).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  const resetMutation = mutation.reset;
  const resetCommand = useCallback(() => {
    generationRef.current += 1;
    activeGenerationRef.current = null;
    ledgerRef.current.reset();
    receiptRef.current(null);
    resetMutation();
  }, [resetMutation]);
  useEffect(() => {
    resetCommand();
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
    reset: resetCommand,
  };
}
