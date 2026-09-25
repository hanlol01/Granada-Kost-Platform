# Owner Realization Rework — Consolidated Product and Implementation Plan

> **Status:** Product decision draft. This document records the agreed target behaviour; it does **not** mean that the new workflow, database schema, screens, exports, or documents have already been implemented.
>
> **Scope:** Replace the future operational use of the legacy **Owner Settlement / Setoran Owner** workflow with a full-contract **Owner Realization** workflow, while preserving all historical records and documents.
>
> **Audience:** Product, finance operations, backend, frontend, QA, and future implementation agents.

## 1. Purpose

**Owner Realization** is the controlled process used by Admin to release the Property Owner's share of rent after a resident's lease contract has been paid in full.

The process must support both:

1. **New operational records** created through the application; and
2. **Historical realization records** for periods already handled manually, initially including August and September 2026.

The target system must allow Admin to prepare the eligible room list, submit it to internal Finance, record one or more successful transfers, generate auditable documents, and make only the appropriate published documents available to the relevant Owner.

## 2. Confirmed business rules

### 2.1 Eligibility is based on a fully paid lease contract

A lease may enter an Owner Realization report only when all of the following are true:

- The lease is a normal paid tenancy, not an Owner-sponsored occupancy.
- The full rent contract balance is paid and verified.
- Contract outstanding is exactly `Rp0`.
- The lease has not already been allocated to another active or completed realization batch.

For example, if one Owner has five rooms and four lease contracts are fully paid while one is still outstanding, only the four fully paid contracts may appear in the official realization report, transfer, receipt, and Owner-facing document.

The outstanding contract remains visible only in an Admin-only **Not eligible for realization** section. It must not affect the official payout totals.

### 2.2 Realization uses the full contract snapshot

For every eligible lease, the realization calculation is based on the lease snapshot stored at onboarding or contract creation:

`Net Owner realization = Total lease contract rent − Total management fee for the contract + approved controlled correction`

The baseline calculation must use:

- The agreed lease tariff snapshot, whether standard tariff or negotiated/special tariff;
- The full contractual duration;
- The total management-fee snapshot for that same contract duration; and
- Verified rent payments only.

A later room tariff change, management-fee policy change, or Owner assignment change must never recalculate a historical or already-prepared realization line.

### 2.3 A fully paid long contract may be realized before checkout

Physical checkout is informational for this feature. A contract that is fully paid may be realized even if the resident is still occupying the room. The report should still show actual check-in and physical checkout dates when available.

### 2.4 Excluded money and tenancy types

- **Security deposits** are tenant liabilities. They never enter Total Rent, Management Fee, Owner Realization, Owner progress, or Owner entitlement.
- **Owner-sponsored occupancy** has room rent of `Rp0` and therefore creates no normal rent realization for the Owner. It must not be mixed into normal realization totals.
- Any management fee associated with an Owner-sponsored occupancy must remain a separate business stream unless a future policy explicitly introduces a separate Owner-sponsored settlement model.

### 2.5 One paid contract may be released only once

The backend must prevent the same fully paid lease from being included in more than one active or completed realization batch. This must be enforced transactionally on the server, not only by disabled UI controls.

### 2.6 Reporting period, eligibility date, and carry-forward

`paid_in_full_at` in the `Asia/Jakarta` business timezone determines the first date on which a lease becomes eligible. The selected realization report period is the commercial release period, not a replacement for that completion date.

A fully paid lease that was not realized in its first eligible period must remain available as a **carry-forward candidate** in later open periods until it is allocated to a realization batch. It must retain its original paid-in-full date and must never disappear merely because a calendar month has closed.

### 2.7 Owner recipient resolution

When a realization report is prepared, the system resolves the recipient from the active room/asset ownership mapping and snapshots the receiving Owner, relevant asset scope, and approved payout destination.

After the draft is created, a later profile, bank-account, room, tariff, or ownership change must not rewrite its recipient or historical figures. A transfer of ownership during an active lease must not be automatically prorated or silently reassigned. It requires a separately approved, auditable transition or correction before the report is submitted for review.

## 3. Terminology and transition from the legacy settlement model

| Term | Meaning in the new model |
| --- | --- |
| **Owner Realization** | The end-to-end operational workflow that releases the Owner's net share for fully paid contracts. |
| **Realization report** | A draft/review record for one Owner, one release period, and a selected set of eligible fully paid lease contracts. |
| **Realization batch** | The approved transfer authority containing immutable snapshots of the included contracts and calculated totals. |
| **Realization transfer** | One actual transfer event. A batch may have one or several transfers. |
| **Realized** | The batch has been fully paid to the Owner. This is different from a resident lease being `Lunas`. |
| **Owner realization receipt** | A receipt issued for one successful transfer. It is not an invoice. |
| **Historical realization import** | An auditable Admin-only import flow for manual realizations completed before this workflow existed. |

The current domain documentation describes a legacy monthly earned-service Owner Settlement model. The new realization policy is deliberately different: it releases the full contract amount only after the resident's whole contract is paid.

Before source implementation begins, the project must create an explicit superseding policy/ADR that identifies which legacy eligibility and calculation rules are replaced for future Owner Realization. Historical settlement records, transfers, PDFs, and audits must remain immutable and must not be silently recalculated or deleted.

The navigation label may temporarily remain **Setoran Owner** for familiarity, but the primary workspace title, commands, statuses, documents, and user-facing language should use **Owner Realization**.

## 4. Target lifecycle and commands

The old linear progress buttons must be rebuilt around the following lifecycle:

| State | Meaning | Primary Admin command |
| --- | --- | --- |
| Not prepared | No realization report exists yet. | Prepare realization report |
| Draft | Eligible contracts can be reviewed and controlled corrections may be added. | View details / Add report correction / Submit for review |
| Awaiting review | The report is waiting for internal review. | Approve realization / Return to draft |
| Approved | The report is approved but has not been sent to Finance. | Submit to Finance |
| Submitted to Finance | Finance submission was recorded. | Mark as awaiting transfer |
| Awaiting transfer | Finance is expected to transfer the approved total. | Record successful transfer |
| Partially realized | One or more transfers succeeded, but the approved total is not fully paid. | Record next transfer |
| Realized | Successful transfer totals equal the approved net Owner amount. | Publish to Owner / Download receipt |
| Published to Owner | The relevant Owner can download only their own published documents. | Download receipt / View publication audit |

The workflow must allow a report to remain in a valid intermediate state. No UI shortcut may mark a batch as fully realized until successful transfers equal the approved amount.

If a filter period has no eligible fully paid contracts, the interface should show a clear empty state rather than create a zero-value realization batch.

## 5. Required data snapshots and server rules

The implementation should introduce explicit realization entities or an equivalent aggregate model. Suggested records are:

- `owner_realization_report`
- `owner_realization_item`
- `owner_realization_batch`
- `owner_realization_transfer`
- `owner_realization_adjustment`
- `owner_realization_document`
- `owner_realization_historical_import`

Each realization item must snapshot, at minimum:

- Owner identity at the time of realization;
- Property, building/unit, room code, room number, and optional plot number;
- Resident name and lease reference;
- Lease duration and rate source (`standard` or `negotiated/special`);
- Total contract rent;
- Verified money received;
- Outstanding balance;
- Full-contract management fee;
- Net Owner realization;
- Contract payment completion date;
- Actual check-in date and physical checkout date, if any.

Each realization report/batch must additionally snapshot:

- The selected realization period and the original `paid_in_full_at` date for each line;
- The receiving Owner and asset-ownership resolution used when the report was prepared;
- The approved destination account/method, with protected account data handled according to role; and
- Monetary values in whole Indonesian Rupiah.

Bank transfer fees must be recorded as a separate operational expense. They must not silently reduce the Owner's approved realization amount unless a controlled, approved correction explicitly says otherwise.

All calculations, eligibility checks, totals, status transitions, receipt numbering, duplicate prevention, and transfer balance validation must be server authoritative.

The database must enforce or transactionally guarantee that:

- An ineligible lease cannot be added to a report;
- A lease cannot be paid out twice;
- A successful transfer cannot exceed the remaining approved batch balance;
- A completed batch cannot be edited in place;
- Reversal or correction is append-only and linked to the original record;
- Request retries cannot create duplicate transfers, documents, or imports.

## 6. Admin workspace design

The rebuilt `/reports/property-owners` workspace should have two clear areas:

1. **Active Realizations** — preparation, review, Finance submission, transfers, and publication; and
2. **Realization History** — completed, partially completed, corrected, reversed, and historically imported records.

The current progress concept remains, but it must use the lifecycle in section 4 rather than the old generic sequence. Buttons should be contextual actions, not ambiguous status labels.

### 6.1 Detail route instead of a large modal

Selecting **View details** should open a dedicated detail route with breadcrumbs. A modal is not suitable because the report includes wide tables, grouped building totals, corrections, transfer history, document downloads, and audit history.

The detail header should show:

- Owner name;
- Release/report period;
- Property and relevant building/unit scope;
- Number of eligible rooms/contracts;
- Current realization state;
- Created, approved, submitted, transferred, and published timestamps where applicable;
- The applicable tariff and management-fee reference summary.

The printable/report header must also state, in a clear structured block:

- `Owner: [Owner name]`;
- `Kostation property report: [property] · [building/unit] · [room count]`;
- `Realization period: [month and year]`; and
- A tariff reference for `3–5 months`, `6–11 months`, and `12+ months`, together with the applicable management-fee reference.

When an Owner has rooms across multiple buildings or units, lines should be grouped by building/unit with subtotals before the overall total.

### 6.2 Required realization detail table

The primary detail table must include the following columns:

| No. | Room | Resident | Property Owner | Plot No. | Lease duration | Rate type | Money received | Contract total | Outstanding | Payment completion | Management fee | Net realization to Owner | Owner realization status | Check-in | Checkout |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Implementation notes:

- **Property Owner** means the Owner receiving the realization, not another party.
- **Money received** means verified rent money received for the lease. For eligible lines it normally equals Contract total.
- **Outstanding** must be `Rp0` for every eligible line.
- **Payment completion** should show a clear paid-in-full status and date, not merely a generic payment label.
- **Rate type** must distinguish standard tariff from negotiated/special tariff.
- **Owner realization status** must communicate the line/batch state separately from the resident payment status, for example `Draft`, `Submitted to Finance`, `Partially realized`, or `Realized`.
- **Plot No. (No. Kavling)** must exist now. It should display `—` in the UI and an empty Excel cell until room master data supports it. Future room data must not rewrite historical snapshots.
- A total row must sum every monetary column that is meaningful to aggregate: Money received, Contract total, Outstanding, Management fee, and Net realization to Owner.

The Admin-only **Not eligible for realization** section should use a separate table and reason badges such as `Outstanding contract balance`, `Payment awaiting verification`, `Owner-sponsored occupancy`, or `Already allocated to another realization`.

## 7. Report corrections and post-transfer corrections

The existing **Penyesuaian** action should become **Add report correction**. It is not a free-form mechanism for changing money without controls.

### 7.1 Before submission/review

In the Draft state, an Admin may add a controlled correction only when it has:

- A correction type;
- A required business reason;
- Evidence or an internal reference when relevant;
- A link to the affected eligible room/contract or an explicitly allowed report-level source;
- Actor, timestamp, and audit trail.

Corrections may never:

- Turn an outstanding lease into an eligible lease;
- Falsify payment verification or paid-in-full status;
- Add security deposit to Owner realization;
- Add Owner-sponsored rent as if it were normal paid rent;
- Overwrite a recorded transfer; or
- Serve as unrestricted manual deductions.

### 7.2 After approval or transfer

After approval, especially after transfer, the original snapshot must not be edited. Any change must use an append-only correction, reversal, or follow-up realization document linked to the original batch and transfer.

If a resident payment is later reversed, refunded, charged back, or found invalid after the Owner has already been paid, the system must create an explicit post-transfer recovery record. The recovery must state whether it will be recovered from the Owner, netted against a future realization, or handled outside the system under a documented finance decision. The original realization transfer and receipt remain immutable.

## 8. Historical realization entry and import

Admin needs a dedicated **Historical Realization** flow for records completed manually before this workflow existed, beginning with **August 2026**. The feature must support both:

1. **Manual entry** of one historical realization/batch and its room lines directly in the application; and
2. **Bulk import** for a structured historical spreadsheet when appropriate.

Manual entry is a first-class requirement, not a fallback that depends on an Excel import. An Admin must be able to enter the actual report period, Owner, room/resident lines, transfer outcome, and evidence for an August 2026 or later historical realization even when the original work was performed entirely outside the system.

The import must capture:

- Owner and report period;
- Included eligible room/lease references;
- Actual transfer date, amount, method, and transfer reference;
- Evidence attachment or documented source;
- Import source and reason when actual amounts differ from system-calculated values;
- Required controlled correction classification for every difference;
- Actor, timestamp, idempotency key, and duplicate-prevention result.

When a matching current lease exists, the historical line should link to it while preserving the imported historical snapshot. When no matching lease can be safely identified, the system must retain a complete legacy snapshot and a visible `Unlinked historical record` marker rather than inventing a relationship.

Historical imports must be visibly labeled **Historical realization record**. They must not quietly fabricate a current workflow event or overwrite original manual evidence.

## 9. Documents and receipts

The system should generate an **Owner Realization Payout Receipt** (`Kuitansi Realisasi Hak Owner`) for each successful actual transfer. It must not be called an invoice.

Every receipt should have a unique receipt number, for example `KWT-RLS/GSH1/2026/09/0001`; the exact numbering convention must be implemented centrally and atomically.

The concise main receipt should contain:

- Receipt number, realization/batch reference, and issue date;
- Property and Owner identity;
- Release period;
- Transfer state and successful transfer date;
- Payer/manager and receiving Property Owner;
- Eligible total contract rent;
- Total management fee;
- Approved correction total, if applicable;
- Amount paid by this receipt and amount in words;
- Payment method, masked destination account, account holder, and transfer reference;
- Evidence indicator and recording Admin;
- Final/partial realization status.

The detailed room/contract table should be a clearly identified attachment, continued onto subsequent pages when necessary. PDF generation must use wrapping, repeated table headers, safe page breaks, and no text overlap.

For partial realization, the receipt must state:

- Approved batch amount;
- This transfer amount;
- Cumulative successful transfers; and
- Remaining amount.

A batch becomes `Realized` only when the remaining amount is zero. A later correction or reversal produces a new linked document; it must never overwrite the original receipt.

## 10. PDF and Excel exports

Every data-bearing screen and table in this feature must support PDF and Excel export, including:

- Active realization queue;
- Realization detail and eligible lease table;
- Not-eligible list (Admin-only);
- Realization history;
- Batch and transfer detail;
- Corrections;
- Historical import results; and
- Owner Portal documents within the authenticated Owner's own scope.

Export rules:

- Exports must use the same server-side filters, authorization scope, source query, and totals as the visible screen.
- Exports cover the full filtered result set, not only the current pagination page.
- Excel should provide at least summary, detail, transfers, and corrections sheets where applicable.
- Currency and date cells must be typed correctly; text inputs must be protected against spreadsheet formula injection.
- PDFs with wide tables should use landscape orientation, repeated headers, wrapping, and page breaks.
- Each download must be recorded in the audit trail.

## 11. Owner Portal scope

The Owner Portal may show only the authenticated Owner's own published realization reports, receipts, and relevant payment status. It must never expose:

- Other Owners' rooms, residents, totals, transfers, or documents;
- The global realization history page;
- Admin-only ineligible contracts, correction evidence, or internal Finance notes.

Publication must be explicit. A realized record does not automatically become visible to the Owner until Admin publishes it.

## 12. Security, privacy, audit, and resilience requirements

- Enforce Admin/Finance/Owner role boundaries on every API, export, and document request.
- Store only the necessary account data in realization snapshots and display destination accounts masked outside authorized Admin/Finance contexts.
- Do not expose bank account numbers, raw evidence URLs, internal notes, or other Owners' data in PDFs, exports, logs, or Portal responses without authorization.
- Audit every creation, correction, review action, approval, Finance submission, transfer recording, publication, import, download, and reversal.
- Use idempotency keys and transaction-level locking for state-changing operations.
- Treat transfer recording as a high-risk action: validate amount, remaining balance, status transition, evidence requirements, and duplicate reference handling.
- Preserve historical documents and records even if a room, resident, tariff, or Owner profile later changes.

## 13. Recommended implementation sequence

1. Write and approve the superseding Owner Realization policy/ADR and reconcile it with the legacy monthly Owner Settlement documentation.
2. Design database migrations and immutable snapshot structures without modifying historical records.
3. Implement server-side eligibility, calculations, duplicate allocation prevention, lifecycle transitions, audit events, and authorization.
4. Build the Admin Active Realizations and Realization History workspace, followed by the dedicated detail route and controlled corrections.
5. Implement Finance transfer recording, partial-transfer handling, publication, and historical import.
6. Implement PDF/Excel exports and the immutable per-transfer realization receipt.
7. Add Owner Portal projections for the authenticated Owner's published records only.
8. Validate with unit, integration, migration, authorization, export, PDF-layout, idempotency, and end-to-end workflow tests.
9. Reconcile imported August/September 2026 records against manual evidence before production rollout.

## 14. Acceptance criteria

The feature is ready only when all of the following are true:

- A contract with any rent outstanding cannot enter Owner Realization.
- A fully paid standard or negotiated/special lease is calculated from its immutable contract snapshot.
- Four paid contracts and one outstanding contract result in a report containing only the four paid contracts.
- Security deposits and Owner-sponsored occupancy are excluded from normal realization totals.
- A paid contract cannot be realized twice, including under concurrent requests.
- The full lifecycle supports draft, review, approval, Finance submission, partial transfers, final realization, and publication.
- All adjustments are typed, reasoned, auditable, and cannot falsify eligibility or overwrite a transfer.
- Historical imports are traceable and cannot silently duplicate current records.
- The detail table includes `Property Owner` and `Plot No.`, with `—`/blank plot values until room master data is added.
- A successful transfer generates an immutable, non-overlapping receipt with the correct total and attachment detail.
- All applicable Admin tables and Owner-scoped documents export correctly to PDF and Excel.
- The Owner Portal exposes only the authenticated Owner's published realization data and documents.

## 15. Deliberately deferred work

The following is intentionally outside this realization rework and must be delivered through separate, auditable changes:

- Adding a master-data input for room plot number (`No. Kavling`);
- Any new settlement model for Owner-sponsored occupancy management fees;
- Retroactively filling missing plot numbers in historical realization snapshots;
- Rewriting or deleting historical legacy Owner Settlement records;
- Any change to resident rent, deposit, checkout, or payment verification rules.
