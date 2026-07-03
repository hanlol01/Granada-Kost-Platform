# M13E - Smart Lock Live Read-only Sync Implementation

> Date: 2026-07-03
> Status: Implemented and validated by Codex
> Scope: Backend-only read-only sync. No live unlock, live lock, temporary PIN, frontend UI, Raw API Tester, PoC source change, or ADR change.

## 1. Implementation Summary

M13E turns the existing Smart Lock sync operation into a safe read-only provider sync path for Tuya mode. The backend resolves the device and gateway mapping, calls the provider through the existing runtime boundary, performs fixed allow-listed Tuya GET reads via the M13D diagnostic path, normalizes safe fields, persists only existing device summary columns, and records gateway health plus domain audit.

This is not live Smart Lock command integration. Live lock, unlock, and temporary PIN remain disabled and are still later milestones.

## 2. Files Changed

- `backend/api/src/modules/smart-lock/constants/smart-lock.constants.ts`
- `backend/api/src/modules/smart-lock/controllers/smart-lock-controller.util.ts`
- `backend/api/src/modules/smart-lock/controllers/smart-lock-device.controller.ts`
- `backend/api/src/modules/smart-lock/gateways/smart-lock-gateway.interface.ts`
- `backend/api/src/infrastructure/database/scripts/validate-smartlock-runtime.ts`
- `backend/api/src/modules/smart-lock/runtime/providers/tuya-smart-lock.provider.ts`
- `backend/api/src/modules/smart-lock/runtime/types/smart-lock-runtime.types.ts`
- `backend/api/src/modules/smart-lock/services/smart-lock-device.service.ts`
- `docs/13-smart-lock/SMART_LOCK_READ_ONLY_SYNC_IMPLEMENTATION.md`
- `docs/README.md`

## 3. Endpoint Route

Primary route:

- `POST /api/v1/smart-lock/devices/:deviceId/sync-readonly`

Compatibility route retained:

- `POST /api/v1/smart-lock/devices/:deviceId/sync-status`

Both routes call the same read-only sync flow.

## 4. Auth, RBAC, and Property Scope

- Requires JWT through the existing `JwtAuthGuard`.
- Requires `owner`, `manager`, or `admin` role through the existing controller guard.
- Requires `smart_lock.manage` because sync writes backend state.
- Loads the device by backend UUID.
- Calls `PropertyService.assertCanReadProperty()` before any provider call.
- Resident sync is not exposed.

## 5. Data Persisted

No migration was added. M13E reuses existing columns in `smart_lock_devices`:

- `connection_status`
- `lock_state`
- `battery_percent`
- `firmware_version`
- `model`
- `last_synced_at`

`last_activity_at` is also updated by the existing repository update path used for device status updates.

M13E also updates the existing `smart_lock_gateway_health` row for the resolved gateway:

- `health_status`
- `last_checked_at`
- `last_success_at` when healthy
- `latency_ms`
- `error_code`
- `error_message`
- safe JSON metadata containing section statuses, normalized fields, capability summary, masked provider device id, and status code names only

No raw Tuya payload, access token, refresh token, client secret, local key, ticket key, password, PIN, or raw provider device id is persisted.

## 6. Provider Read-only Behavior

In `SMART_LOCK_PROVIDER=tuya` mode, `syncDeviceStatus()` now reuses the M13D fixed allow-listed diagnostic reads:

- `GET /v1.0/devices/{id}`
- `GET /v1.0/devices/{id}/status`
- `GET /v1.0/devices/{id}/functions`
- `GET /v1.0/devices/{id}/specifications`
- fallback for specifications only: `GET /v1.2/iot-03/devices/{id}/specification`

The provider converts those results into a `read_only_sync` data envelope. The envelope includes normalized device state only:

- online/offline when safely known
- lock state when a clear lock status code is available
- battery percentage from numeric 0-100 values
- battery status text when safe
- door state for response/metadata only; it is not persisted to `lock_state`
- firmware/model strings when safe
- capability summary from normalized capability codes

## 7. Simulated Behavior

Default `SMART_LOCK_PROVIDER=simulated` mode returns a safe normalized read-only sync response instead of falling through to the legacy Tuya skeleton gateway.

The simulated response is explicit:

- `accepted: true`
- `provider: simulated`
- `result_status: success`
- `read_only_sync.sync_purpose: read_only_sync`
- `read_only_sync.sync_result_status: skipped`
- clear `reason` explaining that live Tuya diagnostic data is unavailable in simulated mode
- no raw provider payload
- gateway health recorded as safe/healthy for the simulated skipped result

The response also retains the existing `data` field as a compatibility alias for the same read-only sync envelope.

## 8. Error Normalization

Failures return normalized provider codes only, aligned with the M13B freeze:

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

Provider error messages are safe generic messages. Raw Tuya response messages are not returned or stored.

Live command paths are hard-disabled in M13E. Lock, unlock, emergency unlock, and normal-open-mode requests return `LIVE_COMMAND_DISABLED` and do not call Tuya command APIs or silently fall back to simulated command execution.

## 9. Audit / Log Behavior

Read-only sync writes a domain audit event:

- action: `smart_lock.device.sync_readonly`
- resource type: `smart_lock_device`
- resource id: backend device UUID
- property id: device property
- result status: success or failed
- safe before/after summary only

The audit payload includes provider, provider mode, result status, normalized error code, gateway id, persisted field names, normalized fields, and capability summary. It does not contain secrets or raw provider payloads.

## 10. Background Job Decision

No background job was added. The current project has runtime/repository support but no existing Smart Lock scheduler convention to extend safely in this milestone.

Future periodic read-only sync should reuse the same service method behind an explicit disabled-by-default scheduler or queue worker, with rate limits and gateway capacity controls.

## 11. Validation Result

Commands:

- `npm.cmd run build:api` - PASS (pre-documentation type check)
- `npm.cmd run lint:api` - PASS
- `npm.cmd run build:api` - PASS (final run)
- `npm.cmd run smartlock:validate-runtime` - PASS (`PASS=26 FAIL=0`)

Targeted API sanity:

- `GET /api/v1/health` - PASS
- unauthenticated `sync-readonly` - PASS (`401`)
- resident `sync-readonly` - PASS (`403`)
- property owner `sync-readonly` - PASS (`403`)
- admin `sync-readonly` in default simulated mode - PASS (`201`, `accepted:true`, `provider:simulated`, `read_only_sync.sync_result_status:skipped`, `persisted:true`)
- `sync-status` compatibility route - PASS (`201`, safe simulated read-only sync result)
- owner unlock command boundary - PASS (`201`, `accepted:false`, `LIVE_COMMAND_DISABLED`)
- response leakage marker check - PASS (no client secret, access token, refresh token, local key, or ticket key markers)

## 12. Known Limitations

- Real Tuya read-only sync requires real site credentials and an active `smart_lock_device_gateways` mapping.
- `credential_ref` to external secret-manager resolution remains future work; env bootstrap remains the local/site-test path.
- Door state is returned in safe sync data and gateway health metadata but is not persisted as a first-class DB field because the current schema has no door-state column.
- Capability summary is inferred from normalized capability codes. Unknown or skipped provider sections remain unknown rather than forced into production claims.
- Event log ingestion into `smart_lock_access_logs` is not implemented in M13E because the allowed read endpoints do not yet include a proven safe Tuya event-log contract for this device.

## 13. Remaining Work for M13F / M13G / M13H

- M13F: controlled live command implementation for lock/unlock with audit, rate limit, idempotency, and explicit safety gates.
- M13G: temporary PIN lifecycle only after read-only sync and controlled commands are proven.
- M13H: production hardening, scheduler/queue policy, richer gateway observability, and removal/backfill decisions for legacy provider-device-id fallback.
