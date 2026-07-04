# M15C-B — Midtrans Provider Contract Freeze

> **Milestone:** M15C-B (documentation / provider contract freeze only — no implementation, no QA execution)
> **Date:** 2026-07-04
> **Role:** Kostation Payment Gateway Architecture Reviewer
> **Status:** Contract freeze recorded; binding for M15C-C through M15C-G unless superseded by an accepted revision
> **Binding inputs:** `docs/15-payment-gateway/PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md` (M15C-A — binding parent freeze), `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` (M14F), `docs/14-production-readiness/API_REGRESSION_SECURITY_SMOKE.md` (M14B, PASS), `docs/14-production-readiness/BROWSER_REGRESSION_INTERNAL_DEMO_FLOW.md` (M14C, PASS), `docs/00-project/PROJECT_MASTER.md`, `docs/00-project/ROADMAP.md`, `docs/00-project/PROJECT_HANDOFF.md`, `docs/00-project/CHANGELOG.md`, `docs/README.md`, `docs/12-product-readiness/` (M12 file upload / manual payment proof docs), `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`
> **Code/mockup awareness (inspected, not modified):** `backend/api/src/modules/billing/` (invoice/payment/payment-proof controllers, services, repositories, constants), `backend/api/src/modules/file/`, `apps/admin/`, `apps/penghuni/`, `mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx`, `mockup/Console Admin KOST/`. No `backend/api/src/modules/payment/` module exists yet — that is expected; M15C-C creates it.
>
> This document contains **no real credentials, no merchant keys, no server/client key values**. All key names are env variable names only.
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal command was run for M15C-B. GitLab Duo has no shell access; all cited validation results were produced earlier and externally and are referenced from committed documents/artifacts.
> **Payment Gateway is NOT marked production-ready by this document.**
> **Manual payment proof (M12) is NOT removed or weakened** — it remains the fallback path.
> **Architecture is NOT locked to Midtrans** — Midtrans Sandbox is the first adapter only; all Midtrans-specific rules in this contract live inside the `MidtransProvider` adapter boundary.
> No ADR is changed. ADR-BE-FILE-001 and all existing billing decisions remain binding.

---

## 1. Executive Summary

- **Midtrans Sandbox is the first implementation provider** for the payment gateway (staging/demo only; production credentials out of scope and never committed).
- **This is a provider contract freeze, not an implementation.** Nothing here changes source code. Implementation starts at M15C-C only after this contract is accepted.
- **Payment Gateway remains NOT production-ready.** M14F verdict (internal demo READY, production NOT READY) is unchanged.
- **Manual payment proof (M12C3) remains the fallback** offline/manual path, unchanged in behavior.
- **The verified webhook remains the backend source of truth** for automatic invoice paid status. Frontend redirect/finish URLs are UX only, never a source of truth.
- **The payment gateway service must use the provider interface and the Midtrans adapter** — billing services, controllers, and any other layer must never call Midtrans SDK/HTTP directly.

## 2. Contract Scope and Non-Scope

**Scope (frozen by this document):**

- Midtrans Sandbox contract (Snap-based session creation + webhook notification handling).
- Snap vs redirect decision (Section 4).
- Provider interface method contract (Section 5).
- Create-transaction request/response contract (Sections 5 and 7).
- Provider order ID format (Section 6).
- Webhook verification contract (Section 8).
- Midtrans → internal status mapping (Section 9).
- Idempotency and replay contract (Section 10).
- Backend API contract to frontend (Section 11).
- Env/config contract (Section 12).
- Error normalization contract (Section 13).
- Audit events contract (Section 14).
- Frontend/mockup contract and manual proof compatibility (Sections 15–16).
- Future QA expectations (Section 17) and M15C-C readiness (Section 18).

**Non-scope (hard exclusions):**

- No backend implementation. No frontend implementation. No source change of any kind.
- No production payment activation.
- No real credentials (sandbox or production) anywhere in repo/docs.
- No refund automation (refund/chargeback → manual/administrative handling only in v1).
- No settlement/reconciliation automation, no payout module.
- No tax/accounting module.
- No provider lock-in — every Midtrans-specific rule below is adapter-internal; the billing domain, webhook route shape, normalized statuses, and error codes stay provider-neutral.

## 3. Binding M15C-A Decisions (Restated, Unchanged)

1. **Provider-agnostic architecture**: `PaymentGatewayProvider` interface + adapters; billing domain never talks to a provider SDK/API directly.
2. **Midtrans is the first adapter only**; Xendit/DOKU/Duitku/others must be addable without changing the billing domain or webhook route shape.
3. **Manual payment proof fallback preserved** (M12 behavior: `pending_review`, admin verification = manual settlement authority).
4. **Webhook is the source of truth** for automatic paid status (signature validation, idempotency, replay safety).
5. **Redirect/finish URL is UX only** — never marks paid.
6. **No raw provider payload** is exposed to frontend or stored unsanitized; minimal sanitized metadata + `payload_hash` only.
7. **Provider secrets are backend-only**; server key never in frontend env, bundles, repo, docs, or logs.
8. **Resident self-scope and property scope are mandatory** on all user-facing invoice/payment reads and writes (existing billing rules).
9. **Default disabled by env**: `PAYMENT_GATEWAY_ENABLED=false` in every environment; fail-closed.
10. DB planning (`payment_transactions`, optional-but-recommended `webhook_events`), normalized error style, and audit style from M15C-A Sections 12–14 remain the baseline.

## 4. Snap vs Redirect Decision (FROZEN)

**Decision: Midtrans Snap (backend-generated Snap token, hosted Snap payment page/popup).**

- The **backend** creates the Midtrans Snap transaction using the server key and returns a **normalized payment session** (Section 11 response shape) containing the Snap token and/or the Snap redirect URL.
- The **frontend** may open the Snap **popup** (Snap.js) or navigate to the **hosted Snap redirect URL** — both are acceptable UI capabilities backed by the same backend session; the choice of popup vs full redirect is a frontend detail finalized at M15C-E (open question 1 narrows to UI mode only).
- If Snap.js requires the **client key**, it may be exposed to the frontend **only if Midtrans documents it as publishable/safe**; this is the only provider value ever allowed client-side. The **server key must never reach the frontend** under any circumstance.
- **No separate direct VA/QRIS/e-wallet provider-specific UI is built in v1.** Payment method selection is delegated to the Snap hosted page. The existing mockup method selector (QRIS / Transfer Bank / E-Wallet) may remain as UX display or be adapted (Section 15), but it does not drive provider-specific integrations in v1.

**Rationale:**

- Fastest path to a working sandbox demo (single integration surface).
- Least provider-specific frontend complexity — no per-method UI, no per-method status handling.
- Easiest future provider replacement: the frontend consumes only `paymentUrl`/`snapToken` + normalized status; swapping the adapter does not change the frontend contract.
- Payment method UX (and its PCI/security surface) stays inside the provider-hosted page.

## 5. Provider Interface Contract (FROZEN)

Conceptual TypeScript-like contract (names frozen; exact TS syntax finalized in code at M15C-C without semantic change):

```ts
interface PaymentGatewayProvider {
  readonly providerName: string; // e.g. 'midtrans'

  createPaymentSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult>;

  // Signature verification happens INSIDE this method, before any normalization result is trusted.
  parseAndVerifyWebhook(rawRequest: RawWebhookRequest): Promise<NormalizedWebhookEvent>;

  // Pure mapping from a (sanitized) provider payload to the internal normalized status.
  normalizeStatus(providerPayload: SanitizedProviderPayload): NormalizedPaymentStatus;

  // Optional: reconciliation / polling fallback. Midtrans adapter SHOULD implement it (Status API).
  getPaymentStatus?(providerOrderId: string): Promise<NormalizedWebhookEvent>;

  capabilities(): ProviderCapabilities; // { methods: string[]; supportsExpiry: boolean; supportsCancel: boolean }
}
```

**`CreatePaymentSessionInput` (all fields provider-neutral):**

| Field | Required | Notes |
| --- | --- | --- |
| `invoiceId` | yes | Internal invoice ID |
| `propertyId` | yes | Scope enforcement / audit |
| `residentId` / `userId` | yes | Initiator; self-scope already enforced by the calling service |
| `amount` | yes | Must equal invoice payable amount exactly |
| `currency` | yes | `IDR` only in v1 |
| `customerName` / `customerEmail` / `customerPhone` | optional | Only if available AND allowed; minimal PII (Section 7) |
| `returnUrl` | yes | From `PAYMENT_RETURN_URL` |
| `cancelUrl` | yes | From `PAYMENT_CANCEL_URL` |
| `metadata` / `correlationId` | yes | Correlation ID for audit; sanitized metadata only |

**`CreatePaymentSessionResult`:**

| Field | Notes |
| --- | --- |
| `provider` | `'midtrans'` |
| `providerOrderId` | Generated per Section 6; unique per attempt |
| `paymentSessionId` | Nullable; provider session identifier if distinct from order ID |
| `paymentUrl` | Nullable; Snap redirect URL |
| `snapToken` | Nullable; Snap token for popup mode |
| `expiresAt` | Nullable; session expiry timestamp |
| `normalizedStatus` | `pending` (or `created` prior to provider acknowledgement) |
| `safeMetadata` | Sanitized only — no secrets, no raw payload |

**`NormalizedWebhookEvent` (output of `parseAndVerifyWebhook`):**

| Field | Notes |
| --- | --- |
| `provider` | `'midtrans'` |
| `providerOrderId` | From notification `order_id` |
| `providerTransactionId` | Nullable; Midtrans `transaction_id` |
| `normalizedStatus` | Per mapping table (Section 9) |
| `amount` | Parsed `gross_amount` |
| `currency` | Expected `IDR` |
| `paymentMethod` | Nullable; normalized label (`qris`/`bank_transfer`/`ewallet`/`card`/…) |
| `transactionTime` | Nullable |
| `fraudStatus` | Nullable (`accept`/`challenge`/`deny`) |
| `signatureValid` | Boolean — MUST be checked by the caller; `false` means the event is untrusted |
| `rawStatusCode` | Sanitized provider status code (string), for audit/debug |
| `payloadHash` | Hash of raw payload for dedupe/audit (raw payload itself is NOT stored) |
| `safeMetadata` | Sanitized only |

## 6. Provider Order ID Format (FROZEN)

**Format:** `KST-{invoiceIdShort}-{attemptSeq}-{randomSuffix}`

- `KST` — fixed platform prefix.
- `{invoiceIdShort}` — short, non-PII derivative of the internal invoice ID (e.g. first 8 chars of the invoice UUID, or the numeric invoice ID). Authoritative invoice/property mapping lives in `payment_transactions`, **not** in the readable order ID.
- `{attemptSeq}` — per-invoice attempt sequence (1, 2, 3, …).
- `{randomSuffix}` — short random alphanumeric (e.g. 6 chars) to guarantee uniqueness and prevent guessability.

**Rules:**

1. Unique per attempt; one invoice may have multiple attempts, each with its own `providerOrderId`; at most one attempt ends `paid`.
2. Deterministic enough for lookup (lookup is by exact `providerOrderId` → `payment_transactions.provider_order_id`, which is unique-indexed).
3. **No PII ever**: no resident name, phone, email, room number, or address in the order ID.
4. Charset: `[A-Z0-9-]`; **max length ≤ 50 characters** (safe within the Midtrans `order_id` limit); adapter must validate length before sending.
5. Stored in `payment_transactions.provider_order_id` (unique). `provider_transaction_id` is stored when the first verified notification arrives.
6. Order ID generation is backend-only; the frontend never constructs or supplies it.

## 7. Midtrans Create Transaction Contract (Adapter-Internal)

Fields the `MidtransProvider` adapter sends for a Snap transaction:

| Field | Rule |
| --- | --- |
| `transaction_details.order_id` | Section 6 format |
| `transaction_details.gross_amount` | **Must equal the invoice payable amount exactly** (integer IDR) |
| `customer_details` | Optional; only if available and safe — minimal fields (first name, email, phone); no room number, no address, no ID numbers |
| `item_details` | Optional; sanitized — e.g. `"Tagihan sewa {period}"`; **must not expose excessive PII** |
| `callbacks.finish` / return URLs | From `PAYMENT_RETURN_URL` / `PAYMENT_CANCEL_URL`, if supported by Snap config |
| `expiry` | If supported; from `PAYMENT_SESSION_EXPIRY_MINUTES` when set, else Midtrans default |
| `metadata` / custom fields | Only if supported and safe: `correlationId`, internal attempt reference — never secrets |

**Rules (frozen):**

1. `gross_amount` = invoice payable amount. **No partial payment in v1.**
2. Currency is **IDR** only.
3. **No provider fee pass-through** to the resident unless a later product decision explicitly approves it (open question 4).
4. Session creation **must fail** with `PAYMENT_INVOICE_ALREADY_PAID` if the invoice is already paid (by gateway or verified manual proof).
5. **One active `pending` attempt per invoice** (recommended policy `single_active`, Section 12): a new attempt is allowed only after the previous one is `expired`/`failed`/`cancelled`/`denied`, unless product later decides otherwise. While an attempt is active, repeated create requests follow Section 10 rule 6.
6. All fields above are adapter-internal; nothing Midtrans-shaped crosses the adapter boundary outward.

## 8. Webhook Verification Contract (FROZEN)

- **Endpoint (provider-neutral shape):** `POST /api/v1/payment-gateways/:provider/webhook`
  - First concrete route: `POST /api/v1/payment-gateways/midtrans/webhook`
- **Signature verification is required before any processing or state change**, inside the adapter:
  - Midtrans `signature_key` validation: `SHA512(order_id + status_code + gross_amount + server_key)`.
  - The server key used for verification is **backend-only**.
- **Invalid signature** → `PAYMENT_SIGNATURE_INVALID`: reject, no state change, audit `payment.webhook.rejected`.
- **Unknown `order_id`** → no invoice mutation of any kind; event logged into the `requires_review` bucket; the HTTP response follows provider acknowledgement needs (do not trigger endless provider retries for permanently-unknown orders) but never confirms settlement.
- **Amount mismatch** (notification `gross_amount` ≠ invoice payable amount) → no paid mutation; `requires_review` + audit.
- **Currency mismatch** (≠ IDR) → no paid mutation; `requires_review` + audit.
- **Paid transition preconditions (ALL required):** valid signature, known `providerOrderId` → invoice mapping, exact amount match, currency match, and the invoice is in a valid payable state (not already paid, not cancelled/void).
- **Webhook responses are minimal**: acknowledgement only — no stack traces, no entity dumps, no config, no internals.
- Raw payload is **not stored**; only `payloadHash` + sanitized metadata (M15C-A Section 8 policy unchanged).

## 9. Midtrans Status Mapping (FROZEN)

| Midtrans `transaction_status` | `fraud_status` | Internal normalized status | Invoice effect |
| --- | --- | --- | --- |
| `capture` | `accept` | `paid` | Mark paid (all Section 8 preconditions met) |
| `capture` | `challenge` | `challenge` → `requires_review` | **NOT paid**; upgraded only by a later verified notification |
| `settlement` | — | `paid` | Mark paid (all Section 8 preconditions met) |
| `pending` | — | `pending` | No paid mutation |
| `deny` | — | `denied` | Not paid |
| `cancel` | — | `cancelled` | Not paid |
| `expire` | — | `expired` | Not paid; new attempt allowed |
| `failure` | — | `failed` | Not paid; new attempt allowed |
| `refund` / `partial_refund` | — | `requires_review` | **No automation in v1**; manual/administrative handling; invoice is NOT auto-unpaid |
| `chargeback` / `partial_chargeback` (if present) | — | `requires_review` | Manual handling; invoice is NOT auto-unpaid |
| unknown / unmapped | any | `unknown` → `requires_review` | Never paid; audit + review bucket |

**Rules (frozen):**

1. `paid` is **terminal** for a transaction; out-of-order or replayed webhooks must never regress a paid transaction or a paid invoice.
2. `failed` / `expired` / `cancelled` / `denied` never mark the invoice paid.
3. `challenge` never marks the invoice paid.
4. `refund` / `chargeback` never automatically un-pays an invoice in v1 — they create a `requires_review` item for admin follow-up.
5. Any unmappable provider result falls to `unknown`/`requires_review` — fail-safe, never fail-paid.

## 10. Idempotency and Replay Contract (FROZEN)

1. **Dedupe key:** `provider` + `providerOrderId` + (`providerTransactionId` and/or notification status) + `payloadHash` where available. `webhook_events` records dedupe outcomes (`accepted`/`duplicate`/`rejected`/`requires_review`).
2. **Duplicate webhook** → safe acknowledgement, **no repeated mutation**, logged as `PAYMENT_WEBHOOK_DUPLICATE` / audit `payment.webhook.duplicate`.
3. **Invoice paid transition is atomic** (single DB transaction covering payment transaction state + invoice `paid_at`).
4. **At most one `paid` transaction per invoice** — enforced at the service + DB level.
5. **Concurrent webhooks are serialized** — lock by `invoiceId` (or `providerOrderId`) using DB row locking and/or a Redis idempotency lock; Redis is runtime-only, PostgreSQL remains the system of record.
6. **Repeated create-session request while an active `pending` attempt exists:** return the **existing session** (`payment.session.reused`) if it is still valid/safe (not expired, same amount); otherwise return `PAYMENT_TRANSACTION_PENDING`. Never mint a second concurrent active session.
7. **No duplicate active payment sessions** unless the previous attempt is `expired`/`failed`/`cancelled`/`denied`.

## 11. Backend API Contract to Frontend (FROZEN — provider-neutral)

**Penghuni (resident self-scope enforced backend-side):**

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/my/invoices/:invoiceId/payment-sessions` | Create — or return the existing active — payment session for the resident's own invoice |
| `GET /api/v1/my/invoices/:invoiceId/payment-status` | Normalized invoice/payment status (poll/refresh after redirect) |
| `POST /api/v1/my/payment-proofs` | **Existing M12C3 manual proof endpoint — unchanged** |

**Admin (RBAC + property scope, existing patterns):**

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/admin/payment-transactions` (or a scoped extension of the existing billing routes — final routing detail at M15C-C without contract change) | List gateway/manual payment records with source labels |
| `GET /api/v1/admin/payment-transactions/:id` | Normalized transaction detail |
| Manual proof verify/reject | **Existing M12C5 flow — unchanged** |

**Webhook:** `POST /api/v1/payment-gateways/midtrans/webhook` (Section 8).

**Normalized response shape (both roles, field subset per endpoint):**

| Field | Notes |
| --- | --- |
| `invoiceId` | Internal ID |
| `invoiceStatus` | e.g. `issued` / `payment_pending` / `paid` |
| `paymentStatus` | Normalized transaction status (Section 9) |
| `provider` | e.g. `midtrans` (detail field; UI labels stay provider-neutral) |
| `paymentMethodLabel` | Nullable, normalized |
| `paymentUrl` | Nullable |
| `snapToken` | Nullable |
| `expiresAt` | Nullable |
| `paidAt` | Nullable |
| `safeMessage` | Human-readable, safe copy |

**Never returned:** server key, client key values, signature values, raw provider payload, `storage_path`, or excessive PII.

## 12. Config / Env Contract (FROZEN — names only, never values)

| Variable | Rule |
| --- | --- |
| `PAYMENT_GATEWAY_ENABLED` | **`false` by default** in every environment; fail-closed |
| `PAYMENT_GATEWAY_PROVIDER` | `none` \| `midtrans` |
| `MIDTRANS_ENV` | `sandbox` \| `production` — sandbox first; production out of scope for this track |
| `MIDTRANS_SERVER_KEY` | **Backend-only**; secret manager / uncommitted `.env`; never in repo, docs, logs, or frontend |
| `MIDTRANS_CLIENT_KEY` | Only if the Snap frontend strictly requires it AND Midtrans documents it as publishable/safe |
| `PAYMENT_RETURN_URL` | Post-payment return/finish URL |
| `PAYMENT_CANCEL_URL` | Cancel/back URL |
| `PAYMENT_WEBHOOK_BASE_URL` | Public base URL registered at the provider dashboard |
| `PAYMENT_SESSION_EXPIRY_MINUTES` | Optional; when unset, provider default applies (open question 3) |
| `PAYMENT_ACTIVE_ATTEMPT_POLICY` | `single_active` (recommended default; Section 10 rules 6–7) |

**Rules:** default disabled; sandbox first; production env out of scope; enabling the provider without required config **fails fast** with `PAYMENT_CONFIG_MISSING`; server key backend-only forever; **no real values anywhere in docs/repo**; the frontend receives only safe publishable values, and only if absolutely necessary. (Mirrors the Smart Lock env posture.)

## 13. Error Normalization Contract (FROZEN)

| Code | Meaning | HTTP (suggested) | Audience | Safe frontend message (suggested) |
| --- | --- | --- | --- | --- |
| `PAYMENT_GATEWAY_DISABLED` | Feature flag off; fail-closed before provider IO | 403 or 404 | User-facing | "Pembayaran online belum tersedia." |
| `PAYMENT_CONFIG_MISSING` | Provider enabled without required config (fail-fast) | 500 | Internal | "Pembayaran online sedang tidak tersedia. Coba lagi nanti." |
| `PAYMENT_PROVIDER_UNAVAILABLE` | Provider unreachable/timeout | 502/503 | User-facing (generic) | "Layanan pembayaran sedang gangguan. Coba lagi nanti." |
| `PAYMENT_INVOICE_NOT_FOUND` | Invoice missing | 404 | User-facing | "Tagihan tidak ditemukan." |
| `PAYMENT_INVOICE_OUT_OF_SCOPE` | Not the caller's invoice / outside property scope | 403 | User-facing | "Anda tidak memiliki akses ke tagihan ini." |
| `PAYMENT_INVOICE_ALREADY_PAID` | Invoice already paid; new attempts/proofs blocked | 409 | User-facing | "Tagihan sudah lunas." |
| `PAYMENT_TRANSACTION_PENDING` | Active pending attempt exists and cannot be reused | 409 | User-facing | "Masih ada pembayaran online yang sedang menunggu. Selesaikan atau tunggu kedaluwarsa." |
| `PAYMENT_TRANSACTION_EXPIRED` | Session/attempt expired | 410 or 409 | User-facing | "Sesi pembayaran kedaluwarsa. Buat sesi pembayaran baru." |
| `PAYMENT_AMOUNT_MISMATCH` | Webhook/attempt amount ≠ invoice amount | 400 (webhook path: internal) | Internal | (not shown; review bucket) |
| `PAYMENT_CURRENCY_MISMATCH` | Currency ≠ IDR | 400 (webhook path: internal) | Internal | (not shown; review bucket) |
| `PAYMENT_SIGNATURE_INVALID` | Webhook signature verification failed | 401/403 (webhook) | Internal | (never surfaced to end users) |
| `PAYMENT_WEBHOOK_DUPLICATE` | Replayed event; acknowledged, no state change | 200 (ack) | Internal | (not shown) |
| `PAYMENT_PROVIDER_REJECTED` | Provider denied (e.g. `deny`) | 402 or 409 | User-facing | "Pembayaran ditolak oleh penyedia pembayaran." |
| `PAYMENT_STATUS_REQUIRES_REVIEW` | Suspicious/unmappable state routed to review | 202 or 409 | Mostly internal | "Pembayaran sedang diperiksa. Status akan diperbarui setelah verifikasi." |
| `PAYMENT_UNKNOWN_PROVIDER_ERROR` | Unmappable provider error | 502 | Internal | "Terjadi kendala pada layanan pembayaran. Coba lagi nanti." |

Webhook-path errors never leak details to the caller; user-facing messages are always provider-neutral and secret-free.

## 14. Audit Events Contract (FROZEN — extends existing billing audit style)

| Event | Trigger |
| --- | --- |
| `payment.session.create.requested` | Resident/admin requests a payment session |
| `payment.session.created` | New session minted at provider |
| `payment.session.reused` | Existing active session returned |
| `payment.session.create.failed` | Creation failed (config/provider/validation) |
| `payment.webhook.received` | Webhook hit the endpoint (pre-verification) |
| `payment.webhook.verified` | Signature + mapping verified |
| `payment.webhook.duplicate` | Deduped replay |
| `payment.webhook.rejected` | Invalid signature / rejected event |
| `payment.transaction.pending` | Transaction entered `pending` |
| `payment.transaction.paid` | Transaction paid (verified) |
| `payment.transaction.failed` | Transaction failed |
| `payment.transaction.expired` | Transaction expired |
| `payment.transaction.requires_review` | Routed to review bucket |
| `payment.invoice.mark_paid_gateway` | Invoice `paid_at` set by verified gateway webhook |

**Audit rules:** include the actor when a user/admin initiates; webhook events use a **system actor**; every row includes `invoiceId`, `propertyId`, `provider`, `providerOrderId`, and `correlationId`; **never** secrets, keys, signatures, or raw sensitive payloads. Existing M12 manual-proof audit actions (`payment_proof.submit`, `payment.verify`, `payment.reject`) are retained unchanged.

## 15. Frontend / Mockup Contract (FROZEN — no implementation in M15C-B)

- Penghuni Tagihan page follows the existing mockup style (`mockup/App Mobile Penghuni KOST/src/routes/_app/billing.tsx`): bill summary card, breakdown, due date, history.
- **Primary CTA: "Bayar Online".** **Secondary CTA: "Upload Bukti Pembayaran Manual"** (existing M12C3 flow, visually secondary, always available per Section 16).
- With Snap, payment method selection happens **inside Snap**; the mockup method selector may be hidden, disabled, or adapted to a passive label such as **"Pilih di halaman pembayaran"** for v1.
- After session creation: show **"Menunggu Pembayaran Online"** state.
- After returning from payment: show exactly — **"Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi."**
- **Never mark paid on redirect.** The UI must poll or refresh `GET /my/invoices/:invoiceId/payment-status` after return; paid appears only after backend webhook confirmation.
- If invoice is paid: hide/disable both payment CTAs; show paid status + date.
- If attempt is `expired`/`failed`/`cancelled`: allow a new attempt ("Buat sesi pembayaran baru").
- If a manual proof is `pending_review`: online payment remains allowed (unless product later changes — open question 6); UI shows the pending state clearly.
- Admin: **source badge "Gateway" / "Manual"** in payments list and detail; **gateway-paid rows need no manual verify/reject**; manual proof rows retain verify/reject; labels provider-neutral ("Pembayaran Online"); provider name only as a detail field; no secrets or raw payloads ever shown.

## 16. Manual Proof Compatibility Contract (FROZEN — M12 preserved)

1. Manual payment proof **remains available** as the fallback/offline/manual path.
2. Proofs remain **`pending_review`** until admin verification; upload **never auto-pays**.
3. A **gateway-paid invoice blocks new manual proof submission** (`PAYMENT_INVOICE_ALREADY_PAID`, "Tagihan sudah lunas").
4. A **pending manual proof does not block gateway payment** (recommended rule retained from M15C-A; confirm at acceptance — open question 6).
5. If gateway payment succeeds **while a manual proof is pending**: implementation planning (M15C-C/D) must mark the pending proof **obsolete/rejected-with-system-note or otherwise admin-visible as no longer needed** — no orphaned reviews (exact mechanism: open question 7).
6. **Admin manual verification must check the invoice is not already paid** before marking paid — whichever path settles first wins; the other is rejected.

## 17. QA Acceptance Criteria for Later Milestones (M15C-C/D/E/F — executed externally, never by documentation agents)

- Disabled config is **fail-closed** (`PAYMENT_GATEWAY_DISABLED` before any provider IO).
- Missing config **fails fast** (`PAYMENT_CONFIG_MISSING`).
- Resident **self-scope enforced**: cannot create a session or read payment status for another resident's invoice (403).
- Create payment session for own unpaid invoice succeeds (Snap token / payment URL returned).
- Cannot create a session for a **paid** invoice (`PAYMENT_INVOICE_ALREADY_PAID`).
- Active pending attempt is **reused or blocked** (`payment.session.reused` / `PAYMENT_TRANSACTION_PENDING`); no duplicate active sessions.
- Valid Midtrans **sandbox webhook marks invoice paid exactly once**.
- **Duplicate webhook is idempotent** (no double settlement, `PAYMENT_WEBHOOK_DUPLICATE`).
- **Invalid signature rejected** (`PAYMENT_SIGNATURE_INVALID`, no state change).
- **Amount/currency mismatch** → `requires_review`, never paid.
- **`challenge` status never marks paid.**
- **Refund/chargeback** → `requires_review`, invoice not auto-unpaid.
- **Redirect alone never marks paid.**
- **Manual proof fallback still works end-to-end** (M12 regression preserved).
- Admin sees **Gateway/Manual source badges**; gateway-paid rows have no verify/reject.
- **No secret / raw payload leaks** in responses, logs, or artifacts (same leakage discipline as M14B/M14C).

## 18. Implementation Readiness Checklist for M15C-C

All must be true before coding starts:

- [ ] This contract (M15C-B) reviewed and **accepted**.
- [ ] Snap decision (Section 4) accepted.
- [ ] Env names (Section 12) accepted.
- [ ] DB model from M15C-A (`payment_transactions`, `webhook_events`) accepted or revised via an accepted amendment.
- [ ] Endpoint names (Section 11) accepted.
- [ ] Status mapping (Section 9) accepted.
- [ ] Manual proof compatibility (Section 16) accepted.
- [ ] Frontend UX contract (Section 15) accepted.
- [ ] Confirmed **no real credentials committed** anywhere (repo, docs, artifacts).
- [ ] Midtrans **Sandbox account + keys available to the implementing developer outside the repo** (secret manager / uncommitted `.env`) for M15C-C/D implementation and external QA.

## 19. Open Questions

1. **Snap popup vs hosted redirect** — final UI mode choice (backend contract identical either way); decide by M15C-E.
2. **Client key exposure** — confirm whether Snap.js requires the client key in v1 and that Midtrans documents it as publishable; if not required, expose nothing.
3. **Payment session expiry duration** — Midtrans default vs `PAYMENT_SESSION_EXPIRY_MINUTES` (e.g. 24 h); interaction with late-fee policy.
4. **Transaction fee** — absorbed by operator or added to invoice later (v1: absorbed / no pass-through).
5. **Order ID `invoiceIdShort` derivation** — exact derivation (UUID prefix vs numeric ID) finalized at M15C-C within the frozen format.
6. **Manual proof pending + online payment allowed** — confirm the recommended "allowed" rule at contract acceptance.
7. **Obsolete manual proof mechanism after gateway paid** — auto-reject with system note vs `obsolete` status vs admin-visible flag.
8. **Admin manual status refresh action** — should admin get a "refresh from provider" button (backed by `getPaymentStatus`) in v1?
9. **Midtrans Sandbox credential availability** — when will sandbox keys be provisioned to the implementing developer (outside the repo)?

## 20. Acceptance Checklist

- [x] Midtrans provider contract created (`docs/15-payment-gateway/MIDTRANS_PROVIDER_CONTRACT_FREEZE.md`).
- [x] Snap/redirect decision documented and frozen (Snap token, backend-generated).
- [x] Provider interface defined (`PaymentGatewayProvider` + input/output shapes).
- [x] Create transaction contract defined (adapter-internal Midtrans fields + rules).
- [x] Provider order ID format defined (`KST-{invoiceIdShort}-{attemptSeq}-{randomSuffix}`, ≤ 50 chars, no PII).
- [x] Webhook verification contract defined (endpoint, SHA512 signature rule, rejection rules).
- [x] Midtrans status mapping defined (including challenge/refund/chargeback/unknown).
- [x] Idempotency/replay contract defined (dedupe key, atomicity, serialization, session reuse).
- [x] Backend API contract defined (Penghuni/Admin/webhook endpoints + normalized response).
- [x] Env/config contract defined (names only; default disabled; fail-fast).
- [x] Error normalization defined (codes + HTTP + audience + safe messages).
- [x] Audit events defined (session/webhook/transaction/invoice events + rules).
- [x] Frontend/mockup contract defined (CTAs, pending copy, no paid-on-redirect, admin badges).
- [x] Manual proof compatibility defined (fallback preserved; paid-guard; obsolete handling planned).
- [x] QA acceptance criteria defined (M15C-C/D/E/F).
- [x] M15C-C readiness checklist defined.
- [x] No code implementation.
- [x] No real credentials anywhere in this document.
