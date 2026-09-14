# Handoff: resident checkout and final settlement

Status: **APPROVED TARGET — STAGE 3**

## Problem and outcome

Residents may leave at the planned end date, with notice, or suddenly. Admin
needs a discoverable workflow from resident detail that records the request,
protects the room lifecycle, calculates a transparent final position, and keeps
refunds, deductions, documents, reports, and Owner attribution auditable.

The repository already contains W07D/M5/M6 checkout authority and
`CheckoutPanel.tsx`. The implementation must connect and harden that authority,
not build a second legacy checkout system.

## Read first

- `docs/21-kost-management-ecosystem-overhaul/CONTEXT.md`
- `docs/adr/0002-checkout-and-final-settlement-lifecycle.md`
- `DOMAIN_LIFECYCLE_CONTRACTS.md`
- `BILLING_REMINDER_NOTIFICATION_REPORTING.md`
- `DATA_MODEL_AND_MIGRATION.md`
- `API_AND_INTEGRATION_CONTRACT.md`
- `QA_ACCEPTANCE_AND_RELEASE_GATES.md`
- `apps/admin/src/components/leases/CheckoutPanel.tsx`
- `apps/admin/src/components/leases/LeaseDetailPage.tsx`
- `apps/admin/src/components/residents/ResidentDetailWorkspace.tsx`
- `backend/api/src/modules/lease/lease-checkout.controller.ts`
- `backend/api/src/modules/lease/lease-checkout.service.ts`
- `backend/api/src/modules/lease/helpers/lease-exit-policy.helper.ts`

## Current implementation gaps

These are the known gaps at handoff time. Reconfirm them against current source
before editing; extend the existing checkout authority rather than replacing it:

- the checkout panel and command flow exist, but resident detail does not yet
  provide the complete discoverable action/label mapping defined below;
- the current final-settlement model cannot represent documented damage above
  the available Security Deposit as a separate amount due;
- `amount_due` is not yet closed through one explicit final-invoice allocation
  path that preserves the settlement snapshot;
- physical checkout completion and refund transfer already have separate
  records and may finish at different times; implementation must preserve this;
- room availability is resolved by the existing post-handover room inspection,
  so checkout must not introduce a second direct transition to `vacant`.

## Entry point and labels

Resident detail must derive the action from the current lease and open command:

| Condition                                | Label                          |
| ---------------------------------------- | ------------------------------ |
| Active lease, no open checkout           | `Mulai proses check-out`       |
| Open checkout                            | `Lanjutkan proses check-out`   |
| Physical complete, financial open        | `Lihat penyelesaian check-out` |
| Fully complete                           | `Lihat riwayat check-out`      |
| Awaiting activation                      | `Batalkan penyewaan`           |
| No active or historical checkout context | Hide the checkout action.      |

The action opens the full checkout route/panel, not a destructive one-click
mutation.

## Lifecycle authority

```text
notice_received
    → scheduled
    → inspection_required
    → settlement_pending
    → completed

notice_received, scheduled, inspection_required, or settlement_pending → cancelled
    → operational lease, occupancy, room, and eligible parking restored
    → Admin may start again from an empty first stage
```

Display labels are:

| Technical state       | User-facing label           |
| --------------------- | --------------------------- |
| `notice_received`     | Rencana check-out tersimpan |
| `scheduled`           | Check-out dijadwalkan       |
| `inspection_required` | Menunggu inspeksi kamar     |
| `settlement_pending`  | Menunggu penyelesaian akhir |
| `completed`           | Check-out selesai           |
| `cancelled`           | Check-out dibatalkan        |

Keep the existing financial authorities separate from the checkout command:

- final-settlement `decision_status`: `refund_pending`, `amount_due`, or `closed`;
- refund `refund_status`: `pending`, `settled`, `waived`, or `reversed`.

UI labels such as “Refund selesai” are derived from both records; they are not a
new checkout-command state. Writing off a balance is outside this feature unless
a separately approved financial-correction authority is added. Physical
completion and financial closure must never be collapsed into one boolean.

Checkout-command `completed` means the handover, inspection, and final-settlement
decision were recorded. It may coexist with an unpaid final invoice or a pending
refund. The UI may call the case fully closed only when `decision_status` is
`closed`, no refund remains pending, and no final-invoice balance remains. These
are derived read states, not additional freely editable database statuses.

## Request data and date rules

Admin records:

- type: `normal_expiry` or `resident_early_termination`;
- notice date, effective date, reason, source of request, and optional note;
- planned lease end snapshot;
- same-day exception explanation when applicable.

“Check-out mendadak” is an Admin-friendly label for early termination with the
effective date today and zero notice days; it is not a third database exit type.
Business dates use Asia/Jakarta. Effective date cannot precede notice date.
Normal expiry cannot be before the planned lease end. Early termination must be
before the planned end. Actual checkout date is the physical handover date and
cannot precede lease start.

For early termination, missing notice days are `max(0, 14 − notice days)`. Use
the anchored rental period and the lease snapshot monthly tariff to calculate a
daily rate and recommended short-notice compensation. Admin may reduce or waive
the recommendation only with a reason. Supporting evidence is optional, but when
supplied it remains attached to the audit trail. Approved short-notice
compensation belongs to the Property Owner as contractual compensation and does
not create an additional monthly management fee.

## Financial settlement

The server recalculates a quote whenever payment, evidence, handover, inspection,
or approval data changes. Pending/unverified payments must be resolved before
final approval.

```text
earned rent = service delivered through actual checkout,
               capped at contract value and calculated from the lease snapshot
rent position = verified rent credits − earned rent − approved notice compensation
rent refund   = max(rent position, 0)
rent due      = max(−rent position, 0)

explicit deposit offset  = min(approved rent offset, deposit liability, rent due)
deposit after rent       = deposit liability − explicit deposit offset
deposit damage deduction = min(documented damage, deposit after rent)
damage amount due        = max(documented damage − deposit after rent, 0)
refundable deposit       = deposit after rent − deposit damage deduction
total refund             = rent refund + refundable deposit
final amount due         = rent due − explicit deposit offset + damage amount due
net refund to resident   = max(total refund − final amount due, 0)
net due from resident    = max(final amount due − total refund, 0)
```

Security Deposit remains a liability and is never treated as rent income. In
accordance with `POL-DEPOSIT-010`, an approved rent-arrears offset is applied
first, then documented damage uses only the remaining deposit, so the same money
cannot be consumed twice. The offset is explicit and carries a reason/evidence
record. The settlement preserves every component even when the payable direction
is netted: positive net refund becomes `refund_pending`, positive net due becomes
`amount_due`, and zero becomes `closed`. Short-notice compensation is shown separately from
regular rent and management fee; it does not silently add another monthly fee.

The existing final-settlement authority does not currently represent damage
above deposit as its own amount. Stage 3 must add that explicit component rather
than hiding the excess inside a note or changing rent due.

If money remains due, issue a final invoice through the authoritative billing
flow and keep limited resident access to the balance and evidence. Verified
allocation to that invoice closes the amount-due status; editing the checkout
snapshot cannot close it. If a refund is due, create it as pending with a due
date no later than seven working days after settlement. Until a holiday calendar
exists, a working day is Monday–Friday in Asia/Jakarta. A refund becomes settled
only after Admin records transfer method, reference, timestamp, and evidence.

## Handover and inspection

Handover records cover returned keys/access, inventory, parking/vehicles,
utilities, actual handover time, and room condition. The operational upload
groups for short notice, compensation adjustment, keys/access, inventory, and
inspection are optional; required structured confirmations and reasons remain
authoritative. Financial disbursement, deposit-offset, refund-adjustment, and
damage-deduction evidence remain mandatory. At handover, end occupancy
and resident physical access and set the room to `inspection_required`. Checkout
inspection records whether further review or maintenance is required. The
existing room-inspection resolution then moves a passed room to `vacant` or a
failed room to `maintenance`. The checkout command must not write `vacant`
directly, and notice alone never changes occupancy.

Damage entries require type, amount, note, evidence, responsible funding party,
and actor. Damage recovery is not rent or management-fee income. Open complaints,
work orders, and expenses remain linked and are not silently closed.

## Resident, Owner, and report behavior

- Resident access to final bills, payment evidence, documents, and refund status
  may remain limited until financial status is closed.
- Vehicles, parking, access, and occupancy are reconciled at physical handover.
- Owner views preserve the original contract and show actual checkout date,
  earned rent, short-notice compensation, fee through checkout, final Owner
  entitlement, refund/amount due status, and room result. Private reasons stay
  hidden from Owner.
- Admin reports filter by exit type, operational status, financial status, date,
  refund, amount due, damage, and same-day departure.
- Historical documents and final settlements are append-only. A completed
  check-out never silently revives a closed lease.

Admin may use “Batalkan & mulai ulang” before the final settlement is issued,
including after handover or inspection. The previous command and its audit
records remain stored, while the active lease, occupancy, room, and eligible
parking assignment are restored before a new empty process begins. No supervisor
approval is part of this operating model. Once the command is `completed`, its
financial decision and documents remain immutable and the restart action is no
longer available. For abandonment or an unreachable resident, Admin uses early
termination; the actual checkout date is the documented date possession was
recovered, not an unsupported backdate.

## Documents and notifications

Required official documents are the existing immutable handover report, final
settlement document, and—after transfer—refund receipt. Notice and inspection
remain structured evidence unless a later requirement authorizes another formal
document. An outstanding amount uses the existing invoice authority. A refund
receipt must never say “paid” before transfer is recorded. Notify resident/parent
for notice, schedule, handover due, final bill, refund approval, refund
settlement, and completion through the existing manual/outbox authority.

## API, security, and migration requirements

- Only an in-scope Admin with the appropriate lease/billing permissions can
  mutate checkout or approve final settlement.
- Use property scope, row locks, idempotency keys, audit before/after snapshots,
  and safe replay responses.
- Enforce one open checkout per lease and reject terminal-state mutations except
  through the formal correction path.
- Reuse existing W07D/M5/M6 tables and migrations where valid. Additive schema
  changes require live-ledger numbering and disposable apply/replay/rollback
  proof; never backfill checkout commands for historical closures automatically.

## Edge-case decision matrix

| Scenario                             | Required result                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Same-day departure                   | Early termination, zero notice days, mandatory exception reason, optional supporting evidence, and recommended 14-day compensation. |
| Resident cannot be contacted         | Admin records possession recovery evidence; no guessed historical checkout date.                                                    |
| Payment arrives while quote is open  | Invalidate and recalculate the preview before final approval.                                                                       |
| Damage exceeds deposit               | Consume available deposit as damage deduction; excess becomes explicit damage amount due.                                           |
| Rent and deposit are both refundable | Preserve two refund components and one transfer total.                                                                              |
| Amount due after handover            | Room lifecycle may continue after inspection; limited resident finance access stays active.                                         |
| Open vehicle or parking record       | Release resident parking/access at handover and retain history.                                                                     |
| Open complaint or work order         | Keep it open and linked; checkout does not mark operational work complete.                                                          |
| Ownership changes mid-contract       | Attribute earned service and compensation using effective ownership scope; preserve both owners' history.                           |
| Duplicate or concurrent command      | Lock the lease and replay the first idempotent result or return a safe conflict.                                                    |
| Resident has another active lease    | Scope every action to the selected lease; do not deactivate unrelated access.                                                       |

## Required RED and acceptance evidence

Before implementation, tests must fail for:

- action labels and entrypoint state mapping from resident detail;
- normal expiry, 14-day early termination, and same-day departure;
- invalid dates, missing exception reason, and duplicate open checkout;
- daily proration and short-notice calculation from a standard and negotiated
  tariff snapshot;
- unpaid balance, prepaid rent refund, no deposit, rent offset before damage,
  damage above remaining deposit, and no double consumption of deposit;
- simultaneous refundable credit and amount-due components net to one payable
  direction while preserving all component lines;
- handover/inspection room transitions and vehicle/access release;
- pending refund versus settled refund document wording;
- final invoice allocation closes amount due without rewriting the settlement;
- Owner/report preservation and property-scope authorization;
- idempotent retries, rollback, and terminal-state rejection.

Stage 3 is complete only when a reviewer can trace one checkout from resident
detail through API command, room/occupancy state, final settlement, documents,
Owner/report projection, and audit evidence without a second competing authority.
