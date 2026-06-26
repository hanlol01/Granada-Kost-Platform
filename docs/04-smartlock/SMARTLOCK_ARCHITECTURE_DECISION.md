# Smart Lock Architecture Decision Record (ADR)

> **ADR ID:** ADR-SL-001
> **Status:** Frozen (Final)
> **Owner:** Granada Engineering
> **Reviewed By:** Architecture Review
> **Scope:** Smart Lock integration architecture only.
> **Decision date:** 2026-06-26
> **Supersedes:** none. **Closes:** Smart Lock planning phase.
> **Source of truth:** actual source code under `backend/api/src/modules/smart-lock/` and `backend/api/src/infrastructure/database/migrations/009_smart_lock.sql`, plus `SMARTLOCK_POLICY.md`, `SMARTLOCK_MULTI_GATEWAY_ARCHITECTURE.md`, `TUYA_COMPATIBILITY_AUDIT.md`, and `SMARTLOCK_BUSINESS_GUIDE.md`.

This ADR records the architecture decision that governs Smart Lock runtime integration (Milestone 10F). It does not introduce code, migrations, or changes to completed milestones. The Smart Lock base module (milestones 10A–10E) is already implemented and wired into the application; this ADR locks the integration shape for the runtime work that follows.

---

## 1. Background

Granada Kost installs a physical Smart Lock (PALOMA DLP 2131, Tuya ecosystem) on each room. Access is managed through PIN, RFID card, and fingerprint, all orchestrated by the backend rather than by physical keys. The Smart Lock domain (devices, access grants, credentials, access logs, restrictions, alerts) is already implemented as a NestJS module and registered in `app.module.ts`.

Smart Lock is classified as a high-risk physical-security feature (`SMARTLOCK_POLICY.md`). All lock/unlock/restrict operations must pass through the backend, Tuya secrets stay backend-only, every action is audited, unlock is rate-limited, and `property_owner` has no Smart Lock access. The integration architecture must preserve all of these rules.

## 2. Tuya Cloud and PALOMA DLP 2131 investigation summary

The `TUYA_COMPATIBILITY_AUDIT.md` audit scored Tuya Cloud Open Service at **95% compatibility** for Granada requirements:

- **Confirmed full support:** PIN management (create/modify/freeze/unfreeze/delete), remote lock/unlock, device member management, alarm/security records.
- **Expected support (90%, pending physical test):** RFID card and fingerprint enroll/delete via API.
- **Pending physical verification:** device-initiated event logs (local PIN, card, fingerprint, doorbell).
- **Bonus capabilities:** offline temporary password and Duress Alarm (panic button), candidate Phase 2 features.

Key architectural takeaways from the audit: Tuya unifies credentials under a single "Unlocking Method" concept (validating the unified `smart_lock_credentials` model), exposes a "Device Member" concept that simplifies checkout cleanup, and provides Freeze/Unfreeze that maps cleanly onto the restriction workflow without reissuing PINs.

## 3. Why not assume a single Tuya account

Production licensing investigation showed a single Tuya Cloud account cannot serve production: it hits per-account resource limits and carries high production cost. Binding the backend to one account would create a hard scaling ceiling, a single point of failure for all rooms, and no clean path to add non-Tuya providers later. The architecture therefore must not depend on one Tuya Cloud account.

## 4. Why a Multi Gateway Smart Lock Architecture

The decision is to model integration as multiple gateways, each mapped to its own provider account (Gateway A → Tuya Account A, B → B, and so on). This spreads device load across accounts to stay within per-account limits, isolates an account-level outage to the devices it serves, and leaves room for non-Tuya providers without rewriting Smart Lock business logic. Device load spreading happens at onboarding time, not at command time, because a physical lock is permanently paired to one account.

## 5. Why a Gateway Resolver

A Gateway Resolver answers "which gateway serves this device/operation". Resolution is **deterministic for an already-mapped device**: the same lock always resolves to its bound gateway, keeping access logs, temporary passwords, and device state consistent and avoiding split-brain on a physical lock. Auto-selection (priority, weight, capacity) applies only to new devices during onboarding. This keeps runtime command paths predictable and auditable.

## 6. Why a Provider Pattern (Anti-Corruption Layer)

Smart Lock domain services must depend on an abstract provider interface plus the Resolver, never on the Tuya SDK directly. Raw provider payloads are translated into safe domain result codes and must never reach the API response, satisfying the anti-corruption requirement. This pattern is already proven in the codebase by the Notification module (`modules/notification/providers/`), so 10F reuses an established convention rather than inventing one. The first concrete implementation wraps the existing `tuya-smart-lock.gateway.ts`; future providers are added without touching domain services.

## 7. Impact on existing Smart Lock implementation (10A–10E)

The implemented module already isolates Tuya behind a gateway boundary: `gateways/smart-lock-gateway.interface.ts` (abstraction) and `gateways/tuya-smart-lock.gateway.ts` (Tuya implementation), with domain services (`device`, `access-grant`, `credential`, `restriction`, `alert`, `audit`), repositories, controllers, and the `009_smart_lock.sql` schema. The multi-gateway design is therefore **additive**: it formalizes the existing interface as the Provider seam and adds a registry, device→gateway mapping, and resolver on top. No 10A–10E controller, service, repository, DTO, or migration is changed or removed by this decision.

## 8. Impact on backend, database, API, and security

- **Backend:** introduce a Resolver and a Provider boundary in front of the existing gateway interface; reuse the Notification retry pattern and the Redis layer (`granada:` prefix) for per-gateway token caching with single-flight refresh. No change to existing module wiring in `app.module.ts`.
- **Database:** additive only, following the numbered migration convention after `009_smart_lock.sql`. New logical tables: gateway registry (no secrets), device→gateway mapping (one active gateway per device, uniqueness-enforced), and a credential-reference table holding only `credential_ref` metadata. The existing `smart_lock_devices` (including `tuya_device_id`) is not modified.
- **API:** existing Smart Lock endpoints are unchanged; gateway management endpoints are additive and owner/manager scoped. Provider payloads never leak into responses.
- **Security:** Tuya secrets stay backend-only, referenced by `credential_ref` (secret manager or envelope encryption), never in the database in plaintext, never logged, never in audit payloads, never in the frontend bundle. Unlock stays rate-limited; `property_owner` keeps zero Smart Lock access; every gateway lifecycle, credential rotation, onboarding, and migration event is audited.

## 9. Operational impact (admin and technician)

Gateway routing is invisible to residents and to day-to-day admin actions. Admins continue check-in, remote unlock, restriction, and checkout flows as documented in `SMARTLOCK_BUSINESS_GUIDE.md`. New owner/manager operations (gateway health view, onboarding, migration, credential rotation, drain/maintenance) are deliberate, audited workflows. Technicians manage neither gateways nor credentials; temporary technician access uses the existing bounded temporary-PIN flow.

## 10. Risks and mitigations

- **PALOMA may not support every Tuya API (card/fingerprint remote delete, event logs):** mitigate with the physical test plan (audit V-01–V-03); fallbacks are physical reset plus backend command audit. Not blocking.
- **Account-level outage:** isolate to that gateway, mark `degraded`/`maintenance`, queue async-safe operations, alert; devices are never silently reassigned across accounts.
- **Token refresh stampede:** per-gateway Redis single-flight lock and refresh-ahead.
- **Secret leakage:** `credential_ref` indirection, secret manager/envelope encryption, strict no-log/no-audit-of-secrets rule.
- **Cross-account confusion / split-brain:** deterministic resolution for mapped devices and a controlled Device Migration as the only valid cross-account change.

## 11. Alternatives considered

### Alternative A — Single Tuya Cloud Account

Use one Tuya Cloud account for all rooms. **Rejected because:** not scalable; constrained by per-account production quota; single point of failure for every lock; heavy vendor dependency on one account.

### Alternative B — Direct Tuya SDK Integration

Call the Tuya SDK directly from Smart Lock domain services. **Rejected because:** tight coupling between domain logic and Tuya; vendor lock-in; hard to support other providers later; violates the Anti-Corruption Layer principle (raw provider payloads would reach domain/API).

### Alternative C — Independent Integration per Provider

Build a separate, standalone integration for each provider. **Rejected because:** business logic would be duplicated across integrations; high maintenance cost; audit and security would be hard to consolidate into one consistent policy.

## 12. Final architecture decision

Granada Smart Lock integration adopts a **Multi Gateway Smart Lock Architecture** with a **deterministic Gateway Resolver** and a **provider-agnostic Anti-Corruption Provider Pattern**, built additively on the already-implemented Smart Lock module and its existing gateway interface. The backend is not bound to any single Tuya account; gateways map one-to-one to provider accounts; each device is bound to exactly one active gateway; secrets remain backend-only behind `credential_ref`. All `SMARTLOCK_POLICY.md` rules are preserved without exception.

## 13. Items still dependent on official Tuya vendor decisions

- Final confirmation of card and fingerprint remote delete on PALOMA DLP 2131 (audit V-01, V-02).
- Availability and completeness of device-initiated event logs: local PIN, card, fingerprint, doorbell (audit V-03).
- Production account licensing terms, per-account resource limits, and rate limits that set real gateway `capacity_limit` values.
- Duress Alarm availability on PALOMA (Phase 2 candidate).

These affect implementation detail and capacity tuning, not the architecture decision.

## 14. Implementation recommendation for Milestone 10F

Proceed in additive phases that keep behavior identical until each seam is proven:

1. **Provider seam:** formalize the existing `smart-lock-gateway.interface.ts` as the Provider boundary; route all domain services through it; keep `tuya-smart-lock.gateway.ts` as the first provider. No new tables.
2. **Registry & mapping:** add gateway registry, device→gateway mapping, and credential-reference tables (additive migrations after `009_smart_lock.sql`); backfill existing devices to Gateway A.
3. **Resolver:** deterministic resolution for mapped devices plus onboarding selection policy.
4. **Secrets & tokens:** secret manager integration and per-gateway Redis token cache with single-flight refresh.
5. **Health, monitoring, failover:** background health jobs, status transitions, transient retry, account-outage handling, alerting.
6. **RBAC, audit, dashboard, SOPs:** additive gateway permissions, full audit coverage, gateway management dashboard, operator runbooks.
7. **Migration & rotation tooling:** controlled device migration and credential/gateway rotation and draining.

Run the PALOMA physical verification (V-01–V-03) in parallel; results refine implementation detail only and do not block this architecture.

---

## Review history

| Version | Status   | Description                                      |
| ------- | -------- | ------------------------------------------------ |
| v1      | Draft    | Initial Architecture Decision                    |
| v2      | Reviewed | Architecture Review Completed                    |
| v3      | Frozen   | Final Architecture Decision before Milestone 10F |
