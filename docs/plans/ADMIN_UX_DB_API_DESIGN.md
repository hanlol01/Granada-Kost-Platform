# UX Admin — Database & Backend Technical Design

## Status, ruang lingkup, dan keputusan dasar

Dokumen ini adalah desain implementasi untuk revisi UX Admin. Ia dibuat setelah membaca REVISI_UX_ADMIN.md, migration 001–015, serta modul room, resident, occupancy, billing, file, notification, vehicle, parking, dan RBAC yang ada saat ini.

Tidak ada kode aplikasi yang diubah oleh pekerjaan desain ini. Migration 016 dan 017 yang disebut di bawah adalah rencana forward-only; keduanya belum dibuat.

Keputusan arsitektur yang dipakai sebagai dasar:

1. kost_types menjadi sumber kebenaran harga, deposit, ukuran, fasilitas, aturan, dan galeri per tipe. rooms hanya menyimpan inventori fisik serta snapshot legacy yang masih dibutuhkan kontrak lama.
2. leases menjadi sumber kebenaran hubungan komersial resident–room. occupancies tetap dipertahankan sebagai catatan operasional dan setiap lease baru memiliki tepat satu occupancy.
3. Invoice lease tidak lagi bergantung pada billing_periods. Tabel dan endpoint billing lama tetap hidup untuk invoice legacy dan invoice manual.
4. Deposit merupakan ledger append-only. payments hanya menyimpan uang masuk positif; refund tidak ditulis sebagai payment negatif.
5. Semua write lifecycle memakai transaction PostgreSQL, audit tersanitasi, business outbox, dan Idempotency-Key yang durable. Tidak ada panggilan provider atau notifikasi eksternal di dalam transaction.
6. Wire contract baru memakai snake_case. Kontrak legacy yang saat ini mengembalikan array atau camelCase dipertahankan melalui adapter/version negotiation selama cutover.

## Invariant lintas domain

| Invariant | Penegakan |
|---|---|
| Seluruh data baru property-scoped | Service memverifikasi setiap foreign key terhadap property_id yang sama sebelum write. Foreign key biasa tidak cukup karena tabel lama tidak memakai composite key. |
| Harga/fasilitas kamar | Hanya mutation kost type yang dapat menulis nilai sumber. Mutation tersebut menyinkronkan snapshot harga legacy rooms dalam transaction yang sama. |
| Room status | Hanya LeaseService dapat mengubah occupied atau vacant. Endpoint room status hanya boleh menuju maintenance, inactive, atau requires_review dengan alasan audit. |
| Hunian aktif | Satu occupancy aktif per room dan resident tetap dijaga index lama. Lease baru wajib memiliki occupancy_id unik; partial unique lease menambah lapisan proteksi yang sama. |
| Lease aktif | Maksimal satu lease aktif per room dan satu per resident. Status selain active tidak ikut partial unique index. |
| Invoice siklus | Maksimal satu invoice untuk pasangan lease_id dan cycle_start_date, termasuk jika invoice dibuat ulang oleh scheduler. |
| Deposit | amount selalu non-negatif; arah saldo dicatat terpisah sebagai credit/debit. Saldo tidak boleh diubah langsung pada leases. |
| PII | KTP hanya untuk owner, manager, dan admin yang memiliki property scope. Nomor KTP dimasking pada list; URL/storage_path tidak pernah dikirimkan sebagai data resident, audit, atau notification metadata. |
| Side effect | State domain, audit ringkas, hasil idempotensi, dan business event ditulis atomik. Dispatcher melakukan notification setelah commit dan dapat retry. |

## Data dictionary final

Konvensi umum: UUID memakai gen_random_uuid(), uang memakai BIGINT atau INTEGER dalam rupiah tanpa desimal, tanggal bisnis memakai DATE Asia/Jakarta, dan waktu audit memakai TIMESTAMPTZ. Semua metadata JSONB wajib tersanitasi: tanpa nomor KTP, URL dokumen, storage_path, token, atau payload provider mentah.

### 1. kost_types

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier tipe kost. |
| property_id | UUID NOT NULL FK properties | Scope tipe kost. Validasi service memastikan semua room/facility/rule/gallery yang dihubungkan berada pada property ini. |
| category | TEXT NOT NULL | Nilai hanya rukost atau apartkost. |
| name | TEXT NOT NULL | Nama yang ditampilkan admin, misalnya Rumah Kost. |
| slug | TEXT NOT NULL | Identifier stabil per property; unique pada property walaupun tipe telah soft deleted agar URL/adapter lama tidak dapat dipakai ulang untuk objek berbeda. |
| description_short, description_long | TEXT nullable | Deskripsi internal/katalog. |
| room_size_label | TEXT nullable | Label seperti 3 x 4 m. |
| room_size_m2 | NUMERIC(6,2) nullable | Harus lebih dari nol jika terisi. |
| monthly_price, yearly_price, deposit_amount | BIGINT NOT NULL | Semua minimal nol. yearly_price dapat nol hanya apabila produk tahunan belum dijual. |
| max_occupants | SMALLINT NOT NULL DEFAULT 1 | CHECK bernilai tepat 1 pada scope revisi ini. |
| public_visible | BOOLEAN NOT NULL DEFAULT true | Visibility katalog berikutnya; tidak mengubah halaman publik pada rilis ini. |
| notes | TEXT nullable | Catatan internal. |
| status | TEXT NOT NULL DEFAULT active | Hanya active atau inactive. |
| deleted_at, deleted_by_user_id | TIMESTAMPTZ / UUID nullable | Soft delete. Tipe yang direferensikan room atau lease aktif tidak boleh dihapus. |
| created_by_user_id, updated_by_user_id, created_at, updated_at | Audit | Aktor dan waktu perubahan. |

Constraint dan index:

- CHECK category, status, uang tidak negatif, max_occupants = 1, serta room_size_m2 positif bila ada.
- UNIQUE(property_id, slug).
- Partial UNIQUE(property_id, category) WHERE status = active AND deleted_at IS NULL.
- Index property_id, status, deleted_at untuk list admin dan index property_id, category untuk lookup room.

room_types tetap ada sebagai legacy read-only. Tidak ada write baru dari UI/admin UX ke room_types.

### 2. Fasilitas

#### facility_categories

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier kategori fasilitas. |
| property_id | UUID NOT NULL FK properties | Scope. |
| name | TEXT NOT NULL | Unique per property, case-normalized di service. |
| icon | TEXT nullable | Nama ikon, bukan SVG/HTML mentah. |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Minimal nol. Reorder mengganti seluruh urutan target secara atomik. |
| created_at, updated_at | TIMESTAMPTZ | Audit waktu. |

Constraint/index: UNIQUE(property_id, name), CHECK sort_order >= 0, dan index property_id, sort_order.

#### room_facilities

Tabel ini tetap master fasilitas agar relasi lama tidak putus. Kolom lama id, property_id, name, status, audit fields tetap ada; kolom berikut ditambahkan:

| Kolom baru | Tipe / nullability | Aturan final |
|---|---|---|
| category_id | UUID nullable FK facility_categories ON DELETE SET NULL | Legacy fasilitas boleh belum berkategori. Create baru wajib menyertakan kategori; assignment aktif hanya boleh memakai fasilitas dengan property sama. |
| icon | TEXT nullable | Nama ikon. |
| description | TEXT nullable | Penjelasan fasilitas. |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Minimal nol. |

Index baru: property_id, category_id, status, sort_order. room_facility_assignments tetap dibaca hanya untuk adapter legacy, tetapi tidak lagi ditulis oleh endpoint room baru.

#### kost_type_facility_assignments

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| kost_type_id | UUID NOT NULL FK kost_types ON DELETE CASCADE | Tipe kost pemilik fasilitas. |
| facility_id | UUID NOT NULL FK room_facilities ON DELETE CASCADE | Master fasilitas. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu attach. |

Primary key adalah pasangan kost_type_id, facility_id. Tambahkan index facility_id untuk menemukan penggunaan fasilitas. Service menolak cross-property assignment. Endpoint assignment menerima seluruh array facility_ids agar set tidak menjadi setengah tersimpan.

### 3. Aturan: kost_type_rules

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier aturan. |
| property_id | UUID NOT NULL FK properties | Scope. |
| kost_type_id | UUID nullable FK kost_types ON DELETE CASCADE | NULL berarti aturan global. Jika terisi, service memverifikasi property sama. |
| rule_category | TEXT NOT NULL | general, guest, resident, other, atau special_notes. |
| icon | TEXT nullable | Emoji atau nama ikon terkontrol. |
| rule_text | TEXT NOT NULL | Teks non-kosong, panjang dibatasi DTO. |
| is_allowed | BOOLEAN nullable | true = boleh, false = dilarang, null = netral/informasi. |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Minimal nol; urutan per target global atau per kost type. |
| created_at, updated_at | TIMESTAMPTZ | Audit waktu. |

Index: property_id, kost_type_id, sort_order. Reorder global tidak boleh menerima item per-kost-type, dan sebaliknya.

### 4. residents dan resident_emergency_contacts

Kolom lama residents tetap dipertahankan. Respons list tidak lagi meneruskan ktp_number penuh.

| Kolom residents | Tipe / nullability | Aturan final |
|---|---|---|
| id, property_id, user_id | UUID | Existing; property scope tetap wajib. |
| full_name, phone, email, gender, resident_status | Existing | phone dinormalisasi di service tanpa menghapus nilai lama yang valid; gender tetap male/female/other/null. |
| ktp_number | TEXT nullable | Jika terisi, 16 digit. CHECK baru ditambahkan NOT VALID terlebih dahulu untuk melindungi write baru tanpa merusak record legacy sampai remediation selesai. Unique active legacy global dipertahankan pada rilis ini. |
| date_of_birth | DATE nullable | Tidak boleh melebihi tanggal Jakarta saat request. |
| place_of_birth | TEXT nullable | Data personal. |
| address | TEXT nullable | Data personal. |
| emergency_phone | TEXT nullable | Kontak primer; resident_emergency_contacts tetap sumber daftar kontak tambahan. |
| ktp_file_id | UUID nullable FK files ON DELETE SET NULL | Harus file purpose ktp, property sama, dan tidak soft deleted saat di-attach. |
| profile_photo_file_id | UUID nullable FK files ON DELETE SET NULL | Harus purpose profile_photo, property sama, dan tipe gambar. |
| created_by_user_id, updated_by_user_id, created_at, updated_at | Existing audit | Audit payload wajib masking KTP dan tidak boleh menyertakan referensi URL file. |

Index baru: property_id, resident_status, full_name untuk list; ktp_file_id dan profile_photo_file_id bila diperlukan untuk referential lookup. resident_emergency_contacts tidak berubah struktur; ia tetap memiliki resident_id, contact_name, relationship, phone, dan audit waktu.

### 5. rooms

rooms mempertahankan semua kolom 002/004/013: property_id, room_type_id, number, room_code, building_id, category, unit_code, floor/floor_code/floor_label, gender_policy, size_label, room_status, primary_photo_file_id, public_visible, audit fields, dan harga legacy.

| Kolom / kelompok | Tipe / nullability | Aturan final |
|---|---|---|
| kost_type_id | UUID nullable FK kost_types ON DELETE RESTRICT | Wajib untuk setiap room dengan room_status selain inactive. Tambahkan CHECK NOT VALID lalu VALIDATE setelah backfill. |
| monthly_price, yearly_price, deposit_amount | Existing snapshot legacy | Tidak menjadi input POST/PATCH room baru. Nilainya disinkronkan dari kost_types pada create/update kost type agar endpoint/public legacy tetap membaca nilai benar. |
| room_type_id | Existing nullable FK | Legacy read-only; tidak ditulis oleh flow baru. |
| room_facility_assignments | Existing relation | Legacy read-only; fasilitas respons V2 berasal dari kost_type_facility_assignments. |
| category dan building_id | Existing | Service wajib memastikan category room, category room_buildings, dan category kost_types sama. |
| room_status | Existing | occupied/vacant hanya LeaseService; maintenance/inactive/requires_review melalui endpoint status yang diaudit; reserved tidak dibuat booking lead. |

Index baru: property_id, kost_type_id, room_status. Index lama property_id/category/status dan indeks publik dipertahankan untuk adapter M19.

### 6. occupancies dan occupancy_history

Tidak ada penghapusan occupancy. Struktur final menambah status transferred agar transfer tidak dipalsukan sebagai checkout biasa.

| Kolom / kelompok | Tipe / nullability | Aturan final |
|---|---|---|
| id, property_id, room_id, resident_id | Existing UUID | Harus satu property dengan lease baru; divalidasi service di dalam transaction. |
| start_date, end_date | DATE | end_date null ketika active; bila terisi tidak sebelum start_date. Semantik boundary transfer menunggu keputusan di bagian blocker. |
| occupancy_status | TEXT | active, ended, cancelled, atau transferred. Partial unique active room/resident tetap berlaku. |
| created_by_user_id, closed_by_user_id, created_at, updated_at | Existing | Diisi LeaseService untuk flow baru. |
| occupancy_history | Existing table | Tambahkan event transfer_out dan transfer_in serta izinkan to_status transferred. Ini audit operasional; riwayat komersial tetap berada di lease_history. |

Lease baru wajib mereferensikan satu occupancy melalui leases.occupancy_id UNIQUE NOT NULL. Occupancy legacy tanpa lease tidak dibackfill secara otomatis karena harga, siklus, deposit, dan riwayat komersialnya tidak dapat disimpulkan aman.

### 7. leases

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier lease. |
| property_id | UUID NOT NULL FK properties | Scope lease. |
| lease_code | TEXT NOT NULL | Kode manusiawi unique per property, dibuat service. |
| resident_id, room_id, occupancy_id, kost_type_id | UUID NOT NULL | FK ke residents, rooms, occupancies, kost_types; occupancy_id UNIQUE. Service memverifikasi seluruh property dan status. |
| lease_status | TEXT NOT NULL DEFAULT active | active, ended, cancelled, transferred. active adalah satu-satunya status yang menempati room/resident. |
| start_date, end_date | DATE | end_date null selama active; CHECK end_date >= start_date bila ada. |
| billing_cycle | TEXT NOT NULL | monthly atau yearly. |
| billing_anchor_day | SMALLINT NOT NULL | 1 sampai 31; dipakai menghitung tanggal siklus berikutnya dengan fallback akhir bulan. |
| next_billing_date | DATE NOT NULL | Awal siklus yang belum memiliki invoice. Scheduler hanya memproses lease active. |
| snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount | BIGINT NOT NULL | Harga/deposit saat lease dibuat, semua >= 0. Tidak berubah ketika kost type diedit. |
| snapshot_room_number, snapshot_kost_type_name | TEXT NOT NULL | Snapshot label untuk histori, invoice, dan detail setelah transfer/perubahan master data. |
| notes | TEXT nullable | Catatan non-finansial yang boleh diubah PATCH. |
| transferred_from_lease_id | UUID nullable FK leases ON DELETE RESTRICT | Diisi lease tujuan transfer. |
| closed_at, closed_by_user_id, close_reason | Audit close | Diisi untuk ended, cancelled, atau transferred sesuai lifecycle. |
| deposit_collected_amount, deposit_deduction_amount, deposit_refunded_amount | BIGINT NOT NULL DEFAULT 0 | Cache yang dihitung ulang dari ledger pada transaction yang sama; tidak dapat diubah PATCH bebas. |
| created_by_user_id, updated_by_user_id, created_at, updated_at | Audit | Aktor dan waktu. |

Constraint/index:

- CHECK status dan nilai snapshot/cache tidak negatif.
- UNIQUE(property_id, lease_code).
- UNIQUE(occupancy_id).
- Partial UNIQUE(room_id) WHERE lease_status = active.
- Partial UNIQUE(resident_id) WHERE lease_status = active.
- Index property_id, lease_status, next_billing_date untuk scheduler.
- Index property_id, resident_id, created_at DESC; property_id, room_id, created_at DESC; kost_type_id.

### 8. lease_history

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier riwayat. |
| property_id, lease_id | UUID NOT NULL | Scope dan FK lease ON DELETE RESTRICT. |
| event_type | TEXT NOT NULL | created, updated, invoice_generated, deposit_collected, deposit_refunded, deposit_deducted, closed, transferred_out, atau transferred_in. |
| actor_user_id | UUID nullable FK users ON DELETE SET NULL | Null untuk scheduler/system. |
| event_date | DATE NOT NULL | Tanggal bisnis Jakarta. |
| metadata | JSONB NOT NULL DEFAULT {} | Ringkasan aman seperti invoice_id, amount, reason category; tanpa PII sensitif. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | Waktu append. |

Index: lease_id, created_at DESC dan property_id, event_date DESC. Tabel append-only; pembetulan ditulis sebagai event baru.

### 9. room_transfer_records

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier transfer. |
| property_id | UUID NOT NULL FK properties | Scope. |
| resident_id | UUID NOT NULL FK residents | Resident yang berpindah. |
| from_lease_id, to_lease_id | UUID NOT NULL FK leases | Sumber dan target. Masing-masing unique pada perannya agar satu operasi tidak direkam dua kali. |
| from_room_id, to_room_id | UUID NOT NULL FK rooms | Room asal dan tujuan; harus berbeda. |
| effective_date | DATE NOT NULL | Tanggal efektif, dengan semantik yang harus disetujui sebelum implementasi. |
| reason | TEXT NOT NULL | Alasan wajib. |
| carried_deposit_amount, required_target_deposit_amount, top_up_amount | BIGINT NOT NULL DEFAULT 0 | Snapshot dampak deposit; semua tidak negatif. |
| created_by_user_id, created_at | Audit | Aktor dan waktu. |

Constraint: from_room_id <> to_room_id, uang >= 0, UNIQUE(from_lease_id), UNIQUE(to_lease_id). Index property_id, effective_date DESC dan resident_id, effective_date DESC.

### 10. lease_deposit_transactions

Ledger ini memakai amount non-negatif dan direction eksplisit agar transfer dapat membukukan debit pada lease lama serta kredit pada lease baru tanpa nilai negatif.

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| id | UUID PK | Identifier ledger entry. |
| property_id, lease_id | UUID NOT NULL | FK property dan lease; property divalidasi service. |
| transaction_type | TEXT NOT NULL | collection, carry_forward, top_up, deduction, refund. |
| direction | TEXT NOT NULL | credit atau debit. collection/top_up selalu credit; deduction/refund selalu debit; carry_forward dapat keduanya. |
| amount | BIGINT NOT NULL | Harus >= 0. |
| payment_id | UUID nullable FK payments ON DELETE RESTRICT | Hanya uang masuk collection/top_up yang benar-benar diterima. Tidak ada payment negatif untuk refund. |
| transfer_record_id | UUID nullable FK room_transfer_records ON DELETE RESTRICT | Diisi pada dua entry carry_forward. |
| reason_type, reason | TEXT nullable | reason_type contoh damage, outstanding_invoice, manual_override, transfer. Wajib untuk deduction dan override. |
| external_reference | TEXT nullable | Bukti/reference refund atau penerimaan eksternal, bukan URL dokumen. |
| settlement_status | TEXT NOT NULL DEFAULT settled | settled untuk collection/top_up/deduction/carry_forward; refund boleh pending, settled, atau waived sesuai proses pembayaran refund. |
| metadata | JSONB NOT NULL DEFAULT {} | invoice ids atau item deduction aman. |
| created_by_user_id, created_at | Audit | Append-only. |

Constraint:

- CHECK transaction_type, direction, amount >= 0, dan settlement_status.
- CHECK tipe–arah: collection/top_up credit; deduction/refund debit.
- payment_id hanya diizinkan collection/top_up.
- Index lease_id, created_at; property_id, created_at; payment_id WHERE payment_id IS NOT NULL; transfer_record_id WHERE transfer_record_id IS NOT NULL.

Saldo deposit lease dihitung:

~~~
sum(credit amount) - sum(debit amount)
~~~

Nilai carry_forward tidak menambah deposit baru yang dikumpulkan. Cache leases.deposit_collected_amount hanya menjumlah collection dan top_up; cache deduction/refund menjumlah debit bertipe terkait.

### 11. Perubahan invoices

Kolom 005 tetap ada agar invoice lama dan API penghuni yang ada tetap valid. Perubahan berikut bersifat additive kecuali billing_period_id menjadi nullable.

| Kolom | Tipe / nullability | Aturan final |
|---|---|---|
| billing_period_id | UUID nullable FK billing_periods | Invoice legacy/manual lama tetap memakai nilai ini. Invoice lease baru boleh null dan tidak menggunakan tabel billing_periods untuk penjadwalan. |
| lease_id | UUID nullable FK leases ON DELETE RESTRICT | Wajib secara service untuk invoice lease baru; null untuk legacy yang tidak dapat ditautkan aman. |
| cycle_start_date, cycle_end_date | DATE nullable | Wajib untuk invoice ber-lease. CHECK end >= start bila keduanya ada. |
| snapshot_billing_cycle | TEXT nullable | monthly atau yearly, wajib untuk invoice ber-lease. |
| snapshot_rent_amount | BIGINT nullable | Harga siklus yang disalin dari lease; >= 0 bila ada. |
| generation_source | TEXT NOT NULL DEFAULT manual | manual atau auto. Scheduler selalu auto dan create lease otomatis membuat auto/issued. |

Index/constraint:

- Partial UNIQUE(lease_id, cycle_start_date) WHERE lease_id IS NOT NULL.
- Index property_id, lease_id, due_date DESC.
- Index lease_id, cycle_start_date DESC.
- Index property_id, generation_source, due_date DESC.
- Index overdue queue lama dipertahankan.

Invoice lease baru tetap mengisi snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date, snapshot_room_number, snapshot_resident_name, snapshot_monthly_price, subtotal_amount, total_amount, dan invoice_code yang lama karena kolom tersebut masih NOT NULL dan dipakai endpoint lama. Tidak ada migrasi destruktif terhadap invoice legacy.

### 12. hunian_gallery_images

M15 saat ini mengunci kategori/gender/catalog legacy. Desain final menambah target eksplisit sambil mempertahankan baris M19 sebagai adapter.

| Kolom / kelompok | Tipe / nullability | Aturan final |
|---|---|---|
| target_type | TEXT nullable untuk legacy | Nilai write baru hanya kost_type atau common_area. NULL hanya untuk baris M19 lama yang tetap dibaca adapter. Tidak ada endpoint baru yang boleh membuat NULL. |
| kost_type_id | UUID nullable FK kost_types ON DELETE RESTRICT | Wajib bila target_type = kost_type; harus property sama. |
| common_area_key | TEXT nullable | Wajib dan non-kosong bila target_type = common_area, misalnya lobby atau rooftop. Ini adalah target id yang stabil sampai ada tabel common areas terpisah. |
| catalog_slug, public_group_key, category, gender, building_code, floor_code | Existing, menjadi nullable untuk target baru | Tetap wajib pada legacy target_type NULL agar endpoint publik M19 tetap dapat membaca bentuk lama. |
| file_id, alt_text, caption, sort_order, is_cover, public_visible, soft-delete/audit fields | Existing | Tetap berlaku bagi semua target. file harus property sama, active, dan purpose hunian_gallery. |

Constraint:

- target_type NULL mensyaratkan field legacy yang diperlukan M19 tetap tersedia.
- target_type kost_type mensyaratkan kost_type_id terisi dan common_area_key null.
- target_type common_area mensyaratkan kost_type_id null dan common_area_key terisi.
- category/gender/floor legacy menjadi nullable namun bila ada tetap dibatasi nilai lama.
- sort_order >= 0 dan alt_text non-kosong tetap berlaku.

Index:

- Pertahankan index/index unique legacy dengan predicate target_type IS NULL agar katalog M19 tidak berubah.
- Tambahkan index property_id, target_type, kost_type_id, sort_order WHERE deleted_at IS NULL.
- Tambahkan index property_id, target_type, common_area_key, sort_order WHERE deleted_at IS NULL.
- Tambahkan unique active file per kost type dan per common_area_key.
- Tambahkan satu partial unique cover per kost type dan satu per common_area_key.

API V2 menampilkan target_type dan target_id terhitung: UUID kost_type untuk tipe kost dan common_area:<key> untuk area bersama. Request tetap memakai kost_type_id atau common_area_key agar database memiliki validasi yang jelas, bukan foreign key polimorfik palsu.

### Supporting tables di migration 017

Tabel berikut diperlukan agar idempotensi dan side effect memenuhi invariant, walaupun bukan master data UX:

| Tabel | Fungsi inti |
|---|---|
| idempotency_commands | property_id, actor_user_id, route, idempotency_key, request_fingerprint, status pending/succeeded/failed, response_status, response_body JSONB tersanitasi, resource reference, expires_at. UNIQUE(actor_user_id, route, idempotency_key). |
| business_events | Outbox PostgreSQL: property_id, event_key UNIQUE, event_type, aggregate_type/id, payload_version, sanitized payload, correlation_id, actor_user_id, status, attempt_count, available_at, published_at, dead_lettered_at. |

Redis boleh menjadi lock/cache singkat, tetapi PostgreSQL adalah sumber kebenaran untuk replay hasil lifecycle dan outbox.

## Rencana migration 016_kost_type_revision.sql

### Prinsip eksekusi

Runner saat ini membaca seluruh file SQL secara alfabetis dan mengeksekusi ulang semua file; ia belum memiliki schema_migrations ledger. Karena itu 016 harus replay-safe secara mandiri:

- gunakan CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS;
- gunakan DO block yang memeriksa pg_constraint sebelum ADD CONSTRAINT;
- gunakan DROP CONSTRAINT IF EXISTS hanya ketika constraint memang hendak diganti;
- gunakan INSERT ... ON CONFLICT dan UPDATE ... WHERE nilai IS DISTINCT FROM agar backfill tidak memodifikasi ulang data tanpa perlu;
- tidak ada TRUNCATE, DELETE massal, atau DROP TABLE;
- gunakan BEGIN/COMMIT di dalam file untuk DDL dan backfill kecil/menengah. Tidak memakai CREATE INDEX CONCURRENTLY karena runner saat ini mengeksekusi satu script transactional dan inventori saat ini kecil; jadwalkan deployment untuk lock DDL singkat.

### Urutan SQL yang direncanakan

1. Jalankan preflight read-only di pipeline deployment sebelum migration: invalid/missing category, mismatch room–building, variasi harga/deposit per property/category, variasi set fasilitas per property/category, file/resident referensi orphan, dan active occupancy yang property-nya tidak konsisten.
2. BEGIN; buat kost_types, facility_categories, kost_type_facility_assignments, dan kost_type_rules beserta constraint dasar/index.
3. Tambah category_id, icon, description, sort_order ke room_facilities; buat constraint sort order dan index.
4. Tambah kost_type_id ke rooms serta index property_id, kost_type_id, room_status. Tambah CHECK bersyarat room_status = inactive OR kost_type_id IS NOT NULL sebagai NOT VALID.
5. Buat dua kost type aktif per property aktif, rukost dan apartkost, secara deterministic. Nilai harga/deposit diisi hanya dari kategori yang lolos preflight; kategori tanpa room memperoleh nilai nol yang eksplisit dan tercatat dalam laporan deployment.
6. Backfill rooms.kost_type_id dengan join property_id + category. Backfill harga legacy seluruh room dari kost_type. Backfill assignment fasilitas hanya jika setiap room dalam property/category memiliki set fasilitas sama; tidak boleh memakai UNION atau mode yang mengubah arti fasilitas diam-diam.
7. Tambah dan validasi constraint room typed setelah query tidak menemukan room non-inactive tanpa kost_type_id.
8. Drop/add files_purpose_check agar memasukkan profile_photo. Tambah kolom resident personal, FK ktp_file_id/profile_photo_file_id dengan ON DELETE SET NULL, dan CHECK KTP 16 digit NOT VALID.
9. Ubah hunian_gallery_images secara additive: kolom target, nullable-kan kolom legacy yang perlu, ganti check legacy dengan check bercabang, lalu buat index target baru tanpa menghapus index legacy.
10. COMMIT. Setelah commit, jalankan query verifikasi dan simpan hasilnya pada deployment evidence.

### Backfill yang diperbolehkan

| Data | Algoritme idempoten | Larangan |
|---|---|---|
| kost_types | INSERT per property/category dengan ON CONFLICT property/slug; update hanya field legacy adapter bila belum ada data operator. | Tidak memilih harga berdasarkan baris acak atau mode tanpa persetujuan. |
| rooms.kost_type_id | UPDATE join property/category hanya ketika null atau berbeda. | Tidak mengisi bila category null/invalid. Migration harus gagal aman pada preflight. |
| Harga rooms legacy | UPDATE dari kost_types untuk semua room yang terhubung, hanya saat berbeda. | Tidak mengubah invoice snapshot historis. |
| Fasilitas tipe | Insert distinct assignment dari set yang telah dibuktikan identik per kategori. | Tidak menghapus room_facility_assignments lama. |
| resident file fields | Tetap null sampai file yang property/purpose-nya valid di-attach melalui workflow. | Tidak menebak dokumen KTP dari nama file. |
| Gallery M19 | Baris lama mendapat target_type null sebagai legacy adapter. | Tidak memaksa map ke kost type karena banyak catalog lama dapat memiliki cover berbeda. |

### Risiko dan mitigasi 016

| Risiko | Mitigasi |
|---|---|
| Harga/deposit fasilitas legacy tidak seragam tetapi hierarki baru mewajibkan seragam | Jadikan preflight sebagai go/no-go. Perbaiki data atau berikan keputusan owner tertulis untuk nilai kanonik sebelum menjalankan backfill. |
| rooms.category atau building category kosong/tidak cocok | Abort sebelum backfill; jangan menghubungkan berdasarkan nama room_type. |
| Unique cover gallery lama berbenturan dengan cover per kost type | Pertahankan legacy rows sebagai target_type null dan gunakan index target baru terpisah. |
| KTP lama bukan 16 digit | Constraint NOT VALID melindungi write baru; remediation data dilakukan terkontrol sebelum VALIDATE penuh. |
| DDL mengunci tabel rooms/files/gallery | Jalankan di maintenance window, ukur EXPLAIN/preflight pada salinan production, dan backup dahulu. |

## Rencana migration 017_lease_system.sql

### Urutan SQL yang direncanakan

1. BEGIN dan verifikasi prasyarat 016: room non-inactive sudah bertipe, kost type aktif ada, dan constraint essential tersedia.
2. Buat idempotency_commands serta business_events untuk command lifecycle dan side effect post-commit.
3. Buat leases dengan FK, check, partial unique active room/resident, unique occupancy, serta index scheduler/query.
4. Perluas occupancies dan occupancy_history untuk status/event transfer tanpa mengubah occupancy legacy.
5. Buat lease_history, room_transfer_records, dan lease_deposit_transactions beserta index/constraint ledger.
6. Tambah invoices.lease_id, cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount, generation_source. DROP NOT NULL pada invoices.billing_period_id; jangan mengubah nilai invoice lama.
7. Tambah partial unique invoice lease/cycle dan index invoice lease/due/generation source.
8. Insert permission lease.read dengan ON CONFLICT dan grant hanya kepada owner, manager, admin. Grant lease.manage lama dipertahankan; keputusan billing.manage admin dicatat di blocker.
9. COMMIT dan jalankan verifikasi referensial serta query duplicate active lease/invoice cycle.

### Constraint penting 017

| Area | Constraint |
|---|---|
| Lease | end_date >= start_date; billing_anchor_day 1..31; snapshot/cache >= 0; enum status/cycle; unique occupancy; partial active room/resident. |
| Transfer | room asal dan tujuan berbeda; uang snapshot >= 0; sumber/target lease unique. |
| Ledger | amount >= 0; enum tipe/arah/status; tipe dan arah kompatibel; payment link hanya collection/top_up. |
| Invoice | cycle end tidak sebelum start; enum source/cycle; lease/cycle partial unique. |
| Occupancy | enum diperluas secara aman menjadi active/ended/cancelled/transferred; existing data tidak diubah. |
| Idempotensi | request fingerprint dan route scoped unique per actor; status response tersimpan hanya untuk perintah yang telah commit. |
| Outbox | event_key unique sehingga retry dispatcher tidak membuat notifikasi/aksi internal ganda. |

### Kompatibilitas tabel dan endpoint lama

| Artefak lama | Keputusan kompatibilitas |
|---|---|
| room_types, room_facility_assignments, monthly_price/deposit_amount rooms | Tetap dibaca endpoint lama; tidak ada write baru. Kost type melakukan sinkron snapshot agar kontrak lama tetap melihat harga. |
| occupancies, check_in_records, check_out_requests | Tetap dibaca. Endpoint check-in/check-out admin didelegasikan ke LeaseService atau mengembalikan 409 LEASE_FLOW_REQUIRED setelah cutover; tidak boleh lagi membentuk occupancy tanpa lease. |
| billing_periods dan invoices legacy | Tidak disentuh. billing_period_id hanya menjadi nullable untuk invoice lease baru. |
| payments/payment_allocations | Tetap sumber uang masuk. Deposit collection/top_up membuat payment positif dan allocation target deposit; refund tidak memakai payment negatif. |
| public rooms dan public hunian catalog | Tidak diubah pada migration. Public query tetap membaca kolom rooms/gallery legacy sampai revisi publik tersendiri. |
| hunian-gallery M19 | target_type null dipakai adapter legacy; endpoint V2 menulis target eksplisit. |
| property_owner endpoints | Endpoint resident/occupancy/property-owner yang saat ini berpotensi menampilkan PII harus disempitkan atau diganti summary aman saat implementasi. property_owner tidak memperoleh lease.read. |

### Risiko dan mitigasi 017

| Risiko | Mitigasi |
|---|---|
| Menautkan lease ke occupancy legacy tanpa data komersial lengkap | Tidak dilakukan. Hanya lease baru yang memiliki occupancy_id; legacy tetap dapat dibaca. |
| Scheduler retry membuat invoice ganda | Partial unique lease/cycle, row lock lease, dan invoice insert ON CONFLICT dalam transaction yang juga memajukan next_billing_date. |
| Deposit transfer menambah saldo dua kali | Dua entry carry_forward wajib memiliki transfer_record_id yang sama dan arah berlawanan; event key/idempotency command unik. |
| Checkout bersamaan dengan payment/allocation | Lock lease, invoice terkait, dan ledger dalam urutan deterministik; hitung outstanding di transaction. |
| Error notification menggagalkan lease | Notification hanya outbox setelah commit; dispatcher retry terpisah. |
| Migration replay | Semua DDL guarded; data insert/upsert menggunakan key stabil; constraint/index diberi nama stabil. |

## Kontrak endpoint

### Konvensi global

- Base path adalah /api/v1.
- Kontrak V2 menggunakan JSON snake_case.
- Semua list V2 memakai:

~~~
{
  "data": [],
  "meta": { "total": 0, "limit": 20, "offset": 0 }
}
~~~

- Detail dan mutation V2 memakai:

~~~
{ "data": { } }
~~~

- Default limit 20, maksimum 100, offset minimum 0. Semua filter, sort, dan include di-allowlist.
- Error mengikuti GlobalExceptionFilter yang sudah ada:

~~~
{
  "success": false,
  "error": { "code": "...", "message": "...", "details": {} },
  "correlation_id": "...",
  "timestamp": "..."
}
~~~

- Endpoint legacy mempertahankan bentuk respons yang ada. Endpoint yang URL-nya sama dan perlu bentuk V2 memakai Accept: application/vnd.granada.admin-ux.v2+json selama masa transisi. Admin baru selalu mengirim header itu; tanpa header, serializer legacy dipakai. Endpoint baru tidak memerlukan header.
- property_id pada query/body selalu diverifikasi terhadap UserAccessContext. ID yang diperoleh dari path tetap divalidasi setelah lookup.

### Idempotency-Key

Header wajib untuk POST lifecycle: POST /leases, POST /leases/:id/deposit/collect, POST /leases/:id/close, POST /leases/:id/transfer, serta mutation galeri dan reorder yang dapat dipicu ulang. Header direkomendasikan untuk create/update finansial lain.

Aturan:

1. Kunci berupa UUID/opaque string 16–128 karakter.
2. Fingerprint = method + route canonical + actor + property + canonical JSON body.
3. Kunci yang sama dengan fingerprint sama dan status succeeded mengembalikan status/body sukses semula serta header Idempotency-Replayed: true.
4. Kunci sama dengan fingerprint berbeda memberi 409 IDEMPOTENCY_KEY_REUSED.
5. Kunci sama yang masih pending memberi 409 IDEMPOTENCY_REQUEST_IN_PROGRESS dengan Retry-After singkat; klien wajib retry memakai key yang sama.
6. Record tidak ditulis succeeded sebelum transaction bisnis commit. Retensi minimum tujuh hari untuk flow keuangan/lifecycle.

### RBAC ringkas

| Surface | Role dan permission minimum |
|---|---|
| Master kost type/facility/rule/gallery read | owner, manager, admin, property_owner + room.read; property_owner hanya response non-PII/read-only. |
| Master mutation dan room inventory mutation | owner, manager, admin + room.manage; service tetap menolak property_owner. |
| Lease read | owner, manager, admin + lease.read. Tidak ada property_owner atau technician. |
| Create/update/transfer lease | owner, manager, admin + lease.manage. |
| Deposit collect dan close | lease.manage DAN billing.manage. Dengan grant saat ini berarti owner/manager; lihat blocker bila admin harus dapat melakukannya. |
| Invoice read | owner, manager, admin + billing.read; property_owner memakai summary aman yang tidak menampilkan lease/PII. |
| Resident read/mutate | owner, manager, admin + resident.read/resident.manage. File KTP menambah pengecekan role secara eksplisit. |
| Dashboard | owner, manager, admin + room.read, lease.read, billing.read; property_owner mendapat endpoint summary terpisah bila diperlukan. |

### Master data kost type, fasilitas, dan aturan

| Method dan route | Request DTO snake_case | Response / catatan |
|---|---|---|
| GET /kost-types | property_id wajib bila caller memiliki lebih dari satu scope; category, status, include_deleted=false, q, limit, offset | List kost type dengan count rooms/facilities; room.read. |
| GET /kost-types/:id | - | Detail termasuk facilities dan rules; room.read. |
| POST /kost-types | property_id, category, name, slug, description_short?, description_long?, room_size_label?, room_size_m2?, monthly_price, yearly_price, deposit_amount, public_visible?, notes?, status? | Membuat tipe; room.manage. Menolak kategori aktif kedua pada property dengan 409 KOST_TYPE_ACTIVE_CATEGORY_EXISTS. |
| PATCH /kost-types/:id | name?, slug?, descriptions?, ukuran?, monthly_price?, yearly_price?, deposit_amount?, public_visible?, notes?, status? | Dalam satu transaction menyinkron rooms snapshot legacy. category immutable; 409 bila mencoba mengganti. |
| DELETE /kost-types/:id | - | Soft delete; 409 KOST_TYPE_IN_USE bila room atau lease active masih merujuk. |
| PUT /kost-types/:id/facilities | property_id, facility_ids array lengkap | Replace atomik assignment tipe; room.manage; 422 FACILITY_PROPERTY_MISMATCH bila cross-property. |
| GET/POST/PATCH/DELETE /facility-categories | GET: property_id, q, limit, offset. POST/PATCH: property_id/name/icon/sort_order atau field patch. | room.read / room.manage. Delete menolak kategori yang masih dipakai fasilitas active. |
| PUT /facility-categories/reorder | property_id, items: [{id, sort_order}] seluruh target | Semua ID harus satu property dan set harus lengkap; 409 REORDER_VERSION_CONFLICT bila target berubah setelah read, bila versioning diterapkan. |
| GET/POST/PATCH/DELETE /room-facilities | GET: property_id, category_id?, status?, q, limit, offset. POST: property_id, category_id, name, icon?, description?, status?. | room.read / room.manage. Assignment room legacy tidak ditulis. |
| PUT /room-facilities/reorder | property_id, category_id?, items lengkap | Atomik, room.manage. |
| GET /kost-type-rules | property_id, scope=global|kost_type, kost_type_id?, rule_category?, limit, offset | room.read. scope dan kost_type_id harus konsisten. |
| POST /kost-type-rules | property_id, kost_type_id? (null = global), rule_category, icon?, rule_text, is_allowed?, sort_order? | room.manage. |
| PATCH/DELETE /kost-type-rules/:id | Field yang diizinkan / - | room.manage, scope divalidasi. |
| PUT /kost-type-rules/reorder | property_id, kost_type_id? dan items lengkap | Reorder atomik per target. |

### Rooms

| Method dan route | Request / query DTO | Response / aturan |
|---|---|---|
| GET /rooms | property_id?, kost_type_id?, category?, building_id?, floor?, status?, q?, include_active_lease=false, limit, offset | V2 list berisi room physical fields, kost_type ringkas, harga/fasilitas dari tipe, dan active_lease minimal bila diminta. Nama resident dimasking sesuai izin. room.read. |
| GET /rooms/:id | include_active_lease? | Detail enrichment kost type dan aktif lease aman. |
| POST /rooms | property_id, kost_type_id, number/room_code, building_id, floor/floor_code/floor_label, unit_code?, gender_policy?, size_label?, primary_photo_file_id?, public_visible? | room.manage. Tidak menerima monthly_price, yearly_price, deposit_amount, room_type_id baru, atau facility_ids. Service mengisi snapshot harga dari kost type. |
| PATCH /rooms/:id | kost_type_id?, number/room_code?, building/floor/unit/visibility/primary photo/physical fields | room.manage. Menolak field harga/deposit/facility_ids dengan 400 IMMUTABLE_ROOM_COMMERCIAL_FIELD. Tidak boleh mengganti kost type room occupied bila mengubah snapshot komersial aktif; gunakan transfer. |
| PATCH /rooms/:id/status | status = maintenance/inactive/requires_review dan reason | room.manage. Menolak occupied/vacant/reserved melalui 422 ROOM_STATUS_MANAGED_BY_LEASE. |

### Residents dan file identitas

| Method dan route | Request / query DTO | Response / aturan |
|---|---|---|
| GET /residents | property_id?, status?, q?, include_active_lease?, limit, offset | List menampilkan ktp_number_masked, bukan ktp_number/file URL; active lease ringkas bila diizinkan. |
| GET /residents/:id | include_lease_history? | Detail personal; metadata dokumen aman saja. owner/manager/admin + resident.read. |
| POST /residents | property_id, user_id?, full_name, phone?, email?, ktp_number?, gender?, date_of_birth?, place_of_birth?, address?, emergency_phone?, ktp_file_id?, profile_photo_file_id?, emergency_contacts? | resident.manage; KTP berformat 16 digit bila ada dan file/property/purpose tervalidasi. |
| PATCH /residents/:id | Field personal yang sama secara partial | resident.manage; semua audit dimasking. |
| GET /residents/:id/ktp-document | - | Mengembalikan metadata minimal dan authorized_content_url menuju FileController; hanya owner/manager/admin dengan property scope. Tidak mereturn storage_path. |
| POST /files | multipart file + property_id, file_purpose = ktp atau profile_photo | File purpose baru ditambahkan. profile_photo hanya gambar; KTP PDF/JPEG/PNG sesuai policy. |
| GET /files/:id/content | download? boolean | FileService mengecek property, purpose, dan linkage resident; role property_owner/technician/resident lain ditolak untuk purpose ktp. |

### Leases

| Method dan route | Request / query DTO | Response / aturan |
|---|---|---|
| GET /leases | property_id?, status?, overdue?, resident_id?, room_id?, kost_type_id?, q?, limit, offset | lease.read. Setiap row berisi lease_code, resident masked, room, kost type, start_date, billing_cycle, next_billing_date, last invoice summary, outstanding summary. |
| GET /leases/overdue | property_id?, limit, offset | Dideklarasikan sebelum :id. lease.read; hanya lease dengan invoice outstanding overdue. Tidak ada route expiring. |
| GET /leases/:id | - | lease.read; detail memuat snapshot komersial, resident masked, room, type/facilities, ledger, invoice list, payment summary, history tersanitasi, transfer links. |
| GET /leases/:id/billing-summary | - | lease.read; invoice/payment/outstanding per lease, tanpa data KTP. |
| POST /leases | property_id, room_id, resident_id XOR resident baru, start_date, billing_cycle, billing_anchor_day?, notes?; header Idempotency-Key wajib | lease.manage. Harga/deposit tidak pernah diterima dari client. resident baru memiliki DTO resident tetapi tidak boleh membawa user credential. Response memuat lease, occupancy, first_invoice, deposit_summary. |
| PATCH /leases/:id | notes? | lease.manage. Hanya atribut non-komersial; harga, room, resident, siklus, anchor, status ditolak dengan 400 LEASE_COMMERCIAL_FIELD_IMMUTABLE. |
| POST /leases/:id/deposit/collect | transaction_type = collection/top_up, amount, payment: {payment_method, payment_code?, reference_number?, paid_at?, notes?}?, override_reason?; Idempotency-Key wajib | lease.manage + billing.manage. payment dibuat positif/verified dalam transaction bila uang diterima; override tanpa payment hanya owner/manager dan reason wajib. |
| POST /leases/:id/close | end_date, room_status_after = vacant/maintenance, reason, damage_deductions: [{amount, reason, file_ids?}]?, refund: {amount?, payment_method?, external_reference?, reason?}?; Idempotency-Key wajib | lease.manage + billing.manage. Server menghitung outstanding invoice deduction; client tidak boleh menandai invoice paid. Response mengembalikan lease closed, ledger, refund payable/settled, room status. |
| POST /leases/:id/transfer | target_room_id, effective_date, reason, top_up? payment object; Idempotency-Key wajib | lease.manage. Response memuat source_lease, target_lease, transfer_record, carried_deposit, old outstanding summary. Aturan siklus transfer menunggu blocker yang dicatat di bawah. |

### Invoices, gallery, dashboard, vehicle, dan parking

| Method dan route | Request / query DTO | Response / aturan |
|---|---|---|
| GET /invoices | property_id?, status?, lease_id?, resident_id?, room_id?, kost_type_id?, generation_source?, limit, offset | billing.read. Invoice legacy tetap ditampilkan dengan lease_id null. Response badge Auto/Manual berasal dari generation_source. |
| POST /invoices | Kontrak manual legacy dipertahankan selama transisi | billing.manage. Lease invoice normal dibuat hanya LeaseService/scheduler; controller manual menolak membuat cycle yang sudah dimiliki lease. |
| GET /hunian-gallery | property_id?, target_type?, kost_type_id?, common_area_key?, legacy filters?, limit, offset | V2 room.read. Tanpa header V2 dan dengan legacy filter, serializer M19 dipertahankan. |
| POST /hunian-gallery | property_id, target_type, kost_type_id XOR common_area_key, file_id, alt_text, caption?, public_visible?, sort_order?; Idempotency-Key | room.manage. Tidak menerima category/gender/catalog legacy pada V2. |
| PATCH /hunian-gallery/:id | alt_text?, caption?, public_visible?, sort_order? | room.manage. Target immutable; pindah target adalah detach/attach eksplisit. |
| POST /hunian-gallery/:id/set-cover | Idempotency-Key | room.manage; satu cover per target. |
| PUT /hunian-gallery/reorder | property_id, target descriptor, items: [{id, sort_order}] lengkap; Idempotency-Key | room.manage; semua image harus target sama. |
| DELETE /hunian-gallery/:id | Idempotency-Key | soft delete gallery image; tidak otomatis menghapus file. |
| GET /dashboard/summary | property_id? | room.read + lease.read + billing.read. Response: active_leases, active_residents, rooms_total/vacant/occupied/maintenance, verified_revenue_current_month, outstanding_amount, overdue_invoice_count, recent_leases, recent_payments, urgent_maintenance_count, timezone, generated_at, period_start, period_end. Satu snapshot query transaction read-only. |
| GET /vehicles | property_id?, status?, vehicle_type?, limit, offset | vehicle.manage. V2 menampilkan active_room dari active lease/occupancy read model; snapshot_room_number ditandai legacy. |
| GET /parking/zones dan /parking/slots | Kontrak existing dipertahankan | parking.manage. Transfer tidak mengubah vehicle ownership atau parking assignment; hanya query display room yang bergeser ke lease aktif. |

### Kode error utama

| HTTP | Kode | Kapan digunakan |
|---|---|---|
| 400 | VALIDATION_ERROR, IDEMPOTENCY_KEY_REQUIRED, IMMUTABLE_ROOM_COMMERCIAL_FIELD, LEASE_COMMERCIAL_FIELD_IMMUTABLE | DTO/header/field tidak sah. |
| 401 | UNAUTHENTICATED | Token/session tidak sah. |
| 403 | FORBIDDEN, PROPERTY_SCOPE_DENIED, PROPERTY_OWNER_READ_ONLY, KTP_ACCESS_DENIED | Role atau property scope tidak berhak. |
| 404 | LEASE_NOT_FOUND, KOST_TYPE_NOT_FOUND, ROOM_NOT_FOUND, RESIDENT_NOT_FOUND | Resource tidak ada atau tidak boleh diungkap lintas scope. |
| 409 | LEASE_ROOM_CONFLICT, LEASE_RESIDENT_CONFLICT, LEASE_STATE_CONFLICT, ROOM_STATUS_MANAGED_BY_LEASE, KOST_TYPE_IN_USE, IDEMPOTENCY_KEY_REUSED, IDEMPOTENCY_REQUEST_IN_PROGRESS | Konflik lifecycle/unik/idempotensi. |
| 422 | PROPERTY_SCOPE_MISMATCH, ROOM_KOST_TYPE_MISMATCH, ROOM_NOT_LEASABLE, FACILITY_PROPERTY_MISMATCH, GALLERY_TARGET_INVALID, DEPOSIT_EXCEEDS_REQUIRED | Foreign key lintas property atau state/domain tidak valid. |
| 429 | RATE_LIMITED | Upload/financial command melampaui batas. |

## Transaction boundary dan urutan lock

Semua transaction memakai client dari pool yang sama untuk seluruh repository call. Urutan lock konsisten untuk mencegah deadlock: property settings/read model, lease, room IDs terurut UUID, resident, occupancy, invoice, lalu ledger. Read master kost type memakai FOR SHARE bila diperlukan.

| Flow | Lock dan efek atomik sebelum commit | Side effect setelah commit |
|---|---|---|
| Create lease | Claim idempotency command; lock room + resident; validasi property/status/kost type; buat resident bila nested; insert occupancy active; insert lease active; update room occupied; insert lease_history created; buat invoice pertama issued; set next_billing_date; audit aman; outbox lease.created dan billing.invoice_issued; simpan hasil idempotensi. | Dispatcher kirim notifikasi; integrasi Smart Lock hanya melalui event bila dipakai. |
| Billing scheduler | Lock lease due memakai FOR UPDATE SKIP LOCKED; untuk setiap siklus maksimal 12, insert invoice auto ON CONFLICT, history invoice_generated, update next_billing_date tepat sekali, outbox invoice issued. | Notification invoice; alert outbox bila batas catch-up tercapai. |
| Deposit collect/top-up | Claim idempotency; lock lease dan ledger terkait; cek active/property/limit; buat payment positif dan allocation bila ada uang masuk; insert ledger credit; hitung ulang cache; history; audit; outbox deposit collected. | Notification receipt bila disetujui template. |
| Checkout | Claim idempotency; lock lease, room, resident, occupancy, invoice terkait, ledger; hitung outstanding; insert deduction terpisah untuk tunggakan dan setiap kerusakan; buat refund debit/payable bila ada; hitung cache; close occupancy/lease; update room vacant/maintenance; history; audit; outbox lease.closed. | Notification, Smart Lock revocation, dan workflow refund melalui outbox. |
| Transfer | Claim idempotency; lock source lease, resident, source/target room terurut, source occupancy, source ledger; validasi target vacant dan anchor; close source lease/occupancy transferred; create target occupancy/lease; update kedua room; insert transfer record; insert dua carry_forward dengan arah berlawanan; top-up bila ada; two lease histories; audit; outbox lease.transferred. | Notification dan Smart Lock transition setelah commit. |

Jika audit atau outbox insert gagal, seluruh write bisnis harus rollback. Jika notification provider gagal setelah commit, transaction lease tidak dirollback; dispatcher menambah retry/backoff dan akhirnya dead-letter.

## Scheduler invoice yang aman retry dan multi-instance

### Mekanisme

1. Tambahkan @nestjs/schedule dan ScheduleModule.forRoot. LeaseBillingScheduler berjalan dengan cron 10 0 * * * dan timeZone Asia/Jakarta.
2. Scheduler mengambil advisory lock PostgreSQL bernama lease-billing-v1 melalui dedicated pooled client. Instance lain yang gagal memperoleh lock keluar normal. Lock dilepas pada finally atau saat koneksi mati.
3. Di bawah lock global, worker mengambil batch lease active dengan next_billing_date <= tanggal Jakarta memakai:

~~~
SELECT ...
FROM leases
WHERE lease_status = 'active'
  AND next_billing_date <= jakarta_today
ORDER BY next_billing_date, id
FOR UPDATE SKIP LOCKED
~~~

4. Satu lease diproses dalam satu transaction pendek. Semua siklus untuk lease itu atomic: insert invoice, history, outbox, dan advance next_billing_date. Tidak ada provider call di dalam transaction.
5. Cycle helper menghitung tanggal anchor 29–31 sebagai hari terakhir bulan tujuan dan 29 Februari tahun non-kabisat sebagai 28 Februari. cycle_end_date = next cycle start - 1 hari.
6. due_date dihitung dari property_settings.default_due_day di dalam periode, dibatasi hari terakhir siklus dan tidak lebih awal dari tanggal issue.
7. Insert invoice menggunakan partial unique lease/cycle. Bila conflict, worker memuat invoice yang sudah ada dan hanya boleh memajukan next_billing_date bila cycle tersebut benar-benar telah ada; ini membuat retry pasca-crash aman.
8. Batas catch-up adalah 12 siklus per lease per run. Ketika batas dicapai dan lease masih due, next_billing_date tidak dilompati; insert business event deduped lease.billing_catchup_limit_reached:<lease_id>:<jakarta_date>.

### Ketahanan

| Kegagalan | Hasil yang diharapkan |
|---|---|
| Dua instance cron mulai bersamaan | Advisory lock membatasi satu runner; FOR UPDATE SKIP LOCKED dan unique invoice tetap melindungi bila lock operasional gagal. |
| Proses mati sebelum commit | Invoice/history/next date rollback bersama; run berikutnya membuat satu invoice. |
| Proses mati sesudah commit sebelum notification | Invoice sudah satu kali; outbox pending diproses kemudian. |
| Error satu lease | Transaction lease rollback; lease lain tetap diproses. Error tercatat dengan correlation/job run id dan di-alert setelah ambang retry. |
| Invoice legacy/manual | Tidak dipilih kecuali lease_id ada dan lease active; scheduler tidak memakai billing_periods. |
| Waktu host salah | Query tanggal menggunakan PostgreSQL AT TIME ZONE Asia/Jakarta dan scheduler menyatakan timezone eksplisit. |

## Daftar file backend yang kelak berubah

Tidak ada file berikut diubah pada pekerjaan ini. Daftar ini adalah handoff implementasi.

| Status | File / direktori | Perubahan nanti |
|---|---|---|
| NEW | backend/api/src/infrastructure/database/migrations/016_kost_type_revision.sql | Schema kost type, fasilitas, resident/file, gallery target, backfill guarded. |
| NEW | backend/api/src/infrastructure/database/migrations/017_lease_system.sql | Lease, invoice extension, ledger, transfer, idempotency command, business outbox, RBAC seed delta. |
| NEW | backend/api/src/modules/kost-type/ | Controller, DTO, service, repository, serializer, test. |
| NEW | backend/api/src/modules/facility-category/ | CRUD/reorder kategori fasilitas. |
| NEW | backend/api/src/modules/kost-rule/ | CRUD/reorder aturan global/per kost type. |
| NEW | backend/api/src/modules/lease/ | LeaseService orchestration, repository, controller, DTO, scheduler, date helper, ledger/transfer/read model, tests. |
| NEW | backend/api/src/modules/dashboard/ | Summary query property-scoped dan response serializer. |
| NEW | backend/api/src/modules/idempotency/ dan backend/api/src/modules/outbox/ | Durable command replay, dispatcher, retry/dead letter, event consumer contract. |
| MODIFY | backend/api/src/app.module.ts | Register module baru dan ScheduleModule; urutan module tidak boleh menimbulkan circular import. |
| MODIFY | backend/api/package.json | Tambahkan @nestjs/schedule dan script lease:validate-workflow/test yang diperlukan. |
| MODIFY | backend/api/src/modules/room/room.controller.ts, room.service.ts, repositories/room.repository.ts, dto/, types/room.types.ts | V2 serializer/filter/pagination, kost type enrichment, physical-only mutation, status guard, adapter legacy/public. |
| MODIFY | backend/api/src/modules/room/public-room.service.ts dan public-hunian-catalog.service.ts | Tetap kompatibel dengan harga legacy/gallery adapter selama revisi publik ditunda. |
| MODIFY | backend/api/src/modules/resident/resident.controller.ts, resident.service.ts, repositories/resident.repository.ts, dto/, types/, resident-audit.util.ts | Field personal/file, KTP masking, detail authorization, active lease read model, audit sanitasi. |
| MODIFY | backend/api/src/modules/occupancy/ | Check-in/check-out controller delegasi atau 409, status transferred, repository tidak lagi mengubah room occupied/vacant di luar LeaseService. |
| MODIFY | backend/api/src/modules/billing/controllers/invoice.controller.ts, services/invoice.service.ts, repositories/invoice.repository.ts, dto/list-invoices-query.dto.ts, types/billing.types.ts | Lease filters, invoice creation internal, serializers V2, payment/deposit allocation boundary. |
| MODIFY | backend/api/src/modules/billing/services/payment.service.ts dan repositories/payment.repository.ts | Atomic incoming payment + deposit allocation melalui lease transaction client. |
| MODIFY | backend/api/src/modules/file/constants/file.constants.ts, types/file.types.ts, file.service.ts, file.repository.ts | Tambah profile_photo, KTP purpose/linkage authorization yang lebih sempit, response aman. |
| MODIFY | backend/api/src/modules/hunian-gallery/ | Target V2, legacy M19 adapter, target-aware cover/reorder/index usage, DTO/serializer. |
| MODIFY | backend/api/src/modules/notification/constants/notification.constants.ts, services/, repositories/ | Tambah event lease, dispatcher dari outbox, dedupe overdue/lease notification, payload sanitasi. |
| MODIFY | backend/api/src/modules/vehicle/repositories/vehicle.repository.ts, services/vehicle.service.ts, types/vehicle.types.ts | Room tampilan diturunkan dari lease aktif, bukan snapshot kendaraan/occupancy mandiri. |
| MODIFY | backend/api/src/modules/parking/ | Hanya enrichment/read model jika UI menampilkan kamar; ownership vehicle dan assignment slot tidak berubah pada transfer. |
| MODIFY | backend/api/src/infrastructure/database/seeds/001_rbac_seed.sql | Tambah lease.read grant owner/manager/admin dan keputusan grant finance admin. |
| MODIFY | backend/api/src/infrastructure/database/seeds/core-seed.data.ts dan scripts/seed-core.ts | Setelah scope seed disetujui: fixture kost type, lease, invoice, ledger, gallery, transfer; tidak menjadi bagian migration production. |
| MODIFY | backend/api/src/infrastructure/database/scripts/validate-billing-workflow.ts atau NEW validate-lease-workflow.ts | Integration validation create/retry/scheduler/checkout/transfer/PII/legacy compatibility. |
| REVIEW | backend/api/src/infrastructure/database/scripts/migrate.ts | Tetap dapat menjalankan migration idempoten saat ini. Ubah hanya bila tim memutuskan migration registry atau index concurrent; jangan mencampur perubahan itu dengan 016/017 tanpa rencana rollout. |

## Verification gate sebelum implementasi

1. Jalankan 016 dan 017 dua kali pada PostgreSQL disposable dengan seluruh migration 001–015 di depannya.
2. Simpan hasil preflight data: room/category/building mismatch, harga/deposit, set fasilitas, active occupancy, invoice, file, dan gallery legacy.
3. Uji dua request create lease paralel pada room/resident sama; hasil maksimal satu occupancy, lease, dan invoice issued.
4. Uji replay Idempotency-Key sama, reuse key dengan payload berbeda, dan pending command.
5. Uji scheduler monthly/yearly, anchor 29–31, leap year, retry setelah crash simulasi, dan dua instance.
6. Uji checkout dengan tunggakan di atas/bawah deposit tanpa mengubah invoice menjadi paid.
7. Uji transfer dengan piutang lama dan carry-forward dua arah.
8. Uji KTP list/detail/file untuk owner, manager, admin, property_owner, technician, resident lain, dan scope property berbeda.
9. Bandingkan respons legacy rooms/invoices/public gallery sebelum dan sesudah migration.

## Pertanyaan dan blocker yang benar-benar perlu keputusan

### Go/no-go sebelum migration production

1. Nilai kanonik harga, harga tahunan, deposit, dan set fasilitas untuk setiap property/category belum dapat dipilih aman dari schema saja. Bila preflight menemukan variasi, owner data harus menetapkan nilai final; migration tidak boleh mengambil nilai mode/min/max secara diam-diam.
2. room.category atau room_buildings.category yang kosong/tidak sama tidak dapat dipetakan sah ke kost_type. Data itu harus diperbaiki sebelum constraint room typed divalidasi.
3. Model transfer belum menentukan semantik exact effective_date: apakah hanya tanggal Jakarta hari ini atau boleh masa depan; apakah end_date lease/occupancy lama inklusif; dan bagaimana target lease tanpa invoice pada siklus berjalan direpresentasikan. Flow yang sekarang diminta—lease baru aktif namun invoice baru mulai siklus berikutnya tanpa proration—adalah pengecualian dari aturan create lease yang selalu membuat invoice pertama.

### Keputusan produk/API yang perlu ditegaskan

4. Spesifikasi menyatakan invoice pertama issued saat create lease, tetapi form menyebut issued pada start_date. Untuk start_date masa depan, pilih salah satu: batasi start_date ke hari ini; buat scheduled lease/draft tanpa occupancy aktif; atau issue lebih awal dengan due-date yang disepakati. Keputusan ini juga menentukan apakah cancel before start benar-benar ada.
5. Refund deposit belum memiliki mekanisme payout. Apakah checkout harus menuntut refund sudah dibayar secara manual sebelum close, atau boleh membuat refund pending/payable lalu diselesaikan setelahnya? Desain di atas mendukung pending, tetapi perlu approval keuangan dan SOP.
6. Deposit collection/top-up perlu keputusan apakah admin boleh mencatat receipt langsung sebagai verified payment, atau wajib memilih payment/proof yang telah diverifikasi lebih dulu. Desain usulan mengizinkan receipt langsung hanya dengan audit dan idempotency; override tanpa uang masuk dibatasi owner/manager.
7. Saat ini admin memiliki lease.manage tetapi tidak memiliki billing.manage maupun deposit.manage; kontrak UX meminta billing.manage untuk collect/close. Konfirmasi apakah admin memang dilarang melakukan aksi finansial tersebut, atau RBAC seed harus memberi billing.manage kepada admin.
8. target area bersama belum memiliki entity. Desain memakai common_area_key stabil. Konfirmasi apakah key seperti lobby/rooftop cukup, atau bisnis memerlukan tabel common_areas dengan UUID sebelum API dipublikasikan.
9. Endpoint status room dilarang mengatur vacant, sedangkan aturan pemulihan room dari maintenance/inactive/requires_review ke vacant belum ditentukan. Diperlukan flow resolusi eksplisit agar room dapat disewakan lagi tanpa melanggar invariant LeaseService.

### Default kompatibilitas yang dipakai bila tidak ada keputusan baru

- Partial unique KTP active yang saat ini global tidak diubah. Jika satu orang harus boleh aktif di dua property, itu memerlukan perubahan kebijakan dan migration tersendiri.
- KTP disajikan melalui endpoint file terautentikasi yang sudah ada, bukan signed URL baru.
- Baris gallery M19 tetap target legacy null sampai revisi publik; tidak dipaksa bermigrasi ke satu cover per kost type.
- property_owner tidak diberi akses lease, KTP, resident detail, atau occupancy detail yang mengandung PII; hanya summary yang eksplisit aman.
