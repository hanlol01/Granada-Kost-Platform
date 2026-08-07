# Product Requirements Document — KOSTATION Management Ecosystem Overhaul

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program: `KMO`

Product surfaces: Admin, public `/kamar`, authenticated Penghuni, and
building-scoped Property Owner

Last consolidated: 2026-07-30 (Asia/Jakarta)

## 1. Executive Summary

KOSTATION must become an operational system for one managed boarding-house
portfolio, not a generic hotel marketplace and not a collection of disconnected
CRUD pages. The system must carry one consistent business record from public
interest through room holding, resident onboarding, lease activation, billing,
payment, operations, renewal, transfer, and checkout.

The current repository already contains substantial foundations for rooms,
Booking Leads, holds, residents, leases, billing, complaints, vehicles,
notifications, and role-based access. The overhaul does not discard those
foundations. It closes broken routes, removes false or duplicated workflows,
introduces missing operational authorities, and redesigns pages around complete
operator tasks.

The implementation must be delivered as dependency-ordered vertical slices.
This document defines the target outcome; it does not authorize a repository-wide
big-bang rewrite.

## 2. Source Authorities

The authority order is defined in [`README.md`](README.md). The most important
inputs to this PRD are:

1. the product owner's complete revision discussion;
2. the property owner's operational policy in
   `docs/18-public-hunian-catalog/master-data/master_data_kostation.md`;
3. current repository and database evidence recorded through M9–M19;
4. [`PRODUCT.md`](../../PRODUCT.md) and [`DESIGN.md`](../../DESIGN.md);
5. third-party screenshots used only as behavioral inspiration.

When this PRD differs from a screenshot label or flow, this PRD wins. When this
PRD differs from a more specific policy or lifecycle contract in this directory,
the more specific contract wins.

## 3. Product Outcomes

### 3.1 Primary Outcomes

- An Admin can complete every ordinary boarding-house operation without
  switching to spreadsheets or inventing missing state transitions.
- A prospective resident can inspect public category-level housing information
  without logging in and submit a short, non-binding Booking Lead.
- A resident receives one account and can see only their canonical active
  resident context, lease, invoices, payments, complaints, vehicles, reminders,
  and notifications.
- A building investor can monitor only owned buildings through a read-only,
  building-scoped Property Owner experience.
- Financial records distinguish offer, DP, rent, refundable security deposit,
  additional charge, invoice, payment, allocation, receipt, expense, liability,
  and revenue.
- Every cancellation, correction, reversal, reassignment, transfer, archive,
  and status transition remains auditable.
- Public, Admin, Penghuni, and Property Owner surfaces read from compatible
  domain authorities rather than separate copies of business truth.

### 3.2 Problems This Program Must Eliminate

- Sidebar routes that cannot reach a terminal page.
- A room inventory that cannot be searched or filtered sufficiently.
- Shallow room and resident detail views that require operators to navigate
  blindly between unrelated lists.
- Category-level commercial and content settings modeled as arbitrary room-level
  differences.
- Booking Lead status changes that do not form a complete path to an active
  resident and lease.
- Residents created without an atomically linked login account.
- Rent, DP, deposit, proof, invoice, receipt, and miscellaneous payment concepts
  being combined or ambiguously labeled.
- Reminder and notification concepts being mixed.
- Hard-delete actions that erase financial or operational history.
- Reports built from the visible table page rather than the complete filtered
  dataset.
- Property Owner scope that is property-wide when the business relationship is
  building ownership.

## 4. Users and Access Intent

| Persona          | Primary objective                                      | Target authority                                 |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `owner`          | Operate the KOSTATION portfolio and configure policies | Full operator write within authorized properties |
| `manager`        | Run daily boarding-house operations                    | Operational write within assigned properties     |
| `admin`          | Execute supported operational tasks                    | Permissions and rollout decide each task         |
| `property_owner` | Monitor owned building investment                      | Read-only, building-scoped                       |
| `resident`       | Manage personal tenancy and service interactions       | Self-service for canonical resident context      |
| `technician`     | Receive and update assigned work                       | Maintenance authority only                       |
| Public prospect  | Discover housing and submit interest                   | Published category-level data only               |

The global `owner` operator role and the investor `property_owner` role are
different. They must never be merged by label, permission, cache scope, or API
authorization.

## 5. Product Principles

### 5.1 One Canonical Lifecycle

Every resident-room relationship must be created through a lease. Every active
occupancy must reconcile to the same resident, room, property, lease, and gender
policy. Compatibility workflows may repair legacy anomalies but must not become
an alternative lifecycle.

### 5.2 Category-Level Commercial Authority

KOSTATION has two categories: Rumah Kost and Apart Kost. Initial commercial
defaults are Rp1.800.000 per month and Rp21.600.000 per year for each category.
Admin may change these values at category/type authority, not independently on
ordinary rooms. Security deposit is recorded separately at lease level as an
optional refundable liability; Rp0 is valid and it never changes category rent.

### 5.3 Fixed Physical Inventory

The canonical demo property has 163 rooms. Routine Admin UI must not expose
“Tambah Kamar.” Room editing remains available for safe attributes, but building
or room creation is an exceptional data-administration operation outside the
ordinary product workflow.

### 5.4 One Person, One Room

One active lease and occupancy represent one resident in one room. The product
does not offer mixed-gender rooms or multi-occupancy household booking.

### 5.5 Progressive Disclosure

Lists support rapid scanning and filtering. Full entity pages contain linked
operational context, history, and actions. Side panels and dialogs are reserved
for short tasks, previews, and confirmations; they must not become the only
place to understand a room, resident, lease, payment, or work order.

### 5.6 Safe Historical Records

Financial and lifecycle history is corrected through reversal, supersession,
archive, close, or explicit transition. It is not physically deleted after it
has downstream history.

### 5.7 Manual Integrations First

Payment is recorded manually through bank transfer or audited cash. WhatsApp
uses a user-initiated `wa.me` handoff. Email sending remains disabled until a
provider is configured. No payment gateway, automatic WhatsApp delivery, or
automatic email-delivery claim is part of the initial implementation.

## 6. Canonical Business Decisions

The detailed policy register is in
[`OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`](OWNER_POLICY_DECISIONS_AND_GLOSSARY.md).
The following decisions bind all product surfaces:

- `DEC-ROOM-001`: routine room creation is disabled; inventory is fixed.
- `DEC-CONTENT-001`: facilities and galleries have exactly two category
  authorities, Rumah Kost and Apart Kost.
- `DEC-PUBLIC-001`: public visitors select category and gender, never an exact
  room number.
- `DEC-LEAD-001`: public lead, Admin quick lead, and direct onboarding converge
  on one activation authority; `INV-LEAD-001` keeps lead, hold, lease, and
  occupancy distinct.
- `POL-LEASE-001`: ordinary direct onboarding accepts a whole-number term from
  3 through 120 months; a 1–2 month exception needs later owner approval.
- `POL-BILLING-002`: rent and its schedule derive from the immutable lease
  snapshot; exact 12-month multiples may use annual category pricing.
- `POL-PAYMENT-001`, `POL-PAYMENT-002`, and `POL-PAYMENT-009`: Booking Fee and
  DP are advance rent credits; security deposit is a separate optional
  refundable liability.
- `POL-PAYMENT-003`: bank transfer is primary; cash is an audited exception.
- `DEC-PAYMENT-001`: payment gateway and automatic provider settlement are
  disabled for this overhaul.
- `DEC-RESIDENT-005` and `DEC-OWNER-003`: resident and Property Owner
  credentials are provisioned only through successful, atomic onboarding.
- `DEC-REMINDER-001`: manual WhatsApp uses `wa.me` and email remains disabled
  until configured; `DEC-NOTIFICATION-001` keeps reminders separate from
  internal notifications.
- `DEC-OWNER-001`: investor scope is building-level and read-only.

## 7. End-to-End Journeys

### 7.1 Public Booking Lead to Active Resident

1. A prospect opens `/kamar` without authentication.
2. The prospect reviews published category galleries, facilities, pricing,
   terms, gender policy, and availability summary.
3. The prospect filters by category, gender, planned move-in, and intended
   payment or duration context.
4. The prospect opens a category-level detail experience; no exact room number
   or internal availability detail is exposed.
5. The prospect submits a short Booking Lead.
6. Admin receives the lead, contacts the prospect, and records progress.
7. After agreement, Admin selects one eligible vacant room and may place a
   24-hour hold.
8. Admin creates a separate **Lead Payment Commitment** after the active hold:
   Booking Fee, DP, or full settlement; it is not yet a W06 payment-ledger row.
9. Admin selects **Lengkapi Data Penyewaan** and completes the resident, lease,
   room, billing, and onboarding checklist in `/tenants`. Before **Commit
   Onboarding**, the contractual start date and duration may be revised; the
   server recalculates the commercial quote for that final period while the
   recorded Lead Payment Commitment remains immutable. A lead credit that would
   exceed the recalculated contract rent blocks commit and requires an explicit
   lead correction or cancellation.
10. **Commit Onboarding** atomically provisions/links the account, creates the
    pending resident and awaiting-activation lease, freezes billing, and keeps
    the exact room reserved.
11. At the agreed start/check-in boundary, **Activate Lease** atomically opens
    occupancy, marks the room occupied, activates the resident/lease, and closes
    the Booking Lead as leased.

`FR-PUB-LEAD-001`: Public Booking Lead submission must require only the
information necessary for qualification and contact.

`FR-ADM-LEAD-001`: Admin must be able to progress a public Booking Lead without
assigning a room until agreement and eligibility are confirmed.

`INV-LEAD-002`: Public Booking Lead creation must not mutate a room, hold, lease,
resident, invoice, or payment.

### 7.2 Admin Quick Booking Lead

1. Admin filters the room inventory and chooses a vacant exact room.
2. Admin records a short Booking Lead against that room.
3. The lead follows the same contact, hold, DP/deposit, onboarding, and
   activation authorities as a public lead.

`FR-ADM-LEAD-002`: Quick-entry must retain the selected exact room as an Admin
preference while still requiring a hold or activation command before room
status changes.

`FR-ADM-LEAD-006`: A Booking Lead must have a currently active, compatible
24-hour hold before Admin can create its Lead Payment Commitment or open the
lead-based `Tambah Penyewaan` flow. A new lead never exposes direct onboarding.

`FR-ADM-LEAD-007`: Completing a lead records exactly one Lead Payment
Commitment. It is materialized exactly once into the W06 ledger/deposit records
when **Commit Onboarding** succeeds; the lead commitment itself is not a payment
receipt or settlement.

### 7.3 Direct Resident and Lease Onboarding

1. Admin opens `/tenants/new`.
2. Admin completes resident and lease details.
3. Admin chooses one gender-compatible, vacant room from authoritative
   inventory.
4. Admin records DP, deposit, and initial rent obligations or payments.
5. Admin confirms the inventory and activation checklist.
6. **Commit Onboarding** atomically creates or links the account, pending
   resident, awaiting-activation lease, reserved room authority, billing
   schedule, audit, events, and one-time credential receipt. It does not open
   occupancy or mark the room occupied.
7. At the valid start/check-in boundary, **Activate Lease** separately
   revalidates the commitment and atomically activates the resident/lease,
   opens occupancy, and marks the room occupied.

`FR-ADM-RESIDENT-001`: Direct onboarding must not require a Booking Lead.

`INV-LEASE-001`: Partial onboarding must not leave an active resident, occupied
room, credential, invoice, payment, or occupancy without a valid lease.

### 7.4 Active Resident Operations

Admin opens a full resident page to review:

- identity and education;
- contact and emergency contact;
- room, building, facilities, and investor ownership label;
- lease term, remaining days, renewal intent, and transfer history;
- DP, security deposit, invoices, allocations, receipts, outstanding balance,
  and manual additional payments;
- vehicles and parking;
- complaints and work orders;
- reminders, notifications, and a unified activity timeline.

Admin may edit safe resident fields, open linked details, record payment, send a
manual reminder, initiate a room transfer, renew, or start checkout.

`FR-ADM-RESIDENT-002`: The resident detail must be a full page with breadcrumbs
and stable deep link, not a dialog-only view.

### 7.5 Room Transfer

1. Admin starts transfer from the resident detail.
2. Admin records a required reason and chooses normal end-of-period or
   exceptional same-day transfer.
3. The system lists only eligible vacant rooms compatible with property,
   category or approved change, and gender.
4. Admin reviews financial and lifecycle effects and confirms.
5. The system creates an addendum or transfer record, closes the old occupancy,
   opens the new occupancy, moves the active lease authority, and places the old
   room into inspection-required state.
6. Inspection returns the old room to vacant or maintenance.

`FR-ADM-LEASE-001`: Transfer must preserve the resident account and historical
lease chain; it must not deactivate and recreate the resident.

### 7.6 Renewal and Checkout

- At H-60 the system surfaces renewal-intent work.
- At H-30 it surfaces approved renewal-payment work or the continuing checkout
  path.
- A resident who ends the lease must provide at least 14 days' notice unless an
  authorized exception is recorded.
- Checkout requires balance settlement, key/access return, room inspection,
  deposit disposition, and room restoration.
- Deposit refund is due within at most seven business days when no damage or
  arrears remain.

`FR-ADM-LEASE-002`: Lease close and deposit disposition must be one coherent
workflow with explicit blocking reasons.

## 8. Admin Functional Scope

Detailed page behavior is in
[`ADMIN_INFORMATION_ARCHITECTURE.md`](ADMIN_INFORMATION_ARCHITECTURE.md).

### 8.1 Navigation and Route Integrity

`FR-ADM-OPS-001`: Every visible navigation item must resolve to an authorized
terminal page or an explicit unavailable state; it must never crash, loop, or
silently render a blank page.

Initial route defects to close include:

- `/vehicles?tab=vehicles`;
- `/complaints`;
- `/reports`;
- `/rooms/fasilitas?q=`.

Routes must preserve useful filter state in the URL and must reject or normalize
unknown query values safely.

### 8.2 Dashboard

`FR-ADM-OPS-002`: Dashboard cards and action queues must summarize authoritative
property-scoped data and deep-link into the matching filtered page.

Dashboard must surface:

- room occupancy and room exceptions;
- Booking Leads requiring action;
- holds nearing expiry;
- leases nearing renewal or checkout;
- current unpaid or unconfirmed invoices;
- unresolved complaints and breached SLA;
- reminder and notification work;
- financial cash-flow summary;
- data-reconciliation exceptions.

### 8.3 Rooms

`FR-ADM-ROOM-001`: The room list must support authoritative search by room
number, building name/code, and category plus filters for category, status,
gender, building, floor, and reconciliation state.

`FR-ADM-ROOM-002`: The room table must prioritize room number, building,
category, gender, status, active resident summary, and actions; type price is
removed from the list and shown in detail.

`FR-ADM-ROOM-003`: The full room detail must include physical inventory,
category pricing/facilities, active resident, lease, vehicles, billing progress,
complaints/work orders, ownership, and quick links to full related records.

`FR-ADM-ROOM-004`: Room editing must protect lifecycle-active structural fields.
Routine room creation remains unavailable.

### 8.4 Category Content

`FR-ADM-CONTENT-001`: Facilities must be edited as two category records and
published to matching Admin and public category views.

`FR-ADM-CONTENT-002`: Gallery assets must belong directly to Rumah Kost or Apart
Kost. Generic area tags such as lobby, kitchen, or shared area are not part of
the target content model.

`FR-ADM-CONTENT-003`: Terms must distinguish internal operating policy from a
public-safe published version.

### 8.5 Booking Leads and Holds

`FR-ADM-LEAD-003`: The Booking Lead list must show prospect, category and
gender, optional selected room, university, source, current lifecycle, entered
date, hold state, and relevant actions.

`FR-ADM-LEAD-004`: Deprecated survey and generic converted actions must be
removed. The final successful outcome is an activated lease/resident, not a
cosmetic lead status.

`FR-ADM-LEAD-005`: Room hold requires explicit room selection, is limited to one
active hold per lead and room, expires after 24 hours, and restores the room
safely.

### 8.6 Residents and Leases

`FR-ADM-RESIDENT-003`: `/tenants` is the resident-and-lease operational hub. It
must not be split into a duplicate primary “Penyewaan” sidebar.

The default table includes:

- row number;
- resident name;
- room number;
- university;
- lease duration or end date;
- account/lease status;
- actions.

Each row may expand to show lease end, unpaid invoice count and amount, current
payment standing, and notes. Actions include Detail, Edit, and contextual More.

`FR-ADM-RESIDENT-004`: “Tambah Penyewaan” opens a full-page, two-stage onboarding
flow: Resident & Lease, then Choose Room.

`FR-ADM-RESIDENT-005`: Resident detail and edit must cover full identity,
education, parents/emergency contacts, KTP evidence, account status, and safe
archive/deactivation.

`FR-ADM-AUTH-001`: A financially complete onboarding commitment must provision
or reuse an account linked to normalized email/phone, assign the resident role,
produce a dedicated one-time temporary-password receipt, and force a password
change at first login. A future-start resident remains `pending_activation`; the
account may complete password change and view an upcoming-lease state, but no
active occupancy or full resident context exists before lease activation.

### 8.7 Billing and Payments

`FR-ADM-BILLING-001`: Resident detail must show a summary card with unpaid,
paid, total contractual rent, lease start/end, remaining days, and notes.

`FR-ADM-BILLING-002`: Invoice tabs must include Unpaid, Paid, Awaiting
Confirmation, and Additional Payments, each backed by canonical status rather
than a local UI-only category.

`FR-ADM-PAYMENT-001`: Admin may record one manual payment against one or more
selected invoices. Transfer requires proof; cash requires an auditable receipt.

`FR-ADM-PAYMENT-002`: Paid-payment detail must show payment code, method, date,
total, proof, notes, allocations, and receipt/invoice links.

`FR-ADM-PAYMENT-003`: Financial records with history must be reversed or
corrected, never hard-deleted.

`FR-ADM-PAYMENT-004`: Additional payments require an explicit category and must
not be used to bypass rent invoices.

### 8.8 Reminders and Notifications

`FR-ADM-REMINDER-001`: “Tagihan Bulan Ini” lists current invoice work and
supports resident detail plus a prefilled reminder composer.

`FR-ADM-REMINDER-002`: Resident detail supports a custom reminder composer where
Admin selects one or more unpaid invoices and previews protected template
variables and secure invoice links.

`FR-ADM-REMINDER-003`: Reminder Sewa contains H-30 work and immutable reminder
history. Renewal intent and checkout timing must also support H-60 and H-14
policy events even when they are shown in one unified work queue.

`FR-ADM-NOTIFICATION-001`: Header notifications are internal event records with
unread state and deep links. Header reminder count is separate and derived from
current reminder eligibility.

### 8.9 Vehicles and Parking

`FR-ADM-VEHICLE-001`: Vehicle and parking views must be reachable, searchable,
property-scoped, and linked to the canonical resident, active room, and parking
assignment.

`FR-ADM-VEHICLE-002`: Vehicle detail must support identity, documents, validity,
parking location, history, and a quick link back to resident detail.

### 8.10 Complaints and Maintenance

`FR-ADM-COMPLAINT-001`: Complaints must expose category, severity, SLA,
attachments, resident/room context, technician dispatch, work-order state,
before/after evidence, cost, and resolution history.

`FR-ADM-COMPLAINT-002`: SLA targets are response within one hour; urgent
resolution within two hours, medium within 24 hours, and light within three
days, subject to explicit authorized override.

### 8.11 Expenses

`FR-ADM-EXPENSE-001`: Admin must be able to record operational expenses by date,
category, property, optional building, vendor, method, amount, evidence, notes,
and optional work order.

`FR-ADM-EXPENSE-002`: Expense evidence must support preview before save.
Approved or reported expenses cannot be hard-deleted; corrections require
reversal or supersession.

### 8.12 Reports

`FR-ADM-REPORT-001`: Reports contain Lease, Payment, Expense, and Finance
subpages with date filters, preview, Excel export, and PDF export.

`FR-ADM-REPORT-002`: Exports must use the complete server-filtered dataset, not
the current visible page.

`FR-ADM-REPORT-003`: Finance must distinguish verified rent cash, additional
cash receipts, paid expenses, refundable deposit liability movement,
receivables, arrears, occupancy, and net operational cash flow. It must not be
labelled profit/loss until a separate accrual-accounting authority exists.

### 8.13 Settings and Deferred Integrations

`FR-ADM-PROPERTY-001`: Settings remains the persistent property and account
preference authority.

`FR-ADM-INTEGRATION-001`: Smart Lock, CCTV, payment gateway, automatic email,
and automatic WhatsApp controls must show explicit disabled/unconfigured states
until their adapters and rollout requirements are satisfied.

## 9. Public Catalog Scope

Detailed public and Penghuni behavior is in
[`PUBLIC_AND_PENGHUNI_EXPERIENCE.md`](PUBLIC_AND_PENGHUNI_EXPERIENCE.md).

`FR-PUB-CONTENT-001`: `/kamar` must be accessible without login and render
published KOSTATION property and category content.

`FR-PUB-ROOM-001`: Public results may show category, gender, approximate
availability, price policy, facilities, gallery, terms, planned move-in
compatibility, and CTA. They must not expose exact room number, internal IDs,
resident/occupancy data, or internal building counters.

`FR-PUB-LEAD-002`: The public lead form requires full name, WhatsApp/phone,
email, category, gender, university or education summary, planned move-in, and
consent. Instagram and a short note are optional.

The full identity, parent, KTP, emergency, password, lease, and payment data are
collected only during Admin onboarding, not in the public lead form.

## 10. Penghuni Application Scope

`FR-PEN-AUTH-001`: A resident must be able to sign in using normalized email or
phone and password, then change a temporary password at first login.

`FR-PEN-RESIDENT-001`: Home and Profile use `/my/resident-context` as identity
authority and do not infer room or property from invoice fallback.

`FR-PEN-LEASE-001`: The resident can view current lease, room/category summary,
term, renewal/checkout state, and transfer history relevant to the account.

`FR-PEN-BILLING-001`: The resident can view invoices, allocations, payment
status, receipts, and secure invoice downloads.

`FR-PEN-PAYMENT-001`: Payment proof remains manual while payment gateway is
disabled. Proof submission must not itself mark an invoice paid.

`FR-PEN-COMPLAINT-001`: The resident can submit and follow complaints with
attachments and status history for the canonical context.

`FR-PEN-VEHICLE-001`: The resident can view and maintain permitted vehicle data
within canonical resident context.

`FR-PEN-NOTIFICATION-001`: The resident receives relevant internal
notifications and can follow their deep links without crossing account or
property scope.

## 11. Property Owner Scope

`FR-POW-OWNER-001`: Property Owner onboarding must create or reuse an investor
account and attach a dated building-ownership assignment. Default ownership is
KOSTATION until reassigned.

`FR-POW-OWNER-002`: Property Owner can read dashboards, rooms, active residents,
leases, billing summaries, vehicles, Booking Leads, complaints, notifications,
and reports only for owned buildings.

`FR-POW-OWNER-003`: Property Owner must not mutate operational records and must
not receive resident credentials, KTP media, full sensitive identity, payment
proof secrets, or data from unowned buildings.

## 12. Resident Data Requirements

The onboarding authority must support:

- full legal name;
- email and normalized phone/WhatsApp;
- gender;
- NIK or passport identifier;
- birth place and date;
- residential address;
- university, faculty, study program, and cohort;
- Instagram username, optional;
- parent or guardian name and relationship;
- parent or guardian phone/WhatsApp;
- emergency contact name, relationship, and phone;
- KTP/passport evidence;
- KK/KTM evidence where required;
- resident photo where required;
- marital status for detail only;
- account status;
- notes governed by privacy and retention policy.

List pages expose only operationally useful summary fields. Full identity and
documents stay in authorized detail views.

## 13. Financial Model Requirements

`POL-PAYMENT-007`: DP, rent, security deposit, additional charge, expense,
receivable, revenue, and liability are distinct ledger purposes.

`INV-BILLING-001`: Invoice totals derive from the immutable lease commercial
snapshot and explicit adjustments; later category-price edits do not rewrite
history.

`INV-BILLING-002`: Invoice balance equals charges and valid adjustments minus
verified allocations and credits; no UI-local total is authoritative.

`INV-PAYMENT-001`: A payment equals its allocations plus an explicitly permitted
unallocated balance, and no allocation exceeds invoice outstanding balance.

`INV-PAYMENT-002`: DP reduces rent receivable while security-deposit funding and
refund never settle rent or count as revenue. Payment proof remains evidence,
not confirmation.

`FR-ADM-SETTLEMENT-001`: Detail Penghuni exposes one authoritative contract-rent
balance with contract total, initial rent credit, allocations, remaining amount,
effective deadline, arrears state, and contextual payment action.

`FR-ADM-SETTLEMENT-002`: Admin may record a partial amount through the end of
ordinary D+7 after the two-month deadline. If the single approved extension is
used, partial payment is allowed only through its deadline. After the applicable
partial-payment window, only exact settlement or admin-only termination is
available. A room stays active while overdue.

`FR-ADM-TERMINATION-001`: An admin with `lease.manage` may start a documented
termination case after the final deadline, cancel it after full settlement, and
finalize checkout. Finalization applies deposit to arrears first, then
evidence-backed damage, and records evidence-backed refund of the remainder.

`INV-REPORT-001`: Screen totals, preview, PDF, and Excel for identical filters
come from one server-side authority and reconcile to the same records.

## 14. Cross-Domain Invariants

- `INV-AUTH-001`: Authorization, scope, rollout, and relationship validation
  precede idempotency claim, query expansion, file access, or mutation.
- `INV-PROPERTY-001`: No record may be read, counted, cached, exported, mutated,
  or linked through a different property/building scope.
- `INV-ROOM-001`: Room status changes only through canonical hold,
  lease/occupancy, transfer, checkout/inspection, maintenance, deactivation, or
  reconciliation commands.
- `INV-ROOM-002`: At most one mutually compatible active hold, lease-room
  authority, and occupancy may claim a room.
- `INV-RESIDENT-001`: One person has one canonical resident identity per
  property context; duplicate identity conflicts fail closed.
- `INV-LEASE-001`: Final activation uses the committed account authority and is
  atomic across resident, lease, room, occupancy, billing, lead/hold completion,
  audit, and outbox.
- `INV-OPS-001`: Every material mutation records actor, scope, command, target,
  safe facts, correlation, and time without unnecessary PII.
- `NFR-PRIV-004`: Uploaded evidence is private by default and uses authorized or
  expiring access.
- `NFR-REL-005`: Cache keys include account/property/building scope and stale
  responses cannot overwrite a new scope.

State machines and transaction boundaries are specified in
[`DOMAIN_LIFECYCLE_CONTRACTS.md`](DOMAIN_LIFECYCLE_CONTRACTS.md).

## 15. Non-Functional Requirements

### 15.1 Reliability

- `NFR-REL-001`: Material commands are transactional and idempotent.
- `NFR-REL-002`: Concurrent commands use deterministic locking and return a
  stable replay or domain conflict.
- `NFR-REL-003`: Lists use authoritative totals, deterministic ordering, bounded
  pagination, and explicit empty/out-of-range behavior.
- `NFR-REL-004`: Background expiry or notification workers are bounded,
  replay-safe, and observable.

### 15.2 Accessibility and Responsive Use

- `NFR-A11Y-001`: All core tasks are keyboard-operable with visible focus,
  semantic labels, and appropriate status or alert announcements.
- `NFR-A11Y-002`: Interactive targets are at least 44 by 44 CSS pixels where
  practical.
- `NFR-A11Y-003`: Desktop 1440px and mobile 390px must not introduce horizontal
  page overflow.
- `NFR-A11Y-004`: Tables have a mobile alternative or controlled horizontal
  container without hiding required actions.

### 15.3 Privacy

- `NFR-PRIV-001`: Public responses contain no opaque internal IDs, resident PII,
  exact occupied-room detail, or unpublished media.
- `NFR-PRIV-002`: Admin and Property Owner responses are whitelisted to the task.
- `NFR-PRIV-003`: Passwords, tokens, cookies, database URLs, raw credentials,
  and full payment secrets never enter logs, audits, URLs, caches, exports, or
  documentation evidence.

### 15.4 Performance

- `NFR-PERF-001`: Operational list endpoints avoid N+1 queries and return within
  agreed service budgets on the canonical 163-room property.
- `NFR-PERF-002`: Public media is responsive, lazy-loaded where appropriate, and
  does not block terminal catalog state.
- `NFR-PERF-003`: Export jobs are bounded and may become asynchronous when data
  exceeds the synchronous threshold.

### 15.5 Observability

- `NFR-OBS-001`: Commands and workers emit correlation-safe audit and business
  events.
- `NFR-OBS-002`: Reminder attempts distinguish previewed, opened externally,
  manually marked sent, provider accepted, failed, and cancelled. MVP must not
  claim delivered or read.
- `NFR-OBS-003`: Reconciliation dashboards expose inconsistent room, lease,
  billing, or ownership states without leaking raw records.

## 16. Success Measures

Success is measured by evidence, not by page count:

- 100% visible Admin sidebar routes reach a terminal state for authorized users.
- 100% active occupancies reconcile to one resident, room, property, and lease.
- 100% successful onboardings provision or link exactly one resident account.
- 0 public responses expose exact room identifiers or resident data.
- 0 confirmed payments or approved expenses are hard-deleted.
- Invoice, payment, deposit liability, expense, and finance report totals
  reconcile for the same period and scope.
- Reminder and notification badges clear when their underlying eligibility or
  unread state clears.
- Property Owner queries return zero rows outside owned buildings.
- Required Admin, public, Penghuni, and Property Owner happy paths pass
  automated and runtime gates defined in
  [`QA_ACCEPTANCE_AND_RELEASE_GATES.md`](QA_ACCEPTANCE_AND_RELEASE_GATES.md).

## 17. Explicit Non-Goals for Initial Delivery

- A nationwide marketplace or location-based property search.
- Daily hotel-style booking.
- Multiple residents in one room.
- Mixed-gender room allocation.
- Routine building or room creation.
- Active payment gateway collection or settlement.
- Automatic WhatsApp delivery, delivered/read receipts, or chatbot behavior.
- Automatic email sending before provider configuration.
- Live Smart Lock commands or CCTV streaming.
- Investor write access.
- Deleting historical payments, invoices, leases, residents, reminders,
  expenses, or operational events.

## 18. Owner Confirmations That Do Not Block Planning

Two source-policy ambiguities are held as explicit configuration confirmations:

1. Visitor access uses the conservative 21:00 cutoff until the owner confirms
   whether a later 22:00 exception is intended.
2. Expense approval at or above the binding Rp500.000 boundary remains pending
   higher approval; the exact approver title and workflow await owner
   confirmation and must fail closed until then.

Executors must implement these as named policy/configuration values rather than
embedding unexplained literals.

## 19. Delivery and Change Control

The dependency plan is in
[`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md). Each work package must:

- freeze requirement IDs and current-state evidence;
- include schema, API, UI, migration, fixture, and test work needed for one
  coherent behavior;
- preserve compatibility explicitly or migrate it deliberately;
- produce RED then GREEN evidence;
- pass reviewer finding freeze and final delta audit;
- update [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md);
- avoid claiming runtime verification that was not actually observed.

New product-owner revisions are added through the authority and traceability
process. They do not silently overwrite a completed implementation contract.
