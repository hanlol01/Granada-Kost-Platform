# Handoff 09: Lease period begins at physical check-in

Status: `IMPLEMENTED LOCALLY — PRODUCTION DEPLOYMENT AND INTERACTIVE ACCEPTANCE PENDING`
Decision date: 2 October 2026

## Purpose and boundary

A resident may pay a Booking Fee, down payment, installment, or the full rent before moving in. Payment, administrative activation, and physical check-in are different events. **Neither payment nor activation alone starts the lease service period.** The effective lease period starts on the verified date of physical check-in, and its end follows the agreed duration. The original payment dates and amounts remain unchanged.

The user authorized implementation after approving this plan. The implementation evidence and local migration boundary are recorded below. This handoff does not authorize production migration, historical bulk date updates, deployment, or automatic edits to the example resident. [Handoff 08](08_LEASE_CORRECTION_CANCELLATION_ARCHIVE_PURGE_PLAN.md) remains a separate, parked plan for comprehensive correction and archive workflows. Read the [context glossary](../CONTEXT.md), [commercial handoff](01_CUSTOM_LEASE_AGREEMENT_HANDOFF.md), [correction handoff](03_LEASE_DATA_CORRECTION_HANDOFF.md), and [ADR 0003](../../adr/0003-lease-data-correction-as-versioned-amendment.md) before further changes.

## Approved product decisions

1. **Planned date is not effective service.** Onboarding may retain a planned arrival date for room scheduling and Admin operations. Until physical check-in is confirmed, the lease has no effective service start or final service end to present as an active rental period.
2. **Physical check-in is authoritative.** Use the actual date the resident received the room, recorded in the property’s `Asia/Jakarta` calendar. The timestamp when Admin presses the button is an audit timestamp, not necessarily the service date. A retrospectively recorded physical date requires a reason and conflict checks.
3. **Activation-only does not start the period.** The existing “activate without check-in” path leaves the period pending. It must not silently earn rent, create Owner entitlement, or start the checkout lateness clock.
4. **Duration and commercial agreement stay fixed.** Check-in shifts the start and derived end while retaining the committed duration, agreed monthly tariff, contract value, verified rent credits, and security deposit distinction. This is not a new negotiation or a duplicate charge.
5. **Pre-check-in payment is allowed.** Booking Fee, DP, installments, and even full rent may be recorded on their true transaction dates. They remain advance rent credits against the unchanged contract obligation. A payment received on 5 September must never be relabeled as received on 1 October.
6. **No false final date range before check-in.** Resident detail, Admin-facing financial presentation, Penghuni and Owner access, invoices, receipts, PDFs, and exports show the agreed duration and a pending-check-in state, not a “start–end” range presented as effective. Admin may separately see a clearly labeled **planned check-in** date. A pre-check-in financial document may be issued, but it must not assert a final service period.
7. **Check-in finalizes the period.** The server derives the effective end and superseding billing/checkpoint/document authority from the actual physical date. The room/occupancy and period transition must succeed atomically; failure must leave the check-in uncommitted rather than partially updated.
8. **Earlier check-in requires explicit review.** If the resident physically entered before the planned date, Admin confirms the early date and the system rechecks room availability, conflicting occupancy, billing impact, and document state before commit. Do not silently backdate the period.
9. **Issued history remains auditable.** Old invoice/receipt versions and verified payments are not overwritten or deleted. The current downloadable document displays the effective period after check-in through an explicit superseding version or amendment; historical versions retain their original issuance facts and a clear superseded label when applicable. Payment date and transaction reference remain original.
10. **Owner realization requires physical check-in.** A fully paid but not-yet-checked-in lease must not enter “ready for realization.” Prepaid cash is distinct from earned service, Owner entitlement, and payout. Published Owner realizations are not silently rewritten; a linked correction/recovery process is required if a historical period change affects them.
11. **No automatic historical rewrite.** Apply the new behavior to future check-in commands. For leases already checked in, provide a separately reviewed, versioned adjustment that previews billing, document, checkout, and Owner impacts; do not run an unreviewed bulk backfill. The reported `cik cobi` record is an investigation example, not permission to mutate that resident automatically.

## Worked example

| Fact | Expected result |
| --- | --- |
| Booking Fee recorded 5 September 2026 | Transaction date and amount remain 5 September; the payment is advance rent credit. |
| A 12-month lease exists but the resident is not checked in | Show “12 months” and “Masa sewa belum dimulai—menunggu check-in”; show no effective start–end range. |
| Admin activates the lease without physical check-in | Keep the service period pending; show activation as a separate operational fact. |
| Physical check-in actually occurs 1 October 2026 | Effective service coverage is 1 October 2026 through 30 September 2027. The exclusive lease end is 1 October 2027 if the existing date model uses an exclusive end. |
| Admin records that event on 2 October 2026 | Service still starts on 1 October, with the later recording time and required reason retained in the audit trail. |
| Invoice or receipt is downloaded after check-in | Current version shows the effective period; payment received on 5 September still says 5 September. Earlier issued versions remain readable as history. |

The example is a policy illustration; the actual resident’s stored dates, duration, payment allocations, document issuance, and Owner state must be inspected read-only before any individual correction.

## Authority and lifecycle model

Keep these facts distinct in the API, database, read models, and UI:

| Fact | Meaning | Before check-in |
| --- | --- | --- |
| Planned arrival/check-in date | Operational estimate and room-hold planning input | May exist; label as planned, never as effective service. |
| Administrative activation time | When the lease was enabled for the next operational step | May exist; does not start service. |
| Actual physical check-in date/time | When access/room possession began, with actor and recording time | Absent until a confirmed event exists. |
| Effective service start | Jakarta calendar date of actual physical check-in | Absent/pending. |
| Effective service end | Derived from effective start and committed term | Absent/pending. |
| Payment received/verified time | Historical financial event | Retained exactly as recorded. |
| Contract value and tariff snapshot | Agreed commercial obligation | Already fixed; not changed by shifting dates alone. |

The checkout target and any late-checkout grace calculation must use the effective end once check-in exists. Physical checkout remains a separate event. Preserve the existing month-addition and inclusive/exclusive date conventions; verify month-end and leap-year behavior instead of introducing another frontend date formula. Never use an Admin action timestamp or the current date as an implicit fallback for a missing physical check-in.

## Billing, document, and Owner synchronization

Current onboarding creates lease dates and an invoice/checkpoint schedule from the planned start before check-in. Current activation/check-in records lifecycle and occupancy without rebasing those financial dates. Implementation therefore needs a server-owned reconciliation, not a label-only formatter or a direct update of `leases.start_date`.

- Treat any pre-check-in schedule as provisional for service dates. Preserve its financial obligations, booking credit, allocations, and audit records. Do not show provisional coverage as a final occupied period in an invoice or receipt.
- At check-in, calculate effective start/end and create the new authoritative schedule/checkpoint/document version. Reconcile already verified payments against the same contract obligation without duplicate allocations, rent invoices, charges, or receipt numbers. Previously issued document versions remain linked and marked superseded where their period is no longer authoritative.
- Before saving, detect conflicts with existing invoice status, settlement policy version, credit allocation, finalized checkout, Owner realization, room occupancy, and issued contract-paid proof. If a safe reconciliation cannot be completed, return a specific actionable rejection; do not partially commit check-in.
- After successful check-in, every current consumer uses the same effective period: resident detail, billing list/detail, invoice, receipt, contract-paid proof, Admin/Penghuni/Owner read models, PDF/XLSX exports, reminders, checkout, earned-rent calculations, and Owner realization eligibility.
- Keep the original receipt payment date even when its current document presentation is superseded. Do not reissue money, fabricate a new payment, or convert the security deposit into rent.
- A delayed check-in must not itself alter the agreed tariff or duration. Existing effective-dated price and management-fee policies require explicit review of which date selects a policy; do not silently reprice a committed contract. Preserve the immutable commercial snapshot and use the effective occupancy period for earning and fee attribution.
- A full prepayment before check-in is still not earned rent or a ready Owner realization. A published realization is a separate historical authority and requires an explicit correction path if affected.

## Admin and document presentation

- Before check-in, use operational Indonesian such as **“Masa sewa belum dimulai—menunggu check-in”**, **“Durasi sewa: 12 bulan”**, and, only where useful to Admin, **“Rencana check-in: 1 Oktober 2026.”** Avoid an unlabeled planned period in a field named **Periode sewa**.
- In the activation/check-in review, show planned date, entered physical date, resulting effective end, unchanged contract value, existing advance payments, affected billing/document versions, and any Owner consequence. Require an explicit reason when recording a different or retrospectively entered date.
- For an activation-only path, show that the period will be determined at later physical check-in. For a combined activation and check-in path, run the same authoritative check-in reconciliation once.
- Keep the payment date visible on pre-check-in receipts. Replace the final period range with duration and pending status. After check-in, current invoice/receipt versions show the actual effective period while historical versions retain clear provenance.
- Use clear Indonesian success and rejection messages. For example, explain a room conflict, a document that cannot safely be superseded, or a billing reconciliation failure with the next step; do not return only “Internal server error.”

## Implementation sequence and gates

Implement one vertical slice at a time. Before coding, re-read current source, the migration ledger, and relevant domain documents; confirm the actual schema and all document generators. The paths below are investigation entry points, not a claim of exhaustive coverage.

1. **Inventory and RED tests.** Trace onboarding, paid booking, invoice creation, allocation, receipt/PDF generation, activation-only, combined activation/check-in, separate check-in, checkout, Owner realization, and all read models. Write failing tests for pre-check-in presentation and the check-in rebasing outcome.
2. **Domain authority.** Model planned versus effective dates without overloading one field ambiguously. Define lifecycle transitions, server date calculation, retrospective/early-check-in validation, idempotency, audit facts, and an additive migration if required. Preserve legacy reads and existing immutable document authority.
3. **Atomic check-in reconciliation.** Within the authoritative command, validate and persist physical check-in, occupancy, effective lease dates, new schedule/checkpoint authority, and document validity together. Recheck concurrency and room conflicts at commit; a retried command must not duplicate invoices or events.
4. **Financial/document consumers.** Update invoice, receipt, paid-contract proof, payment views, reports/exports, reminders, and Owner eligibility to distinguish prepayment from service coverage. Verify old document versions and new current downloads from the same transaction facts.
5. **Admin, Penghuni, and Owner UI.** Show duration/pending state before check-in, planned date only with its label, effective period after check-in, and an impact preview when Admin confirms check-in.
6. **Historical adjustment path.** Provide read-only impact discovery first. Add reviewed, versioned correction only after its conflicts with checkout, issued documents, and published Owner realization are defined. Do not mix this with a production bulk backfill or the separate Handoff 08 archive feature.

No stage may claim completion from a UI-only change. Do not run production migrations, update the example resident, push, or deploy without a separate instruction and release preflight.

## Required verification matrix

- Payment first, check-in later: Booking Fee on 5 September and physical check-in on 1 October; original payment date/amount preserved, duration unchanged, no pre-check-in final period, effective period correctly rebased.
- Activation-only followed by later check-in; no period, earned rent, or Owner-ready status between the two events.
- Combined activation and check-in; retry/idempotency; failed billing reconciliation leaves neither a false check-in nor partial invoice/version changes.
- Full prepayment before check-in; no duplicate charge/allocation, paid balance preserved, Owner realization excluded until physical check-in.
- Planned date equals, precedes, or follows actual check-in; retrospective entry has a required reason and recorded-at provenance; early entry validates room and occupancy conflicts.
- Terms of 1, 2, 3, 11, and 12 months, plus month-end/leap-year starts; inclusive service coverage and exclusive stored end remain consistent across documents and checkout.
- Invoice/receipt generated before and after check-in; current version displays actual dates, historical version remains readable/superseded, transaction date never changes.
- Checkout, late-grace, reminders, policy checkpoints, earning, management fee, Owner view, and PDF/XLSX outputs use the same effective period.
- Existing checked-in, checked-out, archived, and published-Owner records remain unchanged until an individually reviewed adjustment is authorized.
- Expected failures return stable business codes and actionable Indonesian UI messages; no accidental generic 500 or partial success.

## Source entry points for the implementing agent

- `backend/api/src/modules/resident/onboarding.service.ts`: committed planned lease start/end.
- `backend/api/src/modules/lease/lease-activation.service.ts` and `lease-check-in.service.ts`: activation/check-in transitions and current date guards.
- `backend/api/src/modules/billing/services/contract-schedule-issuance.service.ts` and `helpers/contract-schedule.helper.ts`: invoice coverage and checkpoint date derivation.
- `backend/api/src/modules/billing/services/w06-billing.service.ts`: invoice, receipt, and PDF period presentation.
- `backend/api/src/modules/lease/lease-data-correction.service.ts`: existing versioned correction behavior; do not assume it already rebases issued invoice coverage.
- `backend/api/src/modules/lease/lease-checkout.service.ts`: service-end and lateness downstream effects.
- `backend/api/src/modules/property-owner-management/property-owner-realization.service.ts`: fully paid Owner candidate selection and published realization boundaries.
- `apps/admin/src/components/residents/ResidentDetailWorkspace.tsx`: combined activation/check-in and activation-only presentation.

The KOSTATION knowledge-graph project was not available during planning. Source findings are task-directed and must be reconfirmed against the current generation and full affected consumer set before implementation. This document intentionally leaves physical schema design and migration numbering to that verified implementation discovery.

## Implemented authority and integration

- Migration `114_check_in_anchored_lease_period.sql` adds `planned_start_date`, `service_period_state`, append-only `lease_service_period_versions`, date-only installment overrides, and the `lease_installment_effective_periods` read view. Original installment identities, amounts, payment allocations, invoice facts, and receipts are retained. Existing unoccupied, non-renewal leases awaiting activation or physical check-in receive pending metadata only; historical lease dates are not shifted by the migration. Existing occupied legacy leases retain their historical authority.
- `LeaseServicePeriodService` owns the Jakarta physical date, calendar-month end, conflict checks, schedule reconciliation, version append, and settlement-policy rebase. The caller's check-in transaction also creates occupancy and marks the room occupied. A failed occupancy write rolls back the period, installment overrides, settlement policy, and idempotency claim together.
- Both combined activation/check-in and separate physical check-in use this authority. Activation-only preserves the pending period. Existing payment verification and minimum activation-credit gates remain in force; this feature does not relax them.
- Admin receives `POST /leases/:leaseId/check-in/preview` and `GET /leases/:leaseId/service-period/history` through the existing activation controller, with property scope and existing permissions. The UI shows the resulting period, unchanged contract value, advance payments, affected document count, and the required explanation for a different or retrospective date.
- Date-only historical corrections use the existing reviewed correction preview/commit flow. They follow the actual check-in date and preserve the commercial agreement. A combined tariff/duration renegotiation is rejected with guidance to review it separately. Published/locked Owner realizations, active checkout, conflicting room periods, and manual deadline overrides require review rather than silent rewriting. Known automatic deadline-policy migrations are not treated as manual exceptions.
- Current invoice, receipt, contract-paid proof, management-fee documents, Admin/Penghuni/Owner billing presentation, lease reports, reminders, checkout validation, and Owner-ready eligibility distinguish pending service from occupied service. Current period reads supersede old uniform-date migration metadata after a service-period version is recorded. Owner-ready eligibility requires physical check-in as well as full payment. Pending leases are excluded from overdue/end-of-service operational clocks.
- New contract-paid proof snapshots record whether service was pending at issuance. Original receipt bytes remain available where stored. Original contract-paid proof renders its stored issuance snapshot. The invoice's `original-document` endpoint is explicitly a **period-at-issuance reconstruction with the latest payment balance**, not a byte-identical archived invoice; the document states this limitation. Current downloads carry period-authority notes without changing payment date or reference.

## Local verification and migration evidence — 2 October 2026

The tests live in `backend/api/test/lease-service-period/`. All opt-in database proofs require an explicit local flag and a loopback PostgreSQL host.

- 42 focused automated assertions passed: 26 schedule/date/activation contracts, 11 actionable service-period rejection cases, and 5 PDF text/content behavior tests.
- Local PostgreSQL proof passed for 29 period reconciliations, 3 complete activation/check-in flows, 3 deliberately failed occupancy writes with full rollback, 3 identical command replays, and 3 reviewed date-only corrections. Invoice documents were generated before and after physical check-in, including the original-period view; current billing projections were executed against PostgreSQL. All fixture writes were rolled back.
- The proof compares complete JSON records of payments, original invoices, original installments, payment receipts, and allocations before and after check-in and date-only correction. These records remained unchanged, including their original dates and amounts.
- API source compilation, Admin/Penghuni TypeScript checks, and local production builds passed. Interactive browser acceptance and Linux/VPS deployment are separate gates. The full historical backend test-fixture typecheck has pre-existing fixture typing failures; only the selected suites were compiled and executed for this handoff. A PostgreSQL client deprecation warning in the rollback proof reflects existing parallel read queries, not a failed assertion.
- The official local runner applied migration 114 with `{applied: 1, baselined: 0, alreadyApplied: 112}`. Its second run returned `{applied: 0, baselined: 0, alreadyApplied: 113}`. Comparing every pre-existing lease ID/start/end before and after confirmed that no old lease dates changed.
- Migration SHA-256: `0e40e6679576ac85dd05acf4f01c931bf8603d3ccefded4f4cfc30b549c857cf`.
- Verified local pre-migration backup: `C:\Users\FARHAN\AppData\Local\Temp\kostation-pre-checkin-114-RfIm5L\local-database.dump`; SHA-256 `65e24db1b266e1aa7f586284ea1941114c2cc072669cfca23f9feb35637d53bc`. `pg_restore --list` validated the archive before applying the official runner. Preserve or copy this temporary backup before relying on it for later recovery.

## Release and acceptance checklist

1. Local development requires the rebuilt API to be restarted by its operator and the browser refreshed. Do not terminate an unrelated/user-owned port-3000 process automatically.
2. Check a real pre-check-in resident read-only: duration and pending service should appear without a final range. Confirm activation-only does not start the period. Any physical check-in or historical correction of a real resident requires the operator's intentional action.
3. Test the impact preview, changed/backdated reason, current document download, original-period/document access, and period history in Admin; verify pending versus occupied presentation in Penghuni and Owner access.
4. Before VPS deployment, back up production, verify its ledger and migration-114 checksum with the official runner, build API/Admin/Penghuni, then perform authorized service restart and authenticated smoke tests. No manual ledger insertion, seed, or historical date backfill is required.
5. Do not commit `.checkin-proof-build` or `.checkin-test-build`; they are disposable compilation outputs. Handoff 08 correction/archive/purge work remains unimplemented and parked.

### Reproducing the focused proofs

Run from `backend/api` using the repository's installed Node/TypeScript dependencies:

```powershell
npx tsc -p tsconfig.build.json --outDir .checkin-proof-build
npx tsc --outDir .checkin-test-build --module commonjs --target es2022 --esModuleInterop --experimentalDecorators --emitDecoratorMetadata --skipLibCheck test/lease-service-period/lease-service-period.helper.spec.ts test/lease-service-period/lease-service-period.service.spec.ts test/kmo-w12/lease-settlement-policy.helper.spec.ts test/lease-settlement/m3-automatic-activation-contract.spec.ts
$env:KOSTATION_TEST_SOURCE_ROOT = (Get-Location).Path
node --test .checkin-test-build/test/lease-service-period/lease-service-period.helper.spec.js .checkin-test-build/test/lease-service-period/lease-service-period.service.spec.js .checkin-test-build/test/kmo-w12/lease-settlement-policy.helper.spec.js .checkin-test-build/test/lease-settlement/m3-automatic-activation-contract.spec.js test/lease-service-period/document-period.behavior.cjs
```

The PostgreSQL proof is optional and local-only. It reads the local `.env`, requires suitable pending-lease fixtures, and rolls back its schema/fixture transaction. Do not point it at production:

```powershell
$env:KOSTATION_CHECKIN_ROLLBACK_PROOF = '1'
node test/lease-service-period/local-rollback-proof.cjs
```
