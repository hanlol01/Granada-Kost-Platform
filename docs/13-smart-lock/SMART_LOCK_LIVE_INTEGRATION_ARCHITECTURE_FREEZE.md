# M13B — Smart Lock Live Integration Architecture Freeze

> **Milestone:** M13B (architecture freeze — documentation only, no implementation)
> **Date:** 2026-07-03
> **Role:** Smart Lock & Tuya Engineer
> **Status:** Frozen for M13C–M13H upon review acceptance
> **Binding inputs:** `docs/13-smart-lock/SMART_LOCK_TUYA_SITE_READINESS_PLAN.md` (M13A), `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Reference-only source:** `reference/tuya-paloma-poc/` (legacy PoC, sanitized in the M13A hygiene patch — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers are placeholders.
> No lint, typecheck, build, API, or browser validation was run for M13B. GitLab Duo has no shell access; all implementation and validation happen later via Codex (M13C onward).

---

## 1. Status and Scope

- M13B is an **architecture freeze only**. It converts the M13A readiness plan into binding decisions for implementation.
- **No Tuya live implementation is added** in M13B. `runtime/providers/tuya-smart-lock.provider.ts` remains the M10F skeleton (delegates to the simulated gateway; `healthCheck` returns `TUYA_PROVIDER_SKELETON`).
- **Live Smart Lock integration is not marked complete** by this document, and nothing here may be cited as evidence that it is.
- M13A (`SMART_LOCK_TUYA_SITE_READINESS_PLAN.md`) is the planning input; its Section 2 PoC audit, Section 11 env proposal, and Section 14 milestone breakdown are adopted here with the refinements below.
- **M13C–M13H must follow this document.** Deviations require an explicit amendment to this file, reviewed before implementation.
- **ADR-SL-001 remains binding and unchanged.** This freeze is an ADR-SL-001-compatible integration note, not a new ADR. No frozen decision is changed; if implementation ever requires changing one, a new ADR must be raised first — none is identified today.

## 2. Existing Frozen Decisions to Preserve

The following are restated verbatim in intent and remain non-negotiable for all of M13C–M13H:

1. **Backend is the only policy enforcement point.** Frontend validation and flags are UX only.
2. **PostgreSQL is the system of record.** Redis is token cache / runtime / queue / rate-limit only (prefix `granada:`).
3. **Property scoping is mandatory** on every Smart Lock admin path.
4. **Resident self-scope is mandatory** (`my-smart-lock.controller.ts` pattern) for any resident-facing path.
5. **Provider secrets are backend-only.** No provider secret in frontend env, bundle, docs, logs, audit payloads, or API responses.
6. **No direct Tuya API call from the frontend**, ever.
7. **No raw provider payload exposed to the frontend** (anti-corruption rule, ADR-SL-001 §6).
8. **No storage of master PIN plaintext** anywhere.
9. **Every admin command is audited** (`smart-lock-audit.service.ts`).
10. **Unlock commands are rate-limited** (`smart-lock-rate-limit.helper.ts`, Redis-backed, unlock stricter than lock).
11. **Simulated mode remains available** at all times and is the rollback path; it is never removed by live integration.
12. **`property_owner` keeps zero Smart Lock access** (frozen policy).

## 3. Live Provider Boundary

- Tuya live integration lives **entirely behind the existing seam**: `SmartLockProvider` (runtime types) implemented by `TuyaSmartLockProvider` in `backend/api/src/modules/smart-lock/runtime/providers/`, routed through `SmartLockRuntimeService` and the provider registry.
- **Controllers, domain services, and repositories must never call a Tuya HTTP client directly.** The Tuya HTTP/signing client is a private collaborator of the provider only.
- The provider returns **normalized `SmartLockGatewayResult` only** (`resultStatus: 'success' | 'failed' | 'queued' | 'device_offline' | 'timeout'`, plus `errorCode`/`errorMessage`/`providerRequestId`). Raw Tuya responses are provider-private and must not cross the provider boundary.
- The provider must never leak `client_secret`, `access_token`, `refresh_token`, `ticket_key`, `local_key`, or any password/PIN in results, logs, errors, or metadata. Masking applies even in diagnostics (PoC masking approach adopted as the reference pattern).
- The **simulated provider path (`tuya-smart-lock.gateway.ts` simulated gateway) remains the default** and permanent fallback; selecting the live provider never deletes or bypasses it.

## 4. Provider Selection and Safety Gates (frozen)

| Gate | Value | Meaning |
| --- | --- | --- |
| `SMART_LOCK_PROVIDER` | `simulated` (default) \| `tuya` | Backend provider selection. |
| `SMART_LOCK_LIVE_ENABLED` | `false` (default) | Hard gate for live **commands**. |

- Live commands (unlock, lock, credential mutation against the real device) require **both** `SMART_LOCK_PROVIDER=tuya` **and** `SMART_LOCK_LIVE_ENABLED=true`. Either missing → command path returns `LIVE_COMMAND_DISABLED` (Section 12), never a silent fallback to simulated execution for a live-intent request.
- **Read-only diagnostics** (token sanity, device metadata/status/functions/specifications, health check) **may** run when `SMART_LOCK_PROVIDER=tuya` and `SMART_LOCK_LIVE_ENABLED=false`, but only through explicitly designed diagnostic paths (M13D). This is a deliberate design allowance, not an implicit behavior.
- Frontend `VITE_FEATURE_SMARTLOCK_MODE` (see `apps/admin/src/lib/features.ts`) is **UX-only and never authoritative**.
- Backend responses must expose a **truthful provider/simulated/live status** field (derived from backend config + gateway status) so the Admin UI indicator reflects reality, not the Vite flag.

## 5. Secret Resolution Strategy (frozen)

- **Production path:** `credential_ref` indirection per gateway (`smart_lock_gateways.credential_ref`, `smart_lock_gateway_credentials`, migration `010_smart_lock_runtime.sql`), resolved by `SmartLockSecretResolutionService` from a secret manager / envelope encryption. **No Tuya credential plaintext in the database. No Tuya credential in any frontend env.**
- **Local/site-test path:** an env-based secret source is permitted **only** as a source inside `SmartLockSecretResolutionService` (never read directly by the provider or client), for a single test gateway, in uncommitted local/staging `.env` files.
- **Secret source priority (frozen order):** 1) secret manager / envelope-encrypted store via `credential_ref` → 2) env-based bootstrap source (local/site test only, and only when explicitly enabled for the environment). If both exist, `credential_ref` wins.
- **Missing credentials** must fail fast with a normalized `CONFIG_MISSING` error (startup validation when `SMART_LOCK_PROVIDER=tuya`, and per-command normalization at runtime). No crash, no partial live behavior.
- Logs, audit payloads, API responses, and health-check metadata must **mask secrets** without exception.
- **Any credential that ever appeared in the PoC or repository history is treated as compromised and must be rotated before use** (M13A Section 2.9; the PoC `.env.example` was sanitized in the M13A hygiene patch, but history retains prior content).

**Env placeholders (names frozen; values never committed).** `backend/api/.env.example` currently has no Tuya variables (by design); these are **proposed additions** consistent with existing naming (`REDIS_URL`, `REDIS_KEY_PREFIX=granada:` are reused, not duplicated):

```env
SMART_LOCK_PROVIDER=simulated            # simulated | tuya
SMART_LOCK_LIVE_ENABLED=false            # hard live-command gate
TUYA_CLIENT_ID=                          # env bootstrap source only (local/site test)
TUYA_CLIENT_SECRET=                      # env bootstrap source only; never committed
TUYA_REGION=                             # sg | us | eu | cn ... (drives base URL)
TUYA_BASE_URL=                           # explicit override; must match region
TUYA_PROJECT_ID=                         # optional metadata
SMART_LOCK_COMMAND_TIMEOUT_MS=15000
SMART_LOCK_MAX_UNLOCK_PER_MINUTE=        # optional override; defaults come from smart-lock-rate-limit.helper.ts constants
```

Note: M13A also proposed `TUYA_DEVICE_ID_TEST` and `TUYA_SIGNING_MODE`. `TUYA_DEVICE_ID_TEST` is allowed for the M13D diagnostic bootstrap only and must never feed the production command path (Section 7). `TUYA_SIGNING_MODE` is dropped unless Tuya introduces an alternative to HMAC-SHA256.

## 6. Tuya HTTP Client / Signing Architecture (frozen; PoC as reference only)

- The signing implementation lives **inside the backend provider layer** (the Tuya provider or a thin HTTP client used only by it). It is re-implemented cleanly; **PoC code is not copied**.
- **HMAC-SHA256 signing** per Tuya spec: string-to-sign `METHOD \n SHA256(body) \n \n canonicalPath` with sorted query params; sign payload `client_id + access_token + t + nonce + stringToSign`; uppercase hex output; headers `client_id`, `access_token`, `sign`, `t`, `nonce`, `sign_method: HMAC-SHA256` (PoC-verified knowledge, M13A §2.4).
- **The body must be signed exactly as sent**: serialize once, sign those bytes, send those bytes (the PoC disabled HTTP-client body re-transformation for this reason — adopt the equivalent safeguard).
- **Token acquisition/refresh is backend-only** (`GET /v1.0/token?grant_type=1`), owned by `SmartLockTokenCacheService`: **Redis cache per gateway** (`granada:` prefix, key per `gateway_id`), refresh-ahead buffer, **single-flight refresh** (per-gateway lock) to prevent stampede (ADR-SL-001 §8).
- **Retry once** after a forced token refresh on token-expired/token-invalid errors; further failures normalize to `TOKEN_ERROR`.
- **No raw signed request endpoint in production. No arbitrary Raw API Tester in production.** The PoC's pass-through tester is explicitly banned (M13A §2.8). Any diagnostic capability is a fixed, allow-listed, read-only set (Section 9).
- PoC knowledge adopted as reference: signing + query canonicalization, exact-body signing, token cache/refresh-ahead/reactive-refresh pattern, ticket → door-operate flow with legacy fallback ordering, region/base URL table, error taxonomy, sensitive-field masking.

## 7. Device Mapping and Multi-Gateway Strategy (frozen)

- **No global `TUYA_DEVICE_ID` in production.** The PoC's single-device env assumption is banned from production paths.
- Device identity comes from **`smart_lock_device_gateways.provider_device_id`**, resolved by `SmartLockGatewayResolverService` (deterministic for mapped devices).
- **Gateway credentials are resolved per gateway** via that gateway's `credential_ref` (Section 5); never a single global credential.
- **Property scope is checked before command execution**, ahead of gateway resolution and provider invocation.
- The **device-to-gateway resolver remains the sole routing source** for provider calls.
- The existing **legacy `tuya_device_id` fallback** in the resolver is **backward compatibility only**: it must not be used for new onboarding, and live command paths should log its use so mappings get backfilled. Removal is a post-M13H cleanup decision, not part of this freeze.

## 8. Command Execution Policy (frozen)

1. **Live unlock requires explicit admin confirmation** (UI dialog + safety copy); backend remains the enforcement point.
2. **Emergency unlock** requires the stronger reason/audit treatment already defined in `SMARTLOCK_POLICY.md` (typed reason recorded in audit).
3. Every command is **audited** with: actor, role, property, device, gateway ID, action, normalized result, correlation ID. No secrets, no raw payloads.
4. **Unlock commands are rate-limited** (existing helper; unlock stricter than lock; Redis-backed; `SMART_LOCK_MAX_UNLOCK_PER_MINUTE` as optional override).
5. Every provider command has a **timeout** (`SMART_LOCK_COMMAND_TIMEOUT_MS`, default 15000 ms) and normalizes to `PROVIDER_TIMEOUT` on expiry — no hangs.
6. **Provider errors are normalized** per Section 12 before leaving the provider.
7. **Idempotency** must be applied to dangerous commands where feasible: a command-level idempotency key (backend-side dedupe window) for unlock/emergency unlock; exact mechanism is an M13F design detail but the requirement is frozen.
8. **Failed commands must never be reported as success**, in API responses, audit rows, or access logs.
9. If Tuya returns **async/queued behavior**, it is represented distinctly as `resultStatus: 'queued'` (already supported by `SmartLockGatewayResult`) — never coerced to `success`.
10. **Remote lock may be unsupported** on the device: `INSTRUCTION_NOT_SUPPORTED` is an expected, non-fatal capability outcome, surfaced as a clear capability message, not an incident.

## 9. Read-only Sync and Diagnostic Policy (frozen)

- **Read-only before live:** M13D (diagnostics) and M13E (sync) must be proven before any live command (M13F).
- Device metadata, status, functions, and specifications are exposed first as **diagnostic/read-only** operations behind the provider boundary.
- **Battery/status/log sync must not require live unlock** and must work with `SMART_LOCK_LIVE_ENABLED=false`.
- Diagnostic outputs are **masked and normalized**; raw Tuya payloads never reach the API response.
- Admin diagnostics are **owner/manager scoped and property-scoped** (RBAC + property check before provider call).
- **Resident diagnostics are out of scope** entirely for M13.

## 10. Temporary PIN / Credential Lifecycle Policy (frozen)

- Temporary PIN lifecycle (M13G) is **gated behind proven read-only capability (M13D/E) and proven controlled live command (M13F)**.
- **No permanent test PIN** unless explicitly approved by the site admin/owner.
- **PINs are never logged in plaintext** (logs, audit, diagnostics, provider metadata).
- Any created test PIN must be **short-lived, clearly labeled, and revoked before leaving site**, with revocation verified at the keypad.
- Offline/online PIN support **depends on device capability discovery** (M13A Sections 5–6, D-08/D-09); no assumption is frozen here.
- If a capability is unsupported, **UI/API must show a clear disabled state** (no dead buttons, explicit label), consistent with M13A F-08.

## 11. Frontend Integration Policy (frozen)

- Admin UI (`apps/admin/src/routes/smart-lock.tsx`, `access-history.tsx`) **may display**: provider status, truthful simulated/live indicator (backend-driven, Section 4), device status, battery, gateway health, and masked diagnostic results.
- Admin UI **must not** contain provider secrets, `credential_ref` values, or any Tuya endpoint credentials.
- Admin UI **must not call Tuya directly**; all calls go to the Kostation backend.
- **Live command buttons** require explicit safety copy ("this can open a physical door") and a confirmation dialog; emergency unlock additionally requires a typed reason.
- **Penghuni smart-lock UI remains out of scope** until live integration is proven (through M13F at minimum; go-decision at M13H).
- Any future resident UI uses **resident self-scope backend endpoints only** (`my-smart-lock` pattern), with safe error copy and zero provider internals.

## 12. Error Normalization (frozen mapping)

Normalized `errorCode` values carried in `SmartLockGatewayResult.errorCode`; `resultStatus` per column 3. "Copy category" defines the user-facing message class (never raw provider text).

| Error code | Source / condition | `resultStatus` | User-facing copy category | Retryable | Alert admin/operator |
| --- | --- | --- | --- | --- | --- |
| `CONFIG_MISSING` | Provider selected but required credential/config absent (startup or runtime) | `failed` | Configuration incomplete | No (fix config) | Yes |
| `SIGNATURE_INVALID` | Tuya signature rejection (bad secret, clock skew, wrong region) | `failed` | Provider configuration error | No (investigate) | Yes |
| `PERMISSION_DENIED` | Tuya permission error (device not linked to project, insufficient authorization) | `failed` | Provider permission error | No | Yes |
| `API_NOT_SUBSCRIBED` | Required Tuya API service not subscribed on cloud project | `failed` | Provider configuration error | No | Yes |
| `DEVICE_OFFLINE` | Device offline / sleeping per provider | `device_offline` | Device unreachable, try again shortly | Yes (transient) | Only on sustained repetition |
| `INSTRUCTION_NOT_SUPPORTED` | Device/firmware does not support the command (e.g. remote lock) | `failed` | Capability not supported by this device | No | No (expected capability outcome; record in capability map) |
| `TOKEN_ERROR` | Token invalid/expired after one forced refresh + retry | `failed` | Provider authentication error | Yes (once, automatic) | Yes if persistent |
| `PROVIDER_TIMEOUT` | Command exceeded `SMART_LOCK_COMMAND_TIMEOUT_MS` | `timeout` | Device did not respond in time | Yes (with care for unlock; idempotency applies) | Yes on repetition |
| `PROVIDER_CONNECTION_ERROR` | Network/DNS/TLS failure reaching Tuya | `failed` | Provider temporarily unreachable | Yes (transient) | Yes on repetition |
| `RATE_LIMITED` | Kostation rate limit hit, or Tuya-side throttling | `failed` | Too many attempts, wait and retry | Yes (after window) | Only if Tuya-side and sustained |
| `LIVE_COMMAND_DISABLED` | Live command requested but Section 4 gates not both satisfied | `failed` | Live mode is not enabled | No | No (expected guard) |
| `DEVICE_NOT_MAPPED` | Resolver found no active gateway mapping (and no legacy fallback) | `failed` | Device not configured for remote control | No (fix mapping) | Yes |
| `UNSUPPORTED_CAPABILITY` | Requested capability absent from gateway/device capability map (pre-provider check) | `failed` | Feature not available for this device | No | No |
| `UNKNOWN_PROVIDER_ERROR` | Any unclassified provider failure | `failed` | Something went wrong, contact operator | No (manual review) | Yes |

Rules: mapping happens **inside the provider layer** (with `LIVE_COMMAND_DISABLED`, `DEVICE_NOT_MAPPED`, `UNSUPPORTED_CAPABILITY`, `RATE_LIMITED` raised by runtime/pre-provider checks); the raw Tuya `code`/`msg` may be stored masked in provider-private diagnostics only; retry classification feeds `SmartLockRetryPolicyService`.

## 13. Audit and Observability (frozen)

- **Every live command** creates an audit record and an access-log row (`smart_lock_access_logs`) with normalized result.
- **Read-only diagnostics that touch the provider** create an audit/log record too (actor, device, gateway, operation, result) — cheaper local reads (DB-only) need not.
- Every provider interaction carries a **correlation ID** propagated into audit, logs, and (where available) `providerRequestId`.
- Records include **gateway ID and normalized provider code**; never secrets, never raw Tuya payloads.
- Metrics/logging must **distinguish simulated vs live** execution (label/dimension on counters and log fields) so dashboards cannot conflate them.
- **Health check results** (`smart_lock_gateway_health`) are safe and masked: status, latency, normalized error code/message only; no credential material in `metadata`.

## 14. Security Review Checklist

To be re-verified at each milestone gate (M13C–M13H):

- [ ] No secret in frontend (env, bundle, network responses).
- [ ] No secret in docs.
- [ ] No secret in logs, audit payloads, or health metadata.
- [ ] No raw provider response reaches any client.
- [ ] No global device ID in any production code path.
- [ ] Property scoping enforced before every command.
- [ ] Resident self-scope enforced before any resident endpoint.
- [ ] Admin RBAC (`smart_lock.read/manage/command`) enforced before every admin command.
- [ ] Rate limit enforced before unlock command.
- [ ] Audit written for command intent and command result.
- [ ] Live unlock during site QA only with a person physically present at the door.
- [ ] Emergency physical key available and custodied during site QA.
- [ ] Simulated mode rollback verified after every live session (flag back to `simulated`, regression green).

## 15. M13C Implementation Contract

M13C may implement **exactly** the following, and nothing more:

1. **Config/env schema:** the Section 5 env names, with startup validation that fails fast (`CONFIG_MISSING`) when `SMART_LOCK_PROVIDER=tuya` and required values are missing.
2. **Secret resolution source** for local/site test, added behind `SmartLockSecretResolutionService` with the frozen priority order (Section 5).
3. **Tuya provider client skeleton:** real HTTP client structure inside the provider layer (no calls wired to command paths yet beyond what is listed here).
4. **Signing helper:** HMAC-SHA256 signing per Section 6, exact-body signing safeguard included.
5. **Token grant/cache:** token acquisition + per-gateway Redis cache + single-flight refresh in `SmartLockTokenCacheService`, retry-once-on-token-error.
6. **`healthCheck` (read-only):** real implementation — token grant + one lightweight device read — returning masked `SmartLockProviderHealthResult`.
7. **Provider selection gates:** `SMART_LOCK_PROVIDER` / `SMART_LOCK_LIVE_ENABLED` wiring with `LIVE_COMMAND_DISABLED` normalization.
8. **Live command methods remain disabled:** `executeCommand` for live actions must return `LIVE_COMMAND_DISABLED` (or continue delegating to simulated when provider=simulated) unless a later amendment explicitly changes this.
9. **No frontend UI work**, except (optionally) surfacing the truthful backend provider/live status if a config-display need arises.
10. **No temporary PIN work. No live unlock.** Any change to this contract requires amending this document first.

Gate to pass M13C: lint/typecheck/build via Codex; simulated regression (T-01) green; T-02 (`CONFIG_MISSING` fail-fast) demonstrated.

## 16. M13D–M13H Gating Summary

| Milestone | Scope | Gate criteria |
| --- | --- | --- |
| **M13D** | Read-only diagnostic (admin, owner/manager + property scoped): allow-listed device metadata/status/functions/specifications reads, masked output; seeds gateway row + device mapping for the test property | Read-only calls proven against site data (T-03 mandatory, T-04 recorded); no live command paths touched |
| **M13E** | Read-only sync: device info, battery, status, and (if V-03 passes) event logs into `smart_lock_access_logs`/alerts; background job design | T-03/T-04/T-05 pass; sync runs with `SMART_LOCK_LIVE_ENABLED=false` |
| **M13F** | Controlled live command: unlock (ticket → door-operate → legacy fallback), lock; audit + rate limit + idempotency + confirmation; simulated default preserved | T-08, T-12, T-13, T-14, T-15 pass under supervision; rollback to simulated verified |
| **M13G** | Temporary PIN lifecycle (create/freeze/unfreeze/revoke) if device capability confirmed; restriction workflow wiring | T-06/T-07 pass; no unrevoked test PIN remains |
| **M13H** | Site QA / production readiness review; M11H Admin UI live-wiring go-decision | Full M13A Section 12 test matrix executed; Section 14 checklist re-verified; QA report PASS recorded |

Test IDs (T-xx) refer to the M13A Section 12 test matrix.

## 17. Open Questions / Decisions Before Implementation

Carry-over from M13A Section 15 plus M13B-specific items — to be answered before or during the noted milestone:

1. Exact PALOMA model on site (DLP 2131 confirmation) — before M13D.
2. Tuya cloud region/data center (drives `TUYA_REGION`/`TUYA_BASE_URL`) — before M13C config values exist anywhere.
3. Remote unlock supported and enabled for this model/firmware — M13D/M13F.
4. Gateway/BLE dependency (cloud-only control is the production requirement) — M13D; if BLE-only, M13F is re-scoped.
5. Credential source for staging/site test (whose machine, whose `.env`, who controls it) — before M13C testing.
6. **Secret rotation confirmation:** written confirmation that any credential ever present in PoC/history has been rotated — hard precondition for M13D+ against real devices.
7. Whether remote lock is supported (expected possibly not; `INSTRUCTION_NOT_SUPPORTED` path) — M13F.
8. Read-only diagnostics endpoint shape (dedicated diagnostic controller vs extension of existing device endpoints) — M13D design decision within Section 9 constraints.
9. Command idempotency mechanism (key format, dedupe window, storage) — M13F design decision within Section 8.7.
10. Audit fields: confirm gateway ID + provider result code are present in current audit rows; add if missing — M13C/M13F.
11. Who approves and supervises the live unlock test (named person at the door + named approver) — before M13F site session.

## 18. Explicit Non-Changes

- **No code changed in M13B.** This milestone adds documentation only.
- **No ADR changed.** ADR-SL-001 remains frozen and binding; no required ADR change was identified.
- **Live Smart Lock integration is not complete** and is not claimed to be.
- **No payment gateway, CCTV, receipt/nota, or chat attachment changes.**
- **No PoC code copied into production.** `reference/tuya-paloma-poc/` remains reference-only.
- No env example files modified (M13A hygiene patch already sanitized the PoC `.env.example`; no new safety issue was found in `backend/api/.env.example`, which correctly contains no Tuya variables).
- No mockup folder changes.
- `ROADMAP.md`/`CHANGELOG.md`/`PROJECT_HEALTH` entries are deferred until M13B review acceptance, per the convention that milestone summaries follow review.

---

## Review history

| Version | Status | Description |
| --- | --- | --- |
| v1 | Draft | M13B architecture freeze note authored from M13A + ADR-SL-001 + code inspection |
