# VEHICLE DATABASE PLAN — Granada Kost Platform

> **Versi**: 1.0  
> **Tanggal**: 17 Juni 2026  
> **Peran Pembuat**: Principal Database Architect — Vehicle Management  
> **Status**: Dokumen Perencanaan Database — Siap untuk Migration Implementation  
> **Milestone**: 8B — Vehicle Database Planning  
> **Dokumen Acuan**:  
> - [VEHICLE_DOMAIN.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/VEHICLE_DOMAIN.md)  
> - [VEHICLE_DOMAIN_GAP_ANALYSIS.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/VEHICLE_DOMAIN_GAP_ANALYSIS.md)  
> - [DATABASE_PLANNING.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/DATABASE_PLANNING.md)  
> - [COMPLAINT_DATABASE_PLAN.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/COMPLAINT_DATABASE_PLAN.md)

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Final Table List](#2-final-table-list)
3. [Kolom Lengkap per Tabel](#3-kolom-lengkap-per-tabel)
4. [Constraint Strategy](#4-constraint-strategy)
5. [Foreign Key Strategy](#5-foreign-key-strategy)
6. [Index Strategy](#6-index-strategy)
7. [Vehicle Status Enum / Check Strategy](#7-vehicle-status-enum--check-strategy)
8. [Vehicle Type Strategy](#8-vehicle-type-strategy)
9. [Resident ↔ Vehicle Relationship](#9-resident--vehicle-relationship)
10. [Occupancy ↔ Vehicle Relationship](#10-occupancy--vehicle-relationship)
11. [Parking Zone Strategy](#11-parking-zone-strategy)
12. [Parking Slot Strategy](#12-parking-slot-strategy)
13. [Common Parking Area Strategy](#13-common-parking-area-strategy)
14. [Vehicle File / Document Strategy](#14-vehicle-file--document-strategy)
15. [Audit Integration Strategy](#15-audit-integration-strategy)
16. [Property Owner Summary Strategy](#16-property-owner-summary-strategy)
17. [RBAC Impact](#17-rbac-impact)
18. [Development Seed Strategy](#18-development-seed-strategy)
19. [Production Seed Safety](#19-production-seed-safety)
20. [Migration Implementation Checklist](#20-migration-implementation-checklist)
21. [Risks Sebelum Migration](#21-risks-sebelum-migration)
22. [Rekomendasi Akhir](#22-rekomendasi-akhir)

---

## 1. Executive Summary

Dokumen ini menerjemahkan `VEHICLE_DOMAIN.md` (Milestone 8A) menjadi rencana database yang **siap dipakai Backend Team** untuk membuat migration file `007_vehicle.sql`. Pola mengikuti konvensi yang sudah proven di `005_billing.sql` dan `006_complaint.sql`.

### Keputusan yang Sudah Dikunci

| # | Keputusan | Status |
|---|---|---|
| 1 | Visitor vehicle = Phase 2 (tidak masuk migration 007) | ✅ Decided |
| 2 | Parking slot = opsional per property | ✅ Decided |
| 3 | 3 parking modes: `unmanaged`, `zone`, `slot` | ✅ Decided |
| 4 | Vehicle auto-deactivate saat occupancy berakhir | ✅ Decided |
| 5 | Satu penghuni bisa punya 0..N kendaraan | ✅ Decided |
| 6 | Plat nomor unique per property (active only) | ✅ Decided |
| 7 | Max kendaraan per penghuni = configurable (default 3) | ✅ Decided |
| 8 | `vehicle_files.file_id` = logical FK (konsisten TD-004) | ✅ Decided |
| 9 | Property owner hanya lihat aggregate summary | ✅ Decided |
| 10 | Admin register = auto-approved; Penghuni register = pending | ✅ Decided |

### Evaluasi parking_zones vs parking_slots

| Pertanyaan | Jawaban | Alasan |
|---|---|---|
| Perlu **dua-duanya**? | ✅ **Ya — kedua tabel diperlukan** | `parking_zones` dipakai di mode `zone` dan `slot`; `parking_slots` hanya di mode `slot` |
| Bisa digabung jadi satu tabel? | ❌ Tidak disarankan | Zona = container capacity; Slot = individual assignment. Berbeda granularity |
| Bisa cukup salah satu? | ❌ | Mode `zone` butuh zona tanpa slot; mode `slot` butuh zona + slot |

**Kesimpulan**: Pertahankan `parking_zones` + `parking_slots` sebagai dua tabel terpisah. `parking_zones` selalu dipakai saat mode ≠ `unmanaged`. `parking_slots` hanya dipakai saat mode = `slot`.

### Migration File Plan

| File | Nomor | Konten |
|---|---|---|
| `007_vehicle.sql` | 007 | Semua tabel vehicle & parking |
| `core-seed.data.ts` (update) | — | Dev seed vehicle sample data |

### Dependency dengan Existing Tables

```
007_vehicle.sql depends on:
  ├── 001_iam_rbac.sql          → users (FK actor/assignment)
  ├── 002_property_room.sql     → properties, rooms (FK scope/location)
  └── 003_resident_occupancy.sql → residents (FK vehicle owner)
```

---

## 2. Final Table List

### 2.1 Phase 1 Vehicle Tables (Migration 007)

| # | Tabel | Tujuan | Baru |
|---|---|---|---|
| 1 | `vehicles` | Data kendaraan penghuni | ✅ |
| 2 | `vehicle_status_histories` | Timeline perubahan status kendaraan | ✅ |
| 3 | `vehicle_files` | Lampiran foto/dokumen kendaraan | ✅ |
| 4 | `parking_zones` | Zona parkir per property (mode `zone` & `slot`) | ✅ |
| 5 | `parking_slots` | Slot parkir individual (mode `slot` only) | ✅ |

### 2.2 Phase 2 Candidates (Tidak masuk migration 007)

| # | Tabel | Alasan Defer |
|---|---|---|
| 1 | `visitor_vehicles` | Visitor vehicle deferred Phase 2 |
| 2 | `visitor_vehicle_logs` | Idem |
| 3 | `vehicle_transfer_records` | Transfer antar property; Phase 2 |
| 4 | `parking_fee_configs` | Parking fee; Phase 2 setelah billing integration |

### 2.3 Existing Tables yang Di-update (Property Settings)

| Tabel | Perubahan | Keterangan |
|---|---|---|
| `property_settings` | Tambah kolom parking config | `parking_management_mode`, `max_vehicles_per_resident`, `parking_capacity_motorcycle`, `parking_capacity_car`, `parking_requires_approval` |

> **Catatan**: Perubahan `property_settings` bisa ditambahkan di migration 007 sebagai `ALTER TABLE ADD COLUMN` atau — jika `property_settings` menggunakan pola JSONB — ditambahkan di application layer. Evaluasi implementasi di §13.

### 2.4 Urutan Pembuatan dalam Migration

```
007_vehicle.sql:
  1. ALTER property_settings    ← tambah parking config columns
  2. vehicles                   ← depends on properties, residents, users
  3. vehicle_status_histories   ← depends on vehicles
  4. vehicle_files              ← depends on vehicles
  5. parking_zones              ← depends on properties
  6. parking_slots              ← depends on parking_zones, vehicles (nullable)
```

---

## 3. Kolom Lengkap per Tabel

### 3.1 `vehicles`

```
┌──────────────────────────────────────────────────────────────────────┐
│ vehicles — Data kendaraan penghuni                                   │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ resident_id          │ UUID           │ NOT NULL, FK → residents     │
│ vehicle_code         │ TEXT           │ NOT NULL                     │
│ plate_number         │ TEXT           │ NOT NULL                     │
│ vehicle_type         │ TEXT           │ NOT NULL                     │
│ brand                │ TEXT           │ NOT NULL                     │
│ color                │ TEXT           │ NOT NULL                     │
│ year                 │ TEXT           │                              │
│ vehicle_status       │ TEXT           │ NOT NULL, DEFAULT            │
│                      │                │   'pending_approval'         │
│ notes                │ TEXT           │                              │
│ approved_by_user_id  │ UUID           │ FK → users (NULLABLE)        │
│ approved_at          │ TIMESTAMPTZ    │                              │
│ reject_reason        │ TEXT           │                              │
│ suspend_reason       │ TEXT           │                              │
│ deactivation_reason  │ TEXT           │                              │
│ deactivated_at       │ TIMESTAMPTZ    │                              │
│ snapshot_resident_name│TEXT           │ NOT NULL                     │
│ snapshot_room_number │ TEXT           │                              │
│ created_by_user_id   │ UUID           │ NOT NULL, FK → users         │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `vehicle_code` = unique business code: `VEH-{PROP_CODE}-{YYYY}-{NNNN}` (generated application-level)
- `plate_number` = nomor plat kendaraan; partial unique per property (active status only)
- `vehicle_type` = CHECK enum: `motorcycle`, `car`, `bicycle`, `electric_scooter`, `other`
- `vehicle_status` = 6 status values sesuai VEHICLE_DOMAIN.md §7
- `snapshot_room_number` = NULLABLE — diisi dari room saat registrasi; bisa null jika penghuni belum assign room
- `snapshot_resident_name` = NOT NULL — selalu ada karena pasti ada pemilik
- `approved_by_user_id` + `approved_at` = null sampai admin approve
- `reject_reason` = alasan admin menolak; null jika belum/tidak ditolak
- `suspend_reason` = alasan admin suspend; null jika belum/tidak di-suspend
- `deactivation_reason` = alasan deactivation (manual atau auto-checkout)
- `year` = TEXT opsional — tahun pembuatan kendaraan ("2020", "2023")

### 3.2 `vehicle_status_histories`

```
┌──────────────────────────────────────────────────────────────────────┐
│ vehicle_status_histories — Timeline perubahan status kendaraan       │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ vehicle_id           │ UUID           │ NOT NULL, FK → vehicles      │
│ from_status          │ TEXT           │ (NULLABLE, null for initial) │
│ to_status            │ TEXT           │ NOT NULL                     │
│ changed_by_user_id   │ UUID           │ FK → users (NULLABLE)        │
│ changed_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ notes                │ TEXT           │                              │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- Pola identik dengan `complaint_status_histories` dan `maintenance_work_order_histories`
- `from_status` nullable — null untuk entry pertama (creation)
- `changed_by_user_id` nullable — null untuk system-driven transitions (auto-deactivate saat checkout)
- `notes` — context: "Admin menolak: plat tidak valid", "Auto-deactivated: occupancy ended", dll

### 3.3 `vehicle_files`

```
┌──────────────────────────────────────────────────────────────────────┐
│ vehicle_files — Lampiran foto/dokumen kendaraan                      │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ vehicle_id           │ UUID           │ NOT NULL, FK → vehicles      │
│ file_id              │ UUID           │ NOT NULL (logical FK)        │
│ file_purpose         │ TEXT           │ NOT NULL, DEFAULT            │
│                      │                │   'vehicle_photo'            │
│ uploaded_by_user_id  │ UUID           │ FK → users (NULLABLE)        │
│ caption              │ TEXT           │                              │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `file_id` = logical FK — formal FK nanti saat File Module siap (konsisten TD-004, `complaint_files`, `payment_proof_files`)
- `file_purpose` = CHECK: `vehicle_photo`, `stnk`, `other`
- `UNIQUE (vehicle_id, file_id)` — satu file tidak di-link dua kali
- `caption` = opsional — deskripsi file ("Foto depan", "STNK 2024")

### 3.4 `parking_zones`

```
┌──────────────────────────────────────────────────────────────────────┐
│ parking_zones — Zona parkir per property                             │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ zone_code            │ TEXT           │ NOT NULL                     │
│ zone_name            │ TEXT           │ NOT NULL                     │
│ zone_type            │ TEXT           │ NOT NULL, DEFAULT 'mixed'    │
│ capacity             │ INTEGER        │ NOT NULL, DEFAULT 0          │
│ location_description │ TEXT           │                              │
│ is_active            │ BOOLEAN        │ NOT NULL, DEFAULT true       │
│ sort_order           │ INTEGER        │ NOT NULL, DEFAULT 0          │
│ created_by_user_id   │ UUID           │ FK → users                   │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `zone_code` = kode zona unik per property: "M-A", "C-B1", "MIX-01"
- `zone_name` = label UI: "Motor Area A", "Mobil Basement 1", "Area Parkir Umum"
- `zone_type` = CHECK: `motorcycle`, `car`, `mixed`
- `capacity` = max kendaraan yang bisa ditampung zona ini
- `location_description` = deskripsi lokasi zona (opsional)
- Tabel ini dipakai di mode `zone` DAN `slot`. Di mode `slot`, zona menjadi container untuk slot-slot individual
- Tidak dipakai di mode `unmanaged`

### 3.5 `parking_slots`

```
┌──────────────────────────────────────────────────────────────────────┐
│ parking_slots — Slot parkir individual (mode slot only)              │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ zone_id              │ UUID           │ NOT NULL, FK → parking_zones │
│ slot_number          │ TEXT           │ NOT NULL                     │
│ slot_type            │ TEXT           │ NOT NULL, DEFAULT 'motorcycle│
│ slot_status          │ TEXT           │ NOT NULL, DEFAULT 'available'│
│ vehicle_id           │ UUID           │ FK → vehicles (NULLABLE)     │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `slot_number` = nomor slot unik per zona: "M-01", "C-03"
- `slot_type` = CHECK: `motorcycle`, `car`
- `slot_status` = CHECK: `available`, `occupied`, `reserved`, `maintenance`
- `vehicle_id` = NULLABLE — null berarti slot kosong; non-null berarti slot terisi
- Hanya diisi ketika `property_settings.parking_management_mode = 'slot'`
- `UNIQUE (zone_id, slot_number)` — slot number unik per zona

---

## 4. Constraint Strategy

### 4.1 Check Constraints

| Tabel | Constraint Name | Expression |
|---|---|---|
| `vehicles` | `vehicles_type_check` | `vehicle_type IN ('motorcycle', 'car', 'bicycle', 'electric_scooter', 'other')` |
| `vehicles` | `vehicles_status_check` | `vehicle_status IN ('pending_approval', 'active', 'rejected', 'suspended', 'transfer_pending', 'inactive')` |
| `vehicle_files` | `vehicle_files_purpose_check` | `file_purpose IN ('vehicle_photo', 'stnk', 'other')` |
| `parking_zones` | `parking_zones_type_check` | `zone_type IN ('motorcycle', 'car', 'mixed')` |
| `parking_zones` | `parking_zones_capacity_check` | `capacity >= 0` |
| `parking_slots` | `parking_slots_type_check` | `slot_type IN ('motorcycle', 'car')` |
| `parking_slots` | `parking_slots_status_check` | `slot_status IN ('available', 'occupied', 'reserved', 'maintenance')` |

### 4.2 Unique Constraints

| Tabel | Constraint Name | Kolom | Keterangan |
|---|---|---|---|
| `vehicles` | `vehicles_unique_code` | `(property_id, vehicle_code)` | Kode kendaraan unik per property |
| `vehicle_files` | `vehicle_files_unique_file` | `(vehicle_id, file_id)` | Satu file tidak double-link |
| `parking_zones` | `parking_zones_unique_code` | `(property_id, zone_code)` | Kode zona unik per property |
| `parking_slots` | `parking_slots_unique_number` | `(zone_id, slot_number)` | Nomor slot unik per zona |

### 4.3 Partial Unique Constraint

| Tabel | Index Name | Kolom | WHERE | Keterangan |
|---|---|---|---|---|
| `vehicles` | `vehicles_unique_plate_active` | `(property_id, plate_number)` | `vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending')` | Plat nomor unik per property hanya untuk kendaraan non-terminal |

**Alasan partial unique**: Kendaraan yang sudah `inactive` atau `rejected` bisa memiliki plat yang sama dengan kendaraan baru (contoh: penghuni checkout lalu register ulang di kemudian hari).

### 4.4 NOT NULL Strategy

| Prinsip | Penerapan |
|---|---|
| Kolom yang selalu ada saat create | `NOT NULL` (`vehicle_code`, `plate_number`, `vehicle_type`, `brand`, `color`) |
| Kolom yang diisi nanti (approval, deactivation) | NULLABLE (`approved_at`, `deactivated_at`, `reject_reason`) |
| Actor columns untuk system transitions | NULLABLE (`changed_by_user_id` di histories) |
| Snapshot yang bergantung konteks | `snapshot_room_number` NULLABLE (penghuni mungkin belum assign room) |
| Creator wajib ada | `created_by_user_id` NOT NULL |

---

## 5. Foreign Key Strategy

### 5.1 FK ke Existing Tables

| Source Table | Source Column | Target Table | Target Column | ON DELETE | Catatan |
|---|---|---|---|---|---|
| `vehicles` | `property_id` | `properties` | `id` | CASCADE | Property dihapus → vehicles ikut |
| `vehicles` | `resident_id` | `residents` | `id` | RESTRICT | Tidak boleh hapus resident yang punya vehicle |
| `vehicles` | `approved_by_user_id` | `users` | `id` | SET NULL | User dihapus → tetap simpan data |
| `vehicles` | `created_by_user_id` | `users` | `id` | RESTRICT | Creator harus ada |
| `vehicle_status_histories` | `changed_by_user_id` | `users` | `id` | SET NULL | User dihapus → history tetap ada |
| `vehicle_files` | `uploaded_by_user_id` | `users` | `id` | SET NULL | |
| `parking_zones` | `property_id` | `properties` | `id` | CASCADE | |
| `parking_zones` | `created_by_user_id` | `users` | `id` | SET NULL | |

### 5.2 FK antar New Tables

| Source Table | Source Column | Target Table | Target Column | ON DELETE | Catatan |
|---|---|---|---|---|---|
| `vehicle_status_histories` | `vehicle_id` | `vehicles` | `id` | CASCADE | Vehicle dihapus → history ikut |
| `vehicle_files` | `vehicle_id` | `vehicles` | `id` | CASCADE | Vehicle dihapus → files ikut |
| `parking_slots` | `zone_id` | `parking_zones` | `id` | CASCADE | Zona dihapus → slots ikut |
| `parking_slots` | `vehicle_id` | `vehicles` | `id` | SET NULL | Vehicle dihapus → slot freed |

### 5.3 Logical FK (Tanpa Formal Constraint)

| Source Table | Source Column | Target Table (Future) | Alasan |
|---|---|---|---|
| `vehicle_files` | `file_id` | `files` | File Module belum diimplementasikan (TD-004) |

### 5.4 FK ON DELETE Summary

| Pattern | ON DELETE | Tabel yang Menggunakan |
|---|---|---|
| **CASCADE** (parent owns children) | CASCADE | `vehicles` ← property; histories ← vehicle; files ← vehicle; slots ← zone |
| **RESTRICT** (protect referential integrity) | RESTRICT | `vehicles` ← residents (jangan hapus resident yang punya kendaraan); `vehicles` ← created_by_user |
| **SET NULL** (preserve data, clear reference) | SET NULL | approved_by, changed_by, uploaded_by, parking_slots.vehicle_id |

---

## 6. Index Strategy

### 6.1 Must-Have Indexes

| # | Tabel | Index Name | Kolom | Query Pattern |
|---|---|---|---|---|
| 1 | `vehicles` | `idx_vehicles_admin_list` | `(property_id, vehicle_status, created_at DESC)` | Admin: list kendaraan per property |
| 2 | `vehicles` | `idx_vehicles_resident` | `(resident_id, vehicle_status)` | Penghuni: kendaraan miliknya |
| 3 | `vehicles` | `idx_vehicles_plate_active` | `UNIQUE (property_id, plate_number) WHERE vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending')` | Plat unik per property (partial unique) |
| 4 | `vehicles` | `idx_vehicles_approval_queue` | `(property_id, created_at ASC) WHERE vehicle_status = 'pending_approval'` | Admin: approval queue (partial) |
| 5 | `vehicles` | `idx_vehicles_type_status` | `(property_id, vehicle_type, vehicle_status)` | Reporting: distribusi per tipe |
| 6 | `vehicle_status_histories` | `idx_vsh_vehicle_timeline` | `(vehicle_id, changed_at ASC)` | Timeline per kendaraan |
| 7 | `vehicle_files` | `idx_vf_vehicle` | `(vehicle_id)` | File list per kendaraan |
| 8 | `parking_zones` | `idx_pz_property_active` | `(property_id, is_active, sort_order)` | Admin: list zona aktif |
| 9 | `parking_slots` | `idx_ps_zone_status` | `(zone_id, slot_status)` | Admin: slot per zona |
| 10 | `parking_slots` | `idx_ps_vehicle` | `(vehicle_id) WHERE vehicle_id IS NOT NULL` | Lookup slot by vehicle (partial) |

### 6.2 Unique Indexes (sudah tercakup di Constraint)

| Tabel | Kolom |
|---|---|
| `vehicles` | `UNIQUE (property_id, vehicle_code)` |
| `vehicle_files` | `UNIQUE (vehicle_id, file_id)` |
| `parking_zones` | `UNIQUE (property_id, zone_code)` |
| `parking_slots` | `UNIQUE (zone_id, slot_number)` |

### 6.3 Index yang Ditunda (Phase 2)

| Tabel | Index | Alasan Defer |
|---|---|---|
| `vehicles` | GIN/trigram pada `plate_number`, `brand` | Full-text search; belum diperlukan Phase 1 |
| `vehicles` | BRIN pada `created_at` | Volume rendah Phase 1 |

### 6.4 Perbandingan Jumlah Index vs Module Lain

| Module | Tabel | Total Index |
|---|---|---|
| Billing (005) | 8 tabel | 13 indexes |
| Complaint (006) | 8 tabel | 15 indexes |
| **Vehicle (007)** | **5 tabel** | **10 indexes** |

Vehicle module lebih ramping — volume data lebih rendah dibanding billing/complaint.

---

## 7. Vehicle Status Enum / Check Strategy

### 7.1 Strategi: TEXT + CHECK Constraint

Konsisten dengan seluruh existing migration — `TEXT` column + `CHECK` constraint, bukan PostgreSQL `ENUM` type.

### 7.2 Vehicle Status Values

| Status | Kode DB | Dari State | Ke State | Keterangan |
|---|---|---|---|---|
| Pending Approval | `pending_approval` | — (initial, dari penghuni) | `active`, `rejected` | Menunggu review admin |
| Active | `active` | `pending_approval`, `suspended`, `transfer_pending` | `suspended`, `transfer_pending`, `inactive` | Terverifikasi, boleh parkir |
| Rejected | `rejected` | `pending_approval` | (terminal) | Ditolak admin |
| Suspended | `suspended` | `active` | `active`, `inactive` | Akses parkir dicabut sementara |
| Transfer Pending | `transfer_pending` | `active` | `active`, `inactive` | Proses transfer property |
| Inactive | `inactive` | `active`, `suspended`, `transfer_pending` | (terminal) | Tidak lagi terdaftar aktif |

### 7.3 Parking Slot Status Values

| Status | Kode DB | Keterangan |
|---|---|---|
| Available | `available` | Slot kosong, siap di-assign |
| Occupied | `occupied` | Slot terisi kendaraan |
| Reserved | `reserved` | Slot di-reserve (belum assign) |
| Maintenance | `maintenance` | Slot sedang maintenance |

### 7.4 Transisi Vehicle Status — Application Layer Validation

```
ALLOWED_TRANSITIONS = {
  'pending_approval': ['active', 'rejected'],
  'active':           ['suspended', 'transfer_pending', 'inactive'],
  'rejected':         [],  // terminal
  'suspended':        ['active', 'inactive'],
  'transfer_pending': ['active', 'inactive'],
  'inactive':         [],  // terminal
}
```

> **Catatan**: Ini di-enforce di application layer, bukan database trigger. Konsisten dengan complaint module.

---

## 8. Vehicle Type Strategy

### 8.1 Vehicle Type Values

| Tipe | Kode DB | Keterangan |
|---|---|---|
| Motor | `motorcycle` | Sepeda motor — tipe paling umum di kost Indonesia |
| Mobil | `car` | Mobil pribadi |
| Sepeda | `bicycle` | Sepeda non-motor |
| Skuter Listrik | `electric_scooter` | Sepeda/skuter listrik |
| Lainnya | `other` | Catch-all |

### 8.2 Strategi: TEXT + CHECK (bukan Master Table)

| Aspek | Keputusan | Alasan |
|---|---|---|
| Pakai master table? | **Tidak Phase 1** | Vehicle types sangat stabil; jarang berubah |
| Pakai TEXT + CHECK? | **Ya** | Konsisten; mudah extend; tidak perlu FK join |
| Phase 2? | Evaluasi jika ada kebutuhan custom types per property | Bisa migrasi ke master table nanti |

### 8.3 Konsistensi dengan Parking

- `parking_zones.zone_type`: `motorcycle`, `car`, `mixed`
- `parking_slots.slot_type`: `motorcycle`, `car`
- `vehicles.vehicle_type`: `motorcycle`, `car`, `bicycle`, `electric_scooter`, `other`

Nilai `motorcycle` dan `car` di-share antar ketiga tabel. Application layer harus memvalidasi bahwa kendaraan `car` tidak di-assign ke slot `motorcycle`.

---

## 9. Resident ↔ Vehicle Relationship

### 9.1 Relationship Detail

```
residents (id)
  └── vehicles (resident_id → residents.id)
      ├── VEH-001 (resident_id = resident-A, type = motorcycle)
      ├── VEH-002 (resident_id = resident-A, type = car)
      └── VEH-003 (resident_id = resident-B, type = motorcycle)
```

### 9.2 Cardinality & Rules

| Rule | Enforcement |
|---|---|
| 1 Resident : 0..N Vehicles | FK `vehicles.resident_id` |
| Max N configurable per property | Application layer — query count + property_settings |
| Resident deletion blocked jika punya vehicle aktif | FK ON DELETE RESTRICT |

### 9.3 Application-Level Max Vehicle Validation

```
-- Pseudo-query sebelum insert vehicle
SELECT COUNT(*) FROM vehicles
WHERE resident_id = $1
  AND property_id = $2
  AND vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending')

-- Compare with property_settings.max_vehicles_per_resident (default 3)
-- Reject if count >= max
```

**Catatan**: Tidak di-enforce via database constraint karena max configurable per property. Application layer menangani.

---

## 10. Occupancy ↔ Vehicle Relationship

### 10.1 Tidak Ada FK Langsung

Vehicle tidak memiliki FK ke `occupancies` table. Relasi bersifat **implicit** melalui `resident_id` + `property_id`:

```
occupancies (resident_id, property_id, status = 'active')
                │                │
                └────────────────┘
                         │
vehicles (resident_id, property_id, vehicle_status = 'active')
```

### 10.2 Alasan Tidak Ada FK ke Occupancies

| Faktor | Justifikasi |
|---|---|
| Vehicle bisa outlive occupancy | Kendaraan tetap ada setelah checkout (status `inactive`) |
| Vehicle bisa precede occupancy | Edge case: admin register vehicle sebelum formal check-in |
| Multiple occupancy | Resident bisa punya occupancy history; vehicle tidak di-link ke specific occupancy |
| Simplicity | FK via resident + property sudah cukup |

### 10.3 Auto-Deactivation Logic (Application Layer)

```
Event: occupancy.ended (resident_id, property_id)
  └── Consumer: VehicleAutoDeactivationHandler
      ├── Query: SELECT * FROM vehicles
      │          WHERE resident_id = $1
      │            AND property_id = $2
      │            AND vehicle_status IN ('pending_approval', 'active', 'suspended')
      ├── Foreach vehicle → UPDATE vehicle_status = 'inactive',
      │                       deactivation_reason = 'Occupancy ended',
      │                       deactivated_at = now()
      ├── Insert vehicle_status_histories entries
      └── Release parking_slots (SET vehicle_id = NULL, slot_status = 'available')
```

---

## 11. Parking Zone Strategy

### 11.1 Kapan parking_zones Dipakai

| Parking Mode | parking_zones Dipakai? | parking_slots Dipakai? |
|---|---|---|
| `unmanaged` | ❌ Tidak | ❌ Tidak |
| `zone` | ✅ Ya | ❌ Tidak |
| `slot` | ✅ Ya (sebagai container) | ✅ Ya |

### 11.2 Contoh Data Mode `zone`

| zone_code | zone_name | zone_type | capacity |
|---|---|---|---|
| `M-A` | Motor Area A (Depan) | `motorcycle` | 30 |
| `M-B` | Motor Area B (Belakang) | `motorcycle` | 20 |
| `C-A` | Mobil Area A | `car` | 8 |

### 11.3 Zone Capacity Tracking (Mode `zone`)

Di mode `zone`, kendaraan tidak di-assign ke slot individual — hanya ke zona. Capacity tracking dihitung:

```sql
-- Utilization per zona (mode zone)
SELECT
  pz.id,
  pz.zone_name,
  pz.capacity,
  COUNT(v.id) FILTER (WHERE v.vehicle_status = 'active') AS occupied,
  pz.capacity - COUNT(v.id) FILTER (WHERE v.vehicle_status = 'active') AS available
FROM parking_zones pz
LEFT JOIN vehicles v ON v.property_id = pz.property_id
  AND v.vehicle_type = CASE pz.zone_type
    WHEN 'motorcycle' THEN 'motorcycle'
    WHEN 'car' THEN 'car'
    ELSE v.vehicle_type  -- mixed accepts all
  END
  AND v.vehicle_status = 'active'
WHERE pz.property_id = $1 AND pz.is_active = true
GROUP BY pz.id;
```

> **Catatan penting**: Di mode `zone`, vehicle TIDAK memiliki FK ke `parking_zones`. Assignment dilakukan secara implisit berdasarkan `vehicle_type` ↔ `zone_type` matching. Ini disengaja untuk menjaga simplicity — kendaraan hanya "parkir di zona motor" tanpa slot spesifik.

### 11.4 Alternatif: Explicit Zone Assignment

Jika di masa depan diperlukan explicit assignment vehicle → zone, tambahkan kolom `parking_zone_id` di `vehicles`. Ini **tidak dilakukan Phase 1** untuk menjaga simplicity.

---

## 12. Parking Slot Strategy

### 12.1 Kapan parking_slots Dipakai

Hanya saat `property_settings.parking_management_mode = 'slot'`.

### 12.2 Contoh Data Mode `slot`

| zone → slot_number | slot_type | slot_status | vehicle_id |
|---|---|---|---|
| M-A → M-01 | motorcycle | occupied | uuid-veh-001 |
| M-A → M-02 | motorcycle | available | NULL |
| M-A → M-03 | motorcycle | maintenance | NULL |
| C-A → C-01 | car | occupied | uuid-veh-005 |
| C-A → C-02 | car | available | NULL |

### 12.3 Slot Assignment Rules

| # | Rule | Enforcement |
|---|---|---|
| SL-01 | Satu slot hanya bisa ditempati satu kendaraan | `vehicle_id` NULLABLE; application validates |
| SL-02 | Kendaraan hanya bisa di-assign ke slot dengan tipe matching | Application: `motorcycle` vehicle → `motorcycle` slot |
| SL-03 | Slot `maintenance` tidak bisa di-assign | Application validates `slot_status = 'available'` |
| SL-04 | Saat vehicle deactivated → slot auto-released | Application: SET vehicle_id = NULL, slot_status = 'available' |

### 12.4 Unique Vehicle per Slot

Tidak perlu unique constraint pada `parking_slots.vehicle_id` karena:
- Satu kendaraan **seharusnya** hanya di satu slot, tapi enforcement cukup di application layer
- vehicle_id NULLABLE, dan partial unique pada nullable column memerlukan penanganan khusus
- Volume rendah — race condition sangat unlikely

Jika diperlukan di masa depan: `CREATE UNIQUE INDEX ... ON parking_slots(vehicle_id) WHERE vehicle_id IS NOT NULL`

---

## 13. Common Parking Area Strategy

### 13.1 Mode `unmanaged` (Default)

Untuk property yang hanya memiliki area parkir bersama tanpa struktur (mayoritas RuKost):

| Aspek | Detail |
|---|---|
| **parking_zones table** | Tidak ada entries |
| **parking_slots table** | Tidak ada entries |
| **Vehicle data** | Tetap tercatat di `vehicles` — hanya registrasi, tanpa assignment lokasi |
| **Capacity tracking** | Via `property_settings` columns: `parking_capacity_motorcycle`, `parking_capacity_car` |
| **Utilization** | Dihitung: `COUNT active vehicles per type` vs `property_settings capacity` |

### 13.2 Property Settings Columns untuk Parking

Evaluasi implementasi: Tabel `property_settings` sudah ada. Perlu ditambahkan kolom baru.

Berdasarkan review migration yang sudah ada, `property_settings` menggunakan pola **kolom eksplisit** (bukan JSONB). Maka tambahkan via `ALTER TABLE`:

| Kolom Baru | Tipe | Default | Keterangan |
|---|---|---|---|
| `parking_management_mode` | TEXT | `'unmanaged'` | CHECK: `unmanaged`, `zone`, `slot` |
| `max_vehicles_per_resident` | INTEGER | `3` | Batas kendaraan per penghuni |
| `parking_capacity_motorcycle` | INTEGER | NULL | Estimasi kapasitas motor (mode unmanaged) |
| `parking_capacity_car` | INTEGER | NULL | Estimasi kapasitas mobil (mode unmanaged) |
| `parking_requires_approval` | BOOLEAN | `true` | Registrasi kendaraan perlu approval? |

> **Catatan**: Jika `property_settings` belum punya kolom ini, akan ditambahkan di awal migration 007 via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### 13.3 Kapan Beralih dari `unmanaged` ke `zone`/`slot`

Perpindahan mode dilakukan via API admin (update property_settings). Impact:

| Dari | Ke | Aksi Diperlukan |
|---|---|---|
| `unmanaged` → `zone` | Admin harus buat parking_zones | Vehicles tetap, tanpa assignment |
| `unmanaged` → `slot` | Admin harus buat zones + slots | Vehicles tetap, admin assign ke slot |
| `zone` → `slot` | Admin harus buat slots dalam zones | Vehicles tetap |
| `zone` → `unmanaged` | Zones di-deactivate (soft delete) | Vehicles tetap |
| `slot` → `unmanaged` | Zones + slots di-deactivate | Vehicles: slot_assignment cleared |

---

## 14. Vehicle File / Document Strategy

### 14.1 Pattern: Identik dengan complaint_files & payment_proof_files

```
vehicle_files
  ├── vehicle_id       → vehicles (formal FK, ON DELETE CASCADE)
  ├── file_id          → files (LOGICAL FK — no constraint, TD-004)
  ├── file_purpose     = 'vehicle_photo' | 'stnk' | 'other'
  └── uploaded_by_user_id → users (formal FK, ON DELETE SET NULL)
```

### 14.2 File Purpose Values

| Purpose | Keterangan | Siapa Upload |
|---|---|---|
| `vehicle_photo` | Foto kendaraan (depan, samping, plat) | Penghuni atau Admin |
| `stnk` | Scan/foto STNK | Penghuni atau Admin |
| `other` | Dokumen lain | Admin |

### 14.3 Limit per Vehicle

| Aspek | Limit | Enforcement |
|---|---|---|
| Max files per vehicle | 5 | Application layer |
| Max file size | 5 MB | File upload middleware |
| Allowed formats | JPEG, PNG, PDF | File upload middleware |

---

## 15. Audit Integration Strategy

### 15.1 Dual-Layer Audit (Konsisten dengan Complaint Module)

| Layer | Tabel | Tujuan |
|---|---|---|
| **Domain-specific** | `vehicle_status_histories` | Timeline per kendaraan untuk UI |
| **Generic** | `audit_logs` (existing) | Cross-cutting audit untuk security/compliance |

### 15.2 Vehicle Events → audit_logs

| Action Code | Resource Type | Kapan |
|---|---|---|
| `vehicle.registered` | `vehicle` | Kendaraan baru didaftarkan |
| `vehicle.approved` | `vehicle` | Admin approve |
| `vehicle.rejected` | `vehicle` | Admin reject |
| `vehicle.updated` | `vehicle` | Data kendaraan diubah |
| `vehicle.suspended` | `vehicle` | Admin suspend |
| `vehicle.reactivated` | `vehicle` | Admin mengembalikan akses |
| `vehicle.deactivated` | `vehicle` | Deactivated (manual/auto) |
| `vehicle.file_uploaded` | `vehicle_file` | File di-attach |
| `parking_zone.created` | `parking_zone` | Zona baru |
| `parking_zone.updated` | `parking_zone` | Zona diubah |
| `parking_slot.assigned` | `parking_slot` | Vehicle di-assign ke slot |
| `parking_slot.released` | `parking_slot` | Slot dibebaskan |

### 15.3 Database Impact

- **Tidak perlu tabel audit baru** — semua masuk ke existing `audit_logs`
- `vehicle_status_histories` berfungsi sebagai domain-specific audit trail
- Application layer menulis ke kedua layer secara atomik (dalam satu transaction)

---

## 16. Property Owner Summary Strategy

### 16.1 Tidak Perlu Tabel Baru

Property owner summary dihitung **on-the-fly** dari `vehicles` table:

```sql
-- Vehicle summary untuk property_owner
SELECT
  COUNT(*) FILTER (WHERE vehicle_status = 'active') AS active_count,
  COUNT(*) FILTER (WHERE vehicle_status = 'active' AND vehicle_type = 'motorcycle') AS motorcycle_count,
  COUNT(*) FILTER (WHERE vehicle_status = 'active' AND vehicle_type = 'car') AS car_count,
  COUNT(*) FILTER (WHERE vehicle_status = 'pending_approval') AS pending_count,
  COUNT(*) AS total_registered
FROM vehicles
WHERE property_id = $1;
```

### 16.2 Alasan Tidak Pakai Materialized View

| Faktor | Justifikasi |
|---|---|
| Volume | <200 vehicles per property; query murah |
| Frekuensi akses | Property owner jarang akses |
| Freshness | Real-time lebih baik |
| Complexity | Snapshot tidak justified |

---

## 17. RBAC Impact

### 17.1 Existing Permissions

RBAC seed (`001_rbac_seed.sql`) **belum memiliki** permission untuk vehicle. Perlu ditambahkan:

### 17.2 New Permission Codes

| Permission Code | Deskripsi | Phase 1? |
|---|---|---|
| `vehicle.manage` | Manage vehicles (register, approve, update, suspend, deactivate) | ✅ |
| `parking.manage` | Manage parking zones dan slots | ✅ |

### 17.3 Phase 1 Strategy: Coarse Permissions

Konsisten dengan complaint module — Phase 1 menggunakan 2 coarse permissions:

| Role | `vehicle.manage` | `parking.manage` |
|---|:---:|:---:|
| `owner` | ✅ | ✅ |
| `manager` | ✅ | ✅ |
| `admin` | ✅ | ✅ |
| `technician` | ❌ | ❌ |
| `resident` | ❌ (self-scope di app) | ❌ |
| `property_owner` | ❌ (aggregate di app) | ❌ |

### 17.4 Seed Update Needed

Perlu update `001_rbac_seed.sql` **atau** buat seed patch di migration 007:

```sql
-- Tambahkan di 007_vehicle.sql atau seed baru
INSERT INTO permissions (code, name, description) VALUES
  ('vehicle.manage', 'Manage Vehicles', 'Register, approve, update, suspend, and deactivate vehicles.'),
  ('parking.manage', 'Manage Parking', 'Manage parking zones and slots.')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Assign ke roles
INSERT INTO role_permissions (role_id, permission_id) ...
```

---

## 18. Development Seed Strategy

### 18.1 Sample Data Plan

| Entity | Jumlah | Keterangan |
|---|---|---|
| `vehicles` | 8–10 | Spread across status dan tipe |
| `vehicle_status_histories` | 2–3 per vehicle | Timeline realistis |
| `vehicle_files` | 2–3 total | Sample file references (logical file_id) |
| `parking_zones` | 2–3 | Contoh zona (jika property pakai mode zone/slot) |
| `parking_slots` | 4–6 | Contoh slot (jika property pakai mode slot) |

### 18.2 Sample Vehicle Data

| # | Code | Plate | Type | Brand | Color | Status | Resident |
|---|---|---|---|---|---|---|---|
| 1 | VEH-GSH-2026-0001 | B 1234 ABC | motorcycle | Honda Vario | Hitam | `active` | Penghuni 1 |
| 2 | VEH-GSH-2026-0002 | B 5678 DEF | motorcycle | Yamaha NMAX | Putih | `active` | Penghuni 1 |
| 3 | VEH-GSH-2026-0003 | D 9012 GHI | car | Toyota Avanza | Silver | `active` | Penghuni 2 |
| 4 | VEH-GSH-2026-0004 | B 3456 JKL | motorcycle | Honda Beat | Merah | `pending_approval` | Penghuni 3 |
| 5 | VEH-GSH-2026-0005 | D 7890 MNO | motorcycle | Yamaha Mio | Biru | `suspended` | Penghuni 4 |
| 6 | VEH-GSH-2026-0006 | B 1122 PQR | car | Honda Brio | Putih | `rejected` | Penghuni 5 |
| 7 | VEH-GSH-2026-0007 | B 3344 STU | motorcycle | Honda PCX | Hitam | `inactive` | Penghuni 6 |
| 8 | VEH-GSH-2026-0008 | D 5566 VWX | bicycle | Polygon | Kuning | `active` | Penghuni 7 |

### 18.3 Sample Parking Zone Data (Mode zone)

| # | zone_code | zone_name | zone_type | capacity |
|---|---|---|---|---|
| 1 | M-A | Motor Area Depan | motorcycle | 30 |
| 2 | M-B | Motor Area Belakang | motorcycle | 20 |
| 3 | C-A | Mobil Area Utama | car | 8 |

---

## 19. Production Seed Safety

### 19.1 Data yang TIDAK Boleh Masuk Production

| Data | Alasan |
|---|---|
| Sample vehicles | Data kendaraan harus dari registrasi riil |
| Sample vehicle_files | Logical file_id fiksi |
| Sample vehicle_status_histories | Data fiksi |
| Sample parking_zones | Admin harus setup sesuai kondisi property |
| Sample parking_slots | Admin harus setup sesuai kondisi property |
| Property settings parking values (capacity, etc.) | Perlu input manual dari pengelola |

### 19.2 Data yang BOLEH Masuk Production

| Data | Alasan |
|---|---|
| `vehicle.manage` permission | Konfigurasi RBAC |
| `parking.manage` permission | Konfigurasi RBAC |
| Role-permission assignments | Konfigurasi RBAC |
| `parking_management_mode = 'unmanaged'` default | Safe default |
| `max_vehicles_per_resident = 3` default | Safe default |
| `parking_requires_approval = true` default | Safe default |

---

## 20. Migration Implementation Checklist

### 20.1 Migration File: `007_vehicle.sql`

```
☐ 0. ALTER TABLE property_settings — ADD parking config columns
    ☐ parking_management_mode TEXT DEFAULT 'unmanaged'
    ☐ max_vehicles_per_resident INTEGER DEFAULT 3
    ☐ parking_capacity_motorcycle INTEGER (NULLABLE)
    ☐ parking_capacity_car INTEGER (NULLABLE)
    ☐ parking_requires_approval BOOLEAN DEFAULT true
    ☐ CHECK: parking_management_mode IN ('unmanaged', 'zone', 'slot')
    ☐ CHECK: max_vehicles_per_resident > 0

☐ 1. CREATE TABLE vehicles
    ☐ All columns from §3.1
    ☐ CHECK: vehicle_type
    ☐ CHECK: vehicle_status
    ☐ UNIQUE: (property_id, vehicle_code)
    ☐ Partial UNIQUE: (property_id, plate_number) WHERE vehicle_status active
    ☐ FK: property_id → properties (CASCADE)
    ☐ FK: resident_id → residents (RESTRICT)
    ☐ FK: approved_by_user_id → users (SET NULL)
    ☐ FK: created_by_user_id → users (RESTRICT)
    ☐ Index: idx_vehicles_admin_list
    ☐ Index: idx_vehicles_resident
    ☐ Index: idx_vehicles_approval_queue (partial)
    ☐ Index: idx_vehicles_type_status

☐ 2. CREATE TABLE vehicle_status_histories
    ☐ All columns from §3.2
    ☐ FK: vehicle_id → vehicles (CASCADE)
    ☐ FK: changed_by_user_id → users (SET NULL)
    ☐ Index: idx_vsh_vehicle_timeline

☐ 3. CREATE TABLE vehicle_files
    ☐ All columns from §3.3
    ☐ CHECK: file_purpose
    ☐ UNIQUE: (vehicle_id, file_id)
    ☐ FK: vehicle_id → vehicles (CASCADE)
    ☐ FK: uploaded_by_user_id → users (SET NULL)
    ☐ NO FK on file_id (logical, TD-004)
    ☐ Index: idx_vf_vehicle

☐ 4. CREATE TABLE parking_zones
    ☐ All columns from §3.4
    ☐ CHECK: zone_type
    ☐ CHECK: capacity >= 0
    ☐ UNIQUE: (property_id, zone_code)
    ☐ FK: property_id → properties (CASCADE)
    ☐ FK: created_by_user_id → users (SET NULL)
    ☐ Index: idx_pz_property_active

☐ 5. CREATE TABLE parking_slots
    ☐ All columns from §3.5
    ☐ CHECK: slot_type
    ☐ CHECK: slot_status
    ☐ UNIQUE: (zone_id, slot_number)
    ☐ FK: zone_id → parking_zones (CASCADE)
    ☐ FK: vehicle_id → vehicles (SET NULL)
    ☐ Index: idx_ps_zone_status
    ☐ Index: idx_ps_vehicle (partial)
```

### 20.2 RBAC Seed Patch

```
☐ 6. INSERT permissions: vehicle.manage, parking.manage
☐ 7. INSERT role_permissions: owner, manager, admin → vehicle.manage + parking.manage
```

### 20.3 Dev Seed Update: `core-seed.data.ts`

```
☐ 8. Add property_settings parking values
☐ 9. Add vehicles sample data (8–10 entries)
☐ 10. Add vehicle_status_histories
☐ 11. Add vehicle_files (logical file_id)
☐ 12. Add parking_zones (if mode zone/slot)
☐ 13. Add parking_slots (if mode slot)
```

### 20.4 Post-Migration Verification

```
☐ 14. Run migration 007_vehicle.sql tanpa error
☐ 15. Verify semua FK valid
☐ 16. Verify semua CHECK constraint — insert invalid type/status ditolak
☐ 17. Verify partial unique — duplicate active plate ditolak
☐ 18. Verify partial unique — inactive plate BISA didaftarkan ulang
☐ 19. Verify semua index terbuat
☐ 20. Verify migration idempotent — re-run tidak error (IF NOT EXISTS)
☐ 21. Verify property_settings ALTER columns exist
☐ 22. Verify RBAC permissions seeded correctly
```

---

## 21. Risks Sebelum Migration

### 21.1 High Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-VEH-01 | **property_settings schema** — kolom parking mungkin conflict jika property_settings sudah di-ALTER oleh migration lain | Migration fail | Gunakan `ADD COLUMN IF NOT EXISTS`; review property_settings state |
| R-VEH-02 | **Partial unique index behavior** — edge case saat vehicle status berubah dari active ke inactive lalu plate dipakai lagi | Constraint violation jika timing salah | Transaction isolation; test concurrent re-registration |

### 21.2 Medium Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-VEH-03 | **Vehicle code sequence** — format `VEH-GSH-2026-0001` perlu strategy | Race condition concurrent inserts | Application-level: PostgreSQL SEQUENCE atau Redis INCR |
| R-VEH-04 | **Dev seed references non-existent residents** | Seed fails | Ensure dev seed creates residents first; check FK order |
| R-VEH-05 | **Parking mode switch** — property berubah mode setelah data ada | Orphan slots/zones | Application handles mode switch gracefully |

### 21.3 Low Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-VEH-06 | **Volume rendah → over-indexing** | Slightly slower writes | 10 indexes reasonable; volume < 200 vehicles |
| R-VEH-07 | **file_purpose enum expansion** | Perlu ALTER CHECK constraint | TEXT + CHECK mudah di-modify |

---

## 22. Rekomendasi Akhir

### 22.1 Verdict: **A — Siap Langsung ke 8C Migration**

| Aspek | Status |
|---|---|
| Schema sudah final? | ✅ Ya — 5 tabel + ALTER property_settings |
| Konsisten dengan existing migration pattern? | ✅ Ya — TEXT+CHECK, UUID PK, FK naming, partial index |
| Konsisten dengan VEHICLE_DOMAIN.md? | ✅ Ya — semua entity tercakup |
| Konsisten dengan DATABASE_PLANNING.md? | ✅ Ya — mengikuti konvensi naming dan audit |
| Gap Analysis resolved? | ✅ Ya — semua gap bersifat SOP/backlog, bukan schema |
| Dependency clear? | ✅ Ya — hanya depends on 001, 002, 003 |
| RBAC impact? | ✅ Minimal — 2 permission baru + role assignments |
| Blocking issues? | ❌ Tidak ada |

### 22.2 Perlu Revisi Domain?

**Tidak.** VEHICLE_DOMAIN.md tidak perlu direvisi. Database plan ini menerjemahkan domain planning secara faithful.

### 22.3 Perbandingan Module Size

| Module | Tables | Indexes | FK Count | Check Constraints |
|---|---|---|---|---|
| Billing (005) | 8 | 13 | ~20 | 12 |
| Complaint (006) | 8 (+1 recommended) | 15 | ~18 | 8 |
| **Vehicle (007)** | **5 + ALTER** | **10** | **12** | **7** |

Vehicle module lebih compact — sesuai dengan scope yang lebih focused.

### 22.4 Tabel yang Tidak Perlu Diputuskan Lagi

Semua keputusan sudah locked:
1. ✅ `parking_zones` + `parking_slots` — kedua tabel diperlukan
2. ✅ Visitor vehicle → Phase 2
3. ✅ Vehicle code generation → application-level
4. ✅ Plat nomor validasi → ringan Phase 1 (non-empty TEXT)
5. ✅ Property settings → ALTER TABLE tambah kolom

**Migration 007 bisa dimulai tanpa revisi dokumen lain.**
