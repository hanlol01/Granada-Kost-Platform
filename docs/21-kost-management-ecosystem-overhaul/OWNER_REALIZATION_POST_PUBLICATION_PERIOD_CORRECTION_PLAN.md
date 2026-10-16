# Post-Publication Owner Realization Period Correction

> **Status:** Requirements design agreed through stakeholder interviews; not
> implemented.
>
> **Recorded:** 2026-10-12
>
> This document records product requirements and design decisions only. It does
> not authorize production-data changes, automated corrections, deployment, or
> feature implementation.

## 1. Problem statement

An Owner Realization was completed, transferred, and published to the Owner for
September 2026. One included resident lease was fully paid in August 2026, but
its activation/check-in occurred in September. Its realization period should be
derived from the verified paid-in-full month, rather than the
activation/check-in month.

The realization and receipt have already been issued. Directly deleting or
mutating the historical record would compromise auditability, and Admin currently
has no supported workflow for correcting the period of a published contract line.

## 2. Objective

Provide a **Post-Publication Period Correction** capability that lets an
authorized Admin correct the realization period of an individual lease without
deleting or rewriting the historical realization, transfer, receipt, evidence, or
audit facts. The corrected version becomes the Owner's current view; preceding
versions remain traceable.

## 3. Agreed product decisions

1. **The correction is limited to the realization period.** It must not change
   the contract value, Owner entitlement, management fee, Owner, resident, room,
   transfer date, transfer reference, evidence, or payment status. Monetary
   differences are handled through a separate financial-correction or recovery
   workflow.
2. **Corrections are made per contract line.** If a realization contains several
   contracts, only the selected line moves to its effective period. Every other
   contract remains in its original period.
3. **The target month is derived from the payment source of truth.** The target
   period must equal the month in which the verified payment ledger establishes
   the lease as paid in full, calculated in the Asia/Jakarta business timezone.
   Admin must not select an arbitrary alternative period.
4. **A conflict blocks the correction.** If the same lease is already allocated
   to a realization in the target month, the system rejects the request and
   exposes the conflict for reconciliation. It must not duplicate, automatically
   move, or merge the line.
5. **The original transfer and evidence remain unchanged.** The amount,
   transfer time, reference, receipt, and transfer evidence remain linked to the
   same transfer event. A period correction creates no new transfer, reversal, or
   recovery.
6. **The correction is append-only and fully audited.** The original record is
   never deleted. Every correction stores a mandatory reason, actor, timestamp,
   before/after period, affected lease, and link to the source realization.
7. **Access is controlled by a dedicated permission.** The action requires a
   post-publication correction permission, not a general-purpose authorization
   bypass. The initial scope does not require second-person approval; actor and
   reason auditing remain mandatory.
8. **The Owner sees the corrected version as current.** The applicable period,
   summaries, and documents reflect the latest correction. Earlier versions
   remain available as history and are clearly identified as superseded versions.

## 4. Scope boundary

### In scope

- Realizations that are complete, have successfully reconciled transfers, have a
  final receipt, and are published to the Owner.
- One lease-period correction per command.
- Server-side verification of the paid-in-full month in the ledger and lease
  allocation conflicts in the target period.
- Admin and Owner views that distinguish the current effective period from the
  historical version trail.
- A corrected document version that references the original receipt and transfer,
  consistent with [ADR-0006](../adr/0006-owner-realization-detail-and-receipt-consistency.md):
  the transfer/receipt number is retained, the reason is **Perbaikan periode
  realisasi**, and prior document files remain preserved.

### Out of scope

- Deleting, cancelling, or voiding an issued realization.
- Editing or recreating the transfer transaction, amount, transfer date, original
  receipt, or transfer evidence.
- Correcting resident-payment data or the lease snapshot as part of a period
  correction.
- Amount corrections, outstanding collection, refunds, or recovery actions.
- Automatic mass correction at feature release or when payment-period data
  changes.
- Legacy records whose paid-in-full source cannot yet be reconciled to the
  ledger. Their payment source must be investigated separately before a period
  correction is permitted.

## 5. Expected behaviour

### Admin flow

1. Admin opens a published realization detail and selects one lease line.
2. The system displays the Owner, room/resident, current period, verified
   paid-in-full date and month, system-derived target period, and related receipt
   and transfer identifiers.
3. Admin supplies the mandatory correction reason. The target period is not a
   free-form field.
4. The server verifies permission, realization state, payment source, and target
   period conflicts within a safe transaction.
5. If verification fails, no data changes and Admin receives an explanation that
   identifies the conflict or source fact requiring review.
6. If verification succeeds, the system records a new correction version. The
   line's effective period changes while the original snapshot, transfer, prior
   receipt, and evidence remain intact.

### Summaries, history, and documents

- The latest report projects the corrected lease into the target period; other
  contracts in the originating realization do not move.
- Contract summaries and Owner-entitlement totals by period use the effective
  contract line.
- Transfer history continues to show the actual transfer date, independently of
  the lease realization period.
- The corrected receipt/document version is labelled **Perbaikan periode
  realisasi**, displays the current period, and references the original
  transfer/receipt identifier. Earlier document versions remain accessible for
  audit.
- The Owner sees the current state, correction reason, and effective time. The
  correction must not appear as a new transfer or payment. Proactive Owner
  notifications are not included in this decision.

## 6. Audit and safety requirements

The audit trail must answer: who made the correction, when it was made, which
contract line was affected, the original and target periods, the reason, the
source realization and receipt, and the ledger source that establishes the
paid-in-full month.

The operation must be idempotent and safe against duplicate requests and
concurrent changes. An Admin without the dedicated permission must not be able to
make a correction. There must be no support path, manual SQL path, or bypass that
erases historical evidence.

## 7. Product acceptance scenarios

- A lease verified as paid in full in August but activated/checked in during
  September can be corrected from a published September realization to its August
  effective period.
- Other contracts in the September batch remain in September; the transfer amount
  and actual transfer date remain unchanged.
- If the ledger establishes full payment in September, Admin cannot use this
  feature to force the lease into August.
- If the lease is already allocated in the target period, the correction is
  rejected without duplication or partial state change.
- The mandatory reason, dedicated permission, actor, timestamp, and before/after
  values are available in the audit trail.
- The Owner sees the corrected version and period as current; the prior version
  remains traceable but is not presented as the current state.
- PDF, Excel, Admin detail, Owner Portal, and receipt output do not duplicate a
  payment or alter transfer facts.
- No historical data changes automatically merely because the capability is
  released.

## 8. Separation from the legacy-data case

The separately discussed VPS legacy lease case—where a lease still appears in
September despite apparently being paid in August—is deferred and is not part of
this post-publication correction scope. The actual payment transaction source and
paid-in-full ledger state must be verified before that case is addressed. This
feature must not assume every legacy record has a complete or correct
paid-in-full source.

## 9. Preconditions for implementation

This document introduces a narrow post-publication period-correction requirement.
'OWNER_REALIZATION_REWORK_PLAN.md' §16 currently defers retroactive changes to
issued documents. Before implementation, the new decision must be formalized as
an addendum or ADR that explicitly narrows that deferral only for
Post-Publication Period Correction, without weakening the remaining immutable
and append-only rules.

The following technical design decisions remain open:

- persistence model for correction versions and per-contract-line report
  projection;
- permission key and Admin-role mapping;
- version presentation in each UI surface and export format;
- correction constraints where a lease has more than one historical batch or the
  source ledger cannot establish one authoritative paid-in-full timestamp; and
- required migration or backfill strategy. The safe default is no automatic
  modification of legacy records; every correction is an authorized Admin action.

Implementation has not started and requires separate approval after technical
design and release criteria are reviewed.

