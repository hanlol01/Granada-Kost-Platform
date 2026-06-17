# CCTV Architecture

## Model Hybrid

CCTV menggunakan pendekatan hybrid lokal + preview panel admin.

## Prinsip

- Recording/stream sumber tetap sedekat mungkin dengan jaringan lokal untuk efisiensi dan privasi.
- Admin mendapatkan preview panel sesuai izin akses.
- Backend menjadi pengatur otorisasi, metadata kamera, audit access, dan token preview.
- Jangan expose URL kamera internal secara langsung ke browser tanpa token atau gateway yang sesuai.

## Komponen Rencana

- Local gateway/NVR untuk stream lokal.
- Backend API untuk camera registry, access policy, audit log, dan signed preview session.
- Admin panel untuk preview terbatas.
- Redis untuk session/short-lived token dan rate limit.
