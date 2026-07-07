# Room Inventory CSV Validator + Dry-run Report

> **Run timestamp**: 2026-07-07 16:16:13 Asia/Jakarta
> **Git branch**: m16b-3b-room-inventory-validator-dry-run
> **Git commit**: ebdd71f
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
| Current room_buildings count | 0 |
| Current rooms_with_room_code count | 0 |
| Existing duplicate room_code count | 0 |
| Backfill state | pre_backfill |
| Counts unchanged after dry-run | yes |



### Match Summary

| Type | Count |
|---|---:|
| Exact room_code matches | 0 |
| Inferred legacy matches | 163 |
| Ambiguous matches | 0 |
| Missing CSV room matches | 0 |
| Extra DB rows | 0 |

### Proposed Future Write Summary

These are dry-run recommendations only. The validator executed no writes.

| Proposed future action | Count |
|---|---:|
| room_buildings inserts | 26 |
| room_buildings updates | 0 |
| rooms updates | 163 |
| status changes | 10 |
| gender corrections | 18 |
| visibility changes | 2 |

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

- RK-01-B-001 / RK-01-01: room_code, category, floor_code, floor_label, gender_policy, yearly_price, room_status, building_id, import_source, import_source_row
- RK-01-B-002 / RK-01-02: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-B-003 / RK-01-03: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-B-004 / RK-01-04: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-B-005 / RK-01-05: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-006 / RK-01-06: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-007 / RK-01-07: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-008 / RK-01-08: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-009 / RK-01-09: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-010 / RK-01-10: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-01-A-011 / RK-01-11: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-02-B-001 / RK-02-01: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- RK-02-B-002 / RK-02-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-B-003 / RK-02-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-B-004 / RK-02-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-A-005 / RK-02-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-A-006 / RK-02-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-A-007 / RK-02-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-02-A-008 / RK-02-08: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-B-001 / RK-03-01: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- RK-03-B-002 / RK-03-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-B-003 / RK-03-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-B-004 / RK-03-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-A-005 / RK-03-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-A-006 / RK-03-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-A-007 / RK-03-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-03-A-008 / RK-03-08: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-B-001 / RK-04-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-B-002 / RK-04-02: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- RK-04-B-003 / RK-04-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-A-004 / RK-04-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-A-005 / RK-04-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-A-006 / RK-04-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-04-A-007 / RK-04-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-B-001 / RK-06-01: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- RK-06-B-002 / RK-06-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-B-003 / RK-06-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-A-004 / RK-06-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-A-005 / RK-06-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-A-006 / RK-06-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-06-A-007 / RK-06-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-B-001 / RK-07-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-B-002 / RK-07-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-B-003 / RK-07-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-A-004 / RK-07-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-A-005 / RK-07-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-A-006 / RK-07-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-07-A-007 / RK-07-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-B-001 / RK-08-01: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- RK-08-B-002 / RK-08-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-B-003 / RK-08-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-A-004 / RK-08-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-A-005 / RK-08-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-A-006 / RK-08-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-08-A-007 / RK-08-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-B-001 / RK-09-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-B-002 / RK-09-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-B-003 / RK-09-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-A-004 / RK-09-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-A-005 / RK-09-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-09-A-006 / RK-09-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-B-001 / RK-10-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-B-002 / RK-10-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-B-003 / RK-10-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-B-004 / RK-10-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-A-005 / RK-10-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-A-006 / RK-10-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-A-007 / RK-10-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-10-A-008 / RK-10-08: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-B-001 / RK-11-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-B-002 / RK-11-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-B-003 / RK-11-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-A-004 / RK-11-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-A-005 / RK-11-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-A-006 / RK-11-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-11-A-007 / RK-11-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-B-001 / RK-12-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-B-002 / RK-12-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-B-003 / RK-12-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-A-004 / RK-12-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-A-005 / RK-12-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-A-006 / RK-12-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-12-A-007 / RK-12-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-B-001 / RK-13-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-B-002 / RK-13-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-B-003 / RK-13-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-B-004 / RK-13-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-B-005 / RK-13-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-006 / RK-13-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-007 / RK-13-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-008 / RK-13-08: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-009 / RK-13-09: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-010 / RK-13-10: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-13-A-011 / RK-13-11: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-B-001 / RK-14-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-B-002 / RK-14-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-B-003 / RK-14-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-A-004 / RK-14-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-A-005 / RK-14-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-14-A-006 / RK-14-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-B-001 / RK-15-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-B-002 / RK-15-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-B-003 / RK-15-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-A-004 / RK-15-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-A-005 / RK-15-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-15-A-006 / RK-15-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-16-B-001 / RK-16-01: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-B-002 / RK-16-02: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-B-003 / RK-16-03: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-A-004 / RK-16-04: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-A-005 / RK-16-05: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-A-006 / RK-16-06: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-16-A-007 / RK-16-07: room_code, category, floor_code, floor_label, gender_policy, yearly_price, building_id, import_source, import_source_row
- RK-17-B-001 / RK-17-01: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-B-002 / RK-17-02: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-B-003 / RK-17-03: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-B-004 / RK-17-04: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-B-005 / RK-17-05: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-A-006 / RK-17-06: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-A-007 / RK-17-07: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-A-008 / RK-17-08: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-A-009 / RK-17-09: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- RK-17-A-010 / RK-17-10: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05A-B-001 / AK-05A-1B: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- AK-05A-B-002 / AK-05A-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05A-B-003 / AK-05A-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05A-B-004 / AK-05A-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05B-B-005 / AK-05B-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05B-B-006 / AK-05B-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05B-B-007 / AK-05B-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05B-B-008 / AK-05B-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05C-A-009 / AK-05C-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05C-A-010 / AK-05C-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05C-A-011 / AK-05C-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05C-A-012 / AK-05C-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05D-A-013 / AK-05D-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05D-A-014 / AK-05D-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05D-A-015 / AK-05D-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-05D-A-016 / AK-05D-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18A-B-001 / AK-18A-1B: room_code, category, floor_code, floor_label, yearly_price, room_status, building_id, import_source, import_source_row
- AK-18A-B-002 / AK-18A-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18A-B-003 / AK-18A-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18A-B-004 / AK-18A-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18B-B-005 / AK-18B-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18B-B-006 / AK-18B-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18B-B-007 / AK-18B-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18B-B-008 / AK-18B-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18C-B-009 / AK-18C-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18C-B-010 / AK-18C-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18C-B-011 / AK-18C-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18C-B-012 / AK-18C-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18D-A-013 / AK-18D-1B: room_code, category, floor_code, floor_label, yearly_price, public_visible, room_status, building_id, import_source, import_source_row
- AK-18D-A-014 / AK-18D-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18D-A-015 / AK-18D-3A: room_code, category, floor_code, floor_label, yearly_price, public_visible, room_status, building_id, import_source, import_source_row
- AK-18D-A-016 / AK-18D-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18E-A-017 / AK-18E-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18E-A-018 / AK-18E-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18E-A-019 / AK-18E-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18E-A-020 / AK-18E-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18F-A-021 / AK-18F-1B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18F-A-022 / AK-18F-2B: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18F-A-023 / AK-18F-3A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row
- AK-18F-A-024 / AK-18F-4A: room_code, category, floor_code, floor_label, yearly_price, building_id, import_source, import_source_row

### Unmatched CSV Rooms

None.

### Unmatched DB Rooms

None.

---

## Blocking Failures

None.

## Warnings

None.

---

## Manual Review Rows

- RK-01-B-001 / RK-01-01: DB room is occupied but CSV target status is not occupied
- RK-01-B-001 / RK-01-01: Active occupancy exists but CSV target status is not occupied
- RK-01-B-001 / RK-01-01: Active occupancy resident gender conflicts with CSV room gender
- RK-02-B-001 / RK-02-01: DB room is occupied but CSV target status is not occupied
- RK-02-B-001 / RK-02-01: Active occupancy exists but CSV target status is not occupied
- RK-03-B-001 / RK-03-01: DB room is occupied but CSV target status is not occupied
- RK-03-B-001 / RK-03-01: Active occupancy exists but CSV target status is not occupied
- RK-04-B-002 / RK-04-02: DB room is occupied but CSV target status is not occupied
- RK-04-B-002 / RK-04-02: Active occupancy exists but CSV target status is not occupied
- RK-06-B-001 / RK-06-01: DB room is occupied but CSV target status is not occupied
- RK-06-B-001 / RK-06-01: Active occupancy exists but CSV target status is not occupied
- RK-08-B-001 / RK-08-01: DB room is occupied but CSV target status is not occupied
- RK-08-B-001 / RK-08-01: Active occupancy exists but CSV target status is not occupied
- AK-05A-B-001 / AK-05A-1B: DB room is occupied but CSV target status is not occupied
- AK-05A-B-001 / AK-05A-1B: Active occupancy exists but CSV target status is not occupied
- AK-05A-B-003 / AK-05A-3A: Legacy floor suffix mismatches CSV floor_code
- AK-05A-B-004 / AK-05A-4A: Legacy floor suffix mismatches CSV floor_code
- AK-05B-B-007 / AK-05B-3A: Legacy floor suffix mismatches CSV floor_code
- AK-05B-B-008 / AK-05B-4A: Legacy floor suffix mismatches CSV floor_code
- AK-05C-A-009 / AK-05C-1B: Legacy floor suffix mismatches CSV floor_code
- AK-05C-A-010 / AK-05C-2B: Legacy floor suffix mismatches CSV floor_code
- AK-05D-A-013 / AK-05D-1B: Legacy floor suffix mismatches CSV floor_code
- AK-05D-A-014 / AK-05D-2B: Legacy floor suffix mismatches CSV floor_code
- AK-18A-B-001 / AK-18A-1B: DB room is occupied but CSV target status is not occupied
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
