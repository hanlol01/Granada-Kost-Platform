# Owner Realization Manual Draft Lines — Decision Record

> **Status:** Implemented locally — build, migration, and contract-test verification complete; pending runtime deployment verification.
>
> **Recorded:** 2026-10-18; revised 2026-10-19 (Asia/Jakarta).
>
> **Scope:** Admin `/reports/property-owners` report navigation and the
> **Buat Realisasi Owner** flow when **Transfer belum dilakukan** is selected.
>
> **Related decisions:**
> [Owner Realization Implementation Specification](OWNER_REALIZATION_IMPLEMENTATION_SPEC.md),
> [Owner Realization Target Period at Creation](OWNER_REALIZATION_TARGET_PERIOD_AT_CREATION_DECISION.md),
> and [Owner Realization Pre-Transfer Period Rescheduling]
> (OWNER_REALIZATION_PRE_TRANSFER_PERIOD_RESCHEDULING_DECISION.md).

## 1. Problem

The Active Realizations queue is intentionally derived from the month in which
a normal-rent lease became fully verified and paid. This is the correct
automatic path, but it does not cover every operational situation. An Admin may
need to create a new, not-yet-transferred Owner Realization for a fully paid
lease that is not present in the currently selected queue period.

The existing **Transfer sudah dilakukan** path accepts historical manual rows.
It is not the correct implementation model for this need: it represents a
historical financial fact and can include legacy or unmatched evidence, whereas
the requested work must create a normal Draft that proceeds through review,
Finance submission, transfer recording, and publication.

The solution must keep the existing one-lease-one-active-realization allocation
boundary. It must also allow Admin to correct the snapshot values used by a
manual Draft without rewriting the tenant lease, payment, ownership, or
Management Fee source records.

## 2. Decision

### 2.1 Report navigation

`Realisasi Owner` becomes the first tab in the shared **Ruang kerja laporan**
navigation. The route, permissions, filter URL contract, and other report tabs
do not change.

### 2.2 Searchable Owner selection

The **Owner penerima realisasi** field becomes a searchable combobox.

- It lists only active Owner Profiles within the currently selected Property.
- Search matches the Owner list without creating a new Owner Profile from the
  dialog.
- An archived Owner is not eligible for a new pending-transfer Draft.
- Selecting an Owner displays the existing payout-destination summary.

The component must keep keyboard navigation, visible selected value, accessible
combobox semantics, and the dialog scroll position. The existing command/popover
combobox pattern may be reused.

### 2.3 Manual Draft is a normal not-yet-transferred realization

When **Transfer belum dilakukan** is selected, Admin may add **Baris kontrak
realisasi manual**. This path creates or updates a normal Owner Realization
Draft; it is not a historical entry and it records no transfer fact.

The normal lifecycle remains unchanged:

```text
Draft -> Awaiting review -> Approved -> Submitted to Finance
      -> Awaiting transfer -> Partially realized -> Realized
```

The creation operation must not issue a receipt, publish to the Property Owner
Portal, create a transfer, or mark money as paid.

## 3. Manual Contract Selection and Editable Snapshot

### 3.1 Candidate boundary

Each manual row starts with a searchable **Cari kamar atau nama penghuni**
control. Its candidates are limited to leases that all satisfy the following:

1. belong to the selected active Owner within the selected Property;
2. use normal rent commercial mode;
3. have a positive contract rent amount;
4. are fully verified and paid in full;
5. are not cancelled; and
6. have no active Owner Realization allocation lock.

The candidate pool is not restricted to the current report's payment-source
month. Therefore, a fully paid contract from an earlier or later payment month
can be scheduled into the selected target realization period.

Owner-sponsored occupancy, Security Deposit-only records, unpaid or
outstanding rent, cancelled leases, and already allocated leases are never
manual-Draft candidates.

### 3.2 Selected lease and editable values

Selecting a lease fills the row with its current authoritative snapshot:

- room code;
- resident name;
- total contract rent;
- Management Fee; and
- payment-completion date and payment-source period.

Admin may edit the displayed room code, resident name, total rent, and
Management Fee for the realization snapshot. These changes do **not** update
the tenant lease, resident, room, payment, ownership, or fee records.

The selected `lease_id` remains the source reference after edits. It is used to
retain the allocation lock and prevent the contract from entering another active
Owner Realization. The detail view must identify the source lease separately
from its final manual snapshot when the values differ.

### 3.3 Money rules

- Total rent is a required positive whole-Rupiah value.
- Management Fee is a required whole-Rupiah value from `Rp0` through Total
  Rent.
- **Hak Owner** is read-only and always recalculates as `Total Rent -
Management Fee`.
- A manual row cannot create a negative Owner entitlement.
- Typed, evidence-backed realization adjustments remain the separate adjustment
  mechanism; they are not replaced by unrestricted negative table values.

### 3.4 Row-level interaction

- **Tambah baris manual** adds a new row with the contract search control.
- A selected source lease can appear only once across all active realization
  batches.
- The manual search includes eligible leases that also appear in the automatic
  queue. Selecting one of those leases removes it from automatic selection and
  adds it as a manual row in the same unsaved Draft. It must never be included
  twice.
- Admin can remove an unsaved row before saving the Draft.
- The table displays a read-only **Periode pelunasan sumber** for every manual
  row.
- The table marks its source as **Manual**.

## 4. Automatic Draft Candidates

The existing **Kontrak yang masuk draft** remains the automatic queue-selection
surface. It is redesigned as a dense, readable table with a selection checkbox
and read-only columns for Room, Resident, Total Rent, Management Fee, Owner
Entitlement, payment-source period, and eligibility state.

Automatic values are not editable in this table. Admin must use the manual-row
flow when an exception needs an editable realization snapshot. This preserves
the distinction between server-derived eligible candidates and an intentional
manual operational record.

If Admin selects an automatic candidate through the manual search, the UI must
move that candidate to the manual table rather than requiring Admin to first
find and clear its automatic checkbox. The selection remains a single source
lease and one allocation-lock subject.

Each line in a mixed Draft visibly identifies its source:

- **Otomatis** for an eligible queue candidate; or
- **Manual** for a manually selected contract with an editable final snapshot.

## 5. Period, Batching, and Reason

The existing separation stays authoritative:

| Concept                   | Meaning                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Payment source period     | The month in which each lease became fully verified and paid. It remains a line-level financial fact. |
| Target realization period | The Admin-selected reporting and Owner-payment month on the realization header.                       |

One manual Draft may contain contracts from multiple payment source periods.
Its target period remains one header value and may be a past, current, or future
calendar month. Every included line retains and displays its own payment-source
period.

A save operation that creates or appends one or more manual rows requires one
concise manual header reason. An automatic-only Draft does not require this
manual reason. The single reason explains both why the normal active queue was
not used and, when applicable, why the selected target period differs from the
payment-source period. It replaces any requirement for separate manual-line and
scheduling-reason fields, for example:

> `September-paid lease is scheduled into the October Owner realization under the Owner agreement.`

The header reason is sufficient for all manual overrides in that save operation.
No additional per-line or duplicate scheduling-reason field is required.

When Admin appends manual rows to an existing Draft, the one draft-level reason
must be updated so it explains every manual row currently in that Draft. This
replacement is permitted only while the realization status remains `Draft`; it
does not add a separate reason per append operation.

## 6. Draft Reuse and Concurrency

For the same Property Owner and target realization period:

1. If a compatible Draft exists, newly selected automatic and manual lines are
   appended to that Draft.
2. If an existing batch has moved beyond Draft, creation is rejected without
   partial changes. Admin must resolve the in-progress batch through its normal
   lifecycle first.
3. Before persistence, the API revalidates every selected source lease inside
   one transaction.
4. If any selected lease is no longer eligible or becomes allocated by a
   concurrent command, the whole operation fails and no rows are added.

This decision does not change the separate pre-transfer rescheduling command or
post-publication period correction behavior. It only governs new manual lines
at Draft creation time.

## 7. API and Persistence Requirements

The implementation must extend the normal Draft creation capability or add a
dedicated manual-Draft command. It must not route an untransferred manual Draft
through the historical realization endpoint.

The command contract must carry, at minimum:

- `property_id`;
- selected active `owner_profile_id`;
- one `target_realization_period`;
- one required manual header reason when the request creates or appends one or
  more manual lines;
- source `lease_id` for every manual line; and
- the final editable snapshot values for each line.

The persisted realization line must preserve both the selected lease reference
and the final manual snapshot. It must also be distinguishable as a manual line
in authorized Admin detail, Finance forms, PDF, and Excel exports. A database
migration is required only if the current line-origin representation cannot
record that distinction without overloading historical semantics.

The implementation must reuse the existing allocation-lock mechanism. A source
lease cannot be unlocked or duplicated merely because an Admin changes the
manual snapshot fields.

## 8. Finance, Documents, and Visibility

- Finance forms and exports use the target realization period as their primary
  period.
- They include payment-source period and line source for every contract.
- A manual line's final snapshot values drive that realization's internal Draft
  and subsequent Finance amount; later tenant-record changes do not rewrite the
  realization snapshot.
- The manual scheduling reason is visible to authorized Admin and Finance users
  only.
- The Property Owner Portal can show the target period and financial result but
  must not expose internal manual reasons or Admin-only source metadata.

## 9. UI Contract

The **Buat Realisasi Owner** dialog presents two distinct sections when
**Transfer belum dilakukan** is selected:

1. **Kontrak yang masuk draft** — read-only automatic candidate table with
   selectable rows.
2. **Baris kontrak realisasi manual** — editable manual table with per-row
   contract search, automatic population, manual source marker, and totals.

The manual table uses the established Rupiah field format, shows `Rp` within the
input, uses Indonesian thousands separators, and recomputes all totals without
page navigation. It should retain the existing bounded horizontal table scroll
behavior on narrow screens.

The UI must make the selection boundary explicit:

- Before a source lease is selected, editable snapshot fields are disabled or
  clearly marked as awaiting contract selection; typing free-form values alone
  must not imply that an unlinked future realization can be saved.
- An empty manual search must distinguish among no qualifying paid contract,
  candidates already selected automatically, and a loading or API error state.
- If **Siapkan draft** is disabled, the dialog must show the specific unmet
  requirement, such as selecting a source lease, entering the one manual
  reason, choosing a target period, or correcting invalid monetary values.

## 10. Acceptance Scenarios

1. Admin opens the Owner Realization report and sees **Realisasi Owner** as the
   first report tab.
2. Admin opens **Buat Realisasi Owner**, searches an active Owner by name, and
   selects the intended Owner without scrolling a long list.
3. A fully paid September lease absent from the current October queue is found
   through the manual row search, added to an October Draft, and retains
   September as its payment-source period.
4. Admin changes the selected row's displayed resident name, total rent, and
   Management Fee. Hak Owner recalculates, while the source lease remains
   allocated and cannot be added to another active realization.
5. An outstanding, owner-sponsored, cancelled, archived-Owner, or already
   allocated lease cannot be selected.
6. A Draft already exists for the same Owner and target period. A new manual
   row is appended to it; no second Draft is created.
7. A same-Owner batch already submitted to Finance blocks a new manual row;
   neither the batch nor allocation locks change.
8. A Draft containing automatic and manual lines displays their source labels,
   line payment-source periods, and correct combined totals in Admin and Finance
   exports.
9. Saving a manual row without a reason, source lease, positive total rent, or
   valid Management Fee is rejected with field-specific feedback before or when
   Admin attempts to prepare the Draft.
10. No receipt, transfer, publication, or Owner Portal financial claim is
    created by saving a manual Draft.
11. An automatic candidate selected through manual search is removed from the
    automatic table selection, appears once as an editable manual row, and
    cannot be duplicated in the resulting Draft.
12. A manual Draft targeted to an earlier, current, or later calendar month
    retains every line's payment-source period and stores one combined manual
    reason.

## 11. Non-Goals

- Creating a free-text, unlinked future realization line.
- Editing tenant lease, payment, resident, room, ownership, or Management Fee
  source records from the realization dialog.
- Recording a historical transfer through the not-yet-transferred flow.
- Allowing negative Owner entitlement in a manual line.
- Adding a new Finance login role or bypassing existing Admin authorization.
- Replacing pre-transfer rescheduling or post-publication period correction.
- Automatically moving, voiding, merging, or recalculating existing
  realizations.
