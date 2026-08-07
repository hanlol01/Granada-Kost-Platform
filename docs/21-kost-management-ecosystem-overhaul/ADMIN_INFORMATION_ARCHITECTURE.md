# Admin Information Architecture

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program: `KMO`

Surface: Admin web application

Primary audience: `owner`, `manager`, and `admin`; conditional read-only
experience for `property_owner`

## 1. Purpose and Authority

This document defines the target Admin information architecture, operational
pages, visible labels, cross-page flows, and acceptance behavior. It translates
external screenshots into KOSTATION-native tasks; it does not copy their
navigation, terminology, colors, status model, or unsafe delete behavior.

Implementation must follow:

- `PRODUCT.md` for product boundaries;
- `DESIGN.md` for visual and interaction authority;
- `OWNER_POLICY_DECISIONS_AND_GLOSSARY.md` for business terminology;
- `DOMAIN_LIFECYCLE_CONTRACTS.md` for state transitions;
- `BILLING_REMINDER_NOTIFICATION_REPORTING.md` for money and communication
  detail; and
- this document for Admin page topology and operator experience.

`tenant`, `cabang`, `survey`, and `konversi` are not visible product terms.
Visible copy uses **Penghuni**, **Properti**, **Minat Booking**, **Tahan Kamar**,
**Penyewaan**, and the canonical lifecycle labels.

The `FR-ADM-*-1xx` requirements below refine the PRD's canonical
`FR-ADM-*-0xx` outcomes; they do not replace or renumber those parent
requirements.

## 2. Admin Experience Principles

### FR-ADM-OPS-101 — Operate-first shell

The Admin app must remain a calm, dense operational workspace:

- desktop uses the existing sidebar, header, and content canvas;
- mobile uses the existing priority navigation and “Lainnya” access;
- breadcrumbs identify the current operational context;
- global page actions sit beside the page title, not inside unrelated cards;
- status is always communicated with text plus a non-color cue; and
- internal UUIDs, storage paths, raw enum values, tokens, and provider material
  must not be rendered.

Acceptance:

1. Every visible navigation item opens a terminal page state.
2. A route may not remain visible if it is a placeholder, unregistered, or
   forbidden for the current actor.
3. Mobile and desktop expose the same permitted operations, even when the
   presentation changes from table to cards.

### FR-ADM-OPS-102 — Full-page work versus overlays

Use a full page with breadcrumbs for:

- room detail;
- resident and lease onboarding;
- resident detail;
- payment detail and reconciliation;
- complaint/work-order detail;
- report preview; and
- any workflow with more than one step or multiple related domains.

Use a dialog or sheet only for a bounded action that can be understood without
leaving the current record, such as assigning a technician, recording a
payment, holding a room, reversing a transaction, or confirming a command.

Acceptance:

- closing an overlay returns focus to its trigger;
- browser Back restores the previous list filters and pagination;
- full-page flows can be reloaded without losing the authoritative record
  context; and
- modal content never becomes the only route to a record's complete history.

### FR-ADM-OPS-103 — URL-owned list state

Search, filters, sort, page, and page size must be represented by canonical URL
search parameters where practical. Empty parameters such as `q=` are accepted
and normalized to an unfiltered state.

Acceptance:

- reload and browser navigation preserve list state;
- changing a scope filter resets the page offset;
- malformed parameters fall back safely without crashing;
- list totals remain authoritative when a page is empty or out of range; and
- query state never changes property scope.

### FR-ADM-OPS-104 — Shared operational states

Every data page must provide:

- initial loading;
- background refresh without clearing usable content;
- empty state with the next valid action;
- permission-denied state;
- property-unavailable state;
- recoverable error with Retry;
- invalid response state; and
- stale-scope protection when account, property, or record changes.

Loading must not display invented totals or placeholder personal data.

## 3. Canonical Navigation

The sidebar must use the following task groups. Routes are target URLs; legacy
URLs may remain as redirects, but must not create duplicate navigation entries.

| Group        | Visible item       | Canonical route          | Notes                                 |
| ------------ | ------------------ | ------------------------ | ------------------------------------- |
| Ringkasan    | Dashboard          | `/`                      | Property-wide operational overview    |
| Master Kamar | Ringkasan Kamar    | `/rooms`                 | Fixed inventory authority             |
| Master Kamar | Rumah Kost         | `/rooms/rumah-kost`      | Category view                         |
| Master Kamar | Apart Kost         | `/rooms/apart-kost`      | Category view                         |
| Master Kamar | Fasilitas          | `/rooms/fasilitas`       | Exactly one authority per category    |
| Master Kamar | Galeri             | `/rooms/galeri`          | Category galleries only               |
| Master Kamar | Syarat & Ketentuan | `/syarat-ketentuan`      | Public content authority              |
| Pengelolaan  | Penghuni           | `/tenants`               | Resident + lease operational hub      |
| Pengelolaan  | Pembayaran         | `/payments`              | Invoices and transactions             |
| Pengelolaan  | Tagihan Bulan Ini  | `/payments/current`      | Current payable invoices              |
| Pengelolaan  | Pengeluaran        | `/expenses`              | Operational expense ledger            |
| Pengelolaan  | Kendaraan & Parkir | `/vehicles?tab=vehicles` | Vehicle and parking tabs              |
| Pengelolaan  | Minat Booking      | `/booking-leads`         | Leads, holds, and conversion          |
| Operasional  | Komplain           | `/complaints`            | Complaint dispatch and work orders    |
| Operasional  | Reminder Sewa      | `/reminders/h-30`        | H-30 and history subnavigation        |
| Operasional  | Notifikasi         | `/notifications`         | Internal operational events           |
| Operasional  | Smart Lock         | `/smart-lock`            | Conditional capability                |
| Operasional  | Riwayat Akses      | `/access-history`        | Conditional read-only history         |
| Operasional  | CCTV               | `/cctv`                  | Conditional capability                |
| Analisis     | Laporan            | `/reports/leases`        | Four report subpages                  |
| Sistem       | Pengaturan         | `/settings`              | Property, account, content, templates |

There must be **no standalone main sidebar item named Penyewaan**.
`DEC-RESIDENT-001` makes `/tenants` the operational hub for resident and lease
work.

Legacy compatibility:

- `/penyewaan` redirects to `/tenants`;
- `/penyewaan/tambah` redirects to `/tenants/new`;
- `/penyewaan/:legacyReference` resolves to the corresponding resident detail
  Lease tab when the mapping is authorized;
- `/booking` and `/bookings` redirect to `/booking-leads`;
- `/hunian-gallery` redirects to `/rooms/galeri`;
- `/parking` redirects to `/vehicles?tab=parking`;
- `/reports` redirects to `/reports/leases`; and
- `/rooms/fasilitas?q=` opens successfully with an empty search.

### FR-ADM-OPS-105 — Navigation integrity

The following previously failing entry points must return a usable authorized
page rather than a blank screen, route error, or dynamic-import failure:

- `/vehicles?tab=vehicles`;
- `/complaints`;
- `/reports`; and
- `/rooms/fasilitas?q=`.

Navigation metadata, router registration, breadcrumbs, mobile navigation, and
route access rules must be updated together.

## 4. Dashboard

### FR-ADM-REPORT-101 — Operational dashboard

The Dashboard must answer what needs attention now, not duplicate every report.
Its property-scoped sections are:

1. room inventory: total, vacant, held/reserved, occupied, maintenance, and
   reconciliation-required;
2. lead pipeline: new, contacted, room held, awaiting DP, and ready for
   onboarding;
3. residents and leases: active, ending within 30 days, overdue obligations,
   and move-out actions due;
4. money: current billed, verified receipts, unpaid amount, deposit liability,
   and operational expenses;
5. operations: open complaints, SLA risk, work orders, registered vehicles,
   and parking anomalies; and
6. recent internal notifications.

Each metric must link to the matching filtered page. Totals must come from
authoritative aggregate responses, not the current table page.

### FR-ADM-ROOM-101 — Dashboard room action

The existing **Tambah Kamar** action must be removed or disabled according to
`POL-ROOM-001` and `DEC-ROOM-001`. The dashboard may offer:

- **Lihat Kamar Kosong**;
- **Catat Minat Booking**; and
- **Tambah Penyewaan**.

It must never create room inventory.

## 5. Room Inventory and Category Pages

### FR-ADM-ROOM-102 — Shared room listing

`/rooms`, `/rooms/rumah-kost`, and `/rooms/apart-kost` share one table contract.

Canonical columns:

1. Kamar;
2. Bangunan;
3. Kategori;
4. Jenis Kelamin;
5. Status;
6. Penghuni Aktif; and
7. Aksi.

The category pages may omit the redundant Kategori column. The list must not
show a price column; commercial details belong in room detail.

Search must match room number, building code/name, category label, and active
resident display name. Filters include category, room status, gender policy,
building, floor, active occupancy, and lifecycle anomaly. Search and filters
combine rather than replace one another.

Room status and counts follow `INV-ROOM-001`; the UI may not mutate a room merely
by changing a local status control.

### FR-ADM-ROOM-103 — Fixed inventory

The inventory contains exactly 163 rooms unless a future owner-approved
inventory migration supersedes `POL-ROOM-001`.

Acceptance:

- no Add Room control is rendered;
- no room-create query such as `create=true` opens an editor;
- direct room-create requests remain rejected by the authoritative backend;
- editing existing physical or descriptive attributes remains available to
  authorized operators when lifecycle guards permit it; and
- archived/inactive room history is retained.

### FR-ADM-ROOM-104 — Full-page room detail

Selecting a room opens `/rooms/:roomNumber`, a full page with breadcrumbs. It
contains:

- physical inventory: building, category, floor, size, gender policy, status,
  visibility, and notes;
- category commercial source: monthly display price, annual contract value,
  recommended 25% DP prefill, security-deposit rule, and category facilities;
- ownership: current building owner label, defaulting to KOSTATION;
- active resident summary: name, account status, phone/WhatsApp action,
  university, lease period, and quick link to resident detail;
- lease and occupancy summary: start/end, duration, payment plan, move-in/out,
  and reconciliation state;
- billing summary: contract value, rent allocated, unpaid amount, next due item,
  DP progress, security deposit held/refunded/deducted, and quick link to the
  resident Billing tab;
- vehicle and parking summary with quick link;
- complaints and work orders for the room with quick links;
- room lifecycle/activity timeline; and
- permitted actions: edit room, catat minat booking, hold/release via lead,
  transfer resident, or maintenance action as applicable.

Empty modules must say that no related record exists; they must not disappear in
a way that suggests a loading failure.

### FR-ADM-ROOM-105 — Room editing

Room editing must preserve category-level commercial authority:

- price, deposit rule, and facilities are not edited per room;
- building, floor, room number, public visibility, notes, and physical metadata
  are writable only when the lifecycle allows them;
- gender is inherited from the authoritative building/category rule unless a
  future policy explicitly allows an override;
- active, held, occupied, or maintenance-related structural changes are
  blocked with consequence copy; and
- stale building or category references cannot be submitted.

## 6. Facilities, Gallery, and Terms

### FR-ADM-CONTENT-101 — Category facilities

`/rooms/fasilitas` manages exactly two category records:

- Rumah Kost; and
- Apart Kost.

Each record contains the ordered facility list and optional public description.
Facilities apply to every room in the category; there is no per-room facility
assignment in the normal Admin flow.

The page provides category cards, search within facilities, Edit, Reorder,
Preview Public, and publication state. Duplicate labels within one category are
rejected after normalization.

### FR-ADM-CONTENT-102 — Category gallery

`/rooms/galeri` manages two independent galleries, Rumah Kost and Apart Kost.
The target model does not ask the operator to classify images as lobby, kitchen,
shared area, or another photographic subcategory.

Each category gallery supports:

- upload one or more images;
- client preview before save;
- caption and alt text;
- drag/reorder;
- select cover image;
- publish/unpublish;
- safe archive with history; and
- public preview.

File type, size, dimensions, access, and malware rules come from the mediated
file contract. A failed upload must not create a gallery record.

### FR-ADM-CONTENT-103 — Terms and public content

`/syarat-ketentuan` owns the public terms, house rules, pricing explanation,
DP/deposit explanation, payment method statement, minimum lease term, and
contact information.

The page provides:

- Draft and Published states;
- last published timestamp and actor;
- structured sections rather than one unbounded text blob;
- Preview Public;
- publish confirmation; and
- version history with restore-as-new-draft.

Publishing must atomically switch the public content version; visitors must
never receive a mixture of two versions.

## 7. Penghuni as the Resident + Lease Hub

### FR-ADM-RESIDENT-101 — Resident list

`/tenants` is titled **Data Penghuni & Penyewaan**. Its primary actions are:

- **Tambah Penyewaan**; and
- **Berakhir Bulan Ini**, a toggle/filter for active leases ending in the
  current calendar month.

There is no standalone **Tambah Penghuni** action because a resident account is
created as part of a valid lease onboarding flow.

Canonical columns:

1. No.;
2. Nama Penghuni;
3. No. Unit Kamar;
4. Universitas;
5. Durasi Sewa;
6. Status Akun; and
7. Aksi.

Search covers resident name, normalized phone, email, room number, university,
and business reference. Filters include account status, lease status, category,
gender, building, end period, unpaid state, and active/archived.

### FR-ADM-RESIDENT-102 — Expandable row summary

Each row has a dedicated expand control with `aria-expanded`. Expanded content
shows:

- lease start and end;
- remaining days;
- payment plan;
- billed, paid, and unpaid totals;
- next due item;
- room/category; and
- operational notes safe for the list.

Expansion does not replace the full detail page and does not fetch or expose KTP
images, full NIK, credentials, or emergency-contact detail.

### FR-ADM-RESIDENT-103 — Resident actions

Row actions are:

- **Detail**;
- **Edit**; and
- **Lainnya**, containing Move Room, deactivate/archive, or another permitted
  lifecycle command.

Permanent Delete is available only for a mistaken draft with no lease,
occupancy, invoice, payment, vehicle, complaint, file, audit, or activity
history. All other records use deactivate/archive and remain reportable.

### FR-ADM-LEASE-101 — Direct onboarding flow

`/tenants/new` is a full-page two-stage flow:

1. **Penghuni & Penyewaan**; and
2. **Pilih Kamar Kost**.

Stage 1 captures:

- full name;
- gender;
- email;
- normalized phone/WhatsApp;
- NIK, birth place, birth date, and address, optional;
- marital status;
- university, faculty/major, and cohort, optional;
- Instagram username, optional;
- parent/guardian name/relationship, guardian phone/WhatsApp, and emergency
  contact, optional;
- KTP upload, optional, with preview, replace, removal, supported-type feedback,
  and a maximum size defined by the upload contract;
- lease start and end;
- a whole-number term from 3 through 120 months, with 3-, 6-, and 12-month
  shortcuts;
- derived schedule and date label, with a historical/current/future start date
  selected by the operator;
- notes; and
- required acknowledgements.

Existing eligible residents can be searched and selected; their identity fields
become read-only unless Edit is explicitly entered. A bounded **Tambah Data
Penghuni** action inside the flow may create the draft identity, but it must not
activate an account or occupancy by itself.

Stage 2 lists only vacant, gender-compatible rooms. It provides category,
building, and room search; Rumah Kost/Apart Kost category filters; and columns
No., Kategori, Kamar, Gender, Status, and Pilih.

Selecting one room disables other Select controls until **Batalkan Pilihan** is
used. The selection summary shows category, room number, category tariff,
lease/payment plan, gender, floor, minimum initial-rent credit, Booking Fee,
DP, and optional security deposit.

The final confirmation “Saya meyakini data yang saya masukkan telah sesuai” is
mandatory. Save remains disabled until both stages pass authoritative
validation.

### FR-ADM-LEASE-102 — Lead-originated onboarding

Starting onboarding from a Booking Lead pre-fills only data that the lead
authoritatively owns.

- Admin quick-entry lead may already carry a selected room.
- Public lead carries category and gender but no exact room.
- A current active hold may preselect its room.
- Expired, released, cross-property, occupied, or gender-incompatible room
  references must be rejected and require a new selection.
- Pre-filled values remain reviewable and mandatory missing fields remain
  visible.

Lead conversion and direct onboarding must converge first on the same atomic
onboarding-commit command, then on the same lease-activation command when the
agreed start/check-in boundary is reached.

### FR-ADM-AUTH-101 — Resident account provisioning

The resident application account is provisioned only when the atomic onboarding
commit succeeds under `INV-RESIDENT-001` and `INV-LEASE-001`. A future-start
resident remains `pending_activation`, the lease remains `awaiting_activation`,
and no occupancy is opened until the separate activation command succeeds.

The flow must:

- reconcile an existing user by normalized email and phone;
- reject conflicting identities;
- create or reuse the user;
- assign the property-scoped `resident` role;
- link the resident record;
- create the pending resident, awaiting-activation lease, invoice plan, room
  reservation, financial commitment, audit, and outbox atomically;
- generate a one-time server-generated temporary password for a new account;
- return it only through a dedicated, authorized, non-cacheable one-time receipt
  that the Admin may copy for the approved out-of-band handoff;
- make that plaintext unretrievable after the receipt is dismissed, while never
  placing it in ordinary API/page data, cache, toast, audit, outbox, telemetry,
  URL, export, or log; and
- require password change at first login.

The Admin UI records that the handoff is ready/completed, but cannot reopen or
retrieve the temporary or stored password. Failed provisioning rolls back the
entire onboarding commitment. Final activation later revalidates the committed
resident, room, lease, finance, and check-in prerequisites before opening
occupancy and marking the room occupied.

### FR-ADM-RESIDENT-104 — Full resident detail

`/tenants/:residentCode` is a full page with:

- resident header, active state, room, and primary permitted actions;
- always-visible **Ringkasan Penyewaan dan Pembayaran** card;
- tabs **Ringkasan**, **Penyewaan & Kamar**, **Tagihan & Pembayaran**,
  **Kendaraan**, **Komplain**, and **Aktivitas**.

The summary card must show:

- unpaid rent;
- paid rent;
- total scheduled rent;
- DP received and allocated;
- security deposit held, deducted, refundable, or refunded;
- lease notes;
- lease start and end;
- remaining days;
- current payment plan; and
- next required action.

The identity area includes complete authorized resident information, KTP preview
through mediated access, marital status, parent/emergency contacts, university
data, direct WhatsApp action, and account state. Highly sensitive values are
masked until a permitted deliberate reveal.

### FR-ADM-RESIDENT-105 — Related records and activity

Resident detail must show:

- current and historical rooms/leases;
- invoices, receipts, reversals, and other transactions;
- vehicles and parking assignment with quick links;
- complaints and work orders with quick links;
- notifications and reminders; and
- one chronological activity timeline for significant domain events.

The timeline is a projection of immutable domain events/audit entries, not a
free-text log. Each item identifies event type, safe summary, timestamp, actor
label, and link to the related authorized detail.

### FR-ADM-BILLING-103 — Resident billing workspace

The resident **Tagihan & Pembayaran** tab keeps the summary card visible and
provides four bounded views:

- **Tagihan Belum Dibayar**;
- **Tagihan Sudah Dibayar**;
- **Menunggu Konfirmasi**; and
- **Transaksi Lainnya**.

Each label includes an authoritative count. The unpaid view supports selecting
one or more invoices for **Catat Pembayaran** or **Kirim Reminder**. Paid and
pending views link to the payment/proof detail. Other transactions remain
categorized and separate from rent.

The page-level actions are **Kirim Pesan Reminder**, **Catat Pembayaran**, and
the direct WhatsApp contact when configured. They reuse the canonical reminder
and payment authorities rather than creating resident-specific copies.

### FR-ADM-LEASE-103 — Move room

**Pindah Kamar** starts from resident detail and requires:

- active resident, lease, and occupancy;
- reason;
- effective date;
- destination that is vacant, same-property, gender-compatible, and not already
  selected by another command;
- preview of billing/lease consequences; and
- final confirmation.

Normal transfer takes effect at the next agreed billing boundary. Emergency
same-day transfer is a separately permissioned exception.

The old room moves to inspection-required, then vacant or maintenance after
inspection. The resident remains active; the system creates linked transfer
history/addendum rather than re-entering identity data or deactivating and
recreating the resident.

## 8. Booking Leads, Holds, DP, and Conversion

### FR-ADM-LEAD-101 — Lead table

`/booking-leads` uses columns:

1. Calon Penyewa;
2. Minat;
3. Universitas;
4. Jenis Kelamin;
5. Status;
6. Masuk; and
7. Aksi.

`Tanggal Pindah` is not a table column. Minat shows category and, only for an
Admin quick-entry lead, the preselected room. Public leads never imply an exact
room.

Search covers name, phone, category, university, and business reference.
Filters include source, status, category, gender, hold state, and created period.

### FR-ADM-LEAD-102 — Lead actions

Permitted actions are state-derived:

- contact via WhatsApp;
- mark contacted;
- hold or change room;
- release hold;
- reject;
- expire; and
- **Disewa** when financial and room prerequisites are met.

Survey and generic Convert actions are removed. A completed leased lead has no
further progression action.

### FR-ADM-LEAD-103 — Room hold

A public lead must first receive an operator-selected vacant room compatible
with its category and gender. An Admin lead can reuse its valid preselected
room. **Tahan Kamar** creates the canonical 24-hour hold and moves the room to
the authoritative reserved state without creating a lease or occupancy, per
`INV-LEAD-001`.

The UI shows hold start, expiry countdown based on server time, room, and
Release/Change actions. Expiry, release, or conflict refreshes all related room,
lead, dashboard, and availability views.

### FR-ADM-PAYMENT-101 — DP and security-deposit capture

**Disewa** opens a financial confirmation before onboarding:

- optional Booking Fee amount and method;
- rent DP / initial-rent-credit amount and method;
- optional security-deposit amount and method;
- payment date;
- bank/cash reference;
- transfer proof when applicable; and
- notes.

Verified Booking Fee and DP together must meet `POL-PAYMENT-001` and are
allocated against rent. A Booking Fee is either Rp0 or at least Rp1.000.000.
Security deposit is a separate optional liability under `POL-PAYMENT-002`; Rp0
is valid. Transfer is primary and cash is an audited exception under
`POL-PAYMENT-003`.

The UI must not label the three amounts interchangeably. An insufficient initial
rent credit, missing proof for transfer, invalid hold, or unavailable room blocks
activation. A zero security deposit does not block activation. Successful capture
continues to the resident/lease onboarding flow.

## 9. Billing and Payments

### FR-ADM-BILLING-101 — Payment workspace

`/payments` has two primary tabs:

- **Tagihan**: invoice obligations; and
- **Transaksi Pembayaran**: recorded cash/transfer receipts and reversals.

Shared filters include resident, room, category, building, invoice period,
transaction date, status, payment method, transaction type, and code. Search
must not mix invoice due date with payment transaction date.

Summary cards show billed, verified paid, unpaid, pending verification, rent DP,
security-deposit liability, refunds, and other transactions separately.

### FR-ADM-BILLING-102 — Current-month bills

`/payments/current` is derived from current-period invoices, not a copied table.
Columns:

1. No.;
2. Penghuni;
3. Kamar;
4. Periode Tagihan;
5. Jatuh Tempo;
6. Nilai;
7. Status; and
8. Aksi.

Expandable detail shows paid allocation, outstanding amount, and billing notes.
Actions are **Lihat Rincian** and **Kirim Reminder**.

### FR-ADM-PAYMENT-102 — Record rent payment

From unpaid invoices, **Catat Pembayaran** opens a bounded dialog:

- method: Transfer Bank or Tunai;
- payment date;
- selected unpaid invoices;
- amount per allocation and computed total;
- transfer proof, mandatory for transfer;
- optional cash receipt evidence;
- notes; and
- confirmation.

One payment may allocate to multiple invoices. It must never merge those
invoices into one obligation. The generated receipt references every allocation.

### FR-ADM-PAYMENT-103 — Payment history and detail

Paid history columns:

1. No.;
2. Kode Pembayaran;
3. Metode;
4. Tanggal Pembayaran;
5. Total;
6. Bukti;
7. Keterangan; and
8. Receipt/Invoice.

Selecting a payment opens a full detail with allocation rows, proof preview,
receipt download, actor/timestamp, and reversal history.

Payments are not hard-deleted. **Batalkan Pembayaran** requires reason,
permission, impact preview, and creates a reversal that restores invoice
balances atomically while preserving the original transaction.

### FR-ADM-PAYMENT-104 — Other transactions

**Pembayaran Lainnya** is only for a categorized resident-related receipt that
is not rent, DP, or security deposit. The form captures category, method, date,
nominal amount, evidence, and explanation. Rent must always use an invoice.

Correction uses reversal and a new transaction, never hard delete or in-place
history rewriting.

## 10. Expenses

### FR-ADM-EXPENSE-101 — Expense ledger

`/expenses` lists:

1. No.;
2. Tanggal;
3. Kategori;
4. Scope Properti/Bangunan;
5. Vendor;
6. Metode;
7. Nominal;
8. Bukti;
9. Keterangan;
10. Status; and
11. Aksi.

Filters include date range, category, building, method, approval state, vendor,
and linked work order.

### FR-ADM-EXPENSE-102 — Record expense

**Tambah Pengeluaran** captures category, date, amount, property/building scope,
vendor, payment method, evidence, description, and optional work-order
reference. The file must be previewable before save.

Expense approval follows owner policy thresholds. Posted expenses cannot be
hard-deleted; use cancel/reverse with reason and audit.

## 11. Reminder and Notification Surfaces

### FR-ADM-REMINDER-101 — Reminder navigation

Sidebar **Reminder Sewa** contains:

- `/reminders/h-30` — Reminder H-30; and
- `/reminders/history` — Riwayat Reminder.

Message templates are managed under Settings, not as a third operational
reminder page.

### FR-ADM-REMINDER-102 — H-30 workspace

The `Reminder H-30` destination is the one lease-ending reminder workspace. Its
default H-30 view lists active leases with 0–30 days remaining, while a
milestone filter exposes clearly labelled H-60 renewal-intent and H-14 checkout
groups in the same workspace. H-60 and H-14 rows must never be labelled H-30 or
implemented as parallel queues or sidebar destinations.

Columns:

1. No.;
2. Nama Penghuni;
3. Kamar;
4. Tanggal Selesai;
5. Hari Tersisa;
6. Tagihan Belum Lunas;
7. Status Reminder; and
8. Aksi.

Actions are **Lihat Detail** and **Kirim Reminder**. An information tooltip
explains that the page shows leases approaching their end date and the remaining
financial obligations, without claiming that payment alone renews a lease.

Renewal, transfer, checkout, cancellation, or completion removes a work item
when it no longer meets that milestone's criteria. Paying an invoice removes
only its unpaid indicator, not an otherwise eligible lease-ending reminder.

### FR-ADM-REMINDER-103 — Reminder composer

There is one shared composer with two entry modes:

- Current-month bill starts with the selected invoice locked.
- Resident detail allows the operator to select one or more unpaid invoices.

The preview updates from protected template variables. Selected periods,
totals, lease period, due dates, resident/room labels, and secure invoice links
must be resolved server-side.

Initial delivery is manual according to `DEC-REMINDER-001`:

- **Buka WhatsApp** opens a `wa.me` draft;
- email delivery remains unavailable until a configured provider is ready; and
- UI must not claim sent, delivered, or read merely because an external window
  opened.

The operator may explicitly mark the manual handoff as completed, producing a
history record with channel and timestamp.

### FR-ADM-REMINDER-104 — Reminder history

History columns include No., reference, resident, purpose, channel, created
time, actor, outcome, and Action. Expand shows a safe message excerpt; **Lihat
Selengkapnya** opens the immutable snapshot.

History is archived, not hard-deleted. It must preserve which template version,
resolved invoice references, and channel action were used without storing
credentials or tokens.

### FR-ADM-NOTIFICATION-101 — Internal notifications

The header bell shows internal operational events, not reminder tasks. Examples
include new public lead, payment proof awaiting review, overdue invoice,
complaint SLA risk, work-order update, lease anomaly, and failed operation.

The popover shows the latest items and links to `/notifications`. Read/unread
state is user-specific. Counts are derived/refetched and must clear when the
underlying condition is resolved according to domain rules.

Notification and reminder badges are separate controls and separate counts.

## 12. Vehicles and Parking

### FR-ADM-VEHICLE-101 — Unified vehicle workspace

`/vehicles` has tabs:

- `tab=vehicles` — registered resident vehicles; and
- `tab=parking` — current parking assignment and capacity.

The route must accept direct entry to either tab without a blank page.

Vehicle columns include resident, room, vehicle type, plate, make/model, color,
registration state, parking assignment, and actions. Search covers resident,
room, and plate. Filters include type, active state, building, and assignment.

### FR-ADM-VEHICLE-102 — Vehicle detail

Vehicle detail is a full page or route-backed detail containing owner resident,
room/lease, registration documents, parking assignment, activity, and quick
links. Edit and archive respect active lease and property scope. Permanent
delete is limited to history-free mistaken drafts.

### FR-ADM-VEHICLE-103 — Parking management

Parking shows capacity and occupancy by building/zone, assignments, anomalies,
and vehicles without valid assignment. Reassignment records reason and history.
It must not infer a resident or room from a plate string alone.

## 13. Complaints and Maintenance

### FR-ADM-COMPLAINT-101 — Complaint list

`/complaints` lists complaint code, resident, room, category, priority, status,
created time, SLA state, assigned technician, and actions.

Filters include status, priority, category, building, technician, SLA state,
created period, and resident/room search. The route must always reach a terminal
state and not depend on a stale dynamic module.

### FR-ADM-COMPLAINT-102 — Complaint detail and dispatch

Complaint detail is a full page with:

- resident and room context;
- description and mediated attachments;
- status and SLA timeline;
- technician assignment/reassignment;
- linked work order;
- work history, material, expense, and before/after evidence;
- internal notes separated from resident-visible updates; and
- lifecycle actions permitted by the canonical maintenance contract.

Assigning a technician uses the authoritative picker and creates or updates the
complaint-linked work order atomically. Multiple actionable work orders are an
anomaly and disable dispatch until reconciled.

### FR-ADM-COMPLAINT-103 — Maintenance view

Maintenance workload may be presented as a tab within `/complaints` or a
subroute `/complaints/work-orders`; it must not create a second authority.
Operators can filter work orders by technician, status, priority, building, SLA,
and schedule. Completed/verified work remains read-only history.

## 14. Reports

### FR-ADM-REPORT-102 — Report navigation

`/reports` contains:

- `/reports/leases` — Penyewaan;
- `/reports/payments` — Pembayaran;
- `/reports/expenses` — Pengeluaran; and
- `/reports/finance` — Keuangan.

The fourth report is **Keuangan**, not a second generic Pemasukan page.

Every report uses:

- date range;
- domain-specific filters;
- **Tampilkan**;
- Reset;
- **Preview**;
- **Export Excel**; and
- **Export PDF**.

Filter state is URL-owned. Table pagination is server-authoritative. Preview and
exports use the complete filtered dataset, never just the visible page.

### FR-ADM-REPORT-103 — Lease report

The lease report supports date basis **Aktif dalam periode** (default),
**Mulai dalam periode**, and **Berakhir dalam periode**, plus status, category,
building, gender, and payment plan.

Columns include business lease code, resident, room, snapshot tariff, start,
end, plan, notes, and lifecycle status. Expand shows concise lease detail.

### FR-ADM-REPORT-104 — Payment report

The payment report uses actual transaction dates and supports status, method,
transaction type, resident, room, and code.

Columns include payment code/status, resident, method, room, type, transaction
date, allocated period, verified total, proof availability, and notes.

Verified rent receipts, DP, security-deposit liability, refunds, reversals, and
other receipts must remain distinguishable.

### FR-ADM-REPORT-105 — Expense and finance reports

Expense columns are date, category, scope/building, vendor, method, nominal,
proof availability, status, and description.

Finance v1 is explicitly a cash-flow report:

- verified inflow;
- valid expenses and refunds;
- net cash movement; and
- security-deposit movement shown as liability, not revenue.

It must not be labeled a full profit-and-loss statement until accounting
recognition rules are separately approved.

### FR-ADM-REPORT-106 — Preview and export

Preview is a full page with report title, property/building scope, period,
filters, summaries, table, generation time, and actor label.

Excel exports use typed number/date cells and separate Summary, Detail, and
Allocation sheets where applicable. PDF uses landscape layout for wide tables,
repeated headers, page numbers, and no large embedded evidence files.

## 15. Settings and Conditional Operations

### FR-ADM-PROPERTY-101 — Settings sections

`/settings` retains:

1. Profil Properti;
2. Preferensi Akun;
3. Tampilan.

It adds bounded sections or subroutes for:

- public contact and WhatsApp number;
- category pricing and deposit policy;
- reminder templates and protected variables;
- public terms publication;
- file limits;
- feature/rollout visibility; and
- investor/building ownership administration for authorized global operators.

Dirty forms must survive background refetch. Property switch resets only
property-scoped drafts; account preference remains account-scoped.

### FR-ADM-INTEGRATION-101 — Smart Lock, access history, and CCTV

Smart Lock, access history, and CCTV pages remain conditional:

- absent/invalid/disabled rollout hides mutation controls;
- read-only diagnostics can remain available when their independent read
  authority is enabled;
- mock/provider-unavailable states must be explicit;
- no interface may claim a live unlock, stream, or device state without
  provider evidence; and
- external credentials and raw provider responses are never displayed.

### FR-ADM-OWNER-101 — Investor administration entry

Authorized global operators manage building ownership from the building/room
context or a Settings subpage. They can view current owner, ownership history,
assign or transfer ownership, and provision a Property Owner account.

The operation is full-page or a route-backed workflow with effective date,
investor identity, building selection, agreement reference, credential
provisioning, impact preview, and confirmation. It never assigns ownership at a
single-room level.

## 16. Cross-page Operational Flows

### Flow A — Public lead to active resident

1. Public visitor submits category + gender interest.
2. Admin reviews the new lead and contacts the candidate.
3. Admin selects a compatible vacant room and creates a 24-hour hold.
4. Admin records qualifying Booking Fee and/or DP, plus an optional security
   deposit when one is agreed.
5. **Disewa** opens pre-filled resident and lease onboarding.
6. Missing identity/education/guardian/document fields are completed.
7. **Commit Onboarding** atomically provisions/links the account, creates the
   pending resident and awaiting-activation lease, freezes the invoice plan,
   records DP/deposit, preserves the room reservation, and returns any one-time
   credential receipt.
8. At the agreed start/check-in boundary, **Activate Lease** revalidates all
   authorities and atomically opens occupancy, marks the room occupied, activates
   the resident/lease, and closes the lead as leased.
9. Success opens resident detail; future-start commitments remain visibly
   upcoming until activation.

### Flow B — Admin quick lead

1. Admin starts from a vacant room and uses **Catat Minat Booking**.
2. The lead carries the selected room as interest, not as occupancy.
3. Contact, hold, financial confirmation, and onboarding reuse Flow A.

### Flow C — Direct resident onboarding

1. Admin chooses **Tambah Penyewaan** from `/tenants`.
2. Admin enters or selects resident identity and lease terms.
3. Admin selects one compatible vacant room.
4. DP/deposit and mandatory evidence are recorded.
5. The same onboarding-commit command used by lead conversion records the
   future/current agreement.
6. The same activation command completes occupancy only at the valid
   start/check-in boundary.

### Flow D — Monthly rent collection

1. Current-period invoice appears in `/payments/current`.
2. Admin may open detail or compose a reminder.
3. Admin records cash/transfer payment against one or more invoices.
4. Transfer proof is reviewed; verified allocation updates invoice balances.
5. Receipt and payment history become available from resident and payment
   detail.
6. Correction uses reversal, not delete.

### Flow E — Complaint dispatch

1. Complaint enters `/complaints`.
2. Admin verifies resident/room context and priority.
3. Assign Technician creates or reuses one actionable work order.
4. Technician progress, evidence, expense, and SLA update the same detail.
5. Completion/verification closes the operational task without deleting
   history.

## 17. Responsive, Accessibility, and Content Requirements

### NFR-A11Y-001 — Keyboard and focus

All routes, tabs, filters, expanders, menus, dialogs, sheets, file previews, and
full-page actions must work with keyboard only. Focus-visible is required;
dialogs trap and restore focus; validation is linked through `aria-describedby`;
errors use `role="alert"` and neutral empty states use `role="status"`.

### NFR-A11Y-002 — Tables and mobile cards

Desktop tables have semantic headers, captions or accessible names, sortable
state, and a scroll container when needed. On mobile, complex rows may become
cards, but must retain the same identity, status, critical facts, and actions.
The page itself must not horizontally overflow.

### NFR-PRIV-001 — Sensitive display

Full NIK, identity files, parent/emergency contacts, financial evidence, and
private notes are displayed only in an authorized detail context, masked by
default where appropriate, and never included in list URL state, toast copy, or
export unless the report explicitly requires and authorizes them.

### NFR-REL-001 — Stale scope and command safety

Property, account, record, and authoritative reference are revalidated before a
request and after its response. Double submit is synchronously guarded.
Idempotency keys remain stable for one logical retry and rotate when payload,
scope, or target changes.

### NFR-PERF-001 — Dense data performance

Lists use bounded server pagination. Relationship-heavy detail screens use
bounded aggregate endpoints or parallel scoped queries, not client-side scans
of every page. Search is debounced without using fixed sleeps as correctness
authority.

## 18. Admin Acceptance Checklist

The Admin experience is not complete until:

1. every canonical sidebar and legacy compatibility route reaches a valid state;
2. Add Room and standalone Penyewaan navigation are absent;
3. the three resident entry paths converge on one activation authority;
4. public leads cannot carry or reveal an exact room;
5. DP, security deposit, rent invoice, payment, and expense remain distinct;
6. full room and resident details expose all authorized related operational
   records with quick links;
7. payments and history use reversal/archive rather than unsafe hard delete;
8. reminder and notification responsibilities remain separate;
9. report preview/export matches filters and full authoritative totals;
10. `property_owner` sees only building-scoped read-only content defined in its
    separate contract;
11. all pages satisfy loading, empty, denied, error, stale-scope, responsive,
    dark/light, and keyboard behavior; and
12. implementation evidence advances each referenced requirement from APPROVED
    only after automated and runtime gates pass.
