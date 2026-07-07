// Penghuni payment gateway hooks (M15C-E2A).
//
// Backend (M15C-C/M15C-D, payment-gateway module):
//   POST /my/invoices/:invoiceId/payment-sessions
//   GET  /my/invoices/:invoiceId/payment-status
//
// Binding rules (M15C-A/B/E1):
// - The verified backend webhook is the ONLY source of truth for paid status.
// - Redirect/finish URLs are UX-only and never mark an invoice paid.
// - Responses are provider-neutral; no raw provider payload, signature,
//   server key, or client key is ever received or rendered.
// - Manual payment proof (M12C3) remains the fallback path.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { apiClient } from "@/lib/api";
import { qk } from "@/lib/query-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError } from "@/lib/mutation-feedback";

export type GatewayPaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "denied"
  | "challenge"
  | "requires_review"
  | "unknown";

// Provider-neutral response shape (M15C-B Section 11). All fields are treated
// as optional/nullable so the UI stays defensive against backend evolution.
export type InvoicePaymentStatusResponse = {
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  paymentStatus?: GatewayPaymentStatus | string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  paymentUrl?: string | null;
  snapToken?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  safeMessage?: string | null;
};

export type PaymentSessionResponse = InvoicePaymentStatusResponse;

// Statuses where polling should stop: nothing will change without a new
// attempt (or admin/webhook action that the next manual refresh will pick up).
const POLL_TERMINAL_STATUSES = new Set<string>([
  "paid",
  "failed",
  "expired",
  "cancelled",
  "denied",
  "challenge",
  "requires_review",
  "unknown",
]);

const POLL_FAST_WINDOW_MS = 60_000; // first minute: fast polling
const POLL_TOTAL_WINDOW_MS = 5 * 60_000; // stop after ~5 minutes
const POLL_FAST_MS = 5_000;
const POLL_SLOW_MS = 15_000;

export function isPaymentSessionExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

/**
 * Normalized payment status for the resident's own invoice.
 *
 * Bounded polling: pass `pollingStartedAt` (epoch ms) to poll every 5 s for
 * the first minute, then every 15 s, stopping after ~5 minutes or when a
 * terminal status is reached. Pass `null` to disable polling (default).
 */
export function useInvoicePaymentStatus(
  invoiceId: string | null,
  options: { pollingStartedAt?: number | null } = {},
): UseQueryResult<InvoicePaymentStatusResponse> {
  const pollingStartedAt = options.pollingStartedAt ?? null;
  return useQuery<InvoicePaymentStatusResponse>({
    queryKey: qk.penghuni.billingPaymentStatus(invoiceId ?? "none"),
    queryFn: () =>
      apiClient.get<InvoicePaymentStatusResponse>(`/my/invoices/${invoiceId}/payment-status`),
    enabled: Boolean(invoiceId),
    // Refresh when the resident returns to the app after paying externally.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (!pollingStartedAt) return false;
      const data = query.state.data;
      const status = data?.paymentStatus ? String(data.paymentStatus) : null;
      if (data?.invoiceStatus === "paid") return false;
      if (status && POLL_TERMINAL_STATUSES.has(status)) return false;
      const elapsed = Date.now() - pollingStartedAt;
      if (elapsed >= POLL_TOTAL_WINDOW_MS) return false;
      return elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    },
  });
}

/** Creates (or reuses, per backend single_active policy) a payment session. */
export function useCreatePaymentSession() {
  const queryClient = useQueryClient();
  return useMutation<PaymentSessionResponse, unknown, { invoiceId: string }>({
    mutationFn: ({ invoiceId }) =>
      apiClient.post<PaymentSessionResponse>(
        `/my/invoices/${invoiceId}/payment-sessions`,
        {},
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: qk.penghuni.billingPaymentStatus(variables.invoiceId),
      });
    },
    onError: (error) => toastMutationError(error, "Gagal membuat sesi pembayaran online"),
  });
}

// Safe Indonesian copy per normalized error code (M15C-E1 Section 11).
// Raw error bodies, stacks, or provider payloads are never rendered.
const PAYMENT_ERROR_COPY: Record<string, string> = {
  PAYMENT_GATEWAY_DISABLED: "Pembayaran online belum tersedia.",
  PAYMENT_CONFIG_MISSING: "Pembayaran online sedang tidak tersedia. Coba lagi nanti.",
  PAYMENT_PROVIDER_UNAVAILABLE: "Layanan pembayaran sedang gangguan. Coba lagi nanti.",
  PAYMENT_INVOICE_ALREADY_PAID: "Tagihan sudah lunas.",
  PAYMENT_TRANSACTION_PENDING:
    "Masih ada pembayaran online yang sedang menunggu. Selesaikan atau tunggu kedaluwarsa.",
  PAYMENT_TRANSACTION_EXPIRED: "Sesi pembayaran kedaluwarsa. Buat sesi pembayaran baru.",
  PAYMENT_STATUS_REQUIRES_REVIEW:
    "Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah.",
  PAYMENT_UNKNOWN_PROVIDER_ERROR: "Terjadi kendala pada layanan pembayaran. Coba lagi nanti.",
};

export function paymentErrorCode(error: unknown): string | null {
  return ApiError.isApiError(error) ? error.code : null;
}

export function paymentErrorMessage(error: unknown): string {
  const code = paymentErrorCode(error);
  if (code && PAYMENT_ERROR_COPY[code]) return PAYMENT_ERROR_COPY[code];
  return PAYMENT_ERROR_COPY.PAYMENT_UNKNOWN_PROVIDER_ERROR;
}
