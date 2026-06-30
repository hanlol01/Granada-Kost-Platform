// Billing write paths exposed in M11E.
//
// Backend controllers (modules/billing/controllers):
//   InvoiceController:
//     POST /invoices/:invoiceId/issue   — billing.manage
//     POST /invoices/:invoiceId/cancel  — billing.manage (body: { reason })
//   PaymentController:
//     POST /payments/:paymentId/verify  — payment.verify
//     POST /payments/:paymentId/reject  — payment.verify (body: { reason })
//
// NOT wired here:
//   - Invoice CREATE: requires billing_period_id and snapshot fields the UI
//     cannot resolve without additional pickers.
//   - Payment-PROOF approve/reject: PaymentProofController only exposes GET
//     in Phase 1; the service-level verdict is not bound to an HTTP route.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type { InvoiceRecord, PaymentRecord } from "./useBilling";

export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation<InvoiceRecord, unknown, { invoiceId: string }>({
    mutationFn: async ({ invoiceId }) =>
      apiClient.post<InvoiceRecord>(`/invoices/${invoiceId}/issue`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Invoice diterbitkan");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menerbitkan invoice"),
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation<InvoiceRecord, unknown, { invoiceId: string; reason: string }>({
    mutationFn: async ({ invoiceId, reason }) =>
      apiClient.post<InvoiceRecord>(
        `/invoices/${invoiceId}/cancel`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Invoice dibatalkan");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toastMutationError(err, "Gagal membatalkan invoice"),
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation<PaymentRecord, unknown, { paymentId: string }>({
    mutationFn: async ({ paymentId }) =>
      apiClient.post<PaymentRecord>(`/payments/${paymentId}/verify`, undefined, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Pembayaran diverifikasi");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toastMutationError(err, "Gagal memverifikasi pembayaran"),
  });
}

export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation<PaymentRecord, unknown, { paymentId: string; reason: string }>({
    mutationFn: async ({ paymentId, reason }) =>
      apiClient.post<PaymentRecord>(
        `/payments/${paymentId}/reject`,
        { reason },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Pembayaran ditolak");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toastMutationError(err, "Gagal menolak pembayaran"),
  });
}
