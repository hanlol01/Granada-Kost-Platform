# Room Master Data Dictionary

> **Document**: ROOM_MASTER_DATA_DICTIONARY.md
> **Version**: 2.0
> **Last Updated**: 2026-07-07
> **Milestone**: M16A-0 — Room Master Data Cleanup, Normalization, and Documentation

---

## 1. Purpose

This data dictionary documents the normalized room master data for Granada Kost Platform (GSH Jatinangor 1), covering both RuKost and ApartKost property types. It serves as the canonical reference for:

- Column definitions across all normalized files
- Value enums and their meanings
- Parsing rules for raw data transformation
- Price defaults and business rules
- Privacy and public listing guidelines
- Import constraints and known limitations

---

## 2. Source Files

| File | Location | Description |
|------|----------|-------------|
| `room_master_rukost.csv` | `raw/` | Raw RuKost export from Excel. Semicolon-delimited. Contains merged-cell style data, summary rows, and calendar columns. |
| `room_master_apartkost.csv` | `raw/` | Raw ApartKost export from Excel. Semicolon-delimited. Contains summary rows and may contain real tenant names in Inhouse rows. |
| `DATA_KAMAR_GRANADA.xlsx` | `original/` | Original Excel file (source of truth for raw CSVs). |

> [!WARNING]
> Raw files contain operational calendar columns (days 1–31), summary/aggregation rows, and potentially real tenant names. **Do not import raw files directly into the database.**

---

## 3. Normalized Files

| File | Location | Row Count | Description |
|------|----------|-----------|-------------|
| `room_buildings_master.csv` | `normalized/` | 26 buildings | Building/unit-level master data with room counts and pricing |
| `rooms_master_normalized.csv` | `normalized/` | 163 rooms | Individual room-level master data with room codes and status |
| `room_occupancy_seed_sanitized.csv` | `normalized/` | 2 rows + header | Operational occupancy state (separated from master), tenant names masked |

---

## 4. Column Definitions

### 4.1 `room_buildings_master.csv`

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | enum | yes | Property category: `rukost` or `apartkost` |
| `building_code` | string | yes | Unique building identifier (e.g., `01`, `05A`, `18D`) |
| `building_name` | string | yes | Human-readable building name |
| `gender_policy` | enum | yes | Gender restriction: `putra` or `putri` |
| `total_rooms` | integer | yes | Total number of rooms in the building |
| `floor_a_count` | integer | yes | Number of rooms on Floor A (Lantai Atas / LT.2) |
| `floor_b_count` | integer | yes | Number of rooms on Floor B (Lantai Bawah / LT.1) |
| `monthly_price` | integer | yes | Monthly rental price in IDR (default: 1,800,000) |
| `yearly_price` | integer | yes | Annual rental price in IDR (default: 21,600,000) |
| `public_visible` | boolean | yes | Whether building is visible on public listing |
| `notes` | string | no | Parsing notes, corrections, or ambiguities |

### 4.2 `rooms_master_normalized.csv`

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | enum | yes | Property category: `rukost` or `apartkost` |
| `building_code` | string | yes | Parent building code |
| `room_number` | integer | yes | Room number within the building |
| `room_code` | string | yes | Globally unique room code (see format below) |
| `floor_code` | enum | yes | Floor designation: `A` or `B` |
| `floor_label` | string | yes | Human-readable floor label |
| `gender_policy` | enum | yes | Inherited from building: `putra` or `putri` |
| `room_type` | string | yes | Room type classification (default: `standard`) |
| `status` | enum | yes | Room availability status |
| `monthly_price` | integer | yes | Monthly rental price in IDR |
| `yearly_price` | integer | yes | Annual rental price in IDR |
| `public_visible` | boolean | yes | Whether room appears in public listing |
| `source_row` | integer | no | Row number from original CSV file |
| `notes` | string | no | Parsing notes or corrections |

### 4.3 `room_occupancy_seed_sanitized.csv`

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `category` | enum | yes | Property category |
| `building_code` | string | yes | Parent building code |
| `room_code` | string | yes | Room code from rooms_master_normalized |
| `room_number` | integer | yes | Room number |
| `floor_code` | enum | yes | Floor designation |
| `gender_policy` | enum | yes | Gender policy |
| `occupancy_status` | enum | yes | Occupancy state |
| `tenant_name_masked` | string | no | Always `<masked>` if tenant exists; never real names |
| `tenant_gender` | enum | no | Tenant gender if known |
| `rental_period_years` | integer | no | Rental contract duration in years |
| `yearly_rate` | integer | no | Annual rate in IDR |
| `down_payment` | integer | no | Down payment in IDR |
| `check_in` | date | no | Check-in date (ISO 8601) |
| `check_out` | date | no | Check-out date (ISO 8601) |
| `source_row` | integer | no | Row from original CSV |
| `notes` | string | no | Contextual notes |

---

## 5. Value Enums

### 5.1 `category`

| Value | Description |
|-------|-------------|
| `rukost` | RuKost (rumah kost) — traditional boarding house units |
| `apartkost` | ApartKost (apartemen kost) — apartment-style boarding units |

### 5.2 `gender_policy`

| Value | Description |
|-------|-------------|
| `putra` | Male-only building/unit |
| `putri` | Female-only building/unit |

> [!IMPORTANT]
> One building/unit has exactly one gender policy. Mixed-gender buildings do not exist in this dataset.

### 5.3 `floor_code`

| Value | Label | Description |
|-------|-------|-------------|
| `A` | Lantai Atas / LT.2 | Upper floor (2nd floor) |
| `B` | Lantai Bawah / LT.1 | Lower floor (1st floor / ground floor) |

### 5.4 `status` (Room Status)

| Normalized Value | Raw Source Values | Description |
|-----------------|-------------------|-------------|
| `vacant` | `Vacant` | Room available for rent |
| `occupied` | `Inhouse` | Room currently occupied by a tenant |
| `maintenance` | `Out Of Order`, `Out of Order` | Room unavailable due to maintenance |
| `booked` | `Booked`, `Booking` | Room reserved but not yet occupied |
| `requires_review` | unknown/unmapped | Status could not be confidently mapped |

### 5.5 `occupancy_status` (Occupancy Seed)

Same values as `status` above: `vacant`, `occupied`, `maintenance`, `booked`, `requires_review`.

### 5.6 `public_visible`

| Value | Description |
|-------|-------------|
| `true` | Room/building is visible on public listing page |
| `false` | Room/building is hidden from public listing |

Default rules:
- Vacant rooms → `true`
- Occupied rooms → `false`
- Maintenance rooms → `false`
- Buildings → `true` (always visible at building level)

---

## 6. Parsing Rules

### 6.1 RuKost `NO. UNIT` Parsing

Raw format examples:
- `01 B:5 A:6 Putra`
- `02 B:4 A:4 Putra`
- `06 B-3 A-4 Putra`
- `13 B-5 A-6 Putri`

Parsing logic:
```
Pattern: {building_code} B[:-]{floor_b_count} [AB][:-]{floor_a_count} {gender}
```

| Extracted Field | Description |
|----------------|-------------|
| `building_code` | 2-digit building number (01–17, excluding 05) |
| `floor_b_count` | Number of rooms on Floor B (LT.1) |
| `floor_a_count` | Number of rooms on Floor A (LT.2) |
| `gender_policy` | `putra` or `putri` (case-insensitive) |
| `total_rooms` | `floor_b_count + floor_a_count` |

> [!NOTE]
> Building 03 raw header reads `03 B:4 B:4 Putri` — the second `B:4` is a typo for `A:4`. This is confirmed by the actual room data showing 4 B-floor rooms and 4 A-floor rooms.

> [!NOTE]
> Separator varies between `:` (buildings 01–04) and `-` (buildings 06+). Both are handled identically.

> [!NOTE]
> Building 05 does not exist in RuKost (it is used for ApartKost units 05A-05D).

### 6.2 RuKost `NO. KAMAR` Parsing

Raw format examples:
- `1 B` → room_number=1, floor_code=B
- `6 A` → room_number=6, floor_code=A
- `10 A` → room_number=10, floor_code=A

Parsing logic:
```
Pattern: {room_number} {floor_code}
```

The floor code is always the last character (A or B). The room number is the numeric prefix.

### 6.3 ApartKost `NO. UNIT` Parsing

Raw format examples:
- `05A PUTRI`
- `05B PUTRI`
- `18D PUTRA`

Parsing logic:
```
Pattern: {unit_code} {gender}
```

| Extracted Field | Description |
|----------------|-------------|
| `unit_code` | Building number + letter suffix (e.g., `05A`, `18F`) |
| `gender_policy` | `putra` or `putri` (case-insensitive) |

> [!NOTE]
> In the raw ApartKost CSV, the unit code is repeated on every room row (not just the first row of each unit block, unlike RuKost).

### 6.4 ApartKost `NO. KAMAR` Parsing

Raw format examples:
- `1B` → room_number=1, floor_code=B
- `13A` → room_number=13, floor_code=A

Parsing logic:
```
Pattern: {room_number}{floor_code}
```

> [!NOTE]
> ApartKost room numbers in the CSV have no space between number and floor code (e.g., `1B`), unlike the markdown data dictionary which shows them with spaces (e.g., `1 B`). Both formats parse identically.

### 6.5 `room_code` Format

| Category | Format | Example |
|----------|--------|---------|
| RuKost | `RK-{building_code}-{floor_code}-{room_number_padded_3}` | `RK-01-B-001` |
| ApartKost | `AK-{building_code}-{floor_code}-{room_number_padded_3}` | `AK-05A-B-001` |

Room numbers are zero-padded to 3 digits.

---

## 7. Price Rules

| Field | Default Value | Currency | Description |
|-------|--------------|----------|-------------|
| `monthly_price` | 1,800,000 | IDR | Standard monthly rental rate |
| `yearly_price` | 21,600,000 | IDR | Standard annual rental rate (= monthly × 12) |

Rules:
- Vacant rooms with `Rp0` in raw data use default `1,800,000` as list price (Rp0 indicates no revenue, not zero price).
- Occupied/Inhouse rows with `Rp21,600,000` annual rate → monthly price remains `1,800,000`.
- If a row-specific price exists and is valid (not `Rp0`), use it.
- Down payment data is in the occupancy seed only, not in the room master.

---

## 8. Privacy Rules

> [!CAUTION]
> Raw ApartKost data contains real tenant names in Inhouse rows. These **MUST NOT** appear in any repo-facing normalized file.

| Rule | Implementation |
|------|---------------|
| Tenant names in normalized master | **Omitted entirely** (no tenant_name column) |
| Tenant names in occupancy seed | Masked as `<masked>` |
| Tenant gender | Retained (not PII) |
| Financial data (rate, DP) | Retained in occupancy seed (operational data, not PII) |

Room master data (building-level and room-level) is intentionally separated from occupancy/tenant state. This separation ensures:
1. Room structure can be versioned in the repo without PII concerns
2. Occupancy state can be updated independently
3. Tenant data lifecycle is managed separately

---

## 9. Public Listing Rules

| Rule | Description |
|------|-------------|
| Gender filtering | Public visitors only see rooms matching their selected gender |
| Booking flow | MVP uses WhatsApp admin confirmation (no direct payment gateway) |
| Room number visibility | **Product decision required** — whether exact room numbers are shown to public visitors is not assumed; this should be an explicit product decision |
| Occupied rooms | Not shown in public listings (`public_visible=false`) |
| Maintenance rooms | Not shown in public listings |

---

## 10. Import Rules

1. **Do not import raw files directly.** Use normalized files only.
2. **Summary/aggregation rows** in raw files must be excluded. They appear after the last room row in each file.
3. **Calendar columns** (day 1–31) in raw files are operational and must not be imported.
4. **Merged-cell style data** — in RuKost raw data, the `NO. UNIT` column is only filled on the first room of each building. Subsequent rooms in the same building have an empty `NO. UNIT` cell.
5. **room_code must be unique.** No duplicates allowed across the entire normalized dataset.
6. **Validate totals** after any import:
   - RuKost: 123 rooms (Putra 75, Putri 48)
   - ApartKost: 40 rooms (Putra 24, Putri 16)
   - Total: 163 rooms (Putra 99, Putri 64)

---

## 11. Known Limitations

| Issue | Description | Status |
|-------|-------------|--------|
| Stale Summary | Raw data's Summary section shows RuKost Putra=57, Putri=66 — this is **incorrect**. Correct values from detail rows: Putra=75, Putri=48. | Corrected in normalized data |
| Building 03 typo | Raw header reads `03 B:4 B:4 Putri` (second B should be A). Corrected based on actual room data. | Corrected in normalized data |
| Building 05 gap | Building codes 05 is not used in RuKost (reserved for ApartKost). No data quality issue. | Documented |
| No RuKost occupancy | All RuKost rooms are Vacant in the raw data. No occupancy seed rows for RuKost. | Expected |
| ApartKost occupancy limited | Only 2 Inhouse rows found (both in 18D). Occupancy data is minimal. | Expected |
| Check-in/check-out dates | Missing for both Inhouse rows in raw data. | Data gap |
| Room type | All rooms are `standard`. No room type differentiation in raw data. | May need future update |
| ApartKost CSV format | ApartKost CSV lacks DP column present in the markdown version. Down payment data sourced from markdown/Excel. | Minor discrepancy |

---

## 12. Open Questions

1. **Room number visibility on public listing**: Should public visitors see the exact room number, or only the building and floor? This is a product/UX decision.
2. **Pricing tiers**: Are all rooms truly the same price, or will there be differentiation by floor, building, or room type in the future?
3. **Building 05 vs 18 naming**: ApartKost uses building prefixes 05 and 18. Is there a physical/address distinction, or are these arbitrary codes?
4. **Room type expansion**: Will room types beyond `standard` be introduced (e.g., deluxe, corner, etc.)?
5. **Seasonal pricing**: Will monthly/yearly prices vary by season or contract length?
