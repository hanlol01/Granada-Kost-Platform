# M13F-C1 — Smart Lock Controlled Live Command Site Trial Readiness Runbook

> **Milestone:** M13F-C1 (documentation/runbook only — no implementation)
> **Date:** 2026-07-03
> **Role:** Kostation Release / Architecture Reviewer
> **Status:** Ready for review; binding for M13F-C site trial execution upon acceptance
> **Binding inputs:** `docs/13-smart-lock/SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A), `docs/13-smart-lock/SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md` (M13B — binding for M13C–M13H), `docs/13-smart-lock/SMART_LOCK_TUYA_PROVIDER_CONFIG_CLIENT_IMPLEMENTATION.md` (M13C), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_DIAGNOSTIC_IMPLEMENTATION.md` (M13D), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_SYNC_IMPLEMENTATION.md` (M13E), `docs/13-smart-lock/SMART_LOCK_CONTROLLED_LIVE_COMMAND_SAFETY_FREEZE.md` (M13F-A — safety freeze, binding), `docs/13-smart-lock/SMART_LOCK_COMMAND_GUARD_IMPLEMENTATION.md` (M13F-B), `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Reference-only source:** `reference/tuya-paloma-poc/README.md` (legacy PoC — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers are placeholders.
> No lint, typecheck, build, API, or browser validation was run for M13F-C1. GitLab Duo has no shell access; all execution and validation happen later via Codex and the supervised site session.
> **Live Smart Lock commands remain disabled and NOT implemented.** `TuyaSmartLockProvider.executeCommand()` returns `LIVE_COMMAND_DISABLED` in Tuya mode regardless of `SMART_LOCK_LIVE_ENABLED`. Nothing in this runbook implements or enables live unlock, live lock, or temporary PIN, and nothing here may be cited as evidence that live Smart Lock integration is complete.
> **ADR-SL-001 remains binding and unchanged.** This runbook operates within the M13B architecture freeze and the M13F-A safety freeze; no frozen decision is changed and no new ADR is required.

---

## 1. Scope and Non-Scope

**Purpose:** define exactly what must be ready before any controlled live PALOMA/Tuya unlock trial is allowed, and how the trial session is run, rolled back, and evidenced.

**Scope (documentation only):**

- Site trial readiness definition and pre-flight checklist.
- Trial approval requirements and sign-off table (Section 2).
- Credential readiness checklist (Section 3).
- Device mapping readiness checklist (Section 4).
- Backend readiness checklist (Section 5).
- Dry-run sequence with `SMART_LOCK_LIVE_ENABLED=false` (Section 6).
- Future controlled live trial sequence (Section 7 — **not executable until M13F-C2/C3 is approved and implemented**).
- Rollback and emergency procedure (Section 8).
- Evidence/reporting template (Section 9).
- Go / No-Go checklist (Section 10).
- M13F-C2 implementation contract for Codex (Section 11).

**Non-scope (hard exclusions):**

- **No live command implementation** (no live unlock transport is added by this milestone).
- **No live lock implementation.**
- **No temporary PIN work** (M13G, still gated).
- **No frontend UI work** of any kind (Admin or Penghuni).
- **No resident command access** — resident self-unlock stays denied (`403`, M13F-B behavior).
- **No production fleet rollout** — one test device only; no fleet onboarding.
- **No raw Tuya tester** or arbitrary signed pass-through endpoint (banned by M13B Section 3 and M13F-A Section 5).
- No PoC code copied into production. No real credentials or device IDs anywhere.
- No ADR change. No payment gateway, CCTV, receipt/nota, or chat attachment changes.

## 2. Trial Approval Requirements

No live trial session may be scheduled until **every** role below is named and has signed off. This implements M13F-A Section 14.1–14.2 and closes M13F-A open questions Q-06 (named approver + person-at-door) for the session being approved.

Required approvals and roles:

| # | Role | Requirement |
| --- | --- | --- |
| AP-01 | **Owner / building approver** | Named person with authority over the test property approves the trial in writing (recorded below). |
| AP-02 | **Technical lead approval** | Named engineering lead confirms M13F-B guard behavior, rollback plan, and this runbook are understood and binding for the session. |
| AP-03 | **Person physically at the door** | Named person present at the test door for **every** unlock attempt — no exceptions. |
| AP-04 | **Manual key holder** | Named custodian of the physical key / mechanical override for the entire session (M13A A-13). May be the same person as AP-03 only if the key is physically at the door. |
| AP-05 | **Date/time window** | Explicit start/end window, scheduled in low-risk hours (outside peak occupancy/traffic for the test door). Live mode is permitted only inside this window. |
| AP-06 | **Test device only** | Exactly one mapped test lock is authorized; the device reference (backend UUID placeholder) is recorded below. No other device may receive a command. |
| AP-07 | **Rollback owner** | Named person responsible for executing Section 8 rollback at wrap-up or on any failure, and for verifying simulated regression afterwards. |
| AP-08 | **Remote observation (conditional)** | If AP-01 or AP-02 is not physically co-located, video or live-call observation of the door is arranged (M13F-A Section 14.5). |

**Sign-off table (placeholders only — fill per session; never commit real personal contact data beyond what the team policy allows):**

| Role | Name | Approval date | Signature/reference |
| --- | --- | --- | --- |
| Owner / building approver | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD>` | `<ref>` |
| Technical lead | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD>` | `<ref>` |
| Person at door | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD>` | `<ref>` |
| Manual key holder | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD>` | `<ref>` |
| Rollback owner | `<NAME_PLACEHOLDER>` | `<YYYY-MM-DD>` | `<ref>` |
| Trial window | `<YYYY-MM-DD HH:MM>` – `<YYYY-MM-DD HH:MM>` (`<timezone>`) | — | — |
| Authorized test device | `<BACKEND_DEVICE_UUID_PLACEHOLDER>` @ `<PROPERTY_PLACEHOLDER>` | — | — |

## 3. Credential Readiness Checklist

All items must be checked before the session. Credentials follow M13B Section 5 and `SECURITY_POLICY.md`: backend-only, placeholders in docs, never committed.

- [ ] **Tuya Cloud project active** and accessible with owner/admin rights (M13A A-02/A-03).
- [ ] **Smart Lock API subscription active** on the cloud project (IoT Core + Smart Lock Open API).
- [ ] **PALOMA/Tuya device linked to the correct cloud project** (app-account link verified; device visible in the project).
- [ ] **Credential rotation confirmed in writing** for anything ever present in the PoC folder or repository history (M13B Section 17.6 / M13F-A Q-07 — hard precondition; the M13A hygiene patch sanitized the working tree only).
- [ ] **Credentials stored only** in the uncommitted local/site `.env` of the approved test machine, or in an approved secret manager. Never in the repository, docs, screenshots, logs, chat, or GitLab comments/issues/MRs.
- [ ] **`TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET` / `TUYA_REGION` (or `TUYA_BASE_URL`) present in the site environment only**; region/base URL matches the cloud project data center (wrong region causes `SIGNATURE_INVALID`/`PERMISSION_DENIED`).
- [ ] **`SMART_LOCK_PROVIDER=tuya` only during the controlled test**; the committed default remains `simulated`.
- [ ] **`SMART_LOCK_LIVE_ENABLED=false` during the entire dry-run** (Section 6).
- [ ] **`SMART_LOCK_LIVE_ENABLED=true` only inside the approved live command test window** (Section 7 — future, requires M13F-C2/C3 approval).
- [ ] **Revert `SMART_LOCK_LIVE_ENABLED=false` immediately after the test** — the flag takes effect on the next request (M13F-A Section 13); no restart-dependent caching of the gate is permitted.
- [ ] No credential value is ever echoed by diagnostics, health metadata, audit rows, or API responses (verified during dry-run leakage checks, Section 6).

## 4. Device Mapping Readiness Checklist

- [ ] **One backend smart lock device selected** (single backend UUID; recorded in the Section 2 sign-off table as a placeholder reference).
- [ ] **Device belongs to the correct property** and the device→property relation is verified from backend data (PostgreSQL), not client input.
- [ ] **Provider gateway mapping active**: `smart_lock_device_gateways` row exists with `mapping_status='active'` (gate G-03). The legacy `tuya_device_id` fallback must not be used for this trial.
- [ ] **Gateway `provider_type=tuya`** for the resolved gateway.
- [ ] **`provider_device_id` stored only in the backend DB mapping** — never in docs, env committed to the repo, frontend, or logs (masked everywhere per M13D/M13E behavior).
- [ ] **No global `TUYA_DEVICE_ID` command path** — `TUYA_DEVICE_ID_TEST` remains diagnostic-only and is never used on command paths (M13C rule; frozen by M13B Section 7).
- [ ] **`gateway_status='active'`** for the resolved gateway (gate G-13).
- [ ] **`mapping_status='active'`** for the device mapping (gate G-03).
- [ ] **Test device is NOT an occupied resident room** (M13F-A Section 14.7 — hard rule).
- [ ] **Manual physical access available** at the door (mechanical key / override custodied per AP-04).
- [ ] **Read-only diagnostic PASS**: `GET /api/v1/smart-lock/devices/:deviceId/diagnostics` returns normalized sections without blocking errors (M13D).
- [ ] **Read-only sync PASS**: `POST /api/v1/smart-lock/devices/:deviceId/sync-readonly` persists safe summary fields and healthy gateway health (M13E).
- [ ] **Battery/online status acceptable**: device online, battery at a safe level (recorded), and last successful sync within the configured staleness window (`SMART_LOCK_COMMAND_SYNC_STALENESS_MINUTES`, default 1440 — gate G-05).

## 5. Backend Readiness Checklist

All checks below are executed by the operator/Codex on the test machine during the session (not by this document — no terminal validation is claimed here).

- [ ] **Latest M13F-B branch/commit deployed** to the test machine (record commit SHA in the evidence table).
- [ ] **Migrations applied** if needed (through `010_smart_lock_runtime.sql`; no new migration is required by M13F-C1).
- [ ] **Backend starts** with the site `.env` (Joi validation passes; with `SMART_LOCK_PROVIDER=tuya`, missing credentials must fail fast with `CONFIG_MISSING`).
- [ ] **`GET /api/v1/health` PASS.**
- [ ] **M13D diagnostic endpoint works** for the mapped test device.
- [ ] **M13E `sync-readonly` works** for the mapped test device.
- [ ] **M13F-B command endpoint exists**: `POST /api/v1/smart-lock/devices/:deviceId/commands` responds through the guard.
- [ ] **Unauthenticated command rejected** (`401`).
- [ ] **Resident command rejected** (`403`; `POST /api/v1/my/smart-lock/unlock` also `403`).
- [ ] **`property_owner` command rejected** (`403`).
- [ ] **Missing confirmation rejected** (`400 SMART_LOCK_CONFIRMATION_REQUIRED`).
- [ ] **Missing reason rejected** (`400 SMART_LOCK_REASON_REQUIRED`).
- [ ] **Missing `Idempotency-Key` rejected** (`400 SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`).
- [ ] **Duplicate idempotency key returns replay** (`idempotency_replayed:true`, same normalized result, no second provider attempt).
- [ ] **Rate limit returns `RATE_LIMITED`** when exceeded, before any provider call.
- [ ] **Command still returns `LIVE_COMMAND_DISABLED`** at the provider boundary — this is the correct and expected end-state until the live provider transport (M13F-C2+) is implemented and approved.

## 6. Dry-Run Sequence (`SMART_LOCK_LIVE_ENABLED=false`)

The dry-run proves the full guarded path end-to-end **without any physical door effect**. It may run with `SMART_LOCK_PROVIDER=tuya` (read-only paths) while live mode stays off.

1. **Start backend** on the test machine with the site `.env` (`SMART_LOCK_PROVIDER=tuya`, `SMART_LOCK_LIVE_ENABLED=false`). Confirm startup passes Joi validation.
2. **Health check:** `GET /api/v1/health` PASS.
3. **Login as admin** (seeded admin with `smart_lock.manage`).
4. **Run diagnostic:** `GET /api/v1/smart-lock/devices/:deviceId/diagnostics` — expect normalized sections (metadata/status/functions/specifications), masked `provider_device_id`, no raw Tuya envelope.
5. **Run read-only sync:** `POST /api/v1/smart-lock/devices/:deviceId/sync-readonly` — expect persisted summary fields and a healthy `smart_lock_gateway_health` row.
6. **Attempt a guarded command** with a valid DTO (`command_type=remote_unlock`, `confirmed:true`, non-empty `reason`) and a fresh `Idempotency-Key` header.
7. **Verify `LIVE_COMMAND_DISABLED`:** response is `accepted:false`, `error_code:LIVE_COMMAND_DISABLED`, normalized shape per the M13F-A Section 12 contract. **No Tuya command API is called and the door does not move.**
8. **Verify audit/log/idempotency:** domain audit + `smart_lock_access_logs` rows written with actor, device, gateway, command type, reason, confirmation, idempotency hash reference, correlation ID, normalized result; replaying the same `Idempotency-Key` returns `idempotency_replayed:true`.
9. **Verify no secret / raw payload leak:** inspect responses and logs for client secret, access/refresh token, ticket key, local key, PIN, raw Tuya envelope, or unmasked provider device ID — none may appear.
10. **Do not change physical door state.** The dry-run is complete with the door untouched.

A PASS dry-run (all 10 steps, evidence recorded per Section 9) is a **hard precondition** for any future live trial session.

## 7. Live Trial Sequence (FUTURE — not executable yet)

> **⛔ This section is a future controlled procedure.** It must **not** be executed until the live provider command implementation (M13F-C2/C3) is explicitly approved, implemented, and validated, and every approval in Section 2 plus every checklist in Sections 3–5 is complete, plus a PASS dry-run (Section 6) exists for the same environment. Today the command path terminates at `LIVE_COMMAND_DISABLED` by design.

1. **Confirm person at door** (AP-03) is physically present and reachable.
2. **Confirm manual key** is in hand with the custodian (AP-04) at the door area.
3. **Confirm camera / live-call observation** if the approver/supervisor is not co-located (AP-08).
4. **Set `SMART_LOCK_LIVE_ENABLED=true`** on the test machine **only for the approved test window** (AP-05).
5. **Run ONE command only** (`remote_unlock`) against the ONE authorized test device, with `confirmed:true`, a meaningful `reason`, and a fresh `Idempotency-Key`.
6. **Record timestamp and correlation ID** from the response immediately (evidence table, Section 9).
7. **Observe the physical result** at the door: unlock success/failure, latency, auto-relock behavior. The person at the door confirms and secures the door.
8. **Immediately set `SMART_LOCK_LIVE_ENABLED=false`** — before any further analysis or discussion.
9. **Run `sync-readonly` after the command** to capture post-command device state and gateway health.
10. **Run simulated regression after rollback**: switch `SMART_LOCK_PROVIDER=simulated`, verify the simulated read-only sync and command-guard behavior are regression-green (M13A T-01 precondition class; `smartlock:validate-runtime` where available).

Results are documented against the M13A Section 12 test matrix (T-08, T-12, T-13, T-14, T-15) with timestamps, normalized result codes, and latency (M13F-A Section 14.8). Any anomaly triggers Section 8 immediately.

## 8. Rollback and Emergency Procedure

Execute top-down as far as needed; the rollback owner (AP-07) is accountable.

1. **Set `SMART_LOCK_LIVE_ENABLED=false`** (effective on the next request — first and fastest kill-switch).
2. **Set `SMART_LOCK_PROVIDER=simulated`** if any uncertainty remains (full rollback path; simulated mode is never removed).
3. **Stop the backend** if system state is uncertain or the flag change cannot be confirmed.
4. **Secure the door with the manual key** — the person at the door physically verifies the door is locked/safe.
5. **Mark gateway/device disabled or maintenance** where available (`gateway_status='disabled'|'maintenance'`, `mapping_status` change) as a targeted kill-switch (M13F-A Section 13).
6. **Record the incident/result** verbatim (masked) in the evidence table and, if severity warrants, in an incident note for M13H review.
7. **Rotate credentials** immediately if any exposure is suspected (screens shared, logs copied, machine compromised, etc.).
8. **Run health and sync checks after rollback**: `GET /api/v1/health`, simulated `sync-readonly` regression, and confirm no test artifacts (temporary grants, pending commands) remain active.

Failure mode is **safe-closed**: when in doubt, stop, secure the door physically, revert to simulated, and record.

## 9. Evidence / Reporting Template

One row per command attempt or significant check. Store completed evidence under `artifacts/` or the QA report location for M13H — never with secrets or unmasked device IDs.

| Field | Value (placeholder) |
| --- | --- |
| Date/time (UTC + local) | `<YYYY-MM-DDTHH:MM:SSZ>` / `<local>` |
| Operator | `<NAME_PLACEHOLDER>` |
| Approver | `<NAME_PLACEHOLDER>` |
| Device | `<BACKEND_DEVICE_UUID_PLACEHOLDER>` (provider ID masked, e.g. `tuya:****1234`) |
| Property | `<PROPERTY_PLACEHOLDER>` |
| Backend commit SHA | `<SHORT_SHA>` |
| Command type | `remote_unlock` / `remote_lock` / (dry-run) |
| Idempotency key hash/ref | `<HASH_REF_ONLY — never the raw key>` |
| Correlation ID | `<uuid>` |
| Audit ID / access-log ID | `<id>` |
| Result status | `success` / `failed` / `queued` / `device_offline` / `timeout` |
| Normalized error code | `<code or —>` (e.g. `LIVE_COMMAND_DISABLED` for dry-run) |
| Provider latency (ms) | `<n>` |
| Physical observation | `<door opened / did not open / auto-relock verified / n.a. (dry-run)>` |
| Rollback completed | `yes / no / n.a.` (flag reverted, simulated regression result) |
| Notes | `<free text — masked, no secrets, no raw payloads>` |

## 10. Go / No-Go Checklist

**GO only when all Sections 2–5 checklists are complete and no No-Go condition holds.**

**Hard NO-GO conditions (any one blocks the trial):**

- ⛔ No person physically present at the door for the unlock attempt.
- ⛔ No manual key / mechanical override available and custodied.
- ⛔ Test door is an occupied resident room.
- ⛔ Any Section 2 approval missing (owner, technical lead, person at door, key holder, rollback owner, time window).
- ⛔ Device offline, or last acceptable read-only sync outside the staleness window (gate G-05).
- ⛔ Read-only diagnostic (M13D) or read-only sync (M13E) FAIL for the test device.
- ⛔ Missing idempotency capability (client cannot supply `Idempotency-Key`, or the idempotency store is unavailable).
- ⛔ Rate-limit / idempotency Redis unavailable (guard fails closed — do not bypass).
- ⛔ Audit write path unavailable (intent audit cannot be written — command must not be sent, gate G-14).
- ⛔ Credential rotation for PoC/history exposure not confirmed in writing (Q-07).
- ⛔ Any secret detected in repo, docs, logs, screenshots, or chat during pre-flight.
- ⛔ Device→gateway mapping unclear, inactive, or relying on the legacy `tuya_device_id` fallback.
- ⛔ Property scope for the device cannot be verified from backend data.
- ⛔ Live provider command implementation (M13F-C2+) not yet approved/implemented — Section 7 stays locked and only the dry-run (Section 6) may run.

## 11. M13F-C2 Implementation Contract

Codex may implement **exactly** the following in M13F-C2, and nothing more. Deviations require an explicit amendment to this runbook and to the M13F-A safety freeze, reviewed before implementation.

1. **Provider command method implementation behind the existing M13F-B guard:** wire `TuyaSmartLockProvider.executeCommand()` for live transport, reachable only after all G-01–G-14 gates pass. No guard logic is bypassed, duplicated, or weakened.
2. **Only the allow-listed `remote_unlock` transport:** ticket → door-operate → legacy fallback, using only the three provider-internal allow-listed paths frozen in M13F-A Section 9 (`POST /v1.0/smart-lock/devices/{device_id}/password-ticket`, `POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate`, legacy `POST /v1.0/devices/{device_id}/door-lock/password-free/open-door`). `emergency_unlock` uses the same transport with the stronger reason/audit treatment.
3. **No `remote_lock` unless capability confirmed** by the M13D/M13E capability map for the test device; `INSTRUCTION_NOT_SUPPORTED` remains an expected non-fatal capability outcome.
4. **No temporary PIN** (M13G remains gated).
5. **No frontend UI** work of any kind.
6. **No raw signed endpoint** and **no arbitrary command**: paths are provider-internal constants; nothing derivable from request input; the PoC pass-through tester remains banned.
7. **Exact-body signing reuse:** the existing M13C signing helper and exact-body safeguard are reused for POST bodies — serialize once, sign those bytes, send those bytes.
8. **Provider response normalized only:** raw Tuya `code`/`msg` never cross the provider boundary; results map to the frozen M13B Section 12 error table and `SmartLockGatewayResult` statuses; `queued` is never coerced to `success`; unknown outcome is never reported as success.
9. **Provider timeout/retry policy per the safety freeze:** `SMART_LOCK_COMMAND_TIMEOUT_MS` with AbortController → `PROVIDER_TIMEOUT`; token retry-once after forced refresh; ticket requested immediately before operate and never cached/reused; **no blind retry of a door-operate whose outcome is unknown** — surface the normalized failure and require a fresh confirmed human request.
10. **Site dry-run required before live trial:** the Section 6 dry-run must PASS on the site environment (with the M13F-C2 build) before any live command window is approved.
11. **Live command trial still requires explicit approval and runbook execution:** implementing M13F-C2 does **not** authorize a live trial. The Section 2 sign-off, Sections 3–5 checklists, Section 10 Go/No-Go, and the M13F-A Section 14 preconditions must all pass, and the session must follow Section 7 exactly.

Gate to pass M13F-C2 (validated via Codex, not by this document): lint/typecheck/build green; simulated regression green; guard behavior unchanged; with live gates satisfied in a controlled environment the provider executes only the allow-listed transport; no secret/raw-payload leakage markers in logs/responses.

## 12. Acceptance Checklist (M13F-C1)

- [x] Runbook created (this document, documentation only).
- [x] Trial approvals and sign-off table defined (Section 2).
- [x] Credential readiness checklist defined (Section 3).
- [x] Device mapping readiness checklist defined (Section 4).
- [x] Backend dry-run readiness checklist defined (Section 5).
- [x] Dry-run sequence defined with `SMART_LOCK_LIVE_ENABLED=false` (Section 6).
- [x] Live trial future sequence defined and explicitly locked until M13F-C2/C3 approval (Section 7).
- [x] Rollback and emergency procedure defined (Section 8).
- [x] Evidence template defined (Section 9).
- [x] Go / No-Go checklist defined (Section 10).
- [x] M13F-C2 implementation contract defined (Section 11).
- [x] No code implementation, no ADR change, no env change, no frontend change, no PoC change.
- [x] No real secrets or device IDs in this document.

## 13. Explicit Non-Changes

- **No source code changed in M13F-C1.** This milestone adds this runbook and a `docs/README.md` index note only.
- **No ADR changed.** ADR-SL-001 remains frozen; M13B and M13F-A remain binding.
- **Live Smart Lock commands are not implemented and not enabled.** Simulated mode remains the default and the rollback path.
- **Smart Lock live integration is NOT marked complete** by this document.
- No terminal validation (lint/build/typecheck/tests/API/browser) was run for M13F-C1.

---

## Review history

| Version | Status | Description |
| --- | --- | --- |
| v1 | Draft | M13F-C1 site trial readiness runbook authored from M13A–M13F-B + ADR-SL-001 + policy docs |
