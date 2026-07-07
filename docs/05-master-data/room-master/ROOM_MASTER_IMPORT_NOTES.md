# Room Master Import Notes

> **Document**: ROOM_MASTER_IMPORT_NOTES.md
> **Task**: M16A-0 — Room Master Data Cleanup, Normalization, and Documentation
> **Date**: 2026-07-07
> **Status**: Data normalization complete. **Not imported to database.**

---

## 1. Summary of What Was Done

This task performed data cleanup and normalization of the Granada Kost (GSH Jatinangor 1) room master data. The work was strictly document/data-level — no application code, database migrations, or seed operations were performed.

### Actions Taken

1. **Created `raw/` directory** — copied existing CSV files from `csv/` to `raw/` as the canonical raw source location.
2. **Created `normalized/` directory** with three clean CSV files ready for future database import.
3. **Rewrote `ROOM_MASTER_DATA_DICTIONARY.md`** — transformed from a raw data dump into a proper data dictionary with column definitions, value enums, parsing rules, and business rules.
4. **Created this file** (`ROOM_MASTER_IMPORT_NOTES.md`) — documenting the normalization process, data quality findings, and validation results.

### Files Generated

| File | Location | Description |
|------|----------|-------------|
| `room_buildings_master.csv` | `normalized/` | 26 building rows (16 RuKost + 10 ApartKost) |
| `rooms_master_normalized.csv` | `normalized/` | 163 room rows (123 RuKost + 40 ApartKost) |
| `room_occupancy_seed_sanitized.csv` | `normalized/` | 2 occupancy rows (ApartKost 18D only) |
| `ROOM_MASTER_DATA_DICTIONARY.md` | root | Complete data dictionary (rewritten) |
| `ROOM_MASTER_IMPORT_NOTES.md` | root | This file |

---

## 2. Raw Data Quality Findings

### 2.1 File Format Issues

| Issue | File | Description |
|-------|------|-------------|
| Semicolon delimiter | Both CSVs | Files use `;` as delimiter (European/Indonesian Excel export), not standard `,` |
| Calendar columns | Both CSVs | Days 1–31 appended as columns (operational attendance/calendar data) |
| Summary rows | Both CSVs | Aggregation rows (totals, occupancy stats, revenue) mixed with data rows |
| Merged-cell pattern | RuKost CSV | `NO. UNIT` column only populated on first room of each building block |
| Unit repeated | ApartKost CSV | `NO. UNIT` repeated on every row (different from RuKost pattern) |
| Inconsistent separator | RuKost CSV | Buildings 01-04 use `:` separator, buildings 06+ use `-` separator in unit headers |

### 2.2 Corrected/Stale Summary Issue

> [!CAUTION]
> The raw data's Summary section contains **stale/incorrect** gender counts for RuKost.

| Source | RuKost Putra | RuKost Putri | RuKost Total |
|--------|-------------|-------------|--------------|
| **Raw Summary section** (STALE ❌) | 57 | 66 | 123 |
| **Actual detail rows** (CORRECT ✅) | 75 | 48 | 123 |

The summary shows Putra=57 and Putri=66, but manually counting the detail rows gives Putra=75 and Putri=48. The total (123) is correct in both cases, but the gender breakdown is wrong in the summary.

**Root cause**: The summary was likely generated from an earlier version of the data before unit gender assignments were updated. The detail rows are the source of truth.

**Correct overall totals** (used in normalized data):

| Metric | Putra | Putri | Total |
|--------|-------|-------|-------|
| RuKost | 75 | 48 | 123 |
| ApartKost | 24 | 16 | 40 |
| **Overall** | **99** | **64** | **163** |

### 2.3 Building 03 Header Typo

Raw header: `03 B:4 B:4 Putri`

The second `B:4` should be `A:4`. Verified by examining the actual room data:
- Rooms 1–4 are Floor B (1 B, 2 B, 3 B, 4 B)
- Rooms 5–8 are Floor A (5 A, 6 A, 7 A, 8 A)

Corrected to: `floor_b_count=4, floor_a_count=4`.

### 2.4 ApartKost CSV vs Markdown Discrepancy

The ApartKost CSV (`room_master_apartkost.csv`) shows all 40 rooms as `Vacant` with no tenant data. However, the markdown data dictionary (which was a raw dump from Excel) shows 2 Inhouse rows with real tenant names in Unit 18D:
- Room 13A (row 30) — Inhouse, tenant name present
- Room 15A (row 32) — Inhouse, tenant name present

The normalized data treats these 2 rooms as `occupied` based on the markdown/Excel source, with tenant names masked.

---

## 3. Tenant PII Handling

> [!IMPORTANT]
> Raw data contains real tenant names. All repo-facing normalized files mask or omit tenant names.

| File | PII Handling |
|------|-------------|
| `rooms_master_normalized.csv` | No tenant_name column. Occupied rooms noted in `notes` column as "tenant name masked". |
| `room_occupancy_seed_sanitized.csv` | `tenant_name_masked` column uses `<masked>` placeholder. Real names never appear. |
| Raw source files | **Retained as-is** in `raw/` directory. These files may contain real names. |

### Tenant Names Found in Raw Data

- 2 tenant names found in ApartKost markdown/Excel data (Unit 18D, rooms 13A and 15A)
- 0 tenant names found in RuKost data (all rooms vacant)
- All tenant names successfully masked in normalized output

---

## 4. Validation Totals

### 4.1 `room_buildings_master.csv`

| Category | Buildings | Total Rooms (sum) |
|----------|-----------|-------------------|
| RuKost | 16 | 123 ✅ |
| ApartKost | 10 | 40 ✅ |
| **Total** | **26** | **163 ✅** |

### 4.2 `rooms_master_normalized.csv`

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Total rows | 163 | 163 | ✅ PASS |
| RuKost rows | 123 | 123 | ✅ PASS |
| ApartKost rows | 40 | 40 | ✅ PASS |
| RuKost Putra | 75 | 75 | ✅ PASS |
| RuKost Putri | 48 | 48 | ✅ PASS |
| ApartKost Putra | 24 | 24 | ✅ PASS |
| ApartKost Putri | 16 | 16 | ✅ PASS |
| Overall Putra | 99 | 99 | ✅ PASS |
| Overall Putri | 64 | 64 | ✅ PASS |
| Duplicate room_codes | 0 | 0 | ✅ PASS |
| Real tenant names in output | 0 | 0 | ✅ PASS |
| Summary rows imported | 0 | 0 | ✅ PASS |
| Calendar columns in output | 0 | 0 | ✅ PASS |

### 4.3 `room_occupancy_seed_sanitized.csv`

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Occupancy rows | 2 | 2 | ✅ PASS |
| Masked tenant names | 2 | 2 | ✅ PASS |
| Real tenant names | 0 | 0 | ✅ PASS |

### 4.4 RuKost Building-Level Verification

| Building | Gender | Floor B | Floor A | Total | Status |
|----------|--------|---------|---------|-------|--------|
| 01 | putra | 5 | 6 | 11 | ✅ |
| 02 | putra | 4 | 4 | 8 | ✅ |
| 03 | putri | 4 | 4 | 8 | ✅ |
| 04 | putra | 3 | 4 | 7 | ✅ |
| 06 | putra | 3 | 4 | 7 | ✅ |
| 07 | putra | 3 | 4 | 7 | ✅ |
| 08 | putri | 3 | 4 | 7 | ✅ |
| 09 | putri | 3 | 3 | 6 | ✅ |
| 10 | putra | 4 | 4 | 8 | ✅ |
| 11 | putra | 3 | 4 | 7 | ✅ |
| 12 | putra | 3 | 4 | 7 | ✅ |
| 13 | putri | 5 | 6 | 11 | ✅ |
| 14 | putra | 3 | 3 | 6 | ✅ |
| 15 | putri | 3 | 3 | 6 | ✅ |
| 16 | putra | 3 | 4 | 7 | ✅ |
| 17 | putri | 5 | 5 | 10 | ✅ |
| | **Putra total** | | | **75** | ✅ |
| | **Putri total** | | | **48** | ✅ |
| | **RuKost total** | | | **123** | ✅ |

### 4.5 ApartKost Building-Level Verification

| Building | Gender | Floor B | Floor A | Total | Status |
|----------|--------|---------|---------|-------|--------|
| 05A | putri | 4 | 0 | 4 | ✅ |
| 05B | putri | 4 | 0 | 4 | ✅ |
| 05C | putri | 0 | 4 | 4 | ✅ |
| 05D | putri | 0 | 4 | 4 | ✅ |
| 18A | putra | 4 | 0 | 4 | ✅ |
| 18B | putra | 4 | 0 | 4 | ✅ |
| 18C | putra | 4 | 0 | 4 | ✅ |
| 18D | putra | 0 | 4 | 4 | ✅ |
| 18E | putra | 0 | 4 | 4 | ✅ |
| 18F | putra | 0 | 4 | 4 | ✅ |
| | **Putra total** | | | **24** | ✅ |
| | **Putri total** | | | **16** | ✅ |
| | **ApartKost total** | | | **40** | ✅ |

---

## 5. Rows Requiring Manual Review

**None.** All 163 rows were successfully parsed and normalized. No `requires_review` status rows exist in the normalized output.

However, the following items may warrant attention during future database import:

1. **Check-in/check-out dates missing** for the 2 occupied rooms in ApartKost 18D. These dates were empty in the raw source.
2. **Building 03 header typo** was corrected automatically. Verify with operations team if building 03 is indeed Putri with 4B+4A layout.
3. **Building 05 gap** — building codes skip from 04 to 06 in RuKost. This is expected (05 is ApartKost), not a data error.

---

## 6. Privacy/Sanitization Summary

| Check | Result |
|-------|--------|
| Real tenant names in `rooms_master_normalized.csv` | ✅ None found |
| Real tenant names in `room_buildings_master.csv` | ✅ None found |
| Real tenant names in `room_occupancy_seed_sanitized.csv` | ✅ All masked as `<masked>` |
| Operational calendar data in normalized files | ✅ Excluded |
| Summary/aggregation rows in normalized files | ✅ Excluded |
| Raw files preserved | ✅ Untouched in `raw/` |

---

## 7. Recommended Next Milestone

> **M16A — Room Inventory & Public Booking Architecture / UX Freeze**

This data normalization (M16A-0) is a prerequisite for M16A. The normalized data provides a clean foundation for:

1. Designing the room inventory database schema
2. Creating database migrations
3. Building the public booking UI
4. Implementing gender-filtered room listing
5. Setting up WhatsApp-based booking confirmation flow

### What This Task Did NOT Do

- ❌ Did not implement backend code
- ❌ Did not implement frontend code
- ❌ Did not create database migrations
- ❌ Did not seed the database
- ❌ Did not mark public booking as production-ready
- ❌ Did not include tenant PII in normalized repo-facing data
- ❌ Did not delete raw source files

---

## 8. Open Questions

1. **Room number visibility**: Should public visitors see exact room numbers (e.g., "Room 5, Floor B") or only availability counts (e.g., "3 rooms available on Ground Floor")?
2. **Building 03 confirmation**: The raw header has a typo (`B:4 B:4` → should be `B:4 A:4`). Please confirm with the operations team.
3. **Pricing uniformity**: All rooms currently use the same price (Rp 1,800,000/month). Will tiered pricing be introduced?
4. **Check-in/check-out dates**: The 2 occupied rooms in 18D have no dates. Can these be sourced from the operations team?
5. **Building naming convention**: Should normalized `building_name` use a standard format (e.g., "Granada RuKost 01") or follow operational naming?

---

## 9. Verdict

### ✅ PASS

All validation checks passed. The normalized data accurately represents the room inventory with correct totals, proper room codes, no PII exposure, and no data quality issues.

| Final Metric | Value |
|-------------|-------|
| Total rooms normalized | 163 |
| RuKost rooms | 123 (Putra: 75, Putri: 48) |
| ApartKost rooms | 40 (Putra: 24, Putri: 16) |
| Overall Putra | 99 |
| Overall Putri | 64 |
| Buildings normalized | 26 |
| Occupancy rows (sanitized) | 2 |
| Data quality issues | 0 blocking |
| PII exposure | 0 |
| Duplicate room_codes | 0 |
| Rows requiring manual review | 0 |
