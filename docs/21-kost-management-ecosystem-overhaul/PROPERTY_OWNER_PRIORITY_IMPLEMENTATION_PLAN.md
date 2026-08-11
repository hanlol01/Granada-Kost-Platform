# Property Owner Priority Implementation Plan

Status: **APPROVED PLANNING — PRIORITIZED NEXT SLICE**

Last aligned: 2026-08-11 (Asia/Jakarta)

## 1. Purpose

This plan pulls the Property Owner portion of `KMO-W10` forward without
silently claiming that the full W10 reporting program has started. It turns the
existing Owner contract into a small sequence of safe vertical slices:

```text
Whole-building ownership authority
        → Owner account provisioning
        → read-only scoped workspace
        → broad reports and exports later
```

The plan is governed by
[`PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md`](PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md),
[`PRD.md`](PRD.md), the authority matrix, and the lifecycle contracts. It does
not authorize source, migration, database, or runtime changes by itself.

## 2. Non-negotiable boundaries

- A `property_owner` is an investor, not the operational global `owner` role.
- Ownership is an effective-dated assignment for one complete building, never a
  room, floor, category, client-submitted room list, or percentage split.
- Each building has exactly one current ownership authority: a current investor
  assignment or the visible default **KOSTATION**.
- A Property Owner is read-only. They must never inherit Admin, manager, or
  global-owner mutation authority through a shared account.
- Empty, revoked, expired, mismatched, or ambiguous assignment scope returns no
  data and no property-wide fallback.
- Existing tenant, booking, lease, occupancy, payment, deposit, expense, and
  room authorities remain canonical. The Owner workspace only projects them.
- No investor payout, profit/loss, tax, dividend, valuation, or expense approval
  workflow is implied by this plan.

## 3. Delivery order

### W10B-1 — Ownership foundation

Create the authoritative model for an investor profile and an effective-dated
`building_owner_assignment` history.

Required behavior:

1. validate the building belongs to the selected property;
2. acquire deterministic assignment/building locks;
3. prevent overlapping current investor assignments for one building;
4. close and create a transfer atomically when ownership changes;
5. preserve immutable historical assignments, actor, agreement reference, and
   effective dates; and
6. project **KOSTATION** when no current investor assignment exists.

Acceptance evidence includes executable migration first apply/replay/rollback,
effective-date overlap tests, transfer tests, default-owner projection, audit,
and property/building scope tests.

### W10B-2 — Owner account provisioning

Provide an Admin-only, route-backed ownership workflow. It may create or reuse
an investor identity, assign `property_owner`, create the building assignment,
and issue a one-time temporary credential receipt in one transaction.

The flow must:

- authorize before identity lookup, idempotency claim, or mutation;
- reconcile identity by normalized email/phone and fail closed on conflict;
- return a plaintext credential only on first successful issue, never in cache,
  audit, logs, URL, ordinary list/detail payloads, or replay responses;
- require password change on first Owner login; and
- offer an audited reset flow rather than password retrieval.

Admin UI must show assignment impact, effective date, agreement reference, and
read-only acknowledgement before confirmation.

### W10C-1 — Restricted Owner shell

The same authenticated account enters an explicit **Mode Pemilik Properti —
Hanya Lihat** shell. Navigation contains only scoped read surfaces and no hidden
write affordance.

Backend scope derives allowed buildings from current effective assignments;
frontend query keys include account, selected building, and assignment version.
Assignment change, role revocation, or building switch clears stale data before
another result can render.

### W10C-2 — Read-only operational projections

Release views in this order:

1. dashboard and building switcher;
2. building/room availability and occupancy summary;
3. minimized resident and active-lease summaries;
4. contract-payment/deposit summary, without raw bank proof or credentials;
5. scoped leads, vehicle, complaint, and notification summaries.

Every list, count, detail, aggregate, deep link, empty state, and export-ready
payload must use the same building scope. A direct mutation request must be
rejected at the backend even if a client UI is modified.

### W10A — Deferred after Owner authority

Comprehensive reports, Excel/PDF exports, and cross-domain financial
reconciliation remain a later W10 slice. They cannot precede ownership scope,
because report totals and exports must be restricted to the same assignment
window as the Owner workspace.

## 4. UI inventory

### Admin ownership management

An authorized global operator gets a full-page or route-backed workflow from
building/room context or Settings. It has:

- current-owner card and ownership history;
- assign/transfer Owner action;
- investor identity/contact fields;
- whole-building selector only;
- effective-date and agreement-reference fields;
- one-time credential handoff receipt for a new account; and
- confirmation that the Owner receives read-only access only.

No single-room ownership editor, resident transfer, room mutation, commercial
override, or payout action belongs here.

### Property Owner workspace

The workspace makes scope visible: selected building, effective ownership
window, and a compact notice when a view has minimized information. It supports
safe drill-down to only owned-building records. It does not expose edit, create,
approve, cancel, refund, verify, activate, or export controls until the relevant
future authority exists.

## 5. Data minimization

Property Owner payloads may show operationally necessary names, room labels,
lease state, dates, totals, and aggregated amounts within scope. They must not
show:

- resident credentials, tokens, NIK/KTP files, exact addresses, emergency
  contacts, raw audit/outbox data, or file-storage paths;
- raw payment proof, bank account evidence, or a different building's count;
- any pre-assignment or post-assignment-end history unless a later policy
  explicitly authorizes it.

## 6. Test and review gates

Each slice requires focused behavioral proof, not source-pattern-only checks:

- property authorization before lookup/idempotency/mutation;
- exact transaction-client propagation through assignment/provisioning/audit;
- deterministic lock ordering and rollback on audit failure;
- zero rows for no assignment, expired assignment, wrong building, and wrong
  property;
- no overlapping effective assignments;
- no Owner mutation path, including direct API calls;
- cache invalidation and stale-response rejection after scope changes;
- desktop/mobile, loading, empty, denied, and first-login-password-change
  behavior; and
- disposable PostgreSQL migration proof before canonical migration is claimed.

The final reviewer runs the complete W10 Owner matrix only after the patch is
stable. Runtime verification remains separately deferred until controlled
credentials, a canonical backup plan, and service/browser evidence are present.

## 7. Explicit deferrals

This prioritized scope does not include W07 transfer/extension/checkout work,
W08 reminders, W09 operational modules, broad W10 reports, W11 Penghuni work,
or W12 reconciliation. It only consumes their existing read models where they
already exist and must fail closed where they do not.
