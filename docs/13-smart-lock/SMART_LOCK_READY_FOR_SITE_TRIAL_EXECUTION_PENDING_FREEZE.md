# M13F-D — Smart Lock Ready for Site Trial, Execution Pending Freeze

> **Milestone:** M13F-D (documentation-only freeze — no implementation, no live execution)
> **Date:** 2026-07-04
> **Role:** Kostation Release / Architecture Reviewer
> **Status:** Freeze recorded; closes M13F as **"Ready for controlled site trial preparation, execution pending"**; binding until superseded by an accepted M13F-C5 session record
> **Binding inputs:** `docs/13-smart-lock/SMART_LOCK_CONTROLLED_LIVE_COMMAND_SITE_TRIAL_RUNBOOK.md` (M13F-C1), `docs/13-smart-lock/SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md` (M13F-C4), `docs/13-smart-lock/SMART_LOCK_CONTROLLED_LIVE_COMMAND_SAFETY_FREEZE.md` (M13F-A), `docs/13-smart-lock/SMART_LOCK_COMMAND_GUARD_IMPLEMENTATION.md` (M13F-B), `docs/13-smart-lock/SMART_LOCK_LIVE_UNLOCK_TRANSPORT_IMPLEMENTATION.md` (M13F-C2), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_DIAGNOSTIC_IMPLEMENTATION.md` (M13D), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_SYNC_IMPLEMENTATION.md` (M13E), `docs/13-smart-lock/SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md` (M13B — binding for M13C–M13H), `docs/13-smart-lock/SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A), `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Evidence inputs:** `artifacts/m13f-c4-site-evidence-pack/` (README.md, qa-summary.json, api-results-sanitized.json, db-audit-sanitized.json, leakage-check.txt, limitations.md)
> **Reference-only source:** `reference/tuya-paloma-poc/README.md` (legacy PoC — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers are placeholders.
> No lint, typecheck, build, API, or browser validation was run for M13F-D. GitLab Duo has no shell access; all cited validation results were produced earlier and externally and are referenced from committed evidence, not re-executed here.
> **No live Smart Lock command was executed for this document.** `SMART_LOCK_LIVE_ENABLED` remains `false`. Nothing here executes, implements, or enables live unlock, live lock, or temporary PIN.
> **Smart Lock live integration is NOT marked complete by this document.**
> **ADR-SL-001 remains binding and unchanged.** This freeze operates within the M13B architecture freeze, the M13F-A safety freeze, the M13F-C1 runbook, and the M13F-C4 decision; no frozen decision is changed and no new ADR is required.

---

## 1. Executive Summary

- The **M13F backend is ready for controlled site trial preparation.** The command guard (M13F-B), the guarded live unlock transport (M13F-C2), and the C3-class dry-run behavior (M13F-C3, re-evidenced by M13F-C4.1) are complete and documented.
- **Live physical unlock has NOT been executed.** `SMART_LOCK_LIVE_ENABLED=true` has never been used for a site session.
- **Live execution remains NO-GO** per M13F-C4 Section 1: mandatory site-side evidence (approvals, credential rotation confirmation, real device mapping, person-at-door, manual key, approved window, site-env dry-run) is absent.
- **Scheduling and preparation remain CONDITIONAL GO.** The team may collect approvals, prepare the site environment, and gather M13F-C4 Section 6 evidence.
- **`SMART_LOCK_LIVE_ENABLED` must remain `false` by default** in every environment. It may only be set to `true` inside a future approved test window under M13F-C5 constraints, and must be reverted immediately after the attempt.
- **Smart Lock live integration is not complete** and must not be reported as complete until real site trial evidence exists and is accepted.

## 2. Completed Milestone Summary

| Milestone | Deliverable | Status |
| --- | --- | --- |
| M13A | Site readiness plan (`SMART_LOCK_TUYA_SITE_READINESS_PLAN.md`); legacy PoC audited as reference-only; PoC `.env.example` sanitized | Complete |
| M13B | Live integration architecture freeze (`SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md`) — binding for M13C–M13H | Complete |
| M13C | Tuya provider config + client skeleton: env schema (`SMART_LOCK_PROVIDER` default `simulated`, `SMART_LOCK_LIVE_ENABLED` default `false`), HMAC-SHA256 signing, token grant with Redis cache, fail-fast `CONFIG_MISSING` | Complete and validated |
| M13D | Read-only diagnostic / capability discovery endpoint | Complete and validated |
| M13E | Read-only sync persistence + gateway health updates | Complete and validated |
| M13F-A | Controlled live command safety freeze (gates, RBAC, idempotency, rate limit, confirmation, audit, rollback, site-trial rules) | Complete and accepted |
| M13F-B | Backend command guard implementation | Complete and validated |
| M13F-C1 | Site trial readiness runbook (checklists, dry-run sequence, live trial sequence, rollback, evidence template) | Complete and accepted |
| M13F-C2 | Guarded live unlock transport (`TuyaSmartLockProvider.executeCommand()` for `remote_unlock`/`emergency_unlock` only) | Complete and validated |
| M13F-C3 | Dry-run QA with live disabled — PASS after leakage fix (provider ID masked in sync responses, commit `757b0db9`) | Complete |
| M13F-C4 | Go/No-Go decision (`SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md`): CONDITIONAL GO to schedule/prepare, NO-GO to execute | Complete |
| M13F-C4.1 | Sanitized local/placeholder C3-class evidence pack (`artifacts/m13f-c4-site-evidence-pack/`) — verdict PASS; B-23 partially closed | Complete |

## 3. Technical Readiness

The following backend capabilities are in place and documented (validated earlier and externally; referenced, not re-executed, here):

- **Backend config / provider selection:** `SMART_LOCK_PROVIDER` (default `simulated`), `SMART_LOCK_LIVE_ENABLED` (default `false`), fail-fast `CONFIG_MISSING` when `provider=tuya` without credentials.
- **Tuya signing / client / token:** backend-only HTTP client with HMAC-SHA256 signing, canonical path, exact-body signing, timeouts, normalized errors; token grant with per-gateway Redis cache, refresh-ahead buffer, single-flight lock, retry-once only on `TOKEN_ERROR`.
- **Diagnostic endpoint (M13D):** read-only capability discovery with normalized safe failures.
- **Read-only sync (M13E):** persisted sync summaries and gateway health updates; provider device ID masked in responses (post-C3 fix).
- **Command guard (M13F-B):** fail-closed pre-provider gates — provider/live flags, mapping, gateway, config, capability, device health, rate limit, audit intent.
- **RBAC / property scope:** admin/manager + `smart_lock.manage` only; resident and `property_owner` command access denied (`403`); property scope verified from PostgreSQL before any provider call.
- **Confirmation / reason / idempotency:** `confirmed:true`, meaningful `reason`, and `Idempotency-Key` required; Redis-backed idempotency (TTL default 600s), replay marked `idempotency_replayed:true`.
- **Rate limit:** defaults 3/min normal unlock, 1/min emergency; `RATE_LIMITED` returned before any provider call when exceeded.
- **Audit / access logs:** intent and result rows with correlation ID; no forbidden fields; `smart_lock_access_logs` recorded.
- **Guarded live unlock transport (M13F-C2):** `remote_unlock`/`emergency_unlock` only; ticket → door-operate → legacy-fallback over allow-listed provider-internal paths; no blind retry of ambiguous door-operate outcomes; ticket held in memory only; `remote_lock` returns `UNSUPPORTED_CAPABILITY`.
- **Dry-run with live disabled:** with `SMART_LOCK_LIVE_ENABLED=false`, commands terminate with normalized `LIVE_COMMAND_DISABLED` before any live provider IO. This is the current, correct end-state.
- **No frontend Tuya exposure:** no frontend UI, no provider secrets or raw provider payloads reachable from frontend or API clients.
- **No raw Tuya tester:** no arbitrary signed pass-through endpoint exists (banned by M13B Section 3 and M13F-A Section 5).

## 4. Evidence Summary

**Artifact path:** `artifacts/m13f-c4-site-evidence-pack/` (committed 2026-07-04).

| Check | Recorded result |
| --- | --- |
| Lint / build / runtime validation (from evidence pack precheck) | `lint_api` PASS, `build_api` PASS, `smartlock_validate_runtime` PASS (28/28) |
| Auth / RBAC | Unauthenticated `401`; resident, property_owner, and resident self-unlock all `403` — PASS |
| Request validation | Missing `confirmed` / `reason` / `Idempotency-Key` and unsupported command all rejected with expected normalized codes — PASS |
| Dry-run `remote_unlock` | `accepted:false`, `error_code:LIVE_COMMAND_DISABLED`, command reference + correlation ID present — PASS |
| Idempotency replay | Duplicate key replayed with `idempotency_replayed:true` (key stored as hash reference only) — PASS |
| Rate limit | `RATE_LIMITED` observed after threshold, before any provider call — PASS |
| Diagnostic / sync | Safe normalized failures in placeholder env (`DEVICE_NOT_MAPPED`, `PROVIDER_CONNECTION_ERROR`); no raw provider ID exposed — accepted as safe for placeholder env |
| Leakage check | 0 leak hits across API responses, audit payloads, access logs, gateway health, Redis; artifact self-check PASS |
| B-23 (site dry-run) | **PARTIALLY CLOSED** (`b23_status: PARTIALLY_CLOSED_PLACEHOLDER_ENV`) |

**Explicit limitations (binding):**

- This is **local/placeholder C3-class evidence**: placeholder/fake local Tuya credential values and a **synthetic QA device** with a fake provider mapping value.
- It is **not real site-env live execution evidence**. No live physical unlock was executed.
- A **real site-env rerun** with approved credentials, the selected non-occupied mapped device, and required sign-offs **is still required before execution GO** (M13F-C4 Section 6 row B-23).

## 5. Current Decision Status

| Item | Status |
| --- | --- |
| Scheduling / preparation of the first controlled site trial | **CONDITIONAL GO** |
| Live `remote_unlock` execution | **NO-GO** |
| Live lock (`remote_lock`) | **NO-GO** (returns `UNSUPPORTED_CAPABILITY`; gated to a future capability-confirmed milestone) |
| Temporary PIN | **NO-GO** (M13G, still gated) |
| Resident command access | **NO-GO** (denied `403` per frozen policy; includes resident self-unlock) |
| Fleet rollout | **NO-GO** (one approved test device only, and only after execution GO) |

The execution decision flips to GO **only** by completing Sections 6 and 7 of `SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md` and re-evaluating per its Section 8 — not by this or any other document.

## 6. Execution Blockers

All of the following remain open (fail-closed; each maps to an M13F-C4 Section 4 criterion):

1. Named owner / building approver missing (A-01).
2. Technical lead sign-off missing (A-02).
3. Person physically at door not assigned (A-03).
4. Manual key holder not assigned (A-04).
5. Rollback owner not assigned (A-05).
6. Approved test window missing (A-06).
7. Credential rotation confirmation (written) missing for anything ever present in the PoC folder or repository history (C-07 — hard precondition).
8. Real Tuya site-env credential verification missing (C-08..C-12).
9. One real test device mapping not verified — non-occupied door, active gateway mapping, backend-only `provider_device_id`, acceptable battery/online status (D-13..D-20).
10. Read-only diagnostic (M13D) and sync-readonly (M13E) on the real site env not yet evidenced (B-21, B-22).
11. C3-class dry-run on the real site env not yet evidenced (B-23 — currently PARTIAL via placeholder evidence only).
12. Physical / manual safety evidence missing — key-at-site confirmation and rollback readiness (S-28, R-29..R-31).
13. **B-23 is only PARTIALLY CLOSED**: the M13F-C4.1 pack evidences dry-run behavior but not the site environment.

## 7. Freeze Rules Going Forward

Binding until an accepted M13F-C5 session record supersedes this freeze:

1. **No `SMART_LOCK_LIVE_ENABLED=true` outside an approved test window.** Default remains `false` everywhere; immediate revert after any attempt.
2. **No live command without an approved M13F-C5 session plan** and an execution-GO decision recorded in the M13F-C4 document.
3. **No code changes to the command guard or provider transport before revalidation.** Any change to guard/transport code invalidates the C3-class evidence and requires a dry-run re-run before any live session.
4. **No frontend UI** (Admin or Penghuni) before a successful live backend trial result is recorded and accepted.
5. **No temporary PIN** work before M13G is opened.
6. **No `remote_lock`** before a capability-confirmed milestone explicitly authorizes it.
7. **No raw Tuya tester / arbitrary signed pass-through endpoint — ever** (M13B Section 3, M13F-A Section 5).
8. **Simulated rollback must remain available:** `SMART_LOCK_PROVIDER=simulated` must stay a working rollback path; simulated regression re-check is part of every session wrap-up.
9. **All future evidence must be sanitized:** no secrets, tokens, tickets, PINs, raw provider payloads, or unmasked provider device IDs in any artifact, log, doc, screenshot, or GitLab comment/issue/MR. Idempotency keys recorded as hash references only.

## 8. Required Next Milestone

**M13F-C5 — Real Site Preflight and One-Device Live Trial Session.**

M13F-C5 may start **only after all** of the following are complete:

1. All approvals collected and the M13F-C4 Section 7 sign-off table completed (A-01..A-06).
2. Credential rotation confirmed in writing (C-07).
3. Exactly one test device selected: non-occupied, correct property (verified from PostgreSQL), active gateway mapping, backend-only `provider_device_id` (D-13..D-20).
4. Manual key holder and person-at-door confirmed and available for the entire window (A-03, A-04, S-28).
5. Site-env read-only diagnostic (M13D) and sync-readonly (M13E) PASS for the test device (B-21, B-22).
6. Site-env C3-class dry-run PASS — full 10-step Runbook Section 6 sequence with `SMART_LOCK_PROVIDER=tuya`, `SMART_LOCK_LIVE_ENABLED=false` (fully closes B-23).
7. The Go/No-Go document is explicitly upgraded from CONDITIONAL GO to **execution GO** by the technical lead and owner approver (Sections 6, 7, 8 of M13F-C4).

Execution itself is bounded by M13F-C4 Section 11: one `remote_unlock`, one device, person at door, manual key in hand, live flag enabled only inside the window and reverted immediately after, post-command `sync-readonly`, evidence per the Runbook Section 9 template, no lock / PIN / UI / fleet.

## 9. Handoff Checklist (Future Live Site Trial Operator)

- [ ] Check out the latest `master` commit containing the M13F-C2 transport and the C3 leakage fix (`757b0db9` or later).
- [ ] Confirm environment values are loaded from the approved uncommitted local/site `.env` or secret manager **without printing secret values** (presence checks only).
- [ ] Verify `SMART_LOCK_PROVIDER=tuya` and `SMART_LOCK_LIVE_ENABLED=false`, then confirm a dry-run command returns `LIVE_COMMAND_DISABLED`.
- [ ] Verify the single approved test device mapping: correct property, `mapping_status='active'`, `gateway_status='active'`, no legacy `tuya_device_id` fallback, `provider_device_id` backend-only.
- [ ] Run the M13D read-only diagnostic and the M13E `sync-readonly` for the test device; record masked results (battery/online within the staleness window).
- [ ] Run the full C3-class dry-run sequence (Runbook Section 6, all 10 steps) on the site environment; record evidence per the Runbook Section 9 template.
- [ ] Fill the M13F-C4 Section 6 evidence table — every row PASS with an evidence reference.
- [ ] Obtain all Section 7 sign-offs (owner, technical lead, person at door, manual key holder, rollback owner, operator).
- [ ] **Only then** consider setting `SMART_LOCK_LIVE_ENABLED=true`, strictly inside the approved window, with the person at the door and the manual key in hand.
- [ ] **Immediately revert `SMART_LOCK_LIVE_ENABLED=false`** after the single attempt — before any further analysis or discussion.
- [ ] Run `sync-readonly` after the command to capture post-command device state and gateway health.
- [ ] Store sanitized artifacts under `artifacts/` (no secrets, no unmasked provider device IDs, idempotency keys as hash references only).

## 10. Risk Register

| # | Risk | Mitigation |
| --- | --- | --- |
| R-01 | **Physical safety risk** — door opens unexpectedly or fails to secure | Person physically at the door for every attempt (hard No-Go otherwise); manual key custodied at the door area; non-occupied test door only; Runbook Section 8 emergency procedure: stop, secure door with physical key, revert to simulated, record. |
| R-02 | **Credential leakage risk** — Tuya secrets exposed in repo/logs/chat | Credentials only in uncommitted `.env` / secret manager; written rotation confirmation (C-07) mandatory after PoC/history exposure; pre-flight secret sweep; leakage marker checks on every evidence pack; any detected secret is a hard No-Go. |
| R-03 | **Wrong device mapping risk** — command reaches an unintended lock | Exactly one test device; mapping verified from PostgreSQL (`smart_lock_device_gateways`, `mapping_status='active'`); no legacy `tuya_device_id` fallback; unclear `provider_device_id` is a hard No-Go. |
| R-04 | **Property scope mistake** — device resolved outside the caller's property | Backend property scoping mandatory before provider calls, verified from backend data (never client input); unverifiable scope is a hard No-Go. |
| R-05 | **Provider ambiguous result** — door-operate outcome unclear | No blind retry of ambiguous door-operate outcomes (M13F-C2 rule); person at door confirms physical state; anomaly triggers immediate rollback procedure. |
| R-06 | **Network timeout after door-operate** — command may have reached the lock | Treat as ambiguous: no automatic retry; verify physical state via person at door; run `sync-readonly` to capture device state; record outcome; fresh `Idempotency-Key` policy prevents accidental duplicate sends. |
| R-07 | **Redis / audit outage** — idempotency, rate limit, or audit intent unavailable | Guard fails closed: command is never sent if the idempotency store, rate limiter, or audit write path is unavailable (hard No-Go conditions). |
| R-08 | **Stale device status** — battery/online data outdated | Last acceptable sync must be within the staleness window (gate G-05 / D-20); offline or stale device is a hard No-Go. |
| R-09 | **Human process failure** — steps skipped, roles unfilled, window overrun | Fail-closed checklists (M13F-C4 Sections 4–7); named roles required before GO; live flag valid only inside the approved window; rollback owner must be reachable throughout; any unchecked item blocks execution. |

## 11. Documentation Updates

- `docs/README.md` index updated with the M13F-D note (this milestone), consistent with the existing M13D–M13F-C4 index entries.
- ROADMAP/CHANGELOG: not updated in this change. Per `docs/README.md`, the source of truth for current milestone status is the implementation/freeze documents themselves; governance files under `docs/00-project/` may be updated separately if the project convention requires it.
- **No ADR change.** ADR-SL-001 remains binding and unchanged.

## 12. Acceptance Checklist (M13F-D)

- [x] Freeze document created (this document, documentation only).
- [x] Status states: **technical foundation ready, execution pending** — M13F closed as "Ready for controlled site trial preparation, execution pending".
- [x] Live execution remains **NO-GO**; scheduling/preparation remains CONDITIONAL GO.
- [x] Evidence summary included (Section 4), explicitly marked as local/placeholder C3-class evidence with B-23 PARTIALLY CLOSED.
- [x] Execution blockers listed (Section 6).
- [x] Next milestone (M13F-C5) entry conditions defined (Section 8).
- [x] No code implementation, no source change, no ADR change, no frontend change, no PoC change.
- [x] No live command executed; `SMART_LOCK_LIVE_ENABLED` remains `false`.
- [x] No real secrets or real device IDs included; placeholders only.
- [x] No terminal validation (lint/build/typecheck/tests/API/browser) claimed or run for M13F-D.

## 13. Open Questions

| # | Question | Blocking? |
| --- | --- | --- |
| Q-01 | Who will be the named owner/building approver and technical lead for the first M13F-C5 session? | Blocks execution GO, not this freeze |
| Q-02 | Has credential rotation been confirmed in writing anywhere outside the repository? If yes, record the reference in the M13F-C4 Section 6 evidence table (C-07). | Blocks execution GO, not this freeze |
| Q-03 | Which physical door/device is the candidate test device (non-occupied, mapped, online)? | Blocks execution GO, not this freeze |
| Q-04 | Should ROADMAP/CHANGELOG under `docs/00-project/` record the M13F-D freeze, per project governance convention? | Non-blocking documentation follow-up |

---

## Review History

| Version | Status | Description |
| --- | --- | --- |
| v1 | Recorded | M13F-D freeze authored from M13A–M13F-C4.1 documents and the sanitized evidence pack. M13F closed as "Ready for controlled site trial preparation, execution pending." CONDITIONAL GO (schedule/prepare) / NO-GO (execute) unchanged. |
