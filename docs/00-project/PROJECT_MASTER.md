# Project Master - Granada Kost Platform

Granada Kost Platform adalah monorepo untuk operasional kost dengan dua aplikasi frontend terpisah dan satu backend API NestJS yang sudah berjalan (Phase 1 live).

## Aplikasi

- Admin: `apps/admin`, target domain `admin.kostsaya.com`.
- Penghuni: `apps/penghuni`, target domain `penghuni.kostsaya.com`, PWA mobile-first.
- Backend: `backend/api`, NestJS + PostgreSQL + Redis (live sejak Milestone 2).

## Keputusan Utama

- Tetap React + TanStack; tidak migrasi ke Next.js.
- Admin dan Penghuni tetap app terpisah.
- Backend menggunakan NestJS (live).
- Database utama PostgreSQL (system of record).
- Redis hanya untuk cache, rate limit, queue, dan runtime ephemeral.
- Smart lock melalui Tuya Cloud API. Integrasi live Tuya/PALOMA masih deferred (menunggu akses fisik perangkat); Phase 1 memakai simulated gateway.
- CCTV memakai arsitektur hybrid lokal + preview panel admin. Integrasi live masih deferred.
- Istilah UI resmi untuk resident adalah "Penghuni". Jangan gunakan istilah "tenant" pada UI.

## Status Proyek (per 2026-07-03)

Selesai:

- Backend Phase 1 (M2-M10E): IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint + Maintenance, Vehicle + Parking, Notification, Smart Lock foundation (simulated).
- Frontend Phase 1 (M11A-M11G): Admin + Penghuni live dari backend nyata. QA-01 Final Regression PASS. Internal Demo Ready.
- M12C1 Backend File API Foundation: File API backend-mediated (ADR-BE-FILE-001), tabel `files` sebagai source of truth metadata di PostgreSQL.
- M12C2 Generic Frontend Upload Engine: hooks + komponen upload purpose-agnostic di kedua app.
- M12C3 Penghuni Manual Payment Proof Upload: upload bukti manual -> proof `pending_review`; verifikasi admin tetap otoritas settlement (tagihan tidak otomatis lunas).
- M12C4 Complaint Attachment Backend Readiness: `file_ids` opsional pada complaint create, attach transaksional.
- M12C5 Admin File Preview / Review: preview terotorisasi bukti pembayaran + lampiran komplain.
- M12D Penghuni Complaint Create UI + Attachment: form buat tiket + lampiran opsional 1-5 foto.
- M12E/M12F Dokumentasi & project state refresh.

Deferred (jangan dianggap selesai):

- Payment gateway / Midtrans (milestone mendatang).
- Receipt / nota (milestone mendatang).
- Smart Lock live Tuya/PALOMA (M10G).
- CCTV live integration.
- Chat attachment (tidak didukung fase ini).
- Video upload (tidak didukung fase ini).
- Reports export (`/reports/exports`).
- Audit viewer (`/audit/*`).

Catatan: upload bukti pembayaran manual adalah jalur fallback/manual, bukan pengganti payment gateway mendatang.

## Prinsip Arsitektur (Mengikat)

- Backend adalah titik penegakan kebijakan final; validasi frontend bersifat UX-only.
- PostgreSQL adalah system of record; Redis hanya runtime/cache/queue/rate-limit.
- Property scoping wajib pada semua resource operasional.
- Resident self-scope ditegakkan oleh backend, bukan oleh frontend.
- Tidak ada URL file publik; preview file melalui akses terotorisasi yang dimediasi backend (`GET /files/:fileId/content`); `storage_path` tidak pernah diekspos ke frontend.
- Upload bersifat bounded dan storage-conscious (2 MB gambar / 5 MB PDF, rate limit, cleanup policy).

## Package Manager

Monorepo menggunakan npm workspaces. File Bun dari project asal tidak dibawa agar hanya ada satu package manager.
