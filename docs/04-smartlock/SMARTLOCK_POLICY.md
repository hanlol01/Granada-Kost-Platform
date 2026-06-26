# Smart Lock Policy

## Prinsip

Smart lock adalah fitur keamanan fisik dan harus diperlakukan sebagai operasi berisiko tinggi.

## Provider

Integrasi direncanakan melalui Tuya Cloud API.

## Kebijakan Awal

- Semua aksi unlock/lock harus melewati backend, bukan langsung dari frontend.
- Secret Tuya hanya disimpan di backend environment.
- Setiap aksi smart lock wajib memiliki audit log: aktor, device, aksi, waktu, hasil, dan correlation id.
- Aksi berisiko seperti unlock harus memiliki otorisasi berbasis role dan rate limit.
- Admin UI harus menampilkan status perangkat dan hasil aksi secara eksplisit.
- Penghuni hanya boleh mengakses perangkat yang terkait dengan kamar/unitnya.
