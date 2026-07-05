# M15C-D - Midtrans Sandbox Snap + Webhook Settlement

> Date: 2026-07-05
> Status: Implemented and validated on VPS staging / Midtrans Sandbox
> Scope: Backend-only Midtrans Sandbox Snap session creation and signed webhook settlement. No frontend UI. Payment Gateway is not production-ready.

## 1. What Was Implemented

M15C-D replaces the M15C-C Midtrans skeleton with a real backend Midtrans Sandbox Snap integration and webhook settlement flow.

Implemented backend behavior:

- `POST /api/v1/my/invoices/:invoiceId/payment-sessions` creates or reuses one active pending Midtrans attempt per invoice.
- The Midtrans adapter calls Sandbox Snap at `https://app.sandbox.midtrans.com/snap/v1/transactions` using backend-only Basic auth from `MIDTRANS_SERVER_KEY`.
- Snap request uses the backend-generated `providerOrderId`, exact outstanding invoice amount as `gross_amount`, currency `IDR`, sanitized single item detail, and `PAYMENT_SESSION_EXPIRY_MINUTES` for Snap expiry/page expiry.
- The response stores and returns only safe provider-neutral fields: provider, providerOrderId, `snapToken`, `paymentUrl`, expiry, pending status, and safe message.
- Session creation never marks the invoice paid.
- `POST /api/v1/payment-gateways/midtrans/webhook` verifies Midtrans `signature_key` before mutation.
- Verified paid webhook events atomically mark the gateway transaction paid, create a verified billing payment + allocation, and mark the invoice paid.
- Non-paid, mismatch, unknown, refund, chargeback, and challenge events never mark invoices paid.

## 2. VPS Staging Assumptions

Staging domains:

- Admin frontend: `https://kelola.kostation.web.id`
- Penghuni frontend: `https://app.kostation.web.id`
- Backend API: `https://api.kostation.web.id`

Midtrans dashboard notification URL:

```text
https://api.kostation.web.id/api/v1/payment-gateways/midtrans/webhook
```

## 3. Required Environment

Use Sandbox only for this milestone. Do not put production keys in staging.

```text
PAYMENT_GATEWAY_ENABLED=true
PAYMENT_GATEWAY_PROVIDER=midtrans
MIDTRANS_ENV=sandbox
MIDTRANS_SERVER_KEY=<masked sandbox server key>
MIDTRANS_CLIENT_KEY=<masked sandbox client key>
PAYMENT_RETURN_URL=https://app.kostation.web.id/billing
PAYMENT_CANCEL_URL=https://app.kostation.web.id/billing
PAYMENT_WEBHOOK_BASE_URL=https://api.kostation.web.id
PAYMENT_SESSION_EXPIRY_MINUTES=180
PAYMENT_ACTIVE_ATTEMPT_POLICY=single_active
SMART_LOCK_PROVIDER=simulated
SMART_LOCK_LIVE_ENABLED=false
```

Secrets are never printed, returned in API responses, committed, or stored in webhook metadata.

## 4. Endpoints

Resident:

- `POST /api/v1/my/invoices/:invoiceId/payment-sessions`
- `GET /api/v1/my/invoices/:invoiceId/payment-status`

Webhook:

- `POST /api/v1/payment-gateways/midtrans/webhook`

Admin/manager inspection remains backend-only:

- `GET /api/v1/admin/payment-transactions`
- `GET /api/v1/admin/payment-transactions/:id`

## 5. Snap Session Behavior

The session endpoint enforces authenticated resident self-scope through the existing billing invoice lookup. Paid or non-payable invoices are rejected. Existing active pending attempts are reused when the amount still matches the invoice outstanding amount.

The Snap payload intentionally avoids excessive PII. Item detail is a single generic invoice item named `Tagihan Kostation`; resident name, room number, phone, and email are not sent.

## 6. Webhook Signature Behavior

The webhook endpoint is public for provider callback delivery, but mutation requires valid Midtrans signature:

```text
SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
```

Invalid signatures return `PAYMENT_SIGNATURE_INVALID` and do not mutate invoice or transaction state. Webhook events store payload hash and sanitized metadata only, never raw provider payload or keys.

## 7. Status Mapping

| Midtrans status | Fraud status | Normalized result | Auto-paid? |
| --- | --- | --- | --- |
| `settlement` | any | `paid` | Yes |
| `capture` | `accept` | `paid` | Yes |
| `capture` | `challenge` | `challenge` | No |
| `pending` | any | `pending` | No |
| `deny` | any | `denied` | No |
| `cancel` | any | `cancelled` | No |
| `expire` | any | `expired` | No |
| `failure` | any | `failed` | No |
| `refund`, `partial_refund` | any | `requires_review` | No |
| `chargeback`, `partial_chargeback` | any | `requires_review` | No |
| unknown/unmapped | any | `requires_review` | No |

Paid is terminal. Later non-paid webhooks cannot regress a paid transaction. `requires_review` and `challenge` are also protected from later downgrade to pending by out-of-order non-paid events.

## 8. Settlement Rule

Only a verified paid webhook may settle an invoice. On valid paid webhook:

- `payment_transactions.status` becomes `paid`.
- `payment_transactions.paid_at` is set from provider transaction time when available, otherwise server time.
- A verified billing `payments` row is created with `payment_code=GW-{providerOrderId}`.
- A `payment_allocations` row allocates the exact transaction amount to the invoice.
- `invoices.invoice_status` becomes `paid` and `invoices.paid_at` is set.
- Only one paid transaction is allowed per invoice by DB constraint and transactional guard.

Redirect/finish URLs remain UX-only and never mark invoices paid.

## 9. Idempotency And Replay

Webhook events are deduplicated by `(provider, payload_hash)`. Duplicate deliveries are acknowledged safely and audited as `payment.webhook.duplicate` without reapplying settlement and without overwriting a previously processed event status.

Unknown order IDs, amount mismatch, currency mismatch, invoice conflicts, and paid conflicts are recorded as `requires_review`; they do not mutate invoice paid state.

## 10. Manual Proof Compatibility

Manual payment proof remains intact as fallback. Pending manual proof does not block online payment. If gateway settlement wins first, the invoice paid guard blocks new manual proof submission. Existing pending proof obsolescence/system-note is not yet automated because the current proof schema has no safe explicit obsolete state beyond existing review statuses.

## 11. Security Boundary

- Server key is backend-only.
- Client key is not returned by these backend endpoints.
- API responses do not include raw Midtrans payload, signature, Basic auth value, server key, or client key.
- Logger redaction covers `signature_key`, `server_key`, `client_key`, and Midtrans env key names in request bodies.
- Webhook persistence stores sanitized metadata and hashes only.
- Smart Lock remains `SMART_LOCK_PROVIDER=simulated` and `SMART_LOCK_LIVE_ENABLED=false`.

## 12. Validation Results

Completed:

- Branch confirmed: `feat/m15c-d-midtrans-sandbox-webhook`
- M15C-C foundation present: payment gateway module, transaction table, webhook table, resident/admin endpoints.
- Masked env posture confirmed: payment gateway enabled, provider Midtrans, Midtrans env sandbox, Smart Lock simulated/live false.
- `npm run build` - PASS
- `npm run lint` - PASS
- `npm run db:migrate` - PASS (`012_payment_gateway.sql applied` idempotently)
- `sudo systemctl restart granada-api.service` - PASS after final build
- Public health smoke - PASS (`GET https://api.kostation.web.id/api/v1/health` returned 200 with database and Redis up)
- Real Midtrans Sandbox Snap session smoke - PASS (`snapToken=true`, `paymentUrl=true`, status `pending`)
- Invoice not paid during session creation - PASS (`invoiceStatus=issued`, `paymentStatus=pending` before webhook)
- Valid signed settlement webhook - PASS (`http=200`, result `processed`, invoice became `paid`, transaction became `paid`, `paidAt=true`)
- Duplicate settlement webhook - PASS (`http=200`, result `duplicate`, code `PAYMENT_WEBHOOK_DUPLICATE`)
- Invalid signature webhook - PASS (`http=401`, code `PAYMENT_SIGNATURE_INVALID`, no stack/config details)
- Pending webhook negative - PASS (`http=200`, invoice remained `issued`, payment stayed `pending`)
- Challenge webhook negative - PASS (`http=200`, result `requires_review`, invoice remained `issued`, payment became `challenge`)
- Amount mismatch negative - PASS (`http=200`, code `PAYMENT_AMOUNT_MISMATCH`, invoice remained `issued`, payment became `requires_review`)
- Expire after review/out-of-order negative - PASS (`http=200`, invoice remained `issued`, payment remained `requires_review`)
- Failure webhook negative - PASS (`http=200`, invoice remained `issued`, payment remained `requires_review`)
- Cancel webhook negative - PASS (`http=200`, invoice remained `issued`, payment remained `requires_review`)
- Resident cross-scope check - PASS (`http=404`, code `PAYMENT_INVOICE_NOT_FOUND` for another resident invoice)
- Admin payment transaction list - PASS (`http=200`, list returned gateway transactions)
- Admin payment transaction detail - PASS (`http=200`, detail id matched requested transaction)
- Property owner denied admin payment transaction route - PASS (`http=403`, code `FORBIDDEN`)
- Manual proof paid-invoice guard after gateway settlement - PASS (`http=409`, code `PAYMENT_INVOICE_ALREADY_PAID`)
- Manual proof fallback for unpaid invoice - PASS (`http=201`, proof status `pending_review`)
- Response leakage marker scan - PASS (no server/client key, signature, or Basic auth markers in sampled API responses)

## 13. Known Limitations

- M15C-D is Sandbox staging only and is not production-ready.
- No frontend payment CTA or Snap.js integration is included; that is M15C-E.
- Refund/chargeback events require admin review; v1 does not auto-unpay invoices.
- Existing pending manual proof is not automatically obsoleted after gateway settlement; document as follow-up for admin status UI/workflow.
- Admin UI/status workflows and manual proof obsolescence need a dedicated follow-up in M15C-E or later.

## 14. Next Milestone

M15C-E should implement Penghuni payment CTA/status UI and Admin payment status inspection UI, using the provider-neutral backend response. It should keep redirect/return URL as UX-only and continue treating webhook settlement as the source of truth.
