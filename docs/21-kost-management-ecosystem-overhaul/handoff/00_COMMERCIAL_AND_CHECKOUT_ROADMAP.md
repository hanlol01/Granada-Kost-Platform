# Commercial agreement and checkout roadmap

Status: **STAGES 0–3 IMPLEMENTED LOCALLY — STAGE 4 LOCAL GATES PASSED, PRODUCTION GATES PENDING**

## Outcome

KOSTATION must be able to record a negotiated lease without creating a second
pricing system, and must be able to process a resident's planned or sudden
departure without conflating physical room release with financial closure. The
same immutable lease facts must feed payment allocation, invoices, receipts,
Admin reports, Owner progress/settlement, Penghuni views, and checkout documents.

## Non-negotiable invariants

| ID                      | Invariant                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INV-COMMERCIAL-001`    | One committed lease has one immutable commercial snapshot: duration, reference tariff, agreed tariff, total contract value, pricing source, and accepted terms. |
| `INV-COMMERCIAL-002`    | A negotiated tariff never rewrites a room/category tariff or an older lease.                                                                                    |
| `INV-COMMERCIAL-003`    | Contract target, verified payment, earned income, Owner entitlement, management fee, and security deposit remain separate amounts.                              |
| `INV-CHECKOUT-001`      | At most one open checkout command exists for a lease; retries are idempotent.                                                                                   |
| `INV-CHECKOUT-002`      | Physical handover ends occupancy and starts room inspection; it does not by itself close the financial settlement.                                              |
| `INV-CHECKOUT-003`      | Final settlement uses the lease commercial snapshot and keeps rent, notice compensation, deposit, deductions, amount due, and refund separately inspectable.    |
| `INV-CROSS-SURFACE-001` | API, Admin, Penghuni, Property Owner, documents, and exports use the same server-authoritative snapshot and state.                                              |

## Dependency graph

```text
baseline/ledger preflight
        ↓
commercial snapshot + custom agreement
        ↓
payment/invoice/document/report/Owner consumers
        ↓
resident checkout entrypoint + staged lifecycle
        ↓
checkout settlement/document/report/Owner consumers
        ↓
reconciliation → runtime QA → release gate
```

Checkout may reuse the existing W07D/M5/M6 authority, but its calculations must
read the new commercial snapshot once that feature is available. It must not
create a competing legacy close path.

## Ordered delivery stages

### Stage 0 — Baseline and policy lock

Local checkpoint: **implemented**. The production ledger must still be
revalidated during deployment preflight; the local migration number is not a
substitute for that external check.

Read the context map, both ADRs, both feature handoffs, current source, migration
manifest, and the live ledger when deployment is eventually planned. Produce a
file/migration allowlist, identify legacy records, and write RED contract tests
for the selected slice.

Completion criterion: the next migration version is resolved from the target
ledger, no existing migration is renumbered, and the test fixtures state whether
they use standard or negotiated pricing.

### Stage 1 — Commercial agreement authority

Local checkpoint: **implemented** using additive migration `081`, the shared
server-side commercial resolver, immutable snapshots, and explicit Admin
standard/negotiated flows. Disposable PostgreSQL apply, replay, sentinel,
preservation, and rollback proof passed during Stage 4 local verification.

Implement the custom agreement data contract, server validation, snapshot
creation, legacy compatibility/backfill, and Admin onboarding/booking UI. Keep
standard pricing as the default and make the negotiated path explicit.

Completion criterion: a committed 1-, 2-, 3-, 11-, and 12-month example can be
read back with exact duration, agreed monthly rate, total contract value, source,
settlement checkpoints, and audit metadata; an old lease remains unchanged.

Detailed requirements: [custom agreement handoff](01_CUSTOM_LEASE_AGREEMENT_HANDOFF.md).

### Stage 2 — Commercial consumers

Local checkpoint: **implemented and covered by focused regression tests** for
payment schedules, staged payment credit, formal documents, Admin reporting,
Owner/Penghuni read models, and renewal successor snapshots. Runtime
cross-surface QA remains a Stage 4 gate.

Update payment allocation, invoice/receipt rendering, contract settlement,
Admin reports and exports, Owner progress/settlement, and Penghuni summaries to
consume the snapshot. Add compatibility tests for standard leases and negotiated
leases.

Completion criterion: one fixture produces identical contract total, paid total,
remaining balance, and negotiated-rate label in API, Admin, documents, exports,
and Owner/Penghuni read models; its checkpoint schedule reconciles to the
contract value and earned income remains time-based.

### Stage 3 — Checkout lifecycle integration

Checkpoint: **implemented locally**. The resident-detail entrypoint, staged
lifecycle, evidence, physical and financial completion, documents, Owner/report
projection, and lease-scoped parking release use the existing checkout authority.

Add the resident-detail entrypoint and state-aware labels to the existing checkout
panel. Reuse the existing API/service authority, then close gaps in date rules,
notice compensation, handover evidence, inspection, financial settlement, refund
status, room state, vehicle/access reconciliation, and document issuance.

Completion criterion: normal expiry, 14-day early termination, same-day departure,
unpaid balance, overpayment, deposit deduction, and damage cases each have a
deterministic state and auditable result.

Detailed requirements: [checkout handoff](02_LEASE_CHECKOUT_HANDOFF.md).

### Stage 4 — Cross-surface verification and release

Checkpoint: **local verification passed; production gates pending**. Disposable
PostgreSQL first-apply/replay/rollback proof passed with preserved row counts and
financial totals. Authenticated Admin runtime QA restored the full resident
detail and verified the state-aware checkout entrypoint and panel. API, Admin,
and Penghuni builds and typechecks pass. Current production-ledger preflight,
Linux release builds, controlled deployment, and post-deploy smoke tests remain
required before claiming production completion.

Run focused API/Admin/Penghuni tests, migration apply/replay/rollback proof on a
disposable database, report/document extraction checks, property-scope/security
checks, and controlled runtime QA. Reconcile migration checksums and release
artifacts before any production action.

Completion criterion: every in-scope requirement has evidence in the traceability
matrix, no runtime or migration drift is outstanding, and rollback is documented.

## Explicitly out of scope

- A third “sudden checkout” database type.
- Automatic payment-gateway settlement, automatic WhatsApp delivery, or email
  activation.
- Direct client-side money calculation as authority.
- Rewriting old invoices, receipts, leases, owner settlements, or payout history.
- Hard deletion of residents, rooms, payments, checkout commands, or evidence.
