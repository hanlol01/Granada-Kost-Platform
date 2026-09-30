# ADR-0006: Konsistensi Rincian dan Kuitansi Realisasi Owner

- **Status:** Accepted
- **Tanggal:** 2026-09-29
- **Ruang lingkup:** Admin Owner Realization, transfer, bukti, PDF, Excel, dan kuitansi

## Keputusan

Halaman Rincian Realisasi Owner dan seluruh dokumen yang dihasilkannya harus
menggunakan sumber data realisasi yang sama. Periode realisasi berasal dari
header realisasi, sedangkan tanggal transfer berasal dari transaksi transfer.
Keduanya tidak boleh saling menggantikan.

Untuk `RLS-HIS-202608-CB50C244` dan `TRF-OWNER-0001`, periode yang benar adalah
**Agustus 2026 · 1–31 Agustus 2026**. Perbedaan Juli pada kuitansi transaksi
tersebut diperlakukan sebagai cacat dokumen yang harus diperbaiki.

## Aturan tampilan Admin

- Informasi aset berada dalam card khusus. Data bangunan yang belum tersedia pada
  catatan lama ditampilkan sebagai informasi, bukan sebagai kolom yang harus
  ditebak atau diisi ulang Admin pada halaman keuangan.
- Nama pemberi konfirmasi Keuangan memakai combobox yang dapat mencari kontak
  tersimpan atau menambahkan kontak baru. Transfer baru menampilkan nama, cara,
  dan waktu konfirmasi.
- Referensi transfer wajib untuk transfer baru dan boleh kosong hanya melalui
  pengecualian transfer historis yang terdokumentasi.
- Bukti transfer, bukti koreksi, dan bukti pengembalian dana berlebih menerima
  maksimal tiga berkas dengan batas 5 MB per berkas. Kompresi gambar tetap aktif.
- Catatan **Bukti digital belum tersedia pada catatan lama** hanya muncul saat
  berkas memang belum ada dan hilang setelah berkas ditambahkan.
- Data rekening pada kuitansi baru berasal dari data Owner saat transfer dicatat.
  Kuitansi lama yang tidak memiliki data rekening tidak boleh diisi secara diam-
  diam dari rekening Owner yang sekarang.
- Kuitansi menampilkan No. Kavling di bawah kamar/penghuni dan menggunakan tanda
  `—` sampai data kamar menyediakan nilainya. Total Kontrak selalu dalam format
  Rupiah.
- Jarak area tanda tangan diperbesar dan nama Pengelola KOSTATION serta Penerima /
  Owner tetap rata tengah.

## Perlakuan dokumen lama

Kuitansi lama tetap disimpan sebagai riwayat. Perbaikan menghasilkan versi
dokumen terbaru dengan nomor transfer/kuitansi yang sama, alasan **Perbaikan
periode realisasi**, dan jejak versi sebelumnya. Unduhan Admin menampilkan versi
terbaru, sementara versi lama tetap tersedia untuk audit.

## Alasan

Aturan ini mencegah Admin membandingkan dua dokumen yang merujuk realisasi sama
tetapi menampilkan periode berbeda. Data keuangan lama juga tetap dapat diaudit
tanpa mengorbankan tampilan dokumen yang benar untuk penggunaan operasional.
