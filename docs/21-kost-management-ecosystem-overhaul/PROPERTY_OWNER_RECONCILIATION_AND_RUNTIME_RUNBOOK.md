# Property Owner Reconciliation and Runtime Runbook

Status: `KMO-W10-OWNER-D — AUTOMATED_VERIFIED; RUNTIME_DEFERRED`

This runbook is the release gate for Property Owner management. It records the
authority reconciliation that can be proven automatically and the controlled
runtime procedure that must be completed before any production claim.

## Authority boundary

The Owner domain keeps these records separate:

```text
Payment Allocation != Earned Rent != Owner Entitlement != Owner Settlement != Owner Payout
```

- A verified payment allocation records money applied to an invoice.
- Earned rent is recognized only for allocation-backed, covered service periods.
- Owner entitlement applies the immutable owner-policy snapshot to earned rent.
- A settlement is a reviewable aggregation of entitlement lines and append-only
  adjustments.
- A payout is the separately recorded transfer of an approved settlement.

Automated reconciliation must prove all of the following without using a
property-wide fallback:

1. Active allocation coverage equals the sum of recognized owner earnings for
   its covered service period, including partitioned transfer-month earnings.
2. A settlement's gross, owner, and operator totals equal its earning lines plus
   permitted append-only adjustments.
3. Paid payout value equals the approved settlement owner amount, after payout
   reversals.
4. An owner report only includes assets and financial events inside the effective
   ownership interval.
5. Safe Owner projections exclude tenant PII, credentials, proof paths,
   destinations, internal notes, and raw audit payloads.

The disposable PostgreSQL W10 Owner suite is the automated proof for migration
first apply/replay, constraints, rollback, allocation-to-earning coverage,
settlement-line reconciliation, payout reconciliation, and temporary-cluster
cleanup.

## Legacy classification and manual queue

No task may silently backfill historical ownership across an entire property.
Legacy records must be classified before approval or payout into one of these
manual-review states:

| Classification       | Meaning                                                                  | Required action                                                |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `unclassified`       | No effective ownership assignment can be proven.                         | Create or verify the historical assignment.                    |
| `category_conflict`  | A Rumah Kost room or Apart Kost building violates the mixed-asset rule.  | Correct the assignment at its canonical level.                 |
| `overlap_conflict`   | More than one owner interval covers the same asset/time.                 | Close or transfer the incorrect interval.                      |
| `orphaned_reference` | An earning, settlement, adjustment, or payout points to invalid lineage. | Reconcile source authority; do not repair by deleting history. |
| `scheduled_review`   | Future assignment needs operational review before it becomes effective.  | Verify effective date and destination.                         |
| `expired_history`    | Historical interval remains valid only for period-bound reporting.       | Keep immutable history; do not use for current operations.     |

An unresolved item returns an empty or fail-closed financial projection. It never
falls back to all rooms in the property or to an operational `owner` role.

## Controlled runtime QA

Runtime QA is permitted only against a disposable cluster or a clearly identified
QA database/clone. It must never use the canonical database by accident.

Before any mutation, record:

1. Git HEAD, worktree state, and SHA-256 checksums for migrations 035–037 and
   the migration manifest.
2. `current_database()`, server address, PostgreSQL version, migration sentinels,
   and an explicit statement that the database is QA/disposable.
3. A restorable backup or disposable-cluster creation command.
4. Test users for Admin, `property_owner` with active assets, scheduled assets,
   historical-only assets, and no assets.

Run these flows after source and migration proof are stable:

1. Apply migrations 035–037 to the QA target; prove first apply, immediate replay,
   expected constraints, and synthetic rollback on a disposable target.
2. Create/verify one Rumah Kost building assignment and one or more Apart Kost room
   assignments. Verify that unassigned assets remain labelled Kostation-owned.
3. Verify Administrator creation, assignment/release/transfer, archive denial with
   active assignments, and password receipt/reset behavior.
4. Sign in as `property_owner`; verify active, scheduled, historical, and empty
   states. Confirm no mutation controls or sensitive tenant/payment data are
   rendered or callable.
5. Verify report preview, PDF, and XLSX include the same safe sections and
   ownership-period-bound totals. Preserve screenshots and exported artifacts.
6. Verify payment allocation, earning, adjustment, settlement, payout, and payout
   reversal totals reconcile using the authority boundary above.
7. Verify a property_owner request to every mutation endpoint is denied. Preserve
   correlation IDs and sanitized evidence only.

## Rollback and incident procedure

- Migrations are append-only. Do not alter `schema_migrations` manually and do not
  delete owner, settlement, adjustment, or payout history to make a screen pass.
- For a failed QA deployment, stop the application, restore the verified QA
  backup/clone, record the failed migration/version and correlation IDs, then
  investigate on a new disposable cluster.
- A canonical deployment or rollback requires separate written approval, a tested
  backup/restore plan, migration checksum verification, and an explicit target
  identity confirmation.
- If a reconciliation mismatch is detected, pause settlement approval/payout for
  the affected owner and period, classify it in the manual queue, and preserve all
  source records for audit.

## W10-D release evidence

`AUTOMATED_VERIFIED` means the focused source, contract, build, and disposable
PostgreSQL proofs passed at the recorded commit. It does **not** mean canonical
migrations, browser QA, production-like exports, or live notification delivery
were executed.

`RUNTIME_DEFERRED` remains until a controlled QA target passes the procedure above
with recorded database identity, restore evidence, authenticated browser evidence,
and cleanup confirmation.
