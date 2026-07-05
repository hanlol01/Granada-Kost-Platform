# Roadmap

## Milestone 1 - Monorepo Foundation

- Pindahkan Admin ke `apps/admin`.
- Pindahkan Penghuni ke `apps/penghuni`.
- Buat struktur `backend/api`, `packages/*`, dan `docs`.
- Standarisasi npm workspaces.
- Dokumentasikan keputusan awal.

## Milestone 2 - Backend Foundation

- Scaffold NestJS di `backend/api`.
- Konfigurasi PostgreSQL, Redis, env validation, logging, dan health check.
- Buat kontrak API awal untuk auth, Penghuni, kamar, tagihan, pembayaran, smart lock, dan CCTV.
- Status: selesai.

## Milestone 3 - Property + Room

- Property Module.
- Room Module.
- RBAC dan audit integration.
- Property owner read-only scope.
- Status: selesai.

## Milestone 4 - Resident + Occupancy

- Resident Module.
- Emergency Contacts.
- Occupancy source of truth.
- Check-in/check-out foundation.
- Room status sync.
- Status: selesai.

## Milestone 5 - Seed Foundation

- Layer 0-4 core seed.
- Layer 5 master room seed: 123 RuKost + 40 ApartKost.
- Layer 6 development seed: dummy residents dan active occupancies.
- Status: selesai.

## Milestone 6 - Billing Phase 1

- Billing database migration.
- Billing repository and service foundation.
- Billing DTO, controller, and API endpoint.
- Manual transfer/payment proof workflow foundation.
- Development billing seed and workflow validation.
- Status: selesai.

## Milestone 7 - Complaint + Maintenance Phase 1

- Complaint and maintenance database migration.
- Repository, service, helper, and audit foundation.
- Complaint and work order API endpoint.
- Complaint category production seed.
- Development technician, complaint, and work order seed.
- Workflow validation script for complaint and maintenance.
- Status: selesai sampai 7F.

## Milestone 8 - Vehicle + Parking Phase 1

- Vehicle and parking database migration.
- Repository, service, helper, and audit foundation.
- Vehicle and parking API endpoint.
- Production-safe permission and parking settings seed.
- Development vehicle and parking seed.
- Workflow validation script for Vehicle and Parking.
- Status: selesai sampai 8F.

## Milestone 9 - Notification Phase 1

- Notification database migration.
- Repository, service, provider abstraction, helper, template, and audit foundation.
- Notification API endpoint for self notifications, preferences, and admin delivery monitoring.
- Production-safe notification property settings seed.
- Development notification preference, in-app notification, and delivery seed.
- Workflow validation script for Notification.
- Status: selesai sampai 9F.

## Milestone 10 - Smart Lock Phase 1

- Smart Lock planning and architecture.
- Smart Lock database migration.
- Repository, service, helper, gateway abstraction, and audit foundation.
- Smart Lock API layer with RBAC, property scope, resident self-scope, and simulated Tuya gateway response.
- Status: selesai sampai 10E.

## Milestone 11 - Frontend Integration Phase 1

Status: ✅ COMPLETE

Tanggal selesai: 2026-07-02

Catatan:
- M11A–M11G selesai.
- M11BV, M11CV, M11DV, M11EV, M11FV, dan M11GV seluruhnya PASS.
- QA-01 Final Regression PASS.
- Internal Demo Ready.

- Output kunci:
  - `docs/10-frontend/FRONTEND_INTEGRATION_PLAN.md` (M11A) + addendum M11AF/M11E.
  - `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md` (frozen).
  - `packages/api-client`, `packages/domain` (rilis M11B).
  - Halaman Admin live: Dashboard, Rooms, Tenants, Payments, Complaints, Vehicles, Parking, Reports.
  - Halaman Penghuni live: Home, Billing, Complaints read, Notifications, Info, Profile/session.
  - Smart Lock, CCTV, Booking, Chat, dan file upload fisik tetap placeholder/deferred sesuai scope.
- Verdict: Milestone 11 selesai, seluruh validation gate PASS, Frontend Admin/Penghuni Phase 1 Internal Demo Ready.
## Milestone 12 - Reports + Audit Minimum

- M11G - Operational Reports & Audit Readiness. Status: selesai.
  - Halaman Reports Admin live: KPI strip, Pendapatan Bulanan, Okupansi Kamar, SummaryCard untuk Billing Aging / Pembayaran / Komplain / Maintenance / Kendaraan / Parkir, Resident snapshot, Audit Viewer section.
  - Shared selectors `apps/admin/src/lib/reports-selectors.ts` menjamin Dashboard dan Reports menghasilkan angka identik.
  - Hooks baru: `useReports`, `useAuditLogs` (placeholder), `useWorkOrders`. `useDashboardSummary` di-refactor di atas `useReports`.
  - Audit Viewer dan Export tetap placeholder dengan label eksplisit karena endpoint `/audit/*` dan `/reports/exports` belum tersedia. Tidak ada laporan dummy. Tidak ada export client-side.
  - RBAC UX: Reports `owner | manager | admin`; Audit `owner | manager`. Backend tetap final authority.
- M11GV - Validation. Status: PASS.
  - lint, typecheck, build admin + penghuni passed.
  - Dashboard dan Reports memakai selector yang sama.
  - Reports property-scoped (termasuk parking slots fan-out), tanpa direct `fetch()` di routes/hooks, tanpa import `mock-data`.
  - Hook order Reports diperbaiki: RBAC gating dipindah ke parent, body Reports dengan `useReports` dan `useAuditLogs` di-render lewat child component agar tidak kondisional.
  - Export tetap disabled. Audit Viewer tetap placeholder. ErrorState menampilkan correlation id.
  - Verdict: M11GV PASS.
- Frontend Admin/Penghuni Phase 1. Status: demoable.
  - Admin Phase 1 demoable untuk operasional inti: Dashboard, Rooms, Tenants, Payments, Complaints, Vehicles, Parking, Reports.
  - Penghuni Phase 1 demoable untuk self-service dasar: Home, Billing, Complaints read, Notifications, Info, Profile/session.
  - Placeholder/deferred tetap eksplisit untuk fitur yang menunggu milestone backend/provider berikutnya.

## Milestone 12C/12D - File Upload Foundation + Attachment Flows

Status: selesai dan tervalidasi (M12A-M12H): QA-M12G cross-scope security boundary PASS dan QA-M12H visual E2E demo pass PASS (2026-07-03, eksekusi eksternal via Codex); re-regression M14B (API) dan M14C (browser) PASS (2026-07-04).

Sumber kebenaran: dokumen implementasi di `docs/12-product-readiness/` dan `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`.

- M12A - Mockup Feature Gap Audit. Status: selesai.
- M12B - Feature Flag / Placeholder Hardening. Status: selesai.
- M12C1 - Backend File API Foundation. Status: selesai.
  - Tabel `files` (migration `011_files.sql`) sebagai source of truth metadata di PostgreSQL; storage provider abstraction (local disk, siap swap ke S3 via config).
  - Endpoint `POST /files`, `GET /files/:id`, `GET /files/:id/content`, `DELETE /files/:id` (soft-delete). Seluruh akses file dimediasi backend (ADR-BE-FILE-001): tanpa URL storage publik, `storage_path` tidak diekspos.
  - Validasi otoritatif backend: MIME allowlist per purpose, magic bytes (`file-type`), batas ukuran storage-conscious (2 MB gambar / 5 MB PDF), blocklist ekstensi berbahaya, checksum SHA256, rate limit upload, audit lifecycle lengkap.
- M12C2 - Generic Frontend Upload Engine. Status: selesai.
  - `packages/domain/src/file.ts` (purpose policies, limits, error codes); hooks `useFileUpload`/`useFilePreview`/`useFileDelete`; komponen `FilePickerButton`/`FilePreview`/`FilePreviewModal`/`FileUploadProgress`/`WhatsAppFallbackButton` per app (Admin + Penghuni).
  - Kompresi gambar client-side (canvas, max 1600px, JPEG 0.75); preview via authorized blob fetch. Validasi frontend UX-only; backend tetap otoritatif. Tanpa dependency baru dan tanpa perubahan `packages/api-client`.
- M12C3 - Penghuni Manual Payment Proof Upload. Status: selesai.
  - Penghuni upload bukti manual lalu submit `POST /my/payment-proofs` dengan `file_ids` (maks 3) -> proof `pending_review`. Verifikasi admin tetap otoritas settlement; tagihan tidak otomatis lunas. WhatsApp fallback saat upload gagal atau file terlalu besar.
- M12C4 - Complaint Attachment Backend Readiness. Status: selesai.
  - `POST /my/complaints` menerima `file_ids` opsional (maks 5 unik, purpose `complaint_attachment`); validasi kepemilikan/properti/soft-delete/purpose; attach transaksional (complaint + history + files, rollback utuh); audit `complaint.file_attach`.
- M12C5 - Admin File Preview / Review. Status: selesai.
  - `GET /payment-proofs/:id/files` dan `GET /complaints/:id/files` (metadata aman tanpa `storage_path`); Admin review bukti pembayaran (dialog review + verify/reject) dan preview lampiran komplain via authorized blob fetch.
- M12D - Penghuni Complaint Create UI + Attachment. Status: selesai (tervalidasi: QA-M12H visual E2E PASS).
  - Endpoint resident-safe `GET /my/complaints/categories` (properti dari occupancy aktif) menutup blocker kategori.
  - Form buat tiket Penghuni live: kategori, judul, deskripsi, lokasi (kamar sendiri / area umum + catatan lokasi), lampiran opsional 1-5 foto (JPEG/PNG maks 2 MB) via upload engine M12C2. `file_ids` dikirim hanya jika ada lampiran; preview dipertahankan saat submit gagal.

Catatan lingkup (tidak berubah, jangan dianggap selesai):

- Payment gateway / Midtrans: deferred, milestone mendatang.
- Receipt / nota: deferred, milestone mendatang.
- Chat attachment: tidak didukung fase ini.
- Video upload: tidak didukung fase ini.

## Milestone 13 - Smart Lock Live Backend Foundation (Tuya/PALOMA)

Status: selesai sampai M13F-D (dokumen: `docs/13-smart-lock/`).

- M13A - Site readiness plan; legacy PoC diaudit sebagai referensi saja. Selesai.
- M13B - Live integration architecture freeze (binding untuk M13C-M13H). Selesai.
- M13C - Tuya provider config + client skeleton (HMAC-SHA256 signing, token cache Redis; default `simulated`, live disabled). Selesai dan tervalidasi.
- M13D - Read-only diagnostic / capability discovery. Selesai dan tervalidasi.
- M13E - Read-only sync + gateway health (provider device ID ter-mask). Selesai dan tervalidasi.
- M13F-A - Controlled live command safety freeze. Selesai.
- M13F-B - Backend command guard (fail-closed gates, RBAC, confirmation/reason/idempotency, rate limit, audit). Selesai dan tervalidasi.
- M13F-C1 - Site trial readiness runbook. Selesai.
- M13F-C2 - Guarded live unlock transport (`remote_unlock`/`emergency_unlock` saja; `remote_lock` = `UNSUPPORTED_CAPABILITY`). Selesai dan tervalidasi (dry-run/fake-server, eksekusi eksternal).
- M13F-C3 - Dry-run live-disabled PASS (setelah fix leakage provider ID, commit `757b0db9`).
- M13F-C4 - Go/No-Go decision: CONDITIONAL GO untuk persiapan/penjadwalan, NO-GO untuk eksekusi live. Selesai.
- M13F-C4.1 - Sanitized C3-class evidence pack `artifacts/m13f-c4-site-evidence-pack/` (PASS; B-23 partially closed di env placeholder). Selesai.
- M13F-D - Freeze: **"Ready for controlled site trial preparation, execution pending."** Selesai.

Catatan mengikat: eksekusi live unlock fisik BELUM pernah dilakukan dan tetap **NO-GO** sampai syarat M13F-C4 terpenuhi. Smart Lock live integration TIDAK complete tanpa evidence site trial nyata. `SMART_LOCK_LIVE_ENABLED` tetap `false` default di semua environment.

## Milestone 14 - Production Readiness / Internal Demo Refresh

- M14A - Production Readiness Audit: internal demo READY, production NOT READY; production blockers + deployment/env checklist (belum dieksekusi). Status: selesai.
- M14B - API Regression & Security Smoke: verdict **PASS** (eksekusi eksternal via Codex). Status: selesai.
- M14C - Browser Regression / Internal Demo Flow: verdict **PASS** (Hybrid Interactive Login; eksekusi eksternal via Codex). Status: selesai.
- M14D - Internal Demo Script Refresh: `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md`. Status: selesai.
- M14E - Documentation/Roadmap/Handoff Refresh (dokumen ini, `PROJECT_MASTER.md`, `CHANGELOG.md`, `PROJECT_HANDOFF.md`, `INTERNAL_DEMO_CHECKLIST.md`). Status: selesai.
- M14F - Release Readiness Verdict: **Internal Demo READY, Production NOT READY, Smart Lock live execution NO-GO / site trial pending** (`docs/14-production-readiness/RELEASE_READINESS_VERDICT.md`). Status: selesai (2026-07-04).

## Milestone 15 - Stakeholder Demo, VPS Staging, Payment Gateway

- M15A - Internal Demo Delivery Package (`docs/15a-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md`). Status: selesai.
- M15B-A - VPS Staging Baseline Smoke & Environment Hardening: **PASS** untuk baseline staging/internal demo (`docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md`). Production tetap NOT READY. Status: selesai.
- M15C - Payment Gateway (dokumen: `docs/15c-payment-gateway/`). Status: **selesai (M15C-A sampai M15C-G) - Payment Gateway Sandbox/Staging Ready.**
  - M15C-A - Payment Gateway Architecture / Product Freeze. Selesai.
  - M15C-B - Midtrans Provider Contract Freeze. Selesai.
  - M15C-C - Backend Payment Gateway Foundation (fail-closed default; tabel `payment_transactions` + `payment_webhook_events`). Selesai dan tervalidasi.
  - M15C-D - Midtrans Sandbox Snap + Webhook Settlement (backend; webhook is the source of truth; redirect is UX only). Selesai dan tervalidasi di VPS staging.
  - M15C-E1 - Frontend Payment UX Plan. Selesai.
  - M15C-E2A/E2B - Frontend Penghuni "Bayar Online" + Admin Gateway transaction status UI; validasi teknis eksternal. Selesai.
  - M15C-F/F2 - Payment Gateway Sandbox E2E QA: **PASS** (VPS staging, Midtrans Sandbox). Selesai.
  - M15C-G - Documentation / Release Update (governance refresh + `docs/15c-payment-gateway/PAYMENT_GATEWAY_RELEASE_UPDATE.md`). Selesai (2026-07-05).

Catatan mengikat M15C: **Payment Gateway sandbox/staging ready - Payment Gateway is not production-ready.** Midtrans Sandbox validated; **production payment activation pending**. Webhook is the source of truth; redirect is UX only; manual payment proof remains fallback.

## Next Milestone

- **M15D / M16 - sesuai keputusan produk.** Jalur kandidat: production hardening, Smart Lock real site trial (M13F-C5), CCTV planning, atau payment production activation readiness.
- **Payment Gateway Production Activation / Midtrans Production Readiness: pending/gated - BUKAN selesai.** Butuh Midtrans production keys/aktivasi (backend-only, tidak pernah di repo), notification URL production, QA payment production, checklist deployment production, dan approval stakeholder.
- Smart Lock live site trial (M13F-C5): **pending/gated - BUKAN selesai.** Hanya setelah approvals, konfirmasi rotasi kredensial, mapping perangkat nyata, dan site-env dry-run lengkap dengan sign-off (M13F-C4 Sections 6-7).
- Production release: **tetap diblokir (NOT READY)** sampai deployment/env checklist production (M14A Section 8) dieksekusi, blocker M14F ditutup, dan approval stakeholder diterima.
- M11H - Smart Lock UI Integration (hanya setelah live trial backend sukses; dilarang sebelumnya per M13F-D).
- M11I - CCTV preview (saat gateway lokal tersedia).
- M11J - Phase 2 surfaces (booking publik, chat, push/WhatsApp; payment gateway sandbox selesai via M15C - aktivasi production tetap pending).
- Receipt/nota untuk pembayaran terverifikasi (milestone mendatang).
- Backend follow-up untuk membuka endpoint `/audit/*` dan `/reports/exports` agar Audit Viewer dan Export di Reports dapat diaktifkan tanpa redesign.
- Penghuni complaint detail dengan thumbnail lampiran (endpoint file resident-facing belum diekspos).
- Otomasi cleanup file (cron) menggantikan `npm run file:cleanup` manual (Phase 2).
