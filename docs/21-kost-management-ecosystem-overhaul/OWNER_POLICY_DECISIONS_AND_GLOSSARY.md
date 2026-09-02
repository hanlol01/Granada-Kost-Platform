# Owner Policy, Product Decisions, and Canonical Glossary

<!-- Canonical matrices intentionally use compact Markdown for stable review diffs. -->
<!-- prettier-ignore-start -->

Status: **APPROVED POLICY — IMPLEMENTATION PARTIAL**

Program: `KMO` — KOSTATION Kost Management Ecosystem Overhaul

Recorded: 2026-08-03 (Asia/Jakarta)

## 1. Purpose and Authority

This document converts the property-owner source, the completed product-owner
revision discussion, and repository evidence into binding business policy for
future implementation.

It does not prove that any requirement is implemented, migrated, tested, or
runtime verified. An executor must treat all entries as target behavior until
the traceability matrix records evidence against the final implementation.

Authority is resolved in this order:

1. The product owner's latest explicit decision.
2. This document.
3. `docs/18-public-hunian-catalog/master-data/master_data_kostation.md`.
4. The other documents in this overhaul package.
5. `PRODUCT.md` and `DESIGN.md`.
6. Current source code as implementation evidence.
7. Historical plans and third-party screenshots as reference only.

An external screenshot never imports another product's business terms, status
model, branch model, pricing, capacity, or deletion behavior into KOSTATION.

## 2. Requirement Identifier Rules

| Namespace | Meaning |
| --- | --- |
| `POL-<DOMAIN>-NNN` | Binding property-owner or operating policy |
| `DEC-<DOMAIN>-NNN` | Binding product decision for the overhaul |
| `INV-<DOMAIN>-NNN` | Invariant that must hold across surfaces and commands |

IDs are permanent. A superseded requirement remains in the conflict register
and is never reassigned to another meaning.

Canonical domains are `AUTH`, `PROPERTY`, `OWNER`, `ROOM`, `CONTENT`, `PUBLIC`,
`LEAD`, `RESIDENT`, `LEASE`, `BILLING`, `PAYMENT`, `REMINDER`, `NOTIFICATION`,
`EXPENSE`, `VEHICLE`, `COMPLAINT`, `REPORT`, `INTEGRATION`, and `OPS`.

## 3. Binding Owner Policy Register

### 3.1 Property, Building, Room, and Content

| ID | Binding policy |
| --- | --- |
| `POL-PROPERTY-001` | Granada Student House Jatinangor is managed as a property with property-scoped operational and financial records. Future additional properties must not weaken isolation. |
| `POL-PROPERTY-002` | A building or unit building is the ownership and operational grouping above rooms. It is not a branch and must not be labelled `cabang`. |
| `POL-ROOM-001` | The canonical demo property contains exactly 163 existing rooms. Normal Admin operation must not create or delete rooms or buildings. Inventory correction requires a separately authorized reconciliation task. |
| `POL-ROOM-002` | One room has a maximum occupancy of one resident. Couples, children, additional occupants, and pets are not supported by the current operating policy. |
| `POL-ROOM-003` | Every rentable room has an authoritative male or female policy. Mixed-gender rooms are prohibited. Resident gender and room gender must be compatible before hold, lease activation, occupancy, or transfer. |
| `POL-ROOM-004` | A room must belong to exactly one authoritative building, category, property, and floor reference. These relationships may not be inferred from display names. |
| `POL-CONTENT-001` | Facilities are category-level commercial content: one authoritative facility set for Rumah Kost and one for Apart Kost. A normal room does not override the category facility set. |
| `POL-CONTENT-002` | Gallery content is category-level: Rumah Kost and Apart Kost each own an ordered image collection. Labels such as lobby, kitchen, and shared area are not required classifications. |
| `POL-CONTENT-003` | Terms and house rules are managed content and must be available to both Admin and the public catalog. Published content must be versioned so a signed lease can retain the accepted version. |
| `POL-CONTENT-004` | Public facilities, gallery, price, location, and terms must come from persisted Admin-managed authority, not hard-coded public-page copy. |

### 3.2 Pricing, Lease, DP, Deposit, and Payment

| ID | Binding policy |
| --- | --- |
| `POL-BILLING-001` | Initial category tariff is Rp1.800.000 per month and Rp21.600.000 per year for both Rumah Kost and Apart Kost. Tariffs remain editable at category authority; ordinary room editing must not create a room-specific tariff. |
| `POL-BILLING-002` | Ordinary direct onboarding supports a minimum term of three months. The current form offers 3, 6, and 12-month shortcuts and accepts an integer term from 3 through 120 months. Contract rent is derived from the category commercial snapshot; a term that is an exact multiple of 12 may use the annual category rate. |
| `POL-BILLING-003` | A lease stores a commercial snapshot of tariff, deposit requirement, payment schedule, and accepted terms. Later category edits must not rewrite an existing contract. |
| `POL-LEASE-001` | Minimum lease duration is three months. A 1–2 month term is not an ordinary option and requires a future owner-approved exception policy. |
| `POL-LEASE-002` | Admin may record a valid historical, current, or future contractual start date. The start date is contractual data; activation/check-in remains a separate lifecycle command with its own readiness checks. |
| `POL-LEASE-003` | Lease activation requires an accepted agreement, authoritative resident, authoritative room, required financial readiness, and check-in readiness. A lead, hold, or payment alone is not an active lease. |
| `POL-LEASE-004` | Renewal requires agreement and an addendum or successor lease. A late physical arrival does not shift the contract start date automatically. |
| `POL-PAYMENT-001` | DP is advance rent and proof of commitment. The system pre-fills a 25% recommended initial-rent credit, but an authorized admin may record a lower agreed amount. Verified DP and an eligible Booking Fee reduce rent; neither is a security deposit. |
| `POL-PAYMENT-002` | The security deposit is separate from rent, DP, and Booking Fee. It is an optional, freely entered refundable liability with no minimum amount. A value of Rp0 is valid. An amount recorded for a lease must remain separately traceable until documented refund or deduction at checkout. |
| `POL-PAYMENT-009` | Booking Fee is optional: either Rp0 or at least Rp1.000.000. It is an advance rent credit that reduces the remaining contract rent and may contribute to the required 25% initial rent credit. It never funds, reduces, or substitutes for the security-deposit liability. |
| `POL-PAYMENT-003` | Bank transfer is the primary payment method. Cash is an audited operational exception and requires an authorized recorder and a generated receipt. |
| `POL-PAYMENT-004` | Every payment must be recorded. Transfer proof is mandatory; cash proof is optional because the system-generated receipt and recorder audit are the evidence. |
| `POL-PAYMENT-005` | One verified payment may settle multiple invoices through explicit allocations. A payment total and its allocation total must reconcile exactly. |
| `POL-PAYMENT-006` | Security deposit money is a liability, not rental income. Deposit deductions require itemized evidence; the remainder is refundable no later than seven working days after checkout settlement. |
| `POL-PAYMENT-007` | Rent, Booking Fee, DP, deposit, refund, expense, and other payment are distinct accounting purposes. A generic note must not be the only classification. |
| `POL-PAYMENT-008` | All receipts, invoices, transfer evidence, reversals, deposit deductions, and refunds must be retained as operational records. |

### 3.3 Resident, Check-In, House Rules, and Check-Out

| ID | Binding policy |
| --- | --- |
| `POL-RESIDENT-001` | Check-in data must include verified identity, active phone, family or emergency contact, required identity documents, vehicle data when applicable, and an accepted lease. |
| `POL-RESIDENT-002` | The complete resident record may include full name, gender, NIK, birth place/date, email, phone/WhatsApp, address, KTP, KK or KTM as applicable, university/faculty/major/cohort, optional Instagram, parent name and phone, emergency contact, and marital status. |
| `POL-RESIDENT-003` | Resident credentials are operational access credentials, not lead fields. A lead does not receive a Penghuni account. |
| `POL-RESIDENT-004` | Check-in includes key/access handover, room-inventory checklist, and room-condition documentation. |
| `POL-RESIDENT-005` | A checkout request normally requires at least 14 days' notice, settlement of bills, key/access return, and room inspection. |
| `POL-RESIDENT-006` | The resident must preserve cleanliness, shared facilities, security, quiet, and lawful use as stated in the accepted terms. Violations and sanctions must be recorded; sanctions must not be silently inferred from a complaint. |
| `POL-RESIDENT-007` | Resident operational history—including leases, rooms, payments, complaints, vehicles, notices, and activity—must remain available after deactivation. |

### 3.4 Operations, Maintenance, Vehicle, Finance, and Reporting

| ID | Binding policy |
| --- | --- |
| `POL-COMPLAINT-001` | A complaint must capture resident or reporter context, room, category, description, occurrence time, and supporting media when supplied. |
| `POL-COMPLAINT-002` | Target handling time is at most two hours for emergency, 24 hours for medium, and three days for minor maintenance. |
| `POL-COMPLAINT-003` | Maintenance evidence records technician, dates, material, cost, and before/after documentation. Complaint closure and work-order verification remain separate actions. |
| `POL-VEHICLE-001` | Resident vehicles must be registered and associated with the current resident/occupancy context. Parking must use the designated area. |
| `POL-EXPENSE-001` | Expense authority distinguishes operational, repair, salary, utility, and other approved categories. Every expense records date, amount, category, description, and evidence when available. |
| `POL-EXPENSE-002` | Expense below Rp500.000 may be approved by the manager. Expense of Rp500.000 or more requires the higher approval authority defined by management. |
| `POL-REPORT-001` | Monthly management reporting includes cash inflow, expense, occupancy, arrears, complaints/maintenance, and an explicitly scoped financial summary. |
| `POL-REPORT-002` | Operational records and evidence must remain auditable and included in backup policy. A report export is a view of source records, not an independent ledger. |
| `POL-OPS-001` | Inquiry response target is ten minutes during working hours; resident chat target is 15 minutes; complaint acknowledgement target is one hour; emergency response is immediate. |
| `POL-OPS-002` | Routine inspection schedules and operational checklists are policy content. The first overhaul may record and display them without automating every schedule. |
| `POL-OPS-003` | Terms, SOP, and operational policy must be reviewed at least every six months and versioned when changed. |

## 4. Binding Product Decision Register

### 4.1 Global Product and Navigation

| ID | Binding decision |
| --- | --- |
| `DEC-AUTH-001` | Admin, public catalog, authenticated Penghuni, and Property Owner experiences share backend authority but have separate exposure rules. Frontend route guards are not authorization authority. |
| `DEC-PROPERTY-001` | Every Admin query, cache key, mutation, aggregate, export, and file operation is explicitly property-scoped and fails closed when scope is missing. |
| `DEC-OPS-001` | Every current Admin sidebar destination must reach an explicit loading, content, empty, forbidden, or recoverable-error state; a broken route or indefinite loading is a release blocker. |
| `DEC-OPS-002` | Dense entity detail belongs on a full page with breadcrumbs and shareable URL. Dialogs are reserved for bounded commands, confirmation, and short data entry. |
| `DEC-OPS-003` | Third-party screenshots contribute workflow ideas only. KOSTATION naming, relationships, accessibility, responsive behavior, and lifecycle authority take precedence. |
| `DEC-OPS-004` | Destructive-looking actions use explicit commands, reason capture, confirmation, audit, and recovery where possible. Historical entities are archived or reversed, not hard deleted. |

### 4.2 Room, Category Content, and Public Catalog

| ID | Binding decision |
| --- | --- |
| `DEC-ROOM-001` | `Tambah Kamar` is disabled/removed from normal Admin navigation because the authoritative inventory is fixed at 163 rooms. Existing rooms remain editable within lifecycle guards. |
| `DEC-ROOM-002` | Room lists support search by room/building/category-related text and filters for category, room status, building, floor, and gender. Price is removed from the primary table and shown in detail. |
| `DEC-ROOM-003` | Room detail is a full page containing physical inventory, category commercial snapshot, active resident/lease, vehicle, billing progress, complaint/maintenance summary, ownership, and safe quick links. |
| `DEC-CONTENT-001` | Facilities, gallery, and terms are first-class Admin-managed category/public content. Gallery input does not require lobby/kitchen/shared-area taxonomy. |
| `DEC-PUBLIC-001` | The public `/kamar` catalog is accessible without login. A visitor chooses category, gender, planned start, and lease plan; the visitor never chooses or sees an exact room number. |
| `DEC-PUBLIC-002` | Public availability is category/gender-level promotion and is not a promise of a specific room. Exact building/room assignment remains an Admin action. |
| `DEC-PUBLIC-003` | Public booking form remains short: contact identity, phone/WhatsApp, email when available, gender, category, university when available, planned start, and a message. Complete identity and family data are collected during onboarding. |

### 4.3 Booking Lead, Hold, Resident, and Lease

| ID | Binding decision |
| --- | --- |
| `DEC-LEAD-001` | There are three entry paths: Admin quick lead from a vacant room, public lead without an exact room, and direct Admin onboarding without a lead. All converge on one onboarding/lease activation authority. |
| `DEC-LEAD-002` | Admin quick lead may carry a proposed exact room. Public lead carries category and gender only until Admin selects an eligible room. |
| `DEC-LEAD-003` | Survey and generic conversion are not required lifecycle stages. The final successful lead action is labelled `Disewa` and ends in authoritative lease activation. |
| `DEC-LEAD-004` | A room may be held for 24 hours. Hold creation changes only hold/room reservation authority and never creates a resident, lease, occupancy, invoice, or payment. |
| `DEC-LEAD-005` | Completing a held lead with Booking Fee, DP, or full settlement converts the provisional hold to a committed paid hold. Its 24-hour expiry stops; a downloadable commitment note is available before the eventual ledger receipt. Before onboarding materializes a lease, the paid lead may be cancelled with an auditable refund that releases the room. |
| `DEC-RESIDENT-001` | `/tenants` is the combined resident-and-lease operational hub. It uses `Tambah Penyewaan`; a separate top-level Penyewaan menu is not introduced. Technical create/detail routes may still be full pages. |
| `DEC-RESIDENT-002` | Resident table columns prioritize No., Penghuni, No. Unit Kamar, Universitas, Durasi Sewa, Status Akun, and Aksi. Row expansion exposes a concise lease/billing summary. |
| `DEC-RESIDENT-003` | Resident detail is a full page with identity, current room/lease, mandatory rent-and-payment summary, invoice/payment tabs, vehicles, complaints, and a unified activity timeline. |
| `DEC-RESIDENT-004` | Resident actions are Detail, Edit, and contextual commands such as Pindah Kamar or Nonaktifkan. Permanent delete is limited to a mistaken draft with no history or linkage. |
| `DEC-RESIDENT-005` | Penghuni account provisioning occurs atomically when a financially complete onboarding is committed into an `awaiting_activation` lease. It creates/reuses normalized identity, assigns resident scope, links a `pending_activation` resident, issues a temporary credential once, and requires password change on first login. Physical occupancy and full resident context remain unavailable until the separate lease-activation command succeeds on or after the contractual start date. |
| `DEC-LEASE-001` | Direct onboarding is a full-page two-stage flow: `Penghuni & Penyewaan` and `Pilih Kamar Kost`. Room choices are vacant, gender-compatible, category-filterable, and single-select. Step one accepts a valid historical/current/future start date and a 3–120-month term. |
| `DEC-LEASE-002` | Lead-based onboarding preloads trusted lead fields, selected category/gender, payment commitment, and Admin-selected room; incomplete identity and lease fields remain mandatory. Before Commit Onboarding, Admin may revise the start date and 3–120-month duration. The server recalculates the final commercial quote, but the recorded Booking Fee/DP/full-settlement commitment is immutable; its rent credit must not exceed the revised contract rent. |
| `DEC-LEASE-003` | Room transfer uses a dedicated command from resident detail, records reason/effective date, and preserves resident history. Normal transfer is end-of-period; emergency same-day transfer is an explicit exception. |
| `DEC-LEASE-004` | A room transfer with unchanged commercial contract uses a lease addendum and retains the active lease. A transfer with changed commercial terms supersedes the old lease with a linked successor lease. |

### 4.4 Billing, Payments, Reminders, Notifications, and Expenses

| ID | Binding decision |
| --- | --- |
| `DEC-BILLING-001` | Lease activation creates an authoritative billing schedule from the 3–120-month contract snapshot. Monthly rent applies to ordinary terms; an exact 12-month multiple may use the annual category rate. |
| `DEC-BILLING-002` | The resident detail always shows `Ringkasan Penyewaan dan Pembayaran`: unpaid amount, paid amount, contract total, start/end dates, remaining time, plan, and next due date. |
| `DEC-PAYMENT-001` | Payment gateway, automatic settlement, and provider-driven checkout are disabled for this overhaul. Penghuni sees manual transfer/cash instructions and can submit transfer proof when that flow is enabled. |
| `DEC-PAYMENT-002` | Admin payment recording supports cash or bank transfer, payment date, proof, note, and selection of one or more unpaid invoices. Verified allocations update invoices atomically. |
| `DEC-PAYMENT-003` | Invoice, receipt, and payment evidence are distinct artifacts. Payment cancellation is a reversal with reason and audit, never record deletion. |
| `DEC-PAYMENT-004` | `Pembayaran Lainnya` is retained only for explicitly categorized non-rent transactions. It may not be used to bypass rent invoice allocation or security-deposit accounting. |
| `DEC-REMINDER-001` | Initial WhatsApp reminder delivery is manual through `wa.me`; the system records `opened` or `manually_marked_sent`, never delivered/read. Email sending remains disabled until a provider is configured. |
| `DEC-REMINDER-002` | One reminder composer serves current-month billing and resident detail. Current-month use locks the relevant invoice; resident detail allows selecting multiple eligible invoices and updates the preview. |
| `DEC-REMINDER-003` | Reminder templates are Admin-configurable with protected variables. Generated text may include secure invoice-download links. |
| `DEC-REMINDER-004` | `Reminder Sewa` contains `Reminder H-30` and `Riwayat Reminder`. Lease-ending reminders are distinct from unpaid-invoice reminders. |
| `DEC-NOTIFICATION-001` | Notifications are in-app events; reminders are outbound communication work. Header badges, pages, histories, and clearing rules remain separate. |
| `DEC-EXPENSE-001` | Admin receives an operational expense register with category, scope, vendor, method, amount, date, proof preview, note, optional work-order relation, approval, and reversal. |

### 4.5 Vehicles, Complaints, Reports, Integrations, and Investor Ownership

| ID | Binding decision |
| --- | --- |
| `DEC-VEHICLE-001` | Vehicle and parking pages are functional master/operational views with resident, room, vehicle identity, parking state, detail, edit, archive, and quick links. |
| `DEC-COMPLAINT-001` | Complaint detail links the reporter/resident, room, work order, technician, SLA, evidence, costs, and history without conflating complaint and maintenance status. |
| `DEC-REPORT-001` | Reports have four subpages: Penyewaan, Pembayaran, Pengeluaran, and Keuangan. `Keuangan` v1 is an explicit cash-flow report, not a full accrual profit-and-loss statement. |
| `DEC-REPORT-002` | Report filters are authoritative and URL-backed. Preview, PDF, and Excel use the complete filtered dataset rather than the visible pagination page. |
| `DEC-REPORT-003` | Security deposit appears as liability/cash movement and is excluded from rent revenue. Only verified payment inflows and valid expense/refund outflows affect cash-flow totals. |
| `DEC-INTEGRATION-001` | WhatsApp API, transactional email, Smart Lock live commands, CCTV live feeds, and payment providers remain behind adapters and explicit rollout. Their presence in source or owner tools is not activation authority. |
| `DEC-OWNER-001` | `owner` means global operational owner. `property_owner` means contractual/economic asset owner with read-only access limited to effective ownership assignments. The roles are never interchangeable. |
| `DEC-OWNER-002` | Rumah Kost ownership is assigned to a whole building and includes all current/future rooms. Apart Kost ownership is assigned to selected individual rooms. An unassigned asset is displayed as `Kostation-owned`. |
| `DEC-OWNER-003` | One Owner Profile links to at most one account. Admin chooses the initial password, receives it once, and can later reset it; there is no forced first-login password change and no later password display. |
| `DEC-OWNER-004` | Property Owner may read only safe operational and financial projections for assets intersecting the authenticated owner's effective assignment. NIK, KTP, private address, emergency contacts, credentials, raw payment proof, storage paths, and raw audit remain excluded. |
| `DEC-OWNER-005` | Ownership assignments are effective-dated, non-overlapping, and append-only. Release or transfer closes an old interval rather than overwriting history. The default transfer boundary is the next rental-coverage period; a mid-period transfer requires explicit reason and adjustment review. |
| `DEC-OWNER-006` | Current standard monthly economics per occupied room are Rp1.800.000 gross rent, Rp1.500.000 Owner Entitlement, and Rp300.000 Kostation Management Fee. Policy values are effective-dated snapshots, not timeless constants. |
| `DEC-OWNER-007` | Rent is recognized using collected-and-earned service coverage. Booking Fee/DP are advance credits; Security Deposit is a liability; vacancy creates no entitlement. Payment, Earned Rent, Owner Entitlement, settlement, and payout remain separate authorities. |
| `DEC-OWNER-008` | Partial verified rent is split proportionally at the current 5:1 owner/Kostation ratio until monthly caps. Reversals/refunds create append-only adjustments. Expenses never offset owner payout without an explicit approved policy and evidence. |
| `DEC-OWNER-009` | One monthly Owner Settlement follows `draft -> ready_for_review -> approved -> paid`; payout requires Admin approval. Ownership transfer attribution follows earned service coverage, not merely payment receipt date. |

## 5. Cross-Surface Invariant Register

| ID | Invariant |
| --- | --- |
| `INV-AUTH-001` | Authorization, scope, rollout, and entity relationship validation occur before idempotency claim, query expansion, file access, or mutation. Missing/invalid scope denies access. |
| `INV-AUTH-002` | Password hashes, tokens, cookies, provider secrets, and reusable reset material never appear in API data envelopes, UI, audit payloads, outbox payloads, exports, or logs. The only plaintext-secret exception is a server-generated temporary password returned once in a dedicated non-cacheable provisioning/reset receipt to an already-authorized operator; it is never persisted, re-readable, placed in a URL, ordinary resource envelope, audit, outbox, export, telemetry, or log. |
| `INV-PROPERTY-001` | A record from one property/building scope can never be read, counted, cached, exported, mutated, or linked through another scope. |
| `INV-OWNER-001` | Property Owner reads only records whose authoritative Rumah Kost building or Apart Kost room relation intersects the authenticated owner's effective assignment at the record's effective time. Empty scope returns zero rows. |
| `INV-OWNER-002` | A Rumah Kost building or Apart Kost room has at most one owner in an overlapping effective period; category-crossed assignments fail closed. |
| `INV-OWNER-003` | Owner Entitlement plus Kostation Management Fee never exceeds recognized Gross Earned Rent; Security Deposit and vacant coverage contribute zero. |
| `INV-OWNER-004` | An approved/paid settlement is immutable. Correction, reversal, refund, transfer proration, or clawback is represented by an append-only adjustment. |
| `INV-ROOM-001` | Room status changes only through hold, lease/occupancy, transfer, checkout/inspection, maintenance, deactivation, or authorized reconciliation commands. UI edits and leads never write room lifecycle directly. |
| `INV-ROOM-002` | At most one active occupancy, one active hold/reservation authority, and one active lease-room authority may claim the same room in mutually incompatible ways. |
| `INV-CONTENT-001` | Published public content is an explicit versioned projection of Admin-managed category/property content; drafts never leak to public responses. |
| `INV-PUBLIC-001` | Public responses exclude exact room numbers, opaque internal IDs, resident/occupancy data, billing data, and private evidence. |
| `INV-LEAD-001` | A Booking Lead is interest, a hold is temporary reservation, a lease is a contract, and occupancy is physical residence. None substitutes for another. |
| `INV-LEAD-002` | Public lead creation never changes a room, hold, resident, account, lease, occupancy, invoice, payment, or deposit. |
| `INV-RESIDENT-001` | One person has one canonical resident identity per property context; duplicate email/phone/NIK conflicts fail closed for human resolution. |
| `INV-RESIDENT-002` | Resident deactivation or account suspension never deletes lease, occupancy, billing, payment, complaint, vehicle, or activity history. |
| `INV-LEASE-001` | Final lease activation is atomic across revalidation of the committed resident/account authority, lease, room claim, occupancy, billing activation, lead/hold completion, audit, and outbox. Account provisioning and awaiting-activation commitment are independently atomic; any failure in either command rolls back that command's complete effects. |
| `INV-LEASE-002` | Exactly one active occupancy corresponds to an active lease and its current room, except explicitly identified legacy reconciliation cases. |
| `INV-BILLING-001` | Invoice totals derive from an immutable lease commercial snapshot and explicit adjustments. Category price edits never mutate historical invoice amounts. |
| `INV-BILLING-002` | Invoice balance equals charges plus valid adjustments minus verified allocations and valid credits; no UI-local total is authoritative. |
| `INV-PAYMENT-001` | Payment amount equals the sum of its allocations plus any explicit unallocated balance permitted by policy; no allocation may exceed an invoice outstanding amount. |
| `INV-PAYMENT-002` | Booking Fee and DP allocations reduce rent receivable. Security-deposit funding, deduction, and refund never settle rent invoices or count as rent revenue. |
| `INV-PAYMENT-003` | A verified financial record cannot be hard deleted. Correction uses rejection before verification or an append-only reversal after verification. |
| `INV-REMINDER-001` | Reminder eligibility is derived from current lease/invoice state. Badge counts and worklists are not durable counters that can become stale. |
| `INV-REMINDER-002` | A manual WhatsApp link does not prove delivery. Only provider callbacks may establish delivered/read status after a future integration is activated. |
| `INV-NOTIFICATION-001` | Reading/dismissing an in-app notification does not mutate the source invoice, lease, complaint, work order, or reminder eligibility. |
| `INV-EXPENSE-001` | Expense approval, payment, reversal, and evidence form an auditable chain; reversing an expense creates an offset and never erases the original. |
| `INV-VEHICLE-001` | An active vehicle/parking assignment must reference the resident's current valid property/occupancy context; transfer/checkout triggers reconciliation. |
| `INV-COMPLAINT-001` | Complaint lifecycle and work-order lifecycle are independent but linked. Resolving one does not silently complete/verify the other. |
| `INV-REPORT-001` | Screen totals, preview, PDF, and Excel for identical filters come from one server-side query authority and reconcile to the same record set. |
| `INV-INTEGRATION-001` | External side effects require an enabled adapter, scoped credential, idempotency, safe retry, redacted observability, and a persisted attempt/result. Disabled integration means zero external request. |
| `INV-OPS-001` | Every successful domain mutation records actor, scope, command, target identifiers, safe before/after facts, correlation, and timestamp without unnecessary PII. |
| `INV-OPS-002` | Archive/reversal is the default correction mechanism for records with history. Permanent deletion is allowed only for an unreferenced erroneous draft under explicit policy. |

## 6. Canonical Glossary

### 6.1 People and Access

| Canonical term | Definition | Avoid or restrict |
| --- | --- | --- |
| **Calon Penyewa** | Person expressing interest before a lease is active. | `visitor` in visible UI; `tenant` |
| **Penghuni** | Person with a resident record; “Penghuni Aktif” additionally has current occupancy. | `tenant` except legacy route/code |
| **Admin** | Operator who performs data entry and allowed commands. | Assuming Admin is global owner |
| **Manager** | Property-scoped operational manager. | `pengelola` when role precision matters |
| **Owner** | Global operational owner role with policy authority. | Using it for an investor |
| **Property Owner** | Contractual/economic owner of assigned Rumah Kost buildings and/or Apart Kost rooms. Technical role: `property_owner`; access is read-only and effective-period scoped. | `owner`, `cabang owner` |
| **Owner Profile** | Admin-managed owner identity, one account relation, payout destination, lifecycle, and ownership history. | Treating a property membership as an owner profile |
| **Ownership Assignment** | Non-overlapping effective interval attributing one eligible asset to one Property Owner. | Permanent owner column; destructive reassignment |
| **Building Ownership** | Rumah Kost whole-building assignment including all current/future rooms. | Using it for Apart Kost |
| **Room Ownership** | Apart Kost assignment for one selected room. | Inferring ownership of the whole building |
| **Kostation-Owned** | Display state for an asset without an effective owner assignment; no synthetic account exists. | Missing-data fallback to a global owner |
| **Owner Entitlement** | Owner share of verified rent that has become earned for service coverage. | Payment receipt; payout |
| **Kostation Management Fee** | Kostation service share of earned rent under an effective commercial policy. | Expense; Security Deposit |
| **Owner Settlement** | Monthly reconciled snapshot of earned rent, entitlement, fee, adjustments, approval, and payout. | Rewriting payment history |
| **Teknisi** | User assigned to maintenance work orders. | Treating technician as complaint owner |
| **Akun Penghuni** | Login identity linked to a resident and resident property scope. | Password stored on resident |

### 6.2 Property and Inventory

| Canonical term | Definition | Avoid or restrict |
| --- | --- | --- |
| **Properti** | Managed location and top operational scope. | `cabang` |
| **Bangunan / Unit Gedung** | Physical building containing rooms and the investor ownership unit. | Treating each as a property |
| **Kategori Kost** | `Rumah Kost` or `Apart Kost`; commercial content authority. | Per-room “type” variants |
| **Kamar** | Physical inventory unit. | Publicly exposing exact room |
| **Kebijakan Gender** | Authoritative male/female eligibility of a room/building. | `mixed` |
| **Fasilitas Kategori** | Shared facility set for all rooms in a category. | Per-room facility duplication |
| **Galeri Kategori** | Ordered public images for a category. | Mandatory lobby/kitchen taxonomy |
| **Status Kamar** | Authoritative lifecycle state: vacant, reserved, occupied, inspection required, maintenance, or inactive. | Manual arbitrary status edit |

### 6.3 Commercial and Resident Lifecycle

| Canonical term | Definition | Avoid or restrict |
| --- | --- | --- |
| **Minat Booking / Booking Lead** | Interest record from public or Admin. It is not reservation. | Calling it booking confirmed |
| **Penahanan Kamar / Hold** | Temporary 24-hour room reservation. | Lease, occupancy |
| **Onboarding Penghuni** | Completion of identity, agreement, financial, room, and check-in requirements. | “Tambah user” as whole lifecycle |
| **Penyewaan / Lease** | Contractual right to occupy one room for a defined period and commercial snapshot. | Generic `sewa` status without contract |
| **Hunian / Occupancy** | Actual active resident-to-room placement. | Using resident status as room occupancy |
| **DP / Uang Muka Sewa** | Advance rent allocated against rent. The 25% of contract-value value is a system recommendation and prefill, not a blocking minimum. | Deposit |
| **Booking Fee** | Optional advance rent credit: Rp0 or at least Rp1.000.000. It reduces remaining rent and may contribute to the recorded DP or full settlement. | Security deposit, rental income separate from the lease |
| **Deposit Jaminan** | Optional refundable security liability held against damage/arrears; Rp0 is valid. | Booking Fee, DP, rent income |
| **Pindah Kamar** | Controlled transfer retaining history and using an addendum or successor lease. | Edit room ID directly |
| **Check-In / Aktivasi Hunian** | Final command that establishes active lease/occupancy and access handover. | Lead conversion |
| **Check-Out / Penyelesaian Hunian** | Inspection, settlement, access return, lease close, and room reconciliation. | Deactivate resident only |

### 6.4 Billing and Finance

| Canonical term | Definition | Avoid or restrict |
| --- | --- | --- |
| **Rencana Tagihan** | Contract-derived schedule of invoice periods. | UI-generated month list |
| **Tagihan / Invoice** | Amount formally due for a period or charge. | Payment |
| **Pembayaran** | Monetary receipt awaiting or having verification. | Invoice |
| **Alokasi Pembayaran** | Explicit amount of one payment applied to one invoice. | Note-only multi-month payment |
| **Kuitansi / Receipt** | Evidence that money was received. | Invoice |
| **Bukti Transfer** | File evidence for a bank-transfer payment. | Receipt |
| **Pembayaran Lainnya** | Categorized non-rent transaction with explicit purpose. | Rent bypass |
| **Pengeluaran** | Auditable operational cash outflow. | Negative payment |
| **Pembalikan / Reversal** | Append-only correction that offsets a verified financial record. | Delete |
| **Arus Kas / Keuangan** | Verified cash inflow and valid outflow for a period. | Full profit/loss unless accrual accounting exists |

### 6.5 Service and Communication

| Canonical term | Definition | Avoid or restrict |
| --- | --- | --- |
| **Komplain** | Resident/reporter issue and service lifecycle. | Work order |
| **Work Order / Perintah Kerja** | Technician execution record linked to a complaint or standalone maintenance. | Complaint |
| **Reminder / Pesan Pengingat** | Outbound message work based on invoice or lease-ending eligibility. | In-app notification |
| **Notifikasi** | In-app event for a user. | Proof of message delivery |
| **Template Reminder** | Admin-managed text with protected variables. | Raw string substitution in browser |
| **Riwayat Aktivitas** | Correlated domain events relevant to an entity. | Editable free-form log |
| **Arsip** | Record hidden from normal active worklists while retaining history. | Hard delete |

## 7. Canonical Visible Status Labels

The persistence value may be English snake case; UI uses the Indonesian label.

| Domain value | Visible label |
| --- | --- |
| `new` | Baru |
| `contacted` | Sudah Dihubungi |
| `negotiating` | Dalam Kesepakatan |
| `awaiting_dp` | Menunggu DP |
| `onboarding` | Melengkapi Data |
| `leased` | Disewa |
| `rejected` | Ditolak |
| `expired` | Kedaluwarsa |
| `vacant` | Kosong |
| `reserved` | Dipesan |
| `occupied` | Terisi |
| `inspection_required` | Perlu Pemeriksaan |
| `maintenance` | Maintenance |
| `inactive` | Tidak Aktif |
| `draft` | Draf |
| `awaiting_activation` | Menunggu Aktivasi |
| `active` | Aktif |
| `transferred` | Dipindahkan |
| `completed` | Selesai |
| `cancelled` | Dibatalkan |
| `issued` | Terbit |
| `partially_paid` | Dibayar Sebagian |
| `paid` | Lunas |
| `overdue` | Jatuh Tempo |
| `void` | Dibatalkan |
| `pending_confirmation` | Menunggu Konfirmasi |
| `verified` | Terkonfirmasi |
| `reversed` | Dibatalkan |
| `archived` | Diarsipkan |

## 8. Conflict and Supersession Register

| ID | Earlier statement or reference | Canonical resolution |
| --- | --- | --- |
| `DEC-BILLING-010` | Flexible 1, 6, or arbitrary-month lease options discussed during exploration. | Superseded by `POL-LEASE-001` and `POL-BILLING-002`: ordinary terms are 3–120 months; 1–2 months require a future exception policy. |
| `DEC-PAYMENT-010` | Default security deposit Rp1.000.000. | Superseded by `POL-PAYMENT-002`: security deposit is optional, freely entered, and may be Rp0; it remains a separate refundable liability when recorded. |
| `DEC-PAYMENT-011` | DP and deposit used interchangeably in reference screens. | Superseded by `POL-PAYMENT-001` and `POL-PAYMENT-002`: DP is advance rent; security deposit is refundable liability. |
| `DEC-PAYMENT-012` | Owner source names bank transfer only and also lists QRIS among tools. | Latest product decision permits audited cash exception and disables payment-gateway/QRIS automation. Transfer remains primary. |
| `DEC-LEAD-010` | Third-party reference has survey and conversion stages. | Survey may be an optional activity/note; it is not a required status. Generic conversion is replaced by final `Disewa` activation. |
| `DEC-PUBLIC-010` | Public search examples include location and exact listing selection. | KOSTATION has one managed catalog: filter category, gender, start plan, and lease plan; no location marketplace or exact-room choice. |
| `DEC-RESIDENT-010` | A separate top-level Penyewaan page and `Tambah Penghuni` dialog were considered. | `/tenants` is the resident/lease hub with `Tambah Penyewaan` full-page onboarding. |
| `DEC-ROOM-010` | Current UI exposes Add Room and per-room commercial editing. | Inventory is fixed; Add Room is disabled and commercial terms belong to category/lease snapshot. |
| `DEC-REMINDER-010` | Automatic WhatsApp/email delivery implied by reference screenshots. | Initial implementation is manual WhatsApp deep link and provider-disabled email. Delivery claims require future provider evidence. |
| `DEC-NOTIFICATION-010` | Reference UI treats reminder and notification counts interchangeably. | Separate source queries, badges, histories, and clearing rules. |
| `DEC-REPORT-010` | Reference calls the fourth report `Pemasukan` or presents it as profit/loss. | Canonical fourth report is `Keuangan`; v1 is cash-flow with deposit liability separation. |
| `DEC-OPS-010` | Reference screens offer hard-delete payment, reminder, expense, and resident actions. | Superseded by archive/reversal and explicit audited correction commands. |
| `DEC-OWNER-010` | Role name `owner` and building-only investor scope were used for every asset owner. | Global operator remains `owner`; asset owner is `property_owner`; Rumah Kost uses building scope and Apart Kost uses individual-room scope. |
| `DEC-LEASE-011` | Room transfer by closing/deactivating the resident and recreating all data. | Dedicated transfer command preserves resident/history and uses addendum or linked successor lease. |
| `DEC-OPS-011` | Master source contains both 22:00 and 21:00 guest limits. | Implementation default is the stricter 21:00 until owner confirmation; content remains configurable/versioned. |
| `DEC-REMINDER-011` | Master agreement mentions renewal notice two months before end; product requests H-30 reminder. | Generate distinct H-60 renewal-intent, H-30 renewal/payment, and H-14 checkout events. Keep `Reminder H-30` and `Riwayat Reminder` as the initial sidebar destinations; H-60 and H-14 appear through the combined worklist/header notification unless later given dedicated views. |

## 9. OWNER_CONFIRMATION_REQUIRED — Non-Blocking Register

These items do not block architecture or implementation. Until the owner
confirms them, the stated safe default applies and the behavior must remain
configurable or disabled.

| ID | Confirmation needed | Safe implementation default |
| --- | --- | --- |
| `OWNER_CONFIRMATION_REQUIRED-001` | Exact late fee amount and escalation after seven days. | No automatic monetary penalty or lock. Show overdue, reminders, and an authorized manual escalation command. |
| `OWNER_CONFIRMATION_REQUIRED-002` | Whether a cancelled applicant forfeits any DP and under which signed terms. | Do not forfeit automatically. Require an authorized adjustment/refund decision with reason and evidence. |
| `OWNER_CONFIRMATION_REQUIRED-003` | Final guest cut-off: 21:00 or 22:00. | Publish 21:00 as stricter default; keep rule versioned/configurable. |
| `OWNER_CONFIRMATION_REQUIRED-004` | Whether H-60 renewal intent should eventually receive a dedicated sidebar view instead of the combined reminder worklist. | Generate H-60/H-30/H-14 events now; expose them through `Reminder H-30`, header reminders, and history without adding another sidebar destination. |
| `OWNER_CONFIRMATION_REQUIRED-005` | Higher expense approver title and exact `>= Rp500.000` workflow. | Treat Rp500.000 or more as pending higher approval; do not mark paid before approval. |
| `OWNER_CONFIRMATION_REQUIRED-006` | Tax, withholding, and formal accounting treatment beyond operational cash flow. | Label reports as operational cash flow; do not claim tax or profit-and-loss compliance. |
| `OWNER_CONFIRMATION_REQUIRED-007` | Tax/withholding treatment, exact monthly payout calendar, and legal-title verification integration. | Use operational collected-and-earned settlement with Admin approval; keep tax automation and government title-registry integration disabled. |
| `OWNER_CONFIRMATION_REQUIRED-008` | Security-deposit bank segregation and authorized deduction approver. | Track deposit as liability, require documented deduction, and require manager/owner approval before refund settlement. |
| `OWNER_CONFIRMATION_REQUIRED-009` | Production WhatsApp/email providers, sender identities, consent text, and cost limits. | Manual WhatsApp only; email/provider buttons disabled with clear copy. |
| `OWNER_CONFIRMATION_REQUIRED-010` | Automatic Smart Lock/CCTV actions after arrears or checkout. | No automatic device command. Show operational task only. |
| `OWNER_CONFIRMATION_REQUIRED-011` | Whether a rare 1–2 month lease can be approved and by whom. | Reject a term below three months in ordinary onboarding. |
| `OWNER_CONFIRMATION_REQUIRED-012` | Exact retention periods for KTP/KK/KTM, payment proof, CCTV, and audit evidence. | Retain while operationally required with restricted access; do not implement destructive retention jobs until policy is approved. |

## 10. Decision Application Rules

1. A new implementation package lists every `POL`, `DEC`, and `INV` ID it
   implements or preserves.
2. A change that conflicts with this document must first update the conflict
   register through a documentation-only product decision.
3. `OWNER_CONFIRMATION_REQUIRED` never authorizes an executor to invent a
   financial, legal, or integration policy.
4. Safe defaults above are implementation-ready and do not require another
   product-owner response.
5. Historical database values are never silently rewritten to match a new
   label. Migration and reconciliation require explicit evidence.
6. No requirement in this document may advance from
   `APPROVED PLANNING — NOT IMPLEMENTED` to `IMPLEMENTED`,
   `AUTOMATED_VERIFIED`, or `RUNTIME_VERIFIED` until its implementation,
   automated verification, migration evidence where applicable, and required
   runtime evidence are recorded.

### 9.1 Lead Payment Commitment Amendment

- A lead must have an active compatible hold before it may be completed.
- Completion records one Lead Payment Commitment, never a lease, occupancy, or
  settled W06 receipt.
- Cash records a verified commitment. Bank transfer may use optional evidence
  and remain `pending_confirmation`; it blocks activation until verification.
- The commitment materializes exactly once during Commit Onboarding. Booking Fee
  is a rent credit (Rp0 or at least Rp1.000.000), while security deposit remains
  a separately traceable refundable liability.

<!-- prettier-ignore-end -->

### 9.2 Contract Settlement and Arrears Amendment

| ID                    | Final policy                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POL-SETTLEMENT-001`  | Every activated lease has one contract-rent balance. One calendar month after activation, a first-payment checkpoint requires an additional verified rent payment equal to one monthly room rate. Verified rent paid early counts toward that checkpoint; initial DP/Booking Fee and security deposit do not. The final settlement deadline remains two calendar months after activation. |
| `POL-SETTLEMENT-002`  | A partial rent payment is allowed through the end of D+7 after the ordinary deadline. When the one extension is granted, partial payment is allowed only until its deadline; after the applicable partial-payment window, only an exact full settlement is accepted.                                                                                                                      |
| `POL-SETTLEMENT-003`  | One extension of at most 14 days may be granted after the original deadline, with a mandatory reason and immutable audit trail.                                                                                                                                                                                                                                                           |
| `POL-SETTLEMENT-004`  | Arrears never automatically end occupancy, vacate a room, or command a device. The room and lease remain active until an authorized checkout is finalized.                                                                                                                                                                                                                                |
| `POL-TERMINATION-001` | Only an `admin` holding `lease.manage` may start, cancel, or finalize termination for arrears.                                                                                                                                                                                                                                                                                            |
| `POL-DEPOSIT-010`     | During an approved termination, verified security deposit offsets rent arrears first by default; documented damage is second; the exact remainder is refunded with method, date, and evidence.                                                                                                                                                                                            |

**Glossary addition.** `Contract Settlement` is the lease-level authority that
projects rent balance, deadline, arrears, extension, and termination eligibility.
It is not a payment, invoice, deposit transaction, checkout, or occupancy state.
