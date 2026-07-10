# Admin UX — M0 Staging Remediation Runbook

> **Status: NO-GO sampai seluruh approval dan precondition pada dokumen ini terpenuhi.**
> Dokumen ini hanya mengatur remediasi data staging untuk membuka M2. Ia bukan
> migration, bukan seed, dan tidak mengizinkan perubahan production.

## 1. Otoritas, scope, dan baseline

Dokumen ini melengkapi **ADMIN_UX_FINAL_INTEGRATION.md**. Jika ada
perbedaan, kontrak final tetap berlaku.

Baseline M0 yang harus ditutup:

| Area | Temuan |
|---|---|
| Fasilitas Apart Kost | 39 room tidak memiliki fasilitas dan 1 room memiliki 8 fasilitas. |
| Status hunian | 8 occupancy aktif berada pada room vacant; 2 room occupied tidak mempunyai occupancy aktif. |
| Keuangan legacy | Invoice, payment, dan allocation lulus pemeriksaan agregat; tidak boleh dimutasi oleh remediasi. |
| Galeri dan KTP | Tidak ada mismatch agregat; file KTP tidak boleh diinferensikan dari nama, metadata, atau storage path. |
| RBAC | billing.manage hanya untuk owner/manager. lease.read adalah deliverable M2, bukan remediasi ad-hoc. |

Tidak ada heuristic yang diizinkan: bukan room mayoritas, mode, set fasilitas
tunggal, nilai minimum/maksimum, ataupun tebakan dari data lain.

## 2. Peran dan approval

| Peran | Tanggung jawab |
|---|---|
| Pemilik bisnis/data | Menetapkan set fasilitas kanonik dan fakta fisik per anomali hunian. |
| Operator staging | Menjalankan hanya batch yang disetujui memakai run ID dan correlation ID. |
| DBA/Backend DB | Menyiapkan backup, manifest, script one-time, transaksi, dan kompensasi yang direview. |
| QA/Release | Menjalankan ulang preflight, menyimpan evidence tersanitasi, dan menutup M0. |
| Release owner | Menyetujui pembukaan M2 setelah seluruh gate PASS. |

Setiap batch memerlukan approval pemilik bisnis/data **dan** release/DB owner.
Satu anomali dengan fakta yang tidak dapat dibuktikan membuat M0 tetap BLOCKED.

## 3. Precondition sebelum write staging

1. Kontrak final Admin UX telah disetujui eksplisit.
2. Target terbukti staging melalui guard environment, database identifier, dan
   property ID yang persis sama dengan manifest; production harus ditolak.
3. Mutation room, fasilitas, occupancy, check-in, check-out, billing, dan payment
   untuk properti terdampak dihentikan selama window remediasi.
4. Database staging dibackup dan diuji restore pada clone terisolasi. Evidence
   memuat backup ID, checksum, waktu, owner, dan hasil restore.
5. Enam query M0 dijalankan ulang dalam transaksi repeatable-read read-only.
   Baseline bertimestamp dan checksum invoice/payment/allocation disimpan.
6. Setiap batch mempunyai manifest berhash berisi opaque internal ID, before
   state, keputusan bisnis, expected after state, operator, approver, backup ID,
   correlation ID, dan batas waktu approval.
7. Jika count atau hash baseline berubah sebelum batch dimulai, batch dibatalkan
   dan approval diulang.

Evidence tidak boleh memuat nama penghuni, nomor KTP, URL file, storage path,
atau nilai rahasia.

## 4. Kontrol teknis untuk seluruh batch

Remediasi ditulis sebagai script one-time staging dengan dry-run sebagai default.
Ia bukan migration dan bukan loop PATCH endpoint Admin.

- Gunakan PoolClient tunggal dengan **BEGIN ISOLATION LEVEL SERIALIZABLE**,
  retry terbatas pada serialization failure, dan rollback otomatis saat assertion
  gagal.
- Gunakan transaction-scoped advisory lock untuk run ID **dan** lock tabel/row
  yang relevan. Advisory lock saja tidak cukup karena aplikasi lama tidak
  memakainya.
- Sebelum write, re-read state setelah lock dan cocokkan dengan manifest.
  Mismatch property, category, status, count, atau before-hash harus abort.
- Audit remediation ditulis oleh client transaksi yang sama ke audit_logs.
  Jangan memakai AuditRepository setelah commit karena ia memakai koneksi pool
  terpisah dan tidak atomik dengan perubahan domain.
- Simpan audit batch berisi action, scope, before/after hash, run ID,
  correlation ID, actor, dan manifest reference yang tersanitasi. Script harus
  abort bila correlation ID yang sama sudah sukses.
- Rollback pasca-commit adalah transaksi kompensasi yang memakai manifest
  before-state lengkap, assertion, lock, dan post-hash yang sama. Jangan restore
  seluruh staging kecuali DBA/release owner menyatakan insiden.

## 5. FAC-AK-001 — fasilitas kanonik Apart Kost

### 5.1 Keputusan bisnis

Pemilik bisnis/data menyetujui satu set fasilitas eksplisit yang berlaku untuk
seluruh 40 room Apart Kost:

- property ID dan tepat 40 room ID target;
- facility ID unik yang disetujui;
- dasar keputusan berupa kebijakan produk atau inventaris fisik;
- tanggal efektif serta approver; dan
- konfirmasi bahwa tidak ada pengecualian room.

Set 8 fasilitas pada satu room hanya kandidat pemeriksaan, bukan sumber
kebenaran otomatis. Seed lama juga bukan sumber kanonik.

### 5.2 Prosedur teknis

1. Dry-run membuat manifest untuk tepat 40 room. Ia memastikan setiap target
   berada pada property yang benar, category apartkost, memiliki building yang
   property/category-nya sama, dan cocok dengan expected room/building/type pada
   manifest.
2. Verifikasi setiap facility target aktif, unik, dan berada pada property yang
   sama. Jangan percaya UUID input saja.
3. Dalam satu transaksi serializable, lakukan lock tulis pada rooms,
   room_facility_assignments, dan room_facilities; kemudian lock semua room
   target dan re-check before-hash.
4. Hapus assignment **hanya** untuk room target, masukkan product Cartesian
   target room x set fasilitas kanonik, lalu assert tiap room memiliki tepat set
   tersebut tanpa extra assignment dan tanpa cross-property assignment.
5. Tulis audit batch dan audit per-room atau referensi manifest per-room di
   transaksi yang sama. Simpan tuple before-state lengkap
   (room_id, facility_id) sebagai rollback manifest; hash saja tidak cukup.

Jangan memakai RoomRepository.replaceFacilities atau PATCH room per room:
implementasi lama melakukan delete/insert per room tanpa transaksi lintas 40
room serta tanpa validasi property scope yang memadai.

### 5.3 PASS FAC-AK

- Semua 40 target sama persis dengan set fasilitas kanonik.
- facility_groups_with_nonuniform_set = 0.
- rooms_in_nonuniform_facility_groups = 0.
- facility_assignment_cross_property_or_orphan = 0.
- Hash invoice, payment, allocation, galeri, dan KTP/file tidak berubah.

## 6. OCC-ACTIVE-VACANT-001 sampai 008

Setiap occupancy aktif pada room vacant membutuhkan satu keputusan bisnis:

| Fakta yang disetujui | Tindakan yang diizinkan |
|---|---|
| Penghuni masih menempati room | Pertahankan occupancy dan sinkronkan room menjadi occupied. |
| Occupancy stale / penghuni telah keluar | Tutup occupancy melalui prosedur checkout legacy yang direproduksi secara transaksional. |
| Fakta tidak dapat dibuktikan | Tidak ada write; M0 tetap BLOCKED. |

### 6.1 Kasus penghuni masih aktif

1. Lock occupancy dan room, lalu assert keduanya masih membentuk anomali,
   termasuk property, room ID, resident ID, dan occupancy status.
2. Ubah room dari vacant ke occupied dalam transaksi yang sama.
3. Tambahkan occupancy_history status_sync dengan from_status active,
   to_status active, event_date bisnis, serta correlation/reason tersanitasi di
   metadata JSONB.
4. Tambahkan audit_logs atomik dengan correlation ID.

Tidak boleh membuat check-in, invoice, payment, lease, atau refund baru.

### 6.2 Kasus occupancy telah stale

Gunakan semantik checkout legacy, tetapi script staging harus menjalankan semua
langkah dalam transaksi yang dikontrol:

1. Lock check-out request yang ada, occupancy, room, dan resident. Assert tidak
   ada check-out request requested/approved lain untuk occupancy yang sama.
2. Assert end_date yang disetujui tidak sebelum occupancy.start_date.
   requested_check_out_date dan end_date harus sama kecuali manifest menjelaskan
   perbedaan yang secara eksplisit disetujui.
3. Buat check_out_request, tandai approved sebagai langkah audit operasional,
   finalisasi occupancy menjadi ended, dan ubah room menjadi vacant atau
   maintenance sesuai approval.
4. Tulis occupancy_history check_out dan audit log pada transaksi yang sama.

Endpoint/service lama dapat menjadi referensi semantik, tetapi tidak cukup
sendiri untuk remediasi karena finalizer saat ini tidak mengunci room/occupancy
dan auditnya terjadi setelah commit.

## 7. ROOM-OCCUPIED-NO-OCC-001 sampai 002

| Fakta yang disetujui | Tindakan yang diizinkan |
|---|---|
| Room sebenarnya kosong | Ubah ke vacant atau maintenance sesuai fakta operasional; jangan membuat occupancy. |
| Penghuni masih tinggal | Buat satu occupancy legacy secara atomik setelah resident dan start date diverifikasi. |
| Fakta tidak dapat dibuktikan | Tidak ada write; M0 tetap BLOCKED. |

Untuk cabang penghuni masih tinggal, jangan menurunkan room ke vacant dan jangan
memakai endpoint check-in saat ini karena endpoint itu menolak room occupied.
Script harus:

1. Lock room dan resident; assert room masih occupied, resident aktif, seluruh
   record berada pada property yang sama, dan tidak ada occupancy aktif untuk
   room maupun resident.
2. Assert tidak ada lease aktif atau check-out request yang konflik.
3. Insert occupancy active, check_in_record, occupancy_history check_in, dan
   audit log dalam satu transaksi.
4. Simpan fakta tanggal tinggal pada occupancies.start_date dan
   occupancy_history.event_date. checked_in_at pada check_in_records adalah
   timestamp remediasi kecuali bukti waktu check-in historis tersedia; jangan
   mengarang timestamp historis.

Untuk cabang room kosong, gunakan transaksi paired yang mengassert tidak ada
occupancy aktif sebelum menulis vacant/maintenance dan sebelum menulis audit.

## 8. Data immutable pada M0

| Domain | Aturan |
|---|---|
| Invoice, payment, allocation | Tidak ada update, void, relink, atau backfill lease. Bekukan writer dan verifikasi checksum sebelum/sesudah. |
| KTP dan file | Tidak ada inferensi atau attachment otomatis. ktp_file_id tetap null sampai attachment sah setelah M2. |
| Galeri legacy | Tidak dipetakan ke kost type atau common area secara heuristik. |
| Harga, deposit, yearly price, room type | Tidak diubah oleh batch fasilitas maupun occupancy. |

## 9. Template approval dan manifest

    Run ID:
    Correlation ID:
    Anomaly ID:
    Tipe: FAC-AK / OCC-ACTIVE-VACANT / ROOM-OCCUPIED-NO-OCC
    Scope dan opaque manifest reference:
    Evidence timestamp / M0 query hash:
    Expected before-state / after-state:
    Keputusan bisnis dan sumber verifikasi:
    Tabel yang boleh disentuh:
    Tabel yang dilarang disentuh: invoices, payments, payment_allocations, files,
      residents.ktp_number, hunian_gallery_images
    Backup ID / restore evidence:
    Rollback manifest checksum:
    Operator / approver bisnis-data / approver release-DB:
    Post-check result:

## 10. Acceptance gate M0 dan pembukaan M2

| Check | PASS |
|---|---|
| Category/building/room | Mismatch, category invalid, dan mapping unsafe semuanya 0. |
| Harga, room type, fasilitas | Variasi harga/deposit/yearly yang tidak disetujui 0; fasilitas nonuniform 0; cross-property assignment 0. |
| Occupancy | Room occupied tanpa occupancy aktif 0; occupancy aktif pada room selain occupied 0; duplikasi/property mismatch 0. |
| Invoice/payment | Semua orphan, mismatch, amount/allocation anomaly 0; count/checksum legacy tidak berubah. |
| Gallery/file/KTP | Mismatch 0; evidence masking; tidak ada attachment hasil inferensi. |
| RBAC | billing.manage hanya owner/manager; rencana M2 untuk lease.read owner/manager/admin telah disetujui. |

M2 hanya boleh dibuka jika semua check PASS, sign-off kontrak tersedia, baseline
legacy/public direkam, backup/restore evidence lengkap, dan tidak ada kasus
fakta tidak dapat dibuktikan.
