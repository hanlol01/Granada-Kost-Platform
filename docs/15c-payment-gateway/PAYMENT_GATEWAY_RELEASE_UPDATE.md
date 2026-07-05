# M15C-G — Payment Gateway Release / Documentation Update

> **Milestone:** M15C-G (documentation / release update only — no implementation, no QA execution)
> **Date:** 2026-07-05
> **Role:** Kostation Release / Documentation Reviewer
> **Status:** Closes the M15C Payment Gateway track as **sandbox/staging ready**; governance docs refreshed
> **Binding inputs:** `PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md` (M15C-A), `MIDTRANS_PROVIDER_CONTRACT_FREEZE.md` (M15C-B), `BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` (M15C-C), `MIDTRANS_SANDBOX_SNAP_WEBHOOK_SETTLEMENT.md` (M15C-D), `FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_PLAN.md` (M15C-E1), `FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` (M15C-E2A/E2B), `PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` (M15C-F/F2, PASS), `docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md` (M15B-A, PASS), `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` (M14F), `docs/13-smart-lock/SMART_LOCK_READY_FOR_SITE_TRIAL_EXECUTION_PENDING_FREEZE.md` (M13F-D), `docs/13-smart-lock/SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md` (M13F-C4)
>
> This document contains **no real credentials, no merchant keys, no server/client key values**.
> No lint, typecheck, build, API smoke, browser QA, migration, deployment, or any terminal/browser command was run for M15C-G. GitLab Duo has no shell access; all cited validation results were produced earlier and externally and are referenced from committed documents/artifacts.
> **Payment Gateway is not production-ready.** **Production payment activation pending.** Production release remains **NOT READY** (M14F unchanged). **Smart Lock status unchanged**: "ready for controlled site trial preparation, execution pending"; live execution NO-GO.
> No backend/frontend/mockup source change. No ADR change. Manual payment proof (M12) is NOT removed or weakened.

---

## 1. Executive Summary

- The M15C Payment Gateway track is **complete from M15C-A through M15C-G**.
- **Payment Gateway sandbox/staging ready.** **Midtrans Sandbox validated** end-to-end on VPS staging: Snap session creation from the Penghuni UI, signed webhook settlement, idempotent invoice paid transition, Admin gateway transaction UI (M15C-F/F2 verdict **PASS**).
- **Webhook is the source of truth** for automatic invoice paid status. **Redirect is UX only** and never marks paid.
- **Manual payment proof remains fallback** — unchanged behavior; admin verification remains the sole manual settlement authority; paid-invoice guard (`PAYMENT_INVOICE_ALREADY_PAID`) intact.
- **Production payment activation pending**: no Midtrans production keys/activation, no production notification URL, no production payment QA. **Payment Gateway is not production-ready** and production release remains NOT READY.

## 2. Completed Milestones (M15C-A → M15C-F/F2)

| Milestone | Deliverable | Status | Document |
| --- | --- | --- | --- |
| M15C-A | Payment gateway architecture / product freeze (provider-agnostic; Midtrans Sandbox first adapter) | Freeze recorded | `PAYMENT_GATEWAY_ARCHITECTURE_FREEZE.md` |
| M15C-B | Midtrans provider contract freeze (Snap decision, webhook verification, status mapping, idempotency) | Freeze recorded | `MIDTRANS_PROVIDER_CONTRACT_FREEZE.md` |
| M15C-C | Backend payment gateway foundation (fail-closed env, `payment_transactions` + `payment_webhook_events`, provider-neutral endpoints, manual-proof paid guard) | Implemented & validated | `BACKEND_PAYMENT_GATEWAY_FOUNDATION.md` |
| M15C-D | Midtrans Sandbox Snap session + signed webhook settlement (backend-only) | Implemented & validated on VPS staging | `MIDTRANS_SANDBOX_SNAP_WEBHOOK_SETTLEMENT.md` |
| M15C-E1 | Frontend payment UX plan (binding rules, Penghuni state machine A–F, Admin UI contract) | Plan recorded | `FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_PLAN.md` |
| M15C-E2A/E2B | Frontend Penghuni "Bayar Online" + Admin Gateway status UI; external technical validation (lint/typecheck/build + API smoke) | Implemented & validated (external) | `FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` |
| M15C-F/F2 | Payment gateway sandbox E2E QA on VPS staging (Hybrid Manual Browser QA + signed webhook settlement + idempotency) | **PASS** | `PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` |

M15C-G (this document) closes the track with the governance documentation refresh.

## 3. Staging Capabilities (Validated)

Validated on VPS staging (`https://app.kostation.web.id`, `https://kelola.kostation.web.id`, `https://api.kostation.web.id`) with Midtrans **Sandbox**:

- Penghuni **"Bayar Online"** works from the Billing page; Midtrans Sandbox Snap/payment page opens.
- Backend creates/reuses one active pending attempt per invoice; session creation never marks paid.
- **Signed webhook settlement** marks the gateway transaction and invoice paid atomically; **duplicate webhooks are idempotent**; invalid signatures are rejected; non-paid/mismatch/refund/chargeback/challenge events never mark paid.
- Penghuni UI states: pending ("Menunggu Pembayaran Online"), post-return confirming copy, "Lunas" with source label, failed/expired retry, "Perlu Tinjauan" — paid is displayed only from backend payment status.
- Admin **"Online" tab**: gateway transaction list/detail, badges Gateway / "Terkonfirmasi Otomatis" / "Perlu Tinjauan"; **gateway-paid rows have no manual verify/reject**.
- Manual payment proof fallback visible while unpaid; hidden/blocked when paid.

## 4. Not Production-Ready (Pending)

- **Midtrans production keys / activation: not configured.** Sandbox keys only; no production credential exists in repo, docs, or staging.
- **Production payment notification URL: not configured.**
- **Production payment QA: not run.**
- Production deployment/env checklist (M14A Section 8): not executed.
- Stakeholder / release owner approval: pending (M14F).
- Refund/chargeback automation, reconciliation/payout, receipt/nota: out of scope (manual/administrative handling only).
- Overall production release: **NOT READY** (M14F verdict unchanged).

## 5. Manual Payment Proof Compatibility

- **Manual payment proof remains fallback** — M12 behavior preserved: proof enters `pending_review`; **admin verification remains the sole manual settlement authority**; invoices are never auto-paid by proof upload.
- Gateway and manual paths coexist on the Penghuni Billing page; manual proof is visually secondary while unpaid and hidden when the invoice is paid.
- Backend guard `PAYMENT_INVOICE_ALREADY_PAID` blocks new manual proofs for paid invoices (verified intact in M15C-F/F2).

## 6. Security Boundaries

- **Server key is backend-only** — never in frontend env, bundles, repo, docs, logs, or API responses. Client key is not exposed (Snap.js not enabled; no client key env in frontend).
- **Webhook is the source of truth**; Midtrans `signature_key` (SHA512) verified before any mutation. **Redirect is UX only.**
- No raw provider payload to the frontend or stored unsanitized — normalized provider-neutral fields + `payload_hash` only; minimal PII in Snap payload (generic item `Tagihan Kostation`).
- Fail-closed defaults: `PAYMENT_GATEWAY_ENABLED=false` unless explicitly enabled per environment; `PAYMENT_CONFIG_MISSING` before provider IO when misconfigured.
- Resident self-scope and property scope enforced on all payment reads/writes; Admin 403 renders ForbiddenState.
- Smart Lock posture unchanged during all M15C work: `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`.

## 7. Evidence References

- `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` — M15C-F/F2 verdict PASS (deployment freshness, static validation, health/env posture, Hybrid Manual Browser QA, signed webhook settlement, duplicate/idempotency, invalid signature, manual-proof paid guard).
- `docs/15c-payment-gateway/MIDTRANS_SANDBOX_SNAP_WEBHOOK_SETTLEMENT.md` — M15C-D implementation + staging validation.
- `docs/15c-payment-gateway/FRONTEND_PAYMENT_CTA_ADMIN_STATUS_UI_IMPLEMENTATION.md` — M15C-E2A/E2B implementation + external technical validation.
- `docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md` — M15B-A staging baseline PASS.
- `docs/14-production-readiness/RELEASE_READINESS_VERDICT.md` — M14F verdict (production NOT READY; unchanged).

All validation cited above was executed earlier and externally (Codex / hybrid manual); nothing was re-executed for M15C-G.

## 8. Next Milestones

- **M15D or M16 — per product decision.** Candidate paths:
  1. Production hardening (M14A Section 8 checklist, storage decision, `/audit/*` + `/reports/exports`).
  2. Smart Lock real site trial (M13F-C5) — only after M13F-C4 Sections 6–7 are complete; live execution remains NO-GO until then.
  3. CCTV planning.
  4. **Payment Gateway Production Activation / Midtrans Production Readiness** (gated): production keys backend-only, production notification URL, production payment QA, deployment checklist, stakeholder approval.

## 9. Acceptance Checklist (M15C-G)

| Item | Status |
| --- | --- |
| `PROJECT_MASTER.md` updated (M15C complete; sandbox/staging ready; production NOT READY) | Done |
| `ROADMAP.md` updated (M15C-A..G complete; gated production activation item added) | Done |
| `CHANGELOG.md` updated (M14F, M15A, M15B-A, M15C-A..G entries) | Done |
| `PROJECT_HANDOFF.md` updated (payment gateway posture, env, blockers, operator steps) | Done |
| `INTERNAL_DEMO_CHECKLIST.md` Section 14 added (sandbox-only demo note) | Done |
| `docs/README.md` checked/updated (M15C index complete, path fixes, no duplicates) | Done |
| Payment Gateway marked **sandbox/staging ready only** | Done |
| Production **not** marked ready; **production payment activation pending** | Done |
| Smart Lock status unchanged (site trial pending; live execution NO-GO) | Done |
| No code implementation; no mockup change; no ADR change | Done |
| No credentials added (env names/placeholders only) | Done |
