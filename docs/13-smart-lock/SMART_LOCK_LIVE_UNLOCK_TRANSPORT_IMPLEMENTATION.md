# M13F-C2 - Smart Lock Live Unlock Transport Implementation Behind Guard

> Date: 2026-07-04
> Status: Implemented and validated by Codex
> Scope: Backend provider transport for Tuya live remote unlock only, behind the existing M13F-B command guard. No physical site trial authorization, no live lock, no temporary PIN, no frontend UI, no Raw API Tester, no ADR change.

## 1. Implementation Summary

M13F-C2 wires `TuyaSmartLockProvider.executeCommand()` to the allow-listed Tuya unlock transport, reachable only after the existing M13F-B command guard has passed every RBAC, property-scope, idempotency, rate-limit, device/gateway, config, health, confirmation, and audit-intent gate.

Default simulated mode and Tuya dry-run mode remain safe. When `SMART_LOCK_PROVIDER=simulated`, or when `SMART_LOCK_PROVIDER=tuya` with `SMART_LOCK_LIVE_ENABLED=false`, command requests still return `LIVE_COMMAND_DISABLED` before live provider IO.

This milestone does not authorize a physical live unlock trial. A supervised site session still requires the M13F-C1 runbook approvals, person-at-door confirmation, test-device criteria, dry-run evidence, and Go/No-Go sign-off.

## 2. Files Changed

- `backend/api/src/modules/smart-lock/runtime/providers/tuya/tuya-http-client.service.ts`
- `backend/api/src/modules/smart-lock/runtime/providers/tuya/tuya-error-normalization.ts`
- `backend/api/src/modules/smart-lock/runtime/providers/tuya-smart-lock.provider.ts`
- `backend/api/src/modules/smart-lock/services/smart-lock-command-guard.service.ts`
- `backend/api/src/infrastructure/database/scripts/validate-smartlock-runtime.ts`
- `docs/13-smart-lock/SMART_LOCK_LIVE_UNLOCK_TRANSPORT_IMPLEMENTATION.md`
- `docs/README.md`

## 3. Provider Command Flow

Allowed live command actions:

- `remote_unlock`
- `emergency_unlock`

Transport sequence:

1. Resolve provider credentials and base URL inside the backend provider boundary.
2. Request a password-free ticket immediately before the unlock operation:
   - `POST /v1.0/smart-lock/devices/{device_id}/password-ticket`
3. Extract the ticket in memory only.
4. Operate the door with the ticket:
   - `POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate`
   - body: `{ "ticket_id": "<in-memory-ticket>", "open": true }`
5. If the operate endpoint explicitly reports unsupported instruction, try the legacy fallback once:
   - `POST /v1.0/devices/{device_id}/door-lock/password-free/open-door`

The ticket is not cached, stored, returned, logged, or added to audit metadata.

## 4. Exact-body Signing

`TuyaHttpClientService` now supports provider-chosen signed POST calls. POST bodies are serialized once with `JSON.stringify`, signed using the exact serialized bytes, and sent using the same body string.

No raw signed pass-through endpoint was added. Client-supplied paths and client-supplied provider payloads remain impossible.

## 5. Guard Boundary Behavior

M13F-B command guard remains the enforcement point before provider execution:

- authentication and route RBAC remain unchanged
- resident and `property_owner` command access remain denied
- property scope still comes from the backend device
- `Idempotency-Key` remains required
- confirmation and reason remain required
- Redis-backed idempotency and rate-limit gates remain fail-closed
- gateway/device/config/health gates remain fail-closed
- audit intent is written before provider execution

M13F-C2 does not duplicate, bypass, weaken, or move those gates into the provider.

## 6. Disabled and Unsupported Commands

- Default simulated mode returns `LIVE_COMMAND_DISABLED`.
- Tuya dry-run mode with `SMART_LOCK_LIVE_ENABLED=false` returns `LIVE_COMMAND_DISABLED`.
- Live `remote_lock` remains unsupported and returns `UNSUPPORTED_CAPABILITY` if the provider boundary is reached.
- Temporary PIN is not implemented.
- Resident self-unlock remains denied.
- No fallback to simulated command execution occurs when the caller intended live Tuya mode.

## 7. Token Retry Behavior

The provider may retry once only when Tuya returns a normalized `TOKEN_ERROR`. The retry clears the cached token, grants a fresh token, and repeats the same provider-chosen request.

There is no blind retry on timeout, provider connection error, unknown provider error, device offline, permission error, API subscription error, or any other dangerous/ambiguous command outcome.

## 8. Response and Audit Behavior

Command responses remain normalized. Safe additional metadata can include:

- `provider_latency_ms`
- `commandTransport`
- `doorOperateAttempted`
- `legacyFallbackAttempted`

Never returned or stored:

- client secret
- access token
- refresh token
- ticket id
- local key
- PIN/password
- raw Tuya payload
- raw provider device id
- raw Tuya `code` or `msg`

Tuya API errors are normalized to backend provider error codes and safe generic messages.

## 9. Validation Result

Commands:

- `npm.cmd run build:api` - PASS
- `npm.cmd run lint:api` - PASS
- `npm.cmd run smartlock:validate-runtime` - PASS (`PASS=28 FAIL=0`)

Targeted default simulated API sanity:

- `GET /api/v1/health` - PASS
- unauthenticated `sync-readonly` - PASS (`401`)
- resident `sync-readonly` - PASS (`403`)
- property owner `sync-readonly` - PASS (`403`)
- admin Smart Lock device list - PASS
- missing confirmation - PASS (`400 SMART_LOCK_CONFIRMATION_REQUIRED`)
- missing reason - PASS (`400 SMART_LOCK_REASON_REQUIRED`)
- missing `Idempotency-Key` - PASS (`400 SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`)
- unsupported command - PASS (`400 UNSUPPORTED_CAPABILITY`)
- admin `sync-readonly` in simulated mode - PASS (`201`, `accepted:true`, `provider:simulated`)
- admin `sync-status` compatibility route - PASS (`201`, `accepted:true`, `provider:simulated`)
- command idempotency replay - PASS (`idempotency_replayed:true`)
- valid `remote_unlock` in simulated mode - PASS (`201`, `accepted:false`, `LIVE_COMMAND_DISABLED`, `provider:simulated`)
- configured one-unlock-per-minute rate-limit - PASS (`RATE_LIMITED`)
- M13D diagnostics regression - PASS (safe `DEVICE_NOT_MAPPED` in current local seed state, no skeleton error)
- leakage marker check - PASS

Targeted Tuya dry-run API sanity:

- `SMART_LOCK_PROVIDER=tuya`, `SMART_LOCK_LIVE_ENABLED=false`, placeholder Tuya config - PASS startup
- `GET /api/v1/health` - PASS
- valid `remote_unlock` - PASS (`201`, `accepted:false`, `LIVE_COMMAND_DISABLED`, `provider:tuya`)
- leakage marker check - PASS

Provider transport harness with fake local Tuya server:

- provider result success - PASS
- request order token -> password-ticket -> door-operate - PASS
- ticket request body is exact `{}` - PASS
- door-operate body uses in-memory ticket and `open:true` - PASS
- ticket is not returned in provider result - PASS
- legacy fallback is not called on primary success - PASS

## 10. Runtime Sanity Notes

- Default simulated startup remains the safe default.
- Tuya dry-run mode remains safe with `SMART_LOCK_LIVE_ENABLED=false`.
- M13D diagnostics and M13E read-only sync remain read-only.
- Missing Tuya config in live mode fails safely with `CONFIG_MISSING`.
- No physical live unlock call was attempted.
- `SMART_LOCK_LIVE_ENABLED=true` was not used for a site trial.

## 11. Known Limitations

- Live unlock transport is implemented but not site-proven in this milestone.
- A real live trial still requires M13F-C1 runbook approval and person-at-door supervision.
- Remote lock remains unsupported in M13F-C2.
- Temporary PIN remains deferred to M13G.
- Admin/Penghuni UI remains out of scope.
- Real credentials, real device mapping, cloud subscription state, and device firmware capability must be confirmed at site.

## 12. Remaining Work

- M13F-C3 or approved site session: supervised live unlock dry-run/live-trial evidence capture.
- M13G: temporary PIN lifecycle, only after controlled unlock evidence is accepted.
- M13H: production hardening, gateway observability, richer capability policy, and operational runbooks.
