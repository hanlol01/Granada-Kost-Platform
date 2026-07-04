# Changelog

## 2026-07-04

### M14E - Documentation / Roadmap / Handoff Refresh
- `PROJECT_MASTER.md`, `ROADMAP.md`, `CHANGELOG.md`, `PROJECT_HANDOFF.md`, dan `INTERNAL_DEMO_CHECKLIST.md` diperbarui pasca M12/M13/M14A-M14D.
- Status resmi: **internal demo READY**, **production NOT READY**. Smart Lock: **"ready for controlled site trial preparation, execution pending"**; eksekusi live tetap NO-GO.
- `INTERNAL_DEMO_CHECKLIST.md` Section 13: pointer ke skrip demo M14D + cakupan demo aman + larangan overclaim Smart Lock.
- Dokumentasi saja. Tidak ada perubahan kode. Tidak ada QA/validasi terminal dijalankan oleh agen dokumentasi.

### M14D - Internal Demo Script Refresh
- `docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md` dibuat: skrip demo internal aman dan repeatable (segmen A-K bersegmen waktu, naskah presenter Bahasa Indonesia, skrip payment proof + complaint attachment, batasan kata Smart Lock, security talking points, fallback plan, referensi artefak). Dokumentasi saja.

### M14C - Browser Regression / Internal Demo Flow
- Verdict **PASS** (eksekusi eksternal via Codex; **Hybrid Interactive Login** + regression otomatis pasca-login pada profil Chrome terisolasi). 0 temuan leakage; tanpa fatal console error. Evidensi: `artifacts/m14c-browser-regression/` (qa-summary + 20 screenshot) dan `docs/14-production-readiness/BROWSER_REGRESSION_INTERNAL_DEMO_FLOW.md`.

### M14B - API Regression & Security Smoke
- Verdict **PASS** (eksekusi eksternal via Codex; commit `5f1b96b`): auth/session, RBAC/role boundary, property/self scope, File API, manual payment proof (tetap `pending_review`, invoice tidak otomatis lunas), complaint attachment, Smart Lock read-only + command guard (fail-closed, live disabled), audit/leakage. Evidensi: `artifacts/m14b-api-regression-smoke/` dan `docs/14-production-readiness/API_REGRESSION_SECURITY_SMOKE.md`.

### M14A - Production Readiness Audit
- Audit readiness pasca M12+M13: **internal demo READY**, **production NOT READY**; feature readiness matrix, klarifikasi status Smart Lock (execution pending), production blockers P0-P2, deployment/env checklist (belum dieksekusi), documentation gaps, QA track M14B-M14F. `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md`. Dokumentasi saja.

### M13 (rekap A sampai F-D) - Smart Lock Live Backend Foundation (Tuya/PALOMA)
- Fondasi backend selesai: site readiness plan (M13A), architecture freeze (M13B), provider config + client (M13C), read-only diagnostic (M13D), read-only sync dengan provider ID ter-mask (M13E), safety freeze (M13F-A), command guard fail-closed (M13F-B), site trial runbook (M13F-C1), guarded live unlock transport `remote_unlock`/`emergency_unlock` (M13F-C2), dry-run live-disabled PASS setelah fix leakage `757b0db9` (M13F-C3), Go/No-Go: CONDITIONAL GO persiapan / NO-GO eksekusi (M13F-C4), sanitized evidence pack `artifacts/m13f-c4-site-evidence-pack/` (M13F-C4.1).
- M13F-D membekukan status: **"Ready for controlled site trial preparation, execution pending."** Eksekusi live unlock fisik BELUM pernah dilakukan; `SMART_LOCK_LIVE_ENABLED` tetap `false`. Smart Lock live integration TIDAK complete tanpa site trial nyata.

### M12 (rekap) - File Upload / Manual Payment Proof / Complaint Attachment
- Track M12 (A-H) selesai dan tervalidasi: File API backend-mediated (ADR-BE-FILE-001), generic upload engine, upload bukti pembayaran manual (`pending_review`; verifikasi admin = otoritas settlement), lampiran komplain 0-5 foto transaksional, preview/review Admin. QA-M12G security boundary PASS + QA-M12H visual E2E PASS (detail pada entri 2026-07-03 di bawah); re-regression M14B/M14C PASS.

## 2026-07-03

### M12H - Final Visual E2E Demo Pass Documentation
- Evidensi **QA-M12H Final Visual E2E Demo Pass** untuk permukaan M12 dicatat - dijalankan eksternal via Codex GPT-5.5 High, verdict **PASS**: seluruh Scope A-F PASS (A: payment proof manual Penghuni, B: preview proof Admin, C: complaint create tanpa lampiran, D: complaint create dengan lampiran, E: preview lampiran komplain Admin, F: negative file UX).
- Security checks PASS: tanpa `storage_path`/`storagePath`, tanpa URL file publik, preview/content hanya via `GET /api/v1/files/:fileId/content`. Tanpa fatal console error; tanpa 400/500 tak terduga pada happy path.
- Evidensi: `artifacts/m12h-final-demo-pass/m12h-final-result.json` + 15 screenshot di `artifacts/m12h-final-demo-pass/`. Git status aman untuk source/docs (hanya direktori artifact yang untracked).
- `INTERNAL_DEMO_CHECKLIST.md` Section 12: subseksi Visual E2E demo pass (QA-M12H) ditambahkan; catatan Section 6 diperbarui (QA visual tidak lagi PENDING).
- `Week_3_Kostation.md` diperbarui dengan hasil QA-M12H. `PROJECT_HEALTH_REVIEW_V1.md`: catatan status singkat ditambahkan.
- Patch: hasil validasi M12D yang telah selesai dicatat sebagai **PASS** (eksternal via Codex GPT-5.5 High); catatan stale "validasi M12D dijadwalkan" dihapus dari dokumen terkait.
- Dokumentasi saja. Tidak ada perubahan kode. QA dijalankan eksternal oleh Codex, bukan oleh agen dokumentasi.

### M12G - Security QA Evidence & Handoff Docs Refresh
- Evidensi **QA-M12G Cross-Scope File Security Boundary Verification** dicatat - dijalankan eksternal via Codex GPT-5.5 High, verdict **PASS**: auth boundary (401), resident self-scope (200/403), cross-property scoped denial (403), attach resident/purpose salah (400), file terhapus (404/400), tanpa 500 tak terduga, 0 baris orphan pada complaint/complaint_files/payment proof/payment_proof_files, tanpa `storage_path`, tanpa URL file publik (konten hanya via `GET /api/v1/files/:fileId/content`).
- `INTERNAL_DEMO_CHECKLIST.md` Section 12: item lintas-scope PENDING -> PASS; subseksi Security Boundary (QA-M12G) ditambahkan dengan keterbatasan uji yang tercatat.
- `PROJECT_HANDOFF.md` ditulis ulang dari kondisi stale ("backend belum discaffold") ke kondisi aktual: status M12C1-M12D/M12E/M12F/M12G, catatan arsitektur file upload, alur operasional (manual proof = fallback, verifikasi admin = otoritas settlement), daftar deferred.
- `DEVELOPMENT_WORKFLOW.md`: perintah backend/typecheck/migrasi ditambahkan; pembagian peran agen dan validasi didokumentasikan (Duo/Claude = dokumentasi + implementasi tanpa klaim validasi; Codex = shell/API/browser validation; Principal/QA/Release role separation).
- `Week_3_Kostation.md` diperbarui dengan hasil QA-M12G.
- Dokumentasi saja. Tidak ada perubahan kode. QA dijalankan eksternal oleh Codex, bukan oleh agen dokumentasi.

### M12F - Project State Hardening & API Documentation Refresh
- `PROJECT_MASTER.md`: status proyek per 2026-07-03 (M12C1-M12D selesai), daftar deferred eksplisit, prinsip arsitektur mengikat; backend tidak lagi berstatus "terencana".
- `BACKLOG.md`: item selesai dianotasi keluar dari backlog aktif; TD-004 (File Metadata Integration) ditandai Resolved oleh M12C1; section tindak lanjut File & Upload ditambahkan.
- `API_PLANNING.md`: section status implementasi M12 - endpoint file yang shipped didokumentasikan dengan rute aktual, aktor/role, auth, perilaku metadata aman, tanpa `storage_path`, preview backend-mediated; `access-url`/`access-logs` ditandai belum shipped.
- `docs/09-progress/Week_3_Kostation.md` dibuat (laporan mingguan M12A-M12F); indeks 09-progress dan `docs/README.md` diperbarui.
- `INTERNAL_DEMO_CHECKLIST.md` Section 12: status dicatat sesuai evidensi QA M12C/M12D; satu pemeriksaan lintas-scope tetap PENDING. Tidak ada QA baru dijalankan pada M12F.
- Dokumentasi saja. Tidak ada perubahan kode. Tidak ada perintah validasi yang dijalankan.

### M12E - Documentation & Project State Refresh
- `docs/README.md` ditulis ulang sebagai indeks lengkap (termasuk 09-progress, 10-frontend, 11-qa, 12-product-readiness) dengan peta dokumen File Upload / Payment Proof / Complaint Attachment.
- `ROADMAP.md`: M12A-M12D dicatat selesai dengan ringkasan deliverable; daftar Next Milestone diperbarui.
- `PROJECT_HEALTH_REVIEW_V1.md`: Addendum 2026-07-03 (File API live, alur bukti pembayaran manual dan lampiran komplain operasional, R-02 ditutup, item deferred tidak berubah).
- `INTERNAL_DEMO_CHECKLIST.md`: Section 12 berisi item demo M12 (positif + negatif) berstatus PENDING QA.
- Dokumentasi saja. Tidak ada perubahan kode. Tidak ada perintah validasi yang dijalankan pada milestone ini.

### M12D - Penghuni Complaint Create UI + Attachment
- Form buat tiket Penghuni live: kategori, judul, deskripsi, lokasi (kamar sendiri / area umum + catatan lokasi).
- Lampiran opsional 1-5 foto (JPEG/PNG, maks 2 MB per foto) via upload engine M12C2 dengan purpose `complaint_attachment`, kompresi client-side, preview blob terotorisasi.
- `POST /my/complaints` dengan `file_ids` hanya jika ada lampiran; saat submit gagal, preview lampiran dipertahankan sehingga retry tidak perlu upload ulang.
- Backend aditif: `GET /my/complaints/categories` (resident-safe, properti dari occupancy aktif) menutup blocker kategori resident-scope.
- WhatsApp fallback saat upload gagal, file terlalu besar, atau submit gagal.
- Validasi selesai dengan PASS (Update 2026-07-03, eksternal via Codex GPT-5.5 High): `lint:penghuni` PASS (setelah perbaikan format Prettier terbatas), typecheck penghuni PASS, `build:penghuni` PASS, `lint:api` PASS, `build:api` PASS, `git diff --check` bersih (hanya warning line-ending Git). Perbaikan minimal Prettier-only pada 3 file penghuni, tanpa perubahan logika. (Lihat `PENGHUNI_COMPLAINT_CREATE_ATTACHMENT_IMPLEMENTATION.md`.)

### M12C5 - Admin File Preview / Review
- Endpoint metadata: `GET /payment-proofs/:proofId/files` dan `GET /complaints/:complaintId/files` (respons aman via `FileService.toResponse()`, tanpa `storage_path`).
- Admin Payments: PendingProofList + PaymentProofReviewDialog (thumbnail lampiran, FilePreviewModal full-size, verify/reject di dalam dialog).
- Admin Complaints: ComplaintAttachments di detail komplain.
- Seluruh preview melalui authorized blob fetch - tanpa URL storage publik. Validasi tercatat di dokumen implementasi.

### M12C4 - Complaint Attachment Backend Readiness
- `POST /my/complaints` menerima `file_ids` opsional (maks 5 unik, purpose `complaint_attachment`). Backward compatible.
- Validasi otoritatif: file ada, tidak soft-deleted, purpose tepat, properti sama, di-upload oleh resident yang sama.
- Attach transaksional: complaint + history + `complaint_files` dalam satu transaksi PostgreSQL dengan rollback utuh.
- Audit `complaint.file_attach`. Validasi tercatat di dokumen implementasi.

### M12C3 - Penghuni Manual Payment Proof Upload
- Penghuni upload bukti manual lalu submit `POST /my/payment-proofs` dengan `file_ids` (maks 3, purpose `payment_proof`).
- Proof berstatus `pending_review`; verifikasi admin tetap satu-satunya otoritas settlement - tagihan tidak otomatis lunas.
- Placeholder `PayActionDisabled` diganti alur upload nyata di billing Penghuni; WhatsApp fallback saat upload gagal / file terlalu besar.
- Audit `payment_proof.submit` mencakup file IDs. Validasi tercatat di dokumen implementasi.

### M12C2 - Generic Frontend Upload Engine (2026-07-02)
- `packages/domain/src/file.ts`: purpose policies, limits storage-conscious, error codes, kompresi constants.
- Hooks `useFileUpload` / `useFilePreview` / `useFileDelete` dan komponen `FilePickerButton` / `FilePreview` / `FilePreviewModal` / `FileUploadProgress` / `WhatsAppFallbackButton` untuk Admin dan Penghuni.
- Kompresi gambar canvas (max 1600px, JPEG 0.75); preview via authorized blob fetch dengan token dari `getAccessToken()`.
- Tanpa dependency npm baru; tanpa perubahan `packages/api-client` (frozen M11B). Validasi tercatat di dokumen implementasi.

### M12C1 - Backend File API Foundation (2026-07-02)
- Migration `011_files.sql`: tabel `files` sebagai source of truth metadata file di PostgreSQL.
- Endpoint `POST /files`, `GET /files/:id`, `GET /files/:id/content`, `DELETE /files/:id` (soft-delete) - seluruh akses dimediasi backend per ADR-BE-FILE-001.
- Validasi otoritatif: MIME allowlist per purpose, magic bytes (`file-type`), 2 MB gambar / 5 MB PDF, blocklist ekstensi berbahaya, checksum SHA256, rate limit upload, audit lifecycle lengkap (upload/download/delete/denied).
- Storage provider abstraction (`LocalFileStorage`, siap S3). Tidak ada URL storage publik; direktori upload di luar web root.

Deferred (tidak berubah): payment gateway/Midtrans, receipt/nota, Smart Lock live Tuya/PALOMA, CCTV live, chat attachment, video upload.

## 2026-07-02

### QA-01 Final Regression

Added
- Final browser regression completed.
- Internal Demo Checklist updated.
- QA-01-BUG-001 closed.
- QA-01-BUG-002 closed.
- Bug Triage updated.

Validation
- Admin Build PASS
- Penghuni Build PASS
- Admin Lint PASS
- Penghuni Lint PASS
- Admin Typecheck PASS
- Penghuni Typecheck PASS

Status
- Internal Demo Ready.
- Milestone 11 completed.
## 2026-07-01

### Frontend Phase 1 Demo Readiness (M11G / M11GV)
- M11G selesai: Reports + Audit Minimum di Admin live dengan agregasi Phase 1 dan Audit/Export placeholder eksplisit.
- M11GV PASS: lint, typecheck, dan build untuk Admin + Penghuni berhasil.
- Frontend Admin/Penghuni Phase 1 dinyatakan demoable.
- Admin demoable: Dashboard, Rooms, Tenants, Payments, Complaints, Vehicles, Parking, Reports.
- Penghuni demoable: Home, Billing, Complaints read, Notifications, Info, Profile/session.
- Fitur deferred tetap eksplisit: Smart Lock real UI, CCTV preview, Booking, Chat, File upload fisik, Audit endpoint, dan Reports export.

## 2026-06-17

### Backend Foundation
- NestJS bootstrap
- PostgreSQL foundation
- Redis foundation
- Health Check
- Validation
- Exception Filter
- Logger

### IAM + RBAC
- Users
- Roles
- Permissions
- User Sessions
- JWT Auth
- Refresh Token Rotation
- Audit Logs

### Property + Room
- Property Module
- Room Module
- Property owner read-only scope
- Room availability endpoint
- Room master fields: `unit_code`, `gender_policy`

### Resident + Occupancy
- Resident Module
- Emergency Contacts
- Occupancy Module
- Check-in and Check-out foundation
- Occupancy history
- Room status sync with active occupancy

### Seed Data
- Core seed Layer 0-4
- Master room seed Layer 5: 163 rooms
- Development seed Layer 6: 10 dummy residents, 8 active occupancies
- Seed validation checks

### Billing
- Billing migration
- Billing repository and service foundation
- Billing API Phase 1
- Development billing seed and workflow validation

### Complaint + Maintenance
- Complaint and maintenance migration
- Repository and service foundation
- Complaint and work order API Phase 1
- Complaint category seed: 10 categories
- Development technician, complaint, and work order seed
- Complaint workflow validation script

## 2026-06-18

### Vehicle + Parking
- Vehicle and parking migration
- Repository, service, helper, and audit foundation
- Vehicle and parking API Phase 1
- Development vehicle seed: 9 dummy vehicles
- Development parking seed: 3 zones and 6 slots
- Vehicle and parking workflow validation script
- Build, lint, dev seed, and workflow validation passed

## 2026-06-19

### Notification
- Notification migration
- Repository, service, provider abstraction, helper, template, and audit foundation
- Notification API Phase 1
- Development notification preference seed: 5 users
- Development in-app notification seed: 8 samples
- Development delivery seed: 5 Brevo email dummy records
- Notification workflow validation script
- Build, lint, dev seed, and workflow validation passed

## 2026-06-26

### Smart Lock
- Smart Lock migration: `009_smart_lock.sql`
- Repository, service, helper, gateway abstraction, and audit foundation
- Tuya gateway skeleton without real provider call
- Smart Lock API Phase 1 through M10E
- RBAC permission mapping: `smart_lock.read`, `smart_lock.manage`, `smart_lock.command`
- Property scope and resident active access grant self-scope
- Command endpoint uses simulated gateway response and rate limit helper
- Build and lint passed

## 2026-06-30

### Frontend Integration Planning (M11A)
- Added `docs/10-frontend/FRONTEND_INTEGRATION_PLAN.md`
- Mapping Admin and Penghuni pages to backend endpoints
- Priority list, milestone sequencing (M11B..M11J)
- Risks, Definition of Done, deferred items documented
- Verdict: ready to proceed to M11B

### Frontend Architecture Freeze (M11AF)
- Added `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md` with ADR-FE-001..ADR-FE-011
- Appended M11AF review addendum (section 23) to `FRONTEND_INTEGRATION_PLAN.md`
- Promoted Vehicle + Parking UI to M11D (backend M8 already done)
- Clarified Dashboard Admin integrated at end of M11C, not first
- Confirmed Smart Lock simulated strategy until M10G real Tuya runtime ships
- Verdict: Frontend Architecture Frozen

### Frontend Foundation (M11B / M11BV)
- `packages/api-client`: fetch wrapper, single-flight refresh queue, idempotency, correlation id, ApiError normalization
- `packages/domain`: shared types, enums, envelopes, error codes, money + date helpers
- Admin app: env validation, query client defaults, AuthProvider + AuthGuard + login/logout/refresh, PropertyProvider with cache-bleed protection, RBAC-aware nav items
- Penghuni app: equivalent foundation pieces wired (login, AuthGuard, base routes)
- Build, lint, typecheck passed

### Admin Core Data (M11C / M11CV)
- Rooms list integrated (`GET /rooms`) with property scope and search
- Residents list integrated (`GET /residents`) with server search + PII masking
- Dashboard summary aggregated from `/rooms`, `/residents`, `/billing/aging-summary`
- Skeleton, empty, filtered-empty, and error states for every list
- Build, lint, typecheck passed

### Admin Operational (M11D / M11DV)
- Billing list integrated (`GET /invoices`, `GET /payments`) with tabs and aging stats
- Complaint list integrated (`GET /complaints`, `GET /complaint-categories`) with status mapping and per-category chart
- Vehicle list integrated (`GET /vehicles`) with status + type filter
- Parking list integrated (`GET /parking/zones`, `GET /parking/slots`) with capacity pill
- All disabled action buttons labeled "tersedia di M11E"
- Build, lint, typecheck passed

### Penghuni Core (M11F)
- Hooks per domain di `apps/penghuni/src/hooks`: `usePenghuniProfile`, `usePenghuniHome`, `usePenghuniBilling`, `usePenghuniComplaints`, `usePenghuniNotifications`, `usePenghuniInfo`.
- Lib penunjang baru: `lib/format.ts`, `lib/idempotency.ts`, `lib/mutation-feedback.ts` (sejajar pola Admin M11E).
- Home (`/_app/`) live: greeting + initials dari `/auth/me`, current invoice dari `/my/invoices` (selector overdue → unpaid → issued), recent payments dari `/my/payments`, badge unread dari `/my/notifications/unread-count`. Pengumuman tetap placeholder.
- Billing (`/_app/billing`) live: list invoice + payment ledger dari `/my/invoices` & `/my/payments`. Filter Semua/Lunas, breakdown subtotal + late-fee + total. Tombol upload bukti tetap disabled dengan label "tersedia setelah File API rilis" (File API belum tersedia).
- Complaints (`/_app/complaints`) live read-only: list dari `/my/complaints`. Tombol Buat Tiket membuka dialog penjelas yang menjelaskan endpoint kategori belum dibuka untuk role resident — submit ditahan.
- Notifications (`/_app/notifications`) live: list `/my/notifications`, optimistic `mark-as-read` per item, `mark-all` via `/my/notifications/read-all`, badge unread dari `/my/notifications/unread-count`.
- Info (`/_app/info`) menampilkan empty-state eksplisit pada tab Pengumuman/Peraturan/FAQ karena belum ada endpoint resident.
- Profile (`/_app/profile`) live: header dari `/auth/me`, list sesi aktif via `/auth/sessions`, revoke sesi `DELETE /auth/sessions/:id`, logout `POST /auth/logout`, logout-all `POST /auth/logout-all`. Field belum tersedia di `/auth/me` (phone, joinDate) ditandai "Belum tersedia". Edit profile tetap disabled (tidak ada `PATCH /penghuni/me` di Phase 1).
- Mutation aktif: mark notification read, mark-all read, revoke session, logout-all. Mutation ditahan: payment proof submit (menunggu File API), complaint create (menunggu kategori resident-scope), edit profil, change password (UX form belum dibangun, hook siap).
- Self-scope: tidak ada `resident_id` yang dikirim dari frontend; seluruh endpoint berbasis `/my/*` dan `/auth/*` mengandalkan identitas token.
- Build, lint, typecheck passed di workspace Penghuni.

### Reports + Audit Minimum (M11G / M11GV)
- Shared selectors `apps/admin/src/lib/reports-selectors.ts`: occupancy, resident, billing aging, revenue (per tahun), complaint, vehicle, parking, maintenance. Fungsi murni, dependency-free, dapat dipakai unit test.
- Hook baru `apps/admin/src/hooks/useReports.ts`: `useQueries` lintas resource (rooms, residents, invoices, payments, complaints, vehicles, parking zones + slots fan-out per zone, work-orders), property-scoped sesuai ADR-FE-005.
- Hook baru `apps/admin/src/hooks/useAuditLogs.ts`: mengembalikan `available: false` karena `/audit/*` belum tersedia di backend; kontrak siap di-swap satu file saat endpoint dirilis.
- Hook baru `apps/admin/src/hooks/useWorkOrders.ts`: read-only list `/work-orders` untuk Maintenance Summary.
- `useDashboardSummary` di-refactor di atas `useReports`; panggilan spekulatif `/billing/aging-summary` (404) dihapus. Dashboard dan Reports kini menghasilkan angka identik karena memakai selector yang sama.
- Halaman `apps/admin/src/routes/reports.tsx` ditulis ulang menggunakan komponen shadcn + recharts existing: KPI strip (revenue tahun terpilih, rata-rata bulanan, total piutang), chart Pendapatan Bulanan, chart Okupansi Kamar, SummaryCard untuk Billing Aging / Pembayaran / Komplain / Maintenance / Kendaraan / Parkir, snapshot Penghuni, dan Audit Viewer section.
- UX coverage: Loading skeleton, Empty / Filtered-empty state per chart, Error state dengan correlation id + tombol Retry, Forbidden state untuk role di luar `owner | manager | admin`, filter tahun aktif, tombol Export disabled dengan tooltip eksplisit.
- Endpoint backend yang dipakai (semuanya sudah live Phase 1): `GET /rooms`, `/residents`, `/invoices`, `/payments`, `/complaints`, `/vehicles`, `/parking/zones`, `/parking/slots`, `/work-orders`. Tidak ada endpoint baru di backend. Tidak ada perubahan ADR.
- Tetap placeholder: Audit Viewer (`/audit/*` belum ada) dan Export laporan (`/reports/exports` belum ada). Tidak ada laporan dummy. Tidak ada export client-side.
- M11GV validation: hook order Reports diperbaiki (RBAC gate dipindah ke parent, body ke child component agar tidak kondisional), parking slots query distabilkan dengan property-scope, format admin dijalankan.
- npm install, lint:admin (0 errors / 15 warnings), lint:penghuni (0 errors / 9 warnings), typecheck admin + penghuni, build admin + penghuni: PASS.

### Admin Operational Mutations (M11E)
- Mutation infrastructure: `lib/idempotency.ts`, `lib/mutation-feedback.ts`, `components/confirm/ConfirmDialog.tsx`
- Domain hooks: `useRoomMutations`, `useResidentMutations`, `useOccupancyMutations` (check-in), `useBillingMutations`, `useComplaintMutations`, `useVehicleMutations`, `useParkingMutations`
- Rooms: create, edit, update status (`POST /rooms`, `PATCH /rooms/:id`, `PATCH /rooms/:id/status`)
- Residents: create, edit, update status (`POST /residents`, `PATCH /residents/:id`, `PATCH /residents/:id/status`)
- Occupancy: completeCheckIn from Tenants (`POST /check-ins`); check-out lifecycle deferred (no occupancy picker)
- Billing: invoice issue + cancel (`POST /invoices/:id/issue`, `.../cancel`); payment verify + reject (`POST /payments/:id/verify`, `.../reject`); invoice create + payment-proof verdict deferred (no HTTP route for proof verdict, no snapshot picker)
- Complaints: acknowledge, resolve, close, reopen, cancel (`POST /complaints/:id/{acknowledge,resolve,close,reopen,cancel}`); assign deferred (no technician picker)
- Vehicles: approve, reject, suspend, reactivate, deactivate (`POST /vehicles/:id/{approve,reject,suspend,reactivate,deactivate}`); create/edit deferred (no resident picker)
- Parking: assign + release slot (`POST /parking/slots/:id/{assign,release}`); zone/slot create deferred
- UX: idempotency-key on every write, react-hook-form + zod inline validation, ConfirmDialog for sensitive verbs with typed reason (MinLength 3) where backend requires, sonner toast with ApiError correlationId, RBAC-aware action visibility, no PII in console
- Build, lint, typecheck passed
