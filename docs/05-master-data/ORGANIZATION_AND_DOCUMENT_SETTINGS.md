# Pengaturan Organisasi dan Dokumen

Status: **KEPUTUSAN DISETUJUI — CHECKPOINT IMPLEMENTASI PENGATURAN UMUM**

Dicatat: 30 September 2026 (Asia/Jakarta)

## Tujuan

Pengaturan Umum adalah sumber data resmi untuk identitas organisasi dan
penandatangan dokumen. Data ini dipakai oleh dokumen operasional dan keuangan;
tidak boleh ditanam langsung pada template PDF atau Excel.

## Batas Authority

- Hanya pengguna dengan peran `admin` yang dapat membuka atau mengubah
  Pengaturan Umum pada checkpoint ini.
- Tidak ada cakupan akses untuk Manager, Keuangan, Owner Property, atau peran
  lain pada checkpoint ini.
- Identitas organisasi berlaku global untuk KOSTATION.
- Nama properti dan penandatangan berlaku per properti. Tidak ada fallback
  otomatis antarproperti.

## Data yang Dikelola

### Identitas organisasi global

- Nama organisasi.
- Alamat organisasi.
- Nomor kontak organisasi.
- Email organisasi.

### Identitas dokumen per properti

- Nama properti yang tampil pada dokumen.
- Tiga penandatangan: Pengelola, DBO, dan Direktur.
- Setiap penandatangan memiliki nama, jabatan, dan gambar tanda tangan opsional.

Nama dan jabatan tetap dapat ditampilkan ketika gambar tanda tangan belum ada.
Jika gambar belum diunggah atau dihapus, ruang tanda tangan pada dokumen tetap
kosong dan rapi.

## Aturan Berkas Tanda Tangan

- Satu gambar aktif per penandatangan per properti.
- Admin dapat unggah, ganti, atau hapus gambar.
- Format yang diterima: JPG/JPEG, PNG, dan WebP.
- Batas ukuran: 2 MB.
- Sistem memeriksa MIME berdasarkan isi berkas, menolak ekstensi berbahaya, dan
  menjalankan kompresi gambar yang sudah tersedia pada klien.
- Pratinjau wajib tersedia sebelum gambar dianggap dipakai.
- Dokumen harus menempatkan gambar secara proporsional pada area tanda tangan;
  gambar tidak boleh diregangkan atau dipotong secara paksa.

## Jejak Audit dan Versi Dokumen

- Setiap perubahan identitas, nama properti, penandatangan, atau gambar tanda
  tangan dicatat dalam audit log bersama aktor, waktu, dan nilai sebelum/sesudah.
- Dokumen yang telah diterbitkan menyimpan data penandatangan saat penerbitan.
  Perubahan Pengaturan Umum hanya berlaku untuk dokumen baru atau revisi yang
  diterbitkan berikutnya.
- Dokumen revisi harus memiliki penanda revisi yang jelas; dokumen sebelumnya
  tetap menjadi arsip.

## Checkpoint

Implementasi berhenti setelah halaman Pengaturan Umum, persistence, validasi,
unggah/ganti/hapus gambar tanda tangan, dan audit selesai. Form Pengajuan
Realisasi Passive Income Investor tidak termasuk checkpoint ini dan hanya boleh
dilanjutkan setelah pemeriksaan manual dari product owner.
