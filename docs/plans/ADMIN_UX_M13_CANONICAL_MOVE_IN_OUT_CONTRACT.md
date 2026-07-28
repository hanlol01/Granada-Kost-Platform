# Admin UX M13 — Canonical Move-In/Move-Out Contract

Status: AUTHORITATIVE implementation contract
Recorded: 2026-07-28
Scope: canonical Lease move-in/out, legacy occupancy containment, and anomaly visibility.

## 1. Domain authority

- `LeaseService.create()` is the only authority for every new move-in.
- `LeaseService.close()` is the only authority for move-out when an active lease exists.
- A booking lead remains an expression of interest; it is not a reservation, lease, or occupancy.
- Reservation/hold is outside M13 and no room/domain status is added.

## 2. Existing HTTP wires retained

All paths below are relative to `/api/v1`; no alias route is introduced.

| Purpose                  | Existing wire                           | RBAC                                                       | Contract                         |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| Canonical move-in        | `POST /leases`                          | roles `owner`, `manager`, `admin`; `lease.manage`          | retained                         |
| Canonical move-out       | `POST /leases/:leaseId/close`           | roles `owner`, `manager`; `lease.manage`, `billing.manage` | retained                         |
| Legacy direct check-in   | `POST /check-ins`                       | roles `owner`, `manager`, `admin`; `lease.manage`          | success removed; always rejected |
| Legacy checkout list     | `GET /check-outs`                       | roles `owner`, `manager`, `admin`; `resident.read`         | retained read-only               |
| Legacy checkout request  | `POST /check-outs`                      | roles `owner`, `manager`, `admin`; `checkout.manage`       | anomaly-only                     |
| Legacy checkout approve  | `POST /check-outs/:checkOutId/approve`  | same roles; `checkout.manage`                              | anomaly-only                     |
| Legacy checkout reject   | `POST /check-outs/:checkOutId/reject`   | same roles; `checkout.manage`                              | anomaly-only                     |
| Legacy checkout finalize | `POST /check-outs/:checkOutId/finalize` | same roles; `checkout.manage`                              | anomaly-only                     |

### Canonical move-in wire

- Request body remains `{property_id, room_id, resident_id?, resident?, start_date,
billing_cycle, billing_anchor_day?, notes?}` with exactly one of `resident_id` or `resident`.
- Nested `resident` retains the existing `CreateLeaseResidentDto` whitelist.
- `Idempotency-Key` remains required.
- Success remains HTTP `201` and exact envelope
  `{data:{lease,occupancy,first_invoice,deposit_summary}}`.
- Nested response keys retain the existing M5/M6 safe whitelist and naming.
- Server transaction creates the active occupancy, active lease, first invoice, room transition,
  history, audit, and outbox atomically.

### Canonical move-out wire

- Request remains `{end_date, room_status_after, reason, damage_deductions?, refund?}`;
  `room_status_after` remains `vacant|maintenance`.
- `Idempotency-Key` remains required.
- Success remains HTTP `200` and exact envelope
  `{data:{lease,room,deposit_summary,deductions,refund,outstanding_amount_before_deduction}}`.
- Existing financial calculation, transaction, rollback, audit, outbox, and replay behavior remain.

### Legacy wire shapes

- Direct check-in request remains `{property_id,room_id,resident_id,start_date,notes?}` only so
  old callers receive the deterministic rejection below; it has no success response after M13.
- Checkout request remains `{occupancy_id,requested_check_out_date,reason?}`.
- Checkout finalize remains `{end_date,room_status_after}` with `vacant|maintenance`.
- Compatibility checkout success keeps the existing bare `CheckOutRequestRecord` response;
  `GET /check-outs` keeps the existing bare array. No V2 wrapper is added.

## 3. Error envelope

All M13 errors use the existing global envelope:
`{success:false,error:{code,message},correlation_id:string|null,timestamp:string}`.
`details` is absent unless an existing validator supplies it.

| Condition                             | HTTP  | Exact code             | Exact message                                         |
| ------------------------------------- | ----- | ---------------------- | ----------------------------------------------------- |
| Direct check-in                       | `409` | `LEASE_REQUIRED`       | `Move-in must use lease creation`                     |
| Direct checkout with active lease     | `409` | `LEASE_CLOSE_REQUIRED` | `Active lease must be closed through lease lifecycle` |
| Lease create disabled/missing rollout | `403` | `LEASE_WRITE_DISABLED` | `Lease creation is not enabled for this property`     |

Existing validation, state-conflict, idempotency, forbidden, and not-found codes remain unchanged.

## 4. Direct check-in containment

- `POST /check-ins` must throw `LEASE_REQUIRED` after RBAC/property authorization and before
  any repository write or success audit.
- It performs zero mutation to room, occupancy, resident, lease, invoice, payment, history,
  outbox, or success audit.
- It never falls back when `lease_write=false`; the caller must wait for Lease rollout.
- Admin removes `CheckInDialog`, `useCompleteCheckIn`, and every direct check-in affordance.
- The replacement action is `Tambah Penyewaan` at `/penyewaan/tambah`, not another endpoint.

## 5. Legacy compatibility checkout

- Every checkout mutation resolves the target using a property-scoped lookup; cross-property
  requests remain `403 PROPERTY_SCOPE_DENIED` without existence disclosure.
- Before any write, the server checks the occupancy is active and whether a matching active
  lease exists for its property, room, resident, and occupancy.
- If an active lease exists, every checkout mutation returns `LEASE_CLOSE_REQUIRED`; the caller
  must use `POST /leases/:leaseId/close`.
- If the active occupancy has no matching active lease, the existing request/review/finalize
  workflow may run as an explicit temporary compatibility path.
- Successful compatibility finalization writes audit action exactly
  `occupancy.legacy_checkout`; existing request/review audit actions may remain.
- Finalization retains its existing transaction and may end only that occupancy, update its
  history/request, and set its room to `vacant|maintenance`.
- It must not create, update, close, or backfill any lease or invoice.
- Ended, cancelled, or transferred occupancy and non-finalizable checkout states fail closed.

## 6. Historical anomaly read model

- Derived anomaly: an active occupancy for which no active lease matches the same occupancy,
  property, room, and resident.
- No automatic lease/invoice creation, backfill, or migration is allowed.
- The smallest wire change is the existing Rooms V2 list/detail with
  `Accept: application/vnd.granada.admin-ux.v2+json` and `include_active_lease=true`.
- Each returned room record adds `lease_reconciliation_required: boolean`; it is present and
  non-null whenever `include_active_lease=true`.
- Frontend maps only that field to `leaseReconciliationRequired: boolean` and includes it in
  the strict room whitelist. It must not infer the anomaly from page rows or room status.
- `/rooms` table/detail renders `Perlu rekonsiliasi penyewaan` and an explicit compatibility
  checkout action only when the boolean is `true`.
- Occupancy/room/lease IDs may remain opaque transport values but are never rendered or logged.

## 7. Feature flags and access

- `lease_write=false`, an absent flag row, or `admin_ux_read=false` makes Lease create
  unavailable and returns `LEASE_WRITE_DISABLED` before command claim or domain mutation.
- UI hides/disables canonical move-in and never exposes direct check-in as fallback.
- Lease close remains available for an already-active lease under its existing stricter RBAC;
  disabling new writes must not strand an existing tenancy.
- Legacy compatibility checkout remains available only to reconcile historical anomalies.
- Production defaults remain fail-closed; no permission or role grant is expanded.
- Authorization is completed with explicit/scoped property predicates before resource mutation;
  every denial produces zero mutation and no success audit.

## 8. Invariants

- Every new active occupancy has one active, property/room/resident-compatible lease.
- Lease create requires the room to be exactly `vacant`.
- Existing unique constraints continue to enforce at most one active occupancy and one active
  lease per room and per resident.
- Lease close cannot leave its occupancy active.
- Direct checkout cannot leave a matching active lease open.
- Lease create/close keep transactionality, rollback, idempotency, and safe response whitelists.

## 9. Admin UX language and states

- Use `Minat Booking`, `Penyewaan`, `Hunian Aktif`, and `Perlu Rekonsiliasi` consistently.
- Loading, error, forbidden, missing-property, and feature-disabled states remain distinct and
  fail closed. No raw UUID, PII, audit metadata, or internal error payload is displayed.

## 10. Denylist

- Reservation/hold, Midtrans/provider/settlement, new domain status or enum, mass backfill,
  migration/schema, pricing/financial-rule changes, resident creation redesign, or M14+.
- No manual `routeTree.gen.ts`, unrelated file, feature grant, or compatibility alias route.

## 11. Implementation acceptance

- Focused backend lifecycle contract proves both 409 gates, scoped pre-write checks, anomaly
  derivation, zero forbidden mutation, legacy audit action, and Lease invariants.
- Focused frontend contract proves canonical action wiring, no direct check-in caller, exact
  anomaly mapping/copy, access/feature-disabled behavior, and opaque-ID non-rendering.
- Run relevant Lease/occupancy tests, API/Admin lint, typecheck/build, `npm run qa:read-only`,
  and `git diff --check`.
- Any DB/runtime recovery requires separate explicit approval.
