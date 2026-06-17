# Agents Guide

## Prinsip Kerja

- Jaga Admin dan Penghuni sebagai aplikasi terpisah.
- Jangan migrasi ke Next.js.
- Jangan redesign besar tanpa milestone eksplisit.
- Gunakan istilah "Penghuni" pada UI, bukan "tenant".
- Perubahan shared package harus berbasis kebutuhan nyata dari kedua app.

## Area Tanggung Jawab

- `apps/admin`: operasi admin, preview CCTV, manajemen kost, pembayaran, smart lock admin controls.
- `apps/penghuni`: pengalaman Penghuni mobile-first/PWA.
- `backend/api`: NestJS API, PostgreSQL, Redis, integrasi eksternal.
- `packages/domain`: kontrak domain dan schema bersama.
- `packages/api-client`: client API typed.
- `packages/ui`: komponen UI bersama yang sudah stabil.
- `packages/config`: konfigurasi toolchain bersama.
