import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getMyW06Billing,
  getMyW06Receipt,
  submitMyW06Proof,
  type SubmitMyW06Proof,
} from "@/lib/penghuni-w06-billing";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export const w06BillingKey = (accountId: string) =>
  ["penghuni", "billing", "w06", "account", accountId] as const;

class W06AccountScopeChangedError extends Error {
  readonly code = "W06_ACCOUNT_SCOPE_CHANGED";

  constructor() {
    super("Akun berubah; hasil billing lama diabaikan.");
  }
}

export function useW06BillingAccountId() {
  const { status, user } = useAuth();
  return status === "authenticated" &&
    user?.roles?.includes("resident") &&
    typeof user.id === "string" &&
    user.id.length > 0
    ? user.id
    : null;
}

export function useMyW06Billing() {
  const accountId = useW06BillingAccountId();
  return useQuery({
    queryKey: accountId ? w06BillingKey(accountId) : ["penghuni", "billing", "w06", "disabled"],
    queryFn: ({ signal }) => getMyW06Billing(signal),
    enabled: accountId !== null,
    staleTime: 30_000,
  });
}

export function useMyW06Receipt(receiptId: string | null) {
  const accountId = useW06BillingAccountId();
  return useQuery({
    queryKey:
      accountId && receiptId
        ? [...w06BillingKey(accountId), "receipt", receiptId]
        : ["penghuni", "billing", "w06", "receipt", "disabled"],
    queryFn: ({ signal }) => getMyW06Receipt(receiptId!, signal),
    enabled: accountId !== null && receiptId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSubmitMyW06Proof() {
  const accountId = useW06BillingAccountId();
  const queryClient = useQueryClient();
  const accountRef = useRef(accountId);
  const generationRef = useRef(0);
  if (accountRef.current !== accountId) {
    accountRef.current = accountId;
    generationRef.current += 1;
  }
  const mutation = useMutation({
    mutationFn: async ({
      input,
      idempotencyKey,
    }: {
      input: SubmitMyW06Proof;
      idempotencyKey: string;
    }) => {
      const generation = ++generationRef.current;
      const requestedAccountId = accountId;
      if (!requestedAccountId || requestedAccountId !== accountRef.current)
        throw new W06AccountScopeChangedError();
      const result = await submitMyW06Proof(input, idempotencyKey);
      if (requestedAccountId !== accountRef.current || generation !== generationRef.current)
        throw new W06AccountScopeChangedError();
      return result;
    },
    gcTime: 0,
    onSuccess: async () => {
      toastMutationSuccess("Bukti transfer terkirim dan menunggu verifikasi.");
      if (accountId) await queryClient.invalidateQueries({ queryKey: w06BillingKey(accountId) });
    },
    onError: (error) => {
      if (error instanceof W06AccountScopeChangedError) return;
      toastMutationError(error, "Bukti transfer tidak dapat dikirim");
    },
  });
  useEffect(() => mutation.reset(), [accountId, mutation.reset]);
  return mutation;
}
