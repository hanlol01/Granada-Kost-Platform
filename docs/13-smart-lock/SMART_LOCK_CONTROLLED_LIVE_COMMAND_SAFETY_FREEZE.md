# M13F-A — Smart Lock Controlled Live Command Safety Freeze

> **Milestone:** M13F-A (safety freeze — documentation only, no implementation)
> **Date:** 2026-07-03
> **Role:** Kostation Release / Architecture Reviewer
> **Status:** Frozen for M13F-B and later upon review acceptance
> **Binding inputs:** `docs/13-smart-lock/SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A), `docs/13-smart-lock/SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md` (M13B — binding for M13C–M13H), `docs/13-smart-lock/SMART_LOCK_TUYA_PROVIDER_CONFIG_CLIENT_IMPLEMENTATION.md` (M13C), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_DIAGNOSTIC_IMPLEMENTATION.md` (M13D), `docs/13-smart-lock/SMART_LOCK_READ_ONLY_SYNC_IMPLEMENTATION.md` (M13E), `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Reference-only source:** `reference/tuya-paloma-poc/` (legacy PoC — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers are placeholders.
> No lint, typecheck, build, API, or browser validation was run for M13F-A. GitLab Duo has no shell access; all implementation and validation happen later via Codex (M13F-B onward).
> **Live Smart Lock commands remain disabled.** Nothing in this document implements or enables live unlock, live lock, or temporary PIN, and nothing here may be cited as evidence that they are implemented.
> **ADR-SL-001 remains binding and unchanged.** This freeze is an ADR-SL-001-compatible safety note within the M13B freeze; no frozen decision is changed and no new ADR is required.

---

## 0. Status Baseline

| Milestone | State at HEAD |
| --- | --- |
| M13A site readiness plan | ✅ Complete (planning) |
| M13B live integration architecture freeze | ✅ Complete (binding for M13C–M13H) |
| M13C Tuya provider config + client skeleton | ✅ Complete; validated via Codex |
| M13D read-only diagnostic / capability discovery | ✅ Complete; validated via Codex |
| M13E live read-only sync | ✅ Complete; validated via Codex (`PASS=26 FAIL=0` runtime validator; live command boundary verified: unlock returns `LIVE_COMMAND_DISABLED`) |
| Live unlock / lock / temporary PIN | ⛔ Not implemented. `TuyaSmartLockProvider.executeCommand` returns `LIVE_COMMAND_DISABLED` in Tuya mode regardless of `SMART_LOCK_LIVE_ENABLED`. |

M13F-A converts the M13B Section 8 command execution policy into a complete, implementable safety freeze for the controlled live command work that follows. **M13F-B and later must follow this document.** Deviations require an explicit amendment to this file, reviewed before implementation.

---

## 1. Scope and Non-Scope

**Scope (documentation only):**

- Prepare and freeze the backend safety-gate design for the future controlled live command path.
- Define the unlock/lock command policy **before** any implementation exists.
- Define audit, idempotency, rate-limit, confirmation, timeout, rollback, and site-trial guardrails.
- Define the exact M13F-B implementation contract (Section 15).

**Non-scope (hard exclusions):**

- **No live unlock implementation in M13F-A.**
- **No live lock implementation.**
- **No temporary PIN work** (M13G, gated behind proven controlled command).
- **No resident smart-lock UI** and no frontend UI work of any kind.
- **No raw Tuya API tester** or arbitrary signed pass-through endpoint (banned by M13B Section 3).
- **No frontend direct provider access**, ever.
- **No production live command without site approval** (Section 14 preconditions).
- No PoC code copied into production. No real credentials or device IDs anywhere.
- No payment gateway, CCTV, receipt/nota, or chat attachment changes.

## 2. Command Enablement Gates (frozen)

Every gate below must pass, in order, before any live command executes. **If any gate fails, the command must not execute, no Tuya command API may be called, and the caller receives a normalized failure** — never a raw provider error, never a silent success, and never a silent reroute to the simulated gateway.

| # | Gate | Failure behavior (normalized) |
| --- | --- | --- |
| G-01 | `SMART_LOCK_PROVIDER=tuya` selected (backend env) | `LIVE_COMMAND_DISABLED` |
| G-02 | `SMART_LOCK_LIVE_ENABLED=true` (backend env; both gates required together) | `LIVE_COMMAND_DISABLED` |
| G-03 | Device has an **active gateway mapping** (`smart_lock_device_gateways`, `mapping_status='active'`); legacy `tuya_device_id` fallback is logged if used and never used for new onboarding | `DEVICE_NOT_MAPPED` |
| G-04 | Provider config valid (credentials resolvable via `SmartLockSecretResolutionService`, region/base URL resolvable) | `CONFIG_MISSING` |
| G-05 | Device is online per last known state, **or** the last read-only sync result is recent and acceptable per policy (staleness window fixed in M13F-B config; default proposal: last successful sync/health within 24h and not `DEVICE_OFFLINE`) | `DEVICE_OFFLINE` (transient, retryable per Section 10) |
| G-06 | Actor role/permission valid per Section 3 (RBAC checked before anything provider-related) | HTTP 403; audit denial |
| G-07 | Property scope validated per Section 4 (`assertCanReadProperty`-class check + device∈property) **before** gateway resolution and provider invocation | HTTP 403/404 per existing scoping rules; no resource-existence leak |
| G-08 | Explicit admin confirmation provided in the request (Section 8) | HTTP 400 validation error (`SMART_LOCK_CONFIRMATION_REQUIRED`) |
| G-09 | Command reason provided (Section 8); emergency unlock requires typed reason | HTTP 400 validation error (`SMART_LOCK_REASON_REQUIRED`) |
| G-10 | Idempotency key provided (Section 6) | HTTP 400 validation error (`SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`) |
| G-11 | Rate limit not exceeded (Section 7; checked before provider call) | `RATE_LIMITED` |
| G-12 | Command type is on the allow-list (Section 5) and present in the device/gateway capability map | `UNSUPPORTED_CAPABILITY` |
| G-13 | Safety mode not locked down: gateway status is `active` (or `degraded` only where policy allows), no kill-switch engaged (Section 13) | `LIVE_COMMAND_DISABLED` or `CONFIG_MISSING` per cause |
| G-14 | Audit context available (actor, correlation ID, device, gateway resolvable). If the audit intent record cannot be written, the command must not be sent | `UNKNOWN_PROVIDER_ERROR`-class safe failure; alert operator |

Rules:

- Gates G-01–G-02 and G-11–G-13 normalize inside the runtime/pre-provider layer per the frozen M13B Section 12 mapping. G-08–G-10 are request-validation failures at the API layer (HTTP 400) and are **not** added to the frozen provider error-code table — no M13B amendment is needed.
- Gate evaluation is **fail-closed**: any unknown/indeterminate gate state counts as failure.
- A failed gate never triggers a fallback to the simulated gateway for a live-intent request (existing M13C/M13D/M13E behavior is preserved).

## 3. RBAC and Actor Policy (frozen)

- Live commands may be executed only by **admin or manager** actors holding **`smart_lock.manage`** (minimum). Where the existing seeded permission set also defines a dedicated command permission (`smart_lock.command` per the M10 baseline), M13F-B must additionally require it on the command endpoint; M13F-B verifies the exact seeded permission codes (Section 17, Q-02).
- **`property_owner` remains denied** all Smart Lock command access, per the frozen policy (`SMARTLOCK_POLICY.md`, ADR-SL-001, M13B Section 2.12). Any change requires an explicit policy amendment first — none is made here.
- **Residents are denied.** No resident-facing command endpoint exists or is added; the `my-smart-lock` self-scope surface stays read-only for M13F.
- **System/background jobs are denied for unlock.** No scheduler, queue worker, or automation may trigger unlock/emergency unlock. Background actors may at most run read-only sync (M13E). Full debt-based auto-lock without human approval remains banned (Phase 1 rule).
- **Emergency unlock** requires the stronger treatment: typed reason mandatory, emergency flag explicit, audit records the emergency classification, and notification/alerting per `SMARTLOCK_POLICY.md`.

## 4. Property Scope and Resident Safety (frozen)

- Property scope is validated **before any provider call**, ahead of gateway resolution (M13B Section 7).
- The target device must belong to the actor-scoped property; the device→property relation is checked from backend data (PostgreSQL), never from client-supplied fields.
- **No cross-property command**: wrong-property access returns 403/404 per existing rules with no resource-existence leak (M13A test T-10).
- **No resident self-trigger in M13F**, regardless of occupancy or access grants.
- **No command authorized by room occupancy alone**: an access grant or tenancy never substitutes for RBAC + property scope + gates.
- **Backend remains the sole source of truth and enforcement point.** Frontend flags (`VITE_FEATURE_SMARTLOCK_MODE`) and dialogs are UX only.

## 5. Command Types (frozen allow-list)

| Command | Status in M13F |
| --- | --- |
| `remote_unlock` (ticket → door-operate → legacy fallback, per M13B Section 3) | **Candidate for the first controlled live trial.** Only under full gates + site-trial preconditions (Section 14). |
| `emergency_unlock` | Same transport as unlock, stronger reason/audit treatment (Section 3). |
| `remote_lock` | **Only if** Tuya/PALOMA capability discovery (M13D/M13E capability map) confirms safe support. `INSTRUCTION_NOT_SUPPORTED` is an expected, non-fatal capability outcome, not an incident. |
| `temporary PIN` (create/freeze/unfreeze/revoke) | **Deferred to M13G.** Not part of any M13F work. |
| `password-free` / `open-door` flows | Allowed **only** as the provider-internal transport for the allow-listed unlock actions above, and only where mapped in the capability map and explicitly approved in a later milestone gate. Never exposed as a distinct API command. |
| Raw / arbitrary provider command | **Forbidden.** No raw signed request endpoint, no pass-through tester, no arbitrary path or payload from any client. |

The allow-list is enforced server-side (constant/enum), not derivable from request input. Anything not listed is rejected with `UNSUPPORTED_CAPABILITY` before provider invocation.

## 6. Idempotency (frozen)

- The future command endpoint **requires an `Idempotency-Key` header** (or equivalent DTO field; exact transport fixed in M13F-B within this contract). Missing key → HTTP 400 (`SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`).
- **Dedupe scope:** the stored key is scoped by `actor_id + property_id + device_id + command_type + client key`. The same client key from a different actor/device/command is a different idempotency record.
- **Duplicate key within TTL returns the previous normalized result** with `idempotency_replayed=true` — the provider is **not** called again. No duplicate Tuya command is ever sent for a replayed request.
- **TTL policy:** Redis-backed record (`granada:` prefix) with a bounded dedupe window; default proposal **10 minutes**, configurable in M13F-B. Expired keys behave as new requests.
- **In-flight collision:** a second request with the same key while the first is still executing must not trigger a second provider call; it returns the pending/queued normalized state or a safe conflict, never a parallel command.
- **Audit linkage:** replayed attempts write an audit entry referencing the original command's audit/correlation ID, so duplicates are traceable without re-executing.
- Redis unavailability is **fail-closed for dangerous commands**: if the idempotency store cannot be consulted, unlock-class commands are refused with a normalized safe failure (never "assume no duplicate").

## 7. Rate Limit (frozen)

- Rate limits are enforced **per actor, per device, and per property**, Redis-backed (`granada:` prefix), reusing/extending the existing `smart-lock-rate-limit.helper.ts`. Unlock remains **stricter than lock** (frozen policy).
- `SMART_LOCK_MAX_UNLOCK_PER_MINUTE` (already schema-only since M13C) becomes the optional env override; helper constants remain the defaults.
- **Emergency override policy:** emergency unlock uses its own (small) allowance so a genuine emergency is not starved by routine-limit exhaustion, but it is still bounded, still audited, and still requires the typed reason. No unlimited bypass exists.
- When limited, the request returns normalized **`RATE_LIMITED`** and **no provider command is attempted** — the limiter runs before provider invocation (gate G-11).
- Tuya-side throttling responses also normalize to `RATE_LIMITED` per the frozen M13B Section 12 mapping; sustained provider-side throttling alerts operators.
- Redis unavailability is fail-closed for unlock-class commands (refuse with a safe normalized failure rather than skipping the limiter).

## 8. Confirmation and Reason (frozen)

- **Explicit confirmation is required** on every live command request. Contract: a boolean `confirmed: true` in the request DTO, set only by a deliberate UI action with safety copy ("this can open a physical door"). Anything other than an explicit `true` fails gate G-08.
- **Reason is required** on every live command (`reason: string`, bounded length, validated non-empty). Emergency unlock requires the typed reason (free text, not a default).
- **Emergency flag** (`emergency: true`) is optional but stricter: typed reason mandatory, emergency audit classification, emergency notification path per policy.
- **No hidden auto-confirm:** no client, script, default value, retry wrapper, or background process may inject `confirmed: true`. The backend treats confirmation as request data to validate, never as UI trust — the backend remains the enforcement point.
- Audit stores the **reason text and confirmation status** (and emergency flag). Audit never stores secrets, PINs, tokens, or raw provider payloads (Section 11).

## 9. Provider Command Boundary (frozen)

- **Controllers, domain services, and repositories must never call the Tuya HTTP client directly.** Only `TuyaSmartLockProvider` (behind `SmartLockRuntimeService` and the provider registry) may invoke Tuya command endpoints. The signing client in `runtime/providers/tuya/` remains a private collaborator of the provider.
- Tuya **command endpoint paths are allow-listed inside the provider** (mirroring the M13D read allow-list): `POST /v1.0/smart-lock/devices/{device_id}/password-ticket`, `POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate`, and the legacy fallback `POST /v1.0/devices/{device_id}/door-lock/password-free/open-door` — nothing else. Adding a path requires amending this document.
- **No arbitrary signed request** capability exists or is added, for any caller, in any environment.
- The **exact command payload is provider-constructed and normalized**: serialized once, signed over the exact bytes sent (M13B Section 6 safeguard), with `provider_device_id` resolved only from the gateway mapping — never from client input.
- **Raw Tuya results never cross the provider boundary.** The provider returns normalized `SmartLockGatewayResult` only; raw `code`/`msg` may exist masked in provider-private diagnostics only.

## 10. Timeout / Retry Behavior (frozen)

- Every provider command runs under **`SMART_LOCK_COMMAND_TIMEOUT_MS`** (default 15000 ms, existing config) via the existing AbortController pattern; expiry normalizes to **`PROVIDER_TIMEOUT`** (`resultStatus: 'timeout'`). No hangs.
- **Retry policy:** transient classifications feed the existing `SmartLockRetryPolicyService`. Token-expired errors get the frozen retry-once-after-forced-refresh behavior. Read-class calls (ticket request **before** the door-operate is sent) may retry per transient policy.
- **Never retry a dangerous command blindly.** A `door-operate` (unlock/lock) attempt whose outcome is unknown (timeout, connection drop mid-request) must **not** be automatically retried unless the retry is provably idempotent-safe; the default is to surface the normalized failure and require a fresh, explicitly confirmed, freshly rate-limited human request (with a new short-lived ticket).
- **Unknown result is never reported as success** — not in the API response, not in audit, not in access logs (M13B Section 8.8).
- **Queued/pending is distinct from success:** async provider behavior maps to `resultStatus: 'queued'` and is never coerced to `success`.
- Ticket lifetime rule: the password ticket is requested immediately before the operate call and never cached or reused across commands.

## 11. Audit and Observability (frozen)

Every live command writes an audit record (intent and result) and a `smart_lock_access_logs` row with the normalized result. **Required audit fields:**

| Field | Notes |
| --- | --- |
| `actor_id` | Authenticated backend user ID |
| `actor_role` | Role at execution time |
| `property_id` | Scoped property |
| `device_id` | Backend device UUID |
| `gateway_id` | Resolved gateway |
| `provider` | `tuya` / `simulated` (metrics and logs must distinguish simulated vs live; dashboards must not conflate them) |
| `command_type` | Allow-listed command |
| `reason` | Actor-supplied reason text |
| `confirmation` | Confirmation status (+ emergency flag) |
| `idempotency_key` | **Hash or opaque reference only** — never a value that could embed secrets |
| `correlation_id` | Propagated through runtime, provider, logs, and (where available) `providerRequestId` |
| `result_status` | `success / failed / queued / device_offline / timeout` |
| `error_code` | Normalized code per M13B Section 12 (when failed) |
| `provider_latency_ms` | Measured provider latency |
| `timestamp` | Event time (UTC) |

**Never stored** (in audit, logs, access logs, health metadata, or metrics): access tokens, refresh tokens, client secrets, PINs/passwords, ticket IDs/ticket keys, local keys, raw provider payloads, or unmasked provider device IDs.

## 12. Response Contract (frozen)

The future command endpoint returns only this normalized shape (no raw provider response, consistent with the M13E response conventions):

```json
{
  "accepted": false,
  "command_id": "<audit/command reference if available>",
  "command_type": "remote_unlock",
  "provider": "tuya",
  "result_status": "failed",
  "error_code": "LIVE_COMMAND_DISABLED",
  "error_message": "Live mode is not enabled",
  "idempotency_replayed": false,
  "timestamp": "2026-07-03T00:00:00.000Z",
  "correlation_id": "<uuid>"
}
```

Rules:

- `accepted` is `true` only when `result_status` is `success` or `queued` (and `queued` is clearly not success; see Section 10).
- `error_code`/`error_message` use the frozen normalized set and copy categories only.
- `idempotency_replayed=true` marks a replayed prior result (Section 6).
- No raw Tuya envelope, no secrets, no unmasked device identifiers, ever.

## 13. Rollback and Kill-Switch (frozen)

- **`SMART_LOCK_LIVE_ENABLED=false` disables live commands immediately** (next request; no restart-dependent caching of the gate is permitted).
- **`SMART_LOCK_PROVIDER=simulated` is the full rollback path**: simulated mode is never removed and must remain regression-green after every live session (M13B Section 14 checklist).
- **Per-gateway/per-device disable:** the existing `gateway_status` (`disabled`, `maintenance`, `draining`) and `mapping_status` fields act as targeted kill-switches — a non-`active` gateway or mapping fails gate G-13/G-03 with a normalized error. If a per-device command-disable flag is desired beyond `mapping_status`, that is an M13F-B/H schema decision (additive only).
- **Config missing disables commands:** any unresolved credential/region/base URL fails fast (`CONFIG_MISSING`) at startup (Joi) and at runtime (gate G-04).
- **Failure mode is safe-closed:** Redis outage, audit write failure, unknown gate state, or unclassified provider error all refuse the command with a normalized failure. The system never "fails open" into sending an unverified door command.

## 14. Site Trial Runbook Requirements (frozen preconditions)

No real PALOMA/Tuya live command trial may run unless **all** of the following hold (extends M13A Sections 9, 10, 16):

1. **Owner approval** recorded (named approver, per M13B Section 17.11).
2. **A person is physically present at the door** for every unlock attempt — no exceptions.
3. **Manual key / mechanical override** available and custodied for the entire session (M13A A-13).
4. **Low-risk hours:** trials scheduled outside peak occupancy/traffic windows for the test door.
5. **Video or live-call observation** of the door if the approver/supervisor is not physically co-located.
6. **One test device only** — a single mapped test lock; no fleet exposure.
7. **No destructive test on an occupied room** — the test door must not be an occupied resident room.
8. **Results documented** against the M13A Section 12 test matrix (T-08, T-12, T-13, T-14, T-15) with timestamps, normalized result codes, and latency.
9. **Credential rotation** if any exposure is suspected (and the M13B Section 17.6 rotation confirmation remains a hard precondition before any real-device testing).
10. **Rollback plan executed at wrap-up:** flag back to `simulated`, simulated regression re-verified, no test artifacts (PINs, temporary grants) left active; failure path per M13A Section 9 (stop, secure the door with the physical key, revert, record).

## 15. M13F-B Implementation Contract

Codex may implement **exactly** the following in M13F-B, and nothing more:

1. **Backend command guard service:** a single pre-provider guard that evaluates gates G-01–G-14 in order and short-circuits with normalized failures (fail-closed).
2. **Idempotency handling** per Section 6: Redis-backed key store, scope hash, TTL, replay with `idempotency_replayed=true`, audit linkage, fail-closed on store unavailability.
3. **Rate-limit check** per Section 7: extend `smart-lock-rate-limit.helper.ts` wiring, consume `SMART_LOCK_MAX_UNLOCK_PER_MINUTE`, normalized `RATE_LIMITED`, checked before provider call.
4. **Command request DTO validation** per Section 8: `confirmed`, `reason`, optional `emergency`, idempotency key transport; class-validator rules; HTTP 400 validation codes from Section 2.
5. **Provider command method remains disabled:** `executeCommand` in Tuya mode continues to return `LIVE_COMMAND_DISABLED` for all live actions. Wiring the actual ticket → door-operate → legacy-fallback call is **not** M13F-B; it happens only in M13F-C (or later) after an explicit amendment/approval recorded in this document.
6. **Audit/log integration** per Section 11: intent + result records, access-log rows, correlation ID propagation, simulated-vs-live labeling; no secrets.
7. **Endpoint may be added but must remain disabled:** a command endpoint (or hardening of the existing command route) may land, but every live-intent request must terminate at the guard/`LIVE_COMMAND_DISABLED` layer unless **all** gates pass — and even then, in M13F-B the provider still returns `LIVE_COMMAND_DISABLED` (item 5).
8. **No frontend UI** work of any kind.
9. **No live unlock execution** in M13F-B. Actual live execution is a later, explicitly approved milestone step (M13F-C+) with the Section 14 site-trial preconditions satisfied.

Gate to pass M13F-B (validated via Codex, not by this document): lint/typecheck/build green; simulated regression (T-01) green; guard/idempotency/rate-limit behavior demonstrated with `LIVE_COMMAND_DISABLED` end-state; no secret leakage markers in logs/responses.

## 16. Acceptance Checklist (M13F-A)

- [x] No live command implemented or enabled in M13F-A (documentation only).
- [x] Safety gates defined (Section 2, G-01–G-14, fail-closed).
- [x] RBAC and actor policy defined (Section 3); property scope and resident safety defined (Section 4).
- [x] Command allow-list defined (Section 5); raw commands forbidden.
- [x] Idempotency defined (Section 6).
- [x] Rate limit defined (Section 7).
- [x] Confirmation/reason contract defined (Section 8); provider boundary defined (Section 9); timeout/retry defined (Section 10).
- [x] Audit fields and prohibitions defined (Section 11).
- [x] Response contract defined (Section 12).
- [x] Rollback and kill-switch defined (Section 13).
- [x] Site trial runbook preconditions defined (Section 14).
- [x] M13F-B implementation contract defined (Section 15).

## 17. Open Questions (answer before or during M13F-B)

| # | Question | Deadline |
| --- | --- | --- |
| Q-01 | Exact staleness window and acceptance rule for gate G-05 (device online / last acceptable read-only sync) — proposal: 24h, configurable | M13F-B design |
| Q-02 | Exact seeded permission codes: confirm whether `smart_lock.command` exists in the current RBAC seed alongside `smart_lock.manage`, and which the command endpoint must require (Section 3) | M13F-B, before endpoint work |
| Q-03 | Idempotency key transport: HTTP `Idempotency-Key` header (platform convention) vs DTO field — pick one and document it | M13F-B design |
| Q-04 | Emergency-unlock rate allowance values (bounded override, Section 7) | M13F-B design |
| Q-05 | Whether a per-device command-disable flag beyond `mapping_status` is needed (Section 13) — additive schema decision | M13F-B/M13H |
| Q-06 | Named approver + person-at-door for the first site trial (Section 14.1–14.2; carries over M13B Section 17.11) | Before any M13F-C live session |
| Q-07 | Secret rotation written confirmation for anything ever present in PoC/history (M13B Section 17.6) | Hard precondition before real-device command testing |

## 18. Explicit Non-Changes

- **No code changed in M13F-A.** This milestone adds documentation only (this file + the `docs/README.md` index note).
- **No ADR changed.** ADR-SL-001 remains frozen; no new ADR was necessary.
- **M13B remains binding**; this document operates within it and its Section 12 error table is not amended (new request-validation codes live at the API layer only).
- **Live Smart Lock commands are not implemented and not enabled.** Simulated mode remains the default and the rollback path.
- No env example changes, no mockup changes, no PoC changes.

---

## Review history

| Version | Status | Description |
| --- | --- | --- |
| v1 | Draft | M13F-A safety freeze authored from M13A–M13E + ADR-SL-001 + policy docs |
