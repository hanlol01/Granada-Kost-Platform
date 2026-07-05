# M15C-F — Payment Gateway Sandbox E2E QA

> **Date:** 2026-07-05
> **Environment:** VPS staging
> **Domains:** Penghuni `https://app.kostation.web.id`, Admin `https://kelola.kostation.web.id`, API `https://api.kostation.web.id`
> **Verdict:** **PARTIAL / FAIL FOR FULL M15C-F ACCEPTANCE**
>
> Static validation, deployment freshness evidence, health checks, and frontend bundle/security checks passed. Full browser-driven E2E settlement could not be completed in this run because no browser automation harness was available and further staging network escalation was blocked by the tool approval layer. Payment Gateway remains **Sandbox/Staging only** and **NOT production-ready**.

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

Result: **NOT FULLY EXECUTED in this run**

Evidence from source/build and staging asset hash:

- UI contains `Bayar Online`.
- UI contains `Upload Bukti Manual`.
- UI contains `Menunggu Pembayaran Online`.
- Old manual-only milestone copy is absent from deployed-equivalent build asset.
- Frontend creates payment sessions via `POST /my/invoices/:invoiceId/payment-sessions`.
- Frontend checks status via `GET /my/invoices/:invoiceId/payment-status`.
- Redirect/return behavior is UX-only: the code sets a sessionStorage return flag and refetches backend status; it does not mark invoices paid from redirect.
- Manual proof remains visible for unpaid/pending states and is hidden once backend reports paid.

Not completed:

- Interactive login to Penghuni app.
- Real click-through on deployed `/billing`.
- Browser console/network inspection.
- Screenshot capture.

## 5. Midtrans Sandbox Settlement

Result: **NOT RERUN in this M15C-F run**

M15C-D previously validated backend Midtrans Sandbox Snap creation and signed webhook settlement, including idempotency and negative webhook handling. This M15C-F run did not complete a fresh real Midtrans simulator payment or fresh signed settlement webhook because the full browser/network phase was blocked.

Settlement method used in this run: **none**.

## 6. Negative Webhook QA

Result: **NOT RERUN in this M15C-F run**

The invalid signature, duplicate webhook, amount mismatch, pending, challenge, expire/failure/cancel cases remain covered by M15C-D backend evidence, but were not re-executed here. Because they were not rerun in this M15C-F pass, full acceptance cannot be marked PASS.

## 7. Admin QA

Result: **PARTIAL PASS by source/build evidence; browser not executed**

Evidence from source/build:

- Admin payments route includes an `Online` tab.
- The online tab fetches `GET /admin/payment-transactions`.
- Table renders gateway columns: Invoice, Penghuni, Jumlah, Sumber, Provider, Status, Metode, Dibuat, Lunas, and Detail.
- Gateway badges exist: `Gateway`, `Terkonfirmasi Otomatis`, and `Perlu Tinjauan`.
- Detail dialog renders normalized safe fields only.
- Gateway online tab has detail-only behavior; manual verify/reject actions remain on the manual proof verification tab.
- 403 handling renders the existing forbidden state for admin transaction access.

Not completed:

- Interactive Admin login.
- Browser inspection of the deployed Online tab.
- Opening a real transaction detail dialog in the browser.
- Property owner/non-admin browser route verification.

## 8. Manual Proof Compatibility

Result: **PARTIAL PASS by source/API evidence**

- Manual proof UI remains rendered for unpaid invoices.
- Manual proof fallback remains visible while a gateway attempt is pending.
- Manual proof card is hidden after backend reports the invoice paid.
- Admin manual proof verify/reject code path remains unchanged and separate from gateway transaction UI.
- M15C-D/M15C-E2B API smoke previously confirmed paid invoices reject manual proof with `PAYMENT_INVOICE_ALREADY_PAID`.

Fresh browser upload and admin verify/reject manual proof checks were not completed in this M15C-F run.

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

1. Full M15C-F browser QA was not completed in this run.
2. Fresh Midtrans Sandbox simulator settlement was not completed in this run.
3. Fresh signed settlement webhook simulation was not rerun in this run.
4. Fresh negative webhook matrix was not rerun in this run.
5. Fresh Admin browser route/detail checks were not completed in this run.
6. Screenshots were not captured.
7. Browser console and network panels were not inspected.

## 11. Files Changed

- `apps/penghuni/src/hooks/usePaymentGateway.ts` — Prettier formatting only.
- `apps/penghuni/src/routes/_app/billing.tsx` — Prettier formatting only.
- `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` — new M15C-F QA evidence document.
- `docs/README.md` — index update.

## 12. Final Verdict

**PARTIAL / FAIL FOR FULL M15C-F ACCEPTANCE**

What passed:

- Local source freshness gate.
- Staging domain HTTP/HTTPS and API health checks.
- Deployment asset-hash freshness evidence for Penghuni/Admin.
- Penghuni/Admin lint, typecheck, and build.
- Frontend source/build UI evidence.
- Frontend leakage scan.
- Smart Lock remains simulated/live disabled.

What prevents PASS:

- No fresh interactive browser QA.
- No fresh settlement proof in this run.
- No fresh negative webhook matrix in this run.
- No screenshots/browser artifacts.

Next milestone recommendation: complete a second M15C-F browser/API execution run with working browser automation or manual browser access, then proceed to **M15C-G Documentation / Release Update** only after the full acceptance checklist passes.
