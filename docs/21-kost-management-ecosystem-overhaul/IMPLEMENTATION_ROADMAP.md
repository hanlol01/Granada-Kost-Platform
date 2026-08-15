# Implementation Roadmap

Status: **APPROVED ROADMAP — IMPLEMENTATION PARTIAL (KMO-W00 through KMO-W06 source delivered)**

Program package prefix: `KMO-W`

## 1. Delivery Strategy

The overhaul must ship as coherent vertical slices. A slice is coherent when it
contains every schema, backend, frontend, migration, compatibility, test,
reconciliation, and documentation change required to make one user-visible
behavior true.

The roadmap is dependency-ordered, not date-promised. Target durations are
non-binding planning aids:

- **Fast Ship**: approximately one to three focused working days;
- **Hard Ship**: approximately three to seven focused working days;
- **Program Ship**: multiple reviewed slices and explicit runtime gates.

A package may be split further after discovery. It may not be broadened merely
to avoid an allowlist amendment. A minimum coherent atomic exception is valid
when an additional file is proven necessary for the live path.

## 2. Universal Package Protocol

Every package follows this sequence:

1. Confirm expected HEAD, clean index, and protected baseline hashes.
2. Read relevant requirement IDs, policy decisions, lifecycle contracts, and
   current source/database truth.
3. Declare exact scope, dependencies, migrations, fixture impact, mutation
   budget, and prohibited operations.
4. Produce RED evidence against the real live path.
5. Implement the smallest coherent vertical slice.
6. Run focused, relevant regression, static, aggregate, and proportional runtime
   validation.
7. Report `NOT READY FOR REVIEW` while any in-scope item is unfinished.
8. Run executor self-review and freeze remaining findings.
9. Hand off once as `READY FOR FINAL REVIEW`.
10. Reviewer performs one comprehensive finding freeze, fixes safe findings
    inside scope, validates final delta, and returns approval or a genuine
    blocker.
11. Commit exact reviewed files and update traceability/evidence.

No package may weaken property scope, idempotency, transactionality, audit,
privacy, or existing lifecycle authority for convenience.

## 3. Dependency Map

```text
W00 Truth baseline and route integrity
  ├─ W01 Domain vocabulary, rollout, and reconciliation foundation
  ├─ W02 Room/category/content authority
  │    └─ ARCH-01 Database architecture truth gate
  │         └─ W03 Public catalog and Booking Lead qualification
  ├─ W04 Resident identity and account provisioning
  ├─ W05 Lease onboarding and Booking Lead conversion
  │    ├─ W06 Billing, DP, deposit, and manual payment ledger
  │    └─ W07 Resident/room 360, transfer, renewal, and checkout
  ├─ W08 Reminder and notification operations
  ├─ W09 Vehicles, complaints, maintenance, and expenses
  ├─ W10 Property Owner mixed-asset authority, settlement, and reports
  ├─ W11 Penghuni application completion
  └─ W12 Integrated acceptance, reconciliation, and release closure
```

W08–W11 may overlap only after their shared authorities from W04–W07 are
stable. W12 starts after all included slices have automated verification.

## 4. Work Packages

## KMO-W00 — Truth Baseline and Route Integrity

Class: Fast Ship

Purpose: establish a reproducible current-state inventory and make every visible
Admin navigation route reach a safe terminal state.

Requirements:

- `FR-ADM-OPS-001`
- `NFR-REL-003`
- `NFR-A11Y-003`

Scope:

- inventory every Admin, public, Penghuni, and Property Owner route;
- classify live, broken, placeholder, duplicate, compatibility, or deferred;
- repair `/vehicles?tab=vehicles`, `/complaints`, `/reports`, and
  `/rooms/fasilitas?q=`;
- normalize invalid query parameters;
- add route-contract coverage for sidebar and deep links;
- record current schema/data reconciliation baseline;
- do not change domain lifecycle.

Exit evidence:

- all visible sidebar items have authorized/forbidden/unavailable terminal
  states;
- desktop and mobile navigation smoke;
- no dynamic-import, provider, hydration, or redirect loop;
- route matrix captured in traceability.

## KMO-W01 — Domain Vocabulary, Rollout, and Reconciliation Foundation

Class: Hard Ship

Purpose: align current enums and compatibility routes with canonical target
states before adding new flows.

Requirements:

- all `INV-*` in
  [`DOMAIN_LIFECYCLE_CONTRACTS.md`](DOMAIN_LIFECYCLE_CONTRACTS.md);
- `NFR-REL-001` through `NFR-REL-004`;
- `NFR-OBS-001`.

Scope:

- add canonical status translation and compatibility mapping;
- add reconciliation queries for room/hold/lease/occupancy, resident account,
  invoice/payment/allocation, deposit liability, and building ownership;
- standardize audit correlation and safe event envelopes;
- standardize feature-rollout carrier and fail-closed parsing;
- add migration ledger or a documented targeted-migration authority before
  further production migrations;
- preserve legacy wire only through explicit compatibility adapters.

Exit evidence:

- fresh database, migrated database, and immediate replay converge;
- all reconciliation counts are explainable;
- no truthy boolean coercion;
- no unledgered bulk migration execution.

## KMO-W02 — Room, Category, Facilities, Gallery, and Terms

Class: Program Ship; split into `KMO-W02A`–`KMO-W02D`

### KMO-W02A — Fixed Inventory and Room Discovery

Requirements:

- `DEC-ROOM-001`
- `FR-ADM-ROOM-001` through `FR-ADM-ROOM-004`

Scope:

- remove routine Add Room UI and reject unauthorized routine create paths;
- add server-side search/filter/sort and authoritative totals;
- update table columns;
- establish full-page room detail route and deep links;
- preserve safe edit with lifecycle-active structural locks.

### KMO-W02B — Category Commercial Authority

Scope:

- make category/type the source for monthly/annual rate and deposit policy;
- seed Rp1.800.000 monthly and Rp21.600.000 annual defaults;
- support Admin-editable future rates with effective dates;
- prevent ordinary room-level commercial drift;
- migrate or reconcile existing room/type values.

### KMO-W02C — Facilities and Gallery

Requirements:

- `FR-ADM-CONTENT-001`
- `FR-ADM-CONTENT-002`

Scope:

- exactly two category authorities;
- remove lobby/kitchen/shared-area taxonomy from target gallery workflow;
- add ordered media, alt text, publish state, cover selection, preview, archive;
- private source asset and public derivative handling;
- seed the currently proven common facility set without inventing differences.

### KMO-W02D — Terms and Publication

Requirements:

- `FR-ADM-CONTENT-003`

Scope:

- separate internal policy from public-safe terms;
- draft/published versions with effective dates;
- category applicability and public preview;
- visitor-hours value defaults conservatively to 21:00 pending owner
  confirmation.

Exit evidence for W02:

- all 163 rooms linked and discoverable;
- category totals and status totals reconcile;
- no routine room creation control;
- public-ready category records contain no internal or resident data;
- edit/reload and publication/reload persistence.

## KMO-ARCH-01 — Database Architecture Truth Gate

Class: Documentation gate; not a product milestone

Purpose: reconcile visual architecture, detailed target schema, living
implementation status, and source-of-truth ownership before public catalog and
later lifecycle packages build on W02.

Required authorities:

- [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md);
- [DATA_MODEL_AND_MIGRATION.md](DATA_MODEL_AND_MIGRATION.md);
- [SCHEMA_IMPLEMENTATION_LEDGER.md](SCHEMA_IMPLEMENTATION_LEDGER.md);
- [DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md).

Entry gate for KMO-W03:

- migrations 001–023 are inventoried without implying canonical application;
- W01 and W02 source/automated evidence is distinct from migration and runtime
  evidence;
- public projection, internal editorial source, category commercial source, and
  room non-authority boundaries are explicit;
- W03 remains pending until its own slice starts and receives evidence.

## KMO-W03 — Public Catalog and Booking Lead Qualification

Class: Program Ship; split into `KMO-W03A`–`KMO-W03C`

### KMO-W03A — Public Catalog

Requirements:

- `FR-PUB-CONTENT-001`
- `FR-PUB-ROOM-001`

Scope:

- public no-login landing and category detail;
- category, gender, planned move-in, and term/payment-context filters;
- gallery, facilities, rates, terms, and approximate availability;
- no exact room number, internal ID, occupied-room data, or resident data;
- responsive media gallery and safe empty/error states.

### KMO-W03B — Public Booking Lead

Requirements:

- `FR-PUB-LEAD-001`
- `FR-PUB-LEAD-002`
- `INV-LEAD-001`
- `INV-LEAD-002`

Scope:

- short prospect form only;
- server-derived source/category context;
- duplicate protection;
- consent and safe audit;
- no hold or room mutation.

### KMO-W03C — Admin Lead Queue Normalization

Requirements:

- `FR-ADM-LEAD-003`
- `FR-ADM-LEAD-004`

Scope:

- normalize list columns and statuses;
- remove survey and generic converted workflow;
- distinguish public category-only lead and Admin exact-room lead;
- show room-selection requirement and hold state;
- preserve contact through user-initiated WhatsApp.

Exit evidence:

- public desktop/mobile terminal state;
- lead appears once in Admin;
- public request performs zero room/lease/resident/payment mutation;
- private fields absent from public wire and browser DOM.

## KMO-W04 — Resident Identity and Account Provisioning

Class: Program Ship; split into `KMO-W04A`–`KMO-W04C`

### KMO-W04A — Resident Data Model

Requirements:

- `FR-ADM-RESIDENT-005`
- `INV-RESIDENT-001`

Scope:

- identity, education, parents/guardian, emergency contact, KTP/KK/KTM,
  resident photo, marital status, archive status;
- normalization, uniqueness, validation, retention, and evidence access;
- current records backfill without exposing identity in list responses.

### KMO-W04B — Atomic Account Provisioning

Requirements:

- `FR-ADM-AUTH-001`
- `DEC-AUTH-001`
- `INV-AUTH-001`

Scope:

- reuse an exact normalized email/phone account when allowed;
- otherwise create one user, role membership, resident link, and initial
  credential;
- return the temporary password once through a dedicated authorized
  non-cacheable receipt, make it unretrievable after dismissal, and require
  first-login change;
- never log, audit, export, or later redisplay the password;
- roll back all identity and lifecycle writes on failure.

### KMO-W04C — Resident Hub and Detail Shell

Requirements:

- `FR-ADM-RESIDENT-002`
- `FR-ADM-RESIDENT-003`

Scope:

- `/tenants` table, search, filters, row expansion, archive behavior;
- full resident detail route with section skeletons and deep-link contract;
- no duplicate primary Penyewaan sidebar;
- compatibility redirect for existing `/penyewaan` entry points.

Exit evidence:

- legacy resident fixtures reconcile;
- zero duplicate accounts for normalized identity;
- one-time credential test;
- list and detail privacy contract;
- archive versus delete mutation proof.

## KMO-W05 — Lease Onboarding, Hold, and Booking Conversion

Class: Program Ship; split into `KMO-W05A`–`KMO-W05D`

### KMO-W05A — Direct Onboarding

Requirements:

- `FR-ADM-RESIDENT-001`
- `FR-ADM-RESIDENT-004`

Scope:

- full-page two-stage Resident & Lease / Choose Room flow;
- manual resident entry or safe resident selection;
- gender-compatible vacant-room authority;
- valid historical, current, or future contractual start date;
- ordinary term from 3 through 120 months, with 3/6/12-month shortcuts;
- required confirmation and activation summary;
- stable idempotency and scope isolation.

### KMO-W05B — Booking Agreement and Room Assignment

Requirements:

- `FR-ADM-LEAD-001`
- `FR-ADM-LEAD-002`
- `FR-ADM-LEAD-005`

Scope:

- select room for category-only public lead;
- retain exact room preference for Admin lead;
- 24-hour hold and safe expiry;
- prohibit direct onboarding until the hold is active;
- record one Lead Payment Commitment, then route to `/tenants` for data
  completion; public leads select an exact room only inside this Admin hold flow;
- allow an authoritative re-quote of the final start date/duration before Commit
  Onboarding without mutating the recorded Lead Payment Commitment; block a
  period whose historical rent credit would exceed its revised contract rent;
- agreement/decline/expiry transitions;
- no automatic reservation on lead creation.

### KMO-W05C — DP, Deposit, and Activation Checklist

Scope:

- capture Booking Fee, DP, and security deposit as separate commitments/payments;
- method is transfer or audited cash;
- Booking Fee is optional but, when entered, is Rp0 or at least Rp1.000.000 and credits rent;
- prefill a 25% DP recommendation while allowing a lower authorized agreed DP;
- materialize a Lead Payment Commitment exactly once to the W06 ledger/deposit
  records when Commit Onboarding succeeds;
- security deposit is optional, freely entered, and may be Rp0; it remains a distinct refundable liability;
- signed lease, identity, room, payment, inventory, and handover prerequisites;
- reject activation when only a cosmetic status or insufficient DP exists.

### KMO-W05D — Atomic Onboarding Commitment and Activation

Scope:

- **Commit Onboarding** creates/links the account, pending resident,
  awaiting-activation lease, room reservation, initial billing authorities,
  audit, outbox, and one-time credential receipt in one transaction;
- **Activate Lease** later revalidates the committed authority at the valid
  start/check-in boundary, opens occupancy, marks room/resident/lease active, and
  closes the lead as leased in one transaction;
- same-key exact replay;
- conflict-safe rollback;
- direct onboarding uses the same commit and activation authorities without a
  fake lead.

Exit evidence:

- public lead and Admin quick lead each commit and activate once;
- direct onboarding commits and activates once;
- future-start commitment keeps the room reserved and occupancy absent;
- room status, account state, and activation state survive reload;
- failure at every boundary leaves no partial lifecycle;
- one active occupant per room.

## KMO-W06 — Billing, DP, Deposit, and Manual Payments

Class: Program Ship; split into `KMO-W06A`–`KMO-W06E`

### KMO-W06A — Contract Schedule and Invoice Authority

Scope:

- ordinary 3–120-month lease schedule;
- category-derived monthly rent, with annual category pricing available for exact 12-month multiples;
- reject terms shorter than three months until a separate approved exception policy exists;
- invoice generation, due dates, revisions, and secure PDF;
- no payment gateway dependency.

### KMO-W06B — Payment and Allocation Ledger

Requirements:

- `FR-ADM-PAYMENT-001` through `FR-ADM-PAYMENT-004`
- `INV-PAYMENT-001`
- `INV-PAYMENT-002`
- `INV-PAYMENT-003`

Scope:

- transfer/cash methods;
- proof and receipt policy;
- one payment allocated across selected invoices;
- exact `pending_confirmation` and `verified` states;
- correction/reversal, no hard delete;
- additional-payment categories.

### KMO-W06C — DP and Security Deposit Ledger

Scope:

- Booking Fee and DP credit rent obligations;
- deposit liability receipt, documented deduction, refund, and disposition;
- a zero security-deposit amount is valid and does not reduce contract rent;
- deposit is excluded from revenue;
- evidence and audit.

### KMO-W06D — Resident Billing Experience

Requirements:

- `FR-ADM-BILLING-001`
- `FR-ADM-BILLING-002`

Scope:

- summary card, tabs, filters, payment detail, allocation detail, proof preview,
  invoice and receipt access;
- current-month billing work page;
- resident detail quick actions.

### KMO-W06E — Penghuni Billing

Requirements:

- `FR-PEN-BILLING-001`
- `FR-PEN-PAYMENT-001`

Scope:

- canonical invoice/payment views;
- manual proof submission;
- confirmation remains Admin authority;
- secure downloads.

Exit evidence:

- schedules and totals reconcile;
- multi-invoice payment mutation proof;
- reversal restores balances;
- deposit liability never enters rent revenue;
- public/Property Owner privacy;
- PDF content and authorization.

Implementation truth (2026-08-03): `KMO-W05` and `KMO-W06` are
`AUTOMATED_VERIFIED; RUNTIME_DEFERRED`. Their committed source deliveries are
`a6dc5395` and `40b820d3`. The subsequent direct-form policy amendment is
`SOURCE_IMPLEMENTED` only until its own focused review and commit: it uses
`028_flexible_lease_term_and_booking_fee.sql`, which is manifest-bound and
present in the development migration ledger. That amendment records the
approved Booking Fee, optional security deposit, historical date, and 3–120
month policy above. Authenticated browser evidence, provider checkout, and
reminder delivery remain separate authorized or later-package work.

## KMO-W07 — Resident/Room 360, Transfer, Renewal, and Checkout

Class: Program Ship; split into `KMO-W07A`–`KMO-W07D`

### KMO-W07A — Resident and Room 360

Current source boundary: `SOURCE_IMPLEMENTED; AUTOMATED REVIEW PENDING; RUNTIME DEFERRED`.

Scope:

- complete room and resident linked panels;
- vehicles, complaints, billing, lease, owner, and activity timeline;
- stable full-page routes and breadcrumbs;
- quick links to canonical details.
- one contract-rent settlement balance per activated lease, with a two-month
  final deadline, explicit one-time extension, arrears projection, and no
  automatic eviction;
- contextual payment actions and an admin-only, audit-safe termination path;
- deposit offset, documented damage deduction, and receipt-backed refund only
  when checkout is finalized.

W07A deliberately does not claim W08 delivery-provider execution: H-30/H-14/
H-7/H-0/D+1/D+7 are derived reminder stages for the later reminder workspace.

### KMO-W07B — Room Transfer

Requirements:

- `FR-ADM-LEASE-001`

Scope:

- required reason;
- normal end-period and authorized same-day path;
- destination eligibility and gender check;
- addendum/history;
- old room inspection-required;
- resident/account continuity.

### KMO-W07C — Renewal

Current source boundary: `SOURCE_IMPLEMENTED; AUTOMATED REVIEW PENDING; RUNTIME DEFERRED`.

Scope:

- H-60 intent, then a distinct Admin approval of a fresh linked successor term;
- immutable predecessor/successor linkage via `leases.renewed_from_lease_id`;
- H-30 actionable payment work: an Admin with `lease.manage` and `billing.manage`
  prepares the immutable successor schedule and first invoice;
- separate financial activation authorization, requiring an issued first invoice
  and an actual verified W06 rent/DP allocation to that exact invoice;
- transactional effective-boundary cutover that ends the predecessor and activates
  the successor through contiguous occupancy records — the predecessor occupancy is
  closed and a distinct successor occupancy is opened for the same resident and
  room in one transaction — with the room continuously occupied and no vacant gap;
- reuse of the shared W05/W06 contract-schedule issuance authority (no duplicated
  invoice/installment lifecycle SQL in the renewal service);
- query-derived H-60/H-30/H-14 lease-ending renewal eligibility surfaced read-only
  for the reminder/worklist authority (a recorded payment alone never clears H-30);
- no silent automatic extension, no transfer/checkout/deposit disposition, no
  W08 reminder delivery, and no W10 owner-earnings write.

The 25% DP value is a recommendation/default prefill only; it is never an
activation minimum. Property rollout (`lease_renewal` and
`lease_renewal_scheduler`) and the independent
`LEASE_RENEWAL_SCHEDULER_PROCESS_ENABLED` process gate are deny-by-default.

### KMO-W07D — Checkout and Deposit Disposition

Requirements:

- `FR-ADM-LEASE-002`

Scope:

- minimum 14-day notice or recorded exception;
- balances, keys/access, inspection, inventory, damages;
- deposit refund/deduction;
- room vacant/maintenance result;
- final audit and resident account post-lease policy.

Exit evidence:

- transfer concurrency and rollback;
- old/new room counters and statuses;
- renewal boundary dates;
- checkout blocks on unresolved requirements;
- deposit refund due within seven business days when eligible.

## KMO-W08 — Reminder and Notification Operations

Class: Program Ship; split into `KMO-W08A`–`KMO-W08D`

### KMO-W08A — Templates and Composer

Scope:

- versioned templates with protected variables;
- preview and validation;
- current-month locked composer;
- resident-detail multi-invoice composer;
- secure invoice links;
- WhatsApp `wa.me` handoff and email disabled state.

### KMO-W08B — Reminder Work Workspace

Scope:

- current-month bills plus one lease-ending workspace whose sidebar destination
  remains **Reminder H-30**;
- clearly labelled H-60 renewal-intent group;
- primary H-30 renewal/payment-work group;
- clearly labelled H-14 checkout group;
- derived eligibility and badge count;
- work disappears when underlying condition resolves.

### KMO-W08C — Reminder History

Scope:

- immutable attempt/outcome record;
- preview, channel, actor, selected invoices, template version;
- external-open/manual-sent status for MVP;
- archive rather than hard delete.

### KMO-W08D — Notification Center

Scope:

- internal event types, unread count, read state, deep link;
- Admin and Penghuni scopes;
- separate from reminder attempt semantics.

Exit evidence:

- protected variables cannot be removed or forged;
- invoice selection updates preview exactly;
- stale badge mutation proofs;
- no delivered/read claim without provider evidence;
- account/property isolation.

## KMO-W09 — Vehicles, Complaints, Maintenance, and Expenses

Class: Program Ship; parallel subpackages `KMO-W09A`–`KMO-W09C` after shared authorities

### KMO-W09A — Vehicles and Parking

Requirements:

- `FR-ADM-VEHICLE-001`
- `FR-ADM-VEHICLE-002`
- `FR-PEN-VEHICLE-001`

Scope:

- fix route;
- searchable list, resident/room linkage, parking assignment, validity,
  documents, detail/history, and quick links.

### KMO-W09B — Complaints and Maintenance

Requirements:

- `FR-ADM-COMPLAINT-001`
- `FR-ADM-COMPLAINT-002`
- `FR-PEN-COMPLAINT-001`

Scope:

- fix route;
- severity/SLA, attachments, dispatch, work order, evidence, cost, resolution;
- preserve M16 atomic authority.

### KMO-W09C — Expenses

Requirements:

- `FR-ADM-EXPENSE-001`
- `FR-ADM-EXPENSE-002`

Scope:

- schema/API/UI;
- category, property/building, vendor, method, proof preview, work order;
- exact Rp500,000 approval boundary; amounts at or above it remain pending until
  the higher approver policy in `OWNER_CONFIRMATION_REQUIRED-005` is decided;
- reversal and audit.

Exit evidence:

- all three modules route and deep-link correctly;
- entity scope and documents authorized;
- lifecycle and financial correction paths;
- no cross-property or resident identity leak.

## KMO-W10 — Property Owner Management and Reports

Class: Program Ship; split into `W10-OWNER-A`–`W10-OWNER-D`.

Status: `IN_PROGRESS`. `W10-OWNER-A` through `W10-OWNER-D` are
`AUTOMATED_VERIFIED`; controlled runtime QA and canonical migration remain
deferred. This status does not claim a canonical migration or production runtime
exercise. The complete boundary is in
[`PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md`](PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md)
and the controlled procedure is in
[`PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md`](PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md).

Implementation truth (2026-08-12):

- `W10-OWNER-A` commit `3b6dd0020530fe8cc883136dd4b65a97399403f8`
  establishes migration 035, mixed-asset ownership authority, RBAC, Admin
  mutations, owner-safe projections, and focused backend contracts. Migration
  035 is not claimed as applied to the canonical database.
- `W10-OWNER-B` commit `c5649f0` establishes the Admin Owner Property list,
  detail, create/edit/archive/reset, credential receipt, assignment, release,
  transfer, and ownership-history workspace. Browser/runtime verification is
  deferred.
- `W10-OWNER-C` supplies the read-only portal/report source; `W10-OWNER-D`
  closes automated reconciliation, security evidence, and the runtime/rollback
  runbook without claiming a canonical deployment.
- `W10-OWNER-A3` source adds migration 037 allocation-backed service-coverage
  authority for transfer-month earnings, bounded by invoice, activated lease,
  and occupancy service. W10-OWNER-C/D are `AUTOMATED_VERIFIED;
RUNTIME_DEFERRED`; no canonical migration/runtime claim is made.

### W10-OWNER-A — Schema, Authority, RBAC, and API Foundation

- add Owner Profile and effective-dated Rumah Kost building and Apart Kost room
  assignments;
- prohibit category mismatch and overlapping asset periods;
- add the distinct read-only `property_owner` role;
- derive every Owner scope from the authenticated account and return an honest
  empty result for an empty assignment set;
- add effective-dated commercial split policy, earned-rent attribution, Owner
  entitlement, settlement, adjustment, and payout authority; and
- reconcile legacy property-wide data without automatic broad backfill.

### W10-OWNER-B — Admin Master Data and Assignment

- Owner list, create, detail, edit, archive, credential receipt/reset, and
  ownership history;
- whole-building Rumah Kost wizard and individual-room Apart Kost wizard;
- immediate/scheduled release and transfer without rewriting history;
- `Kostation-owned` fallback for unassigned assets; and
- deterministic locks, idempotency, audit, and outbox in every mutation.

### W10-OWNER-C — Read-only Portal, Reports, and Settlement

- same management application with a dedicated Owner shell and zero operational
  mutation authority;
- asset- and ownership-period-bound occupancy, lease, maintenance, complaint,
  notification, and safe financial summaries;
- verified collected-and-earned rent attribution using the current standard
  Rp1.800.000 room-month split into Rp1.500.000 Owner entitlement and Rp300.000
  Kostation management fee, with partial collections allocated 5:1 until caps;
- monthly settlement lifecycle `draft → ready_for_review → approved → paid`; and
- preview/export parity with masked payout account and reduced PII.
- W10-OWNER-A3 adds exact half-open allocation/invoice/lease/occupancy-bound
  earning service coverage, allocation-total reconciliation, clipped historical
  lifecycle projections, embedded-Unicode PDF/XLSX parity, and coverage-only
  financial notification lineage for mid-month ownership transfer.

### W10-OWNER-D — Reconciliation, Security Review, and Runtime QA

- disposable migration first apply/replay/constraint/rollback proof;
- category, interval overlap, transfer boundary, empty-scope, and historical
  period tests;
- entitlement, fee, reversal/refund adjustment, settlement, and payout
  reconciliation;
- mutation denial and PII/private-proof exclusion; and
- authenticated Admin and Property Owner browser flows after source stabilizes.

Automated evidence for this slice is complete. Browser flows and any database
mutation remain deferred until the W10-D runbook is executed against an
identified QA target with restore evidence.

Exit evidence:

- Rumah Kost assignment covers exactly its building rooms and Apart Kost only
  the selected rooms;
- old/new Owner history changes exactly at the effective boundary;
- reports and exports reconcile to earned service and ownership periods;
- one asset-period never pays two Owners;
- all Owner mutation attempts are rejected; and
- list, detail, cache, report, and export scopes remain isolated.

## KMO-W11 — Penghuni Application Completion

Class: Program Ship

Requirements:

- all `FR-PEN-*` not completed in earlier packages.

Scope:

- first-login password change;
- canonical Home/Profile;
- lease, billing/payment, reminders/notifications;
- complaints, vehicles, property information;
- public `/kamar` remains public while protected routes require resident role;
- zero/single/ambiguous resident-context behavior;
- mobile-first operational QA.

Exit evidence:

- resident happy path with process-only credential;
- non-resident and mixed-role matrix;
- no account cache bleed;
- public catalog unaffected;
- no payment gateway request.

## KMO-W12 — Integrated Acceptance and Release Closure

Class: Program Ship

Purpose: prove the ecosystem as one product rather than a set of locally passing
slices.

Scope:

- run reconciliation on seeded and migrated environments;
- run full automated inventory;
- run authenticated Admin, Penghuni, and Property Owner browser flows;
- run public no-login flow;
- execute an authorized disposable or purpose-built QA mutation dataset;
- verify reports against ledger source;
- verify rollback/replay/concurrency controls;
- close or explicitly defer remaining integrations;
- update PRODUCT, checkpoint, handoff, master, roadmap, and traceability truth.

Exit evidence:

- every implemented requirement is `AUTOMATED_VERIFIED`;
- required runtime flows are `RUNTIME_VERIFIED` or explicitly deferred with
  reason and owner approval;
- no unexplained reconciliation mismatch;
- no source or DB mutation left from disposable QA;
- no production-readiness claim unless a separate deployment gate is passed.

## 5. Rollout Strategy

Each material capability has a fail-closed rollout flag where partial deployment
would be unsafe:

- `resident_onboarding_write`;
- `booking_conversion_write`;
- `billing_ledger_write`;
- `reminder_write`;
- `expense_write`;
- `property_owner_read`.

Rules:

- absent, null, malformed, or non-boolean means disabled;
- read/reconciliation and safe release/close operations remain available when a
  create flag is disabled where lifecycle safety requires it;
- rollout parsing is exact and tested;
- rollout activation is a separate authorized operational task;
- UI visibility never replaces backend enforcement.

## 6. Migration Strategy

1. Introduce additive nullable structures and indexes.
2. Backfill deterministically from authoritative current data.
3. Produce mismatch reports before enforcing new constraints.
4. Repair only through approved scripts with before/after fingerprints.
5. Enable constraints after zero-mismatch proof.
6. Switch reads, then writes, through explicit rollout.
7. Retain compatibility adapters for one named window.
8. Remove legacy columns/routes only after usage and data evidence reaches zero.

Migration execution must use a ledgered runner or a targeted canonical file with
preflight, exact connected database proof, `ON_ERROR_STOP`, one execution, and
postcheck. Replaying an unledgered directory of historical migrations is
prohibited.

## 7. Scope and Commit Discipline

- Documentation packages may update traceability and checkpoint truth without
  product code.
- A functional commit contains one reviewed coherent slice.
- Generated route trees, environment files, local tooling, credentials, build
  artifacts, and unrelated dirty files are never swept into a commit.
- Runtime rollout, migration, fixture mutation, and production deployment are
  separate authorized actions, not implicit consequences of a source commit.

## 8. Deferred Integration Register

The following remain deliberately deferred until a dedicated package proves
provider, data, authorization, failure, and operational requirements:

- payment gateway collection, webhook, settlement, and refund;
- automated WhatsApp API delivery;
- automated email provider delivery;
- Smart Lock live command and device reconciliation;
- CCTV live streams and recording access;
- external investor disbursement or tax accounting.

Their UI must show an honest disabled or unconfigured state and must not simulate
success.
| W03-PUBLIC | Public category catalog and booking lead | AUTOMATED VERIFIED; RUNTIME DEFERRED | W03C publication authoring, W04 onboarding |
