# Project Master - Granada Kost Platform

Granada Kost Platform adalah monorepo untuk operasional kost dengan dua aplikasi frontend terpisah dan satu backend API NestJS yang sudah berjalan (Phase 1 live).

## Aplikasi

- Admin: `apps/admin`, target domain `admin.kostsaya.com`.
- Penghuni: `apps/penghuni`, target domain `penghuni.kostsaya.com`, PWA mobile-first.
- Backend: `backend/api`, NestJS + PostgreSQL + Redis (live sejak Milestone 2).
- Staging (VPS, M15B-A): Admin `https://kelola.kostation.web.id`, Penghuni `https://app.kostation.web.id`, API `https://api.kostation.web.id`.

## Keputusan Utama

- Tetap React + TanStack; tidak migrasi ke Next.js.
- Admin dan Penghuni tetap app terpisah.
- Backend menggunakan NestJS (live).
- Database utama PostgreSQL (system of record).
- Redis hanya untuk cache, rate limit, queue, dan runtime ephemeral.
- Smart lock melalui Tuya Cloud API. Fondasi backend live (M13) selesai dengan status **"ready for controlled site trial preparation, execution pending"** (M13F-D). Default `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`. Eksekusi live unlock fisik **NO-GO** sampai seluruh syarat site trial M13F-C4 terpenuhi dengan evidence tercatat.
- CCTV memakai arsitektur hybrid lokal + preview panel admin. Integrasi live masih deferred.
- Payment gateway provider-agnostic (`PaymentGatewayProvider` interface + adapter); **Midtrans Sandbox adalah adapter pertama** (M15C). **Webhook is the source of truth** untuk status lunas otomatis; **redirect is UX only**; **manual payment proof remains fallback**. Status: **Payment Gateway sandbox/staging ready** - **production payment activation pending**; **Payment Gateway is not production-ready**.
- Istilah UI resmi untuk resident adalah "Penghuni". Jangan gunakan istilah "tenant" pada UI.

## Status Proyek (per 2026-07-08)

Ringkasan readiness:

- **Internal demo: READY** - dipertegas verdict M14F (`docs/14-production-readiness/RELEASE_READINESS_VERDICT.md`); paket delivery demo stakeholder tersedia (M15A, `docs/15a-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md`).
- **VPS staging: READY / tervalidasi** - M15B-A baseline smoke + environment hardening PASS (`docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md`).
- **Payment Gateway: sandbox/staging ready** - Midtrans Sandbox validated end-to-end di VPS staging (M15C-F/F2 Sandbox E2E QA PASS). **Production payment activation pending; Payment Gateway is not production-ready.**
- **Public room listing (M16): READY dengan limitasi tercatat** untuk staging/demo - **public booking NOT production-ready** (`docs/16-room-inventory-booking/M16_FINAL_RELEASE_HANDOFF.md`).
- **Booking Lead MVP (M17): READY untuk internal/demo/staging dengan konfirmasi admin/manual** - lead BUKAN booking terkonfirmasi; **public booking tetap NOT production-ready** (`docs/17-booking-leads/M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`).
- **Production: NOT READY** - belum disetujui untuk rilis production (M14F; blocker di `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md` Section 5 + blocker aktivasi payment production di bawah).

Selesai:

- Backend Phase 1 (M2-M10E): IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint + Maintenance, Vehicle + Parking, Notification, Smart Lock foundation (simulated).
- Frontend Phase 1 (M11A-M11G): Admin + Penghuni live dari backend nyata. QA-01 Final Regression PASS (2026-07-02).
- M12 (A-H): File Upload Foundation - File API backend-mediated (ADR-BE-FILE-001), generic upload engine, upload bukti pembayaran manual Penghuni (`pending_review`; verifikasi admin = otoritas settlement), lampiran komplain 0-5 foto, preview/review Admin. **Selesai dan tervalidasi** (QA-M12G security boundary PASS; QA-M12H visual E2E PASS; re-regression M14B/M14C PASS).
- M13 (A-F-D): Fondasi backend Smart Lock live Tuya/PALOMA - provider config + client, read-only diagnostic (M13D) dan sync (M13E, provider ID ter-mask), safety freeze (M13F-A), command guard fail-closed (M13F-B), runbook site trial (M13F-C1), guarded live unlock transport (M13F-C2), dry-run live-disabled PASS (M13F-C3), Go/No-Go (M13F-C4), sanitized evidence pack (M13F-C4.1). **Status dibekukan M13F-D: "ready for controlled site trial preparation, execution pending".**
- M14A Production Readiness Audit; M14B API Regression & Security Smoke **PASS**; M14C Browser Regression / Internal Demo Flow **PASS** (Hybrid Interactive Login); M14D Internal Demo Script Refresh; M14E Documentation/Roadmap/Handoff Refresh. Dokumen: `docs/14-production-readiness/`.
- M14F Release Readiness Verdict (2026-07-04): **Internal Demo READY, Production NOT READY, Smart Lock live execution NO-GO / site trial pending** (`docs/14-production-readiness/RELEASE_READINESS_VERDICT.md`).
- M15A Internal Demo Delivery Package - paket delivery demo internal / stakeholder review (`docs/15a-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md`). Dokumentasi saja.
- M15B-A VPS Staging Baseline Smoke & Environment Hardening - **PASS** untuk baseline staging/internal demo (`docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md`).
- **M15C (A-G) Payment Gateway - selesai melalui Sandbox E2E QA**: architecture/product freeze (M15C-A), Midtrans provider contract freeze (M15C-B), backend foundation fail-closed (M15C-C), Midtrans Sandbox Snap + signed webhook settlement tervalidasi di staging (M15C-D), frontend UX plan (M15C-E1), frontend Penghuni "Bayar Online" + Admin Gateway transaction status UI (M15C-E2A; validasi teknis eksternal M15C-E2B), Sandbox E2E QA **PASS** (M15C-F/F2), documentation/release update (M15C-G). **Payment Gateway sandbox/staging ready; Midtrans Sandbox validated; webhook settlement tervalidasi; manual payment proof remains fallback; production payment activation pending - Payment Gateway is not production-ready.** Dokumen: `docs/15c-payment-gateway/`.
- **M16 (A-0 sampai F) Room Inventory & Public Booking MVP - selesai dengan limitasi tercatat** (2026-07-07): normalisasi data kamar (M16A-0: 163 kamar; RuKost 123, ApartKost 40; Putra 99, Putri 64; PII masked), architecture/UX freeze (M16A), schema + staging backfill additif (M16B: 26 `room_buildings`, 163 kamar backfill in place, room ID dipertahankan, tanpa mutasi resident/occupancy), redesign Admin Kamar bertab (M16C; **M16C-QA PARTIAL diterima** - browser tooling tidak tersedia), Public Room Listing API publik-aman (M16D, validasi **PASS**), UI publik `/kamar` + WhatsApp CTA via `VITE_PUBLIC_WHATSAPP_NUMBER` (M16E, validasi **partial diterima**), final release/handoff (M16F, `docs/16-room-inventory-booking/M16_FINAL_RELEASE_HANDOFF.md`). **Public booking NOT production-ready; booking leads & pembayaran booking online deferred; konfirmasi manual/WhatsApp adalah jalur MVP.** Tanpa nomor kamar eksak dan tanpa PII pada permukaan publik.
- **M17 (A-E) Booking Lead MVP - selesai dengan limitasi tercatat** (2026-07-08): architecture/UX/safety freeze (M17A), backend API booking lead (M17B: migrasi additive `booking_leads`, `POST /api/v1/public/booking-leads` write-only rate-limited + duplicate protection, `GET /api/v1/booking-leads` + `PATCH /api/v1/booking-leads/:id/status` RBAC/property-scoped, audit masked; validasi **PASS**), Admin UI "Minat Booking" `/booking-leads` (M17C; **QA PASS dengan limitasi browser**), form publik "Ajukan Minat Booking" di `/kamar` dengan anonymous POST (M17D; **QA PASS dengan limitasi browser**), final release/handoff (M17E, `docs/17-booking-leads/M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`). **Booking lead BUKAN booking terkonfirmasi: tanpa reservasi/pembayaran/invoice/occupancy/resident otomatis, tanpa nomor kamar eksak; konfirmasi admin via WhatsApp tetap source of truth; public booking NOT production-ready.**

Smart Lock (jangan overclaim):

- Eksekusi fisik live `remote_unlock`: **NO-GO** sampai syarat site trial M13F-C4 (approvals, rotasi kredensial, mapping perangkat nyata, site-env dry-run, sign-off) terpenuhi.
- Remote lock, temporary PIN, resident unlock, dan fleet rollout: **NO-GO** / belum tersedia.
- Smart Lock live integration TIDAK complete tanpa evidence site trial nyata yang diterima.

Deferred (jangan dianggap selesai):

- **Payment Gateway production activation / Midtrans production readiness** - pending/gated (sandbox/staging selesai via M15C; jangan gunakan production keys; butuh notification URL production, QA payment production, checklist deployment production, dan approval stakeholder).
- Receipt / nota (milestone mendatang).
- Smart Lock live site trial (M13F-C5) - pending/gated; execution pending.
- Smart Lock frontend live command UI - dilarang sebelum live trial backend sukses (M13F-D rule 4).
- CCTV live integration.
- Chat attachment (tidak didukung fase ini).
- Video upload (tidak didukung fase ini).
- Reports export (`/reports/exports`).
- Audit viewer (`/audit/*`).
- Pembayaran booking online (deferred; hanya setelah aktivasi payment production - track terpisah; jalur MVP tetap konfirmasi manual/WhatsApp). Booking lead MVP (M17) selesai untuk staging/demo, tetapi lead BUKAN booking/pembayaran online.
- Otomasi lead: auto-expiry, notifikasi otomatis, retensi/anonimisasi PII otomatis, konversi otomatis ke resident/occupancy (konversi tetap manual admin).
- Foto/media kamar, katalog fasilitas, halaman SEO per kategori/gender (fase lanjut public listing).

Catatan: upload bukti pembayaran manual adalah jalur fallback/manual dan tetap tersedia berdampingan dengan pembayaran online gateway (sandbox); verifikasi admin tetap otoritas settlement manual; invoice gateway-paid terkonfirmasi otomatis via webhook tanpa verifikasi manual.

## Next Milestone

- **M17 selesai sampai M17E (2026-07-08): Booking Lead MVP** (`docs/17-booking-leads/`; penutup `M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`) - freeze (M17A), backend API tervalidasi **PASS** (M17B), Admin UI "Minat Booking" (M17C; QA PASS dengan limitasi browser), form publik "Ajukan Minat Booking" di `/kamar` (M17D; QA PASS dengan limitasi browser), final handoff (M17E). Booking lead BUKAN booking terkonfirmasi; konfirmasi admin via WhatsApp tetap source of truth; **public booking tetap NOT production-ready**; Payment Gateway dan Smart Lock tidak disentuh.
- **M18A selesai (2026-07-08): Public Hunian Catalog Content / UX Freeze** (`docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_CONTENT_UX_FREEZE.md`; dokumentasi saja, frozen/mengikat untuk M18B+). Katalog publik menampilkan penawaran level hunian/unit/grup - BUKAN kamar eksak; model "Hunian Catalog Item" public-safe; arah UI modern ala hotel/apartemen; listing `/kamar` + detail `/kamar/$slug`; konten placeholder-first (master data menyusul); lead + WhatsApp tetap jalur booking; **payment booking tetap DEFERRED**; **public booking tetap NOT production-ready**.
- **Berikutnya: implementasi Public Hunian Catalog (M18B-M18G)** - backend/public catalog API + slug, redesign listing modern, halaman detail, enrichment master data, QA eksternal, final handoff; tanpa payment gateway booking. Jalur alternatif tetap valid tergantung keputusan produk: production hardening, Smart Lock real site trial (M13F-C5), payment production activation readiness (Midtrans production keys backend-only, notification URL production, QA payment production, checklist deployment production, dan approval stakeholder), atau CCTV planning. Independen dari jalur yang dipilih: jadwalkan browser visual QA (M16C/M16E/M17C/M17D) saat tooling browser tersedia.

## Prinsip Arsitektur (Mengikat)

- Backend adalah titik penegakan kebijakan final; validasi frontend bersifat UX-only.
- PostgreSQL adalah system of record; Redis hanya runtime/cache/queue/rate-limit.
- Property scoping wajib pada semua resource operasional.
- Resident self-scope ditegakkan oleh backend, bukan oleh frontend.
- Tidak ada URL file publik; preview file melalui akses terotorisasi yang dimediasi backend (`GET /files/:fileId/content`); `storage_path` tidak pernah diekspos ke frontend.
- Upload bersifat bounded dan storage-conscious (2 MB gambar / 5 MB PDF, rate limit, cleanup policy).
- Provider secrets (Midtrans server key, kredensial Tuya, dsb.) backend-only: tidak pernah di frontend env/bundle, repo, docs, atau log.

## Package Manager

Monorepo menggunakan npm workspaces. File Bun dari project asal tidak dibawa agar hanya ada satu package manager.
