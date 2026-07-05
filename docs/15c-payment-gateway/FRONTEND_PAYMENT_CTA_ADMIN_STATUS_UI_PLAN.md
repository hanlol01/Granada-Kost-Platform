# M15C-E1 — Frontend Payment CTA / Admin Status UI UX Plan

> **Milestone:** M15C-E1 (planning / documentation only — no implementation, no QA execution)
> **Date:** 2026-07-05
> **Role:** Frontend Product / UX Architecture Reviewer
> **Status:** UX plan recorded; implementation contract for M15C-E2 (Codex)
> **Binding inputs:** `docs/15c-payment-gateway/PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md` (M15C-A), `docs/15c-payment-gateway/MIDTRANS_PROVIDER_CONTRACT_FREEZE.md` (M15C-B), `docs/15c-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` (M15C-C), `docs/15c-payment-gateway/MIDTRANS_SANDBOX_SNAP_WEBHOOK_SETTLEMENT.md` (M15C-D), `docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md` (M15B-A), `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` (M14F)
> **Frontend/mockup awareness (inspected, not modified):** `mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx`, `mockup/Console Admin KOST/`, `apps/penghuni/src/routes/_app/billing.tsx`, `apps/penghuni/src/hooks/usePenghuniBilling.ts`, `apps/admin/src/routes/payments.tsx`, `apps/admin/src/hooks/useBilling.ts` / `useBillingMutations.ts`, `apps/admin/src/components/status-badge.tsx`
>
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal/browser command was run for M15C-E1. GitLab Duo has no shell access; all cited validation results were produced earlier and externally and are referenced from committed documents.
> **Payment Gateway remains staging/sandbox only — NOT production-ready.** M14F production verdict is unchanged.
> **Manual payment proof (M12) is NOT removed** — it remains the fallback path.
> **No mockup file is changed by this plan.** No source code is implemented.
> **The Midtrans server key never reaches the frontend.** No provider-specific UI lock-in beyond labels needed for staging.

---

## 1. Executive Summary

- Backend Midtrans Sandbox **Snap session creation + signed webhook settlement is ready and validated on VPS staging** (M15C-D PASS): the backend returns `snapToken`/`paymentUrl`, and only a verified webhook marks an invoice paid.
- **Frontend implementation is the next step (M15C-E2).** This document is its UX/implementation contract.
- The UI must follow the **existing Penghuni billing mockup style** (card-based, mobile-first, Bahasa Indonesia) and the **existing Admin console patterns** (table + dialog + status badge, property-scoped hooks).
- **Manual payment proof remains the fallback** — visually secondary, never removed.
- **The webhook is the source of truth**; the redirect/return URL is UX only and never marks paid.
- **Payment Gateway remains staging/sandbox, not production-ready.**

## 2. Scope and Non-Scope

**Scope (planned by this document):**

- Penghuni billing online payment CTA ("Bayar Online").
- Snap/payment session open behavior.
- Payment pending / paid / failed / expired / requires-review UI states.
- Manual proof fallback UX alongside online payment.
- Post-redirect/return messaging.
- Payment status refresh/polling behavior.
- Admin payment transaction list/detail UI.
- Gateway/Manual source badges.
- Safe error messages (Indonesian copy + error mapping).
- Implementation component/page mapping for M15C-E2.

**Non-scope (hard exclusions):**

- No backend implementation; no webhook changes.
- No production Midtrans activation; sandbox/staging only.
- No refund automation UI (refund/chargeback stays admin review per M15C-B/D).
- No accounting/reconciliation module.
- No Smart Lock changes (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false` unchanged).
- No CCTV work.
- No production release claim of any kind.

## 3. Binding Frontend Rules

1. **Never mark an invoice paid from redirect/return.** Paid state is displayed only after the backend reports it (webhook-settled).
2. **Always refresh/poll the backend payment status** after returning from the payment page and on billing page load.
3. **Hide/disable all payment CTAs when the invoice is paid** (both "Bayar Online" and manual proof upload — backend also enforces `PAYMENT_INVOICE_ALREADY_PAID`).
4. **Manual proof remains visible as fallback** while the invoice is unpaid (secondary emphasis).
5. **Gateway-paid invoices need no manual verification** — Admin shows them as auto-confirmed; verify/reject stays only on manual proofs.
6. **No server key in the frontend** — not in env, bundle, code, or network responses.
7. **No raw provider payload in the frontend** — only the provider-neutral normalized response fields (Section 5).
8. **Provider-neutral wording**: "Pembayaran Online" / "Gateway" in primary UI; the provider name (`midtrans`) may appear only in the Admin detail view.
9. **Keep UI consistent with the mockup and existing styling**: Penghuni card/gradient/rounded-2xl style, existing `LoadingState`/`EmptyState`/`ErrorState`, Admin table/dialog/badge kit.
10. Frontend validation is UX-only; the backend remains the final policy authority.

## 4. Penghuni Billing UX Plan (State Machine)

State is derived from `GET /my/invoices/:invoiceId/payment-status` (`invoiceStatus` + `paymentStatus`) — never from local navigation events.

**A. Unpaid invoice, no active gateway attempt** (`invoiceStatus=issued`, no `pending` transaction)

- Show invoice amount, breakdown, due date, and status (existing `CurrentBillCard`).
- **Primary CTA: "Bayar Online"** (gradient primary button, same placement as the mockup "Bayar {amount}" CTA).
- **Secondary CTA: "Upload Bukti Manual"** (existing M12C3 flow, visually secondary — link-style or outline button below the primary CTA).
- Helper text: **"Pembayaran online diproses melalui halaman pembayaran aman."**

**B. Gateway session created / pending** (`paymentStatus=pending`, active attempt)

- Status badge: **"Menunggu Pembayaran Online"**.
- Copy: **"Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi."**
- Actions:
  - **"Lanjutkan Pembayaran"** — shown while `paymentUrl`/`snapToken` is still active (`expiresAt` in the future); reopens the same session (backend reuses the active attempt).
  - **"Cek Status Pembayaran"** — manual refresh action triggering a status refetch.
- Manual proof remains available as fallback (current backend allows it while gateway is pending — M15C-D Section 10); keep it **secondary** with an explanation: "Gunakan hanya jika Anda membayar di luar pembayaran online." If product later decides to hide it during pending, only this block changes.

**C. After redirect/return** (user lands back on `/billing`; return URL is `https://app.kostation.web.id/billing` on staging)

- **Do not show paid immediately.**
- Show: **"Pembayaran sedang dikonfirmasi. Silakan tunggu beberapa saat atau tekan Cek Status."**
- Trigger an immediate status refetch on page load/focus, then short-lived polling (Section 6). If the webhook already settled, the state jumps straight to D.

**D. Paid invoice** (`invoiceStatus=paid`)

- Status badge: **"Lunas"**; show `paidAt` when available.
- **Hide/disable "Bayar Online".**
- **Hide/disable manual proof upload** (backend blocks it with `PAYMENT_INVOICE_ALREADY_PAID` anyway).
- Show payment source when derivable: **"Dibayar via Pembayaran Online"** (gateway `paid` transaction exists) or **"Diverifikasi Manual"** (settled by admin proof verification).

**E. Failed / expired / cancelled / denied** (`paymentStatus` ∈ `failed`/`expired`/`cancelled`/`denied`)

- Status badge: **"Pembayaran Gagal"** / **"Kadaluarsa"** / **"Dibatalkan"** (denied surfaces as "Pembayaran Gagal" with the safe message).
- Copy: **"Pembayaran gagal. Anda dapat mencoba kembali atau menggunakan pembayaran manual."**
- Allow a **new "Bayar Online" attempt** (backend mints a new session once no active pending attempt remains).
- Manual proof remains fallback.

**F. Requires review / challenge** (`paymentStatus` ∈ `requires_review`/`challenge`)

- Show: **"Pembayaran perlu ditinjau."** + **"Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah."**
- **Never mark paid.** No retry CTA by default (state may still resolve via a later verified webhook or admin review); manual proof stays available as fallback.

## 5. Penghuni API Integration Plan

**Endpoints (existing, M15C-C/D — no backend change):**

- `POST /api/v1/my/invoices/:invoiceId/payment-sessions` — create or reuse the active session.
- `GET /api/v1/my/invoices/:invoiceId/payment-status` — normalized status (poll target).
- `POST /api/v1/my/payment-proofs` — existing manual proof fallback, unchanged.

**Expected response fields (provider-neutral):** `invoiceId`, `invoiceStatus`, `paymentStatus`, `provider`, `providerOrderId`, `paymentUrl` (nullable), `snapToken` (nullable), `expiresAt` (nullable), `paidAt` (nullable), `safeMessage`. The frontend must tolerate nullable fields and must not depend on any additional/raw provider field.

**Interaction rules:**

- "Bayar Online" shows a **loading state** (spinner + "Memproses...") while the create-session request is in flight and is **disabled** during the request to prevent double-submit (backend `single_active` policy is the real guard).
- On create-session success: store nothing sensitive locally; open the payment page (Section 6); switch UI to state B.
- On error: map through the Section 11 table; show `safeMessage` from the backend when present, otherwise the mapped copy; never render raw error bodies.
- Handled error codes: `PAYMENT_GATEWAY_DISABLED`, `PAYMENT_CONFIG_MISSING`, `PAYMENT_INVOICE_ALREADY_PAID`, `PAYMENT_TRANSACTION_PENDING`, `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_TRANSACTION_EXPIRED`, `PAYMENT_STATUS_REQUIRES_REVIEW`, plus fallback `PAYMENT_UNKNOWN_PROVIDER_ERROR`.
- Follow the existing hook pattern (`usePenghuniBilling`-style TanStack Query hooks); no direct `fetch()` in routes.

## 6. Snap / Payment Opening Behavior

**Recommended v1 behavior (staging-stable, simplest):**

1. **If `paymentUrl` exists (backend confirms it does on staging — M15C-D): open `paymentUrl`.** Recommended: **same-tab navigation** on the mobile-first Penghuni PWA (most reliable inside installed PWA/webview; popup blockers avoided). New-tab is acceptable for desktop; the implementer picks ONE consistent behavior and documents it (open question 2).
2. **If only `snapToken` exists**: Snap.js (`snap.pay(snapToken)`) integration is required — this needs the Midtrans **client key** in frontend config. Only do this if: (a) the client key is confirmed publishable per Midtrans docs, and (b) a frontend env (`VITE_MIDTRANS_CLIENT_KEY` or equivalent) is explicitly approved. **Never the server key.** For v1, prefer path 1 and defer Snap.js unless product wants the in-app popup UX.
3. After opening the payment page, the UI **enters pending state (B)** immediately.
4. **Return URL** lands back on the Penghuni billing page (`PAYMENT_RETURN_URL=https://app.kostation.web.id/billing` on staging).
5. **Billing page refreshes payment status on load/mount and on window focus.**

**Polling recommendation (v1):** after returning (or after opening payment), poll `payment-status` every **5 seconds for the first minute, then every 15 seconds, stopping after ~5 minutes** or when a terminal state (`paid`/`failed`/`expired`/`cancelled`/`denied`/`requires_review`) is reached; always offer the manual "Cek Status Pembayaran" button. Exact numbers may be tuned at M15C-E2 (open question 5) — the binding rule is: bounded polling + manual refresh, never assume paid.

## 7. Admin Payment Status UI Plan

**List (extends the existing Payments page pattern — table + dialogs):**

| Column | Content |
| --- | --- |
| Invoice | Invoice reference/period |
| Penghuni | Resident name if allowed by existing scoped response (UI term is "Penghuni", never "tenant") |
| Jumlah | Amount (IDR) |
| Sumber | Badge: **"Gateway"** / **"Manual"** |
| Provider | e.g. `midtrans` (plain text, detail-level info) |
| Status | Normalized status badge |
| Metode | Normalized method label, nullable |
| Dibuat | `createdAt` |
| Lunas | `paidAt`, nullable |
| Aksi | "Detail" button → detail dialog |

**Detail view (dialog/modal, existing console dialog style):**

- `providerOrderId`, `providerTransactionId` (if available), normalized status, payment method, amount/currency, timestamps (created/paid/expires), safe metadata only. **No raw provider payload, no signatures, no keys.**

**Row behavior:**

- **Gateway-paid rows**: no verify/reject buttons; label **"Terkonfirmasi Otomatis"**.
- **Manual proof rows**: keep the existing M12C5 verify/reject flow unchanged (PendingProofList + PaymentProofReviewDialog).
- **`requires_review` rows**: badge **"Perlu Tinjauan"**; no settlement action in v1 (backend offers none); optional helper text pointing to manual follow-up.
- Note for admins (docs/tooltip level): a pending manual proof may become unnecessary after gateway settlement — the invoice paid-guard blocks double settlement; automatic proof obsolescence is a known backend follow-up (M15C-D Section 13).

## 8. Admin API Integration Plan

**Endpoints (existing — no backend change):**

- `GET /api/v1/admin/payment-transactions` — list (query params per existing `list-payment-transactions-query.dto.ts`).
- `GET /api/v1/admin/payment-transactions/:id` — detail.
- Existing manual proof admin routes remain unchanged.

**Error handling (reuse existing console state components):**

| Case | UI behavior |
| --- | --- |
| 401 unauthorized | Existing auth guard/redirect-to-login behavior |
| 403 forbidden / scoped denial (e.g. property owner) | `ForbiddenState` — no data leakage, no retry loop |
| 404 not found (detail) | `ErrorState` with "Transaksi tidak ditemukan" |
| Provider data unavailable / 5xx | `ErrorState` with retry; generic copy, no internals |
| Any response | Never render raw provider payload, keys, or signatures |

## 9. Visual / Mockup Alignment

- **Penghuni**: keep the card-based mobile layout from `mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx` — gradient bill summary card, rounded-2xl cards, soft shadows, bottom-anchored primary CTA styling. The mockup's **instant-success simulation must NOT be replicated**; paid arrives only via backend status. The mockup **method selector (QRIS/Transfer Bank/E-Wallet)** is not implemented as functional provider UI in v1 — method choice happens on the provider payment page; if visual continuity is desired, replace it with a passive hint: **"Metode pembayaran dipilih di halaman pembayaran."** (Mockup files themselves are not modified.)
- **Status badges**: clear, color-coded (pending=warning, paid=success, failed/expired=destructive/muted, review=attention), consistent with existing badge styles in both apps.
- **Primary CTA placement** mirrors the mockup payment CTA position; **manual proof is secondary/fallback**, never competing equally with "Bayar Online".
- **Admin** follows the existing console table/detail/dialog style (`payments.tsx`, shadcn table + dialog + `status-badge.tsx`); gateway details live in the **detail modal**, not as extra main-table clutter.

## 10. UX Copy (Indonesian — FROZEN for v1)

| Key | Copy |
| --- | --- |
| Primary CTA | "Bayar Online" |
| Secondary CTA | "Upload Bukti Manual" |
| Pending badge | "Menunggu Pembayaran Online" |
| Pending reassurance | "Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi." |
| Post-return | "Pembayaran sedang dikonfirmasi. Silakan tunggu beberapa saat atau tekan Cek Status." |
| Failure/retry | "Pembayaran gagal. Anda dapat mencoba kembali atau menggunakan pembayaran manual." |
| Review | "Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah." |
| Continue payment | "Lanjutkan Pembayaran" |
| Check status | "Cek Status Pembayaran" |
| Online helper | "Pembayaran online diproses melalui halaman pembayaran aman." |
| Paid badge | "Lunas" |
| Paid source (gateway) | "Dibayar via Pembayaran Online" |
| Paid source (manual) | "Diverifikasi Manual" |
| Admin auto-confirmed | "Terkonfirmasi Otomatis" |
| Admin review badge | "Perlu Tinjauan" |
| Admin source badges | "Gateway" / "Manual" |

## 11. Error UX Mapping

| Error code | User message (ID) | UI behavior |
| --- | --- | --- |
| `PAYMENT_GATEWAY_DISABLED` | "Pembayaran online belum tersedia." | Hide/disable "Bayar Online"; manual proof remains the visible path |
| `PAYMENT_CONFIG_MISSING` | "Pembayaran online sedang tidak tersedia. Coba lagi nanti." | Generic unavailable state; manual proof remains; no internals shown |
| `PAYMENT_PROVIDER_UNAVAILABLE` | "Layanan pembayaran sedang gangguan. Coba lagi nanti." | Toast/inline error + retry allowed; manual proof suggested |
| `PAYMENT_INVOICE_ALREADY_PAID` | "Tagihan sudah lunas." | Refetch status; switch to paid state D; hide CTAs |
| `PAYMENT_TRANSACTION_PENDING` | "Masih ada pembayaran online yang sedang menunggu." | Switch to pending state B; show "Lanjutkan Pembayaran" / "Cek Status Pembayaran" |
| `PAYMENT_TRANSACTION_EXPIRED` | "Sesi pembayaran kedaluwarsa. Buat sesi pembayaran baru." | Show retry CTA (new attempt); state E |
| `PAYMENT_STATUS_REQUIRES_REVIEW` | "Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah." | State F; no paid display; no auto-retry |
| `PAYMENT_UNKNOWN_PROVIDER_ERROR` | "Terjadi kendala pada layanan pembayaran. Coba lagi nanti." | Generic error + retry; manual proof suggested; never render raw details |

When the backend supplies `safeMessage`, prefer it over the static copy; never display raw error bodies, stack traces, or provider payloads.

## 12. Implementation Mapping for M15C-E2

Likely files (confirmed by repo inspection unless noted; **implementer must confirm exact paths before coding**):

**Penghuni (`apps/penghuni/`):**

- `src/routes/_app/billing.tsx` — add CTA pair, pending/paid/failed/review states, post-return handling (extends existing `CurrentBillCard` + `ManualPaymentProofUpload` composition).
- `src/hooks/usePenghuniBilling.ts` — extend, or add a sibling `usePaymentSession.ts` / `usePaymentStatus.ts` hook following the same TanStack Query pattern (create-session mutation, status query with polling).
- `src/lib/env.ts` — only if a publishable client key env is approved (Snap.js path; otherwise untouched).
- `src/routes/_app/index.tsx` — optional: reflect "Menunggu Pembayaran Online" on the home Tagihan Aktif card (nice-to-have, confirm scope).

**Admin (`apps/admin/`):**

- `src/routes/payments.tsx` — add gateway transaction table/section + source badges alongside the existing manual proof review UI.
- `src/hooks/` — new `usePaymentTransactions.ts` (list + detail queries), following `useBilling.ts` conventions.
- `src/components/status-badge.tsx` — extend variants for gateway payment statuses if needed.
- Detail dialog — new component following `PaymentProofReviewDialog` / `ConfirmDialog` patterns.

**Shared:**

- `packages/api-client` is **frozen (ADR-FE-001/M11B)** — do not modify; use the per-app hook + `lib/api.ts` pattern already used by M12 features.
- `packages/domain` — add shared payment status/response types **only if** the existing convention for M12 types supports it; otherwise define types locally per app. Implementer confirms.

No mockup file is modified. No backend file is modified.

## 13. QA Plan for M15C-F (executed externally — never by documentation agents)

**Penghuni:**

- Unpaid invoice shows "Bayar Online" (primary) and "Upload Bukti Manual" (secondary).
- "Bayar Online" creates a session and opens the Snap/payment URL; UI enters "Menunggu Pembayaran Online".
- Returning via redirect does **not** show paid; post-return copy shown; status refetch triggered.
- After a valid sandbox webhook settlement, status becomes "Lunas" (via polling or manual "Cek Status").
- Expired/failed attempt allows a new "Bayar Online" attempt.
- Paid invoice hides/disables both CTAs; paid source label correct.
- Manual proof fallback still works end-to-end for an unpaid invoice (M12 regression).
- `requires_review`/`challenge` shows review copy and never paid.

**Admin:**

- Gateway transaction appears in the list with correct data.
- "Gateway" / "Manual" source badges are correct.
- Gateway-paid row shows "Terkonfirmasi Otomatis" and has no verify/reject buttons.
- Manual proof rows retain working verify/reject.
- `requires_review` rows visible with "Perlu Tinjauan".
- Property owner denied on admin transaction routes (403 → ForbiddenState).
- No secrets, signatures, or raw provider payloads in any rendered UI, network response surface, or console output (same leakage discipline as M14B/M14C).

## 14. Risks and Open Questions

1. **`paymentUrl` vs `snapToken`:** staging evidence (M15C-D) shows **both** are returned; v1 plan prefers `paymentUrl`. Confirm this holds for all Snap configurations used.
2. **New tab vs same tab:** recommendation is same-tab for the mobile PWA; confirm final choice (PWA/webview popup behavior is a QA risk for M15C-F).
3. **Is Snap.js needed?** Not for the `paymentUrl` path. Only if the in-app popup UX is wanted — then the client key exposure decision (4) must be made first.
4. **Frontend env for client key:** none needed in the recommended path; if Snap.js is adopted, a publishable-only env (e.g. `VITE_MIDTRANS_CLIENT_KEY`) must be explicitly approved and documented as publishable per Midtrans.
5. **Polling cadence:** recommended 5 s (first minute) → 15 s, stop at ~5 min or terminal state; tune at M15C-E2.
6. **Pending session reuse window:** staging expiry is 180 min (`PAYMENT_SESSION_EXPIRY_MINUTES`); UI treats `expiresAt` as authoritative — confirm UX for near-expiry sessions.
7. **Manual proof visibility during gateway pending:** currently allowed (backend permits it); confirm product keeps it visible-but-secondary.
8. **Admin pagination/filtering in v1:** the list DTO exists; confirm whether v1 UI needs filters (status/source/date) or a simple paginated table is enough.
9. **Obsolete manual proof after gateway settlement** is not automated in the backend — Admin UI can only inform, not resolve; follow-up milestone needed.

## 15. Acceptance Checklist

- [x] UX plan created (`docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_PLAN.md`).
- [x] Penghuni states defined (A–F state machine).
- [x] Admin states defined (list, detail, row behaviors).
- [x] API integration plan defined (Penghuni + Admin, existing endpoints only).
- [x] Snap/payment open behavior defined (paymentUrl-first, Snap.js conditional, pending on open, refresh on return).
- [x] Mockup alignment documented (card layout, CTA placement, method selector adaptation, no instant success).
- [x] Indonesian copy defined (Section 10).
- [x] Error mapping defined (Section 11).
- [x] M15C-E2 implementation mapping defined (Section 12, paths to be confirmed by implementer).
- [x] QA plan defined for M15C-F (Section 13).
- [x] No source implementation.
- [x] No production-ready claim.
- [x] Manual proof preserved as fallback.
