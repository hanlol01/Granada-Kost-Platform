# COMPLAINT DATABASE PLAN — Granada Kost Platform

> **Versi**: 1.0  
> **Tanggal**: 17 Juni 2026  
> **Peran Pembuat**: Principal Database Architect — Complaint & Maintenance  
> **Status**: Dokumen Perencanaan Database — Siap untuk Migration Implementation  
> **Milestone**: 7B — Complaint Database Planning  
> **Dokumen Acuan**:  
> - [COMPLAINT_DOMAIN.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/COMPLAINT_DOMAIN.md)  
> - [DATABASE_PLANNING.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/DATABASE_PLANNING.md)  
> - [API_PLANNING.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/API_PLANNING.md)  
> - [BACKEND_ARCHITECTURE.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/BACKEND_ARCHITECTURE.md)  
> - [DOMAIN_MODEL.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/DOMAIN_MODEL.md)

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Final Table List](#2-final-table-list)
3. [Kolom Lengkap per Tabel](#3-kolom-lengkap-per-tabel)
4. [Constraint per Tabel](#4-constraint-per-tabel)
5. [Foreign Key Plan](#5-foreign-key-plan)
6. [Index Strategy](#6-index-strategy)
7. [Status Enum / Check Constraint Strategy](#7-status-enum--check-constraint-strategy)
8. [Complaint Category Seed Plan](#8-complaint-category-seed-plan)
9. [Technician Profile Data Model](#9-technician-profile-data-model)
10. [Complaint File / Evidence Strategy](#10-complaint-file--evidence-strategy)
11. [Work Order Relationship Strategy](#11-work-order-relationship-strategy)
12. [Common Area Complaint Strategy](#12-common-area-complaint-strategy)
13. [Audit Integration Strategy](#13-audit-integration-strategy)
14. [Property Owner Read-Only Summary Data Model](#14-property-owner-read-only-summary-data-model)
15. [Permission / RBAC Impact](#15-permission--rbac-impact)
16. [Seed Data Plan untuk Development](#16-seed-data-plan-untuk-development)
17. [Data yang Tidak Boleh Masuk Production Seed](#17-data-yang-tidak-boleh-masuk-production-seed)
18. [Migration Implementation Checklist](#18-migration-implementation-checklist)
19. [Risks Sebelum Migration](#19-risks-sebelum-migration)
20. [Open Decisions & Recommendation](#20-open-decisions--recommendation)

---

## 1. Executive Summary

Dokumen ini menerjemahkan `COMPLAINT_DOMAIN.md` (Milestone 7A) menjadi rencana database yang **siap dipakai Backend Team** untuk membuat migration file `006_complaint.sql`. Dokumen mengikuti pola yang sama dengan migration `005_billing.sql` yang sudah proven.

### Keputusan yang Sudah Dikunci

| # | Keputusan | Status |
|---|---|---|
| 1 | Complaint dan Work Order adalah entity terpisah | ✅ Decided |
| 2 | Complaint → Work Order = 1:0..N | ✅ Decided |
| 3 | Work Order bisa standalone tanpa complaint (`complaint_id` nullable) | ✅ Decided |
| 4 | `room_id` nullable di `complaints` — mendukung common area complaint | ✅ Decided (TD-CMP-001) |
| 5 | Penghuni tidak memilih priority — auto dari kategori default | ✅ Decided |
| 6 | Auto-close 72 jam setelah resolved; future configurable (TD-CMP-003) | ✅ Decided |
| 7 | `complaint_files.file_id` = logical FK; formal FK nanti (TD-004) | ✅ Decided |
| 8 | Property owner hanya aggregate summary — tidak perlu tabel baru | ✅ Decided |
| 9 | Money values menggunakan BIGINT minor unit (rupiah) | ✅ Decided (konsisten 005_billing) |
| 10 | Complaint status diperluas dari 4 status → 9 status | ✅ Decided (7A approved) |
| 11 | Work order status diperluas dari 5 status → 8 status (+ rework_required, verified, on_hold) | ✅ Decided (7A approved) |

### Migration File Plan

| File | Nomor | Konten |
|---|---|---|
| `006_complaint.sql` | 006 | Semua tabel complaint & maintenance |
| `002_complaint_category_seed.sql` (seed) | — | Default kategori complaint |
| `core-seed.data.ts` (update) | — | Dev seed complaint + work order sample data |

### Dependency dengan Existing Tables

```
006_complaint.sql depends on:
  ├── 001_iam_rbac.sql     → users (FK untuk actor/assignment columns)
  ├── 002_property_room.sql → properties, rooms (FK untuk scope/location)
  └── 003_resident_occupancy.sql → residents (FK untuk complaint owner)
```

---

## 2. Final Table List

### 2.1 Phase 1 Complaint & Maintenance Tables

| # | Tabel | Tujuan | Baru vs Existing |
|---|---|---|---|
| 1 | `complaint_categories` | Master kategori complaint per property | Baru |
| 2 | `complaints` | Tiket complaint utama | Baru |
| 3 | `complaint_status_histories` | Timeline setiap perubahan status complaint | Baru |
| 4 | `complaint_files` | Lampiran foto/evidence complaint | Baru |
| 5 | `technician_profiles` | Profil teknisi (linked to `users`) | Baru |
| 6 | `maintenance_work_orders` | Work order maintenance | Baru |
| 7 | `maintenance_work_order_histories` | Timeline setiap perubahan status work order | Baru |
| 8 | `maintenance_materials` | Material/biaya pekerjaan maintenance | Baru |

### 2.2 Phase 2 Candidates (Tidak masuk migration 006)

| # | Tabel | Alasan Defer |
|---|---|---|
| 1 | `complaint_comments` | Komunikasi dua arah, setelah Chat module atau Phase 2 |
| 2 | `complaint_ratings` | Post-resolution feedback, Phase 2 |
| 3 | `complaint_sla_records` | Dedicated SLA tracking; Phase 1 pakai calculated dari status history |
| 4 | `technician_skills` | Master skill taxonomy (TD-CMP-002), Phase 2 |
| 5 | `technician_skill_assignments` | Many-to-many skill assignment, Phase 2 |
| 6 | `preventive_maintenance_schedules` | Jadwal maintenance berkala, Phase 2 |
| 7 | `maintenance_vendor_profiles` | Vendor management, Phase 2 |

### 2.3 Urutan Pembuatan dalam Migration

```
006_complaint.sql:
  1. complaint_categories       ← no dependency to other new tables
  2. technician_profiles        ← no dependency to other new tables
  3. complaints                 ← depends on complaint_categories
  4. complaint_status_histories ← depends on complaints
  5. complaint_files            ← depends on complaints
  6. maintenance_work_orders    ← depends on complaints (nullable FK)
  7. maintenance_work_order_histories ← depends on maintenance_work_orders
  8. maintenance_materials      ← depends on maintenance_work_orders
```

---

## 3. Kolom Lengkap per Tabel

### 3.1 `complaint_categories`

```
┌──────────────────────────────────────────────────────────────────────┐
│ complaint_categories — Master kategori complaint per property       │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ name                 │ TEXT           │ NOT NULL                     │
│ normalized_code      │ TEXT           │ NOT NULL                     │
│ default_priority     │ TEXT           │ NOT NULL, DEFAULT 'low'      │
│ description          │ TEXT           │                              │
│ icon                 │ TEXT           │                              │
│ is_active            │ BOOLEAN        │ NOT NULL, DEFAULT true       │
│ sort_order           │ INTEGER        │ NOT NULL, DEFAULT 0          │
│ created_by_user_id   │ UUID           │ FK → users                   │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `normalized_code` = canonical query code (`ac`, `water`, `internet`, `security`, dll.)
- `name` = label UI dalam bahasa Indonesia ("AC / Pendingin Ruangan")
- Unique constraint: `(property_id, normalized_code)` — beda property bisa punya kode sama
- `icon` opsional — reference ke icon name (emoji atau icon library)
- `default_priority` digunakan untuk auto-assign priority saat Penghuni submit complaint

### 3.2 `complaints`

```
┌──────────────────────────────────────────────────────────────────────┐
│ complaints — Tiket complaint utama                                   │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ resident_id          │ UUID           │ NOT NULL, FK → residents     │
│ room_id              │ UUID           │ FK → rooms (NULLABLE)        │
│ category_id          │ UUID           │ NOT NULL, FK → categories    │
│ complaint_code       │ TEXT           │ NOT NULL                     │
│ title                │ TEXT           │ NOT NULL                     │
│ description          │ TEXT           │ NOT NULL                     │
│ priority             │ TEXT           │ NOT NULL, DEFAULT 'low'      │
│ complaint_status     │ TEXT           │ NOT NULL, DEFAULT 'submitted'│
│ reopen_count         │ INTEGER        │ NOT NULL, DEFAULT 0          │
│ response_sla_breached│ BOOLEAN        │ NOT NULL, DEFAULT false      │
│ resolution_sla_breached│ BOOLEAN      │ NOT NULL, DEFAULT false      │
│ location_note        │ TEXT           │                              │
│ assigned_to_user_id  │ UUID           │ FK → users (NULLABLE)        │
│ submitted_at         │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ acknowledged_at      │ TIMESTAMPTZ    │                              │
│ resolved_at          │ TIMESTAMPTZ    │                              │
│ closed_at            │ TIMESTAMPTZ    │                              │
│ cancelled_at         │ TIMESTAMPTZ    │                              │
│ cancel_reason        │ TEXT           │                              │
│ snapshot_room_number │ TEXT           │                              │
│ snapshot_resident_name│ TEXT          │ NOT NULL                     │
│ created_by_user_id   │ UUID           │ NOT NULL, FK → users         │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `room_id` **NULLABLE** — keputusan TD-CMP-001: mendukung complaint area umum
- `location_note` — deskripsi lokasi untuk complaint area umum (contoh: "Lobby lantai 1", "Parkiran belakang")
- `snapshot_room_number` — nullable karena common area tidak punya room number; hanya diisi jika `room_id` ada
- `snapshot_resident_name` — NOT NULL karena setiap complaint pasti ada pelapor
- `assigned_to_user_id` — nullable karena complaint baru belum di-assign
- `reopen_count` — tracked di complaint level; increment saat status → `reopened`
- Timestamps terpisah per milestone status: `submitted_at`, `acknowledged_at`, `resolved_at`, `closed_at`, `cancelled_at`

### 3.3 `complaint_status_histories`

```
┌──────────────────────────────────────────────────────────────────────┐
│ complaint_status_histories — Timeline perubahan status complaint     │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ complaint_id         │ UUID           │ NOT NULL, FK → complaints    │
│ from_status          │ TEXT           │ (NULLABLE, null for initial) │
│ to_status            │ TEXT           │ NOT NULL                     │
│ label                │ TEXT           │                              │
│ changed_by_user_id   │ UUID           │ FK → users (NULLABLE)        │
│ changed_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ notes                │ TEXT           │                              │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `from_status` nullable — null untuk entry pertama (creation)
- `changed_by_user_id` nullable — null untuk system-driven transitions (auto-close, SLA breach)
- `label` — human-readable timeline label ("Admin telah mereview complaint Anda")
- `notes` — catatan aktor (alasan cancel, reason escalation, dll.)
- Tabel ini juga berfungsi sebagai audit trail domain-specific; melengkapi `audit_logs`

### 3.4 `complaint_files`

```
┌──────────────────────────────────────────────────────────────────────┐
│ complaint_files — Lampiran foto/evidence complaint                   │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ complaint_id         │ UUID           │ NOT NULL, FK → complaints    │
│ file_id              │ UUID           │ NOT NULL (logical FK)        │
│ uploaded_by_user_id  │ UUID           │ NOT NULL, FK → users         │
│ caption              │ TEXT           │                              │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `file_id` — logical FK ke `files` table; **formal FK constraint tidak dibuat** karena File Module belum diimplementasikan (ref TD-004, konsisten dengan `payment_proof_files`)
- `UNIQUE (complaint_id, file_id)` — satu file tidak di-link dua kali ke complaint yang sama
- Pola ini identik dengan `payment_proof_files` di `005_billing.sql`

### 3.5 `technician_profiles`

```
┌──────────────────────────────────────────────────────────────────────┐
│ technician_profiles — Profil teknisi linked to users                 │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ user_id              │ UUID           │ NOT NULL, FK → users         │
│ display_name         │ TEXT           │ NOT NULL                     │
│ phone                │ TEXT           │                              │
│ skill_tags           │ TEXT           │                              │
│ is_active            │ BOOLEAN        │ NOT NULL, DEFAULT true       │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `UNIQUE (property_id, user_id)` — satu user hanya punya satu technician profile per property
- `skill_tags` — plain text (contoh: "AC, Listrik, Plumbing"); Phase 2 akan dijadikan relasi master table (TD-CMP-002)
- `display_name` — bisa berbeda dari `users.display_name`; nama tampil di assignment list
- `phone` — nomor telepon kerja teknisi, bisa berbeda dari `users.phone`
- Teknisi yang di-nonaktifkan (`is_active = false`) tidak muncul di assignment dropdown, tapi work order historis tetap merujuk ke profil ini

### 3.6 `maintenance_work_orders`

```
┌──────────────────────────────────────────────────────────────────────┐
│ maintenance_work_orders — Work order maintenance                     │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ property_id          │ UUID           │ NOT NULL, FK → properties    │
│ room_id              │ UUID           │ FK → rooms (NULLABLE)        │
│ complaint_id         │ UUID           │ FK → complaints (NULLABLE)   │
│ work_order_code      │ TEXT           │ NOT NULL                     │
│ title                │ TEXT           │ NOT NULL                     │
│ description          │ TEXT           │                              │
│ priority             │ TEXT           │ NOT NULL, DEFAULT 'medium'   │
│ work_order_status    │ TEXT           │ NOT NULL, DEFAULT 'open'     │
│ assigned_to_user_id  │ UUID           │ FK → users (NULLABLE)        │
│ scheduled_at         │ TIMESTAMPTZ    │                              │
│ started_at           │ TIMESTAMPTZ    │                              │
│ completed_at         │ TIMESTAMPTZ    │                              │
│ verified_at          │ TIMESTAMPTZ    │                              │
│ verified_by_user_id  │ UUID           │ FK → users (NULLABLE)        │
│ rework_reason        │ TEXT           │                              │
│ cancel_reason        │ TEXT           │                              │
│ created_by_user_id   │ UUID           │ NOT NULL, FK → users         │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ updated_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `complaint_id` NULLABLE — work order bisa standalone (internal/preventive maintenance)
- `room_id` NULLABLE — work order bisa untuk area umum (konsisten dengan complaints)
- `assigned_to_user_id` NULLABLE — belum di-assign saat baru dibuat
- `verified_by_user_id` + `verified_at` — **diperluas dari DATABASE_PLANNING.md** yang belum memiliki kolom verifikasi
- `rework_reason` — alasan admin meminta rework
- Status `rework_required`, `verified`, `on_hold` — **diperluas dari DATABASE_PLANNING.md** yang hanya punya 5 status

### 3.7 `maintenance_work_order_histories`

```
┌──────────────────────────────────────────────────────────────────────┐
│ maintenance_work_order_histories — Timeline perubahan status WO      │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ work_order_id        │ UUID           │ NOT NULL, FK → work_orders   │
│ from_status          │ TEXT           │ (NULLABLE, null for initial) │
│ to_status            │ TEXT           │ NOT NULL                     │
│ changed_by_user_id   │ UUID           │ FK → users (NULLABLE)        │
│ changed_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
│ notes                │ TEXT           │                              │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- Pola identik dengan `complaint_status_histories`
- `from_status` nullable untuk entry pertama
- Assignment/reassignment juga tercatat di sini (notes: "Reassigned from Budi to Anto")

### 3.8 `maintenance_materials`

```
┌──────────────────────────────────────────────────────────────────────┐
│ maintenance_materials — Material/biaya pekerjaan maintenance         │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ work_order_id        │ UUID           │ NOT NULL, FK → work_orders   │
│ item_name            │ TEXT           │ NOT NULL                     │
│ quantity             │ NUMERIC(12,2)  │ NOT NULL, DEFAULT 1          │
│ unit_cost            │ BIGINT         │ NOT NULL, DEFAULT 0          │
│ total_cost           │ BIGINT         │ NOT NULL, DEFAULT 0          │
│ created_by_user_id   │ UUID           │ FK → users                   │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
└──────────────────────┴────────────────┴──────────────────────────────┘
```

**Catatan desain**:
- `BIGINT` untuk `unit_cost` dan `total_cost` — konsisten dengan billing module (IDR minor unit)
- `NUMERIC(12,2)` untuk `quantity` — mendukung satuan desimal (0.5 meter pipa, 1.5 liter cat)
- Phase 1: informatif saja; tidak terhubung ke billing atau approval workflow

---

## 4. Constraint per Tabel

### 4.1 Check Constraints

| Tabel | Constraint Name | Expression |
|---|---|---|
| `complaint_categories` | `complaint_categories_priority_check` | `default_priority IN ('low', 'medium', 'high', 'urgent')` |
| `complaints` | `complaints_priority_check` | `priority IN ('low', 'medium', 'high', 'urgent')` |
| `complaints` | `complaints_status_check` | `complaint_status IN ('submitted', 'acknowledged', 'in_progress', 'on_hold', 'escalated', 'resolved', 'reopened', 'closed', 'cancelled')` |
| `complaints` | `complaints_reopen_count_check` | `reopen_count >= 0` |
| `maintenance_work_orders` | `work_orders_priority_check` | `priority IN ('low', 'medium', 'high', 'urgent')` |
| `maintenance_work_orders` | `work_orders_status_check` | `work_order_status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'rework_required', 'verified', 'cancelled')` |
| `maintenance_materials` | `materials_quantity_check` | `quantity > 0` |
| `maintenance_materials` | `materials_cost_check` | `unit_cost >= 0 AND total_cost >= 0` |

### 4.2 Unique Constraints

| Tabel | Constraint Name | Kolom | Keterangan |
|---|---|---|---|
| `complaint_categories` | `complaint_categories_unique_code` | `(property_id, normalized_code)` | Satu kode kategori unik per property |
| `complaints` | `complaints_unique_code` | `(property_id, complaint_code)` | Kode tiket unik per property |
| `complaint_files` | `complaint_files_unique_file` | `(complaint_id, file_id)` | Satu file tidak double-link |
| `technician_profiles` | `technician_profiles_unique_user` | `(property_id, user_id)` | Satu user = satu profil per property |
| `maintenance_work_orders` | `work_orders_unique_code` | `(property_id, work_order_code)` | Kode WO unik per property |

### 4.3 NOT NULL Strategy

| Prinsip | Penerapan |
|---|---|
| Kolom yang selalu ada saat create | `NOT NULL` |
| Kolom yang diisi nanti (assignment, timestamp milestone) | NULLABLE |
| Kolom referensi yang bisa kosong (room untuk area umum) | NULLABLE |
| Actor columns untuk system-driven transitions | NULLABLE |
| Snapshot columns yang bergantung pada `room_id` | NULLABLE jika room bisa null |

---

## 5. Foreign Key Plan

### 5.1 FK Ke Existing Tables

| Source Table | Source Column | Target Table | Target Column | ON DELETE | Catatan |
|---|---|---|---|---|---|
| `complaint_categories` | `property_id` | `properties` | `id` | CASCADE | Property dihapus → kategori ikut |
| `complaint_categories` | `created_by_user_id` | `users` | `id` | SET NULL | User dihapus → tetap simpan data |
| `complaints` | `property_id` | `properties` | `id` | CASCADE | |
| `complaints` | `resident_id` | `residents` | `id` | RESTRICT | Tidak boleh hapus resident yang punya complaint |
| `complaints` | `room_id` | `rooms` | `id` | SET NULL | Room dihapus → complaint tetap ada |
| `complaints` | `assigned_to_user_id` | `users` | `id` | SET NULL | User dihapus → unassign |
| `complaints` | `created_by_user_id` | `users` | `id` | RESTRICT | Creator harus ada |
| `technician_profiles` | `property_id` | `properties` | `id` | CASCADE | |
| `technician_profiles` | `user_id` | `users` | `id` | RESTRICT | Tidak boleh hapus user yang punya profil teknisi |
| `maintenance_work_orders` | `property_id` | `properties` | `id` | CASCADE | |
| `maintenance_work_orders` | `room_id` | `rooms` | `id` | SET NULL | Room dihapus → WO tetap ada |
| `maintenance_work_orders` | `assigned_to_user_id` | `users` | `id` | SET NULL | |
| `maintenance_work_orders` | `verified_by_user_id` | `users` | `id` | SET NULL | |
| `maintenance_work_orders` | `created_by_user_id` | `users` | `id` | RESTRICT | |

### 5.2 FK Antar New Tables

| Source Table | Source Column | Target Table | Target Column | ON DELETE | Catatan |
|---|---|---|---|---|---|
| `complaints` | `category_id` | `complaint_categories` | `id` | RESTRICT | Kategori tidak bisa dihapus kalau ada complaint |
| `complaint_status_histories` | `complaint_id` | `complaints` | `id` | CASCADE | Complaint dihapus → history ikut |
| `complaint_status_histories` | `changed_by_user_id` | `users` | `id` | SET NULL | |
| `complaint_files` | `complaint_id` | `complaints` | `id` | CASCADE | |
| `complaint_files` | `uploaded_by_user_id` | `users` | `id` | SET NULL | |
| `maintenance_work_orders` | `complaint_id` | `complaints` | `id` | SET NULL | Complaint dihapus → WO tetap ada (standalone) |
| `maintenance_work_order_histories` | `work_order_id` | `maintenance_work_orders` | `id` | CASCADE | |
| `maintenance_work_order_histories` | `changed_by_user_id` | `users` | `id` | SET NULL | |
| `maintenance_materials` | `work_order_id` | `maintenance_work_orders` | `id` | CASCADE | WO dihapus → materials ikut |
| `maintenance_materials` | `created_by_user_id` | `users` | `id` | SET NULL | |

### 5.3 Logical FK (Tanpa Formal Constraint)

| Source Table | Source Column | Target Table (Future) | Alasan |
|---|---|---|---|
| `complaint_files` | `file_id` | `files` | File Module belum diimplementasikan (TD-004) |

---

## 6. Index Strategy

### 6.1 Must-Have Indexes

| # | Tabel | Index Name | Kolom | Query Pattern |
|---|---|---|---|---|
| 1 | `complaints` | `idx_complaints_admin_queue` | `(property_id, complaint_status, priority, submitted_at DESC)` | Admin: queue complaint aktif per property |
| 2 | `complaints` | `idx_complaints_resident_history` | `(resident_id, submitted_at DESC)` | Penghuni: riwayat complaint miliknya |
| 3 | `complaints` | `idx_complaints_sla_breach` | `(property_id) WHERE response_sla_breached = true OR resolution_sla_breached = true` | Admin: filter SLA breached (partial index) |
| 4 | `complaints` | `idx_complaints_category` | `(property_id, category_id, complaint_status)` | Reporting: distribusi per kategori |
| 5 | `complaints` | `idx_complaints_assigned` | `(assigned_to_user_id, complaint_status)` | Teknisi: lihat complaint yang di-assign ke dia |
| 6 | `complaints` | `idx_complaints_autoclose` | `(complaint_status, resolved_at) WHERE complaint_status = 'resolved'` | Scheduler: auto-close job (partial index) |
| 7 | `complaint_status_histories` | `idx_csh_complaint_timeline` | `(complaint_id, changed_at ASC)` | Timeline display per complaint |
| 8 | `complaint_files` | `idx_cf_complaint` | `(complaint_id)` | File list per complaint |
| 9 | `complaint_categories` | `idx_cc_property_active` | `(property_id, is_active, sort_order)` | Penghuni: grid kategori aktif |
| 10 | `maintenance_work_orders` | `idx_wo_admin_queue` | `(property_id, work_order_status, priority, created_at DESC)` | Admin: queue work order per property |
| 11 | `maintenance_work_orders` | `idx_wo_technician_queue` | `(assigned_to_user_id, work_order_status)` | Teknisi: my work orders |
| 12 | `maintenance_work_orders` | `idx_wo_complaint` | `(complaint_id) WHERE complaint_id IS NOT NULL` | Work orders for a complaint (partial index) |
| 13 | `maintenance_work_order_histories` | `idx_woh_wo_timeline` | `(work_order_id, changed_at ASC)` | Timeline display per WO |
| 14 | `maintenance_materials` | `idx_mm_work_order` | `(work_order_id)` | Material list per WO |
| 15 | `technician_profiles` | `idx_tp_property_active` | `(property_id, is_active)` | Admin: list teknisi aktif |

### 6.2 Unique Indexes (sudah tercakup di Constraint)

| Tabel | Index | Kolom |
|---|---|---|
| `complaint_categories` | `UNIQUE` | `(property_id, normalized_code)` |
| `complaints` | `UNIQUE` | `(property_id, complaint_code)` |
| `complaint_files` | `UNIQUE` | `(complaint_id, file_id)` |
| `technician_profiles` | `UNIQUE` | `(property_id, user_id)` |
| `maintenance_work_orders` | `UNIQUE` | `(property_id, work_order_code)` |

### 6.3 Index yang Ditunda (Phase 2)

| Tabel | Index | Alasan Defer |
|---|---|---|
| `complaints` | GIN/trigram pada `title`, `description` | Full-text search; belum diperlukan Phase 1 |
| `complaints` | BRIN pada `submitted_at` | Hanya berguna setelah volume tinggi (>100k rows) |

---

## 7. Status Enum / Check Constraint Strategy

### 7.1 Strategi: TEXT + CHECK Constraint

Mengikuti pola yang sama dengan `005_billing.sql` — menggunakan `TEXT` column dengan `CHECK` constraint, bukan PostgreSQL `ENUM` type.

**Alasan**:
- `ALTER TYPE ... ADD VALUE` dalam transaction tidak supported di PostgreSQL < 12 (dan tidak idempotent)
- Text + CHECK mudah di-alter: tinggal `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`
- Konsisten dengan seluruh existing migration (billing, payments, proofs)

### 7.2 Complaint Status Values

| Status | Kode DB | Dari State | Ke State | Keterangan |
|---|---|---|---|---|
| Submitted | `submitted` | — (initial) | `acknowledged`, `cancelled` | Baru, belum ditinjau |
| Acknowledged | `acknowledged` | `submitted` | `in_progress`, `resolved` | Admin sudah review |
| In Progress | `in_progress` | `acknowledged`, `reopened`, `escalated`, `on_hold` | `resolved`, `on_hold`, `escalated` | Sedang ditangani |
| On Hold | `on_hold` | `in_progress` | `in_progress`, `escalated` | Menunggu faktor eksternal |
| Escalated | `escalated` | `in_progress`, `on_hold`, `reopened` | `in_progress`, `resolved` | Ditingkatkan ke manager |
| Resolved | `resolved` | `acknowledged`, `in_progress`, `escalated` | `closed`, `reopened` | Selesai, menunggu konfirmasi |
| Reopened | `reopened` | `resolved` | `in_progress`, `escalated` | Dibuka kembali |
| Closed | `closed` | `resolved` | (terminal) | Selesai final |
| Cancelled | `cancelled` | `submitted` | (terminal) | Dibatalkan |

**Perbedaan dari DATABASE_PLANNING.md**: Status diperluas dari 4 (`waiting`, `processing`, `done`, `cancelled`) menjadi 9 status sesuai COMPLAINT_DOMAIN.md §2.3 yang sudah approved.

### 7.3 Work Order Status Values

| Status | Kode DB | Dari State | Ke State | Keterangan |
|---|---|---|---|---|
| Open | `open` | — (initial) | `assigned`, `cancelled` | Baru dibuat |
| Assigned | `assigned` | `open` | `in_progress`, `cancelled` | Teknisi ditugaskan |
| In Progress | `in_progress` | `assigned`, `on_hold`, `rework_required` | `completed`, `on_hold`, `cancelled` | Sedang dikerjakan |
| On Hold | `on_hold` | `in_progress` | `in_progress` | Menunggu material/akses |
| Completed | `completed` | `in_progress` | `verified`, `rework_required` | Teknisi tandai selesai |
| Rework Required | `rework_required` | `completed` | `in_progress` | Admin minta ulang |
| Verified | `verified` | `completed` | (terminal) | Admin verifikasi OK |
| Cancelled | `cancelled` | `open`, `assigned`, `in_progress` | (terminal) | Dibatalkan |

**Perbedaan dari DATABASE_PLANNING.md**: Status diperluas dari 5 (`open`, `assigned`, `in_progress`, `completed`, `cancelled`) menjadi 8 status — menambahkan `on_hold`, `rework_required`, `verified`.

### 7.4 Priority Values (Shared)

| Level | Kode DB | Dipakai di |
|---|---|---|
| Low | `low` | `complaint_categories.default_priority`, `complaints.priority`, `maintenance_work_orders.priority` |
| Medium | `medium` | ← |
| High | `high` | ← |
| Urgent | `urgent` | ← |

---

## 8. Complaint Category Seed Plan

### 8.1 Default Category Seed Data

```
Seed file: seeds/002_complaint_category_seed.sql
Strategy: ON CONFLICT (property_id, normalized_code) DO UPDATE
Property: Menggunakan property_id dari properties table (first/seed property)
```

| # | `normalized_code` | `name` | `default_priority` | `sort_order` |
|---|---|---|---|---|
| 1 | `ac` | AC / Pendingin Ruangan | `high` | 1 |
| 2 | `water` | Air / Plumbing | `high` | 2 |
| 3 | `electricity` | Listrik | `high` | 3 |
| 4 | `internet` | Internet / WiFi | `medium` | 4 |
| 5 | `room_facility` | Fasilitas Kamar | `medium` | 5 |
| 6 | `common_facility` | Fasilitas Umum | `medium` | 6 |
| 7 | `cleanliness` | Kebersihan | `low` | 7 |
| 8 | `security` | Keamanan | `urgent` | 8 |
| 9 | `noise` | Kebisingan | `low` | 9 |
| 10 | `other` | Lainnya | `low` | 10 |

### 8.2 Seed Strategy

```sql
-- Pattern: INSERT ... ON CONFLICT DO UPDATE (same as 001_rbac_seed.sql)
-- Property reference: subquery to get first property
-- Safe to re-run

WITH category_seed(normalized_code, name, default_priority, sort_order) AS (
  VALUES
    ('ac', 'AC / Pendingin Ruangan', 'high', 1),
    ('water', 'Air / Plumbing', 'high', 2),
    ...
)
INSERT INTO complaint_categories (property_id, name, normalized_code, default_priority, sort_order)
SELECT p.id, cs.name, cs.normalized_code, cs.default_priority, cs.sort_order
FROM category_seed cs
CROSS JOIN (SELECT id FROM properties LIMIT 1) p
ON CONFLICT (property_id, normalized_code) DO UPDATE
SET name = EXCLUDED.name,
    default_priority = EXCLUDED.default_priority,
    sort_order = EXCLUDED.sort_order;
```

### 8.3 Multi-Property Seed

Untuk development dengan >1 property, seed harus di-run per property. Pattern:
- Loop properti dari `properties` table
- Insert default categories per property
- Atau: application-level seeding saat property baru dibuat

---

## 9. Technician Profile Data Model

### 9.1 Model Detail

| Aspek | Detail |
|---|---|
| **Relasi** | `technician_profiles` → `users` (1:1 per property) |
| **Role** | User harus memiliki role `technician` via `user_property_roles` |
| **Property scope** | `technician_profiles.property_id` harus match dengan `user_property_roles.property_id` |
| **Activation** | `is_active` flag — nonaktifkan tanpa menghapus data |
| **Skills** | `skill_tags` TEXT — plain text Phase 1; master table Phase 2 (TD-CMP-002) |
| **Phone** | Opsional — nomor telepon kerja teknisi |
| **Unique** | `(property_id, user_id)` — satu user = satu profil per property |

### 9.2 Relasi dengan users dan user_property_roles

```
users
  └── user_property_roles (role = 'technician', property_id = X)
      └── technician_profiles (property_id = X, user_id = users.id)
```

**Business rule**: Saat membuat `technician_profiles`, application layer harus memvalidasi bahwa user memiliki role `technician` pada property yang sama di `user_property_roles`. Database tidak enforce ini — validation dilakukan di application.

### 9.3 Impact Saat Technician Resign

| Aksi | Dampak | Mitigasi |
|---|---|---|
| User di-nonaktifkan | Work order assigned ke user tetap ada | Admin harus reassign work orders aktif |
| `is_active` = false | Tidak muncul di assignment dropdown | Existing WO tetap merujuk profil |
| User dihapus (edge case) | FK SET NULL pada work orders | Work order history tetap ada |

---

## 10. Complaint File / Evidence Strategy

### 10.1 Pattern: Sama dengan payment_proof_files

```
complaint_files
  ├── complaint_id  → complaints (formal FK, ON DELETE CASCADE)
  ├── file_id       → files (LOGICAL FK saja — no constraint)
  └── uploaded_by_user_id → users (formal FK, ON DELETE SET NULL)
```

### 10.2 Work Order Evidence

Work order evidence menggunakan pattern berbeda — melalui generic `file_links` table:

```
file_links (existing table saat File Module ready)
  ├── file_id        → files
  ├── resource_type  = 'maintenance_work_order'
  ├── resource_id    = work_order.id
  └── purpose        = 'maintenance_photo'
```

**Catatan**: Karena `file_links` dan `files` table belum exist, work order evidence di Phase 1 dapat:
1. Menggunakan pola `complaint_files` style (buat `maintenance_work_order_files` table) — **OR**
2. Menunda evidence upload untuk work order sampai File Module ready

**Rekomendasi**: Buat `maintenance_work_order_files` table sekarang, identik dengan `complaint_files`:

```
┌──────────────────────────────────────────────────────────────────────┐
│ maintenance_work_order_files — Lampiran foto work order (optional)   │
├──────────────────────┬────────────────┬──────────────────────────────┤
│ Kolom                │ Tipe           │ Constraint                   │
├──────────────────────┼────────────────┼──────────────────────────────┤
│ id                   │ UUID           │ PK, DEFAULT gen_random_uuid()│
│ work_order_id        │ UUID           │ NOT NULL, FK → work_orders   │
│ file_id              │ UUID           │ NOT NULL (logical FK)        │
│ uploaded_by_user_id  │ UUID           │ FK → users                   │
│ caption              │ TEXT           │                              │
│ created_at           │ TIMESTAMPTZ    │ NOT NULL, DEFAULT now()      │
├──────────────────────┴────────────────┴──────────────────────────────┤
│ UNIQUE (work_order_id, file_id)                                      │
└──────────────────────────────────────────────────────────────────────┘
```

> **Decision needed**: Apakah menambahkan tabel ke-9 `maintenance_work_order_files` sekarang, atau menunda ke File Module? Lihat §20 Open Decisions #1.

---

## 11. Work Order Relationship Strategy

### 11.1 Complaint → Work Order (1:0..N)

```
complaints (id)
  └── maintenance_work_orders (complaint_id → complaints.id, NULLABLE)
      ├── WO-1 (complaint_id = CMP-1)
      ├── WO-2 (complaint_id = CMP-1)  ← multiple WO per complaint OK
      └── WO-3 (complaint_id = NULL)   ← standalone work order
```

### 11.2 Auto-Resolve Logic

```
Ketika work_order_status → 'verified':
  1. Query: SELECT COUNT(*) FROM maintenance_work_orders
             WHERE complaint_id = ? AND work_order_status NOT IN ('verified', 'cancelled')
  2. Jika count = 0 → semua WO selesai → complaint auto → 'resolved'
  3. Jika count > 0 → complaint tetap 'in_progress'
```

**Ini adalah application-level logic, bukan database trigger.**

### 11.3 Cascade Behavior

| Scenario | Behavior |
|---|---|
| Complaint dihapus | Work order `complaint_id` → SET NULL (WO tetap ada sebagai standalone) |
| Complaint cancelled | Work order tetap in-progress; admin harus cancel WO secara manual |
| Work order cancelled | Complaint tidak otomatis berubah status |
| Semua WO verified | Application auto-resolve complaint (bukan DB trigger) |

---

## 12. Common Area Complaint Strategy

### 12.1 Keputusan: room_id NULLABLE (TD-CMP-001)

```sql
-- complaints table
room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,  -- NULLABLE
location_note TEXT,                                      -- free text untuk lokasi
snapshot_room_number TEXT,                               -- NULLABLE (null untuk area umum)
```

### 12.2 Validasi di Application Layer

| Kondisi | Validasi |
|---|---|
| `room_id` IS NOT NULL | `snapshot_room_number` diisi dari `rooms.number` |
| `room_id` IS NULL | `location_note` sebaiknya diisi (soft validation, bukan hard NOT NULL) |
| `room_id` IS NULL + `location_note` IS NULL | Acceptable — complaint tanpa lokasi spesifik |

### 12.3 Contoh Data

| complaint_code | room_id | location_note | snapshot_room_number | category |
|---|---|---|---|---|
| TKT-GSH-2026-0001 | uuid-room-101 | null | "101" | `ac` |
| TKT-GSH-2026-0002 | null | "Lobby lantai 1" | null | `common_facility` |
| TKT-GSH-2026-0003 | null | "Parkiran belakang" | null | `security` |
| TKT-GSH-2026-0004 | uuid-room-205 | null | "205" | `water` |

---

## 13. Audit Integration Strategy

### 13.1 Dual-Layer Audit

Complaint module menggunakan **dua layer** audit:

| Layer | Tabel | Tujuan |
|---|---|---|
| **Domain-specific audit** | `complaint_status_histories`, `maintenance_work_order_histories` | Timeline detail untuk UI dan domain query |
| **Generic audit** | `audit_logs` (existing) | Cross-cutting audit untuk security, compliance, search |

### 13.2 Complaint Events → audit_logs

| Action Code | Resource Type | Kapan |
|---|---|---|
| `complaint.created` | `complaint` | Complaint baru dibuat |
| `complaint.acknowledged` | `complaint` | Admin acknowledge |
| `complaint.status_changed` | `complaint` | Setiap status transition |
| `complaint.priority_changed` | `complaint` | Priority diubah |
| `complaint.assigned` | `complaint` | Teknisi di-assign |
| `complaint.cancelled` | `complaint` | Complaint dibatalkan |
| `complaint.escalated` | `complaint` | Complaint di-eskalasi |
| `complaint.file_uploaded` | `complaint_file` | File di-attach |
| `work_order.created` | `maintenance_work_order` | WO baru dibuat |
| `work_order.assigned` | `maintenance_work_order` | Teknisi ditugaskan |
| `work_order.status_changed` | `maintenance_work_order` | Setiap status transition |
| `work_order.verified` | `maintenance_work_order` | Admin verifikasi |
| `work_order.rework_requested` | `maintenance_work_order` | Admin minta rework |
| `complaint_category.created` | `complaint_category` | Kategori baru |
| `complaint_category.updated` | `complaint_category` | Kategori diubah |

### 13.3 Database Impact

- **Tidak perlu tabel audit baru** — semua masuk ke existing `audit_logs`
- `complaint_status_histories` dan `maintenance_work_order_histories` berfungsi sebagai audit trail domain-specific
- Application layer menulis ke kedua layer secara atomik (dalam satu transaction)

---

## 14. Property Owner Read-Only Summary Data Model

### 14.1 Tidak Perlu Tabel Baru

Property owner summary dihitung **on-the-fly** dari `complaints` table:

```sql
-- Contoh query complaint-summary untuk property_owner
SELECT
  COUNT(*) FILTER (WHERE complaint_status NOT IN ('closed', 'cancelled')) AS open_count,
  COUNT(*) FILTER (WHERE complaint_status = 'closed') AS closed_count,
  COUNT(*) FILTER (WHERE complaint_status = 'cancelled') AS cancelled_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - submitted_at)) / 3600)
    FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_hours,
  COUNT(*) FILTER (WHERE resolution_sla_breached = true) AS sla_breached_count,
  COUNT(*) AS total_count
FROM complaints
WHERE property_id = $1
  AND submitted_at >= $2  -- period filter
  AND submitted_at < $3;
```

### 14.2 Alasan Tidak Pakai Materialized View / Snapshot Table

| Faktor | Justifikasi |
|---|---|
| Volume | ±20–50 complaint/bulan; direct query murah |
| Frekuensi akses | Property owner jarang akses (weekly/monthly) |
| Freshness | Lebih baik real-time daripada stale snapshot |
| Complexity | Snapshot memerlukan scheduler tambahan |
| Phase 2 | Jika volume naik, buat `dashboard_metric_snapshots` entry |

### 14.3 Index yang Mendukung

- `idx_complaints_admin_queue` sudah mencakup `(property_id, complaint_status, ...)` — cukup untuk aggregate query property owner
- Tidak perlu index tambahan khusus property owner

---

## 15. Permission / RBAC Impact

### 15.1 New Permissions yang Perlu di-Seed

RBAC seed saat ini (`001_rbac_seed.sql`) sudah memiliki:
- `complaint.manage`
- `maintenance.manage`

Namun COMPLAINT_DOMAIN.md §12.2 mendefinisikan **12 permission codes** yang lebih granular. Keputusan:

### 15.2 Strategi: Granular di Phase 2, Coarse di Phase 1

| Phase 1 (Sekarang) | Phase 2 (Nanti) |
|---|---|
| Tetap gunakan `complaint.manage` dan `maintenance.manage` yang sudah ada | Pecah menjadi `complaint.view`, `complaint.self.create`, `complaint.self.view`, dll. |
| Teknisi: `complaint.manage` + `maintenance.manage` (sudah di-seed) | Tambahkan `maintenance.assigned.view`, `maintenance.assigned.update` |
| Resident: belum perlu permission di seed; enforce di application level | Tambahkan `complaint.self.*` permissions |
| Property owner: `property_owner.report.view` sudah ada | Tidak perlu permission baru |

### 15.3 Migration Impact pada RBAC

**Tidak ada perubahan pada `001_rbac_seed.sql`** — permission `complaint.manage` dan `maintenance.manage` sudah ter-assign ke role yang tepat:

| Role | `complaint.manage` | `maintenance.manage` |
|---|:---:|:---:|
| `owner` | ✅ | ✅ |
| `manager` | ✅ | ✅ |
| `admin` | ✅ | ✅ |
| `technician` | ✅ | ✅ |
| `resident` | — (self-scope di application) | — |
| `property_owner` | — (aggregate summary di application) | — |

### 15.4 Scope Enforcement (Application-Level, bukan Database)

| Role | Scope | Enforcement |
|---|---|---|
| `technician` | Hanya work order yang `assigned_to_user_id` = current user | Application guard |
| `resident` | Hanya complaint yang `resident_id` = current resident | Application guard |
| `property_owner` | Hanya aggregate data property yang di-assign | Application guard + `property_investor_assignments` |
| Staff | Property scope via `user_property_roles` | Application guard |

---

## 16. Seed Data Plan untuk Development

### 16.1 Category Seed (Production & Dev)

```
File: seeds/002_complaint_category_seed.sql
Environment: ALL (production + development + staging)
Strategy: Idempotent INSERT ... ON CONFLICT DO UPDATE
```

10 kategori default seperti di §8.

### 16.2 Dev-Only Complaint & Work Order Sample Data

```
File: Update seeds/core-seed.data.ts
Environment: Development ONLY
```

Sample data yang perlu ditambahkan:

| Entity | Jumlah | Keterangan |
|---|---|---|
| `technician_profiles` | 2–3 | Profil teknisi untuk testing assignment |
| `complaints` | 8–12 | Spread across status: submitted(2), acknowledged(1), in_progress(3), on_hold(1), resolved(2), closed(2), cancelled(1) |
| `complaint_status_histories` | 3–5 per complaint | Timeline realistis |
| `complaint_files` | 2–3 | Sample file references (logical file_id) |
| `maintenance_work_orders` | 5–8 | Mix: complaint-linked(4) + standalone(2-4), spread across status |
| `maintenance_work_order_histories` | 2–4 per WO | Timeline realistis |
| `maintenance_materials` | 2–3 per completed WO | Sample material entries |

### 16.3 Sample Complaint Data

| # | Code | Title | Category | Priority | Status | Assigned |
|---|---|---|---|---|---|---|
| 1 | TKT-GSH-2026-0001 | AC kamar 101 tidak dingin | `ac` | high | `in_progress` | Budi (tech) |
| 2 | TKT-GSH-2026-0002 | Keran kamar mandi bocor | `water` | high | `resolved` | Anto (tech) |
| 3 | TKT-GSH-2026-0003 | WiFi lantai 3 lambat | `internet` | medium | `submitted` | — |
| 4 | TKT-GSH-2026-0004 | Lampu koridor mati | `common_facility` | medium | `acknowledged` | — |
| 5 | TKT-GSH-2026-0005 | Pintu gerbang rusak | `security` | urgent | `escalated` | Budi (tech) |
| 6 | TKT-GSH-2026-0006 | Cat dinding mengelupas | `room_facility` | low | `closed` | Anto (tech) |
| 7 | TKT-GSH-2026-0007 | Sampah area parkir | `cleanliness` | low | `cancelled` | — |
| 8 | TKT-GSH-2026-0008 | AC kamar 205 bocor air | `ac` | high | `in_progress` | Budi (tech) |

### 16.4 Technician Sample Data

| # | Display Name | Phone | Skill Tags | Property |
|---|---|---|---|---|
| 1 | Budi Santoso | 081234567890 | AC, Listrik, Plumbing | Granada Smart Home |
| 2 | Anto Wijaya | 081234567891 | Plumbing, Furniture | Granada Smart Home |
| 3 | Rudi Hermawan | 081234567892 | Internet, Listrik | Granada Smart Home |

---

## 17. Data yang Tidak Boleh Masuk Production Seed

| Data | Alasan | Seed Target |
|---|---|---|
| Sample complaints | Data fiksi — production mulai kosong | Dev only |
| Sample work orders | Data fiksi | Dev only |
| Sample technician profiles | Profil harus dibuat admin saat onboarding | Dev only |
| Sample complaint_files | Logical file_id fiksi — file belum ada | Dev only |
| Sample materials | Data fiksi | Dev only |
| Sample status histories | Data fiksi | Dev only |

**Yang BOLEH masuk production seed**:
- Complaint categories (10 default kategori) — seed `002_complaint_category_seed.sql`
- Permissions & role_permissions (sudah ada di `001_rbac_seed.sql`)

---

## 18. Migration Implementation Checklist

### 18.1 Migration File: `006_complaint.sql`

```
☐ 1. CREATE TABLE complaint_categories
    ☐ All columns from §3.1
    ☐ CHECK constraint: default_priority
    ☐ UNIQUE constraint: (property_id, normalized_code)
    ☐ FK: property_id → properties
    ☐ FK: created_by_user_id → users
    ☐ Index: idx_cc_property_active

☐ 2. CREATE TABLE technician_profiles
    ☐ All columns from §3.5
    ☐ UNIQUE constraint: (property_id, user_id)
    ☐ FK: property_id → properties
    ☐ FK: user_id → users
    ☐ Index: idx_tp_property_active

☐ 3. CREATE TABLE complaints
    ☐ All columns from §3.2
    ☐ CHECK constraint: priority, complaint_status, reopen_count
    ☐ UNIQUE constraint: (property_id, complaint_code)
    ☐ FK: property_id → properties (CASCADE)
    ☐ FK: resident_id → residents (RESTRICT)
    ☐ FK: room_id → rooms (SET NULL) — NULLABLE
    ☐ FK: category_id → complaint_categories (RESTRICT)
    ☐ FK: assigned_to_user_id → users (SET NULL)
    ☐ FK: created_by_user_id → users (RESTRICT)
    ☐ Index: idx_complaints_admin_queue
    ☐ Index: idx_complaints_resident_history
    ☐ Index: idx_complaints_sla_breach (partial)
    ☐ Index: idx_complaints_category
    ☐ Index: idx_complaints_assigned
    ☐ Index: idx_complaints_autoclose (partial)

☐ 4. CREATE TABLE complaint_status_histories
    ☐ All columns from §3.3
    ☐ FK: complaint_id → complaints (CASCADE)
    ☐ FK: changed_by_user_id → users (SET NULL)
    ☐ Index: idx_csh_complaint_timeline

☐ 5. CREATE TABLE complaint_files
    ☐ All columns from §3.4
    ☐ UNIQUE constraint: (complaint_id, file_id)
    ☐ FK: complaint_id → complaints (CASCADE)
    ☐ FK: uploaded_by_user_id → users (SET NULL)
    ☐ NO FK on file_id (logical FK, TD-004)
    ☐ Index: idx_cf_complaint

☐ 6. CREATE TABLE maintenance_work_orders
    ☐ All columns from §3.6
    ☐ CHECK constraint: priority, work_order_status
    ☐ UNIQUE constraint: (property_id, work_order_code)
    ☐ FK: property_id → properties (CASCADE)
    ☐ FK: room_id → rooms (SET NULL) — NULLABLE
    ☐ FK: complaint_id → complaints (SET NULL) — NULLABLE
    ☐ FK: assigned_to_user_id → users (SET NULL)
    ☐ FK: verified_by_user_id → users (SET NULL)
    ☐ FK: created_by_user_id → users (RESTRICT)
    ☐ Index: idx_wo_admin_queue
    ☐ Index: idx_wo_technician_queue
    ☐ Index: idx_wo_complaint (partial)

☐ 7. CREATE TABLE maintenance_work_order_histories
    ☐ All columns from §3.7
    ☐ FK: work_order_id → maintenance_work_orders (CASCADE)
    ☐ FK: changed_by_user_id → users (SET NULL)
    ☐ Index: idx_woh_wo_timeline

☐ 8. CREATE TABLE maintenance_materials
    ☐ All columns from §3.8
    ☐ CHECK constraint: quantity, cost
    ☐ FK: work_order_id → maintenance_work_orders (CASCADE)
    ☐ FK: created_by_user_id → users (SET NULL)
    ☐ Index: idx_mm_work_order
```

### 18.2 Seed File: `002_complaint_category_seed.sql`

```
☐ 9. INSERT complaint categories
    ☐ 10 default categories from §8.1
    ☐ ON CONFLICT DO UPDATE pattern
    ☐ Reference property from properties table
    ☐ Safe to re-run
```

### 18.3 Dev Seed Update: `core-seed.data.ts`

```
☐ 10. Add technician_profiles sample data
☐ 11. Add complaints sample data (8–12 entries)
☐ 12. Add complaint_status_histories
☐ 13. Add complaint_files (logical file_id)
☐ 14. Add maintenance_work_orders (5–8 entries)
☐ 15. Add maintenance_work_order_histories
☐ 16. Add maintenance_materials
```

### 18.4 Post-Migration Verification

```
☐ 17. Run migration 006_complaint.sql tanpa error
☐ 18. Run seed 002_complaint_category_seed.sql tanpa error
☐ 19. Run core-seed.data.ts tanpa error
☐ 20. Verify semua FK valid — no orphan references
☐ 21. Verify semua CHECK constraint — insert invalid status ditolak
☐ 22. Verify semua UNIQUE constraint — duplicate code ditolak
☐ 23. Verify semua index terbuat — \di di psql
☐ 24. Verify migration idempotent — re-run tidak error (IF NOT EXISTS)
☐ 25. Verify seed idempotent — re-run tidak duplikasi data
```

---

## 19. Risks Sebelum Migration

### 19.1 High Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-DB-01 | **Status enum mismatch** — code menggunakan status yang belum ada di CHECK | Runtime error pada INSERT/UPDATE | Double-check: 9 complaint status + 8 WO status match domain doc |
| R-DB-02 | **FK cascade unintended** — property delete menghapus semua complaint | Data loss | `ON DELETE CASCADE` hanya pada property; resident = `RESTRICT` |
| R-DB-03 | **Dev seed references non-existent users** — technician profile dan complaint assignment | Seed fails | Ensure dev seed creates users first, then technician profiles |

### 19.2 Medium Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-DB-04 | **Code sequence strategy** — how to generate `TKT-GSH-2026-0001` | Race condition pada concurrent inserts | Application-level: gunakan PostgreSQL SEQUENCE atau Redis INCR per property per year |
| R-DB-05 | **Snapshot stale** — `snapshot_room_number` berubah jika room di-rename | Complaint menampilkan room number lama | Ini desain yang benar — snapshot menyimpan data saat submit |
| R-DB-06 | **Large number of indexes** — 15 indexes bisa impact write performance | Slower INSERT/UPDATE | Volume rendah (20-50 complaint/bulan); tidak masalah |

### 19.3 Low Risk

| # | Risk | Dampak | Mitigasi |
|---|---|---|---|
| R-DB-07 | **Partial index performance** — PostgreSQL partial index overhead | Minimal | Partial index sangat efisien; standard PostgreSQL pattern |
| R-DB-08 | **materials total_cost accuracy** — computed column vs stored | Inconsistency | Application-level: compute `total_cost = quantity * unit_cost` di service layer |

---

## 20. Open Decisions & Recommendation

### 20.1 Open Decisions

| # | Keputusan | Opsi | Dampak Migration | Rekomendasi |
|---|---|---|---|---|
| OD-01 | **Work order file table** — Buat `maintenance_work_order_files` sekarang atau tunggu File Module? | A: Buat sekarang (tabel ke-9)<br>B: Tunggu File Module | A: +1 tabel di migration<br>B: Teknisi belum bisa upload foto WO | **A: Buat sekarang** — frontend sudah mendukung upload foto; pola identik dengan `complaint_files` |
| OD-02 | **Complaint code generation** — PostgreSQL SEQUENCE atau application-level? | A: PG SEQUENCE per property<br>B: Application-level (Redis INCR) | A: Tambah SEQUENCE objects di migration<br>B: Tidak ada impact migration | **B: Application-level** — lebih fleksibel untuk format `TKT-{CODE}-{YYYY}-{NNNN}` |
| OD-03 | **Complaint description max length** — Perlu TEXT limit? | A: Unlimited TEXT<br>B: VARCHAR(5000) | Minimal | **A: Unlimited TEXT** — konsisten dengan billing; limit enforce di application validation |

### 20.2 Final Recommendation

> **7C bisa langsung migration tanpa revisi dokumen lain.**

| Aspek | Status |
|---|---|
| Schema sudah final? | ✅ Ya — 8 tabel (atau 9 jika OD-01 approved) |
| Konsisten dengan existing migration pattern? | ✅ Ya — TEXT+CHECK, UUID PK, BIGINT money, FK naming |
| Konsisten dengan DATABASE_PLANNING.md? | ✅ Ya — diperluas sesuai 7A approval |
| Konsisten dengan API_PLANNING.md? | ✅ Ya — semua API endpoints punya tabel backing |
| Dependency clear? | ✅ Ya — hanya depends on 001, 002, 003 |
| RBAC impact? | ✅ Minimal — permission sudah ada di seed |
| Blocking issues? | ❌ Tidak ada |

**Tabel yang perlu diputuskan sebelum migration**:
1. OD-01: `maintenance_work_order_files` — buat atau tidak?

**Sisanya sudah locked dan siap di-implement.**

---

## Appendix A: Migration SQL Pseudo-Reference

Untuk membantu Backend Team, berikut pseudo-SQL yang menggambarkan pattern (bukan final SQL):

```sql
-- 006_complaint.sql follows the same pattern as 005_billing.sql:
--
-- 1. CREATE TABLE IF NOT EXISTS ... (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      ... columns ...,
--      CONSTRAINT ..._check CHECK (...),
--      CONSTRAINT ..._unique UNIQUE (...)
--    );
--
-- 2. CREATE INDEX IF NOT EXISTS idx_...
--      ON table_name(columns);
--
-- 3. Partial indexes:
--    CREATE INDEX IF NOT EXISTS idx_...
--      ON table_name(columns)
--      WHERE condition;
--
-- All statements use IF NOT EXISTS for idempotency.
```

---

## Appendix B: Diff dari DATABASE_PLANNING.md

Kolom dan status yang **ditambahkan** di dokumen ini dibanding DATABASE_PLANNING.md:

### Complaint Table

| Kolom/Aspek | DATABASE_PLANNING.md | Dokumen Ini |
|---|---|---|
| `location_note` | ❌ Tidak ada | ✅ Ditambahkan (common area) |
| `reopen_count` | ❌ Tidak ada | ✅ Ditambahkan |
| `response_sla_breached` | ❌ Tidak ada | ✅ Ditambahkan |
| `resolution_sla_breached` | ❌ Tidak ada | ✅ Ditambahkan |
| `snapshot_room_number` | ❌ Tidak ada | ✅ Ditambahkan |
| `snapshot_resident_name` | ❌ Tidak ada | ✅ Ditambahkan |
| `acknowledged_at` | ❌ Tidak ada | ✅ Ditambahkan |
| `closed_at` | ❌ Tidak ada | ✅ Ditambahkan |
| `cancelled_at` | ❌ Tidak ada | ✅ Ditambahkan |
| `cancel_reason` | ❌ Tidak ada | ✅ Ditambahkan |
| `created_by_user_id` | ❌ Tidak ada | ✅ Ditambahkan |
| `room_id` nullable | NOT NULL | ✅ NULLABLE (TD-CMP-001) |
| Status values | 4 (`waiting`, `processing`, `done`, `cancelled`) | 9 status (lihat §7.2) |

### Work Order Table

| Kolom/Aspek | DATABASE_PLANNING.md | Dokumen Ini |
|---|---|---|
| `verified_at` | ❌ Tidak ada | ✅ Ditambahkan |
| `verified_by_user_id` | ❌ Tidak ada | ✅ Ditambahkan |
| `rework_reason` | ❌ Tidak ada | ✅ Ditambahkan |
| `cancel_reason` | ❌ Tidak ada | ✅ Ditambahkan |
| `created_by_user_id` | ❌ Tidak ada | ✅ Ditambahkan |
| `room_id` nullable | Implicitly NOT NULL | ✅ NULLABLE (common area) |
| Status values | 5 (`open`, `assigned`, `in_progress`, `completed`, `cancelled`) | 8 status (lihat §7.3) |

### Category Table

| Kolom/Aspek | DATABASE_PLANNING.md | Dokumen Ini |
|---|---|---|
| `default_priority` | ❌ Tidak ada | ✅ Ditambahkan |
| `description` | ❌ Tidak ada | ✅ Ditambahkan |
| `icon` | ❌ Tidak ada | ✅ Ditambahkan |
| `created_by_user_id` | ❌ Tidak ada | ✅ Ditambahkan |

### Materials Table

| Kolom/Aspek | DATABASE_PLANNING.md | Dokumen Ini |
|---|---|---|
| `created_by_user_id` | ❌ Tidak ada | ✅ Ditambahkan |
| `created_at` | ❌ Tidak ada | ✅ Ditambahkan |
| `quantity` type | Implicit | `NUMERIC(12,2)` — support desimal |
