# KMO Billing, Reminder, Notification, Expense, and Reporting Contract

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program code: `KMO`

Recorded: 2026-07-30 (Asia/Jakarta)

## 1. Purpose

This document is the financial and communication authority for the KOSTATION
overhaul. It defines:

- the twelve-month lease and payment-plan calculation;
- DP versus security deposit;
- invoices, manual cash/bank payments, multi-invoice allocation, evidence,
  receipts, reversals, and other charges;
- operational expenses and approval;
- invoice and lease-ending reminders;
- internal notifications;
- lease, payment, expense, and cash-flow reports with preview/PDF/Excel parity.

Automatic payment gateway, automatic WhatsApp delivery, and automatic email
delivery are explicitly outside the initial release.

## 2. Binding Decisions and Invariants

| ID                     | Decision/invariant                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POL-LEASE-001`        | New leases have a minimum term of twelve calendar months.                                                                           |
| `POL-BILLING-001`      | Initial category tariff is Rp1,800,000/month and Rp21,600,000/year; room-level tariff override is prohibited.                       |
| `POL-BILLING-002`      | Rent uses full annual payment or installments covering two months; minimum contract term remains twelve months.                     |
| `POL-BILLING-003`      | Lease commercial terms are immutable snapshots; later category edits never rewrite an existing contract.                            |
| `POL-PAYMENT-001`      | DP is verified advance rent of at least 25% of contract value and reduces rent receivable.                                          |
| `POL-PAYMENT-002`      | Security deposit is separate, defaults to one month, may be configured to two months, and remains refundable subject to deductions. |
| `POL-PAYMENT-003`      | Bank transfer is primary; cash is an audited operational exception with an authorized recorder and receipt.                         |
| `POL-PAYMENT-004`      | Every payment is recorded; transfer proof is mandatory, while cash evidence is optional because receipt and recorder are retained.  |
| `POL-PAYMENT-005`      | One verified payment may settle multiple invoices only through exact, reconciling allocations.                                      |
| `POL-PAYMENT-006`      | Security-deposit remainder is refunded no later than seven working days after valid checkout settlement.                            |
| `DEC-PAYMENT-001`      | Payment Gateway remains disabled; no Midtrans session, webhook, settlement, or provider call participates in the workflow.          |
| `DEC-REMINDER-001`     | WhatsApp uses a manual `wa.me` handoff; email send is disabled until a provider is separately approved.                             |
| `INV-BILLING-001`      | Invoice totals derive from an immutable lease commercial snapshot; category price edits never rewrite history.                      |
| `INV-BILLING-002`      | Invoice balance equals charges plus valid adjustments minus verified allocations and valid credits.                                 |
| `INV-PAYMENT-001`      | Payment amount reconciles to explicit allocations; no allocation can exceed current invoice outstanding.                            |
| `INV-PAYMENT-002`      | DP reduces rent receivable; security-deposit funding/refund never settles rent or counts as rent revenue.                           |
| `INV-PAYMENT-003`      | Verified financial records are corrected through rejection or append-only reversal, never deletion.                                 |
| `INV-REMINDER-001`     | Reminder eligibility and header badges derive from current invoice/lease truth.                                                     |
| `INV-NOTIFICATION-001` | Reading/dismissing a notification never mutates its source domain record or reminder eligibility.                                   |
| `INV-REPORT-001`       | Preview, PDF, and Excel share one server query authority, filters, rows, totals, and authorization scope.                           |

## 3. Financial Vocabulary

| Term                               | Canonical meaning                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Contract rent                      | Total rent agreed for the complete lease term, captured as an immutable lease snapshot.                                        |
| DP / uang muka                     | Verified advance rent payment, minimum 25% of contract rent, allocated to rent invoices.                                       |
| Security deposit / deposit jaminan | Refundable liability held for damage, arrears, missing inventory, or other documented checkout deductions.                     |
| Installment                        | Contractual scheduled rent obligation; either one full-term installment or six two-month installments for a twelve-month term. |
| Invoice                            | Formal receivable document for one installment or an approved non-rent charge.                                                 |
| Payment                            | One money receipt by cash or bank transfer.                                                                                    |
| Allocation                         | Amount from one verified payment applied to one invoice or the security-deposit ledger.                                        |
| Receipt / kuitansi                 | Immutable proof that a payment was verified/received; not the same as an invoice.                                              |
| Payment proof                      | Transfer evidence pending review; it is not a verified payment.                                                                |
| Other charge                       | Invoice-backed non-rent charge such as damage, utilities, parking, access card, or another approved category.                  |
| Expense                            | Money paid out by KOSTATION for operations; it is not negative rent or a resident payment.                                     |
| Reversal                           | Compensating record that negates a verified financial event while preserving history.                                          |
| Cash-flow report                   | Verified cash in minus paid valid cash out for the period; not a full accrual profit-and-loss statement.                       |

Terms such as `DP`, `deposit`, `tagihan`, `invoice`, `pembayaran`, and `kuitansi`
must not be used interchangeably in API fields or UI copy.

## 4. Lease Commercial Contract

### 4.1 Commercial authority

The active `kost_type` for Rumah Kost or Apart Kost is the source for new lease
pricing. Initial values for both categories:

| Item             |        Initial value |
| ---------------- | -------------------: |
| Monthly rent     |          Rp1,800,000 |
| Annual rent      |         Rp21,600,000 |
| Security deposit |          Rp1,800,000 |
| Minimum term     |            12 months |
| Minimum DP       | 25% of contract rent |

Admin can edit category pricing for future agreements. Existing lease,
installment, invoice, payment, and receipt snapshots never change after a price
edit.

### 4.2 Start date and term

- Desired start can be the agreement day through at most two months after the
  application date.
- The lease end date is derived from the start date and term; for twelve months,
  it is the day before the same calendar day twelve months later.
- Daily proration is not part of the initial release.
- A longer term must be a whole number of months and a multiple of two when the
  two-month plan is selected.
- Renewal creates a linked lease/addendum and a new price/payment snapshot; it
  does not extend history in place.

### 4.3 Payment plans

#### Annual full payment

- one installment covers the entire term;
- one rent invoice equals contract rent;
- DP is allocated to that invoice;
- the remaining invoice balance may be paid before activation or according to
  an explicitly recorded due date.

#### Two-month installments

- twelve months produce six consecutive installments;
- each installment covers exactly two months;
- at the initial Rp1,800,000 monthly rate, each installment is Rp3,600,000;
- total remains Rp21,600,000;
- no overlapping or missing date range is permitted;
- due date for the first installment is no later than activation;
- subsequent installment due dates default to seven calendar days before their
  coverage begins.

### 4.4 DP calculation

```text
minimum_dp = ceil(contract_rent_amount × 25 / 100)
```

At Rp21,600,000 contract rent, minimum DP is Rp5,400,000.

DP allocation order:

1. oldest outstanding rent installment;
2. then the next installment until the verified DP amount is exhausted;
3. no allocation to security deposit, expense, or unrelated charge.

For the two-month plan at initial rates, Rp5,400,000 pays the first
Rp3,600,000 installment and Rp1,800,000 of the second. This is intentional
because the owner's 25% rule outranks the installment size.

An amount labelled DP but not verified does not satisfy activation.

### 4.5 Security deposit

Default:

```text
security_deposit_required = 1 × monthly_rent_snapshot
```

Property settings can explicitly choose two months for a new agreement. The
selected requirement is frozen on the lease.

Security deposit:

- is collected/top-up/refunded/deducted through its own append-only ledger;
- is not invoice rent;
- is not included in rent paid or revenue;
- can be carried to a transferred lease, with required top-up recorded;
- requires a reason and evidence for every deduction;
- is refunded after checkout reconciliation within seven working days;
- cannot have a negative ledger balance.

### 4.6 Activation states

`draft`:

- onboarding data can be completed;
- no room or occupancy mutation.

`awaiting_activation`:

- resident and account are valid;
- signed agreement is recorded;
- exact room is reserved;
- schedule/invoices exist;
- minimum DP and security deposit are verified and fully satisfy their distinct
  onboarding gates; and
- start date/check-in may still be future.

`active` requires, in one locked command:

- signed agreement;
- complete mandatory resident identity;
- account provisioning/link;
- gender-compatible reserved/vacant room;
- verified DP at least the minimum;
- required security deposit collected;
- start date reached;
- active occupancy created and room `occupied`.

No UI status selector can bypass these prerequisites.

## 5. Invoice Contract

### 5.1 Generation

- Each lease installment generates exactly one rent invoice.
- Invoice and installment coverage, due date, rate, room, resident, category,
  building, and lease snapshots are frozen.
- A scheduler may issue due invoices, but it uses the same service and database
  lock rules as an Admin command.
- Duplicate invoice generation for a lease installment is prevented by a unique
  constraint and idempotency.
- Non-rent charges use a separate invoice with typed line items.

### 5.2 Status

| Status           | Meaning                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `draft`          | Not yet issued and excluded from reminder/report receivable totals. |
| `issued`         | Payable, zero verified allocation, not overdue.                     |
| `partially_paid` | Verified allocation is greater than zero but below total.           |
| `paid`           | Active verified allocations equal invoice total.                    |
| `overdue`        | Outstanding balance after due date.                                 |
| `void`           | Cancelled receivable with reason; cannot receive new allocation.    |

`unpaid` is a UI grouping for `issued|overdue` with zero allocation; it is not a
second ambiguous storage state.

Automatic late-fee calculation remains disabled because the owner policy marks
the penalty as still under agreement. The system may show overdue days and
support a future explicitly approved adjustment, but must not apply a default
1% daily fee.

### 5.3 “Tagihan Bulan Ini”

The page is a derived invoice view, not a separate data source. It includes:

- open invoices whose due date falls in the selected month;
- earlier overdue/partially-paid invoices still outstanding;
- resident, room, coverage period, amount, outstanding amount, due date, and
  status;
- actions to open the resident billing detail and compose a reminder.

Rows disappear or update immediately after verification, reversal, void,
renewal, transfer, or scope change.

## 6. Manual Payment Contract

### 6.1 Create and review

Required input:

- property and resident/lease authority resolved by server;
- payment method `bank_transfer|cash`;
- payment date/time;
- selected invoice IDs and allocated amount per invoice;
- payment purpose;
- notes optional;
- transfer proof file mandatory for bank transfer;
- reference number optional for cash and recommended for transfer.

Bank transfer:

- starts `pending`;
- proof is previewed before upload;
- Admin verifies or rejects;
- only verification creates active allocations and receipt.

Cash:

- authorized Admin records the receiver and received timestamp;
- may be verified atomically at creation;
- uploaded evidence is optional;
- receipt is mandatory.

### 6.2 Multi-invoice allocation

One payment can settle multiple invoices, such as three selected months.

Rules:

- all invoices must belong to the same property and resident/lease authority;
- invoice IDs lock in deterministic order;
- allocation sum equals payment amount;
- allocation cannot exceed each current outstanding balance;
- void/paid invoices reject new allocations;
- amount and selected rows are recalculated server-side before commit;
- one payment code and one receipt show the complete allocation breakdown;
- partial payment is allowed when explicitly allocated.

Overpayment is rejected in the initial release. Admin must correct the amount or
create an approved other charge; the system does not create an implicit credit.

### 6.3 Verification transaction

Verification atomically:

1. locks payment/proof and all selected invoices;
2. revalidates property/resident/lease tuple;
3. creates active allocations;
4. updates derived invoice statuses;
5. creates the immutable receipt;
6. writes audit and outbox;
7. commits or rolls back all steps.

### 6.4 Receipt and invoice documents

Invoice document:

- describes amount owed, coverage, due date, line items, and current status.

Receipt document:

- describes amount actually received, payment method/date/code, payer, room,
  invoice allocations, receiver/verifier, and reversal reference if applicable.

Documents are generated from immutable snapshots, downloaded through mediated
routes, and never expose storage paths.

### 6.5 Rejection, void, and reversal

- A pending proof can be rejected with a bounded safe reason.
- An invoice can be voided only through invoice authority and only with a reason.
- A verified payment cannot be edited or deleted.
- Reversal requires reason, actor, confirmation, and optional replacement
  reference.
- Reversal creates compensating allocation effects, reopens affected invoice
  balances, creates reversal evidence, updates reminders/reports, and writes
  audit/outbox atomically.
- “Hapus Pembayaran” from external reference screenshots is adapted in this plan as
  `Batalkan/Reversal Pembayaran`, never hard delete.

### 6.6 “Pembayaran Lainnya”

The UI can create other billable charges for:

- documented damage;
- utilities;
- parking;
- lost key/access card;
- approved administration;
- other with mandatory description.

Creation generates an invoice-backed non-rent charge. Payment then follows the
same proof, verification, receipt, and reversal rules. This keeps global payment
and financial reports reconcilable.

## 7. Resident Billing Detail

The resident full-page detail must include an always-visible
“Ringkasan Penyewaan dan Pembayaran” card:

- contract rent;
- rent invoiced;
- rent paid;
- rent outstanding;
- security deposit required/collected/deducted/refunded/balance;
- lease start/end and remaining days;
- payment plan and installment progress;
- next due date;
- overdue count;
- explanatory lease note.

Billing tabs:

1. `Tagihan Belum Dibayar`;
2. `Tagihan Sudah Dibayar`;
3. `Pembayaran Menunggu Konfirmasi`;
4. `Pembayaran Lainnya`.

The paid-payment table includes payment code, method, paid date, total,
evidence, note, receipt/invoice links, and allocation detail. All tables are
authoritative, paginated, searchable, and linked to the same resident/lease.

## 8. Expense Contract

### 8.1 Expense lifecycle

| Status             | Meaning                                             |
| ------------------ | --------------------------------------------------- |
| `draft`            | Editable, not reported as cash out.                 |
| `pending_approval` | Complete and waiting for required approval.         |
| `approved`         | Approved but not paid.                              |
| `paid`             | Cash out recorded and included in finance report.   |
| `rejected`         | Approval rejected with reason.                      |
| `cancelled`        | Cancelled before payment with reason.               |
| `reversed`         | Previously paid cash out compensated with reversal. |
| `archived`         | Hidden from active worklists; history retained.     |

### 8.2 Input

- date;
- category;
- property and optional building;
- optional related maintenance work order;
- vendor;
- amount;
- method `cash|bank_transfer`;
- description;
- evidence file, required before paid;
- optional notes.

There is no `cabang` field. Property is the operational scope; building is
optional when the expense is attributable to one unit.

### 8.3 Approval

Binding initial rule:

- below Rp500,000: manager may approve;
- Rp500,000 or more: remain `pending_approval` until the higher approver policy
  is decided in `OWNER_CONFIRMATION_REQUIRED-005`, and cannot be approved or
  paid meanwhile;
- one expense must not be split to evade the Rp500,000 boundary; and
- no creator may self-approve.

The Rp500,000 boundary is binding for this planning authority. Configuration
must not weaken or bypass it.

### 8.4 Financial treatment

- only `paid` expense is cash out;
- approved/unpaid appears in operational liability/commitment summaries, not
  cash flow;
- reversal negates cash out on the reversal date and preserves original;
- deposit refund is a liability settlement, not an operational expense;
- evidence is mediated and omitted from PDF by default.

## 9. Reminder System

### 9.1 Reminder versus notification

Reminder:

- outbound message composed for a resident;
- has a template/rendered snapshot, selected invoices or lease-ending reason,
  channel action, and immutable history.

Notification:

- in-app event for an authenticated user;
- unread/read/archive lifecycle;
- can link to a page;
- does not mean email or WhatsApp was sent.

Header badges are computed independently for notification unread count and active
reminder candidates.

### 9.2 Template authority

Templates are property-scoped and versioned. Admin can edit normal prose but
cannot remove, rename, or forge protected variables.

Canonical protected variables:

- `{{resident_name}}`;
- `{{room_number}}`;
- `{{property_name}}`;
- `{{invoice_periods}}`;
- `{{invoice_total_outstanding}}`;
- `{{lease_start_date}}`;
- `{{lease_end_date}}`;
- `{{payment_due_date}}`;
- `{{days_remaining}}`;
- `{{admin_whatsapp}}`;
- `{{invoice_download_links}}`.

Unknown variables, unsafe HTML/script, raw IDs, or direct storage URLs are
rejected.

### 9.3 Invoice reminder — current-month entry

From `Tagihan Bulan Ini`:

- exact invoice is locked;
- composer opens with complete resident, room, period, total, due date, and
  secure invoice link;
- invoice selection cannot be changed in this entry;
- preview refreshes if current balance changes before message freeze;
- paid/void invoice blocks creation.

### 9.4 Invoice reminder — resident detail entry

From resident detail:

- table lists that resident's eligible outstanding invoices;
- Admin selects one or more invoices;
- preview updates period list, total, due date summary, and download links;
- all invoices must remain outstanding and same resident/lease/property at
  creation;
- no selection means send actions disabled.

### 9.5 Lease-ending reminders

Scheduled milestones:

- H-60;
- H-30;
- H-14.

The sidebar keeps the requested `Reminder H-30` destination. Its primary table
lists active leases with 0–30 days remaining and no resolved renewal/close
decision. The same workspace also exposes clearly labelled H-60 renewal-intent
and H-14 checkout groups through a milestone filter; H-60/H-14 rows are never
mislabelled as H-30 and do not add another sidebar destination. Each group
shows:

- resident;
- room;
- lease end;
- days remaining;
- payment-plan/outstanding summary;
- latest reminder milestone/action;
- Detail and Kirim Reminder actions.

H-60/H-30/H-14 events are generated once per lease/milestone. Candidate
eligibility clears when:

- renewal is activated;
- checkout/close completes;
- transfer supersedes the lease;
- lease is completed/cancelled.

Paying an unrelated invoice does not clear a lease-ending reminder. Conversely,
settling/voiding selected invoices clears invoice-reminder eligibility without
closing the lease.

### 9.6 Manual WhatsApp and disabled email

Initial buttons:

- `Buka WhatsApp`;
- `Tandai Sudah Dikirim`;
- email action shown disabled with configuration explanation.

`Buka WhatsApp`:

- returns and opens encoded `wa.me`;
- changes the attempt to canonical status `opened`;
- does not call an external API;
- does not claim sent/delivered/read.

`Tandai Sudah Dikirim`:

- requires explicit operator confirmation after manual action;
- changes the attempt to canonical status `manually_marked_sent`;
- remains operator evidence, not provider proof.

Email:

- preview can show email-compatible content;
- send returns `EMAIL_DELIVERY_DISABLED`;
- no SMTP/SendGrid/Brevo call.

### 9.7 Secure invoice links

- message uses opaque expiring share URLs, not invoice UUIDs;
- default validity is seven days;
- token is stored hashed;
- access yields only the intended invoice document;
- link is revoked on invoice void/replacement;
- download access is rate-limited and audited without exposing token;
- a new reminder can issue replacement links.

### 9.8 Reminder history

History table includes:

- timestamp;
- resident/room;
- reminder type;
- selected periods;
- channel action;
- actor;
- message excerpt;
- Detail and Archive.

“Delete” in reference screenshots becomes Archive. Immutable message and action
evidence remains available to authorized audit.

## 10. Internal Notification System

### 10.1 Sources

Internal notifications may be created from:

- new public/admin Booking Lead;
- hold nearing expiry/expired;
- pending payment proof;
- payment verified/reversed;
- invoice overdue;
- lease H-60/H-30/H-14;
- complaint escalation/SLA;
- maintenance assignment/status;
- vehicle approval;
- expense approval;
- resident account provisioning/reset.

### 10.2 Lifecycle and badge

- canonical status `unread|read|archived`;
- unread count derives from active authorized rows;
- resolution can archive or replace an actionable notification;
- notification polling/refetch must update header count after domain
  invalidation;
- stale count stored in local storage is prohibited;
- Property Owner sees only building-scoped events and no mutation actions;
- Penghuni sees only self-context events.

### 10.3 Data minimization

Notification list contains safe title, body summary, type, priority, timestamp,
read state, and authorized route target. It must not contain full NIK, KTP,
phone, email, credential, payment proof, provider payload, or raw audit snapshot.

## 11. Report Framework

### 11.1 Shared behavior

All four reports use:

- breadcrumb and report title;
- date start/end;
- report-specific filters;
- `Tampilkan`, reset, preview, Excel, and PDF actions;
- URL-backed normalized filters;
- authoritative summary and table;
- server pagination/search/sort for screen;
- export of the complete filtered dataset, not current page;
- property/building authorization applied before query.

Date validation:

- start/end exact dates;
- end cannot precede start;
- default current month;
- maximum interactive range 366 days;
- a larger approved audit export uses asynchronous job and explicit permission.

Preview and exports record a filter checksum. Row IDs and totals must match.

### 11.2 Lease report (`Laporan Penyewaan`)

Date-basis selector:

- active during period (default);
- started during period;
- ended during period.

Filters:

- lease status;
- category;
- building;
- gender;
- payment plan.

Screen/export columns:

- sequence;
- lease code;
- resident;
- room/building/category;
- snapshot rent and plan;
- start/end;
- status;
- safe note.

Expanded screen detail may show outstanding/installment summary. It must not show
credentials, full NIK, or KTP.

### 11.3 Payment report (`Laporan Pembayaran`)

Filters:

- actual payment date;
- payment status;
- method;
- purpose/type;
- resident;
- room/building;
- payment code.

Columns:

- code;
- resident;
- room/building;
- method;
- purpose;
- payment date;
- allocated periods;
- amount;
- status;
- evidence availability;
- note.

Totals:

- verified rent cash;
- verified other-charge cash;
- pending proof amount separately;
- reversed amount separately;
- security-deposit collection separately as liability.

Only verified active payments count as cash in. Pending/rejected/void/reversed
payments never inflate cash.

### 11.4 Expense report (`Laporan Pengeluaran`)

Filters:

- expense/payment date;
- category;
- building;
- method;
- vendor;
- status.

Columns:

- sequence;
- expense code/date;
- category;
- building;
- vendor;
- method;
- amount;
- status;
- proof availability;
- description.

Only paid, non-reversed rows count as cash out. Proof uses mediated view and is
not embedded in the default PDF.

### 11.5 Finance report (`Laporan Keuangan`)

Initial release is explicitly a cash-flow report:

```text
net_cash_flow =
  verified_rent_cash
  + verified_other_charge_cash
  - paid_operational_expenses
  - security_deposit_refunds
  + reversed_cash_out_compensation
  - reversed_cash_in_compensation
```

Security-deposit collections are displayed as a liability movement, not income.
Outstanding invoices are displayed as receivables, not cash.

Columns:

- date;
- reference code;
- building;
- description/type;
- cash in;
- cash out;
- liability movement;
- running balance optional within the filtered period.

Summary:

- opening-period display note;
- rent cash in;
- other cash in;
- expense cash out;
- deposit collected/refunded/balance;
- net cash flow;
- receivables outstanding (non-cash contextual metric).

The label “laba/rugi” is prohibited until accrual accounting, depreciation, tax,
payables, and opening balances are explicitly designed.

### 11.6 Preview, PDF, and Excel

Preview:

- full-page or dedicated view;
- same data/summary as export;
- no mutation;
- safe print layout.

PDF:

- landscape for wide tables;
- property, report type, period, generated timestamp, and filter summary;
- repeated header;
- page number;
- Indonesian number/date formatting;
- totals and methodology note;
- no large evidence images or hidden PII.

Excel:

- typed numeric/date cells;
- `Summary` sheet;
- `Detail` sheet;
- `Allocations` sheet for payment reports;
- filter and methodology metadata;
- no formula injection from user text;
- deterministic column order.

## 12. Property Owner Financial Scope

Property Owner reports are read-only and building-scoped.

- Current operational pages use active building assignments.
- Historical report rows are visible only when the row's snapshot building and
  economic date fall within the assignment effective period.
- Data before ownership effective date is not exposed by default.
- Property-wide expenses without a building are excluded unless an approved
  allocation rule attributes a share to the owned building.
- Security deposits and rent are shown for owned building leases only.
- Other investors' residents, rooms, payments, expenses, complaints, vehicles,
  and report totals are neither returned nor counted.
- Export repeats the same scope and records the building assignment checksum.

## 13. UI Labels and Actions

Canonical Indonesian labels:

- `Uang Muka (DP) Sewa`;
- `Deposit Jaminan`;
- `Tagihan Belum Dibayar`;
- `Tagihan Sudah Dibayar`;
- `Pembayaran Menunggu Konfirmasi`;
- `Pembayaran Lainnya`;
- `Bukti Pembayaran`;
- `Invoice`;
- `Kuitansi`;
- `Batalkan Pembayaran`;
- `Buka WhatsApp`;
- `Tandai Sudah Dikirim`;
- `Reminder H-30`;
- `Riwayat Reminder`;
- `Laporan Penyewaan`;
- `Laporan Pembayaran`;
- `Laporan Pengeluaran`;
- `Laporan Keuangan (Arus Kas)`.

References to `cabang`, generic `Pemasukan`, hard `Hapus Pembayaran`, or
provider-confirmed WhatsApp delivery are prohibited.

## 14. Cache and Reconciliation Effects

After payment verify/reversal:

- resident billing summary;
- invoice/payment list/detail;
- lease detail/installments;
- current-month bills;
- invoice reminder candidates/history;
- dashboard;
- payment/finance reports;
- notification counts.

After lease renew/close/transfer:

- resident/lease/room detail and lists;
- availability;
- installments/invoices;
- lease-ending reminders/header count;
- reports.

After expense approve/pay/reverse:

- expense list/detail/approval queue;
- dashboard financial summary;
- expense/finance reports;
- relevant notifications.

Invalidation is property-scoped and uses parsed response authority. Property
Owner cache additionally binds to building-scope version.

## 15. Failure Modes

| Condition                                   | Required outcome                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Price changes after agreement               | Existing lease/installment/invoice snapshots unchanged.                                                         |
| DP below 25%                                | Lease remains awaiting activation; safe outstanding message.                                                    |
| Security deposit missing                    | Lease remains awaiting activation even if DP is sufficient.                                                     |
| Transfer proof missing                      | Bank-transfer payment rejected before claim/write.                                                              |
| Invoice paid/void while payment dialog open | Locked verification rejects stale allocation and refreshes authority.                                           |
| Two Admins verify same payment              | One commits; other receives replay/conflict, no duplicate receipt.                                              |
| Reversal after report opened                | Report refresh/export recomputes from ledger; stale export remains identified by generation timestamp/checksum. |
| Reminder invoice settled before send        | Message creation fails stale eligibility; preview refresh required.                                             |
| WhatsApp window opened then abandoned       | History says opened only, never sent/delivered.                                                                 |
| Email clicked while disabled                | Safe disabled result; no external request.                                                                      |
| Expense over threshold approved by manager  | Denied before state mutation.                                                                                   |
| Property Owner requests unowned building    | Empty/denied without row existence disclosure.                                                                  |
| File unavailable                            | Financial record remains; UI shows evidence unavailable, never raw path.                                        |

## 16. Acceptance Matrix

### 16.1 Billing and lease

| ID               | Scenario                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `QA-LEASE-001`   | Twelve-month full plan creates one exact installment/invoice.                            |
| `QA-LEASE-002`   | Twelve-month two-month plan creates six contiguous installments totaling contract rent.  |
| `QA-BILLING-001` | Rp21,600,000 contract yields minimum DP Rp5,400,000 and independent Rp1,800,000 deposit. |
| `QA-BILLING-002` | Price edit affects only new agreements.                                                  |
| `QA-BILLING-003` | No automatic late fee is generated.                                                      |
| `QA-BILLING-004` | Activation denies missing contract, DP, deposit, start date, room, account, or identity. |

### 16.2 Payment

| ID               | Scenario                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `QA-PAYMENT-001` | One transfer payment allocates across multiple invoices and creates one receipt atomically. |
| `QA-PAYMENT-002` | Transfer without proof and over-allocation are rejected with zero write.                    |
| `QA-PAYMENT-003` | Cash records receiver and receipt; evidence remains optional.                               |
| `QA-PAYMENT-004` | Reversal restores invoice balances and preserves original payment/receipt.                  |
| `QA-PAYMENT-005` | Other charge remains invoice-backed and reconciles in reports.                              |
| `QA-PAYMENT-006` | Deposit collection/refund never appears as rent revenue.                                    |

### 16.3 Expense

| ID               | Scenario                                                                |
| ---------------- | ----------------------------------------------------------------------- |
| `QA-EXPENSE-001` | Manager can approve below Rp500,000 but not Rp500,000 or above.         |
| `QA-EXPENSE-002` | Only paid, non-reversed expense enters cash flow.                       |
| `QA-EXPENSE-003` | Evidence preview/mediation and reversal audit work without hard delete. |

### 16.4 Reminder and notification

| ID                    | Scenario                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `QA-REMINDER-001`     | Current-month entry locks one eligible invoice and renders exact current balance.             |
| `QA-REMINDER-002`     | Resident entry selects multiple invoices and preview periods/total/links update exactly.      |
| `QA-REMINDER-003`     | H-60/H-30/H-14 events are one-shot and clear only on correct lease resolution.                |
| `QA-REMINDER-004`     | Manual WhatsApp records opened/manual-sent only; email disabled performs no external request. |
| `QA-REMINDER-005`     | Share link expires/revokes and leaks no invoice/resident identifier.                          |
| `QA-NOTIFICATION-001` | Notification unread count and reminder candidate count update independently.                  |

### 16.5 Reporting

| ID              | Scenario                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `QA-REPORT-001` | Screen, preview, PDF, and Excel return the same filtered row IDs and totals.              |
| `QA-REPORT-002` | Excel uses typed money/date cells and blocks formula injection.                           |
| `QA-REPORT-003` | PDF paginates with repeated header and omits proof/PII.                                   |
| `QA-REPORT-004` | Cash-flow totals exclude pending/reversed payments and deposit collections from income.   |
| `QA-REPORT-005` | Property Owner scope includes only assigned building/effective period in rows and totals. |

## 17. Explicitly Deferred

- Payment Gateway activation or online checkout;
- automatic WhatsApp API delivery;
- automatic email delivery;
- delivered/read claims without provider evidence;
- automatic late fees;
- accrual P&L, tax, depreciation, or full general ledger;
- multi-currency;
- implicit resident credit/overpayment;
- destructive payment, expense, reminder, invoice, or deposit deletion.
