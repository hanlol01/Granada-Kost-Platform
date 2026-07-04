# M13F-C4 — Smart Lock Live Site Trial Go/No-Go Decision

> **Milestone:** M13F-C4 (decision documentation only — no implementation, no live execution)
> **Date:** 2026-07-04
> **Role:** Kostation Release / Architecture Reviewer
> **Status:** Decision recorded; binding for M13F-C5 scheduling and execution upon acceptance
> **Binding inputs:** `docs/13-smart-lock/SMART_LOCK_CONTROLLED_LIVE_COMMAND_SITE_TRIAL_RUNBOOK.md` (M13F-C1), `docs/13-smart-lock/SMART_LOCK_CONTROLLED_LIVE_COMMAND_SAFETY_FREEZE.md` (M13F-A), `docs/13-smart-lock/SMART_LOCK_COMMAND_GUARD_IMPLEMENTATION.md` (M13F-B), `docs/13-smart-lock/SMART_LOCK_LIVE_UNLOCK_TRANSPORT_IMPLEMENTATION.md` (M13F-C2), `docs/13-smart-lock/SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A), `docs/13-smart-lock/SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md` (M13B — binding for M13C–M13H), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_DIAGNOSTIC_IMPLEMENTATION.md` (M13D), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_SYNC_IMPLEMENTATION.md` (M13E), `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Reference-only source:** `reference/tuya-paloma-poc/README.md` (legacy PoC — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers are placeholders.
> No lint, typecheck, build, API, or browser validation was run for M13F-C4. GitLab Duo has no shell access; all cited validation results were produced earlier and externally (Codex) and are referenced, not re-executed, here.
> **No live Smart Lock command was executed for this document.** `SMART_LOCK_LIVE_ENABLED` remains `false`. Nothing here executes, implements, or enables live unlock, live lock, or temporary PIN.
> **Smart Lock live integration is NOT marked complete by this document.**
> **ADR-SL-001 remains binding and unchanged.** This decision operates within the M13B architecture freeze, the M13F-A safety freeze, and the M13F-C1 runbook; no frozen decision is changed and no new ADR is required.

---

## 1. Decision Status

| Question | Decision |
| --- | --- |
| **Schedule and prepare** the first controlled live `remote_unlock` site trial session (collect approvals, evidence, site readiness)? | **CONDITIONAL GO** |
| **Execute** the live `remote_unlock` command at the site? | **NO-GO** (until every mandatory criterion in Section 4 is PASS with recorded evidence and zero Section 5 condition holds) |

Rationale: technical readiness (M13F-B guard, M13F-C2 guarded transport, M13F-C3 dry-run PASS after the leakage fix) is documented in the repository, but the **site-side mandatory evidence is not present**: no named owner approval, no named person-at-door, no named manual key holder, no written credential rotation confirmation, no recorded test-device mapping evidence, and no approved trial window. Per the default rule of this milestone, absence of that evidence forbids a GO for execution.

The execution decision flips to **GO** only by updating Section 6 (evidence table) and Section 7 (sign-off table) of this document to fully PASS/complete, re-evaluated against Sections 4, 5, and 8 — not by any other document.

## 2. Scope and Non-Scope

**Scope (documentation only):**

- Readiness **decision** for exactly one controlled live `remote_unlock` trial on one approved test device.
- Evidence checklist and evidence table (Section 6).
- Approval checklist and sign-off table (Sections 4, 7).
- Device readiness checklist (Section 4, D-group).
- Backend readiness checklist (Section 4, B-group).
- Safety checklist (Section 4, S-group) and hard No-Go conditions (Section 5).
- Rollback checklist (Section 4, R-group).
- Final decision, decision matrix, and conditions (Sections 1, 8, 9).
- M13F-C5 execution constraints (Section 11).

**Non-scope (hard exclusions):**

- **No live execution** of any command (unlock, lock, or otherwise).
- **No code implementation** or source change of any kind.
- **No live lock** work.
- **No temporary PIN** work (M13G, still gated).
- **No frontend UI** work (Admin or Penghuni).
- **No resident command access** — resident self-unlock stays denied (`403`).
- **No property_owner command access** — remains denied per frozen policy.
- **No fleet rollout** — one test device only.
- **No raw Tuya tester** or arbitrary signed pass-through endpoint (banned by M13B Section 3 and M13F-A Section 5).
- No PoC code copied into production. No real credentials or device IDs anywhere.
- No ADR change. No payment gateway, CCTV, receipt/nota, or chat attachment changes.

## 3. Current Technical Readiness Summary

As recorded in the binding implementation notes (validated earlier via Codex; not re-validated by this document):

- **M13F-B backend command guard exists** (`SMART_LOCK_COMMAND_GUARD_IMPLEMENTATION.md`): fail-closed pre-provider gates (provider/live flags, mapping, gateway, config, capability, device health, rate limit, audit intent), RBAC admin/manager + `smart_lock.manage`, resident and `property_owner` denied, required `confirmed:true`, `reason`, and `Idempotency-Key`, Redis-backed idempotency (TTL default 600s, replay marked `idempotency_replayed:true`) and strict rate limits (defaults: normal unlock 3/min, emergency 1/min), safe audit/access-log records.
- **M13F-C2 guarded live unlock transport exists** (`SMART_LOCK_LIVE_UNLOCK_TRANSPORT_IMPLEMENTATION.md`): `TuyaSmartLockProvider.executeCommand()` wired for `remote_unlock`/`emergency_unlock` only, ticket → door-operate → legacy-fallback over the three allow-listed provider-internal paths, exact-body signing, token retry-once only on `TOKEN_ERROR`, no blind retry of ambiguous door-operate outcomes, ticket held in memory only. `remote_lock` returns `UNSUPPORTED_CAPABILITY`. Recorded validation: build/lint PASS, `smartlock:validate-runtime` `PASS=28 FAIL=0`, simulated and Tuya dry-run API sanity PASS, fake-server transport harness PASS (executed via Codex for M13F-C2).
- **M13F-C3 dry-run PASS**: the M13F-C1 Section 6 dry-run with `SMART_LOCK_PROVIDER=tuya` and `SMART_LOCK_LIVE_ENABLED=false` completed with PASS after a leakage fix.
- **C3 leakage fix**: M13F-C3 found and fixed a raw `tuya_device_id` leakage in sync responses (provider ID now masked; commit `757b0db9` "fix(smart-lock): mask provider id in sync responses"). Post-fix leakage marker checks PASS.
- **Live flag boundary holds**: with `SMART_LOCK_LIVE_ENABLED=false` (and in simulated mode), command requests still terminate with normalized `LIVE_COMMAND_DISABLED` before any live provider IO. This is the current, correct end-state.
- **No physical live trial has been executed.** `SMART_LOCK_LIVE_ENABLED=true` has never been used for a site session.

**Evidence gap noted:** the M13F-C3 dry-run PASS is referenced from the milestone record and the C3 leakage-fix commit, but a dedicated committed C3 evidence artifact/document was not found under `artifacts/` or `docs/13-smart-lock/` at the time of this decision. Section 4 item E-23 therefore requires the C3 (or re-run) dry-run evidence to be recorded in the Section 6 evidence table before execution GO.

## 4. Mandatory Go Criteria

Execution GO requires **every** item below checked with an evidence reference in Section 6. Any unchecked item = execution NO-GO (fail-closed).

**A. Approvals (Runbook Section 2)**

- [ ] A-01 Owner / building approver named and recorded.
- [ ] A-02 Technical lead approval recorded.
- [ ] A-03 Person physically at the door named (present for **every** unlock attempt).
- [ ] A-04 Manual key holder named (physical key custodied for the entire session).
- [ ] A-05 Rollback owner named.
- [ ] A-06 Approved test window defined (explicit start/end, low-risk hours).

**C. Credentials (Runbook Section 3; SECURITY_POLICY.md)**

- [ ] C-07 Credential rotation confirmed **in writing** for anything ever present in the PoC folder or repository history (M13B Section 17.6 / M13F-A Q-07 — hard precondition).
- [ ] C-08 Tuya Cloud project active with owner/admin access.
- [ ] C-09 Smart Lock API subscription active on the cloud project.
- [ ] C-10 PALOMA/Tuya device linked to the correct cloud project (visible in project).
- [ ] C-11 Credentials stored **only** in the approved uncommitted local/site `.env` or approved secret manager.
- [ ] C-12 No credentials in repo, docs, logs, chat, screenshots, or GitLab comments/issues/MRs (pre-flight sweep clean).

**D. Device / mapping (Runbook Section 4)**

- [ ] D-13 Exactly **one** test device selected (single backend UUID recorded as placeholder reference).
- [ ] D-14 Test door is **not** an occupied resident room.
- [ ] D-15 Backend device belongs to the correct property (verified from PostgreSQL, not client input).
- [ ] D-16 Active provider gateway mapping exists (`smart_lock_device_gateways`, no legacy `tuya_device_id` fallback).
- [ ] D-17 `provider_device_id` stored only in the backend DB mapping (masked everywhere else).
- [ ] D-18 `gateway_status='active'` for the resolved gateway.
- [ ] D-19 `mapping_status='active'` for the device mapping.
- [ ] D-20 Battery/online status acceptable and recorded; last acceptable sync within the staleness window (gate G-05).

**B. Backend / dry-run (Runbook Sections 5–6)**

- [ ] B-21 Read-only diagnostic PASS for the test device (M13D endpoint).
- [ ] B-22 `sync-readonly` PASS for the test device (M13E endpoint).
- [ ] B-23 C3-class dry-run PASS on the **same or equivalent (site) environment** (`SMART_LOCK_PROVIDER=tuya`, `SMART_LOCK_LIVE_ENABLED=false`, full 10-step Runbook Section 6 sequence), evidence recorded.
- [ ] B-24 Idempotency PASS (duplicate `Idempotency-Key` replays with `idempotency_replayed:true`; no second provider attempt).
- [ ] B-25 Rate limit PASS (`RATE_LIMITED` before any provider call when exceeded).
- [ ] B-26 Audit + `smart_lock_access_logs` PASS (intent and result rows, correlation ID, no forbidden fields).
- [ ] B-27 Leakage check PASS (no secret, token, ticket, PIN, raw Tuya payload, or unmasked provider device ID in responses/logs).

**S/R. Safety and rollback (Runbook Section 8; Freeze Sections 13–14)**

- [ ] S-28 Manual physical key confirmed present at the site door.
- [ ] R-29 Rollback plan ready and understood by the rollback owner (Runbook Section 8 top-down procedure).
- [ ] R-30 `SMART_LOCK_LIVE_ENABLED=false` ready as the immediate kill switch (effective next request; no restart-dependent caching).
- [ ] R-31 `SMART_LOCK_PROVIDER=simulated` rollback path verified or planned (simulated regression re-check scheduled at wrap-up).

## 5. Hard No-Go Conditions

Any single condition below blocks execution regardless of everything else (fail-closed):

- ⛔ No person physically at the door for the unlock attempt.
- ⛔ No manual key / mechanical override available and custodied.
- ⛔ Test door is an occupied resident room.
- ⛔ Missing owner/building approval.
- ⛔ Missing technical lead approval.
- ⛔ Credentials not rotated after PoC/history exposure (no written confirmation).
- ⛔ Device offline, or last acceptable sync outside the staleness window.
- ⛔ Read-only diagnostic (M13D) or read-only sync (M13E) FAIL for the test device.
- ⛔ No active device→gateway mapping, or reliance on the legacy `tuya_device_id` fallback.
- ⛔ `provider_device_id` unclear or not resolvable from the backend mapping.
- ⛔ Property scope for the device cannot be verified from backend data.
- ⛔ Redis / idempotency store unavailable (guard fails closed — never bypass).
- ⛔ Rate limiter unavailable.
- ⛔ Audit write path unavailable (intent audit cannot be written — command must not be sent).
- ⛔ Any secret detected in repo, docs, logs, screenshots, or chat during pre-flight.
- ⛔ Any raw provider payload or unmasked provider device ID leak detected.
- ⛔ C3-class dry-run not PASS on the site environment.
- ⛔ Rollback owner unavailable during the window.
- ⛔ Test window unclear, expired, or outside the approved low-risk hours.

## 6. Evidence Table

One row per mandatory criterion (extend as needed). Store completed evidence under `artifacts/` or the QA report location — never with secrets or unmasked device IDs. Idempotency keys are recorded as hash/reference only.

| # | Item | Required evidence | Evidence reference | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| A-01 | Owner approval | Written approval record | `<ref>` | PENDING | |
| A-02 | Technical lead approval | Written approval record | `<ref>` | PENDING | |
| A-03 | Person at door | Named person + availability | `<ref>` | PENDING | |
| A-04 | Manual key holder | Named custodian + key location | `<ref>` | PENDING | |
| A-05 | Rollback owner | Named person + Section 8 runbook ack | `<ref>` | PENDING | |
| A-06 | Test window | `<YYYY-MM-DD HH:MM>`–`<YYYY-MM-DD HH:MM>` (`<tz>`) | `<ref>` | PENDING | Low-risk hours |
| C-07 | Credential rotation | Written rotation confirmation | `<ref>` | PENDING | Hard precondition (Q-07) |
| C-08..C-12 | Cloud/credential readiness | Checklist walk-through record | `<ref>` | PENDING | No secret values in evidence |
| D-13..D-20 | Device/mapping readiness | DB mapping check record (masked), battery/online record | `<ref>` | PENDING | One device only |
| B-21 | Diagnostic PASS | Normalized diagnostic response (masked) | `<ref>` | PENDING | |
| B-22 | Sync-readonly PASS | Persisted summary + gateway health record | `<ref>` | PENDING | |
| B-23 | Site dry-run PASS | 10-step dry-run evidence (Runbook Section 9 template) | `<ref>` | PENDING | C3 PASS recorded in milestone history; committed artifact not found — re-record on site env |
| B-24 | Idempotency PASS | Replay response `idempotency_replayed:true` | `<ref>` | PENDING | Hash ref only |
| B-25 | Rate limit PASS | `RATE_LIMITED` response record | `<ref>` | PENDING | |
| B-26 | Audit/access log PASS | Audit + access-log row IDs | `<ref>` | PENDING | |
| B-27 | Leakage check PASS | Marker sweep result | `<ref>` | PENDING | |
| S-28 | Key at site | Person-at-door confirmation | `<ref>` | PENDING | |
| R-29..R-31 | Rollback readiness | Rollback plan ack + simulated regression plan | `<ref>` | PENDING | |

## 7. Approval Sign-off Table

Placeholders only — fill per session. Never commit real personal contact data beyond team policy.

| Role | Name | Date/time | Signature/reference |
| --- | --- | --- | --- |
| Owner / building approver | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Technical lead | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Person at door | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Manual key holder | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Rollback owner | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Operator | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD HH:MM>` | `<ref>` |
| Authorized test device | `<BACKEND_DEVICE_UUID_PLACEHOLDER>` @ `<PROPERTY_PLACEHOLDER>` | — | — |
| Trial window | `<YYYY-MM-DD HH:MM>` – `<YYYY-MM-DD HH:MM>` (`<timezone>`) | — | — |

## 8. Decision Matrix

| Decision | Condition |
| --- | --- |
| **GO** (execute) | **All** Section 4 mandatory criteria PASS with evidence references in Section 6, sign-off table complete, and **zero** Section 5 hard No-Go conditions hold. |
| **CONDITIONAL GO** (schedule/prepare only) | Technical readiness PASS (M13F-B guard, M13F-C2 transport, C3-class dry-run) but site approvals and/or evidence are pending. Preparation and scheduling may proceed; **live execution remains forbidden**. |
| **NO-GO** | Any Section 5 hard No-Go condition holds, or critical technical readiness (guard, transport, dry-run PASS) is missing/regressed. |

Evaluation is fail-closed: an unknown or unverifiable criterion counts as not PASS.

## 9. Recommended Decision

Based on repository evidence available at the time of writing:

- Technical readiness is **PASS** (M13F-B, M13F-C2, C3 dry-run with leakage fix, live-flag boundary verified as `LIVE_COMMAND_DISABLED`).
- Site readiness evidence is **absent from the repository**: no named approvals (A-01..A-06), no written credential rotation confirmation (C-07), no recorded test-device mapping/battery/online evidence (D-13..D-20), no site-environment dry-run evidence artifact (B-23).

**Recommendation:**

1. **CONDITIONAL GO — for scheduling and preparation only.** The team may collect approvals, prepare the site environment, and gather Section 6 evidence.
2. **NO-GO — for live command execution.** No live `remote_unlock` may be executed until this document's Sections 6 and 7 are fully completed, re-evaluated per Section 8, and the decision is explicitly updated to GO by the technical lead and owner approver.

This distinction is binding: *GO to schedule/prepare* never implies *GO to execute*.

## 10. Next Steps

1. Collect all Section 2 (Runbook) approvals and complete the Section 7 sign-off table.
2. Confirm credential rotation in writing (C-07) — hard precondition before any real-device testing.
3. Confirm exactly one test device mapping (active gateway mapping, `provider_device_id` backend-only, non-occupied door).
4. Run M13D diagnostic and M13E `sync-readonly` on the site environment for the test device; record results.
5. Re-run the C3-class dry-run (Runbook Section 6, all 10 steps) on the site environment with the M13F-C2 build; record evidence per the Runbook Section 9 template (closes the B-23 artifact gap).
6. Complete the Section 6 evidence table (all rows PASS with references).
7. Re-evaluate this document per Section 8; update Section 1 to GO only if everything passes.
8. Only then execute the **M13F-C5** live trial session under Section 11 constraints and the Runbook Section 7 sequence.

## 11. M13F-C5 Execution Constraints

M13F-C5 (live trial session) may run **only after** this document records GO for execution, and may do **exactly** the following, and nothing more:

1. Execute **one** `remote_unlock` against the **one** approved test device, with `confirmed:true`, a meaningful `reason`, and a fresh `Idempotency-Key`.
2. A named person is physically at the door for the attempt (AP-03) — no exceptions.
3. Manual key in hand with the custodian at the door area (AP-04).
4. `SMART_LOCK_LIVE_ENABLED=true` only inside the approved test window (AP-05).
5. **Immediately revert `SMART_LOCK_LIVE_ENABLED=false`** after the attempt — before any further analysis or discussion.
6. Run `sync-readonly` after the command to capture post-command device state and gateway health.
7. Record evidence per the Runbook Section 9 template (timestamps, correlation ID, normalized result, latency, physical observation, rollback status) against the M13A Section 12 matrix (T-08, T-12, T-13, T-14, T-15).
8. **No `remote_lock`.**
9. **No temporary PIN.**
10. **No frontend UI.**
11. **No fleet rollout** — no second device, no additional property.
12. Any anomaly triggers the Runbook Section 8 rollback/emergency procedure immediately (fail-closed: stop, secure the door with the physical key, revert to simulated, record).

## 12. Acceptance Checklist (M13F-C4)

- [x] Go/No-Go decision document created (this document, documentation only).
- [x] Decision status defined (Section 1: CONDITIONAL GO to schedule; NO-GO to execute).
- [x] Mandatory Go criteria defined (Section 4).
- [x] Hard No-Go conditions defined (Section 5).
- [x] Evidence table defined with placeholders (Section 6).
- [x] Approval sign-off table defined with placeholders (Section 7).
- [x] Decision matrix defined (Section 8).
- [x] Recommended decision included (Section 9).
- [x] M13F-C5 execution constraints defined (Section 11).
- [x] No code implementation, no source change, no ADR change, no frontend change, no PoC change.
- [x] No live command executed; `SMART_LOCK_LIVE_ENABLED` remains `false`.
- [x] No real secrets or device IDs in this document.
- [x] No terminal validation (lint/build/typecheck/tests/API/browser) claimed or run for M13F-C4.

## 13. Open Questions

| # | Question | Blocking? |
| --- | --- | --- |
| Q-01 | Committed M13F-C3 dry-run evidence artifact was not found under `artifacts/` — will the site-environment dry-run re-run (Section 10 step 5) serve as the canonical B-23 evidence? | Blocks execution GO (B-23), not scheduling |
| Q-02 | Who is the named owner/building approver and technical lead for the first session? | Blocks execution GO (A-01, A-02) |
| Q-03 | Has credential rotation for PoC/history exposure been confirmed in writing anywhere outside the repository? If yes, record the reference in Section 6 (C-07). | Blocks execution GO (C-07) |
| Q-04 | Which physical door/device is the candidate test device (non-occupied, mapped, online)? | Blocks execution GO (D-13..D-20) |

---

## Review history

| Version | Status | Description |
| --- | --- | --- |
| v1 | Recorded | M13F-C4 Go/No-Go decision authored from M13A–M13F-C2 docs, M13F-C3 milestone record, ADR-SL-001, and policy docs. Decision: CONDITIONAL GO (schedule/prepare) / NO-GO (execute). |
