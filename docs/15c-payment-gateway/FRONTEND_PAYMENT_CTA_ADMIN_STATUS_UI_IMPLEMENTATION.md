# M15C-E2A — Frontend Payment CTA / Admin Status UI Implementation

> **Milestone:** M15C-E2A (frontend source implementation by Claude Fable 5; technical validation deferred to M15C-E2B Codex)
> **Date:** 2026-07-05
> **Role:** Frontend Product Engineer / UI Implementation Owner
> **Binding inputs:** `FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_PLAN.md` (M15C-E1), `MIDTRANS_SANDBOX_SNAP_WEBHOOK_SETTLEMENT.md` (M15C-D), `MIDTRANS_PROVIDER_CONTRACT_FREEZE.md` (M15C-B), `PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md` (M15C-A)
>
> **Validation note: No lint/build/browser/API validation was run by Claude Fable 5. Validation is deferred to M15C-E2B Codex.** GitLab Duo has no shell access.
> **No backend source was modified. No mockup file was modified.**
> **Manual payment proof (M12) is preserved as the fallback path.**
> **Redirect/return never marks an invoice paid** — paid status is displayed only from the backend payment-status endpoint (webhook-settled).
> **No Midtrans server key, client key, or raw provider payload is present in any frontend file or env.** No production Midtrans keys were added.
> **No Smart Lock change.** **Payment Gateway remains staging/sandbox — NOT production-ready.**

---

## 1. Files Changed

**Penghuni (`apps/penghuni/`):**

| File | Change |
| --- | --- |
| `src/hooks/usePaymentGateway.ts` | **New.** `useCreatePaymentSession`, `useInvoicePaymentStatus` (bounded polling), `isPaymentSessionExpired`, `paymentErrorCode` / `paymentErrorMessage` (safe Indonesian copy map) |
| `src/lib/query-client.ts` | Added `qk.penghuni.billingPaymentStatus(invoiceId)` query key |
| `src/routes/_app/billing.tsx` | Added `OnlinePaymentCard` (states A–F), gated manual proof visibility when paid, updated manual-proof helper copy, sessionStorage return-flag helpers |

**Admin (`apps/admin/`):**

| File | Change |
| --- | --- |
| `src/hooks/usePaymentTransactions.ts` | **New.** `usePaymentTransactions` (list, defensive array/`items`/`data` normalization, `enabled` option), `usePaymentTransactionDetail` |
| `src/routes/payments.tsx` | New **"Online"** tab with `GatewayTransactionTable`, `PaymentTransactionDetailDialog`, status/source badge maps, `isForbiddenError` (403 → `ForbiddenState`) |

**Docs:**

| File | Change |
| --- | --- |
| `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` | This document |
| `docs/README.md` | Index entry for M15C-E2A |

**Not changed:** any `backend/` file, any `mockup/` file, `packages/api-client` (frozen per ADR-FE-001), `packages/domain`, any env file. No new env variable was added (no client key env).

## 2. Penghuni UX Implemented

All states live in `OnlinePaymentCard` on the existing billing page, following the card style of the mockup/app:

- **A — Unpaid, no active attempt:** primary CTA **"Bayar Online"** (gradient button), secondary **"Upload Bukti Manual"** (scrolls to the existing manual proof card), helper text "Pembayaran online diproses melalui halaman pembayaran aman."
- **B — Pending:** badge **"Menunggu Pembayaran Online"**; copy "Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi."; **"Lanjutkan Pembayaran"** (only while `paymentUrl` exists and `expiresAt` not passed) and **"Cek Status Pembayaran"** (manual refetch + restarts bounded polling); manual proof stays visible below with explicit fallback wording.
- **C — Post-return:** a sessionStorage flag (`kst-payment-return-{invoiceId}`) is set before opening `paymentUrl`; on return, the pending state additionally shows "Pembayaran sedang dikonfirmasi. Silakan tunggu beberapa saat atau tekan Cek Status." and polling starts automatically. **The flag/redirect never sets paid** — only backend data does.
- **D — Paid:** badge **"Lunas"**, `paidAt` shown when available, source label **"Dibayar via Pembayaran Online"** (gateway `paid`) or **"Diverifikasi Manual"** (invoice paid without gateway-paid transaction). "Bayar Online" is not rendered and the **manual proof card is hidden** (`onPaidChange` → `gatewayPaid` in `BillingPage`); invoice lists are invalidated so the invoice moves to history.
- **E — Failed/expired/cancelled/denied:** badge "Pembayaran Gagal" / "Kadaluarsa" / "Dibatalkan", copy "Pembayaran gagal. Anda dapat mencoba kembali atau menggunakan pembayaran manual.", retry via **"Bayar Online"** (backend mints a new attempt); manual proof remains fallback.
- **F — Requires review/challenge/unknown:** badge **"Perlu Tinjauan"**, copy "Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah.", "Cek Status Pembayaran" available; never shown as paid.
- If the status endpoint returns `PAYMENT_GATEWAY_DISABLED` or `PAYMENT_CONFIG_MISSING`, the online card renders nothing and manual proof remains the visible path.
- Backend `safeMessage` is displayed when present (pending/failed/review states).

## 3. Admin UI Implemented

- New **"Online"** tab on the existing Payments page (`Tabs` pattern preserved; the manual **Verifikasi** tab and all verify/reject flows are unchanged).
- **Table columns:** Invoice, Penghuni, Jumlah, Sumber (badge **"Gateway"**), Provider, Status, Metode, Dibuat, Lunas, Aksi (Detail).
- **Gateway-paid rows:** status badge "Lunas" + chip **"Terkonfirmasi Otomatis"**; **no verify/reject buttons anywhere in this tab**; a caption clarifies webhook auto-confirmation vs manual proof verification.
- **`requires_review`/`challenge`/`unknown` rows:** badge **"Perlu Tinjauan"**; the detail dialog shows an advisory that manual admin follow-up is needed; no settlement action exists.
- **Detail dialog:** Sumber, Provider, `providerOrderId`, `providerTransactionId`, normalized status, Metode, Jumlah, Mata Uang, Dibuat/Kedaluwarsa/Lunas, Invoice — **normalized fields only**; no raw provider payload, signature, or key. Metadata blob is intentionally not rendered (see limitations).
- **403 (e.g. property owner)** renders `ForbiddenState`; other errors use `ErrorState` with retry; loading uses skeletons; empty state provided.

## 4. API Helpers / Hooks Added

**Penghuni `usePaymentGateway.ts`:**

- `useCreatePaymentSession()` — `POST /my/invoices/:invoiceId/payment-sessions` with idempotency key (existing `newIdempotencyKey` pattern); invalidates the payment-status query on success; toast on error via existing `toastMutationError`.
- `useInvoicePaymentStatus(invoiceId, { pollingStartedAt })` — `GET /my/invoices/:invoiceId/payment-status`; `refetchOnWindowFocus: true`; bounded `refetchInterval` (Section 5).
- Response type mirrors the provider-neutral M15C-B contract (`invoiceId`, `invoiceStatus`, `paymentStatus`, `provider`, `providerOrderId`, `paymentUrl`, `snapToken`, `expiresAt`, `paidAt`, `safeMessage`) with all fields optional/nullable for defensiveness.
- Error copy map for `PAYMENT_GATEWAY_DISABLED`, `PAYMENT_CONFIG_MISSING`, `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_INVOICE_ALREADY_PAID`, `PAYMENT_TRANSACTION_PENDING`, `PAYMENT_TRANSACTION_EXPIRED`, `PAYMENT_STATUS_REQUIRES_REVIEW`, `PAYMENT_UNKNOWN_PROVIDER_ERROR`; unknown codes fall back to the generic safe message. Raw error bodies are never rendered.

**Admin `usePaymentTransactions.ts`:**

- `usePaymentTransactions({ limit, offset }, { enabled })` — `GET /admin/payment-transactions`; tolerates plain-array or `{ items }`/`{ data }` wrappers; fetch enabled only while the Online tab is active.
- `usePaymentTransactionDetail(id)` — `GET /admin/payment-transactions/:id`.
- All record fields except `id`/`status` are optional/nullable; the UI renders "-" fallbacks. No `property_id` query param is sent (server-side scoping assumed; confirm in E2B).

## 5. Post-Return and Polling Behavior

- **Opening payment:** on "Bayar Online" success, if `paymentUrl` exists the app sets the return flag and navigates **same-tab** (`window.location.assign`) — the PWA-safe choice from M15C-E1. "Lanjutkan Pembayaran" reuses the same mechanism.
- **Snap.js path:** if only `snapToken` is returned (no `paymentUrl`), the UI shows a safe notice ("Pembayaran online belum dapat dibuka di aplikasi ini...") — **Snap.js integration is not enabled in this milestone** and no client key env was added.
- **On return/load/focus:** the status query refetches on mount and window focus; if the return flag is present, the confirming copy shows and polling starts.
- **Bounded polling:** 5 s intervals for the first minute, then 15 s, stopping after ~5 minutes or on a terminal status (`paid`/`failed`/`expired`/`cancelled`/`denied`/`challenge`/`requires_review`/`unknown`). "Cek Status Pembayaran" refetches immediately and restarts the polling window.

## 6. Manual Proof Compatibility

- `POST /my/payment-proofs` flow, components, and admin verify/reject are **unchanged**.
- Manual proof card remains rendered for unpaid invoices (secondary/fallback position, below the online card) including while a gateway attempt is pending, matching current backend behavior.
- When the backend reports the invoice paid, the manual proof card is hidden (backend paid-guard `PAYMENT_INVOICE_ALREADY_PAID` remains the authority).
- Only the stale helper sentence inside the manual card was updated ("payment gateway akan ditangani di milestone berikutnya" → online payment is now the primary path; manual remains fallback).

## 7. Security / No-Secret Boundary

- No server key, client key, webhook secret, signature, or Basic auth value appears in any frontend file, env, or rendered output.
- No new env variable was added; `lib/env.ts` untouched.
- Only provider-neutral normalized fields are rendered; raw provider payloads and raw error bodies are never displayed.
- All requests go through the existing authenticated `apiClient` (ADR-FE-001/003 pattern); no direct `fetch()` in routes.
- Backend remains the final policy authority; all frontend checks are UX-only.

## 8. Known Limitations

1. **Backend response field names are assumed** from the M15C-B contract (`invoiceCode`/`residentName` display fields may not exist on the admin list); UI renders "-" fallbacks. Confirm exact shapes in M15C-E2B and tighten types.
2. **Admin list pagination/filtering UI** is not implemented (fixed `limit=100`); DTO capabilities to be confirmed in E2B.
3. **Snap.js popup mode is not enabled** (paymentUrl-first per plan); adopting it later requires the client key publishable decision + env approval.
4. **Sanitized metadata** is not rendered in the admin detail dialog (deliberately conservative until the shape is confirmed safe).
5. **Obsolete manual proof after gateway settlement** is a backend follow-up (M15C-D Section 13); Admin UI only carries an informational caption.
6. Timestamps render date-only via the existing `formatDate` helper; time-of-day display can be refined in E2B if needed.
7. `usePaymentTransactions` does not send `property_id`; if the backend DTO requires it, E2B adds it.

## 9. Validation

> **No lint/build/browser/API validation was run by Claude Fable 5. Validation is deferred to M15C-E2B Codex.**

Suggested E2B checks: `lint:penghuni`, `lint:admin`, typecheck + build both apps, then the M15C-E1 Section 13 QA plan (browser) against VPS staging sandbox.

## 10. Next Milestone

**M15C-E2B — Codex validation:** lint/typecheck/build, response-shape confirmation (admin list/detail, penghuni status), browser QA per M15C-E1 Section 13, leakage scan (no secret/raw payload markers), then M15C-F end-to-end sandbox QA.
