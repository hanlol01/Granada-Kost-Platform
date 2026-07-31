# KMO Data Model and Migration Contract

Status: **APPROVED TARGET ARCHITECTURE — IMPLEMENTATION PARTIAL**

Program code: `KMO`

Recorded: 2026-07-30 (Asia/Jakarta)

## 1. Purpose

This document defines the target PostgreSQL model, integrity constraints,
indexes, migration sequence, compatibility rules, and reconciliation gates for
the KOSTATION ecosystem overhaul.

Implementation truth is tracked in
[SCHEMA_IMPLEMENTATION_LEDGER.md](SCHEMA_IMPLEMENTATION_LEDGER.md), not inferred
from this target contract. See
[DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md) for the visual model and
[DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md) for source-of-truth and
explicit non-authority decisions.

It does not authorize a migration, seed, provider activation, or production
write. Every migration package must first pass the preflight, shadow-database,
backfill, and rollback gates in this document.

## 2. Current Persistence Baseline

The current NestJS modular monolith uses PostgreSQL as the system of record and
already contains:

- IAM/RBAC, property roles, sessions, and property-level owner assignments;
- properties, settings, room buildings, 163 linked rooms, kost types,
  category-level facilities and rules;
- residents, occupancies, check-in/out history, leases, room transfers, deposit
  ledger entries, and refund settlements;
- booking leads and 24-hour room holds;
- billing periods, invoices, invoice lines, payments, allocations, payment
  proofs, and payment accounts;
- files with mediated storage metadata;
- complaints, maintenance work orders, vehicles, parking, notifications,
  delivery records, audit logs, idempotency commands, and business-event outbox;
- public gallery records and category-level catalog data.

Known structural gaps that this plan closes:

- migration 021 and the checksum-aware runner are source-implemented and
  automated-verified, while canonical development application remains
  unproven;
- investor ownership is property-scoped, while the target is building-scoped;
- resident onboarding does not atomically provision and link a login account;
- resident identity, education, parent contact, and lease-facing profile fields
  are incomplete;
- current lease statuses and billing cycles do not express draft activation,
  twelve-month terms, or two-month installments;
- DP and security deposit are not represented as two explicit obligations;
- payment reversal, receipt, manual other-charge, expense, reminder-template,
  reminder-history, and report-export evidence need canonical models;
- gallery records still permit common-area subtargets that the new category-only
  catalog does not expose.

## 3. Cross-Domain Persistence Invariants

| ID                     | Invariant                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `INV-PROPERTY-001`     | A record from one property/building scope cannot be read, counted, cached, exported, mutated, or linked through another scope.                |
| `INV-OWNER-001`        | Property Owner reads intersect only active building assignments at the record's effective time.                                               |
| `INV-ROOM-001`         | Room status changes only through hold, lease/occupancy, transfer, checkout/inspection, maintenance, deactivation, or reconciliation commands. |
| `INV-ROOM-002`         | At most one active occupancy, hold/reservation authority, and lease-room authority may claim the same room incompatibly.                      |
| `INV-RESIDENT-001`     | One person has one canonical resident identity per property context; duplicate email, phone, or NIK conflicts fail closed.                    |
| `INV-LEASE-001`        | Final activation uses committed account authority and is atomic across resident, lease, room, occupancy, billing, lead/hold, audit, outbox.   |
| `INV-LEASE-002`        | Exactly one active occupancy corresponds to an active lease and its current room, except explicit legacy reconciliation cases.                |
| `INV-BILLING-001`      | Invoice totals derive from an immutable lease commercial snapshot; category price edits never rewrite history.                                |
| `INV-PAYMENT-001`      | Payment amount reconciles to explicit allocations; no allocation can exceed current invoice outstanding.                                      |
| `INV-PAYMENT-002`      | DP allocations reduce rent receivable; security-deposit funding/refund never settles rent or counts as rent revenue.                          |
| `INV-PAYMENT-003`      | Verified financial records are append-only; correction uses rejection, reversal, or compensating entries rather than deletion.                |
| `INV-REMINDER-001`     | Reminder eligibility is derived from current lease/invoice truth; stale persisted counters are prohibited.                                    |
| `INV-NOTIFICATION-001` | Reading or dismissing an in-app notification never mutates the source invoice, lease, complaint, work order, or reminder.                     |
| `INV-EXPENSE-001`      | Expense approval, payment, reversal, and evidence form an auditable chain; reversal offsets rather than erases the original.                  |
| `INV-REPORT-001`       | On-screen, preview, PDF, and Excel results share one server query authority, filter snapshot, record set, and totals.                         |
| `NFR-PRIV-001`         | Credentials, token hashes, full NIK, KTP storage paths, and raw provider payloads must not enter audit/outbox/report snapshots.               |
| `NFR-OBS-001`          | Every successful domain command writes its audit row and outbox event in the same database transaction.                                       |

## 4. Storage Conventions

### 4.1 Identifiers, money, and time

- Primary keys remain UUID v4 generated by PostgreSQL.
- Money is stored as non-negative `BIGINT` Indonesian rupiah; floating-point
  money is prohibited.
- Percentages use bounded `NUMERIC`, never floating point.
- Business dates use `DATE`; events use `TIMESTAMPTZ` in UTC and are rendered in
  `Asia/Jakarta`.
- Human-readable codes are unique within `property_id`, but must not be used as
  foreign keys.
- Mutable tables have `created_at` and `updated_at`; append-only ledgers have
  only immutable event timestamps plus explicit settlement records.

### 4.2 Deletion and history

- Residents, users, rooms, buildings, content, templates, and expenses use
  deactivate/archive/soft-delete semantics when history exists.
- Invoices, payments, allocations, deposit ledger entries, expense payments,
  reminder dispatch evidence, ownership history, audit logs, and business events
  must not be hard-deleted.
- Foreign keys from financial and lifecycle history use `RESTRICT`; optional
  actor/file references may use `SET NULL`.
- A database trigger or service-level immutable update allowlist protects each
  append-only financial ledger. Tests must prove both update and delete denial.

## 5. Target Domain Model

The names below are canonical target names. Existing compatible tables are
extended rather than duplicated.

### 5.1 Migration authority

#### `schema_migrations` — new

| Column            | Contract                                      |
| ----------------- | --------------------------------------------- |
| `version`         | Migration filename/version, primary key.      |
| `checksum_sha256` | Exact committed SQL checksum.                 |
| `applied_at`      | Database timestamp.                           |
| `execution_ms`    | Non-negative execution duration.              |
| `applied_by`      | Sanitized operator/tool label, no credential. |

Migration 021 must introduce a checksum-aware runner. Existing
001–020 versions may be registered as a baseline only after exact schema,
constraint, index, and committed-checksum verification. They must not be replayed
to manufacture ledger history.

### 5.2 Property, building, and investor ownership

#### `properties`, `property_settings`, `room_buildings`

These remain authoritative for property, building, and operational settings.
Commercial policy is not duplicated here:

- `property_settings.minimum_lease_months` remains fixed to `12` for the first
  release;
- `property_settings.manual_payment_methods` is restricted to
  `bank_transfer|cash`;
- effective category commercial versions define the 25% minimum DP, permitted
  payment schedules, and security deposit in tariff months;
- the default security deposit is one month of the applicable tariff, not a
  hardcoded amount;
- category-level commercial truth is never an individual-room write authority.

#### `investor_profiles` — new

Stores investor administration separately from login identity:

- `id`, `property_id`, `user_id`, `display_name`, `legal_name`;
- bounded contact/address/tax-reference fields;
- `profile_status` (`active|inactive`);
- creator, archive actor, and timestamps.

Sensitive identity documents attach through the file domain and are omitted
from ordinary Property Owner responses.

#### `building_owner_assignments` — new

| Column                              | Contract                                       |
| ----------------------------------- | ---------------------------------------------- |
| `property_id`, `building_id`        | Same-property tuple.                           |
| `owner_kind`                        | Exactly `kostation` or `investor`.             |
| `investor_profile_id`               | Required for `investor`; null for `kostation`. |
| `ownership_status`                  | `active`, `ended`, or `cancelled`.             |
| `effective_from`, `effective_until` | Non-overlapping effective period.              |
| `ownership_label`                   | Human-readable ownership reference.            |
| `assigned_by_user_id`, timestamps   | Audit attribution.                             |

Constraints and indexes:

- partial unique active assignment per `building_id`;
- property/building composite FK or trigger proving aligned property;
- check constraint requiring null `investor_profile_id` for `kostation` and a
  non-null same-property investor profile for `investor`;
- `effective_until >= effective_from`;
- index `(investor_profile_id, ownership_status, effective_from DESC)`;
- index `(property_id, building_id, ownership_status)`.

`DEC-OWNER-002`: KOSTATION is the default owner authority for every building.
Migration creates one active `owner_kind = kostation` assignment for every
building and does not create a synthetic KOSTATION investor profile or infer an
investor from legacy property-level assignments. Investor allocation is an
explicit later command that atomically ends the current KOSTATION interval and
opens the investor interval.

Legacy `property_owner_assignments` remains readable during transition, but it
cannot authorize post-cutover operational queries.

### 5.3 Kost type, facilities, gallery, and terms

`kost_types` identifies exactly two active categories per applicable property:
one `rukost` and one `apartkost`. Effective-dated
`kost_type_commercial_versions` is the commercial authority. Migration 022 and
its consumers are source-implemented and automated-verified; canonical
development application remains unproven. Initial business values:

- monthly rent: Rp1,800,000;
- annual rent: Rp21,600,000;
- minimum DP: 25% of contract value;
- security deposit: one month of the applicable tariff, initially Rp1,800,000.

Room-level tariff, deposit, DP, and facility overrides are prohibited.
`kost_type_content_facilities` is the source-implemented target category
facility authority; canonical application remains deferred.
`kost_type_facility_assignments` remains a legacy compatibility source only
until migration 023 backfill and reconciliation are proven on the canonical
database.

`hunian_gallery_images` is normalized to category-level `kost_type` targets:

- one ordered image collection and one cover per active kost type;
- no public `lobby`, `dapur`, `rooftop`, `koridor`, `parkir`, or generic
  `common_area` filter;
- common-area legacy images require an explicit Rumah Kost or Apart Kost
  mapping, otherwise they are archived and reported for manual review.

`kost_type_content_versions` preserves immutable effective category facility and
gallery publications. Gallery source files remain private; public projection
uses approved derivatives.

Property-wide terms use `property_policy_documents` with exact
`document_type = public_terms`:

- separate structured `internal_content` and `public_content`;
- draft, published, and archived states with effective dates;
- one draft and one unambiguous effective version per property/type;
- immutable published versions; edits create or restore a draft.

Migration 023 and its Admin/public-safe consumers are source-implemented and
automated-verified. It has not been proven applied to the canonical development
database. The public catalog combines only effective published public-safe
content; internal policy never enters its response.

### 5.4 Accounts and resident identity

#### `users`

Add:

- `must_change_password BOOLEAN NOT NULL DEFAULT false`;
- `credential_provisioned_at`, `credential_provisioned_by_user_id`;
- normalized email and Indonesian phone uniqueness enforced case-insensitively;
- no plaintext or reversible password column.

Login continues to accept normalized email or phone. Accepted phone inputs
`08…`, `628…`, and `+628…` normalize to one `+628…` canonical value.

#### `account_provisioning_records` — new append-only evidence

Records `created|linked_existing|reset_issued|cancelled` outcomes using user,
resident, property, actor, correlation, and timestamps only. It must not contain
the temporary password or password hash.

#### `residents`

Retain current identity and file links; add:

- `university`, `faculty`, `study_program`, `cohort_year`;
- `instagram_username` nullable;
- `parent_name`, `parent_relationship` (`mother|father|guardian`);
- `parent_phone`;
- `marital_status` nullable (`single|married|other|undisclosed`);
- `family_card_file_id` and `student_card_file_id` nullable;
- `resident_status`
  (`draft|pending_activation|active|inactive|archived`);
- `archived_at`, `archived_by_user_id`, `archive_reason`;
- normalized search columns or indexes for name, phone, email, room linkage, and
  university.

The active admin table is lease-oriented and does not expose KTP images or full
NIK. Full identity is limited to authorized detail responses.

Constraints:

- gender is exactly `male|female`; `other` is rejected for new KOSTATION
  residents because room inventory is not mixed;
- NIK, when present, is exactly 16 digits and unique among non-archived
  residents within the property;
- `user_id` is set only by the account-provisioning command;
- `pending_activation` cannot own an active occupancy and becomes `active` only
  through the canonical lease-activation transaction;
- resident archive is prohibited while an active lease/occupancy exists;
- parent phone and resident phone use the same normalizer.

### 5.5 Booking leads and room holds

Extend `booking_leads` with:

- compact public intake: name, WhatsApp phone, email, gender, property,
  category, university, desired start date, optional message;
- normalized lifecycle:
  `new|contacted|negotiating|awaiting_dp|onboarding|leased|rejected|expired|cancelled`;
- nullable `resident_id`, `lease_id`, and `leased_at`, written only by final
  lease activation;
- rejection/expiry reason fields with actor attribution.

Public leads must keep `room_id = NULL`. Admin quick-entry leads may reference a
room, but room lifecycle changes only through `booking_lead_holds`.

`booking_lead_holds` remains a 24-hour authority with one active hold per room
and per lead. Conversion locks and consumes the active hold; expiry/release
restores `reserved → vacant` only when no other active authority exists.

### 5.6 Lease, occupancy, transfer, and room lifecycle

#### `leases`

Normalize target statuses:

- `draft`;
- `awaiting_activation`;
- `active`;
- `transferred`;
- `completed`;
- `cancelled`.

Add:

- nullable `booking_lead_id`;
- `term_months`, minimum `12`;
- `payment_plan_type` (`annual_full|two_month_installments`);
- `contract_rent_amount`;
- `dp_required_amount`;
- `security_deposit_required_amount`;
- `signed_at`, `activated_at`, `completed_at`;
- snapshot building/category/gender/rate/deposit/policy fields;
- `renewed_from_lease_id` and existing transfer lineage.

Only `active` leases participate in active uniqueness. A room may have one
future `awaiting_activation` lease only when it is reserved by the same
conversion authority.

#### `lease_installments` — new

Represents contractual rent schedule independently from payments:

- `annual_full` plan: one installment covering the twelve-month term;
- two-month plan: six consecutive two-month installments for a twelve-month
  term;
- `sequence_number`, coverage start/end, due date, scheduled amount;
- `invoice_id` after invoice generation;
- status derived from invoice balance, not freely edited.

Unique `(lease_id, sequence_number)` and `(lease_id, coverage_start_date)`.
Coverage periods must be contiguous, non-overlapping, and inside the lease.

#### `occupancies`

Remains physical presence authority. An `awaiting_activation` lease has no active
occupancy until its start/activation command succeeds. `active` requires the
linked active occupancy.

#### `rooms`

Target room statuses:

`vacant|reserved|occupied|inspection_required|maintenance|inactive`.

The fixed inventory is 163 rooms. New-room creation is disabled by rollout and
removed from Admin navigation; edit remains limited to approved physical
metadata.

#### `room_transfer_records`

Extend with:

- `transfer_mode` (`end_of_period|emergency_same_day`);
- requested/effective dates and approval actor;
- from-room disposition (`inspection_required|maintenance`);
- financial adjustment references.

A transfer creates a new linked lease/addendum, ends or transfers the source
lease, moves occupancy, carries or tops up security deposit through the deposit
ledger, and leaves the old room in `inspection_required` until inspection.

### 5.7 Billing, payment, and receipt model

Existing `billing_periods`, `invoices`, `invoice_line_items`, `payments`,
`payment_allocations`, `payment_proofs`, and `lease_deposit_transactions` remain
the base. Normalize as follows.

#### Invoices

- one invoice per lease installment;
- line categories:
  `rent|adjustment|damage|utility|parking|access_card|late_fee|other`;
- canonical status:
  `draft|issued|partially_paid|paid|overdue|void`;
- balance is authoritative from active verified allocations;
- issued/paid/void snapshots are immutable.

#### DP

DP has no separate deposit ledger. It is a verified rent payment allocated to
the earliest outstanding rent invoices and tagged with
`payment_purpose = 'rent_advance_dp'`. The minimum is 25% of contract rent.

#### Security deposit

Security deposit uses `lease_deposit_transactions` only and is excluded from
rent revenue. Collections/top-ups may reference a verified payment; deductions
and refunds require documented reasons.

#### `payment_receipts` — new append-only

- one immutable receipt per verified payment version;
- receipt number unique by property;
- snapshot payer, room, method, paid date, total, and allocations;
- generated file link optional and mediated;
- a reversal never edits the receipt; it creates a reversal receipt/reference.

#### `payment_reversals` — new append-only

- one active reversal per payment;
- reason, actor, reversed timestamp, original allocation snapshot;
- compensating allocation and invoice-balance effects;
- optional replacement-payment reference;
- reversal audit/outbox in the same transaction.

#### `other_charges` — new

Admin “Pembayaran Lainnya” must still be receivable-ledger based:

- property, resident/lease optional, category, description, amount, due date;
- creation generates an invoice with non-rent line type;
- payment uses the same payment/allocation/receipt/reversal model;
- direct unallocated revenue rows are prohibited.

### 5.8 Expense model

#### `expense_categories`

Property-scoped managed categories such as operations, maintenance, utilities,
salary, cleaning, supplies, tax, refund, and other.

#### `expenses`

- property and optional building/work-order scope;
- expense code, category, date, vendor, description, amount;
- payment method `cash|bank_transfer`;
- status
  `draft|pending_approval|approved|paid|rejected|cancelled|reversed|archived`;
- creator, submitter, approver, payer, reversal actor and timestamps.

#### `expense_approvals`

Append-only approval/rejection events. Binding initial authority:

- amount below Rp500,000: manager may approve;
- amount at least Rp500,000: remain `pending_approval` until the higher approver
  policy is decided in `OWNER_CONFIRMATION_REQUIRED-005` and cannot be approved
  or paid meanwhile;
- no creator may self-approve, and one expense must not be split to evade the
  Rp500,000 boundary.

#### `expense_files` and `expense_reversals`

Evidence attaches through the file domain. Reversal is compensating history;
paid expenses cannot be deleted.

Indexes support `(property_id,status,expense_date)`,
`(property_id,building_id,expense_date)`, category/date, and pending approval.

### 5.9 Reminder and notification model

#### `reminder_templates`

- property, reminder type, channel-compatible body, version, active state;
- types `invoice_due|invoice_overdue|lease_h60|lease_h30|lease_h14|custom`;
- protected variable tokens are validated at write time;
- one active version per property/type;
- published versions are immutable.

#### `reminder_messages`

Immutable rendered snapshot:

- property, resident, lease, actor, template version;
- reminder reason and rendered content;
- status
  `prepared|opened|manually_marked_sent|queued|sent|delivered|read|failed|archived`;
- initial rollout may write only
  `prepared|opened|manually_marked_sent|failed|archived`; provider states remain
  unavailable until their adapter is enabled;
- recipient snapshot is protected and excluded from ordinary list responses;
- timestamps and correlation ID.

#### `reminder_message_invoices`

Many-to-many snapshot of selected invoices, their period labels, amount due, and
secure share-link reference. This supports one current-month reminder or a
custom multi-invoice resident reminder.

#### `reminder_channel_actions`

Append-only evidence of preview, WhatsApp link opened, manually marked sent, or
disabled email attempt. It must never claim delivered/read for `wa.me`.

#### `invoice_share_links`

- opaque random token stored only as a hash;
- invoice/property scope, expiry, revoke timestamp, access count;
- default expiry seven days;
- revoked automatically when the invoice is voided or replaced;
- public download returns only the invoice document, not resident APIs.

Internal `notifications` remain separate. Reminder candidate counts are derived
from leases and invoices; they are not persisted as counters.

### 5.10 Reporting

Reports query operational ledgers directly. No manually maintained report total
table is allowed.

`report_exports` may store export evidence:

- report type, exact canonical filter JSON, format, requester, property and
  building scope, row count, checksum, file reference, generated/expired times;
- status `pending|ready|failed|expired`;
- no raw result rows or credentials.

PDF/Excel generation may start synchronously. If runtime evidence proves it
exceeds request limits, the same contract moves to an outbox-backed worker
without changing filters or result semantics.

## 6. Required Database Constraints and Indexes

The implementation migration must include mutation-sensitive tests for:

1. same-property composite relationships for resident, room, building, lease,
   invoice, payment, expense, reminder, and ownership;
2. one active lease/occupancy/hold per applicable room/resident;
3. one active building owner assignment;
4. no active resident archive;
5. gender compatibility on lease activation and room transfer;
6. twelve-month minimum and exact installment coverage;
7. `dp_required_amount >= ceil(contract_rent_amount * 25 / 100)`;
8. security-deposit amount independent from DP;
9. active allocations not exceeding payment or invoice balance;
10. immutable verified payment/receipt/deposit/expense/reminder evidence;
11. no hard delete of lifecycle/financial/history records;
12. secure-share token hash uniqueness and expiry;
13. property/building/date indexes needed by Property Owner and report queries;
14. canonical list indexes ending in deterministic `created_at,id` or
    domain-date/id order.

## 7. Migration Sequence

Each package is a separate committed migration plus focused contract. Source
implementation does not imply canonical database application.

| Migration/package                                     | Change                                                                                                        | Source truth                                     | Canonical entry gate                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `021_schema_migration_ledger.sql` / `KMO-W01`         | Checksum ledger, manifest, safe runner, and verified baseline registration for 001–020                        | Committed, manifest-verified, automated-verified | Exact canonical target, schema fingerprint, and explicit operator approval               |
| `022_kost_type_commercial_authority.sql` / `KMO-W02B` | Effective-dated category tariff, annual value, 25% DP policy, payment schedules, and one-month deposit rule   | Committed, manifest-verified, automated-verified | Exactly two active categories, disposable apply/replay proof, commercial reconciliation  |
| `023_category_content_publication.sql` / `KMO-W02C-D` | Category facilities, gallery source/derivative state, immutable publications, separated internal/public terms | Committed, manifest-verified, automated-verified | W02B prerequisite, facility/gallery/policy reconciliation, disposable apply/replay proof |
| `KMO-DB2` / `KMO-W04`                                 | Resident identity expansion and account-provisioning evidence                                                 | Planned                                          | No conflicting normalized email/phone/user links                                         |
| `KMO-DB3` / `KMO-W05–W07`                             | Lease statuses, installments, activation, inspection, and transfer additions                                  | Planned                                          | Active lease/occupancy/room invariants reconcile                                         |
| `KMO-DB4` / `KMO-W06`                                 | Billing purpose, receipts, reversals, other charges, allocation constraints                                   | Planned                                          | Invoice/payment/allocation/deposit reconciliation                                        |
| `KMO-DB5` / `KMO-W08–W10`                             | Expense, reminder history/share links, report-export and ownership evidence                                   | Planned                                          | File, actor, property, building, and financial scopes verified                           |
| `KMO-DB6` / `KMO-W12`                                 | Final query indexes, constraints, and compatibility retirement                                                | Planned                                          | Zero legacy dependency and integrated reconciliation                                     |

No package may combine a migration with unrelated UI work. The vertical slice
may include its exact API and UI consumer after disposable migration proof; the
canonical application remains a separate authorized operator action.

## 8. Backfill and Reconciliation Rules

### 8.1 General procedure

For every package:

1. capture row counts, constraints, indexes, and domain fingerprints in a
   read-only preflight;
2. clone/restore to a disposable database;
3. run migration exactly once through the checksum-aware runner;
4. execute backfill in bounded, restartable batches;
5. run reconciliation and migration contract tests;
6. rerun the runner and prove zero migration/body writes;
7. test application compatibility;
8. apply to development only after explicit approval;
9. retain before/after fingerprints and SQL checksum evidence.

### 8.2 Deterministic mappings

- Lease `active → active`, `ended → completed`, `cancelled → cancelled`,
  `transferred → transferred`.
- Existing monthly/yearly billing cycles become `legacy_monthly` or
  `legacy_yearly` compatibility plans; they are never guessed into the new
  twelve-month schedules.
- New lease commands accept only `annual_full` or
  `two_month_installments`.
- Existing lease deposit ledger entries remain security-deposit history.
- Existing invoice allocations remain rent/charge history. An ambiguous legacy
  payment must be flagged for manual classification, not recast as DP.
- Existing active category facilities become the authoritative two category
  sets after exact-set verification.
- Existing category gallery images retain order/cover. Common-area-only images
  require explicit category mapping or archive.
- Every building defaults to KOSTATION ownership; no legacy property owner is
  silently assigned to a building.
- Existing residents without users remain operational records and enter a
  provisioning queue; no password or duplicate account is auto-generated by
  migration.

### 8.3 Required zero-mismatch checks

- room/building/property/category/gender;
- active room/occupancy/lease/hold;
- resident/user/property-role;
- lease installment sum and date coverage;
- invoice total versus line items;
- invoice paid balance versus active verified allocations;
- payment amount versus active allocations;
- deposit collected/deducted/refunded balance;
- expense paid amount and approval;
- ownership date overlap;
- reminder invoice/property/resident tuple;
- report scope query versus building assignment.

Any nonzero mismatch aborts the migration or leaves the constraint `NOT VALID`
until an explicit remediation package is approved. A migration must not select a
“best” row from ambiguous candidates.

## 9. Compatibility and Cutover

- Existing `/api/v1` routes remain live until their replacement consumer has
  passed automated and runtime evidence.
- New wire behavior uses Admin UX V2 envelopes; legacy bare-array behavior is
  not silently changed.
- Additive columns are nullable or defaulted during dual-read. `NOT NULL` is
  applied only after backfill and compatibility evidence.
- Existing room price columns remain synchronized snapshots until all consumers
  read `kost_types`; they are not an independent write authority.
- Existing property-level owner routes remain available only for explicitly
  documented legacy reads. New Property Owner data must be building-scoped.
- Existing payment-gateway tables remain dormant historical artifacts. They are
  not deleted by this overhaul and are excluded from manual-payment authority.
- Existing notification-delivery provider rows remain history. No provider
  worker is enabled.
- A compatibility view may preserve historical report columns, but all new
  writes use canonical tables.
- No destructive column/table removal occurs before one full release cycle with
  zero legacy-read telemetry and an approved rollback plan.

## 10. Rollback and Recovery

- DDL migrations use explicit transactions where PostgreSQL permits.
- A failed backfill rolls back its batch and can resume by stable primary-key
  cursor.
- Rollback means application feature-flag reversal and dual-read fallback; it
  does not delete new financial/history records.
- Once a financial command writes verified history, recovery uses compensating
  domain commands rather than database repair SQL.
- The canonical database must never be cloned over, dropped, reseeded, or
  repaired by an executor without a separate approved runtime task.

## 11. Acceptance Evidence

| ID                | Required evidence                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `QA-OPS-001`      | Migration ledger rejects checksum drift and skips an already-applied migration.                            |
| `QA-PROPERTY-001` | Building ownership backfill gives 26/26 buildings KOSTATION default ownership and zero overlaps.           |
| `QA-RESIDENT-001` | Account reconciliation detects duplicate email/phone/user identity and performs no partial linking.        |
| `QA-LEASE-001`    | New twelve-month schedules produce one full invoice or six exact two-month installments.                   |
| `QA-BILLING-001`  | DP and security deposit reconcile independently; financial report excludes deposit liability from revenue. |
| `QA-PAYMENT-001`  | Multi-invoice allocation, proof, receipt, reversal, and invoice balances remain atomic.                    |
| `QA-REMINDER-001` | Selected invoice snapshots and secure links stay property/resident scoped and revoke correctly.            |
| `QA-EXPENSE-001`  | Approval threshold, evidence, payment, reversal, and cash-flow inclusion are proven.                       |
| `QA-REPORT-001`   | List, preview, PDF, and Excel derive identical row IDs and totals from one filter snapshot.                |
