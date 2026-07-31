import { useEffect, useRef } from "react";
import { rejectPayment } from "@/lib/admin-w06-billing";
import { adminUxQueryKeys, queryKeyContainsPropertyScope } from "@/lib/admin-ux-query-keys";
import type { W06PaymentStatus } from "@/lib/admin-w06-billing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBillingWorklist,
  getBillingPayments,
  getBillingProofs,
  getBillingReceipt,
  getResidentBilling,
  recordManualPayment,
  rejectProof,
  reversePayment,
  verifyPayment,
  verifyProof,
  createOtherCharge,
  type OtherChargeInput,
  type ManualPaymentInput,
} from "@/lib/admin-w06-billing";

export const w06BillingKeys = {
  root: (propertyId: string) => ["admin", "w06-billing", propertyId] as const,
  worklist: (propertyId: string, month: string, offset: number, search: string) =>
    [...w06BillingKeys.root(propertyId), "worklist", month, offset, search] as const,
  resident: (propertyId: string, residentId: string) =>
    [...w06BillingKeys.root(propertyId), "resident", residentId] as const,
  payments: (propertyId: string, status: string, offset: number) =>
    [...w06BillingKeys.root(propertyId), "payments", status, offset] as const,
  proofs: (propertyId: string, status: string, offset: number) =>
    [...w06BillingKeys.root(propertyId), "proofs", status, offset] as const,
  receipt: (propertyId: string, receiptId: string) =>
    [...w06BillingKeys.root(propertyId), "receipt", receiptId] as const,
};

class W06ScopeChangedError extends Error {
  readonly code = "W06_SCOPE_CHANGED";

  constructor() {
    super("Scope billing berubah; hasil lama diabaikan.");
  }
}

type ScopeToken = { propertyId: string; generation: number };

function useW06Scope(propertyId: string | null) {
  const scopeRef = useRef(propertyId);
  const generationRef = useRef(0);
  if (scopeRef.current !== propertyId) {
    scopeRef.current = propertyId;
    generationRef.current += 1;
  }
  function begin(requestedPropertyId: string | null): ScopeToken {
    const generation = ++generationRef.current;
    if (!requestedPropertyId || requestedPropertyId !== scopeRef.current)
      throw new W06ScopeChangedError();
    return { propertyId: requestedPropertyId, generation };
  }
  function assertCurrent(token: ScopeToken) {
    if (token.generation !== generationRef.current || token.propertyId !== scopeRef.current)
      throw new W06ScopeChangedError();
  }
  return { begin, assertCurrent };
}

export function useBillingWorklist(
  propertyId: string | null,
  input: { month: string; offset: number; search: string },
) {
  return useQuery({
    queryKey: w06BillingKeys.worklist(
      propertyId ?? "none",
      input.month,
      input.offset,
      input.search,
    ),
    queryFn: ({ signal }) =>
      getBillingWorklist(
        { propertyId: propertyId!, month: input.month, offset: input.offset, search: input.search },
        signal,
      ),
    enabled: Boolean(propertyId),
  });
}

export function useResidentBilling(propertyId: string | null, residentId: string | null) {
  return useQuery({
    queryKey: w06BillingKeys.resident(propertyId ?? "none", residentId ?? "none"),
    queryFn: ({ signal }) => getResidentBilling(propertyId!, residentId!, signal),
    enabled: Boolean(propertyId && residentId),
  });
}

export function useBillingPayments(
  propertyId: string | null,
  status: W06PaymentStatus,
  offset = 0,
) {
  return useQuery({
    queryKey: w06BillingKeys.payments(propertyId ?? "none", status, offset),
    queryFn: ({ signal }) =>
      getBillingPayments({ propertyId: propertyId!, status, offset }, signal),
    enabled: Boolean(propertyId),
  });
}

export function useBillingProofs(
  propertyId: string | null,
  status: "pending_review" | "verified" | "rejected" | "expired",
  offset = 0,
) {
  return useQuery({
    queryKey: w06BillingKeys.proofs(propertyId ?? "none", status, offset),
    queryFn: ({ signal }) => getBillingProofs({ propertyId: propertyId!, status, offset }, signal),
    enabled: Boolean(propertyId),
  });
}

export function useBillingReceipt(propertyId: string | null, receiptId: string | null) {
  return useQuery({
    queryKey: w06BillingKeys.receipt(propertyId ?? "none", receiptId ?? "none"),
    queryFn: ({ signal }) => getBillingReceipt(propertyId!, receiptId!, signal),
    enabled: Boolean(propertyId && receiptId),
  });
}

function useBillingInvalidation(propertyId: string | null) {
  const client = useQueryClient();
  return async () => {
    if (!propertyId) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: w06BillingKeys.root(propertyId) }),
      client.invalidateQueries({ queryKey: adminUxQueryKeys.invoices.all(propertyId) }),
      client.invalidateQueries({ queryKey: adminUxQueryKeys.rooms.all(propertyId) }),
      client.invalidateQueries({ queryKey: adminUxQueryKeys.rooms.availabilityAll(propertyId) }),
      client.invalidateQueries({ queryKey: adminUxQueryKeys.dashboard.summary(propertyId) }),
      client.invalidateQueries({
        predicate: (query) =>
          queryKeyContainsPropertyScope(query.queryKey, propertyId) &&
          ["room", "roomDetail", "paymentTransaction"].includes(String(query.queryKey[0])),
      }),
    ]);
  };
}

function useScopedW06Mutation<TVariables, TResult>(
  propertyId: string | null,
  requestedProperty: (variables: TVariables) => string | null,
  execute: (variables: TVariables, propertyId: string) => Promise<TResult>,
) {
  const invalidate = useBillingInvalidation(propertyId);
  const scope = useW06Scope(propertyId);
  const mutation = useMutation({
    mutationFn: async (variables: TVariables) => {
      const token = scope.begin(requestedProperty(variables));
      const result = await execute(variables, token.propertyId);
      scope.assertCurrent(token);
      return result;
    },
    onSuccess: invalidate,
    gcTime: 0,
  });
  useEffect(() => mutation.reset(), [propertyId, mutation.reset]);
  return mutation;
}

export function useRecordManualPayment(propertyId: string | null) {
  type Variables = { input: ManualPaymentInput; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof recordManualPayment>>>(
    propertyId,
    (variables) => variables.input.property_id,
    (variables) => recordManualPayment(variables.input, variables.idempotencyKey),
  );
}

export function useVerifyPayment(propertyId: string | null) {
  type Variables = { paymentId: string; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof verifyPayment>>>(
    propertyId,
    () => propertyId,
    (variables, scopePropertyId) =>
      verifyPayment(scopePropertyId, variables.paymentId, variables.idempotencyKey),
  );
}

export function useRejectPayment(propertyId: string | null) {
  type Variables = { paymentId: string; reason: string; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof rejectPayment>>>(
    propertyId,
    () => propertyId,
    (variables, scopePropertyId) =>
      rejectPayment(
        scopePropertyId,
        variables.paymentId,
        variables.reason,
        variables.idempotencyKey,
      ),
  );
}

export function useVerifyProof(propertyId: string | null) {
  type Variables = { proofId: string; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof verifyProof>>>(
    propertyId,
    () => propertyId,
    (variables, scopePropertyId) =>
      verifyProof(scopePropertyId, variables.proofId, variables.idempotencyKey),
  );
}

export function useRejectProof(propertyId: string | null) {
  type Variables = { proofId: string; reason: string; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof rejectProof>>>(
    propertyId,
    () => propertyId,
    (variables, scopePropertyId) =>
      rejectProof(scopePropertyId, variables.proofId, variables.reason, variables.idempotencyKey),
  );
}

export function useReversePayment(propertyId: string | null) {
  type Variables = { paymentId: string; reason: string; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof reversePayment>>>(
    propertyId,
    () => propertyId,
    (variables, scopePropertyId) =>
      reversePayment(
        scopePropertyId,
        variables.paymentId,
        variables.reason,
        variables.idempotencyKey,
      ),
  );
}

export function useCreateOtherCharge(propertyId: string | null) {
  type Variables = { input: OtherChargeInput; idempotencyKey: string };
  return useScopedW06Mutation<Variables, Awaited<ReturnType<typeof createOtherCharge>>>(
    propertyId,
    (variables) => variables.input.property_id,
    (variables) => createOtherCharge(variables.input, variables.idempotencyKey),
  );
}
