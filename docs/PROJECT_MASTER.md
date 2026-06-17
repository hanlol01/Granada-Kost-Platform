# Project Master - Granada Kost Platform

Granada Kost Platform adalah monorepo untuk operasional kost dengan dua aplikasi frontend terpisah dan satu backend API terencana.

## Aplikasi

- Admin: `apps/admin`, target domain `admin.kostsaya.com`.
- Penghuni: `apps/penghuni`, target domain `penghuni.kostsaya.com`, PWA mobile-first.

## Keputusan Utama

- Tetap React + TanStack; tidak migrasi ke Next.js.
- Admin dan Penghuni tetap app terpisah.
- Backend direncanakan menggunakan NestJS.
- Database utama PostgreSQL.
- Redis digunakan untuk cache, rate limit, dan queue.
- Smart lock melalui Tuya Cloud API.
- CCTV memakai arsitektur hybrid lokal + preview panel admin.
- Istilah UI resmi untuk resident adalah "Penghuni". Jangan gunakan istilah "tenant" pada UI.

## Package Manager

Monorepo menggunakan npm workspaces. File Bun dari project asal tidak dibawa agar hanya ada satu package manager.
