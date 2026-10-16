# Owner Realization Pre-Transfer Period Rescheduling — Decision Record

> **Status:** Implemented in the local working tree; not yet committed or deployed.
>
> **Scope:** Admin Owner Realizations before any successful transfer or Owner
> publication.
>
> **Does not supersede:**
> [OWNER_REALIZATION_POST_PUBLICATION_PERIOD_CORRECTION_PLAN.md](OWNER_REALIZATION_POST_PUBLICATION_PERIOD_CORRECTION_PLAN.md).
> That document remains the separate, append-only design for correcting a
> published financial fact.

## 1. Problem

The system currently derives an Owner Realization period from the month in
which a tenant lease became fully paid. This is a useful default, but it is not
always the business payment schedule agreed by the Admin and the Property Owner.

For example, a lease may be fully paid in August while the Owner has agreed to
receive the corresponding realization in October. Admin needs to place the
entire pre-transfer realization batch in October without fabricating or changing
the August tenant-payment fact.

The previous proposal introduced categories, attachments, versioned records,
target-period restrictions, and automatic conflict handling. Those controls are
not proportionate to this operational scheduling need.

## 2. Decision

Introduce one lightweight Admin command, labelled **Koreksi periode realisasi**.
It changes the operational reporting/payment period of one complete Owner
Realization batch.

The command is a business scheduling decision. It is not a correction of the
tenant payment, the Owner entitlement calculation, transfer facts, or published
financial evidence.

### 2.1 Eligibility

The command is available only when all of the following are true:

- the realization has no successful Owner transfer;
- the realization has not been published to the Property Owner;
- the realization is not void or cancelled; and
- the acting user already has the existing Admin permission to manage Owner
  Realizations.

No new role or special approval permission is required.

### 2.2 Required input

Admin supplies:

1. **Correct realization period** — any selected reporting month, including a
   month later than the tenant payment-completion month; and
2. **Reason** — required free text that records the agreement or operational
   context for the scheduling decision.

The reason is retained on the realization as its current scheduling note. The
existing application audit mechanism may record the actor, time, and before/after
period as part of the normal command audit. This decision does not require a
new correction-version model, reason categories, mandatory attachments, or a
separate audit screen.

### 2.3 Result of a successful command

On success, the system:

- updates the realization header's `realization_period` for the complete batch;
- retains the original tenant payment-completion dates and all monetary
  snapshots unchanged;
- records the required reason;
- returns the batch to **Draft**; and
- requires Admin to submit the batch to Finance again before a transfer can be
  recorded.

The batch is shown in the target period only. The original period is not kept as
an active queue entry.

## 3. Existing Batch in the Target Period

Multiple batches for the same Property Owner and reporting period are allowed.

If the selected target period already contains another realization for the same
Owner, the confirmation dialog must show a clear warning with that batch's
reference and Owner amount. Admin may still continue.

The system must not automatically merge, cancel, split, or rewrite either batch.
Each batch remains independently identifiable for Finance, transfer recording,
and reporting. The existing protection that prevents a lease from being included
in more than one active realization remains unchanged.

This choice favors a successful operational schedule adjustment over an
artificial one-batch-per-Owner-per-month restriction, while keeping financial
lines separate and non-duplicated.

## 4. Finance Form and Reporting Behavior

After rescheduling:

- the batch is no longer an active Finance candidate in its previous period;
- it appears in the target period after Admin submits it to Finance again;
- any Finance Transfer Request Form generated afterwards uses the target period;
- multiple batches for one Owner and period remain distinct records, even when
  they appear together in a Finance report; and
- the reason for rescheduling is available to authorized Admin users on the
  realization detail, but is not required in Owner-facing documents.

The Finance Transfer Request Form is generated on demand and is not a persisted
versioned document. Rescheduling does not introduce a document-versioning or
backfill requirement.

## 5. UI Contract

The realization detail exposes **Koreksi periode realisasi** only for eligible
records. Its modal contains:

- a localized month/year control for the target period;
- a required **Alasan koreksi periode** text field;
- a warning panel when the same Owner already has a batch in the selected
  target period; and
- an explicit confirmation action explaining that the realization returns to
  Draft and must be submitted to Finance again.

The normal success state identifies the new period and confirms that no tenant
payment, Owner amount, or transfer fact has been changed.

## 6. Explicit Non-Goals

This command does not:

- alter the month or amount of a tenant payment;
- recompute Owner entitlement, rent, Management Fee, or transfer amounts;
- move only selected contract lines from a batch;
- merge or cancel another batch in the target period;
- change a realization with a successful transfer or Owner publication;
- correct an issued receipt, transfer evidence, or other published financial
  fact; or
- automatically migrate legacy records.

Those cases remain subject to their own workflow. A realization with a
successful transfer but without Owner publication is explicitly outside this
decision: it cannot be rescheduled and must not be routed to a
post-publication-correction workflow before that workflow's publication
preconditions are met. The separate post-publication correction design applies
only to the published financial fact it defines.

When that separate capability is implemented, its UI label must be distinct
from this command (for example, **Koreksi periode pascapublikasi**) so that an
Admin cannot mistake an immutable-fact correction for pre-transfer scheduling.

## 7. Acceptance Scenarios

1. A lease paid in August is included in an eligible, untransferred realization.
   Admin selects October, supplies a reason, and the full batch is moved to
   October successfully.
2. The August payment-completion date, room, tenant, Owner amount, Management
   Fee, and total realization remain unchanged after the move.
3. The moved batch is Draft and cannot be transferred until it is submitted to
   Finance again.
4. If the same Owner already has an October realization, Admin sees its
   reference and amount, confirms the warning, and the rescheduled batch remains
   separate in October.
5. A realization with a successful transfer, a published realization, or a
   void/cancelled realization cannot use this command.
6. No tenant lease can appear in two active Owner Realizations as a consequence
   of this command.
7. Existing historical data remains unchanged until an authorized Admin
   deliberately reschedules one eligible batch.

## 8. Implementation Boundary

This decision is implemented without a database migration. It does not authorize
data correction, deployment, or changes to production records. Those actions
remain separate operational decisions.
