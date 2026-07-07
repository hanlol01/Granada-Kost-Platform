# Import Execution Script with Apply Guard Implementation

> Document: IMPORT_APPLY_GUARD_IMPLEMENTATION.md
> Milestone: M16B-4A - Import Execution Script with Apply Guard
> Date: 2026-07-07
> Status: PASS - dry-run and apply-refusal validated; confirmed apply not executed
> Scope: Backend import script guard only. No frontend changes, no DB mutation during validation, no Payment Gateway changes, no Smart Lock changes, no tenant PII exposure.

> IMPORTANT
> M16B-4A adds a guarded apply path to the existing room inventory validator. Default execution remains dry-run. Confirmed apply must not be run until the next approved staging import milestone with backup evidence.

---

## 1. Implemented Files

Updated:

- backend/api/src/infrastructure/database/scripts/validate-room-inventory-import.ts
- backend/api/package.json
- docs/16-room-inventory-booking/CSV_VALIDATOR_DRY_RUN_IMPLEMENTATION.md
- docs/README.md

Added:

- docs/16-room-inventory-booking/IMPORT_APPLY_GUARD_IMPLEMENTATION.md

No Payment Gateway files were changed. No Smart Lock files were changed.

---

## 2. Commands

Dry-run command:

npm --workspace @granada-kost/api run room-inventory:validate

Apply guard command:

npm --workspace @granada-kost/api run room-inventory:apply

The apply command expands to:

tsx src/infrastructure/database/scripts/validate-room-inventory-import.ts --apply

Default behavior without --apply remains read-only dry-run.

---

## 3. Apply Guard Contract

The script refuses write execution unless all apply eligibility checks pass.

Required write guards:

- --apply flag must be present.
- CSV validation must have zero blocking failures.
- DB dry-run matching must be deterministic for all 163 rooms.
- No unmatched CSV rooms.
- No unmatched DB rooms.
- No ambiguous matches.
- No CSV or DB duplicate room_code.
- Current schema must include M16B-3A additive room inventory columns and room_buildings.
- Backfill state must be pre_backfill or partially_backfilled.
- Existing room_buildings rows must not conflict with normalized CSV building keys.
- Existing DB room_code values must not conflict with normalized CSV room_code values.
- No PII findings in normalized CSVs.
- ROOM_INVENTORY_IMPORT_CONFIRM must equal APPLY_M16_ROOM_INVENTORY.
- ROOM_INVENTORY_BACKUP_CONFIRMED must equal true.

M16B-4A validation intentionally runs apply-refusal without the confirmation environment variables. Confirmed apply is not executed in this milestone.

---

## 4. Future Apply Logic

The future confirmed apply path is implemented behind the guard and transaction boundary.

When all guards are satisfied, the apply path is designed to:

- Start a DB transaction.
- Re-check schema readiness inside the transaction.
- Verify the pre-apply rooms count is 163.
- Upsert room_buildings by property_id, category, and building_code.
- Update matched existing rooms only; no room rows are inserted or recreated.
- Preserve existing room IDs and property scope.
- Backfill room_code, category, floor fields, building_id, public_visible, yearly_price, import_source, import_source_row, and import_notes.
- Keep public_visible false for non-vacant rooms.
- Verify post-apply counts before commit.
- Roll back on any failure.

The future apply path does not create residents, occupancies, invoices, booking leads, payment transactions, or Smart Lock records.

---

## 5. Report Behavior

Report filenames are mode-specific:

- Dry-run: ROOM_INVENTORY_DRY_RUN_REPORT_YYYYMMDD_HHmmss.md
- Apply refused: ROOM_INVENTORY_APPLY_REFUSED_REPORT_YYYYMMDD_HHmmss.md
- Future confirmed apply: ROOM_INVENTORY_APPLY_REPORT_YYYYMMDD_HHmmss.md

Reports include:

- run mode
- git branch and commit
- CSV validation summary
- DB dry-run summary
- proposed future writes
- apply eligibility checklist
- backup confirmation status
- actual writes summary
- blocking failures and warnings
- manual review rows
- PII scan summary
- safety confirmation
- final verdict

Apply-refusal reports exit non-zero by design and record zero actual writes.

---

## 6. Safety Boundaries

During M16B-4A validation:

- Do not run confirmed apply with ROOM_INVENTORY_IMPORT_CONFIRM and ROOM_INVENTORY_BACKUP_CONFIRMED.
- Dry-run remains SELECT-only except report file generation.
- Apply-refusal without confirmation env must not execute INSERT, UPDATE, or DELETE.
- rooms count must remain 163.
- room_buildings count must remain 0.
- rooms_with_room_code count must remain 0.
- Tenant PII must not be printed.
- Payment Gateway behavior must remain unchanged.
- Smart Lock behavior must remain unchanged.
- Public booking remains not production-ready.

---

## 7. Validation Evidence

Completed by the M16B-4A validation run:

| Check | Result |
|---|---|
| Backend lint | PASS |
| Backend build | PASS |
| Dry-run before refusal | PASS; report docs/16-room-inventory-booking/reports/ROOM_INVENTORY_DRY_RUN_REPORT_20260707_175035.md |
| Apply-refusal without confirmation env | Expected non-zero refusal; report docs/16-room-inventory-booking/reports/ROOM_INVENTORY_APPLY_REFUSED_REPORT_20260707_175046.md |
| Dry-run after refusal | PASS; report docs/16-room-inventory-booking/reports/ROOM_INVENTORY_DRY_RUN_REPORT_20260707_175058.md |
| DB mutation check | rooms=163, room_buildings=0, rooms_with_room_code=0, actual writes=0 |

Apply-refusal exited with verdict APPLY_REFUSED because Explicit import confirmation and Backup confirmation were absent. Confirmed apply is intentionally not part of this evidence set.

---

## 8. Verdict

### PASS

