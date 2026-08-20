# W09 Reconciliation and Execution Plan

## Purpose and Current Status

`KMO-W09` covers vehicles, parking, complaints, maintenance, and expenses. The
active roadmap lists it as planned. Existing migrations 006 and 007, backend
modules, and Admin routes are legacy source inputs; their existence does not
advance a W09 package to verified status.

The delivery sequence is intentionally sequential:

1. `W09A` — Vehicles and Parking
2. `W09B` — Complaints and Maintenance
3. `W09C` — Expenses

The roadmap describes the subpackages as parallel-capable after shared
authorities. This plan chooses sequential execution because W07 checkout,
W08 notifications, W10 owner projections, and W11 resident isolation must be
reconciled before lifecycle or financial mutations are extended.

## Non-Negotiable Shared Authority

- Every mutation is property-scoped, transactional, idempotent, audited,
  outbox-backed, and fail-closed.
- `resident`, `lease`, `occupancy`, `room`, `vehicle`, `parking slot`,
  `complaint`, `work order`, and `expense` remain separate authorities. A UI
  projection never replaces its command authority.
- Admin operations may mutate only through authorized commands. Penghuni may
  read and submit only inside authenticated resident context. `property_owner`
  is read-only and derives scope only from effective W10 assignments.
- Documents remain private file references. No raw storage path, direct file
  URL, tenant PII, raw audit, or internal cost detail may be exposed to the
  Owner portal.
- W07B transfer and W07D checkout own lease/occupancy/room lifecycle. W09 may
  react to their completed state but must not invent an alternate checkout or
  make a room vacant while occupancy remains active.
- W08 is the authority for notification records and read/archive state. W09
  emits domain events/outbox records only; it does not claim provider delivery.

## W09A — Vehicles and Parking

### Existing Source to Reconcile

- Migration 007 contains `vehicles`, `vehicle_status_histories`,
  `vehicle_files`, `parking_zones`, and `parking_slots`.
- Backend already contains `vehicle` and `parking` modules, Admin routes, and
  resident and Owner read controllers.
- Existing source must be audited against current property, resident,
  occupancy, W07 transfer, W07D checkout, file, audit, and outbox authority.

### Read-Only Readiness Findings

- The current slot table holds only its current `vehicle_id`; migration 007
  contains no parking-assignment history entity. The roadmap's required
  assignment history therefore needs a minimal, append-only migration rather
  than a UI-only interpretation.
- Current vehicle and parking services write directly through repositories and
  audit records, but do not yet establish the shared W09 mutation contract of
  transaction + idempotency + outbox. W09A must consolidate those writes into
  command authority.
- W07D `CompleteCheckout` already locks and releases the checkout resident's
  parking slots in its own transaction. That lifecycle path remains canonical;
  W09A must reuse or safely share it, not add a competing checkout release.
- No dedicated W09 vehicle/parking behavioral suite is present. Existing
  source cannot be promoted without new focused evidence.

### Required Result

- Searchable Admin vehicle and parking views with authorized detail/history and
  safe deep links to the resident and room context.
- A vehicle is bound to its resident and property; active parking assignment
  matches the resident's active stay when an assignment exists.
- Parking remains optional by property. No slot is required merely because a
  vehicle is registered.
- Checkout releases only parking slots belonging to the checkout resident in
  that property, preserves vehicle history, and never deletes the vehicle.
- Same-property room transfer preserves the vehicle; it does not create a
  duplicate vehicle or silently change a parking assignment.
- Documents and validity metadata are authorized by property and role.
- Owner receives only effective-scope aggregate/read-safe visibility, never
  resident-identifying vehicle records or operational mutation controls.

### Reconciliation Questions Before Code

1. Which existing commands already use a transaction, idempotency key, audit,
   and outbox record, and which need hardening?
2. Does W07D checkout currently release the same parking assignment authority
   that W09A exposes, with no duplicate release path?
3. Are vehicle file reads mediated by the file authority for every role?
4. Does the Admin route use canonical API results rather than cached room or
   resident copies?

### Acceptance Evidence

- Property/resident isolation, plate uniqueness, optional parking, assignment
  conflict, transfer continuity, checkout release, document authorization, and
  owner-safe rejection tests.
- Focused API/Admin/Penghuni tests, migration apply/replay/rollback proof if a
  schema change is needed, plus W07/W08/W10 regressions.

## W09B — Complaints and Maintenance

### Existing Source to Reconcile

- Migration 006 contains complaint categories, complaints, complaint history,
  files, technician profiles, work orders, work-order history, files, and
  materials.
- Backend complaint and maintenance modules and Admin routes exist. Complaint
  attachment backend readiness exists, but is not proof of a complete W09B
  workflow.

### Required Result

- A resident can create and read only their own canonical-context complaint.
- Admin queue/detail supports severity, SLA, attachments, dispatch,
  reassignment, evidence, resolution, rework, closure, and retained history.
- Dispatch/reassignment produces one actionable work order under the existing
  M16 atomic authority; complaint, work order, audit, and outbox event roll
  back together on failure.
- Owner views only property-effective, non-PII, read-safe operational
  summaries. No technician controls, raw tenant evidence, internal notes, or
  cost mutation is exposed.
- W08 consumes emitted domain events through its own notification boundary;
  W09B does not create provider-delivery claims.

### Acceptance Evidence

- Resident-context isolation, property isolation, SLA calculation, attachment
  authorization, atomic dispatch/reassignment, terminal correction/rework,
  Owner data minimisation, and W08 notification-source regressions.

## W09C — Expenses

### Current State

No Expense module, route, or migration is present. It is new authority, not a
screen-only addition.

### Fixed Boundary

- Expenses are property/building scoped and may optionally reference a vendor,
  work order, and private proof file from the same property.
- Required fields are category, date, amount, method, and notes.
- Original expenses are never destructively edited or deleted. Corrections use
  an authorized reversal/compensation chain with audit evidence.
- The exact approval threshold is Rp500.000. Amounts at or above Rp500.000
  remain `pending` until the higher-approver policy in
  `OWNER_CONFIRMATION_REQUIRED-005` is decided. They must not be silently
  treated as approved, paid, reimbursable, or included as final Owner finance.

### Lead Decision Required Before Approval UI

Define the higher approver identity and the permitted transition for an
expense below Rp500.000. Until then, W09C can prepare a safe draft/pending
authority but cannot claim a complete approval workflow.

### Acceptance Evidence

- Same-property references, proof authorization, exact Rp500.000 boundary,
  pending state for higher amounts, reversal chain, audit/outbox, report
  projection, and Owner-safe financial visibility.

## Implementation Gates

Each subpackage begins with a read-only readiness report containing:

1. Current source status and legacy bypasses.
2. Exact lifecycle/state machine and authority boundary.
3. Minimal changed-file and migration allowlist.
4. Focused behavioral and regression test matrix.
5. Any decision that cannot be inferred safely.

No package is marked `AUTOMATED_VERIFIED` until its focused tests, relevant
cross-domain regressions, build/lint/typecheck/Prettier/diff checks, and any
needed disposable PostgreSQL migration proof have passed. Canonical database,
runtime, browser, seed, staging, commit, and push evidence remain separate.
