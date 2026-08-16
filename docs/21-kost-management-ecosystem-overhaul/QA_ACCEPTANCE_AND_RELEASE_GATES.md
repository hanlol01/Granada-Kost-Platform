# QA Acceptance and Release Gates

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

## 1. Purpose

This contract prevents two failure modes:

1. a locally green patch that does not exercise the live authority; and
2. an endless executor–reviewer loop caused by incomplete handoff and
   formatting-sensitive tests.

Quality evidence must be proportional to risk and must distinguish automated
verification, runtime verification, operator-reported evidence, deferred
evidence, environment limitations, and product defects.

## 2. Evidence Classes

| Class             | Meaning                                                               |
| ----------------- | --------------------------------------------------------------------- |
| Static contract   | Source/AST/schema assertions that prove wiring or prohibit a mutation |
| Behavioral unit   | Real function behavior with controlled collaborators                  |
| Integration       | Module, repository, transaction, migration, or HTTP behavior          |
| Aggregate         | Repository-defined lint, typecheck, build, and test gates             |
| API runtime       | Live authorized or negative HTTP behavior                             |
| Browser runtime   | User-visible terminal state and actual network behavior               |
| Reconciliation    | Database/domain invariants and cross-ledger totals                    |
| Operator-reported | Evidence supplied by the operator but not independently reproduced    |
| Deferred          | Explicitly postponed evidence; neither PASS nor product defect        |

No report may relabel one evidence class as another.

## 3. Universal Gates

### QA-OPS-001 — Scope Integrity

- Expected HEAD is recorded.
- Index is empty before and after review.
- Existing dirty files and protected hashes are snapshotted.
- Final diff contains only the approved allowlist and coherent atomic
  exceptions.
- No credentials, environment values, generated artifacts, or local tooling are
  staged.

### QA-OPS-002 — Live-Path Proof

Tests must exercise or structurally lock the controller, route, provider, hook,
repository, and module actually registered in production. A dormant controller,
unused helper, decoy call, or copied serializer cannot satisfy acceptance.

### QA-OPS-003 — RED to GREEN

- RED fails for the missing behavior before the product fix.
- GREEN passes after the fix.
- When a regression is critical, a mutation proof demonstrates that the claimed
  bad change fails the test.
- Mutation proofs target business invariants, not whitespace or incidental
  implementation style.

### QA-OPS-004 — Transaction and Idempotency

For every material command, tests cover:

- authorization before lookup/claim/write;
- same-key exact replay;
- same-key changed-payload rejection;
- different-key domain duplicate or conflict;
- concurrent serialization;
- transaction-client propagation;
- audit/event failure rollback;
- commit, rollback, and client release behavior.

### QA-OPS-005 — Parser and Wire

- Exact envelope and field whitelist.
- Missing and extra keys rejected where strict V2 wire is required.
- UUID, enum, date, timestamp, number, boolean, string, nullability, whitespace,
  and prototype behavior tested.
- No truthy boolean or implicit number coercion.
- Internal IDs and PII excluded from public or reduced-scope responses.

### QA-OPS-006 — State Coverage

Every user-facing query or command covers:

- loading;
- valid data;
- empty;
- forbidden;
- not found;
- conflict;
- invalid response;
- recoverable network or server error;
- retry;
- scope/account/property switch;
- stale response;
- double submit;
- pagination first/middle/last/empty/out-of-range where applicable.

### QA-OPS-007 — Aggregate Gate

The repository aggregate must remain sequential and fail-fast:

1. gate contract;
2. backend read-only contracts;
3. Admin tests;
4. API lint;
5. API build;
6. Admin lint;
7. Admin typecheck;
8. Admin build;
9. Penghuni lint;
10. Penghuni typecheck;
11. Penghuni client/SSR build;
12. `git diff --check`.

If a package intentionally cannot run a writing build inside a strict allowlist,
the executor records prior evidence and runs a no-emit compile. The final
reviewer must not claim a fresh build it did not run.

## 4. Test Architecture

### 4.1 Static Contracts

Use AST or schema parsing for:

- route registration and order;
- exact DTO decorators and transforms;
- serializer field lists;
- transaction-client use;
- forbidden mutation regions;
- query scope predicates;
- migration tables, constraints, indexes, and replay guards;
- provider topology and query-key composition.

Avoid broad regex checks that a decoy can satisfy.

### 4.2 Behavioral and Integration Tests

Prefer behavioral tests for:

- state transitions;
- authorization ordering;
- duplicate and concurrency behavior;
- parser failure;
- cache invalidation;
- stale-scope isolation;
- payment allocation and reversal;
- reminder eligibility;
- report totals;
- rollback and replay.

Mock only external boundaries. Do not mock the function whose authority is under
test.

### 4.3 Browser Tests

Browser runtime is targeted, not a substitute for domain tests. Use a maintained
browser test runner with:

- accessible locators scoped to the intended form, row, card, or dialog;
- auto-waiting for DOM state;
- exact API response waits registered before the triggering action;
- API-origin request settlement rather than generic `networkidle`;
- Vite HMR/WebSocket excluded from settlement;
- console and page errors classified narrowly;
- process-only credentials;
- disposable browser profile;
- screenshots only when they contain no unnecessary PII.

Brittle custom CDP orchestration is not required. Discovery/list commands must
be proven not to execute browsers.

### 4.4 Runtime Mutations

Material runtime mutations use one of:

1. a purpose-built QA database;
2. a verified disposable clone with process-only connection;
3. a dedicated development fixture approved for retained evidence.

A runner must prove the connected database before the first domain mutation.
If it cannot, it stops before login or mutation. Cleanup must restore services,
remove disposable data, and prove canonical fingerprints unchanged.

Runtime deferral caused by credentials or environment is not a product defect,
but it remains an evidence gap.

## 5. Domain Acceptance Matrix

## 5.1 Routes and Navigation

`QA-OPS-010`

- Every visible Admin item is reachable for an authorized account.
- Forbidden items return a stable forbidden state or are absent according to
  registry policy.
- `/vehicles?tab=vehicles`, `/complaints`, `/reports`, and
  `/rooms/fasilitas?q=` reach terminal pages.
- Unknown tab/filter/query values normalize safely.
- Refresh and direct deep link preserve the same page.
- Mobile sidebar exposes every navigation control.
- No dynamic-import, hydration, provider, or route-not-found regression.

## 5.2 Rooms and Category Content

`QA-ROOM-001`

- Inventory total is authoritative 163 for the canonical fixture.
- Category, gender, building, floor, and status totals reconcile.
- Search finds room number, building code/name, and category across pages.
- Filters reset offset and preserve URL state.
- Ordinary Add Room is absent/disabled and live command is rejected.
- Price is absent from list and present in detail.
- Room detail links to correct resident, lease, vehicle, billing, complaint, and
  owner scope.
- Lifecycle-active structural edit is blocked; safe attributes persist.

`QA-CONTENT-001`

- Exactly two facility and gallery category authorities.
- Gallery has no lobby/kitchen/shared-area target taxonomy.
- Draft content is not public.
- Published content appears only in matching category.
- Media order, cover, alt text, archive, and reload persist.
- Public derivative never exposes source-storage secrets.

## 5.3 Public Catalog and Booking Leads

`QA-PUBLIC-001`

- `/kamar` and category detail work without login at desktop and mobile.
- Category, gender, planned move-in, and term/payment-context filters are
  deterministic.
- No exact room number, internal UUID, occupancy, resident PII, unpublished
  media, or Admin endpoint leaks.
- Empty and error states are truthful.

`QA-LEAD-001`

- Public form validates required and optional fields.
- One submission creates one lead and no hold/room/lease/resident/payment
  mutation.
- Admin quick lead retains exact-room preference without reserving.
- Public lead has category/gender but no exact room until Admin selects one.
- Deprecated survey/converted transitions are rejected.
- Lead list source, status, university, gender, optional room, and hold state
  match authority.

## 5.4 Holds and Conversion

`QA-LEAD-010`

- One active hold per room and lead.
- Hold expires at the database clock boundary.
- Create, release, and worker lock order is deterministic.
- Expiry restores room only when no other authority controls it.
- Write flag blocks create but not safe release/expiry/read.

`QA-LEASE-001`

Test all three entry paths:

1. public Booking Lead onboarding;
2. Admin exact-room Booking Lead onboarding;
3. direct resident/lease onboarding.

For each:

- room is vacant and gender-compatible;
- DP and deposit are distinct;
- onboarding commit creates exactly one account/link, pending resident,
  awaiting-activation lease, billing authority, and reserved-room transition;
- its temporary credential appears only in a non-cacheable, non-replayable
  one-time receipt and is absent from ordinary responses, cache, logs, audit,
  outbox, telemetry, URL, and export;
- a future start produces no active occupancy and no occupied room;
- activation checklist is complete before **Activate Lease**;
- activation creates exactly one occupancy and active room/resident/lease
  transition;
- same key replays;
- changed payload conflicts;
- failure at each write rolls back all other writes;
- room, account, lease, and Booking Lead persist after reload in both committed
  and activated states.

## 5.5 Resident Identity and Account

`QA-RESIDENT-001`

- DTOs reject identity aliases, nested identity, unknown fields, coercion,
  whitespace-only, invalid dates, and invalid evidence.
- List response contains operational summary only.
- Detail response contains authorized complete profile.
- Permanent delete allowed only for an unused draft/error record.
- Historical resident archives/deactivates and retains links.
- Account creation reuses only an exact normalized eligible account.
- Temporary password appears once only in a dedicated `no-store` receipt, cannot
  be replayed or re-read after dismissal, is absent from ordinary
  responses/logs/audit/cache/outbox/telemetry/URL/export, and requires
  first-login change.
- Same-key provisioning replay returns the same safe business result with
  `already_issued` and no plaintext; losing the receipt requires an audited
  reset.
- A future-start account can read only its strict pending-onboarding projection;
  active resident context, occupancy, room-occupied state, and operational Home
  remain absent until activation.
- Duplicate email/phone races create one authority or a stable conflict.

`QA-RESIDENT-002`

- `/tenants` search/filter/pagination and expand/collapse work.
- Row summary and full detail agree.
- Quick links open matching room, vehicle, invoice/payment, complaint, and
  activity records.
- Account/property switches clear or isolate cache correctly.

## 5.6 Lease, Transfer, Renewal, and Checkout

`QA-LEASE-010`

- A historical/current/future start date and a 3–120 month term are validated;
  the normal 3-, 6-, and 12-month shortcuts and snapshot-derived schedule agree.
- Lease statuses follow canonical lifecycle.
- Room status is derived from lease/hold/inspection authority.

`QA-LEASE-011`

- Transfer requires reason and eligible destination.
- Normal end-period and exceptional same-day paths are distinguishable.
- Old occupancy closes; new occupancy opens; resident/account remains.
- Old room becomes inspection-required then vacant or maintenance.
- Transfer history and addendum are immutable.
- Concurrent destination selection creates only one winner.

`QA-LEASE-012`

- H-60 renewal intent, H-30 payment work, and H-14 checkout notice boundaries.
- Query-derived H-60/H-30/H-14 lease-ending renewal eligibility is surfaced
  read-only for the reminder/worklist authority: H-60 clears once intent is
  recorded, H-30 exposes unresolved approved-renewal/payment work at the boundary
  (a recorded payment alone never clears it), and H-14 clears only when the
  renewal is effective. No W08 delivery record is written.
- Renewal does not silently extend a lease: it uses a distinct immutable
  predecessor/successor link and fresh successor commercial/payment snapshots.
- Only Admin + `lease.manage` may create/approve/cancel; only Admin +
  `lease.manage` + `billing.manage` may prepare financials or authorize activation;
  property owners remain read-only.
- Activation requires an issued successor first invoice plus a real verified W06
  rent/DP allocation to that invoice. The 25% DP is advisory only, never a
  blocking minimum. The successor schedule/first invoice are issued through the
  shared W05/W06 contract-schedule issuance authority (no duplicated SQL).
- Cutover is one transaction: predecessor becomes `ended`, successor becomes
  `active`, and the physical stay stays continuous through contiguous occupancy
  records — the predecessor occupancy is closed and a distinct successor occupancy
  is opened for the same resident and room, with the room continuously occupied and
  no vacant gap. It writes audit/outbox/history but does not mutate prior W06,
  deposit, or W10 history.
- Scheduler execution needs both separate property and process gates; incomplete
  financial authority is retryable with zero lifecycle mutation, while deterministic
  conflicts are terminal and auditable.
- W07D checkout is explicit Admin-only/property-scoped and deny-by-default. It
  requires a 14-day Jakarta notice or audited exception, normalized keys/access,
  inventory, parking, and inspection evidence, and one non-terminal command per
  lease. Handover/inspection records alone never close the lease or occupancy.
- Only `CompleteCheckout` atomically locks/reconciles checkout, lease, occupancy,
  room, W06 invoices/installments, append-only deposit ledger, resident vehicles,
  and parking slots; it emits audit/history/outbox/idempotency evidence, releases
  the resident's property parking slots without deleting vehicles, and emits only
  an access-reconciliation task (never a direct Smart Lock command).
- Checkout invoice offsets have W07D-specific immutable credit evidence and call
  W06 reconciliation; deposit is never a payment allocation, revenue, owner
  earning, entitlement, settlement, or payout. W07A termination remains separate.
- Completion ends the lease/occupancy and yields only `inspection_required` or
  `maintenance`; the existing inspection-resolution authority alone may make the
  room vacant. Legacy close/refund mutations fail closed when `lease_checkout` is
  enabled; anomaly-only occupancy checkout remains untouched.
- Eligible pending refunds have a derived seven-Jakarta-weekday due date
  (Saturday/Sunday excluded, no holiday calendar). A late settlement is auditable
  and permitted; no stale breach boolean is authoritative.

## 5.7 Billing, Payments, and Deposits

`QA-BILLING-001`

- Snapshot-derived schedules generate exact periods and totals for 3–120 month
  terms; exact 12-month multiples may use annual category pricing.
- Booking Fee and DP credit rent, never security deposit.
- Security deposit is a liability, never revenue.
- Partial, exact, over, and multi-invoice payments allocate correctly.
- Transfer proof mandatory; cash receipt mandatory.
- Proof submission does not confirm payment.
- Confirmation, rejection, correction, reversal, and unapplied balance
  reconcile.
- Historical payment cannot be hard-deleted.

`QA-BILLING-002`

- Resident detail summary equals invoice/payment source.
- Unpaid, paid, awaiting-confirmation, and additional-payment tabs classify each
  record exactly once.
- Paid-payment detail shows allocations and secure evidence.
- Invoice and receipt documents have correct purpose and authorization.
- Current-month bill list updates after payment confirmation/reversal.

## 5.8 Reminders and Notifications

`QA-REMINDER-001`

- Template variables are versioned, protected, and fully resolved before send.
- Current-month composer binds one canonical current invoice set.
- Resident composer includes only checked unpaid invoices and recalculates total,
  periods, due date, and secure links.
- WhatsApp opens exact `wa.me` with encoded message.
- MVP history records external-open or manual-sent, not delivered/read.
- Email is visibly disabled while adapter is unconfigured.
- Reminder attempts are immutable; archive does not erase evidence.

`QA-REMINDER-002`

- H-60/H-30/H-14 work items enter and leave at exact boundaries inside the one
  lease-ending reminder workspace; rows retain their exact milestone labels.
- Paying, renewing, closing, or otherwise resolving the underlying work removes
  stale reminder eligibility and badge count.
- Header reminder and notification counts are independent.

`QA-NOTIFICATION-001`

- Internal events create the correct recipient-scoped notification.
- Mark-read and mark-all-read update counts.
- Deep links remain authorized.
- No other account/property/building notification is exposed.

## 5.9 Vehicles and Parking

`QA-VEHICLE-001`

- Vehicle list/detail/create/update scopes to canonical resident/property.
- Active room and parking assignment match resident.
- Documents and validity persist.
- Resident and room quick links point to the same authority.
- Property Owner receives reduced read-only data only for assigned Rumah Kost
  buildings and Apart Kost rooms within the effective ownership period.

## 5.10 Complaints and Maintenance

`QA-COMPLAINT-001`

- Resident creates a complaint only in canonical context.
- Severity and SLA deadlines derive correctly.
- Admin dispatch creates/reassigns one actionable work order.
- Completed/terminal states cannot be reset accidentally.
- Before/after evidence and costs persist.
- Urgent/medium/light SLA calculations cover boundary times.
- Complaint, work order, history, audit, and event roll back together on failure.

## 5.11 Expenses

`QA-EXPENSE-001`

- Required category, date, amount, method, and notes validation.
- Optional building/vendor/work-order linkage remains same property.
- Evidence preview matches uploaded private file.
- The Rp500,000 approval boundary is exact: a manager may approve below it;
  amounts at or above it remain pending and cannot be paid until the higher
  approver policy in `OWNER_CONFIRMATION_REQUIRED-005` is decided.
- Approved/reported expense cannot hard-delete.
- Reversal corrects finance report without rewriting history.

## 5.12 Reports

`QA-REPORT-001`

For Lease, Payment, Expense, and Finance:

- start/end dates and status filters survive URL refresh;
- invalid ranges rejected;
- UI summary, preview, Excel, and PDF share one canonical filter;
- export contains full filtered dataset across pagination;
- deterministic ordering;
- empty report remains valid;
- export contains no unauthorized PII or hidden internal IDs.

`QA-REPORT-002`

- Rent revenue equals confirmed allocated rent.
- Additional income is separate.
- Security deposit receipt/refund changes liability, not revenue.
- Expense reversals reconcile.
- Receivable and arrears match unpaid invoices.
- Occupancy uses authoritative room/lease state.
- The Finance report is labelled operational cash flow and never profit/loss;
  the latter remains unavailable until a separate accrual-accounting authority
  exists.

## 5.13 Property Owner

`QA-OWNER-001` through `QA-OWNER-004`

- An unassigned asset is labelled `Kostation`; no synthetic Owner account exists.
- Rumah Kost assignment covers exactly all rooms in its selected building,
  including later rooms; Apart Kost assignment covers only selected rooms.
- Cross-category and overlapping active/scheduled assignments fail closed.
- Transfer changes the visible Owner exactly at its effective boundary and keeps
  prior history immutable.
- Account provisioning and assignment are atomic; plaintext initial password is
  returned only once, replay never reveals it, and subsequent detail offers reset
  only. No first-login password change is required for `property_owner`.
- Owner A receives zero rows belonging solely to Owner B across dashboard,
  rooms, resident summaries, leases, billing, vehicles, leads, complaints,
  maintenance, notifications, reports, and exports.
- Former and future Owners see only the allowed ownership periods; empty
  ownership returns an honest empty scope, never property-wide data.
- Owner receives no NIK, KTP, private address, emergency contact, credentials,
  raw proof, storage path, or raw audit data.
- All create/update/delete/approve/dispatch commands return forbidden.
- Archive is rejected while active or scheduled assignments exist.
- For each earned occupied room-month under the standard policy, verified
  collection and elapsed service reconcile to Rp1.500.000 Owner entitlement and
  Rp300.000 Kostation management fee; partial collection follows 5:1 until caps.
- Vacancy and security deposit produce no Owner entitlement. Refund/reversal is
  an append-only adjustment, never destructive history.
- Settlement advances only `draft → ready_for_review → approved → paid`; payout
  requires Admin approval and masked/encrypted payout-account handling.
- The disposable Owner reconciliation proof demonstrates allocation-to-earning,
  adjustment/settlement-line, and paid-payout balance without a property-wide
  fallback. The controlled browser/QA-database procedure remains in
  [`PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md`](PROPERTY_OWNER_RECONCILIATION_AND_RUNTIME_RUNBOOK.md).

## 5.14 Penghuni

`QA-PENGHUNI-001`

- `/login`, `/kamar`, and `/kamar/*` remain public.
- Protected shell waits for auth resolution before role decision.
- Resident role is required; mixed role containing resident is allowed.
- Zero context, one context, and ambiguity have separate terminal states.
- Home/Profile use canonical context.
- Billing, complaints, vehicles, reminders, and notifications use same account
  context.
- Logout/auth failure clears cache; same-account refresh retains safe cache.
- 401/403/409 are not retried; network/5xx retry is bounded.

## 6. Migration and Data Gates

### QA-MIGRATION-001 — Preflight

- environment and target database identity exact;
- SSL and host policy exact;
- migration file tracked and hash-identical to reviewed commit;
- prerequisite tables/columns/indexes verified;
- partial-migration state absent or explicitly repairable;
- before counts and fingerprints recorded read-only.

### QA-MIGRATION-002 — Execution

- canonical ledgered or targeted strategy;
- execution exactly once;
- stop-on-error;
- transaction commit explicit;
- no replay of historical migrations;
- credential process-only;
- no seed or SQL repair unless separately approved.

### QA-MIGRATION-003 — Postcheck

- columns, constraints, FKs, delete behavior, and indexes exact;
- backfill and mismatch counts exact;
- unrelated fingerprints unchanged;
- replay safety proven in a disposable environment;
- source and migration hash unchanged;
- Git index empty.

## 7. Runtime Network Safety

Browser/API smoke maintains a request ledger:

- expected auth login/refresh only;
- exact planned domain POST/PATCH count;
- no unexpected PUT/PATCH/DELETE;
- no room DELETE;
- no provider, Midtrans, webhook, settlement, or external host;
- no duplicate logical submission;
- no hidden retry after failure;
- all expected responses and request completion observed.

Known Vite HMR and initial auth-refresh noise is classified narrowly by origin,
path, status, phase, and count. Generic 401 or generic console-error allowances
are prohibited.

## 8. Responsive and Accessibility Gate

Test at minimum:

- desktop 1440px;
- mobile 390px;
- light and dark themes where supported;
- keyboard-only primary task;
- focus restore after dialog/sheet;
- reduced motion;
- long names, property names, room labels, currency, and messages;
- empty and error content;
- no horizontal page overflow;
- accessible names for icon-only actions;
- visible validation and `aria-describedby`;
- `role="status"` for neutral state and `role="alert"` for failure.

## 9. Reviewer-Fixer Protocol

### Phase A — Independent Audit

Reviewer snapshots final diff and hashes, then audits the entire package before
editing. Findings are collected once as the **Finding Freeze**:

- correctness and lifecycle;
- transaction, concurrency, and idempotency;
- scope, privacy, and audit;
- compatibility and migrations;
- UI behavior, accessibility, and cache;
- tests and mutation sensitivity;
- unrelated-file integrity.

Acceptance criteria may not expand after the freeze unless a reviewer fix
introduces a concrete regression.

### Phase B — Fix

Reviewer fixes every safe finding inside the allowlist. Reviewer does not return
`REQUEST CHANGES` for a problem they can safely correct. A scope amendment is
requested only when the real live path proves another file is required.

### Phase C — Validate Final Delta

Reviewer runs focused and relevant regression gates, then re-audits only the
final delta against the freeze. Final outcomes:

- `APPROVE`;
- `APPROVE WITH NOTES` for true non-blocking or baseline notes;
- `BLOCKED` only for an external decision, environment condition, or required
  file outside authorized scope.

Approval must never be manufactured by weakening assertions or concealing
evidence.

## 10. Release Evidence Bundle

Each implemented package records:

- commit SHA and exact files;
- requirement IDs and final status;
- migration identifiers and hashes;
- focused and relevant test counts;
- aggregate gate result;
- runtime matrix or explicit deferral;
- reconciliation counts;
- network mutation ledger;
- protected hashes and dirty baseline;
- known limitations;
- rollback or disable procedure.

Evidence must not contain credentials, tokens, cookies, authorization headers,
database URLs, raw PII, or unredacted private documents.

## 11. Program Completion Gate

The ecosystem overhaul may be called implementation-complete only when:

1. every in-scope requirement in
   [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) is at least
   `AUTOMATED_VERIFIED`;
2. mandatory runtime journeys are verified or explicitly deferred by the
   product owner;
3. migration and reconciliation mismatches are zero or accepted with a named
   repair plan;
4. all visible navigation routes have terminal states;
5. Admin, public, Penghuni, and Property Owner scope tests pass;
6. financial reports reconcile;
7. deferred integrations remain honestly disabled;
8. final documentation states evidence boundaries accurately.

Implementation-complete does not mean deployed or production-ready. Those
claims require a separate environment, backup, monitoring, support, and
deployment-readiness gate.
