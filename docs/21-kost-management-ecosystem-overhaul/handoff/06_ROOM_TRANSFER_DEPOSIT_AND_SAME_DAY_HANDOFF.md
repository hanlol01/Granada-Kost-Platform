# Pindah kamar: deposit opsional dan perpindahan hari ini

Status: **PERBAIKAN DIIMPLEMENTASIKAN — PENGGUNA TELAH MENGONFIRMASI PERPINDAHAN BERHASIL**

Tanggal keputusan: 1 Oktober 2026.

## 1. Tujuan dan cakupan

Perbaiki kegagalan pindah kamar hari ini dari detail penghuni dan selaraskan
deposit dengan praktik operasional: saat ini belum ada kebijakan deposit wajib.
Kedua pintu masuk, detail penghuni dan detail penyewaan, memakai alur yang sama.

Empat keputusan berikut telah disetujui pengguna. Dokumen ini mencatat keputusan,
bukti diagnosis terisolasi, implementasi, serta batas verifikasi operasional.

## 2. Keputusan yang disetujui

### Q1 — Deposit pada perpindahan saat ini

- Nominal deposit pada tarif/tipe kamar tujuan bukan kewajiban otomatis penghuni.
- Deposit yang benar-benar diterima dibaca dari buku transaksi deposit.
- Jika saldo dan kewajiban deposit kontrak Rp0, perpindahan tidak meminta top-up.
- UI menampilkan `Tidak ada deposit yang tercatat` dan menyembunyikan bagian
  pembayaran selisih deposit pada kondisi tersebut.
- Saldo deposit positif yang sudah diterima tetap dibawa secara utuh dan tercatat
  ke penyewaan tujuan. Perpindahan tidak menghapus, memotong, atau mengembalikannya.
- Nilai deposit pada data tarif lama tidak boleh ditafsirkan sebagai dana diterima.

### Q2 — Kebijakan deposit pada masa depan

- Kebijakan baru berlaku untuk kontrak baru atau perubahan kontrak yang disepakati
  secara eksplisit. Perpindahan tidak mengaktifkan pungutan retroaktif.
- Kewajiban baru harus memiliki nominal kesepakatan, tanggal berlaku, alasan,
  pelaku, dan waktu pencatatan yang dapat ditelusuri.
- Saat selisih positif memang sah dan disepakati, tampilkan deposit tersedia,
  kewajiban tujuan, dan tambahan yang perlu dibayar dalam format Rupiah.
- Pembayaran tambahan merupakan transaksi deposit tersendiri, dengan validasi
  nominal, kewenangan, dan bukti melalui mekanisme pembayaran yang sudah tersedia.
- Pembuatan halaman pengaturan kebijakan deposit baru berada di luar revisi ini.
  Jangan menambah aturan wajib hanya untuk mengantisipasi kebijakan masa depan.

### Q3 — Sewa ketika pindah di tengah siklus tagihan

- Pembayaran dan kewajiban sewa pada siklus berjalan tetap tercatat.
- Tarif kamar tujuan tidak mengubah kontrak otomatis. Jika diperlukan perubahan
  tarif, perubahan komersial harus disepakati terpisah dan baru berlaku pada siklus
  berikutnya. Ringkasan menunjukkan tarif kontrak yang dipertahankan dan tanggal
  tagihan berikutnya; tanggal tersebut bukan persetujuan tarif baru.
- Selisih sewa untuk hari tersisa tidak dibuat otomatis. Jika diperlukan, selisih
  harus dipratinjau dan disetujui sebagai penyesuaian terpisah.
- Masa kontrak tetap berakhir pada tanggal kontraktual yang telah disepakati.
- Perubahan tarif yang sah memakai amendment atau penyewaan penerus sesuai
  `DEC-LEASE-004` dan ADR 0001. Pembayaran, periode layanan, nilai historis, dan
  dokumen lama tidak ditulis ulang atau dihitung dua kali.

### Q4 — Alasan perpindahan

- Pertahankan pilihan `Alasan pindah kamar` dan `Detail alasan (opsional)`.
- Ubah label `Alasan pengecualian hari yang sama` menjadi
  `Alasan diproses hari ini`.
- Jelaskan perbedaannya: alasan pindah menjelaskan mengapa kamar berubah;
  alasan diproses hari ini menjelaskan mengapa tidak menunggu tanggal tagihan.
- Jalur hari ini tetap menyimpan alasan pengecualian wajib pada audit server.
- Dialog konfirmasi merangkum kamar lama/tujuan, tanggal efektif, akhir kontrak,
  dampak sewa, dan dampak deposit sebelum perintah dijalankan.

## 3. Temuan diagnosis yang sudah dibuktikan

Kasus: penghuni `f0984325-b302-4e07-947e-cc4c9d756d32`.
Permintaan gagal: correlation ID `187dea7a-47bc-45c6-98a5-6c745955a394`,
1 Oktober 2026 pukul 01:24:20.651 UTC.

- Masa kontrak contoh berakhir 1 Juni 2027; hipotesis kontrak kedaluwarsa tidak
  menjelaskan kegagalan ini.
- Kewajiban deposit kontrak Rp0 dan buku deposit belum memiliki transaksi,
  tetapi nilai deposit pada snapshot tarif lama Rp1.850.000.
- Pemeriksaan baca-saja setelah kegagalan tidak menemukan catatan perpindahan
  maupun perintah idempotensi terkait percobaan tersebut.
- `runCutover` berjalan di dalam transaksi dengan rollback ketika exception
  terjadi. Pemeriksaan ini tidak menemukan perpindahan parsial.
- `GlobalExceptionFilter` mengubah exception non-HTTP menjadi respons umum 500;
  respons pengguna tidak memuat penyebab asli. Log lokal yang ditemukan tidak
  mencakup kejadian. Exception percobaan asli tetap tidak tersedia; bukti reproduksi
  sebelum perbaikan dicatat pada bagian 8, bukan diklaim sebagai log kejadian asli.
- Kamar tujuan dan payload lengkap percobaan belum tersedia. Informasi itu
  membantu pencocokan kasus asli, tetapi pengujian terisolasi tetap dapat dilakukan.

## 4. Urutan implementasi

### A — Buktikan dan perbaiki kegagalan eksekusi

1. Tangkap exception asli dengan correlation ID, route, dan kode/constraint
   database bila tersedia. Jangan mencatat kredensial, bukti, atau payload pribadi.
2. Reproduksi pada database uji terisolasi dengan skema dan bentuk data kontrak
   yang sesuai. Jangan mengulang perintah mutasi pada penghuni contoh hanya untuk
   menemukan exception.
3. Tulis pengujian perilaku yang membuktikan kegagalan sebelum perbaikan.
4. Perbaiki penyebab yang terbukti dan berikan pesan operasional untuk konflik
   yang dapat ditangani Admin.
5. Verifikasi kegagalan tidak mengubah kamar, okupansi, kontrak, deposit,
   pembayaran, audit, atau idempotensi; percobaan ulang tidak menggandakan hasil.

### B — Selaraskan deposit pada preview dan eksekusi

1. Gunakan satu resolver deposit kontraktual pada preview, schedule, dan cutover.
2. Bedakan saldo dana diterima, kewajiban kontrak yang disepakati, dan referensi
   tarif lama. Preview dan commit harus menghitung dari otoritas yang sama.
3. Perpindahan tanpa deposit sah tidak memerlukan input pembayaran atau izin
   pencatatan pembayaran tambahan.
4. Pertahankan carry-forward dan riwayat saldo deposit yang memang ada.

### C — Lengkapi ringkasan sewa dan alasan

1. Tampilkan tarif kontrak saat ini dan tanggal tagihan berikutnya. Jangan menjadikan
   tarif referensi kamar sebagai amendment otomatis tanpa kesepakatan komersial.
2. Pertahankan kontrak dan keterkaitan pembayaran siklus berjalan; periksa konsumen
   billing, dokumen, laporan, dan realisasi Owner.
3. Perbarui keterangan deposit, label alasan, konfirmasi, dan hasil perpindahan.
4. Pertahankan kamar lama pada status perlu inspeksi dan kamar tujuan terisi.

## 5. Kandidat file dan batas perubahan

- `backend/api/src/modules/lease/lease-transfer.service.ts`
- `backend/api/src/modules/lease/lease.repository.ts` jika akar kegagalan menuntutnya
- Helper otoritas kontrak/deposit yang sudah ada, setelah inspeksi ulang
- Filter/logging exception bila diperlukan untuk memperoleh bukti server
- DTO transfer, API client, dan tipe Admin hanya bila kontrak respons perlu diperluas
- `apps/admin/src/components/leases/TransferPanel.tsx`
- Pengujian perilaku transfer pada `backend/api/test/kmo-w07/`
- Konsumen kontrak yang terbukti membutuhkan penyesuaian pada tahap C

Rencana awal tidak mencakup migration. Kebutuhan migration 113 kemudian dijelaskan
sebelum implementasi: batas unik transfer per penyewaan menghalangi lebih dari satu
perpindahan fisik di bawah kontrak yang sama. Migration hanya mengganti dua batas
unik tersebut dengan indeks nonunik; tidak mengubah data historis atau batas unik
okupansi aktif. Tidak ada backfill nilai deposit, tarif, atau pembayaran.
Hunian Tanggungan Owner tetap mengikuti batas dukungan yang sudah terdokumentasi.

## 6. Kriteria verifikasi

- Pindah hari ini dan pindah terjadwal memakai aturan deposit yang sama.
- Kontrak tanpa deposit dapat berpindah meski referensi tarif lama berisi deposit.
- Deposit yang sudah diterima dibawa utuh; tidak tercampur DP atau pembayaran sewa.
- Tambahan deposit hanya muncul dari kewajiban yang sah dan disepakati.
- Tagihan/pembayaran siklus berjalan tidak terhapus, dialokasikan ulang diam-diam,
   atau digandakan. Tarif tidak berubah otomatis tanpa kesepakatan terpisah.
- Masa kontrak, histori kamar, dokumen, dan nilai keuangan lintas akses konsisten.
- Konflik kamar tujuan, permintaan ganda, serta kegagalan di tengah cutover
  meninggalkan keadaan yang utuh dan pesan yang dapat ditindaklanjuti.
- Ringkasan dan dialog konfirmasi menampilkan nominal Rupiah serta tanggal lengkap.
- Pengujian mencakup tarif sama/berbeda, deposit nol/positif, pembayaran
  sebagian/lunas, saldo terutang, jalur hari ini/terjadwal, dan retry idempotensi.
- Build dan typecheck API/Admin serta pengujian yang relevan lulus.

## 7. Referensi

- [Canonical context](../CONTEXT.md)
- [Policy glossary](../OWNER_POLICY_DECISIONS_AND_GLOSSARY.md): POL-PAYMENT-002,
  POL-PAYMENT-004, DEC-LEASE-003, dan DEC-LEASE-004.
- [Room transfer lifecycle](../DOMAIN_LIFECYCLE_CONTRACTS.md#15-room-transfer-lifecycle)
- [Commercial agreement authority](../../adr/0001-custom-lease-agreement-authority.md)

## 8. Bukti implementasi dan verifikasi — 1 Oktober 2026

### Penyebab yang direproduksi sebelum perbaikan

Pengujian opt-in menyalin database lokal ke cluster PostgreSQL sementara, kemudian
menjalankan service sebenarnya tanpa memindahkan penghuni pada database sumber.
Preview lama meminta deposit Rp1.900.000 dari tarif tujuan, meskipun kewajiban
kontraktual dan saldo deposit penghuni Rp0. Eksekusi lama gagal dengan SQLSTATE
`23514`, constraint `W06_PAYMENT_ALLOCATION_SCOPE_MISMATCH`: pembayaran deposit
ditulis ke alokasi invoice tanpa invoice. Trigger integritas tidak dilonggarkan.

### Perubahan

- Preview, penjadwalan, dan eksekusi memakai kewajiban deposit kontrak yang sama.
- Perpindahan fisik mencatat perubahan kamar pada penyewaan yang sama sesuai
  DEC-LEASE-004; tidak menutup kontrak atau membuat penerus komersial yang tidak lengkap.
- Masa kontrak, harga, pembayaran, alokasi, dan invoice kontrak dipertahankan.
- Deposit yang telah diterima tetap pada buku penyewaan yang sama, tanpa debit/kredit
  carry-forward sintetis. Tambahan yang sah masuk ke pembayaran dan buku deposit,
  bukan alokasi invoice sewa.
- Transfer bank untuk tambahan deposit memerlukan bukti dengan validasi properti,
  pengunggah, kategori, jenis file, dan ukuran maksimal 5 MB pada backend.
- Eksekusi di luar masa kontrak atau saat masih ada jadwal aktif ditolak dengan
  pesan operasional. Idempotensi dan rollback tetap berlaku.
- UI menyembunyikan pembayaran deposit pada kewajiban Rp0, memperjelas alasan hari
  ini, dan merangkum kamar, tanggal, akhir kontrak, sewa, deposit, serta tunggakan.
- UI menolak preview API lama dengan pesan perlu memuat ulang API, bukan menampilkan
  angka tidak valid atau mengizinkan commit dengan aturan lama.
- Log kegagalan hanya memuat correlation ID, SQLSTATE, dan nama constraint tervalidasi.
- Realisasi Owner, pencocokan kontrak historis, daftar tidak layak, serta progres
  pembayaran Owner memakai kamar keuangan kontrak awal, bukan kamar okupansi baru,
  untuk kontrak penuh yang mengalami addendum fisik. Referensi ini berasal dari
  perpindahan pertama pada kontrak yang sama; kontrak penerus lama tetap memakai
  kamarnya sendiri. Perpindahan berulang tidak mengalihkan nilai kontrak ke Owner tujuan.
- Respons preview yang terlambat tidak dapat menimpa pilihan kamar/metode yang lebih
  baru; tinjauan ulang menutup konfirmasi dan mengosongkan ringkasan lama.

### Hasil pemeriksaan

- 54 pengujian perilaku dan kontrak backend lulus, tanpa kegagalan.
- Typecheck API dan Admin lulus; build API dan Admin lulus.
- Replay PostgreSQL terisolasi membuktikan deposit nol dapat berpindah, data finansial
  dan kontrak tidak berubah, retry tidak menggandakan transfer, bukti yang tidak ada
  menyebabkan rollback utuh, dan retry dengan pembayaran sah berhasil.
- Dua perpindahan di bawah kontrak yang sama berhasil pada replay terisolasi.
- SQL referensi kamar keuangan diuji pada PostgreSQL sesudah perpindahan pertama dan
  kedua: tetap menunjuk kamar kontrak awal walaupun okupansi berpindah.
- Migration 113 diterapkan melalui runner resmi pada database lokal; jumlah seluruh
  catatan perpindahan historis tetap sama. Tidak ada perubahan database production.
- Pemeriksaan browser membuktikan form menampilkan penanda kompatibilitas karena
  proses API lokal masih versi lama. Tidak ada perpindahan penghuni yang disubmit
  pada data lokal sumber melalui browser.
- Pengujian statis frontend melalui tsx belum dijalankan: executable esbuild diblokir
  Windows App Control. Proteksi tidak dilewati; typecheck dan build menggunakan jalur
  toolchain yang diizinkan tetap lulus.
- Lint service/DTO pindah kamar dan file Admin terkait lulus. Lint tambahan file
  realisasi Owner menemukan tiga masalah di kode lama yang tidak disentuh revisi ini
  (`no-unsafe-return` dua kali dan `await-thenable`); tidak diklaim lulus lint seluruh proyek.
- Output kompilasi pengujian berada di `backend/api/.room-transfer-test-run/` dan
  diabaikan Git. Folder sumber pengujian dan migration tetap dilacak seperti biasa.

### Batas dan langkah uji berikutnya

Restart API lokal agar memuat build baru, refresh Admin, lalu tinjau ulang perpindahan.
Uji visual jalur sukses dan dialog konfirmasi dengan API baru masih perlu dilakukan.
Deployment lingkungan lain harus menjalankan migration resmi sebelum memuat API baru.
Revisi ini tidak membuat modul amendment tarif/kebijakan deposit baru: tarif kontrak
tetap berlaku sampai perubahan komersial disepakati melalui alur terpisah. Tidak
ada kenaikan otomatis ke tarif referensi kamar tujuan saat tanggal tagihan berikutnya.

## 9. Uji pengguna dan kebutuhan lanjutan — 1 Oktober 2026

Pengguna mengonfirmasi perpindahan penghuni contoh dari RK-06-03 ke RK-06-06
berhasil. Kamar asal tampil sebagai `inspection_required` (Perlu Pemeriksaan).
Pengguna meminta ringkasan hasil menyebut kedua kamar, tombol penutup yang sesuai,
alur inspeksi yang dapat diselesaikan dari inventori kamar, dan riwayat aktivitas
kamar yang membedakan perpindahan dari check-out. Ketiga rekomendasi berikut
telah disetujui pengguna untuk langsung diimplementasikan.

Temuan source untuk wawancara berikutnya: API Admin `POST /rooms/:roomId/inspection-resolution`
sudah menyediakan hasil lulus → kosong dan tidak lulus → perawatan, serta menolak
kamar yang masih dihuni. Aksinya belum dipasang pada UI kamar. Aktivitas kamar
belum membaca `room_transfer_records`; event perpindahan pada `occupancy_history`
belum diterjemahkan, sedangkan riwayat penyewaan masih digabung lewat kamar
kontrak terkini sehingga dapat salah melekat setelah addendum fisik. Event
check-out ditampilkan umum tanpa nama penghuni atau tahap penyelesaian. Data
sumber tersebut harus dipakai untuk merancang proyeksi aktivitas, bukan membuat
catatan aktivitas yang dapat diedit terpisah.

## 10. Pemeriksaan dan aktivitas setelah perpindahan — keputusan dan implementasi

- Q1: pemeriksaan yang sama untuk kamar setelah pindah atau check-out. Tombol
  `Periksa kamar` muncul pada detail kamar berstatus `Perlu Pemeriksaan` untuk
  Admin dengan izin pengelolaan kamar. Hasil `Siap digunakan` menjadi `Kosong`;
  `Perlu perbaikan` menjadi `Perawatan`. Alasan perbaikan wajib di UI dan API.
  Catatan lulus opsional. Tidak menambah kewajiban upload atau checklist baru.
- Perintah memakai endpoint inspeksi yang sudah ada beserta transaksi, audit,
  idempotensi, dan larangan pemeriksaan ketika okupansi masih aktif. Setelah
  berhasil, daftar kamar, detail, ketersediaan, dan data properti terkait diperbarui.
- Q2: satu catatan perpindahan dibaca pada kedua kamar yang terlibat. Nama penghuni,
  kamar asal/tujuan, dan waktu WIB ditampilkan; tidak mengikuti kamar terkini
  penyewaan untuk menentukan lokasi perpindahan. Riwayat perpindahan dari sumber
  okupansi/penyewaan tidak digandakan dengan catatan perpindahan tersebut.
- Q3: `Penghuni check-out` menunjukkan serah-terima fisik. `Penyelesaian check-out
  selesai` muncul hanya setelah penyelesaian akhir ditetapkan dan keuangan tertutup:
  tanpa kewajiban, refund selesai/dilepas, atau tagihan akhir terbayar. Refund
  tertunda/dibalik dan tagihan yang masih bersaldo tidak disebut selesai. Tanggal
  penyelesaian mengikuti waktu pembayaran terverifikasi/refund bila lebih akhir.
- Hasil perpindahan menyebut kamar asal dan tujuan. Pada detail penghuni dan
  penyewaan, tombol setelah sukses berubah menjadi `Tutup Perpindahan Kamar`.
- Aktivitas inspeksi menampilkan hasil serta catatan operasional yang dipilih
  dari peristiwa domain; proyeksi tidak membocorkan seluruh payload audit.

Verifikasi lokal: SQL PostgreSQL baca-saja membuktikan perpindahan RK-06-03 ke
RK-06-06 tampil pada kedua kamar, sedangkan RK-06-07 hanya memiliki perpindahannya
sendiri. Tujuh kamar dengan checkout lama juga dapat dibaca. Dua belas skenario
CTE PostgreSQL memeriksa sumber/tujuan, duplikasi, refund tertunda/selesai/dibalik,
pembayaran sebagian/lunas, serta pembalikan pembayaran, tanpa mengubah data.
Dialog browser telah diperiksa untuk kedua hasil; alasan kosong memblokir hasil
perbaikan. Tidak ada hasil inspeksi yang disubmit pada inventori lokal pengguna.

Verifikasi regresi: 68 pengujian backend perilaku/kontrak lulus. Typecheck produksi
API dan Admin, build API dan Admin, serta lint file produksi yang disentuh lulus.
Pengujian frontend melalui tsx tetap terhalang executable esbuild yang diblokir
Windows; tidak diklaim lulus dan proteksi tidak dilewati. Typecheck seluruh test
API masih memiliki error lama di luar cakupan; kompilasi suite terarah lulus.
Kartu hasil pindah tetap tampil walaupun pemuatan ulang pilihan kamar gagal.

API yang sedang berjalan perlu dimuat ulang setelah build untuk memakai proyeksi
baru. Tidak ada migration baru dalam revisi pemeriksaan/aktivitas ini.
