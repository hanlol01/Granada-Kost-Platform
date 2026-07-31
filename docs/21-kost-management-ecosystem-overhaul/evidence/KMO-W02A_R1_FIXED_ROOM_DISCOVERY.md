# KMO-W02A R1 Fixed Room Discovery Evidence

Status: **KMO-W02A — AUTOMATED VERIFIED; RUNTIME DEFERRED**

R1 establishes the fixed-inventory boundary and the complete server-side room
discovery wire. R2 closes the Admin room-detail boundary in
[KMO-W02A_R2_FULL_ROOM_DETAIL.md](KMO-W02A_R2_FULL_ROOM_DETAIL.md).

## Delivered Boundary

- Canonical development authority remains 163 rooms across 26 authoritative
  buildings: 123 Rumah Kost and 40 Apart Kost.
- Routine legacy and Admin UX V2 `POST /rooms` calls authorize role,
  permission, and property scope, then fail with HTTP 409 and
  `ROOM_INVENTORY_FIXED` before idempotency claim, transaction, audit, or room
  write.
- Internal migration, seed, and reconciliation authorities remain separate and
  unchanged.
- The V2 room list validates the complete discovery query, applies one shared
  property-scoped predicate to count and data queries, escapes literal search
  patterns, and maps sort keys to fixed SQL expressions with an ID tie-breaker.
- Search covers room number/code, building code/name, kost-type name, and the
  active resident name through property-aligned occupancy.
- Admin Dashboard, room summary, and category pages expose no routine Add Room
  affordance or room-create requester. A legacy `create=true` URL is replaced
  with its canonical filtered URL and never opens an editor.
- Existing-room edit, structural lifecycle locks, operational status actions,
  booking-lead action, authoritative metrics, and server pagination remain
  available. The former detail Sheet was superseded by the canonical full-page
  route in R2.

## Discovery Contract

The canonical filters are `property_id`, `q`, `category`, `status`,
`gender_policy`, `building_id`, `floor_code`, `active_occupancy`,
`reconciliation_state`, `sort`, `order`, `limit`, and `offset`.

Unknown fields, non-v4 identifiers, invalid enums, and truthy boolean coercion
fail closed. Active-occupancy and reconciliation predicates remain aligned to
the room property. The public response remains the existing strict V2
`{data,meta}` whitelist; internal identifiers are used only for cache, routing,
and commands and are not added to visible table cells.

## Admin Surface

All room list surfaces use the shared discovery controls. Search is submitted
explicitly rather than firing a request per keystroke. Any filter change resets
the server offset. The canonical columns are Kamar, Bangunan,
Kategori, Jenis Kelamin, Status, Penghuni Aktif, and Aksi; category pages omit
the redundant Kategori column. Per-room commercial price columns are absent
because commercial authority remains on the kost type.

## Evidence Boundary

Focused backend and Admin contracts cover the fixed-create boundary, strict
query validation, combined filters, property alignment, count/data predicate
reuse, sort mapping, Add Room removal, shared controls, canonical columns,
query-key isolation, pagination, and safe existing-room edit regressions.

Final lint, typecheck, build, aggregate read-only gate, formatting, and diff
integrity results are reported in the executor handoff. No migration, seed,
database mutation, service operation, browser QA, stage, commit, or push is
part of R1.
