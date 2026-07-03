# M13A — Smart Lock Live Tuya/PALOMA Site Readiness Plan

> **Milestone:** M13A (planning/documentation only — no implementation)
> **Date:** 2026-07-03
> **Role:** Smart Lock & Tuya Engineer
> **Status:** Draft for review before M13B
> **Binding references:** `docs/04-smartlock/SMARTLOCK_ARCHITECTURE_DECISION.md` (ADR-SL-001, frozen), `docs/04-smartlock/SMARTLOCK_POLICY.md`, `docs/04-smartlock/SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `docs/04-smartlock/TUYA_COMPATIBILITY_AUDIT.md`, `docs/01-architecture/SECURITY_POLICY.md`
> **Reference-only source:** `reference/tuya-paloma-poc/` (legacy PoC — never copy into production modules)
>
> This document contains **no real secrets and no real device IDs**. All identifiers below are placeholders.
> No validation, lint, build, or API/browser test was run for this milestone. Implementation and validation happen later via Codex.

---

## 1. Status Baseline

| Area | State |
| --- | --- |
| Smart Lock backend foundation (M10A–M10E) | ✅ Complete. Module at `backend/api/src/modules/smart-lock/` with controllers (device, credential, restriction, log/alert, `my-smart-lock` resident self-scope), services, repositories, helpers (PIN generator, rate limit, status transitions), gateway abstraction `gateways/smart-lock-gateway.interface.ts`, **simulated** `tuya-smart-lock.gateway.ts`, migration `009_smart_lock.sql`. RBAC (`smart_lock.read/manage/command`), property scoping, resident self-scope, and audit are wired. |
| Multi-gateway runtime (M10F / M10FV) | ✅ Complete and validated. `runtime/` layer: gateway registry, deterministic resolver (device mapping first, legacy `tuya_device_id` fallback), provider registry, retry policy, failover classification, secret resolution, token cache services; repositories + migration `010_smart_lock_runtime.sql` (`smart_lock_gateways`, `smart_lock_gateway_credentials`, `smart_lock_device_gateways`, `smart_lock_gateway_health`). Secrets are referenced by `credential_ref` only — never stored in DB rows. |
| Live Tuya provider | ⛔ **Deferred (M10G not done).** `runtime/providers/tuya-smart-lock.provider.ts` is a skeleton: it delegates to the simulated gateway and its `healthCheck` returns `TUYA_PROVIDER_SKELETON` with `simulated: true`. **No real Tuya call exists in Kostation today.** |
| Frontend Admin | `apps/admin/src/routes/smart-lock.tsx` and `access-history.tsx` exist but render **mock data** (`lib/mock-data`) behind the `VITE_FEATURE_SMARTLOCK_MODE` flag (`isSmartLockSimulated()` / `isSmartLockLive()` in `apps/admin/src/lib/features.ts`). No backend wiring yet (that is M11H, after M10G). |
| Frontend Penghuni | **No smart lock route exists** (`apps/penghuni/src/routes/_app/` has no smart-lock page). Resident-facing lock UI is out of scope until live integration is proven. |
| Legacy PoC | ✅ Exists at `reference/tuya-paloma-poc/`. Built **before** Kostation; it proved real Tuya Cloud connectivity and **live unlock/lock on a PALOMA lock**. Reference-only (Section 2). |
| Tuya compatibility knowledge | `TUYA_COMPATIBILITY_AUDIT.md`: 95% compatibility; outstanding physical verification items V-01 (fingerprint remote delete), V-02 (card remote delete), V-03 (device-initiated event logs). |
| M13A scope | Planning only. Physical device access is still required before any final production behavior can be confirmed. Nothing in this document marks live integration as complete. |

---

## 2. Legacy Tuya/PALOMA API Test Reference Audit

Audited folder: `reference/tuya-paloma-poc/` (Express backend + small Vite/React tester UI). Treated strictly as **technical reference**.

### 2.1 What the PoC proved

- Tuya Cloud Open API connectivity with HMAC-SHA256 request signing works end-to-end from Node.js.
- Token grant via `GET /v1.0/token?grant_type=1`, with in-memory token cache, refresh-ahead buffer (60 s), and reactive re-auth when Tuya returns a token error.
- **Live unlock** of a PALOMA lock via the official smart-lock flow: `POST /v1.0/smart-lock/devices/{device_id}/password-ticket` → `POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate` with `{ ticket_id, open: true }`, plus a legacy fallback `POST /v1.0/devices/{device_id}/door-lock/password-free/open-door`.
- **Lock** attempt via the same `door-operate` with `open: false` — with the documented caveat that many locks only support automatic locking (remote lock may be unsupported).
- Device reads: `GET /v1.0/devices/{id}`, `/status`, `/functions`, `/specifications`, with fallback `GET /v1.2/iot-03/devices/{id}/specification`.

### 2.2 API areas covered

Token/auth, device metadata, device status (DP codes), device functions/specifications, smart-lock password ticket, password-free door operate, legacy open-door, and a raw signed pass-through tester (GET-only when safe mode is on).

### 2.3 Region / base URL knowledge

The PoC documents the region-dependent base URL requirement, e.g. Singapore `https://openapi-sg.iotbing.com`, Western America `https://openapi.tuyaus.com`, Central Europe `https://openapi.tuyaeu.com`, China `https://openapi.tuyacn.com`. **The endpoint must match the cloud project's data center** or signing/permission errors occur. The PoC default was the Singapore endpoint — must be re-confirmed on site (Section 15).

### 2.4 Auth/signing knowledge reusable for M13B/M13C

- Sign string: `METHOD \n SHA256(body) \n \n canonicalPath`, where `canonicalPath` sorts query params; sign payload = `client_id + access_token + t + nonce + stringToSign`; HMAC-SHA256 with client secret, uppercase hex; headers `client_id`, `access_token`, `sign`, `t`, `nonce`, `sign_method: HMAC-SHA256`.
- Body must be serialized once and the exact same bytes signed and sent (the PoC disables axios body re-transformation for this reason).
- Token lifecycle: cache with expiry buffer, force-refresh on token error, retry the request once after refresh.
- Error taxonomy worth normalizing: `SIGNATURE_INVALID`, `PERMISSION_DENIED`, `API_NOT_SUBSCRIBED`, `DEVICE_OFFLINE`, `INSTRUCTION_NOT_SUPPORTED`, `TOKEN_ERROR`, `TUYA_TIMEOUT`, `TUYA_CONNECTION_ERROR`.

### 2.5 Lock/unlock payload behavior

Ticket-then-operate is the primary flow; the ticket is short-lived and must be requested immediately before the command. Unlock success depends on device model, firmware, online state, API subscription, cloud project permission, and the lock's remote-unlocking configuration. Remote lock frequently unsupported → treat `INSTRUCTION_NOT_SUPPORTED` as an expected, non-fatal capability outcome.

### 2.6 Frontend/backend separation in the PoC

Correct in principle: all signing and secrets live in the PoC backend; the frontend only calls local endpoints, and sensitive fields (secret, tokens, local_key, ticket_key, password) are masked before responses reach the browser. However, the PoC backend endpoints themselves have **no authentication at all**.

### 2.7 Reusable as reference

- Signing algorithm + query canonicalization + exact-body signing.
- Token cache/refresh-ahead/reactive-refresh pattern (to be re-homed into the existing `SmartLockTokenCacheService` with per-gateway Redis single-flight, per ADR-SL-001).
- Unlock ticket → door-operate flow and legacy fallback ordering.
- Error classification map → feeds `SmartLockGatewayResult.resultStatus`/`errorCode` normalization.
- Region/base URL table and troubleshooting hints (CONFIG_MISSING, signature, subscription, offline).
- `SAFE_MODE` concept → maps onto Kostation's simulated/live separation (never removed until live is validated).
- Sensitive-field masking approach for logs/diagnostics.

### 2.8 Must NOT be reused directly

- The Express app, routes, and raw API pass-through endpoint (arbitrary signed Tuya calls have no place in production).
- Flat env-based single credential (`TUYA_CLIENT_ID`/`TUYA_CLIENT_SECRET` as global env) — production uses `credential_ref` + secret resolution per gateway (migration `010`, ADR-SL-001).
- Single-device assumption (`TUYA_DEVICE_ID` global) — production resolves `provider_device_id` per device via `smart_lock_device_gateways`.
- Unauthenticated command endpoints, `cors({ origin: true })`, `window.confirm` as the only unlock confirmation.
- Single in-memory token cache (production: per-gateway Redis cache with single-flight lock).

### 2.9 Security risks found or likely

| Risk | Finding |
| --- | --- |
| Secrets in env/config | Present by design in the PoC. **Hygiene finding:** the PoC root `.env.example` shipped `SAFE_MODE=false` as default and contained a non-empty fragment in the client-secret field. **Remediated:** the file has been sanitized in the M13A hygiene MR (all credential fields emptied, `SAFE_MODE=true`). This fixes the working tree only — any credential that ever appeared in PoC files or repository history must still be treated as compromised and rotated before site testing. Do not quote or preserve any historical value from it. |
| Single-device assumption | Yes — one global device ID; incompatible with multi-property/multi-gateway Kostation. |
| Missing property scoping | Yes — none. |
| Missing RBAC | Yes — endpoints are fully unauthenticated. |
| Missing audit logging | Yes — console logs only; no persistent actor/device/action/result/correlation-id trail. |
| Missing command rate limits | Yes — none. |
| Missing unlock confirmation | Browser `confirm()` only; no typed reason, no server-side gate. |
| Missing error normalization | Partially present (taxonomy exists) but raw Tuya payloads are returned (masked) to the browser — production must never return raw provider payloads (anti-corruption rule). |
| Missing simulated/live safety gate | Partially present (`SAFE_MODE`) but a single env toggle with an unsafe example default; production needs the existing feature-flag + gateway-status + provider-selection layering. |

### 2.10 Mapping to Kostation architecture & adaptation path

| PoC element | Kostation home (M13B/M13C target) |
| --- | --- |
| `tuyaClient.js` signing + token logic | Inside `runtime/providers/tuya-smart-lock.provider.ts` (or a thin Tuya HTTP client used only by it), behind the frozen `SmartLockProvider` interface. Never called from controllers directly. |
| In-memory token cache | `SmartLockTokenCacheService` — Redis key per `gateway_id` (`granada:` prefix), single-flight refresh (ADR-SL-001 §8). |
| Flat env credentials | `SmartLockSecretResolutionService` resolving `credential_ref` (secret manager or envelope encryption; a narrow env-based source is acceptable **for local/site testing only**, see Section 11). |
| `TUYA_DEVICE_ID` | `smart_lock_device_gateways.provider_device_id` resolved by `SmartLockGatewayResolverService`. |
| `SAFE_MODE` | Existing simulated gateway + provider selection flag + `gateway_status`; Admin flag `VITE_FEATURE_SMARTLOCK_MODE` stays UX-only (backend is the enforcement point). |
| Error taxonomy | Normalized into `SmartLockGatewayResult` result codes; raw payload never leaves the provider layer. |
| Ticket → door-operate flow | `executeCommand()` implementation detail of the Tuya provider for `unlock`/`remote_unlock`/`emergency_unlock` actions. |

Recommended adaptation: M13B freezes this mapping as an ADR-SL-001-compatible integration note (no new ADR unless a decision actually changes); M13C implements the provider skeleton + config schema without enabling live commands.

---

## 3. Goals and Non-Goals

**Goals**

- Prepare everything needed for Tuya/PALOMA live integration so the site visit is about **discovery and controlled testing, not coding**.
- Define exactly what information must be collected on site (Sections 5–6).
- Define which backend/frontend areas must be ready before the visit (Sections 7–8).
- Define safe, gated testing steps (Sections 9–10, 12).
- Reuse PoC knowledge as reference only; inherit none of its security weaknesses.
- Keep all live provider secrets and live commands strictly backend-only.
- Preserve simulated mode as the default and as the rollback path.

**Non-goals**

- No Tuya live command implementation in M13A.
- No production rollout, no device fleet onboarding.
- No removal of simulated mode.
- No provider secret ever reaches the frontend bundle, docs, or logs.
- No compatibility guarantee before physical device verification (V-01/V-02/V-03 remain open).
- No payment gateway, CCTV, chat attachment, receipt/nota, or other unrelated work.

---

## 4. Required Accounts / Access Before Site Visit

Checklist (owner column to be filled by the team; **secrets are never written into docs — placeholders only**, stored per Section 11 rules):

| # | Item | Notes |
| --- | --- | --- |
| A-01 | Smart Life / Tuya app account used to pair the lock | Must be the **device owner** account; record which email/phone identity owns it (identity reference only, no password in docs). |
| A-02 | Tuya IoT Platform (cloud.tuya.com) account | Needed to create/manage the cloud project and link the app account. |
| A-03 | Cloud project owner/admin access | Ability to subscribe API services (IoT Core, Smart Lock Open API) and authorize the linked app account. |
| A-04 | Cloud project **region/data center** | Must match device pairing region; drives the base URL (Section 2.3). |
| A-05 | Access ID / Client ID | Placeholder only; stored per secret-handling plan. |
| A-06 | Access Secret / Client Secret | Placeholder only; never in docs, frontend, or commits. |
| A-07 | API endpoint / base URL | Derived from A-04. |
| A-08 | Device pairing permission | Confirm the person on site may factory-pair/re-pair the lock. |
| A-09 | Device owner account linkage | The lock must be linked into the cloud project (app-account link) before API access works. |
| A-10 | Property/site admin contact | Person who authorizes door access and supervises live tests. |
| A-11 | Network requirements | 2.4 GHz Wi-Fi SSID + password availability at the door location; Bluetooth-capable phone if BLE pairing is required; confirm signal at the physical lock position. |
| A-12 | Pairing phone | Charged phone with Smart Life/Tuya app installed and logged into A-01. |
| A-13 | Emergency physical key / mechanical override | **Mandatory.** Location and custody confirmed before any live command. |

---

## 5. Device Information to Collect On Site

| # | Data | Where to find |
| --- | --- | --- |
| D-01 | Brand + exact model (expected: PALOMA DLP 2131 — confirm) | Device label / manual |
| D-02 | Tuya product ID / product key (if visible) | Tuya IoT Platform → device detail |
| D-03 | Device ID | Tuya IoT Platform after pairing (record into secure store, not docs) |
| D-04 | Local device name | Smart Life app |
| D-05 | Firmware version | Smart Life app / device detail |
| D-06 | Supported DP codes / capabilities | `GET /v1.0/devices/{id}/functions` + `/specifications` (see Section 6) |
| D-07 | Remote lock/unlock capability | Capability discovery + physical test |
| D-08 | PIN/password capability | Capability discovery |
| D-09 | Temporary password capability (online + offline) | Capability discovery |
| D-10 | Fingerprint/card capability (V-01/V-02 from Tuya audit) | Capability discovery + physical test |
| D-11 | Battery status DP support | Status read |
| D-12 | Door state DP support (open/closed sensor) | Status read |
| D-13 | Event/log support (V-03: local PIN/card/fingerprint/doorbell events) | Tuya logs after physical actions |
| D-14 | Gateway requirement (Wi-Fi direct vs Zigbee/BLE gateway) | Pairing flow observation |
| D-15 | Connection type (Wi-Fi / BLE / Zigbee) | Pairing flow + device spec |
| D-16 | Timezone behavior (timestamps in logs, temp-password validity windows) | Log inspection with known-time actions |
| D-17 | Network stability constraints (sleep behavior, wake latency) | Repeated status reads over ~30 min |

---

## 6. Tuya/PALOMA Capability Discovery Plan

All discovery is **read-only first** and runs through signed backend/diagnostic calls (never from a browser):

1. **Token sanity:** obtain a token; verify no `SIGNATURE_INVALID`/`PERMISSION_DENIED` (proves credentials + region + clock).
2. **Device metadata:** `GET /v1.0/devices/{id}` — confirms linkage, online state, product info.
3. **Functions/specifications:** `GET /v1.0/devices/{id}/functions` and `/specifications` (fallback `GET /v1.2/iot-03/devices/{id}/specification`) — enumerate DP codes; map to Kostation capabilities (`lock`, `unlock`, `remote_unlock`, `sync_status`, `credential_create`, `credential_disable`, `access_log`, `normal_open_mode`).
4. **Status:** `GET /v1.0/devices/{id}/status` — check battery DP, door-state DP, lock-state DP.
5. **Remote unlock support:** presence of the smart-lock password-ticket + door-operate endpoints succeeding for this device; also verify the lock's own "remote unlock" setting in the Smart Life app (some locks require enabling it on-device).
6. **Temporary PIN support:** attempt a **short-lived, clearly labeled** temporary password creation only after read-only checks pass, and delete it in the same session.
7. **Event logs (V-03):** perform a physical PIN unlock at the door, then query Tuya device logs/alarm records; verify whether device-initiated events appear and within what latency (< 30 s target from the Tuya audit test plan).
8. **Gateway/BLE dependency:** if the device only responds while the phone app is nearby, suspect BLE-bridged control — record it; cloud-only control is the production requirement.
9. **Sync vs async:** observe whether door-operate returns success synchronously or a queued/pending state; record latency for the runbook.
10. **Expected errors:** deliberately test one wrong-path call (e.g., unsupported instruction) to confirm error normalization inputs (`INSTRUCTION_NOT_SUPPORTED`, `DEVICE_OFFLINE` when lock sleeps).

---

## 7. Backend Readiness Checklist (confirm/gap — do not implement in M13A)

| # | Item | Status today | Gap for live |
| --- | --- | --- | --- |
| B-01 | Provider abstraction | ✅ `SmartLockProvider` type + `SmartLockGateway` interface exist and are routed through `SmartLockRuntimeService` | None — implement Tuya inside the existing seam (M13C). |
| B-02 | Live provider client boundary | ⚠️ `TuyaSmartLockProvider` is a skeleton delegating to the simulated gateway | Implement real signed HTTP client **inside the provider only** (M13C/M13E/M13F). |
| B-03 | Tuya credential config/env schema | ⚠️ `backend/api/.env.example` has **no** Tuya vars (by design: `credential_ref`) | Define a dev/site-test secret source for `SmartLockSecretResolutionService` + startup validation (Section 11, M13C). |
| B-04 | Secret handling | ✅ `credential_ref` indirection + `smart_lock_gateway_credentials` (no plaintext in DB) | Wire actual resolution (env-based for site test, secret manager later); never log secrets. |
| B-05 | Device mapping table | ✅ `smart_lock_device_gateways` + unique active mapping + resolver | Backfill/one gateway row + one device mapping for the test property (M13C/M13D data task). |
| B-06 | Property scoping | ✅ Enforced in M10 module | Re-verify on live paths in QA (M13H). |
| B-07 | Resident access scoping | ✅ `my-smart-lock.controller.ts` self-scope | No resident live-command exposure until after M13F. |
| B-08 | Admin action audit logging | ✅ `smart-lock-audit.service.ts` | Ensure gateway id + provider result code recorded for live commands (M13F). |
| B-09 | Command logging | ✅ `smart_lock_access_logs` | Confirm live result statuses map cleanly (`success/failed/queued/device_offline/timeout`). |
| B-10 | Idempotency for commands | ⚠️ Frontend idempotency-key convention exists platform-wide; command-level dedupe not confirmed in module | Document + enforce for live unlock (M13F). |
| B-11 | Rate limiting | ✅ `smart-lock-rate-limit.helper.ts` (unlock stricter than lock per policy) | Confirm limits per Section 11 knobs; keep Redis-backed. |
| B-12 | Timeout/retry | ✅ `SmartLockRetryPolicyService` + failover classification | Feed real Tuya error taxonomy (Section 2.4) into it (M13C). |
| B-13 | Error normalization | ✅ `SmartLockGatewayResult` anti-corruption shape | Map PoC taxonomy → result codes; never return raw Tuya payloads. |
| B-14 | Simulated vs live flag | ⚠️ Simulated gateway is the only real path; provider selection exists via provider registry | Add explicit backend selection flag + safe default (Section 11); simulated remains default. |
| B-15 | Health/status endpoint | ✅ `smart_lock_gateway_health` + health service (skeleton result) | Implement real `healthCheck` (token + lightweight device read) in M13C/M13E. |
| B-16 | Background sync (battery/status/events) | ⚠️ Not implemented (jobs dir reserved) | Design in M13E (read-only sync first). |
| B-17 | PoC signing/client knowledge | ✅ Audited (Section 2) | Re-implement cleanly; do not port code verbatim. |

---

## 8. Frontend Readiness Checklist (confirm/gap — do not implement in M13A)

**Admin (`apps/admin/src/routes/smart-lock.tsx`, `access-history.tsx`)** — currently mock-data behind `VITE_FEATURE_SMARTLOCK_MODE`:

| # | Item | Ready before site visit |
| --- | --- | --- |
| F-01 | Device list wired to `GET /smart-lock` device endpoints (real backend, simulated provider) | Should be ready (M11H scope, can precede M13F since backend is simulated-safe). |
| F-02 | Device detail (status, battery, mapping/gateway info — no `credential_ref` values) | Should be ready. |
| F-03 | Provider status badge (gateway health) | Should be ready as read-only. |
| F-04 | **Simulated/live indicator** always visible, driven by backend truth, not only the Vite flag | Required. |
| F-05 | Lock/unlock action with explicit confirmation dialog + typed reason for emergency unlock + safety copy ("can open a physical door") | Required before any live test. |
| F-06 | Access code (PIN) management UI if exposed | Optional; only if M10 endpoints are wired — otherwise keep explicitly disabled. |
| F-07 | Event/log visibility (access logs list) | Nice-to-have read-only. |
| F-08 | Clear disabled state when live provider is not configured (no dead buttons, explicit label) | Required. |

**Penghuni** — no smart-lock page exists today:

| # | Item |
| --- | --- |
| P-01 | Keep it that way for M13A–M13F. Any future resident surface uses only `my-smart-lock` self-scope endpoints. |
| P-02 | No provider secrets, no direct provider API calls, ever (all calls go to Kostation backend). |
| P-03 | Safe error copy (no raw provider errors, no device internals). |

---

## 9. Site Visit Runbook

**Pre-site (office):**
1. Complete Section 4 checklist; sanitize the PoC folder (Section 2.9 hygiene finding); rotate any credential ever present in PoC files.
2. Confirm backend simulated mode works end-to-end locally (existing M10 behavior) and Admin Smart Lock page renders with the simulated indicator.
3. Prepare a local/staging-only `.env` (never committed) with placeholders from Section 11 left empty until on site.
4. Print/carry this runbook + Section 5 collection sheet.

**On arrival:**
5. Verify emergency physical key present and working (A-13). If not — **no-go** for live commands (Section 16).
6. Verify Wi-Fi signal at the lock; note SSID band (2.4 GHz requirement common for Tuya locks).

**Pairing & manual verification:**
7. Pair the lock in the Smart Life/Tuya app with the owner account (A-01). Record pairing mode (Wi-Fi/BLE/gateway).
8. Confirm the lock works **manually** (keypad/physical) and then **from the official app** (app unlock). Do not proceed to API tests until both pass.
9. Link the app account to the Tuya IoT cloud project; confirm the device appears in the project; subscribe required API services.

**Data collection:**
10. Collect all Section 5 items; store device ID/product ID in the secure store (not in docs, not in git).

**Controlled API testing (backend-only, local/staging):**
11. Configure env/secrets locally per Section 11; start backend in a controlled environment; confirm startup config validation passes.
12. Read-only first: token → device metadata → functions/specifications → status (battery/door state). Record results in the test matrix (Section 12).
13. Event check: physical PIN unlock at the door → query Tuya logs → record V-03 outcome.
14. Safe command simulation: run the command path with the **simulated provider** to verify audit + rate limit + confirmation UX unchanged.
15. **Live unlock test — only with a person physically at the door**, door area confirmed safe, admin supervising: single unlock, observe latency and result; immediately verify door re-locks (auto-lock). Then attempt remote lock; record `INSTRUCTION_NOT_SUPPORTED` gracefully if unsupported.
16. If temporary PIN is supported and approved: create one short-lived labeled test PIN, verify at the keypad, then revoke/delete and verify rejection.
17. Record everything (timestamps, request result codes, latency, photos/screenshots per the Tuya audit test plan T-01…T-06).

**Wrap-up:**
18. Roll the backend selection flag back to **simulated**; verify simulated mode still works.
19. Ensure **no test PIN remains active**, no temporary access grant remains, and any throwaway credentials are revoked/rotated if exposure is suspected.
20. Debrief: fill the risk register outcomes and open questions (Sections 13, 15); feed results into M13B.

**Failure path:** if any live command misbehaves (stuck open, no response, unexpected state), stop live testing, use the physical key to secure the door, revert to simulated mode, and record the failure verbatim (masked) for M13B analysis.

---

## 10. Safety and Security Rules

1. **Never** send a remote unlock without a person physically present at the door.
2. Never expose secrets in logs, docs, commits, or the frontend; masking is mandatory even in diagnostics.
3. Never commit `.env` with real values; PoC hygiene finding (Section 2.9) must be fixed and affected credentials rotated.
4. Never store a master PIN in plaintext anywhere.
5. No permanent test PINs; any test PIN is short-lived, labeled, and revoked before leaving site (explicit approval required to create one at all).
6. Every admin command is audited (actor, device, action, gateway, result, correlation id) — existing policy, re-verified live.
7. Unlock commands are rate-limited (stricter than lock), Redis-backed.
8. Live unlock requires explicit confirmation (dialog + reason where policy requires) — UI convenience only; backend remains the enforcement point.
9. Emergency physical key stays within reach for the entire session.
10. A manual override/rollback plan (Section 9 failure path) is agreed before the first live command.
11. Disable/revoke test credentials after the visit if there is any chance of exposure; prefer scoping the cloud project to the test device only.
12. `property_owner` role keeps zero Smart Lock access (frozen policy).

---

## 11. Environment Variables / Secret Placeholders

**Existing names (keep):**

- Frontend (Admin): `VITE_FEATURE_SMARTLOCK_MODE=simulated|live` — UX indicator only, never an enforcement point.
- Backend: `REDIS_URL`, `REDIS_KEY_PREFIX=granada:` (token cache/rate limit reuse). No Tuya variables exist in `backend/api/.env.example` today — by design, secrets resolve via `credential_ref`.

**Proposed additions (names only — no real values; final schema decided in M13B/M13C):**

```env
# Provider selection & safety gate (backend-only enforcement)
SMART_LOCK_PROVIDER=simulated            # simulated | tuya
SMART_LOCK_LIVE_ENABLED=false            # hard gate; both must be set for live commands

# Dev/site-test secret source consumed by SmartLockSecretResolutionService
# (production path remains secret manager / envelope encryption behind credential_ref;
#  these env vars are a narrow, local-only bootstrap for a single test gateway)
TUYA_CLIENT_ID=
TUYA_CLIENT_SECRET=
TUYA_REGION=                             # e.g. sg | us | eu | cn (drives base URL)
TUYA_BASE_URL=                           # explicit override; must match region
TUYA_PROJECT_ID=                         # optional metadata
TUYA_DEVICE_ID_TEST=                     # site-test device only; production uses device mapping table
TUYA_SIGNING_MODE=HMAC-SHA256            # only if an alternative ever appears

# Command guardrails
SMART_LOCK_COMMAND_TIMEOUT_MS=15000
SMART_LOCK_MAX_UNLOCK_PER_MINUTE=        # confirm against existing rate-limit helper constants; env override optional
```

Rules: values live only in uncommitted local/staging `.env` or the secret manager; startup validation fails fast when `SMART_LOCK_PROVIDER=tuya` but required values are missing (`CONFIG_MISSING` pattern from the PoC is a good precedent); secrets never appear in logs, audit payloads, API responses, or the frontend bundle.

---

## 12. Test Matrix

| # | Test | Mode | Expected | Blocking? |
| --- | --- | --- | --- | --- |
| T-01 | Simulated device sync + command path (regression) | simulated | Works exactly as M10E/M10F today; audit + rate limit intact | Yes |
| T-02 | Live selected but credentials missing | tuya (misconfig) | Fail-fast `CONFIG_MISSING`-style startup/gateway error; no crash, no secret leak | Yes |
| T-03 | Read device metadata | tuya, read-only | Device found, online state returned, normalized result | Yes |
| T-04 | Read battery/status DPs | tuya, read-only | Battery + lock/door state DPs identified (or documented absent) | No |
| T-05 | Read logs/events (V-03) | tuya, read-only | Device-initiated events visible after physical unlock, latency recorded | No (degrades audit quality if absent) |
| T-06 | Create temporary PIN (if supported + approved) | tuya, live | PIN works at keypad within validity window | No |
| T-07 | Revoke temporary PIN | tuya, live | PIN rejected after revoke | Yes if T-06 ran |
| T-08 | Live unlock with person at door | tuya, live | Door opens; auto-relock verified; audit row written with gateway id | Yes |
| T-09 | Live remote lock | tuya, live | Locks, or clean `INSTRUCTION_NOT_SUPPORTED` (documented) | No |
| T-10 | Wrong-property admin access denial | any | 403; no resource existence leak | Yes |
| T-11 | Resident access to unauthorized device denial | any | 403/404 per self-scope rules | Yes |
| T-12 | Provider timeout handling | tuya (forced) | Normalized `timeout` result; retry policy classification correct; no hang | Yes |
| T-13 | Provider error normalization | tuya | Raw Tuya payload never in API response; mapped error codes only | Yes |
| T-14 | Audit log completeness for every live command | tuya | Actor, device, action, gateway, result, correlation id present; no secrets | Yes |
| T-15 | Unlock rate limit enforcement | any | Excess unlocks rejected with clear error; limit matches config | Yes |

---

## 13. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-01 | PALOMA does not support required Tuya API functions (esp. card/fingerprint remote ops — V-01/V-02) | Low–Med | Med | Physical test plan; documented fallbacks (physical reset + backend command audit); not blocking per Tuya audit. |
| R-02 | Remote unlock disabled by manufacturer/firmware or requires on-device setting | Med | High | Verify the lock's remote-unlock setting in Smart Life first; test app unlock before API unlock; record firmware. |
| R-03 | BLE-only control requiring phone proximity | Med | High | Section 6 step 8 detects it; if cloud control impossible, live milestone re-scoped (gateway purchase or model change) before M13F. |
| R-04 | Device requires a Tuya gateway (Zigbee/BLE bridge) | Med | Med | Detect at pairing; budget/procure gateway; architecture already models gateways. |
| R-05 | Region/data-center mismatch → signature/permission failures | Med | Med | Confirm region before creating cloud project; PoC troubleshooting table reused. |
| R-06 | Credential leakage (incl. legacy PoC env fragment) | Med | High | Sanitize PoC, rotate anything ever committed, secret-manager/`credential_ref` path, masking, no-commit rule. |
| R-07 | Unsafe unlock command (door opens unattended) | Low | Critical | Person-at-door rule, confirmation gate, rate limit, physical key, failure path in runbook. |
| R-08 | Battery/status/log DP codes differ from assumptions | Med | Low–Med | Discovery-first plan (Section 6); capability map stored per gateway/device, not hardcoded. |
| R-09 | Tuya API rate limits stricter than expected | Low–Med | Med | 163-device fleet is small; backoff via retry policy; monitor during M13E sync design. |
| R-10 | Network instability at the door (Wi-Fi dead spot, lock sleep) | Med | Med | Signal check on arrival; repeated status reads (D-17); treat `DEVICE_OFFLINE` as expected transient. |
| R-11 | Demo failure on site | Med | Med | Simulated mode always demoable; live test scheduled separately from stakeholder demo; rollback flag. |
| R-12 | PoC assumptions don't match multi-property production (single device/account) | High (by design) | Med | Section 2.8/2.10 mapping; multi-gateway architecture already frozen; PoC never copied. |

---

## 14. Milestone Breakdown After M13A

Small, gated, each independently validatable by Codex:

| Milestone | Scope | Gate to pass |
| --- | --- | --- |
| **M13B** | Live integration architecture freeze note (ADR-SL-001-compatible; new ADR only if a frozen decision must change) — provider mapping, config schema, secret source order, error-code mapping table | Review sign-off; no code |
| **M13C** | Tuya provider config + client skeleton: env schema + startup validation, signing client inside provider, token cache (Redis, per-gateway, single-flight), real `healthCheck`, `SMART_LOCK_PROVIDER`/`SMART_LOCK_LIVE_ENABLED` gates. Live commands still disabled | Lint/typecheck/build via Codex; simulated regression green |
| **M13D** | Device capability discovery tool / admin diagnostic (read-only, owner/manager-gated): functions/specifications/status fetch with masked output; seeds gateway + device mapping rows for the test property | Read-only proven against site data |
| **M13E** | Live read-only sync: device info, battery, status, (if V-03 passes) event logs into `smart_lock_access_logs`/alerts; background job design | T-03/T-04/T-05 pass |
| **M13F** | Controlled live command: unlock (ticket → door-operate → legacy fallback), lock, with audit + rate limit + idempotency + explicit confirmation; simulated default preserved | T-08/T-12/T-13/T-14/T-15 pass with supervision |
| **M13G** | Temporary PIN lifecycle (create/freeze/unfreeze/revoke) if device supports it; restriction workflow wiring | T-06/T-07 pass |
| **M13H** | Site QA / production readiness review: full test matrix, security re-check, M11H UI wiring go-decision | QA report PASS recorded |

---

## 15. Open Questions (answer before M13B)

1. Exact PALOMA model on site — is it confirmed DLP 2131?
2. Is the unit Tuya/Smart Life compatible out of the box (pairs into Smart Life)?
3. Which cloud region/data center will the project use (drives base URL)?
4. Is remote unlock supported and enabled for this model/firmware?
5. Is temporary PIN (online and/or offline) supported?
6. Does the lock need a Tuya gateway, or is it Wi-Fi direct? BLE dependency?
7. Which account will own the device (personal vs company account — company preferred)?
8. Which environment runs the site test (local laptop vs staging) and who controls its `.env`?
9. Who is physically present at the door during every live unlock test?
10. What is the rollback plan owner/checklist sign-off (Section 9 steps 18–19)?
11. What is allowed in stakeholder demos before M13F completes (simulated only recommended)?
12. Which PoC assumptions are safe to carry forward (Section 2.7) — confirmed by M13B review?
13. Has the PoC folder been sanitized and any historical credential rotated (Section 2.9)?

---

## 16. Go / No-Go Criteria for Site Visit

**GO when all are true:**

- [ ] Physical lock available and installed/installable at the test door.
- [ ] Pairing phone + Smart Life/Tuya owner account ready (A-01, A-12).
- [ ] Tuya IoT Platform project access ready with API subscriptions (A-02/A-03).
- [ ] Cloud region known and base URL derived (A-04/A-07).
- [ ] Backend simulated mode verified working (regression T-01 precondition).
- [ ] Admin UI can show the Smart Lock page with a truthful simulated indicator.
- [ ] Secret handling plan agreed (Section 11); no secret needs to touch docs/frontend.
- [ ] Emergency physical key / manual override confirmed on site (A-13).
- [ ] PoC reference sanitized and understood; historical credentials rotated.
- [ ] No real secrets or device IDs stored in docs or source.

**NO-GO if any is true:**

- No physical key / manual override available.
- No device-owner account access.
- No pairing account/phone.
- Cloud region unknown.
- No person can be physically present for the unlock test.
- Secrets would need to be pasted into docs or frontend to proceed.
- Live command cannot be safely supervised end-to-end.
- PoC still contains unsanitized secrets and rotation has not happened.

---

## Appendix A — Explicitly Unchanged / Not Claimed

- ADR-SL-001 and all frozen Smart Lock policies remain unchanged.
- Smart Lock live integration is **not** complete; M10G-equivalent work now proceeds as M13B–M13H.
- CCTV live, payment gateway, receipt/nota, chat attachment: unchanged, deferred, not part of M13.
- No lint/typecheck/build/API/browser validation was executed for M13A; all validation is scheduled via Codex in later milestones.
