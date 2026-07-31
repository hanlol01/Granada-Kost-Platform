# KMO-W02A R2 Full Room Detail Evidence

Status: **KMO-W02A — AUTOMATED VERIFIED; RUNTIME DEFERRED**

R2 replaces the room detail Sheet with the canonical Admin route
`/rooms/:roomNumber`. It adds a protected, property-scoped Admin UX V2
room-number lookup while preserving the legacy UUID detail route and the
existing safe room-update command.

## Delivered Boundary

- `GET /api/v1/rooms/by-number/:roomNumber?property_id=...` is registered before
  the generic UUID route and returns exact `{data}`.
- Full detail is limited to `owner|manager|admin` with `room.read`; the backend
  authorizes the property before loading the room or any related section.
- The projection aligns room, property, building, category, gender, occupancy,
  and lease authorities. Duplicate room-number matches and multiple or
  mismatched active occupancy/lease authorities fail closed.
- Related reads are parameterized, property-scoped, bounded, deterministically
  ordered, and use a fixed number of section queries.
- Billing keeps invoice payment allocation, DP progress, and security-deposit
  liability separate. Open invoice balance is scoped to the active lease and
  resident; the projection does not expose payment-provider data.
- Resident, vehicle, complaint/work-order, ownership, and timeline serializers
  expose only their safe operational summaries. Raw audit payload, request
  metadata, credentials, identity documents, addresses, and other form PII are
  excluded.
- Ownership remains the exact `KOSTATION` policy default with reconciliation
  required until representable building assignments arrive in KMO-W10.

## Admin Route and UX

- The generated Admin route tree registers `/rooms/$roomNumber`; the Penghuni
  route tree is unchanged.
- Summary and category tables navigate to the same full-page route. The obsolete
  `roomId` search state and `RoomDetailSheet` are removed.
- The page provides stable loading, forbidden/not-found/error recovery, honest
  empty sections, semantic responsive cards, a page-local room-number
  breadcrumb, and no rendered opaque room/property identifiers.
- Only the production-registered lease detail receives an active quick link.
  Resident, billing, vehicle, and complaint destinations show honest
  unavailable copy because their current routes do not accept a safe
  room-scoped destination.
- Existing-room edit remains a bounded Sheet. Structural changes are locked for
  active hold, occupancy, lease, maintenance, or reconciliation state; safe
  nonstructural fields remain available under the existing M15 contract.
- Successful updates invalidate property-scoped list, availability, category,
  dashboard, UUID detail, and both old/new room-number detail keys. A room-number
  change replaces the route with the new canonical URL.

## Evidence Boundary

Focused backend tests cover route ordering, role/property authorization,
zero/single/multiple active authorities, legacy occupancy/lease reconciliation,
financial separation, bounded safe projections, policy-default ownership,
timeline sanitization, and zero writes.

Focused Admin tests cover strict nested parsing, account/property/room cache
isolation, generated route registration, list navigation, Sheet removal,
terminal and empty states, honest quick links, lifecycle edit locks, stale-scope
handling, and old/new detail invalidation. W00, R1, M10, M13, M14, M15, and M16
regressions remain part of final validation.

No browser runtime, service operation, migration, seed, canonical database
mutation, stage, commit, or push is claimed by this evidence. W02B–W02D remain
pending; this document makes no public-catalog or KMO-W10 ownership-assignment
claim.
