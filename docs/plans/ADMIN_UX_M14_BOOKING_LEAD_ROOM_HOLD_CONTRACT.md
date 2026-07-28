# Admin UX M14 — Booking Lead Room Hold Contract

Status: AUTHORITATIVE implementation contract
Recorded: 2026-07-28

## 1. Domain authority

- The new entity is exactly `booking_lead_holds`.
- A hold is not a booking lead, reservation payment, lease, occupancy, or resident.
- A hold applies only to the exact room already referenced by its booking lead.
- An active hold persists the room status as `reserved`; it never creates another domain entity.
- Booking Lead status does not change automatically.
- A hold must be released before Lease create; M14 has no automatic conversion or implicit release.

## 2. Lifecycle

- Exact statuses are `active`, `released`, and `expired`.
- Transitions are create to `active`, Admin release from `active` to `released`, and worker or
  transactional reconciliation from `active` to `expired`.
- `released` and `expired` are terminal and cannot be reactivated; a later hold is a new row.
- TTL is fixed server-side at 24 hours: `expires_at = starts_at + interval '24 hours'`.
- Server UTC clock is authoritative. There is no extension in M14; UI countdown is display-only.

## 3. Eligibility and access

- Create requires exact role `manager|admin`, permission `room.manage`, an authorized active
  property, and `booking_hold_write=true` for that property.
- The persisted booking lead must belong to the property, have a non-null exact room, and have
  status `new|contacted|visit_scheduled`.
- The room must belong to the same property and match the lead room, category, and authoritative
  building linkage; it must be exactly `vacant`.
- The room must have no active occupancy, active lease, or active hold.
- Release requires exact role `manager|admin`, permission `room.manage`, and property scope.
- Read requires exact role `manager|admin`, permission `room.read`, and property scope.
- Read, release, and expiry remain available when `booking_hold_write=false` so existing holds
  cannot become stranded. Every denial performs zero mutation and writes no success audit.

## 4. Schema and migration

- Next migration is exactly `020_booking_lead_room_holds.sql`, additive, transactional, and
  replay-safe under the repository's current replay behavior.
- `booking_lead_holds` contains: `id UUID PK`, `property_id`, `booking_lead_id`, `room_id`,
  `hold_status`, `starts_at`, `expires_at`, nullable `released_at`, nullable
  `released_by_user_id`, nullable `created_by_user_id`, `created_at`, and `updated_at`.
- No release reason is stored in M14.
- Property, booking-lead, and room FKs use `ON DELETE RESTRICT`; user attribution FKs use
  `ON DELETE SET NULL`.
- Checks enforce the exact status enum, `expires_at > starts_at`, exact 24-hour TTL, and release
  timestamp consistency (`released_at` present only for `released`).
- Partial unique indexes enforce one `active` hold per room and one per booking lead. Their
  predicates are only `hold_status = 'active'`; `now()` is forbidden in index predicates.
- Add a property lookup index on `(property_id, hold_status, starts_at DESC, id)` and an expiry
  worker index on `(hold_status, expires_at)` restricted to active rows.
- Add `property_feature_flags.booking_hold_write BOOLEAN NOT NULL DEFAULT false` and a separate
  check requiring `booking_hold_write` to imply `admin_ux_read`.
- No existing row is enabled. Development and production seeds must not grant the flag.
- Because stale rows still satisfy partial uniqueness, create reconciles stale matching holds
  before attempting its active insert.

## 5. Exact API wires

All paths are relative to `/api/v1`; no alias is allowed.

- Create: `POST /booking-leads/:leadId/hold`, exact body `{property_id}`, HTTP `201`.
- Release: `POST /booking-leads/:leadId/hold/release`, exact body `{property_id}`, HTTP `200`.
- Read: `GET /booking-lead-holds?property_id=<UUID>&limit=<1-100>&offset=<integer>=0`, HTTP `200`.
- Create and release both require `Idempotency-Key` of 16–128 trimmed characters.
- Create and release return exact `{data}`. Read returns exact
  `{data,meta:{limit,offset,total}}`, with defaults `limit=20`, `offset=0`, and exact filtered
  total before pagination. Empty and out-of-range pages keep the exact total.
- Every data record has only: `id`, `property_id`, `booking_lead_id`, `room_id`, `hold_status`,
  `starts_at`, `expires_at`, and `released_at`.
- Read ordering is `starts_at DESC, id DESC`; only `property_id`, `limit`, and `offset` are accepted.
- Creator/releaser IDs, audit metadata, lead PII, tokens, and raw DB fields are never exposed.
- `/auth/me` property rollout adds exact `bookingHoldWrite:{enabled:boolean}` beside
  `adminUxRead`; absent/invalid values fail closed. No other auth or role contract changes.

## 6. Exact error contract

All errors use `{success:false,error:{code,message},correlation_id,timestamp}`.

| Condition                  | HTTP | Code                             | Message                                                            |
| -------------------------- | ---: | -------------------------------- | ------------------------------------------------------------------ |
| Create flag absent/false   |  403 | `BOOKING_HOLD_WRITE_DISABLED`    | `Booking lead room hold creation is not enabled for this property` |
| Property forbidden         |  403 | `PROPERTY_SCOPE_DENIED`          | `User is not allowed to access this property`                      |
| Lead missing               |  404 | `BOOKING_HOLD_LEAD_NOT_FOUND`    | `Booking lead not found`                                           |
| Lead has no room           |  409 | `BOOKING_HOLD_ROOM_REQUIRED`     | `Booking lead must reference a room before creating a hold`        |
| Lead status ineligible     |  409 | `BOOKING_HOLD_LEAD_NOT_ELIGIBLE` | `Booking lead status is not eligible for a room hold`              |
| Room/link mismatch         |  409 | `BOOKING_HOLD_ROOM_LINK_INVALID` | `Booking lead room linkage is not eligible for a hold`             |
| Room not vacant            |  409 | `BOOKING_HOLD_ROOM_NOT_VACANT`   | `Room must be vacant before creating a booking lead hold`          |
| Active occupancy           |  409 | `BOOKING_HOLD_ACTIVE_OCCUPANCY`  | `Room has an active occupancy`                                     |
| Active lease               |  409 | `BOOKING_HOLD_ACTIVE_LEASE`      | `Room has an active lease`                                         |
| Active hold exists         |  409 | `BOOKING_HOLD_ALREADY_ACTIVE`    | `An active room hold already exists`                               |
| Hold missing               |  404 | `BOOKING_HOLD_NOT_FOUND`         | `Booking lead hold not found`                                      |
| Hold terminal/raced expiry |  409 | `BOOKING_HOLD_NOT_ACTIVE`        | `Booking lead hold is no longer active`                            |

- Cross-property lead/hold access returns the same `403 PROPERTY_SCOPE_DENIED` without resource
  data or alternate existence detail.
- Existing exact idempotency errors remain: `400 IDEMPOTENCY_KEY_REQUIRED`,
  `400 IDEMPOTENCY_KEY_INVALID`, `409 IDEMPOTENCY_KEY_REUSED`, and
  `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`, with their current messages.
- Same key plus same fingerprint replays the original status/body with no audit or mutation;
  same key plus different fingerprint returns `IDEMPOTENCY_KEY_REUSED`.

## 7. Transaction and concurrency

- Property authorization and create-feature validation finish before command claim or resource
  lookup that could disclose another property.
- Create uses one transaction and deterministic lock order: property, lead, room, then matching
  hold rows. It acquires advisory/row locks scoped by property, lead, and room.
- Inside the transaction it revalidates the flag, expires stale matching holds, safely restores
  their rooms, repeats all eligibility checks, inserts the active hold, updates the room only
  from `vacant` to `reserved`, writes audit/outbox, and commits atomically.
- Release/expiry locks the hold then room, performs one terminal transition, and updates
  `reserved` to `vacant` only when no active hold, occupancy, or lease remains.
- Release/expiry never overwrites `occupied|maintenance|inactive|requires_review`.
- Same-key release replay is idempotent; a new command against a terminal hold gets
  `BOOKING_HOLD_NOT_ACTIVE`. Any failure rolls back the hold, room, audit, and outbox together.
- Unique constraints are defense-in-depth, not the sole concurrency guard.

## 8. Expiry worker

- An internal, property-safe worker runs every 60 seconds, processes at most 100 rows per batch,
  and uses `FOR UPDATE SKIP LOCKED`; it exposes no HTTP trigger.
- It uses the existing module lifecycle pattern: one unreferenced timer, clean destroy, one
  transaction per bounded batch, and sanitized structured logs.
- Expiry runs even when `booking_hold_write=false`, and updates hold plus room atomically.
- Create/release also reconcile relevant stale holds; correctness never depends only on timer
  punctuality.
- Exact audit actions are `booking_lead_hold.create`, `booking_lead_hold.release`, and
  `booking_lead_hold.expire`.
- Exact outbox event types are `booking_lead_hold.created`, `booking_lead_hold.released`, and
  `booking_lead_hold.expired`; payloads contain only IDs, status, and timestamps.

## 9. Lease and room interaction

- `LeaseService.create()` continues to require room status exactly `vacant`.
- A `reserved` room returns existing `422 ROOM_NOT_LEASABLE`; M14 adds no Lease special case.
- Admin must release the hold before navigating to `Tambah Penyewaan`; there is no implicit
  release, conversion, lease, occupancy, resident, invoice, or payment creation.
- Rooms list, detail, availability, and status aggregate read persisted `reserved` normally.
- Create transactionally expires stale holds before deciding whether the room is eligible.

## 10. Admin UX

- Booking Leads shows `Tahan Kamar` only for eligible status/room, manager/admin plus
  `room.manage`, active property, and enabled `bookingHoldWrite` rollout.
- It displays active hold, authoritative `expires_at` countdown, and `Lepaskan`; terminal state is
  refreshed from server on focus and once at expiry, never changed locally as authority.
- Property switch closes dialogs, clears drafts, and prevents old-property data/error rendering.
- Pending state prevents double-submit. Expired-race refreshes hold, lead, room, and availability.
- Rooms keeps the existing Indonesian status `Dipesan`. No opaque lead/hold/room UUID is rendered.
- Loading, empty, error/retry, forbidden, feature-disabled, and expired-race states are distinct.

## 11. Cache and data minimization

- Hold list and booking-lead query keys include property ID; hold list also includes limit/offset.
- Create/release invalidate exact property-scoped Booking Leads, hold list, Rooms list/detail,
  availability, and relevant Dashboard queries.
- Frontend parsers enforce the exact record/envelope whitelist, enum, UUID, and timestamp shapes;
  missing or extra keys fail closed before cache.
- Lead PII never enters query keys, storage, logs, toast, audit, outbox, or telemetry.

## 12. Denylist

- Resident, lease, occupancy, invoice, payment, deposit, settlement, or reservation-payment creation.
- Midtrans/provider/webhook, automatic WhatsApp, notification redesign, hold extension, room
  reassignment, lead auto-status transition, or mass backfill.
- M15+, routeTree manual edit, unrelated role/permission/feature grant, or implicit Lease changes.

## 13. Implementation acceptance

- Focused backend tests cover schema reentrancy, RBAC/scope/flag, exact errors and responses,
  idempotency, lock order, stale reconciliation, concurrency uniqueness, room rollback, worker,
  audit/outbox minimization, and zero Lease/occupancy/billing mutation.
- Focused frontend tests cover strict parsers, rollout/access, dialogs/states, countdown refresh,
  property-safe cache keys/invalidation, opaque-ID/PII non-rendering, and double-submit/race handling.
- Relevant Booking Lead, Room, Lease, scheduler, RBAC, audit, idempotency, and outbox tests pass;
  run API/Admin lint, typecheck/build, `npm run qa:read-only`, and `git diff --check`.
- Migration/rollout/runtime QA requires a separate manual approval and is not part of M14 coding.
