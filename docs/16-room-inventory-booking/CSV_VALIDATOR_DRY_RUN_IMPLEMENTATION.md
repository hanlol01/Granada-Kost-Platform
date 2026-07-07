# CSV Validator + Dry-run Import Script Implementation

> **Document**: CSV_VALIDATOR_DRY_RUN_IMPLEMENTATION.md
> **Milestone**: M16B-3B — CSV Validator + Dry-run Import Script
> **Date**: 2026-07-07
> **Status**: PASS
> **Scope**: Validator/dry-run only. No database inserts, updates, deletes, backfill, seed execution, frontend changes, public listing, booking leads, Payment Gateway changes, or Smart Lock changes.

> [!IMPORTANT]
> This milestone validates the normalized M16 room inventory CSVs and compares them to the current database using SELECT-only dry-run logic. It does not execute the future import.

---

## 1. Script Path

Implemented:

`backend/api/src/infrastructure/database/scripts/validate-room-inventory-import.ts`

Location follows the existing backend tooling convention used by scripts such as:

- `validate-billing-workflow.ts`
- `validate-complaint-workflow.ts`
- `validate-vehicle-workflow.ts`
- `validate-notification-workflow.ts`
- `validate-smartlock-runtime.ts`

The script loads backend env with the existing dotenv search pattern and uses `databaseConfigFromEnv()` for DB connectivity.

---

## 2. NPM Command

Added to `backend/api/package.json`:

```bash
npm --workspace @granada-kost/api run room-inventory:validate
```

This runs:

```bash
tsx src/infrastructure/database/scripts/validate-room-inventory-import.ts
```

---

## 3. Input Files

The validator reads only the normalized, repo-facing CSVs:

- `docs/05-master-data/room-master/normalized/room_buildings_master.csv`
- `docs/05-master-data/room-master/normalized/rooms_master_normalized.csv`
- `docs/05-master-data/room-master/normalized/room_occupancy_seed_sanitized.csv`

Raw CSV/Excel files are not parsed.

---

## 4. Validation Rules Summary

Implemented CSV checks include:

- Header and unexpected-column validation.
- Raw calendar column detection.
- Summary/aggregation row detection.
- Building row count and category totals.
- Room row count and `room_code` uniqueness.
- Category, floor, gender, status, boolean, integer, and price validation.
- Building total/floor count reconciliation.
- Room-to-building reference validation.
- Room gender equals building gender.
- Occupancy seed references valid room/building data.
- Occupancy seed tenant masking rule: empty or exactly `<masked>`.
- Normalized status-to-DB status mapping:
  - `vacant` -> `vacant`
  - `occupied` -> `occupied`
  - `booked` -> `reserved`
  - `maintenance` -> `maintenance`
  - `requires_review` -> `requires_review`
- PII scan for email-like values, Indonesian phone-like values, NIK-like 16-digit values, and unmasked tenant fields.

PII findings intentionally report only file, row, field, and finding type. Suspicious raw values are not printed.

---

## 5. DB Dry-run Behavior

The DB comparison is SELECT-only. It reads:

- `properties`
- `rooms`
- `room_buildings`
- active occupancy gender context for conflict detection, without printing resident identity data

The dry-run reports:

- Target property inference.
- Current DB room count.
- Current `room_buildings` count.
- Current rooms with `room_code`.
- Duplicate DB `room_code` count.
- Current backfill state.
- Exact `room_code` matches.
- Inferred legacy matches.
- Ambiguous/missing matches.
- Extra DB rows.
- Proposed future `room_buildings` inserts/updates.
- Proposed future room updates.
- Proposed future status/gender/visibility changes.
- Manual review rows.

Legacy matching supports:

- RuKost legacy numbers: `RK-{unit}-{NN}`.
- ApartKost legacy numbers: `AK-{unit}-{localOrdinal}{floorHint}`.
- Already-backfilled canonical room codes.

ApartKost matching uses unit-local ordinal inference because the current legacy seed uses local room ordinals (`AK-05B-1B`) while normalized room codes use canonical room numbers (`AK-05B-B-005`). Floor hint mismatches are not silently accepted; they are reported for manual review.

---

## 6. Generated Report

Latest report:

`docs/16-room-inventory-booking/reports/ROOM_INVENTORY_DRY_RUN_REPORT_20260707_161613.md`

Report verdict: **PASS**

Key dry-run results:

| Metric | Result |
|---|---:|
| Building rows | 26 |
| Room rows | 163 |
| Occupancy seed rows | 2 |
| Duplicate CSV `room_code` | 0 |
| PII findings | 0 |
| Current DB rooms | 163 |
| Current DB `room_buildings` | 0 |
| Current DB rooms with `room_code` | 0 |
| Backfill state | `pre_backfill` |
| Exact matches | 0 |
| Inferred legacy matches | 163 |
| Ambiguous matches | 0 |
| Missing CSV room matches | 0 |
| Extra DB rows | 0 |
| Proposed future `room_buildings` inserts | 26 |
| Proposed future room updates | 163 |
| Proposed future status changes | 10 |
| Proposed future gender corrections | 18 |
| Proposed future visibility changes | 2 |

Manual review items remain before any staging import:

- Dev/staging active occupancy rows where CSV target status is not occupied.
- One active occupancy resident gender conflict with corrected M16 room gender.
- ApartKost legacy floor-hint mismatches caused by old seed numbering (`1B/2B/3A/4A`) versus normalized per-unit floor data.

---

## 7. Safety Guarantees

The validator:

- Executes no `INSERT`.
- Executes no `UPDATE`.
- Executes no `DELETE`.
- Does not seed the database.
- Does not backfill `rooms`.
- Does not populate `room_buildings`.
- Does not modify `room_code`.
- Does not create residents or occupancies from the sanitized occupancy seed.
- Does not print tenant PII.
- Does not open public listing APIs.
- Does not modify Payment Gateway or Smart Lock behavior.

The report also compares selected DB counts before and after dry-run execution; the latest run recorded counts unchanged.

---

## 8. Validation Command Results

| Command / Check | Result |
|---|---|
| `git branch --show-current` | `m16b-3b-room-inventory-validator-dry-run` |
| `npm --workspace @granada-kost/api run room-inventory:validate` | PASS; report generated |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| Backend test discovery | No backend `*.test.ts` / `*.spec.ts` files found under `backend/api`; no backend test script exists |
| `GET /api/v1/health` | PASS; HTTP 200, database up, Redis up |
| Authenticated `GET /api/v1/rooms` smoke | PASS; HTTP 200, 163 rooms returned |

`db:migrate` was not rerun for this milestone because M16B-3A schema was already present and the validator confirmed schema readiness using read-only checks.

---

## 9. Known Limitations

1. The script validates and dry-runs only the current normalized CSV structure and current legacy room-number patterns.
2. It does not produce SQL statements or execute import changes.
3. It does not resolve manual review items; it only reports them.
4. It does not create real occupancy/resident records from `room_occupancy_seed_sanitized.csv`.
5. Public listing readiness still depends on a reviewed and approved staging backfill/import.

---

## 10. Next Milestone Recommendation

M16B-4A update on 2026-07-07: the same script now includes an explicit guarded apply mode behind --apply, ROOM_INVENTORY_IMPORT_CONFIRM=APPLY_M16_ROOM_INVENTORY, and ROOM_INVENTORY_BACKUP_CONFIRMED=true. Default execution remains dry-run and the M16B-3B PASS baseline remains valid for pre-backfill state verification.

Use the dry-run command for read-only validation:

npm --workspace @granada-kost/api run room-inventory:validate

The guarded apply command exists for the future approved staging import path:

npm --workspace @granada-kost/api run room-inventory:apply

For M16B-4A, only dry-run and apply-refusal without confirmation env are validated. Do not run confirmed apply until the next approved staging milestone with backup evidence.

Next recommended milestone: M16B-4B staging import execution, only after review of the latest dry-run and apply-refusal reports. It must remain staging-first, no-delete, backup-gated, and stakeholder-approved.

---

## 11. Verdict

### PASS

M16B-3B is implemented. The normalized CSVs pass validation, the DB dry-run is complete, all 163 current rooms are deterministically matched without writes, and the report identifies the future insert/update plan plus manual review items for M16B-4.
