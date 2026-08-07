# Domain Lifecycle Contracts

<!-- Canonical matrices intentionally use compact Markdown for stable review diffs. -->
<!-- prettier-ignore-start -->

Status: **APPROVED PLANNING — NOT IMPLEMENTED**

Program: `KMO` — KOSTATION Kost Management Ecosystem Overhaul

Recorded: 2026-07-30 (Asia/Jakarta)

## 1. Purpose

This document defines the target state machines, commands, transaction
boundaries, and cross-domain invariants for the KOSTATION ecosystem overhaul.
It is read together with
`OWNER_POLICY_DECISIONS_AND_GLOSSARY.md`.

Nothing here is a claim that the database, API, Admin, public catalog, or
Penghuni app already implements the target state. Existing enum names and
routes are compatibility inputs; they are not permission to bypass these
contracts.

## 2. Lifecycle Rules Shared by Every Domain

### 2.1 Command contract

Every state-changing command must:

1. authenticate the actor;
2. authorize role, permission, property, building, and entity relationships;
3. validate the exact request schema;
4. claim a stable idempotency key where the command is retryable;
5. open one transaction;
6. acquire deterministic advisory/resource locks;
7. reload locked authoritative state;
8. re-run lifecycle guards;
9. write domain state, history, audit, and outbox with the same transaction
   client;
10. commit before returning the whitelisted response.

Failure before commit rolls back every state, history, audit, outbox,
idempotency completion, counter, and file-link mutation.

### 2.2 Read contract

- Lists use property/building-scoped server pagination, search, sort, and
  filters.
- Totals are authoritative and remain correct on empty or out-of-range pages.
- Detail reads verify scope before returning the entity.
- Conditional expansions are opt-in and exact; absent/false flags do not run
  expansion queries or emit their fields.
- Responses expose whitelisted business fields, not raw rows or storage paths.

### 2.3 History and correction

- A state transition appends immutable domain history.
- An entity with downstream history is archived, ended, voided, rejected, or
  reversed rather than deleted.
- Permanent deletion is limited to an erroneous unreferenced draft and is
  separately authorized.
- Reason is mandatory for cancellation, rejection, reversal, archive,
  exceptional transfer, security-deposit deduction, and privileged correction.

### 2.4 Time and money

- PostgreSQL time is authoritative for expiry, effective-date, and due-date
  decisions.
- Dates are stored as dates when time-of-day is not meaningful; timestamps are
  timezone-aware.
- Money uses integer minor units or exact numeric storage; binary floating point
  is prohibited.
- Financial summaries derive from ledger records and allocations, not UI
  arithmetic.

## 3. End-to-End Authority Flow

```text
Public/Admin inquiry
  → Booking Lead
  → optional 24-hour Room Hold
  → Admin-selected exact Room
  → Lead Payment Commitment (Booking Fee, DP, or full settlement)
  → Onboarding draft
  → Lease awaiting activation reserves Room
  → documents + security deposit + agreement + schedule ready
  → atomic Resident/Lease/Occupancy/Billing activation using committed Account authority
  → active stay
      ↳ invoices → manual payment → allocations → receipt
      ↳ complaint → work order → verification
      ↳ vehicle/parking
      ↳ reminder + in-app notification
      ↳ room transfer/addendum when required
  → checkout notice → inspection → settlement/deposit refund
  → lease and occupancy completed → room inspection/maintenance/vacant
```

Direct Admin onboarding starts at `Onboarding draft` without fabricating a
Booking Lead. A public visitor never selects an exact room.

Before `Commit Onboarding`, lead-based onboarding may revise only the proposed
lease period (valid start date and 3–120-month duration). The final quote is
derived again from the authoritative room/category commercial schedule. The
Lead Payment Commitment remains an immutable historical record: its rent credit
must fit within the revised contract rent, otherwise commit fails closed until
the lead is explicitly corrected or cancelled.

## 4. Booking Lead Lifecycle

Authority: `INV-LEAD-001`, `INV-LEAD-002`, `DEC-LEAD-001` through
`DEC-LEAD-004`.

### 4.1 States

| State | Visible label | Meaning |
| --- | --- | --- |
| `new` | Baru | Lead has not been actioned. |
| `contacted` | Sudah Dihubungi | Admin recorded a real contact attempt. |
| `negotiating` | Dalam Kesepakatan | Category, gender, timing, terms, and commercial intent are being agreed. |
| `awaiting_dp` | Menunggu DP | Exact room and contract quote exist; qualifying DP is not yet verified. |
| `onboarding` | Melengkapi Data | An active hold and one Lead Payment Commitment are present; resident/lease data are being completed in `/tenants`. |
| `leased` | Disewa | Atomic lease activation completed. Terminal. |
| `rejected` | Ditolak | Admin rejected the lead with reason. Terminal. |
| `expired` | Kedaluwarsa | Lead passed the configured follow-up window without agreement. Terminal. |
| `cancelled` | Dibatalkan | Applicant or authorized operator cancelled with reason. Terminal. |

### 4.2 Commands and transitions

| Command | From | To | Required guards and effects |
| --- | --- | --- | --- |
| `CreatePublicLead` | — | `new` | Category and gender are required; exact room is forbidden; no domain mutation outside lead/audit. |
| `CreateAdminLead` | — | `new` | May reference an eligible exact room as proposal; room remains unchanged. |
| `RecordContact` | `new` | `contacted` | Records channel, timestamp, actor, and safe note. |
| `BeginNegotiation` | `contacted` | `negotiating` | Records agreed category/gender and planned start. Survey may be an activity, not a state. |
| `AwaitDP` | `negotiating` | `awaiting_dp` | Admin selected an eligible room and created an immutable quote/contract-value snapshot. |
| `CompleteLead` | `new`, `contacted`, `negotiating`, `awaiting_dp` | `onboarding` | Requires an active compatible hold. Records exactly one Lead Payment Commitment; a 25% DP value is a recommendation, not a blocking minimum. The exact room remains reserved by hold. |
| `ActivateLease` | `onboarding` | `leased` | Performed only inside atomic activation transaction. |
| `RejectLead` | any nonterminal | `rejected` | Reason required; safely release active hold/reservation authority. |
| `ExpireLead` | `new`, `contacted`, `negotiating`, `awaiting_dp` | `expired` | Database-time worker/manual command; no active committed lease. |
| `CancelLead` | any nonterminal | `cancelled` | Reason required; refund/DP decision is separate financial command. |

### 4.3 Invariants

- Lead status never directly writes room, resident, account, lease, occupancy,
  invoice, payment, or security-deposit state.
- Public lead has `room_id = null`.
- An Admin room proposal does not reserve that room.
- `leased` is set only by successful lease activation, never by a status
  dropdown.
- A hold expiry may move `awaiting_dp` back to `negotiating` and clear the room
  proposal only when no committed reservation replaces the hold.
- `Booking Lead != Hold != Lead Payment Commitment != Lease != Occupancy`.
  Each transition is explicit and separately auditable.

## 5. Room Hold Lifecycle

Authority: `DEC-LEAD-004`, `INV-ROOM-001`, `INV-ROOM-002`.

### 5.1 States

| State | Meaning |
| --- | --- |
| `active` | Room is reserved until database `expires_at`, normally 24 hours. |
| `released` | Hold ended explicitly; `release_reason` describes manual release, lead termination, room change, or promotion to onboarding. |
| `expired` | Worker or command reconciled a due hold using database time. |

### 5.2 Transitions

| Command | Transition | Contract |
| --- | --- | --- |
| `CreateHold` | — → `active` | Lock property, lead, room, and competing holds; require nonterminal lead, vacant eligible room, matching property/category/gender, and no lease/occupancy blocker; room becomes `reserved`. |
| `ReleaseHold` | `active` → `released` | Idempotent; restore room to `vacant` only if no other reservation/lease/occupancy/maintenance authority exists. |
| `ExpireHold` | `active` → `expired` | Worker uses database time, bounded batch, deterministic property locks, and `SKIP LOCKED`; same safe-room restoration. |
| `PromoteHold` | `active` → `released` | `release_reason=promoted_to_onboarding`; an awaiting-activation lease becomes the room reservation authority in the same transaction, so room remains `reserved`. |

At most one active hold exists per room and per lead. Hold create/release is
idempotent and never changes Booking Lead to `leased`.

## 6. Onboarding Lifecycle

The onboarding aggregate coordinates incomplete data before the final
transaction. It is not an active resident, lease, or occupancy.

### 6.1 States

| State | Meaning |
| --- | --- |
| `draft` | Direct or lead-based onboarding has been opened. |
| `awaiting_documents` | Required identity/contact/acceptance data are incomplete. |
| `awaiting_financials` | Identity is ready; DP, deposit, or billing plan is incomplete. |
| `ready_to_commit` | Identity, agreement, room, DP, deposit, and schedule guards pass for an awaiting-activation commitment. |
| `committed` | Resident/account, awaiting-activation lease, reservation authority, billing draft, audit, and outbox were committed atomically. |
| `completed` | Physical lease activation succeeded. Terminal. |
| `cancelled` | Draft was intentionally abandoned; reason and financial follow-up retained. Terminal. |

Readiness is recalculated from authoritative records before activation; a stale
persisted status is never sufficient.

### 6.2 Required activation data

- full resident identity and gender;
- normalized unique email and phone/WhatsApp;
- birth and address data;
- parent/emergency contacts;
- required KTP/KK/KTM or approved document references;
- authoritative category, room, building, floor, and gender compatibility;
- valid historical/current/future contractual dates, a 3–120-month term, and
  immutable tariff snapshot;
- schedule derived from the commercial snapshot;
- accepted/versioned terms and agreement evidence;
- a recorded initial-rent credit. The UI pre-fills a 25% contract-value DP
  recommendation, but an authorized admin may record a lower agreed DP; Booking
  Fee remains a separate rent credit of Rp0 or at least Rp1.000.000;
- optional security-deposit liability recorded separately; an amount of Rp0 is
  valid and does not block the initial-rent gate;
- room/check-in inventory readiness;
- no conflicting account, resident, lease, hold, occupancy, or room claim.

## 7. User Account and Role Lifecycle

### 7.1 States

| State | Meaning |
| --- | --- |
| `not_provisioned` | Planning state; no login account exists yet. |
| `password_change_required` | Account exists and one-time temporary credential was issued. |
| `active` | Credential changed and account may access allowed scopes. |
| `suspended` | Login denied temporarily; domain history remains. |
| `archived` | Account is no longer operational; history and ownership remain. |

### 7.2 Resident provisioning

`ProvisionResidentAccount` runs only inside the atomic onboarding-commit
command after the agreement, exact room, initial-rent credit, optional
security-deposit record, and billing schedule have been revalidated:

1. normalize email and Indonesian phone forms (`08`, `628`, `+628`);
2. search by normalized identifiers under locks;
3. fail closed when email, phone, or NIK identifies different people;
4. reuse the same person's account or create one;
5. assign exact `resident` role/property membership;
6. link `residents.user_id`;
7. create a one-time temporary credential and store only its password hash;
8. return the plaintext once through a dedicated non-cacheable secret receipt
   to the authorized operator for manual handoff;
9. require password change on first authenticated session.

The plaintext temporary password is never stored, re-readable, logged,
exported, audited, emitted through an event, placed in a URL, or returned from
an ordinary resource endpoint. Closing the one-time receipt makes it
irretrievable; reset requires a new audited command.

### 7.3 Property Owner provisioning

`ProvisionPropertyOwner` is executed with ownership activation:

- reuse/create normalized user;
- assign `property_owner` and exact building ownership scope;
- issue a temporary credential only through the same dedicated, authorized,
  non-cacheable one-time receipt contract and require first-login change;
- keep all Property Owner application actions read-only;
- end access immediately when no active ownership assignment remains.

`owner` and `property_owner` are never interchangeable.

## 8. Resident Lifecycle

| State | Meaning and allowed transition |
| --- | --- |
| `draft` | Onboarding identity not yet activated. May be corrected or deleted only while unreferenced. |
| `pending_activation` | Onboarding was committed and an account may complete first-login setup, but no active occupancy exists yet. |
| `active` | Successful lease/occupancy activation. May be edited for non-authority profile fields, transferred, checked out, or suspended at account level. |
| `inactive` | No active occupancy/lease. May be re-onboarded through a new lease without losing history. |
| `archived` | Hidden from active worklists but retained for legal/operational history. |

Resident `active` is not a substitute for lease, occupancy, account, or room
status. A resident may be inactive while historical leases, payments,
complaints, vehicles, and reminders remain queryable.

Permanent deletion is allowed only for an erroneous `draft` with no user link,
lease, occupancy, invoice, payment, file, complaint, vehicle, reminder,
activity, audit, or ownership relation.

## 9. Lease Lifecycle

Authority: `POL-LEASE-001` through `POL-LEASE-004`,
`INV-LEASE-001`, and `INV-LEASE-002`.

### 9.1 States

| State | Meaning |
| --- | --- |
| `draft` | Terms are being prepared; no room claim. |
| `awaiting_activation` | Terms, quote, and exact room are committed; room is `reserved`, but occupancy is not active. |
| `active` | Signed/accepted agreement and active occupancy exist. |
| `transferred` | Original lease was superseded by a linked successor lease because room transfer changed commercial terms. Terminal. |
| `completed` | Checkout and settlement completed. Terminal. |
| `cancelled` | Lease ended before activation or was lawfully cancelled with reason and financial resolution. Terminal. |

### 9.2 Transitions

| Command | Transition | Contract |
| --- | --- | --- |
| `CreateLeaseDraft` | — → `draft` | 3–120-month ordinary term, snapshot category tariff, and exact resident/onboarding scope. |
| `CommitRoomAndQuote` | `draft` → `awaiting_activation` | Exact eligible room locked; active hold promoted/released; room remains `reserved`. |
| `ActivateLease` | `awaiting_activation` → `active` | Atomic activation contract in Section 24. |
| `TransferWithAddendum` | `active` → `active` | Same commercial contract; append addendum and room-transfer event. |
| `TransferWithSuccessor` | `active` → `transferred`; new lease → `active` | Commercial terms change; link predecessor/successor and preserve billing cutover. |
| `CompleteCheckout` | `active` → `completed` | Occupancy ended, access returned, inspection/settlement complete, deposit refund/deduction authority recorded. |
| `CancelLease` | `draft`, `awaiting_activation` → `cancelled` | Reason required; safely release room and resolve DP/deposit through separate financial commands. |

Lease close is a command, not a free status edit. Direct occupancy check-in
without a lease remains prohibited.

## 10. Occupancy Lifecycle

| State | Meaning |
| --- | --- |
| `active` | Resident physically occupies the current room under an active lease. |
| `ended` | Checkout or transfer cutover ended this room occupancy. |
| `cancelled` | A scheduled/prepared occupancy never became active. |

Rules:

- Exactly one active occupancy per resident and room.
- Future start date keeps the lease `awaiting_activation`; occupancy becomes
  active only on the authorized check-in/effective command.
- An active occupancy requires matching property, resident, lease, room,
  building, and gender.
- Room transfer ends the old occupancy and creates the new one atomically; it
  never rewrites the old occupancy's room.
- Checkout sets `ended_at`, reason, actor, and linked checkout command.

## 11. Room Lifecycle

### 11.1 States

| State | Meaning |
| --- | --- |
| `vacant` | Eligible for hold/lease selection when all other guards pass. |
| `reserved` | Claimed by an active hold or awaiting-activation lease. |
| `occupied` | Exactly one active occupancy exists. |
| `inspection_required` | Resident left or transferred; room must be checked before reuse. |
| `maintenance` | Room is blocked by maintenance/repair authority. |
| `inactive` | Administratively unavailable; no active claim may exist. |

### 11.2 Valid transitions

```text
vacant → reserved                    CreateHold / CommitRoomAndQuote
reserved → vacant                    safe release/expiry/cancel
reserved → occupied                  ActivateLease
occupied → inspection_required       Transfer / Checkout
inspection_required → vacant         PassInspection
inspection_required → maintenance    FailInspection/CreateMaintenance
maintenance → inspection_required    CompleteRepair when reinspection required
maintenance → vacant                 CompleteRepairAndInspection
vacant → inactive                    DeactivateRoom
inactive → vacant                    ReactivateRoom after reconciliation
```

Direct arbitrary status PATCH is prohibited. A room editor may change
non-lifecycle attributes only; structural changes are blocked while a hold,
lease, occupancy, transfer, checkout, complaint/work order, or ownership
constraint would be invalidated.

## 12. Billing Plan and Invoice Lifecycle

### 12.1 Billing plan

| State | Meaning |
| --- | --- |
| `draft` | Schedule preview generated from lease snapshot. |
| `active` | Lease activated and invoice schedule authoritative. |
| `completed` | Every scheduled charge is paid, voided, credited, or settled at checkout. |
| `cancelled` | Pre-activation plan abandoned; issued records require explicit void, not deletion. |

The schedule covers the committed 3–120-month term and is derived from the
immutable commercial snapshot. An exact 12-month multiple may use the annual
category rate; other ordinary terms use the monthly category rate. Booking Fee
and DP are allocated against rent obligations and reduce their remaining
balance. An Admin may record one payment that settles multiple issued
obligations.

### 12.2 Invoice states

| State | Meaning |
| --- | --- |
| `draft` | Not yet collectible or visible to resident. |
| `issued` | Collectible with positive outstanding balance before due date. |
| `partially_paid` | Verified allocations are greater than zero and below total due. |
| `paid` | Outstanding amount is zero through valid allocations/credits. |
| `overdue` | Positive outstanding amount after database due date. |
| `void` | Cancelled through authorized correction; no further allocation allowed. |

Invoice period, purpose, amount, due date, lease, resident, room snapshot, and
category tariff snapshot are immutable after issue. Correction uses an
adjustment/credit/void command with history.

## 13. Payment, Allocation, DP, and Receipt Lifecycle

### 13.1 Payment states

| State | Meaning |
| --- | --- |
| `pending_confirmation` | Transfer evidence or manual submission awaits authorized verification. |
| `verified` | Money receipt and allocations are accepted. |
| `rejected` | Evidence/submission rejected before verification; reason retained. |
| `reversed` | Previously verified payment was offset by an authorized reversal. |

Cash recorded by an authorized Admin may become `verified` in one atomic
command. Transfer normally enters `pending_confirmation` unless the authorized
Admin is recording already verified bank evidence.

### 13.2 Allocation rules

- Allocation rows reference payment, invoice, amount, and purpose.
- Sum of allocations may not exceed payment amount.
- An allocation may not exceed locked invoice outstanding amount.
- Verification locks payment and invoices in deterministic order, writes
  allocations, recalculates invoice statuses, creates receipt, audit, and
  outbox in one transaction.
- Reversal appends offset allocations, restores invoice balances/statuses, and
  leaves the original receipt marked reversed.
- A multi-month payment gets one payment/receipt code and multiple allocation
  detail rows.

### 13.3 DP

DP is represented as verified payment allocations with purpose
`rent_advance_dp`.

```text
quoted → pending_confirmation → verified → allocated_to_rent
                                      ↘ reversed/refunded by explicit command
```

Lead progression uses cumulative verified, non-reversed Booking Fee and DP
rent credits against the immutable contract quote. They must meet 25% before
onboarding may progress. Neither credit funds the security-deposit ledger.

### 13.4 Receipt and invoice artifacts

- Invoice requests money; receipt proves receipt of money.
- Receipt includes payment code, method, date, payer/resident, allocations,
  amount, recorder/verifier, and safe note.
- Transfer proof is access-controlled evidence, not embedded into public PDF.
- Secure invoice/receipt download uses revocable, expiring, scoped links.

## 14. Security Deposit Lifecycle

### 14.1 States

| State | Meaning |
| --- | --- |
| `required` | Configured deposit obligation exists with no verified funding. |
| `partially_funded` | Verified funding is below required amount. |
| `held` | Required amount is fully held as liability. |
| `refund_pending` | Checkout inspection/settlement completed and refund awaits processing. |
| `partially_refunded` | Some held amount was refunded; documented deductions or balance remain. |
| `refunded` | Refundable amount was fully returned. Terminal. |
| `exhausted_by_deductions` | Entire held amount was consumed by approved itemized deductions. Terminal. |
| `reversed` | Funding record was corrected through reversal before final settlement. |

Deposit funding, deduction, and refund use a dedicated ledger. Each deduction
references reason, amount, inspection/damage/arrears evidence, approver, and
timestamp. Deductions plus refunds must reconcile to held funds. Refund target
is no later than seven working days after settlement.

## 15. Room Transfer Lifecycle

### 15.1 States

| State | Meaning |
| --- | --- |
| `draft` | Admin selected resident, reason, and candidate room but has not committed. |
| `scheduled` | Transfer approved for an effective date, normally end of current billing period. |
| `executed` | Atomic cutover completed. Terminal. |
| `cancelled` | Planned transfer cancelled with reason. Terminal. |

### 15.2 Guards

- active resident, lease, and occupancy agree on current room/property;
- target room is `vacant`, same property, gender compatible, and not claimed;
- Admin records standardized reason plus optional note;
- normal transfer effective date is current paid period end;
- emergency same-day transfer requires explicit exception reason;
- financial proration/credit is previewed before commit;
- target-room category/commercial change selects successor-lease flow.

### 15.3 Atomic execution

1. lock property, resident, lease, old occupancy/room, target room, billing;
2. revalidate target eligibility;
3. append transfer and lease addendum or successor link;
4. end old occupancy and create new occupancy;
5. set target room `occupied`;
6. set old room `inspection_required`;
7. reconcile vehicle/parking, access/Smart Lock task, billing snapshot, and
   reminder eligibility;
8. append audit/outbox/activity.

The old room never becomes immediately `vacant` without inspection.

## 16. Checkout Lifecycle

| State | Meaning |
| --- | --- |
| `notice_received` | Resident/Admin recorded intended checkout and reason. |
| `scheduled` | Effective date accepted; normal notice is at least 14 days. |
| `inspection_required` | Occupancy ended or checkout date reached; key/access/inventory inspection pending. |
| `settlement_pending` | Inspection is recorded; invoices, deductions, and refund remain. |
| `completed` | Lease/occupancy ended, access returned, room reconciled, and deposit settlement recorded. |
| `cancelled` | Scheduled checkout withdrawn while lease/occupancy may safely continue. |

`CompleteCheckout` never:

- deletes resident/account/history;
- marks a room vacant before inspection;
- treats security deposit as rent;
- silently writes off arrears;
- commands Smart Lock unless the integration is separately enabled.

## 17. Reminder Lifecycle

Reminder eligibility and message-delivery history are separate.

### 17.1 Eligibility

| Worklist | Eligibility | Clears when |
| --- | --- | --- |
| Current-month bill | Issued/partially-paid/overdue invoice for the selected month with positive outstanding. | Invoice becomes paid/void or no longer belongs to current filter. |
| Custom resident billing | One or more selectable issued/partially-paid/overdue invoices. | Selected invoices become ineligible. |
| Lease H-60 | Active lease first enters the 31–60 day window and renewal intent is unresolved. | Renewal intent is recorded, a successor/addendum is committed, checkout path is accepted, transfer resolves the term, or lease ends. |
| Lease H-30 | Active lease end date is 0–30 days away and renewal/checkout/transfer has not resolved it. | Renewal/successor, completed checkout, executed transfer resolution, cancellation, or completion. Payment alone does not clear it. |
| Lease H-14 | Active lease end date is 0–14 days away and checkout/handover work remains unresolved. | Renewal becomes effective, checkout/handover is completed, transfer resolves the term, or lease ends. |

Counts are query-derived. No persisted badge counter is authoritative.

### 17.2 Message and attempt states

| State | Meaning |
| --- | --- |
| `prepared` | Server rendered a template/version with protected variables and selected source records. |
| `opened` | Manual WhatsApp/email client link was opened; delivery is unknown. |
| `manually_marked_sent` | Operator attested that a manual message was sent. |
| `queued` | Future provider adapter accepted a send command. |
| `sent` | Provider accepted transmission. |
| `delivered` | Future provider callback verified delivery. |
| `read` | Future provider callback verified read, when supported. |
| `failed` | Provider/manual attempt failed with safe classification. |
| `archived` | Hidden from normal history; immutable source attempt remains. |

Initial implementation permits `prepared`, `opened`,
`manually_marked_sent`, and `archived`. It must not fabricate provider states.

Reminder history stores template version, selected invoice/lease IDs,
rendered-message hash, channel, actor, timestamps, status, and safe failure
classification. Full rendered PII is access-controlled and may not enter audit
or outbox.

## 18. Notification Lifecycle

| State | Meaning |
| --- | --- |
| `unread` | In-app event awaits user acknowledgement. |
| `read` | User acknowledged it. |
| `archived` | Hidden from active list; source event remains. |

Notification types include billing, lease/reminder, complaint/maintenance,
vehicle/parking, announcement, Smart Lock, and system. A notification links to
an authorized internal route and never contains an opaque ID in visible copy.

Read/archive changes only notification state. Badge counts derive from unread
notifications and are independent from reminder worklists.

## 19. Expense Lifecycle

| State | Meaning |
| --- | --- |
| `draft` | Incomplete expense not counted in cash flow. |
| `pending_approval` | Complete expense awaiting required approval. |
| `approved` | Authorized but not yet recorded as paid. |
| `paid` | Cash outflow occurred and counts in cash-flow report. |
| `rejected` | Approval rejected with reason. |
| `cancelled` | Draft or approved-but-unpaid expense cancelled with reason. |
| `reversed` | Paid expense offset through correction. |
| `archived` | Hidden from normal worklist; history retained. |

Rules:

- amount below Rp500.000 may use manager approval;
- amount Rp500.000 or more remains pending higher approval until
  `OWNER_CONFIRMATION_REQUIRED-005` is resolved;
- category, property/building scope, date, vendor/payee, payment method, note,
  recorder, and evidence are explicit;
- work-order/material linkage is optional but authoritative when present;
- previewing evidence never exposes a storage path;
- edit is limited before `paid`; correction after payment uses reversal.

## 20. Complaint and Work-Order Lifecycles

### 20.1 Complaint states

| State | Meaning |
| --- | --- |
| `submitted` | Complaint received. |
| `acknowledged` | Operator accepted responsibility and SLA clock is visible. |
| `in_progress` | Resolution work is active. |
| `waiting` | Waiting for resident, material, vendor, access, or another explicit dependency. |
| `resolved` | Operator proposes resolution; resident/authorized verifier may still confirm. |
| `closed` | Resolution verified and complaint closed. Terminal unless reopened. |
| `reopened` | Prior resolution failed or issue recurred. |
| `cancelled` | Invalid/duplicate/withdrawn with reason. Terminal. |

### 20.2 Work-order states

| State | Meaning |
| --- | --- |
| `open` | Work authority created and unassigned. |
| `assigned` | Active technician assigned. |
| `in_progress` | Technician is executing. |
| `on_hold` | Work intentionally paused with reason. |
| `escalated` | Requires higher skill/vendor/authority. |
| `completed` | Technician reports work complete; verification pending. |
| `verified` | Authorized verifier accepts result. Terminal. |
| `rework_required` | Verification failed and corrective work is required. |
| `cancelled` | Work order cancelled with reason. Terminal. |

`DispatchComplaint` locks complaint, technician, linked work orders, and
property/year code sequence. It creates at most one actionable work order.
Reassignment never resets `on_hold`, `escalated`, or other active lifecycle
state. Complaint closure requires consistent work-order resolution but does not
rewrite work-order history.

## 21. Vehicle and Parking Lifecycle

| State | Meaning |
| --- | --- |
| `pending_verification` | Vehicle data/evidence await Admin verification. |
| `active` | Vehicle is registered to current valid resident/occupancy context. |
| `inactive` | Temporarily not using parking but history retained. |
| `rejected` | Submission rejected with reason. |
| `archived` | No longer operational; retained for history. |

An active assignment requires plate, type, ownership/contact context, property,
resident, and current room/occupancy. Duplicate active plate conflicts fail
closed. Transfer moves/reconciles parking scope; checkout deactivates active
parking. Permanent deletion is limited to an unreferenced erroneous draft.

## 22. Building Ownership Lifecycle

### 22.1 States

| State | Meaning |
| --- | --- |
| `draft` | Investor, building, documents, and effective terms are prepared. No access effect. |
| `active` | Investor is current owner of the building for read scope. |
| `ended` | Ownership period closed and historical access/reporting preserved. |
| `cancelled` | Draft/assignment cancelled before effect. |

### 22.2 Invariants and transition

- Default owner for every building is KOSTATION.
- Exactly one active ownership assignment exists per building.
- An investor may own multiple buildings through separate assignments.
- `ActivateOwnership` locks building and existing assignments, ends the prior
  assignment at the new effective boundary, activates the new assignment,
  provisions/reuses Property Owner account, and writes audit/outbox atomically.
- Read scope is calculated from active building assignments, never from
  frontend filtering alone.
- Ownership transfer does not rewrite historical leases, payments, complaints,
  or reports; effective-time reporting preserves the owner at that time.
- Commercial purchase/revenue-share settlement remains disabled until
  `OWNER_CONFIRMATION_REQUIRED-007` is resolved.

## 23. Managed Content Publication Lifecycle

Facilities, gallery, terms, reminder templates, and public profile content use:

| State | Meaning |
| --- | --- |
| `draft` | Editable Admin version, not public. |
| `published` | Immutable published version used by public/API projection. |
| `archived` | Prior version retained but no longer current. |

Publishing creates a new version; it does not overwrite a version referenced by
a lead quote, signed lease, reminder history, or public evidence. Category
gallery reorder operates only within one category and one draft/current
version.

## 24. Atomic Onboarding Commitment and Lease Activation Contract

`ActivateLease` is the only ordinary authority that makes a new resident an
active occupant. Account provisioning may occur earlier only through
`CommitOnboarding`, after the complete agreement and financial prerequisites
have been locked and accepted.

### 24.1 Two-command boundary

`CommitOnboarding` atomically:

1. creates/reuses the normalized account and resident;
2. assigns the exact resident property role;
3. sets the resident `pending_activation`;
4. commits the lease `awaiting_activation`, immutable commercial snapshot, and
   billing schedule;
5. promotes the hold into the lease reservation authority and keeps the room
   `reserved`;
6. retains verified DP allocation and security deposit liability;
7. sets the lead `onboarding` when present;
8. writes audit, outbox, activity, and idempotency result; and
9. produces the one-time temporary-password receipt when a new/reset credential
   is required.

It does not create occupancy, mark the room occupied, or mark the lead leased.
For a start date already reached, the UI may immediately offer `ActivateLease`,
but it remains a separate named command and transaction.

### 24.2 Lock order

The implementation must define and test one deterministic order equivalent to:

```text
property advisory
→ property
→ lead/onboarding
→ user identity keys
→ resident
→ building
→ room
→ hold/reservation
→ lease
→ occupancy conflicts
→ billing plan/invoices
→ DP/deposit ledgers
```

### 24.3 Activation revalidation

Under locks, verify:

- actor authority and exact property;
- onboarding is `committed`, the resident is `pending_activation`, and the
  account/role/lease links are complete;
- normalized identity is not ambiguous;
- room is still reserved for this onboarding/lease and is gender compatible;
- no active occupancy or competing lease claims the room/resident;
- contract duration is 3–120 months unless a future exception authority is
  explicitly approved;
- commercial snapshot and accepted terms are present;
- verified non-reversed initial rent credit is at least 25%;
- an optional recorded security deposit is represented as a separate liability;
- billing schedule reconciles to contract value;
- contractual start date has been reached using database time;
- check-in inventory/access prerequisites are complete.

### 24.4 Activation writes

In the same transaction:

1. revalidate the committed account/resident authority without regenerating a
   credential;
2. set resident `active`;
3. activate lease;
4. create active occupancy;
5. set room `occupied`;
6. activate the billing plan and issue any activation-due invoices;
7. preserve verified DP allocation and deposit liability;
8. set lead `leased` when present;
9. finalize the promoted reservation authority;
10. append histories, safe audit, outbox, and unified activity references; and
11. complete the idempotency response.

No partial credentials, resident, room, invoice, or status survive failure.

## 25. Payment Verification and Reversal Contract

### 25.1 Verify payment

1. authorize and property-scope;
2. lock payment, selected invoices in stable order, lease, and resident;
3. validate method/evidence/date/amount;
4. validate invoice eligibility and allocation totals;
5. set payment `verified`;
6. write allocations and recalculate invoices;
7. create receipt and safe audit/activity/outbox;
8. commit one idempotent response.

### 25.2 Reverse payment

1. require reason and elevated financial permission;
2. lock original payment, allocations, and invoices;
3. reject a second reversal;
4. create reversal transaction/offset allocations;
5. recompute invoice balances/status;
6. mark original receipt/payment as reversed without deletion;
7. write audit/activity/outbox.

A reversal that would invalidate an active lease's financial readiness creates
an operational anomaly and notification; it must not silently evict a resident
or change room status.

## 26. Checkout and Deposit Settlement Contract

`CompleteCheckout` is atomic for occupancy/lease closure, but deposit refund may
remain `refund_pending` until money is actually returned.

1. lock checkout, lease, occupancy, room, invoices, deposit ledger, active
   vehicle/parking, and access tasks;
2. require completed inspection and returned key/access evidence;
3. require arrears/credits and itemized deposit deductions to reconcile;
4. end occupancy and complete lease;
5. set room `inspection_required` or `maintenance` based on inspection;
6. deactivate parking and create access-revocation task;
7. set deposit `refund_pending`, `partially_refunded`, `refunded`, or
   `exhausted_by_deductions` according to actual settlement;
8. append audit, activity, outbox, and reminder/notification reconciliation.

## 27. Derived Timeline and Entity Detail

A resident, room, lease, payment, or complaint activity timeline is a
read-only projection of domain histories and events. It may include:

- lead/hold/onboarding milestones;
- lease activation, renewal, transfer, and checkout;
- invoice issue/overdue/paid/void;
- payment verify/reversal and deposit funding/refund;
- room inspection/maintenance;
- complaint/work-order transitions;
- vehicle/parking transitions;
- reminder attempts and in-app notifications.

The projection stores or returns safe display facts and route targets. It never
replaces source histories, accepts free-form edits, or exposes raw audit
payloads.

## 28. Compatibility and Migration Map

Current implementation values remain accepted only through explicit mapping
during migration.

| Current/legacy value or behavior | Target handling |
| --- | --- |
| Room `vacant`, `reserved`, `occupied`, `maintenance` | Preserve; add `inspection_required` and `inactive` through migration/contract update. |
| Invoice `draft`, `issued`, `paid`, `partially_paid`, `void`, `overdue` | Map legacy `partial` to `partially_paid`; enforce allocation-derived transitions. |
| Payment UI status `paid`, `unpaid`, `overdue`, `partial` | Treat as invoice/payment summary, map legacy `partial` to `partially_paid`, and introduce transaction states separately. |
| Complaint `open` | Map to `submitted` unless history proves `acknowledged`. |
| Complaint `waiting` | Preserve with structured waiting reason. |
| Work order basic five states | Extend with `on_hold`, `escalated`, `verified`, and `rework_required` without rewriting terminal history. |
| Booking Lead legacy statuses | Map by history to canonical lead states; never infer `leased` without active lease evidence. |
| Resident row without account | Preserve resident; provision account only through an authorized onboarding commitment or separately approved invitation, never through migration/lease activation and never by bulk-generating plaintext passwords. |
| Active occupancy without active lease | Mark reconciliation anomaly; use existing compatibility checkout only, never fabricate a lease silently. |
| Property-level Property Owner membership | Deny broad investor reads until building assignments are backfilled and verified. |
| Verified payment without allocations | Reconciliation task must create balanced allocations or classify unresolved; reports exclude unresolved money from invoice settlement. |
| Hard-delete UI action | Replace with archive/reversal; do not invoke legacy delete for historical entities. |

Every migration has:

- preflight counts and fingerprints;
- explicit mapping and unresolved-anomaly output;
- transactional execution or safe resumability;
- postcheck counts, uniqueness, balances, and cross-property mismatches;
- rollback/restore procedure;
- source and migration hash evidence.

## 29. Prohibited Shortcuts

An implementation must not:

- set room `reserved` or `occupied` from a UI-only status edit;
- create resident credentials at lead or hold creation;
- activate occupancy without a lease;
- create a lease from payment alone;
- count DP as security deposit or security deposit as revenue;
- claim WhatsApp/email delivery without provider evidence;
- hard delete payments, expenses, residents, reminders, complaints, leases, or
  ownership history;
- choose an arbitrary room for a public applicant without Admin confirmation;
- select the first ambiguous resident/account/property context;
- filter Property Owner data only in the frontend;
- export current-page data as if it were the complete report;
- let category price changes rewrite active/historical lease terms;
- make the old room immediately vacant after transfer/checkout without
  inspection;
- use fixed sleeps, HMR/network-idle heuristics, or screenshots as domain
  authority.

## 30. Lifecycle Acceptance Baseline

A vertical slice implementing any lifecycle is not ready for review until:

1. state and transition tables have exact backend enum/constraint coverage;
2. transition guards are tested through live service/repository paths;
3. same-key replay, key reuse, concurrency, rollback, and audit failure are
tested;

## 31. Contract Settlement, Arrears, and Termination (KMO-W07A)

```text
awaiting_activation settlement
  └─ ActivateLease → open balance / final deadline = activation + 2 months
open or extended balance
  ├─ verified rent allocation before deadline → remains open or becomes paid
  ├─ one 1–14 day extension after original deadline → extended
  ├─ final deadline passes with balance → overdue / admin action required
  └─ admin starts termination → termination_pending
termination_pending
  ├─ exact full rent settlement → paid → admin may cancel termination
  └─ approved checkout → terminated + occupancy ended + room vacant|maintenance
```

- `D+1` and `D+7` are calculated projections, not stale persisted lifecycle
  states. The lease remains active and occupied at both points.
- A verified manual rent payment may be partial through the end of ordinary D+7.
  If the one permitted extension is granted, partial payment is instead allowed
  only through that extension's deadline; after the applicable window, the
  amount must equal the authoritative remaining balance.
- A termination is a case, not a payment. It never creates an implicit checkout.
- Finalization applies deposit to outstanding rent first, then evidence-backed
  damage; any remaining deposit must be refunded with evidence. It retains all
  lease, occupancy, payment, allocation, and deposit history.
4. property/building cross-scope attempts are denied before mutation/query;
5. invalid predecessor states and terminal-state mutations fail closed;
6. list/detail/UI parser and cache invalidation use authoritative response
   scope;
7. history/audit/outbox contain safe whitelisted facts;
8. migration and reconciliation cover existing rows and anomalies;
9. responsive Admin/Penghuni flows reach terminal states without hiding source
   errors;
10. the traceability matrix advances only with recorded automated and required
    runtime evidence.

<!-- prettier-ignore-end -->
