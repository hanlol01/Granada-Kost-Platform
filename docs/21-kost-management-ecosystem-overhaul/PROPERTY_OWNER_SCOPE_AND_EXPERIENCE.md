# Property Owner Scope and Experience

Status: `PLANNED`

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
| `property_owner` | Asset owner/investor      | Effective assigned assets | None; read-only                  |

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
- data before/after the owner's effective ownership period, except the current
  safe asset condition while ownership is active.

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
lease period, payment status summary, complaint/maintenance summary, and ownership
period. It exposes no mutation control.

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
transfer belongs to the new ownership period when earned. Mid-period transfer is
prorated or adjusted explicitly and must reconcile to the same total gross rent.

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
11. Rp1.800.000 fully earned produces Rp1.500.000 entitlement and Rp300.000 fee.
12. Security deposit and vacancy produce zero owner entitlement.
13. Advance rent is recognized over coverage rather than entirely on receipt.
14. Reversal after approval produces an adjustment without deleting history.
15. Archive is blocked while active or future assignments remain.

## 11. Completion Boundary

The Property Owner experience is complete only after W10-OWNER-A through
W10-OWNER-D pass automated and runtime gates. Until then the vocabulary is
authoritative but feature status remains `PLANNED`.
