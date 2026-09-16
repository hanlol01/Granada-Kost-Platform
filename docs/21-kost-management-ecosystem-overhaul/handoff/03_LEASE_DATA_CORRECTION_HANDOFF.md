# Handoff 03: Koreksi Data Penyewaan

Status: `LOCAL IMPLEMENTATION COMPLETE — PRODUCTION NOT APPLIED`

## Outcome

Admin dapat memperbaiki salah input tanggal check-in, tanggal mulai kontrak, dan durasi tanpa menghapus kontrak, pembayaran, invoice, atau audit lama.

## Invariants

- Tanggal check-in data lama dibaca dari lifecycle, lalu riwayat okupansi, lalu tanggal mulai okupansi. Tanggal hari ini tidak pernah menjadi fallback tampilan.
- Preview tidak mengubah data.
- Commit wajib memiliki alasan, kunci idempotensi, dan snapshot sebelum/sesudah.
- Nilai kontrak efektif selalu `tarif bulanan efektif x durasi`.
- Pembayaran terverifikasi tetap utuh.
- Selisih turun adalah kredit tagihan; selisih naik adalah tagihan koreksi.
- Check-out aktif atau selesai memblokir koreksi.
- Tanggal mulai setelah tanggal check-in, tanggal akhir yang sudah lewat, dan bentrok kamar memblokir koreksi.
- Data baru dan lama tetap dapat dibaca setelah migration.

## API

- `POST /leases/:leaseId/data-correction/preview`
- `POST /leases/:leaseId/data-correction`
- `GET /leases/:leaseId/data-corrections`

Preview dan commit menerima tanggal mulai, durasi, tanggal check-in, sumber tarif, tarif kesepakatan, dan alasan sesuai jenis koreksi. Commit hanya menerima hasil yang lolos preview ulang di dalam transaksi.

## Admin UI

- Tombol peringatan berwarna jingga `Koreksi data penyewaan` berada di detail penghuni.
- Dialog memakai komponen tanggal yang sama dengan Tambah Penyewaan.
- Semua nominal memakai format Rupiah.
- Data sebelum dan sesudah ditampilkan berdampingan pada desktop dan bertumpuk pada mobile.
- Dampak pembayaran menjelaskan tambahan kewajiban, kredit, atau tidak ada perubahan.
- Tombol `Tinjau koreksi` berwarna biru, `Simpan koreksi` berwarna hijau, dan `Batal` berwarna merah.
- Field wajib memakai tanda `*` merah, error terhubung ke field, dan fokus dipindahkan ke error pertama.

## Completion gates

1. Pengujian fallback tanggal historis lulus.
2. Pengujian formula tanggal akhir, tier tarif, dan dampak pembayaran lulus.
3. Pengujian command idempotent, checkout block, bentrok kamar, dan invoice adjustment lulus.
4. API build dan lint lulus.
5. Admin typecheck, test, build, dan pemeriksaan desain lulus.
6. Migration checksum cocok dengan manifest dan replay aman.

Tidak ada migration production, deployment, commit, atau push tanpa perintah terpisah.

## Checkpoint lokal — 15 September 2026

- Fallback tanggal check-in historis telah diterapkan tanpa menggunakan tanggal hari ini.
- Preview, riwayat, dan commit koreksi idempotent telah diterapkan.
- Koreksi tanggal check-in saja mempertahankan snapshot komersial kontrak.
- Koreksi periode menghitung ulang tanggal akhir dan nilai kontrak, kemudian mencatat tambahan kewajiban atau kredit tanpa menghapus pembayaran lama.
- Kesepakatan tarif khusus meminta catatan dan konfirmasi pemeriksaan selisih tarif secara eksplisit.
- Migration `086_lease_data_correction_authority.sql` telah diterapkan dan diuji ulang secara lokal; production tidak disentuh.
- API build/lint, Admin typecheck/build/lint terarah, serta tujuh pengujian kontrak statis lulus.
