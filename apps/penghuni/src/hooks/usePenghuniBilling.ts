// Penghuni billing domain hook.
//
// Backend (MyBillingController @Controller('my')):
//   GET  /my/invoices?limit=&offset=
//   GET  /my/invoices/:invoiceId
//   GET  /my/payments?limit=&offset=
//   POST /my/payment-proofs   (body: CreateMyPaymentProofDto)
//
// Records returned by the controller are the raw service shape (camelCase
// as defined in backend/api/src/modules/billing/types/billing.types.ts).
// We mirror those names in TypeScript so the UI can read them directly.
//
// Phase 1 NOTE: there is no /penghuni/billing/current dedicated endpoint;
// the "current bill" surface is derived by picking the most relevant unpaid
// invoice from /my/invoices. Consistent with Admin deriving aging stats from
// list endpoints.
//
// File upload for payment proof is NOT wired here. The backend payment-proof
// endpoint accepts metadata only (CreateMyPaymentProofDto exposes no file_id),
// and the File API itself is not part of M11F. The submit mutation is exported
// but route components keep the upload button disabled with an explicit label
// until both pieces land together.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";

export type MyInvoiceStatus =
  | "draft"
  | "issued"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

export type MyInvoiceRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  occupancyId: string;
  billingPeriodId: string;
  invoiceCode: string;
  invoiceStatus: MyInvoiceStatus;
  subtotalAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  dueDate: string;
  issuedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  snapshotPeriodKey: string;
  snapshotPeriodStartDate: string;
  snapshotPeriodEndDate: string;
  snapshotRoomNumber: string;
  snapshotResidentName: string;
  snapshotMonthlyPrice: number;
  createdAt: string;
  updatedAt: string;
};

export type MyPaymentMethod = "cash" | "bank_transfer" | "qris" | "ewallet" | "other";
export type MyPaymentStatus = "pending" | "verified" | "void";

export type MyPaymentRecord = {
  id: string;
  propertyId: string;
  residentId: string | null;
  paymentCode: string;
  paymentMethod: MyPaymentMethod;
  paymentStatus: MyPaymentStatus;
  amount: number;
  paidAt: string | null;
  verifiedAt: string | null;
  voidedAt: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MyPaymentProofRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  invoiceId: string;
  proofStatus: "pending_review" | "verified" | "rejected" | "expired";
  claimedAmount: number;
  paymentMethod: MyPaymentMethod;
  notes: string | null;
  createdAt: string;
};

export function useMyInvoices(
  filters: { limit?: number; offset?: number } = {},
): UseQueryResult<MyInvoiceRecord[]> {
  return useQuery<MyInvoiceRecord[]>({
    queryKey: qk.penghuni.billingHistory(filters),
    queryFn: () =>
      apiClient.get<MyInvoiceRecord[]>("/my/invoices", {
        query: { limit: filters.limit ?? 50, offset: filters.offset },
      }),
  });
}

export function useMyPayments(
  filters: { limit?: number; offset?: number } = {},
): UseQueryResult<MyPaymentRecord[]> {
  return useQuery<MyPaymentRecord[]>({
    queryKey: [...qk.penghuni.billingHistory({ resource: "payments", ...filters })] as const,
    queryFn: () =>
      apiClient.get<MyPaymentRecord[]>("/my/payments", {
        query: { limit: filters.limit ?? 50, offset: filters.offset },
      }),
  });
}

// Picks the most relevant "current" invoice from the resident list.
// Order of preference: overdue > unpaid > issued > partially_paid > draft.
// Returns null when there is nothing actionable.
export function selectCurrentInvoice(
  invoices: MyInvoiceRecord[] | undefined,
): MyInvoiceRecord | null {
  if (!invoices || invoices.length === 0) return null;
  const priority: Record<MyInvoiceStatus, number> = {
    overdue: 0,
    unpaid: 1,
    issued: 2,
    partially_paid: 3,
    draft: 4,
    paid: 5,
    void: 6,
  };
  const sorted = [...invoices].sort((a, b) => {
    const pa = priority[a.invoiceStatus] ?? 99;
    const pb = priority[b.invoiceStatus] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
  });
  const candidate = sorted[0];
  if (["paid", "void"].includes(candidate.invoiceStatus)) return null;
  return candidate;
}

export type SubmitPaymentProofInput = {
  invoice_id: string;
  payment_account_id?: string;
  claimed_amount: number;
  payment_method: MyPaymentMethod;
  notes?: string;
};

export function useSubmitPaymentProof() {
  const queryClient = useQueryClient();
  return useMutation<MyPaymentProofRecord, unknown, SubmitPaymentProofInput>({
    mutationFn: (body) =>
      apiClient.post<MyPaymentProofRecord>("/my/payment-proofs", body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: async () => {
      toastMutationSuccess("Bukti pembayaran terkirim. Menunggu verifikasi.");
      // Invalidate billing + notifications to surface admin response promptly.
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.billingHistory() });
      await queryClient.invalidateQueries({ queryKey: qk.penghuni.notifications() });
    },
    onError: (err) => toastMutationError(err, "Gagal mengirim bukti pembayaran"),
  });
}
