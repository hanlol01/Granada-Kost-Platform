# M13C — Tuya Provider Config + Client Skeleton Implementation

> **Milestone:** M13C (backend implementation per the M13C contract in `SMART_LOCK_LIVE_INTEGRATION_ARCHITECTURE_FREEZE.md`, Section 15)
> **Date:** 2026-07-03
> **Status:** Implemented; **validation pending via Codex** (GitLab Duo has no shell access — no lint/typecheck/build/API/browser validation was run or is claimed)
> **Binding inputs:** M13A readiness plan, M13B architecture freeze, ADR-SL-001 (unchanged)
>
> This document contains no real secrets and no real device IDs.
> **Live Smart Lock integration is NOT complete.** M13C adds configuration and a read-only client skeleton only.

---

## 1. Implementation Summary

M13C adds backend configuration and a backend-only Tuya client skeleton sufficient for a real read-only provider `healthCheck` (token sanity + optional lightweight device read) and for the M13D diagnostics that follow. Simulated mode remains the default and the rollback path. Live lock/unlock is **not** implemented: in Tuya mode every command action returns the normalized `LIVE_COMMAND_DISABLED` result, even when `SMART_LOCK_LIVE_ENABLED=true`. No PoC code was copied; signing/token behavior was re-implemented from the Tuya specification with the PoC used as reference knowledge only.

## 2. Files Changed

**New (all inside the smart-lock runtime/provider boundary):**

| File | Purpose |
| --- | --- |
| `backend/api/src/modules/smart-lock/runtime/providers/tuya/smart-lock-tuya-config.service.ts` | Non-secret provider config (selection, gates, timeout, region/base URL resolution, diagnostic-only `TUYA_DEVICE_ID_TEST`) |
| `backend/api/src/modules/smart-lock/runtime/providers/tuya/tuya-signing.helper.ts` | Pure HMAC-SHA256 signing helpers (string-to-sign, canonical path, sign payload, nonce) |
| `backend/api/src/modules/smart-lock/runtime/providers/tuya/tuya-error-normalization.ts` | Frozen error-code set (M13B Section 12) + Tuya business-code/message normalization |
| `backend/api/src/modules/smart-lock/runtime/providers/tuya/tuya-http-client.service.ts` | Backend-only signed HTTP client (GET-only, timeout, normalized failures, masked debug logs) |

**Updated:**

| File | Change |
| --- | --- |
| `backend/api/src/modules/smart-lock/runtime/providers/tuya-smart-lock.provider.ts` | Real read-only `healthCheck` in Tuya mode; simulated delegation preserved; `LIVE_COMMAND_DISABLED` / `NOT_IMPLEMENTED` gates |
| `backend/api/src/modules/smart-lock/runtime/services/smart-lock-secret-resolution.service.ts` | `resolveTuyaCredentials()` env bootstrap source behind the secret-resolution boundary |
| `backend/api/src/modules/smart-lock/smart-lock.module.ts` | DI wiring for the two new services |
| `backend/api/src/infrastructure/config/configuration.ts` | `smartLock` config section |
| `backend/api/src/infrastructure/config/environment.validation.ts` | Joi schema with safe defaults + conditional CONFIG_MISSING fail-fast |
| `backend/api/.env.example` | Placeholder-only Smart Lock / Tuya block |
| `backend/api/src/infrastructure/database/scripts/validate-smartlock-runtime.ts` | Updated construction for new DI signature + new deterministic gate checks |
| `docs/README.md` | Index entry for this document |

## 3. Config / Env Behavior

- Safe defaults: `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`, `SMART_LOCK_COMMAND_TIMEOUT_MS=15000`. `SMART_LOCK_MAX_UNLOCK_PER_MINUTE` is optional and not yet consumed (M13F wiring).
- Simulated development is untouched: with no Tuya env at all, Joi validation passes and startup behavior is unchanged.
- Fail-fast: when `SMART_LOCK_PROVIDER=tuya`, Joi requires `TUYA_CLIENT_ID`/`TUYA_CLIENT_SECRET` with `CONFIG_MISSING:`-prefixed messages, so a misconfigured live selection stops at startup. The `TUYA_REGION`-or-`TUYA_BASE_URL` requirement is enforced at runtime by `healthCheck` (normalized `CONFIG_MISSING`), since either satisfies it.
- Region mapping: `sg | us | ueaz | eu | weaz | cn` → known Tuya base URLs; `TUYA_BASE_URL` overrides.
- `TUYA_DEVICE_ID_TEST` is diagnostic-only (local/site test), never used on production command paths.
- No frontend env was touched; no Tuya variable exists anywhere in the frontend.

## 4. Secret Resolution Behavior

- `SmartLockSecretResolutionService.resolveTuyaCredentials(secretRef)` is the **only** path to Tuya credentials. The provider and HTTP client never read `TUYA_CLIENT_SECRET` directly.
- Source priority (M13B Section 5): 1) `credential_ref` → secret manager (production direction, not implemented in M13C, falls through) → 2) env bootstrap source (local/site-test only).
- Missing credentials return `null`, normalized by callers to `CONFIG_MISSING`. No credential plaintext exists in the database (unchanged `credential_ref` model, migration `010`).
- Health metadata exposes only `credentialSource: 'env_bootstrap'` and check statuses — never values, tokens, or device ids.

## 5. Signing / Client Behavior

- HMAC-SHA256 per Tuya spec: string-to-sign `METHOD \n SHA256(body) \n \n canonicalPath` (query params sorted); sign payload `client_id + access_token + t + nonce + stringToSign`; uppercase hex; headers `client_id`, `access_token` (when available), `sign`, `t`, `nonce`, `sign_method: HMAC-SHA256`.
- Exact-body signing: the body string is serialized once and the identical bytes are signed and sent. M13C issues only body-less GETs (signed over the empty string); the helper already supports bodies for later milestones.
- Timeout via `AbortController` using `SMART_LOCK_COMMAND_TIMEOUT_MS` → normalized `PROVIDER_TIMEOUT`.
- GET-only client, no raw signed pass-through endpoint, no Raw API Tester, no frontend exposure. Debug logs mask device ids and token-like query values; raw Tuya `msg` text is discarded during normalization.

## 6. Token / Cache Behavior

- Grant: `GET /v1.0/token?grant_type=1`, backend-only, via the signed client.
- Cache: existing `SmartLockTokenCacheService` (Redis, key per gateway id, `granada:` prefix) with a 60 s refresh-ahead buffer applied to the cached expiry.
- Single-flight: `acquireRefreshLock` guards cache writes; when the lock is not obtained, the caller performs a direct uncached grant (documented simplification — no busy-wait — acceptable for read-only health checks).
- Retry-once: on a `TOKEN_ERROR` response the cached token is cleared, one fresh grant is made, and the request retried exactly once.
- Redis unavailability degrades gracefully to direct grants; tokens are never exposed to API clients, logs, or metadata.

## 7. healthCheck Behavior

- `SMART_LOCK_PROVIDER=simulated` (default): returns the pre-M13C `unknown` skeleton result (`TUYA_PROVIDER_SKELETON`), preserving existing behavior and the runtime validation script expectations.
- `SMART_LOCK_PROVIDER=tuya`: 1) config/credential check → `CONFIG_MISSING` (unhealthy) listing missing names only; 2) token sanity → unhealthy with the normalized token/signature error on failure; 3) optional lightweight `GET /v1.0/devices/{id}` using the resolved `providerDeviceId` or, if absent, the diagnostic-only `TUYA_DEVICE_ID_TEST`; failure yields `degraded` with the normalized code; 4) otherwise `healthy`. If no device id is available, the device check is reported as `skipped` — it is never required.
- All results are masked and normalized; no raw Tuya payload, secret, token, or device id in the result.

## 8. Provider Gate / Live-Command-Disabled Behavior

- Default remains simulated; `SMART_LOCK_PROVIDER=tuya` selects the Tuya path.
- In Tuya mode, `executeCommand` **always** returns `LIVE_COMMAND_DISABLED` in M13C — even with `SMART_LOCK_LIVE_ENABLED=true` — and never silently reroutes a live-intent request to the simulated gateway.
- In Tuya mode, `syncDeviceStatus` returns `NOT_IMPLEMENTED` (read-only sync is M13D/M13E scope).
- Simulated mode keeps the exact pre-M13C delegation for sync/commands.
- `VITE_FEATURE_SMARTLOCK_MODE` remains UX-only; no frontend change was made.

## 9. Validation Commands (to run later in Codex — NOT run here)

```
npm.cmd run lint:api
npm.cmd run build:api
# or from backend/api: npm.cmd run lint && npm.cmd run build
npm.cmd run smartlock:validate-runtime   # from backend/api (needs DB + Redis)
```

## 10. Sanity Checks (for Codex later — NOT run here)

1. Simulated default startup works without any Tuya env (no regression, no crash).
2. `GET /api/v1/health` PASS.
3. `SMART_LOCK_PROVIDER=tuya` with missing Tuya config → CONFIG_MISSING-style safe failure (Joi at startup; normalized `CONFIG_MISSING` from healthCheck).
4. `SMART_LOCK_PROVIDER=tuya` with placeholder/invalid config → normalized errors only, no secret in logs/output.
5. Live command path returns `LIVE_COMMAND_DISABLED` (also covered by the updated `smartlock:validate-runtime` checks).
6. No raw token/secret in logs or API output (inspect pino output during the above).
7. Simulated regression: `smartlock:validate-runtime` all PASS.

## 11. Known Limitations

- `credential_ref` → secret-manager resolution is not implemented; env bootstrap is the only working source (local/site test). Production secret-manager wiring is later work.
- Startup Joi requirement of `TUYA_CLIENT_ID/SECRET` when provider=tuya assumes the env bootstrap source; it must be revisited when secret-manager resolution lands.
- Single-flight token refresh does not wait on the lock holder; concurrent callers may perform an extra uncached grant.
- Query canonicalization sorts whole `key=value` pairs (sufficient for current single-parameter GETs); revisit for multi-param endpoints in M13D.
- Tuya business-code map is an initial table, to be refined against real responses in M13D/M13E.
- `SMART_LOCK_MAX_UNLOCK_PER_MINUTE` is schema-only; rate-limit helper wiring is M13F.
- No live command, no temporary PIN, no frontend UI, no background sync — all deliberately out of M13C scope.

## 12. Remaining Work (M13D / M13E / M13F)

- **M13D:** owner/manager + property-scoped read-only diagnostics (metadata/status/functions/specifications, allow-listed, masked); seed gateway + device mapping for the test property.
- **M13E:** read-only sync (device info, battery, status, event logs if V-03 passes) with `SMART_LOCK_LIVE_ENABLED=false`; background job design.
- **M13F:** controlled live commands (ticket → door-operate → legacy fallback) with audit, rate limit, idempotency, confirmation; simulated default preserved; only after M13D/E gates pass.
- Rotation confirmation for any credential ever present in PoC/history remains a hard precondition before real-device testing (M13B Section 17.6).
