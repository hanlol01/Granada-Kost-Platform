# Project Handoff

> Diperbarui: 2026-07-08 (M17E). Dokumen serah terima kondisi proyek untuk engineer/agen berikutnya.
> Versi sebelumnya (M16F, 2026-07-07) belum memuat track M17 Booking Lead MVP.

## Status Saat Ini

- Monorepo npm workspaces: `apps/admin`, `apps/penghuni`, `backend/api` (NestJS live), `packages/api-client` (frozen M11B per ADR-FE-001), `packages/domain`.
- Backend Phase 1 selesai (M2-M10E): IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint + Maintenance, Vehicle + Parking, Notification, Smart Lock foundation (simulated gateway).
- Frontend Phase 1 selesai (M11A-M11G). QA-01 Final Regression PASS (2026-07-02).
- M12 (A-H) selesai dan tervalidasi: File API backend-mediated, generic upload engine, upload bukti pembayaran manual Penghuni, lampiran komplain (backend + UI create), preview/review Admin. QA-M12G security boundary PASS; QA-M12H visual E2E PASS.
- M13 selesai sampai M13F-D: fondasi backend Smart Lock live Tuya/PALOMA (provider config + client, read-only diagnostic/sync, command guard fail-closed, guarded live unlock transport). Status dibekukan: **"ready for controlled site trial preparation, execution pending"**. Eksekusi live unlock fisik BELUM pernah dilakukan dan tetap **NO-GO**.
- M14A-M14E selesai: Production Readiness Audit (M14A), API Regression & Security Smoke **PASS** (M14B), Browser Regression / Internal Demo Flow **PASS** (M14C, Hybrid Interactive Login), Internal Demo Script Refresh (M14D), refresh dokumentasi (M14E).
- M14F selesai (2026-07-04): Release Readiness Verdict - **Internal Demo READY, Production NOT READY, Smart Lock live execution NO-GO / site trial pending** (`docs/14-production-readiness/RELEASE_READINESS_VERDICT.md`).
- M15A selesai: paket delivery demo internal / stakeholder review (`docs/15a-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md`).
- M15B-A selesai: VPS staging baseline smoke + environment hardening **PASS** - Admin `https://kelola.kostation.web.id`, Penghuni `https://app.kostation.web.id`, API `https://api.kostation.web.id`.
- M15C (A-G) selesai: **Payment Gateway sandbox/staging ready** - Midtrans Sandbox validated (Snap session + signed webhook settlement, M15C-D), frontend Penghuni "Bayar Online" + Admin tab "Online" (M15C-E2A/E2B), Sandbox E2E QA **PASS** (M15C-F/F2), documentation/release update (M15C-G). **Production payment activation pending; Payment Gateway is not production-ready.**
- M16 (A-0 sampai F) selesai (2026-07-07): Room Inventory & Public Booking MVP - normalisasi data kamar (163/123/40; Putra 99/Putri 64; PII masked), architecture/UX freeze, schema + staging backfill additif (26 `room_buildings`, 163 kamar in place, room ID dipertahankan), Admin Kamar bertab (M16C-QA **PARTIAL diterima**), Public Room Listing API (**PASS**), UI publik `/kamar` + WhatsApp CTA via `VITE_PUBLIC_WHATSAPP_NUMBER` (validasi **partial diterima**), final handoff `docs/16-room-inventory-booking/M16_FINAL_RELEASE_HANDOFF.md`. **Public booking NOT production-ready**; booking leads & pembayaran booking online deferred.
- M17 (A-E) selesai (2026-07-08): Booking Lead MVP - architecture/UX/safety freeze (M17A), backend API booking lead tervalidasi **PASS** (M17B: migrasi additive `booking_leads`, public endpoint write-only rate-limited + duplicate protection, admin list/status RBAC/property-scoped, audit masked), Admin UI "Minat Booking" `/booking-leads` (M17C; **QA PASS dengan limitasi browser**), form publik "Ajukan Minat Booking" di `/kamar` dengan anonymous POST (M17D; **QA PASS dengan limitasi browser**), final handoff (M17E, `docs/17-booking-leads/M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`). Booking lead BUKAN booking terkonfirmasi; tanpa reservasi/pembayaran/invoice/occupancy/resident otomatis; tanpa nomor kamar eksak publik; konfirmasi admin via WhatsApp tetap source of truth. **Booking Lead MVP READY untuk internal/demo/staging dengan konfirmasi admin/manual; public booking tetap NOT production-ready**; Payment Gateway dan Smart Lock tidak disentuh.
- **Internal demo: READY.** **Production: NOT READY** (belum disetujui rilis production).
- Seluruh QA dijalankan eksternal (Codex) atau hybrid manual; agen dokumentasi tidak menjalankan validasi terminal.

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

- **Bukti pembayaran manual adalah jalur fallback/manual** - **manual payment proof remains fallback**, bukan pengganti payment gateway. Proof masuk `pending_review`.
- **Verifikasi Admin adalah satu-satunya otoritas settlement manual** - tagihan tidak otomatis lunas setelah upload bukti.
- **Pembayaran online (Payment Gateway, M15C) hanya sandbox/staging**: Penghuni "Bayar Online" membuka halaman pembayaran Midtrans Sandbox (Snap); **webhook is the source of truth** - invoice lunas hanya dari webhook bertanda tangan yang terverifikasi; **redirect is UX only** dan tidak pernah menandai lunas; duplicate webhook idempoten.
- **Invoice gateway-paid terkonfirmasi otomatis** ("Terkonfirmasi Otomatis" di Admin tab "Online") - baris gateway tidak memakai verify/reject manual; verify/reject tetap hanya untuk bukti manual.
- Bukti manual disembunyikan/diblokir saat invoice lunas (guard backend `PAYMENT_INVOICE_ALREADY_PAID`).
- **Lampiran komplain bersifat opsional** (0-5 foto, JPEG/PNG maks 2 MB).
- Resident complaint create (dengan/tanpa lampiran) dan Admin preview lampiran sudah **operasional**.

## Payment Gateway Posture (M15C - Mengikat)

- Status: **Payment Gateway sandbox/staging ready; Midtrans Sandbox validated; production payment activation pending; Payment Gateway is not production-ready.**
- Yang bekerja di VPS staging (evidensi: `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md`, M15C-F/F2 PASS):
  - "Bayar Online" bekerja dari UI Penghuni; halaman Snap/pembayaran Midtrans Sandbox terbuka.
  - Settlement via signed webhook menandai invoice lunas (atomik, idempoten); duplicate webhook idempoten; invalid signature ditolak.
  - Admin tab "Online" menampilkan transaksi gateway (badge Gateway / "Terkonfirmasi Otomatis" / "Perlu Tinjauan"); baris gateway-paid tanpa verify/reject manual.
  - Manual payment proof tetap fallback; paid-guard bukti manual utuh.
- Postur env wajib untuk staging payment testing (nilai secret tidak pernah dicatat/di-commit):

```text
PAYMENT_GATEWAY_ENABLED=true
PAYMENT_GATEWAY_PROVIDER=midtrans
MIDTRANS_ENV=sandbox
MIDTRANS_SERVER_KEY=<sandbox, backend-only, uncommitted>
MIDTRANS_CLIENT_KEY=<sandbox; hanya jika dibutuhkan/publishable - saat ini Snap.js tidak diaktifkan>
PAYMENT_RETURN_URL=https://app.kostation.web.id/billing
PAYMENT_CANCEL_URL=https://app.kostation.web.id/billing
PAYMENT_WEBHOOK_BASE_URL=https://api.kostation.web.id
SMART_LOCK_PROVIDER=simulated
SMART_LOCK_LIVE_ENABLED=false
```

- Notification URL Midtrans Sandbox: `https://api.kostation.web.id/api/v1/payment-gateways/midtrans/webhook`.
- Larangan keras: server key tidak pernah mencapai frontend/repo/log; tidak ada raw provider payload ke frontend; **jangan gunakan Midtrans production keys** di environment mana pun pada fase ini.

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
- `docs/15b-deployment/VPS_STAGING_BASELINE_SMOKE_ENV_HARDENING.md` - M15B-A staging baseline smoke + env hardening (PASS).
- `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` - M15C-F/F2 payment gateway sandbox E2E QA (verdict PASS; hybrid manual browser QA + signed webhook settlement + idempotency).
- Pendukung: `artifacts/m12h-final-demo-pass/`, `artifacts/internal-demo/` (baseline QA-01).

## Public Room Listing / Booking Posture (M16 - Mengikat)

- Status: **public room listing live sebagai MVP staging/demo; public booking NOT production-ready.**
- API publik (M16D; unauthenticated, rate-limited Redis): `GET /api/v1/public/rooms/summary`, `GET /api/v1/public/rooms/availability`, `GET /api/v1/public/rooms/groups/:groupKey`. Hanya data agregat aman: **tanpa room ID, `room_code`, nomor kamar eksak, atau PII tenant/resident/occupancy**; hanya kamar `vacant` + `public_visible` (kamar + building) yang dihitung; filter gender/kategori ditegakkan backend.
- UI publik (M16E): route `/kamar` di `apps/penghuni` (di luar AuthGuard, tanpa login), filter gender Putra/Putri + kategori, kartu ketersediaan agregat, CTA WhatsApp dengan template terisi.
- Konfigurasi: **`VITE_PUBLIC_WHATSAPP_NUMBER`** (frontend env tervalidasi, default kosong). Jika kosong/tidak valid: CTA disabled dengan teks "Nomor WhatsApp admin belum dikonfigurasi." - tidak pernah menghasilkan URL `wa.me` invalid. Jangan pernah hardcode nomor. (Terpisah dari `VITE_ADMIN_WHATSAPP_PHONE` untuk fallback upload file.)
- Alur booking MVP: konfirmasi manual admin via WhatsApp. **Booking lead tersimpan tersedia sejak M17 (lihat posture M17 di bawah); tetap tanpa pembayaran online booking dan tanpa keterlibatan Payment Gateway.** Nomor kamar eksak dikonfirmasi admin, tidak pernah tampil publik.
- Limitasi tercatat: browser visual QA M16C/M16E belum dieksekusi (tooling tidak tersedia di VPS); lint global penghuni terblokir baseline formatting Payment/Billing yang tidak terkait; `routeTree.gen.ts` diperbarui manual dan akan di-regenerate pada build berikutnya.

## Booking Lead Posture (M17 - Mengikat)

- Status: **Booking Lead MVP READY untuk internal/demo/staging dengan konfirmasi admin/manual; public booking NOT production-ready.** Dokumen penutup: `docs/17-booking-leads/M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`.
- Lead adalah minat, BUKAN booking terkonfirmasi: tanpa reservasi kamar, tanpa mutasi status kamar, tanpa pembayaran/invoice, tanpa occupancy/resident otomatis; konversi ke penghuni tetap manual via alur admin existing (`converted` hanya penanda manual).
- API publik: `POST /api/v1/public/booking-leads` - unauthenticated **write-only**, rate limit Redis (5/15 menit/IP), duplicate protection (respons sukses sama tanpa baris ganda), menolak field tak dikenal (`roomId`/`roomCode`/nomor kamar eksak/`propertyId`), respons hanya acknowledgment aman (tanpa echo PII/pesan/property ID/room data).
- API admin: `GET /api/v1/booking-leads` + `PATCH /api/v1/booking-leads/:leadId/status` - JWT + RBAC (manager/admin; `room.read`/`room.manage`), property-scoped; transisi status backend-enforced (new -> contacted -> visit_scheduled -> converted; rejected/expired; terminal locked); audit masked (tanpa full phone/pesan).
- UI: Admin `/booking-leads` ("Minat Booking"); publik `/kamar` CTA "Ajukan Minat Booking" + dialog form (nama + nomor WhatsApp wajib; tanggal/catatan opsional; honeypot; PII di-clear saat dialog ditutup); anonymous POST tanpa Authorization header dan tanpa refresh-token flow; CTA WhatsApp existing tetap tersedia dan tetap jalur konfirmasi utama.
- Konfigurasi: migrasi `014_booking_leads.sql` wajib diterapkan; Redis wajib untuk rate limit; tanpa env var baru (`VITE_PUBLIC_WHATSAPP_NUMBER` dipakai ulang untuk follow-up; kosong = tombol follow-up disembunyikan dengan aman); tanpa perubahan `packages/api-client`.
- PII minimum (nama, phone ternormalisasi, catatan/tanggal opsional), hanya terbaca via admin ber-auth; tanpa dokumen identitas/upload/payment field; rekomendasi retensi/anonimisasi lead terminal (M17A Section 9) belum diotomasi - konfirmasi sebelum pertimbangan production.
- Limitasi tercatat: browser visual QA M17C/M17D belum dieksekusi (QA PASS dengan limitasi browser).

## Blocker Diketahui (Production)

- **Payment production**: Midtrans production keys/aktivasi belum dikonfigurasi; notification URL production belum di-set; QA payment production belum dijalankan. **Production payment activation pending.**
- Deployment/env checklist production belum dieksekusi (M14A Section 8); storage masih local-disk (S3 swap + otomasi cron cleanup deferred); endpoint `/audit/*` dan `/reports/exports` belum tersedia.
- Approval stakeholder / release owner final masih pending (M14F Section 4).
- Smart Lock live site trial pending (M13F-C5): approvals, person-at-door, manual key holder, dan window uji yang disetujui belum ada - blocker jika Smart Lock termasuk scope production.
- Konfirmasi tertulis rotasi kredensial (C-07) pending untuk semua yang pernah ada di PoC/history.
- Mapping perangkat nyata + evidence site-env dry-run pending (B-23 baru partially closed di env placeholder).

## Langkah Operator Berikutnya

1. Demo internal/stakeholder: gunakan `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` (M14D) + `docs/15a-stakeholder-demo/INTERNAL_DEMO_DELIVERY_PACKAGE.md` (M15A). Payment Gateway boleh didemokan **staging/sandbox only** (lihat `INTERNAL_DEMO_CHECKLIST.md` Section 14) - jangan presentasikan sebagai aktivasi payment production.
2. Putuskan jalur **M15D/M16** (keputusan produk): production hardening, Smart Lock real site trial (M13F-C5), CCTV planning, atau payment production activation readiness.
3. Jika memilih payment production activation readiness: siapkan Midtrans production keys/aktivasi (backend-only, tidak pernah di repo), notification URL production, QA payment production, checklist deployment production, dan approval stakeholder. Sampai seluruhnya selesai: **production payment activation pending** dan **Payment Gateway is not production-ready**.
4. Jika lanjut site trial Smart Lock: lengkapi M13F-C4 Sections 6-7 (evidence + sign-off) sebelum M13F-C5. Jangan set `SMART_LOCK_LIVE_ENABLED=true` di luar window yang disetujui.
5. Untuk production umum: eksekusi deployment/env checklist M14A Section 8 dan tutup blocker P0-P2 (M14A Section 5, M14F Section 4).

## Deferred (Jangan Dianggap Selesai)

- Payment Gateway production activation / Midtrans production readiness (sandbox/staging selesai via M15C).
- Receipt / nota.
- Pembayaran booking online (deferred; jalur MVP tetap konfirmasi manual/WhatsApp - booking lead M17 BUKAN booking/pembayaran online).
- Otomasi lead: auto-expiry, notifikasi otomatis, retensi/anonimisasi PII otomatis, konversi otomatis ke resident/occupancy (konversi tetap manual admin).
- Katalog publik detail hunian/unit, foto/galeri, fasilitas, kebijakan, FAQ, SEO (rekomendasi track M18).
- Foto/media kamar, katalog fasilitas, halaman SEO public listing (fase lanjut).
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
- Provider secrets (Midtrans server key, kredensial Tuya) backend-only; tidak pernah di frontend env/bundle, repo, docs, atau log.

Rujukan utama: `PROJECT_MASTER.md`, `ROADMAP.md`, `docs/README.md` (indeks), `DEVELOPMENT_WORKFLOW.md` (pembagian peran agen dan validasi), `docs/14-production-readiness/` (M14A-M14F), `docs/15b-deployment/` (M15B-A), `docs/15c-payment-gateway/` (M15C).
