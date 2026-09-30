# Form Pengajuan Realisasi Passive Income Investor

## Status

Implemented for the Admin Realisasi Owner workspace.

## Purpose

Admin dapat mengunduh satu dokumen rekapan untuk dikirim ke Finance di luar
sistem sebagai bahan verifikasi atas realisasi yang sudah dicatat. Unduhan ini
tidak membuat atau mengubah Realisasi Owner. Sumber dokumennya adalah baris
Riwayat Realisasi pada periode yang dipilih yang sudah terealisasi atau sudah
diterbitkan untuk Owner.

Form tidak boleh dibuat dari antrean kontrak layak secara langsung. Kontrak
yang sudah disiapkan akan terkunci dari antrean itu, sehingga sumber tersebut
dapat menghasilkan dokumen kosong atau total Rp 0 yang menyesatkan Finance.
Jika belum ada realisasi pada riwayat periode tersebut, sistem menolak unduhan
dengan keterangan yang dapat ditindaklanjuti.

## Format yang disepakati

- Judul: `FORM PENGAJUAN REALISASI PASSIVE INCOME INVESTOR`.
- Periode pada dokumen hanya `Bulan Tahun` (contoh `Agustus 2026`).
- Urutan kolom: `No.`, `Nama Penyewa`, `No. Kamar`, `Nama Pemilik`, `No. Kav.`,
  `Lama Sewa`, `Total Sewa`, `Total Realisasi`, `No. Rekening`, `Bank`, `Atas
  Nama`, `Total Realisasi`.
- Nominal selalu memakai format Rupiah. Nomor rekening ditampilkan penuh agar
  Finance dapat memvalidasi rekening; data yang belum tersedia ditampilkan `—`
  dan tidak memblokir unduhan.
- Durasi di bawah satu tahun diberi penekanan warna biru seperti referensi
  dokumen. Durasi dua belas bulan ditampilkan sebagai `1 Tahun`.
- Kolom `Total Realisasi` pertama adalah hak Owner per kontrak. Kolom terakhir
  adalah total hak Owner per Owner dan hanya diisi pada baris pertama kelompok
  Owner; baris terakhir dokumen berisi total keseluruhan.
- Template PDF memakai kop dokumen yang sama dengan kuitansi Pembayaran:
  logo Granada, KOSTATION, dan PT SON Smart Living, alamat properti di tengah,
  pembatas tegas, lalu judul dokumen terpusat. Halaman lanjutan mengulang kop
  ringkas dan header tabel agar dapat diperiksa tanpa kembali ke halaman awal.
- Footer tetap menggunakan tiga pihak: `Dibuat oleh`, `Mengetahui`, dan
  `Menyetujui`. Nama, jabatan, dan tanda tangan diambil dari Pengaturan Umum;
  gambar tanda tangan bersifat opsional.

## Akses dan filter

Tombol `Unduh Form Finance PDF` dan `Unduh Form Finance Excel` hanya tersedia
di tab Riwayat Realisasi. Periode dan pencarian Owner mengikuti filter aktif.
Dokumen hanya memuat realisasi berstatus `Terealisasi` atau `Diterbitkan untuk
Owner`. Realisasi yang dibatalkan tidak masuk ke dokumen.

## Jejak audit

Setiap unduhan dicatat sebagai `property_owner.realization.finance_request_exported`
dengan properti, periode, format, dan jumlah baris. Tidak ada nomor rekening
atau isi bukti yang ditulis ke audit log.
