# Admin Activity Log Plan

Status: **PRODUCT AND BUSINESS-FLOW PLAN — NOT IMPLEMENTED**

Related plan: [Lease Settlement, Overdue, and Early-Termination Revision Plan](./LEASE_SETTLEMENT_OVERDUE_AND_EARLY_TERMINATION_REVISION_PLAN.md)

## 1. Objective

Create a dedicated, read-only Admin page named **Log Aktivitas** that presents a safe chronological history of operational and financial actions across Kostation.

The page answers: who performed an action, what changed, when it happened, why it happened, which property/room/resident/lease was affected, and whether it succeeded. It is an audit/read model; it does not replace the authoritative payment, allocation, lease, occupancy, room, inspection, deposit, or refund records.

## 2. Users and Access Boundary

- Only authenticated, authorised Admin users can open Log Aktivitas.
- Results are always restricted to the Admin's authorised property scope.
- The current single-Admin operating model does not reduce the need for a complete immutable audit trail.
- The page is read-only. It may deep-link to a permitted detail page but never edits or replays business data.
- Penghuni do not receive this cross-entity log; they receive only their own payment, lease, and refund history.
- Property Owner users do not receive this log; their portal remains a read-only, privacy-safe, effective-ownership-scoped summary.

## 3. Page Layout and Interaction

### 3.1 Header and summary

The page header contains the title, selected property scope, date-range selector, matched-event count, and refresh control. The default date range is the last 30 days.

Optional summary chips may filter matched events by payment, overdue, activation, termination, inspection, refund, and room lifecycle. These chips are filters only, never separate state/counters.

### 3.2 Filters

| Filter | Examples |
| --- | --- |
| Date/time range | today, last 7 days, last 30 days, custom range |
| Property | current permitted property or another authorised property |
| Actor | named Admin, System, other authorised source |
| Module/category | booking, onboarding, tenant/lease, payment, room/occupancy, inspection, refund, notification |
| Action | payment verified, activation completed, checkpoint overdue, refund adjusted, room released |
| Result | succeeded, pending, rejected, failed |
| Target | resident, room, lease, payment, invoice, refund, or termination case |

All filtering is server-side and property-scoped. The client must never receive unauthorised records merely to hide them in the interface.

### 3.3 Activity list

The default sort is newest first and uses pagination or a stable cursor.

| Column | Content |
| --- | --- |
| Time | Event time in Asia/Jakarta; stable event/reference ID is available in detail. |
| Actor | Safe Admin display name/account or System. |
| Activity | Human-readable summary and canonical event type. |
| Target | Safe room, resident, lease, payment, refund, or case reference. |
| Result | Succeeded, pending, rejected, or failed. |
| Change summary | Safe before/after state or amount summary. |
| Reason | Required administrative reason where applicable. |

Selecting one entry opens a read-only detail drawer/page. Links to related pages are available only when the viewing Admin is authorised for the target.

### 3.4 Event detail

The detail view shows authoritative time, stable event ID, actor/source, safe request/correlation reference, property and entity references, action/result, readable before/after values, reason/evidence references, and relationship to any prior/reversal/refund/termination event.

It does not render raw audit payloads, passwords, tokens, raw bank details, payment-proof contents, private inspection media, or unrestricted PII.

## 4. Required Event Coverage

### 4.1 Booking, onboarding, and activation

- booking lead created, updated, completed, cancelled, or refunded;
- onboarding/lease data completed;
- payment requirement met/not met;
- automatic activation attempted, succeeded, skipped, or failed;
- authorised manual activation/exception action;
- occupancy created and room lifecycle changed to occupied.

### 4.2 Payments and contract settlement

- payment created, submitted, verified, rejected, allocated, or reversed;
- Booking Fee, DP, initial-rent, checkpoint-rent, final-settlement, deposit, and refund events;
- checkpoint met, shortfall detected, overdue started, grace started/ended, admin action required, and termination eligibility reached;
- authorised extension/commitment-to-pay action where policy permits it;
- final settlement accepted or rejected because the amount is not exact;
- invoice, receipt, and billing-document events where relevant.

### 4.3 Lease, occupancy, and room lifecycle

- lease status transitions;
- occupancy created, changed, or ended;
- room changed to occupied, inspection required, maintenance, or available;
- invalid activation/conflicting occupancy rejections;
- scheduled/reconciler actions that detect a safe lifecycle exception.

### 4.4 Termination, inspection, deposit, and refund

- resident-requested early termination;
- arrears termination case started, approved, rejected, cancelled, or finalised;
- physical check-out scheduled/completed;
- room inspection started/completed;
- damage, inventory, utility, or other permitted deposit deduction created, changed, or reversed;
- system refund recommendation calculated;
- authorised Admin refund adjustment, including mandatory reason;
- refund decision, payment, reversal, and remaining amount-due outcome.

### 4.5 Security and operational outcomes

- relevant successful or rejected authorised commands;
- idempotent replay/conflict events when they affect an operational command;
- failed scheduled activation/reconciliation events requiring Admin follow-up;
- safe notification request/status events without provider secrets or message-body PII.

## 5. Data, Integrity, and Privacy Rules

### 5.1 Source of truth

The log is derived from authoritative server-side audit/event/outbox/history records. Browser events, cached UI state, or client text cannot create an authoritative activity entry.

Every material mutation preserves enough data to explain: action, affected property/entities, actor/source, time, result, reason, and safe correlation/idempotency reference.

### 5.2 Immutability

- Activity entries are append-only.
- A corrected payment, allocation, deduction, inspection value, or refund creates a linked reversal/adjustment entry; it never rewrites the original.
- Entity pages show current state; Log Aktivitas explains the historical sequence that produced it.

### 5.3 Privacy

The list and normal event detail redact or omit payment-proof files, raw bank details, passwords, tokens, sessions, raw audit payloads, sensitive inspection media, and data from other properties or unauthorised historical scopes.

## 6. Relationship to Other Pages

| Related page | Synchronisation requirement |
| --- | --- |
| Payment page | Financial history/balance links to the relevant activity event. |
| Tenant list/detail | Current lease/payment state and local timeline link to cross-module events. |
| Booking-lead list/detail | Onboarding and pre-activation cancellation/refund events link to the log. |
| Room list/detail | Current room lifecycle and local history link to occupancy/inspection events. |
| Dashboard/notifications | Actionable counts may open pre-filtered logs, but use the same audit source. |
| Penghuni app | Shows self-scoped events only; never the Admin log. |
| Owner portal | Shows permitted summaries only; never the Admin log. |

After every authoritative mutation, the entity projection and activity-log projection must refresh consistently. No action may be complete on one page but absent or contradictory in the other.

## 7. Non-Goals for the First Release

- No editable records or business commands in the table/detail.
- No unrestricted browser for raw audit payloads.
- No cross-property search beyond authorised scope.
- No Property Owner or Penghuni access.
- No claim that this page replaces a financial ledger or detailed payment/deposit/refund records.
- No export/download until retention, privacy, recipient, and approval policy are separately approved.

## 8. Acceptance Criteria

1. An authorised Admin can find a verified payment and see its safe actor, target lease/resident/room, amount summary, result, and related detail.
2. A checkpoint shortfall/overdue event is shown consistently in the resident/lease context and Log Aktivitas.
3. Automatic activation appears as a System action and safely links to lease, occupancy, and room state.
4. A refund adjustment shows system recommendation, final amount, required reason, actor, and time without exposing bank details/proof.
5. A termination case, inspection deduction, check-out, and room availability change can be followed chronologically.
6. Changing a filter, URL, or identifier cannot retrieve another property's events.
7. Property Owner and Penghuni accounts cannot access the page or its API.
8. Reversals/corrections create related immutable entries while preserving the original.

## 9. Deferred Decisions

The following require separate approval before implementation:

- audit-event retention and archival/deletion policy;
- whether filtered exports are permitted and who may receive them;
- whether future finance/management roles need maker-checker approval views;
- whether selected inspection evidence can be exposed in safe event detail;
- exact event taxonomy/versioning and analytics/reporting retention.

