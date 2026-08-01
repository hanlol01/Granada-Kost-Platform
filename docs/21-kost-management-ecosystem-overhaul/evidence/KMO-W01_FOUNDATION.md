# KMO-W01 Foundation Evidence

Status: **AUTOMATED_VERIFIED — DISPOSABLE CONCURRENCY RUNTIME DEFERRED**

KMO-W01 establishes compatibility and safety authorities only. It does not
activate target lifecycle values on live routes and does not implement any
KMO-W02–W12 product slice.

## Source and Test Scope

The final patch contains 17 files: shared lifecycle vocabulary/export; the live
migration runner, manifest, ledger migration, reconciliation command, and
package scripts; the atomic domain-evidence repository/module registration;
backend and Admin rollout parsing tests; two focused W01 contract suites; this
evidence; and the traceability delivery row.

No route tree, environment file, service, product route, W02–W12 schema, or
existing migration 001–020 is changed.

## Migration Authority

- `db:migrate:api` still resolves to the live API migration command.
- The manifest fixes exact ordered filenames and SHA-256 values for migration
  bytes 001–021.
- A session advisory lock serializes runners.
- The lock is acquired before manifest/checksum validation, baseline decisions,
  and migration execution.
- Migration body and ledger completion share one transaction; failed bodies
  roll back without a success row.
- Existing fully migrated databases may register 001–020 only when every
  multi-object per-migration sentinel is present. Ledger creation and baseline
  registration are one transaction; partial unledgered schemas fail closed.
- Fresh databases bootstrap the ledger explicitly, then apply each canonical
  migration once. Applied checksums skip; drift or orphan ledger rows abort.
- Historical outer `BEGIN`/`COMMIT` wrappers are removed before the runner owns
  the transaction boundary. Only the exact documented outer-wrapper shape is
  unwrapped; inner SQL and noncanonical transaction text are preserved.
- Migration and reconciliation commands load only the API-local environment
  authority and reject implicit host, port, user, password, database, or SSL
  defaults.

| Scenario                  | Automated result                 | Disposable result                            |
| ------------------------- | -------------------------------- | -------------------------------------------- |
| Fresh 001–021             | PASS                             | Exit 0                                       |
| Existing 001–020 baseline | PASS, bodies skipped             | Exit 0                                       |
| Immediate replay          | PASS, zero bodies                | Exit 0                                       |
| Checksum/source drift     | PASS, rejected before write      | Contract-tested                              |
| Failed body               | PASS, rollback and no ledger row | Contract-tested                              |
| Concurrent runners        | PASS, maximum one lock holder    | DEFERRED — Windows launcher returned nonzero |

All disposable targets used the exact `kostation_kmo_w01_qa_` prefix and cleanup
left zero disposable databases. On 2026-08-01, a separate authorized demo
readiness operation backed up the canonical development database, baselined
001–020, applied 021–027, proved zero-write replay, and completed count-only
reconciliation.

## Lifecycle Compatibility

| Legacy fact                        | Target result                                                   |
| ---------------------------------- | --------------------------------------------------------------- |
| Invoice `partial`                  | `partially_paid`                                                |
| Lease `ended`                      | `completed`                                                     |
| Billing cycle `monthly` / `yearly` | `legacy_monthly` / `legacy_yearly`                              |
| Complaint `open`                   | `submitted`                                                     |
| Room current states                | Preserved; `inspection_required` and `inactive` are target-only |
| Lead history ambiguity             | `BOOKING_LEAD_HISTORY_REQUIRED`                                 |
| Resident/account ambiguity         | `ACCOUNT_LINK_REQUIRED`                                         |
| Payment allocation ambiguity       | `PAYMENT_ALLOCATION_REQUIRED`                                   |
| Active occupancy without lease     | `ACTIVE_LEASE_REQUIRED`                                         |
| Property-wide ownership            | `BUILDING_OWNERSHIP_REQUIRED`                                   |

There is no arbitrary fallback. Unmapped or evidence-dependent facts remain
explicitly unresolved.

## Reconciliation Evidence

Output schema is `{schema_version:1, gate, results:[{check,outcome,count}]}`.
Queries are `SELECT`-only and output counts, never rows or identifiers.

| Check                                 | Canonical read-only outcome | Count |
| ------------------------------------- | --------------------------- | ----: |
| Room/building/property/category       | `matched`                   |     0 |
| Room/hold/occupancy lifecycle         | `matched`                   |     0 |
| Active occupancy without active lease | `legacy_compatible`         |     8 |
| Resident/user/property role           | `matched`                   |     0 |
| Invoice/line totals                   | `matched`                   |     0 |
| Invoice/verified allocations          | `matched`                   |     0 |
| Payment/allocation totals             | `matched`                   |     0 |
| Lease deposit aggregate/ledger        | `matched`                   |     0 |
| Building ownership authority          | `not_yet_representable`     |    26 |

The two expected legacy buckets are bounded: exactly eight active occupancies
without aligned active leases remain `legacy_compatible`, and exactly 26
buildings remain `not_yet_representable`; growth beyond either reviewed count
is blocking rather than silently absorbed. The command performs no repair,
inference, migration, seed, or status change.

## Rollout and Evidence Envelope

- `/auth/me` keeps the existing exact carrier.
- Only boolean `true` enables `adminUxRead` or `bookingHoldWrite`.
- False, absent, null, non-boolean, wrong property, duplicate property, and
  malformed/extra-key records fail closed.
- The domain-evidence repository is exported by the global audit module and
  requires the caller's transaction client.
- Audit and `business_events` receive the same client and an exact version-1
  payload containing only count, reason code, and timestamp plus safe authority
  identifiers.
- Extra fields, free-form reasons, invalid identifiers, and negative counts are
  rejected before query execution. No credential, token, cookie, contact data,
  identity document, message body, path, provider payload, or database URL is
  accepted.

## Test Matrix

- Focused W01: vocabulary/mappings, reconciliation, import safety, evidence
  whitelist/transaction, manifest checksums, fresh/baseline/replay, drift,
  rollback, and concurrency serialization.
- M7 backend/Admin: exact rollout carrier and fail-closed parser.
- M13–M18: lifecycle, idempotency, transaction, audit, and identity regressions.
- Full Admin tests, typecheck, lint, and build; API lint/build; aggregate
  read-only gate; and diff integrity.

The executor's aggregate 12/12 run occurred before its final two reconciliation
query edits. It then ran the focused W01 suite, API lint/build, canonical
read-only reconciliation, and diff-check against those edits. The final
reviewer-fixer validation reruns the aggregate once after the stabilized patch;
final command counts and exit codes are reported in its handoff. The SQL
migration file has no supported Prettier parser; all supported allowlisted
files are formatted by Prettier.

## Known Adapters and Rollback Boundary

Legacy live enums remain unchanged. Later slices must adopt the shared mapping
explicitly and may not emit target-only statuses until their schema and
consumer contract ships.

If migration authority must be disabled before release, stop invoking the live
runner and restore the reviewed runner source. Do not delete ledger rows,
rewrite checksums, replay historical files, or repair a partial database by
hand. A database failure requires restore/recovery evidence under the KMO
migration runbook.
