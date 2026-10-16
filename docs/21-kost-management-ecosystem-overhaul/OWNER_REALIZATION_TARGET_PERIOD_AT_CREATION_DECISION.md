# Owner Realization Target Period at Creation — Decision Record

> **Status:** Implemented locally; pending validation and deployment.
>
> **Recorded:** 2026-10-16
>
> **Scope:** Admin creates an Owner Realization with **Transfer not yet
> performed** from the Active Realizations workspace.
>
> **Related decisions:**
> [Owner Realization Pre-Transfer Period Rescheduling](OWNER_REALIZATION_PRE_TRANSFER_PERIOD_RESCHEDULING_DECISION.md)
> applies after a batch exists. This document defines period selection while a
> batch is first created.

## 1. Problem

The Active Realizations workspace identifies eligible leases from the month in
which their rent became fully verified and paid. That month is the correct
source of the financial fact, but it is not always the month in which the
Property Owner has agreed to receive a realization.

For example, a lease fully paid in September 2026 may need to be prepared for
an October 2026 Owner payment. Admin needs to make that choice before the
realization exists, while preserving the September payment fact.

The current creation flow uses one period for both candidate selection and the
new realization header. Passing October to that flow would incorrectly search
for October-paid leases rather than prepare the selected September-paid leases
for October.

## 2. Decision

Creation separates the following concepts:

| Concept | Meaning | Example |
| --- | --- | --- |
| **Payment source period** | The month in which a selected lease became fully verified and paid. It determines its eligibility in the Active Realizations workspace. | September 2026 |
| **Target realization period** | The operational reporting and Owner-payment month selected by Admin for the new or existing Draft realization. | October 2026 |

The verified payment-completion timestamp remains the source of truth. The
target realization period is an operational scheduling choice and never edits
the tenant payment, contract value, Owner entitlement, Management Fee, room,
or resident snapshot.

## 3. Admin Workflow

1. Admin opens **Active Realizations** for a payment source period, such as
   September 2026.
2. Admin selects an Owner and starts **Create Owner Realization**.
3. Admin chooses **Transfer not yet performed**.
4. The dialog shows a month/year **Target realization period** picker. It
   defaults to the payment source period, but any past, current, or future
   month may be selected.
5. When the target period differs from the payment source period, Admin must
   provide a concise scheduling reason, for example: `Owner payment agreement
   for October 2026`.
6. The dialog shows an explicit notice, for example: `Payments are recorded in
   September 2026; this realization will be recorded in October 2026.`
7. Admin saves the realization. A new Draft is created or selected lines are
   added to an existing compatible Draft for the same Owner and target period.
8. Admin reviews the Draft and uses the existing submission flow before Finance
   can record a transfer.

One creation action has one target realization period. It cannot assign a
different target period to each selected lease.

## 4. Batch Rules

### 4.1 Draft reuse

When a Draft exists for the same Property Owner and target realization period,
the system adds the newly selected eligible leases to that Draft. The Draft
remains one Finance work item for that Owner and period.

The existing realization command audit records the added lease count, their
payment source period or periods, the actor, and time. It does not introduce a
separate audit model.

### 4.2 Submitted and transfer-pending batches

The system must not change a realization already submitted to Finance or waiting
for transfer. If an Owner already has such a batch in the selected target
period, creation is rejected without partial changes. Admin must resolve that
batch through its existing lifecycle before trying again.

### 4.3 Payment source periods may be mixed in one target Draft

The same target Draft may contain leases paid in different months, provided each
lease is eligible and has no active realization allocation. Each contract line
retains its own payment-completion date and source period.

### 4.4 Duplicate-allocation protection

Before saving, the server revalidates every selected lease in one transaction.
Each lease must still be fully paid, be allocated to the selected Owner, and be
unallocated by every other active Owner Realization. If any selected lease fails
validation, the request fails as a whole and identifies the affected lease or
leases. No partial batch is created or modified.

After success, the selected leases are no longer available in the Active
Realizations queue for their payment source period.

## 5. Data and API Contract

The existing period value used by the prepare command must be split in the API
contract:

| Field | Purpose |
| --- | --- |
| `payment_source_period` | Used only to retrieve and validate the selected eligible lease candidates. |
| `target_realization_period` | Stored as the realization header reporting/payment period. |
| `scheduling_reason` | Required when the target period differs from the source period; retained with the realization. |
| `selected_lease_ids` | Identifies the selected leases; all must be validated atomically. |

The realization header stores the target period. Its existing internal `notes`
field retains the concise scheduling entry together with any optional
preparation note. Line snapshots retain the authoritative payment-completion
timestamp. Payment source periods are derived from those line snapshots rather
than duplicated as one header value, because one target batch may include
several source months.

The implementation may use the project's existing audit mechanism to store the
actor, time, source period, target period, selected lease identifiers, and
reason. It must not write those facts only to application logs.

## 6. Presentation and Documents

- The Active Realizations page continues to group candidates by payment source
  period.
- After successful creation, the selected leases disappear from their source
  period queue and appear only in the target realization's Draft.
- Admin detail identifies the target realization period as the primary period.
  It also shows each contract's payment source period and the retained
  scheduling reason.
- Finance forms and exports use the target realization period as their primary
  reporting period. They include the payment source period per contract and the
  scheduling reason when the periods differ.
- Property Owner portal views show the target realization period and financial
  values. They do not expose the internal scheduling reason.

## 7. State Boundaries

This capability is available only through **Transfer not yet performed** and
creates or updates a Draft. It does not record a transfer, publish a
realization, alter a transfer reference, or issue a receipt.

It does not replace the existing pre-transfer rescheduling command for an
already-created batch. It does not replace the planned post-publication period
correction workflow for a realized and published financial fact.

## 8. Acceptance Scenarios

1. A September-paid lease is selected from Active Realizations. Admin selects
   October as target period, supplies a reason, and receives a Draft for
   October. The lease retains its September payment-completion fact.
2. A same-Owner October Draft exists. Admin adds selected September-paid leases
   to it, and the realization detail records a concise activity entry.
3. A same-Owner October batch is submitted to Finance or waiting for transfer.
   The request is rejected and neither batch nor lease allocation changes.
4. Two selected leases originate in September and one in August. All are added
   to the October Draft; each line displays its own source period.
5. One selected lease becomes ineligible or is allocated by a concurrent
   request. The whole operation fails without creating or changing the Draft.
6. A Finance form for October uses October as its primary period and shows the
   source payment month for every included contract.
7. An Owner Portal view does not reveal the internal scheduling reason.
8. Selecting the source period as the target retains the normal current
   workflow and does not require a scheduling reason.

## 9. Non-Goals

- Changing a tenant payment month or verified payment-completion timestamp.
- Recalculating contract rent, Management Fee, or Owner entitlement.
- Recording or editing a transfer during this creation flow.
- Assigning several target periods in one creation action.
- Changing a batch already submitted to Finance, waiting for transfer, realized,
  voided, cancelled, or published.
- Rewriting existing historical realizations or performing automatic backfills.

## 10. Implementation Notes

The implementation must preserve the existing invariant that each lease is
allocated to at most one active Owner Realization. It should extend the normal
creation command and its Admin dialog rather than routing initial scheduling
through the post-creation correction command.

No database migration is required: the existing realization header already has
an internal `notes` field, and the existing command audit record stores the
actor, source period, target period, reason, and selected lease identifiers.
