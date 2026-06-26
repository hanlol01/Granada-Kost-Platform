# Milestone 10F — Smart Lock Multi Gateway Architecture (Planning)

> **Status:** Planning / Design only. **No code, no migration, no controller, no endpoint, no production service in this milestone.**
>
> **Goal:** Prepare the backend so Smart Lock operations are not bound to a single Tuya Cloud account. Granada uses a **Multi Gateway Smart Lock Architecture** where each gateway maps to its own provider account (Tuya Account A/B/C/D), and where non-Tuya providers can be added later without rewriting Smart Lock business logic.
>
> **Source of truth:** This document is derived from and must stay consistent with `PROJECT_MASTER.md`, `ARCHITECTURE_DECISIONS.md`, `DOMAIN_MODEL.md`, `DATABASE_PLANNING.md`, `API_PLANNING.md`, `BACKEND_ARCHITECTURE.md`, `SMARTLOCK_POLICY.md`, `NOTIFICATION_DOMAIN.md`, and `SECURITY_POLICY.md`.
>
> **Compatibility goal:** Stay fully compatible with completed milestones and with the final business decisions. Propose the **smallest possible change** to previously completed work. This document does not change any milestone 10A–10E scope.

---

## 0. Context & Architectural Decision

Production licensing investigation of Tuya Cloud showed that a single Tuya Cloud account cannot serve production due to resource limits and high production cost. The architectural decision is:

- The backend must not depend on one Tuya Cloud account.
- The backend must be able to use many gateways/providers transparently.
- Example mapping:
  - Gateway A -> Tuya Account A
  - Gateway B -> Tuya Account B
  - Gateway C -> Tuya Account C
  - Gateway D -> Tuya Account D
- In the future, gateways must also support providers other than Tuya.

### Alignment with existing final decisions

`SMARTLOCK_POLICY.md` and `BACKEND_ARCHITECTURE.md` already state these non-negotiable rules that this design inherits without change:

- All lock/unlock/restrict/unrestrict operations go through the backend, never directly from frontend to Tuya.
- Tuya secrets are stored only in backend configuration or a secret manager, never in the database and never in the frontend bundle.
- Every Smart Lock action is audited with actor, device, action, time, result, and correlation id.
- Unlock is rate-limited more strictly than lock.
- `property_owner` (Pemilik Rumah Kost) has no Smart Lock access.
- No full debt-based auto-lock without human approval in Phase 1.
- Provider integration must go through an anti-corruption layer; raw provider payloads must not reach the API response.

### Design principle

Smart Lock domain code (lock/unlock, access grant, access log, restriction) talks to an abstract Gateway/Provider boundary, never to the Tuya SDK directly. A **Gateway Resolver** decides which gateway handles a device. This reuses the provider abstraction pattern already implemented in the Notification module (`backend/api/src/modules/notification/providers/notification-provider.interface.ts` with `brevo-email.provider.ts`, `fonnte-whatsapp.provider.ts`, `web-push.provider.ts`), so the pattern is already established in the codebase.

### Status of the Smart Lock backend

Per `ROADMAP.md`, the Smart Lock backend module is not yet implemented (the roadmap lists Smart Lock, CCTV, file upload, and worker/provider integration as not started). The Smart Lock schema is defined at planning level in `DATABASE_PLANNING.md` (`smart_lock_devices`, `smart_lock_access_grants`, `smart_lock_access_logs`, `smart_lock_restrictions`, `smart_lock_alerts`) and the Smart Lock API is defined at planning level in `API_PLANNING.md`. This Multi Gateway design extends those plans additively and must be implemented together with, or after, the base Smart Lock module.

---

## 1. Gateway Registry Architecture

A **Gateway Registry** is the single source of truth describing every gateway available to the system.

**Each gateway record (logical model, not a migration yet) describes:**

- `gateway_id` (stable internal identifier)
- `property_id` (gateways belong to a property scope, consistent with the multi-property rule in `DATABASE_PLANNING.md`)
- `provider_type` (`tuya`; future: other providers)
- `display_name`
- `gateway_code` (human code, see Naming Convention in section 21)
- `gateway_status` (`active`, `degraded`, `maintenance`, `draining`, `disabled`)
- `priority` and `weight` (selection and failover ordering)
- `capacity_limit` and `capacity_used` (device count control)
- `region` (optional)
- `credential_ref` (pointer to a secret, never the secret itself)
- `capabilities` (supported operations: `lock`, `unlock`, `sync_status`, `temp_password`, `access_log`)
- `created_at`, `updated_at`, `disabled_at`

**Responsibilities:**

- Enumerate gateways and their status/health.
- Provide gateway metadata to the Resolver and Failover layers.
- Never expose raw credentials; only `credential_ref`.

**Placement (proposed, future implementation):** the Smart Lock module under `backend/api/src/modules` owns these tables and services, following the established module layout used by existing modules (`controllers/ services/ repositories/ dto/ types/ constants/ helpers/`). Provider implementations live under the Smart Lock module `providers/` directory, mirroring `notification/providers/`.

---

## 2. Gateway Resolver Flow

The **Gateway Resolver** answers: for this device/operation, which gateway is used.

**Resolution order:**

1. **Explicit mapping** — if a `device -> gateway` mapping exists (section 5), use it. This is the case for every onboarded device.
2. **Provider/capability filter** — keep only gateways whose `provider_type` and `capabilities` match the requested operation.
3. **Status filter** — keep only gateways in `active` (or `degraded` when the operation allows it).
4. **Selection policy** — among candidates with no existing mapping, choose by `priority` then `weight` and `capacity_used` vs `capacity_limit`. This applies only during onboarding (section 12).
5. **Failover** — if a chosen gateway fails at runtime, hand off to the Failover Strategy (section 6).

**Key rule:** Resolution is deterministic for an already-mapped device. The same device always resolves to its bound gateway, which keeps access logs, temporary passwords, and device state consistent. Auto-selection applies only to new devices during onboarding.

---

## 3. Gateway Credential Management

Each gateway has its own Tuya credentials (`access_id`/`client_id`, `access_secret`/`client_secret`, data center/endpoint, and any provider-required fields).

**Rules:**

- Credentials are referenced by `credential_ref`, never stored inline in the gateway registry row.
- Credentials are per gateway, never shared or global.
- Credential rotation is possible without changing `gateway_id` or device mappings.
- A credential has its own state: `active`, `rotating`, `revoked`.
- The registry stores only non-secret metadata (data center, provider, key id/version), enough to resolve and audit without exposing secrets.
- This is consistent with `SMARTLOCK_POLICY.md` and `BACKEND_ARCHITECTURE.md`: Tuya secrets remain backend-only.

---

## 4. Secure Secret Storage Strategy

Secrets are not stored in the application database in plaintext and are not stored as static per-account values in the frontend bundle.

**Strategy (in order of preference):**

1. **External secret manager.** `credential_ref` is a secret path plus version. The backend fetches at runtime and caches in memory with a short TTL. `BACKEND_ARCHITECTURE.md` already names "environment-based secret management" and Tuya provider configuration as part of configuration management.
2. If a secret manager is not yet provisioned: **envelope encryption** with a key encryption key held outside the database; only ciphertext plus key id is stored.

**Hard requirements (from `SECURITY_POLICY.md` and `BACKEND_ARCHITECTURE.md`):**

- Secrets are never logged, never returned by any API, never serialized into audit payloads.
- In-memory cache uses a short TTL with explicit invalidation on rotation.
- Configuration is validated at startup (`backend/api/src/infrastructure/config/configuration.ts` and `environment.validation.ts` already follow fail-fast validation). The only new configuration is the secret-manager connection plus the gateway/provider configuration block; per-gateway secrets are not added as N static environment variables, they are resolved through `credential_ref`. This keeps changes to existing configuration minimal.

---

## 5. Device -> Gateway Mapping

A persistent mapping binds each Smart Lock device to exactly one owning gateway.

**Logical model:**

- `device_id` (the existing `smart_lock_devices.id` from the Smart Lock plan in `DATABASE_PLANNING.md`)
- `gateway_id`
- `provider_device_id` (the id the provider account uses for this device; aligns with the existing `tuya_device_id` field on `smart_lock_devices`)
- `mapping_status` (`active`, `migrating`, `retired`)
- `bound_at`, `last_verified_at`

**Rules:**

- One active gateway per device at a time, enforced by a uniqueness constraint on `device_id` where `mapping_status = 'active'`. This avoids split-brain on a physical lock.
- Mapping is the first lookup in the Resolver (section 2).
- Mapping changes only through the controlled onboarding (section 12) or migration (section 13) workflows, and is always audited.
- The mapping is additive: it references the existing `smart_lock_devices` row and does not require changes to the device table defined in `DATABASE_PLANNING.md`.

---

## 6. Multi Gateway Failover Strategy

Failover handles the case where a device owning gateway is unavailable.

**Two failure types:**

- **Control-plane failure** (auth/token/account-level outage on the gateway): operations can be retried on the same gateway after token refresh, or the gateway is marked `degraded`/`maintenance`.
- **Device-binding constraint:** a physical lock is paired to one provider account. A lock onboarded under Tuya Account A cannot be controlled through Tuya Account B. Failover therefore does not silently move a device to another account.

**Strategy:**

- For transient errors (timeout, 5xx, rate limit): retry with backoff on the same gateway. This reuses the retry pattern already present in `backend/api/src/modules/notification/helpers/notification-retry.helper.ts`.
- For an account-level outage: mark the gateway `degraded`, surface it to monitoring, queue the operation when it is async-safe, and alert operators. Devices are not reassigned automatically.
- Cross-account change is only valid through a deliberate Device Migration (section 13).
- Multi-gateway load spreading happens at onboarding time (new devices), not at command time.
- This is consistent with the Phase 1 rule in `API_PLANNING.md` and `BACKEND_ARCHITECTURE.md`: device offline returns a safe unavailable response; commands do not bypass authorization or state.

---

## 7. Token Refresh Strategy

Tuya uses short-lived access tokens obtained from per-account credentials.

**Strategy:**

- The token cache is per gateway, keyed by `gateway_id`, stored in Redis. The codebase already uses Redis (`backend/api/src/infrastructure/redis`) with key prefix `granada:` (from `backend/api/.env.example`), for example `granada:smartlock:gw:<gateway_id>:token`.
- Refresh proactively before expiry (refresh-ahead) and reactively on a token-expired response.
- A per-gateway single-flight lock (Redis lock) prevents a refresh stampede for the same account. `BACKEND_ARCHITECTURE.md` already allows a narrow Redis distributed lock for critical sections.
- Token refresh failure marks the gateway `degraded` and triggers an alert; it does not cascade to other gateways.
- Tokens are secrets: never logged, never audited in cleartext.

---

## 8. Provider Abstraction

A provider-agnostic interface keeps Smart Lock logic independent of Tuya.

**Proposed interface (conceptual, mirrors `notification-provider.interface.ts`):**

- `getDeviceState(ctx)`
- `lock(ctx)` / `unlock(ctx)`
- `issueTemporaryCredential(ctx)` / `revokeTemporaryCredential(ctx)`
- `fetchAccessLogs(ctx, range)`
- `healthCheck()`

where `ctx` carries the resolved gateway, `provider_device_id`, and correlation id.

**Implementations:**

- `tuya.provider.ts` is the first concrete implementation and wraps the Tuya client.
- Future providers are added without touching Smart Lock services.

**Rule:** Smart Lock domain services depend only on the interface plus the Resolver, never on a concrete provider. A capability map declares which operations each provider supports so the Resolver can filter. Provider responses are translated into safe domain result codes, consistent with the anti-corruption rule in `BACKEND_ARCHITECTURE.md`.

---

## 9. Gateway Health Monitoring

- Periodic health checks per gateway via `provider.healthCheck()`, run as a background job under `backend/api/src/jobs/` (the directory exists and is reserved for workers per `BACKEND_ARCHITECTURE.md`).
- Track per gateway: reachability, token validity, error rate, latency, last-success timestamp, `capacity_used`.
- Expose aggregated gateway health through the existing health surface pattern (`backend/api/src/modules/health`), which `BACKEND_ARCHITECTURE.md` lists as covering database, Redis, queue, storage, Tuya connectivity, and CCTV gateway connectivity.
- Status transitions drive `gateway_status` and feed the Resolver, Failover, and alerting.

---

## 10. Gateway Rotation

Two meanings, both supported:

- **Credential rotation** (same gateway, new secret): set credential state `rotating`, load the new secret behind the same `credential_ref`/new version, flush the token cache for that `gateway_id`, verify with a health check, then mark the old credential `revoked`. No device remapping is needed.
- **Gateway draining** (move workload off a gateway): set `gateway_status = draining` so no new devices are onboarded to it; existing devices keep working; devices are moved off only through Device Migration (section 13), for example when retiring an account.

---

## 11. Maintenance SOP

Operator procedure (documentation deliverable, no code):

1. **Planned gateway maintenance:** set `gateway_status = maintenance`. The Resolver stops auto-selecting it for onboarding. Existing devices: async-safe operations are queued or refused with a clear audited error. Perform maintenance, run a health check, then set `active`.
2. **Credential rotation:** follow the credential rotation steps in section 10.
3. **Emergency disable:** set `gateway_status = disabled`. Operations to its devices fail fast with a clear, audited error and trigger an alert and runbook.
4. **Capacity review:** review `capacity_used` vs `capacity_limit`; rebalance future onboarding through `priority`/`weight`.

(See section 26 for the device-level Smart Lock maintenance SOP that involves technicians.)

---

## 12. Onboarding Device Workflow

Workflow for registering a new Smart Lock device into the multi gateway system (design only):

1. The operator identifies the physical device and the Tuya account it is paired with.
2. The Resolver selects the matching `gateway_id` for that account; when more than one gateway serves the intent, the selection policy (priority, weight, capacity) chooses one.
3. Verify reachability via `provider.getDeviceState`.
4. Create the `device -> gateway` mapping (section 5) in `active` state and increment `capacity_used`.
5. Write an audit record using the existing audit infrastructure (who onboarded, which gateway, when).
6. The device is now resolvable for all Smart Lock operations.

---

## 13. Device Migration Workflow

Moving a device from one gateway/account to another (account retirement or rebalancing). This is the only valid form of cross-account change.

1. Pre-checks: target gateway is `active`, healthy, has capacity, and supports the required capabilities.
2. Set `mapping_status = migrating` (operations are paused or queued per policy).
3. Re-pair/re-register the device on the target Tuya account and obtain the new `provider_device_id`.
4. Update the mapping to the new `gateway_id` and `provider_device_id`, set `active`, adjust `capacity_used` on both gateways.
5. Verify with `getDeviceState`; reconcile access-log continuity.
6. Retire the old binding and audit the full migration.

---

## 14. Audit Requirements

Reuse the existing audit infrastructure (`backend/api/src/infrastructure/audit/audit.repository.ts`, `backend/api/src/modules/iam/audit`) and the Smart Lock access log table (`smart_lock_access_logs` from `DATABASE_PLANNING.md`).

**Audited:**

- Gateway lifecycle changes (create, status change, disable, rotate, drain).
- Credential rotation events (metadata only, never the secret).
- Device onboarding, migration, retirement (old/new `gateway_id`).
- Resolver overrides and manual gateway selection.
- Sensitive lock operations record which gateway served them, for forensic traceability.

**Rule:** audit payloads never contain secrets, tokens, or raw provider credentials, consistent with the PII and secret rules in `SECURITY_POLICY.md`.

---

## 15. RBAC Requirements

Reuse the existing RBAC module (`backend/api/src/modules/rbac`, with guards, decorators, and permission codes), seeded through the existing RBAC seed flow (`backend/api/src/infrastructure/database/seeds/001_rbac_seed.sql`, `scripts/seed-rbac.ts`).

**New permissions (additive, dot notation per `BACKEND_ARCHITECTURE.md`):**

- `smart_lock.gateway.read` — view gateways and health.
- `smart_lock.gateway.manage` — create, disable, drain, set maintenance.
- `smart_lock.gateway.credentials.rotate` — rotate credentials (highest privilege).
- `smart_lock.device.onboard` — onboard devices.
- `smart_lock.device.migrate` — migrate devices.

**Rules:**

- These permissions are owner/manager scoped; credential rotation and gateway disable are the most privileged. This follows the existing baseline where `smart_lock.command` and `smart_lock.view` are explicit permissions.
- `property_owner` receives none of these and has no Smart Lock access, consistent with the hard rule across `DOMAIN_MODEL.md`, `API_PLANNING.md`, and `BACKEND_ARCHITECTURE.md`.
- Existing Smart Lock operational permissions are unchanged; gateway permissions are additive.

---

## 16. Database Impact

Changes are additive and follow the existing numbered SQL migration convention. The last migration in the repository is `backend/api/src/infrastructure/database/migrations/008_notification.sql`. The base Smart Lock tables and the Multi Gateway tables are added as new sequential migration files after the Smart Lock base migration is created.

**New tables (logical):**

- `smart_lock_gateways` — registry metadata (no secrets).
- `smart_lock_gateway_credentials` — credential references/metadata only (`credential_ref`, key id, version, state); no plaintext secrets.
- `smart_lock_device_gateways` — device -> gateway mapping (section 5).
- (optional) `smart_lock_gateway_health` — last health snapshot, or kept transient in Redis.

**Compatibility:**

- No changes to the planned `smart_lock_devices` table beyond being referenced by the new mapping table through `device_id`.
- No destructive migrations. New permissions are added through additive seed rows.
- All gateway tables carry `property_id`, consistent with the mandatory multi-property rule in `DATABASE_PLANNING.md`.

---

## 17. Existing Milestone Compatibility

- This document does not modify milestone 10A–10E scope.
- Smart Lock domain services route through the Provider Abstraction plus Resolver. The public behavior of the Smart Lock endpoints defined in `API_PLANNING.md` stays the same.
- The device identity (`smart_lock_devices.id`) is preserved and reused as a foreign key by the new mapping table; there is no device re-identification.
- The Admin frontend route `apps/admin/src/routes/smart-lock.tsx` and `apps/admin/src/routes/access-history.tsx` need no breaking change; gateway selection is server-side and transparent. An admin-only gateway management view is added as described in section 22.
- Existing RBAC, audit, Redis, configuration, and health infrastructure are reused, not replaced.

**Minimal-change summary:** wrap the Tuya integration in `tuya.provider.ts` behind the provider interface and route through the Resolver. Everything else is additive (gateway tables, mapping table, new permissions, background health job).

---

## 18. Risks & Edge Cases

- **Physical pairing constraint:** a lock paired to Tuya Account A cannot be controlled by Account B, so automatic cross-account failover is unsafe. Mitigation: migration only (section 13).
- **Split-brain:** a device mapped to two gateways. Mitigation: one active mapping per device enforced by a database unique constraint (section 5).
- **Token stampede** on a busy gateway. Mitigation: per-gateway single-flight refresh lock (section 7).
- **Secret leakage** through logs, audit, or API responses. Mitigation: secrets behind `credential_ref`, redaction in the existing exception filter and correlation middleware (`backend/api/src/app/filters/global-exception.filter.ts`, `backend/api/src/app/middleware/correlation-id.middleware.ts`).
- **Gateway capacity exhaustion** (Tuya per-account limits) during onboarding. Mitigation: `capacity_limit`/`capacity_used` plus onboarding selection policy plus alerts (sections 12, 25).
- **Token expiry races.** Mitigation: refresh-ahead margin.
- **Inconsistent access history** after migration. Mitigation: the history-continuity reconciliation step (section 13).
- **Partial migration failure.** Mitigation: `migrating` state plus idempotent, resumable migration steps plus audit.
- **Provider capability mismatch** for a future provider. Mitigation: capability map plus Resolver capability filter (section 8).
- **Tuya API capability validation.** `DOMAIN_MODEL.md` risk R-01 and question Q-02 record that Tuya capabilities for restrict/auto-lock are not yet validated. This is an open dependency, not a resolved fact, and applies per gateway.

---

## 19. Production Deployment Strategy

- **Secret manager first:** provision the external secret manager or KEK before onboarding real accounts.
- **Register gateways incrementally:** start with Gateway A in `active`, others in `disabled` until verified.
- **Backfill mapping:** create `device -> gateway` mappings for all existing devices, all pointing to the initial gateway, which is a zero behavior change.
- **Health phase:** run health checks and token refresh per gateway in non-blocking mode before relying on multi gateway selection.
- **Gradual onboarding:** route only new device onboarding across multiple gateways once health is proven.
- **Rollback:** because the mapping is additive and defaults to the initial gateway, rollback keeps all devices on Gateway A; no schema rollback is needed.

---

## 20. Operational Gateway Management

Operational gateway management is the day-to-day administration of gateways once Smart Lock is live. It is performed by `owner`/`manager` (and `admin` for read-only views), never by `property_owner`.

**Responsibilities:**

- Maintain the gateway registry: status, priority, weight, capacity limits.
- Monitor gateway health and capacity usage.
- Trigger credential rotation and gateway draining/maintenance through the SOPs (sections 24–26).
- Review the device-to-gateway distribution and rebalance future onboarding.
- Investigate degraded/disabled gateways and dead-lettered gateway operations.

**Ownership:** the Smart Lock module owns gateway management. Other modules do not write gateway tables directly, consistent with the module ownership rule in `BACKEND_ARCHITECTURE.md`.

**Operational states an operator can set:** `active`, `maintenance`, `draining`, `disabled`. `degraded` is set by the system from health monitoring, not manually.

---

## 21. Gateway Naming Convention

Naming follows the conventions in `DATABASE_PLANNING.md` (English, snake_case columns; human-readable `code` with scoped uniqueness; lowercase snake_case enum values).

**Gateway code format:** `GW-<PROPERTY>-<LETTER>`

- `<PROPERTY>` is the property short code already used for scoped human codes (the same scoping approach as invoice/complaint codes, which are unique per property).
- `<LETTER>` is a sequential gateway letter starting at `A`.
- Examples: `GW-GRD-A`, `GW-GRD-B`, `GW-GRD-C`, `GW-GRD-D`.

**Rules:**

- `gateway_code` is unique per property.
- `provider_type` enum values are lowercase snake_case (`tuya`).
- `gateway_status` enum values are lowercase snake_case (`active`, `degraded`, `maintenance`, `draining`, `disabled`).
- The display name is human-facing text and may include the provider account label for operators, but must never include the account secret.
- The internal `gateway_id` is a UUID, consistent with the UUID primary key convention.

---

## 22. Dashboard Gateway Management

An admin-only gateway management view is added to the Admin app (`apps/admin`), alongside the existing `smart-lock.tsx` and `access-history.tsx` routes. It does not replace them.

**Read views (permission `smart_lock.gateway.read`):**

- Gateway list: `gateway_code`, `provider_type`, `gateway_status`, `priority`/`weight`, `capacity_used`/`capacity_limit`, last health result.
- Gateway detail: health history, recent gateway audit events, device count.
- Device-to-gateway mapping view (section 23).

**Management actions (permission `smart_lock.gateway.manage`, owner/manager):**

- Set gateway status: `active`/`maintenance`/`draining`/`disabled`.
- Adjust `priority`, `weight`, `capacity_limit`.
- Start onboarding and migration workflows.

**Hard rules:**

- The dashboard never displays raw credentials, tokens, data-center secrets, or `provider_device_id` secrets; it shows only non-secret metadata and `credential_ref` version.
- `property_owner` cannot access this dashboard (no Smart Lock access).
- Credential rotation is a separate, more privileged action (`smart_lock.gateway.credentials.rotate`) and is audited.

---

## 23. Device <-> Gateway Mapping Documentation

The mapping between devices and gateways is documented in two complementary places:

1. **System of record:** the `smart_lock_device_gateways` table (section 5), which is authoritative.
2. **Operational reference:** an exportable mapping report available from the gateway management dashboard (section 22), for audits and offline operator use.

**Mapping report columns (non-secret only):**

| Column | Source |
|---|---|
| `room_number` | `rooms` (via `smart_lock_devices.room_id`) |
| `device_name` | `smart_lock_devices.device_name` |
| `device_id` | `smart_lock_devices.id` |
| `gateway_code` | `smart_lock_gateways.gateway_code` |
| `provider_type` | `smart_lock_gateways.provider_type` |
| `mapping_status` | `smart_lock_device_gateways.mapping_status` |
| `bound_at` | `smart_lock_device_gateways.bound_at` |
| `last_verified_at` | `smart_lock_device_gateways.last_verified_at` |

**Rules:**

- The report excludes `credential_ref`, tokens, `provider_device_id` raw values, and any secret.
- Export of the report is audited (read of security-relevant data), consistent with the audit export rules in `API_PLANNING.md`.

---

## 24. Gateway Assignment Policy

The assignment policy decides which gateway owns a device. It applies only to new devices; existing mappings are deterministic (section 2).

**Policy inputs, in order:**

1. **Account pairing constraint (mandatory):** the device must be assigned to a gateway whose Tuya account is the account the device is physically paired with. This constraint cannot be overridden by load balancing.
2. **Status:** only `active` gateways are eligible.
3. **Capability:** the gateway must support the operations the device needs.
4. **Capacity:** prefer a gateway where `capacity_used < capacity_limit`.
5. **Priority then weight:** among the remaining candidates, choose by `priority`, then by `weight`.

**Rules:**

- A device is never assigned to a gateway whose account it is not paired with.
- A gateway in `draining`, `maintenance`, `degraded`, or `disabled` is not eligible for new assignment.
- Manual override by an operator is allowed for an `active` eligible gateway and is audited.

---

## 25. Device Distribution Strategy (163 Smart Locks)

The master room seed contains 163 rooms (`CHANGELOG.md`, master room seed Layer 5; also stated in `NOTIFICATION_DOMAIN.md`). With one device per room, the planning target is up to 163 Smart Lock devices for the initial property.

**Distribution approach:**

- Distribution is bounded by the per-account capacity limit confirmed for each Tuya account. That limit is an external Tuya constraint and is recorded per gateway as `capacity_limit`; it is not assumed in this document.
- Devices are spread across gateways so that no single gateway approaches its `capacity_limit`, leaving headroom for replacements and growth.
- An even spread is the default: with N active gateways, target roughly `ceil(163 / N)` devices per gateway, then refine by `priority`/`weight` and by the physical account pairing constraint (a device can only go to the account it is paired with).
- Distribution is recorded by the mapping table; it is not hard-coded. Operators rebalance future onboarding by adjusting `priority`, `weight`, and `capacity_limit`.

**Worked example (illustrative, depends on confirmed per-account capacity):**

- With 4 active gateways and an even target: about 41 devices per gateway (`GW-GRD-A`..`GW-GRD-D`), each kept below its `capacity_limit`.
- The exact split is finalized only after each Tuya account capacity is confirmed; until then the numbers are planning targets, not commitments.

**Rules:**

- The 163 figure is the documented master room seed count, not a fixed device count; actual devices are whatever is onboarded.
- Capacity figures per account are filled in from confirmed Tuya account data before production onboarding.

---

## 26. Smart Lock Operational SOPs

These SOPs are documentation deliverables for operators (owner/manager/admin) and technicians. They reuse existing audit, RBAC, and notification infrastructure.

### 26.1 SOP — Onboarding a new Smart Lock

1. Technician installs the physical lock on the room and confirms it is paired to a known Tuya account.
2. Admin/manager opens the gateway management dashboard and starts onboarding for the room and device.
3. The Resolver selects an eligible gateway for that account using the Assignment Policy (section 24).
4. The system verifies the device via `getDeviceState`, creates the `active` mapping, increments `capacity_used`, and writes an audit record.
5. The system links the device to the room (`smart_lock_devices.room_id`) and, where applicable, creates the resident access grant through the existing Smart Lock access-grant flow.
6. A notification is emitted through the Notification module (the Smart Lock notification flow is already planned in `NOTIFICATION_DOMAIN.md`, section 16).

### 26.2 SOP — When a Gateway is full

1. The system raises a capacity alert when `capacity_used` approaches `capacity_limit` for a gateway.
2. Operator reviews remaining capacity across gateways in the dashboard.
3. If another `active` gateway for the same account intent has capacity, new onboarding is routed there by adjusting `priority`/`weight`.
4. If no gateway for the required account has capacity, a new Tuya account/gateway is provisioned (SOP 26.3 covers account changes) before further onboarding.
5. Existing devices on the full gateway are not moved automatically; movement uses Device Migration (section 13) only if required.

### 26.3 SOP — When a Tuya account is changed

1. Provision the new Tuya account and store its credentials behind a new `credential_ref` in the secret manager.
2. Register a new gateway (or rotate credentials on an existing gateway, section 10) and verify with a health check.
3. For a full account replacement, set the old gateway to `draining` so no new devices are onboarded to it.
4. Migrate devices from the old account to the new one using the Device Migration workflow (section 13); each lock must be re-paired/re-registered on the new account because of the physical pairing constraint.
5. Once all devices are migrated and verified, set the old gateway to `disabled` and mark the old credential `revoked`.
6. Audit every gateway and migration step.

### 26.4 SOP — Smart Lock maintenance

1. For gateway-level maintenance, follow section 11.
2. For device-level maintenance (battery replacement, lock repair), the technician handles the physical device; the device may go offline. The backend returns a safe unavailable response while the device is offline (per `API_PLANNING.md`/`BACKEND_ARCHITECTURE.md`), and battery/offline alerts are raised through the existing Smart Lock alert and notification flow.
3. After maintenance, the device is re-verified with `getDeviceState` and `last_verified_at` is updated. The device keeps its existing gateway mapping; maintenance does not change the mapping.
4. All maintenance actions that change device or gateway state are audited.

---

## 27. Operational Impact for Admin and Technician

**Admin / Manager:**

- New gateway management dashboard and read views (section 22).
- New responsibilities: monitor gateway health/capacity, run onboarding/migration, rotate credentials, set gateway status. These map to the new RBAC permissions in section 15.
- Day-to-day lock/unlock and access-history operations are unchanged because gateway selection is transparent (section 17).

**Technician:**

- Physical install, battery replacement, and lock repair as today.
- New step at install time: confirm and record which Tuya account the lock is paired with, because the Assignment Policy depends on the account pairing constraint (section 24).
- Technician scope stays limited to assigned work, consistent with the technician-assignment scope rule in `BACKEND_ARCHITECTURE.md`; technicians do not manage gateways or credentials.

**Resident (no change):**

- Residents continue to use only their own room lock through the existing access grant; gateway routing is invisible to them.

---

## 28. Implementation Phases

> Phases are for milestones after the base Smart Lock module. 10F delivers only this design document.

1. **Phase 1 — Abstraction seam:** introduce the Provider interface plus `tuya.provider.ts` wrapping the Tuya integration; route Smart Lock logic through it. No new tables. Behavior is identical.
2. **Phase 2 — Registry & mapping:** add `smart_lock_gateways`, `smart_lock_device_gateways`, and the credential reference table; backfill existing devices to Gateway A.
3. **Phase 3 — Resolver:** deterministic resolution for mapped devices plus the onboarding Assignment Policy.
4. **Phase 4 — Secrets & tokens:** integrate the secret manager and per-gateway Redis token cache with single-flight refresh.
5. **Phase 5 — Health, monitoring, failover:** background health jobs, status transitions, transient-retry/failover rules, alerting.
6. **Phase 6 — RBAC, audit, dashboard & SOPs:** new permissions, audit coverage, the gateway management dashboard, and the operator runbooks (sections 24–27).
7. **Phase 7 — Migration & rotation tooling:** the device migration workflow plus credential/gateway rotation and draining.

---

### Appendix — Reused existing building blocks

| Concern | Existing asset reused |
|---|---|
| Provider abstraction precedent | `modules/notification/providers/*` (`notification-provider.interface.ts`) |
| Retry/backoff pattern | `modules/notification/helpers/notification-retry.helper.ts` |
| Token/state cache | `infrastructure/redis` (`REDIS_KEY_PREFIX=granada:`) |
| Audit | `infrastructure/audit`, `modules/iam/audit`, `smart_lock_access_logs` |
| RBAC | `modules/rbac` (guards/decorators/permissions) + RBAC seeds |
| Config & validation | `infrastructure/config` (`configuration.ts`, `environment.validation.ts`) |
| Migrations | `infrastructure/database/migrations/*` (numbered SQL; last is `008_notification.sql`) |
| Background jobs | `backend/api/src/jobs/` |
| Health surface | `modules/health` |
| Smart Lock schema/API baseline | `DATABASE_PLANNING.md` (smart lock tables), `API_PLANNING.md` (smart lock endpoints) |
| Module layout convention | `controllers/ services/ repositories/ dto/ types/ constants/ helpers/` |
