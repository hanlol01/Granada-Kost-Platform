# Project Handoff

> Diperbarui: 2026-07-04 (M14E). Dokumen serah terima kondisi proyek untuk engineer/agen berikutnya.
> Versi sebelumnya (M12G, 2026-07-03) belum memuat track M13 Smart Lock dan M14 production readiness.

## Status Saat Ini

- Monorepo npm workspaces: `apps/admin`, `apps/penghuni`, `backend/api` (NestJS live), `packages/api-client` (frozen M11B per ADR-FE-001), `packages/domain`.
- Backend Phase 1 selesai (M2-M10E): IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint + Maintenance, Vehicle + Parking, Notification, Smart Lock foundation (simulated gateway).
- Frontend Phase 1 selesai (M11A-M11G). QA-01 Final Regression PASS (2026-07-02).
- M12 (A-H) selesai dan tervalidasi: File API backend-mediated, generic upload engine, upload bukti pembayaran manual Penghuni, lampiran komplain (backend + UI create), preview/review Admin. QA-M12G security boundary PASS; QA-M12H visual E2E PASS.
- M13 selesai sampai M13F-D: fondasi backend Smart Lock live Tuya/PALOMA (provider config + client, read-only diagnostic/sync, command guard fail-closed, guarded live unlock transport). Status dibekukan: **"ready for controlled site trial preparation, execution pending"**. Eksekusi live unlock fisik BELUM pernah dilakukan dan tetap **NO-GO**.
- M14A-M14E selesai: Production Readiness Audit (M14A), API Regression & Security Smoke **PASS** (M14B), Browser Regression / Internal Demo Flow **PASS** (M14C, Hybrid Interactive Login), Internal Demo Script Refresh (M14D), refresh dokumentasi ini (M14E). Seluruh QA dijalankan eksternal (Codex); agen dokumentasi tidak menjalankan validasi terminal.
- **Internal demo: READY** (alur demo aman tervalidasi). **Production: NOT READY** (belum disetujui rilis production).

## Cara Kerja

Gunakan npm dari root monorepo (package manager tunggal - jangan tambah yang kedua).

```powershell
npm install
npm run dev:admin      # Admin, dev di http://localhost:8080
npm run dev:penghuni   # Penghuni PWA, dev di http://localhost:8081
```

Backend API NestJS berada di `backend/api` (base URL dev: `http://localhost:3000/api/v1`).

```powershell
npm run db:migrate:api   # migrasi database
npm run lint:api
npm run build:api
```

Jalankan app di terminal terpisah jika beberapa proses perlu aktif bersamaan.

## Handoff Arsitektur File Upload (M12)

- **File API backend-mediated** per `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`: `POST /api/v1/files`, `GET /api/v1/files/:fileId`, `GET /api/v1/files/:fileId/content`, `DELETE /api/v1/files/:fileId`.
- **Streaming konten terotorisasi** hanya melalui `GET /api/v1/files/:fileId/content` (cek role + property scope + ownership). Tidak ada signed URL publik.
- **Tidak ada URL storage publik** dan **`storage_path` tidak pernah diekspos** ke frontend (respons metadata memakai `FileService.toResponse()`).
- **Upload bounded dan storage-conscious**: 2 MB gambar / 5 MB PDF per purpose, magic-byte validation, blocklist ekstensi, checksum SHA256, rate limit per user/properti, retention/cleanup policy (24 jam / 30 hari / 90 hari).
- Validasi frontend UX-only; backend otoritas final. Rincian endpoint shipped: `docs/01-architecture/API_PLANNING.md` (section Status Implementasi M12) dan dokumen implementasi di `docs/12-product-readiness/`.

## Alur Operasional Penting

- **Bukti pembayaran manual adalah jalur fallback/manual**, bukan pengganti payment gateway mendatang. Proof masuk `pending_review`.
- **Verifikasi Admin adalah satu-satunya otoritas settlement manual** - tagihan tidak otomatis lunas setelah upload bukti.
- **Lampiran komplain bersifat opsional** (0-5 foto, JPEG/PNG maks 2 MB).
- Resident complaint create (dengan/tanpa lampiran) dan Admin preview lampiran sudah **operasional**.

## Smart Lock Live Posture (M13 - Mengikat)

- Status: **"Ready for controlled site trial preparation, execution pending"** (M13F-D). Fondasi guard/transport backend ada; live trial fisik BELUM pernah dilakukan.
- Eksekusi live `remote_unlock` fisik: **NO-GO** sampai seluruh syarat M13F-C4 (approvals A-01..A-06, rotasi kredensial C-07, mapping perangkat nyata D-13..D-20, site-env dry-run, sign-off) PASS dengan evidence tercatat.
- Jangan pernah menulis "Smart Lock production ready", "live unlock production ready", atau "Smart Lock complete" tanpa kualifikasi.
- Remote lock (`UNSUPPORTED_CAPABILITY`), temporary PIN (M13G, gated), resident unlock (`403` by frozen policy), dan fleet rollout: belum tersedia - jangan diimplikasikan tersedia.
- **Postur env wajib:**
  - `SMART_LOCK_PROVIDER=simulated` (default di semua environment).
  - `SMART_LOCK_LIVE_ENABLED=false` (default; hanya boleh `true` di dalam window M13F-C5 yang disetujui dan wajib segera dikembalikan ke `false`).
  - Kredensial Tuya **backend-only** (uncommitted `.env`/secret manager, jalur production `credential_ref`); tidak pernah di repo, log, atau konfigurasi yang bisa dijangkau client. Tidak ada env Tuya apa pun di build `apps/admin`/`apps/penghuni`.

## Evidensi / Artefak

- `artifacts/m14b-api-regression-smoke/` - M14B API regression & security smoke (verdict PASS).
- `artifacts/m14c-browser-regression/` - M14C browser regression / internal demo flow (verdict PASS; qa-summary + 20 screenshot).
- `artifacts/m13f-c4-site-evidence-pack/` - sanitized C3-class dry-run pack Smart Lock (PASS; 0 leakage hits; B-23 partially closed di env placeholder).
- Pendukung: `artifacts/m12h-final-demo-pass/`, `artifacts/internal-demo/` (baseline QA-01).

## Blocker Diketahui (Production)

- Smart Lock live site trial pending (M13F-C5): approvals, person-at-door, manual key holder, dan window uji yang disetujui belum ada.
- Konfirmasi tertulis rotasi kredensial (C-07) pending untuk semua yang pernah ada di PoC/history.
- Mapping perangkat nyata + evidence site-env dry-run pending (B-23 baru partially closed di env placeholder).
- Deployment/env checklist production belum dieksekusi (M14A Section 8); storage masih local-disk (S3 swap + otomasi cron cleanup deferred); endpoint `/audit/*` dan `/reports/exports` belum tersedia.

## Langkah Operator Berikutnya

1. Jalankan demo internal memakai `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` (M14D) - scope aman + fallback plan sudah ditetapkan.
2. Eksekusi **M14F - Release Readiness Verdict**: putuskan kelengkapan paket demo internal, status blokir rilis production, opsi freeze internal-demo-only, prasyarat production, dan status site-trial-pending Smart Lock.
3. Jika lanjut ke site trial Smart Lock: lengkapi M13F-C4 Sections 6-7 (evidence + sign-off) sebelum M13F-C5. Jangan set `SMART_LOCK_LIVE_ENABLED=true` di luar window yang disetujui.
4. Untuk production: eksekusi deployment/env checklist M14A Section 8 dan tutup blocker P0-P2 pada M14A Section 5.

## Deferred (Jangan Dianggap Selesai)

- Payment gateway / Midtrans.
- Receipt / nota.
- Smart Lock live site trial + integrasi live complete (M13F-C5+; execution pending).
- Smart Lock frontend live command UI (dilarang sebelum live trial backend sukses).
- CCTV live integration.
- Chat attachment (tidak didukung fase ini).
- Video upload (tidak didukung fase ini).
- Reports export (`/reports/exports`).
- Audit viewer (`/audit/*`).

## Prinsip Arsitektur (Mengikat)

- Backend adalah titik penegakan kebijakan final; validasi frontend UX-only.
- PostgreSQL system of record; Redis hanya runtime/cache/queue/rate-limit.
- Property scoping wajib; resident self-scope ditegakkan backend.
- Tidak ada URL file publik; preview file via akses terotorisasi yang dimediasi backend.

Rujukan utama: `PROJECT_MASTER.md`, `ROADMAP.md`, `docs/README.md` (indeks), `DEVELOPMENT_WORKFLOW.md` (pembagian peran agen dan validasi), `docs/14-production-readiness/` (M14A-M14D).
