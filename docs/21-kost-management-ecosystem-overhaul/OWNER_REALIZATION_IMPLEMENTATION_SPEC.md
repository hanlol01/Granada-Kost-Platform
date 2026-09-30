# Owner Realization v2 — Implementation Specification

> **Status:** Planning specification. Approved business decisions are recorded
> here; this file does not authorize implementation, database migrations, data
> entry, or publication to the Property Owner Portal.
>
> **Authoritative policy:**
> [OWNER_REALIZATION_REWORK_PLAN.md](OWNER_REALIZATION_REWORK_PLAN.md) and
> [OWNER_POLICY_DECISIONS_AND_GLOSSARY.md](OWNER_POLICY_DECISIONS_AND_GLOSSARY.md).
> Where this specification is less detailed, those documents win.

## Problem Statement

The legacy Owner Settlement / Setoran Owner workflow presents two separate
entry paths—prepare a realization and historical input—while real operations
need one auditable way to record both past transfers and future transfers.
Admin needs to release the Property Owner share only for fully verified and
fully paid normal-rent contracts, communicate manually with Finance outside the
application, record the result safely, and give the Owner only the finalized,
explicitly published records and documents.

The replacement must preserve existing realization records, transfers,
documents, allocation locks, and audit history. It must never calculate an
Owner payout from Security Deposit, Owner-sponsored occupancy, an outstanding
contract, or a lease that has already been included in another active
realization. Every calculation and final document must remain stable despite
later changes to room tariffs, fees, ownership, resident data, or payout
details.

## Solution

Replace the Admin-facing split workflow with a single Indonesian **Buat
Realisasi** wizard. The wizard asks whether money has already been transferred
to the Property Owner or still requires an external Finance transfer. The two
conditions share one Owner Realization aggregate, immutable financial snapshot,
line eligibility rules, transfer ledger, document model, publication rule, and
audit trail.

For the normal future path, Admin creates a Draft, reviews it, approves it,
records the external Finance hand-off and confirmation, then records one or
more successful bank transfers. For completed historical work, Admin records
the factual historical transfer and reconciles it to the same immutable
snapshot without fabricating a backdated workflow. A final receipt is issued
only after the total successful transfer equals the approved Owner amount.
Admin then explicitly chooses whether to publish the final receipt and detailed
statement to the Property Owner Portal.

## User Stories

1. As an Admin, I want one **Buat Realisasi** action for any reporting month,
   so that historical and future work do not require different mental models.
2. As an Admin, I want to choose whether funds have already been transferred or
   still need to be transferred, so that the workflow records real-world facts
   honestly.
3. As an Admin, I want the selected month to be a commercial reporting period,
   so that it remains distinct from payment-completion, actual-transfer, and
   system-recording dates.
4. As an Admin, I want all server-eligible fully paid contracts selected by
   default for an Owner and period, so that complete Owner releases are quick to
   prepare.
5. As an Admin, I want to deselect an otherwise eligible contract before review,
   so that it can be released in a later batch without losing an audit trail.
6. As an Admin, I want multiple realization batches for one Owner and month,
   so that a contract paid later can be released separately.
7. As an Admin, I want one lease prevented from entering a second active batch,
   so that the Owner cannot be paid twice for the same contract.
8. As an Admin, I want outstanding, unverified, Owner-sponsored, and
   Security-Deposit-only records excluded with clear reasons, so that payout
   totals are correct.
9. As an Admin, I want historical manual rows captured as safely linked or
   visibly unlinked evidence, so that ambiguous legacy data cannot corrupt live
   contract allocation.
10. As an Admin, I want the calculation to use the full contract’s immutable
    rent and Management Fee snapshots, so that a later tariff or fee edit cannot
    change a realization already created.
11. As an Admin, I want to see the Owner, asset scope, room, resident, price
    source, dates, totals, and optional Plot Number in the realization detail,
    so that I can review the release without manual spreadsheets.
12. As an Admin, I want the Owner’s payout Bank Name, Account Number, and
    Account Holder snapshotted before Finance submission, so that an external
    transfer is sent to the reviewed destination.
13. As an Admin, I want to refresh the payout snapshot only during Draft after a
    profile correction, so that later workflow stages remain immutable.
14. As an Admin, I want the system to prevent Finance submission without a
    complete payout destination, so that new transfers cannot be prepared with
    unsafe payment details.
15. As an Admin, I want to record the named external Finance contact, channel,
    reference, time, and my own identity, so that no separate Finance account is
    required while the hand-off remains auditable.
16. As an Admin, I want to record a successful bank transfer with date,
    reference, masked destination, and proof, so that the financial state is
    based on actual transfer facts.
17. As an Admin, I want to record a failed bank attempt without increasing the
    paid total, so that retrying a transfer is clear and safe.
18. As an Admin, I want partial transfers supported, so that the remaining Owner
    amount stays visible until it is fully reconciled.
19. As an Admin, I want one final receipt only when the approved net amount is
    fully transferred, so that partial payout proof is never mistaken for a
    final receipt.
20. As an Admin, I want a legacy missing-proof exception to be visible and
    evidenced by reason/source, so that old factual data may be recorded without
    claiming nonexistent proof.
21. As an Admin, I want to add only typed and evidenced pre-approval
    adjustments, so that no unrestricted number can silently alter Owner rights.
22. As an Admin, I want post-transfer refunds, reversals, and recoveries to be
    linked follow-up records, so that original transfers and receipts remain
    immutable.
23. As an Admin, I want to cancel a realization only before its first successful
    transfer, so that cancellation cannot erase paid financial history.
24. As an Admin, I want archived Owners hidden from the active queue but
    available through an explicit filter for history and factual legacy entry,
    so that routine operations do not select inactive profiles accidentally.
25. As an Admin, I want every queue, detail table, history, and permitted
    document exportable to PDF and Excel, so that finance operations can retain
    portable records.
26. As a Property Owner, I want to see only my explicitly published, fully
    realized final receipt and detailed statement, so that I can self-serve
    trustworthy results without seeing Admin evidence or other Owners’ data.
27. As a Property Owner, I want recipient account numbers masked in documents
    and the portal, so that bank information is not unnecessarily exposed.
28. As an auditor, I want every command, snapshot, evidence state, transfer,
    publication, and exception to be append-only and attributable, so that the
    full realization history can be reconstructed.

## Implementation Decisions

- **Canonical language:** Product UI, documents, exports, notifications, and
  accessibility labels use Indonesian. English is limited to internal code,
  persistence values, and engineering documentation.
- **Unified creation workflow:** The only primary entry action is **Buat
  Realisasi**. There is no standalone **Input Historis** tab, route, or
  per-Owner action. Historical entry is immutable provenance metadata on the
  same realization model.
- **Eligibility boundary:** A realization line is only normal `rent` for a
  fully verified, fully paid contract with no active realization allocation.
  Security Deposit, Owner-sponsored occupancy, unresolved rent, and ambiguous
  legacy data are excluded from calculated payout totals.
- **Financial formula:** Net Owner realization equals immutable full contract
  rent minus immutable full-contract Management Fee plus approved signed typed
  adjustments. It is not driven by live progress projections.
- **Period and batching:** Reporting periods have no automatic close from
  August 2026 onward. Multiple Owner-and-period batches are permitted, but each
  lease can be allocated once only.
- **State model:** Financial state, publication state, documentation
  completeness, and entry origin remain separate values. The future path is
  Draft → Awaiting review → Approved → Submitted to Finance → Awaiting transfer
  → Partially realized → Realized. Publication is an explicit subsequent action.
- **External Finance boundary:** No Finance login role is introduced. The
  existing authorized Admin performs all in-system commands and records named
  Finance contact/channel/reference/time facts from communication outside the
  application.
- **Transfer policy:** Bank transfer is the only supported disbursement method.
  Current transfer references are required and unique in the appropriate scope;
  a legacy transfer may omit its reference only with a documented exception.
  Amounts are positive whole Rupiah, successful totals cannot exceed the
  approved net value, and failed attempts do not affect paid totals.
- **Payout destination:** A Draft may exist without full payout details. A
  not-yet-transferred record cannot be sent to Finance until Bank Name, Account
  Number, and Account Holder are snapshotted. Historical unavailable destination
  data requires the documented legacy exception.
- **Documents:** Draft/review reports are visibly non-final. Per-transfer
  confirmations are internal. One immutable final **Kuitansi Realisasi Hak
  Owner** is issued only after complete reconciliation and uses
  `KWT-RLS/{property-code}/{roman-month}/{year}/{sequence}`. The final detailed
  statement accompanies it. Account information is limited to bank, account
  holder, and final four digits outside authorized Admin views.
- **Publication:** Final receipt issuance, financial realization, and Owner
  Portal publication are three separate milestones. The Owner Portal receives
  only explicitly published, fully realized final documents.
- **Adjustments and recovery:** Before approval, only verified contract-rent,
  Management Fee, or rent-refund/cancellation corrections are available, with
  a signed value, reason, and evidence. Post-transfer recovery chooses recover
  from Owner, net from a future realization, or outside-system handling. It
  never alters an issued document.
- **Cancellation and profile lifecycle:** Cancellation requires an Admin reason
  and is possible only with zero successful transfer. Archived Owners are hidden
  from the active queue by default, are visible through an archive filter for
  factual legacy work, and cannot receive a new pending transfer.
- **Migration:** Existing realization facts, allocations, receipt numbers,
  files, documents, audits, and statuses remain preserved or mapped; no mass
  voiding, re-creation, recalculation, or renumbering is permitted.

## Reports Redesign Brief

This redesign changes presentation and interaction hierarchy only. It does not
remove reporting routes, query-parameter contracts, filters, exports,
authorizations, financial calculations, lifecycle commands, or audit evidence.
The existing Admin visual system remains authoritative; this work must not
introduce a separate "Owner Realization" theme or a marketing-style hero.

### Product Direction

- **Audience and density:** This is an Admin operational workbench. Desktop is
  the primary experience; tablet and mobile remain fully usable. Scanability,
  consistent control placement, and honest financial states take precedence
  over decoration.
- **Language:** All visible product text, documents, exports, accessible names,
  validation feedback, and empty/error states remain Indonesian. English names
  may only exist in code, persistence values, engineering documentation, or
  other non-product surfaces.
- **Routes and capabilities:** `/reports` continues to redirect to the lease
  report. The existing report destinations—lease, payment, expense, finance,
  and Owner Realization—remain reachable at their current routes. Existing
  filters, tabs, query parameters, exports, commands, and permissions remain
  available even when their visual grouping changes.

### Shared Reports Workspace

- Replace repeated large navigation cards with a compact, keyboard-accessible
  report navigation bar that exposes the same five destinations and clearly
  marks the current report.
- Use a compact report header: breadcrumb where applicable, title, short
  operational context, selected reporting period where relevant, and exports
  aligned to the right. Do not use a promotional full-height hero.
- Keep core filters visible: reporting period or date range, search, and the
  primary business status. Place secondary filters in an explicitly labelled
  expandable section and show removable active-filter chips. Retain explicit
  **Tampilkan data** and **Reset filter** actions and their current URL state.
- Use the shared Indonesian date components: a localized date-range control for
  date-specific reports and a localized month-year picker for commercial
  reporting periods. Do not introduce one-off browser date inputs or a second
  date-picker dependency.
- Use shared accessible Select controls rather than visually inconsistent raw
  selects. Every field keeps a visible label, keyboard operation, focus state,
  validation message, and clear selected value.
- Present metrics as a prioritized summary strip rather than equally prominent
  decorative cards. All existing values remain available; the most actionable
  one or two metrics receive the strongest visual weight for each report type.
- Standardize export actions in the report header and result header:
  **Unduh PDF** uses the established solid PDF red treatment and **Unduh Excel**
  uses the established solid Excel green treatment. Buttons expose pending,
  disabled, and failure states without changing export content or scope.
- Preserve table data and CSV/PDF/Excel fidelity. Dense tables may scroll only
  inside their own bounded wrapper. On tablet and mobile, non-essential detail
  moves to labelled expandable rows or record cards; the page itself must not
  acquire horizontal overflow.

### Owner Realization Workspace

- The visible primary entry action is **Buat Realisasi**. It opens one
  Indonesian wizard that first selects the reporting month, Owner, eligible
  fully paid contracts, and whether the factual transfer is already complete
  or still awaits external Finance transfer. This is a presentation of the
  unified model, not a second historical data model.
- Do not retain a standalone **Input historis** workspace/tab/row action in the
  redesigned UI. Historical entry remains available inside **Buat Realisasi**
  and retains its immutable provenance, evidence requirements, restrictions,
  and audit history.
- Organize the realization queue around clear operational views—active work,
  realization history, and records not eligible for realization—without
  removing the archived-Owner filter or any existing status filter. The active
  queue defaults to active Owner profiles; archived profiles appear only when
  explicitly requested for factual historical review.
- Each queue row uses stable columns or labelled blocks for Owner and asset
  scope, lifecycle stage, approved Owner amount, transfer reconciliation, and
  contextual next action. Transfer percent, amount paid, remaining amount, and
  the progress indicator occupy their own block beneath **Realisasi transfer**;
  they must never collide with row actions.
- Progress follows the existing semantic state palette and is never conveyed by
  color alone: red for critical/low completion, amber for partial attention,
  blue for in-progress, and green only at exactly 100% fully reconciled.
  A visible percentage, transferred amount, approved total, and status label
  accompany every progress indicator.
- The realization detail retains every review field, payout destination
  snapshot, transfer history, adjustment history, exclusion reason, evidence
  state, and export. On desktop, group wide contract columns into readable
  operational clusters; on smaller screens, expose the same data through
  labelled detail panels or disclosures rather than a page-wide 16-column
  table. Excel remains the full tabular source.
- Detail navigation starts with breadcrumbs, followed by a compact,
  content-sized **Kembali ke Realisasi Owner** action. Keep content close to
  the top and visibly separate the PDF and Excel actions.
- Reuse the shared evidence-upload component from the new-lease **Bukti
  transfer** field for every Owner-realization step that requires proof.
  This includes successful transfers, applicable pre-approval corrections,
  failed attempts when evidence is supplied, and completed recovery
  installments. Saved files must be previewable by Admin from the associated
  transfer/correction/recovery entry and remain unavailable to the Owner Portal.
- Owner-realization evidence uses a dedicated private file purpose. Accept
  JPG/JPEG, PNG, WebP, and PDF, up to three files per event and 5 MB per file;
  compress images. Missing-proof exceptions apply only to verified pre-rollout
  historical transfers and require reason, source, and reference. Failed
  transfer proof remains optional.
  The default pre-rollout cutoff is **29 September 2026, 00.00 WIB**;
  deployments with a different rollout time set
  `OWNER_REALIZATION_EVIDENCE_ROLLOUT_AT` before allowing historical exceptions.
  Every uploaded file is linked to one transfer, correction, or recovery event;
  linked files and recovery installments are append-only.
- The post-transfer correction form labels its amount **Nominal pengembalian dana
  berlebih**, formats it as Rupiah, offers three explicit settlement paths, and supports append-only
  partial recovery installments. Completion records the actual date/amount
  and requires evidence or a traceable financial reference.
- The transfer form formats **Nominal transfer** as Rupiah, shows the approved
  amount, prior successful transfers, and remaining balance, and prevents an
  amount above the remaining balance. It captures actual date/time, unique
  bank reference, Finance confirmation person/channel/time, and the masked
  payout snapshot. **Metode** is a bordered **Transfer Bank** field while that
  is the only supported disbursement method.

### Interaction, States, and Accessibility

- Buttons and tabs have a single unambiguous active state. Status labels and
  progress always include text, not color alone.
- Loading, empty, error, blocked, and permission states use the existing Admin
  patterns and provide a recovery action when retrying is safe.
- Preserve visible keyboard focus, semantic buttons and inputs, sensible focus
  order, contrast compliant with the Admin design system, and at least 44 px
  touch targets where a control can be used on touch devices.
- Respect reduced-motion preferences. Any transition is brief and functional;
  no decorative or choreographed animation is required for this operational
  surface.
- Search and filter changes must not trigger unnecessary requests while a user
  is typing. Keep server-authoritative filtering, calculations, authorization,
  and export scope unchanged.

### Redesign Acceptance Criteria

1. Every `/reports` route, business action, export, filter, and URL contract
   available before the redesign remains usable after it.
2. A user can start either a historical or future realization through the one
   visible **Buat Realisasi** entry point, with Indonesian language throughout.
3. No realization progress label, amount, or status overlaps queue-row actions
   at supported desktop, tablet, or mobile widths.
4. Date/month controls, Select controls, export actions, summary states, empty
   states, and error states are visually and behaviorally consistent throughout
   the reports workspace.
5. The Owner Realization detail preserves complete review data without forcing
   page-level horizontal scrolling, while exports retain full fidelity.

## Testing Decisions

The primary behavioral seam is the Admin Owner Realization API contract backed
by its authoritative realization service. It is the highest stable seam because
the Admin workspace, exports, documents, and Portal projection consume the same
authoritative aggregate rather than independently recalculating money.

- Extend the existing Owner Realization contract test suite to assert eligibility,
  snapshotting, lifecycle transitions, unique lease allocation, typed
  adjustments, cancellation limits, failed transfers, transfer reconciliation,
  historical provenance, publication scope, and migration preservation.
- Add service/integration tests that use transaction-safe persistence to prove
  concurrent duplicate allocation and duplicate transfer reference rejection.
- Add API tests for authorization, property scope, archived Owner filters,
  account masking, evidence exception behavior, idempotency, and Owner Portal
  isolation.
- Add Admin UI integration tests for the unified wizard, Indonesian copy,
  default selection and deselection, clear state/proof warnings, explicit
  publication, and disabled blocked commands.
- Add document and export tests for totals, full filtered result export,
  checksum/snapshot consistency, PDF landscape safe wrapping/page breaks,
  typed Excel currency/date cells, and formula-injection-safe text.
- Use the current Owner Realization service/API contract and existing Admin
  realization detail and queue flows as test prior art; tests assert external
  behavior and audit outcomes rather than private implementation details.

## Out of Scope

- Owner-sponsored occupancy Management Fee settlement;
- room master-data editing for Plot Number / No. Kavling;
- automatic bank/payment-provider verification;
- cash, e-wallet, cheque, or other payout methods;
- tax withholding, legal accounting treatment, and tax document automation;
- automatic WhatsApp/email payment providers;
- retroactive edits to resident payments, contract snapshots, historical
  settlement facts, or already issued documents;
- a Finance login role or a separate Finance application;
- changing resident billing, Security Deposit, or checkout rules.

## Further Notes

- The Admin-only detailed history table includes the Property Owner name and a
  Plot Number column. Plot Number renders `—` until room master data provides a
  value and must not be backfilled speculatively.
- An unlinked legacy line is preserved as external evidence but cannot lock a
  live lease, become an eligible candidate, or bypass duplicate prevention.
- Legacy missing transfer proof can only be excused for transfers predating the
  configured realization rollout timestamp. It requires reason/source/reference
  and blocks Owner Portal publication by default.
- Migration rehearsal requires local and production-shaped data copies, a
  backup, reconciliation of record counts/totals, and explicit verification
  that existing v1 documents and audit evidence remain readable.

## Revision record — Q1–Q12 (2026-09-29)

This addendum records the decisions agreed during the Admin review of the
Rincian Realisasi Owner page. It is part of the implementation target and must
be reflected in the API, Admin copy, exports, and documents.

### Detail page and asset information

1. **Bangunan belum tersedia pada data lama** is an informational state. It
   means the historical realization line does not contain a building relation;
   it does not mean that Admin must guess or type a building in the financial
   detail page.
2. Put the asset information in a bordered **Informasi aset** card. Show the
   building and No. Kavling when available. When absent, show the explanatory
   message above and keep the financial record unchanged.
3. Any correction of building or No. Kavling belongs to the authoritative room
   and asset data flow. A published or issued realization document is not
   edited in place because current master data changed.

### Transfer form and Finance confirmation

4. **Referensi transfer unik** is required for a current transfer and must be
   unique in the property transfer ledger. It is optional only for a verified
   pre-rollout historical transfer that genuinely has no reference; the Admin
   must then provide the historical reason, source, and traceable reference.
5. **Nama pemberi konfirmasi Keuangan** uses a searchable, addable combobox
   consistent with the existing optional-university control. Saved contact names
   are reusable for the property, while each transfer still records the
   confirmation channel and time. This is a contact fact, not a Finance login.
6. A successful current transfer must show the confirmation name, channel, and
   time in **Riwayat transfer dan kuitansi**. For an old record without those
   fields, show **Catatan konfirmasi belum tersedia pada transaksi lama** rather
   than a dash or an invented name.

### Evidence and historical exceptions

7. Owner-realization evidence accepts JPG/JPEG, PNG, WebP, and PDF, with at most
   three files and a **5 MB limit per file**. The shared upload control still
   compresses images before storage.
8. **Bukti digital belum tersedia pada catatan lama** remains a non-blocking
   historical notice. It is shown only when an old transfer has no attached
   evidence and disappears when evidence is attached. It must not be shown for a
   current transfer because current successful transfers require proof.

### Period, receipt, and account consistency

9. Every report PDF, receipt PDF, and Excel export uses the same
   `realization_period` from the realization header. The receipt must display
   both **Periode realisasi** and the separate actual **Tanggal transfer**.
   Contract dates or transfer dates must never replace the realization period.
10. For `RLS-HIS-202608-CB50C244`, the receipt for `TRF-OWNER-0001` must show
    **Agustus 2026 · 1–31 Agustus 2026**. A July value for that same realization
    is a document-data defect and must be corrected.
11. Existing issued documents remain auditable. A corrected document keeps the
    original transfer and receipt number, retains the prior file as a previous
    version, and records a new document version with reason **Perbaikan periode
    realisasi**. The download action returns the latest corrected version.
12. New receipts must read the bank name, masked account number, and account
    holder from the receiving Owner data captured when the transfer is recorded.
    An old receipt that lacks this information must show **Belum tercatat pada
    transaksi lama** until an Admin reconciliation supplies evidence; the system
    must not silently substitute a later account.

### Document layout and room data

13. Add a little more vertical space between each signature line and the printed
    signer name. Keep **Pengelola KOSTATION** and **Penerima / Owner** centered.
14. In every contract and tariff table, show the room identifier and a second
    line **No. Kavling: —** when no plot value exists. A populated room master
    value must flow automatically into new exports and receipts.
15. The **Total Kontrak** column in **Tidak Layak** always uses Indonesian Rupiah
    formatting. All monetary cells in the PDF and Excel templates follow the
    same currency rule.
