# 📋 LAPORAN PROGRESS MINGGUAN

### Granada Kost Platform

**Minggu ke-3** · 28 Juni - 4 Juli 2026

_Dokumen ini merangkum progress pengembangan sistem Granada Kost Platform selama minggu ketiga._
_Disusun untuk pemangku kepentingan dan manajemen Granada._

## Ringkasan Eksekutif

Minggu ketiga dibuka dengan penutupan resmi **Milestone 11**: QA-01 Final Regression dinyatakan **PASS** pada 2 Juli 2026 dan status proyek naik menjadi **Internal Demo Ready**. Setelah itu, fokus bergeser ke tema utama minggu ini: **Fondasi Upload File dan penutupan dua loop operasional yang paling ditunggu** - bukti pembayaran manual dan lampiran foto komplain.

Seluruh milestone M12A sampai M12F selesai pada minggu ini. Penghuni kini dapat mengupload bukti pembayaran manual dan membuat tiket komplain langsung dari aplikasi (dengan atau tanpa foto), dan Admin dapat memeriksa lampiran tersebut secara aman sebelum memverifikasi. Seluruh akses file dimediasi backend - tidak ada file yang dapat diakses publik.

| **Aspek** | **Status** |
| --- | --- |
| QA-01 Final Regression (Milestone 11) | ✅ PASS - Internal Demo Ready |
| Fondasi Backend File API (M12C1) | ✅ Selesai |
| Mesin upload generik frontend (M12C2) | ✅ Selesai |
| Upload bukti pembayaran manual Penghuni (M12C3) | ✅ Selesai |
| Kesiapan lampiran komplain backend (M12C4) | ✅ Selesai |
| Preview file untuk Admin (M12C5) | ✅ Selesai |
| Form buat komplain Penghuni + lampiran (M12D) | ✅ Selesai |
| Penyegaran dokumentasi proyek (M12E/M12F) | ✅ Selesai |
| QA keamanan boundary file lintas-scope (QA-M12G) | ✅ PASS (eksternal via Codex) |

## Fokus Pekerjaan Minggu Ini

### 1. 🗂 Audit Gap dan Pengerasan Placeholder (M12A/M12B)

Sebelum membangun fitur baru, tim mengaudit seluruh kesenjangan antara mockup produk dan implementasi nyata, lalu memastikan setiap fitur yang belum aktif dilindungi label/flag eksplisit sehingga tidak ada alur palsu yang menyesatkan saat demo.

**Status: ✅ SELESAI**

### 2. 📁 Fondasi Backend File API (M12C1)

Sistem kini memiliki layanan file terpusat: upload, metadata, preview/download, dan penghapusan - semuanya melalui backend dengan otorisasi ketat.

- Setiap file tercatat di database utama (PostgreSQL) sebagai sumber kebenaran.
- Validasi ketat di backend: jenis file, isi file asli (bukan sekadar nama), batas ukuran (2 MB gambar / 5 MB PDF), dan pembatasan laju upload.
- Tidak ada tautan file publik. Setiap preview/download diperiksa haknya dan tercatat di audit log.
- Penyimpanan sadar-kapasitas: dirancang untuk server dengan disk terbatas, lengkap dengan kebijakan pembersihan berkala.

**Status: ✅ SELESAI**

### 3. 🧰 Mesin Upload Generik Frontend (M12C2)

Dibangun satu mesin upload yang dapat dipakai ulang untuk seluruh kebutuhan (bukti pembayaran, foto komplain, dan kebutuhan mendatang seperti foto kamar/KTP/STNK) - lengkap dengan kompresi foto otomatis, pratinjau aman, dan tombol fallback WhatsApp bila upload gagal.

**Status: ✅ SELESAI**

### 4. 💳 Upload Bukti Pembayaran Manual Penghuni (M12C3)

Penghuni kini dapat mengirim bukti transfer/QRIS manual dari aplikasi. Penting: ini adalah **jalur manual/fallback** - tagihan **tidak otomatis lunas**. Bukti masuk antrian review dan hanya verifikasi Admin yang dapat menyatakan pembayaran sah. Payment gateway otomatis tetap menjadi milestone mendatang.

**Status: ✅ SELESAI**

### 5. 📎 Kesiapan Lampiran Komplain di Backend (M12C4)

Backend siap menerima lampiran foto pada komplain dengan validasi penuh: file harus milik penghuni yang sama, properti yang sama, dan berjenis foto komplain. Penyimpanan dilakukan secara transaksional sehingga tidak ada data setengah jadi.

**Status: ✅ SELESAI**

### 6. 🔍 Preview File untuk Admin (M12C5)

Admin dapat melihat lampiran bukti pembayaran dan foto komplain langsung dari halaman review - thumbnail, tampilan penuh, dan tombol verifikasi/tolak dalam satu dialog. Semua akses melalui jalur terotorisasi backend.

**Status: ✅ SELESAI**

### 7. 📝 Form Buat Komplain Penghuni + Lampiran (M12D)

Penghuni kini dapat membuat tiket komplain langsung dari aplikasi: memilih kategori, menulis judul dan deskripsi, menentukan lokasi (kamar sendiri atau area umum), dan melampirkan hingga 5 foto secara opsional. Lampiran bersifat opsional; foto membantu memperjelas laporan; komplain akan diperiksa dan ditangani pengelola/admin.

**Status: ✅ SELESAI**

### 8. 📚 Penyegaran Dokumentasi Proyek (M12E/M12F)

Seluruh dokumen tingkat proyek diselaraskan dengan kondisi nyata repository: roadmap, changelog, health review, checklist demo internal, indeks dokumentasi, project master, backlog, dan perencanaan API (termasuk status endpoint file yang sudah shipped).

**Status: ✅ SELESAI**

### 9. 🔐 QA Keamanan Boundary File Lintas-Scope (QA-M12G)

Verifikasi keamanan menyeluruh terhadap batas akses file dijalankan **eksternal via Codex GPT-5.5 High** terhadap API yang berjalan, dengan verdict **PASS**. Ini adalah pekerjaan verifikasi/QA - tidak ada pengembangan fitur baru.

Hasil ringkas:

- Boundary autentikasi: akses metadata/content file tanpa login ditolak (401).
- Resident self-scope: penghuni dapat mengakses file miliknya sendiri (200), dan ditolak saat mengakses file penghuni lain (403).
- Boundary lintas-properti: admin/property owner yang ter-scope ditolak mengakses file properti lain (403).
- Penolakan attach: file milik resident lain (400), file dengan purpose salah (400), file yang sudah dihapus (400); content file terhapus (404).
- Tidak ada `storage_path` dan tidak ada URL file publik pada respons; akses konten hanya via `GET /api/v1/files/:fileId/content`.
- Pemeriksaan database: 0 baris orphan/invalid pada tabel komplain, lampiran komplain, bukti pembayaran, dan lampiran bukti pembayaran.
- Tidak ada error 500 tak terduga. Tidak ada temuan (issues: none).

Detail lengkap dan keterbatasan uji tercatat di `INTERNAL_DEMO_CHECKLIST.md` Section 12.

**Status: ✅ PASS (QA eksternal Codex)**

## Keputusan Arsitektur yang Dipertahankan

- Backend adalah titik penegakan kebijakan final; validasi di aplikasi hanya untuk kenyamanan pengguna.
- PostgreSQL sebagai sumber kebenaran data; Redis hanya untuk cache/antrian/pembatasan laju.
- Setiap akses data dan file dibatasi per properti; penghuni hanya dapat mengakses miliknya sendiri.
- Tidak ada tautan file publik; seluruh preview file melalui jalur terotorisasi backend.
- Tidak ada upload video dan tidak ada lampiran chat pada fase ini.
- Upload dibatasi dan sadar-kapasitas penyimpanan.

## Ringkasan QA / Validasi (berdasarkan hasil terdokumentasi)

- QA-01 Final Regression (2 Juli 2026): PASS - Admin dan Penghuni Internal Demo Ready.
- M12C1-M12C5: hasil lint/build tercatat PASS pada masing-masing dokumen implementasi di `docs/12-product-readiness/`.
- M12D: validasi lint/typecheck/build dijadwalkan melalui Codex.
- Item demo M12 pada `INTERNAL_DEMO_CHECKLIST.md` Section 12 dicatat sesuai evidensi QA M12C/M12D.
- QA-M12G (eksternal via Codex GPT-5.5 High): PASS - boundary autentikasi, resident self-scope, penolakan lintas-properti, penolakan attach resident/purpose salah dan file terhapus, tanpa `storage_path`/URL publik, 0 baris orphan pada tabel komplain/bukti pembayaran.
- M12E/M12F/M12G adalah milestone dokumentasi - tidak ada QA yang dijalankan oleh agen dokumentasi; QA-M12G dijalankan eksternal oleh Codex.

## Risiko dan Scope yang Ditunda

- Payment gateway / Midtrans: milestone mendatang. Jalur bukti manual bukan penggantinya.
- Receipt/nota: milestone mendatang.
- Smart Lock live Tuya/PALOMA (M10G): menunggu akses fisik perangkat di lokasi.
- CCTV live: menunggu gateway lokal.
- Chat attachment dan video upload: tidak didukung fase ini.
- Reports export dan Audit viewer: menunggu endpoint backend.
- CI/CD, deployment VPS, dan validasi environment produksi belum tersedia/tervalidasi.

## Rencana Minggu Berikutnya

| **#** | **Target** | **Prioritas** |
| --- | --- | --- |
| 1 | Validasi Codex untuk M12D (lint, typecheck, build) | 🔴 Tinggi |
| 2 | QA browser end-to-end surface M12 (kelengkapan visual; boundary keamanan sudah PASS via QA-M12G) | 🟡 Sedang |
| 3 | Backend follow-up `/audit/*` dan `/reports/exports` | 🟡 Sedang |
| 4 | Otomasi cleanup file + monitoring kuota storage | 🟡 Sedang |
| 5 | M10G Smart Lock live saat akses fisik tersedia | 🟡 Sedang (blocker eksternal) |
| 6 | Persiapan CI/CD dan jalur staging | 🟢 Persiapan |

## Kesimpulan

Minggu ketiga menutup Milestone 11 dengan QA PASS dan menyelesaikan seluruh rangkaian M12: fondasi upload file yang aman, alur bukti pembayaran manual end-to-end, dan alur komplain berlampiran end-to-end - tanpa satu pun file yang dapat diakses publik. Dokumentasi proyek kini selaras dengan kondisi nyata repository. Fokus berikutnya adalah validasi dan QA untuk permukaan baru, lalu membuka endpoint audit/export dan menyiapkan integrasi perangkat fisik.

**Granada Kost Platform** · Progress Report W3 · Juli 2026
