# Handoff 07: Pengaturan akun Owner dan riwayat koreksi penyewaan

Status: `IMPLEMENTED LOCALLY — AUTOMATED VERIFICATION COMPLETE; LIVE ACCOUNT TEST PENDING`

Keputusan wawancara dan perintah eksekusi disetujui pada 2 Oktober 2026.
Implementasi lokal mengikuti keputusan berikut tanpa deployment atau perubahan
kredensial akun pengguna selama pengujian.

## 1. Hasil yang disepakati

1. Owner membuka Pengaturan akun melalui menu profil di portal.
2. Owner mengganti email login langsung tanpa OTP, tautan verifikasi, atau tahap
   email menunggu persetujuan. Pergantian password memerlukan password lama.
3. Nama resmi Owner, nomor telepon, rekening, kepemilikan, dan status profil tetap
   dikelola Admin. Halaman pengaturan menampilkan informasi tersebut hanya sesuai
   izin baca portal yang sudah ada; nomor rekening tetap tersamarkan.
4. Admin menemukan penghuni yang pernah dikoreksi melalui filter di `/tenants`
   dan membaca riwayat lengkap pada detail penghuni.
5. Aktivitas kamar menampilkan jejak koreksi ringkas dengan tautan ke detail
   penghuni untuk membaca catatan lengkap.

## 2. Pengaturan akun Owner

Gunakan halaman Profil Akun yang sudah ada di `/property-owners/portal/account`
sebagai halaman Pengaturan akun. Tambahkan tautan Pengaturan akun pada menu
profil Owner; jangan membuat halaman pengaturan duplikat atau membuka
Pengaturan Umum perusahaan kepada Owner.

### Informasi akun

- Nama Owner dan nomor telepon ditampilkan sebagai informasi baca.
- Jelaskan bahwa perubahan nama resmi dan data rekening dilakukan oleh Pengelola.
- Email aktif ditampilkan pada formulir perubahan email.
- Formulir perubahan email dan password terpisah, dengan status simpan dan pesan
  kesalahan yang terhubung ke field masing-masing.
- Gunakan komponen aplikasi yang tersedia, termasuk tombol tampil/sembunyikan
  password, keadaan memuat, dan tampilan mobile serta mode gelap.

### Ganti email

- Field: Email baru dan Password saat ini. Konfirmasi password saat ini tetap
  mengikuti rekomendasi awal; keputusan terbaru menghapus verifikasi email.
- Email dinormalisasi dan divalidasi; alamat yang sudah digunakan akun lain
  ditolak dengan pesan Bahasa Indonesia. Email yang sama tidak membuat audit
  perubahan baru.
- Identitas akun diambil dari autentikasi; Owner hanya dapat memperbarui akun
  dan profil miliknya sendiri.
- Perubahan email pada akun login dan profil Owner disimpan dalam satu transaksi
  agar halaman Admin, portal, dan identitas login konsisten.
- Email baru langsung aktif saat berhasil disimpan. Tidak ada email verifikasi,
  pengiriman OTP, atau ketergantungan layanan email dalam cakupan ini.
- Catat pelaku, waktu, email lama dan baru dalam audit terbatas; password tidak
  disimpan dalam audit atau log.
- Setelah berhasil, cabut seluruh sesi dan arahkan ke login dengan pesan bahwa
  email sudah diperbarui. Owner masuk kembali memakai email baru atau nomor
  telepon yang sudah terdaftar. Jangan tampilkan keberhasilan jika transaksi gagal.
- Kesalahan ketik email dapat dipulihkan melalui login nomor telepon atau bantuan
  Admin. Keputusan langsung tanpa verifikasi adalah pilihan produk pengguna;
  sistem tidak membuktikan kepemilikan kotak masuk email baru.

### Ganti password

- Field: Password lama, Password baru, Konfirmasi password baru.
- Gunakan aturan password server yang sudah ada, termasuk minimal 12 karakter.
- Validasi password lama di server dan kecocokan konfirmasi pada formulir.
- Pakai `PATCH /auth/password` yang sudah tersedia; jangan membuat otoritas
  password kedua untuk Owner.
- Setelah sukses, seluruh sesi dicabut dan Owner kembali ke login. Pesan UI
  harus menjelaskan bahwa Owner perlu masuk memakai password baru.
- Reset password oleh Admin tetap menjadi jalur pemulihan akun.

## 3. Filter dan penanda di Data Penghuni & Penyewaan

Tambahkan filter Riwayat koreksi penyewaan:

- Semua data (default).
- Pernah dikoreksi.
- Belum pernah dikoreksi.

Makna Pernah dikoreksi adalah ada minimal satu koreksi tersimpan pada salah satu
kontrak milik penghuni, termasuk kontrak lama. Preview atau percobaan simpan
gagal tidak dihitung. Penghuni yang diperpanjang atau check-out tetap mempunyai
riwayat yang dapat ditemukan.

Filter mengikuti pola otomatis dan URL-backed `/tenants` yang sudah berlaku,
reset offset saat berubah, serta selaras antara hasil tabel dan jumlah total.
Gabungkan dengan filter lain memakai irisan hasil. Hindari penggandaan baris
penghuni ketika satu penghuni mempunyai beberapa koreksi/kontrak.

Tampilkan badge informasi `Riwayat koreksi · 2 kali` pada identitas penghuni yang
memiliki koreksi, konsisten pada tabel desktop dan kartu mobile. Badge memakai
komponen status standar dan tidak menggantikan status penghuni, pembayaran,
pelunasan, atau check-out. Data tanpa koreksi tidak memerlukan badge.

## 4. Riwayat pada detail penghuni

Tambahkan card baca Riwayat koreksi penyewaan di luar dialog koreksi. Akses
riwayat tidak tergantung apakah Admin saat ini boleh membuat koreksi baru.
Kontrak yang sudah berakhir atau check-out tetap dapat dibaca oleh Admin yang
berwenang.

Tampilkan seluruh kontrak penghuni dengan urutan waktu koreksi terbaru dahulu;
gunakan urutan koreksi sebagai pembeda ketika waktunya sama. Setiap catatan
menampilkan:

- Kontrak/kamar terkait dan nomor urutan koreksi pada kontrak tersebut.
- Waktu pencatatan dan nama Admin pencatat.
- Jenis koreksi dan alasan lengkap.
- Nilai sebelum dan sesudah sesuai fakta yang tersimpan: tanggal check-in,
  tanggal mulai/akhir, durasi, tarif, dan nilai kontrak yang tersedia.
- Dampak keuangan: tambahan kewajiban, kredit koreksi, atau tidak ada perubahan.
  Semua nominal menggunakan Rupiah dan tanggal memakai format aplikasi.

Jangan mengisi nilai historis yang hilang dengan nilai kontrak terbaru atau
tanggal hari ini. Tampilkan `—` untuk fakta yang memang tidak tersedia. Bila nama
pencatat lama tidak dapat dibaca, gunakan keterangan Pencatat tidak tersedia,
tanpa menampilkan UUID sebagai nama. Detail riwayat bersifat baca dan tidak
menawarkan ubah/hapus catatan lama.

Tampilan sebelum/sesudah berdampingan pada desktop dan bertumpuk pada mobile.
Sediakan keadaan memuat, gagal dengan Coba lagi, dan kosong yang jelas.

## 5. Aktivitas kamar

Gunakan peristiwa `lease_data_corrected` yang sudah dicatat; jangan membuat
peristiwa duplikat saat riwayat dibaca. Label operasional:

`Data penyewaan dikoreksi · {nama penghuni}`

Tampilkan waktu, kontrak terkait bila tersedia, dan tautan ke detail penghuni.
Jejak hanya tampil pada kamar yang terkait dengan catatan kontrak/peristiwa;
jangan mengatribusikan koreksi kontrak lama ke kamar tujuan penghuni saat ini.
Alasan lengkap dan rincian uang tetap berada pada riwayat koreksi Admin.

## 6. Temuan kode sebagai titik awal implementasi

- Menu profil: `apps/admin/src/components/layout/user-menu.tsx`.
- Route akun Owner: `apps/admin/src/routes/property-owners/portal/account.tsx`;
  bagian akun berada di `components/property-owner-portal/PropertyOwnerPortal.tsx`.
- Ganti password: controller/service pada `backend/api/src/modules/auth`.
- Pembaruan profil Admin sudah menyelaraskan users/profil di
  `modules/property-owner-management/property-owner-management.service.ts`;
  gunakan aturan validasinya tanpa memberikan endpoint Admin kepada Owner.
- Koreksi tersimpan di `lease_data_corrections`; pembaca saat ini adalah
  `GET /leases/:leaseId/data-corrections` pada modul lease. Respons belum memuat
  nama Admin dan perlu proyeksi baca yang mencakup seluruh kontrak penghuni.
- Dialog `LeaseDataCorrectionDialog.tsx` menampilkan sebagian riwayat; pakai
  kembali parser/komponen yang relevan untuk card detail.
- Filter list/count: modul resident serta `apps/admin/src/routes/tenants.tsx`.
- Aktivitas kamar sudah membaca lease history melalui `room-activity.sql.ts`,
  tetapi label koreksi belum dipetakan di `admin-ux-room-detail.service.ts`.

Temuan berasal dari pemeriksaan source pada sesi wawancara. Graph KOSTATION
belum tersedia pada server MCP; periksa kembali source yang berubah saat eksekusi.

## 7. Batas domain dan verifikasi

ADR 0003 tetap berlaku: koreksi append-only, before/after dan dampak disimpan,
pembayaran/dokumen lama dipertahankan, dan pengaman command koreksi tetap berlaku.
Perubahan sesi ini menambahkan akses baca riwayat, bukan memperluas kondisi
Admin boleh melakukan koreksi.

Kriteria penerimaan implementasi:

1. Owner hanya mengubah email/password akun sendiri; akun lain ditolak server.
2. Email tidak valid/duplikat dan password lama salah tidak mengubah data.
3. Pergantian email menyelaraskan akun/profil secara atomik, langsung berlaku,
   tanpa verifikasi email; sesi lama tidak dapat dipakai kembali.
4. Password berubah melalui API yang sudah ada, seluruh sesi dicabut, dan UI
   mengarahkan login dengan pesan yang tepat.
5. Penghuni dengan koreksi pada kontrak lama tetap ditemukan; total dan paginasi
   filter benar tanpa baris duplikat; reset filter bekerja.
6. Riwayat memuat alasan, pencatat, before/after dan dampak Rupiah; check-out atau
   blokir koreksi baru tidak menghilangkan akses baca.
7. Aktivitas kamar menampilkan koreksi sekali pada kamar terkait; tidak muncul
   pada kamar lain akibat perpindahan penghuni.
8. Mobile, desktop, mode gelap, keyboard, pesan error dan loading diperiksa;
   API/Admin typecheck, build dan pengujian perilaku yang relevan lulus.

## 8. Catatan implementasi dan hasil uji lokal

- `PATCH /auth/owner-email` hanya menerima akun terautentikasi dengan peran
  `property_owner`; email akun/profil, audit, dan pencabutan sesi berada dalam
  transaksi yang sama. Konflik email, password salah dan kegagalan audit diuji.
- `PATCH /auth/password` tetap otoritas password yang sudah ada; kedua endpoint
  menghapus cookie refresh setelah perubahan berhasil. Guard menolak access
  token dengan sesi dicabut meskipun tanda tangan token masih valid.
- Pengaturan akun memakai route portal yang sudah ada, dengan email/password
  sebagai form terpisah dan informasi operasional hanya baca.
- Filter baru `correction_history=ever|never` memakai EXISTS, sedangkan jumlah
  koreksi dihitung pada seluruh kontrak. Proyeksi list/count, batas properti,
  pagination, kontrak berakhir, dan deduplikasi diuji langsung di PostgreSQL
  memakai transaksi READ ONLY, tanpa mengubah catatan pengguna.
- `GET /leases/residents/:residentId/data-corrections?property_id=...` adalah
  akses baca khusus Admin dengan `lease.read`. Card detail menampilkan before,
  after, alasan, pelaku, waktu, dan dampak sesuai catatan tersimpan.
- Aktivitas kamar menampilkan label koreksi dan tautan detail penghuni; atribusi
  tetap kamar asal sebelum perpindahan. Cache list, riwayat dan detail kamar
  di-invalidasi setelah koreksi berhasil.
- Build API dan Admin serta typecheck Admin lulus. ESLint source yang disentuh
  tidak memiliki error; dua warning fast-refresh pada helper route lama tetap ada.
- 13 tes perilaku API dan 12 skenario SQL aktivitas kamar lulus. 21 tes
  parser/form/regresi Admin lulus. Tes parser Admin mencakup
  count baru/kompatibilitas respons lama, scope dan tautan aktivitas yang aman;
  fixture lama diselaraskan dengan field kamar dan badge standar saat ini.
- Runner `tsx` lokal terhambat `esbuild spawn UNKNOWN`; pengujian parser/form
  dijalankan memakai loader sementara berbasis TypeScript yang sudah terpasang,
  bukan mengubah dependency atau konfigurasi produksi.

Batas verifikasi: pilihan filter terlihat di browser Admin. Belum dilakukan
pergantian kredensial melalui UI akun Owner, login ulang dengan kredensial baru,
atau pengujian visual lengkap Owner mobile/dark mode. Uji credential memakai
akun terisolasi/mocks; akun Owner pengguna tidak diubah.

Tidak diperlukan migration baru. Proses API lokal yang menjalankan
`node dist/main.js` perlu direstart oleh pengguna agar endpoint baru aktif;
proses berjalan tidak dihentikan. Tidak ada commit, push, atau deployment.
