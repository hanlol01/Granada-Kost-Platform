# Project Handoff

## Status Saat Ini

Monorepo awal sudah disiapkan dengan dua app frontend existing:

- `apps/admin` dari KOST Desktop.
- `apps/penghuni` dari KOST Mobile Penghuni.

Tidak ada migrasi framework dan tidak ada redesign fitur besar pada tahap ini.

## Cara Kerja

Gunakan npm dari root monorepo.

```powershell
cd "D:\PROJECT CODING\Granada Kost Platform"
npm install
npm run dev:admin
npm run dev:penghuni
```

Jalankan app di terminal terpisah jika keduanya perlu aktif bersamaan.

## Catatan Arsitektur

Backend NestJS belum discaffold. Direktori `backend/api` masih berupa placeholder sadar desain agar migrasi awal tetap kecil dan mudah diverifikasi.
