# M15C-A — Payment Gateway Architecture / Product Freeze

> **Milestone:** M15C-A (documentation / architecture freeze only — no implementation, no QA execution)
> **Date:** 2026-07-04
> **Role:** Kostation Product / Architecture Reviewer
> **Status:** Freeze recorded; binding for M15C-B through M15C-G unless superseded by an accepted revision
> **Binding inputs:** `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` (M14F), `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md` (M14A), `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` (M14D), `docs/00-project/PROJECT_MASTER.md`, `docs/00-project/ROADMAP.md`, `docs/00-project/PROJECT_HANDOFF.md`, `docs/00-project/INTERNAL_DEMO_CHECKLIST.md`, `docs/12-product-readiness/` (M12 file upload / payment proof docs), `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`
> **Code/mockup awareness (inspected, not modified):** `backend/api/src/modules/billing/` (controllers/services/repositories/constants — includes `payment_proof.submit`, `payment.verify`, `payment.reject` audit actions), `backend/api/src/modules/file/`, `apps/admin/`, `apps/penghuni/`, `mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx`, `mockup/Console Admin KOST/`
>
> This document contains **no real credentials, no merchant keys, no server/client keys**. All key names are env variable names only.
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal command was run for M15C-A. GitLab Duo has no shell access; all cited validation results were produced earlier and externally and are referenced from committed documents/artifacts.
> **Payment Gateway is NOT marked production-ready by this document.** Nothing here implements code.
> **Manual payment proof (M12) is NOT removed** — it remains the fallback path.
> **Architecture is NOT locked to Midtrans** — Midtrans Sandbox is the first adapter only.
> No ADR is changed. ADR-BE-FILE-001 and existing billing decisions remain binding.

---

## 1. Executive Summary

- Payment Gateway is the **next product feature** after the M14 release readiness track (M14F verdict: internal demo READY, production NOT READY).
- **Midtrans Sandbox** will be used for staging/demo integration — no production credentials in this track.
- The architecture **must remain provider-agnostic**: a `PaymentGatewayProvider` interface with Midtrans as the first adapter.
- **Manual payment proof (M12C3) remains available as the fallback** offline/manual path — unchanged.
- The **webhook is the backend source of truth** for automatic invoice paid status. Frontend redirects are UX only.
- **This milestone implements nothing.** Implementation starts at M15C-C after the provider contract freeze (M15C-B).

## 2. Scope and Non-Scope

**Scope (frozen by this document):**

- Provider-agnostic payment gateway architecture and layering.
- Midtrans (Sandbox) as first adapter.
- Invoice / payment transaction lifecycle and state model.
- Webhook contract (signature, idempotency, replay safety).
- Security and signature validation rules.
- Relationship with the manual payment proof fallback.
- Frontend UX contract aligned with the mockup and existing Admin/Penghuni patterns.
- Admin behavior (source labels, review rules).
- QA strategy and implementation milestone breakdown (M15C-B onward).

**Non-scope (hard exclusions):**

- No backend implementation. No frontend implementation. No source change of any kind.
- No real Midtrans credential (sandbox or production) anywhere in repo/docs.
- No production payment activation.
- No refund automation (manual/administrative refunds only until explicitly planned).
- No accounting/tax module. No payout/reconciliation module.
- No payment provider lock-in — Midtrans-only assumptions must stay inside the adapter.
- No removal or weakening of the manual payment proof flow.

## 3. Current Billing/Payment Baseline (M12/M14 state)

- Billing/invoice module exists (`backend/api/src/modules/billing/` — invoice create/issue/cancel, payment record/allocate, late-fee policy).
- Manual payment proof upload exists (M12C3): Penghuni submits proof via `POST /my/payment-proofs` with `file_ids` → proof enters `pending_review`.
- Admin payment proof review/preview exists (M12C5): authorized blob preview, verify/reject dialog.
- **Invoice is NOT auto-paid by proof upload** — admin verification is the sole manual settlement authority.
- File API (M12C1, ADR-BE-FILE-001) provides safe upload/preview: no `storage_path`, no public URLs, content only via `GET /files/:fileId/content`.
- M14B (API regression & security smoke) and M14C (browser regression) validated these flows — both PASS (2026-07-04).
- There is **no** `payment-gateway` module yet; this freeze plans it.

## 4. Payment Provider Architecture (Provider-Agnostic)

**Core rule: the billing domain never talks to a provider SDK/API directly.** All provider IO goes through an adapter behind a stable interface.

**Interface (conceptual, to be frozen in detail at M15C-B):**

- `PaymentGatewayProvider`
  - `createTransaction(input): { providerOrderId, paymentUrlOrToken, expiresAt }`
  - `parseAndVerifyWebhook(rawRequest): NormalizedPaymentEvent` (signature verification inside the adapter)
  - `getTransactionStatus(providerOrderId): NormalizedStatus` (for reconciliation/polling fallback)
  - `capabilities(): { methods, supportsExpiry, supportsCancel }`

**Adapters:**

- `MidtransProvider` — first adapter (Sandbox).
- Future providers may include **Xendit / DOKU / Duitku / others** — must be addable without changing the billing domain or the webhook route shape.

**Layering (suggested):**

| Layer | Responsibility |
| --- | --- |
| Billing/Invoice service | Invoice states, `paid_at`, settlement rules (existing) |
| Payment Gateway service | Orchestrates create/confirm; enforces amount/currency/idempotency; provider-neutral |
| Payment Transaction repository | `payment_transactions` persistence (PostgreSQL, system of record) |
| Provider adapter | Midtrans SDK/HTTP calls, signature validation, payload normalization |
| Webhook handler | Provider-neutral endpoint → adapter verify → idempotent state transition |
| Frontend payment CTA | "Bayar Online" + status display; never a source of truth |

**Isolation rules:**

- Controllers/services must not call the Midtrans SDK/HTTP directly — only through the adapter/service boundary.
- Raw provider payloads are never exposed to the frontend or stored unsanitized in API responses.
- Provider credentials are backend-only (Section 9/11).

## 5. Midtrans as First Provider (Sandbox)

- Use **Midtrans Sandbox** for staging/demo. Production credentials are different, out of scope for this track, and never committed.
- Payment UI approach: **Snap (hosted payment page/popup) or payment redirect URL** — final choice frozen at M15C-B; preference is backend-generated Snap token/redirect URL so the server key never leaves the backend.
- Store `provider_order_id` (our generated order ID sent to Midtrans) and `provider_transaction_id` (Midtrans transaction ID from notification).
- **Validate the notification signature** (Midtrans `signature_key`: SHA512 of `order_id + status_code + gross_amount + server_key`) inside the adapter before any state change.
- Handle webhook notifications **idempotently** (Section 8).
- **Never trust redirect/finish URLs as payment success** — only the verified webhook (or a verified status fetch) may mark paid.
- Do not store raw sensitive provider data in the frontend; frontend receives only the payment URL/token and normalized status.

## 6. Invoice and Payment Transaction Lifecycle

**Invoice states:** existing states are retained; the gateway adds/uses:

- `issued` (existing) → `payment_pending` (an active gateway attempt exists) → `paid`.
- `overdue`/`expired` and `cancelled`/`void` behave as already defined in billing; a gateway attempt does not suppress late-fee policy unless product decides otherwise (open question 6).

**Payment transaction states:**

`created` → `pending` → (`paid` | `failed` | `expired` | `cancelled` | `denied` | `challenge`*) ; `unknown/requires_review` for unmappable provider results.

*`challenge` applies to card fraud-review flows if enabled; treated as not-paid until upgraded by a subsequent verified notification.

**Frozen rules:**

1. One invoice may have **multiple payment attempts** (transactions); at most **one** may end `paid`.
2. Only one successful `paid` transaction marks the invoice paid; later attempts are rejected with `PAYMENT_INVOICE_ALREADY_PAID`.
3. Repeated webhooks must be **idempotent** — replays never double-pay or flip states backward.
4. **Amount must match** the invoice amount exactly; **currency must match** (IDR). Mismatch → `requires_review`, never paid.
5. `invoice.paid_at` is set **only** by (a) a verified gateway webhook, or (b) authorized admin manual verification of a payment proof (existing M12 path).
6. Frontend redirect success is **UX only** — never a source of truth.

## 7. Manual Payment Proof Fallback (Preserved)

- Payment gateway is the **primary online path when enabled** (`PAYMENT_GATEWAY_ENABLED=true`).
- Manual payment proof **remains the fallback** for: offline/bank transfer, gateway outage, tenants who cannot use online payment, and admin-assisted payment.
- Manual proof keeps its M12 behavior: enters `pending_review`; **does not auto-pay**; admin verification remains required.
- If the invoice is **already paid by gateway**: manual proof submission is **blocked** with a clear message ("Tagihan sudah lunas") — blocked is safer than "marked unnecessary" because it prevents orphaned reviews.
- If a **manual proof is pending review**: online payment **remains allowed** (recommended rule). Rationale: blocking online payment on an unverified proof lets a bad/blurry upload delay settlement; the invoice-paid guard (rule 2 above) already prevents double settlement — whichever path confirms first wins, and the other is rejected/auto-obsoleted with an admin-visible note. Final confirmation at M15C-B (open question 5).
- If a **gateway attempt is pending**: manual proof upload remains allowed but the UI shows the pending online payment first to avoid confusion.

## 8. Webhook Contract

- **Endpoint (frozen, provider-neutral):** `POST /api/v1/payment-gateways/:provider/webhook` (first concrete route: `/api/v1/payment-gateways/midtrans/webhook`).
- **Signature validation required** before any processing (adapter-level; Midtrans `signature_key` verification).
- **Idempotency required**: dedupe on provider event identity (`provider_order_id` + status + `payload_hash`); duplicates return success without state change and are logged as `PAYMENT_WEBHOOK_DUPLICATE`.
- **Replay safe**: reprocessing an already-applied event must be a no-op; out-of-order events must not regress a `paid` state.
- **Validation required**: amount, currency, order-ID→invoice mapping, and transaction existence.
- **Unknown invoice/order ID**: never marks anything paid; logged + `requires_review` bucket.
- **Suspicious mismatch** (amount/currency/status conflict): `unknown/requires_review` + audit event; never auto-paid.
- **Webhook responses must not leak internals**: respond with minimal acknowledgment; no stack traces, no entity dumps, no config.
- **Raw payload storage policy (frozen for now): store minimal sanitized metadata only** (normalized status, IDs, amount, `payload_hash`), not the full raw payload. Encrypted raw-payload audit storage may be revisited when a production audit requirement exists (open question 7).

## 9. Security Rules

- **Midtrans server key: backend-only.** Never in frontend env, bundles, repo, docs, or logs.
- **Client key**: only if the chosen frontend SDK strictly requires it and it is provider-documented as publishable; preference is **backend-generated payment URL/Snap token** so no provider key ships to the frontend.
- No real keys of any kind in docs/repo — env variable **names** only.
- Webhook signature validation mandatory (Section 8).
- Amount/currency matching mandatory before paid transition.
- **Property scope** enforced on all user-facing invoice/payment reads (existing billing rules).
- **Resident can only pay their own invoice** (self-scope enforced backend-side).
- Admin actions are RBAC + property-scoped (existing patterns).
- All payment events audited (Section 14).
- No raw provider payload in any API response; normalized fields only.
- No PII overexposure: payment records expose only what the UI needs (amount, status, method label, timestamps).

## 10. Frontend UX Contract (Aligned with Mockup)

**Mockup reference:** `mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx` ("Tagihan & Pembayaran") shows: bill summary card with breakdown and due date, a **payment method selector (QRIS / Transfer Bank / E-Wallet)**, a single primary **"Bayar {amount}"** CTA with processing state, and a payment history list with paid filter. The mockup simulates instant success — the real flow must NOT do that: paid status arrives only after webhook confirmation. The Admin mockup (`mockup/Console Admin KOST/`) follows the existing console patterns used by `apps/admin`.

**Penghuni UX (contract):**

- Tagihan page shows invoice amount, breakdown, due date, and status — as in the mockup.
- **Primary CTA: "Bayar Online"** (with method selection if Snap is not used; if Snap is used, method choice happens inside Snap).
- **Secondary/fallback CTA: "Upload Bukti Pembayaran Manual"** (existing M12C3 flow, kept visible but visually secondary).
- When the gateway is enabled:
  - Clicking "Bayar Online" calls the backend to create a payment transaction.
  - The user receives the Midtrans Snap token / payment URL from the backend.
  - UI shows a **pending payment state** after the session is created.
  - After redirect/return to the app, the UI states that status updates after confirmation — exact copy: **"Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi."**
  - The invoice becomes paid only after the backend confirms the webhook.
- If payment is pending: show "Menunggu Pembayaran Online" state; allow retry/new attempt only when the previous attempt is `expired`/`failed`/`cancelled`; never show duplicate competing CTAs.
- If the invoice is paid: hide/disable both payment CTAs; show paid status and paid date.

**Admin UX (contract):**

- Payments list shows a **source column/badge: "Gateway" / "Manual"**.
- Gateway-paid invoices need **no manual verification** (webhook already settled them); manual proofs keep verify/reject.
- Admin can inspect payment transaction status (normalized status, method label, timestamps, provider-neutral).
- Labels are **provider-neutral** where possible ("Pembayaran Online", not "Midtrans") — provider name may appear in a detail field.
- Admin never sees secrets or raw provider payloads.

**Proposed UX improvements (proposal only — NOT implemented in M15C-A):**

- Status badge: **"Menunggu Pembayaran Online"** on invoice cards.
- Button pair: **"Bayar Online"** (primary) + **"Upload Bukti Manual"** (secondary link/button).
- A compact **payment status timeline** on invoice detail (created → pending → paid/failed/expired).
- Admin **source badge: Gateway / Manual** in the payments table and detail dialog.
- Reassurance copy after redirect: "Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi."
- Retry affordance on expired/failed attempts ("Buat sesi pembayaran baru").

## 11. Config / Env Strategy

**Backend env (names only — values never committed):**

| Variable | Default / rule |
| --- | --- |
| `PAYMENT_GATEWAY_PROVIDER` | `none` (or `midtrans` when enabled) |
| `PAYMENT_GATEWAY_ENABLED` | **`false` by default** in every environment |
| `MIDTRANS_ENV` | `sandbox` \| `production` — sandbox first; production out of scope |
| `MIDTRANS_SERVER_KEY` | Backend-only; secret manager / uncommitted `.env` |
| `MIDTRANS_CLIENT_KEY` | Only if strictly required by the chosen frontend approach |
| `MIDTRANS_WEBHOOK_SECRET` | Or signature method per Midtrans contract (signature_key uses server key) |
| `PAYMENT_RETURN_URL` | Post-payment return/finish URL |
| `PAYMENT_CANCEL_URL` | Cancel/back URL |
| `PAYMENT_WEBHOOK_BASE_URL` | Public base URL registered at the provider dashboard |

**Rules:** default disabled; sandbox first; production keys never committed; fail-fast `PAYMENT_CONFIG_MISSING` when provider is enabled without required config; frontend env only if strictly necessary and provider-documented as safe; **no server key in frontend, ever** (mirrors the Smart Lock env posture).

## 12. Database / Model Planning (Minimal)

**`payment_transactions` (new):**

| Column | Notes |
| --- | --- |
| `id` | PK |
| `invoice_id` | FK → invoices |
| `property_id` | Scope enforcement |
| `resident_id` / `user_id` | Initiator |
| `provider` | e.g. `midtrans` |
| `provider_order_id` | Our order ID sent to provider; unique |
| `provider_transaction_id` | Nullable until notification |
| `amount` | Must equal invoice amount |
| `currency` | `IDR` |
| `status` | Section 6 states |
| `payment_method` | Nullable, normalized label (qris/bank_transfer/ewallet/card) |
| `payment_url` / `snap_token_ref` | Nullable; store only if safe (token reference, not credentials) |
| `expires_at` | Nullable |
| `paid_at` / `failed_at` | Nullable |
| `raw_status_code` | Sanitized provider status code, nullable |
| `metadata` | Sanitized JSONB (no secrets, no PII beyond need) |
| `created_at` / `updated_at` | Timestamps |

**`webhook_events` (optional but recommended):**

`id`, `provider`, `event_id` or signature hash, `provider_order_id`, `received_at`, `processed_at`, `status` (accepted/duplicate/rejected/requires_review), `normalized_result`, `payload_hash`, `sanitized_metadata`.

**Rule:** no secrets stored anywhere; PostgreSQL remains the system of record; Redis only for idempotency locks/rate limiting.

## 13. Error / Status Normalization

| Code | Meaning |
| --- | --- |
| `PAYMENT_GATEWAY_DISABLED` | Feature flag off — fail-closed, returned before provider IO |
| `PAYMENT_PROVIDER_UNAVAILABLE` | Provider unreachable/timeout |
| `PAYMENT_CONFIG_MISSING` | Provider enabled without required config (fail-fast) |
| `PAYMENT_INVOICE_NOT_FOUND` | Invoice missing / out of scope |
| `PAYMENT_INVOICE_ALREADY_PAID` | Paid invoice; new attempts/proofs blocked |
| `PAYMENT_AMOUNT_MISMATCH` | Webhook/attempt amount ≠ invoice amount |
| `PAYMENT_SIGNATURE_INVALID` | Webhook signature verification failed |
| `PAYMENT_WEBHOOK_DUPLICATE` | Replayed event; acknowledged, no state change |
| `PAYMENT_TRANSACTION_EXPIRED` | Session/attempt expired |
| `PAYMENT_TRANSACTION_FAILED` | Provider reported failure |
| `PAYMENT_PROVIDER_REJECTED` | Provider denied (e.g. `deny`) |
| `PAYMENT_UNKNOWN_PROVIDER_ERROR` | Unmappable provider result → requires_review path |

## 14. Audit and Observability

**Audit events (extends existing `BILLING_AUDIT_ACTIONS` style):**

- `payment.transaction.created` / `payment.transaction.pending` / `payment.transaction.paid` / `payment.transaction.failed` / `payment.transaction.expired`
- `payment.webhook.received` / `payment.webhook.rejected`
- `payment.invoice.mark_paid_gateway`
- `payment.manual_proof.submitted` / `payment.manual_proof.verified` / `payment.manual_proof.rejected` (existing M12 actions retained/aliased)

**Each audit row includes:** correlation ID, invoice ID, actor/user (if applicable; webhook events are system-actor), provider, transaction ID(s), normalized status — and **never** secrets or raw sensitive payloads.

**Observability:** count metrics per normalized status; alert on `PAYMENT_SIGNATURE_INVALID` spikes and `requires_review` accumulation; webhook endpoint health monitored.

## 15. QA Strategy (Future — executed externally, never by documentation agents)

| Milestone | QA scope |
| --- | --- |
| M15C-B | Provider contract review (paper QA of interface + Midtrans mapping) |
| M15C-C | Backend foundation validation (unit/integration of service, repository, states) |
| M15C-D | Webhook sandbox QA (signature, idempotency, replay, mismatch) |
| M15C-E | Frontend browser QA (CTA, pending state, paid state, fallback visibility) |
| M15C-F | End-to-end sandbox payment QA (full happy path + negatives) |

**Required test cases:**

- Create transaction succeeds; redirect/payment URL or Snap token created.
- Valid webhook marks invoice paid exactly once.
- Duplicate webhook is idempotent (no double settlement).
- Invalid signature rejected (`PAYMENT_SIGNATURE_INVALID`).
- Amount mismatch rejected → `requires_review`.
- Resident cannot pay another resident's invoice (403 self-scope).
- Admin can see gateway payment status with source badge.
- Manual proof fallback still works end-to-end (M12 regression).
- Invoice NOT auto-paid by redirect alone.
- No secret leak in responses, logs, or artifacts (leakage check, same discipline as M14B/M14C).

## 16. Implementation Milestone Breakdown

| Milestone | Deliverable |
| --- | --- |
| **M15C-B** | Midtrans Provider Contract Freeze — exact interface signatures, Snap vs redirect decision, status mapping table, idempotency keys |
| **M15C-C** | Backend Payment Gateway Foundation — migration (`payment_transactions`, optional `webhook_events`), service/repository/adapter skeleton, feature flag fail-closed |
| **M15C-D** | Midtrans Sandbox Webhook Integration — webhook handler, signature validation, idempotent settlement, audit events |
| **M15C-E** | Frontend Payment CTA / Admin Status UI — Penghuni "Bayar Online" + pending/paid states; Admin source badges + transaction inspection |
| **M15C-F** | Payment Gateway QA / Sandbox E2E — external execution, evidence artifacts |
| **M15C-G** | Documentation / Release Update — governance docs, demo script addition, readiness statement |

## 17. Open Questions

1. **Snap vs redirect/payment link**: Snap popup keeps users in-app (closer to mockup method-selector UX); redirect is simpler. Decide at M15C-B.
2. **Who pays the transaction fee** — absorbed by operator or added to invoice amount?
3. **Is partial payment allowed?** (Current recommendation: no — exact amount only.)
4. **Multiple concurrent attempts per invoice** — recommendation: one active `pending` attempt at a time; new attempt only after expiry/failure.
5. **Is manual proof blocked while a gateway attempt is pending?** (Current recommendation in Section 7: allowed, with paid-guard; confirm.)
6. **Expiration duration** for payment sessions (Midtrans default vs custom, e.g. 24 h) and interaction with late-fee policy.
7. **Production storage/log retention for webhook events** — minimal sanitized metadata vs encrypted raw audit.
8. **Refund/cancel scope** — manual/administrative only for v1?
9. **Production provider final choice** — Midtrans assumed but not locked; revisit before production activation.

## 18. Acceptance Checklist

- [x] Architecture freeze created (`docs/15-payment-gateway/PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md`).
- [x] Provider-agnostic strategy defined (interface + adapter isolation).
- [x] Midtrans Sandbox defined as first adapter.
- [x] Invoice/payment transaction lifecycle defined.
- [x] Webhook defined as source of truth (signature + idempotency + replay safety).
- [x] Manual proof fallback preserved and its relationship defined.
- [x] Frontend UX contract aligned with mockup defined (+ proposals, not implemented).
- [x] Security rules defined (server key backend-only; no keys in repo/docs).
- [x] Env strategy defined (default disabled; sandbox first).
- [x] DB/model planning defined (`payment_transactions`, optional `webhook_events`).
- [x] QA plan defined (M15C-B..F + test cases).
- [x] Implementation milestones defined (M15C-B..G).
- [x] No code implementation.
- [x] No real credentials anywhere in this document.
