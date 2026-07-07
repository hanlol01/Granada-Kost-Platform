# Staging Backfill Execution

> Document: STAGING_BACKFILL_EXECUTION.md
> Milestone: M16B-4B - Staging Backfill Execution + API Smoke
> Date: 2026-07-07
> Status: PARTIAL - staging backfill PASS; authenticated rooms API smoke not run due tool approval limit
> Scope: Staging room inventory backfill only. No frontend, no public listing, no booking leads, no Payment Gateway changes, no Smart Lock changes, no tenant PII exposure.

---

## 1. Branch And Safety

Branch: m16b-4b-staging-room-inventory-backfill

M16B-4A base commit present:

- 939e4f0 feat(room-inventory): add guarded import apply mode

Pre-apply repository status was clean.

Environment check:

- NODE_ENV=staging
- DATABASE_URL present
- DATABASE_URL appeared local/docker scoped

Backup confirmation:

- ROOM_INVENTORY_BACKUP_CONFIRMED=true was supplied for the guarded apply.
- Backup readiness was explicitly confirmed through the M16B-4B apply guard env.

---

## 2. Pre-Apply Validation

Commands:

- npm --workspace @granada-kost/api run lint
- npm --workspace @granada-kost/api run build
- npm --workspace @granada-kost/api run room-inventory:validate

Results:

| Check | Result |
|---|---|
| Backend lint | PASS |
| Backend build | PASS |
| Pre-apply dry-run | PASS |
| Pre-apply report | docs/16-room-inventory-booking/reports/ROOM_INVENTORY_DRY_RUN_REPORT_20260707_181007.md |

Pre-apply dry-run summary:

| Metric | Result |
|---|---:|
| rooms | 163 |
| room_buildings | 0 |
| rooms_with_room_code | 0 |
| backfill state | pre_backfill |
| inferred legacy matches | 163 |
| unmatched CSV rooms | 0 |
| unmatched DB rooms | 0 |
| PII findings | 0 |

Pre-apply non-PII DB snapshot:

| Metric | Result |
|---|---:|
| rooms | 163 |
| distinct room IDs | 163 |
| room ID digest | a825f1b5c1a61dd2fc04257571a14692 |
| residents | 10 |
| occupancies | 8 |

---

## 3. Guarded Apply

Command used:

ROOM_INVENTORY_IMPORT_CONFIRM=APPLY_M16_ROOM_INVENTORY ROOM_INVENTORY_BACKUP_CONFIRMED=true npm --workspace @granada-kost/api run room-inventory:apply

Apply result: PASS

Apply report:

- docs/16-room-inventory-booking/reports/ROOM_INVENTORY_APPLY_REPORT_20260707_181120.md

Actual writes:

| Write metric | Count |
|---|---:|
| room_buildings inserted | 26 |
| room_buildings updated | 0 |
| rooms updated | 163 |
| post-apply rooms | 163 |
| post-apply room_buildings | 26 |
| post-apply rooms_with_room_code | 163 |
| post-apply distinct room_code | 163 |

---

## 4. Post-Apply DB Validation

Post-apply non-PII DB validation:

| Metric | Result |
|---|---:|
| rooms | 163 |
| distinct room IDs | 163 |
| room ID digest | a825f1b5c1a61dd2fc04257571a14692 |
| room_buildings | 26 |
| rooms_with_room_code | 163 |
| distinct room_code | 163 |
| duplicate room_code per property | 0 |
| rooms with building_id | 163 |
| rooms with category | 163 |
| rooms with floor_code | 163 |
| rooms with public_visible not null | 163 |
| RuKost rooms | 123 |
| ApartKost rooms | 40 |
| male rooms | 99 |
| female rooms | 64 |
| occupied public visibility violations | 0 |
| reserved/maintenance/requires_review public visibility violations | 0 |
| residents | 10 |
| occupancies | 8 |
| masked placeholder in room fields | 0 |
| room PII pattern hits | 0 |

The room ID digest is unchanged from the pre-apply snapshot, confirming existing room IDs were preserved.

---

## 5. Post-Apply Dry-Run

Command:

- npm --workspace @granada-kost/api run room-inventory:validate

Post-apply dry-run result: PASS

Post-apply dry-run report:

- docs/16-room-inventory-booking/reports/ROOM_INVENTORY_DRY_RUN_REPORT_20260707_181351.md

Summary:

| Metric | Result |
|---|---:|
| rooms | 163 |
| room_buildings | 26 |
| rooms_with_room_code | 163 |
| backfill state | backfilled_or_mixed |
| exact room_code matches | 163 |
| inferred legacy matches | 0 |
| ambiguous matches | 0 |
| missing CSV room matches | 0 |
| extra DB rows | 0 |
| proposed room_buildings inserts | 0 |
| proposed room_buildings updates | 26 |
| proposed rooms updates | 0 |
| status changes | 0 |
| gender corrections | 0 |
| visibility changes | 0 |
| PII findings | 0 |

The remaining proposed room_buildings updates are idempotent upsert candidates from existing building rows; no room updates remain.

---

## 6. API Smoke

| Check | Result |
|---|---|
| GET /api/v1/health | PASS; HTTP 200, database up, Redis up |
| Authenticated GET /api/v1/rooms | NOT RUN; tool escalation for the local Node HTTP smoke was rejected by auto-review usage limit |

The health smoke reported no Payment Gateway or Smart Lock runtime errors.

---

## 7. Idempotency

Second confirmed apply was not run.

Reason:

- The script is guarded to allow confirmed apply only in pre_backfill or partially_backfilled state.
- After successful backfill, the state is backfilled_or_mixed.
- Running a second confirmed apply is therefore unnecessary and not the safer path for M16B-4B.

Idempotency evidence:

- Post-apply dry-run PASS.
- Exact room_code matches = 163.
- Proposed rooms updates = 0.
- rooms remains 163.
- room_buildings remains 26.
- rooms_with_room_code remains 163.

---

## 8. Safety Confirmation

- No room rows deleted.
- No room rows recreated.
- Existing room IDs preserved.
- No residents created.
- No occupancies created.
- No masked tenant names imported into residents.
- No tenant PII introduced into room fields.
- Raw calendar columns were not imported.
- Public listing was not opened.
- Booking leads were not implemented.
- Payment Gateway files were not changed.
- Smart Lock files were not changed.
- Public booking remains not production-ready.
- Production remains not ready.

---

## 9. Deferred Items

- Authenticated rooms API smoke should be rerun once tool approval is available.
- Public room listing remains deferred.
- Booking leads remain deferred.
- Admin Room Management redesign remains deferred to M16C.

---

## 10. Next Milestone

Recommended next milestone:

- M16B Final Closeout, or
- M16C Admin Room Management Redesign

---

## 11. Verdict

### PARTIAL - backfill PASS; authenticated rooms API smoke not run
