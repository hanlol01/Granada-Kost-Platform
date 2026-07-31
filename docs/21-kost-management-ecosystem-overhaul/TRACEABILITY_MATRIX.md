# KMO Traceability Matrix

Status: **APPROVED PROGRAM — IMPLEMENTATION PARTIAL**

This document connects owner policy, product decisions, invariants, functional
requirements, technical contracts, work packages, and acceptance gates for the
KOSTATION Kost Management Ecosystem Overhaul (KMO).

It does not claim that the entire overhaul has been implemented. A row advances
from `APPROVED` through the canonical status vocabulary and reaches
`RUNTIME_VERIFIED` only after its work package, automated evidence, migration
evidence when applicable, and authorized runtime evidence satisfy the gates in
[QA_ACCEPTANCE_AND_RELEASE_GATES.md](QA_ACCEPTANCE_AND_RELEASE_GATES.md).

## 1. Traceability Rules

1. `POL-*` identifies a binding business rule derived from the owner source.
2. `DEC-*` identifies a product decision or an explicitly superseded proposal.
3. `INV-*` identifies a cross-surface invariant that implementation must not
   violate.
4. `FR-*-001..099` identifies product-level behavior in
   [PRD.md](PRD.md).
5. `FR-*-101..199` identifies detailed surface behavior in the experience
   specifications.
6. `NFR-*` identifies non-functional acceptance requirements.
7. `QA-*` identifies an evidence gate, not an implementation.
8. `KMO-W*` identifies an atomic delivery package in
   [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
9. A range in this document covers only IDs that are actually defined in the
   linked authority; it must not be used to invent an intermediate ID.
10. All rows initially have status `APPROVED`. Historical M9–M19 evidence may be
    reused only after the executor proves that it still validates the final KMO
    behavior.
11. Visual relationships, detailed schema targets, implementation state, and
    concept ownership must remain aligned across
    [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md),
    [DATA_MODEL_AND_MIGRATION.md](DATA_MODEL_AND_MIGRATION.md),
    [SCHEMA_IMPLEMENTATION_LEDGER.md](SCHEMA_IMPLEMENTATION_LEDGER.md), and
    [DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md).

## 2. Program-Level Traceability

| Outcome                                                    | Binding authority                                                                                                                                                 | Product requirements                                                                                                                       | Technical authority                                                                                                          | Work package                                          | Acceptance authority                                                              | Status   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| One coherent operational model                             | `DEC-OPS-001..004`, `DEC-OPS-010..011`, `INV-OPS-001..002`                                                                                                        | `FR-ADM-OPS-001..002`, `FR-ADM-OPS-101..105`                                                                                               | API-wide invariants, migration conventions, canonical terminology, destructive-action replacement, configurable guest cutoff | `KMO-W00`, `KMO-W01`, `KMO-W02`, `KMO-W12`            | `QA-OPS-001..007`, `QA-OPS-010`, `QA-CONTENT-001`                                 | APPROVED |
| Correct account and property boundaries                    | `DEC-AUTH-001`, `DEC-PROPERTY-001`, `INV-AUTH-001..002`, `INV-PROPERTY-001`                                                                                       | `FR-ADM-AUTH-001`, `FR-ADM-AUTH-101`, `FR-ADM-PROPERTY-001`, `FR-ADM-PROPERTY-101`; all `FR-PEN-AUTH-*`; all `FR-POW-AUTH-*`               | Authentication, authorization, account provisioning, building scope                                                          | `KMO-W00`, `KMO-W01`, `KMO-W04`, `KMO-W10`, `KMO-W11` | `QA-AUTH-001`, `QA-PROPERTY-001`, `QA-PENGHUNI-001`, `QA-OWNER-001`               | APPROVED |
| Fixed authoritative room inventory                         | `POL-ROOM-001..004`, `DEC-ROOM-001..003`, `DEC-ROOM-010`, `INV-ROOM-001..002`                                                                                     | `FR-ADM-ROOM-001..004`, `FR-ADM-ROOM-101..105`; `FR-PUB-ROOM-001`, `FR-PUB-ROOM-101`; `FR-POW-ROOM-101..102`                               | Room write/read APIs, building/category model, reconciliation constraints                                                    | `KMO-W02`, `KMO-W07`, `KMO-W10`                       | `QA-ROOM-001`, `QA-MIGRATION-001..003`                                            | APPROVED |
| Category-level commercial and publication authority        | `POL-BILLING-001..003`, `POL-CONTENT-001..004`, `DEC-CONTENT-001`, `INV-CONTENT-001`                                                                              | `FR-ADM-CONTENT-001..003`, `FR-ADM-CONTENT-101..103`; all `FR-PUB-CONTENT-*`                                                               | Kost-type, facility, gallery, terms, upload, and public catalog contracts                                                    | `KMO-W02`, `KMO-W03`                                  | `QA-CONTENT-001`, `QA-PUBLIC-001`                                                 | APPROVED |
| Public qualification without exact-room promise            | `DEC-PUBLIC-001..003`, `DEC-PUBLIC-010`, `INV-PUBLIC-001`                                                                                                         | `FR-PUB-PUBLIC-101..104`; `FR-PUB-LEAD-001..002`, `FR-PUB-LEAD-101..104`                                                                   | Public read model and public lead-create endpoint                                                                            | `KMO-W03`                                             | `QA-PUBLIC-001`, `QA-LEAD-001`, `QA-LEAD-010`                                     | APPROVED |
| Three lead/onboarding paths converge safely                | `DEC-LEAD-001..004`, `DEC-LEAD-010`, `INV-LEAD-001..002`                                                                                                          | `FR-ADM-LEAD-001..005`, `FR-ADM-LEAD-101..103`; all `FR-PUB-LEAD-*`                                                                        | Lead, hold, onboarding commitment, activation, idempotency, and room-lock contracts                                          | `KMO-W03`, `KMO-W05`                                  | `QA-LEAD-001`, `QA-LEAD-010`, `QA-LEASE-010..012`                                 | APPROVED |
| Resident identity and account are provisioned atomically   | `POL-RESIDENT-001..007`, `DEC-RESIDENT-001..005`, `DEC-RESIDENT-010`, `INV-RESIDENT-001..002`                                                                     | `FR-ADM-RESIDENT-001..005`, `FR-ADM-RESIDENT-101..105`; `FR-PEN-RESIDENT-001`, `FR-PEN-RESIDENT-101..103`; `FR-POW-RESIDENT-101..102`      | Resident/account schema, provisioning command, credential handoff, resident context                                          | `KMO-W04`, `KMO-W05`, `KMO-W11`                       | `QA-RESIDENT-001..002`, `QA-AUTH-001`, `QA-PENGHUNI-001`, `QA-MIGRATION-001..003` | APPROVED |
| Lease is the canonical occupancy authority                 | `POL-LEASE-001..004`, `DEC-LEASE-001..004`, `DEC-LEASE-011`, `INV-LEASE-001..002`                                                                                 | `FR-ADM-LEASE-001..002`, `FR-ADM-LEASE-101..103`; `FR-PEN-LEASE-001`, `FR-PEN-LEASE-101`; `FR-POW-LEASE-101`                               | Lease, occupancy, activation, renewal, transfer, and checkout commands                                                       | `KMO-W05`, `KMO-W07`, `KMO-W11`                       | `QA-LEASE-001..002`, `QA-LEASE-010..012`                                          | APPROVED |
| Billing, DP, deposit, and payment ledgers remain distinct  | `POL-PAYMENT-001..008`, `DEC-BILLING-001..002`, `DEC-BILLING-010`, `DEC-PAYMENT-001..004`, `DEC-PAYMENT-010..012`, `INV-BILLING-001..002`, `INV-PAYMENT-001..003` | all `FR-ADM-BILLING-*`, all `FR-ADM-PAYMENT-*`; all `FR-PEN-BILLING-*`, all `FR-PEN-PAYMENT-*`; `FR-POW-BILLING-101`, `FR-POW-PAYMENT-101` | Invoice schedule, allocation ledger, deposit liability, proof, receipt, reversal, and cache contracts                        | `KMO-W05`, `KMO-W06`, `KMO-W07`, `KMO-W11`            | `QA-BILLING-001..004`, `QA-PAYMENT-001..006`, `QA-LEASE-010..012`                 | APPROVED |
| Reminders and internal notifications are separate          | `DEC-REMINDER-001..004`, `DEC-REMINDER-010..011`, `DEC-NOTIFICATION-001`, `DEC-NOTIFICATION-010`, `INV-REMINDER-001..002`, `INV-NOTIFICATION-001`                 | all `FR-ADM-REMINDER-*`, all `FR-ADM-NOTIFICATION-*`; all `FR-PEN-REMINDER-*`, all `FR-PEN-NOTIFICATION-*`; `FR-POW-NOTIFICATION-101`      | Template, composer, queue, history, secure link, notification source, and badge contracts                                    | `KMO-W08`, `KMO-W11`                                  | `QA-REMINDER-001..005`, `QA-NOTIFICATION-001`                                     | APPROVED |
| Vehicle and parking records follow resident/room lifecycle | `POL-VEHICLE-001`, `DEC-VEHICLE-001`, `INV-VEHICLE-001`                                                                                                           | `FR-ADM-VEHICLE-001..002`, `FR-ADM-VEHICLE-101..103`; `FR-PEN-VEHICLE-001`, `FR-PEN-VEHICLE-101..102`; `FR-POW-VEHICLE-101`                | Vehicle query/command family and resident/room references                                                                    | `KMO-W09`, `KMO-W11`                                  | `QA-VEHICLE-001`                                                                  | APPROVED |
| Complaints and maintenance are operationally actionable    | `POL-COMPLAINT-001..003`, `DEC-COMPLAINT-001`, `INV-COMPLAINT-001`                                                                                                | `FR-ADM-COMPLAINT-001..002`, `FR-ADM-COMPLAINT-101..103`; `FR-PEN-COMPLAINT-001`, `FR-PEN-COMPLAINT-101..102`; `FR-POW-COMPLAINT-101..102` | Complaint, technician, work-order, SLA, and history contracts                                                                | `KMO-W09`, `KMO-W11`                                  | `QA-COMPLAINT-001`                                                                | APPROVED |
| Expenses are auditable and feed finance reporting          | `POL-EXPENSE-001..002`, `DEC-EXPENSE-001`, `INV-EXPENSE-001`                                                                                                      | `FR-ADM-EXPENSE-001..002`, `FR-ADM-EXPENSE-101..102`; `FR-POW-EXPENSE-101`                                                                 | Expense schema, proof mediation, approval, archive/reversal, and report projection                                           | `KMO-W09`, `KMO-W10`                                  | `QA-EXPENSE-001..003`                                                             | APPROVED |
| Reports reconcile to ledgers and exports                   | `POL-REPORT-001..002`, `DEC-REPORT-001..003`, `DEC-REPORT-010`, `INV-REPORT-001`                                                                                  | `FR-ADM-REPORT-001..003`, `FR-ADM-REPORT-101..106`; `FR-POW-REPORT-101..106`                                                               | Lease, payment, expense, finance report read models; PDF/Excel adapters                                                      | `KMO-W10`                                             | `QA-REPORT-001..005`                                                              | APPROVED |
| Building investor receives read-only scoped evidence       | `DEC-OWNER-001..004`, `DEC-OWNER-010`, `INV-OWNER-001`                                                                                                            | `FR-ADM-OWNER-101`; `FR-POW-OWNER-001..003`, `FR-POW-OWNER-101..105`; all supporting `FR-POW-*`                                            | Building-ownership history, role scope, read-only API projections, export watermarking                                       | `KMO-W10`                                             | `QA-OWNER-001`, `QA-PROPERTY-001`, `QA-REPORT-001..005`                           | APPROVED |
| Penghuni app is an authenticated self-service surface      | `DEC-AUTH-001`, `DEC-RESIDENT-005`, `INV-AUTH-001..002`, `INV-RESIDENT-001..002`                                                                                  | all `FR-PEN-*`                                                                                                                             | Shared identity authority with Penghuni-specific serializers, cache isolation, and route guards                              | `KMO-W04`, `KMO-W06`, `KMO-W08`, `KMO-W09`, `KMO-W11` | `QA-PENGHUNI-001`, relevant domain QA, `QA-OPS-005..007`                          | APPROVED |
| Integrations stay gated until evidence exists              | `DEC-INTEGRATION-001`, `INV-INTEGRATION-001`, `DEC-PAYMENT-001`, `DEC-REMINDER-001`                                                                               | `FR-ADM-INTEGRATION-001`, `FR-ADM-INTEGRATION-101`; `FR-PEN-INTEGRATION-101`                                                               | Adapter boundaries for manual WhatsApp, disabled email, PDF/Excel, Payment Gateway, Smart Lock, and CCTV                     | `KMO-W01`, `KMO-W08`, `KMO-W11`, deferred register    | `QA-INTEGRATION-001`, `QA-OPS-002`, `QA-OPS-007`                                  | APPROVED |

## 3. Surface-to-Work-Package Matrix

| Surface                       | Primary requirement family                                   | Work packages                                         | Required runtime proof                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin shell and sidebar       | `FR-ADM-OPS-*`, `FR-ADM-AUTH-*`                              | `KMO-W00`, `KMO-W12`                                  | Every visible route reaches a terminal state with the intended access role; route recovery covers vehicles, complaints, reports, and facilities. |
| Admin rooms                   | `FR-ADM-ROOM-*`, `FR-ADM-CONTENT-*`                          | `KMO-W02`, `KMO-W07`                                  | Search/filter/detail/edit, fixed inventory, category authority, full-page room 360, no ordinary create.                                          |
| Admin public content          | `FR-ADM-CONTENT-*`                                           | `KMO-W02`                                             | Facility, gallery, and terms publication updates appear on `/kamar` after authorized save.                                                       |
| Public `/kamar`               | `FR-PUB-*`                                                   | `KMO-W03`                                             | No-login desktop/mobile catalog, category/gender availability, no exact room, short lead submission.                                             |
| Admin booking leads           | `FR-ADM-LEAD-*`                                              | `KMO-W03`, `KMO-W05`                                  | Public/Admin lead distinction, contact workflow, room assignment, hold, DP/deposit gate, onboarding commitment, and activation.                  |
| Admin residents               | `FR-ADM-RESIDENT-*`, `FR-ADM-LEASE-*`                        | `KMO-W04`, `KMO-W05`, `KMO-W07`                       | Table, expandable lease summary, full-page 360, direct onboarding, account provisioning, transfer, renewal, checkout.                            |
| Admin billing and payments    | `FR-ADM-BILLING-*`, `FR-ADM-PAYMENT-*`                       | `KMO-W05`, `KMO-W06`                                  | Invoice schedule, multi-invoice allocation, proof review, receipt, safe reversal, no gateway dependency.                                         |
| Admin reminders/notifications | `FR-ADM-REMINDER-*`, `FR-ADM-NOTIFICATION-*`                 | `KMO-W08`                                             | Current-month and resident composers, one H-60/H-30/H-14 workspace, manual WhatsApp, history, live badge clearing.                               |
| Admin operations              | `FR-ADM-VEHICLE-*`, `FR-ADM-COMPLAINT-*`, `FR-ADM-EXPENSE-*` | `KMO-W09`                                             | Vehicle, complaint/work order, and expense lifecycles with linked detail routes and safe correction.                                             |
| Admin reports                 | `FR-ADM-REPORT-*`                                            | `KMO-W10`                                             | Date filters, authoritative totals, preview, PDF, Excel, reconciled lease/payment/expense/finance outputs.                                       |
| Property Owner                | all `FR-POW-*`                                               | `KMO-W10`                                             | Building-only read projections and exports; all write attempts are rejected.                                                                     |
| Penghuni                      | all `FR-PEN-*`                                               | `KMO-W04`, `KMO-W06`, `KMO-W08`, `KMO-W09`, `KMO-W11` | Account activation, room/lease, billing, manual proof, complaint, vehicle, notification, profile, privacy.                                       |
| Integrated program            | all families                                                 | `KMO-W12`                                             | Cross-surface workflow, reconciliation, responsive/a11y, migration, network, and evidence bundle gates.                                          |

## 4. Canonical Journey Traceability

### 4.1 Public lead to active resident

| Stage                              | Authority                                                        | Command/read model                                     | Work package          | Gate                             |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | --------------------- | -------------------------------- |
| Browse public category             | `FR-PUB-PUBLIC-101..104`, `FR-PUB-CONTENT-101..103`              | Public catalog read                                    | `KMO-W03A`            | `QA-PUBLIC-001`                  |
| Submit short interest              | `FR-PUB-LEAD-001..002`, `FR-PUB-LEAD-101..104`                   | Public booking lead create                             | `KMO-W03B`            | `QA-LEAD-001`                    |
| Admin qualifies and contacts       | `FR-ADM-LEAD-001..005`, `FR-ADM-LEAD-101..103`                   | Lead queue/detail/status/contact log                   | `KMO-W03C`            | `QA-LEAD-010`                    |
| Admin selects exact room           | `INV-LEAD-001..002`, `INV-ROOM-001..002`                         | Authoritative vacancy and gender-scoped room selection | `KMO-W05B`            | `QA-LEASE-010`                   |
| Hold room                          | hold lifecycle authority retained from M14 and reconciled to KMO | Hold create/release/expiry                             | `KMO-W05B`            | `QA-LEASE-010`, `QA-OPS-004`     |
| Record agreement, DP, and deposit  | `POL-PAYMENT-001..003`, `INV-PAYMENT-001..003`                   | Manual payment and allocation commands                 | `KMO-W05C`, `KMO-W06` | `QA-PAYMENT-001..006`            |
| Complete resident data and account | `POL-RESIDENT-001..007`, `INV-RESIDENT-001..002`                 | Resident/account provisioning command                  | `KMO-W04`, `KMO-W05D` | `QA-RESIDENT-001..002`           |
| Activate lease and occupancy       | `INV-LEASE-001..002`, `INV-ROOM-001..002`                        | Canonical lease-activation command                     | `KMO-W05D`            | `QA-LEASE-001`, `QA-LEASE-012`   |
| Access Penghuni                    | all `FR-PEN-AUTH-*`, `FR-PEN-RESIDENT-*`                         | Login, forced password change, resident context        | `KMO-W04B`, `KMO-W11` | `QA-AUTH-001`, `QA-PENGHUNI-001` |

### 4.2 Admin quick lead to active resident

The journey uses the same stages and gates as 4.1 after lead creation. The only
different entry authority is `FR-ADM-LEAD-001` and the selected room may already
be attached to the Admin-created lead. Attachment does not bypass availability,
gender, hold, DP, deposit, resident, or lease activation checks.

### 4.3 Direct Admin onboarding

| Stage                                              | Authority                                                    | Work package           | Gate                              |
| -------------------------------------------------- | ------------------------------------------------------------ | ---------------------- | --------------------------------- |
| Open full-page `Tambah Penyewaan` from `/tenants`  | `FR-ADM-RESIDENT-003`, `FR-ADM-RESIDENT-103`                 | `KMO-W05A`             | `QA-RESIDENT-001`                 |
| Enter resident and lease plan                      | `POL-RESIDENT-*`, `POL-LEASE-*`                              | `KMO-W04A`, `KMO-W05A` | `QA-RESIDENT-001`, `QA-LEASE-001` |
| Select one gender-compatible vacant room           | `INV-ROOM-001..002`, `INV-LEASE-001`                         | `KMO-W05A`             | `QA-ROOM-001`, `QA-LEASE-010`     |
| Record DP/deposit/payment evidence                 | `POL-PAYMENT-001..008`                                       | `KMO-W05C`, `KMO-W06`  | `QA-PAYMENT-001..006`             |
| Commit account, then separately activate occupancy | `DEC-RESIDENT-005`, `INV-RESIDENT-001`, `INV-LEASE-001..002` | `KMO-W04B`, `KMO-W05D` | `QA-AUTH-001`, `QA-LEASE-012`     |

### 4.4 Room transfer

| Stage                                               | Authority                                    | Work package           | Gate                                             |
| --------------------------------------------------- | -------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Start from resident detail                          | `FR-ADM-RESIDENT-005`, `FR-ADM-RESIDENT-105` | `KMO-W07B`             | `QA-LEASE-002`                                   |
| Capture reason and effective date                   | `DEC-LEASE-011`, `POL-LEASE-004`             | `KMO-W07B`             | `QA-LEASE-002`                                   |
| Select eligible room                                | `INV-ROOM-001..002`, `INV-LEASE-001`         | `KMO-W07B`             | `QA-ROOM-001`                                    |
| Lock old/new room and active lease                  | transaction/lock authority                   | `KMO-W07B`             | `QA-OPS-004`, `QA-LEASE-002`                     |
| Preserve history and reconcile dependent references | `INV-RESIDENT-002`, `INV-LEASE-002`          | `KMO-W07A`, `KMO-W07B` | `QA-LEASE-002`, relevant vehicle/complaint gates |

### 4.5 Payment and reminder

| Stage                                              | Authority                                       | Work package           | Gate                                     |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------- | ---------------------------------------- |
| Generate invoices from lease schedule              | `INV-BILLING-001..002`                          | `KMO-W06A`             | `QA-BILLING-001..004`                    |
| Select one or more unpaid invoices                 | `INV-PAYMENT-001..003`                          | `KMO-W06B`             | `QA-PAYMENT-001..006`                    |
| Record transfer or cash exception                  | `POL-PAYMENT-003`, `DEC-PAYMENT-002`            | `KMO-W06B`             | `QA-PAYMENT-001..006`                    |
| Verify/reject/reverse without hard delete          | `DEC-OPS-010`, `INV-PAYMENT-003`                | `KMO-W06B`             | `QA-PAYMENT-003..006`                    |
| Compose a scoped reminder                          | `INV-REMINDER-001..002`                         | `KMO-W08A`, `KMO-W08B` | `QA-REMINDER-001..005`                   |
| Open WhatsApp manually and record outcome          | `DEC-REMINDER-001`, `DEC-REMINDER-010`          | `KMO-W08A`, `KMO-W08C` | `QA-REMINDER-003..005`                   |
| Clear stale work item after payment/reconciliation | `INV-NOTIFICATION-001`, `INV-REMINDER-001..002` | `KMO-W08B`, `KMO-W08D` | `QA-NOTIFICATION-001`, `QA-REMINDER-004` |

## 5. Non-Functional Traceability

| Requirement         | Applies to                                         | Required proof                                                                                                          |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NFR-A11Y-001..004` | Admin, public, Penghuni, Property Owner            | Keyboard path, semantic labels, focus visibility, announcements, minimum targets, responsive table/detail alternatives. |
| `NFR-PERF-001..003` | Lists, 360 details, reports, public catalog        | Bounded pagination, no N+1, stable query keys, loading budget, export isolation.                                        |
| `NFR-PRIV-001..004` | PII, KTP, payment proof, investor views, reminders | Serializer whitelist, mediated files, safe audit snapshots, no secrets/PII in URL/cache/log/toast.                      |
| `NFR-REL-001..005`  | All commands and caches                            | Idempotency, transaction rollback, stale-scope isolation, reconciliation, retry/error terminal states.                  |
| `NFR-OBS-001..003`  | Commands, workers, exports, integrations           | Correlation, structured domain events, sanitized failure evidence, measurable queue/outbox health.                      |

## 6. Migration and Cutover Traceability

| Migration concern                                      | Authority                                     | Work packages        | Required evidence                                                                              |
| ------------------------------------------------------ | --------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Preserve fixed 163-room inventory                      | `POL-ROOM-001`, `INV-ROOM-001..002`           | `KMO-W01`, `KMO-W02` | Pre/post room, building, category, gender, occupancy, lease, and ownership reconciliation.     |
| Introduce category content authority                   | `POL-CONTENT-001..004`                        | `KMO-W02`            | Exactly two category records per property where applicable; no invented facility difference.   |
| Separate account/resident/lease identity               | `INV-RESIDENT-001..002`, `INV-LEASE-001..002` | `KMO-W04`, `KMO-W05` | No ambiguous resident context; no orphan account, resident, lease, occupancy, or room linkage. |
| Separate DP, deposit, invoice, payment, and allocation | `INV-BILLING-*`, `INV-PAYMENT-*`              | `KMO-W05`, `KMO-W06` | Ledger reconciliation and liability checks; legacy payment evidence remains traceable.         |
| Add investor building ownership history                | `INV-OWNER-001`, `INV-PROPERTY-001`           | `KMO-W10B`           | No overlap for an active building-owner interval; default Kostation ownership is explicit.     |
| Preserve audit/history on correction                   | `INV-OPS-001..002`, `DEC-OPS-010`             | all write packages   | Reversal/archive records reference superseded records; no destructive backfill.                |

Every database-changing package must satisfy `QA-MIGRATION-001`,
`QA-MIGRATION-002`, and `QA-MIGRATION-003`. A targeted migration may be used
only under the procedure documented in
[EXECUTOR_REVIEWER_RUNBOOK.md](EXECUTOR_REVIEWER_RUNBOOK.md); the replay-all
runner must not be assumed safe.

Architecture reconciliation:

| Authority                                | Architecture source                                                                                              | Implementation truth                                                                     | Invariant coverage                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Migration ledger and compatibility       | [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md), [DATA_MODEL_AND_MIGRATION.md](DATA_MODEL_AND_MIGRATION.md) | [SCHEMA_IMPLEMENTATION_LEDGER.md](SCHEMA_IMPLEMENTATION_LEDGER.md) W01 and migration 021 | `INV-PROPERTY-001`, `NFR-REL-001..004`, `NFR-OBS-001`         |
| Fixed room inventory and category source | Inventory lifecycle ERD and detailed room/category model                                                         | Schema ledger W02A–W02B                                                                  | `INV-ROOM-001..002`, `INV-BILLING-001`                        |
| Category content/publication             | Content/operations ERD and publication model                                                                     | Schema ledger W02C-D                                                                     | `INV-CONTENT-001`, `NFR-PRIV-001`                             |
| Domain source/non-authority boundaries   | [DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md)                                                             | Status per concept links back to the schema ledger                                       | All listed `INV-*`; no new invariant is created by the matrix |

Migration 021–023 source and manifest evidence does not establish canonical
database application. W03–W12 remain planned.

## 7. Current Evidence Boundary

| Evidence source                           | Permitted use                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| M9–M19 repository evidence                | Baseline and regression input only. It does not prove KMO behavior that did not exist at M19.                            |
| M9–M19 operator-reported runtime evidence | Historical context only; do not relabel as independent KMO runtime evidence.                                             |
| Owner master-data document                | Business policy authority after normalization in `OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`.                               |
| User screenshots and narrative            | Accepted behavioral intent only where recorded in `REFERENCE_ADAPTATION_LOG.md`; never an API/schema authority.          |
| `PRODUCT.md` and `DESIGN.md`              | Product boundary and incumbent design authority; KMO adds domain planning but does not silently supersede visual tokens. |
| KMO automated tests created later         | Implementation evidence only after final-delta review and aggregate gates pass.                                          |
| Authorized KMO runtime smoke              | Runtime evidence only for the exact environment, dataset, route, and mutation budget observed.                           |

## 8. Change Impact Rules

Before changing a requirement, the leader must:

1. identify the canonical `POL`, `DEC`, `INV`, or `FR` ID;
2. list every traceability row and work package affected;
3. update the authority document first;
4. update technical/API/data/experience contracts in the same documentation
   change when their meaning changes;
5. update QA and migration gates before implementation;
6. record a supersession rather than silently rewriting a historical conflict;
7. ask the user only when the proposal conflicts with owner policy or creates a
   materially different product direction.

Implementation agents must not:

- create new policy in code;
- treat a screenshot label as canonical vocabulary;
- widen a role or property scope to make a UI work;
- combine DP and security deposit;
- make public leads select an exact room;
- add ordinary room/building creation to the fixed 163-room property;
- introduce a separate primary `Penyewaan` sidebar authority;
- hard-delete financial, lease, resident-history, reminder, or expense records;
- claim provider delivery, Payment Gateway settlement, Smart Lock, or CCTV
  readiness without adapter and runtime evidence.

## 9. Completion Check

The program is complete only when:

- every row in section 2 is at least `AUTOMATED_VERIFIED`, and every required
  runtime row is `RUNTIME_VERIFIED` or explicitly `DEFERRED` with owner-approved
  evidence boundaries;
- every work package in `KMO-W00..KMO-W12` has a final evidence bundle;
- all applicable `QA-*` gates pass;
- migrations and backfills have zero unresolved mismatches;
- Admin, public, Penghuni, and Property Owner acceptance matrices pass;
- finance reports reconcile to authoritative ledgers;
- all deferred provider integrations remain visibly disabled or are promoted
  through a separate approved contract;
- documentation status is updated without overstating production readiness.

## 10. Delivery Evidence

| Work package  | Delivered boundary                                                                                                                                                                                        | Evidence                                                                                                                                                                                                 | Status                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `KMO-W00`     | Route registration/navigation inventory; canonical Vehicles tabs; safe Complaints terminal states; honest Reports unavailable state; canonical Facilities search                                          | [KMO-W00_ROUTE_MATRIX.md](evidence/KMO-W00_ROUTE_MATRIX.md), focused route/access contracts, and the aggregate read-only gate                                                                            | AUTOMATED_VERIFIED                   |
| `KMO-W01`     | Canonical target vocabulary and legacy mapping; checksum-aware live migration authority; count-only reconciliation; exact rollout parsing; atomic safe domain evidence                                    | [KMO-W01_FOUNDATION.md](evidence/KMO-W01_FOUNDATION.md), focused behavioral contracts, lifecycle regressions, and aggregate read-only gate                                                               | AUTOMATED_VERIFIED                   |
| `KMO-W02A-R1` | Fixed 163-room routine-write boundary; complete property-scoped room discovery; Add Room removal; canonical Admin table/filter wire; safe existing-room edit preserved                                    | [KMO-W02A_R1_FIXED_ROOM_DISCOVERY.md](evidence/KMO-W02A_R1_FIXED_ROOM_DISCOVERY.md), focused backend/Admin contracts, M15 regressions, and aggregate read-only gate                                      | AUTOMATED_VERIFIED                   |
| `KMO-W02A-R2` | Property-scoped full-page room detail; safe operational projection; honest registered quick links; lifecycle-safe existing-room edit; generated route registration                                        | [KMO-W02A_R2_FULL_ROOM_DETAIL.md](evidence/KMO-W02A_R2_FULL_ROOM_DETAIL.md), focused backend/Admin contracts, W00/R1 and M10–M16 regressions, and aggregate read-only gate                               | AUTOMATED_VERIFIED                   |
| `KMO-W02B`    | Category Kost Type is the sole effective-dated commercial authority for tariff, read-only 25% DP policy, deposit, payment schedules, and facility reads; room and lease consumers use its current version | [KMO-W02B_CATEGORY_COMMERCIAL.md](evidence/KMO-W02B_CATEGORY_COMMERCIAL.md), disposable first-apply/replay proof, focused backend/Admin contracts, and relevant W02A/M10/M13–M15 regressions             | AUTOMATED_VERIFIED; RUNTIME_DEFERRED |
| `KMO-W02C-D`  | Category facilities and gallery; public derivatives; internal policy separation; structured public-safe terms; draft, publish, effective-date, version, restore, and reconciliation authority             | [KMO-W02C_D_CATEGORY_CONTENT_PUBLICATION.md](evidence/KMO-W02C_D_CATEGORY_CONTENT_PUBLICATION.md), focused backend/Admin contracts, W01/W02A/M10/M13–M15 regressions, and aggregate gate                 | AUTOMATED_VERIFIED; RUNTIME_DEFERRED |
| `KMO-ARCH-01` | Visual database architecture, living schema status, explicit source/non-authority matrix, and Fast Critical Delivery process gate                                                                         | [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md), [SCHEMA_IMPLEMENTATION_LEDGER.md](SCHEMA_IMPLEMENTATION_LEDGER.md), [DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md), documentation validation | AUTOMATED_VERIFIED                   |

Aggregate status: `KMO-W02 — AUTOMATED VERIFIED; RUNTIME DEFERRED`.

These delivery rows do not advance any unlisted KMO work package or the
program-level outcomes in section 2. Authenticated desktop/mobile runtime evidence
for W00 is explicitly deferred when no process-only QA credential is available;
W01 disposable concurrent-runner runtime evidence is also deferred while its
automated advisory-lock serialization contract remains verified. W02B runtime
and canonical migration execution remain deferred. W02C-D runtime and canonical
migration 023 execution are also deferred. KMO-ARCH-01 is a documentation gate,
not runtime or product evidence; W03 remains pending.
