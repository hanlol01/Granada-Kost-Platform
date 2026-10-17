# Actual Checkout Recording and Late-Penalty Plan

Status: **IMPLEMENTED LOCALLY — PENDING REVIEW AND DEPLOYMENT**
Decision date: **17 October 2026**
Scope: Admin lease checkout only, including the final-settlement rules that
consume the recorded actual checkout fact.

## Implementation record

The approved policy is implemented in the local API and Admin worktree.

- Migration `131_actual_checkout_and_correction_settlement.sql` makes a saved
  daily late-penalty amount of `Rp0` valid and stores the waiver reason plus the
  separate contract-correction-credit settlement value.
- The checkout API validates an actual historical date against verified physical
  check-in and Jakarta today, preserves that business date during handover, and
  records waiver reasons when a late penalty is explicitly set to `Rp0`.
- The Admin UI records **Tanggal check-out aktual**, explains the selected exit
  type, requires an internal note for a historical record, and separates
  contract-correction credit from cash in the final settlement.
- Focused API tests, migration apply/replay, targeted lint, and API/Admin
  production builds are required before deployment; the recorded verification
  commands are maintained with the implementation change.

## 1. Purpose

The existing checkout workflow starts with a future-facing checkout plan. This
does not match the operational rule now approved for Kostation: an Admin starts
checkout only after the resident has actually left the room, removed their
belongings, and surrendered practical possession of the accommodation.

The revised workflow records an actual business fact. It must support both:

- a resident who leaves before the contractual checkout date; and
- a resident who leaves on or after that date, including a late physical exit.

It must not require an Admin to invent a future plan or to use the date on
which the Admin entered the record as the resident's physical checkout date.
Its final settlement must distinguish a contract-price correction from money
that the resident actually paid.

## 2. Approved operational policy

### 2.1 Checkout starts only after physical departure

For new checkout commands, Admin must not begin checkout while the resident is
still occupying the room or retaining belongings/access there. A checkout
record represents a confirmed physical departure, not a notice of intent.

The initial date field is named **Actual checkout date**. It is a Jakarta
business date and must satisfy all of the following:

- it is not after the current Jakarta business date;
- it is not before the resident's verified physical check-in date; and
- it is evaluated against the lease's saved contractual checkout boundary.

The system records the data-entry timestamp independently. A historical actual
date must never be overwritten with the date on which Admin later records the
handover.

A historical entry is any actual checkout date before the current Jakarta
business date. This plan sets no arbitrary maximum backdating window: valid
missed checkout facts may be recorded after the event. The verified physical
check-in date, mandatory source, reason, internal note, and append-only audit
record are the safeguards against an unsupported date.

### 2.2 Exit-type classification

Admin chooses one of two mutually exclusive exit types. The API enforces the
date relationship; the UI must not let labels imply a different rule.

| Exit type                                          | Use when                                                                   | Result                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `resident_early_termination` / **Early departure** | The actual checkout date is before the contractual checkout boundary.      | No late-checkout penalty applies.                           |
| `normal_expiry` / **Contract term ended**          | The actual checkout date is on or after the contractual checkout boundary. | The late-checkout policy is evaluated from the actual date. |

The exact comparison must use the existing central business-date helper and
saved lease snapshot. UI text must not duplicate or reimplement date arithmetic.
The API returns a domain validation error when the submitted type conflicts
with its date: an early-departure type cannot be on or after the contractual
boundary, and a contract-term-ended type cannot be before it.

### 2.3 Late-checkout policy

The existing three-calendar-day grace period remains in force. A late penalty
is calculated only when the actual checkout date is after the saved
penalty-free boundary.

- Early departure never creates a late-checkout penalty.
- A checkout on or before the penalty-free boundary has a final penalty of
  `Rp0`.
- A checkout after the boundary uses the saved daily penalty rate and the
  existing capped-day rule.
- The final calculation always uses the actual checkout date, never an
  estimated or planned date.

### 2.4 Rate override and penalty waiver

The daily rate defaults from the immutable contract snapshot. It is shown only
when a late penalty can apply.

An Admin may change that rate. Setting it to `Rp0` for a checkout that is
otherwise late is a **late-penalty waiver**, not an unexplained zero tariff.
The waiver requires a reason and records the actor, timestamp, previous rate,
calculated penalty, final penalty, and selected override. Supporting attachment
is optional.

A non-zero override is a whole-Rupiah amount within the existing accepted
server range. A blank optional override means **retain the contract-snapshot
rate**; an explicit `Rp0` means **waive the late penalty** and therefore
requires the waiver reason.

Admin is the authorized operational role for checkout and for recording a
penalty waiver. No additional login role is introduced by this revision.

## 3. Admin workflow

The compatible Admin workflow retains five visible stages because the existing
second stage is needed to confirm the late-penalty rate or waiver and the
pre-existing early-departure compensation. It is a confirmation of recorded
checkout data, not a plan for a future checkout. The old terms _checkout plan_
and _plan confirmation_ must not appear in this new path.

| Stage | Admin-facing label             | Required outcome                                                                                                                                                           |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Actual checkout details**    | Record actual date, exit type, request source, reason, and internal note. For historical entries, source, reason, and internal note are mandatory; attachment is optional. |
| 2     | **Checkout data confirmation** | Confirm any late-penalty rate or documented waiver, and the existing early-departure compensation when applicable. This never changes the actual checkout date.            |
| 3     | **Room and access handover**   | Record keys/access, inventory, parking, utilities, and handover evidence or notes. The stored actual date remains unchanged.                                               |
| 4     | **Room inspection**            | Record condition and inspection result. The room moves only through the existing inspection authority.                                                                     |
| 5     | **Final settlement**           | Reconcile actual received money, earned rent, checkout charges, deposit, and documented damage; then record the final financial decision.                                  |

Existing historical commands retain their existing lifecycle labels and records.
No command, document, payment, room event, or settlement is backfilled or
rewritten merely because this workflow is introduced.

## 4. User-interface requirements

### 4.1 Stage 1

- Replace **Planned checkout date** with **Actual checkout date**.
- Do not offer a future date.
- When a past date is selected, show an informational message that the action
  is being recorded as a historical checkout, not a future schedule.
- Require request source, checkout reason, and internal note for historical
  entries.
- Provide concise helper text below the exit-type selector:
  - **Early departure:** "Use when the resident left before the contractual
    checkout date. No late-checkout penalty applies."
  - **Contract term ended:** "Use when the resident left on or after the
    contractual checkout date. A late penalty applies only after the grace
    period."

### 4.2 Penalty experience

- If the actual date is early or within the grace period, show **No late
  penalty — Rp0**. Do not require a daily-rate input.
- If the actual date is late, show the default contract-snapshot daily rate,
  the number of charged days, and the calculated amount.
- If Admin changes a late case to `Rp0`, immediately require the waiver reason
  before the stage can be saved.
- A blank optional rate must not become a server error. The UI either sends no
  override or sends an explicit, valid `0`; both paths must be intentional and
  server-safe.

### 4.3 State labels and navigation

The Admin UI must render the compatible five-stage workflow for new
actual-checkout commands. Its second stage is **Checkout data confirmation**;
it must not be labelled as a future checkout plan. Completed historical
commands remain read-only and retain their audit history. Final settlement
therefore remains displayed as **Stage 5**.

## 5. API and persistence requirements

### 5.1 Command model

The API needs an actual-checkout creation path, or an equivalent extension of
the current create command, that:

1. accepts a historical actual date under the date rules above;
2. stores the actual checkout date as the authoritative physical-date proposal;
3. does not create a future checkout plan;
4. permits the handover stage to confirm evidence without replacing the saved
   actual date with `today`; and
5. retains idempotency, property scope, locking, audit snapshots, and the
   existing restart/cancel boundary before final settlement.

The existing `actual_checkout_date` must be used by the final settlement,
documents, reports, Owner projections, and occupancy history after the physical
handover is recorded.

### 5.2 Daily-rate constraint defect

The former validation mismatch was:

- the API DTO permits `late_checkout_daily_penalty_amount` to be omitted or
  equal to `0`; but
- the database constraint introduced by migration 088 currently requires the
  snapshot amount to be strictly greater than zero.

Therefore, the value `0` could pass request validation and then fail during the
database update as an internal server error. Migration `131` replaces the
strict `> 0` condition with a rule that permits a valid zero amount, while
service validation enforces a waiver reason when a late case is intentionally
reduced to zero.

The migration must be live-ledger numbered during deployment preflight, have a
manifest entry, preserve every existing checkout command, and be proven on a
disposable PostgreSQL database for apply, replay, and rollback.

### 5.3 Final-settlement treatment of lease corrections

A lease-data correction can reduce the contractual obligation by applying an
append-only invoice credit. That **contract correction credit is not cash**. It
must never be counted as a verified payment, a recognized rent credit, a
deposit, a refund source, or a balance that can absorb a checkout charge.

The final settlement calculation therefore uses these distinct values:

```text
cash rent credit = verified rent payments only
contract correction credit = price reduction only
recognized rent credit for checkout = cash rent credit

cash credit after earned rent = max(cash rent credit − earned rent, 0)
rent refund candidate = max(cash credit after earned rent − checkout charges, 0)
```

The existing correction credit remains visible as financial context but does
not participate in the arithmetic above. Deposit liability remains separate and
follows the existing deposit-offset and documented-damage rules.

For example, if the contract is corrected from `Rp5,700,000` to
`Rp1,900,000`, the resident paid `Rp1,900,000`, and the correction created an
invoice credit of `Rp3,800,000`, the resident has no cash overpayment. If a
late-checkout penalty is `Rp189,999`, the final result is an amount due of
`Rp189,999`, not a refund of `Rp3,610,001`.

When a lease has one or more contract corrections, the final-settlement UI must
show three clearly separated groups:

1. **Money received:** verified rent payments and deposit liability.
2. **Use and obligations:** earned rent, checkout charges, documented damage,
   deposit offsets, and outstanding amount.
3. **Contract correction context:** correction-credit amount and the statement:
   **"This is a contract-price
   adjustment, not money received and not a refund source."**

If there is no valid refund candidate, the UI shows either **No refund due** or
**Resident amount due**. It does not show an editable final-refund field
prefilled with `Rp0`.

If a valid refund candidate exists because cash received or a refundable
deposit exceeds the final obligations, Admin may choose a lower final refund
only with the existing mandatory reason and evidence. The sole exception is a
positive recommended refund deliberately closed at `Rp0`: Admin must explicitly
confirm that the resident agrees not to receive the refund. That consent is
stored with the final settlement and shown in checkout history; free-form
adjustment reason and evidence are optional only for this `Rp0` consent path. A
final refund must never exceed the system recommendation.

Open checkout commands recalculate against these rules whenever Admin requests
a settlement preview. Completed final settlements are immutable and are not
rewritten automatically; any historical correction uses the formal financial
correction authority.

## 6. Non-goals and boundaries

- It does not change the three-day grace period, daily-rate formula, maximum
  charged-day policy, or existing financial authorities.
- It does not create a new user role or grant Property Owners or residents
  mutation authority.
- It does not automatically close overdue leases or infer a historical exit
  date for an unreachable resident.
- It does not backfill, delete, or reinterpret legacy checkout history.

## 7. Acceptance scenarios

| Scenario                                                                                                                     | Expected result                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Resident physically left before the contractual checkout date.                                                               | Admin records a historical early departure; no late-penalty field is required; final penalty is `Rp0`.            |
| Resident left on the contractual checkout date.                                                                              | Admin records contract term ended; no late penalty before the grace boundary.                                     |
| Resident left after the grace boundary.                                                                                      | System calculates the penalty from the saved actual date and daily-rate snapshot.                                 |
| Admin waives a late penalty.                                                                                                 | A zero override is accepted only with a required waiver reason and an append-only audit event.                    |
| Admin enters `Rp0` while no penalty is applicable.                                                                           | The command saves successfully; no HTTP 500 occurs.                                                               |
| Admin enters a date before physical check-in.                                                                                | The API rejects the command with a domain validation error.                                                       |
| Admin enters a future date.                                                                                                  | The API rejects the command because checkout cannot begin before physical departure.                              |
| Admin records handover days after the resident left.                                                                         | The actual checkout date remains the saved historical date; it is not replaced by the handover-recording date.    |
| Lease correction reduces a three-month `Rp5,700,000` contract to one month `Rp1,900,000`; verified payment is `Rp1,900,000`. | The `Rp3,800,000` correction credit is contextual only. It cannot become a refund.                                |
| The corrected lease has a valid late charge of `Rp189,999`, no deposit, and no actual cash overpayment.                      | Final settlement shows `Rp189,999` as the resident amount due and no final-refund input.                          |
| Corrected lease has actual cash paid above earned rent, or a refundable deposit, after all charges.                          | The cash/deposit excess is a refund candidate. Admin may lower the proposed amount only with reason and evidence. |
| A positive refund candidate is closed at `Rp0` because the resident declines it.                                             | Admin must record explicit resident consent; the case closes without a refund payout, while reason/evidence are optional. |
| Open checkout command is previewed after this rule is released.                                                              | The preview uses the new correction-credit rule without a manual data rewrite.                                    |
| Completed final settlement was created under the old calculation.                                                            | It remains immutable; an authorized correction is required rather than automatic rewrite.                         |
| Existing checkout command is opened.                                                                                         | Its legacy lifecycle, documents, and audit history remain available without rewriting data.                       |

## 8. Required verification

The local implementation includes focused API regression tests for the former
`Rp0` server error, historical actual-date handling, and correction credit
being excluded from refund arithmetic. The release gate remains API and Admin
production builds, migration apply/replay proof, and interactive checks of
early, on-time, late, waived, historical, corrected, and genuinely overpaid
checkouts.
