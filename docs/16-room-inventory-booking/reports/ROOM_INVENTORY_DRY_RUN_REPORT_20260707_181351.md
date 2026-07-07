# Room Inventory Import Apply Guard Report

> **Run timestamp**: 2026-07-07 18:13:51 Asia/Jakarta
> **Mode**: dry-run
> **Git branch**: m16b-4b-staging-room-inventory-backfill
> **Git commit**: 939e4f0
> **Verdict**: PASS

---

## CSV Validation Summary

| Check | Actual | Expected |
|---|---:|---:|
| Building rows | 26 | 26 |
| Room rows | 163 | 163 |
| Occupancy seed rows | 2 | 2 |
| Duplicate room_code count | 0 | 0 |
| Building total_rooms sum | 163 | 163 |
| RuKost rooms | 123 | 123 |
| ApartKost rooms | 40 | 40 |
| Putra rooms | 99 | 99 |
| Putri rooms | 64 | 64 |

Statuses: occupied=2, vacant=161

---

## DB Dry-run Summary

| Check | Result |
|---|---|
| DB dry-run available | yes |
| Schema ready | yes |
| Target property | Granada Student House Jatinangor (20000000-0000-4000-8000-000000000001) — single property in DB |
| Current DB room count | 163 |
| Current room_buildings count | 26 |
| Current rooms_with_room_code count | 163 |
| Existing duplicate room_code count | 0 |
| Backfill state | backfilled_or_mixed |
| Counts unchanged after dry-run | yes |



### Match Summary

| Type | Count |
|---|---:|
| Exact room_code matches | 163 |
| Inferred legacy matches | 0 |
| Ambiguous matches | 0 |
| Missing CSV room matches | 0 |
| Extra DB rows | 0 |

### Proposed Future Write Summary

These are proposed by the dry-run comparison. Actual writes are shown separately and only occur in confirmed apply mode.

| Proposed future action | Count |
|---|---:|
| room_buildings inserts | 0 |
| room_buildings updates | 26 |
| rooms updates | 0 |
| status changes | 0 |
| gender corrections | 0 |
| visibility changes | 0 |

### Proposed Future room_buildings Inserts

None.

### Proposed Future Room Updates

None.

### Unmatched CSV Rooms

None.

### Unmatched DB Rooms

None.

---

## Apply Eligibility Checklist

- FAIL - --apply flag present: required for write mode
- PASS - CSV validation PASS: 0 blocking issue(s)
- PASS - DB dry-run matching PASS: 163 deterministic match(es), 0 ambiguous, 0 missing, 0 extra
- PASS - No PII findings: 0 finding(s)
- PASS - No unmatched CSV rooms: 0 unmatched CSV room(s)
- PASS - No unmatched DB rooms: 0 unmatched DB room(s)
- PASS - No ambiguous matches: 0 ambiguous match(es)
- FAIL - Safe backfill state: backfilled_or_mixed
- PASS - room_buildings conflict check: 0 conflict(s)
- PASS - rooms conflict check: 0 conflict(s)
- PASS - No duplicate room_code: csv=0, db=0
- PASS - Normalized totals match: buildings=26, rooms=163, putra=99, putri=64
- PASS - Migration schema ready: schema ready
- FAIL - Explicit import confirmation: ROOM_INVENTORY_IMPORT_CONFIRM must equal APPLY_M16_ROOM_INVENTORY
- FAIL - Backup confirmation: ROOM_INVENTORY_BACKUP_CONFIRMED must equal true

Backup confirmation status: not confirmed



## Actual Writes Summary

| Write metric | Count |
|---|---:|
| room_buildings inserted | 0 |
| room_buildings updated | 0 |
| rooms updated | 0 |

No apply writes executed.

---

## Blocking Failures

None.

## Warnings

None.

---

## Manual Review Rows

- RK-01-B-001 / RK-01-01: Active occupancy exists but CSV target status is not occupied
- RK-01-B-001 / RK-01-01: Active occupancy resident gender conflicts with CSV room gender
- RK-02-B-001 / RK-02-01: Active occupancy exists but CSV target status is not occupied
- RK-03-B-001 / RK-03-01: Active occupancy exists but CSV target status is not occupied
- RK-04-B-002 / RK-04-02: Active occupancy exists but CSV target status is not occupied
- RK-06-B-001 / RK-06-01: Active occupancy exists but CSV target status is not occupied
- RK-08-B-001 / RK-08-01: Active occupancy exists but CSV target status is not occupied
- AK-05A-B-001 / AK-05A-1B: Active occupancy exists but CSV target status is not occupied
- AK-05A-B-003 / AK-05A-3A: Legacy floor suffix mismatches CSV floor_code
- AK-05A-B-004 / AK-05A-4A: Legacy floor suffix mismatches CSV floor_code
- AK-05B-B-007 / AK-05B-3A: Legacy floor suffix mismatches CSV floor_code
- AK-05B-B-008 / AK-05B-4A: Legacy floor suffix mismatches CSV floor_code
- AK-05C-A-009 / AK-05C-1B: Legacy floor suffix mismatches CSV floor_code
- AK-05C-A-010 / AK-05C-2B: Legacy floor suffix mismatches CSV floor_code
- AK-05D-A-013 / AK-05D-1B: Legacy floor suffix mismatches CSV floor_code
- AK-05D-A-014 / AK-05D-2B: Legacy floor suffix mismatches CSV floor_code
- AK-18A-B-001 / AK-18A-1B: Active occupancy exists but CSV target status is not occupied
- AK-18A-B-003 / AK-18A-3A: Legacy floor suffix mismatches CSV floor_code
- AK-18A-B-004 / AK-18A-4A: Legacy floor suffix mismatches CSV floor_code
- AK-18B-B-007 / AK-18B-3A: Legacy floor suffix mismatches CSV floor_code
- AK-18B-B-008 / AK-18B-4A: Legacy floor suffix mismatches CSV floor_code
- AK-18C-B-011 / AK-18C-3A: Legacy floor suffix mismatches CSV floor_code
- AK-18C-B-012 / AK-18C-4A: Legacy floor suffix mismatches CSV floor_code
- AK-18D-A-013 / AK-18D-1B: Legacy floor suffix mismatches CSV floor_code
- AK-18D-A-014 / AK-18D-2B: Legacy floor suffix mismatches CSV floor_code
- AK-18E-A-017 / AK-18E-1B: Legacy floor suffix mismatches CSV floor_code
- AK-18E-A-018 / AK-18E-2B: Legacy floor suffix mismatches CSV floor_code
- AK-18F-A-021 / AK-18F-1B: Legacy floor suffix mismatches CSV floor_code
- AK-18F-A-022 / AK-18F-2B: Legacy floor suffix mismatches CSV floor_code

---

## PII Scan Summary

| Finding count | Result |
|---|---:|
| PII findings | 0 |

No PII findings in normalized CSV files.

---

## Safety Confirmation

- No INSERT statements executed.
- No UPDATE statements executed.
- No DELETE statements executed.
- No room backfill executed.
- No room_buildings rows inserted.
- No rooms updated.
- No room_code values backfilled.
- No tenant PII printed.
- No public listing opened.
- No Payment Gateway behavior changed.
- No Smart Lock behavior changed.
- Public booking remains not production-ready.

---

## Final Verdict

### PASS
