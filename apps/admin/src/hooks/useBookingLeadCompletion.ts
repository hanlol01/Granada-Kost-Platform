import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  requestBookingLeadRentalContext,
  requestBookingLeadCompletionQuote,
  requestCompleteBookingLead,
  type CompleteBookingLeadInput,
  type LeadPaymentCommitment,
} from "@/lib/admin-booking-lead-completion";
import { bookingLeadListScopeKey } from "@/lib/admin-booking-lead";
import { bookingHoldInvalidationKeys } from "@/lib/admin-booking-lead-hold";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

type CompleteVariables = {
  leadId: string;
  input: CompleteBookingLeadInput;
  idempotencyKey: string;
};

export function useBookingLeadCompletionContext(leadId: string | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: ["booking-lead-rental-context", currentPropertyId, leadId],
    enabled: Boolean(currentPropertyId && leadId),
    queryFn: () => requestBookingLeadRentalContext(leadId!, currentPropertyId!),
  });
}

export function useBookingLeadCompletionQuote(
  leadId: string | null | undefined,
  startDate: string,
  termMonths: number,
) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: ["booking-lead-completion-quote", currentPropertyId, leadId, startDate, termMonths],
    enabled: Boolean(currentPropertyId && leadId && startDate && termMonths >= 3),
    queryFn: () =>
      requestBookingLeadCompletionQuote(leadId!, currentPropertyId!, startDate, termMonths),
  });
}

/**
 * A completion result belongs to the property that initiated it.  The guard
 * prevents a late request from closing a dialog or invalidating data after a
 * property switch.
 */
export function useCompleteBookingLead() {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyRef = useRef(currentPropertyId);
  const generationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  propertyRef.current = currentPropertyId;

  const mutation = useMutation<LeadPaymentCommitment, unknown, CompleteVariables>({
    mutationFn: async ({ leadId, input, idempotencyKey }) => {
      const requestPropertyId = input.propertyId;
      const requestGeneration = generationRef.current + 1;
      generationRef.current = requestGeneration;
      activeGenerationRef.current = requestGeneration;
      if (!requestPropertyId || requestPropertyId !== propertyRef.current) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      const result = await requestCompleteBookingLead(leadId, input, idempotencyKey);
      if (
        requestGeneration !== generationRef.current ||
        requestPropertyId !== propertyRef.current ||
        result.propertyId !== requestPropertyId
      ) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      return result;
    },
    onSuccess: async (result, variables) => {
      if (
        activeGenerationRef.current === null ||
        activeGenerationRef.current !== generationRef.current ||
        propertyRef.current !== variables.input.propertyId ||
        result.propertyId !== variables.input.propertyId
      ) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: bookingLeadListScopeKey(variables.input.propertyId),
        }),
        ...bookingHoldInvalidationKeys(variables.input.propertyId).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ]);
      toastMutationSuccess("Minat booking siap dilengkapi sebagai penyewaan");
    },
    onError: (error, variables) => {
      if (variables.input.propertyId === propertyRef.current) {
        toastMutationError(error, "Gagal menyelesaikan minat booking");
      }
    },
  });

  const resetMutation = mutation.reset;
  const reset = useCallback(() => {
    generationRef.current += 1;
    activeGenerationRef.current = null;
    resetMutation();
  }, [resetMutation]);

  useEffect(() => {
    reset();
  }, [currentPropertyId, reset]);

  const current =
    activeGenerationRef.current !== null &&
    mutation.variables !== undefined &&
    activeGenerationRef.current === generationRef.current &&
    mutation.variables.input.propertyId === currentPropertyId;

  return {
    ...mutation,
    data: current ? mutation.data : undefined,
    error: current ? mutation.error : null,
    reset,
  };
}
