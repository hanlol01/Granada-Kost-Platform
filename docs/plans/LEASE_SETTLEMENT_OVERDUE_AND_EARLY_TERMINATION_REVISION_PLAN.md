# Lease Settlement, Overdue, and Early-Termination Revision Plan

Status: **BUSINESS FLOW BASELINE AGREED — NOT IMPLEMENTED**

## 1. Purpose

This document records the agreed target business flow for lease activation,
contract-payment checkpoints, overdue handling, early termination, room
inspection, refund, payment history, and resident/room status history.

It is a planning and acceptance document only. It does not change the current
database, API, scheduled jobs, UI, balances, or historical payment records.
Where current source behaviour differs from this plan, this plan is the target
for a separately approved implementation.

## 2. Core Terms

| Term | Canonical meaning |
| --- | --- |
| Lease term | The agreed occupancy period for one lease, calculated from the planned/actual start date using calendar months. |
| Payment period | One monthly interval anchored to the lease activation date, not to a calendar month name. For example, an activation on 28 August creates a first period from 28 August to 27 September. |
| Initial rent payment | Verified rent credit of at least one monthly room rate, required before automatic activation. It covers the first payment period. |
| Checkpoint | A date at which the cumulative verified rent credit must meet a defined minimum. Before the final checkpoint, additional rent may be paid in instalments. |
| Final settlement checkpoint | The final checkpoint at which the entire remaining contractual rent balance must be paid in full. Partial payment is no longer permitted. |
| Checkpoint shortfall | The amount by which cumulative verified rent credit is below the checkpoint minimum. It is a positive outstanding amount, not a negative payment. |
| Overdue | A payment status reached when a required checkpoint amount is not met at its due time. Overdue does not automatically check out a resident or release a room. |
| Grace period | The limited period after a due date in which a resident may cure an overdue amount before normal admin escalation. The payment remains recorded as late. |
| Admin action required | A status indicating that the grace period has ended and an authorised admin must decide whether to grant an extension, accept a resolution, or start termination. |
| Early termination | An approved, auditable process to end an active lease before its contractual end date. It is distinct from a pre-activation cancellation and from a normal scheduled check-out. |
| Final settlement | The calculation of rent credits, rent used, arrears, approved charges, security-deposit deductions, and any net refund or amount due at the end of a lease. |

## 3. Policy Decisions

### 3.1 Calendar and money rules

- All dates use the Asia/Jakarta time zone.
- Deadlines are calendar-month anniversaries and end at `23:59:59.999 WIB` on
  the due date.
- The recurring payment cycle follows the activation/start date. It must never
  be described merely as "September rent" or "October rent" when the actual
  period begins on another day.
- A verified payment and its allocation are the financial authority. A payment
  proof upload alone does not satisfy a checkpoint.
- Rent credit, security deposit, Booking Fee, DP, payment allocation, reversal,
  and refund remain distinct financial concepts. Historical payment records are
  append-only; corrections use recorded reversal/refund/adjustment operations.

### 3.2 Initial payment and activation

- A new lease may enter `awaiting_activation` only after the required
  onboarding/lease data is valid and at least one full monthly room rate has
  been verified as rent credit.
- On the planned start date, the system should automatically activate the lease
  and make its assigned room unavailable to another lease only when all of the
  following are true:
  - the initial monthly rent requirement is verified;
  - resident, lease, room, and booking data remain valid;
  - the booking/lease has not been cancelled or refunded;
  - the room has no conflicting occupancy or lifecycle state.
- Automatic activation must be idempotent, auditable, and recoverable by a
  reconciler. An authorised admin retains a manual exception path.
- A failed automatic activation must not silently create a conflicting room
  occupancy. It becomes an actionable exception for an admin.
- Lease activation does not claim physical arrival. Until check-in is confirmed,
  the room uses `awaiting_check_in` and remains unavailable; the authoritative
  physical occupancy begins only through the confirmed check-in path.

### 3.3 Checkpoint and final-settlement schedule

The initial verified payment covers payment period 1. Before the final
checkpoint, the resident may make several payments; compliance is determined by
the cumulative verified rent credit, not by a single transaction amount.

| Lease duration | Interim checkpoint(s) | Final settlement checkpoint | Final-payment rule |
| --- | --- | --- | --- |
| Exactly 3 calendar months | End of payment period 1: cumulative rent credit must cover periods 1 and 2. | End of payment period 2, namely activation + 2 calendar months. | The complete remaining balance for period 3 must be paid in one final settlement. |
| 6 or 12 calendar months | End of payment period 1 and period 2: cumulative rent credit must cover each elapsed period. | End of payment period 3, namely activation + 3 calendar months. | The complete remaining contractual rent balance must be paid in one final settlement. |

Examples for a monthly rate of Rp1.800.000 and activation on 28 August 2026:

| Contract | Initial verified rent | 28 September | 28 October | 28 November |
| --- | ---: | ---: | ---: | ---: |
| 3 months; total Rp5.400.000 | Rp1.800.000 | Minimum cumulative credit Rp3.600.000 | Final settlement: all remaining balance must be Rp0 | Not applicable; term boundary has been reached. |
| 6 months; total Rp10.800.000 | Rp1.800.000 | Minimum cumulative credit Rp3.600.000 | Minimum cumulative credit Rp5.400.000 | Final settlement: remaining balance Rp5.400.000 must be paid in full. |

For a 6-month example, a resident may pay Rp1.000.000 toward the second period
before its checkpoint, but remains short by Rp800.000 until the cumulative
credit reaches Rp3.600.000. The resident is not compliant merely because a
payment exists.

### 3.4 Final-settlement payment behaviour

- Before the final settlement checkpoint, the ordinary rent-payment UI may
  accept instalments and display the live checkpoint shortfall.
- At the final settlement checkpoint, the UI changes to **Catat Pelunasan
  Akhir** and displays the current outstanding contractual balance.
- The final-settlement amount is locked to the authoritative outstanding
  balance. A lower amount is rejected. An amount exceeding the balance is also
  rejected.
- The backend enforces the exact-settlement rule even if a client modifies its
  UI or sends a direct request.
- If a reversal or approved adjustment changes the outstanding balance before
  payment finalisation, the displayed locked amount must be recalculated before
  the command is accepted.
- During any grace period after the final checkpoint, only full settlement is
  accepted; a new instalment cannot cure the final-settlement rule.

## 4. Overdue and Tolerance Policy

### 4.1 Status progression

| Time | Status | Meaning and allowed outcome |
| --- | --- | --- |
| Before a checkpoint due time | `checkpoint_pending` or `checkpoint_met` | Instalments remain allowed until the cumulative checkpoint requirement is met. |
| From the first moment after a missed checkpoint | `overdue_checkpoint` | The checkpoint shortfall is visible; the resident may cure it during the grace period. |
| Day 1 through day 3 after due date | `overdue_grace` | Payment is late but may cure the required amount. For a final checkpoint, cure requires the full outstanding balance. |
| From day 4 through day 7 | `admin_action_required` | An admin must contact/review the resident and decide an approved path. |
| After day 7 without a resolution | `termination_eligible` | An authorised admin may start, but never automatically finalise, a termination case. |

The working default is a three-calendar-day grace period and escalation to an
admin after it ends. The initial due date is not moved by grace: payment after
the due time remains late in the timeline and audit history.

### 4.2 Partial-payment cases

#### No payment at a regular checkpoint

If a monthly rate is Rp1.800.000 and no additional payment has been verified by
the second-period checkpoint, the shortfall is Rp1.800.000. The lease may
remain physically active during grace and manual review, but the resident is
overdue. The balance does not disappear, and the room is not automatically
released.

#### Partial payment at a regular checkpoint

If Rp1.000.000 has been verified against a Rp1.800.000 checkpoint requirement,
the shortfall is Rp800.000. The payment remains allocated and visible. The
resident is still overdue until the Rp800.000 shortfall is cured.

Daily rent may be shown for proration and final-settlement information, but it
must not hide or postpone the overdue status until a partial payment is
"consumed". Checkpoint compliance is based on cumulative required rent credit.

#### Missed final settlement checkpoint

At a final settlement checkpoint, a resident with any remaining contractual
balance is overdue. During grace, the only normal resolution is one full payment
of that balance. After grace, admin review is required; an automatic check-out,
room release, or cancellation is prohibited.

### 4.3 Admin decision boundary

An overdue state is a financial and workflow signal, not an automatic eviction.
After escalation, an authorised admin may:

- record contact and a documented commitment to pay;
- grant an authorised, audited extension where the policy permits it;
- accept the applicable full cure payment;
- approve a resident-requested early termination; or
- start a termination case for arrears.

Starting a termination case does not end occupancy, release a room, erase a
debt, or create a refund. Those effects occur only after a separately approved
check-out and final settlement.

## 5. Early Termination, Inspection, and Refund

### 5.1 Distinguish the three exit paths

| Path | When it applies | Authority |
| --- | --- | --- |
| Pre-activation cancellation/refund | Lease has not started and resident remains `awaiting_activation`. | Existing authorised cancellation/refund flow. |
| Normal check-out | Lease reaches its agreed end date or follows an approved ordinary notice path. | Authorised admin confirmation. |
| Early termination | Active lease ends before its agreed end date, including voluntary resident requests or arrears cases. | Authorised admin decision and finalisation. |

An active resident's request to leave, including one who is overdue, opens an
early-termination review. It does not itself erase arrears, refund prior rent,
or check out the resident.

The pre-activation cancellation path is deliberately narrower than active-lease
termination:

- it is available only while the payment phase is Booking Fee/DP and the
  resident/lease remains `awaiting_activation`;
- it is not available after the initial payment has reached `Lunas`, nor after
  room activation or an active lease;
- when eligible and approved, all verified initial payments, including security
  deposit where collected, are refunded in full through recorded reversals or
  refunds; and
- the booking/lease outcome is recorded as cancelled, preserving its payment
  and audit history.

### 5.2 Financial calculation

The system presents an authoritative recommendation using separate components:

```text
rent credit available
  = verified rent payments and valid rent credits
  - rent already earned/used through the approved check-out date
  - arrears and approved early-termination/notice charges

deposit refundable balance
  = security deposit liability
  - approved evidence-backed damage, inventory, utility, and other
    contractually permitted deductions

recommended net refund
  = refundable rent credit + refundable deposit balance
```

If the result is below zero, the case shows **amount still due**, not a negative
refund. Security deposit stays a separate liability throughout the calculation.
It may offset rent arrears only where the contract and approved policy allow it.

For a resident who has paid Rp1.000.000 toward the second period, that payment
is a rent credit. At early termination, only the unused/eligible part may become
refundable, after rent used, arrears, approved termination charges, and other
authorised offsets are calculated.

### 5.3 Inspection and evidence

Before refund approval, the admin must be able to record a room inspection with:

- room and inventory condition;
- itemised damage or loss;
- utility/meter readings and unpaid usage where applicable;
- repair/replacement amount for each deduction;
- photos or other supporting evidence;
- inspection date, inspector, notes, and any resident acknowledgement or
  objection.

The room remains in an inspection-required/maintenance-compatible state until
the physical check-out and inspection outcome are confirmed. It must not become
available simply because a termination case was opened.

### 5.4 Recommended refund and controlled admin adjustment

- The system displays a non-editable **recommended refund** with an itemised
  calculation.
- An authorised admin may set a different **final refund amount** only through
  an explicit adjustment field.
- The adjustment requires a reason, actor, timestamp, and supporting evidence
  when applicable.
- The final amount cannot exceed the refundable balance available from the
  authoritative calculation. A deficit remains an amount due.
- Payment/refund records are immutable. A completed refund is corrected through
  a recorded reversal or follow-up adjustment, never by editing or deleting the
  original transaction.

#### Current approval model: single authorised Admin

For the current organisation, one authorised Admin may make the final refund
decision. A second approver is **not** required and must not block operational
refunds at this stage.

The single-Admin path still requires these safeguards:

- final settlement calculation and completed room inspection before approval;
- an explicit confirmation step before the refund decision is committed;
- mandatory reason for every adjustment from the system recommendation;
- itemised deduction/evidence records where a deduction applies;
- immutable audit data for recommendation, final amount, actor, timestamp,
  reason, and supporting references; and
- server rejection when the final refund exceeds the available refundable
  balance.

A future maker-checker/dual-approval policy may be added when the organisation
has a defined finance or management structure. It is a future extension, not a
current workflow requirement.

Recommended lifecycle:

```text
termination requested
  -> admin review
  -> termination approved
  -> physical check-out confirmed
  -> lease/occupancy ended and room set to inspection_required
  -> room inspection completed
  -> final settlement calculated
  -> refund/amount-due approved
  -> refund paid or receivable resolved
  -> financial exit case closed
```

Refund payment or debt collection does not keep a physically checked-out
resident occupying the room. Room availability remains governed by inspection
and maintenance resolution, while unresolved refund/receivable work remains a
separate financial case.

### 5.5 Normal expiry, physical check-out, and overstay

Reaching the contractual end date does not by itself prove that the resident
has physically returned the room. The system therefore separates contract
expiry, physical check-out, room handover, inspection, and financial closure.

- H-30, H-14, H-7, and H-1 before the planned end date, Admin and Penghuni are
  reminded to choose an approved renewal or schedule normal check-out.
- A renewal is a new period/policy version as defined in section 12.7. There is
  no silent or automatic renewal.
- If physical check-out is confirmed on or before the end date, the lease and
  occupancy end, the room becomes `inspection_required`, and the normal
  inspection, final-settlement, and document flow continues.
- If the end date passes without a confirmed check-out or approved renewal, the
  case becomes `lease_expired_admin_action_required` / **Masa Sewa Berakhir —
  Tindakan Admin**. The room remains occupied/unavailable and must not be
  released automatically.
- Admin must resolve that case by confirming a late check-out, approving a
  properly versioned renewal/successor agreement, or initiating the applicable
  termination process. None of those outcomes is inferred merely from elapsed
  time.
- Use of the room after the contractual end date is recorded as overstay. The
  recommended occupancy charge uses the same lease-anchored daily-rate method
  defined in section 11.2, from the day after the end date through the confirmed
  physical check-out or start of an approved successor agreement.
- An overstay charge is an itemised amount due; it must not silently consume the
  security deposit. Any permitted deposit offset remains an explicit,
  evidence-backed final-settlement decision.
- Check-out and room lifecycle can close before refund payment or debt
  collection closes, preserving the separation between physical and financial
  completion.

## 6. Read Models and UI Requirements

### 6.1 Payment history

The payment page and resident/lease detail must provide a safe, chronological
history for the relevant property and authorised viewer. Each entry should show:

- payment, reversal, adjustment, refund, or deposit transaction type;
- purpose and allocation target (initial rent, checkpoint, final settlement,
  deposit, refund, or other approved purpose);
- original amount, allocated amount, and resulting relevant balance;
- verification/payment/status timestamps;
- late/overdue relationship where applicable;
- actor/source and safe audit reference;
- reversal/refund relationship without mutating the original record.

The resident view must distinguish at least:

- total contractual rent;
- verified rent credit;
- next checkpoint requirement and shortfall;
- final settlement balance when applicable;
- security deposit balance; and
- final refund recommendation or remaining amount due during an exit case.

### 6.2 Resident, lease, occupancy, and room status timeline

Every resident room workspace must expose a read-only, safe timeline. It must
not substitute for the authority records, but it must explain relevant state
changes and their causes.

Relevant statuses include:

```text
booking/onboarding
awaiting_activation
activation_attention_required
active / awaiting_check_in / check_in_confirmation_required
checkpoint_pending / checkpoint_met
overdue_checkpoint / overdue_grace
extension_active / admin_action_required / termination_eligible
termination_requested / termination_pending
checked_out / terminated
inspection_required / maintenance / available
inspection_objection_pending / refund_pending / amount_due / financial_case_closed
```

The timeline and current cards must identify the affected resident, lease,
occupancy, room, effective date/time, initiating actor (system or authorised
admin), reason, and safe linked financial event where relevant. The data must
remain property-scoped and not expose raw sensitive evidence to unauthorised
users.

### 6.3 Room-status synchronisation

- `awaiting_activation` does not mean the room is occupied.
- Successful lease activation changes the assigned room to
  `awaiting_check_in` and keeps it unavailable; it does not assert physical
  occupancy.
- Confirmed physical check-in creates the authoritative occupancy and changes
  the room through its lifecycle to occupied.
- `overdue` changes payment/lease workflow status; it does not make the room
  vacant or automatically remove the resident.
- A termination request/pending case does not release the room.
- Only confirmed physical check-out and inspection lifecycle resolution may make
  the room available for a new occupancy.

### 6.4 Required page synchronisation matrix

Every page below consumes derived data from the same authoritative lease,
occupancy, room-lifecycle, verified-payment/allocation, deposit, and
termination records. A page must never maintain its own competing status or
balance calculation.

| Surface | Required synchronised information | Update trigger |
| --- | --- | --- |
| Admin payment page | Immutable payment/refund/reversal history, allocation, checkpoint shortfall, final settlement balance, verification and late-payment status. | Verified payment, allocation, reversal, refund, checkpoint/deadline projection. |
| Admin tenant list and tenant detail | Current lease/occupancy state, next checkpoint, shortfall, overdue/grace/admin-action stage, final-settlement action, termination/refund case, and chronological history. | Activation, payment projection, grace/escalation boundary, admin decision, check-out/finalisation. |
| Admin booking-lead list and detail | Pre-activation payment phase, `awaiting_activation` outcome, eligible cancellation/refund action, cancelled outcome, and the handoff to tenant/lease after activation. | Booking payment verification, onboarding completion, cancellation/refund, activation. |
| Admin room list and room detail | Occupancy/availability state, linked resident/lease, inspection/maintenance state, and read-only room lifecycle history. An overdue badge may be shown, but overdue alone cannot release the room. | Activation, approved check-out, inspection outcome, maintenance resolution, room lifecycle command. |
| Admin dashboard and notifications | Counts and actionable queues for upcoming checkpoints, overdue grace, admin action required, termination pending, inspection pending, and refund pending. | The same authoritative status projection; no dashboard-only state. |
| Penghuni payment and lease pages | Only the authenticated resident's payment history, current checkpoint requirement, final settlement amount, due/tolerance message, termination request status, and safe refund result. | The same scoped payment/lease projections used by Admin. |
| Property Owner portal | Read-only, effective-ownership-scoped room/occupancy status and safe payment-health/financial summary for the Owner's assigned property, building, or room. | The same authoritative projections, filtered by effective ownership period and privacy policy. |

Implementation must invalidate or refresh all affected projections after every
authoritative mutation. For example, a verified payment that cures a checkpoint
must update the payment page, tenant detail/list, room-linked resident view,
dashboard counts, notifications, and resident self-service view consistently.

### 6.5 Property Owner access boundary

This revision also affects the Property Owner portal, but it does not turn an
Owner into an operational administrator. The portal must remain read-only and
effective-period scoped.

- An Owner may see only rooms/property scope that the Owner is authorised to
  view for the relevant effective ownership period.
- Owner-facing views may show safe operational and financial-health summaries:
  room occupancy/availability, lease period, inspection/maintenance outcome,
  current checkpoint/final-settlement stage, and an appropriate aggregate or
  authorised owner-earning view.
- An Owner must not record/verify/reverse payments, set payment allocations,
  grant extensions, activate a lease, terminate a lease, approve a check-out,
  enter inspection deductions, or approve/pay a refund.
- Tenant contact data, payment-proof files, raw audit payloads, refund banking
  details, security-deposit evidence, and any other sensitive personal data are
  excluded unless a separate explicit privacy/role decision authorises a
  narrowly scoped field.
- Historic payment/occupancy information must not leak to a later or former
  Owner outside the Owner's authorised effective period.

### 6.6 Admin Activity Log

The Admin application requires a dedicated, read-only **Log Aktivitas** page.
Entity timelines remain useful in tenant, payment, and room detail pages, but
they do not replace one cross-module operational log.

The log is an audit projection, not a workflow that can edit or replay events.
It must be property-scoped and must contain at least:

| Field | Requirement |
| --- | --- |
| Time | Authoritative event time in Asia/Jakarta, with a stable event/reference ID. |
| Actor | `Admin`, `System`, or another authorised source; show the safe actor name/account when available. |
| Action | Human-readable action and canonical event type, for example payment verified, checkpoint overdue, activation completed, termination requested, inspection recorded, refund adjusted, or room released. |
| Target | Safe links/identifiers for the property, room, resident, lease, payment, refund, or termination case affected. |
| Result | Succeeded, rejected, failed, or pending, including a safe reason/error summary where applicable. |
| Change summary | Readable before/after status or amount summary; raw payloads are not rendered by default. |
| Reason/evidence | Required administrative reason and safe evidence reference for actions such as extensions, termination, inspection deductions, refund adjustments, reversals, and room lifecycle exceptions. |

Required filters are date range, property, actor, module/category, action,
result, room, resident, lease, and payment/refund reference. The default order
is newest first, with pagination and a safe detail drawer/page for one event.

The log must include, at minimum:

- booking-lead, onboarding, cancellation, and refund events;
- automatic/manual activation and occupancy/room-lifecycle changes;
- payment creation, verification, allocation, reversal, checkpoint and overdue
  transitions, extension, and final settlement events;
- termination request/decision, check-out, inspection, deposit deduction,
  refund recommendation, adjustment, approval, and payment events; and
- authorisation failures or rejected idempotent/conflicting commands where a
  safe audit record is appropriate.

Raw bank details, payment-proof files, sensitive inspection media, passwords,
tokens, and unrestricted audit payloads must never be shown in the activity-log
list. Access follows Admin property scope; Property Owner and Penghuni do not
receive this cross-entity administrative log. A future export feature, if
approved, must preserve the same scope and privacy redaction rules.

### 6.7 Payment, settlement-stage, and resident-status filters

The current resident table must not mix three different concepts in one
dropdown. They are separate dimensions with separate authoritative values:

#### A. Status Pembayaran

This describes the net financial state of payment records and does not describe
the lease lifecycle:

- `Belum Ada Pembayaran`;
- `Menunggu Verifikasi` (manual WhatsApp/bank evidence is recorded but not yet
  verified);
- `Booking Fee`;
- `DP / Uang Muka`;
- `Pembayaran Awal 1 Bulan`;
- `Bayar Sebagian`;
- `Lunas`;
- `Dibatalkan / Direfund`; and
- `Ada Saldo Tunggakan` where an approved financial balance remains due.

The historical fact that a payment was received must not disappear just because
its net amount later becomes zero after refund. For example, LUTFI's refunded
pre-activation payment must not be displayed as merely `Belum Ada Pembayaran`.
When the archived record is opened, it should show `Dibatalkan / Direfund`, the
original amount and receipt, the refund amount/document, and the resulting net
balance.

#### B. Tahap Pelunasan

This describes the lease settlement workflow and is the source for the
**Semua tahap pelunasan** dropdown:

- `Tidak Ada Penyewaan`;
- `Menunggu Aktivasi`;
- `Checkpoint 1`;
- `Checkpoint 1 Terpenuhi`;
- `Checkpoint 2` (only for 6- or 12-month contracts);
- `Checkpoint 2 Terpenuhi` (only for 6- or 12-month contracts);
- `Pelunasan Akhir`;
- `Tunggakan Checkpoint`;
- `Masa Toleransi`;
- `Perpanjangan Aktif`;
- `Tindakan Admin Diperlukan`;
- `Dalam Proses Pemberhentian`;
- `Lunas`; and
- `Dibatalkan Pra-Aktivasi` for a cancelled/refunded booking with no active
  lease.

The API uses stable enum values; the Indonesian labels are presentation only.
For each record, one effective stage is selected using an explicit precedence
rule so that `Lunas`, `Tunggakan`, and `Dalam Proses Pemberhentian` cannot appear
simultaneously as competing primary stages.

The effective **Tahap Pelunasan** precedence, from highest to lowest, is:

1. `Dibatalkan Pra-Aktivasi` when the pre-activation cancellation is final;
2. `Dalam Proses Pemberhentian` while an explicit termination case remains open;
3. `Lunas` when verified net allocation leaves no contract balance and no open
   termination case requires resolution;
4. `Tindakan Admin Diperlukan` after escalation/termination eligibility;
5. `Perpanjangan Aktif` while the one authorised extension is operative;
6. `Masa Toleransi` during the ordinary overdue grace window;
7. `Tunggakan Checkpoint` after the authoritative checkpoint/final due time;
8. `Pelunasan Akhir` when exact final settlement is currently required;
9. the applicable `Checkpoint 2` or `Checkpoint 2 Terpenuhi` state;
10. the applicable `Checkpoint 1` or `Checkpoint 1 Terpenuhi` state;
11. `Menunggu Aktivasi`; and
12. `Tidak Ada Penyewaan`.

`Masa Sewa Berakhir — Tindakan Admin` is a lease/occupancy exception badge, not
a payment-stage replacement. It may appear beside the effective settlement
stage so a financially `Lunas` resident who has not returned the room is not
misrepresented as operationally complete. Any new verified payment, reversal,
extension, termination decision, or check-out confirmation causes the server to
recompute these projections rather than letting the client choose a label.

#### C. Status Penghuni and archive visibility

This describes the resident/record lifecycle, independently of payment:

- `Aktif`;
- `Menunggu Aktivasi`;
- `Nonaktif`;
- `Draf`; and
- `Diarsipkan`.

The meanings are deliberately distinct:

- `Nonaktif` is a former resident whose authoritative tenancy has ended through
  normal check-out or approved termination;
- `Draf` is an incomplete, non-authoritative onboarding/resident record; and
- `Diarsipkan` is a retained historical record hidden from normal operations,
  including a cancelled/refunded pre-activation record.

An expired lease without confirmed physical check-out remains operationally
active with the exception `lease_expired_admin_action_required`; it must not be
changed to `Nonaktif` or `Diarsipkan` merely because its end date passed.

An eligible pre-activation cancellation/refund such as LUTFI is retained for
history but moves to `Diarsipkan` with reason `Dibatalkan Pra-Aktivasi`. Its
booking, lease, payment, refund, receipt, and audit history remain queryable.

Default operational lists and dashboard counts exclude `Nonaktif`, `Draf`, and
`Diarsipkan` records, while retaining current `Aktif` and `Menunggu Aktivasi`
records. Selecting one or more explicit resident-status filters reveals the
corresponding inactive/draft/archived records.

Archive behaviour is consistent across booking-lead, tenant, payment, and room
detail views:

- archived data is never physically deleted;
- archived data is not shown merely because a broad search term matches it;
- an explicit status filter is required to reveal it;
- the archived detail shows why it was archived, who/what caused it, and when;
- no active-room occupancy is inferred from an archived cancelled record; and
- restoring or reactivating an archived record is not an implicit side effect
  of opening it. A new approved booking/lease flow is required.

#### D. Resident-table presentation

The table keeps three separate columns:

| Column | Source meaning |
| --- | --- |
| Status Pembayaran | Current net payment state plus safe indication of historic refund/reversal. |
| Tahap Pelunasan | One effective checkpoint/overdue/final-settlement stage for the lease. |
| Status Penghuni | Resident/record lifecycle and archive state. |

For LUTFI, the archived view should therefore show a refunded/reversed payment
state, `Dibatalkan Pra-Aktivasi` settlement stage, and `Diarsipkan` resident
status—not `Belum Ada Pembayaran`, `Belum Ada Penyewaan`, and `Nonaktif` without
the cancellation/refund explanation.

## 7. Authority, Integrity, and Non-Regression Requirements

- All mutations are property-scoped, authorised, transactional, idempotent,
  auditable, and event/outbox-compatible.
- Payment allocation and final settlement are calculated on the server from
  authoritative verified transactions. The client never supplies an
  authoritative balance or final-payment amount.
- No workflow may edit/delete historical payments, allocations, deposits,
  refunds, occupancy, or lease history to achieve a result.
- Concurrent payment, activation, termination, refund, and room-lifecycle
  commands must not create double activation, double refund, over-allocation,
  conflicting occupancy, or an unavailable audit trail.
- The existing pre-activation cancellation/refund rule remains distinct from
  active-lease early termination.
- Deposit must not silently become rent revenue. Any allowable offset must be
  explicit, traceable, and comply with the approved contract/policy.
- Existing historical leases must be migrated or projected deliberately; they
  must not be reinterpreted silently under the new checkpoint rules.

## 8. Current-to-Target Gap

Current contract-settlement source uses a fixed two-calendar-month final
deadline after activation and contains existing partial-payment/extension
behaviour. The target policy in this document replaces that fixed rule with a
duration-sensitive final checkpoint:

- exactly 3 months: activation + 2 months;
- exactly 6 or 12 months: activation + 3 months.

Therefore implementation requires a reviewed change across the settlement
projection, payment eligibility, overdue/extension/termination policy,
activation scheduling, API contracts, Admin UI, resident UI, database schema or
history model where required, and focused automated coverage. Historical plan
documents remain historical evidence and must not be rewritten to claim that
this target has already been delivered.

## 9. Implementation Work Packages (Future)

1. **Domain and schema design**: settle canonical fields/events for checkpoint
   schedule, grace/escalation, inspection evidence, final settlement, refund
   recommendation, and admin adjustment.
2. **Billing authority**: implement duration-sensitive checkpoint calculation,
   exact final settlement validation, and safe overdue projections.
3. **Activation automation**: implement scheduled, idempotent activation and
   reconciliation with manual exception handling.
4. **Termination and inspection**: implement the authorised request, decision,
   check-out, inspection, finalisation, deposit, refund, and amount-due flow.
5. **Read models and UI**: update payment history, resident/lease detail,
   resident room status, room status, actionable admin controls, and timelines.
6. **Tests and rollout**: cover date boundaries, partial payments, final-payment
   rejection, tolerances, extensions, termination/refund calculations,
   concurrency, idempotency, audit/outbox, property scope, and historical-data
   rollout.

## 10. Acceptance Scenarios

The future implementation is acceptable only when these examples are true:

1. A 3-month lease activated on 28 August requires final full settlement by 28
   October, end of day WIB.
2. A 6-month lease activated on 28 August requires ordinary cumulative
   checkpoint coverage on 28 September and 28 October, then final full
   settlement by 28 November, end of day WIB.
3. A resident with Rp1.000.000 verified against a Rp1.800.000 checkpoint is
   visibly overdue by Rp800.000 after the due time, even if the resident remains
   in the room during grace/admin review.
4. A payment lower than the final outstanding balance is rejected at a final
   settlement checkpoint by the server.
5. An overdue resident is never checked out or removed from the room solely by
   a scheduled job or status projection.
6. A resident-requested early termination creates a review case; it does not
   delete payments or automatically issue a refund.
7. Inspection deductions are itemised and evidence-backed; security-deposit
   refund is calculated separately from rent credit.
8. The UI shows a system refund recommendation and preserves an authorised,
   reasoned admin adjustment without allowing a refund above the available
   balance.
9. Payment and room/resident timelines explain all relevant lifecycle changes
   without exposing records across properties or unauthorised sensitive data.
10. A lease activated before physical arrival keeps its room unavailable under
    `awaiting_check_in`; no physical occupancy exists until check-in is confirmed.
11. A 31 January checkpoint anchor clamps to the final day of February and
    returns to 31 March without permanently changing its anchor.
12. A manual payment made before the due time but recorded later is classified
    from verified `paid_at`; Admin cannot directly edit the overdue result.
13. Reversing a checkpoint-satisfying payment recalculates the original
    checkpoint state and preserves both the original and reversal history.
14. Confirmed physical check-out ends lease/occupancy independently from later
    refund payment, while the room remains unavailable until inspection and
    maintenance resolution permit availability.
15. Every required verified payment/refund type has an authorised downloadable
    document using the approved receipt visual template and access scope.

## 11. Additional Agreed Operating Decisions

The following decisions refine the target policy and are part of the future
implementation baseline. The refund-approval model remains the single-Admin
model defined in section 5.4; dual approval is not a current requirement.

### 11.1 One authorised payment extension

- An authorised Admin may grant at most one payment extension during one active
  lease's settlement lifecycle.
- The extension is available only after a checkpoint/final-settlement deadline
  has been missed and while the lease has not been terminated or fully paid.
- The extension is between 1 and 14 calendar days from the original due date.
  The selected extension deadline must still be in the future when approved.
- A reason is mandatory. The record stores original due time, extended due time,
  Admin actor, approval time, reason, and related resident/lease/checkpoint.
- Granting an extension does not erase the original overdue history. The UI
  shows both the original and active extension deadline.
- A promise-to-pay note is not an extension. Only the explicit authorised
  extension command changes the operative payment deadline.
- When the extension expires, no second ordinary grace or extension is created.
  The case returns directly to Admin action/termination eligibility.

### 11.2 Early-termination notice and short-notice charge

- The ordinary minimum notice for a resident-requested early termination is 14
  calendar days before the requested physical check-out date.
- Rent used through the approved physical check-out date remains payable.
- If the resident provides fewer than 14 days' notice, the recommended
  short-notice charge is the daily room rate multiplied by the missing notice
  days, capped at 14 days of room rent.
- The daily rate uses the contractual monthly room rate and the number of days
  in the relevant lease-anchored payment period.
- An authorised Admin may waive all or part of the short-notice charge only for
  a documented management-caused condition or approved exceptional/emergency
  reason. The waiver requires an explicit reason and audit entry.
- Existing checkpoint shortfalls, overdue amounts, approved charges, and other
  liabilities remain part of final settlement; submitting a termination request
  does not stop or erase them.
- Early termination remains a request until Admin approval. Check-out, room
  release, deposit disposition, and refund occur only through their respective
  confirmed lifecycle steps.

### 11.3 Cash received, earned rent, deposit, and Owner reporting

The financial/read model must keep these values separate:

| Value | Meaning |
| --- | --- |
| Cash/payment received | A verified payment received from a resident; it is not automatically earned rent or Owner entitlement. |
| Allocated rent credit | The verified part allocated against the resident's contractual rent balance/checkpoint. |
| Earned rent | Rent attributable to occupancy/service already delivered for the relevant lease period. |
| Security deposit liability | Resident funds held for deposit obligations; never ordinary rent revenue. |
| Refund/reversal | A reduction/correction of a prior financial position; it must remain linked to the original transaction. |
| Owner earning/entitlement | The privacy-safe, period-bound amount attributable to the authorised Owner scope under the approved Owner earning policy. |

- Admin payment views may show all authorised reconciliation components.
- Penghuni views show only the resident's own safe payment, allocation,
  checkpoint, deposit, and refund information.
- Property Owner views remain read-only and show only the permitted period-bound
  earning/financial-health summary. They must not describe the whole payment as
  Owner revenue merely because money was received.
- Owner reports must use effective ownership/service-coverage periods and must
  not leak payment or occupancy history outside the Owner's authorised period.

### 11.4 One exact final-settlement command

- Final settlement is one server-authoritative command with the outstanding
  contractual balance locked at the time of submission.
- The resident/Admin may use one funding source or multiple supported funding
  sources inside that settlement attempt, but their verified net total must
  equal the exact outstanding balance.
- The lease is not considered fully settled while any included funding entry is
  unverified, rejected, reversed, below the required total, or produces an
  overpayment.
- Individual financial transactions remain auditable, but they are linked to
  one final-settlement attempt and cannot make the final checkpoint appear paid
  until the exact aggregate is verified.
- A failed or expired attempt does not delete its payment history. A subsequent
  attempt recalculates the authoritative outstanding balance and records a new
  relationship to the prior attempt.

### 11.5 Notification and promise-to-pay schedule

The target notification eligibility schedule is:

| Time | Recipient and message purpose |
| --- | --- |
| H-7 | Penghuni reminder; Admin upcoming-checkpoint queue. |
| H-3 | Penghuni reminder with requirement, verified credit, and current shortfall. |
| H-1 | Final reminder before the due date. |
| H | Due-today notice with the authoritative deadline and permitted payment action. |
| H+1 | Overdue notice to Penghuni and overdue queue/event for Admin. |
| End of grace | Admin-action-required notice; Penghuni receives the current resolution path. |
| Extension granted/expiring | Both parties receive original due date, extension due date, and safe reason/status. |

- Delivery channels are implementation/provider decisions; eligibility and
  recorded notification state remain server-authoritative.
- Duplicate scheduled runs must not produce duplicate logical notifications.
- An Admin may record a promise-to-pay amount/date/note for operational follow
  up, but it does not change overdue status, room state, checkpoint balance, or
  termination eligibility unless a separate valid extension is granted.

### 11.6 Automatic-activation cutoff and exceptions

- The system evaluates activation eligibility at the beginning of the planned
  start date in Asia/Jakarta and runs the automatic activation shortly after
  midnight (target operational time: 00:05 WIB).
- If all authoritative prerequisites are met, activation is idempotently
  completed and the lease, occupancy, room, timelines, and notifications are
  synchronised.
- If payment/data/room eligibility is not met at cutoff, the lease remains
  awaiting activation and receives an `activation_attention_required` outcome.
  A payment verified later that day does not silently force activation; an
  authorised Admin reviews and confirms the effective activation path.
- A purely technical failure after eligibility was already confirmed may be
  retried by an idempotent reconciler. A business-eligibility failure may not be
  bypassed by an automatic retry.
- Any planned-start-date change before activation must be authorised, audited,
  and used to recalculate the future activation/checkpoint schedule.

### 11.7 Versioned rollout for existing contracts

- Every lease/settlement snapshots the applicable settlement-policy version.
  Runtime behaviour must read that snapshot, not infer policy from today's date
  or the current global configuration.
- Leases/contracts accepted before the rollout effective time retain their
  legacy payment/deadline rules, including those still awaiting activation,
  unless a separately signed/approved amendment explicitly adopts the new
  policy.
- New leases accepted on or after rollout use the revised checkpoint policy.
- A renewal or successor lease created on or after rollout uses the revised
  policy while preserving the predecessor lease's historical policy/version.
- Migration and rollout must not rewrite historical payments, balances,
  deadlines, overdue results, or Owner earning periods to simulate the new
  policy retroactively.
- Admin and Penghuni interfaces must display the applicable policy/deadline for
  each lease clearly so old and new contracts cannot be confused.

## 12. Final Edge-Case Decisions and Planning Closure

These decisions close the remaining business-flow gaps. Further feature ideas
are outside this revision unless a verified implementation blocker requires a
new decision.

### 12.1 Supported contract durations

- New lease terms are restricted to exactly 3, 6, or 12 calendar months.
- The API and Admin UI reject arbitrary 1, 2, 4, 5, or other non-canonical
  durations rather than guessing a checkpoint policy.
- Exactly 3 months uses the activation + 2-month final settlement rule.
- Exactly 6 or 12 months uses the activation + 3-month final settlement rule.
- A future short-stay product must have a separately approved pricing,
  payment-before-activation, refund, and checkout policy; it is not represented
  as an exception to these lease terms.

### 12.2 Month-end checkpoint anchor

- Each lease stores the original activation calendar day as its checkpoint
  anchor.
- If a target month does not contain the anchor day, the checkpoint falls on
  that month's final calendar day.
- A temporary clamp does not replace the original anchor. For example, a lease
  anchored on 31 January uses 28/29 February and returns to 31 March.
- The same anchor rule applies to payment periods, final settlement,
  notifications, grace, extensions, and date projections in Admin/Penghuni
  interfaces.

### 12.3 Manual WhatsApp payment evidence and timeliness

The current payment operation is manual: the resident communicates payment to
Admin through WhatsApp, and Admin records the verified fact in Kostation. The
system does not claim to read WhatsApp or a bank automatically.

The **Catat Pembayaran Manual** command requires:

- resident and authoritative invoice/checkpoint/final-settlement target;
- amount and payment method;
- `paid_at`: the date and exact time in Asia/Jakarta when the resident paid or
  the funds were received, entered from the WhatsApp/bank/cash evidence;
- transaction/reference note where available;
- evidence source, for example WhatsApp plus bank mutation, WhatsApp proof, or
  cash receipt;
- Admin note and explicit attestation that the payment was checked; and
- `recorded_at`, actor, and audit reference generated by the server.

`paid_at` and `recorded_at` have different meanings:

| Time | Authority |
| --- | --- |
| `paid_at` | Business time used to classify payment as on-time or late after Admin verification. |
| `recorded_at` | Immutable system time showing when Admin entered/verified the payment in Kostation. |

- Payment timeliness is derived automatically by comparing `paid_at` with the
  authoritative due time. There is no Admin action for directly changing an
  overdue status to on-time.
- A payment made before the deadline but recorded the following day is on-time
  after verification, while the late Admin recording remains visible.
- A payment made after the deadline is late even if Admin records it immediately.
- `paid_at` cannot be in the future. A manual entry made more than 24 hours after
  `paid_at` requires an Admin reason for delayed recording.
- An exact time is required for payment claimed on the due date. If the evidence
  contains only a date and the exact time cannot be validated, the payment uses
  `payment_time_unverified` and cannot automatically receive on-time status.
- After verification, amount, `paid_at`, and allocation are immutable. An error
  is corrected through reversal followed by a new verified payment record.
- Payment proof remains outside the normal activity-log list. Only a safe
  evidence reference and payment classification are shown.
- A future payment-gateway/bank integration may populate the same authoritative
  fields automatically; the manual command remains an auditable fallback.

The payment lifecycle visible to Admin is:

```text
manual evidence received
  -> Admin records and attests payment
  -> server verifies/allocates the record
  -> timeliness and checkpoint state are recalculated
  -> related payment, tenant, room-linked, dashboard, notification,
     Penghuni, Owner-summary, and activity-log projections refresh
```

### 12.4 Reversal after checkpoint or settlement completion

- A reversal never deletes the original payment or its activity event.
- The server recalculates verified allocation, checkpoint shortfall, contract
  outstanding, and current settlement stage from the remaining net payments.
- If the reversal removes the payment that previously satisfied a checkpoint,
  status may return to overdue using the original due time. The timeline shows
  that the prior paid state was superseded by a reversal; it is not rewritten.
- Admin and Penghuni receive an appropriate notification and Log Aktivitas
  records the original payment, reversal, recalculation, and resulting status.
- Recalculated overdue never automatically checks out the resident or releases
  the room; the ordinary manual Admin decision boundary still applies.

### 12.5 Automatic activation and physical no-show

- Contract/financial activation and physical check-in are separate facts.
- When automatic activation eligibility is met on the planned start date, the
  lease and contractual payment schedule start and the assigned room remains
  unavailable to another resident.
- The room uses `awaiting_check_in`; physical occupancy is not created yet.
- Physical arrival/check-in is recorded separately by Admin or the authorised
  check-in process, which creates the occupancy and changes the room to
  occupied.
- If no physical check-in is recorded by H+1, the system creates
  `check_in_confirmation_required`, not cancellation, checkout, refund, or room
  release.
- Admin contacts the resident and records the outcome: confirmed late arrival,
  approved date correction where valid, resident-requested termination, or
  another authorised case.
- A no-show never silently rewrites the original activation/payment schedule.

### 12.6 Inspection/refund objection and payment target

- After room inspection and recommended final settlement are complete, the
  Penghuni receives a privacy-safe itemised statement.
- The Penghuni may accept it immediately or submit one objection within three
  business days, identifying the disputed item and reason.
- An accepted statement may proceed to refund without waiting for the full
  objection window.
- An objection does not allow the resident to edit amounts. Admin reviews it,
  records the decision/reason/evidence, and produces the final single-Admin
  settlement decision.
- Once final settlement is accepted or decided, an eligible refund has a target
  payment time of no later than seven business days.
- Objection, review, decision, refund due date, refund payment, and reversal are
  visible in the relevant timelines and Admin Activity Log.

### 12.7 Room transfer and lease renewal interaction

- A room transfer during one lease preserves that lease's original checkpoint
  anchor, settlement deadline, payment allocations, overdue history, and policy
  version.
- A rate difference caused by the target room is recorded through an approved
  effective-dated contract adjustment/addendum. It never edits historical rent
  or payment records.
- Transfer keeps the old/new room and occupancy lifecycle transactional and does
  not mark the source room available before its inspection outcome permits it.
- A renewal creates an explicit successor/amended term with its own approved
  commercial snapshot and the policy version applicable at renewal acceptance.
- Renewal preserves the predecessor lease's payments, settlement, occupancy,
  Owner period, and audit history and must not silently extend or rewrite it.

### 12.8 Lease expiry without confirmed physical check-out

- The system creates an expiry work item at H-30 and keeps the Admin and
  Penghuni reminders visible at H-14, H-7, and H-1 until renewal or check-out is
  scheduled.
- On the contractual end date, only an approved renewal or confirmed physical
  check-out closes the normal-expiry decision. Elapsed time alone never renews
  the lease, ends occupancy, archives the resident, or releases the room.
- When neither outcome exists, the server records
  `lease_expired_admin_action_required`; the room remains occupied/unavailable,
  and the Admin list exposes **Masa Sewa Berakhir — Tindakan Admin**.
- Continued physical use is recorded as overstay from the day after the
  contractual end date. Its recommended charge is itemised using the
  lease-anchored daily-rate rule and included in final settlement.
- Admin resolves the exception through confirmed late check-out, an approved
  versioned renewal/successor term, or the authorised termination flow. Every
  resolution records actor, time, reason, effective date, room transition, and
  financial effect in Log Aktivitas.
- Normal check-out produces the same complete check-out document package in
  section 13.5. If settlement or refund remains open, the physical lease/room
  outcome and the financial case continue independently.

Acceptance scenarios must verify that:

1. an expired lease without physical handover never makes the room available;
2. an expired lease never renews or archives itself automatically;
3. an approved renewal stops overstay at the successor effective time without
   rewriting the predecessor contract;
4. a late physical check-out calculates and displays the recommended overstay
   amount without silently deducting the deposit; and
5. normal check-out issues the approved letter/final-settlement package while a
   pending refund remains a separately visible financial state.

### 12.9 Change-control boundary

Implementation may refine technical interfaces, schema, indexing, job
scheduling, and UI composition without changing these business outcomes. A new
business decision requires a documented revision rather than an undocumented
implementation assumption.

## 13. Receipt and Official Document Preservation

The revised payment, overdue, termination, deposit, and refund flows must not
remove the ability to download an official document. Every eligible completed
financial event retains a document download appropriate to its type.

### 13.1 One authoritative visual template

- The existing official receipt/PDF template is the single visual authority.
  New workflow types must use the same backend document generator rather than
  introducing a separate frontend print view or a redesigned template.
- Page size, layout/grid, typography, colours, branding/logo placement, header,
  footer, receipt numbering treatment, signature area, and existing document
  language/style remain unchanged.
- Only authoritative dynamic values may differ: document title/type, receipt
  number, resident/lease/room reference, period, payment/refund amount, method,
  paid time, status, and explanatory line items.
- Any new receipt type is a variant of the current official design, not a new
  visual design. Visual regression review must compare representative PDFs with
  the existing approved receipt before release.

### 13.2 Required downloadable document types

| Financial event | Official downloadable document |
| --- | --- |
| Verified Booking Fee | Receipt: Booking Fee |
| Verified DP/Uang Muka | Receipt: Down Payment/Uang Muka |
| Verified initial one-month rent | Receipt: Pembayaran Awal Sewa |
| Verified regular checkpoint instalment | Receipt: Cicilan Pembayaran Sewa/Checkpoint |
| Verified exact final settlement | Receipt: Pelunasan Akhir Sewa/Kontrak |
| Verified security-deposit payment | Receipt: Security Deposit |
| Paid active-lease refund | Proof/receipt: Pengembalian Dana Refund |
| Paid pre-activation cancellation refund | Proof/receipt: Refund Pembatalan Pra-Aktivasi |
| Confirmed normal lease-expiry check-out | Surat/Berita Acara Check-out with Final Settlement attachment |
| Confirmed approved early-termination check-out | Surat/Berita Acara Check-out Penghentian Dini with Final Settlement attachment |
| Completed final settlement calculation | Final Settlement Statement, whether the result is refund or amount due |
| Payment or refund reversal | Linked reversal/correction document; the original document remains historical. |

- A payment receipt is available only after the payment has been verified and
  recorded authoritatively. A refund approval produces the final-settlement
  statement; the refund receipt is issued only after the refund payment is
  completed and recorded.
- Manual WhatsApp payments use the same rule: after Admin has recorded and
  verified the payment, the document shows the authorised `paid_at` and payment
  method, while the internal `recorded_at` remains audit data rather than a
  misleading receipt date.
- A final-settlement receipt must state that it is final settlement and show the
  relevant lease/contract period. It must not conceal earlier valid instalment
  receipts.
- A refund/reversal document must identify its linked original payment/refund
  reference without overwriting the original receipt.

### 13.3 Download locations and access

| Surface | Permitted document access |
| --- | --- |
| Admin payment history and payment detail | All authorised documents for the selected property/payment case. |
| Admin tenant/lease detail | Documents linked to that resident and lease, including settlement/refund documents. |
| Admin booking-lead detail | Pre-activation Booking Fee, DP, and cancellation-refund documents. |
| Penghuni application | Only the authenticated resident's own verified payment, final-settlement, deposit, and refund documents. |
| Property Owner portal | No resident receipt/refund download by default; Owner access remains limited to authorised read-only summaries. |

Downloads are property-scoped and auditable. An unauthorised user cannot obtain
a document by changing an identifier or copied URL.

### 13.4 History and correction rules

- Issued receipt documents are immutable historical artefacts.
- A later reversal, adjustment, refund, overdue recalculation, or termination
  does not modify or delete a previously issued receipt.
- The UI shows linked documents chronologically so Admin and Penghuni can see
  the original payment, any correction/refund, and the current net position.
- Log Aktivitas records document issuance and any linked correction/refund event
  without exposing document contents to unauthorised roles.

### 13.5 Check-out letter and complete detail package

The check-out document is a **Surat/Berita Acara Serah Terima Check-out**, not a
replacement for a payment receipt. It may be delivered as one branded document
with appendices or as a controlled document package containing the following
sections.

#### A. Document and contract identity

- unique document number and issue date/time in Asia/Jakarta;
- property, building, and room identity;
- resident identity limited to the fields permitted for the recipient;
- lease/contract reference, lease duration, policy version, start date, planned
  end date, actual check-out date, and exit type (normal expiry or early
  termination); and
- Admin/actor who confirmed the check-out.

#### B. Room and handover detail

- room number, category, and relevant room attributes;
- check-in condition reference where available;
- check-out inspection date, inspector, and overall condition;
- itemised inventory expected versus returned/present;
- itemised damage, loss, or maintenance finding;
- key, access card, smart-lock/access, and other handover status;
- utility/meter reading and outstanding usage reference; and
- post-check-out room outcome: `inspection_required`, `maintenance`, or
  `available` only when the lifecycle prerequisites are satisfied.

Detailed photos or private inspection media remain controlled evidence links or
separate authorised attachments. The normal PDF must not expose unrestricted
media or sensitive data merely to make the document appear complete.

#### C. Payment and contract-settlement detail

- contractual total and monthly rate snapshot;
- verified payments grouped by Booking Fee, DP, initial rent, checkpoint,
  final settlement, and any other approved purpose;
- payment date/time, method, receipt/document reference, reversal relationship,
  and allocation summary;
- rent earned/used through the approved check-out date;
- checkpoint shortfall, overdue amount, extension, or promise-to-pay status
  where relevant;
- remaining contract balance and all approved charges; and
- a statement that individual payment receipts remain available separately.

For early termination, the document also identifies the notice date, required
notice period, actual notice, and any approved short-notice charge or waiver.
For normal expiry, it identifies that the contractual end date was reached and
whether the final settlement was already paid or remains due.

#### D. Security deposit, deductions, and refund/amount due

- original security-deposit liability;
- each approved deduction with category, amount, reason, and evidence
  reference;
- deposit balance after deductions;
- rent-credit refund calculation, if any;
- recommended refund, single-Admin final adjustment, and adjustment reason;
- final net refund or remaining amount due;
- refund status and payment date, or `refund_pending` when payment has not yet
  been completed; and
- linked refund/reversal document reference when available.

The final settlement statement is authoritative for the amount. The check-out
letter summarises it and links to the detailed statement; it must not invent a
second balance calculation.

#### E. Confirmation and distribution

- Admin confirmation of physical handover and inspection outcome;
- resident acknowledgement or recorded objection, if provided;
- final lease/occupancy/room outcome and outstanding follow-up owner;
- downloadable PDF using the approved visual identity; and
- safe links to the payment receipts, inspection evidence, refund receipt, and
  Log Aktivitas event when the viewer is authorised.

The letter may be issued after physical check-out and inspection confirmation
even when a refund is still pending. In that case it must clearly state
`refund_pending`; the separate refund receipt is issued only after the refund is
actually paid. A document issuance event is recorded in Log Aktivitas.

The same document contract applies to both normal expiry and early termination;
only the exit type, notice/charge fields, settlement result, and applicable
status text differ.

## 14. Implementation Readiness

The business-flow planning phase is complete against this agreed baseline.
Implementation must preserve the decisions, state boundaries, acceptance
scenarios, access rules, document design contract, and versioned rollout defined
here. A verified conflict discovered during implementation returns to documented
business review; it must not be resolved through an undocumented code-only
assumption.
