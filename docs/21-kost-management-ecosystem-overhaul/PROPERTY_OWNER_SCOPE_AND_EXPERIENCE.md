# Property Owner Scope and Experience

Status: `W10-OWNER-A`, `W10-OWNER-B`, `W10-OWNER-A3`, `W10-OWNER-C`, and
`W10-OWNER-D` are automated verified. `W10-R` active-lease continuity is
source implemented and automated review pending. Controlled runtime QA and the
canonical migration gate remain deferred.

Audience: Product, Design, Admin operations, Finance, Backend, Frontend, QA, and
future agents implementing KMO-W10.

## 1. Product Definition

A Property Owner is the contractual and economic owner of assets operated by
Kostation. The application records operational ownership authority and restricted
legal-document references; it does not replace the government land registry.

| Actor            | Purpose                   | Scope                     | Mutation authority               |
| ---------------- | ------------------------- | ------------------------- | -------------------------------- |
| `owner`          | Global Kostation operator | All authorized properties | Operational writes by permission |
| `admin`          | Property operator         | Assigned property         | Operational writes by permission |
| `property_owner` | Asset owner/investor      | Effective assigned assets and safe active-lease continuity | None; read-only |

The two owner roles are never interchangeable.

## 2. Mixed Ownership Authority

### Rumah Kost

One Rumah Kost building/unit is assigned as a whole. Its assignment dynamically
covers all current and future rooms in that building. Admin cannot split rooms in
that building among different owners.

### Apart Kost

Apart Kost is assigned per individual room. An owner may receive any set of rooms
across Apart Kost buildings. Assigning one room never grants access to its sibling
rooms or building-wide data.

### Shared invariants

- one owner may own many assets across both categories;
- one asset has at most one owner in an overlapping effective period;
- assignment is effective-dated and may be immediate or scheduled;
- release/transfer closes the prior interval and appends a new interval;
- unassigned assets are displayed as `Kostation-owned`;
- owner scope is derived server-side from authenticated identity;
- no assignment means an empty portal, never a fallback to all assets.

## 3. Owner Profile and Account

An Admin-managed Owner Profile contains:

- full name;
- normalized phone and email;
- optional correspondence address;
- account status;
- masked payout destination;
- optional restricted legal-evidence references;
- active, scheduled, expired, and historical assignments;
- audit metadata.

One profile maps to at most one account. Admin sets the initial password and sees
it only in the creation receipt. Later detail views show login identity and a
Reset Password action, not the password. Property Owners are not forced to change
their password at first login.

Archive is a soft lifecycle action. It is rejected while any active or scheduled
assignment remains. Hard deletion is allowed only for a draft profile that has no
account, assignment, settlement, payout, or audit history.

## 4. Admin Master Data Owner Property

### List

The admin table shows:

- owner name and contact;
- account status;
- number of active Rumah Kost buildings;
- number of active Apart Kost rooms;
- active and scheduled assignment badges;
- latest settlement/payout status;
- actions: Detail, Edit, Manage Ownership, Reset Password, Archive.

Search includes owner name, phone, email, building label, and room number. Filters
include account status, asset category, assignment state, effective-date range,
settlement state, and Kostation-owned gaps.

### Detail

The full-page detail uses breadcrumbs and sections for:

1. profile and safe account identity;
2. active assets;
3. scheduled assignments/transfers;
4. ownership history;
5. current commercial policy snapshot;
6. monthly settlements, adjustments, approvals, and payouts;
7. restricted legal-evidence metadata;
8. audit timeline.

### Assignment wizard

Step 1 chooses Rumah Kost or Apart Kost.

- Rumah Kost: Admin selects one or more currently eligible buildings. A preview
  lists every covered room and warns that future rooms inherit ownership.
- Apart Kost: Admin searches and selects eligible individual rooms. Each row shows
  room, building, gender, occupancy, existing/scheduled owner, and effective date.

Step 2 selects effective date, optional end date, reason, and transfer behavior.
Step 3 shows conflict checks and a final impact summary. Submit remains disabled
until category, period, and overlap rules pass server validation.

Editing ownership never overwrites history. Admin schedules or executes a release
or transfer. The default transfer boundary is the next rental-coverage period;
mid-period changes require an explicit reason and financial adjustment review.

## 5. Property Owner Portal

Property Owners use the same management application with a dedicated read-only
shell. Navigation is allowlisted, not a visually hidden Admin shell.

### Allowed navigation

- Dashboard
- Aset Saya
- Hunian & Penyewaan (safe summary)
- Pembayaran & Pendapatan (safe aggregate)
- Komplain & Maintenance
- Laporan
- Notifikasi
- Profil Akun

### Never exposed

- create/edit/delete/verify/approve operational actions;
- NIK, KTP, private address, emergency contacts, credentials;
- raw payment proof, payout bank values, storage paths, internal notes;
- raw audit payload, idempotency metadata, or unrelated assets;
- closed historical lease, occupancy, invoice, payment, or deposit rows outside
  the owner's effective ownership period;
- any attribute which is not explicitly included in the Owner read model.

### Active-lease continuity read model

When an Owner currently has an effective assignment for an asset, the portal may
show the **aggregate business progress of that asset's current active lease**
even when the lease, its initial DP, security-deposit ledger, or its first
invoice started before the assignment date. This prevents a newly assigned Owner
from seeing a misleading zero balance for a currently occupied asset.

The continuity view is read-only and allowlisted. It may include the resident's
display name, room/building, active lease coverage, invoice and installment
counts, verified rent amount, outstanding rent, overdue/H-7/checkpoint state,
next due date, and aggregate security-deposit required/collected/deducted/
refunded/balance values. It does not expose a raw payment, payment proof, bank
account, payer identifier, resident contact/identity data, or internal note.

This is a current-operational continuity exception only. It does not make a
former Owner eligible for post-transfer activity, does not reveal a closed
historical lease to a later Owner, and does not change period-bound earned-rent,
entitlement, settlement, adjustment, or payout authority.

### Empty and boundary states

- No assigned assets: explain that the account is active but no asset has been
  assigned; show no global totals.
- Future assignment: show effective date without revealing current owner's data.
- Ended assignment: show only period-bound historical reports; remove current
  operational state.
- Changed scope during request: discard stale response and reload authorization
  scope.
- Denied deep link: show a generic unavailable state without confirming another
  owner's record exists.

## 6. Dashboard and Operational Views

The dashboard reconciles to the selected effective owned-asset scope and shows:

- total owned buildings/rooms by category;
- occupied, reserved, vacant, and maintenance rooms;
- active leases and leases nearing end date;
- open complaints/maintenance counts;
- gross earned rent, owner entitlement, Kostation fee, adjustments, approved
  payout, and unpaid approved payout;
- latest monthly settlement state;
- alerts for missing assignment, unsettled periods, reversals, and transfer dates.

Room detail shows current operational condition, safe resident display name,
lease period, payment status and active-lease collection progress,
complaint/maintenance summary, and ownership period. It exposes no mutation
control. When an active lease exists, its collection progress must be derived
from the authoritative invoice, verified-allocation, installment, and
security-deposit ledger data for that lease rather than from assignment-start
date filtering.

## 7. Financial Experience

### Recognition

The standard room tariff is currently Rp1.800.000 per month. For every occupied
room-month that is both collected and earned:

- Rp1.500.000 is Owner Entitlement;
- Rp300.000 is Kostation Management Fee.

The policy is effective-dated and snapshotted. Vacancy, not-yet-active occupancy,
and security deposit create no entitlement. Booking Fee and DP are advance rent
credits and are recognized only as service coverage elapses.

If verified collected rent for an earned period is partial, the amount is split
proportionally at 5:1 until the owner and fee monthly caps are reached. Combined
owner entitlement and management fee must never exceed recognized gross rent.
Post-A3 earnings additionally carry an authoritative half-open
`[service_from, service_until)` interval and active rent
`payment_allocation_id` inside the earning month. The interval is bounded by the
allocated invoice service, activated lease, and authoritative occupancy, so a
vacant/pre-activation/post-checkout room creates no entitlement. The intervals
for one allocation are contiguous and non-overlapping; their Gross Earned Rent
reconciles exactly to that allocation, not the raw payment. One advance payment
may therefore have separate allocations for multiple service months without
duplicate entitlement.

### Collection progress versus Owner finance

The portal presents two adjacent but distinct read-only views:

1. **Active-lease collection progress per currently owned room**: rent invoiced,
   verified rent, outstanding balance, overdue/H-7/checkpoint state, installment
   progress, and aggregate security-deposit position. This follows the current
   active lease under the active-lease continuity read model.
2. **Owner finance**: gross earned rent, Owner entitlement, management fee,
   adjustment, settlement, and payout. This remains strictly attributed to the
   owner's effective service coverage period.

Neither view substitutes for the other. A verified payment is not automatically
earned rent or Owner entitlement, and a zero settlement must never be displayed
as if the resident has paid nothing.

### Settlement

One owner settlement is generated per owner, property, and month:

```text
Draft -> Ready for Review -> Approved -> Paid
```

It shows, per asset and in totals:

- occupancy/service coverage;
- verified collected rent allocated to the earned period;
- gross earned rent;
- owner entitlement;
- Kostation management fee;
- append-only positive/negative adjustments;
- approved payout and payment reference.

Admin approval is required before payout. Reversal/refund after approval creates a
compensating adjustment or clawback in a later settlement; prior settlement rows
remain immutable.

Expenses and maintenance are shown separately. They do not reduce owner payout
automatically without an explicit approved rule, category, evidence, and audit.
Tax and withholding automation are deferred.

### Transfer attribution

Income follows the asset owner for the earned service coverage, not merely the
payment receipt date. A payment collected before transfer for service after
transfer belongs to the new ownership period when earned. A mid-period transfer
is represented by adjacent service intervals split at the exact boundary, not by
`earning_month` alone. Settlement lines, adjustments, payouts, notifications,
preview, PDF, and XLSX use that same coverage lineage; mixed-authority
settlements are not projected to either Owner.

Historical occupancy and lease rows are period-scoped projections. Their exposed
dates are the intersection of report period, ownership assignment, lease, and
occupancy intervals: a former Owner cannot see post-transfer dates and a new
Owner cannot see pre-transfer dates. The only exception is the aggregate
active-lease continuity read model defined above; it exposes no historical row,
proof, or private detail.

## 8. Reports and Exports

Owner reports include:

- asset occupancy and availability;
- lease coverage and expirations;
- earned-rent and collection reconciliation;
- owner entitlement and management fee;
- settlement, adjustment, and payout history;
- complaint and maintenance summaries.

List totals, cards, charts, preview, Excel, and PDF must use the same effective
scope and period. Exports are watermarked with owner identity, generated time,
scope, and ownership period. A former owner cannot export current data.

## 9. Security and Privacy

- Every owner endpoint requires `property_owner` plus a read-only permission.
- Scope is resolved from authenticated account -> Owner Profile -> effective
  assignments.
- Empty or duplicate identity fails closed.
- SQL includes the exact building/room and ownership-period predicate.
- Cache keys include owner profile and authorization-scope version.
- Assignment changes invalidate relevant owner caches.
- Sensitive response fields use explicit allowlists and exact parsers.
- Payout destination is encrypted at rest and masked in owner responses.
- All Admin mutations are authorized before owner/asset lookup.

## 10. Acceptance Scenarios

1. Assigning RK-01 to Owner A exposes every RK-01 room and no other building.
2. Adding a room to RK-01 later automatically includes it in Owner A's scope.
3. Assigning Apart rooms AK-01-01 and AK-05-03 exposes exactly those rooms.
4. Assigning an Apart building or a Rumah Kost room directly is rejected.
5. Overlapping current/future ownership for the same asset is rejected.
6. A scheduled transfer changes scope exactly at its effective instant.
7. A former owner sees only period-bound reports and no current resident state.
8. An owner without assignments receives empty lists and zero totals.
9. Every owner mutation attempt is denied.
10. Raw PII/payment proof never appears in owner payloads or exports.
11. A current Owner assigned after an active lease starts still sees that
    lease's aggregate invoice, verified-rent, outstanding-balance,
    checkpoint/overdue, and aggregate deposit progress; no raw transaction or
    private resident field is exposed.
12. Rp1.800.000 fully earned produces Rp1.500.000 entitlement and Rp300.000 fee.
13. Security deposit and vacancy produce zero owner entitlement.
14. Advance rent is recognized over coverage rather than entirely on receipt.
15. Reversal after approval produces an adjustment without deleting history.
16. Archive is blocked while active or future assignments remain.

## 11. Completion Boundary

W10-OWNER-A through W10-OWNER-D are source-complete and
`AUTOMATED VERIFIED`. The controlled runtime gate remains deferred until the
documented QA procedure has recorded the target database identity, restore
evidence, canonical migration evidence, and authenticated browser evidence.
Accordingly, W10 must not be described as production- or runtime-verified.
