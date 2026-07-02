# Changelog

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
