# Rencana standardisasi badge status

Status: rencana untuk ditinjau; belum mengubah komponen aplikasi.

## Tujuan dan acuan

Tampilan `BookingLeadStatusBadge` di `apps/admin/src/components/booking-leads/BookingLeadStatusBadge.tsx` menjadi acuan visual: kapsul dengan border halus, latar lembut, teks tegas, ikon kecil, dan label operasional yang tetap terbaca di mode terang maupun gelap. Kesamaan visual tidak berarti semua status diberi warna yang sama. Arti status di masing-masing alur harus dipertahankan.

Sasaran mencakup status dan label berbentuk badge pada aplikasi Admin, portal Owner (di dalam aplikasi Admin), dan aplikasi Penghuni. Tombol, filter interaktif, indikator angka, dan label kategori tetap dibedakan secara semantik meski dapat memakai bentuk kapsul yang serasi.

## Temuan audit

- `apps/admin/src/components/ui/badge.tsx` dan `apps/penghuni/src/components/ui/badge.tsx` masih berupa primitif `Badge` dengan empat varian umum dan bentuk `rounded-md`; komponen acuan Booking Leads berdiri sendiri. Mengubah gaya dasar `Badge` secara global berisiko mengubah chip metadata, label kategori, serta komponen interaktif tanpa pemeriksaan konteks.
- Status dibuat secara lokal dengan pola yang berbeda pada daftar penghuni, kamar, penyewaan, pembayaran, realisasi Owner, portal Owner, kendaraan, notifikasi, log aktivitas, tagihan Penghuni, dan keluhan Penghuni. Beberapa sudah berkapsul, tetapi ukuran, border, ikon, tipografi, dan warna belum seragam.
- Portal Owner di `PropertyOwnerPortal.tsx` dan `PropertyOwnerAssetDetailPage.tsx` menganggap status yang tidak termasuk daftar *warning* atau *muted* sebagai hijau. Status baru/tidak dikenal dapat tampak seolah sudah berhasil; ini perlu diperbaiki ketika migrasi.
- Satu entitas dapat memiliki beberapa status independen. Contohnya laporan Owner memiliki status pemeriksaan, penerbitan, dan pembayaran. Ketiganya harus tetap tampil sebagai fakta terpisah, bukan digabung menjadi satu badge.
- Token `info`, `success`, `warning`, dan `destructive` sudah ada pada tema Admin. Tema Penghuni memiliki `success`, `warning`, dan `destructive`, tetapi belum memiliki `info`; standardisasi lintas aplikasi harus melengkapi token yang diperlukan sebelum memakai satu kontrak warna.

## Kontrak komponen yang diusulkan

1. Buat `StatusBadge` semantik di masing-masing aplikasi, dengan satu spesifikasi visual yang sama. Gunakan `BookingLeadStatusBadge` sebagai acuan dimensi: tinggi minimum sekitar 28 px, `rounded-full`, border, `px-2.5 py-1`, teks 12 px/semibold, jarak ikon 6 px, ikon 14 px. `compact` hanya untuk tabel atau mobile yang sempit, tanpa membuat teks sulit dibaca.
2. Properti komponen berbasis `tone` (`neutral`, `info`, `success`, `warning`, `danger`) dan opsional `icon`; komponen tidak menebak tone dari string status. Label dan tone ditentukan oleh peta bertipe di domain terkait. Warna tambahan Booking Leads (misalnya violet untuk negosiasi) tetap dapat dipakai sebagai varian domain yang terdokumentasi, bukan mengubah arti `success` atau `warning`.
3. Susun warna sebagai token semantik tema terang/gelap untuk teks, border, dan latar lembut; hindari penggunaan warna literal `text-*-300` yang hanya cocok untuk satu mode. Periksa kontras teks minimal 4,5:1 dan elemen grafis/status minimal 3:1. Ikon dekoratif diberi `aria-hidden`; label teks tetap menyampaikan arti tanpa mengandalkan warna.
4. Untuk status tak dikenal atau data lama, tampilkan label operasional aman (misalnya “Status tidak diketahui”) dengan tone `neutral`, bukan hijau. Catat nilai mentah hanya pada diagnostik internal; jangan menampilkan kode database ke pengguna.
5. Pertahankan `Badge` primitif untuk metadata non-status sampai tiap pemakaian ditinjau. Jika label kategori perlu diseragamkan, buat `CategoryBadge` yang konsisten bentuknya tetapi netral/berwarna sesuai kategori, terpisah dari `StatusBadge`. Chip filter yang dapat diklik tetap menggunakan semantik tombol dan keadaan fokus/terpilih.

## Peta makna awal

| Makna operasional | Tone dasar | Contoh | Catatan |
| --- | --- | --- | --- |
| Belum ada, draf, arsip, berakhir biasa | `neutral` | Draf, Belum disiapkan, Diarsipkan | Bukan tanda berhasil. |
| Proses berjalan atau telah diterbitkan | `info` | Diproses, Diterbitkan, Terisi | Terisi tidak sama dengan pembayaran selesai. |
| Selesai/valid/siap dengan makna positif | `success` | Lunas, Terverifikasi, Siap digunakan | “Kosong” dapat `success` dalam konteks inventori kamar karena siap dipakai. |
| Menunggu tindakan, sebagian, perlu inspeksi | `warning` | Menunggu verifikasi, Outstanding, Perlu pemeriksaan | Tidak otomatis menjadi `danger` jika masih langkah normal. |
| Gagal, ditolak, terlambat, perlu koreksi mendesak | `danger` | Ditolak, Terlambat, Gagal | “Dibatalkan” perlu dibedakan menurut domain: hasil gagal vs penutupan netral. |

Peta tersebut adalah titik awal, bukan aturan `string` global. Setiap status enum harus dipetakan secara eksplisit dengan `Record<Status, { label, tone, icon? }>` sehingga TypeScript mengingatkan saat ada status baru.

## Cakupan migrasi dan urutan

| Tahap | Area | Lokasi representatif | Fokus pemeriksaan |
| --- | --- | --- | --- |
| 0 | Fondasi | `components/ui/badge.tsx`, tema Admin/Penghuni, komponen acuan Booking Leads | Tambah komponen semantik tanpa mengubah semua `Badge` lama secara otomatis; uji warna, ukuran, aksesibilitas. |
| 1 | Tabel operasional Admin | `routes/tenants.tsx`, `components/rooms/KostTypeInventoryPage.tsx`, `components/leases/LeaseListPage.tsx`, `components/billing/PaymentsWorkspace.tsx` | Peta status eksplisit dan konsistensi kolom status di desktop/mobile. |
| 2 | Keuangan dan Owner | `components/reports/OwnerRealizationWorkspace.tsx`, `OwnerRealizationDetailPage.tsx`, `OwnerSettlementWorkspace.tsx`, `components/property-owners/PropertyOwnerWorkspace.tsx`, `components/property-owner-portal/*` | Status realisasi/penerbitan/transfer tetap terpisah; fallback portal Owner tidak menjadi hijau. |
| 3 | Alur Admin lain | `routes/booking-leads.tsx`, `routes/vehicles.tsx`, `routes/notifications.tsx`, `routes/activity-logs.tsx`, `routes/expenses.tsx`, `routes/complaints.tsx`, `components/leases/TransferPanel.tsx` dan halaman lain yang memakai badge status | Booking Leads tetap referensi; migrasikan pola lokal hanya sesudah makna status dicek. |
| 4 | Aplikasi Penghuni | `routes/_app/billing.tsx`, `routes/_app/complaints.tsx`, `routes/_app/index.tsx`, halaman kamar dan booking lead | Seragam secara visual dengan Admin, tetapi salinan teks serta eksposur status sesuai hak akses Penghuni. |

Sebelum tiap tahap, inventarisasi seluruh pemakaian `Badge`, `*Badge`, `*Pill`, dan kelas kapsul pada area itu; kelompokkan menjadi **status**, **kategori/metadata**, **angka**, atau **kontrol interaktif**. Hanya kelompok status yang dimigrasikan secara langsung. Ini juga menangkap pemakaian yang belum terdaftar pada tabel representatif di atas.

## Kriteria selesai dan pengujian

- Status yang sama memiliki bentuk, tipografi, dan tone konsisten di tabel, detail, modal, serta portal terkait; label tetap Bahasa Indonesia dan sesuai fungsi bisnisnya.
- Seluruh enum status pada area yang dimigrasikan memiliki peta label/tone eksplisit. Status tak dikenal tidak terlihat sebagai sukses dan tidak membocorkan kode mentah.
- Tampilan terang/gelap, layar mobile, label panjang, tabel rapat, dan zoom browser diperiksa; kapsul tidak terpotong atau keluar sel.
- Uji komponen memeriksa label, tone, ikon dekoratif, dan fallback. Uji halaman memeriksa contoh status per domain; pemeriksaan visual mencakup Booking Leads sebagai pembanding.
- Tidak ada perubahan status backend, data tersimpan, izin, atau alur tindakan. Perubahan hanya presentasi dan token tema.

## Batas keputusan

Rencana ini tidak mengartikan “semua badge” sebagai penggantian satu kali melalui CSS global. Pergantian bertahap diperlukan karena kelas badge saat ini dipakai pula untuk kategori, prioritas, periode, dan filter. Implementasi baru dilakukan setelah rencana ini disepakati secara eksplisit.
