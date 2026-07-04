# M14A — Kostation Production Readiness / Internal Demo Refresh Audit

> **Milestone:** M14A (documentation/audit only — no implementation, no QA execution, no live commands)
> **Date:** 2026-07-04
> **Role:** Kostation Release / Architecture Reviewer
> **Status:** Audit recorded; input for M14B–M14F QA and release readiness track
> **Primary sources:** `docs/00-project/PROJECT_MASTER.md`, `docs/00-project/ROADMAP.md`, `docs/00-project/CHANGELOG.md`, `docs/00-project/PROJECT_HANDOFF.md`, `docs/00-project/INTERNAL_DEMO_CHECKLIST.md`, `docs/12-product-readiness/` (M12A–M12D implementation notes), `docs/13-smart-lock/` (M13A–M13F-D), `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`, `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001), `artifacts/m13f-c4-site-evidence-pack/`, `artifacts/m12h-final-demo-pass/`, `artifacts/internal-demo/`
>
> This document contains **no real secrets and no real device IDs**.
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal command was run for M14A. GitLab Duo has no shell access; all cited validation results were produced earlier and externally (Codex) and are referenced from committed documents/artifacts, not re-executed here.
> **No live Smart Lock command was executed for this document.** `SMART_LOCK_LIVE_ENABLED` remains `false`.
> **Smart Lock live integration is NOT marked complete by this document.** No ADR is changed.

---

## 1. Executive Summary

| Readiness dimension | Level |
| --- | --- |
| **Internal demo readiness** | **READY** for a refreshed internal demo of Phase 1 + M12 surfaces (QA-01 PASS 2026-07-02; QA-M12G security PASS; QA-M12H visual E2E PASS 2026-07-03). A consolidated re-regression after the M13 backend additions is recommended before the next demo (M14B/M14C). |
| **Production readiness** | **NOT READY.** No production deployment checklist has been executed; storage is local-disk; audit viewer/reports export endpoints missing; secret rotation unconfirmed; no post-M13 full regression evidence. |
| **Smart Lock site-trial status** | Frozen by M13F-D as **"Ready for controlled site trial preparation, execution pending."** CONDITIONAL GO for scheduling/preparation; **NO-GO for live execution.** |
| **Major blockers** | Smart Lock site evidence absent (approvals, credential rotation, real device mapping, site-env dry-run); post-M12/M13 API + browser re-regression not yet run; governance docs (ROADMAP/CHANGELOG/PROJECT_MASTER/PROJECT_HANDOFF) contain no M13 entries; deployment/env checklist not executed. |
| **Recommended next action** | Run **M14B — API Regression & Security Smoke** (external validation agent), then M14C browser regression and M14D demo script refresh. Do **not** start the Smart Lock live site trial until physical/site conditions are available. |

## 2. Completed Milestone Summary

| Track | Milestones | Summary |
| --- | --- | --- |
| Core backend | M1–M9 | Monorepo foundation; NestJS + PostgreSQL + Redis foundation; IAM/RBAC + JWT + refresh rotation + audit logs; Property + Room; Resident + Occupancy; seed layers; Billing Phase 1 (manual transfer/proof workflow foundation); Complaint + Maintenance; Vehicle + Parking; Notification Phase 1. All recorded complete. |
| Smart Lock foundation | M10 (to 10E) | Smart Lock planning, migration, repository/service/gateway abstraction, API layer with RBAC + property scope + resident self-scope, **simulated** Tuya gateway. |
| Frontend Phase 1 | M11 (A–G) | Admin + Penghuni live from real backend. QA-01 Final Regression PASS (2026-07-02). Internal Demo Ready. Reports + audit-minimum with explicit Audit Viewer / Export placeholders. |
| File upload / manual payment / complaint attachment | M12 (A–H) | ADR-BE-FILE-001 backend-mediated File API (`files` table, magic-byte validation, size limits, checksums, rate limit, audit); generic frontend upload engine; Penghuni manual payment proof (`pending_review`, admin verification = settlement authority); complaint create with 1–5 photo attachments; Admin preview/review. QA-M12G cross-scope security boundary PASS; QA-M12H visual E2E demo pass PASS. |
| Smart Lock live foundation | M13 (A–F-D) | M13A readiness plan (PoC sanitized, reference-only); M13B architecture freeze; M13C Tuya provider config + client skeleton; M13D read-only diagnostic; M13E read-only sync; M13F-A safety freeze; M13F-B command guard; M13F-C1 runbook; M13F-C2 guarded live unlock transport; M13F-C3 dry-run PASS (after provider-ID leakage fix `757b0db9`); M13F-C4 Go/No-Go (CONDITIONAL GO / NO-GO); M13F-C4.1 sanitized evidence pack (B-23 partially closed); M13F-D freeze — "Ready for site trial preparation, execution pending." |

## 3. Feature Readiness Matrix

Status legend — Backend/Frontend: Ready / Partial / Placeholder / Not built. QA: latest recorded external evidence. Demo: safe to show in internal demo. Production: safe to declare production-complete.

| Feature | Backend | Frontend | QA | Demo | Production | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication (JWT + refresh rotation) | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | Admin + Penghuni login/logout validated 2026-07-02. |
| Admin dashboard | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | Shares selectors with Reports for identical numbers. |
| Penghuni dashboard (Home) | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | PWA mobile-first. |
| Property / Room / Resident | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | RBAC + property scope + occupancy source of truth. |
| Billing | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | Manual transfer workflow; no payment gateway (deferred). |
| Manual payment proof upload (Penghuni) | Ready (M12C3) | Ready | QA-M12H PASS | Yes | Pending M14 regression | Fallback path; proof `pending_review`; admin verification = settlement authority. |
| Admin payment proof preview/review | Ready (M12C5) | Ready | QA-M12H PASS | Yes | Pending M14 regression | Verify/reject in dialog; authorized blob preview. |
| Complaint create with attachment (Penghuni) | Ready (M12C4/D) | Ready | QA-M12H PASS | Yes | Pending M14 regression | 0–5 photos, transactional attach, resident-safe categories endpoint. |
| Admin complaint attachment preview | Ready (M12C5) | Ready | QA-M12H PASS | Yes | Pending M14 regression | Safe metadata, no `storage_path`. |
| File API (upload/download/content/delete) | Ready (M12C1) | n/a (engine M12C2) | QA-M12G PASS | Yes (via flows) | Pending storage decision | Local disk provider; S3 swap pending; cleanup is manual command. |
| Vehicle / Parking | Ready | Ready | QA-01 PASS | Yes | Pending M14 regression | |
| Notifications | Ready (M9) | Penghuni ready; Admin page may be placeholder | QA-01 PASS | Yes (Penghuni) | Pending M14 regression | Push/WhatsApp deferred (M11J). |
| Smart Lock — simulated mode | Ready (M10E) | Placeholder only | M13C runtime validation PASS (28/28, external) | API-level only | No | Default provider; rollback path for live trials. |
| Smart Lock — read-only diagnostic | Ready (M13D) | None | Evidence-pack safe-failure checks | API-level only | No | Normalized safe failures; masked provider ID. |
| Smart Lock — read-only sync | Ready (M13E) | None | Evidence-pack safe-failure checks | API-level only | No | Provider ID masked post-C3 fix. |
| Smart Lock — command guard | Ready (M13F-B) | None | C4.1 evidence pack PASS | API-level only (returns `LIVE_COMMAND_DISABLED`) | No | Fail-closed gates, RBAC, idempotency, rate limit, audit. |
| Smart Lock — guarded live unlock transport | Implemented (M13F-C2) | None | Dry-run (live disabled) PASS; fake-server harness PASS (external) | Dry-run only | No | **Site-pending**; never exercised against a real device. |
| Smart Lock — physical live trial | Not executed | None | None | **No** | No | NO-GO until M13F-C4 Sections 6–7 complete; M13F-C5 gated. |
| Smart Lock — temporary PIN | Not built | None | None | **No** | No | M13G, gated; out of scope. |
| Smart Lock — frontend live command UI | Not built | Not built | None | **No** | No | Forbidden before a successful live backend trial (M13F-D rule 4). |

## 4. Smart Lock Status Clarification

- **Backend foundation ready** (M10E simulated + M13C provider config/client skeleton).
- **Read-only diagnostic (M13D) and read-only sync (M13E) ready**, with masked provider IDs and normalized safe failures.
- **Command guard ready** (M13F-B): fail-closed pre-provider gates, RBAC (admin/manager + `smart_lock.manage` only), property scoping from PostgreSQL, confirmation/reason/idempotency requirements, rate limits, audit intent/result rows.
- **Guarded live unlock transport implemented** (M13F-C2): `remote_unlock`/`emergency_unlock` only; `remote_lock` returns `UNSUPPORTED_CAPABILITY`.
- **C3-class dry-run live-disabled evidence exists**: M13F-C3 PASS (after leakage fix) and the sanitized M13F-C4.1 pack at `artifacts/m13f-c4-site-evidence-pack/` (verdict PASS, zero leakage hits, B-23 `PARTIALLY_CLOSED_PLACEHOLDER_ENV`).
- **M13F-C4/C4.1 decision: CONDITIONAL GO** for scheduling/preparation only.
- **Live execution remains NO-GO** — fail-closed until every mandatory criterion in the Go/No-Go document is PASS with recorded evidence.
- **M13F-D freezes the status** as "Ready for Site Trial Preparation, Execution Pending" (`docs/13-smart-lock/SMART_LOCK_READY_FOR_SITE_TRIAL_EXECUTION_PENDING_FREEZE.md`).
- **No production live unlock until real site trial evidence exists** and the decision is explicitly upgraded to execution GO.
- **Remote lock and temporary PIN remain out of scope** (capability-confirmed milestone and M13G respectively).

## 5. Production Blockers

**P0 (blocking production if Smart Lock live is a required production feature):**

1. Smart Lock live execution has never been physically tested — no real site trial evidence exists.
2. Site approvals (A-01..A-06), real test device mapping (D-13..D-20), and written credential rotation confirmation (C-07) are all missing.

**P1 (blocking a production-readiness declaration in general):**

3. Final browser regression after all M12–M13 backend changes not yet run (last full browser regression: QA-01 on 2026-07-02; M13 added smart-lock modules afterward).
4. API smoke regression across all modules post-M13 not yet run.
5. Documentation state is stale: `ROADMAP.md`, `CHANGELOG.md`, `PROJECT_MASTER.md`, and `PROJECT_HANDOFF.md` contain **no M13 entries** (still describe Smart Lock live as "deferred M10G").
6. Deployment/env checklist (Section 8) has not been executed against any target environment.
7. Secret rotation confirmation missing for anything ever present in the PoC folder or repository history (also Smart Lock C-07).

**P2 (should be resolved before or shortly after go-live):**

8. Artifact/evidence completeness: no committed C3 site-env evidence; audit viewer (`/audit/*`) and reports export (`/reports/exports`) endpoints missing (frontend placeholders exist).
9. File storage on local disk with manual cleanup (`npm run file:cleanup`); S3 swap and cron automation deferred.

## 6. Internal Demo Recommendation

**Safe to demo:**

- Auth/login (Admin + Penghuni), logout, session handling.
- Admin dashboard, Rooms, Tenants, Payments, Complaints, Vehicles, Parking, Reports.
- Penghuni Home, Billing, Complaints, Notifications, Info, Profile.
- Manual payment proof upload (Penghuni) and Admin preview/review (verify/reject).
- Complaint create with attachments (Penghuni) and Admin attachment preview.
- Smart Lock **simulated** mode and read-only diagnostic/sync where appropriate — API-level demonstration only, presented explicitly as "backend foundation, not live".
- Smart Lock command guard demonstrably returning `LIVE_COMMAND_DISABLED` — useful to show the fail-closed safety posture.

**Do NOT demo as production-ready:**

- Physical live unlock (never executed; NO-GO).
- Remote lock (`UNSUPPORTED_CAPABILITY`).
- Temporary PIN (not built; M13G gated).
- Resident unlock (denied `403` by frozen policy).
- Smart Lock fleet rollout (single-test-device constraint).

## 7. QA Recommendation (M14 Track)

| Milestone | Scope |
| --- | --- |
| **M14B — API Regression & Security Smoke** | Full API regression across auth, property/room/resident, billing, payment proof, complaints + attachments, files, vehicles/parking, notifications, smart-lock (simulated + guard dry-run). Executed externally (Codex); documentation agents must not claim execution. |
| **M14C — Browser Regression** | Admin + Penghuni full browser flows including M12 surfaces; refresh of QA-01/QA-M12H coverage on current `master`. |
| **M14D — Internal Demo Script Refresh** | Update `INTERNAL_DEMO_CHECKLIST.md` demo script to include M12 flows and the Smart Lock safety-posture demonstration. |
| **M14E — Documentation/Roadmap Refresh** | Close the documentation gaps in Section 9 (ROADMAP/CHANGELOG/PROJECT_MASTER/PROJECT_HANDOFF M13 entries, API planning). |
| **M14F — Release Readiness Verdict** | Consolidated go/no-go for internal demo + production posture based on M14B–M14E evidence. |

**QA focus areas:**

- Auth/RBAC boundaries (401/403 per role, refresh rotation).
- Property scoping on every operational resource; resident self-scope.
- File upload/download/preview: MIME/magic-byte/size enforcement, no `storage_path`, no public URLs, content only via `GET /files/:fileId/content`.
- Payment proof flow: `pending_review` → admin verify/reject; no auto-settlement.
- Complaint attachment flow: ownership/property/purpose validation, transactional attach.
- Smart Lock: auth/RBAC denial matrix, guard validation codes, dry-run `LIVE_COMMAND_DISABLED`, idempotency replay, rate limit.
- No secret / raw provider payload / unmasked provider device ID leak in responses, logs, or artifacts.
- Admin/Penghuni browser flows end-to-end without fatal console errors.

## 8. Deployment / Env Checklist

To be executed per target environment before any production declaration (not executed in M14A):

- [ ] Required backend env present and validated (fail-fast on missing): database, Redis, JWT secrets, CORS/origins, file storage root.
- [ ] **Redis available** — required for rate limit, idempotency, token cache, queue; smart-lock guard fails closed without it.
- [ ] **PostgreSQL migrations applied** through the latest migration (includes `011_files.sql` and smart-lock tables).
- [ ] File storage path outside web root; quota/disk monitoring in place; retention/cleanup policy active (currently manual `npm run file:cleanup` — cron automation deferred).
- [ ] **Smart Lock env defaults:** `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`. Live flag may only be `true` inside an approved M13F-C5 window and must be reverted immediately after.
- [ ] **Tuya credentials backend-only**, from uncommitted `.env`/secret manager (`credential_ref` production path); never in repo, logs, or client-reachable config.
- [ ] **No frontend Tuya env** — no provider variable of any kind in `apps/admin` or `apps/penghuni` builds.
- [ ] Production secret handling: rotation policy in place; written rotation confirmation for anything ever exposed in PoC/history (C-07).
- [ ] Log/audit retention configured; audit write path monitored (guard refuses commands if audit intent cannot be written).
- [ ] Upload cleanup policy confirmed (24 h / 30 d / 90 d retention classes per M12 handoff).

## 9. Documentation Gap Checklist

| Document | Refresh needed? | Gap |
| --- | --- | --- |
| `PROJECT_MASTER.md` | **Yes** | Status frozen at 2026-07-03 (M12); no M13 track; Smart Lock described only as "deferred M10G". |
| `ROADMAP.md` | **Yes** | No Milestone 13 section; "Next Milestone" list predates M13. |
| `CHANGELOG.md` | **Yes** | Latest entries are M12H (2026-07-03); no M13A–M13F-D entries. |
| `PROJECT_HANDOFF.md` | **Yes** | Updated at M12G; deferred list does not reflect M13 foundation or the M13F-D freeze. |
| `INTERNAL_DEMO_CHECKLIST.md` | **Yes (M14D)** | Demo script predates M13; should add Smart Lock safety-posture demo and consolidated M12 flows. |
| `DEVELOPMENT_WORKFLOW.md` | Review | Role separation documented at M12G; verify M13/M14 validation flow (external Codex validation) is reflected. |
| `docs/README.md` index | **Updated in M14A** | `14-production-readiness/` entry added; M13F-D note pending in MR !1. |
| `API_PLANNING.md` / API docs | **Yes** | M12 status section exists; smart-lock M13 endpoints (diagnostic, sync-readonly, command) not yet documented there. |

Per the M14A scope, none of these are updated here except the `docs/README.md` index; the refresh work is assigned to **M14E**.

## 10. Risk Register

| # | Risk | Mitigation |
| --- | --- | --- |
| R-01 | **Smart Lock physical uncertainty** — real device behavior never observed | Keep NO-GO fail-closed posture; M13F-C5 single-device constraints (person-at-door, manual key, immediate flag revert); simulated rollback path always available. |
| R-02 | **Credential leakage** — Tuya/PoC secrets exposed | Written rotation confirmation (C-07) before any real-device use; backend-only secrets; pre-flight sweeps; leakage marker checks on all evidence packs. |
| R-03 | **File storage growth** — local disk fills up | Bounded uploads (2 MB image / 5 MB PDF), rate limits, retention/cleanup policy; prioritize cron cleanup automation and S3 swap decision before production. |
| R-04 | **Upload abuse** — malicious or excessive uploads | Magic-byte validation, MIME allowlist per purpose, extension blocklist, checksums, per-user/property rate limits, full audit lifecycle. |
| R-05 | **Property-scope regression** — cross-property data exposure | M14B regression must re-run the QA-M12G-style denial matrix (401/403/404 cases) across all modules including smart-lock. |
| R-06 | **Browser regression** — UI breakage since QA-01/QA-M12H | M14C full browser regression on current `master` before the next demo. |
| R-07 | **Documentation drift** — governance docs contradict actual state | Section 9 gaps assigned to M14E; treat implementation/freeze docs as source of truth until then (per `docs/README.md`). |
| R-08 | **Deployment env mismatch** — prod env missing required vars/services | Execute Section 8 checklist per environment; fail-fast env validation already in backend; Redis/PostgreSQL health checks. |

## 11. Recommended Next Milestone

**M14B — API Regression & Security Smoke** (external validation agent), followed by M14C–M14F as defined in Section 7.

Constraints:

- **Do not start the live Smart Lock site trial** until physical/site conditions are available (approvals, rotated credentials, real device mapping, person-at-door, manual key, approved window).
- **Smart Lock remains execution pending** per the M13F-D freeze; M14 work must not alter the guard/transport code without triggering the M13F-D rule-3 revalidation requirement.

## 12. Acceptance Checklist (M14A)

- [x] Production readiness audit document created (this document, documentation only).
- [x] Feature readiness matrix included (Section 3, 20 features).
- [x] Smart Lock status clarified (Section 4) — not marked complete.
- [x] Production blockers listed by severity (Section 5).
- [x] Internal demo scope defined — safe vs not-production-ready (Section 6).
- [x] QA next track defined — M14B–M14F with focus areas (Section 7).
- [x] Deployment/env checklist included (Section 8).
- [x] Documentation gaps listed (Section 9); only the README index updated.
- [x] No code implementation, no source change, no ADR change.
- [x] No live Smart Lock execution; `SMART_LOCK_LIVE_ENABLED` remains `false`.
- [x] No secrets or real device IDs included.
- [x] No terminal validation (lint/build/typecheck/tests/API/browser) claimed or run for M14A.

## 13. Open Questions

| # | Question | Blocking? |
| --- | --- | --- |
| Q-01 | Is Smart Lock live unlock a required feature for the first production release, or can production launch with simulated/read-only Smart Lock? (Determines whether Section 5 P0 items block production.) | Blocks production scoping |
| Q-02 | Target production storage: stay on local disk with quota monitoring, or execute the S3 swap before launch? | Blocks deployment checklist completion |
| Q-03 | Who executes M14B/M14C (external validation agent) and on which environment? | Blocks M14B start |
| Q-04 | Should MR !1 (M13F-D freeze) be merged before the M14E documentation refresh to avoid index conflicts? | Non-blocking, sequencing only |

---

## Review History

| Version | Status | Description |
| --- | --- | --- |
| v1 | Recorded | M14A audit authored from M1–M13 documentation and committed QA/evidence artifacts. Verdict: internal demo READY (re-regression recommended); production NOT READY; Smart Lock execution pending. |
