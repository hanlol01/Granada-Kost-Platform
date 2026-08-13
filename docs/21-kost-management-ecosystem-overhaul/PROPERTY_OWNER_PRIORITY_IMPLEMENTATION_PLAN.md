# Property Owner Priority Implementation Plan

Status: `IN_PROGRESS`

Implementation truth as of 2026-08-12 (Asia/Jakarta):

- `W10-OWNER-A` is `SOURCE_IMPLEMENTED`; migration 035 is committed but no
  canonical database application or runtime verification is claimed. Source
  commit: `3b6dd0020530fe8cc883136dd4b65a97399403f8`.
- `W10-OWNER-B` is `SOURCE_IMPLEMENTED`; the Admin Owner Property workspace is
  committed, with focused contract/build evidence but no browser/runtime claim.
  Source commit: `c5649f0`.
- `W10-OWNER-C` is `SOURCE_IMPLEMENTED`; automated review is pending and
  runtime remains deferred. `W10-OWNER-D` remains `PLANNED`.

This plan does not promote deferred canonical migration, reconciliation, or
runtime evidence merely because source has been committed.

## 1. Objective

Build a secure mixed-asset ownership authority and a read-only Property Owner
experience without weakening Kostation's operational authority.

```text
Admin records owner and ownership
  -> effective assignment scopes assets
  -> occupancy earns rent over time
  -> monthly settlement attributes owner share and management fee
  -> Admin approves
  -> payout is recorded
  -> Property Owner reads safe period-bound results
```

## 2. Locked Business Rules

### Ownership model

- Rumah Kost ownership is assigned to a whole building/unit. Every current and
  future room in that building follows the building assignment.
- Apart Kost ownership is assigned to individual rooms selected by Admin.
- One owner may hold multiple Rumah Kost buildings and multiple Apart Kost rooms.
- An asset has at most one owner in an overlapping effective period.
- Assignments may start now or in the future and use half-open effective periods.
- Transfer/release closes the previous period; history is never overwritten.
- Unassigned assets are displayed as `Kostation-owned`.
- Legacy property-wide owner rows are transitional and are never automatically
  promoted to mixed-asset assignments.

### Account and access model

- Use the dedicated `property_owner` role. Never reuse the operational `owner`
  role.
- One Owner Profile maps to one login account.
- Login accepts normalized email or phone.
- Admin chooses the initial password; it is shown only in the creation receipt.
  Later screens offer reset, never password recovery/display.
- No forced password change is required for Property Owner accounts.
- Property Owner APIs derive scope from the authenticated account. Browser-sent
  owner IDs are never authorization authority.
- Owner access is read-only. Empty ownership scope returns an empty state, not a
  property-wide fallback.

### Economic model

- Current standard gross tariff: Rp1.800.000 per occupied room per earned month.
- Current owner entitlement: Rp1.500.000 per occupied room per earned month.
- Current Kostation management fee: Rp300.000 per occupied room per earned month.
- Recognition is collected-and-earned: verified collection and elapsed service
  coverage are both required.
- Booking Fee and DP are advance rent credits. Upfront collection is not fully
  payable to an owner on receipt.
- Partial verified rent is attributed proportionally at the current 5:1 split,
  bounded by the monthly owner and fee caps.
- Security deposit is excluded. Vacancy creates no entitlement or fee.
- A payment reversal, refund, transfer, or policy correction creates an append-only
  adjustment. Historical rows are not rewritten.
- Fee policy is effective-dated and snapshotted, so future prices or commercial
  agreements do not mutate prior settlements.

## 3. Delivery Slices

### W10-OWNER-A — Schema, authority, RBAC, and API foundation

Deliver:

- `property_owner_profiles` and one-to-one account relation;
- `building_owner_assignments` for Rumah Kost only;
- `room_owner_assignments` for Apart Kost only;
- non-overlapping effective periods and deterministic transfer locks;
- effective-dated owner commercial policy snapshots;
- owner settlement, adjustment, approval, and payout authority;
- `property_owner` role and read-only permissions;
- Admin mutation APIs and owner-safe read projections;
- migration manifest and disposable PostgreSQL proof.

Exit criteria:

- cross-category and overlapping assignments fail closed;
- empty owner scope returns zero rows;
- owner mutations and PII reads are denied;
- payment, earned rent, entitlement, settlement, and payout remain distinct;
- first apply, immediate replay, constraints, and rollback pass.

### W10-OWNER-B — Admin Master Data Owner Property

Deliver:

- Owner Property list, search, filters, pagination, and detail page;
- create/edit/archive/reset-password workflows;
- one-time credential receipt and WhatsApp handoff;
- Rumah Kost building assignment wizard;
- Apart Kost multi-room assignment wizard;
- immediate/scheduled release and transfer;
- active, scheduled, expired, and Kostation-owned asset views;
- ownership history and restricted legal-evidence metadata;
- account and assignment audit trail.

Exit criteria:

- Rumah Kost assignment includes exactly every room in its building;
- Apart assignment includes exactly selected rooms;
- archive is blocked while active/future assignments exist;
- transfer closes old intervals instead of rewriting them;
- credentials are never exposed after initial issuance.

### W10-OWNER-C — Read-only portal and financial reporting

Deliver:

- dedicated Property Owner shell and allowlisted navigation;
- owned-asset dashboard, rooms, safe resident/lease summaries, complaints,
  maintenance, notifications, and reports;
- occupancy, earned-rent, entitlement, management-fee, adjustment, settlement,
  and payout summaries;
- settlement lifecycle `draft -> ready_for_review -> approved -> paid`;
- period-bound preview/export with safe watermarking;
- clear empty state for owners without assets.

W10-OWNER-A3 authority amendment:

- migration `037_property_owner_service_coverage_authority.sql` requires an
  exact half-open service interval on every new earning;
- transfer-month revenue is partitioned between adjacent Owner intervals and
  reconciles exactly to the verified rent payment; a month-start shortcut is
  forbidden;
- settlement lines, adjustments, payouts, previews, exports, and Owner finance
  notifications use the same coverage-bearing earning lineage;
- historical immutable earnings remain readable evidence but cannot be silently
  backfilled or used for new coverage-required settlement approval/payout.

Exit criteria:

- every list, total, chart, detail, and export reconciles to the same scope and
  ownership period;
- each post-A3 finance row reconciles to an exact service interval and a verified
  payment without cross-Owner overlap or gap;
- former owners cannot see current operational state;
- new owners cannot see pre-period financial history;
- raw payment proof, NIK, KTP, address, emergency contacts, credentials, storage
  paths, and raw audit data never appear.

### W10-OWNER-D — Reconciliation, security review, and runtime QA

Deliver:

- legacy-data classification and manual reconciliation queue;
- historical attribution and transfer-boundary reconciliation;
- payment/reversal/settlement/payout balance proof;
- authorization mutation tests and sensitive-field scans;
- Admin and Property Owner browser flows;
- operational runbook, rollback plan, and release evidence.

Exit criteria:

- no property-wide fallback or legacy owner-role inheritance exists;
- ownership, financial, and export totals reconcile;
- runtime and migration status are recorded using the approved vocabulary;
- canonical migration remains deferred until an explicit deployment instruction.

## 4. Transaction Boundaries

Admin ownership mutations execute in one property-scoped transaction:

1. authorize global/property administration;
2. lock the owner profile and affected assets in deterministic order;
3. validate category and effective period;
4. close/insert assignment intervals;
5. write sanitized audit and outbox rows;
6. complete idempotency with the same transaction client.

Settlement approval/payout similarly locks the settlement, validates all
underlying earned-rent rows and adjustments, records approval or payout, and
writes audit/outbox atomically.

## 5. Deferred Scope

- legal title registration or government land-registry integration;
- tax/withholding automation;
- profit sharing beyond the effective-dated owner entitlement policy;
- owner-initiated mutations;
- automatic maintenance-expense offsets;
- valuation, sale, mortgage, and investor marketplace functions.

## 6. Required Reading for Implementation Agents

Before changing source, read:

1. [CONTEXT.md](CONTEXT.md)
2. [OWNER_POLICY_DECISIONS_AND_GLOSSARY.md](OWNER_POLICY_DECISIONS_AND_GLOSSARY.md)
3. [PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md](PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md)
4. [DATA_AUTHORITY_MATRIX.md](DATA_AUTHORITY_MATRIX.md)
5. [DATA_MODEL_AND_MIGRATION.md](DATA_MODEL_AND_MIGRATION.md)
6. [API_AND_INTEGRATION_CONTRACT.md](API_AND_INTEGRATION_CONTRACT.md)
7. [BILLING_REMINDER_NOTIFICATION_REPORTING.md](BILLING_REMINDER_NOTIFICATION_REPORTING.md)

No implementation may weaken these boundaries to preserve a legacy shortcut.
