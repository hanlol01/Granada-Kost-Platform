# W07 Reconciliation and Execution Plan

Status: **LEAD RECONCILIATION — APPROVED FOR W07A REVIEW ONLY**
Baseline commit: `19d54c5b01c8d2401746d626fa7f287fa14de888` (`jam 9 sebelum mulai W07`)
Canonical DB/runtime status: **DEFERRED**

## 1. Purpose and Status Rules

This document reconciles the active W07 plan with the current source tree before
new W07 work starts. It is an execution boundary, not runtime evidence and not
a migration-application record.

The following evidence classes must never be collapsed:

| Label | Meaning |
| --- | --- |
| `SOURCE_IMPLEMENTED` | Relevant source and focused source contracts exist. |
| `AUTOMATED_REVIEW_PENDING` | Source exists but its complete automated acceptance review has not been recorded. |
| `AUTOMATED_VERIFIED` | Required focused automated evidence is recorded and reviewed. |
| `RUNTIME_DEFERRED` | No canonical database, authenticated browser, deployment, or production-like runtime claim is made. |
| `PLANNED` | The active contract exists but the package is not deliverable. |

The active delivery truth remains:

| Package | Active status | Reconciled conclusion |
| --- | --- | --- |
| W07A — Resident and Room 360; contract settlement/termination | `SOURCE_IMPLEMENTED; AUTOMATED REVIEW PENDING; RUNTIME DEFERRED` | Review and evidence consolidation are the next W07 action. |
| W07B — Transfer | `PLANNED` | Legacy/M6 transfer source is reusable evidence only; it does not advance W07B status. |
| W07C — Renewal | `PLANNED` | No W07C delivery claim. |
| W07D — Checkout and deposit disposition | `PLANNED` | Compatibility checkout source is not the full W07D lifecycle. |

This table follows the active roadmap, traceability matrix, and schema ledger.
Historical evidence that describes older policies remains historical evidence;
it must not be edited merely to make it appear current.

## 2. Authoritative Inputs and Non-Authorities

| Concept | Authority that W07 must consume | Explicit non-authority |
| --- | --- | --- |
| Resident identity/account | `residents` linked to `users` | lease, occupancy, room card, client-supplied resident ID |
| Lease term/commercial history | `leases` plus committed commercial snapshot | current category rate, room fields, UI totals |
| Physical stay | `occupancies` | resident row, lease alone, room badge |
| Room availability/status | canonical room lifecycle result | lead status, UI badge, occupancy inference alone |
| Rent settlement | invoices, verified payments, active payment allocations, W07A contract settlement | payment row without allocation, dashboard total |
| Security deposit | append-only deposit-liability transactions | DP, Booking Fee, rent allocation, revenue |
| Ownership | effective building assignment for Rumah Kost; effective room assignment for Apart Kost | property role, room card, client-selected owner |
| Owner earning/settlement | service-coverage/earning/settlement authority | payment receipt, deposit, report cache |
| Timeline | safe, read-only projection of histories/events | editable UI timeline or raw audit payload |

The 25% DP value is a recommendation/default prefill, not a blocking minimum.
DP and Booking Fee are advance-rent credits; security deposit is a distinct
liability. A payment is not an allocation, an allocation is not earned rent,
and earned rent is not owner entitlement or payout.

Every W07 mutation must be property-scoped, transactional, idempotent,
audited, outbox-backed, and fail-closed. Frontend state, cached tables, and
route visibility are never authority.

## 3. Reconciled Source Boundary

### 3.1 W07A source present, automated review still pending

Source and focused contracts show a real W07A settlement boundary:

- `contract-settlement.service.ts` creates one extension at most, only after
  the original deadline and only while a balance remains;
- termination starts a case after the partial-payment window closes and does
  not itself mutate lease, occupancy, or room state;
- termination finalization locks the lease/deposit state, offsets deposit to
  arrears before documented damage, and requires the refund amount to equal the
  remaining deposit balance;
- `ResidentDetailWorkspace` presents settlement separately from normal monthly
  invoices and identifies the two-month final deadline;
- `contract-settlement-termination-contract.spec.ts` covers command rollback
  and contains disposable migration 030 apply/replay/rollback proof.

Migration 030 is **canonical-migration deferred**. It must never be applied to
the canonical database merely to validate this package.

### 3.2 Existing M6 transfer is not W07B delivery

`LeaseTransferService` already provides a current-day, feature-gated transfer
command with ordered locks, property checks, target vacancy checks, idempotency,
audit/outbox writes, carry-forward deposit handling, and an M6 source contract.
It is valuable reuse, but it is not W07B completion because the active W07B
contract additionally requires:

- a required standardized transfer reason and a recorded exception reason;
- normal end-period scheduling as distinct from an authorized same-day path;
- gender compatibility as an authoritative eligibility check;
- explicit addendum/successor selection based on commercial terms;
- inspection-required outcome for the old room;
- dependent vehicle, parking, access, billing snapshot, reminder, and owner
  service-coverage reconciliation;
- W07 acceptance evidence for concurrency, rollback, and immutable history.

Do not relabel M6 code/tests as W07B evidence without this review and gap
closure. In particular, a client-directed `room_status_after` or a shortcut
that immediately makes a source room vacant is not an acceptable W07B outcome.

### 3.3 Existing close/checkout compatibility is not W07D delivery

`LeaseService.close` and the legacy checkout UI already record deposit
deductions/refund-pending entries and close an active lease on the current date.
They remain compatibility behavior until replaced or explicitly wrapped by the
W07D lifecycle. The active W07D contract requires notice, inspection, returned
key/access evidence, inventory and damage evidence, arrears reconciliation,
room inspection/maintenance result, parking/access reconciliation, final audit,
and a refund due no later than seven business days when eligible.

No new W07D flow may leave a second direct-close path that bypasses these gates.
Compatibility removal, redirection, or hard gating requires a separately
reviewed migration/rollout decision.

### 3.4 W07C remains design-first

The active contract requires H-60 intent, approved term/rate, H-30 payment
work, an amendment or linked successor lease, and no silent automatic extension.
No source presence may be interpreted as a delivered renewal workflow until the
renewal state model, commercial snapshot rule, and relationship to transfer and
checkout are approved.

### 3.5 Current Room/Resident 360 projection

The Admin room and resident full-page views already project safe linked data:
resident/lease, billing summary, ownership, vehicles, complaints, and timeline.
This supports W07A, but the projections are read models only. They must not
write lifecycle state, expose raw audit/PII, or substitute for the source
records above.

The room detail's ownership projection correctly resolves current owner scope
from effective assignments. It must continue to distinguish current operational
scope from historical financial scope. Owner portal access remains read-only and
period-bound; W07 never grants an Owner payment, transfer, renewal, or checkout
mutation.

## 4. Non-Regression Contract

| Dependency | W07 must preserve |
| --- | --- |
| W02 room authority | Fixed inventory; category is commercial authority; room status comes only from lifecycle commands. |
| W04 resident/account | Resident identity and authenticated account survive transfer, renewal, and checkout history; credentials/PII remain protected. |
| W05 onboarding/activation | Lease, occupancy, and room status stay distinct; activation remains a separate authority. |
| W06 billing | Schedules, invoices, verified allocations, reversals, DP/Booking Fee credits, and deposit liability remain append-only and reconcilable. |
| W10 ownership | Rumah Kost is building-scoped; Apart Kost is room-scoped; assignments are effective-dated; owner earnings/settlements use period-bound service coverage. |
| W08 reminders | W07 may expose derived H-60/H-30/H-14 or arrears eligibility, but it must not claim provider delivery or mutate reminder history outside its authority. |
| W09 vehicle/complaint/maintenance | Transfer/checkout reconciles scope and access tasks but does not silently close complaints, work orders, or expenses. |
| W11 Penghuni | Future resident UI reads the same self-scoped source records; it cannot perform Admin W07 mutations. |

## 5. Package Contracts

### 5.1 W07A — Review, stabilize, and prove current settlement authority

Allowed work:

1. Review the API, parser, Admin resident/room panels, focused contracts, and
   migration-030 disposable proof against the active W07A rules.
2. Fix verified source-contract gaps only inside the settlement/termination
   allowlist; do not broaden into transfer, renewal, generic checkout, W08, or
   W10 payout work.
3. Add regression tests for property scope, idempotent replay/conflict, audit
   rollback, no automatic eviction/checkout, deposit ordering, and safe
   projection fields.

Required invariants:

- one balance per activated lease;
- final deadline is activation plus two months;
- one explicit 1–14-day extension only;
- `D+1`/`D+7` are projections, not independent persisted lease states;
- after the applicable partial-payment window, only exact settlement or an
  Admin-only termination case is allowed;
- starting a termination case does not check out the resident;
- finalization retains all lease, occupancy, payment, allocation, and deposit
  history;
- deposit offsets rent first, then documented damage, then evidence-backed
  refund.

### 5.2 W07B — Transfer (after W07A review is accepted)

Mutation boundary:

1. Admin begins from one resident/active lease in one property.
2. Server validates standardized reason, effective-date path, room eligibility,
   property, gender, and current lease/occupancy consistency.
3. The command locks property, active lease, old/new rooms, resident, occupancy,
   invoices, deposit ledger, and affected ownership/service-coverage rows in a
   documented stable order.
4. It appends transfer history and either an addendum or linked successor lease;
   it never edits room foreign keys directly.
5. It ends old occupancy, creates target occupancy, sets target `occupied`, and
   sets old room `inspection_required`.
6. It reconciles allowed dependent records, then writes safe audit/outbox and
   invalidates scoped projections.

Required tests: normal end-period path; authorized same-day exception; invalid
reason/date/property/gender/target state; two concurrent commands for one target;
rollback; idempotent replay; old/new counters; history/addendum; owner-period
boundary; no tenant PII or raw evidence leak.

### 5.3 W07C — Renewal (after W07B design is accepted)

Mutation boundary:

1. H-60 records intent; H-30 creates payment work only; neither silently
   extends the term.
2. Admin approves the new term and commercial snapshot.
3. The command creates an explicit amendment or linked successor according to
   the approved policy, preserving the predecessor's immutable history.
4. Renewal, checkout, and transfer are mutually reconciled so a lease cannot
   reach competing terminal/cutover outcomes.

Required tests: H-60/H-30/H-14 boundaries; no implicit extension; rate/term
snapshot; amendment versus successor decision; overlap/concurrency rejection;
idempotency; billing schedule/reconciliation; historical ownership period.

### 5.4 W07D — General checkout and deposit disposition (last)

Mutation boundary:

1. Record at least 14-day notice or an authorized, audited exception.
2. Require completed inspection, returned keys/access evidence, inventory,
   arrears/credit reconciliation, and itemized evidence-backed damage.
3. Atomically end occupancy/lease and set the room to `inspection_required` or
   `maintenance`; a room cannot become vacant before inspection resolution.
4. Reconcile parking and access tasks; retain vehicles, complaints, and work
   orders according to their own lifecycles.
5. Create append-only deposit offset/deduction/refund records. Refund may remain
   pending but, when eligible, is due within seven business days.
6. Append safe audit/outbox/activity and reconcile derived reminder eligibility.

Required tests: notice/exception; each missing prerequisite blocks completion;
deposit never becomes rent revenue; damage cannot exceed remaining deposit;
refund due calculation; rollback; idempotency; terminal-state rejection; no
destructive deletion; room state and owner service-coverage boundary.

## 6. Execution Sequence and Gates

| Order | Deliverable | Entry gate | Exit gate |
| --- | --- | --- | --- |
| 0 | W07 reconciliation (this document) | Baseline checkpoint present | Leader approves scope and decisions below. |
| 1 | W07A automated review | Existing W07A source only | Focused API/Admin contracts, migration-030 disposable proof when authorized, builds, lint/format/diff check; status may advance only with recorded evidence. |
| 2 | W07B design and implementation | W07A review accepted | Transaction/idempotency/concurrency/rollback/property/gender/owner-boundary evidence. |
| 3 | W07C design and implementation | W07B lifecycle interfaces stable | Renewal date, snapshot, concurrency, and billing/ownership regression evidence. |
| 4 | W07D design and implementation | W07B/C cutover contracts stable | Checkout prerequisite, deposit, room-state, rollback, and seven-business-day evidence. |
| 5 | Cross-package review | W07A–D automated evidence complete | Traceability/ledger updates, explicit runtime-deferred status, no W08/W09/W11 claim. |

No package may stage, commit, migrate the canonical database, start services, or
claim runtime/browser evidence without separate authority.

## 7. Decisions Required Before Coding Beyond W07A

1. **Legacy transfer rollout:** decide whether M6 current-day transfer is
   disabled, routed through a new W07B flow, or incrementally upgraded behind a
   compatibility gate. It must not be silently reclassified as W07B.
2. **Legacy checkout rollout:** decide how direct `LeaseService.close` and
   compatibility checkout are gated/replaced so W07D prerequisites cannot be
   bypassed.
3. **Renewal representation:** choose amendment versus linked successor for
   unchanged and changed commercial terms, including invoice/snapshot cutover.
4. **Owner reconciliation hook:** approve the exact transactional or outbox
   contract that prevents transfer/checkout from producing incorrect W10
   service coverage, earned rent, or settlement rows.
5. **Authorization vocabulary:** verify that historical `owner`/`manager` roles
   used by compatibility lease commands cannot be confused with the W10
   `property_owner` read-only role.
6. **Inspection/access model:** approve canonical evidence records for
   inspection, keys/access, and inventory before W07D schema/API work begins.

Until these decisions are made, an executor may review W07A and write tests for
confirmed behavior, but must not implement W07B–D policy by assumption.

## 8. Required Executor Report

Every W07 implementation handoff must state:

- exact changed-file allowlist;
- authority, RBAC, privacy, transaction, idempotency, audit, and outbox summary;
- focused behavioral and regression tests with exact commands;
- build/lint/typecheck/prettier/diff-check results;
- known skips/failures and whether they are source, automated, or runtime gaps;
- HEAD, index, and dirty-worktree baseline integrity;
- canonical DB, disposable DB, service, seed, browser, stage, commit, and push status.
