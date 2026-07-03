# M13F-B - Smart Lock Backend Command Guard Implementation

> Date: 2026-07-03
> Status: Implemented; validation results recorded below
> Scope: Backend command guard only. No live unlock, live lock, temporary PIN, frontend UI, Raw API Tester, PoC source change, or ADR change.

## 1. Implementation Summary

M13F-B adds the backend-only controlled command guard required by the M13F-A safety freeze. The guard validates command requests, requires explicit confirmation/reason/idempotency, applies Redis-backed idempotency and rate-limit controls, evaluates fail-closed provider/device/gateway gates, writes safe audit/access-log records, and then reaches the existing provider boundary only when all pre-provider gates pass.

Live command execution is still not implemented. `TuyaSmartLockProvider.executeCommand()` remains disabled and returns `LIVE_COMMAND_DISABLED`; no Tuya unlock, lock, temporary PIN, raw signed request, or client-supplied provider payload was added.

## 2. Files Changed

- `backend/api/.env.example`
- `backend/api/src/infrastructure/config/configuration.ts`
- `backend/api/src/infrastructure/config/environment.validation.ts`
- `backend/api/src/modules/smart-lock/constants/smart-lock.constants.ts`
- `backend/api/src/modules/smart-lock/controllers/my-smart-lock.controller.ts`
- `backend/api/src/modules/smart-lock/controllers/smart-lock-device.controller.ts`
- `backend/api/src/modules/smart-lock/dto/smart-lock-command-request.dto.ts`
- `backend/api/src/modules/smart-lock/helpers/smart-lock-rate-limit.helper.ts`
- `backend/api/src/modules/smart-lock/services/smart-lock-command-guard.service.ts`
- `backend/api/src/modules/smart-lock/smart-lock.module.ts`
- `docs/13-smart-lock/SMART_LOCK_COMMAND_GUARD_IMPLEMENTATION.md`
- `docs/README.md`

## 3. Endpoint Route

Primary controlled command route:

- `POST /api/v1/smart-lock/devices/:deviceId/commands`

Legacy command routes are hardened to pass through the same guard:

- `POST /api/v1/smart-lock/devices/:deviceId/lock`
- `POST /api/v1/smart-lock/devices/:deviceId/unlock`
- `POST /api/v1/smart-lock/devices/:deviceId/emergency-unlock`
- `POST /api/v1/smart-lock/devices/:deviceId/normal-open-mode` returns the same safe unsupported handling path.

Resident self-unlock is disabled:

- `POST /api/v1/my/smart-lock/unlock` returns `403`.

## 4. RBAC and Permission Behavior

- JWT and existing RBAC guard remain required.
- Controlled admin command routes are limited to `admin` and `manager` roles.
- `smart_lock.manage` is required at the route layer.
- `property_owner` and `resident` are denied before command execution.
- The current development seed gives `manager` the dedicated `smart_lock.command` permission and gives `admin` `smart_lock.manage`; the M13F-B route therefore uses `smart_lock.manage` as the enforcement permission so seeded admin validation can reach the guard. The provider remains disabled regardless.

## 5. Property Scope Behavior

- The controller loads the backend smart lock device by UUID.
- `PropertyService.assertCanReadProperty()` runs before command guard execution.
- The backend device property is used for all idempotency/rate-limit/audit scope; client-supplied property IDs are not accepted on the command route.

## 6. Guard Gate Behavior

The guard is fail-closed. It short-circuits without provider execution when a gate fails:

- provider is not `tuya` -> `LIVE_COMMAND_DISABLED`
- live mode is not enabled -> `LIVE_COMMAND_DISABLED`
- active device-gateway mapping is missing -> `DEVICE_NOT_MAPPED`
- gateway is not active -> `LIVE_COMMAND_DISABLED`
- provider base URL or credentials are missing -> `CONFIG_MISSING`
- command capability is unsupported -> `UNSUPPORTED_CAPABILITY`
- device state / recent read-only sync is not acceptable -> `DEVICE_OFFLINE`
- rate-limit or Redis guard is unavailable/exceeded -> `RATE_LIMITED`
- audit intent cannot be written before provider boundary -> `UNKNOWN_PROVIDER_ERROR`

Request validation and request-level guard controls happen before any provider call.

## 7. Idempotency Behavior

- Requires `Idempotency-Key` HTTP header.
- Redis key scope is hashed from `actor_id + property_id + device_id + command_type + client key`.
- Raw idempotency key is never stored in audit/access log; only a short hash reference is stored.
- TTL default is 10 minutes via `SMART_LOCK_COMMAND_IDEMPOTENCY_TTL_SECONDS` (default `600`).
- Duplicate completed requests return the previous normalized response with `idempotency_replayed:true`.
- In-flight duplicates return a safe queued replay response and do not start a second command attempt.
- Redis unavailability fails closed before provider execution.

## 8. Rate-limit Behavior

- Redis-backed controlled command rate-limit is scoped by property, device, actor, command type, and emergency scope.
- `SMART_LOCK_MAX_UNLOCK_PER_MINUTE` optionally overrides normal unlock allowance.
- `SMART_LOCK_MAX_EMERGENCY_UNLOCK_PER_MINUTE` optionally overrides emergency allowance.
- Defaults are strict: normal unlock `3/minute`, emergency unlock `1/minute`.
- Lock uses the existing broader command default.
- Redis unavailability returns `RATE_LIMITED`; no provider call is attempted.

## 9. DTO Validation

Request body fields:

- `command_type` or `action`: `remote_unlock`, `emergency_unlock`, or `remote_lock` (`unlock`/`lock` aliases normalize to remote command names).
- `confirmed`: must be explicit `true`.
- `reason`: required, non-empty, max 500 chars.
- `emergency`: optional boolean.

Validation failures:

- missing/false confirmation -> HTTP 400 `SMART_LOCK_CONFIRMATION_REQUIRED`
- missing/empty reason -> HTTP 400 `SMART_LOCK_REASON_REQUIRED`
- missing `Idempotency-Key` -> HTTP 400 `SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`
- unsupported command -> HTTP 400 `UNSUPPORTED_CAPABILITY`

## 10. Provider Disabled Behavior

No Tuya command endpoint was implemented. When all guard gates pass in a future live-configured environment, the service still calls the existing provider boundary, where `TuyaSmartLockProvider.executeCommand()` returns `LIVE_COMMAND_DISABLED`.

There is no ticket request, no door-operate call, no temporary PIN, no arbitrary signed request endpoint, and no simulated fallback for live-intent commands.

## 11. Audit / Access Log Behavior

The command guard writes safe domain audit and Smart Lock access log records for command results. When the provider boundary would be reached, an intent audit is written first; if that intent write fails, the provider is not called.

Safe fields include:

- actor id / roles
- property id
- backend device id
- command type
- confirmation status
- emergency flag
- reason
- idempotency key reference hash only
- correlation id
- result status
- normalized error code
- provider
- gateway id when available

Never stored:

- access token
- refresh token
- client secret
- PIN/password
- ticket key
- local key
- raw provider payload
- unmasked provider device ID

## 12. Response Contract

The controlled command route returns normalized responses only:

```json
{
  "accepted": false,
  "command_id": "<access-log-reference-if-written>",
  "command_type": "remote_unlock",
  "provider": "simulated",
  "result_status": "failed",
  "error_code": "LIVE_COMMAND_DISABLED",
  "error_message": "Live command is disabled.",
  "idempotency_replayed": false,
  "timestamp": "2026-07-03T00:00:00.000Z",
  "correlation_id": "<correlation-id>"
}
```

`accepted:true` is used only for `success` or `queued`. M13F-B normally returns `accepted:false` because live provider commands remain disabled.

## 13. Validation Result

Commands:

- `npm.cmd run lint:api` - PASS
- `npm.cmd run build:api` - PASS
- `npm.cmd run smartlock:validate-runtime` - PASS (`PASS=26 FAIL=0`)

Targeted backend/API sanity:

- default simulated backend startup + `GET /api/v1/health` - PASS
- controlled command endpoint requires auth - PASS (`401`)
- resident controlled command denied - PASS (`403`)
- property owner controlled command denied - PASS (`403`)
- admin missing confirmation - PASS (`400 SMART_LOCK_CONFIRMATION_REQUIRED`)
- admin missing reason - PASS (`400 SMART_LOCK_REASON_REQUIRED`)
- admin missing `Idempotency-Key` - PASS (`400 SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED`)
- unsupported command - PASS (`400 UNSUPPORTED_CAPABILITY`)
- valid guarded command in simulated mode - PASS (`201`, `accepted:false`, `LIVE_COMMAND_DISABLED`, no Tuya execution)
- duplicate idempotency key - PASS (`idempotency_replayed:true`, same normalized result)
- rate-limited command - PASS (`RATE_LIMITED`, no provider execution)
- resident self-unlock - PASS (`403`)
- M13E `sync-readonly` regression - PASS (`201`, safe simulated `read_only_sync`, no `TUYA_GATEWAY_NOT_IMPLEMENTED`)
- response leakage marker check - PASS (no client secret, access token, refresh token, local key, ticket key, raw provider payload markers)

M13D diagnostics availability note: the local database currently has no smart lock device with an active gateway mapping, so `GET /api/v1/smart-lock/devices/:deviceId/diagnostics` returned the safe expected `400 DEVICE_NOT_MAPPED`. No seed/migration data was modified to fabricate a mapping for this validation.

## 14. Known Limitations

- Live Tuya unlock/lock is still not implemented.
- Temporary PIN remains deferred to M13G.
- Admin/Penghuni frontend UI is not implemented.
- Real provider command transport remains M13F-C+ and requires site-trial preconditions from M13F-A Section 14.
- Current guard uses backend device status / last sync / gateway health for the G-05 online-or-recent-sync decision; richer per-provider capability evidence can be added after site observations.

## 15. Remaining Work for M13F-C / Site Trial

- Explicit site approval and person-at-door runbook.
- Provider command transport implementation behind the existing guard.
- Tuya ticket -> door-operate -> approved fallback command path.
- Site-trial logs and rollback verification.
- Follow-up policy decision if admin should receive `smart_lock.command` in seed data or remain `smart_lock.manage`-only for guarded command validation.
