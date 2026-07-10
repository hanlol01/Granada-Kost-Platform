# Revisi Besar Sistem Manajemen Kost — Granada/Kostation

Rencana perombakan menyeluruh halaman admin untuk meningkatkan UX, kelengkapan fitur, dan korelasi data antar modul.

> **Status dokumen: IMPLEMENTATION READY, menunggu persetujuan kontrak lintas-domain (admin full-stack).** Dokumen ini adalah kontrak implementasi untuk sesi berikutnya. Ketentuan pada **Fase 0 — Kontrak Arsitektur & Data** bersifat normatif dan mengalahkan narasi atau contoh lama yang bertentangan di bagian lain.

> **Amendment lintas-domain:** Sebelum implementasi dimulai, keputusan yang sebelumnya masih terbuka atau berpotensi bertentangan dibekukan dalam [ADMIN_UX_FINAL_INTEGRATION.md](../plans/ADMIN_UX_FINAL_INTEGRATION.md). Setelah disetujui, dokumen tersebut mengalahkan contoh Fase 0–9 yang berbeda, khususnya tentang tanggal lease/transfer, settlement refund, RBAC finansial, recovery status kamar, kompatibilitas API, dan rollout.

---

## Konteks & Latar Belakang

Sistem saat ini sudah memiliki fondasi yang baik (163 kamar, 26 gedung/unit, billing, payment gateway, booking leads, galeri hunian, public listing). Namun terdapat beberapa kelemahan kritis:

1. **Kurangnya korelasi data** — Penghuni, Pembayaran, Kendaraan berdiri sendiri tanpa koneksi jelas ke Penyewaan
2. **Master data kamar tidak lengkap** — Tidak ada detail penghuni di kamar terisi, harga tahunan belum terformat, fasilitas belum terstruktur
3. **UX navigasi** — Sidebar datar tanpa pengelompokan logis, form kompleks masih di modal dialog
4. **Belum ada entitas Penyewaan** — Penghuni langsung di-check-in tanpa kontrak sewa formal

### Hierarki Data Baru (Hasil Interview)

```
Properti (1 properti = semua kost)
├── Tipe Kost: Rumah Kost
│   ├── Fasilitas (seragam semua kamar Rumah Kost)
│   ├── Harga (seragam: bulanan & tahunan)
│   ├── Ukuran kamar (seragam, misal 3x4)
│   ├── Deskripsi & Aturan (spesifik Rumah Kost)
│   ├── Galeri (1 set foto berlaku semua kamar Rumah Kost)
│   ├── Gedung/Unit: 01, 02, ... 15 (Putra/Putri)
│   │   ├── Lantai: Atas, Bawah
│   │   │   └── Kamar: K01, K02, ...
│   │   └── ...
│   └── ...
├── Tipe Kost: Apart Kost
│   ├── Fasilitas (seragam semua kamar Apart Kost)
│   ├── Harga (berbeda dari Rumah Kost, tapi seragam antar kamar Apart Kost)
│   ├── Ukuran kamar (seragam per tipe)
│   ├── Deskripsi & Aturan (spesifik Apart Kost)
│   ├── Galeri (1 set foto berlaku semua kamar Apart Kost)
│   └── Gedung/Unit: 18A, 18B, ...
│       ├── Lantai: A, B
│       │   └── Kamar: AK-01, AK-02, ...
│       └── ...
├── Aturan Global (jam malam, KTP wajib, dll — berlaku semua tipe)
└── Galeri Area Bersama (lobby, dapur, rooftop — berlaku semua)
```

> [!IMPORTANT]
> **Keputusan kunci**: Harga, fasilitas, ukuran, dan galeri ditentukan di level **Tipe Kost** (bukan per kamar atau per gedung). Semua kamar dalam 1 tipe kost identik.

---

## Status Implementasi, Scope, dan Batasan

> [!IMPORTANT]
> **Fokus implementasi: Admin Panel + API/Database pendukung.** Halaman publik `/kamar` tidak diubah pada revisi ini. Kontrak dan respons endpoint publik yang ada harus tetap kompatibel selama masa transisi.

> [!WARNING]
> **Migrasi database bersifat forward-only dan additive.** Kolom/tabel lama tidak dihapus pada revisi ini. Reset data realistis adalah skrip terpisah untuk database demo development/staging, bukan bagian dari migration dan tidak pernah boleh berjalan di production.

### Definisi Selesai

Revisi dinyatakan selesai hanya jika seluruh kondisi berikut terpenuhi:

1. Semua migration dapat diterapkan dua kali pada database disposable tanpa error atau perubahan data tak terduga.
2. Seluruh flow inti bekerja secara transaksional: buat sewa, tagihan pertama, tagihan berulang, pembayaran deposit, checkout, dan pindah kamar.
3. Endpoint lama yang masih dipakai admin/penghuni tidak kehilangan data atau mengubah bentuk respons tanpa adapter kompatibilitas.
4. UI admin lulus lint, typecheck, build, dan seluruh acceptance criteria pada dokumen ini.
5. Reset seed hanya dapat berjalan pada database demo yang diberi konfirmasi eksplisit; production dan database yang berisi perangkat Smart Lock non-demo harus ditolak.

---

## Fase 0: Kontrak Arsitektur & Data

Bagian ini wajib diselesaikan sebelum perubahan UI atau endpoint baru diaktifkan. Tidak ada implementasi yang boleh mengabaikan invariant, kontrak, atau urutan transaksi di bawah ini.

### 0A. Kepemilikan Data dan Kompatibilitas

| Entitas | Sumber kebenaran setelah revisi | Aturan kompatibilitas |
|---|---|---|
| Properti dan gedung/unit | Properti, room_buildings, serta atribut kategori/gender gedung tetap menjadi sumber kebenaran lokasi fisik. | Tidak dihapus. Kategori room dan gedung harus sama dengan kategori kost type melalui validasi service. |
| Tipe kost | kost_types adalah sumber kebenaran untuk harga, deposit, ukuran, deskripsi, visibilitas publik, fasilitas, aturan, dan galeri tipe. Satu properti memiliki tepat satu kost type aktif untuk setiap kategori: rukost dan apartkost. | room_types tetap ada sebagai legacy read-only; tidak ada write baru ke sana. |
| Kamar | rooms hanya menyimpan inventori fisik: kode, gedung, lantai, status, visibilitas, dan relasi kost_type_id. | monthly_price, yearly_price, deposit_amount, room_type_id, dan room_facility_assignments dipertahankan sementara untuk kontrak lama. Mutation kost type harus memperbarui snapshot harga legacy seluruh kamar tipenya dalam transaksi. |
| Fasilitas | room_facilities adalah master fasilitas; facility_categories mengelompokkan master; kost_type_facility_assignments adalah relasi aktif. | room_facility_assignments lama tidak lagi ditulis. Endpoint room baru mengembalikan fasilitas dari kost type. |
| Hunian aktif | occupancies adalah catatan kehadiran/operasional yang selalu berpasangan satu banding satu dengan lease baru. | Endpoint check-in/check-out lama harus dialihkan ke service lease atau ditolak setelah cutover agar tidak membuat occupancy tanpa lease. |
| Penyewaan | leases adalah sumber kebenaran hubungan komersial penghuni–kamar, harga snapshot, siklus tagihan, deposit, dan riwayat. | Lease menyimpan occupancy_id unik; service menjamin room, resident, occupancy, dan lease berada pada properti yang sama. |
| Tagihan | invoices menyimpan dokumen penagihan; setiap tagihan sewa baru wajib memiliki lease_id dan cycle_start_date. | Invoice lama tetap valid dengan lease_id null. billing_period_id legacy boleh null untuk invoice lease baru; tidak boleh dipakai sebagai sumber jadwal lease. |
| Deposit | lease_deposit_transactions adalah ledger sumber kebenaran deposit. Kolom ringkasan pada leases adalah denormalisasi yang dihitung dari ledger. | payments hanya mencatat uang masuk; refund tidak direpresentasikan sebagai payment bernilai negatif. |
| Galeri | hunian_gallery_images harus memiliki target eksplisit: kost_type atau common_area. | Data katalog M19 lama tetap dapat dibaca melalui adapter sampai revisi publik tersendiri. |

Aturan tambahan:

1. Semua data baru wajib property-scoped. Setiap service yang menerima foreign key memverifikasi kesamaan property_id, bukan hanya mengandalkan foreign key individual.
2. Setiap mutation penting dicatat ke audit_logs dengan before/after yang telah disanitasi; nomor KTP dan URL file KTP tidak boleh masuk audit log.
3. Wire API menggunakan snake_case agar konsisten dengan API yang ada. Hook frontend melakukan pemetaan ke camelCase bila diperlukan.
4. Semua list baru menggunakan limit dan offset dengan respons { data, meta: { total, limit, offset } }. Batas default 20, maksimum 100.
5. Semua POST yang mengubah lifecycle lease menerima header Idempotency-Key. Pengulangan key yang sama harus mengembalikan hasil sukses semula, bukan membuat lease/invoice kedua.

### 0B. Skema Final yang Wajib Ada

Migration 016_kost_type_revision.sql wajib mencakup:

- Tabel kost_types dengan status active/inactive, deleted_at, deleted_by_user_id, audit fields, serta partial unique index satu kategori aktif per properti. Endpoint delete adalah soft delete; tipe tidak boleh dihapus jika masih dipakai kamar atau lease aktif.
- Tabel facility_categories, perluasan room_facilities dengan category_id, icon, description, sort_order, dan tabel bernama konsisten kost_type_facility_assignments.
- Tabel kost_type_rules dan relasi rooms.kost_type_id beserta index property_id, kost_type_id, room_status.
- Backfill yang membuat dua kost type aktif per properti demo, mengisi rooms.kost_type_id dari category, lalu menyinkronkan snapshot harga legacy. Setelah backfill pada database target, kost_type_id wajib NOT NULL untuk kamar aktif.
- Validasi service bahwa rooms.category, room_buildings.category, dan kost_types.category sama; harga dan fasilitas tidak dapat diubah melalui endpoint room baru.
- Perluasan file purpose untuk profile_photo, foreign key residents.ktp_file_id dan residents.profile_photo_file_id ke files, serta akses file KTP hanya untuk role berwenang pada properti yang sama.
- Perluasan galeri dengan target_type bernilai kost_type atau common_area, kost_type_id nullable, dan aturan validasi target. Constraint kategori/gender lama harus diperlonggar secara aman agar area bersama tidak dipaksa menjadi rukost/apartkost maupun male/female.

Migration 017_lease_system.sql wajib mencakup:

- leases dengan occupancy_id NOT NULL UNIQUE, lease_status, start_date, end_date, billing_cycle, billing_anchor_day, next_billing_date, snapshot harga, dan audit close/transfer.
- lease_history dengan event_type created, updated, invoice_generated, deposit_collected, deposit_refunded, deposit_deducted, closed, transferred_out, transferred_in; metadata JSONB disanitasi.
- room_transfer_records, serta lease_deposit_transactions dengan transaction_type collection, carry_forward, top_up, deduction, refund dan nominal non-negatif.
- invoices.lease_id nullable, cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount, generation_source manual atau auto. Tambahkan partial unique index untuk lease_id dan cycle_start_date saat lease_id tidak null.
- billing_period_id pada invoices boleh null untuk invoice lease baru; invoice legacy tidak dimigrasikan secara destruktif.
- Index untuk lease aktif, tagihan jatuh tempo, history lease, dan invoice per lease.
- Constraint angka non-negatif, tanggal akhir tidak mendahului tanggal mulai, serta satu lease aktif per kamar dan per resident.

Nama tabel pada daftar, migration, repository, DTO, dan test harus sama persis. Jangan menggunakan istilah kost_type_facilities bila nama yang dipilih adalah kost_type_facility_assignments.

### 0C. Lifecycle Lease, Billing, Deposit, dan Transfer

| Aksi | Prasyarat | Efek atomik dalam satu transaksi |
|---|---|---|
| Buat lease | Resident aktif, kamar vacant, kost type aktif, tanggal mulai valid, tidak ada lease atau occupancy aktif untuk resident/kamar. | Lock room dan resident; buat occupancy aktif; buat lease aktif dengan occupancy_id; status kamar menjadi occupied; buat lease_history; buat dan issue invoice pertama; simpan next_billing_date. |
| Generate invoice | Lease aktif dan next_billing_date pada atau sebelum hari ini Asia/Jakarta. | Lock lease; buat satu invoice auto per cycle; issue invoice; tulis history; majukan next_billing_date tepat sekali. |
| Collect deposit | Lease aktif; nominal positif; tidak melebihi saldo yang wajib dikumpulkan kecuali admin memberi alasan override. | Buat payment incoming bila ada uang masuk dan ledger collection/top_up; hitung ulang status serta saldo deposit; tulis history. |
| Checkout | Lease aktif. | Lock lease, room, resident; hentikan invoice berikutnya; tutup occupancy; tutup lease; buat deduction ledger eksplisit untuk tunggakan/kerusakan; buat refund ledger bila ada; kamar menjadi vacant atau maintenance sesuai input; tulis history. |
| Transfer kamar | Lease aktif, kamar tujuan vacant, tanggal efektif valid, alasan wajib. | Lock kedua kamar dan resident; tutup lease/occupancy lama sebagai transferred; buat lease/occupancy baru; pertahankan billing anchor; pindahkan credit deposit; kamar lama vacant dan kamar baru occupied; buat transfer record serta dua history event. |
| Batal sebelum mulai | Lease belum aktif atau belum memiliki occupancy/invoice issued. | Status cancelled; void draft invoice bila ada; kamar tetap vacant; tulis history. |

Aturan billing yang dipilih:

1. Model tetap open-ended. end_date hanya diisi saat checkout, transfer, atau pembatalan; tidak ada endpoint expiring dan tidak ada metrik sewa berakhir H-30.
2. Invoice pertama dibuat dan berstatus issued ketika lease dibuat. Tidak ada invoice draft otomatis yang tidak dapat dibayar.
3. Siklus pertama dimulai pada start_date. next_billing_date adalah awal siklus berikutnya; untuk tanggal 29–31 gunakan hari terakhir bulan tujuan. Untuk 29 Februari pada tahun non-kabisat gunakan 28 Februari.
4. cycle_start_date sampai sehari sebelum next_billing_date adalah periode invoice. Proration tidak didukung pada revisi ini; seluruh siklus memakai harga snapshot penuh.
5. due_date memakai default_due_day pada property_settings di dalam periode invoice, dibatasi hari terakhir periode dan tidak boleh lebih awal dari tanggal issue.
6. Job berjalan setiap hari pukul 00:10 Asia/Jakarta. Ia harus idempoten, aman ketika dua instance aplikasi berjalan, melakukan catch-up maksimal 12 siklus per lease per run, dan mengirim alert bila batas catch-up tercapai.
7. Setelah transfer pada tengah siklus, invoice yang sudah dibuat tetap milik lease lama. Harga kamar baru mulai berlaku pada cycle berikutnya dengan billing anchor lama. Tidak ada proration.
8. Tagihan tertunggak tidak dipindahkan atau dihapus saat transfer. Tagihan tetap ditautkan ke lease lama dan tetap menjadi piutang resident.
9. Deposit tidak otomatis dikembalikan saat transfer. Credit deposit dibawa sebagai ledger carry_forward. Jika deposit tipe baru lebih besar, admin dapat mengumpulkan top_up; jika lebih kecil, kelebihan tetap dipegang sampai checkout final.
10. Potongan tunggakan checkout membuat ledger deduction dan tidak mengubah status invoice menjadi paid. Sisa utang di atas deposit tetap tercatat pada invoice.

Batas status kamar:

- Lease service adalah satu-satunya jalur yang boleh mengubah kamar menjadi occupied atau vacant.
- Endpoint status kamar hanya boleh mengatur maintenance, inactive, dan requires_review dengan alasan audit. reserved hanya dimiliki modul booking yang kelak disetujui; ia tidak dibuat oleh booking lead.
- Lease tidak dapat dibuat pada kamar maintenance, inactive, requires_review, atau reserved tanpa flow override yang belum termasuk scope ini.

### 0D. Keamanan dan Data Pribadi

- Nomor KTP ditampilkan masked pada list dan drawer; hanya role owner, manager, admin dengan property scope dapat membuka file KTP secara terautentikasi.
- Foto KTP tidak boleh masuk respons list, metadata notification, analytics, log request, atau audit before/after.
- URL file harus short-lived atau melalui endpoint authorization; jangan mengirim storage_path ke frontend.
- Seed memakai NIK dan nomor telepon fiktif berbentuk valid, serta placeholder gambar KTP/profil yang jelas bukan dokumen identitas asli.
- property_owner tetap read-only; technician dan role lain tidak dapat membaca lease, data penghuni, maupun dokumen identitas kecuali endpoint mereka secara eksplisit membutuhkan data minimum.

### 0E. Kontrak Endpoint dan Otorisasi

| Endpoint | Izin minimum | Kontrak penting |
|---|---|---|
| GET/POST/PATCH /kost-types | room.read / room.manage | List terpagination dan property-scoped; PATCH sinkronkan snapshot kamar; delete adalah soft delete. |
| GET/POST/PATCH /facility-categories, /room-facilities, /kost-type-rules | room.read / room.manage | Reorder wajib atomik dan menerima seluruh urutan target. |
| GET /rooms | room.read | Mendukung kost_type_id, category, building_id, floor, status, q, dan include_active_lease. |
| POST/PATCH /rooms | room.manage | Tidak menerima harga, deposit, atau facility_ids baru; menerima kost_type_id dan atribut inventori. |
| GET /leases | lease.read | Filter status, overdue, resident_id, room_id, kost_type_id, q, limit, offset. |
| GET /leases/overdue | lease.read | Route statis ini dideklarasikan sebelum GET /leases/:id. Tidak ada endpoint /leases/expiring. |
| GET /leases/:id dan /leases/:id/billing-summary | lease.read | Detail memuat resident, room, kost type, ledger deposit, invoice, payment summary, dan history yang telah disanitasi. |
| POST /leases | lease.manage | Membuat resident baru secara opsional dalam transaksi; wajib Idempotency-Key. |
| PATCH /leases/:id | lease.manage | Hanya catatan dan atribut yang tidak mengubah snapshot komersial. |
| POST /leases/:id/deposit/collect | lease.manage dan billing.manage | Catat collection atau top_up secara auditable. |
| POST /leases/:id/close | lease.manage dan billing.manage | Membuka checkout dan menyelesaikan ledger deduction/refund dalam transaksi. |
| POST /leases/:id/transfer | lease.manage | Wajib alasan, kamar tujuan, tanggal efektif, dan Idempotency-Key. |
| GET /invoices | billing.read | Tambahkan filter lease_id, resident_id, room_id, kost_type_id, dan generation_source. |

Tambahkan permission lease.read ke seed RBAC dan berikan hanya kepada owner, manager, dan admin pada properti yang berhak. property_owner tetap tidak menerima akses lease atau PII penghuni.

Semua mutation mengembalikan 409 untuk konflik lifecycle, 422 untuk data lintas properti atau state tidak valid, dan 403 untuk role/property scope yang tidak berhak. Controller baru harus menggunakan JwtAuthGuard, RbacGuard, RequireRoles, RequirePermissions, dan pola audit yang telah ada.

### 0F. Strategi Migrasi dan Reset Seed

1. Migration 016 dan 017 harus dapat dijalankan ulang oleh runner saat ini. Gunakan IF NOT EXISTS, constraint guard, dan backfill yang idempoten.
2. Revisi ini memakai strategi forward-only: hapus perintah rollback dari verification plan. Jika migration production gagal, pemulihan dilakukan dari backup atau migration perbaikan berikutnya.
3. Sebelum production, jalankan migration pada salinan database, verifikasi data, dan restore drill. Tidak ada TRUNCATE pada migration.
4. reset-and-seed-realistic.ts hanya boleh berjalan pada database demo development atau staging khusus. Ia wajib menolak NODE_ENV production, memerlukan DATA_RESET_CONFIRM=RESET_REALISTIC_DEMO_DATA dan DATA_RESET_BACKUP_CONFIRMED=true.
5. Skrip reset harus menampilkan daftar tabel terdampak dan berhenti jika menemukan perangkat Smart Lock, file, atau konfigurasi yang tidak diberi metadata demo. Tidak boleh menghapus perangkat hardware staging yang nyata.
6. Setelah reset, seed harus memasukkan kost type, kategori fasilitas, fasilitas, aturan, gedung, kamar, lease, occupancy, invoice, payment allocation, deposit ledger, vehicle, parking assignment, dan data riwayat yang konsisten.
7. Reset hanya mempertahankan users, user_roles, properties, property_settings, dan konfigurasi yang secara eksplisit ditandai non-demo. Semua file seed yang ditinggalkan harus dibersihkan secara terkontrol agar tidak menjadi orphan storage.

### Exit Gate Fase 0

- Skema final disetujui tanpa nama tabel/endpoint yang bertentangan.
- Implementor dapat menjelaskan satu sumber kebenaran untuk harga, fasilitas, occupancy, lease, invoice, dan deposit.
- Tersedia test case tertulis untuk duplicate request, dua admin membuat lease pada kamar sama, transfer tengah siklus, checkout dengan tunggakan, dan kegagalan job setelah invoice dibuat.
- Route lama dan modul yang tetap tampil di sidebar telah memiliki keputusan eksplisit.

## Fase 1: Restrukturisasi Sidebar & Navigasi

### Struktur Sidebar Baru

```
┌─────────────────────────────┐
│  🏠 Kos Management          │
│  Sistem Pengelolaan          │
├──────── MASTER DATA ─────────┤
│  📊 Dashboard                │
│  🏠 Kamar            ▼      │
│     ├─ 📋 Ringkasan          │
│     ├─ 🏘️ Rumah Kost         │
│     ├─ 🏢 Apart Kost         │
│     ├─ ✨ Fasilitas           │
│     └─ 🖼️ Galeri              │
│  📋 Syarat & Ketentuan       │
├──────── PENGELOLAAN ─────────┤
│  📝 Penyewaan                │
│  👤 Penghuni                 │
│  💰 Pembayaran               │
│  🚗 Kendaraan & Parkir       │
│  📨 Minat Booking            │
├──────── LAINNYA ─────────────┤
│  📢 Komplain                 │
│  📊 Laporan                  │
│  🔔 Notifikasi               │
│  ⚙️ Pengaturan               │
└─────────────────────────────┘
```

### Perubahan dan Kontrak Navigasi

#### [MODIFY] [app-shell.tsx](file:///var/www/granada-kost-platform/apps/admin/src/components/layout/app-shell.tsx)
- Refactor sidebar dari daftar flat menjadi grouped sections; active state parent Kamar aktif untuk semua route /rooms/*.
- Implement collapsible dropdown untuk Kamar, menyimpan state expand selama sesi, dan selalu expand saat route anak aktif.
- Tambahkan section labels uppercase, muted, dan indikator active dengan accent kiri.
- Tambahkan breadcrumb global di bawah judul; ia memakai manifest label route, bukan hasil pemecahan path mentah.
- Mobile hanya menampilkan lima aksi utama pada bottom nav; semua route lain tersedia melalui sheet/menu Lainnya yang tetap menghormati RBAC dan feature flag.

#### Keputusan Disposisi Modul Lama
- MASTER DATA: Dashboard, Kamar (Ringkasan, Rumah Kost, Apart Kost, Fasilitas, Galeri), Syarat & Ketentuan.
- PENGELOLAAN: Penyewaan, Penghuni, Pembayaran, Kendaraan & Parkir, Minat Booking.
- OPERASIONAL TERBATAS: Smart Lock, Access History, CCTV. Ketiganya tidak dihapus; tampil hanya untuk role/feature flag yang saat ini berhak.
- LAINNYA: Komplain, Laporan, Notifikasi, Pengaturan.
- Booking Kamar dan Manajemen Booking tetap tersembunyi bila feature flag nonaktif. Booking lead tidak boleh mengubah status kamar maupun membuat lease secara otomatis.
- Property owner tetap hanya melihat item read-only yang diizinkan backend; frontend tidak menjadi satu-satunya kontrol akses.

#### [NEW] `apps/admin/src/components/layout/Breadcrumb.tsx`
- Manifest breadcrumb mencakup label, parent, dan link setiap route admin.
- Current page non-clickable, separator memakai chevron icon, dan label tidak pernah menampilkan UUID atau slug internal.

#### Struktur Route Wajib
Gunakan directory route TanStack agar tidak terjadi konflik antara `rooms.tsx` lama dengan `rooms/index.tsx`:

- [NEW] `apps/admin/src/routes/rooms/route.tsx` — parent route `/rooms` yang merender Outlet.
- [NEW] `apps/admin/src/routes/rooms/index.tsx` — `/rooms`, Ringkasan Kamar.
- [NEW] `apps/admin/src/routes/rooms/rumah-kost.tsx` — `/rooms/rumah-kost`.
- [NEW] `apps/admin/src/routes/rooms/apart-kost.tsx` — `/rooms/apart-kost`.
- [NEW] `apps/admin/src/routes/rooms/fasilitas.tsx` — `/rooms/fasilitas`.
- [NEW] `apps/admin/src/routes/rooms/galeri.tsx` — `/rooms/galeri`.
- [NEW] `apps/admin/src/routes/penyewaan/route.tsx`, `index.tsx`, dan `tambah.tsx` — parent, daftar, serta form `/penyewaan/tambah`.
- [NEW] `apps/admin/src/routes/syarat-ketentuan.tsx`.
- [MODIFY] `apps/admin/src/routes/rooms.tsx` dipindahkan menjadi route layout di atas; tidak boleh hidup berdampingan dengan route index yang memetakan URL sama.
- [MODIFY] `/hunian-gallery` menjadi redirect kompatibilitas ke `/rooms/galeri`; URL `/rooms` tetap menampilkan ringkasan.
- routeTree.gen.ts harus dibuat ulang oleh plugin router; file generated tidak diedit manual.

---

## Fase 2: Master Data Tipe Kost & Kamar (Backend + Frontend)

### 2A. Database Schema — Tipe Kost

#### [NEW] `backend/api/src/infrastructure/database/migrations/016_kost_type_revision.sql`

```sql
-- Tabel utama Tipe Kost. room_types lama tetap dipertahankan sebagai legacy read-only.
CREATE TABLE IF NOT EXISTS kost_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                -- 'rukost' | 'apartkost'
  name TEXT NOT NULL,                    -- 'Rumah Kost' | 'Apart Kost'
  slug TEXT NOT NULL,                    -- URL-safe identifier
  description_short TEXT,
  description_long TEXT,
  room_size_label TEXT,
  room_size_m2 NUMERIC(6,2),
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL DEFAULT 0,
  deposit_amount INTEGER NOT NULL DEFAULT 0,
  max_occupants INTEGER NOT NULL DEFAULT 1,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id),
  updated_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_types_category_check CHECK (category IN ('rukost', 'apartkost')),
  CONSTRAINT kost_types_price_check CHECK (monthly_price >= 0 AND yearly_price >= 0 AND deposit_amount >= 0),
  CONSTRAINT kost_types_single_occupant_check CHECK (max_occupants = 1),
  CONSTRAINT kost_types_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT kost_types_unique_slug UNIQUE (property_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kost_types_one_active_category
  ON kost_types(property_id, category)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Kategori Fasilitas
CREATE TABLE IF NOT EXISTS facility_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- 'Fasilitas Dalam Kamar', 'Fasilitas Kamar Mandi', dll
  icon TEXT,                    -- icon identifier (lucide icon name)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_categories_unique_name UNIQUE (property_id, name)
);

-- Fasilitas Master (refactor dari room_facilities)
-- Tambah kategori dan relasi ke tipe kost (bukan per kamar)
ALTER TABLE room_facilities
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES facility_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Fasilitas assignment: dari per-kamar → per-tipe-kost
CREATE TABLE IF NOT EXISTS kost_type_facility_assignments (
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES room_facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kost_type_id, facility_id)
);

-- Aturan & Kebijakan per Tipe Kost
CREATE TABLE IF NOT EXISTS kost_type_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kost_type_id UUID REFERENCES kost_types(id) ON DELETE CASCADE, -- NULL = aturan global
  rule_category TEXT NOT NULL,  -- 'general', 'guest', 'resident', 'other'
  icon TEXT,                    -- emoji atau lucide icon
  rule_text TEXT NOT NULL,      -- '✓ Akses 24 jam' atau '❌ Dilarang bawa hewan'
  is_allowed BOOLEAN,           -- true=dibolehkan, false=dilarang, null=netral
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_type_rules_category_check CHECK (
    rule_category IN ('general', 'guest', 'resident', 'other', 'special_notes')
  )
);

-- Extend rooms: relasi ke tipe kost. Kolom lama tetap ada untuk kompatibilitas.
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS kost_type_id UUID REFERENCES kost_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_rooms_property_kost_type_status
  ON rooms(property_id, kost_type_id, room_status);

-- Backfill harus memetakan rooms.category ke kost_types.category dalam properti yang sama,
-- menyinkronkan snapshot harga legacy, lalu memvalidasi bahwa semua kamar non-inactive punya kost_type_id.
-- Tambahkan CHECK NOT VALID terlebih dahulu dan VALIDATE setelah backfill selesai.

-- Migration ini juga wajib memperluas hunian_gallery_images untuk target_type,
-- kost_type_id, dan common_area sebagaimana didefinisikan pada Fase 0; selector M19 lama
-- tidak cukup untuk galeri per tipe maupun area bersama.
```

### 2B. Backend API — Tipe Kost Module

#### [NEW] `backend/api/src/modules/kost-type/` (module baru)
- `kost-type.module.ts` — NestJS module
- `kost-type.controller.ts` — CRUD endpoints:
  - `GET /api/v1/kost-types` — List tipe kost (admin, property-scoped)
  - `GET /api/v1/kost-types/:id` — Detail tipe kost dengan fasilitas & aturan
  - `POST /api/v1/kost-types` — Create tipe kost
  - `PATCH /api/v1/kost-types/:id` — Update tipe kost
  - `DELETE /api/v1/kost-types/:id` — Soft delete
- `kost-type.service.ts` — Business logic
- `kost-type.repository.ts` — Database queries

#### [NEW] `backend/api/src/modules/facility-category/` (module baru)
- CRUD untuk kategori fasilitas
- Seed default: "Fasilitas Dalam Kamar", "Fasilitas Kamar Mandi", "Fasilitas Bersama", "Akses & Keamanan", "Layanan"

#### [NEW] `backend/api/src/modules/kost-rule/` (module baru)
- CRUD untuk aturan/kebijakan
- Filter: global vs per-tipe-kost
- Kategori: general, guest, resident, other, special_notes

#### [MODIFY] `backend/api/src/modules/room/`
- Extend room service: return `kost_type` data (nama, fasilitas, harga dari tipe kost)
- Extend room query: JOIN ke `kost_types` untuk enrichment
- Harga kamar dibaca dari `kost_types.monthly_price` / `yearly_price` (bukan per kamar)

### 2C. Frontend Admin — Halaman Tipe Kost

#### [NEW] `apps/admin/src/routes/rooms/rumah-kost.tsx` dan `apart-kost.tsx`
- Header selalu berasal dari kost type aktif: nama, deskripsi, harga bulanan/tahunan, deposit, ukuran, dan jumlah fasilitas.
- Tabel memakai GET /rooms dengan include_active_lease. Kolom terisi menampilkan nama penghuni, tanggal mulai, durasi berjalan, tagihan berikutnya, dan status tagihan terakhir; tidak menampilkan sisa durasi atau tanggal kontrak berakhir.
- Filter: q, gedung/unit, lantai, status, dan visibilitas. Semua filter tersimpan pada URL search params dan reset dapat diprediksi.
- Edit kamar hanya mencakup kode, gedung, lantai, visibilitas, dan kost type. Harga, deposit, serta fasilitas tidak muncul di form kamar.
- Aksi status tidak boleh menawarkan Occupied atau Vacant. Untuk penghuni aktif, CTA utama adalah Lihat Penyewaan; checkout dan transfer hanya berasal dari detail lease.
- Empty, loading, forbidden, error/retry, dan optimistic update harus menggunakan komponen state yang telah ada.

#### [NEW] `apps/admin/src/routes/rooms/fasilitas.tsx`
- Master fasilitas dikelompokkan berdasarkan kategori dan dapat dicari dengan normalisasi huruf kecil/diakritik.
- Drag-and-drop memakai @dnd-kit dengan pointer dan keyboard sensor; setiap perubahan mengirim seluruh urutan target secara atomik dan dapat di-rollback saat API gagal.
- Checklist assignment memperbarui relasi kost_type_facility_assignments, bukan room_facility_assignments legacy.
- Aksesibilitas wajib: fokus terlihat, label icon, dan alternatif tombol Naik/Turun ketika drag tidak tersedia.

#### [NEW] `apps/admin/src/routes/rooms/galeri.tsx`
- Selector target: Rumah Kost, Apart Kost, atau Area Bersama. Setiap operasi attach, cover, publish, reorder, dan delete mengirim target_type/target_id yang eksplisit.
- Mesin upload M19 tetap dipakai setelah repository dan endpoint galeri mendukung target baru. Tidak boleh memalsukan common area sebagai kategori/gender tertentu.
- Redirect kompatibilitas dari /hunian-gallery tetap tersedia sampai revisi publik selesai.

---

## Fase 3: Komponen UX Bersama

### 3A. Harga dan CurrencyInput

#### [MODIFY] [format.ts](file:///var/www/granada-kost-platform/apps/admin/src/lib/format.ts)
- formatIDR saat ini sudah menggunakan locale id-ID; pertahankan sebagai formatter tunggal untuk semua nilai IDR.
- Tambahkan parseIDR yang hanya menerima digit, mengembalikan integer non-negatif, dan menolak overflow atau decimal.
- Jangan menyimpan nilai terformat di form state atau API; state dan payload selalu berupa integer rupiah.

#### [NEW] `apps/admin/src/components/ui/currency-input.tsx`
- Menampilkan prefix Rp dan separator titik saat fokus maupun blur tanpa memindahkan caret secara mengejutkan.
- Mendukung React Hook Form, disabled, error message, aria-describedby, dan nilai nol.
- Validasi frontend tidak menggantikan validasi DTO/backend.

### 3B. Searchable Select/Dropdown

#### [NEW] `apps/admin/src/components/ui/searchable-select.tsx`
- Gunakan cmdk yang sudah tersedia untuk pencarian substring ter-normalisasi pada gedung, kamar, dan penghuni.
- Untuk inventori saat ini (163 kamar), virtualisasi tidak diperlukan. Tambahkan virtualizer hanya bila data opsi melebihi 500; jangan menambah dependensi tanpa kebutuhan terukur.
- Keyboard navigation, empty result, loading, dan pilihan yang sudah dipilih harus dapat diakses.

### 3C. Breadcrumb Global

#### [MODIFY] [app-shell.tsx](file:///var/www/granada-kost-platform/apps/admin/src/components/layout/app-shell.tsx)
- Tambahkan breadcrumb dari manifest route yang didefinisikan pada Fase 1.
- Setiap parent clickable, halaman saat ini non-clickable, dan halaman dengan parameter menggunakan label data yang aman (misalnya nama kamar), bukan ID mentah.

---

## Fase 4: Sistem Penyewaan (Lease Management) — Core Feature

> [!IMPORTANT]
> **Model sewa adalah open-ended.** Tidak ada tanggal kontrak berakhir, perpanjangan manual, endpoint expiring, maupun reminder H-30. Yang ditampilkan adalah durasi berjalan, tagihan berikutnya, dan status piutang.

### 4A. Database dan Migration 017

#### [NEW] backend/api/src/infrastructure/database/migrations/017_lease_system.sql

Migration ini mengimplementasikan skema final pada Fase 0, bukan sekadar tabel lease minimum. Ia wajib berisi:

- leases dengan occupancy_id unik dan tidak null, billing_anchor_day, next_billing_date, snapshot harga/deposit, relasi transfer, close audit, serta constraint satu lease aktif per kamar dan resident.
- lease_history, room_transfer_records, dan lease_deposit_transactions. Tidak ada nama tabel history lain yang boleh dipakai.
- Perluasan invoices untuk lease_id, cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount, dan generation_source. Tambahkan unique partial index lease_id + cycle_start_date.
- Perubahan terkontrol invoices.billing_period_id menjadi nullable untuk invoice lease baru; invoice manual/legacy yang ada tetap memakai billing_period lama.
- Foreign key file resident, validasi property scope di service, index queue tagihan, serta migration/backfill yang idempoten.

Kolom ringkasan deposit pada leases hanya cache dari ledger: deposit_collected_amount, deposit_deduction_amount, dan deposit_refunded_amount. Status deposit dihitung dari jumlah ledger, bukan diubah bebas oleh endpoint PATCH.

### 4B. Perluasan Residents dan File

Tambahkan date_of_birth, place_of_birth, address, emergency_phone, ktp_file_id, dan profile_photo_file_id. Kedua file ID harus foreign key ke files dengan ON DELETE SET NULL.

- Upload KTP memakai purpose ktp; foto profil memakai purpose profile_photo yang ditambahkan ke constraint files.
- DTO, repository, respons detail, dan form penghuni harus memasukkan field baru secara konsisten.
- Endpoint list resident tidak mengembalikan URL foto KTP; endpoint detail hanya mengembalikan metadata/tautan yang telah diautorisasi.
- NIK divalidasi 16 digit bila diisi; nomor telepon dinormalisasi tanpa menghapus nilai historis yang valid.

### 4C. Backend — Lease Module dan Scheduler

#### [NEW] backend/api/src/modules/lease/

Struktur minimum: lease.module, controller, service, repository, scheduler, DTO create/update/close/transfer/deposit, type, dan test. LeaseModule mengimpor RoomModule, ResidentModule, OccupancyModule, BillingModule, PropertyModule, RbacModule, FileModule, serta NotificationModule hanya melalui service yang diperlukan.

Endpoint final:

1. GET /api/v1/leases dan GET /api/v1/leases/overdue.
2. GET /api/v1/leases/:id dan GET /api/v1/leases/:id/billing-summary.
3. POST /api/v1/leases dan PATCH /api/v1/leases/:id.
4. POST /api/v1/leases/:id/deposit/collect.
5. POST /api/v1/leases/:id/close dan POST /api/v1/leases/:id/transfer.

Route statis overdue dan billing-summary harus didaftarkan sebelum route parameter :id agar tidak tertangkap sebagai ID.

Aturan implementasi:

- Create, close, transfer, dan scheduler memakai database transaction serta SELECT FOR UPDATE pada kamar, resident, dan lease yang relevan.
- Create lease memanggil satu orchestration service; jangan memanggil controller check-in. Ia membuat occupancy, lease, invoice pertama issued, dan audit/history secara atomik.
- Endpoint check-in/check-out lama didepresiasi dari UI dan harus mendelegasikan ke flow lease atau mengembalikan conflict yang menjelaskan flow baru.
- Tambahkan @nestjs/schedule dan ScheduleModule. LeaseBillingScheduler berjalan pukul 00:10 Asia/Jakarta dan memanggil service yang idempoten, bukan menulis SQL duplikat di scheduler.
- Invoice auto diberi generation_source auto dan status issued. Error setelah invoice berhasil dibuat tidak boleh membuat invoice kedua pada retry.
- Setiap mutation lifecycle mengirim notifikasi setelah commit; kegagalan notifikasi tidak membatalkan transaksi lease tetapi dicatat untuk retry.

### 4D. Frontend Admin — Halaman Penyewaan

#### [NEW] apps/admin/src/routes/penyewaan/index.tsx

Halaman daftar memakai pagination server-side dan query URL. Ia menampilkan:

- Metric cards: lease aktif, invoice overdue, kamar tersedia, dan pendapatan invoice verified bulan berjalan.
- Filter q, status, overdue, resident, room, kost type, serta tombol reset.
- Tabel kode lease, penghuni, kamar, tipe, mulai sewa, durasi berjalan, invoice terakhir, tagihan berikutnya, status, dan aksi.
- CTA tambah sewa; view detail, transfer, dan checkout hanya tersedia pada lease aktif serta role yang berhak.
- State loading/error/empty/forbidden yang eksplisit, bukan tabel kosong yang ambigu.

Detail lease dapat berupa halaman atau drawer lebar. Ia menampilkan data penghuni yang dimasking, kamar, harga snapshot, fasilitas tipe, invoice/payment summary, ledger deposit, history lease, dan link aman ke dokumen KTP. Piutang lease lama tetap terlihat setelah transfer.

Checkout harus menampilkan sumber hitung yang dapat diaudit:

- Deposit terkumpul dari ledger.
- Deduction kerusakan sebagai daftar nominal + catatan wajib.
- Deduction tunggakan dihitung dari invoice belum lunas dan dicatat sebagai ledger terpisah.
- Refund hasil perhitungan yang dapat dikoreksi admin sesuai izin; proses akhir membutuhkan konfirmasi eksplisit.
- Setelah sukses, layar merujuk ke lease ended dan status kamar yang dihasilkan.

#### [NEW] apps/admin/src/routes/penyewaan/tambah.tsx

Stepper tiga langkah tidak menyimpan payload di server sampai konfirmasi akhir:

1. Detail sewa dan penghuni: tanggal mulai, cycle, catatan, resident existing atau form resident baru lengkap dengan upload terpisah.
2. Pilih kamar: hanya hasil API kamar vacant yang tidak reserved/maintenance/inactive/requires_review; harga dan deposit read-only dari kost type.
3. Konfirmasi: menampilkan invoice pertama yang akan langsung issued pada tanggal mulai, periode pertama, due date, harga snapshot, dan deposit yang perlu dikumpulkan.

Submit membawa Idempotency-Key baru, menonaktifkan tombol selama request, dan apabila retry memakai key yang sama hingga respons sukses/error final diterima.

### Acceptance Criteria Fase 4

1. Dua request create lease paralel pada kamar/resident sama menghasilkan paling banyak satu lease aktif, satu occupancy aktif, dan satu invoice pertama.
2. Job billing yang dijalankan ulang tidak menduplikasi invoice pada cycle sama.
3. Checkout menghentikan pembuatan invoice baru tetapi tidak menghapus invoice/piutang lama.
4. Transfer mempertahankan billing anchor, mencatat dua history event dan satu transfer record, serta tidak menghapus piutang lease lama.
5. Seluruh respons PII dan audit memenuhi batasan Fase 0D.
6. Semua mutation menghasilkan audit log dan invalidasi query React Query yang relevan.

---
## Fase 5: Pindah Kamar (Room Transfer)

Transfer adalah operation lifecycle lease, bukan sekadar perubahan room_id. Implementasi mengikuti transaksi Fase 0C dengan urutan berikut:

1. Admin memilih kamar tujuan yang masih vacant dan memasukkan alasan serta tanggal efektif.
2. Service mengunci lease aktif, resident, kamar lama, dan kamar tujuan; validasi dilakukan kembali di server walaupun UI telah memfilter.
3. Lease dan occupancy lama ditutup dengan status transferred pada tanggal efektif.
4. Lease dan occupancy baru dibuat untuk kamar tujuan, terhubung ke transferred_from_lease_id, dengan harga snapshot tipe kamar baru.
5. Billing anchor lama dipertahankan. Invoice yang sudah dibuat tetap milik lease lama; invoice target baru mulai cycle berikutnya tanpa proration.
6. Credit deposit dicatat sebagai carry_forward dan top_up hanya bila diperlukan. Piutang lama tidak dihapus, dipindahkan, atau ditandai lunas.
7. Buat room_transfer_records, dua lease_history event, audit log, dan notifikasi setelah commit.

UI transfer wajib menampilkan dampak sebelum konfirmasi: kamar lama/baru, harga cycle berikutnya, invoice/pembayaran tertunggak yang tetap tinggal, serta saldo deposit yang dibawa. Tombol transfer tidak muncul pada lease ended, cancelled, atau transferred.

### Acceptance Criteria Fase 5

- Transfer paralel ke kamar tujuan yang sama menghasilkan tepat satu lease baru aktif.
- Kamar lama menjadi vacant dan kamar baru occupied hanya setelah seluruh operasi sukses.
- Kegagalan di tengah transaksi membatalkan seluruh perubahan status, occupancy, lease, dan transfer record.
- Riwayat kamar menampilkan rantai lease tanpa membocorkan PII kepada role yang tidak berhak.

---

## Fase 6: Dashboard Refresh

#### [MODIFY] apps/admin/src/routes/index.tsx dan [NEW] dashboard summary API

Dashboard tidak menghitung metrik melalui banyak request list di frontend. Tambahkan endpoint GET /api/v1/dashboard/summary yang property-scoped dan mengembalikan satu snapshot konsisten:

- active_leases, active_residents, rooms_total, rooms_vacant, rooms_occupied, rooms_maintenance.
- verified_revenue_current_month, outstanding_amount, overdue_invoice_count.
- recent_leases, recent_payments, dan urgent_maintenance_count.
- timestamps serta timezone Asia/Jakarta untuk label periode.

Layout admin:

- Row 1: Penyewaan Aktif, Penghuni Aktif, Kamar Tersedia/Total, Pendapatan Terverifikasi Bulan Ini.
- Row 2: Tagihan Overdue dan Kamar Maintenance/Perlu Review. Tidak ada kartu Sewa Berakhir karena model open-ended.
- Row 3: Penyewaan terbaru dan pembayaran terbaru dengan link aman ke detail.
- Quick actions: Tambah Penyewaan dan Lihat Tagihan Overdue.
- Chart occupancy/revenue adalah enhancement opsional; tidak boleh menunda metric dan navigasi inti.

Acceptance: angka dashboard harus sama dengan query sumber pada timezone Jakarta, menangani state kosong, dan tidak menunjukkan PII lebih dari yang dibutuhkan.

---

## Fase 7: Revisi Halaman Existing

### 7A. Halaman Penghuni

#### [MODIFY] apps/admin/src/routes/tenants.tsx

- Kolom: nama, kontak yang dimasking, kamar dari lease aktif, status lease, durasi berjalan, tagihan berikutnya, dan status piutang.
- Detail penghuni memisahkan data personal, lease aktif, riwayat lease, kendaraan, serta ringkasan pembayaran. Tidak ada tanggal akhir atau sisa durasi pada lease open-ended.
- Pencarian NIK hanya tersedia untuk role berwenang, tidak menampilkan NIK penuh pada hasil, dan dicatat pada audit bila kebijakan audit pencarian diterapkan.
- Form membuat/mengubah penghuni mendukung field baru dan upload file terpisah. Upload gagal tidak boleh membuat resident setengah jadi tanpa indikator untuk admin.
- Link ke lease, kamar, dan invoice menggunakan ID internal tetapi label manusiawi; semua link mempertahankan property scope.

### 7B. Halaman Pembayaran

#### [MODIFY] apps/admin/src/routes/payments.tsx

- Setiap invoice menampilkan link lease jika lease_id tersedia; invoice legacy tetap dapat dibuka tanpa link lease.
- Filter tambahan: resident, room, kost type, lease, generation_source, dan status invoice.
- Badge Auto/Manual berasal dari generation_source, bukan inferensi UI.
- Deposit collection/refund/deduction ditampilkan sebagai ledger deposit pada detail lease; jangan mencampurkannya dengan pelunasan invoice sewa.
- Nilai pendapatan dashboard/laporan hanya memakai payment verified sesuai definisi endpoint summary.

### 7C. Halaman Kendaraan & Parkir

#### [MODIFY] apps/admin/src/routes/vehicles.tsx

- Satu halaman bertab Kendaraan dan Parkir; route /parking lama tetap redirect kompatibilitas atau tetap tersedia sebagai child tab.
- Identitas resident tetap relasi utama kendaraan. Kamar yang ditampilkan selalu diturunkan dari lease aktif saat dibaca, bukan snapshot kendaraan.
- Transfer kamar tidak mengubah kepemilikan kendaraan atau assignment parkir; tampilan kamar diperbarui otomatis dari lease aktif.

### 7D. Syarat & Ketentuan

#### [NEW] apps/admin/src/routes/syarat-ketentuan.tsx

- Aturan global dan per-kost type ditampilkan dalam tab/accordion yang jelas.
- CRUD dan reorder mengikuti permission room.manage serta mutation atomik.
- Preview adalah preview internal menggunakan renderer data baru; ia bukan perubahan pada halaman publik /kamar.
- Aturan global tidak dapat salah dikaitkan dengan kost_type_id; aturan per tipe selalu diverifikasi berada pada properti sama.

### Acceptance Criteria Fase 7

- Penghuni dengan lease transfer menampilkan riwayat lengkap tanpa membuat dua lease aktif.
- Filter pembayaran menghasilkan data property-scoped dan tidak menyebabkan N+1 request per baris.
- Kendaraan/parkir tetap berfungsi bila resident tidak memiliki lease aktif.
- Akses PII diverifikasi untuk owner, manager, admin, property_owner, dan technician.

---

## Fase 8: Notifikasi dan Polish

### 8A. Notifikasi Terfokus

#### [MODIFY] apps/admin/src/routes/notifications.tsx dan event backend

- Default filter admin menonjolkan billing.invoice_issued, billing.payment_received, billing.invoice_overdue, lease.created, lease.transferred, lease.closed, dan complaint.created.
- Tidak ada notifikasi sewa akan berakhir H-30. Untuk model open-ended, pengingat berkaitan dengan overdue, checkout request, atau maintenance.
- Notifikasi Smart Lock/CCTV tidak dihapus dari sistem; ia dapat disembunyikan dari default filter atau ditampilkan untuk role operasional yang relevan.
- Badge sidebar menghitung unread sesuai kategori dan role yang ditampilkan, dengan endpoint count yang sama seperti daftar agar angka konsisten.
- Pengiriman notification terjadi setelah transaction commit; dedupe key mencegah notifikasi overdue harian yang sama terkirim lebih dari sekali per lease/invoice/hari.

### 8B. Konsistensi UI/UX

- Semua halaman baru memiliki breadcrumb, loading, empty, error/retry, success toast, dan state forbidden.
- Tabel dengan lebih dari 10 item memiliki search/filter/pagination server-side bila sumber datanya API.
- Harga memakai formatIDR tunggal; input memakai CurrencyInput.
- Form mutation memiliki pending state, pencegahan submit ganda, dan pesan error yang dapat ditindaklanjuti.
- Mobile diuji pada 375px, 768px, dan 1024px; tindakan penting tidak boleh tersembunyi hanya di hover.
- UI mengikuti keyboard navigation, focus management untuk dialog/drawer, serta label aria untuk icon-only button.

---

## Backlog Terkendali (Tidak Memblokir Scope Inti)

Fitur berikut tidak wajib sebelum admin lease inti rilis; implementasikan hanya setelah acceptance Fase 0–8 lulus:

1. Status sewa visual pada kamar: nama penghuni, durasi berjalan, tagihan berikutnya, dan badge overdue; bukan sisa kontrak.
2. Riwayat kamar: timeline lease/transfer dengan data PII minimal.
3. Laporan pendapatan per kost type: memakai invoice/payment verified dan lease history, bukan perkiraan harga kamar.
4. Export CSV terlebih dahulu; Excel hanya jika format/accounting disepakati. Export wajib property-scoped, diaudit, dan tidak menyertakan KTP/file URL.
5. Reminder piutang atau maintenance; bukan reminder kontrak habis.
6. Maintenance dengan estimasi selesai, alasan, dan audit perubahan status kamar.

## Verification Plan

### Tooling yang Harus Ditambahkan

- Backend wajib memiliki script test berbasis Jest dan @nestjs/testing, serta test integration menggunakan PostgreSQL disposable.
- Admin wajib memiliki test komponen kritis berbasis Vitest dan React Testing Library untuk CurrencyInput, searchable select, route guard, serta form lease.
- Runner migration tetap forward-only. Jangan menambahkan perintah rollback palsu; verification membuktikan restore/forward-fix melalui database disposable dan backup drill.

### Automated Gate

Jalankan dari root repository setelah script test ditambahkan:

    npm --workspace @granada-kost/api run lint
    npm --workspace @granada-kost/api run build
    npm --workspace @granada-kost/api run test
    npm --workspace @granada-kost/admin run lint
    npm --workspace @granada-kost/admin run typecheck
    npm --workspace @granada-kost/admin run build
    npm --workspace @granada-kost/admin run test

Untuk database disposable:

    npm --workspace @granada-kost/api run db:migrate
    npm --workspace @granada-kost/api run db:migrate
    npm --workspace @granada-kost/api run db:seed:dev
    npm --workspace @granada-kost/api run lease:validate-workflow

Tambahkan script lease:validate-workflow yang menguji skenario berikut pada database test, lalu membersihkan fixture-nya:

1. Buat lease menghasilkan occupancy, room occupied, invoice issued, dan history tepat satu kali.
2. Idempotency-Key yang sama tidak menduplikasi data.
3. Dua request paralel untuk kamar sama menghasilkan satu sukses dan satu conflict.
4. Cron bulanan/tahunan, akhir bulan, dan tahun kabisat menghasilkan cycle yang benar serta tidak menduplikasi invoice saat retry.
5. Checkout dengan invoice overdue menghasilkan deduction ledger, refund yang benar, occupancy ended, dan tidak membuat invoice baru.
6. Transfer tengah siklus mempertahankan piutang lama, billing anchor, dan credit deposit.
7. Role/property scope menolak akses silang properti, property_owner write, technician PII, dan URL file KTP tidak sah.
8. Legacy room/invoice/public response tetap kompatibel selama migration.

### Manual Verification

1. Sidebar desktop/mobile: section, expand Kamar, active parent, redirect legacy, role/feature flag, dan menu Lainnya.
2. Master data: ubah harga/fasilitas kost type lalu verifikasi semua room snapshot legacy dan UI baru konsisten.
3. Lease form: resident baru/existing, upload gagal, validasi kamar tidak tersedia, back/forward stepper, retry idempoten.
4. Billing: invoice pertama issued, tagihan berikutnya, overdue, yearly, tanggal 29–31, dan timezone Jakarta.
5. Checkout/transfer: konfirmasi dampak finansial, audit, history, room status, invoice lama, dan deposit ledger.
6. Dashboard/report: angka sama dengan query sumber, state kosong, dan tidak ada kartu kontrak berakhir.
7. Responsif dan aksesibilitas: 375px, 768px, 1024px; keyboard, dialog focus trap, dan screen-reader label.
8. PII: NIK masked, file KTP tidak muncul pada list/log, dan authorization file diuji dengan akun berbeda.

### API Smoke Tests

Gunakan token role admin/manager pada property fixture. Contoh respons list baru menggunakan pembungkus data:

    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/kost-types?property_id=$PROPERTY_ID" | jq '.data | length'
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/leases?property_id=$PROPERTY_ID" | jq '.data | length'
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/leases/overdue?property_id=$PROPERTY_ID" | jq '.data | length'
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/dashboard/summary?property_id=$PROPERTY_ID" | jq '.active_leases'

Tidak ada smoke test untuk endpoint leases/expiring karena endpoint dan konsep tersebut tidak berada dalam model open-ended.

---

## Urutan Implementasi dan Dependencies

Urutan ini menggantikan dependency lama yang menjadikan sidebar sebagai prasyarat backend. Fase 1 dan Fase 3 dapat berjalan paralel setelah kontrak Fase 0 stabil, tetapi route/menu baru tidak diaktifkan sebelum endpoint yang dituju tersedia.

Dependency graph:

    Fase 0: Kontrak Arsitektur & Data
      -> Fase 2: Schema, Master Data, Adapter
      -> Fase 1: Sidebar & Routing
      -> Fase 3: Komponen UX
    Fase 2 + Fase 3 -> Fase 4: Lease, Billing, Deposit
    Fase 4 -> Fase 5: Transfer, Fase 6: Dashboard, Fase 7: Halaman Existing
    Fase 5 + Fase 6 + Fase 7 -> Fase 8: Notifikasi & Polish
    Fase 2 + Fase 4 -> Fase 9: Seed Demo

| Fase | Estimasi | Exit gate |
|---|---|---|
| Fase 0: Kontrak Arsitektur & Data | Medium | Semua invariant, API, migration, PII, dan lifecycle di dokumen ini dipahami/diterima. |
| Fase 1: Sidebar & Routing | Medium | Tidak ada route konflik; semua route lama memiliki keputusan redirect/retensi. |
| Fase 2: Master Data & Adapter | Large | Migration idempoten, backfill valid, endpoint room/kost type kompatibel. |
| Fase 3: Komponen UX | Small | CurrencyInput, select, breadcrumb lulus test aksesibilitas. |
| Fase 4: Lease/Billing/Deposit | X-Large | Semua scenario transaction/scheduler pada verification plan lulus. |
| Fase 5: Transfer | Medium | Rantai lease, billing anchor, deposit, dan piutang lama terverifikasi. |
| Fase 6: Dashboard | Medium | Snapshot summary konsisten dan tidak N+1. |
| Fase 7: Halaman Existing | Large | Integrasi lease tidak meregresikan resident/payment/vehicle/parking. |
| Fase 8: Notifikasi & Polish | Medium | Event post-commit, UX state, responsive, dan RBAC selesai. |
| Fase 9: Seed Demo | Medium | Hanya demo DB, guard destruktif dan fixture validation lulus. |

---

## Keputusan Final yang Mengikat

> [!NOTE]
> **Model sewa**
> Open-ended. end_date null selama aktif; tidak ada renewal manual, expiring endpoint, atau H-30 contract reminder.

> [!NOTE]
> **Invoice dan scheduler**
> Invoice pertama langsung issued saat lease dibuat. Invoice berikutnya dibuat idempoten berdasarkan lease + cycle start, memakai billing anchor dan timezone Asia/Jakarta.

> [!NOTE]
> **Deposit**
> Deposit memakai ledger collection/carry_forward/top_up/deduction/refund. Refund bukan payment negatif; tunggakan yang dipotong tetap tidak menghapus invoice.

> [!NOTE]
> **Transisi occupancy**
> Lease adalah jalur baru satu-satunya untuk check-in/check-out admin. Occupancy tetap disimpan untuk compatibility operasional dan harus satu banding satu dengan lease baru.

> [!NOTE]
> **Harga/fasilitas/galeri**
> Kost type adalah sumber kebenaran. Fields room lama adalah adapter kompatibilitas; galeri mendukung kost type dan common area tanpa mengubah halaman publik saat ini.

> [!NOTE]
> **Data demo dan publik**
> Reset hanya untuk database demo development/staging yang disetujui; halaman publik didefer dan kontraknya tidak boleh diregresikan.

---

## Fase 9: Reset dan Seed Data Realistis

### Guard Eksekusi

#### [NEW] backend/api/src/infrastructure/database/seeds/reset-and-seed-realistic.ts

Skrip ini tidak dipanggil oleh db:migrate dan harus berhenti sebelum koneksi destruktif bila:

- NODE_ENV bernilai production.
- DATA_RESET_CONFIRM tidak sama dengan RESET_REALISTIC_DEMO_DATA.
- DATA_RESET_BACKUP_CONFIRMED tidak sama dengan true.
- Database berisi Smart Lock, file, atau konfigurasi tanpa metadata demo.
- property target tidak dipilih secara eksplisit.

Sebelum reset, skrip menampilkan property target, jumlah tabel/record terdampak, dan ringkasan file yang akan dibersihkan. Ia harus memakai transaction bila memungkinkan, menyimpan laporan JSON hasil seed, dan gagal aman tanpa menghapus users/credential.

### Fixture Wajib

- Dua kost type aktif: Rumah Kost dan Apart Kost; 26 gedung/unit serta 163 kamar dengan kategori, gender, lantai, dan kost_type_id valid.
- Lima kategori fasilitas, sekitar 25 fasilitas, assignment per kost type, aturan global dan per tipe, serta galeri demo untuk dua tipe dan area bersama.
- Minimal delapan lease aktif yang mencakup monthly, yearly, paid, partially paid, overdue, deposit belum/sudah dibayar, dan satu kandidat transfer.
- Minimal dua lease historis: checkout refund penuh dan checkout dengan deduction; sertakan lease_history, room_transfer_records bila ada, invoice, payment allocation, dan deposit ledger yang konsisten.
- Semua invoice auto seed berstatus issued atau status lifecycle valid; jangan menanam draft invoice sebagai hasil scheduler.
- Nama, alamat, nomor telepon, NIK, dokumen, dan gambar adalah data sintetis. NIK yang dipakai harus berupa 16 digit fiktif, bukan nilai nyata atau placeholder huruf.

### Validasi Seed

1. Tidak ada kamar dengan kost_type/category/property yang tidak cocok.
2. Tidak ada dua lease atau occupancy aktif untuk kamar/resident sama.
3. Semua invoice lease memiliki cycle unik dan referensi lease/occupancy/resident/room yang konsisten.
4. Saldo ledger deposit cocok dengan kolom ringkasan lease.
5. Tidak ada file orphan yang dibuat seed dan tidak ada perangkat Smart Lock non-demo yang terhapus.
6. Endpoint admin utama dan daftar publik lama dapat dibaca setelah seed tanpa error kontrak.

> [!WARNING]
> Seed realistis hanya untuk database demo development/staging. Ia bukan jalur migrasi production dan tidak boleh memakai data pribadi nyata.
