# M15C-F — Payment Gateway Sandbox E2E QA

> **Date:** 2026-07-05
> **Environment:** VPS staging
> **Domains:** Penghuni `https://app.kostation.web.id`, Admin `https://kelola.kostation.web.id`, API `https://api.kostation.web.id`
> **Verdict:** **PASS**
>
> Initial M15C-F static/deployment/security evidence passed, and M15C-F2 completed the missing Hybrid Manual Browser QA plus fresh Midtrans Sandbox settlement via signed webhook simulation. Payment Gateway remains **Sandbox/Staging only** and **NOT production-ready**.

## 1. Deployment Freshness Gate

Result: **PASS with artifact-level evidence**

- Current branch: `master`.
- Recent local commits include M15C-D and M15C-E2A:
  - `5d47f3c docs(m15c-e2a): frontend payment CTA / admin status UI implementation note`
  - `895ef02 feat(m15c-e2a): admin online payment transaction list + detail dialog`
  - `0a0fbcc feat(m15c-e2a): penghuni online payment CTA + payment status hooks`
  - `ee584f3 feat(payment): add Midtrans sandbox snap webhook settlement`
- Required files exist:
  - `apps/penghuni/src/hooks/usePaymentGateway.ts`
  - `apps/admin/src/hooks/usePaymentTransactions.ts`
  - `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md`
- Source/build checks:
  - `Bayar Online` exists in Penghuni source/build.
  - `Menunggu Pembayaran Online` exists in Penghuni source/build.
  - `Upload Bukti Manual` exists in Penghuni source/build.
  - Old copy `Pembayaran online/payment gateway akan ditangani di milestone berikutnya` was not found in frontend source/build.
- Staging HTML checks:
  - Penghuni `/billing?m15cf=20260705` returned HTTP 200 and referenced `/assets/billing-DvLm_BFp.js`.
  - The local fresh build produced the same Penghuni billing asset hash: `billing-DvLm_BFp.js`.
  - Admin `/payments?m15cf=20260705` returned HTTP 200 and referenced `/assets/payments-DrZap039.js`.
  - The local fresh build produced the same Admin payments asset hash: `payments-DrZap039.js`.

No `git pull`, service restart, or backend restart was performed in this run.

## 2. Static Validation

Result: **PASS**

| Command | Result |
| --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | PASS, warnings only |
| `npm --workspace @granada-kost/admin run lint` | PASS, warnings only |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm --workspace @granada-kost/admin run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS |
| `npm --workspace @granada-kost/admin run build` | PASS |

Two Penghuni files were formatted with Prettier because the first Penghuni lint run failed only on formatting:

- `apps/penghuni/src/hooks/usePaymentGateway.ts`
- `apps/penghuni/src/routes/_app/billing.tsx`

Backend build was not run because this M15C-F run did not change backend source.

## 3. Environment And Health

Result: **PASS for available checks**

- API health returned HTTP 200.
- Health body reported database `up` and Redis `up`.
- Penghuni HTTPS returned HTTP 200.
- Admin HTTPS returned HTTP 200.
- API HTTPS returned HTTP 200.

Required env posture was checked without documenting secret values:

| Key | Expected | Observed |
| --- | --- | --- |
| `PAYMENT_GATEWAY_ENABLED` | `true` | `true` |
| `PAYMENT_GATEWAY_PROVIDER` | `midtrans` | `midtrans` |
| `MIDTRANS_ENV` | `sandbox` | `sandbox` |
| `MIDTRANS_SERVER_KEY` | present, sandbox, masked | present, masked |
| `MIDTRANS_CLIENT_KEY` | present, sandbox, masked | present, masked |
| `PAYMENT_RETURN_URL` | `https://app.kostation.web.id/billing` | matches |
| `PAYMENT_CANCEL_URL` | `https://app.kostation.web.id/billing` | matches |
| `PAYMENT_WEBHOOK_BASE_URL` | `https://api.kostation.web.id` | matches |
| `SMART_LOCK_PROVIDER` | `simulated` | `simulated` |
| `SMART_LOCK_LIVE_ENABLED` | `false` | `false` |

Midtrans Sandbox dashboard notification URL should remain:

`https://api.kostation.web.id/api/v1/payment-gateways/midtrans/webhook`

## 4. Penghuni Browser QA

Result: **PASS via Hybrid Manual Browser QA (M15C-F2)**

Manual/browser evidence:

- User logged in to `https://app.kostation.web.id/billing` as the Delta resident test account.
- Before clicking online payment, the page showed `Bayar Online`, `Upload Bukti Pembayaran Manual`, and unpaid/issued invoice `DEV-INV-2026-07-AK-05A-1B`.
- User clicked `Bayar Online`.
- Midtrans Sandbox Snap TEST payment page opened at `app.sandbox.midtrans.com`, amount `Rp1.800.000`, order `KST-72000000-1-6AE318`.
- After return, Penghuni showed `Menunggu Pembayaran Online`, `Lanjutkan Pembayaran`, and `Cek Status Pembayaran`.

Backend verification immediately after UI click:

| Check | Result |
| --- | --- |
| invoice ID | `72000000-0000-4000-8000-000000000004` |
| provider order ID | `KST-72000000-1-6AE318` |
| invoice status before settlement | `issued` |
| transaction status before settlement | `pending` |
| payment URL present | yes |
| Snap token present | yes |
| paid from redirect/session alone | no |

Paid UI verification after settlement:

- User refreshed `https://app.kostation.web.id/billing`.
- Page showed `Tidak ada tagihan aktif`.
- The July 2026 invoice moved to `Riwayat Tagihan` with badge `Lunas`.
- `Pembayaran Anda` showed `GW-KST-72000000-1-6AE318`, method `Transfer Bank`, amount `Rp 1.800.000`.
- `Bayar Online` and `Upload Bukti Pembayaran Manual` were no longer visible for the paid active invoice.

## 5. Midtrans Sandbox Settlement

Result: **PASS**

Settlement method used: **Option B - signed webhook simulation**.

Reason: the Midtrans Sandbox page opened successfully from the UI, proving hosted Snap/paymentUrl navigation, but the QA run used a controlled signed webhook simulation to complete settlement deterministically from the VPS without printing keys.

| Check | Result |
| --- | --- |
| signed settlement webhook response | HTTP 200, `status=processed`, `safeMessage=Paid webhook processed.` |
| invoice status after settlement | `paid` |
| transaction status after settlement | `paid` |
| transaction method | `bank_transfer` |
| raw status code | `200` |
| invoice `paid_at` | set |
| transaction `paid_at` | set |
| resident payment-status API | HTTP 200, `invoiceStatus=paid`, `paymentStatus=paid` |
| duplicate webhook response | HTTP 200, `code=PAYMENT_WEBHOOK_DUPLICATE`, `status=duplicate` |
| duplicate mutation check | one webhook event row; duplicate delivery marked; no second invoice settlement |

## 6. Negative Webhook QA

Result: **PASS for F2 spot check; full matrix remains covered by M15C-D**

- Invalid signature spot check returned HTTP 401 with `PAYMENT_SIGNATURE_INVALID`.
- DB check after invalid signature confirmed the target invoice/transaction remained `paid`.
- Duplicate settlement webhook returned `PAYMENT_WEBHOOK_DUPLICATE` and remained idempotent.
- Amount mismatch, pending, challenge, expire/failure/cancel remain covered by M15C-D backend evidence and were not destructively rerun against the paid Delta invoice in F2.

## 7. Admin QA

Result: **PASS via Hybrid Manual Browser QA + API detail check**

Manual/browser evidence:

- User opened `https://kelola.kostation.web.id/payments` as `dev.admin@kostation.test`.
- The `Online` tab loaded.
- Gateway transaction for invoice `72000000-0000-4000-8000-000000000004` appeared.
- Row showed source `Gateway`, provider `midtrans`, status `Lunas`, badge `Terkonfirmasi Otomatis`, method `Transfer Bank`, paid date, and only `Detail` action.
- No manual `Verifikasi` / `Tolak` action was shown on the gateway-paid row.
- A `Perlu Tinjauan` row from previous staging negative tests remained visible, as expected.

API detail evidence:

- `GET /api/v1/admin/payment-transactions/:id` returned HTTP 200 for transaction `fba4bef9-26ec-4d4f-8346-eec14c528a48`.
- Response fields were normalized: provider, status, method, amount, currency, paid timestamp, provider order ID.
- Leakage marker scan of the response found no `signature_key`, server/client key names, or Basic auth marker.

## 8. Manual Proof Compatibility

Result: **PASS**

- Manual proof UI remains rendered for unpaid invoices.
- Manual proof fallback remains visible while a gateway attempt is pending.
- Manual proof card is hidden after backend reports the invoice paid; confirmed by Penghuni refresh after settlement.
- Admin manual proof verify/reject code path remains unchanged and separate from gateway transaction UI.
- Fresh F2 API check confirmed paid invoice blocks new manual proof with HTTP 409 and `PAYMENT_INVOICE_ALREADY_PAID`.
- Existing manual proof admin verify/reject flow remains on the `Verifikasi` tab and was visually present in Admin.

## 9. Security / Leakage

Result: **PASS for frontend source/build scan**

Frontend source/build scan checked for key and raw-payload markers. Result:

- No secret values were found in frontend source or bundles.
- The only relevant frontend hit was a safe source comment stating responses are provider-neutral and do not include raw provider payload/signature/server/client keys.
- Admin detail UI renders normalized fields only and does not render raw provider payload metadata.
- No `.env` file is exposed in frontend bundles.
- Smart Lock remains simulated/live disabled.

Backend source contains expected env variable names and backend-only signing/auth logic; this is not a frontend leak.

## 10. Known Limitations

1. Settlement used signed webhook simulation (Option B), not a completed card/VA/QR payment inside the Midtrans simulator UI.
2. Browser console and network panels were not programmatically captured; browser evidence was user-assisted screenshots/observations.
3. Amount mismatch and non-paid webhook statuses were not rerun against the freshly paid Delta invoice in F2 to avoid mutating the passed settlement path; those cases remain covered by M15C-D evidence and the F2 invalid-signature/duplicate spot checks.
4. Payment Gateway remains staging/sandbox only and must not be marked production-ready.

## 11. Files Changed

- `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` — M15C-F/F2 QA evidence updated to PASS.
- `docs/README.md` — index update.

## 12. Final Verdict

**PASS**

What passed:

- Local source freshness gate.
- Staging domain HTTP/HTTPS and API health checks.
- Deployment asset-hash freshness evidence for Penghuni/Admin.
- Penghuni/Admin lint, typecheck, and build.
- Frontend source/build UI evidence.
- Hybrid manual Penghuni browser QA.
- UI-created Midtrans Sandbox Snap/paymentUrl opened.
- Redirect/session alone did not mark invoice paid.
- Signed webhook simulation marked invoice and transaction paid.
- Duplicate webhook was idempotent.
- Invalid signature was rejected.
- Penghuni paid UI hid active payment CTAs after settlement.
- Admin Online tab showed gateway-paid transaction with `Terkonfirmasi Otomatis` and no verify/reject actions.
- Manual proof paid guard returned `PAYMENT_INVOICE_ALREADY_PAID`.
- Frontend leakage scan.
- Smart Lock remains simulated/live disabled.

Next milestone recommendation: proceed to **M15C-G Documentation / Release Update** while keeping Payment Gateway explicitly sandbox/staging-only and **not production-ready**.
