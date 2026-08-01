# KMO-W06 Billing, DP, Deposit, and Manual Payments Evidence

Status: **KMO-W06 — AUTOMATED VERIFIED; RUNTIME DEFERRED**

Recorded: 2026-07-31 (Asia/Jakarta)

This artifact records executor evidence. It does not authorize canonical
migration execution, award `AUTOMATED_VERIFIED`, or claim authenticated browser
acceptance.

## 1. Gap classification

| Classification | Evidence and disposition                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reused         | W05 lease/commercial snapshots, installments, property authorization, database transactions, idempotency commands, audit, business-event outbox, mediated files, and self-context.                                                        |
| Replaced       | Pool-scoped legacy verification/allocation writes, cosmetic invoice snapshots, destructive correction assumptions, and provider-first billing UI. Legacy reads remain available through compatibility endpoints.                          |
| Added          | Frozen contract schedules, W06 invoices, allocation intents, immutable receipts, compensating reversals, payment/invoice evidence junctions, separate deposit liability projections, Admin workspaces, and Penghuni self-service billing. |
| Deferred       | Authenticated browser acceptance; gateway checkout/webhooks; reminders and notification delivery; checkout-time deposit disposition in W07.                                                                                               |

## 2. Implemented authority

- Minimum contract term is twelve months.
- `annual_full` creates one exact full-term schedule; `two_month_installments`
  creates consecutive two-month coverage with exact integer reconciliation.
- First due date is no later than activation; later installments are due seven
  calendar days before coverage.
- Contract, room, category, tariff, period, and payment-plan snapshots are
  frozen on persistent invoices.
- Persistent invoice status is
  `draft|issued|partially_paid|paid|overdue|void`; `unpaid` is a derived UI
  grouping and rejected as a new database state.
- Manual methods are exactly `bank_transfer|cash`. Transfer remains pending
  until review; audited cash can verify atomically.
- Payment amount reconciles to explicit invoice allocations; over-allocation
  fails before financial writes.
- DP is `ceil(contract × 25%)` and verified DP distributes oldest outstanding
  rent first. It never funds the deposit ledger.
- Security deposit funding is a separate append-only liability, capped by the
  frozen requirement and protected from negative balance.
- Correction creates immutable reversal, reversal-allocation, and reversal
  receipt records. Original verified payment/allocation records are not edited
  or deleted.
- Additional charges use invoices and require durable evidence for documented
  damage.
- Every successful write keeps idempotency completion, audit, and business
  event in the same database transaction.

## 3. Migration evidence

| Item                    | Evidence                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                    | `027_billing_manual_payments.sql`                                                                                                                          |
| SHA-256                 | `f67c73e21492d0cbd98a2a0777719b60e606be7754d707546098bd647d8b2ad4`                                                                                         |
| Manifest                | Exact filename, checksum, ordering, and sentinels through 027                                                                                              |
| Disposable PostgreSQL   | PostgreSQL 17 first apply, immediate replay, exact object probes, forced failure, and rollback probe pass                                                  |
| Historical precondition | Migration 023 creates the additive `kost_type_rules.deleted_at` archive marker before publication queries use it; no out-of-band schema patch is required. |
| Canonical database      | Backed up, migrated through 027, replayed with zero writes, and reconciled on 2026-08-01                                                                   |

Migration 027 adds or hardens:

- invoice schedule/purpose/snapshot authority and installment uniqueness;
- payment lease/purpose/evidence authority;
- allocation intents, immutable receipts, reversals, reversal allocations;
- payment and invoice evidence junctions;
- separate deposit evidence/reversal linkage and non-negative enforcement;
- cross-scope validation and append-only triggers.

## 4. Backend and activation

- W05 onboarding now materializes every schedule installment, invoice, and rent
  line item from the frozen commercial commitment.
- Activation requires verified DP at or above the frozen minimum, fully funded
  security deposit, and a first eligible invoice with no remaining balance.
- `/admin/billing/*` provides current work, resident detail, payment/proof
  queues, record/verify/reject/reverse, other charge, invoice void, payment
  detail, and receipt reads.
- Authenticated Admin and Penghuni invoice-document endpoints render PDF bytes
  from frozen invoice snapshots, set private/no-store delivery headers, and
  expose neither storage paths nor internal file metadata.
- `/my/billing`, `/my/payment-proofs`, and `/my/receipts/:id` derive resident
  identity from the authenticated account. Penghuni sends no resident or
  property identity in the proof command.
- Legacy unsafe invoice/payment write endpoints return `410 Gone`; scoped reads
  remain compatibility authority.

## 5. Frontend evidence

Admin `/payments` contains four W06 tabs: current unpaid work, verified
payments, pending transfer proof, and other charges. It includes full resident
billing detail, explicit multi-invoice allocation, deposit funding, evidence
preview, proof review, reversal, receipt state, terminal states, permission
checks, property-scoped query keys, cancellation, and stable logical
idempotency.

Penghuni `/billing` is account-keyed and strict-parsed. It presents contract and
installment progress, outstanding rent, separate deposit balance, invoices,
allocation-aware payments, immutable receipt detail, proof status/rejection,
bank-transfer proof submission, and authenticated invoice PDF download. It contains no gateway/provider checkout
or raw resident identifier.

## 6. Focused validation evidence

The executor validation set covers:

- schedule coverage, due dates, exact money split, and 25% ceiling DP;
- audited cash, pending transfer, multi-invoice allocation, over-allocation,
  audit rollback, authorization-before-transaction, and idempotency replay;
- deposit funding without rent allocation, oldest-first DP, and compensating
  reversal without original-record mutation;
- strict Admin and Penghuni DTO parsers, malformed/extra/prototype rejection,
  property/account cache isolation, caller-owned idempotency, and absence of
  provider checkout;
- W05 onboarding/activation regression with real PostgreSQL migration proof;
- API lint/build, Admin/Penghuni typecheck/lint/build, and non-generated
  formatting.

Exact final command exits and pass counts are reported in the executor handoff.

## 7. Deferred runtime and release gates

- No process-only browser/API credential was available for authenticated UI
  acceptance; source-level route/parser tests and production builds are the
  current evidence.
- No canonical migration or seed command was executed.
- Invoice PDF generation and mediated download are source-implemented and
  render-verified. A separate receipt PDF is not claimed; immutable receipt
  data remains accessible in both roles.
- Gateway/provider settlement remains disabled/deferred; no provider call was
  made.
- Reminder delivery is W08; checkout deposit disposition is W07.
