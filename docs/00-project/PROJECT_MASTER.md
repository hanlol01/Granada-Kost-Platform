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
- Smart lock melalui Tuya Cloud API. Fondasi backend live (M13) selesai dengan status **"ready for controlled site trial preparation, execution pending"** (M13F-D). Default `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`. Eksekusi live unlock fisik **NO-GO** sampai seluruh syarat site trial M13F-C4 terpenuhi dengan evidence tercatat.
- CCTV memakai arsitektur hybrid lokal + preview panel admin. Integrasi live masih deferred.
- Istilah UI resmi untuk resident adalah "Penghuni". Jangan gunakan istilah "tenant" pada UI.

## Status Proyek (per 2026-07-04)

Ringkasan readiness:

- **Internal demo: READY** — alur demo aman tervalidasi (M14B API regression & security smoke PASS; M14C browser regression PASS; skrip demo M14D tersedia di `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md`).
- **Production: NOT READY** — belum disetujui untuk rilis production (lihat blocker di `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md` Section 5 dan daftar deferred di bawah).

Selesai:

- Backend Phase 1 (M2-M10E): IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint + Maintenance, Vehicle + Parking, Notification, Smart Lock foundation (simulated).
- Frontend Phase 1 (M11A-M11G): Admin + Penghuni live dari backend nyata. QA-01 Final Regression PASS (2026-07-02).
- M12 (A-H): File Upload Foundation — File API backend-mediated (ADR-BE-FILE-001), generic upload engine, upload bukti pembayaran manual Penghuni (`pending_review`; verifikasi admin = otoritas settlement), lampiran komplain 0-5 foto, preview/review Admin. **Selesai dan tervalidasi** (QA-M12G security boundary PASS; QA-M12H visual E2E PASS; re-regression M14B/M14C PASS).
- M13 (A-F-D): Fondasi backend Smart Lock live Tuya/PALOMA — provider config + client, read-only diagnostic (M13D) dan sync (M13E, provider ID ter-mask), safety freeze (M13F-A), command guard fail-closed (M13F-B), runbook site trial (M13F-C1), guarded live unlock transport (M13F-C2), dry-run live-disabled PASS (M13F-C3), Go/No-Go (M13F-C4), sanitized evidence pack (M13F-C4.1). **Status dibekukan M13F-D: "ready for controlled site trial preparation, execution pending".**
- M14A Production Readiness Audit; M14B API Regression & Security Smoke **PASS**; M14C Browser Regression / Internal Demo Flow **PASS** (Hybrid Interactive Login); M14D Internal Demo Script Refresh; M14E Documentation/Roadmap/Handoff Refresh. Dokumen: `docs/14-production-readiness/`.

Smart Lock (jangan overclaim):

- Eksekusi fisik live `remote_unlock`: **NO-GO** sampai syarat site trial M13F-C4 (approvals, rotasi kredensial, mapping perangkat nyata, site-env dry-run, sign-off) terpenuhi.
- Remote lock, temporary PIN, resident unlock, dan fleet rollout: **NO-GO** / belum tersedia.
- Smart Lock live integration TIDAK complete tanpa evidence site trial nyata yang diterima.

Deferred (jangan dianggap selesai):

- Payment gateway / Midtrans (milestone mendatang).
- Receipt / nota (milestone mendatang).
- Smart Lock live site trial (M13F-C5) — pending/gated; execution pending.
- Smart Lock frontend live command UI — dilarang sebelum live trial backend sukses (M13F-D rule 4).
- CCTV live integration.
- Chat attachment (tidak didukung fase ini).
- Video upload (tidak didukung fase ini).
- Reports export (`/reports/exports`).
- Audit viewer (`/audit/*`).

Catatan: upload bukti pembayaran manual adalah jalur fallback/manual, bukan pengganti payment gateway mendatang.

## Next Milestone

- **M14F — Release Readiness Verdict.** Memutuskan: (1) apakah paket demo internal lengkap; (2) apakah rilis production tetap diblokir; (3) apakah rilis dibekukan sebagai internal-demo-only; (4) apa saja yang wajib diselesaikan sebelum production; (5) apakah Smart Lock tetap berstatus site-trial-pending.

## Prinsip Arsitektur (Mengikat)

- Backend adalah titik penegakan kebijakan final; validasi frontend bersifat UX-only.
- PostgreSQL adalah system of record; Redis hanya runtime/cache/queue/rate-limit.
- Property scoping wajib pada semua resource operasional.
- Resident self-scope ditegakkan oleh backend, bukan oleh frontend.
- Tidak ada URL file publik; preview file melalui akses terotorisasi yang dimediasi backend (`GET /files/:fileId/content`); `storage_path` tidak pernah diekspos ke frontend.
- Upload bersifat bounded dan storage-conscious (2 MB gambar / 5 MB PDF, rate limit, cleanup policy).

## Package Manager

Monorepo menggunakan npm workspaces. File Bun dari project asal tidak dibawa agar hanya ada satu package manager.
