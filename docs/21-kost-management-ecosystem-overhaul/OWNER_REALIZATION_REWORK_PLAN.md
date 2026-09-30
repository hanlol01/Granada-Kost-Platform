# Owner Realization — Unified Product and Implementation Plan

> **Status:** Approved v2 specification — 2026-09-27.
>
> **Transition status:** The locally implemented v1 realization model and its
> migrations remain valuable source data. This document supersedes only its
> user-facing split between “prepare realization” and “historical input”.
> Existing drafts, transfers, documents, evidence, imports, locks, and audit
> records must be migrated or preserved; they must never be deleted or recreated
> merely to adopt this design.
>
> **Scope:** The future operational replacement for the legacy Owner Settlement /
> Setoran Owner workflow. It covers complete-contract Owner Realization,
> historical recording, Finance hand-off, transfer evidence, final documents,
> exports, and Owner Portal publication.
>
> **Audience:** Product, Finance operations, Admin operations, backend,
> frontend, QA, and future implementation agents.

## 0. Language and localization requirement

This plan is written in English as implementation guidance for engineering
agents. That does not authorize English product copy. All text visible to Admin,
Finance staff, and Property Owners must be Indonesian, consistent with the
existing application language. This includes page titles, tabs, buttons, form
labels, status badges, validation messages, empty states, notifications,
document titles, PDF/Excel headings, and accessibility labels.

Use these Indonesian UI labels:

| Purpose | Required Indonesian UI label |
| --- | --- |
| Primary create action | **Buat Realisasi** |
| Active queue | **Realisasi Aktif** |
| History queue | **Riwayat Realisasi** |
| Ineligible queue | **Tidak Layak Direalisasikan** |
| Already transferred condition | **Dana sudah ditransfer ke Owner** |
| Not yet transferred condition | **Dana belum ditransfer ke Owner** |
| Draft | **Draf** |
| Awaiting review | **Menunggu Pemeriksaan** |
| Returned | **Dikembalikan untuk Perbaikan** |
| Approved | **Disetujui** |
| Submitted to Finance | **Diajukan ke Bagian Keuangan** |
| Awaiting transfer | **Menunggu Transfer** |
| Partially realized | **Terealisasi Sebagian** |
| Realized | **Berhasil Direalisasikan** |
| Void | **Dibatalkan** |
| Unpublished | **Belum Diterbitkan ke Owner** |
| Published | **Diterbitkan ke Owner** |
| Superseded | **Digantikan** |
| Complete documentation | **Dokumen Lengkap** |
| Documentation exception | **Pengecualian Dokumen** |
| Final receipt | **Kuitansi Realisasi Hak Owner** |
| Detailed statement | **Rincian Realisasi Owner** |
| Draft watermark | **DRAF — BUKAN BUKTI PEMBAYARAN** |
| Partial-transfer label | **TRANSFER SEBAGIAN — BELUM LUNAS** |

English identifiers may remain in code, API contracts, database enums, and this
engineering document. Every enum must have an explicit Indonesian display
label. Do not expose raw identifiers as UI copy.

## 1. Decision summary

There is one primary Admin action, labelled:

    Buat Realisasi

It is used for every reporting period, including August and September 2026
records that were completed outside the system and future periods that still
need a Finance transfer.

The wizard asks for the real-world disbursement condition, not whether a period
is “historical”:

1. **Already transferred to the Property Owner** — record an actual completed
   external transfer and reconcile it against the realization total.
2. **Not yet transferred to the Property Owner** — create a controlled
   realization for review, Finance submission, and later transfer recording.

“Historical” becomes immutable provenance metadata on a realization. It is not
a separate tab, button, route, or second business workflow. The UI must remove
all standalone **Input Historis** controls.

The distinction is important: an August realization can still be awaiting a
transfer, and an October realization can already have been transferred. The
actual status of Owner money determines the path.

## 2. Product purpose and financial boundary

**Owner Realization** is the controlled process that releases a Property
Owner’s share of a resident lease after the resident’s whole normal rent
contract is verified as paid in full.

The following financial boundary is binding:

    Resident rent payment != Owner entitlement != Owner payout

- A verified resident payment is not, by itself, an Owner payout.
- A completed lease creates an eligible full-contract realization candidate.
- An Owner payout exists only after an actual transfer is recorded and
  reconciled.
- Security Deposit is a refundable tenant liability. It is never rent revenue,
  Management Fee, Owner entitlement, realization value, or Owner payout.
- Owner-sponsored occupancy has room rent of Rp0. It never enters a normal
  Owner Realization, even when it has a separate management-fee arrangement.

This document implements the full-contract realization policy defined by
DEC-OWNER-016. It does not rewrite or delete legacy monthly Owner Settlement
records.

## 3. Eligibility, calculation, and immutable snapshots

### 3.1 Eligibility

A lease can be selected only when all conditions are true:

- It is a normal paid tenancy, not Owner-sponsored occupancy.
- Its entire rent contract balance is verified and paid.
- Contract outstanding is exactly Rp0.
- It has not been allocated to another active or completed realization.
- The receiving Property Owner can be resolved from the authoritative asset
  ownership assignment, or a controlled historical reconciliation exception is
  approved.

If one Owner has five rooms and only four contracts are fully paid, the
realization contains only the four paid contracts. The remaining contract stays
in the Admin-only **Not eligible** view and affects neither the total nor the
final Owner document.

A contract that became fully paid in an earlier month but was not realized
remains a carry-forward candidate for later open periods. Its original
paid-in-full date must remain visible.

### 3.2 Calculation

For a linked eligible contract, the server calculates:

    Net Owner realization
      = immutable full contract rent
      - immutable full-contract Management Fee
      + approved signed realization adjustments

The calculation uses the committed lease snapshot:

- standard or negotiated/special tariff source;
- selected monthly rate;
- full contract duration;
- full-contract Management Fee;
- verified rent amount;
- payment-completion timestamp;
- room, resident, ownership, and payout-destination information.

Later changes to room tariff, Management Fee policy, Owner profile, bank
account, ownership assignment, room master data, or lease data must never
rewrite a realization already created.

Bank transfer fees are separate operational expenses. They cannot silently
reduce the approved Owner amount. A difference requires an approved, typed,
append-only adjustment.

### 3.3 Reporting period

The report period is a commercial month selected in the Asia/Jakarta business
timezone. It is separate from:

- the resident’s paid-in-full date;
- the actual transfer date; and
- the system record creation date.

Historical recording is initially permitted for August 2026 and later. The
system must keep all three dates distinct, especially when a legacy August
transfer is recorded in the system months later.

An Owner may have more than one realization batch for the same reporting
period. This supports contracts that become fully paid at different times in a
month or deliberate exclusion from an earlier batch. A lease may appear in
only one active realization, and each batch receives its own immutable
realization identifier, receipt number, detail statement, and audit trail.

There is no automatic period close in this release. An Admin may create a
later batch for any reporting period from August 2026 onward, provided that
every selected lease remains eligible and unallocated. The actual transfer
date, reporting period, and system-recording date remain distinct facts.

## 4. One Create Realization wizard

The Admin queue has only three workspaces:

1. **Realisasi Aktif**;
2. **Riwayat Realisasi**; and
3. **Tidak Layak Direalisasikan**.

Each eligible Owner row offers **Buat Realisasi**. The create action opens
a dedicated route or full-screen wizard, not a large modal. The workflow has
wide room tables, proof upload, multiple transfers, corrections, audit data,
and document previews; a modal is not sufficiently safe or readable.

### 4.1 Wizard steps

1. **Period and recipient**
   - Select report period and Property Owner.
   - Resolve property, building/unit, room ownership, and current payout
     destination for the snapshot.

2. **Disbursement condition**
   - Already transferred to the Property Owner.
   - Not yet transferred to the Property Owner.
   - Show clear explanatory text; do not use the word “historical” as a
     separate workflow label.

3. **Lines and source**
   - Default: select every server-calculated eligible fully paid contract for
     the chosen Owner and period.
   - Before review submission, Admin may deselect a contract that will be
     realized later; the exclusion is shown in the draft audit trail.
   - For the already-transferred condition only: allow legacy/manual rows or
     spreadsheet import in the same wizard.
   - A legacy row is matched to a current lease only when room, resident,
     owner, and relevant facts produce one safe match.
   - A no-match or ambiguous match remains an explicit **Unlinked external
     record**. It cannot lock, replace, or bypass a current contract candidate.

4. **Controlled adjustments**
   - Add only typed, signed, reasoned, and evidenced adjustments.
   - Display the server-calculated base, adjustment total, and final net
     transfer value before confirmation.

5. **Transfer and evidence**
   - In the already-transferred condition, enter all actual transfer records.
   - In the not-yet-transferred condition, this step records the Finance
     submission intent; actual transfers are added later.
   - Each successful transfer record has its own required proof upload. Reuse
     the shared Admin evidence-upload control used by lease creation's **Bukti
     transfer** field, including upload progress, preview, and remove-before-save
     behavior; do not build a second uploader.
   - Reuse the same upload control for failed-transfer evidence (optional),
     pre-approval corrections when evidence is required, and completed recovery
     installments that require proof.
   - Accept JPG/JPEG, PNG, WebP, and PDF. Limit each transfer to three files
     of at most 5 MB each, with client-side image compression. Use a dedicated
     private Owner-realization file purpose so this evidence is not classified
     as resident rent-payment proof.
   - Show saved evidence in the Admin detail, grouped under the transfer or
     recovery event it supports, with a read-only preview.

6. **Review and confirmation**
   - Show immutable snapshot preview, reconciliation result, warning states,
     selected contracts, evidence state, and publication eligibility.
   - The final confirmation uses an idempotency key.

The wizard must never create a zero-value realization simply because an Owner
has no eligible contracts.

### 4.2 Finance authority for this release

This release does not create a dedicated Finance account role. The authorized
Admin records each Finance submission, acknowledgement, and transfer
confirmation. Every such action must capture the named Finance contact,
confirmation channel, reference, timestamp, and acting Admin in the audit
trail.

A future Finance role may be added as a separate authorization feature. It must
not change or invalidate realization records created under this release.

The same authorized Admin may create, review, approve, submit, acknowledge,
and record a realization in this release. This is intentional: Finance
communication happens outside Kostation, and the Admin records the resulting
manual confirmation as an auditable fact rather than impersonating a Finance
user. The audit trail must make every Admin action and every named Finance
contact distinguishable, even where they occur in one Admin session.

Creating a Draft is allowed while an Owner payout profile is incomplete so
that Admin can correct the profile. A not-yet-transferred realization cannot
be submitted to Finance until the receiving Bank Name, Account Number, and
Account Holder are all present and snapshotted. A historical external transfer
may record an unavailable legacy destination only through the controlled
documentation exception, with a required reason and source/reference; it is
never silently treated as a complete payout profile.

While the realization is Draft, Admin may update the Owner profile and invoke
**Muat Ulang Rekening Owner** to replace the payout snapshot with a new audited
snapshot. After Finance submission, the payout snapshot is immutable. If no
successful transfer exists, Admin must cancel the realization with a reason and
create a new one from the corrected payout data; if a transfer exists, the
linked recovery/correction policy applies instead.

## 5. Two disbursement paths

### 5.1 Already transferred to the Property Owner

Use this when real-world money was transferred before the Admin enters it into
Kostation, such as August and September 2026 manual realizations.

The Admin records:

- actual report period;
- selected system lines or externally supplied historical lines;
- actual transfer date for every transfer;
- amount, method, and immutable receiving-account snapshot;
- transfer reference;
- Finance confirmation person/source;
- transfer proof attachment, or a documented legacy-evidence exception;
- approved adjustment details if the external total differs from the
  system-calculated total.

The system creates the realization and its transfer records atomically. During
that same command it calculates and locks the approved realization snapshot,
then records an authorized **external reconciliation confirmation** with actor
and timestamp. This is confirmation of an already completed fact; it is not a
backdated Finance approval.

An unlinked external line is never treated as a current eligible contract. It
must retain its independently supplied historical snapshot for contract total,
Management Fee, net Owner amount, source/reference, and reconciliation reason.
It cannot lock a current candidate, replace a current lease, or bypass the
duplicate-realization guard. Its amount basis must be explicitly approved in
the external reconciliation confirmation before it can contribute to the
approved net total.

- When successful transfer total equals approved net realization, financial
  status becomes **Realized** immediately; it does not wait for a future
  Finance confirmation.
- When successful transfer total is positive but lower than the approved net
  realization, status is **Partially realized**.
- A zero amount is not a completed transfer and cannot create a “realized”
  record.

This path records an already completed fact. It must not fabricate a new
Finance approval, transfer date, or proof event.

### 5.2 Not yet transferred to the Property Owner

Use this for a new operational release, for example a future October
realization.

    Draft
      -> Awaiting review
      -> Approved
      -> Submitted to Finance
      -> Awaiting transfer
      -> Partially realized
      -> Realized

An authorized Admin performs each command explicitly:

1. Create draft from eligible server-calculated contracts.
2. Review or return the draft for correction.
3. Approve the immutable financial snapshot.
4. Submit it to Finance, recording the submission reference and recipient.
5. Record Finance acknowledgement, including the Finance reference, confirming
   person, channel, and timestamp; only then does the record move from
   Submitted to Finance to Awaiting transfer.
6. Record Finance confirmation plus actual transfer evidence after money is
   sent to the Owner.
7. Record further transfers if the approved amount is paid in parts.

The application does not independently verify a bank transfer. “Finance
confirmed” means an authorized Admin records the Finance confirmation backed by
the required evidence and audit metadata.

## 6. States, provenance, and documentation completeness

Financial state, publication state, and documentation completeness are separate
dimensions. The UI may show them together, but persistence must not collapse
them into one status.

### 6.1 Financial state

| State | Meaning |
| --- | --- |
| Draft | Lines and eligible corrections are still editable. |
| Awaiting review | Submitted for internal review. |
| Returned | Reviewer sent it back to Draft with a required reason. |
| Approved | Financial snapshot is locked and ready for Finance submission. |
| Submitted to Finance | Finance request is recorded. |
| Awaiting transfer | Finance is expected to transfer the approved amount. |
| Partially realized | Positive successful transfer total is below approved net value. |
| Realized | Successful transfer total equals approved net value. |
| Void | Draft/review process was cancelled before successful transfer. |

After a successful transfer, financial facts are append-only. A reversal,
recovery, or correction is a linked follow-up record, not an edit of the
original realization.

Cancellation is available only for Draft, Awaiting review, Returned, Approved,
Submitted to Finance, or Awaiting transfer records whose successful transfer
total is exactly `Rp0`. It requires an Admin reason and produces an immutable
audit event. A partially or fully realized record can never be cancelled.

Three milestones must remain distinct in UI copy, data, and audit:

1. **Financially realized**: successful transfer total equals approved net
   realization.
2. **Final receipt issued**: the immutable Final Owner Realization Receipt was
   generated from that fully reconciled snapshot.
3. **Published to Owner**: an authorized Admin explicitly made the permitted
   final documents visible in the Owner Portal.

### 6.2 Publication state

| State | Meaning |
| --- | --- |
| Unpublished | Authorized Admin may review the record; the Property Owner cannot see it. Finance communication remains external to the application. |
| Published | An authorized Admin explicitly released the finalized document set to its receiving Property Owner. |
| Superseded | A later linked correction publication is authoritative; the prior publication remains readable as history. |

Publication cannot occur before the realization is financially Realized. A
record with a documentation exception also requires the explicit
publish-with-exception authorization described below.

Publication is never automatic. After the final receipt and its detailed
statement are issued, an authorized Admin must choose **Terbitkan ke Owner**
and the system records the publisher, timestamp, document version, and
checksum.

### 6.3 Entry origin

Every record stores immutable provenance:

| Entry origin | Meaning |
| --- | --- |
| Initiated in system | Started before any Owner transfer occurred. |
| Recorded after external transfer | Actual transfer happened outside the workflow and is being reconciled now. |
| Legacy manual/imported line | A detail line was supplied manually or from a legacy file and may be unlinked. |

The origin appears as an Admin audit badge in the normal detail and history
views. It does not create a separate workspace.

### 6.4 Documentation completeness

| Status | Meaning |
| --- | --- |
| Pending | No successful transfer exists yet, so transfer proof is not yet required. |
| Complete | Required proof and transfer metadata are attached and readable to authorized staff. |
| Exception recorded | A legacy proof cannot be recovered; a required reason, source/reference, actor, and timestamp are stored. |

Documentation completeness never changes the financial truth that money was
actually transferred. It also must never be used to imply proof exists when it
does not.

For new transfers, proof is mandatory. For a legacy completed transfer, proof
may be replaced only by a documented exception. “Legacy” is objective: the
actual transfer must predate the configured Owner Realization rollout timestamp,
which is stored with the record and cannot be altered later. The exception
replaces only the attachment; amount, actual date, method, reference,
destination snapshot, and Finance-confirmation source remain mandatory.

The Admin upload UI reuses the shared **EvidenceFileUploadField** already used
for lease-creation **Bukti transfer**. Owner-realization transfers use a
dedicated private file purpose, a maximum of three attachments per transfer,
and a 5 MB per-file limit for JPG/JPEG, PNG, WebP, or PDF. Images are
compressed by the shared upload pipeline. Saved files are associated with the
specific transfer event and previewable from the Admin detail page; they are
never exposed as raw URLs or included in Owner Portal documents.
The read-only detail presentation uses the existing shared file-preview
component so Admins can open saved image or PDF evidence without a delete action.

Exception records are blocked from Owner Portal publication by default; an
explicitly authorized publish-with-exception command requires a reason and
audit event.

## 7. Transfer recording and reconciliation

One realization can contain one or more successful Owner transfers. Every
transfer requires:

- positive whole-Rupiah amount;
- actual transfer date and time;
- method;
- bank/provider reference for current transfers; a legacy transfer may omit it
  only when the missing reference is explicitly documented;
- immutable masked destination snapshot and account holder;
- Finance confirmation person and channel/source;
- recorder identity and timestamp;
- evidence attachment metadata, hash, and restricted storage reference; or
- the controlled legacy-evidence exception described above.

The Admin transfer form presents the approved Owner amount, successful
transfers to date, and remaining amount beside the Rupiah-formatted transfer
amount. The amount cannot exceed the remaining balance. The form captures the
actual transfer date/time, bank reference when available, Finance confirmation person,
channel/source and time, and the immutable masked destination snapshot. Since
bank transfer is the only supported disbursement method, **Metode** is a
clearly bordered field showing **Transfer Bank** rather than a misleading
dropdown with unavailable choices.

Every successful transfer, including each partial-transfer installment, owns
its own evidence set. This applies both to transfers captured inside the create
wizard and to later transfers recorded from the detail page. Failed attempts
may include evidence but do not require it.

The only supported disbursement method in this release is bank transfer. Cash,
wallet, cheque, and unstructured “other” methods are intentionally rejected
until a separately approved policy adds their proof and reconciliation rules.

Server rules:

- Sum of successful transfers must never exceed approved net realization.
- Equality is the only path to **Realized**.
- A lower positive sum is **Partially realized**.
- A duplicate reference in the relevant transfer scope is rejected.
- A difference between transfer total and calculation is rejected unless a
  typed, approved adjustment explains it.
- A retry with the same idempotency key cannot create an extra transfer,
  document, or audit event.
- A completed realization cannot be edited in place.

The screen must always show:

    Approved net realization
    Successful transfers to date
    Remaining amount
    Documentation status

An unsuccessful bank attempt is recorded as a **Transfer Gagal** event with
its attempted date, failure reason, available reference, optional supporting
evidence, and Admin actor. It does not add to the successful transfer total,
does not generate a receipt, and leaves the financial record in or returns it
to Awaiting transfer so that a later successful transfer can be recorded.

## 8. Corrections, reversals, and recovery

The former generic **Penyesuaian** action becomes **Add realization
adjustment**. It is never a free numeric override.

Before approval, an adjustment requires:

- type and signed amount;
- business reason;
- affected room/lease or allowed report-level source;
- evidence or a traceable internal reference where applicable;
- actor, timestamp, and audit metadata.

The allowed pre-approval adjustment types are deliberately narrow:

1. verified contract-rent correction;
2. verified Management Fee correction; and
3. verified rent refund or cancellation correction.

Each adjustment must be signed positive or negative, use one of those types,
and retain its evidence. There is no generic “other amount” escape hatch.

An adjustment cannot:

- make an outstanding contract eligible;
- add Security Deposit or Owner-sponsored rent;
- overwrite rent payment verification;
- overwrite a recorded transfer;
- become an unrestricted maintenance, tax, or bank-fee deduction.

After approval or transfer, corrections, reversals, chargebacks, refunds, and
recoveries are append-only linked records. A recovery must identify whether it
will be recovered from the Owner, netted from a future realization, or handled
outside the system under a documented Finance decision recorded by Admin.

It must never rewrite the original realization, transfer, receipt, or detailed
statement. The follow-up recovery record has its own reason, evidence, actor,
timestamp, disposition, and link to the affected realization. It may produce a
later superseding publication, but the original publication remains readable
as historical evidence.

The post-transfer correction form labels its positive Rupiah amount **Nominal pengembalian dana berlebih** and
offers **Tagih ke Owner**, **Potong realisasi berikutnya**, and **Diselesaikan
di luar sistem** as the three recovery paths. A recovery can be resolved in
multiple append-only installments. Each completion installment records its
actual date, amount, and supporting file or traceable financial reference;
reason is required when the recovery case is opened. Before completion, the
case remains visibly open or partially recovered. The Admin detail shows each
recovery attachment beside its corresponding installment.

## 9. Admin detail and reporting layout

Selecting a realization opens a dedicated detail route with breadcrumbs. The
header shows:

- Place breadcrumbs at the top of the content area. Keep **Kembali ke
  Realisasi Owner** compact and content-sized below them, reduce excess top
  spacing, and keep PDF/Excel actions visually separated with a clear gap.

- Property Owner;
- realization period;
- property/building/unit scope and room count;
- financial, publication, and documentation states;
- created, reviewed, approved, submitted, transfer, and publication times;
- selected tariff-tier and Management Fee references;
- original paid-in-full dates for carried-forward contracts.

The main table has these columns:

| No. | Room | Resident | Property Owner | Plot No. | Lease duration | Rate type | Money received | Contract total | Outstanding | Payment completion | Management fee | Net realization to Owner | Line state | Check-in | Checkout |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rules:

- Property Owner means the realization recipient.
- Money received is verified rent money, not Security Deposit.
- Outstanding is Rp0 for linked eligible lines.
- Rate type distinguishes standard and negotiated/special tariff.
- Plot No. displays an em dash in the UI and an empty Excel cell until room
  master data adds plot-number input. Future room changes do not rewrite a
  historical snapshot.
- Group rows by building/unit and provide subtotals.
- The final total row aggregates money received, contract total, outstanding,
  Management Fee, adjustments, and net realization.

The separate Admin-only Not eligible table provides a reason badge, for example
Outstanding contract balance, payment awaiting verification, Owner-sponsored
occupancy, already allocated, or unresolved ownership.

## 10. Documents, receipts, and exports

No Owner Realization document is called an invoice.

### 10.1 Document set

1. **Realization draft/review report**
   - Available to authorized Admin staff during the workflow.
   - Clearly marked **DRAFT — NOT A PAYMENT RECEIPT**.

2. **Transfer confirmation**
   - One immutable confirmation per successful transfer.
   - Identifies the transfer amount, date, method, masked destination,
     reference, evidence state, and cumulative/remaining batch value.
   - A partial transfer is prominently labelled **PARTIAL — NOT FINAL**.

3. **Final Owner Realization Receipt**
   - Issued only once successful transfers reconcile exactly to the approved
     net realization.
   - Receives the centrally allocated KWT-RLS number.
   - Recommended format: KWT-RLS/{property-code}/{roman-month}/{year}/{sequence}.
   - Includes Owner, property, report period, all included transfer references,
     total contract rent, Management Fee, approved adjustments, final amount,
     amount in words, actual transfer dates, recipient snapshot, evidence
     status, and the final realization state.
   - Its recipient snapshot displays Bank Name, Account Holder, and only the
     final four digits of the account number. The full account number remains
     restricted to authorized Admin data and is never exposed in the Owner
     Portal or exported by default.

4. **Detailed realization statement**
   - The full room/contract table, totals, corrections, and transfer history.
   - Used as the formal attached detail for the final receipt.

For legacy completed transfers, generated documents must show both:

- the actual historical transfer date; and
- the later system generation/recording date.

If an external legacy receipt exists, store it as evidence and preserve its
reference. A new system document must not pretend it was issued at the
historical time or overwrite the legacy receipt.

### 10.2 PDF and Excel

Every data-bearing Admin table in this feature supports PDF and Excel export:

- active queue;
- realization detail;
- not-eligible list;
- realization history;
- transfer list;
- correction list; and
- permitted Owner Portal documents.

Exports use the same server-side authorization scope, filters, rows, totals,
and calculation checksum as the visible view. They export the full filtered
result, not merely the current page.

Excel contains correctly typed date/currency cells and protects text against
formula injection. Wide PDFs use landscape layout, repeated headers, wrapped
text, safe page breaks, and no overlap. Every download is audit logged.

## 11. Owner Portal publication

The Property Owner can see only their own explicitly published, fully realized
records and their permitted documents.

The Portal must never expose:

- another Owner’s assets, residents, totals, transfers, or documents;
- Admin-only not-eligible rows;
- internal Finance notes;
- raw proof URLs or storage paths;
- unrestricted account numbers;
- correction evidence or audit payloads.

Financial realization and visibility remain distinct. A record is not visible
simply because it is Realized. Publication is a separate Admin command with
publisher, timestamp, document version, checksum, and audit metadata.

The Owner document allowlist is deliberately narrow:

- Final Owner Realization Receipt; and
- Detailed realization statement attached to that final receipt.

Per-transfer confirmations, draft/review reports, legacy proof files, raw bank
evidence, internal correction material, and internal Finance notes remain
Admin/Finance-only even after final publication.

Archived Owner profiles are hidden from the active realization queue by
default. Admin can expose them through an explicit **Status Profil Owner:
Diarsipkan** filter to read history and record a factual historical external
transfer. A new not-yet-transferred realization is forbidden for an archived
Owner. Archiving after a realization has been created never rewrites its
snapshots or hides its preserved audit/document history.

## 12. Persistence, API, and authorization

Use an aggregate equivalent to:

- owner realization header;
- immutable realization lines;
- append-only adjustments;
- append-only transfer records and evidence metadata;
- document/publication records;
- audit/outbox events; and
- provenance/documentation-completeness fields.

Suggested API behavior:

    POST /admin/owner-realizations/create
    POST /admin/owner-realizations/:id/submit-review
    POST /admin/owner-realizations/:id/return
    POST /admin/owner-realizations/:id/approve
    POST /admin/owner-realizations/:id/submit-finance
    POST /admin/owner-realizations/:id/finance-acknowledge
    POST /admin/owner-realizations/:id/record-transfer
    POST /admin/owner-realizations/:id/record-failed-transfer
    POST /admin/owner-realizations/:id/adjustments
    POST /admin/owner-realizations/:id/refresh-payout-snapshot
    POST /admin/owner-realizations/:id/publish
    POST /admin/owner-realizations/:id/void
    POST /admin/owner-realizations/transfers/:transferId/reverse
    GET  /admin/owner-realizations
    GET  /admin/owner-realizations/:id
    GET  /admin/owner-realizations/:id/exports
    GET  /my/property-owner/realizations
    GET  /my/property-owner/realizations/:id/documents/:documentId

Exact route names may follow repository conventions. The behavioral boundaries
are mandatory:

- Admin/Finance/Owner authorization is enforced before reads, mutations,
  evidence access, and exports.
- Every state-changing request is scoped, idempotent, locked transactionally,
  audited, and produces an outbox event when appropriate.
- This release authorizes the existing Admin role for realization commands;
  Finance confirmations are audited facts recorded by Admin, not a new login
  role.
- Owner, property, building, room, contract, transfer, and document scope fail
  closed.
- Protected destination and evidence data are masked or excluded outside
  authorized Finance/Admin views.

## 13. Migration and v1 transition

The v2 transition preserves all existing v1 data:

- Existing v1 records map without re-creating financial facts:

| v1 state | v2 financial state | v2 origin | v2 publication | v2 documentation |
| --- | --- | --- | --- | --- |
| Draft | Draft | Initiated in system | Unpublished | Pending |
| Awaiting review | Awaiting review | Initiated in system | Unpublished | Pending |
| Approved | Approved | Initiated in system | Unpublished | Pending |
| Submitted / awaiting transfer | Submitted to Finance or Awaiting transfer after an auditable acknowledgement | Initiated in system | Unpublished | Pending |
| Partially realized | Partially realized | Preserve recorded origin | Unpublished unless already published | Complete when every recorded transfer has proof; otherwise Exception recorded |
| Realized | Realized | Preserve recorded origin | Unpublished unless already published | Complete when every recorded transfer has proof; otherwise Exception recorded |
| Void | Void | Preserve recorded origin | Unpublished | Preserve historical documentation state |
| Published record | Preserve its existing financial state | Preserve recorded origin | Published | Preserve historical documentation state |

- Existing historical-import records map to an immutable external-transfer or
  legacy-manual provenance value, specifically Recorded after external transfer
  and Legacy manual/imported line where applicable.
- Existing evidence, legacy references, document records, allocation locks,
  receipt numbers, and audits remain attached to their original facts.
- Existing duplicate-allocation and duplicate-transfer-reference protection
  remains enforced during and after migration.
- No mass void, re-creation, recalculation, or silent renumbering is allowed.
- Old standalone historical endpoints may remain temporarily compatible for
  migration clients, but must delegate to the unified creation service and
  disappear from Admin navigation.

Migration rehearsal must run against a copy of local and production-shaped data
before rollout. The release requires a database backup, migration verification,
and a reconciliation report comparing v1 and v2 totals/record counts.

## 14. Implementation sequence

1. Update the unified domain specification and DEC-OWNER-016 wording.
2. Inventory v1 realization data, endpoints, state values, documents, locks,
   and migration dependencies.
3. Add provenance, documentation-completeness, final-document, and
   reconciliation persistence with safe migration/backfill rules.
4. Consolidate create/historical-import services behind the single
   Create Realization command while retaining API compatibility where required.
5. Implement transaction-safe eligibility, matching, calculation,
   duplicate-prevention, Finance submission, transfer, proof, and adjustment
   commands.
6. Replace the Admin **Input Historis** UI with the unified create wizard; use the
   Indonesian labels in section 0 for the primary action and the Active,
   History, and Not eligible workspaces.
7. Build detail, transfer, correction, review, publication, PDF, and Excel
   views from shared server queries.
8. Expose Owner-scoped published finalized documents only.
9. Test migration, authorization, calculation, documents, idempotency,
   concurrency, and production-like Finance reconciliation.
10. Reconcile the manually completed August and September 2026 records against
    real transfer evidence before production publication.

## 15. Acceptance criteria

The feature is ready only when:

- The UI has one **Buat Realisasi** action and no standalone **Input
  Historis** tab or per-Owner button.
- The wizard initially selects all eligible paid contracts for the Owner and
  period, while Admin can deselect a line before review submission.
- No dedicated Finance account role is required; every Finance hand-off and
  confirmation records its contact, channel, reference, time, and Admin actor.
- The same authorized Admin may complete every in-system review step because
  Finance communication remains outside the application; the audit trail
  preserves the separate Finance contact and confirmation facts.
- Draft creation is permitted with an incomplete Owner payout profile, but a
  not-yet-transferred realization cannot be submitted to Finance until Bank
  Name, Account Number, and Account Holder are snapshotted. Historical missing
  destination data uses only the controlled legacy exception path.
- Multiple batches may exist for an Owner and reporting month, while each
  lease remains eligible for and locked into at most one active batch.
- Cancellation is allowed only before a successful transfer, requires a
  reason, and never removes records or audit history.
- A Draft payout snapshot may be refreshed from a corrected Owner profile;
  after Finance submission it cannot change in place.
- A record for any month can use either disbursement condition without
  mislabelling the period as the business state.
- Only fully verified, fully paid normal rent contracts become linked
  realization candidates.
- One Owner with four paid and one outstanding contract produces a realization
  with only the four paid contracts.
- Security Deposit and Owner-sponsored occupancy never affect realization,
  Management Fee, Owner payout, or progress totals.
- The already-transferred path records actual transfer facts and becomes
  Realized only when the transfer sum fully reconciles.
- Direct external reconciliation locks the approved snapshot with an authorized
  reconciliation confirmation; it never fabricates a backdated Finance approval.
- The not-yet-transferred path supports Draft, review, Finance submission,
  Finance acknowledgement, awaiting transfer, partial transfer, and full
  realization.
- Multiple transfers reconcile safely; duplicate references, overpayment,
  unapproved differences, and retry duplicates are rejected.
- A failed transfer is auditable but does not affect paid totals, receipt
  eligibility, or the remaining amount to transfer.
- Missing legacy evidence becomes a visible documented exception, never a
  fabricated proof.
- A manual external line is linked only when matching is unique and safe;
  otherwise it remains visibly unlinked.
- Calculated snapshots, original records, transfers, evidence, and historical
  documents cannot be overwritten by later tariff, ownership, bank-account, or
  room changes.
- Final receipt generation occurs only after full reconciliation; partial and
  draft documents cannot be mistaken for final payout proof.
- Financial realization, final receipt issuance, and Owner Portal publication
  are separately auditable milestones.
- Owner Portal publication is always an explicit Admin command after final
  receipt issuance; it never happens automatically on financial realization.
- Pre-approval adjustments are limited to verified contract-rent, Management
  Fee, or rent-refund/cancellation corrections. Post-transfer recovery is an
  append-only linked follow-up, never an edit to an issued receipt.
- All listed Admin tables and authorized Owner documents export consistently to
  PDF and Excel.
- Owner Portal data is explicitly published, fully scoped, and cannot leak
  another Owner’s data or internal evidence.
- Archived Owner profiles are excluded from the active queue by default,
  available through an explicit archive filter for historical audit/recording,
  and blocked from new not-yet-transferred realizations.
- Existing v1 records, allocation locks, receipts, evidence, and audit history
  survive the migration unchanged.

## 16. Deliberately deferred work

The following remains outside this rework:

- room master-data entry for Plot No. / No. Kavling;
- a separate settlement model for Owner-sponsored occupancy management fees;
- automatic bank or payment-provider verification;
- tax withholding, legal accounting treatment, and tax-document automation;
- automatic WhatsApp/email payment notification providers;
- retroactive alteration of resident payments, lease snapshots, legacy Owner
  Settlement records, or already issued documents.

## 17. Revision addendum — Admin detail and receipt review (2026-09-29)

The following decisions are approved for the next implementation pass:

- The detail header uses an **Informasi aset** card. Missing building data is
  explained as an old record with no building relation; Admin does not guess it
  inside a financial record. Building and No. Kavling corrections use the room
  and asset data flow.
- Current transfer references remain required and unique. Only verified
  pre-rollout historical transfers may omit a reference with a documented
  exception.
- Finance confirmation uses a searchable/addable saved contact control. The
  transfer history shows the contact, confirmation channel, and confirmation
  time, or a clear old-record notice when those facts were never recorded.
- Owner-realization evidence is limited to three files of 5 MB each. The shared
  upload field continues to compress images and provide an Admin preview.
- The old-record notice **Bukti digital belum tersedia pada catatan lama** is
  shown only while evidence is missing and disappears after evidence is added.
- The realization period in every report and receipt is taken from the same
  realization header. Transfer date is displayed separately. The known
  `RLS-HIS-202608-CB50C244` / `TRF-OWNER-0001` July-versus-August mismatch is
  treated as a document defect.
- A corrected receipt keeps its original transfer/receipt number, preserves the
  previous file, and records a newer document version with the reason
  **Perbaikan periode realisasi**. Downloads return the newest version.
- New receipts use the Owner bank information recorded at transfer time. Old
  receipts without that information show a clear historical-data notice until
  an evidenced Admin reconciliation is completed.
- Receipt signatures receive additional vertical space. Contract and tariff
  tables show **No. Kavling: —** until room master data provides a value, and
  the **Tidak Layak → Total Kontrak** column is always formatted as Rupiah.
