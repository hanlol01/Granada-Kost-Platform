# Rencana Akses Realisasi Owner pada Portal Property Owner

**Status:** Diimplementasikan pada Owner Portal; menunggu verifikasi visual
dengan akun Owner di lingkungan lokal.

## Tujuan

Property Owner dapat memeriksa progres haknya sendiri dan mengunduh dokumen
realisasi tanpa Admin harus mengirimkan file secara manual melalui WhatsApp.

## Alur yang disepakati

1. Owner membuka dashboard `/property-owners/portal`.
2. Card **Realisasi Owner** menampilkan pilihan bulan yang memiliki data.
3. Owner memilih periode dan menekan **Lihat rincian realisasi**.
4. Jika belum diterbitkan, halaman menampilkan **Progress sementara** dari data
   pembayaran yang sudah diverifikasi dan kontrak yang sudah layak direalisasi.
5. Jika Admin menerbitkan tetapi belum mencatat transfer, halaman menampilkan
   **Realisasi diterbitkan · Menunggu transfer** dengan transfer `Rp 0`.
6. Jika transfer berhasil dicatat, halaman menampilkan alert pencairan,
   nominal, tanggal, metode, referensi, kuitansi, dan bukti transfer.

## Pembaruan progres

Progres tidak dibuat sebagai dokumen permanen setelah setiap pembayaran. Portal
mengambil snapshot server baru saat halaman dibuka atau ketika Owner menekan
**Perbarui data**. Dengan demikian, kamar yang baru lunas pada tanggal 30 akan
ikut tampil tanpa membuat dokumen-dokumen versi lama yang membingungkan.

## Dokumen

- **Laporan progres sementara:** PDF dan Excel; selalu diberi penanda bahwa
  dokumen bukan laporan setoran final atau bukti transfer.
- **Rincian realisasi diterbitkan:** PDF dan Excel dari snapshot final Admin.
- **Kuitansi per transaksi:** tersedia setelah transfer berhasil dicatat.
- **Bukti transfer:** dapat dilihat/diunduh jika Admin telah mengunggahnya.

Endpoint Owner memakai scope akun terautentikasi. Laporan progres sementara
dibuat dari data server saat diminta, sedangkan periode yang sudah memiliki
realisasi memakai ekspor snapshot Realisasi Owner yang sama dengan Admin.
Kuitansi dan bukti transfer tetap dibaca melalui endpoint Owner-scoped; ID
berkas tidak pernah diterima dari input Owner tanpa verifikasi relasi transfer.

Semua format memakai formatter, kalkulasi, template, dan aturan Rupiah yang
sama dengan dokumen Admin. Tidak dibuat jalur perhitungan Owner yang berbeda.

## Tampilan rekening dan bukti

Card dan detail menampilkan nama bank, nama pemilik rekening, dan empat digit
terakhir rekening. Jika data belum ada, tampilkan **Belum diisi** tanpa
memblokir unduhan. Bukti yang belum ada diberi badge **Bukti digital belum
tersedia**.

## Status koreksi

Pembatalan, koreksi, dan pemulihan tidak menghapus histori. Portal menampilkan
status baru beserta alasan dan waktu perubahan, sedangkan dokumen lama tetap
menjadi bukti historis yang tidak ditimpa.

## Batas akses

Portal hanya boleh membaca Owner Profile yang sedang terautentikasi beserta
asset, kamar, pembayaran, realisasi, payout, kuitansi, dan bukti yang berada
dalam scope tersebut. Portal tidak memiliki aksi mutasi Admin dan tidak
menampilkan catatan internal, checksum, metodologi, nomor rekening lengkap,
atau storage path.

## Kriteria penerimaan tingkat produk

- Owner dapat melihat progres periode berjalan tanpa menunggu penerbitan.
- Jumlah kamar dan hak Owner bertambah setelah pembayaran baru diverifikasi.
- Transfer tetap `Rp 0` sebelum transfer berhasil dicatat.
- Setelah transfer berhasil, alert, kuitansi, nominal, dan bukti yang tersedia
  tampil pada periode yang sama.
- Owner tidak dapat mengakses Owner, asset, dokumen, atau bukti milik pihak lain.
- Dokumen Admin dan Portal konsisten karena berasal dari sumber dan snapshot
  server yang sama.
