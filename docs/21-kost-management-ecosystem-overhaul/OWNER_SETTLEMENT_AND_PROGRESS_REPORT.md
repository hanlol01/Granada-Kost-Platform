# Owner Settlement and Payment Progress Report

Status: **APPROVED SPECIFICATION — IMPLEMENTED IN SOURCE; MIGRATION 080 PENDING DEPLOYMENT**

Program: `KMO` — KOSTATION Kost Management Ecosystem Overhaul

Recorded: 2026-09-12 (Asia/Jakarta)

Audience: Product, Finance, Admin operations, Property Owner, Backend, Frontend,
QA, and deployment reviewers.

## 1. Purpose and Authority

This document defines the fifth Admin report workspace, `Setoran Owner`, and the
documents exposed to a Property Owner. It separates live contract-payment
progress from recognized Owner Entitlement, approved monthly settlement, and
money actually transferred to the Owner.

The UI, API workflow, export path, authority gates, and source migration are now
implemented in the working tree. Production behavior remains pending the
official migration runner and release deployment; this document does not claim
that migration 080 has already run in production.

When this document conflicts with lower-authority material, apply the authority
order in `README.md` and the latest explicit product-owner decision.

## 2. Decision Summary

KOSTATION uses a controlled hybrid workflow:

1. the system calculates a live draft from authoritative records;
2. Admin reviews the source rows and any exceptions;
3. Admin may append a typed adjustment with reason and evidence, but may not
   overwrite a calculated total;
4. Admin approves the monthly settlement;
5. Admin explicitly publishes the approved settlement to the Property Owner;
6. Admin records each actual payout with destination snapshot, reference, date,
   amount, and evidence;
7. later corrections use a new append-only adjustment, payout reversal, or
   replacement publication and never rewrite a published financial record.

The live progress view is dynamic. An approved and published settlement is an
immutable period snapshot.

## 3. Canonical Vocabulary

| Term | Canonical meaning |
| --- | --- |
| Contract target | Total immutable rent value of the Owner's in-scope lease contracts. It is a collection goal, not current-period revenue. |
| Verified contract collection | Verified Booking Fee, DP, and rent allocations applied to in-scope lease rent invoices, excluding Security Deposit and reversed allocations. |
| Contract outstanding | Contract target minus eligible verified contract collection, floored at zero. |
| Collection progress | Verified contract collection divided by contract target. |
| Gross Earned Rent | Verified rent allocated to service already delivered. Advance cash is recognized over service coverage, not wholly on receipt. |
| Management Fee | KOSTATION fee derived from the effective commercial policy and earned service coverage. |
| Owner Entitlement | Owner share of Gross Earned Rent before valid Owner adjustments. |
| Adjusted Owner Entitlement | Owner Entitlement plus approved append-only Owner adjustments. |
| Owner Settlement | Monthly reconciliation snapshot containing recognized earnings, fee, adjustments, and amount payable to one Owner. |
| Owner Payout | Money actually transferred to the Owner against an approved settlement. |
| Published settlement | An approved settlement explicitly made visible to the Owner with publication audit metadata. |
| Progress report | Dynamic informational view/download generated from current source truth. It is not a final settlement or proof of transfer. |

`Invoice` remains the formal receivable document for an amount owed by a debtor.
KOSTATION must not label a progress report, settlement statement, or payout proof
as an invoice merely because it is downloadable.

## 4. Financial Separation

The following authorities must never be collapsed into one number:

```text
Resident Payment
    -> verified allocation to rent invoice
        -> earned service coverage
            -> Gross Earned Rent
                -> Owner Entitlement + Management Fee
                    -> approved Owner Settlement
                        -> actual Owner Payout
```

A resident may pay a 12-month contract in advance. The full verified amount may
increase contract collection progress immediately, but only service already
delivered contributes to Gross Earned Rent and Owner Entitlement for a monthly
settlement.

Security Deposit is a refundable liability and contributes zero to contract rent
collection, Gross Earned Rent, Owner Entitlement, and Management Fee.

## 5. Admin Navigation and Route

The Admin `/reports` workspace has five tabs:

1. `Penyewaan`;
2. `Pembayaran`;
3. `Pengeluaran`;
4. `Keuangan`;
5. `Setoran Owner` — `Hak Owner, pemeriksaan laporan, dan status transfer`.

The target route is `/reports/property-owners`. It uses a dedicated workflow
component rather than forcing settlement commands into the generic flat report
table used by the first four reports.

## 6. Setoran Owner Workspace

### 6.1 Summary

For the selected period and authorized property, show:

- total Owner Entitlement;
- total Management Fee;
- total approved adjustments;
- total amount payable after adjustments;
- total payout recorded;
- total payout outstanding;
- Owner count awaiting review;
- Owner count approved but not published;
- Owner count published but not fully paid.

Summary amounts use server authority and the same filters as the list and export.

### 6.2 Filters

- reporting month;
- Owner name;
- category (`Rumah Kost` or `Apart Kost`);
- building;
- review status;
- publication status;
- payout status;
- search by Owner, room, building, settlement reference, or payout reference.

Filters are URL-backed. Reset restores the current completed reporting month and
the default actionable status without removing property scope.

### 6.3 Owner-period table

One row represents one Property Owner and one reporting period:

- Owner name;
- asset and occupied-room counts;
- period;
- Gross Earned Rent;
- Management Fee;
- Owner adjustments;
- adjusted Owner Entitlement;
- payout recorded;
- payout outstanding;
- review status;
- publication status;
- payout status;
- actions.

Primary actions:

- `Lihat rincian`;
- `Periksa laporan`;
- `Setujui`;
- `Terbitkan ke Owner`;
- `Catat setoran`;
- `Unduh laporan`;
- `Lihat riwayat`.

Actions are shown only when valid for the current state and actor permission.

### 6.4 Owner-period detail

The detail page or large drawer shows one row per room/lease/service allocation:

- room and building;
- resident display name;
- lease code, duration, pricing tier, start date, and end date;
- immutable contract value;
- eligible verified collection and contract outstanding;
- collection percentage;
- service coverage recognized in the selected month;
- Gross Earned Rent;
- Management Fee;
- Owner Entitlement;
- approved adjustments;
- payout allocation and remaining payable amount;
- supporting references and safe evidence indicators.

The detail must explain why contract collection progress can be ahead of monthly
Owner Entitlement.

## 7. Live Owner Progress

### 7.1 Behavior

The Owner Portal updates after an authoritative event such as:

- payment verification;
- active allocation or allocation reversal;
- refund or financial correction;
- lease activation, completion, termination, or transfer;
- ownership-scope change;
- earning recognition;
- approved adjustment;
- payout or payout reversal.

The UI displays `Terakhir diperbarui` using the server timestamp and labels all
unsettled figures as estimates or live progress.

The system does not permanently issue a new PDF after every payment. That would
create document noise and ambiguous versions. Instead:

- the portal refreshes the live figures;
- the Owner or Admin may select `Unduh laporan progres terbaru` at any time;
- each download is generated from one server snapshot, carries `generated_at`
  and a checksum, and is audit logged;
- scheduled or threshold notifications may be added later, but a notification is
  not financial publication authority.

### 7.2 Live progress totals

The primary progress card shows:

```text
Target kontrak aktif
Pembayaran penghuni sudah masuk
Sisa pembayaran penghuni
Persentase progres pembayaran
Perkiraan Management Fee seluruh kontrak
Perkiraan hak Owner seluruh kontrak
Hak Owner yang sudah tercatat
Setoran yang sudah diterima Owner
Sisa setoran yang sudah menjadi hak Owner
```

The first six values describe full-contract collection projections. The last
three values describe recognized and payable Owner finance. They must be visually
grouped and labelled separately.

### 7.3 Calculation outline

```text
contract_target
  = sum(in-scope immutable active-contract rent values)

verified_contract_collection
  = sum(active verified Booking Fee/DP/rent allocations to those contracts)

contract_outstanding
  = max(contract_target - verified_contract_collection, 0)

collection_progress_percent
  = verified_contract_collection / contract_target * 100

estimated_full_contract_management_fee
  = sum(effective monthly management fee * complete lease duration)

estimated_full_contract_owner_right
  = contract_target - estimated_full_contract_management_fee

recognized_owner_payable
  = adjusted_owner_entitlement - net recorded payouts
```

All sums are recomputed server-side. Frontend arithmetic is display-only.

## 8. Review, Approval, Publication, and Payout

### 8.1 Financial state

The settlement financial state remains:

```text
draft -> ready_for_review -> approved -> paid
  |             |
  +-----------> void
```

`Dibayar sebagian` is derived when net payouts are greater than zero and below
the approved amount; it need not become a mutable settlement amount.

### 8.2 Publication state

Publication is separate from financial state:

- `belum_diterbitkan`;
- `diterbitkan` with `published_at`, `published_by_user_id`, document version,
  checksum, and safe Owner notification reference;
- `digantikan` only by an explicit corrected publication that references the
  prior publication.

Approval does not automatically expose the settlement to the Property Owner.
Publishing requires a separate Admin command and audit event.

### 8.3 Review rules

Admin reviews:

- earning coverage and payment-allocation sources;
- effective ownership attribution;
- Management Fee policy snapshot;
- reversals, refunds, transfers, and exceptions;
- payout destination readiness.

Admin may not type or overwrite Gross Earned Rent, Management Fee, Owner
Entitlement, paid total, or outstanding total.

### 8.4 Adjustments

An adjustment is append-only and requires:

- type;
- affected earning/room/lease;
- signed amount components that reconcile;
- effective month;
- reason;
- supporting evidence when the policy requires it;
- authorized actor and timestamp.

Existing recognized adjustment classes are reversal, refund, transfer proration,
and clawback. A new deduction such as tax, bank fee, maintenance, or operating
expense requires a separately approved business policy and typed authority. A
free-text deduction must not reduce Owner payout.

### 8.5 Payout

Each payout record requires:

- approved and published settlement;
- positive amount not exceeding payable remainder;
- transfer date/time;
- method;
- reference;
- immutable masked destination snapshot;
- transfer evidence;
- recorder identity and audit context.

Multiple payouts may settle one settlement. A reversal references the original
payout and never deletes it.

## 9. Owner Documents

### 9.1 Laporan Progres Hak Owner

Purpose: dynamic collection and entitlement visibility.

Availability: current Owner Portal and Admin detail, downloadable on demand.

Required marking:

> Laporan progres sementara — bukan laporan setoran final atau bukti transfer.

Required contents:

- Owner and property identity;
- generation timestamp and checksum;
- current ownership scope;
- contract target, collection, outstanding, and percentage;
- projected Management Fee and projected full-contract Owner right;
- recognized Owner Entitlement, payouts, and payable remainder;
- per-room detail;
- methodology and exclusions.

### 9.2 Laporan Hak dan Setoran Owner

Purpose: official approved period reconciliation.

Availability: only after explicit publication.

Required contents:

- unique document number and version;
- Owner, property, and reporting period;
- publication and approval metadata;
- Gross Earned Rent;
- Management Fee;
- itemized approved adjustments;
- adjusted Owner Entitlement;
- per-room/service detail;
- payout status at generation time;
- methodology, checksum, and correction reference when applicable.

### 9.3 Bukti Setoran Owner

Purpose: proof of actual payout.

Availability: after a payout is recorded.

Required contents:

- related settlement and published-report number;
- payout amount and date;
- method and masked destination;
- reference number;
- evidence indicator;
- cumulative payout and remaining payable amount;
- recorder and document checksum.

### 9.4 Formats

- PDF is the human-readable official document.
- XLSX is the detailed reconciliation export.
- Preview, PDF, and XLSX use the same server query, scope, totals, rows, and
  checksum inputs.
- A progress download is a point-in-time snapshot, not a durable accounting
  ledger.
- A published settlement document is immutable and versioned.

## 10. Owner Portal Visibility

The Owner Portal has two explicitly separated sections:

1. `Progres pembayaran kontrak` — live, informational, and dynamic;
2. `Laporan setoran resmi` — approved and published immutable settlements and
   related payout proofs.

The Owner may not see:

- an unpublished settlement;
- internal review notes;
- raw payment proof or unrestricted storage paths;
- complete payout destination values;
- another Owner's assets, earnings, settlement, payout, or evidence;
- Admin-only audit payloads.

An empty authorized scope returns zero rows and never falls back to property-wide
data.

## 11. Authority Matrix

| Data/action | System | Admin | Property Owner |
| --- | --- | --- | --- |
| Calculate contract target and collection | Authoritative | Read | Read own scope |
| Recognize earned service | Authoritative | Trigger/review | Read own scope |
| Calculate fee and entitlement | Authoritative | Review | Read own scope |
| Overwrite calculated totals | Prohibited | Prohibited | Prohibited |
| Append typed adjustment | Validate/store | Authorized command | Read published result |
| Approve settlement | Validate/lock | Authorized command | No |
| Publish settlement | Validate/audit | Authorized command | Receives visibility |
| Record payout | Validate/store | Authorized command | Read own payout |
| Reverse payout | Validate/store | Authorized command | Read correction history |
| Download live progress | Generate/audit | Yes | Yes, own scope |
| Download official report/proof | Generate from published snapshot | Yes | Yes, own scope |

## 12. Target API Surface

Exact DTO names may follow repository conventions, but the behavior is split by
authority:

```text
GET  /admin/property-owner-reports/summary
GET  /admin/property-owner-reports
GET  /admin/property-owner-reports/:ownerId/progress
GET  /admin/property-owner-reports/:ownerId/periods/:period
POST /admin/property-owner-reports/:ownerId/periods/:period/prepare
POST /admin/property-owner-reports/:ownerId/periods/:period/submit-review
POST /admin/property-owner-reports/:ownerId/periods/:period/approve
POST /admin/property-owner-reports/:ownerId/periods/:period/publish
POST /admin/property-owner-reports/:ownerId/periods/:period/adjustments
POST /admin/property-owner-reports/:ownerId/periods/:period/payouts
POST /admin/property-owner-reports/payouts/:payoutId/reverse
GET  /admin/property-owner-reports/:ownerId/exports

GET  /my/property-owner/progress
GET  /my/property-owner/settlements
GET  /my/property-owner/settlements/:settlementId
GET  /my/property-owner/documents/:documentId
```

The current close-period command must be reconciled into this lifecycle. A
single command must not prepare, review, approve, publish, and pay a settlement.

Every mutation requires permission, property scope, Owner scope, idempotency,
database locking, audit, and outbox behavior before it is considered complete.

## 13. Persistence Reuse and Additions

Reuse the existing authorities:

- `property_owner_earnings`;
- `property_owner_settlements`;
- `property_owner_settlement_lines`;
- `property_owner_earning_adjustments`;
- `property_owner_payout_destination_snapshots`;
- `property_owner_payouts`.

Add explicit publication/document authority, preferably append-only tables:

- settlement publication identity and version;
- published snapshot checksum and storage reference;
- superseded-publication reference;
- safe Owner notification linkage;
- generated document audit metadata.

Do not store live progress totals as a second ledger. They are derived from
authoritative contracts, payments, allocations, earnings, adjustments, and
payouts.

## 14. Error and Concurrency Rules

- Preparing an already prepared period returns an idempotent result or an
  explicit state conflict.
- Approval fails if the calculated source checksum changed after review began.
- Publication fails unless the settlement is approved.
- Payout fails unless the settlement is approved and published.
- Payout above the payable remainder fails atomically.
- A concurrent payment/reversal cannot silently alter an approved snapshot.
- A correction after publication creates linked correction history.
- Export fails closed on missing property/Owner/document authority.

## 15. Acceptance Criteria

1. Admin `/reports` exposes the fifth `Setoran Owner` tab and a shareable route.
2. The default view shows actionable Owner-period records for one authorized
   property and completed reporting month.
3. Live contract target and collection progress reconcile to eligible verified
   payment allocations.
4. Monthly Owner Entitlement reconciles to earned service coverage, not payment
   receipt date alone.
5. Security Deposit contributes zero to all rent and Owner-income totals.
6. Admin cannot directly edit calculated financial totals.
7. Review, approval, publication, and payout are separate authorized commands.
8. Owner cannot read a settlement before publication.
9. Published documents remain immutable; corrections preserve prior versions.
10. Partial payouts display cumulative paid and remaining amounts correctly.
11. Preview, PDF, and XLSX reconcile to identical scope, rows, totals, and
    checksum inputs.
12. Cross-owner, cross-room, cross-building, and cross-property access fails
    closed.
13. Every adjustment, publication, payout, reversal, and export is audit logged.
14. Mobile Owner Portal clearly separates live progress from official reports.
15. Automated contract, authorization, calculation, export, and concurrency
    tests pass before production migration or release switch.

## 16. Implementation Sequence

1. reconcile canonical policy and existing close-period behavior;
2. add publication/document persistence and migration guards;
3. split prepare, review, approve, publish, payout, and reversal services;
4. expose Admin summary/list/detail and mutation contracts;
5. build the fifth Admin report workspace;
6. expose live progress and published documents in the Owner Portal;
7. implement PDF/XLSX generation from the shared server query authority;
8. add audit, outbox, notification, and permission coverage;
9. add calculation, state-machine, scope, idempotency, and concurrency tests;
10. run migration rehearsal, production backup gate, controlled deploy, and
    post-deploy financial reconciliation.

## 17. Decisions Deferred for Explicit Business Approval

The following must not be inferred during implementation:

- payout deadline after monthly settlement publication;
- whether partial payouts are operationally allowed even though the ledger can
  represent them;
- tax withholding and tax-document responsibility;
- bank charges and who bears them;
- whether maintenance or another expense may ever reduce Owner payout;
- payout destination verification process;
- automatic Owner notification channel and frequency;
- formal legal naming/numbering of the published settlement document.
