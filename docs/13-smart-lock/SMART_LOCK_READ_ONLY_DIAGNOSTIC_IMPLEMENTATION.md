# M13D - Smart Lock Read-only Diagnostic / Capability Discovery Implementation

> Date: 2026-07-03
> Status: Implemented and validated by Codex
> Scope: Backend-only read-only diagnostics. No live unlock, live lock, temporary PIN, frontend UI, Raw API Tester, or ADR change.

## 1. Implementation Summary

M13D adds a safe Admin read-only diagnostic endpoint for Smart Lock devices. The endpoint resolves the device through the backend gateway mapping, runs fixed allow-listed Tuya GET operations through the existing provider boundary, and returns a normalized/masked response for metadata, status, functions, specifications, and provider health.

Live command behavior remains disabled. Diagnostics may run with `SMART_LOCK_PROVIDER=tuya` while `SMART_LOCK_LIVE_ENABLED=false`; simulated mode returns a clear skipped diagnostic state.

## 2. Files Changed

- `backend/api/src/modules/smart-lock/controllers/smart-lock-device.controller.ts`
- `backend/api/src/modules/smart-lock/controllers/smart-lock-controller.util.ts`
- `backend/api/src/modules/smart-lock/services/smart-lock-device.service.ts`
- `backend/api/src/modules/smart-lock/constants/smart-lock.constants.ts`
- `backend/api/src/modules/smart-lock/runtime/services/smart-lock-runtime.service.ts`
- `backend/api/src/modules/smart-lock/runtime/services/smart-lock-gateway-resolver.service.ts`
- `backend/api/src/modules/smart-lock/runtime/types/smart-lock-runtime.types.ts`
- `backend/api/src/modules/smart-lock/runtime/providers/tuya-smart-lock.provider.ts`
- `backend/api/src/modules/smart-lock/smart-lock.module.ts`
- `docs/13-smart-lock/SMART_LOCK_READ_ONLY_DIAGNOSTIC_IMPLEMENTATION.md`

## 3. Endpoint Route

`GET /api/v1/smart-lock/devices/:deviceId/diagnostics`

The route is added to the existing Smart Lock device controller.

## 4. Auth, RBAC, and Property Scope

- Requires JWT via existing `JwtAuthGuard`.
- Requires existing Smart Lock roles: `owner`, `manager`, or `admin`.
- Requires `smart_lock.read`.
- Loads the device by backend UUID and calls `PropertyService.assertCanReadProperty()` before any provider call.
- Resident diagnostics are not exposed.
- A domain audit event is written with action `smart_lock.device.diagnostic_read`, device ID, property ID, gateway ID, section statuses, and normalized error codes only.

## 5. Provider Read-only Operations

Allowed Tuya operations are hardcoded inside the provider:

- `GET /v1.0/devices/{id}`
- `GET /v1.0/devices/{id}/status`
- `GET /v1.0/devices/{id}/functions`
- `GET /v1.0/devices/{id}/specifications`
- Fallback only for specifications: `GET /v1.2/iot-03/devices/{id}/specification`

No arbitrary signed path, no POST, no raw pass-through endpoint, and no command endpoint was added.

## 6. Diagnostic Response Shape

Top-level response fields:

- `provider`
- `provider_mode`
- `live_command_enabled`
- `result_status`
- `provider_device_id_masked`
- `timestamp`
- `correlation_id`
- `gateway`
- `health`
- `sections.metadata`
- `sections.status`
- `sections.functions`
- `sections.specifications`

Each section includes:

- `result_status`
- `operation`
- `source`
- normalized `data` when successful
- `error_code`
- `error_message`
- `latency_ms`

## 7. Masking / No-secret Behavior

The endpoint does not return raw Tuya envelopes, access tokens, refresh tokens, client secrets, local keys, ticket keys, passwords, PINs, or raw provider error payloads.

`provider_device_id` is returned only as `provider_device_id_masked`. Status and capability entries are filtered by code/name so secret-like fields are excluded.

## 8. Simulated Behavior

When `SMART_LOCK_PROVIDER=simulated`, the endpoint returns a normalized skipped diagnostic:

- `provider_mode=simulated`
- `result_status=skipped`
- `health.result_status=skipped`
- each read-only Tuya section is skipped with a clear message

This preserves simulated development behavior and avoids presenting mock diagnostic data as production-ready device discovery.

## 9. Error Normalization

Diagnostics use the frozen normalized provider codes:

- `CONFIG_MISSING`
- `SIGNATURE_INVALID`
- `PERMISSION_DENIED`
- `API_NOT_SUBSCRIBED`
- `DEVICE_OFFLINE`
- `TOKEN_ERROR`
- `PROVIDER_TIMEOUT`
- `PROVIDER_CONNECTION_ERROR`
- `DEVICE_NOT_MAPPED`
- `UNSUPPORTED_CAPABILITY`
- `UNKNOWN_PROVIDER_ERROR`

If no active device-to-gateway mapping exists, M13D diagnostics fail with `DEVICE_NOT_MAPPED` before any provider call.

## 10. Validation Result

Commands run:

- `npm.cmd run lint:api` - PASS
- `npm.cmd run build:api` - PASS
- `npm.cmd run smartlock:validate-runtime` - PASS

Backend sanity:

- Default simulated backend startup and `/api/v1/health` - PASS
- Diagnostic endpoint requires auth - PASS
- Missing Tuya config behavior - validated through runtime checks and direct provider diagnostics; returns normalized `CONFIG_MISSING`
- Live command remains disabled - PASS via runtime validator

## 11. Known Limitations

- Real Tuya diagnostics require real site credentials and a real active device mapping; no real secrets or device IDs are committed.
- `credential_ref` to external secret-manager resolution is still future work; env bootstrap remains the local/site-test path from M13C.
- M13D only discovers capabilities. It does not persist capability maps or sync status into device rows; that belongs to M13E.
- Specification fallback returns the primary failure if both primary and fallback fail, to avoid exposing multiple provider failures.

## 12. Remaining Work

- M13E: read-only sync into device/status/access-log surfaces where appropriate.
- M13F: controlled live command implementation with audit, rate limit, idempotency, and explicit safety gates.
- M13G: temporary PIN lifecycle only after M13D/E/F gates pass.
