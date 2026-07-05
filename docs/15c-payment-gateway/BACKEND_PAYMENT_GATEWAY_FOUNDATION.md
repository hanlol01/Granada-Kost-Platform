# M15C-C - Backend Payment Gateway Foundation

> Date: 2026-07-04
> Status: Implemented; validation results recorded below
> Scope: Backend foundation only. No frontend UI, no real Midtrans credential, no live Midtrans call, no webhook settlement, no invoice auto-paid by gateway.

## 1. Implementation Summary

M15C-C adds a provider-agnostic payment gateway backend foundation with Midtrans as the first adapter skeleton. The feature is fail-closed by default:

- `PAYMENT_GATEWAY_ENABLED=false`
- `PAYMENT_GATEWAY_PROVIDER=none`

When disabled, resident/admin payment gateway APIs return `PAYMENT_GATEWAY_DISABLED`. When enabled with `PAYMENT_GATEWAY_PROVIDER=midtrans` but required config is missing, APIs return `PAYMENT_CONFIG_MISSING` before provider IO.

The Midtrans adapter is a safe skeleton in this milestone. It does not call Midtrans, does not create a real Snap token, does not create a real payment URL, and does not mark invoices paid.

Manual payment proof remains available as the fallback/manual path. Uploading new manual proof for an already-paid invoice is now blocked with `PAYMENT_INVOICE_ALREADY_PAID`.

## 2. Files Changed

- `backend/api/.env.example`
- `backend/api/src/app.module.ts`
- `backend/api/src/infrastructure/config/configuration.ts`
- `backend/api/src/infrastructure/config/environment.validation.ts`
- `backend/api/src/infrastructure/database/migrations/012_payment_gateway.sql`
- `backend/api/src/modules/billing/services/payment-proof.service.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.module.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.controller.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.admin.controller.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.service.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.repository.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.config.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.errors.ts`
- `backend/api/src/modules/payment-gateway/payment-gateway.types.ts`
- `backend/api/src/modules/payment-gateway/dto/list-payment-transactions-query.dto.ts`
- `backend/api/src/modules/payment-gateway/providers/payment-gateway-provider.interface.ts`
- `backend/api/src/modules/payment-gateway/providers/midtrans/midtrans.config.ts`
- `backend/api/src/modules/payment-gateway/providers/midtrans/midtrans.provider.ts`
- `docs/15-payment-gateway/BACKEND_PAYMENT_GATEWAY_FOUNDATION.md`

## 3. Database Tables

Migration added:

- `backend/api/src/infrastructure/database/migrations/012_payment_gateway.sql`

Tables:

- `payment_transactions`
- `payment_webhook_events`

Important constraints/indexes:

- unique `(provider, provider_order_id)`
- partial unique active attempt per invoice for `created` / `pending`
- partial unique paid transaction per invoice
- indexes for invoice, property/status/created, resident/created, transaction status, webhook provider/order, webhook status

No secrets are stored. Webhook events store `payload_hash` and sanitized metadata only.

## 4. Endpoints Added

Resident:

- `POST /api/v1/my/invoices/:invoiceId/payment-sessions`
- `GET /api/v1/my/invoices/:invoiceId/payment-status`

Admin/manager:

- `GET /api/v1/admin/payment-transactions`
- `GET /api/v1/admin/payment-transactions/:id`

All responses are provider-neutral and do not include provider secrets, signatures, raw provider payloads, or excessive PII.

## 5. Env Config

Added:

- `PAYMENT_GATEWAY_ENABLED=false`
- `PAYMENT_GATEWAY_PROVIDER=none`
- `MIDTRANS_ENV=sandbox`
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `PAYMENT_RETURN_URL`
- `PAYMENT_CANCEL_URL`
- `PAYMENT_WEBHOOK_BASE_URL`
- `PAYMENT_SESSION_EXPIRY_MINUTES=1440`
- `PAYMENT_ACTIVE_ATTEMPT_POLICY=single_active`

Config validation keeps startup safe for the default disabled state. Runtime service checks return `PAYMENT_CONFIG_MISSING` when Midtrans is selected without required config.

## 6. Provider Interface / Adapter

Provider interface:

- `providerName`
- `createPaymentSession(input)`
- `parseAndVerifyWebhook(rawRequest)`
- `normalizeStatus(providerPayload)`
- `getPaymentStatus(providerOrderId)` optional
- `capabilities()`

Midtrans adapter behavior in M15C-C:

- no real provider IO
- no real Snap token
- no real payment URL
- returns normalized pending skeleton metadata
- webhook parse method is a fail-safe placeholder and does not settle invoices

## 7. Order ID Format

Implemented format:

- `KST-{invoiceIdShort}-{attemptSeq}-{randomSuffix}`

Rules:

- uppercase alphanumeric and hyphen only
- max 50 chars
- no resident name, email, phone, room number, or other PII
- unique per attempt through the DB unique constraint

## 8. Manual Proof Compatibility

Preserved:

- `POST /api/v1/my/payment-proofs`
- proof remains `pending_review`
- admin verification remains the manual settlement authority
- pending manual proof does not block gateway session creation
- gateway pending does not block manual proof upload in this milestone

Added guard:

- if invoice is already `paid` or has `paid_at`, new manual proof submission is blocked with `PAYMENT_INVOICE_ALREADY_PAID`

## 9. Security Boundary

- Backend is the only policy enforcement point.
- Billing/controllers do not call Midtrans directly.
- Provider IO is behind `PaymentGatewayProvider`.
- Server key is backend-only and never returned.
- Raw provider payload and signatures are never returned.
- `payment_transactions.metadata` is sanitized before persistence.
- No frontend env or source was changed.
- No real credential was added.

## 10. Intentionally Not Implemented

- Real Midtrans Snap API call
- Real Midtrans webhook settlement
- Invoice auto-paid from gateway
- Refund/chargeback automation
- Payment gateway frontend UI
- Admin provider refresh button
- Production readiness claim

## 11. Validation Result

Commands:

- `npm.cmd run build:api` - PASS
- `npm.cmd run lint:api` - PASS
- `npm.cmd run db:migrate:api` - PASS (`012_payment_gateway.sql applied`)
- `npm.cmd run build:api` - PASS (final)

Targeted API smoke:

- disabled mode (`PAYMENT_GATEWAY_ENABLED=false`, `PAYMENT_GATEWAY_PROVIDER=none`) - PASS
  - health check passed
  - resident create payment session failed closed with `PAYMENT_GATEWAY_DISABLED`
  - resident payment status failed closed with `PAYMENT_GATEWAY_DISABLED`
  - leakage marker check passed
- enabled Midtrans with missing config - PASS
  - health check passed
  - resident payable invoice fixture available
  - create payment session returned `PAYMENT_CONFIG_MISSING`
  - leakage marker check passed
- enabled configured Midtrans skeleton - PASS
  - health check passed
  - resident self-scope enforced (`404/403` for another resident invoice; local result `404`)
  - create session for own unpaid invoice returned `pending`, `provider=midtrans`, `paymentUrl=null`, `snapToken=null`
  - repeated create reused the active pending attempt
  - payment status returned the latest pending transaction
  - admin transaction list/detail returned the created gateway transaction
  - property owner denied admin transaction route (`403`)
  - paid invoice session creation blocked with `PAYMENT_INVOICE_ALREADY_PAID`
  - manual proof submission for paid invoice blocked with `PAYMENT_INVOICE_ALREADY_PAID`
  - leakage marker check passed

## 12. Next Milestone M15C-D

Recommended next milestone:

- implement Midtrans Sandbox webhook verification
- verify signature using server key
- normalize statuses
- enforce idempotency/replay safety
- atomically mark invoice paid only after verified webhook
- add mismatch/requires-review handling
- keep manual proof fallback intact
