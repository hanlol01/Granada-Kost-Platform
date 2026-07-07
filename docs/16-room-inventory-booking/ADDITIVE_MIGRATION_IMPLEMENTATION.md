# Additive Room Inventory Migration Implementation

> **Document**: ADDITIVE_MIGRATION_IMPLEMENTATION.md
> **Milestone**: M16B-3A — Additive Migration Implementation
> **Date**: 2026-07-07
> **Status**: PASS — migration implemented and validated on the configured staging database
> **Scope**: Backend schema migration only. No CSV import, no backfill, no seed execution, no frontend changes, no public listing or booking lead implementation.

> [!IMPORTANT]
> This implementation preserves existing `rooms.id` values and all existing FK relationships. It does not import the normalized 163-room CSV data and does not populate `room_buildings`; that remains deferred to the validator/dry-run and staging import milestones.

---

## 1. Repository Safety

| Check | Result |
|---|---|
| Starting branch | `master` |
| Starting worktree | Clean (`git status --short` returned no changes) |
| Implementation branch | `m16b-3a-additive-room-inventory-migration` |
| Latest M16 docs present | Yes: M16A freeze, M16B-1 audit/mapping, M16B-2 migration design, M16A-0 data dictionary/import notes |
| Unrelated local changes | None observed before editing |

---

## 2. Migration File

Created:

`backend/api/src/infrastructure/database/migrations/013_room_inventory.sql`

This is the next sequential migration after `012_payment_gateway.sql`.

The repository migration runner (`backend/api/src/infrastructure/database/scripts/migrate.ts`) replays all sorted SQL files instead of using a migration status table. The new migration therefore uses `IF NOT EXISTS` and guarded `DO $$` blocks so normal replay is idempotent.

---

## 3. `room_buildings` Table Added

Created `room_buildings` with:

| Field | Notes |
|---|---|
| `id` | UUID PK, default `gen_random_uuid()` |
| `property_id` | FK to `properties(id)` with existing property-root convention: `ON DELETE CASCADE` |
| `category` | `rukost` / `apartkost` CHECK |
| `building_code` | Text building/unit code |
| `building_name` | Text display name |
| `gender_policy` | `male` / `female` CHECK; no `mixed` at building level |
| `total_rooms`, `floor_a_count`, `floor_b_count` | Non-negative integers with `total_rooms = floor_a_count + floor_b_count` CHECK |
| `monthly_price`, `yearly_price` | INTEGER, NOT NULL, non-negative; aligned to existing IDR integer price convention |
| `public_visible` | BOOLEAN NOT NULL DEFAULT true |
| `notes` | TEXT nullable |
| `created_by_user_id`, `updated_by_user_id` | Nullable FK to `users(id)` ON DELETE SET NULL, matching existing audit conventions |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Constraints:

- `room_buildings_category_check`
- `room_buildings_gender_policy_check`
- `room_buildings_room_counts_check`
- `room_buildings_price_check`
- `room_buildings_unique_code` on `(property_id, category, building_code)`

Indexes:

- `idx_room_buildings_property`
- `idx_room_buildings_category`
- `idx_room_buildings_gender_policy`
- `idx_room_buildings_public_visible`
- `idx_room_buildings_property_category_gender`
- `idx_room_buildings_property_public_visible`

---

## 4. `rooms` Table Extended Additively

Added nullable-first fields:

| Field | Notes |
|---|---|
| `building_id` | Nullable FK to `room_buildings(id)` ON DELETE RESTRICT |
| `category` | Nullable, CHECK allows `rukost` / `apartkost` when set |
| `room_code` | Nullable canonical future business key |
| `floor_code` | Nullable, CHECK allows `A` / `B` when set |
| `floor_label` | Nullable stored label |
| `public_visible` | BOOLEAN NOT NULL DEFAULT true |
| `yearly_price` | Nullable INTEGER, non-negative when set |
| `import_source` | Nullable traceability field |
| `import_source_row` | Nullable positive integer traceability field |
| `import_notes` | Nullable traceability notes |

Constraints/indexes:

- `rooms_building_id_fkey`
- `rooms_category_check`
- `rooms_floor_code_check`
- `rooms_yearly_price_check`
- `rooms_import_source_row_check`
- `idx_rooms_property_room_code_unique`: unique partial index on `(property_id, room_code) WHERE room_code IS NOT NULL`
- `idx_rooms_building_floor`
- `idx_rooms_property_category_status`
- `idx_rooms_property_public_visible`
- `idx_rooms_public_listing`

No existing `rooms` columns were removed, renamed, or repurposed. Existing `number`, `unit_code`, `floor`, `gender_policy`, `room_status`, `room_type_id`, and `monthly_price` remain compatible.

---

## 5. Status CHECK Update

The migration safely replaces the `rooms` status CHECK with:

`vacant`, `reserved`, `occupied`, `maintenance`, `inactive`, `requires_review`

Implementation details:

- Existing statuses are preserved.
- `reserved` is retained for the storage-level booked state.
- `inactive` is retained.
- No rows are converted.
- A robust `DO $$` block finds current `rooms` CHECK constraints that reference `room_status` and the existing five statuses, drops them, then recreates `rooms_status_check` with `requires_review` added.
- This is replay-safe under the current migration runner.

---

## 6. Compatibility Notes

- Existing room repository queries select explicit legacy columns, not `SELECT *`, so new columns do not alter current API response shape.
- No DTO, controller, service, frontend, Payment Gateway, Smart Lock, billing, resident, or seed code was changed.
- Existing Admin `/rooms` response shape remains the same: legacy `number`, `unitCode`, `floor`, `genderPolicy`, prices, status, photo, and facilities.
- `room_buildings` is intentionally empty after this migration. It is schema readiness only.
- `rooms.room_code` remains NULL for all current rows until the later dry-run/backfill milestone.

---

## 7. Intentionally Not Done

- No normalized CSV parsed or imported.
- No 163-room backfill executed.
- No `room_buildings` data inserted.
- No seed command executed.
- No existing room rows deleted, recreated, or manually updated.
- No existing room IDs changed.
- No stale gender mapping fixed yet.
- No public listing API opened.
- No booking lead implementation.
- No frontend redesign.
- No Smart Lock behavior changed.
- No Payment Gateway behavior changed.
- No tenant PII introduced.
- No production-ready claim.

---

## 8. Validation Results

| Command / Check | Result |
|---|---|
| `git branch --show-current` | `m16b-3a-additive-room-inventory-migration` |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| `npm --workspace @granada-kost/api run db:migrate` | PASS; `013_room_inventory.sql applied.` |
| Re-run `npm --workspace @granada-kost/api run db:migrate` | PASS; migration replay is idempotent in normal runner context |
| Read-only schema inspection | PASS; `room_buildings` exists, all 10 new `rooms` columns exist, expected constraints/indexes exist |
| Status CHECK inspection | PASS; `rooms_status_check` includes `requires_review` and preserves `vacant/reserved/occupied/maintenance/inactive` |
| Data count inspection | PASS; `rooms` count = 163, distinct `rooms.id` count = 163, `room_buildings` count = 0, `rooms_with_room_code` = 0 |
| `GET /api/v1/health` | PASS; HTTP 200, database up, Redis up |
| Authenticated `GET /api/v1/rooms` smoke | PASS; HTTP 200, 163 rooms returned, response keys remain legacy-compatible |
| Backend tests | Not run: no backend `test` script and no `*.test.ts` / `*.spec.ts` files found under `backend/api` |

Environment note: validation used the configured backend staging env (`backend/api/.env` showed `NODE_ENV=staging`, `DATABASE_URL` set, `DB_SSL=false`; secret values were not printed).

---

## 9. Safety Summary

- The migration contains DDL only; it has no `INSERT`, `UPDATE`, or `DELETE` against `rooms`.
- Existing room count remains 163 after migration validation.
- Existing room ID distinct count remains 163 after migration validation.
- Occupancy, invoice, complaint, vehicle, file, Smart Lock, and Payment Gateway FK relationships were not modified.
- Tenant PII was not read from raw CSVs, imported, or exposed.
- Public listing remains unavailable.
- Payment Gateway remains sandbox/staging ready and not production-ready.
- Smart Lock remains site-trial pending with live execution NO-GO.
- Production remains NOT READY.

---

## 10. Risks / Open Questions

1. `public_visible` defaults to true for existing rows until the import/backfill milestone can set occupied/maintenance rows false according to the normalized data dictionary. No public API exists yet, so this does not expose rooms publicly in this milestone.
2. `room_buildings` is empty until the next import milestone; Admin Unit Bangunan and public listing work must not assume populated data yet.
3. Future import must still handle stale seeded gender assignments and active-occupancy conflicts through the V-15/V-16 dry-run reports.
4. The migration runner has no status table; replay safety is handled inside SQL and was validated by running the migration command twice.

---

## 11. Next Milestone Recommendation

Proceed to **M16B-3B — CSV Validator + Dry-run Import Script**.

Recommended scope:

- Implement V-01..V-16 checks from `ROOM_SCHEMA_AUDIT_IMPORT_MAPPING.md`.
- Generate dry-run diff and conflict reports.
- Do not write data until the dry-run report is reviewed.
- Keep staging-only execution and no-delete semantics.

---

## 12. Verdict

### PASS

M16B-3A additive backend migration is implemented and validated. The schema is ready for the next dry-run/import milestone while preserving existing room IDs, existing backend API compatibility, and all explicit non-goals for Payment Gateway, Smart Lock, public listing, booking leads, seeds, and CSV import.
