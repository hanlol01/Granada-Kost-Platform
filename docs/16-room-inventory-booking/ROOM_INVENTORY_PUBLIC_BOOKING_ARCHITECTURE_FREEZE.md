# Room Inventory & Public Booking Architecture / UX Freeze

> **Document**: ROOM_INVENTORY_PUBLIC_BOOKING_ARCHITECTURE_FREEZE.md
> **Milestone**: M16A — Room Inventory & Public Booking Architecture / UX Freeze
> **Version**: 1.0
> **Date**: 2026-07-07
> **Status**: FROZEN — binding for M16B..M16H
> **Scope**: Documentation/planning only. No backend code, no frontend code, no migrations, no database seed, no mockup changes, no QA execution.

> [!IMPORTANT]
> This document freezes the product, data, UX, and architecture direction for the redesigned Admin Room Management and the Public Room Listing / WhatsApp Booking MVP. It does **not** implement anything. Public booking is **not** production-ready. Payment Gateway remains **sandbox/staging ready, not production-ready** (M15C). Smart Lock remains **"ready for controlled site trial preparation, execution pending"** with live execution **NO-GO** (M13F-D). Production remains **NOT READY** (M14F). None of those statuses are changed by this document.

---

## 1. Executive Summary

- M16A follows **M16A-0 Room Master Data Cleanup / Normalization**, which completed with verdict **PASS** (`docs/05-master-data/room-master/ROOM_MASTER_IMPORT_NOTES.md`). The normalized data (163 rooms, 26 buildings/units, 0 duplicate `room_code`, 0 PII exposure) is the canonical data basis for this freeze.
- The current Admin Kamar page (`apps/admin/src/routes/rooms.tsx`) renders all rooms as a **flat card list** with only text search and a single status filter. This is insufficient for 163 rooms across 2 categories, 26 buildings/units, 2 floors, and 2 gender policies.
- Room Inventory must be organized by **category (Rumah Kost / Apart Kost) → gender (Putra / Putri) → building/unit → floor (A/B) → room**, with status and public visibility as first-class attributes.
- The Public Listing must recommend **only rooms matching the visitor's selected gender**, enforced backend-side.
- The Public Booking MVP uses **WhatsApp admin confirmation**. The **Payment Gateway is not used for the booking MVP** (it remains sandbox/staging only per M15C and must not be wired into public booking in this phase).
- This document does not implement code, does not create migrations, does not seed the database, and does not mark anything production-ready.

---

## 2. Current Baseline

| Area | Baseline |
|---|---|
| Admin Kamar page | Flat responsive card grid (`apps/admin/src/routes/rooms.tsx`): search by number/unit/floor, one status dropdown, edit dialog, status-change dropdown. No grouping. |
| Category separation | Rumah Kost vs Apart Kost is **not** visible or filterable in the Admin UI. |
| Building/unit hierarchy | `unit_code` exists on rooms (backend `room` module + migration 004 per `SEED_DATA_PLAN.md`) but there is **no building/unit entity** and no hierarchy in the UI. |
| Gender policy | `gender_policy` exists at the data level but is not surfaced in Admin UI and there is no public gender filter. |
| Public listing/booking | **Does not exist**. `apps/penghuni` is an authenticated resident PWA with no public (unauthenticated) surface. Booking was listed as a Phase 2 surface (M11J) and was never frozen. |
| Payment Gateway | Sandbox/staging ready (M15C, E2E QA PASS); **production payment activation pending; not production-ready**. Not used for booking MVP. |
| Smart Lock | Separate track; frozen at "ready for controlled site trial preparation, execution pending"; live execution NO-GO. Out of scope for M16. |
| Production | NOT READY (M14F). Unchanged by this document. |

---

## 3. Normalized Room Data Basis (M16A-0, validated PASS)

Source of truth: `docs/05-master-data/room-master/normalized/` + `ROOM_MASTER_DATA_DICTIONARY.md` + `ROOM_MASTER_IMPORT_NOTES.md`.

| Fact | Value |
|---|---|
| Total rooms | **163** |
| RuKost | **123 rooms** — Putra **75**, Putri **48**, **16 buildings** (01–17, no 05) |
| ApartKost | **40 rooms** — Putra **24**, Putri **16**, **10 units** (05A–05D, 18A–18F) |
| Overall gender | Putra **99**, Putri **64** |
| Floor codes | `A` = **Lantai Atas / LT.2**, `B` = **Lantai Bawah / LT.1** |
| Gender policy | One building/unit has exactly **one** gender policy (no mixed buildings in dataset) |
| room_code | Globally unique, format `RK|AK-{building_code}-{floor_code}-{NNN}` (e.g. `RK-01-B-001`, `AK-05A-B-001`); **0 duplicates** |
| Tenant PII | **Masked/omitted** in all normalized files; occupancy seed uses `<masked>` only |
| Separation | Room master (buildings + rooms) is **separated** from occupancy state (`room_occupancy_seed_sanitized.csv`, 2 sanitized rows in 18D) |
| Pricing | Uniform Rp 1.800.000/bulan, Rp 21.600.000/tahun (default; tiering unconfirmed) |

> [!WARNING]
> The older `docs/05-master-data/MASTER_DATA_MAPPING.md` and `SEED_DATA_PLAN.md` (v1.0, 2026-06-17) contain **superseded gender assignments** (e.g. RuKost Putra 57 / Putri 66; Unit 01 and 16 listed as Putri) and an older room-number convention (`RK-01-01`, `AK-05A-1B`). **This freeze supersedes those values.** The M16A-0 normalized data and the `room_code` format above are canonical for M16B onward. Any earlier seed based on the old mapping must be reconciled during import (Section 16).

---

## 4. Admin Sidebar / Navigation Freeze

### 4.1 Frozen structure (target)

`Kamar` becomes an **expandable/dropdown group** in the Admin sidebar:

```
Kamar ▾
├── Ringkasan Kamar          (/rooms — summary dashboard, default landing)
├── Rumah Kost               (/rooms/rukost)
├── Apart Kost               (/rooms/apartkost)
├── Unit Bangunan            (building/unit metadata — see 4.3)
└── Ketersediaan / Booking   (/rooms/booking — availability + booking leads)
```

### 4.2 MVP decision

**MVP = the preferred structure, with one scope reduction**: `Unit Bangunan` is implemented as a **tab inside Ringkasan Kamar** rather than a separate sidebar item. The sidebar therefore shows **4 items** in MVP:

1. Ringkasan Kamar
2. Rumah Kost
3. Apart Kost
4. Ketersediaan / Booking

Rationale:
- Category pages (Rumah Kost / Apart Kost) are the daily operational surfaces and deserve top-level entries.
- Building/unit metadata is low-frequency management; a tab avoids sidebar clutter while keeping the data reachable.
- `Ketersediaan / Booking` is required for the WhatsApp lead workflow even in MVP (it may start as a read-only availability view; stored leads arrive in M16F).
- The alternative structure (`Ringkasan / Rumah Kost / Apart Kost / Booking Lead`) is acceptable as a fallback if implementation pressure requires it, but the frozen MVP is the 4-item structure above because `Ketersediaan / Booking` names the availability view, not only leads.

### 4.3 Routing rules

- The existing flat `/rooms` route **becomes Ringkasan Kamar** (summary). No dead route; existing links keep working.
- Category pages live under `/rooms/rukost` and `/rooms/apartkost`.
- `Unit Bangunan` is a tab at `/rooms` (MVP) and may be promoted to its own sidebar page in a later phase without redesign.
- Do not add per-building or per-floor sidebar entries — that hierarchy lives inside the pages.

---

## 5. Admin Ringkasan Kamar UX (frozen)

### 5.1 Summary cards (top strip)

| Card | Content |
|---|---|
| Total Kamar | 163 (from live data, not hardcoded) |
| Rumah Kost | total / tersedia (vacant) / terisi (occupied) / dipesan (booked) / maintenance |
| Apart Kost | total / tersedia / terisi / dipesan / maintenance |
| Putra | total / tersedia |
| Putri | total / tersedia |
| Okupansi | occupied ÷ total (%) |
| Booking Lead Pending | count of leads with status `new`/`contacted` (placeholder "—" until M16F) |
| Kamar Publik | count of `public_visible=true` rooms |

### 5.2 Charts / breakdown cards

| Chart | Purpose |
|---|---|
| Category split (donut/bar) | RuKost 123 vs ApartKost 40 |
| Gender split (donut/bar) | Putra 99 vs Putri 64, optionally per category |
| Status split (stacked bar) | vacant / occupied / booked / maintenance / requires_review |
| Floor A/B split (bar, optional) | Useful because several ApartKost units are single-floor (e.g. 05A–05B all B; 05C–05D, 18D–18F all A) |

### 5.3 Rules

- Numbers must come from the same backend source the category pages use (single source of truth; mirrors the M11G shared-selector principle).
- `requires_review` rooms, if any, must be surfaced with a warning badge on this page.
- The `Unit Bangunan` tab lives on this page in MVP (Section 8).

---

## 6. Admin Rumah Kost Page UX (frozen)

### 6.1 Filters

| Filter | Values |
|---|---|
| Gender | Putra / Putri / Semua |
| Building | `building_code` select (01–17, from buildings data) |
| Floor | A (Lantai Atas / LT.2) / B (Lantai Bawah / LT.1) / Semua |
| Status | vacant / occupied / booked / maintenance / requires_review / Semua |
| Publik | public_visible true / false / Semua |
| Search | `room_code` or `room_number` |

### 6.2 Grouping

Group **by building**, then **by floor**, then room cards/table rows:

```
▸ Unit 01 — Putra — 11 kamar (B:5, A:6) — 11 tersedia
    Lantai Bawah / LT.1 (B): [RK-01-B-001] [RK-01-B-002] ...
    Lantai Atas / LT.2 (A):  [RK-01-A-006] [RK-01-A-007] ...
▸ Unit 02 — Putra — 8 kamar (B:4, A:4) — ...
```

Building group headers must show: building code + name, gender badge, floor composition (e.g. `B:5 A:6`), and availability count per floor — so the admin can see "building 01 Putra, B:5 A:6" at a glance.

### 6.3 Room card/table fields

`room_code`, `building_code`/`building_name`, `room_number`, `floor_label`, `gender_policy` (badge), `status` (badge), `monthly_price`, `public_visible` (toggle indicator), actions: **Detail / Edit / Public toggle**.

### 6.4 MVP editing scope

If full room editing is too large, MVP editing is limited to: **status, public_visible, monthly_price/yearly_price, notes**. Structural fields (`room_code`, `building_code`, `floor_code`, `gender_policy`) are import-managed in MVP and read-only in the UI. Backend remains the final policy enforcement point.

---

## 7. Admin Apart Kost Page UX (frozen)

Same structure as Section 6, adapted to ApartKost:

- **Filters**: gender (Putra/Putri/Semua), `unit_code` (05A–05D, 18A–18F), floor A/B, status, public_visible, search.
- **Grouping**: by Apart unit code (e.g. `05A`, `18D`), then floor. Note: many ApartKost units are single-floor; the floor sub-group collapses naturally when only one floor exists.
- **Card/table fields**: `room_code`, `unit_code`, `room_number`, `floor_label`, `gender_policy`, `status`, `monthly_price`, `public_visible`, actions (Detail / Edit / Public toggle).
- The 2 occupied rooms (18D: `AK-18D-A-013`, `AK-18D-A-015`) must render as `occupied` with **no tenant name anywhere** (occupancy detail links to the existing occupancy/resident surfaces where RBAC applies).

---

## 8. Admin Unit Bangunan Page / Section (frozen)

**Decision**: a **tab inside Ringkasan Kamar** for MVP (Section 4.2); may become its own page later without redesign.

### 8.1 Fields (table)

| Field | Notes |
|---|---|
| category | rukost / apartkost |
| building_code | e.g. 01, 05A, 18D |
| building_name | e.g. "RuKost Unit 01" |
| gender_policy | putra / putri (badge) |
| total_rooms | from data |
| floor_a_count / floor_b_count | LT.2 / LT.1 |
| available_count / occupied_count | derived from room statuses |
| public_visible | building-level listing visibility |
| notes | parsing notes / corrections (e.g. building 03 header typo correction) |

### 8.2 Purpose

- Manage building/unit-level metadata (name, notes, building-level `public_visible`).
- Support public listing grouping (public cards are building/group-level, Section 12).
- Avoid editing 163 rooms one by one for building-wide changes (e.g. hiding a whole building from public listing).

---

## 9. Room Status Model (frozen)

### 9.1 Normalized statuses

`vacant` · `occupied` · `booked` · `maintenance` · `requires_review`

### 9.2 Legacy/existing mapping

| Legacy / existing | Normalized |
|---|---|
| Kosong / `Vacant` | `vacant` |
| Terisi / `Inhouse` | `occupied` |
| Dipesan / `Booking` / `Booked` / existing backend `reserved` | `booked` |
| `Out of Order` / Maintenance | `maintenance` |
| Existing backend `inactive` | `maintenance` for public purposes (hidden); retain `inactive` internally until M16B decides consolidation |
| Unclear / unmapped | `requires_review` |

> M16B must resolve the `reserved`/`inactive` (existing backend enum) vs `booked`/`requires_review` (normalized) reconciliation in the schema. This freeze fixes the **product-level** status vocabulary above.

### 9.3 Public listing rules (binding)

| Status | Public behavior |
|---|---|
| `vacant` + `public_visible=true` + building `public_visible=true` | May appear publicly (as availability) |
| `vacant` + `public_visible=false` | Hidden |
| `occupied` | **Never** shown as available; excluded from availability counts |
| `booked` | **Hidden for MVP** (frozen decision; "shown as unavailable" is a later experiment) |
| `maintenance` | Hidden |
| `requires_review` | Hidden |

---

## 10. Public Listing MVP Flow (frozen)

### 10.1 Frozen flow — hero filter, no mandatory popup

1. Visitor lands on the public listing page.
2. Hero section asks: **"Cari kamar untuk siapa?"** with two primary buttons: **Putra** / **Putri**.
3. Optional category filter: **Rumah Kost / Apart Kost / Semua**.
4. Available room-group cards render, filtered by selected gender (and category if chosen).
5. Visitor opens a card detail.
6. Visitor taps the WhatsApp CTA (**"Tanya Ketersediaan"** / **"Booking via WhatsApp"**) with a prefilled message (Section 13).

### 10.2 Why hero filter over popup (frozen rationale)

- **Less intrusive** — no modal blocking first contentful view.
- **Mobile friendly** — large tap targets in the hero, no dismiss friction.
- **Easier to change selection** — gender is a persistent, visible control, not a one-shot dialog.
- **Better SEO/landing page experience** — content is crawlable and shareable; a popup gate hides content from crawlers and previews.

A gender popup may be tested **later as an optional experiment only**; it is not part of the frozen MVP.

---

## 11. Public Listing Page Structure (frozen)

### 11.1 URL plan

| URL | Purpose |
|---|---|
| `kostation.com` | Marketing landing (hero + gender selector) |
| `kostation.com/kamar` | Full listing |
| `kostation.com/kamar?gender=putra` | Putra-filtered listing (shareable) |
| `kostation.com/kamar?gender=putri` | Putri-filtered listing (shareable) |

> Domain availability and whether MVP launches on a subdomain (e.g. under `kostation.web.id`) is an open question (Section 20). The URL **shape** is frozen; the host is not.

### 11.2 Page sections (top to bottom)

1. Hero (value proposition + property identity)
2. Gender selector ("Cari kamar untuk siapa?" — Putra / Putri)
3. Category filter (Rumah Kost / Apart Kost / Semua)
4. Room availability cards (gender-filtered)
5. Facility/benefits section
6. WhatsApp CTA (repeated, sticky on mobile)
7. FAQ

### 11.3 Public room card fields (frozen)

| Field | Notes |
|---|---|
| Title | Group-level, e.g. "Rumah Kost Putra — Unit 01" |
| Category | Rumah Kost / Apart Kost |
| Gender label | Putra / Putri |
| Floor label | Lantai Atas / Lantai Bawah, when relevant to the group |
| Available count | e.g. "3 kamar tersedia" |
| Price | "Mulai Rp 1.800.000/bulan" |
| Photos | **Placeholder** in MVP (media management is a later phase) |
| Facilities | Baseline facility chips |
| CTA | "Tanya Ketersediaan" / "Booking via WhatsApp" |

---

## 12. Public Visibility and Exact Room Number Decision (frozen for MVP)

**Frozen MVP decision**: the public sees **room type/group/availability counts**, **not exact room numbers**. Exact room assignment is confirmed by the admin via WhatsApp.

- Public cards aggregate at building/unit + floor + gender level (e.g. "Unit 01 Putra — Lantai Bawah — 3 kamar tersedia"), never `RK-01-B-003`.
- For ApartKost or premium units, exact room detail **may** be shown later **only with explicit product approval** (open question 20.1).

Rationale:
- **Avoids operational mismatch** — a room can be taken between page view and WhatsApp contact; counts degrade gracefully, exact numbers do not.
- **Avoids exposing internal layout** — room-level codes reveal internal structure unnecessarily.
- **Admin keeps control of final assignment** — consistent with the WhatsApp-confirmation MVP and with backend-as-final-authority.

This resolves (for MVP) the open question recorded in `ROOM_MASTER_DATA_DICTIONARY.md` Section 12.1 and `ROOM_MASTER_IMPORT_NOTES.md` Section 8.1.

---

## 13. WhatsApp Booking Lead Flow (frozen)

### 13.1 MVP flow

Visitor selects: gender → category → room group/card → (optional) name/phone/message → taps WhatsApp CTA → WhatsApp opens with a prefilled message to the admin number.

### 13.2 Frozen message template

```
Halo Admin Kostation, saya tertarik booking kamar:
- Kategori: {Rumah Kost/Apart Kost}
- Untuk: {Putra/Putri}
- Unit/Tipe: {unit/building/type if public}
- Harga: {price}
- Link: {public listing URL}
Mohon info ketersediaan dan proses bookingnya.
```

### 13.3 Lead storage

- **MVP**: a direct `wa.me` link with the prefilled template is acceptable — no stored lead, no new backend surface.
- **Recommended later phase (M16F)**: store `booking_leads` with selected room/group, gender, contact name/phone, message, `status` (`new` / `contacted` / `confirmed` / `cancelled` / `converted`), `source` (`website` / `whatsapp`). Admin manages leads in `Ketersediaan / Booking`.
- Lead contact data is PII: backend-mediated only, property-scoped, never public, aligned with existing security principles.

---

## 14. Data Model Outline (conceptual — no migration in M16A)

Entities: category enum (`rukost`/`apartkost`) — a separate `accommodation_categories` table is unnecessary; `room_buildings`; existing `room_types`; `rooms` (extended); `room_public_profiles` **or** public listing fields on rooms/buildings (M16B decides; fields-on-entity preferred for MVP); `room_media` (later phase); `room_booking_leads` (M16F); `room_availability_view` or derived query for public aggregation.

### 14.1 `room_buildings`

`id`, `property_id`, `category`, `building_code`, `building_name`, `gender_policy`, `total_rooms`, `floor_a_count`, `floor_b_count`, `public_visible`, `notes`

### 14.2 `rooms` (target shape)

`id`, `property_id`, `building_id`, `category`, `room_code` (unique), `room_number`, `floor_code` (A/B), `floor_label`, `gender_policy`, `room_type_id`, `status`, `monthly_price`, `yearly_price`, `public_visible`, `notes`

> M16B must reconcile with the existing `rooms` table (`number` with `UNIQUE(property_id, number)`, `unit_code`, `gender_policy` male/female/mixed, `floor`, `room_status` including `reserved`/`inactive`). Binding constraints: `room_code` becomes the canonical unique business key; `building_id` references `room_buildings`; gender vocabulary mapping putra↔male / putri↔female is fixed; invariant "all rooms in one building share one gender_policy" is enforced (application-level minimum).

### 14.3 `room_booking_leads` (later phase)

`id`, `property_id`, `room_id` (nullable — group-level leads have no exact room), `category`, `gender`, `contact_name` (nullable), `contact_phone` (nullable), `message`, `source`, `status`, `created_at`

---

## 15. API Plan (frozen surface; implementation M16B/M16D)

### 15.1 Admin APIs (RBAC + property scope mandatory)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/room-inventory/summary` | Ringkasan Kamar cards/charts |
| GET | `/api/v1/admin/room-buildings` | Unit Bangunan table |
| GET | `/api/v1/admin/rooms?category=&gender=&building=&floor=&status=` | Filtered/grouped room lists |
| PATCH | `/api/v1/admin/rooms/:id` | MVP-limited edit (status/price/notes) |
| PATCH | `/api/v1/admin/rooms/:id/public-visibility` | Public toggle |
| GET | `/api/v1/admin/booking-leads` | Lead list (M16F) |
| PATCH | `/api/v1/admin/booking-leads/:id/status` | Lead status transitions (M16F) |

### 15.2 Public APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/public/rooms/availability?gender=&category=` | Aggregated availability (group-level) |
| GET | `/api/v1/public/rooms/:publicSlug` or `/api/v1/public/room-groups/:id` | Group detail |
| POST | `/api/v1/public/booking-leads` | Optional, later phase (M16F), rate-limited |

### 15.3 Binding rules

- Public API exposes **only safe fields** — no tenant names, no occupied-room personal data, no internal audit data, no `notes`, no internal IDs beyond what routing needs.
- **Gender filter is enforced backend-side**; frontend filtering is UX-only.
- Public listing returns only `vacant` + `public_visible=true` rooms **as aggregated availability** (per Sections 9.3 and 12).
- Public endpoints are unauthenticated but rate-limited (Redis, consistent with existing rate-limit usage) and never expose exact `room_code` in MVP.
- Backend remains the final policy enforcement point in all cases.

---

## 16. Import Strategy (documented; execution is a later milestone)

The normalized CSVs are the import source: `room_buildings_master.csv` (26 buildings), `rooms_master_normalized.csv` (163 rooms), `room_occupancy_seed_sanitized.csv` (2 sanitized rows). **Raw files must never be imported** (calendar columns, summary rows, real tenant names — per data dictionary Section 10).

Frozen import approach for the next import milestone (M16B):

1. **Validate CSVs in a script** — totals must match Section 3 exactly (163 / 123+40 / 99+64 / 26 buildings / 0 duplicate `room_code`).
2. **Dry-run import report** — produce a diff report (creates/updates/conflicts) before any write.
3. **Seed staging only first** — no production write in this track.
4. **Never overwrite existing production data** — production import requires its own gated milestone with stakeholder approval.
5. **Idempotent upsert keyed by `room_code` / (`category`,`building_code`)** — re-runs are safe; `ON CONFLICT` semantics, consistent with SEED_DATA_PLAN principles.
6. **Reconcile legacy seed** — rooms previously seeded from the superseded mapping (old numbering `RK-01-01`, stale gender assignments) must be mapped or replaced explicitly in the dry-run report; the M16A-0 gender assignments win.

---

## 17. MVP vs Later Phase (frozen split)

| MVP (M16B–M16E core) | Later phase |
|---|---|
| Admin sidebar dropdown (4 items) | Stored booking leads + Admin lead management (M16F) |
| Ringkasan Kamar (cards + charts + Unit Bangunan tab) | Photo/media management (`room_media`) |
| Rumah Kost page (filters, building→floor grouping) | Room type package / facility catalog |
| Apart Kost page (filters, unit→floor grouping) | Booking fee with Payment Gateway (**only after production payment activation — separate gated track**) |
| Basic filters + search | Availability calendar |
| `public_visible` flag (room + building) | SEO landing pages per category/gender |
| Public listing by gender/category (aggregated) | Admin assignment workflow (lead → room → occupancy) |
| WhatsApp booking CTA (direct link, template) | Public exact room selection (only if approved) |
| **No online booking payment** | CCTV — separate milestone entirely (unchanged status) |

---

## 18. Risks and Controls

| # | Risk | Control |
|---|---|---|
| R-01 | Gender mismatch (visitor sees/books wrong-gender room) | Backend-enforced gender filter on public API; gender badge everywhere in Admin; one-gender-per-building invariant |
| R-02 | Public/private data leak (tenant PII, internal fields) | Public API safe-field allowlist; no tenant names anywhere public; normalized data already PII-masked; no `notes`/audit data public |
| R-03 | Stale availability (room taken after page load) | Aggregated counts instead of exact rooms; admin WhatsApp confirmation is the authoritative step; short cache TTL on public availability |
| R-04 | Race condition between public lead and admin assignment | Admin final confirmation before any `booked` transition; `booked` hidden from public; lead status workflow in M16F |
| R-05 | Exposing exact room numbers | Frozen MVP decision: group-level only (Section 12) |
| R-06 | Duplicate room data on import | Idempotent upsert by unique `room_code`; validation totals; dry-run report |
| R-07 | Manual Excel drift (operations keep editing Excel) | Normalized CSVs declared canonical; import milestone re-validates totals; raw kept as reference only |
| R-08 | Conflict with existing room schema (`number`/`reserved`/`inactive`, old seed) | Explicit M16B reconciliation task + legacy mapping table (Sections 9.2, 14.2, 16.6) |
| R-09 | Production readiness overclaim | Binding wording: public booking MVP is **not production-ready**; Payment Gateway status unchanged; Smart Lock status unchanged; production remains NOT READY |

Cross-cutting controls: backend gender filtering, `public_visible` flags (room + building), no tenant PII public, admin final confirmation, normalized import with validation, WhatsApp MVP **before** any payment booking, staging first.

---

## 19. Implementation Milestone Breakdown (recommended)

| Milestone | Scope |
|---|---|
| **M16B** | Backend Room Inventory Model / Import Mapping — schema reconciliation (`room_buildings`, room extensions, status vocabulary), CSV validation + dry-run import (staging only) |
| **M16C** | Admin Room Management Redesign — sidebar dropdown, Ringkasan Kamar, Rumah Kost + Apart Kost pages, Unit Bangunan tab, public toggle |
| **M16D** | Public Room Listing API — aggregated availability endpoints, safe-field contract, rate limiting |
| **M16E** | Public Website Room Listing + WhatsApp CTA — hero filter, cards, template link |
| **M16F** | Booking Lead MVP / Admin Lead Management — `room_booking_leads`, lead status workflow, Ketersediaan/Booking page completion |
| **M16G** | QA / Staging Validation — executed externally per project workflow; includes public-leakage checks |
| **M16H** | Documentation / Release Update — governance refresh, release wording |

Each milestone keeps the binding non-goals: no production seed, no payment booking, no Smart Lock changes.

---

## 20. Open Questions

1. Should the public ever see **exact room numbers** (ApartKost/premium)? MVP: no (Section 12); revisit with product approval.
2. Is the **WhatsApp admin number fixed per property**, or routed (e.g. per category/gender)?
3. Are **room photos** available now, or does MVP launch with placeholders?
4. Are room types/prices **all standard at Rp 1.800.000/bulan**, or is tiering planned (floor/type/A-vs-B ApartKost)?
5. Should occupied rooms ever be shown as **"penuh"** publicly, or always hidden? (MVP: excluded from counts; buildings with 0 availability show "penuh" at group level — confirm.)
6. Should booking leads be **stored in the database in MVP**, or is the direct WhatsApp link sufficient until M16F?
7. Does the public website use the **current app frontends or a separate marketing app/domain**? (Recommended: separate lightweight public surface; decide in M16E planning.)
8. Is **kostation.com** already available, or will the public listing launch on a subdomain (e.g. under `kostation.web.id`) first?
9. Should RuKost and ApartKost use **separate public pages** or one page with a category filter? (MVP frozen: one page + filter; separate SEO pages are a later phase.)
10. Confirmation items inherited from M16A-0: building 03 layout (B:4 A:4) and check-in/check-out dates for the 2 occupied 18D rooms (operations team).

---

## 21. Acceptance Checklist

| Item | Status |
|---|---|
| Admin navigation frozen (Section 4) | ✅ |
| Admin summary UX frozen (Section 5) | ✅ |
| RuKost/ApartKost UX frozen (Sections 6–7) | ✅ |
| Unit Bangunan decision frozen (Section 8) | ✅ |
| Room status model frozen (Section 9) | ✅ |
| Public listing flow frozen (Sections 10–11) | ✅ |
| Room-number visibility decision frozen (Section 12) | ✅ |
| WhatsApp booking MVP frozen (Section 13) | ✅ |
| Data model outline frozen (Section 14) | ✅ |
| API plan frozen (Section 15) | ✅ |
| Import strategy documented (Section 16) | ✅ |
| MVP/later phase separated (Section 17) | ✅ |
| Risks documented (Section 18) | ✅ |
| No code implementation | ✅ (documentation only) |
| No migrations / no database seed | ✅ |
| No mockup changes | ✅ |
| No QA executed / no terminal validation claimed | ✅ |
| No tenant PII exposure | ✅ |
| No production-ready claim for public booking | ✅ |
| Smart Lock / Payment Gateway statuses unchanged | ✅ |

---

## 22. Verdict

### ✅ PASS — M16A Architecture / UX Freeze complete

- **Files created/updated**: this document (`docs/16-room-inventory-booking/ROOM_INVENTORY_PUBLIC_BOOKING_ARCHITECTURE_FREEZE.md`); `docs/README.md` index updated.
- **Architecture**: category → building/unit → floor → room hierarchy on top of M16A-0 normalized data; backend-enforced gender filtering; public surface aggregated and PII-safe.
- **Admin navigation**: `Kamar` sidebar dropdown with Ringkasan Kamar, Rumah Kost, Apart Kost, Ketersediaan/Booking (Unit Bangunan as a Ringkasan tab in MVP).
- **Admin UX**: summary cards + charts; category pages grouped by building→floor with filters, status/gender badges, public toggle; MVP editing limited to status/visibility/price/notes.
- **Public listing**: hero gender filter ("Cari kamar untuk siapa?" — Putra/Putri), optional category filter, aggregated availability cards, no mandatory popup.
- **WhatsApp booking**: direct prefilled WhatsApp CTA in MVP; stored `booking_leads` recommended for M16F; no payment gateway involvement.
- **Data model**: `room_buildings` + extended `rooms` keyed by unique `room_code`; `room_booking_leads` later; legacy schema/seed reconciliation assigned to M16B.
- **API plan**: admin inventory/summary/buildings/rooms/leads endpoints + public aggregated availability endpoints with safe-field allowlist and backend gender enforcement.
- **MVP vs later**: WhatsApp-confirmation MVP without payments; leads/media/SEO/payment-booking deferred.
- **Risks/open questions**: recorded in Sections 18 and 20; key product confirmations pending (room-number visibility beyond MVP, WhatsApp number, photos, pricing tiers, public domain).
- **Next milestone recommendation**: **M16B — Backend Room Inventory Model / Import Mapping** (staging-only, dry-run first).

Binding closing statement: **Public booking is not production-ready. Payment Gateway remains sandbox/staging ready and not production-ready. Smart Lock live execution remains NO-GO. Production remains NOT READY.** This milestone was documentation only; no code, migrations, seeds, mockup changes, or QA were executed.
