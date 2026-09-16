# Room Inventory Import Apply Guard Report

> **Run timestamp**: 2026-09-07 13:45:49 Asia/Jakarta
> **Mode**: dry-run
> **Git branch**: chore/nota-vps
> **Git commit**: be9c684
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
| Current room_buildings count | 18 |
| Current rooms_with_room_code count | 163 |
| Existing duplicate room_code count | 0 |
| Backfill state | partially_backfilled |
| Counts unchanged after dry-run | yes |



### Match Summary

| Type | Count |
|---|---:|
| Exact room_code matches | 0 |
| Inferred legacy matches | 0 |
| Ambiguous matches | 0 |
| Missing CSV room matches | 163 |
| Extra DB rows | 163 |

### Proposed Future Write Summary

These are proposed by the dry-run comparison. Actual writes are shown separately and only occur in confirmed apply mode.

| Proposed future action | Count |
|---|---:|
| room_buildings inserts | 26 |
| room_buildings updates | 0 |
| rooms updates | 0 |
| status changes | 0 |
| gender corrections | 0 |
| visibility changes | 0 |

### Proposed Future room_buildings Inserts

- rukost:01
- rukost:02
- rukost:03
- rukost:04
- rukost:06
- rukost:07
- rukost:08
- rukost:09
- rukost:10
- rukost:11
- rukost:12
- rukost:13
- rukost:14
- rukost:15
- rukost:16
- rukost:17
- apartkost:05A
- apartkost:05B
- apartkost:05C
- apartkost:05D
- apartkost:18A
- apartkost:18B
- apartkost:18C
- apartkost:18D
- apartkost:18E
- apartkost:18F

### Proposed Future Room Updates

None.

### Unmatched CSV Rooms

- RK-01-B-001
- RK-01-B-002
- RK-01-B-003
- RK-01-B-004
- RK-01-B-005
- RK-01-A-006
- RK-01-A-007
- RK-01-A-008
- RK-01-A-009
- RK-01-A-010
- RK-01-A-011
- RK-02-B-001
- RK-02-B-002
- RK-02-B-003
- RK-02-B-004
- RK-02-A-005
- RK-02-A-006
- RK-02-A-007
- RK-02-A-008
- RK-03-B-001
- RK-03-B-002
- RK-03-B-003
- RK-03-B-004
- RK-03-A-005
- RK-03-A-006
- RK-03-A-007
- RK-03-A-008
- RK-04-B-001
- RK-04-B-002
- RK-04-B-003
- RK-04-A-004
- RK-04-A-005
- RK-04-A-006
- RK-04-A-007
- RK-06-B-001
- RK-06-B-002
- RK-06-B-003
- RK-06-A-004
- RK-06-A-005
- RK-06-A-006
- RK-06-A-007
- RK-07-B-001
- RK-07-B-002
- RK-07-B-003
- RK-07-A-004
- RK-07-A-005
- RK-07-A-006
- RK-07-A-007
- RK-08-B-001
- RK-08-B-002
- RK-08-B-003
- RK-08-A-004
- RK-08-A-005
- RK-08-A-006
- RK-08-A-007
- RK-09-B-001
- RK-09-B-002
- RK-09-B-003
- RK-09-A-004
- RK-09-A-005
- RK-09-A-006
- RK-10-B-001
- RK-10-B-002
- RK-10-B-003
- RK-10-B-004
- RK-10-A-005
- RK-10-A-006
- RK-10-A-007
- RK-10-A-008
- RK-11-B-001
- RK-11-B-002
- RK-11-B-003
- RK-11-A-004
- RK-11-A-005
- RK-11-A-006
- RK-11-A-007
- RK-12-B-001
- RK-12-B-002
- RK-12-B-003
- RK-12-A-004
- RK-12-A-005
- RK-12-A-006
- RK-12-A-007
- RK-13-B-001
- RK-13-B-002
- RK-13-B-003
- RK-13-B-004
- RK-13-B-005
- RK-13-A-006
- RK-14-B-001
- RK-14-B-002
- RK-14-B-003
- RK-14-A-004
- RK-14-A-005
- RK-14-A-006
- RK-14-A-007
- RK-14-A-008
- RK-14-A-009
- RK-14-A-010
- RK-14-A-011
- RK-15-B-001
- RK-15-B-002
- RK-15-B-003
- RK-15-A-004
- RK-15-A-005
- RK-15-A-006
- RK-16-B-001
- RK-16-B-002
- RK-16-B-003
- RK-16-A-004
- RK-16-A-005
- RK-16-A-006
- RK-16-A-007
- RK-17-B-001
- RK-17-B-002
- RK-17-B-003
- RK-17-B-004
- RK-17-B-005
- RK-17-A-006
- RK-17-A-007
- RK-17-A-008
- RK-17-A-009
- RK-17-A-010
- AK-05A-B-001
- AK-05A-B-002
- AK-05A-B-003
- AK-05A-B-004
- AK-05B-B-005
- AK-05B-B-006
- AK-05B-B-007
- AK-05B-B-008
- AK-05C-A-009
- AK-05C-A-010
- AK-05C-A-011
- AK-05C-A-012
- AK-05D-A-013
- AK-05D-A-014
- AK-05D-A-015
- AK-05D-A-016
- AK-18A-B-001
- AK-18A-B-002
- AK-18A-B-003
- AK-18A-B-004
- AK-18B-B-005
- AK-18B-B-006
- AK-18B-B-007
- AK-18B-B-008
- AK-18C-B-009
- AK-18C-B-010
- AK-18C-B-011
- AK-18C-B-012
- AK-18D-A-013
- AK-18D-A-014
- AK-18D-A-015
- AK-18D-A-016
- AK-18E-A-017
- AK-18E-A-018
- AK-18E-A-019
- AK-18E-A-020
- AK-18F-A-021
- AK-18F-A-022
- AK-18F-A-023
- AK-18F-A-024

### Unmatched DB Rooms

- AK-05-01
- AK-05-02
- AK-05-03
- AK-05-04
- AK-05-05
- AK-05-06
- AK-05-07
- AK-05-08
- AK-05-09
- AK-05-10
- AK-05-11
- AK-05-12
- AK-05-13
- AK-05-14
- AK-05-15
- AK-05-16
- AK-18-01
- AK-18-02
- AK-18-03
- AK-18-04
- AK-18-05
- AK-18-06
- AK-18-07
- AK-18-08
- AK-18-09
- AK-18-10
- AK-18-11
- AK-18-12
- AK-18-13
- AK-18-14
- AK-18-15
- AK-18-16
- AK-18-17
- AK-18-18
- AK-18-19
- AK-18-20
- AK-18-21
- AK-18-22
- AK-18-23
- AK-18-24
- RK-01-01
- RK-01-02
- RK-01-03
- RK-01-04
- RK-01-05
- RK-01-06
- RK-01-07
- RK-01-08
- RK-01-09
- RK-01-10
- RK-01-11
- RK-02-01
- RK-02-02
- RK-02-03
- RK-02-04
- RK-02-05
- RK-02-06
- RK-02-07
- RK-02-08
- RK-03-01
- RK-03-02
- RK-03-03
- RK-03-04
- RK-03-05
- RK-03-06
- RK-03-07
- RK-03-08
- RK-04-01
- RK-04-02
- RK-04-03
- RK-04-04
- RK-04-05
- RK-04-06
- RK-04-07
- RK-05-01
- RK-05-02
- RK-05-03
- RK-05-04
- RK-05-05
- RK-05-06
- RK-05-07
- RK-06-01
- RK-06-02
- RK-06-03
- RK-06-04
- RK-06-05
- RK-06-06
- RK-06-07
- RK-08-01
- RK-08-02
- RK-08-03
- RK-08-04
- RK-08-05
- RK-08-06
- RK-08-07
- RK-09-01
- RK-09-02
- RK-09-03
- RK-09-04
- RK-09-05
- RK-09-06
- RK-10-01
- RK-10-02
- RK-10-03
- RK-10-04
- RK-10-05
- RK-10-06
- RK-10-07
- RK-10-08
- RK-11-01
- RK-11-02
- RK-11-03
- RK-11-04
- RK-11-05
- RK-11-06
- RK-11-07
- RK-12-01
- RK-12-02
- RK-12-03
- RK-12-04
- RK-12-05
- RK-12-06
- RK-12-07
- RK-13-01
- RK-13-02
- RK-13-03
- RK-13-04
- RK-13-05
- RK-13-06
- RK-14-01
- RK-14-02
- RK-14-03
- RK-14-04
- RK-14-05
- RK-14-06
- RK-14-07
- RK-14-08
- RK-14-09
- RK-14-10
- RK-14-11
- RK-15-01
- RK-15-02
- RK-15-03
- RK-15-04
- RK-15-05
- RK-15-06
- RK-16-01
- RK-16-02
- RK-16-03
- RK-16-04
- RK-16-05
- RK-16-06
- RK-16-07
- RK-17-01
- RK-17-02
- RK-17-03
- RK-17-04
- RK-17-05
- RK-17-06
- RK-17-07
- RK-17-08
- RK-17-09
- RK-17-10

---

## Apply Eligibility Checklist

- FAIL - --apply flag present: required for write mode
- PASS - CSV validation PASS: 0 blocking issue(s)
- FAIL - DB dry-run matching PASS: 0 deterministic match(es), 0 ambiguous, 163 missing, 163 extra
- PASS - No PII findings: 0 finding(s)
- FAIL - No unmatched CSV rooms: 163 unmatched CSV room(s)
- FAIL - No unmatched DB rooms: 163 unmatched DB room(s)
- PASS - No ambiguous matches: 0 ambiguous match(es)
- PASS - Safe backfill state: partially_backfilled
- FAIL - room_buildings conflict check: 18 conflict(s)
- FAIL - rooms conflict check: 163 conflict(s)
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

- RK-01-B-001 / (no DB room): No DB match found
- RK-01-B-002 / (no DB room): No DB match found
- RK-01-B-003 / (no DB room): No DB match found
- RK-01-B-004 / (no DB room): No DB match found
- RK-01-B-005 / (no DB room): No DB match found
- RK-01-A-006 / (no DB room): No DB match found
- RK-01-A-007 / (no DB room): No DB match found
- RK-01-A-008 / (no DB room): No DB match found
- RK-01-A-009 / (no DB room): No DB match found
- RK-01-A-010 / (no DB room): No DB match found
- RK-01-A-011 / (no DB room): No DB match found
- RK-02-B-001 / (no DB room): No DB match found
- RK-02-B-002 / (no DB room): No DB match found
- RK-02-B-003 / (no DB room): No DB match found
- RK-02-B-004 / (no DB room): No DB match found
- RK-02-A-005 / (no DB room): No DB match found
- RK-02-A-006 / (no DB room): No DB match found
- RK-02-A-007 / (no DB room): No DB match found
- RK-02-A-008 / (no DB room): No DB match found
- RK-03-B-001 / (no DB room): No DB match found
- RK-03-B-002 / (no DB room): No DB match found
- RK-03-B-003 / (no DB room): No DB match found
- RK-03-B-004 / (no DB room): No DB match found
- RK-03-A-005 / (no DB room): No DB match found
- RK-03-A-006 / (no DB room): No DB match found
- RK-03-A-007 / (no DB room): No DB match found
- RK-03-A-008 / (no DB room): No DB match found
- RK-04-B-001 / (no DB room): No DB match found
- RK-04-B-002 / (no DB room): No DB match found
- RK-04-B-003 / (no DB room): No DB match found
- RK-04-A-004 / (no DB room): No DB match found
- RK-04-A-005 / (no DB room): No DB match found
- RK-04-A-006 / (no DB room): No DB match found
- RK-04-A-007 / (no DB room): No DB match found
- RK-06-B-001 / (no DB room): No DB match found
- RK-06-B-002 / (no DB room): No DB match found
- RK-06-B-003 / (no DB room): No DB match found
- RK-06-A-004 / (no DB room): No DB match found
- RK-06-A-005 / (no DB room): No DB match found
- RK-06-A-006 / (no DB room): No DB match found
- RK-06-A-007 / (no DB room): No DB match found
- RK-07-B-001 / (no DB room): No DB match found
- RK-07-B-002 / (no DB room): No DB match found
- RK-07-B-003 / (no DB room): No DB match found
- RK-07-A-004 / (no DB room): No DB match found
- RK-07-A-005 / (no DB room): No DB match found
- RK-07-A-006 / (no DB room): No DB match found
- RK-07-A-007 / (no DB room): No DB match found
- RK-08-B-001 / (no DB room): No DB match found
- RK-08-B-002 / (no DB room): No DB match found
- RK-08-B-003 / (no DB room): No DB match found
- RK-08-A-004 / (no DB room): No DB match found
- RK-08-A-005 / (no DB room): No DB match found
- RK-08-A-006 / (no DB room): No DB match found
- RK-08-A-007 / (no DB room): No DB match found
- RK-09-B-001 / (no DB room): No DB match found
- RK-09-B-002 / (no DB room): No DB match found
- RK-09-B-003 / (no DB room): No DB match found
- RK-09-A-004 / (no DB room): No DB match found
- RK-09-A-005 / (no DB room): No DB match found
- RK-09-A-006 / (no DB room): No DB match found
- RK-10-B-001 / (no DB room): No DB match found
- RK-10-B-002 / (no DB room): No DB match found
- RK-10-B-003 / (no DB room): No DB match found
- RK-10-B-004 / (no DB room): No DB match found
- RK-10-A-005 / (no DB room): No DB match found
- RK-10-A-006 / (no DB room): No DB match found
- RK-10-A-007 / (no DB room): No DB match found
- RK-10-A-008 / (no DB room): No DB match found
- RK-11-B-001 / (no DB room): No DB match found
- RK-11-B-002 / (no DB room): No DB match found
- RK-11-B-003 / (no DB room): No DB match found
- RK-11-A-004 / (no DB room): No DB match found
- RK-11-A-005 / (no DB room): No DB match found
- RK-11-A-006 / (no DB room): No DB match found
- RK-11-A-007 / (no DB room): No DB match found
- RK-12-B-001 / (no DB room): No DB match found
- RK-12-B-002 / (no DB room): No DB match found
- RK-12-B-003 / (no DB room): No DB match found
- RK-12-A-004 / (no DB room): No DB match found
- ... 246 more manual review item(s) omitted from this report section.

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
