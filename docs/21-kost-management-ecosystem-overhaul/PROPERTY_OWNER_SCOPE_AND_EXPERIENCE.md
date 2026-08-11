# Property Owner Scope and Experience

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program: `KMO`

Surface: restricted read-only mode in the Admin web application

Audience: building investors with the `property_owner` role

> **Delivery priority (2026-08-11):** this contract remains `APPROVED` planning.
> Its ownership and read-only workspace portions are the next prioritized W10
> slice; reporting/export breadth remains deferred until that authority is
> established. See
> [`PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md`](PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md).

## 1. Purpose

KOSTATION may assign one whole physical building to an investor. The investor
needs transparent operational and financial visibility for that building
without receiving global operator authority.

The `property_owner` experience therefore:

- reuses the Admin application's calm operational shell;
- scopes every record to currently assigned buildings;
- is read-only;
- exposes relevant rooms, residents, leases, billing, payments, vehicles,
  leads, complaints, notifications, and reports;
- minimizes resident and payer personal data;
- records ownership history; and
- revokes access when ownership ends.

This role is distinct from global operational `owner`:

| Role             | Meaning                                       | Scope                     | Mutation                 |
| ---------------- | --------------------------------------------- | ------------------------- | ------------------------ |
| `owner`          | KOSTATION/global operator                     | Authorized property scope | According to permissions |
| `property_owner` | Investor who owns one or more whole buildings | Assigned buildings only   | None                     |

`DEC-OWNER-001` is binding. Frontend filtering is only a presentation boundary;
backend building scope remains authoritative under `INV-PROPERTY-001`.

The `FR-POW-*-1xx` requirements below refine the PRD's canonical
`FR-POW-OWNER-001..003` outcomes; they do not replace or renumber those parent
requirements.

## 2. Ownership Unit and Assignment

### FR-POW-OWNER-101 — Whole-building ownership

Ownership is assigned to a complete authoritative building such as `RuKost Unit
01`, not to:

- an individual room;
- a floor;
- a percentage of a room;
- a category without a building;
- an arbitrary query result; or
- a client-provided list of room IDs.

All rooms remain operational inventory managed by KOSTATION. Ownership changes
who may monitor the building; it does not grant direct control over room state,
resident lifecycle, prices, or payments.

### FR-POW-OWNER-102 — Default ownership

Every building has one current ownership authority. Before an investor
assignment, the visible owner is **KOSTATION**.

Acceptance:

- no building is left with an ambiguous null owner;
- room detail and ownership reports use the same current assignment;
- inactive/historical assignments do not count as current; and
- a building cannot have overlapping active investor assignments.

### FR-POW-OWNER-103 — Ownership history

An assignment contains:

- investor/account reference;
- building;
- effective start;
- optional effective end;
- agreement/reference label;
- status;
- created/approved actors;
- timestamps; and
- audit history.

Transfer closes the previous assignment and starts the new assignment in one
authoritative command. Historical records remain immutable and reportable.

### FR-POW-OWNER-104 — Effective access window

By default, an investor can view:

- current operational state for currently assigned buildings; and
- financial/operational history from the assignment effective date onward.

Pre-assignment history, prior-investor private data, and post-assignment-end data
are not exposed unless a separate owner-approved reporting policy grants them.
Ending the assignment revokes current access immediately.

## 3. Investor Onboarding and Credentials

### FR-POW-AUTH-101 — Admin-provisioned account

Only an authorized global operator can create or reuse a Property Owner account.
The ownership workflow captures:

- full legal/display name;
- email;
- normalized phone;
- address;
- identity/company reference appropriate to the agreement;
- one or more whole buildings;
- effective date;
- agreement reference; and
- acknowledgement of read-only access.

It must not collect or display a reusable plain-text password after the one-time
handoff.

### FR-POW-AUTH-102 — Atomic provisioning

The assignment command must:

1. validate the building and current ownership;
2. reconcile an existing user by normalized email/phone;
3. reject conflicting identities;
4. create or reuse the user;
5. assign the scoped `property_owner` role;
6. create the effective building assignment;
7. generate a one-time server-generated temporary password for a new account,
   return it only through a dedicated authorized non-cacheable receipt,
   and deliver it through the approved out-of-band handoff without placing
   plaintext in ordinary API/page data, cache, audit, outbox, telemetry, URL,
   export, or log;
8. record audit/events; and
9. commit or roll back as one unit.

Failure at any step leaves no partially active account or building assignment.
Same-key replay returns the original safe business result with receipt status
`already_issued` and `temporary_password = null`; it never regenerates or
replays plaintext. A lost or dismissed receipt requires the dedicated audited
password-reset command.

### FR-POW-AUTH-103 — First login and recovery

The Property Owner signs in through the Admin login with email or normalized
phone and temporary password. First login requires password change before any
building data is shown.

Admin can initiate a secure password reset and receive a new one-time receipt,
but cannot retrieve the current or previously issued password. Revoked
ownership, revoked role, inactive account, or zero current building assignments
produces a safe no-access state and clears scoped cache.

### FR-POW-AUTH-104 — Multi-role account

If one person has multiple roles, the backend evaluates the requested operation
against the active role and assignment. Entering Property Owner mode must not
inherit global `owner`, manager, or Admin write controls accidentally.

The shell must identify **Mode Pemilik Properti — Hanya Lihat** so the user
understands the current boundary.

## 4. Building Scope

### FR-POW-PROPERTY-101 — Authoritative building filter

Every query derives allowed buildings from persisted active assignments for the
authenticated user. A `building`, `property`, room, resident, or report query
parameter can narrow that set but can never widen it.

Acceptance:

- empty assignment means zero data, never a global query;
- wrong-property/wrong-building records return the same safe inaccessible
  behavior;
- list totals, exports, notifications, and dashboard aggregates use the same
  scope;
- caches include account plus assignment version; and
- assignment change invalidates all Property Owner data.

### FR-POW-PROPERTY-102 — Building switcher

An investor with multiple active buildings receives:

- **Semua Gedung Saya** aggregate; and
- one option per assigned building.

The switcher does not include unassigned buildings or raw IDs. Selected scope is
represented by a safe building code in the URL. Changing it resets pagination
and closes any detail that is no longer in scope.

### FR-POW-PRIV-101 — Complete operational, minimized personal view

“Complete” Property Owner visibility means complete operational information
needed to monitor the assigned building. It does not mean a copy of every Admin
PII field.

Visible by default:

- resident display name;
- room;
- university summary;
- lease period/status;
- account active/inactive state;
- billing/payment status and totals;
- vehicle/parking summary;
- complaint/work-order status;
- operational timeline; and
- building financial aggregates.

Masked or excluded by default:

- full NIK;
- KTP/KK/KTM/passport image;
- password or credential state beyond active/reset-required;
- parent/emergency contact;
- complete home address;
- private complaint/internal notes;
- payer bank account number;
- raw payment proof metadata;
- tokens, session, provider data, and internal UUIDs.

A future deliberate reveal permission requires a separate approved policy; it
must not be inferred from `property_owner`.

## 5. Navigation and Route Access

Property Owner mode uses a restricted navigation:

| Visible item       | Route            | Access                           |
| ------------------ | ---------------- | -------------------------------- |
| Dashboard          | `/`              | Read                             |
| Kamar              | `/rooms`         | Read, assigned buildings         |
| Penghuni           | `/tenants`       | Read, active/history in scope    |
| Pembayaran         | `/payments`      | Read, building allocations       |
| Kendaraan & Parkir | `/vehicles`      | Read, residents in scope         |
| Minat Booking      | `/booking-leads` | Read only after building binding |
| Komplain           | `/complaints`    | Read, rooms in scope             |
| Notifikasi         | `/notifications` | Read, scoped events              |
| Laporan            | `/reports`       | Read/export, scoped dataset      |
| Profil Akun        | `/settings`      | Own profile/preferences only     |

Not visible:

- Add/Edit Room;
- Add Lease/Resident;
- hold/release/convert lead;
- verify/reverse payment;
- add/reverse expense;
- assign technician or change complaint/work-order lifecycle;
- reminder send or template edit;
- building ownership administration;
- property configuration;
- feature flags;
- Smart Lock command;
- CCTV control;
- access credential administration; and
- global audit or access history.

Conditional read-only Smart Lock/CCTV health or building access summary may be
added only after a separate approved privacy and provider policy. Existing
routes do not make that access automatic.

### FR-POW-OPS-101 — Read-only shell

Property Owner mode must remove mutation controls rather than show a forest of
disabled buttons. When context helps explain a boundary, a concise “Dikelola
oleh Admin KOSTATION” note may replace the action.

Direct navigation to a mutation route or command returns a forbidden response;
hidden UI is not the security boundary.

## 6. Dashboard

### FR-POW-REPORT-101 — Building portfolio dashboard

The Property Owner dashboard shows, for the selected owned-building scope:

- building count;
- total rooms;
- vacant, held/reserved, occupied, maintenance, and reconciliation counts;
- occupancy rate;
- active residents and leases ending within 30 days;
- billed, verified paid, unpaid, and pending-review amounts;
- security-deposit liability separately;
- valid operational expenses allocated to the building;
- open complaints and SLA risk;
- registered vehicles/parking utilization; and
- recent scoped notifications.

Every metric links to the corresponding scoped list. Totals use authoritative
aggregates and must reconcile with reports.

### FR-POW-REPORT-102 — Dashboard truth

The dashboard must not:

- combine unowned buildings;
- count an unassigned category-wide public lead;
- label security deposit as revenue;
- count pending payment proof as verified receipt;
- show global property expense;
- infer building from category alone; or
- derive totals from a current table page.

## 7. Rooms and Buildings

### FR-POW-ROOM-101 — Owned room list

The Room list uses:

1. Kamar;
2. Bangunan;
3. Kategori;
4. Jenis Kelamin;
5. Status;
6. Penghuni Aktif; and
7. Detail.

Search and filters match the Admin room list but are constrained to assigned
buildings. There is no Add, Edit, Hold, Catat Minat, Move, or maintenance
command.

### FR-POW-ROOM-102 — Room detail

Read-only room detail shows:

- physical inventory;
- category facilities and commercial snapshot;
- ownership label;
- current resident operational summary;
- lease/occupancy period;
- billing/payment progress;
- vehicle/parking summary;
- complaints/work-order summary; and
- activity timeline.

Related links remain within Property Owner scope. Sensitive resident details are
minimized according to `FR-POW-PRIV-101`.

### FR-POW-OWNER-105 — Building overview

Each owned building has a read-only overview:

- building code/name/category/gender policy;
- total and occupied/vacant rooms;
- floor/capacity reconciliation;
- occupancy trend;
- current residents;
- financial summaries;
- complaint/maintenance status;
- vehicle/parking summary;
- ownership effective period; and
- report shortcuts.

It does not expose Edit Ownership or investor credentials.

## 8. Residents and Leases

### FR-POW-RESIDENT-101 — Scoped resident list

The Property Owner resident list uses:

1. Nama Penghuni;
2. Kamar;
3. Bangunan;
4. Universitas;
5. Periode Sewa;
6. Status Penyewaan;
7. Status Tagihan; and
8. Detail.

A resident appears only when the relevant lease/occupancy belongs to an assigned
building and the event falls within the permitted ownership window.

### FR-POW-RESIDENT-102 — Resident operational detail

The read-only detail includes:

- masked identity summary;
- room/building;
- current and in-scope historical lease periods;
- payment plan;
- billed/verified/unpaid totals;
- DP progress;
- security-deposit state;
- vehicles/parking;
- complaints/work orders; and
- scoped activity.

There are no Edit, Move Room, Archive, Reset Password, Record Payment, Send
Reminder, or lifecycle actions.

### FR-POW-LEASE-101 — Lease history boundary

Lease transfers display:

- origin/destination only when both are in current scope;
- effective date and safe reason category;
- financial consequence summary; and
- status.

If a resident moves out of the investor's building, future unrelated room and
resident activity disappears from the investor view. The historical event in
the owned building remains visible within the assignment window.

## 9. Billing, Payments, and Expenses

### FR-POW-BILLING-101 — Building financial view

The Property Owner can read:

- invoices allocated to rooms in owned buildings;
- verified rent receipts;
- unpaid and overdue amounts;
- pending proof count;
- DP allocated to rent;
- security deposit held/refunded/deducted as liability movement;
- reversals and refunds;
- in-scope operational expenses; and
- cash-flow summaries.

Statuses and totals match Admin/reports. Pending proof is not counted as paid.

### FR-POW-PAYMENT-101 — Payment detail

Payment detail shows business payment reference, resident/room/building,
transaction date, method, verified status, invoice allocations, amount, safe
notes, receipt, and reversal history.

Bank account data and proof are masked/minimized. If evidence viewing is later
permitted, it must use expiring mediated access and explicit authorization.

No Verify, Reject, Reverse, Delete, Add Payment, or Send Reminder action is
available.

### FR-POW-EXPENSE-101 — Expense visibility

An expense is visible only when its authoritative allocation includes the owned
building and the date falls within the assignment access window.

The view contains category, date, vendor label, method, valid amount, approval
state, linked complaint/work order where relevant, and safe description.
Evidence is mediated and masked. There is no Add, Approve, Reverse, or Delete
action.

### FR-POW-REPORT-103 — Financial definitions

Property Owner financial summary is cash-flow-oriented:

- verified inflow;
- valid expense/refund outflow;
- net cash movement; and
- security-deposit liability movement.

It must not be labeled profit, loss, dividend, yield, tax statement, or investor
distribution unless a separate accounting/investment contract defines those
calculations.

## 10. Leads and Holds

### FR-POW-LEAD-101 — Building-bound lead visibility

A lead becomes visible to a Property Owner only when it has an authoritative
current or historical binding to a room in an assigned building, such as:

- valid Admin preselection;
- active/expired/released hold; or
- completed conversion to a lease in that building.

A public lead with category + gender but no selected room is property-level
work and is not shown to every investor.

### FR-POW-LEAD-102 — Lead minimization

Visible lead fields are display name, category/gender, safe contact-state label,
building/room binding, hold state, created date, terminal outcome, and related
lease link.

Phone, email, address, university, message, and contact actions are excluded by
default. There is no Hold, Release, Contact, Reject, Expire, or Disewa action.

## 11. Vehicles and Parking

### FR-POW-VEHICLE-101 — Scoped vehicle view

The Property Owner sees active/history vehicle records tied to residents of an
owned building:

- resident display name;
- room;
- vehicle type;
- masked plate when privacy policy requires;
- make/model;
- registration state; and
- parking assignment.

Shared parking capacity is shown only to the extent attributable to the owned
building. Vehicles from another building may not be exposed merely because they
share a physical parking zone.

No Add, Edit, Approve, Reassign, or Archive action is present.

## 12. Complaints and Maintenance

### FR-POW-COMPLAINT-101 — Scoped complaint list

The read-only list includes complaint code, room, resident display name,
category, priority, lifecycle status, SLA state, technician display label, and
created/updated time for complaints in owned buildings.

It excludes unrelated property complaints, private resident attachments,
internal notes, technician contact details, and global work queue data.

### FR-POW-COMPLAINT-102 — Complaint/work-order detail

The detail provides:

- safe complaint description;
- resident/room/building context;
- resident-visible or investor-authorized evidence;
- status/SLA timeline;
- technician assignment label;
- work-order progress;
- before/after evidence where authorized;
- linked building expense summary; and
- completion outcome.

There is no assignment, reassign, status, verification, comment, expense, or
file mutation.

## 13. Notifications

### FR-POW-NOTIFICATION-101 — Scoped internal events

Property Owner notifications may include:

- occupancy/lease change in an owned building;
- payment verified/reversed;
- overdue building invoice summary;
- complaint SLA risk or completion;
- maintenance/expense approval outcome;
- ownership assignment change; and
- report availability/failure.

They must not include:

- public leads with no building;
- global security/auth events for another user;
- other buildings;
- private resident messages;
- Smart Lock commands;
- CCTV events without an explicit policy; or
- raw audit/provider data.

Read/unread state is per Property Owner account. Deep links must reauthorize the
target.

## 14. Reports and Export

### FR-POW-REPORT-104 — Available reports

Property Owner mode provides read/export access to:

- Penyewaan;
- Pembayaran;
- Pengeluaran; and
- Keuangan.

Filters are limited to owned buildings and permitted dates. **Semua Gedung
Saya** aggregates only current assigned buildings.

### FR-POW-REPORT-105 — Export scope

Preview, Excel, and PDF must:

- use the same server-authoritative filter and scope;
- include property/building labels and ownership window;
- use complete filtered results rather than the visible page;
- minimize personal fields;
- exclude identity documents, proof binaries, internal notes, and opaque IDs;
- record export actor, filters, timestamp, and assignment version; and
- fail closed if ownership changes before generation completes.

Exports carry **Hanya untuk Pemilik Properti — Data Terbatas** or equivalent
context so they are not mistaken for a global operations report.

### FR-POW-REPORT-106 — Report reconciliation

Property Owner dashboard, table totals, preview, Excel, and PDF must reconcile
for the same filter. Differences caused by transaction status, allocation date,
or deposit classification must be explained in the report definitions rather
than silently recomputed client-side.

## 15. Account Settings

### FR-POW-AUTH-105 — Own profile and preferences

Property Owner `/settings` includes only:

- display name;
- email/phone change request;
- password change;
- notification preferences;
- theme; and
- active building-assignment summary.

The user cannot edit the legal ownership assignment, buildings, role,
permissions, property profile, category prices, content, templates, feature
flags, resident data, or integration settings.

Identity/contact changes that affect agreement authority require Admin review.

## 16. State, Responsive, and Accessibility Behavior

### FR-POW-OPS-102 — Explicit scope states

Every page distinguishes:

- loading assignments;
- zero current assignments;
- selected building no longer assigned;
- no records in a valid building;
- access forbidden;
- report outside effective window;
- background refresh;
- invalid response; and
- recoverable service failure.

No state falls back to property-global data. A revoked assignment closes an open
detail and clears all scoped data before showing no-access.

### NFR-A11Y-004 — Property Owner accessibility

The read-only shell meets the same Admin keyboard, focus, status, table, mobile
card, contrast, and semantic-heading requirements. “Read-only” is communicated
with text, not merely disabled control styling.

### NFR-PRIV-003 — Investor privacy boundary

List, detail, notification, URL, cache, export, console, and error content must
be reviewed separately. A field permitted in one mediated detail is not
automatically permitted in a list, badge, notification preview, or export.

### NFR-REL-003 — Assignment race protection

The assignment version and backend authorization are rechecked:

- when a query starts;
- before a generated export is finalized;
- when a deep link resolves; and
- after account/building switch.

Stale responses from a former scope are discarded and cannot repopulate cache.

### NFR-PERF-003 — Scoped aggregate performance

Dashboard and reports use building-scoped aggregate queries rather than loading
all property rows and filtering in the browser. Lists remain paginated and
details use bounded related-record queries.

## 17. Acceptance Journeys

### Journey A — New investor

1. Admin selects one whole building currently owned by KOSTATION.
2. Admin enters or selects investor identity and effective date.
3. System provisions account, role, and assignment atomically.
4. Admin hands off one-time temporary credentials.
5. Investor changes password.
6. Investor sees the read-only dashboard for the assigned building only.

### Journey B — Multi-building investor

1. Investor opens **Semua Gedung Saya** and sees reconciled aggregate totals.
2. Investor switches to one building.
3. Rooms, residents, payments, complaints, notifications, and reports all
   narrow to that building.
4. Reload and deep links preserve only authorized safe building scope.

### Journey C — Lead boundary

1. A new public category-only lead is created and remains invisible to the
   investor.
2. Admin binds it to a room in the investor's building through a hold.
3. A minimized read-only lead appears.
4. Conversion links to the scoped resident/lease after activation.

### Journey D — Ownership transfer

1. Admin previews and confirms transfer.
2. Prior assignment closes and the new assignment begins atomically.
3. Former owner loses access and scoped cache immediately.
4. New owner receives access from the effective date after credential setup.
5. Historical ownership remains in Admin audit and authorized reports.

### Journey E — Read-only enforcement

1. Investor opens Room, Resident, Payment, Complaint, and Report detail.
2. No mutation controls are presented.
3. A direct command request is rejected by the backend.
4. No data from another building appears in response, count, notification, or
   export.

## 18. Completion Gate

The Property Owner experience is not complete until:

1. `owner` and `property_owner` are visibly and technically distinct;
2. ownership is whole-building, non-overlapping, effective-dated, and defaults
   to KOSTATION;
3. account and assignment provisioning is atomic and first-login secure;
4. every query, aggregate, deep link, notification, and export is
   building-scoped by backend authority;
5. zero assignment returns zero data and never property-global fallback;
6. the restricted navigation contains no write controls;
7. direct mutation requests are denied;
8. room, resident, lease, billing, vehicle, lead, complaint, notification, and
   report views reconcile within scope;
9. sensitive resident/payment information follows explicit minimization;
10. assignment revocation clears cache and access without stale data flash;
11. mobile/desktop, keyboard, dark/light, empty, denied, stale-scope, and export
    runtime scenarios pass; and
12. no requirement advances beyond APPROVED until implementation, automated, and
    credential-backed runtime evidence is recorded.
