# Backend Room Model / Migration Design

> **Document**: BACKEND_ROOM_MODEL_MIGRATION_DESIGN.md
> **Milestone**: M16B-2 — Backend Model / Migration Design
> **Version**: 1.0
> **Date**: 2026-07-07
> **Status**: FROZEN design — binding for M16B-3 onward
> **Scope**: Design/documentation only. No backend code, no migration files, no import execution, no database seed, no frontend/mockup changes, no QA. No SQL was executed.

> [!IMPORTANT]
> This document freezes the backend model and **additive** migration strategy for the M16 Room Inventory before implementation begins. Existing room data is never overwritten destructively. Public booking remains **not production-ready**. Payment Gateway remains **sandbox/staging only**; Smart Lock remains **site-trial pending, live execution NO-GO**; production remains **NOT READY**. None of those statuses change here.

---

## 1. Executive Summary

- M16B-2 follows **M16A-0** (normalized room master data, PASS), **M16A** (architecture/UX freeze), and **M16B-1** (schema audit + import mapping).
- The existing room schema is extended **additively**: a new `room_buildings` table plus nullable-first columns on `rooms`. No column is dropped, renamed, or repurposed in this track.
- **`rooms.id` must be preserved** — occupancies, invoices, complaints, work orders, vehicles, check-in records, and file references depend on room UUIDs (all FK `rooms.id`, several with ON DELETE RESTRICT).
- The new canonical room business key is **`room_code`** (`RK|AK-{building}-{floor}-{NNN}`), not the legacy `number`.
- **No migration or import is executed in this milestone.** This is the blueprint that M16B-3+ implements.

---

## 2. Design Goals

1. Support the category hierarchy: `rukost` / `apartkost`.
2. Introduce a building/unit entity (`room_buildings`) as first-class data.
3. Support `gender_policy` per building/unit **and** per room (rooms inherit; invariant enforced).
4. Support `floor_code` (A/B) with `floor_label` (Lantai Atas / LT.2, Lantai Bawah / LT.1).
5. Establish `room_code` as the stable canonical key for import, admin UX, and future integrations.
6. Support `public_visible` at room **and** building level.
7. Support `yearly_price` alongside `monthly_price`.
8. Enable the future public listing (aggregated availability; safe fields only).
9. Enable the WhatsApp booking MVP later (no schema coupling to payment gateway).
10. Preserve backward compatibility with current Admin/Penghuni flows during the whole transition.
11. Support idempotent import from the normalized CSVs (M16B-1 Sections 6/8).
12. Avoid destructive data replacement entirely.

---

## 3. Current Schema Constraints Recap (from M16B-1)

| Constraint | Detail |
|---|---|
| `rooms` fields | `id`, `property_id`, `room_type_id`, `number`, `floor` (free text, NULL in seed), `size_label`, `monthly_price` (INTEGER), `deposit_amount`, `room_status`, `primary_photo_file_id`, `unit_code`, `gender_policy`, audit columns |
| Uniqueness | **`UNIQUE(property_id, number)`** (`rooms_unique_number`) |
| Status CHECK | `vacant`, `reserved`, `occupied`, `maintenance`, `inactive` |
| Legacy 004 fields | `unit_code` TEXT nullable; `gender_policy` TEXT NOT NULL DEFAULT `'mixed'` CHECK (`male`,`female`,`mixed`) |
| Seed mismatch | Seed uses superseded gender mapping (units 01/16 = `female`; RuKost 57/66) and legacy numbering (`RK-01-01`, `AK-05A-1B`) — must be corrected by backfill |
| Dependent relations | `occupancies.room_id` (RESTRICT), `invoices.room_id` (RESTRICT), `occupancy_history`, `check_in_records`, complaints/work orders, vehicles, smart-lock device mappings — all keyed on `rooms.id` |
| Missing | No `room_buildings`, no `category`, no `room_code`, no `floor_code`/`floor_label`, no `public_visible`, no `yearly_price` |

---

## 4. Recommended Migration Strategy — Option B (frozen)

**Add `room_buildings` + extend `rooms` additively.**

Binding rules:
- Keep all existing fields (`number`, `unit_code`, `floor`, `gender_policy` values) during transition.
- Preserve `rooms.id` for every existing row; legacy seed rows are **mapped** to normalized rows (M16B-1 Section 8.3), never deleted/recreated.
- New columns are nullable (or safely defaulted) initially; NOT NULL hardening happens only after a verified backfill.
- Staging dry-run precedes any write; **no production import without a dedicated, separately approved milestone**.

Why not the alternatives:
- **Option A (extend `rooms` only)**: building-level metadata (name, building `public_visible`, notes, floor composition) has no home; the Unit Bangunan UX and public building-level grouping degrade into fragile aggregate queries over `unit_code`; contradicts the M16A frozen data model.
- **Option C (parallel `room_inventory` tables)**: occupancy/billing/complaints FK `rooms.id`, so a parallel model cannot serve existing domains without a high-risk cutover; double bookkeeping is unjustified for one property / 163 rooms.

---

## 5. Proposed `room_buildings` Table Design

| Field | Type / Constraint |
|---|---|
| `id` | UUID PK DEFAULT `gen_random_uuid()` |
| `property_id` | UUID NOT NULL FK `properties(id)` ON DELETE CASCADE |
| `category` | TEXT NOT NULL CHECK IN (`'rukost'`,`'apartkost'`) |
| `building_code` | TEXT NOT NULL (e.g. `01`, `05A`, `18D`) |
| `building_name` | TEXT NOT NULL (e.g. `RuKost Unit 01`) |
| `gender_policy` | TEXT NOT NULL CHECK IN (`'male'`,`'female'`) — no `mixed` at building level (dataset invariant) |
| `total_rooms` | INTEGER NOT NULL CHECK (`total_rooms` >= 0) |
| `floor_a_count` | INTEGER NOT NULL DEFAULT 0 CHECK (>= 0) |
| `floor_b_count` | INTEGER NOT NULL DEFAULT 0 CHECK (>= 0) |
| `monthly_price` | INTEGER NOT NULL — building-level **default** price (existing convention: INTEGER IDR, consistent with `rooms.monthly_price`) |
| `yearly_price` | INTEGER NOT NULL — building-level default |
| `public_visible` | BOOLEAN NOT NULL DEFAULT true |
| `notes` | TEXT nullable (parsing notes; no PII — verified M16A-0) |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |
| `created_by_user_id` / `updated_by_user_id` | UUID nullable FK `users(id)` ON DELETE SET NULL (matches house style of 002) |

Constraints/indexes:
- **`UNIQUE (property_id, category, building_code)`** — the upsert key (M16B-1 Section 8.1).
- `CHECK (total_rooms = floor_a_count + floor_b_count)` — **feasible and recommended** (all 26 normalized rows satisfy it); additionally re-verified by the import validator (V-06/V-07) against actual room rows, which SQL alone cannot express cheaply.
- Indexes: `(property_id, category)`, `(property_id, gender_policy)`, `(property_id, public_visible)`.

**Price placement decision (frozen)**: price lives at **building level as the default** and at **room level as the operative value** (import writes both; room-level may be overridden later per-room). Public "price starts from" reads MIN(room price) per group; Admin bulk price changes act at building level in a later phase.

---

## 6. Proposed `rooms` Table Extensions

New columns (all additive; nullable-first unless a safe default exists):

| Field | Type / Constraint (initial) |
|---|---|
| `building_id` | UUID **nullable** FK `room_buildings(id)` ON DELETE RESTRICT |
| `category` | TEXT **nullable** CHECK IN (`'rukost'`,`'apartkost'`) (CHECK tolerates NULL) |
| `room_code` | TEXT **nullable**; uniqueness via **partial unique index** `(property_id, room_code) WHERE room_code IS NOT NULL` |
| `floor_code` | TEXT **nullable** CHECK IN (`'A'`,`'B'`) |
| `floor_label` | TEXT nullable (stored, not derived, to match CSV exactly; e.g. `Lantai Bawah / LT.1`) |
| `public_visible` | BOOLEAN NOT NULL DEFAULT true (safe default; backfill sets occupied/maintenance rows to false) |
| `yearly_price` | INTEGER nullable |
| `import_source` | TEXT nullable (e.g. `rooms_master_normalized.csv@v1`) |
| `import_source_row` | INTEGER nullable (CSV `source_row` traceability) |
| `import_notes` | TEXT nullable (CSV `notes`; no PII) |

Existing-field review (all retained):

| Field | Disposition |
|---|---|
| `unit_code` | Remains for compatibility; semantically maps to `building_code`. Deprecation decision deferred (Section 18.8). |
| `gender_policy` | Remains; legacy vocabulary `male/female/mixed`; import writes `male`/`female` only. `mixed` stays legal until hardening. |
| `number` | Remains (legacy composite, UI/seed references); **not canonical**. `room_code` is canonical. |
| `floor` | Remains legacy/free-text; `floor_code`/`floor_label` become canonical. Backfill may mirror `floor_code` into `floor` for old UI display (optional, decided in M16B-3). |
| `room_type_id` | Remains; import maps `standard` + category to existing deterministic room-type UUIDs. |
| `monthly_price` | Remains the operative price field; import updates it from CSV. |
| `deposit_amount`, `size_label`, `primary_photo_file_id` | Untouched. |

**Future hardening (post-backfill, separate migration, gated on V-15/V-16 PASS):**
- `room_code` NOT NULL + full `UNIQUE(property_id, room_code)` constraint (replacing partial index).
- `building_id` NOT NULL, `category` NOT NULL, `floor_code` NOT NULL.
- `gender_policy` restricted to `male/female` only **if** no legacy row still needs `mixed`.

---

## 7. Status Model Design (frozen)

| Normalized (M16) | Existing DB value | Decision |
|---|---|---|
| `vacant` | `vacant` | Direct |
| `occupied` | `occupied` | Direct |
| `booked` | `reserved` | **Map `booked` → `reserved`** at storage level for MVP; API/UI present it as "Dipesan/booked". Zero data migration, no frontend breakage. |
| `maintenance` | `maintenance` | Direct |
| `requires_review` | — | **Add `requires_review` to the CHECK** (recommended) rather than overloading `inactive`. Rationale: `inactive` already means "admin-deactivated room" in the UI ("Tidak Aktif"); conflating it with "import could not classify" destroys auditability. M16A-0 data has 0 such rows, so the value is dormant but available for future imports. Never public. |
| (existing) `inactive` | `inactive` | Kept for hidden/deactivated rooms; never public. |

**Safe CHECK migration pattern** (design outline; PostgreSQL CHECKs are immutable so drop+add):

```
ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (room_status IN ('vacant','reserved','occupied','maintenance','inactive','requires_review'));
```

This is additive-safe: every existing value remains valid, executed in one transaction. The API DTO enums (`UpdateRoomStatusDto`, `ListRoomsQueryDto`) are extended in M16B-6, not before.

**Public listing rule (binding, restated)**: only `vacant` + `public_visible=true` (room AND building) is ever publicly listable; `reserved/booked`, `occupied`, `maintenance`, `inactive`, `requires_review` are all hidden.

---

## 8. Gender Policy Mapping (frozen)

| Normalized | Backend |
|---|---|
| `putra` | `male` |
| `putri` | `female` |

Rules:
1. One building/unit has exactly **one** `gender_policy` (dataset invariant; `room_buildings.gender_policy` has no `mixed`).
2. Every room's `gender_policy` must equal its building's `gender_policy` — enforced by the import validator (V-14) and application logic on room create/update once `building_id` is set. A DB trigger is **not** introduced in this phase (consistent with SEED_DATA_PLAN's application-level approach).
3. `mixed` is never written by the normalized import; it remains legal only for legacy rows until hardening.
4. The public API enforces the gender filter **backend-side**; frontend filtering is UX-only.
5. Backfill **corrects** the stale seeded genders (units 01, 16 → `male`, etc.); every correction appears in the dry-run diff and the V-16 conflict report where an active occupancy exists.

---

## 9. Price Mapping (frozen)

| Rule | Value |
|---|---|
| `monthly_price` | From normalized CSV: `1800000` unless a row-specific valid (non-zero) price exists |
| `yearly_price` | `21600000` (= monthly × 12; validator warns on mismatch, V-12) |
| Occupied rows with annual rate | Still `yearly_price = 21600000`, `room_status = occupied` — the occupancy seed's `yearly_rate` confirms, it does not override room master |
| `down_payment` | Belongs to occupancy seed / future lease/payment/lead context — **never** a room-master column |
| Level | Building = default; room = operative value with future per-room override |
| Payment gateway | **No involvement** in booking MVP; no price field couples to `payment_transactions` |

---

## 10. Import/Backfill Matching Strategy

Deterministic matching (from M16B-1 Section 8.3, restated as the binding algorithm):

1. Primary match: parse legacy `rooms.number` → `(category, building_code, room_number[, floor hint])`:
   - RuKost `RK-{unit}-{NN}` → (rukost, unit, NN); floor comes from the normalized row (legacy has none).
   - ApartKost `AK-{unit}-{N}{F}` → (apartkost, unit, N); `F` cross-checks the normalized `floor_code` (mismatch ⇒ conflict report, not silent write).
2. Secondary support: `unit_code` (already populated by seed) corroborates `building_code`.
3. **Never match by `room_number` alone** — numbers repeat across buildings/categories.
4. On match: set `room_code` (from CSV), `building_id`, `category`, `floor_code`, `floor_label`, corrected `gender_policy`, `yearly_price`, `public_visible`, `import_*` columns — **room `id` preserved**.
5. No match: candidate insert, allowed only when the dry-run proves absence.

**Backfill order (binding):**
1. Insert/upsert `room_buildings` (26 rows) by `(property_id, category, building_code)`.
2. Produce the room-mapping **dry-run** (diff: match/update/insert/orphan/conflict).
3. Update existing rooms in place (fields above).
4. Insert missing rooms only per dry-run evidence.
5. **Never delete rooms automatically.**
6. Conflicts (floor mismatch, gender-vs-active-occupancy, unparseable legacy numbers) go to the manual review report (V-15/V-16) and block execution until resolved or explicitly accepted.

---

## 11. Idempotency and Rollback Design

**Idempotency:**
- `room_buildings`: upsert by `(property_id, category, building_code)` — `ON CONFLICT ... DO UPDATE` limited to non-key fields.
- `rooms`: after backfill, upsert by `(property_id, room_code)`; during first backfill, match by the legacy-number algorithm (Section 10).
- Dry-run diff before every write run; a repeated import against an already-correct database produces **zero changes**.
- No destructive delete anywhere in the pipeline.

**Rollback:**
- **Schema rollback**: dropping the added columns/table is possible only while no dependent new data exists (i.e. immediately after Phase 1, before backfill). Documented as the Phase-1 rollback note.
- **Safer operational rollback** (post-backfill): keep the additive fields, disable/never-enable public listing — the legacy Admin/Penghuni surfaces never depended on the new columns, so the system reverts behaviorally without schema surgery.
- **Import rollback**: restore from the pre-import backup/diff snapshot; the dry-run diff doubles as the change manifest.
- **Production** (future, out of scope here): full DB backup is mandatory before any import; production import has its own gated milestone and approval.

---

## 12. Compatibility Strategy

| Surface | Impact of this design |
|---|---|
| Admin `/rooms` flat page | Keeps working — reads `number`, `unitCode`, `floor`, 5-status labels; all preserved. Replaced only in M16C. |
| Existing room APIs | Unchanged in this phase; new fields are additive and omitted from existing DTOs until M16B-6. |
| Occupancy / Residents | `rooms.id` preserved; occupancy sync logic untouched (existing status values unchanged; `requires_review` is never produced by occupancy flows). |
| Billing / Invoices / **Payment Gateway** | `invoices.room_id` untouched; **Payment Gateway unaffected** — status remains sandbox/staging ready, not production-ready. |
| Complaints / Maintenance | Room ID references preserved. |
| Files | `primary_photo_file_id` and ADR-BE-FILE-001 access model untouched. |
| Vehicles / Parking | Room references (via seed-resolved IDs) preserved. |
| Notifications | No room FK dependency; unaffected. |
| Public listing (future) | Enabled by this design; public APIs (M16D) use a strict **allowlist** of safe fields. |
| **Smart Lock** | Device–room mappings keyed on `rooms.id`, preserved. **Unchanged and live disabled** (`SMART_LOCK_LIVE_ENABLED=false`); site trial pending; NO-GO. |

Required invariants: preserve existing fields and IDs; existing APIs keep working throughout the transition; new fields optional initially; public APIs later use allowlists.

---

## 13. Migration Phases

| Phase | Goal | Safety gate | Expected output | Rollback note |
|---|---|---|---|---|
| **1 — Additive schema migration** | `room_buildings` + `rooms` columns + status CHECK extension | Migration applies cleanly on a fresh dev DB; existing build/tests pass (executed by implementer, not this doc) | Migration file `013_room_inventory.sql` (name indicative) | Drop added table/columns — safe while unpopulated |
| **2 — CSV validator + dry-run import** | Implement V-01..V-16 (M16B-1 Section 13); produce diff/conflict reports | Validator PASS on normalized CSVs; reports human-reviewed | `npm run` script + report artifacts | N/A (read-only against DB) |
| **3 — Staging backfill/import** | Populate buildings; backfill/insert rooms | DB backup/snapshot; V-15/V-16 reviewed; gender-correction plan approved | Staging DB matches normalized data; evidence recorded | Restore backup; or operational rollback (Section 11) |
| **4 — API additions** | Admin inventory endpoints (summary/buildings/rooms per M16A Section 15.1) | Existing API regression unaffected | New endpoints, DTO extensions | Feature-flag/remove endpoints; schema untouched |
| **5 — Admin UI redesign (M16C)** | Sidebar dropdown + category pages | M16C validation gates | New Admin surfaces | Old flat page retained until cutover |
| **6 — Public listing / WhatsApp MVP (M16D/E)** | Public aggregated availability + CTA | Section 16 dependencies met; leakage checks | Public surface, staging first | Disable public routes; core system unaffected |

---

## 14. Migration SQL Outline (design only — NOT a migration file)

```
-- 013_room_inventory.sql (outline; to be authored in M16B-3)

-- 1. New building/unit entity
CREATE TABLE IF NOT EXISTS room_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  building_code TEXT NOT NULL,
  building_name TEXT NOT NULL,
  gender_policy TEXT NOT NULL,
  total_rooms INTEGER NOT NULL,
  floor_a_count INTEGER NOT NULL DEFAULT 0,
  floor_b_count INTEGER NOT NULL DEFAULT 0,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_buildings_category_check CHECK (category IN ('rukost','apartkost')),
  CONSTRAINT room_buildings_gender_check CHECK (gender_policy IN ('male','female')),
  CONSTRAINT room_buildings_counts_check CHECK (
    total_rooms >= 0 AND floor_a_count >= 0 AND floor_b_count >= 0
    AND total_rooms = floor_a_count + floor_b_count
  ),
  CONSTRAINT room_buildings_price_check CHECK (monthly_price >= 0 AND yearly_price >= 0),
  CONSTRAINT room_buildings_unique_code UNIQUE (property_id, category, building_code)
);
CREATE INDEX ... ON room_buildings(property_id, category);
CREATE INDEX ... ON room_buildings(property_id, gender_policy);
CREATE INDEX ... ON room_buildings(property_id, public_visible);

-- 2. Additive rooms extensions (nullable-first)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES room_buildings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS room_code TEXT,
  ADD COLUMN IF NOT EXISTS floor_code TEXT,
  ADD COLUMN IF NOT EXISTS floor_label TEXT,
  ADD COLUMN IF NOT EXISTS public_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS yearly_price INTEGER,
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS import_source_row INTEGER,
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

ALTER TABLE rooms ADD CONSTRAINT rooms_category_check
  CHECK (category IS NULL OR category IN ('rukost','apartkost'));
ALTER TABLE rooms ADD CONSTRAINT rooms_floor_code_check
  CHECK (floor_code IS NULL OR floor_code IN ('A','B'));

-- 3. Canonical key (partial until backfill)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_property_room_code
  ON rooms(property_id, room_code) WHERE room_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_building_floor
  ON rooms(building_id, floor_code) WHERE building_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_public_listing
  ON rooms(property_id, room_status, public_visible, gender_policy);

-- 4. Status CHECK extension (drop + re-add, additive-safe)
ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (room_status IN ('vacant','reserved','occupied','maintenance','inactive','requires_review'));

-- 5. FUTURE hardening migration (separate file, after verified backfill):
--    room_code SET NOT NULL; replace partial index with UNIQUE constraint;
--    building_id/category/floor_code SET NOT NULL;
--    optionally restrict gender_policy to ('male','female').
```

This outline is design documentation. The actual migration file is authored, reviewed, and validated in M16B-3.

---

## 15. Validation Gates for Future Implementation

**Before merging the migration (M16B-3):**
- Migration applies cleanly (fresh DB + existing dev DB).
- Existing build/tests pass; existing room APIs still respond correctly.
- Existing Admin `/rooms` still loads unchanged.
- No FK broken; no rows deleted; existing values untouched.

**Before staging import (M16B-5):**
- Normalized CSV validator PASS (V-01..V-14).
- Dry-run diff report generated and reviewed (V-15); no duplicate `room_code`; no gender-per-building mismatch; no PII in reports (V-08); zero deletions in plan.
- Existing-DB conflict report reviewed (V-16); stakeholder explicitly approves the corrected gender mapping (incl. dev-occupancy conflicts).
- DB backup/snapshot taken.
- Payment Gateway and Smart Lock posture verified unaffected (env flags unchanged).

All validation is executed by the implementing engineer/external QA per project workflow — not claimed by this document.

---

## 16. Public Listing Readiness Dependency

Public listing (M16D/M16E) **cannot proceed** until all of the following hold:
1. `room_buildings` exists and is populated (26 rows).
2. Rooms carry `room_code`, `category`, `gender_policy` (corrected), `floor_code`, `public_visible`.
3. The public availability query is safe: aggregated counts, allowlisted fields, no `notes`/`import_*`/audit data.
4. No tenant PII is exposed anywhere in the public path.
5. `vacant` + `public_visible` filtering (room AND building level) works and is backend-enforced.
6. Exact room numbers remain hidden/aggregated for MVP (M16A Section 12).

---

## 17. Implementation Milestone Recommendation

> Supersedes the numbering in M16B-1 Section 14 (that breakdown compressed migration+validator into fewer steps). The safer split below is **recommended**:

| Milestone | Scope |
|---|---|
| **M16B-3** | Additive Migration Implementation (Phase 1) — optionally split into **M16B-3A** (migration only) and **M16B-3B** (validator/dry-run) if review capacity is tight |
| **M16B-4** | CSV Validator + Dry-run Import Script (Phase 2) |
| **M16B-5** | Staging Import Execution (Phase 3; gated per Section 15) |
| **M16B-6** | Room Inventory API Contract Update (Phase 4; M16A Section 15.1 endpoints) |
| **M16C** | Admin Room Management Redesign (Phase 5) |

---

## 18. Open Questions

1. **`requires_review` in CHECK vs mapped to `inactive`?** — Recommendation: add to CHECK (Section 7); confirm at M16B-3 review.
2. **Partial unique index on `room_code` initially?** — Recommendation: yes (Section 6); promote to full UNIQUE at hardening.
3. **`category` nullable initially?** — Recommendation: yes, NOT NULL at hardening.
4. **Building price: default only, or also authoritative?** — Frozen: building = default, room = operative (Section 5); revisit if tiered pricing arrives.
5. **Legacy number → room_code edge cases** — ApartKost floor-suffix mismatch vs normalized floor, or unparseable numbers created manually via Admin: always → conflict report, manual resolution; never guessed.
6. **Staging data linked to gender-corrected rooms** — dev occupancies in units 01/16 etc. need manual review (V-16); decide reassign vs accept before M16B-5.
7. **Import sanitized occupancy rows now or defer?** — Recommendation (from M16B-1): set status/visibility only; defer occupancy-record creation until operations supplies identity/dates.
8. **`unit_code` permanent or deprecated?** — Keep through M16C; schedule deprecation decision after Admin UI no longer reads it.
9. **`public_visible` default for occupied rooms** — column default is `true`, but backfill sets occupied/maintenance rows to `false` (data dictionary rule); application logic should auto-set `false` on transition to occupied (M16B-6 decision).
10. **Room photos/media modeled now or later?** — Later (M16A Section 17); `primary_photo_file_id` suffices for MVP; `room_media` deferred.

---

## 19. Acceptance Checklist

| Item | Status |
|---|---|
| Additive migration strategy defined (Option B, Section 4) | ✅ |
| `room_buildings` design defined (Section 5) | ✅ |
| `rooms` extension design defined (Section 6) | ✅ |
| Status mapping defined incl. CHECK migration pattern (Section 7) | ✅ |
| Gender mapping defined (Section 8) | ✅ |
| Price mapping defined (Section 9) | ✅ |
| Import/backfill strategy defined (Section 10) | ✅ |
| Idempotency/rollback defined (Section 11) | ✅ |
| Compatibility strategy defined (Section 12) | ✅ |
| Migration phases defined (Section 13) | ✅ |
| SQL outline included, marked design-only (Section 14) | ✅ |
| Validation gates defined (Section 15) | ✅ |
| Public listing dependencies defined (Section 16) | ✅ |
| Next milestones defined (Section 17) | ✅ |
| No code implementation; no migration file created | ✅ |
| No migration/import/SQL executed; no terminal validation claimed | ✅ |
| No tenant PII exposure | ✅ |
| Payment Gateway / Smart Lock statuses unchanged; no production-ready claim | ✅ |

---

## 20. Verdict

### ✅ PASS — M16B-2 backend model / migration design frozen

Key outcomes: Option B frozen (new `room_buildings` + nullable-first additive `rooms` extensions); `rooms.id` and all dependent FKs preserved; `room_code` established as the canonical key with a partial-unique-first strategy; status CHECK extended additively with `requires_review` while `booked` maps to existing `reserved`; putra→male / putri→female with one-gender-per-building invariant; deterministic legacy-number backfill matching with dry-run-first, no-delete, idempotent import; six-phase rollout with per-phase safety gates and rollback notes.

Binding closing statement: no code, migration files, imports, seeds, SQL, or QA were executed. Public booking remains not production-ready; Payment Gateway remains sandbox/staging only; Smart Lock live execution remains NO-GO; production remains NOT READY.
