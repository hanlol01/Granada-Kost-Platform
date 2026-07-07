# Room Schema Audit + Import Mapping

> **Document**: ROOM_SCHEMA_AUDIT_IMPORT_MAPPING.md
> **Milestone**: M16B-1 — Existing Room Schema Audit + Import Mapping
> **Version**: 1.0
> **Date**: 2026-07-07
> **Status**: Audit/planning complete — input for M16B-2 (model/migration design) and M16B-3 (validator/dry-run)
> **Scope**: Documentation only. No backend/frontend code, no migrations, no import execution, no database seed, no mockup changes, no QA. No SQL was executed; all findings come from reading repository source (migrations, module code, seed data).

> [!IMPORTANT]
> This audit precedes any migration/import work. Its goal is to avoid destructive imports, schema conflicts, duplicate room numbers, tenant PII exposure, and breakage of existing Admin/Penghuni flows. Public booking remains **not production-ready**. Payment Gateway remains **sandbox/staging only**; Smart Lock remains **site-trial pending, live execution NO-GO**; production remains **NOT READY**. None of those statuses change here.

---

## 1. Executive Summary

- M16B-1 follows **M16A-0** (room master data normalization, PASS) and **M16A** (Room Inventory & Public Booking Architecture / UX Freeze).
- The current backend room model was audited from source: migrations `002_property_room.sql` + `004_room_master_data_alignment.sql`, the `room` module (controller/service/DTOs/types), and the deterministic seed (`core-seed.data.ts`).
- **Critical finding**: the existing seed generates 163 rooms using the **superseded gender mapping** (e.g. Unit 01 and 16 seeded as `female`; RuKost split Putra 57 / Putri 66) and the **old numbering convention** (`RK-01-01`, `AK-05A-1B`). M16A-0 corrected data (Unit 01/16 = putra; RuKost Putra 75 / Putri 48) conflicts with what is already seeded in dev/staging. The import must **correct gender on existing rows**, not just insert.
- A deterministic old↔new mapping exists: old `number` `RK-{unit}-{NN}` / `AK-{unit}-{N}{F}` maps 1:1 to new `room_code` `RK|AK-{building}-{floor}-{NNN}` via `(category, building_code, room_number)`. Existing room UUIDs (and their occupancy/invoice/complaint links) can therefore be **preserved**.
- This document does not implement code, migrations, or imports.

---

## 2. Current Backend Room Model Audit

### 2.1 Confirmed from migrations (raw SQL; no Prisma — `backend/api/prisma/` does not exist; migrations live in `backend/api/src/infrastructure/database/migrations/`)

**`rooms` (002 + 004):**

| Field | Type / Constraint |
|---|---|
| `id` | UUID PK, `gen_random_uuid()` |
| `property_id` | UUID NOT NULL FK → `properties` ON DELETE CASCADE |
| `room_type_id` | UUID nullable FK → `room_types` ON DELETE SET NULL |
| `number` | TEXT NOT NULL — **`UNIQUE (property_id, number)`** (`rooms_unique_number`) |
| `floor` | TEXT nullable (free text; **not** an A/B enum) |
| `size_label` | TEXT nullable |
| `monthly_price` | INTEGER NOT NULL, CHECK >= 0 |
| `deposit_amount` | INTEGER NOT NULL, CHECK >= 0 |
| `room_status` | TEXT NOT NULL DEFAULT `'vacant'`, CHECK IN (`vacant`,`reserved`,`occupied`,`maintenance`,`inactive`) |
| `primary_photo_file_id` | UUID nullable |
| `unit_code` | TEXT nullable (added by 004) + partial index `idx_rooms_property_unit_code` |
| `gender_policy` | TEXT NOT NULL DEFAULT `'mixed'`, CHECK IN (`male`,`female`,`mixed`) (added by 004) |
| audit columns | `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at` |

Indexes: `idx_rooms_property_status_floor_type (property_id, room_status, floor, room_type_id)`, `idx_rooms_property_unit_code`.

**Related tables:**
- `properties` (002) — property scoping root; seed has 1 property (Granada, deterministic UUID `20000000-0000-4000-8000-000000000001`).
- `room_types` (002) — `UNIQUE(property_id, name)`; seeded: `RuKost Standard`, `ApartKost Standard` (base_price 1.800.000, deposit 0, deterministic UUIDs). **Category is currently proxied via room_type name** — there is no category column.
- `room_facilities` + `room_facility_assignments` (002) — 8 facilities seeded.
- `occupancies` (003) — `room_id` FK **ON DELETE RESTRICT**; unique active occupancy per room (`idx_occupancies_one_active_room`) and per resident; `occupancy_history` and `check_in_records` also FK rooms.
- `invoices` (005) — `room_id UUID NOT NULL` FK **ON DELETE RESTRICT** plus `resident_id`, `occupancy_id` — billing depends directly on room UUIDs.
- Complaints/work orders (006) and vehicles (007) — dev seed records reference rooms by `roomNumber` (resolved to room IDs at seed time), confirming indirect dependencies. Exact FK definitions in 006/007 were not re-read column by column (see 2.3).

**Seed behavior (`seeds/core-seed.data.ts`, `scripts/seed-core.ts`):**
- Deterministic UUIDs for property/room types/facilities/users.
- `ROOM_SEEDS` generates all 163 rooms: RuKost `number = RK-{unit}-{NN}` (NN = 01..count), ApartKost `number = AK-{unit}-{1B|2B|3A|4A}`.
- **Stale gender assignments**: `RUKOST_UNITS` marks units 01, 03, 08, 09, 13, 15, 16, 17 as `female` — matching the superseded `MASTER_DATA_MAPPING.md`, i.e. RuKost Putra 57 / Putri 66. M16A-0 corrected values are Putra 75 / Putri 48 (units 01 and 16 are **putra**).
- **No floor data** in seed (`floor` left NULL); no yearly price; no `public_visible` (column absent).
- Dev-only: 10 fictional residents, 8 occupancies bound by `roomNumber` (e.g. `RK-01-01`, `RK-02-01`, `AK-18A-1B`), 8 invoices, complaints/work orders/vehicles referencing room numbers.

### 2.2 What is missing entirely

No `room_buildings` table, no `category` column, no `room_code`, no `floor_code`/`floor_label` (only free-text `floor`, currently NULL), no `yearly_price`, no `public_visible`, no `booked`/`requires_review` status values, no booking-lead table.

### 2.3 Not confirmed in this audit

- Exact SQL in `room.repository.ts` (list/availability queries) — module structure confirmed, full query text not read.
- FK details in migrations 006 (complaint), 007 (vehicle/parking), 009/010 (smart lock devices → rooms) — dependencies inferred from seed types, not re-verified column by column.
- The **actual current state of the staging database** (what has been seeded/mutated there) — cannot be verified without SQL access; the M16B-3 dry-run must report it.
- `backend/api/src/seeds/` does not exist as such; seeds live under `backend/api/src/infrastructure/database/seeds/` (confirmed). Backend module paths are singular: `modules/room/`, `modules/property/`, `modules/resident/`.

---

## 3. Existing Room API Behavior Audit

| Behavior | Current state |
|---|---|
| List rooms | `GET /api/v1/rooms` (roles owner/manager/admin, permission `room.read`); query filters: `property_id`, `status` (5-value enum), `floor`, `room_type_id`. **No gender, unit/building, category, or search filters.** |
| Availability | `GET /api/v1/rooms/availability` (admin-side aggregate, property-scoped). Not a public endpoint. |
| Create room | `POST /api/v1/rooms` (`room.manage`), full audit log. Fields per `CreateRoomDto`: number, unit_code, gender_policy, floor, size_label, prices, photo, facilities. |
| Edit room | `PATCH /api/v1/rooms/:roomId` (`room.manage`) — all fields optional incl. `number`, `unit_code`, `gender_policy`. |
| Status change | `PATCH /api/v1/rooms/:roomId/status` — enum `vacant|reserved|occupied|maintenance|inactive`. |
| Delete | **No delete endpoint exists.** (Good — no destructive surface to guard.) |
| Property owner | Separate read-only controller (`property-owner-room.controller.ts`). Residents hold `room.read` permission (seed grants) for self-scoped reads. |
| Admin frontend | `apps/admin/src/routes/rooms.tsx` renders a flat card grid; client-side text search over `number`/`unitCode`/`floor`; one status filter; labels: Terisi/Kosong/Dipesan/Maintenance/Tidak Aktif. Depends on `RoomRecord` shape from `useRooms` (camelCase of the API). |
| Frontend dependencies on number/status | Cards display `r.number` as the primary identifier and the 5-status label map; occupancy → room-status sync exists (M4 "room status sync"). Any status-enum change must keep these surfaces working. |

---

## 4. M16 Normalized Data Summary (import source)

| File | Content |
|---|---|
| `room_buildings_master.csv` | **26 buildings** — 16 RuKost (01–17, no 05) + 10 ApartKost units (05A–D, 18A–F); per-building gender, floor A/B counts, prices, `public_visible`, notes |
| `rooms_master_normalized.csv` | **163 rooms** — RuKost 123 (Putra 75 / Putri 48), ApartKost 40 (Putra 24 / Putri 16); overall Putra 99 / Putri 64; globally unique `room_code` (`RK|AK-{building}-{floor}-{NNN}`); floor A = Lantai Atas/LT.2, B = Lantai Bawah/LT.1 |
| `room_occupancy_seed_sanitized.csv` | **2 masked occupancy rows** (ApartKost 18D, rooms 13A/15A); `tenant_name_masked = <masked>`; **no tenant PII** |

Hierarchy: **category → building/unit → floor A/B → room.** Raw files (`raw/`) remain reference-only and must never be imported (calendar columns, summary rows, potential real tenant names).

---

## 5. Schema Gap Analysis

| # | Target need (M16A freeze) | Current schema | Gap / action |
|---|---|---|---|
| G-01 | `room_buildings` entity | Absent (only `rooms.unit_code` TEXT) | **Missing table** — create in M16B-2 |
| G-02 | `category` (rukost/apartkost) | Absent; proxied via `room_types.name` | **Missing column** on rooms + buildings |
| G-03 | `gender_policy` | Present (`male|female|mixed`, default `mixed`) | Exists; vocabulary mapping putra↔male / putri↔female fixed; **seeded values are stale** and must be corrected by import |
| G-04 | `floor_code` (A/B) + `floor_label` | Only free-text `floor`, NULL in seed | **Missing**; add `floor_code` CHECK (A/B) + label (or derive label) |
| G-05 | `room_code` (canonical unique key) | Absent; `number` holds old convention | **Missing column**; add with UNIQUE constraint |
| G-06 | `number` uniqueness | `UNIQUE(property_id, number)` exists | **No blocking conflict** (old numbers are also unique) but `number` ≠ `room_code`; keep both, see Section 8 |
| G-07 | `public_visible` | Absent | **Missing** on rooms + buildings; defaults per data dictionary |
| G-08 | `yearly_price` | Absent (only `monthly_price`) | **Missing column** |
| G-09 | `room_type` normalized value (`standard`) | `room_types` table exists (2 types) | Compatible — map `standard` + category → `RuKost Standard` / `ApartKost Standard` |
| G-10 | Status vocabulary incl. `booked`, `requires_review` | CHECK allows `vacant|reserved|occupied|maintenance|inactive` | **Enum mismatch** — see Section 7 |
| G-11 | Occupancy relationship | `occupancies.room_id` RESTRICT, one active per room | **Compatible** — no change needed; sanitized occupancy seed handling deferred (Section 15.7) |
| G-12 | Booking/public listing readiness | Nothing public exists | New surface (M16D); no schema conflict |

---

## 6. Import Mapping Table

### 6.1 `room_buildings_master.csv` → new `room_buildings`

| Source column | Target field | Transform | Required | Notes |
|---|---|---|---|---|
| `category` | `room_buildings.category` | as-is enum (`rukost|apartkost`) | yes | |
| `building_code` | `room_buildings.building_code` | as-is (e.g. `01`, `05A`) | yes | Part of upsert key |
| `building_name` | `room_buildings.building_name` | as-is | yes | Naming convention still open (import notes Q5) |
| `gender_policy` | `room_buildings.gender_policy` | `putra`→`male`, `putri`→`female` | yes | DB vocabulary is male/female/mixed |
| `total_rooms` | `room_buildings.total_rooms` | integer | yes | Validated vs actual room count |
| `floor_a_count` | `room_buildings.floor_a_count` | integer | yes | Validated vs rooms with floor A |
| `floor_b_count` | `room_buildings.floor_b_count` | integer | yes | Validated vs rooms with floor B |
| `monthly_price` | `room_buildings.monthly_price` | integer IDR | yes | Building-level default |
| `yearly_price` | `room_buildings.yearly_price` | integer IDR | yes | |
| `public_visible` | `room_buildings.public_visible` | boolean | yes | Building-level listing gate |
| `notes` | `room_buildings.notes` | as-is | no | Keep parsing notes (e.g. building 03 correction) |
| — | `room_buildings.property_id` | constant: Granada property UUID | yes | Deterministic seed UUID `20000000-0000-4000-8000-000000000001` |

### 6.2 `rooms_master_normalized.csv` → `rooms` (extended)

| Source column | Target field | Transform | Required | Notes |
|---|---|---|---|---|
| `category` | `rooms.category` | as-is enum | yes | New column |
| `building_code` | `rooms.building_id` | lookup `room_buildings` by (property, category, building_code) | yes | FK |
| `room_number` | `rooms.room_number` | integer | yes | New column (existing `number` is TEXT composite) |
| `room_code` | `rooms.room_code` | as-is | yes | **Canonical unique business key**; also match key to existing rows (Section 8.3) |
| `floor_code` | `rooms.floor_code` | `A|B` | yes | New column; optionally backfill legacy `floor` text |
| `floor_label` | `rooms.floor_label` (or derived) | as-is | yes | M16B-2 may derive from floor_code instead of storing |
| `gender_policy` | `rooms.gender_policy` | `putra`→`male`, `putri`→`female` | yes | **Overwrites stale seeded values** — flagged in dry-run diff |
| `room_type` | `rooms.room_type_id` | `standard` + category → `RuKost Standard` / `ApartKost Standard` UUID | yes | Existing deterministic room-type UUIDs |
| `status` | `rooms.room_status` | per Section 7 | yes | **Never downgrade an existing `occupied` row with active occupancy** (Section 8.4) |
| `monthly_price` | `rooms.monthly_price` | integer | yes | |
| `yearly_price` | `rooms.yearly_price` | integer | yes | New column |
| `public_visible` | `rooms.public_visible` | boolean | yes | New column |
| `source_row` | import log only | — | no | Traceability; not a DB column |
| `notes` | `rooms.notes` (new) or import log | as-is | no | M16B-2 decides; contains no PII (verified M16A-0) |

### 6.3 `room_occupancy_seed_sanitized.csv` → occupancy domain (deferred; see Section 15.7)

| Source column | Target | Transform | Required | Notes |
|---|---|---|---|---|
| `category`, `building_code`, `room_code` | room lookup | resolve `rooms.id` by room_code | yes | 2 rows: `AK-18D-A-013`, `AK-18D-A-015` |
| `occupancy_status` | `rooms.room_status` (+ optional `occupancies` row) | `occupied` → `occupied` | yes | Creating real `occupancies` rows requires a resident record — **masked seed has no resident identity**, so full occupancy creation is NOT possible without operations data |
| `tenant_name_masked` | **not imported** | — | no | Always `<masked>`; never stored as a resident name |
| `tenant_gender` | validation only | putra→male | no | Cross-check vs room gender |
| `rental_period_years`, `yearly_rate`, `down_payment` | import log / future lease data | — | no | No target table yet (leases deferred) |
| `check_in`, `check_out` | — | — | no | Empty in source (known data gap) |
| `source_row`, `notes` | import log only | — | no | |

> Recommendation: MVP import sets those 2 rooms' `room_status='occupied'` and `public_visible=false` **without** creating resident/occupancy rows; real occupancy records are entered via the operational check-in workflow when operations provides identity data.

---

## 7. Status Mapping (frozen)

| Normalized (M16A) | Existing DB enum | Mapping decision |
|---|---|---|
| `vacant` | `vacant` | Direct (Kosong/Vacant) |
| `occupied` | `occupied` | Direct (Terisi/Inhouse) |
| `booked` | `reserved` | **`booked` ≡ existing `reserved`.** M16B-2 decides storage: either (a) keep DB value `reserved` and present it as "booked/Dipesan" at API/UI level, or (b) migrate CHECK to add `booked` and backfill. **Recommendation: (a) for MVP** — zero data migration, no frontend breakage (Admin already labels `reserved` as "Dipesan"); revisit renaming in a later cleanup. |
| `maintenance` | `maintenance` | Direct (Out of Order) |
| `requires_review` | — (absent) | **Not supported by current CHECK.** M16A-0 output contains **0** such rows, so MVP import does not require it. M16B-2 should still add `requires_review` to the CHECK (small additive migration) so future imports can park unclear rows; never public, admin review required. |
| (existing) `inactive` | `inactive` | Retained as an admin-only state; treated like `maintenance` for public purposes (never listed). Not produced by import. |

Conclusion: the existing enum **almost** supports the frozen vocabulary; only `requires_review` requires a constraint change, and `booked`↔`reserved` is a naming decision, not a data problem.

---

## 8. Unique Key and Idempotency Strategy

### 8.1 Upsert keys (frozen)

| Entity | Upsert key |
|---|---|
| `room_buildings` | `(property_id, category, building_code)` — add UNIQUE constraint |
| `rooms` | `(property_id, room_code)` — add UNIQUE constraint on new `room_code` |

**Never key on `room_number` alone** — room numbers repeat across buildings and categories (every building has a room 1).

### 8.2 Existing `UNIQUE(property_id, number)` handling

The constraint stays; it does not block the import because legacy `number` values are already unique and are **not** the import key. Strategy: keep `number` (legacy composite, still used by Admin UI, dev seeds, complaint/vehicle references) and add `room_code` alongside it. Do **not** repurpose `number` to hold `room_code` in M16B — that would silently break every seed reference and UI display in one step. A later cleanup milestone may converge them.

### 8.3 Matching existing rows (preserve room UUIDs)

Deterministic legacy↔new mapping, both directions derivable without guesswork:

| Category | Legacy `number` | Match tuple | New `room_code` |
|---|---|---|---|
| RuKost | `RK-{unit}-{NN}` (e.g. `RK-01-05`) | (rukost, unit, room_number=NN) | `RK-{unit}-{floor}-{NNN}` (e.g. `RK-01-B-005`) |
| ApartKost | `AK-{unit}-{N}{F}` (e.g. `AK-05A-1B`) | (apartkost, unit, room_number=N; F cross-checks floor) | `AK-{unit}-{F}-{NNN}` (e.g. `AK-05A-B-001`) |

Import flow per room: resolve the existing row by parsing legacy `number` → update in place (set `room_code`, `category`, `building_id`, `floor_code`, corrected `gender_policy`, `yearly_price`, `public_visible`). If no legacy row matches, insert. **Existing room UUIDs are preserved**, so occupancies, invoices, complaints, vehicles, and files keep valid FKs.

### 8.4 Safety rules (binding)

1. **Dry-run first** — full diff report (insert/update/conflict/gender-correction list) before any write.
2. **No destructive delete** — the import never deletes rooms; DB rows with no CSV match are only *reported* as orphans.
3. **No overwrite of occupied/resident-linked rooms' status** — rows with an active occupancy keep `room_status='occupied'` regardless of CSV status, unless explicitly allowed per-row; gender corrections on such rows are flagged for manual review.
4. **Idempotent** — re-running produces zero changes after first success (upsert semantics on the keys above).
5. **Staging only first** — no production execution in the M16B track; production import is a separately gated milestone.

> [!WARNING]
> **Known conflict to expect in dev/staging**: dev seed occupancies place residents in rooms whose gender M16A-0 corrects (e.g. a female dev resident in `RK-01-01`; unit 01 was seeded `female` but is actually `putra`). The dry-run must list every room where a gender correction collides with an active occupancy's resident gender, and staging remediation (reassign dev occupancy or accept dev-only inconsistency) must be decided before import execution (M16B-4).

---

## 9. Data Safety and PII Rules (binding)

1. Normalized room master contains **no real tenant names** (verified in M16A-0) — only these files are import sources.
2. Occupancy seed uses `tenant_name_masked = <masked>` only; masked placeholders are **never** written into `residents` or any name field.
3. Public APIs must never expose tenant data, occupancy identity, or internal notes (M16A freeze Section 15.3).
4. Import logs and dry-run reports must not print PII — they reference `room_code`/`source_row` only.
5. Raw files (`raw/`, `original/`) may contain operational data and real names — reference only, never parsed by the importer.
6. Calendar columns (day 1–31) and summary rows exist only in raw files and must never be imported.

---

## 10. Migration Strategy Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Extend `rooms` only** | Add category/room_code/floor_code/public_visible/yearly_price directly; no building table | Smallest migration; no new FK | No building entity → building-level metadata (name, public_visible, notes) has nowhere to live; Unit Bangunan UX (M16A Section 8) and public grouping become denormalized queries; contradicts the freeze |
| **B — Add `room_buildings` + extend `rooms`** *(recommended)* | New `room_buildings` table + additive columns on `rooms` (`building_id` FK, `room_code` UNIQUE, `category`, `floor_code`, `floor_label` or derived, `public_visible`, `yearly_price`, optional `notes`); backfill via import | Matches the M16A frozen data model; additive-only (no column drops/renames); preserves room UUIDs and all FKs; `unit_code`/`number` stay for compatibility during transition | Requires backfill step and dual-source consistency (building_id vs unit_code) until a later cleanup |
| **C — Parallel `room_inventory` tables, migrate later** | Build new tables alongside, cut over later | Zero risk to existing tables during build | Double bookkeeping; occupancy/billing/complaints FK `rooms.id` — a parallel model cannot serve them without a risky cutover; overkill for one property / 163 rooms |

**Recommendation: Option B.** Add `room_buildings`; extend `rooms` additively; preserve existing room IDs (Section 8.3) so occupancy/billing/complaint/file relations are untouched; keep `number` and `unit_code` during transition; enforce the one-gender-per-building invariant at application level plus validator check (consistent with SEED_DATA_PLAN's approach).

---

## 11. Compatibility with Existing Features

| Feature | Impact |
|---|---|
| Occupancy / Residents | **Must not break** — room UUIDs preserved; `occupancies.room_id` RESTRICT untouched; room-status sync unaffected (existing enum values unchanged). Gender-correction vs dev-occupancy conflict flagged (Section 8.4). |
| Billing / Invoices | `invoices.room_id` NOT NULL RESTRICT — unaffected by additive changes; no invoice rewrite. |
| Complaints / Maintenance | Seeded via room numbers → room IDs; IDs preserved → unaffected. |
| Files | `primary_photo_file_id` untouched; backend-mediated file access (ADR-BE-FILE-001) unchanged. |
| Parking / Vehicles | Vehicles reference rooms via seed resolution; IDs preserved → unaffected. |
| Notifications | No direct room FK dependency observed; unaffected. |
| Admin dashboard / Reports | Availability/occupancy selectors keep working (status enum stable); new fields are additive; flat `/rooms` page keeps functioning until M16C replaces it. |
| Penghuni app | Residents hold `room.read` for self-scoped reads; no breaking field removal. |
| **Payment Gateway** | **Unaffected** — billing keys off invoice/occupancy/room UUIDs, all preserved. Status remains sandbox/staging ready, not production-ready; **unchanged**. |
| **Smart Lock** | **Unaffected and live disabled** — device–room mappings key off room UUIDs, preserved. Status remains site-trial pending, live execution NO-GO; **unchanged**. |

---

## 12. Public Listing API Readiness (target for M16D)

The backend must eventually support (per M16A freeze Sections 12/15):

- **Aggregated availability** by gender × category × building (counts, not room lists).
- **Safe public fields only**: category, gender label, building/group title, floor label, available count, price-from, facility chips. No tenant data, no notes, no audit data, no internal IDs beyond routing needs.
- **Hide** `occupied`, `booked`/`reserved`, `maintenance`, `inactive`, `requires_review`, and anything with `public_visible=false` (room or building level).
- **Backend-enforced gender filter** — the query parameter is validated and applied server-side; frontend filtering is UX-only.
- **No exact room number by default in MVP** — group-level aggregation only.
- **WhatsApp CTA data fields**: category label, gender label, unit/group title, price, listing URL — all derivable from `room_buildings` + aggregate counts; no per-room exposure required.

Option B's `room_buildings` table makes the aggregation query natural (`GROUP BY building_id, floor_code` over vacant + visible rooms).

---

## 13. Import Validation Plan (M16B-3 validator checks)

| # | Check | Expected |
|---|---|---|
| V-01 | `room_buildings_master.csv` row count | 26 (16 rukost + 10 apartkost) |
| V-02 | `rooms_master_normalized.csv` row count | 163 |
| V-03 | Duplicate `room_code` | 0 |
| V-04 | Category totals | rukost 123, apartkost 40 |
| V-05 | Gender totals | putra 99 / putri 64; rukost 75/48; apartkost 24/16 |
| V-06 | `total_rooms` per building = count of room rows per building | all 26 match |
| V-07 | `floor_a_count`/`floor_b_count` per building = rooms per floor | all match |
| V-08 | Tenant PII scan (name-like values, non-`<masked>` tenant fields) | 0 hits |
| V-09 | Calendar columns (day 1–31 headers) | absent |
| V-10 | Summary/aggregation rows | absent |
| V-11 | Status values ∈ {vacant, occupied, booked, maintenance, requires_review} | all valid |
| V-12 | Price values: integers > 0; yearly = monthly × 12 (warn if not) | all valid |
| V-13 | `public_visible` ∈ {true, false}; occupied/maintenance rows are false | all valid |
| V-14 | Gender consistency: every room's gender matches its building's gender | 0 violations |
| V-15 | **Dry-run diff report** vs target DB: inserts / updates / unchanged / gender corrections / orphan DB rows / legacy-number rows that fail to parse | report generated, reviewed before execution |
| V-16 | **Existing DB conflict report**: rooms with active occupancy whose CSV status or corrected gender conflicts (Section 8.4) | report generated; conflicts resolved or explicitly accepted before M16B-4 |

Validator failure on V-01..V-14 blocks the import. V-15/V-16 outputs are review gates.

---

## 14. Recommended M16B Implementation Breakdown

| Milestone | Scope |
|---|---|
| **M16B-2** | Backend Model/Migration Design — `room_buildings` DDL, additive `rooms` columns/constraints (`room_code` UNIQUE, `category`, `building_id`, `floor_code`, `public_visible`, `yearly_price`, CHECK addition for `requires_review`), booked/reserved presentation decision |
| **M16B-3** | CSV Validator + Dry-run Import Script — all V-01..V-16 checks, diff/conflict reports, idempotent upsert implementation (not executed against staging yet) |
| **M16B-4** | Staging Import Execution — gated on V-15/V-16 review; staging only; evidence recorded |
| **M16B-5** | API Contract Update for Admin Room Inventory — summary/buildings/rooms endpoints per M16A Section 15.1 |
| **M16C** | Admin Room Management Redesign (frontend) |

---

## 15. Open Questions

1. **Old seed rooms: replace or map?** — Recommendation: **map** (Section 8.3, preserve UUIDs); replacement would orphan occupancy/invoice/complaint FKs. Confirm in M16B-2.
2. **Are existing resident/invoice/complaint records linked to current room IDs in staging?** — Dev seed says yes (8 occupancies + 8 invoices + complaints/vehicles). Actual staging state unverified from source; the dry-run must report it.
3. **Should `rooms.number` keep the old value?** — Recommendation: yes during transition (Admin UI + seed references); converge with `room_code` in a later cleanup.
4. **How to handle duplicate room numbers?** — None exist today (legacy composite numbers are unique); the validator still enforces V-03 and the dry-run reports any parse failures.
5. **Should `public_visible` default to true for all vacant rooms?** — CSV already encodes this rule; confirm as the ongoing default for newly created rooms.
6. **Future room types beyond `standard`?** — Unknown (A/B ApartKost differentiation unconfirmed); schema stays compatible via `room_types`.
7. **Import the 2 sanitized occupied rows now or defer?** — Recommendation: set room status/visibility only, **defer** occupancy-record creation until operations supplies identity + dates (Section 6.3).
8. **Does every room really have the same monthly/yearly price?** — Yes in data (1.8jt/21.6jt) but management confirmation on tiering is pending (inherited question).
9. **Should room photos be stored before public listing?** — `primary_photo_file_id` exists; media management is a later phase (M16A Section 17); MVP uses placeholders.
10. **Exact room number hidden from public by policy?** — Frozen yes for MVP (M16A Section 12); revisit only with explicit product approval.

---

## 16. Acceptance Checklist

| Item | Status |
|---|---|
| Current schema audited from migrations/module source (Section 2) | ✅ |
| Current API behavior audited (Section 3) | ✅ |
| Normalized data summarized (Section 4) | ✅ |
| Schema gaps identified (Section 5) | ✅ |
| Import mapping table created (Section 6) | ✅ |
| Status mapping defined (Section 7) | ✅ |
| Unique key / idempotency strategy defined (Section 8) | ✅ |
| PII rules defined (Section 9) | ✅ |
| Migration strategy options documented + recommendation (Section 10) | ✅ |
| Compatibility risks documented (Section 11) | ✅ |
| Public API readiness noted (Section 12) | ✅ |
| Validation plan defined (Section 13) | ✅ |
| Next milestones defined (Section 14) | ✅ |
| No code implementation | ✅ (documentation only) |
| No migration/import executed; no SQL run; no terminal validation claimed | ✅ |
| No tenant PII exposed | ✅ |
| Payment Gateway / Smart Lock statuses unchanged | ✅ |

---

## 17. Verdict

### ✅ PASS — M16B-1 audit and import mapping complete

Key outcomes: current `rooms` schema fully characterized (including `UNIQUE(property_id, number)`, 5-value status CHECK, migration-004 `unit_code`/`gender_policy`); **stale seeded gender assignments and legacy numbering identified as the main data-correction workload**; deterministic legacy↔new mapping defined that preserves room UUIDs and all occupancy/billing/complaint relations; Option B (add `room_buildings` + extend `rooms` additively) recommended; idempotent, staging-only, dry-run-first import strategy with 16 validator checks frozen for M16B-3.

Binding closing statement: no code, migrations, imports, seeds, or QA were executed; no SQL was run. Public booking remains not production-ready; Payment Gateway remains sandbox/staging only; Smart Lock live execution remains NO-GO; production remains NOT READY.
