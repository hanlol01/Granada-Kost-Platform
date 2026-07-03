# API PLANNING - Granada Kost Platform

> Versi: 1.0  
> Tanggal: 16 Juni 2026  
> Peran Pembuat: Principal API Architect / Security Architect / NestJS Backend Architect  
> Status: Draft arsitektur API, belum berisi controller, service, module, DTO, migration, SQL, Prisma, atau TypeORM

---

# Executive Summary

Dokumen ini mendefinisikan rencana API profesional untuk backend NestJS Granada Kost Platform. Fokus dokumen adalah batas domain API, RBAC, security, auditability, maintainability, dan scalability. Dokumen ini tidak mendefinisikan kontrak DTO final dan tidak berisi implementasi kode.

Granada Kost Platform memakai dua frontend React + TanStack dalam monorepo:

- `apps/admin` untuk operasional internal.
- `apps/penghuni` untuk PWA mobile-first Penghuni.

Backend direncanakan menggunakan NestJS, PostgreSQL sebagai system of record, dan Redis untuk cache, rate limit, queue, idempotency window, session/token pendek, serta workload async.

Keputusan bisnis final yang menjadi dasar API:

- Satu kamar hanya boleh memiliki satu penghuni aktif.
- Deposit wajib ada.
- Workflow check-in wajib.
- Workflow check-out wajib.
- Booking publik belum diperlukan di Phase 1.
- Payment gateway ditunda ke Phase 2.
- Phase 1 memakai pembayaran manual dan upload bukti pembayaran.
- Smart Lock adalah bounded context terpisah.
- CCTV adalah bounded context terpisah.
- Smart Lock command selalu melalui backend, tidak langsung dari frontend ke Tuya.
- CCTV preview memakai session/token pendek dan tidak mengekspos RTSP/IP kamera ke frontend.
- Restriction Smart Lock karena telat bayar harus melalui approval admin/manager.
- Tidak ada auto-lock penuh tanpa approval manusia pada Phase 1.

Role sistem final:

| Role | Makna |
|---|---|
| `owner` | Owner platform/operator dengan akses tertinggi. |
| `manager` | Pengelola operasional dengan akses luas. |
| `admin` | Staff administrasi harian. |
| `technician` | Teknisi maintenance yang menangani tiket/work order. |
| `resident` | Penghuni yang memakai PWA. |
| `property_owner` | Pemilik Rumah Kost / Investor, read-only dan terbatas ke properti miliknya. |

Aturan khusus `property_owner`:

- Hanya dapat melihat properti miliknya.
- Hanya dapat melihat kamar miliknya.
- Hanya dapat melihat penghuni pada properti miliknya.
- Hanya dapat melihat pembayaran dan omset properti miliknya.
- Tidak dapat mengakses Smart Lock.
- Tidak dapat mengakses CCTV.
- Tidak dapat mengakses Billing Management.
- Tidak dapat mengakses Settings.
- Tidak dapat mengubah data operasional.

---

# API Design Principles

1. API dipisahkan berdasarkan bounded context, bukan berdasarkan tabel database.
2. Semua endpoint berada di bawah `/api/v1`.
3. Semua write operation wajib melewati authentication, authorization, validation, dan audit sesuai sensitivitas.
4. Property scoping wajib diterapkan pada semua resource operasional.
5. `resident` hanya boleh melihat data miliknya sendiri.
6. `property_owner` selalu read-only dan wajib divalidasi terhadap properti yang dimilikinya.
7. Smart Lock dan CCTV tidak boleh diekspos sebagai direct provider proxy mentah.
8. Secret provider, private object key, RTSP URL, IP kamera, dan raw provider response tidak boleh bocor ke frontend.
9. Endpoint list wajib mendukung pagination, filtering, dan sorting standar.
10. State transition penting wajib eksplisit, bukan update status bebas.
11. Operasi finansial memakai pola append-friendly: koreksi melalui adjustment, void, reversal, atau audit, bukan overwrite diam-diam.
12. Cross-context side effect memakai domain event/outbox agar Billing, Smart Lock, Notification, dan Audit tidak saling coupled secara synchronous.
13. Redis digunakan untuk rate limit, idempotency, cache ringan, session/token pendek, dan queue/outbox worker.
14. Semua response error memakai format standar dengan `correlation_id`.
15. API design harus siap multi-property sejak Phase 1 meski skala awal satu properti.

---

# API Versioning Strategy

Base path:

| Item | Strategy |
|---|---|
| Public base path | `/api/v1` |
| Internal health path | `/api/health` atau `/health` |
| Versioning style | URI versioning |
| Breaking change | Naik ke `/api/v2` |
| Non-breaking change | Tambah field optional, endpoint baru, enum value baru yang backward-compatible |
| Deprecation | Response header `Deprecation`, dokumentasi migrasi, dan grace period |

Guidelines:

- Jangan mengubah makna field atau status enum dalam versi yang sama.
- Jangan menghapus field yang sudah dipakai frontend tanpa deprecation window.
- Endpoint admin dan penghuni tetap dipisah walaupun resource domain sama.
- Business code dapat dipakai di API user-facing; internal UUID tidak perlu selalu diekspos pada route resident-facing.

---

# Authentication Strategy

Recommended strategy:

- Access token short-lived.
- Refresh token/session tracked server-side.
- Password hash hanya disimpan di backend.
- Session revocation tersedia untuk logout per device dan logout semua device.
- PWA Penghuni memakai secure storage strategy di frontend, tetapi backend tetap menjadi sumber validasi session.

Authentication rules:

| Rule | Requirement |
|---|---|
| Login | Rate limited by IP and identifier. |
| Refresh token | Rate limited by session and user. |
| Logout | Audit ringan. |
| Failed login | Audit auth event. |
| Password reset | Token hashed, short-lived, one-time use. |
| Sensitive action | Requires fresh auth or step-up confirmation where appropriate. |

Token claims minimal:

- `sub`: user id.
- `roles`: role codes.
- `property_ids`: property scope for staff/property owner where safe.
- `resident_id`: only for resident identity where applicable.
- `session_id`: server-side session reference.

Claims must not replace database authorization checks for sensitive or scoped resources.

---

# Authorization & RBAC Strategy

Authorization combines:

1. Role-based access control.
2. Permission-based guards for sensitive features.
3. Property scoping.
4. Row ownership checks for resident data.
5. Workflow/state guards for state transition endpoints.

Role baseline:

| Role | Access Pattern |
|---|---|
| `owner` | Full platform and property operations, including RBAC and audit. |
| `manager` | Broad property operations, approval workflows, reports, Smart Lock command if granted. |
| `admin` | Daily operations: room, resident, check-in/out, billing, deposit, complaint, notification. |
| `technician` | Assigned maintenance/work order scope. |
| `resident` | Own profile, room, billing, payment proof, complaints, notifications, allowed lock access if enabled. |
| `property_owner` | Read-only property owner portal, scoped to owned properties only. |

Critical authorization rules:

- `property_owner` must never receive write permissions.
- `property_owner` must never access Smart Lock APIs.
- `property_owner` must never access CCTV APIs.
- `property_owner` must never access Billing Management APIs, only read-only payment/revenue views under Property Owner API.
- `property_owner` must never access Settings APIs.
- `resident` must never pass arbitrary `residentId` to read another resident's data.
- `technician` can only update assigned work orders unless explicitly elevated.
- Smart Lock command requires explicit permission and rate limit, not just login.
- CCTV preview requires explicit permission and short-lived session issuance.
- RBAC changes are owner-only by default.

---

# API Route Grouping

Recommended route layout:

| Group | Base Route | Primary Audience |
|---|---|---|
| Auth | `/api/v1/auth` | All authenticated users |
| Admin | `/api/v1/admin` | Owner, manager, admin |
| Penghuni | `/api/v1/penghuni` | Resident PWA |
| Property | `/api/v1/properties` | Internal staff |
| Property Owner | `/api/v1/property-owner` | Pemilik Rumah Kost / Investor |
| Room | `/api/v1/rooms` | Internal staff |
| Resident | `/api/v1/residents` | Internal staff |
| Occupancy | `/api/v1/occupancies` | Internal staff |
| Check-In | `/api/v1/check-ins` | Internal staff |
| Check-Out | `/api/v1/check-outs` | Internal staff and resident request |
| Billing | `/api/v1/billing` | Internal staff |
| Deposit | `/api/v1/deposits` | Internal staff |
| Complaint | `/api/v1/complaints` | Internal staff and resident via separate route |
| Maintenance | `/api/v1/maintenance` | Internal staff and technician |
| Smart Lock | `/api/v1/smart-locks` | Internal staff; resident only through owned access |
| CCTV | `/api/v1/cctv` | Internal staff with permission |
| Notification | `/api/v1/notifications` | All scoped users |
| File | `/api/v1/files` | All scoped users |
| Audit | `/api/v1/audit` | Owner, manager, selected admin |
| Reporting | `/api/v1/reports` | Owner, manager, admin, property_owner read-only subset |

Endpoint table columns:

- Method.
- Endpoint.
- Tujuan.
- Role yang diizinkan.
- Audit requirement.
- Rate limit requirement.

---

# Auth API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | Login user dan membuat session. | Public | Audit success/failure auth event. | Strict per IP and identifier. |
| POST | `/api/v1/auth/refresh` | Refresh access token. | Authenticated session | Audit failure and abnormal refresh. | Strict per session. |
| POST | `/api/v1/auth/logout` | Logout current session. | Authenticated | Audit lightweight. | Standard per user. |
| POST | `/api/v1/auth/logout-all` | Revoke semua session user. | Authenticated | Audit security event. | Strict per user. |
| GET | `/api/v1/auth/me` | Mengambil profil auth dan role aktif. | Authenticated | No audit, access log optional. | Standard per user. |
| POST | `/api/v1/auth/password/forgot` | Memulai reset password. | Public | Audit request without exposing existence. | Strict per IP and identifier. |
| POST | `/api/v1/auth/password/reset` | Reset password dengan token. | Public | Audit success/failure. | Strict per token and IP. |
| GET | `/api/v1/auth/sessions` | Melihat active sessions. | Authenticated | Audit read optional. | Standard per user. |
| DELETE | `/api/v1/auth/sessions/{sessionId}` | Revoke session tertentu. | Authenticated | Audit security event. | Standard per user. |

---

# Admin API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/dashboard/summary` | Ringkasan operasional admin. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/admin/dashboard/activity` | Aktivitas terbaru lintas domain. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/admin/queues/operational` | Queue check-in, check-out, billing overdue, complaint. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/admin/settings` | Membaca setting operasional property. | owner, manager, admin | Audit read optional. | Standard read. |
| PATCH | `/api/v1/admin/settings` | Mengubah setting operasional property. | owner, manager | Audit required with before/after. | Strict write. |
| GET | `/api/v1/admin/users` | List user internal/property scoped. | owner, manager | Audit read optional. | Standard read. |
| POST | `/api/v1/admin/users` | Membuat user internal. | owner, manager | Audit required. | Strict write. |
| PATCH | `/api/v1/admin/users/{userId}/roles` | Mengubah role/property assignment. | owner | Audit required. | Strict write. |

---

# Penghuni API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/penghuni/me` | Profil Penghuni login. | resident | No audit. | Standard read. |
| PATCH | `/api/v1/penghuni/me` | Update profil terbatas. | resident | Audit PII update. | Standard write. |
| GET | `/api/v1/penghuni/room` | Informasi kamar aktif milik Penghuni. | resident | No audit. | Standard read. |
| GET | `/api/v1/penghuni/billing/current` | Tagihan berjalan milik Penghuni. | resident | No audit. | Standard read. |
| GET | `/api/v1/penghuni/billing/history` | Riwayat invoice/payment milik Penghuni. | resident | No audit. | Standard read. |
| POST | `/api/v1/penghuni/payments/proofs` | Upload bukti pembayaran manual. | resident | Audit financial evidence upload. | Strict write/upload. |
| GET | `/api/v1/penghuni/complaints` | Riwayat komplain milik Penghuni. | resident | No audit. | Standard read. |
| POST | `/api/v1/penghuni/complaints` | Membuat komplain. | resident | Audit complaint create. | Standard write, stricter with file upload. |
| GET | `/api/v1/penghuni/notifications` | List notifikasi Penghuni. | resident | No audit. | Standard read. |
| PATCH | `/api/v1/penghuni/notifications/{notificationId}/read` | Tandai notifikasi sebagai dibaca. | resident | No audit. | Standard write. |
| POST | `/api/v1/penghuni/lease-extension-requests` | Ajukan perpanjangan sewa. | resident | Audit workflow request. | Standard write. |
| POST | `/api/v1/penghuni/check-out-requests` | Ajukan check-out. | resident | Audit workflow request. | Standard write. |
| POST | `/api/v1/penghuni/smart-locks/{deviceId}/unlock` | Unlock kamar sendiri bila access grant aktif. | resident | Smart Lock audit required. | Very strict per user/device. |
| POST | `/api/v1/penghuni/smart-locks/{deviceId}/lock` | Lock kamar sendiri bila access grant aktif. | resident | Smart Lock audit required. | Strict per user/device. |

---

# Property API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/properties` | List property sesuai scope user. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/properties` | Membuat property baru. | owner | Audit required. | Strict write. |
| GET | `/api/v1/properties/{propertyId}` | Detail property. | owner, manager, admin | No audit. | Standard read. |
| PATCH | `/api/v1/properties/{propertyId}` | Update profil property. | owner, manager | Audit required with before/after. | Strict write. |
| PATCH | `/api/v1/properties/{propertyId}/status` | Aktif/nonaktifkan property. | owner | Audit required. | Strict write. |
| GET | `/api/v1/properties/{propertyId}/settings` | Membaca setting property. | owner, manager, admin | Audit read optional. | Standard read. |
| PATCH | `/api/v1/properties/{propertyId}/settings` | Mengubah setting property. | owner, manager | Audit required. | Strict write. |
| GET | `/api/v1/properties/{propertyId}/owners` | List property owner assignment. | owner, manager | Audit read optional. | Standard read. |
| POST | `/api/v1/properties/{propertyId}/owners` | Assign Pemilik Rumah Kost ke property. | owner, manager | Audit required. | Strict write. |
| DELETE | `/api/v1/properties/{propertyId}/owners/{userId}` | Revoke assignment Pemilik Rumah Kost. | owner, manager | Audit required. | Strict write. |

---

# Property Owner API

All endpoints in this section are read-only and must enforce ownership scope through property owner assignment.

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/property-owner/properties` | List property milik Pemilik Rumah Kost. | property_owner | Audit read optional. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}` | Detail property miliknya. | property_owner | Audit read optional. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}/rooms` | List kamar pada property miliknya. | property_owner | No audit. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}/residents` | List penghuni pada property miliknya. | property_owner | Audit read due resident PII. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}/payments` | Read-only pembayaran property miliknya. | property_owner | Audit read financial. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}/revenue-summary` | Ringkasan omset property miliknya. | property_owner | Audit read financial. | Standard read. |
| GET | `/api/v1/property-owner/properties/{propertyId}/occupancy-summary` | Ringkasan okupansi property miliknya. | property_owner | No audit. | Standard read. |

Forbidden for `property_owner`:

- No write endpoint in this group.
- No Smart Lock endpoint.
- No CCTV endpoint.
- No Billing Management endpoint.
- No Settings endpoint.
- No operational mutation endpoint.

---

# Room API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/rooms` | List kamar dengan filter property/status/floor/type. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/rooms` | Membuat kamar. | owner, manager, admin | Audit required. | Standard write. |
| GET | `/api/v1/rooms/{roomId}` | Detail kamar. | owner, manager, admin | No audit. | Standard read. |
| PATCH | `/api/v1/rooms/{roomId}` | Update data kamar. | owner, manager, admin | Audit required with before/after. | Standard write. |
| PATCH | `/api/v1/rooms/{roomId}/status` | Ubah status kamar melalui state transition. | owner, manager, admin | Audit required. | Strict write. |
| GET | `/api/v1/rooms/availability` | Cek ketersediaan kamar. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/room-types` | List tipe kamar. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/room-types` | Membuat tipe kamar. | owner, manager | Audit required. | Standard write. |
| PATCH | `/api/v1/room-types/{roomTypeId}` | Update tipe kamar. | owner, manager | Audit required. | Standard write. |
| GET | `/api/v1/room-facilities` | List fasilitas kamar. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/room-facilities` | Membuat master fasilitas. | owner, manager | Audit required. | Standard write. |

---

# Resident API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/residents` | List penghuni dengan filter property/status/search. | owner, manager, admin | Audit read optional due PII. | Standard read. |
| POST | `/api/v1/residents` | Membuat profil Penghuni manual. | owner, manager, admin | Audit PII create required. | Strict write. |
| GET | `/api/v1/residents/{residentId}` | Detail Penghuni. | owner, manager, admin | Audit read PII. | Standard read. |
| PATCH | `/api/v1/residents/{residentId}` | Update data Penghuni. | owner, manager, admin | Audit PII update required. | Strict write. |
| PATCH | `/api/v1/residents/{residentId}/status` | Aktif/nonaktifkan Penghuni. | owner, manager, admin | Audit required. | Strict write. |
| GET | `/api/v1/residents/{residentId}/files` | List file terkait Penghuni. | owner, manager, admin | Audit read sensitive file metadata. | Standard read. |
| POST | `/api/v1/residents/{residentId}/files` | Upload file identitas/dokumen Penghuni. | owner, manager, admin | Audit file upload required. | Strict upload. |
| GET | `/api/v1/residents/{residentId}/billing-summary` | Ringkasan tagihan Penghuni. | owner, manager, admin | Audit read financial optional. | Standard read. |

---

# Occupancy API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/occupancies` | List okupansi aktif/historis. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/occupancies/active` | List hunian aktif per property. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/occupancies/{occupancyId}` | Detail occupancy. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/rooms/{roomId}/occupancy` | Occupancy aktif dan histori kamar. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/residents/{residentId}/occupancy-history` | Histori hunian Penghuni. | owner, manager, admin | Audit read optional. | Standard read. |

Occupancy creation and closure should normally happen through Check-In and Check-Out workflow APIs, not direct generic write endpoints.

---

# Check-In API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/check-ins` | List workflow check-in. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/check-ins` | Memulai workflow check-in untuk resident/lease/room. | owner, manager, admin | Audit workflow create. | Strict write. |
| GET | `/api/v1/check-ins/{checkInId}` | Detail workflow check-in. | owner, manager, admin | No audit. | Standard read. |
| PATCH | `/api/v1/check-ins/{checkInId}` | Update catatan/checklist check-in. | owner, manager, admin | Audit required. | Standard write. |
| POST | `/api/v1/check-ins/{checkInId}/complete` | Menyelesaikan check-in, aktifkan occupancy, set room occupied. | owner, manager, admin | Audit required with workflow result. | Strict write/idempotent. |
| POST | `/api/v1/check-ins/{checkInId}/cancel` | Membatalkan workflow check-in. | owner, manager | Audit required. | Strict write. |

---

# Check-Out API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/check-outs` | List workflow check-out. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/check-outs` | Membuat check-out request dari admin. | owner, manager, admin | Audit workflow create. | Strict write. |
| GET | `/api/v1/check-outs/{checkOutId}` | Detail workflow check-out. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/check-outs/{checkOutId}/approve` | Approval request check-out. | owner, manager, admin | Audit required. | Strict write. |
| POST | `/api/v1/check-outs/{checkOutId}/reject` | Reject request check-out. | owner, manager, admin | Audit required. | Strict write. |
| POST | `/api/v1/check-outs/{checkOutId}/inspection` | Catat hasil inspeksi kamar. | owner, manager, admin, technician | Audit required. | Standard write/upload if photos. |
| PATCH | `/api/v1/check-outs/{checkOutId}/tasks/{taskId}` | Update checklist task check-out. | owner, manager, admin, technician | Audit required. | Standard write. |
| POST | `/api/v1/check-outs/{checkOutId}/finalize` | Finalisasi checkout, close occupancy, revoke lock grant, trigger deposit settlement. | owner, manager | Audit required with workflow result. | Strict write/idempotent. |

---

# Billing API

Phase 1 billing uses manual payment and proof verification. Payment gateway is Phase 2.

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/billing/invoices` | List invoice dengan filter status/period/property. | owner, manager, admin | Audit read optional. | Standard read. |
| POST | `/api/v1/billing/invoices` | Membuat invoice manual. | owner, manager, admin | Audit financial create. | Strict write/idempotent. |
| GET | `/api/v1/billing/invoices/{invoiceId}` | Detail invoice. | owner, manager, admin | Audit read optional. | Standard read. |
| PATCH | `/api/v1/billing/invoices/{invoiceId}` | Update invoice sebelum final/paid. | owner, manager | Audit financial update. | Strict write. |
| POST | `/api/v1/billing/invoices/{invoiceId}/issue` | Issue invoice ke Penghuni. | owner, manager, admin | Audit financial state change. | Strict write/idempotent. |
| POST | `/api/v1/billing/invoices/{invoiceId}/void` | Void invoice dengan alasan. | owner, manager | Audit financial void. | Strict write. |
| GET | `/api/v1/billing/payments` | List pembayaran dan bukti transfer. | owner, manager, admin | Audit read financial optional. | Standard read. |
| GET | `/api/v1/billing/payment-proofs` | Queue bukti pembayaran manual. | owner, manager, admin | Audit read financial optional. | Standard read. |
| POST | `/api/v1/billing/payment-proofs/{proofId}/approve` | Approve bukti pembayaran. | owner, manager, admin | Audit payment verification. | Strict write/idempotent. |
| POST | `/api/v1/billing/payment-proofs/{proofId}/reject` | Reject bukti pembayaran. | owner, manager, admin | Audit payment verification. | Strict write. |
| POST | `/api/v1/billing/invoices/{invoiceId}/late-fee` | Hitung/catat denda keterlambatan manual atau scheduled action. | owner, manager | Audit financial adjustment. | Strict write/idempotent. |
| GET | `/api/v1/billing/aging-summary` | Ringkasan overdue dan aging tagihan. | owner, manager, admin | No audit. | Standard read. |

---

# Deposit API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/deposits` | List deposit by property/status/resident. | owner, manager, admin | Audit read financial optional. | Standard read. |
| POST | `/api/v1/deposits` | Mencatat kewajiban deposit saat onboarding/check-in. | owner, manager, admin | Audit financial create. | Strict write/idempotent. |
| GET | `/api/v1/deposits/{depositId}` | Detail deposit dan ledger. | owner, manager, admin | Audit read financial optional. | Standard read. |
| POST | `/api/v1/deposits/{depositId}/payments` | Mencatat pembayaran deposit manual. | owner, manager, admin | Audit financial payment. | Strict write/idempotent. |
| POST | `/api/v1/deposits/{depositId}/deductions` | Mencatat potongan deposit saat check-out. | owner, manager, admin | Audit financial deduction. | Strict write. |
| POST | `/api/v1/deposits/{depositId}/refunds` | Membuat rencana refund deposit. | owner, manager | Audit financial refund. | Strict write/idempotent. |
| POST | `/api/v1/deposits/{depositId}/refunds/{refundId}/approve` | Approve refund deposit. | owner, manager | Audit approval required. | Strict write. |
| POST | `/api/v1/deposits/{depositId}/settle` | Finalisasi settlement deposit. | owner, manager | Audit settlement required. | Strict write/idempotent. |

---

# Complaint API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/complaints` | List komplain dengan filter property/status/priority/category. | owner, manager, admin, technician | No audit. | Standard read. |
| POST | `/api/v1/complaints` | Membuat komplain dari admin. | owner, manager, admin | Audit complaint create. | Standard write. |
| GET | `/api/v1/complaints/{complaintId}` | Detail komplain dan timeline. | owner, manager, admin, technician | No audit. | Standard read. |
| PATCH | `/api/v1/complaints/{complaintId}` | Update metadata komplain. | owner, manager, admin | Audit required. | Standard write. |
| POST | `/api/v1/complaints/{complaintId}/assign` | Assign teknisi. | owner, manager, admin | Audit assignment required. | Standard write. |
| POST | `/api/v1/complaints/{complaintId}/status` | Ubah status komplain melalui workflow. | owner, manager, admin, technician | Audit status change required. | Standard write. |
| POST | `/api/v1/complaints/{complaintId}/files` | Upload foto komplain. | owner, manager, admin, technician, resident via own route | Audit file upload. | Strict upload. |
| GET | `/api/v1/complaint-categories` | List kategori komplain. | owner, manager, admin, technician, resident | No audit. | Standard read. |

---

# Maintenance API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/maintenance/work-orders` | List work order maintenance. | owner, manager, admin, technician | No audit. | Standard read. |
| POST | `/api/v1/maintenance/work-orders` | Membuat work order. | owner, manager, admin | Audit required. | Standard write. |
| GET | `/api/v1/maintenance/work-orders/{workOrderId}` | Detail work order. | owner, manager, admin, technician | No audit. | Standard read. |
| PATCH | `/api/v1/maintenance/work-orders/{workOrderId}` | Update work order. | owner, manager, admin, technician | Audit required. | Standard write. |
| POST | `/api/v1/maintenance/work-orders/{workOrderId}/assign` | Assign/reassign teknisi. | owner, manager, admin | Audit assignment. | Standard write. |
| POST | `/api/v1/maintenance/work-orders/{workOrderId}/start` | Teknisi mulai pekerjaan. | technician, owner, manager, admin | Audit status change. | Standard write. |
| POST | `/api/v1/maintenance/work-orders/{workOrderId}/complete` | Menyelesaikan pekerjaan maintenance. | technician, owner, manager, admin | Audit completion. | Standard write/upload if evidence. |
| GET | `/api/v1/maintenance/my-work-orders` | Work order yang ditugaskan ke teknisi login. | technician | No audit. | Standard read. |

Technician scope:

- `technician` hanya boleh melihat/update work order yang ditugaskan kepadanya, kecuali diberi permission tambahan.

---

# Smart Lock API

Smart Lock is high-security. All commands must go through backend. Frontend must never access Tuya directly. Tuya secrets must remain backend-only.

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/smart-locks/devices` | List metadata device smart lock. | owner, manager, admin | Audit read optional. | Standard read. |
| POST | `/api/v1/smart-locks/devices` | Register metadata device smart lock. | owner, manager | Audit required. | Strict write. |
| GET | `/api/v1/smart-locks/devices/{deviceId}` | Detail device smart lock. | owner, manager, admin | Audit read optional. | Standard read. |
| PATCH | `/api/v1/smart-locks/devices/{deviceId}` | Update metadata device. | owner, manager | Audit required. | Strict write. |
| POST | `/api/v1/smart-locks/devices/{deviceId}/sync-status` | Sync status device dari provider melalui backend. | owner, manager, admin | Smart Lock audit required. | Strict per device. |
| POST | `/api/v1/smart-locks/devices/{deviceId}/lock` | Command lock melalui backend. | owner, manager, admin | Smart Lock audit required with result. | Very strict per user/device. |
| POST | `/api/v1/smart-locks/devices/{deviceId}/unlock` | Command unlock melalui backend. | owner, manager, admin | Smart Lock audit required with result. | Very strict per user/device. |
| GET | `/api/v1/smart-locks/access-logs` | Riwayat akses smart lock. | owner, manager, admin | Audit read security log optional. | Standard read. |
| GET | `/api/v1/smart-locks/alerts` | List alert battery/offline/failed attempts. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/smart-locks/access-grants` | Beri akses device ke resident/user. | owner, manager, admin | Audit access grant required. | Strict write. |
| PATCH | `/api/v1/smart-locks/access-grants/{grantId}/revoke` | Revoke akses device. | owner, manager, admin | Audit access revoke required. | Strict write. |
| POST | `/api/v1/smart-locks/restrictions` | Ajukan restriction karena billing/manual/security. | owner, manager, admin | Audit workflow create. | Strict write. |
| POST | `/api/v1/smart-locks/restrictions/{restrictionId}/approve` | Approve restriction sebelum diterapkan. | owner, manager | Audit approval and command result required. | Very strict per approver/device. |
| POST | `/api/v1/smart-locks/restrictions/{restrictionId}/reject` | Reject restriction. | owner, manager | Audit approval decision. | Strict write. |
| POST | `/api/v1/smart-locks/restrictions/{restrictionId}/lift` | Cabut restriction setelah pembayaran/approval. | owner, manager | Audit required. | Very strict per approver/device. |

Phase 1 safety rules:

- No full auto-lock because of overdue without human approval.
- Billing overdue may create pending restriction event, not direct command.
- Every command must write Smart Lock access log with actor, device, action, result, time, and correlation id.
- `property_owner` has no access.
- CCTV and Smart Lock permissions are separate; CCTV access does not imply Smart Lock command.

---

# CCTV API

CCTV uses hybrid architecture. Recording remains local. Database stores metadata, preview sessions, access logs, and alerts. Frontend must never receive raw RTSP URL or internal camera IP.

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/cctv/cameras` | List metadata kamera. | owner, manager, admin | Audit read optional. | Standard read. |
| POST | `/api/v1/cctv/cameras` | Register metadata kamera. | owner, manager | Audit required. | Strict write. |
| GET | `/api/v1/cctv/cameras/{cameraId}` | Detail metadata kamera. | owner, manager, admin | Audit read optional. | Standard read. |
| PATCH | `/api/v1/cctv/cameras/{cameraId}` | Update metadata kamera. | owner, manager | Audit required. | Strict write. |
| POST | `/api/v1/cctv/cameras/{cameraId}/preview-sessions` | Issue short-lived preview session/token. | owner, manager, admin | CCTV access audit required. | Very strict per user/camera. |
| DELETE | `/api/v1/cctv/preview-sessions/{sessionId}` | End/revoke preview session. | owner, manager, admin | CCTV access audit required. | Standard write. |
| POST | `/api/v1/cctv/cameras/{cameraId}/snapshot` | Request snapshot through backend/gateway. | owner, manager, admin | CCTV access audit required. | Strict per user/camera. |
| GET | `/api/v1/cctv/access-logs` | Riwayat akses CCTV. | owner, manager | Audit read security log optional. | Standard read. |
| GET | `/api/v1/cctv/alerts` | Alert kamera offline/error. | owner, manager, admin | No audit. | Standard read. |
| POST | `/api/v1/cctv/cameras/{cameraId}/refresh-status` | Refresh status kamera/gateway. | owner, manager, admin | Audit optional. | Strict per camera. |

Rules:

- `property_owner` has no CCTV access.
- Preview token must be short-lived and revocable.
- Preview response must not include RTSP URL, camera IP, provider password, or NVR secret.
- CCTV access logs must include actor, camera, action, result, IP, user agent, and correlation id.

---

# Notification API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | List notifikasi user login. | owner, manager, admin, technician, resident, property_owner | No audit. | Standard read. |
| PATCH | `/api/v1/notifications/{notificationId}/read` | Tandai notifikasi dibaca. | owner, manager, admin, technician, resident, property_owner | No audit. | Standard write. |
| PATCH | `/api/v1/notifications/read-all` | Tandai semua notifikasi dibaca. | owner, manager, admin, technician, resident, property_owner | No audit. | Standard write. |
| GET | `/api/v1/announcements` | List pengumuman property-scoped. | owner, manager, admin, resident | No audit. | Standard read. |
| POST | `/api/v1/announcements` | Membuat pengumuman. | owner, manager, admin | Audit required. | Standard write. |
| PATCH | `/api/v1/announcements/{announcementId}` | Update pengumuman. | owner, manager, admin | Audit required. | Standard write. |
| DELETE | `/api/v1/announcements/{announcementId}` | Nonaktifkan/hapus pengumuman. | owner, manager, admin | Audit required. | Standard write. |
| GET | `/api/v1/kost-rules` | List peraturan kost. | owner, manager, admin, resident | No audit. | Standard read. |
| POST | `/api/v1/kost-rules` | Membuat peraturan kost. | owner, manager, admin | Audit required. | Standard write. |
| GET | `/api/v1/faqs` | List FAQ. | owner, manager, admin, resident | No audit. | Standard read. |
| POST | `/api/v1/faqs` | Membuat FAQ. | owner, manager, admin | Audit required. | Standard write. |

---

# File API

Files are stored outside PostgreSQL. API stores metadata, authorization, signed access, and access logs.

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| POST | `/api/v1/files` | Upload file metadata/object through approved backend flow. | owner, manager, admin, technician, resident | Audit upload required. | Strict upload per user. |
| GET | `/api/v1/files/{fileId}` | Membaca metadata file. | Scoped authenticated roles | Audit read optional; required for sensitive file. | Standard read. |
| POST | `/api/v1/files/{fileId}/access-url` | Membuat signed access URL atau backend stream token. | Scoped authenticated roles | Audit file access required for private/sensitive file. | Strict per file/user. |
| DELETE | `/api/v1/files/{fileId}` | Soft-delete/revoke file. | owner, manager, admin | Audit delete required. | Strict write. |
| GET | `/api/v1/files/{fileId}/access-logs` | Riwayat akses file. | owner, manager | Audit read security log optional. | Standard read. |

Rules:

- Do not expose raw private object keys.
- Identity files, payment proofs, complaint photos, deposit evidence, check-out photos, and CCTV snapshots require stricter authorization.
- Resident can only upload/read files tied to their own allowed workflows.

## Status Implementasi File API - Update M12 (2026-07-03)

Tabel File API di atas adalah rencana awal (draft 2026-06-16). Berikut status aktual setelah M12C1-M12C5 dan M12D. Sumber kebenaran: dokumen implementasi di `docs/12-product-readiness/` dan `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`. Rute di bawah adalah rute aktual di kode - bukan spekulasi.

### Shipped - File API inti (M12C1)

| Method | Endpoint | Tujuan | Aktor/Role | Auth | Catatan keamanan |
|---|---|---|---|---|---|
| POST | `/api/v1/files` | Upload file multipart (`file`, `property_id`, `file_purpose`). | owner, manager, admin, technician, resident (purpose-scoped; resident hanya untuk konteks miliknya) | JWT + RBAC + validasi purpose/ownership | Validasi otoritatif backend: MIME allowlist per purpose, magic bytes (`file-type`), 2 MB gambar / 5 MB PDF, blocklist ekstensi berbahaya, checksum SHA256, rate limit upload. Audit `file.upload`. |
| GET | `/api/v1/files/{fileId}` | Metadata file. | Scoped: role + property + ownership | JWT + access check | Respons aman via `FileService.toResponse()` - `storage_path` TIDAK pernah diekspos. |
| GET | `/api/v1/files/{fileId}/content` | Stream konten file (preview/download). | Scoped: role + property + ownership | JWT + access check | Backend-mediated streaming menggantikan rencana `POST /files/{fileId}/access-url` (tidak ada signed URL publik). Header `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`. Audit `file.download`. |
| DELETE | `/api/v1/files/{fileId}` | Soft-delete file. | owner, manager, admin | JWT + RBAC + property scope | Audit `file.delete`. Physical cleanup mengikuti retention policy (24 jam / 30 hari / 90 hari). |

### Shipped - endpoint terkait file per domain (M12C3, M12C4, M12C5, M12D)

| Method | Endpoint | Tujuan | Aktor/Role | Auth | Catatan |
|---|---|---|---|---|---|
| POST | `/api/v1/my/payment-proofs` | Submit bukti pembayaran manual; menerima `file_ids` opsional (maks 3, purpose `payment_proof`, uploader = resident sendiri, properti sama dengan invoice). | resident | JWT + RBAC resident + invoice self-scope | Proof menjadi `pending_review`; verifikasi admin tetap satu-satunya otoritas settlement - tagihan tidak otomatis lunas. Audit `payment_proof.submit`. Catatan: rute aktual memakai prefix `/my/*`, bukan `/penghuni/payments/proofs` seperti draft. |
| GET | `/api/v1/payment-proofs/{proofId}/files` | Metadata file lampiran proof untuk review Admin. | owner, manager, admin | JWT + `assertCanReadProperty` | Metadata aman via `toResponse()` (tanpa `storage_path`); preview konten tetap lewat `GET /files/{fileId}/content`. |
| GET | `/api/v1/my/complaints/categories` | Kategori komplain aktif untuk properti occupancy aktif resident. | resident | JWT + RBAC resident + active occupancy context | Ditambahkan M12D; menutup blocker `GET /complaint-categories` yang membutuhkan `complaint.manage` (admin-only). |
| POST | `/api/v1/my/complaints` | Buat komplain; menerima `file_ids` opsional (maks 5 unik, purpose `complaint_attachment`). | resident | JWT + RBAC resident + self-scope | Validasi file: ada, tidak soft-deleted, purpose tepat, properti sama, di-upload resident yang sama. Attach transaksional (complaint + history + files, rollback utuh). Audit `complaint.file_attach`. |
| GET | `/api/v1/complaints/{complaintId}/files` | Metadata file lampiran komplain untuk staf. | owner, manager, admin | JWT + `assertCanReadProperty` | Metadata aman; preview via `GET /files/{fileId}/content`. |

### Belum shipped (tetap rencana / superseded)

- `POST /api/v1/files/{fileId}/access-url` - superseded oleh backend-mediated content streaming per ADR-BE-FILE-001; tidak akan dibangun kecuali ada keputusan arsitektur baru.
- `GET /api/v1/files/{fileId}/access-logs` - menunggu Audit API surface.
- `POST /api/v1/complaints/{complaintId}/files` dan `POST /api/v1/residents/{residentId}/files` - pola aktual yang shipped: upload dulu ke `POST /files`, lalu kirim `file_ids` pada create/submit domain terkait.

### Prinsip yang berlaku pada seluruh endpoint file di atas

- Backend adalah otoritas final; validasi frontend UX-only.
- Property scoping wajib; resident self-scope ditegakkan backend.
- Tidak ada URL storage publik; `storage_path` tidak pernah diekspos; preview hanya melalui `GET /files/{fileId}/content` terotorisasi.
- Tidak ada video upload dan tidak ada chat attachment pada fase ini.

---

# Audit API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/audit/logs` | Search audit logs. | owner, manager | Audit read security log. | Standard read with export protection. |
| GET | `/api/v1/audit/logs/{auditLogId}` | Detail audit log. | owner, manager | Audit read security log. | Standard read. |
| GET | `/api/v1/audit/auth-events` | Search auth events. | owner | Audit read security log. | Standard read. |
| GET | `/api/v1/audit/smart-lock-events` | Search Smart Lock audit/access logs. | owner, manager | Audit read security log. | Standard read. |
| GET | `/api/v1/audit/cctv-events` | Search CCTV access logs. | owner, manager | Audit read security log. | Standard read. |
| POST | `/api/v1/audit/exports` | Request audit export. | owner | Audit export required. | Very strict per user. |

Audit logs must answer:

- Who did it.
- What action was attempted.
- Which resource was affected.
- When it happened.
- From where it happened.
- Whether it succeeded or failed.
- Which correlation id links the request, domain event, and downstream operation.

---

# Reporting API

| Method | Endpoint | Tujuan | Role yang diizinkan | Audit requirement | Rate limit requirement |
|---|---|---|---|---|---|
| GET | `/api/v1/reports/occupancy` | Laporan okupansi. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/reports/revenue` | Laporan revenue/omset. | owner, manager, admin | Audit read financial optional. | Standard read. |
| GET | `/api/v1/reports/billing-aging` | Laporan aging tagihan. | owner, manager, admin | Audit read financial optional. | Standard read. |
| GET | `/api/v1/reports/payments` | Laporan pembayaran. | owner, manager, admin | Audit read financial optional. | Standard read. |
| GET | `/api/v1/reports/complaints` | Laporan komplain per kategori/status. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/reports/maintenance` | Laporan maintenance/work order. | owner, manager, admin | No audit. | Standard read. |
| GET | `/api/v1/reports/smart-locks` | Laporan aktivitas Smart Lock. | owner, manager | Audit read security report. | Standard read. |
| GET | `/api/v1/reports/cctv` | Laporan akses CCTV/status kamera. | owner, manager | Audit read security report. | Standard read. |
| POST | `/api/v1/reports/exports` | Request export laporan. | owner, manager, admin | Audit export required. | Strict per user/report. |

Property owner reporting must use `/api/v1/property-owner/...` read-only endpoints, not generic reporting endpoints, unless a dedicated permission model is added later.

---

# Error Response Standard

All API errors should use a consistent JSON shape:

| Field | Meaning |
|---|---|
| `success` | Always `false` for errors. |
| `error.code` | Stable machine-readable error code. |
| `error.message` | Human-readable safe message. |
| `error.details` | Optional validation details or safe context. |
| `correlation_id` | Request correlation id. |
| `timestamp` | Server timestamp. |

Recommended status mapping:

| HTTP Status | Usage |
|---|---|
| 400 | Invalid request syntax or invalid state transition input. |
| 401 | Missing/invalid authentication. |
| 403 | Authenticated but not authorized. |
| 404 | Resource not found or hidden by scope. |
| 409 | Conflict, duplicate active occupancy, invalid concurrent state. |
| 422 | Validation passed syntactically but business rule failed. |
| 429 | Rate limit exceeded. |
| 500 | Unexpected server error. |
| 502 | Provider/gateway error such as Tuya or CCTV gateway. |
| 503 | Provider unavailable or device/gateway offline. |

Security rule:

- Do not reveal whether a hidden resource exists across property boundaries.
- Do not leak provider secrets, SQL errors, stack traces, private object keys, RTSP URLs, or raw Tuya/CCTV payloads.

---

# Pagination Standard

Default pagination:

| Parameter | Rule |
|---|---|
| `page` | Starts from 1. |
| `per_page` | Default 20. |
| `per_page` max | 100 for normal lists. |
| Export | Use export job endpoint for large datasets. |

Response metadata:

| Field | Meaning |
|---|---|
| `meta.page` | Current page. |
| `meta.per_page` | Page size. |
| `meta.total` | Total rows if affordable. |
| `meta.total_pages` | Total pages if affordable. |
| `meta.has_next` | Cursor-like fallback for large logs. |

High-volume logs:

- Audit logs, Smart Lock access logs, CCTV access logs, and file access logs may use cursor pagination later.
- Initial API may use page pagination with strict filters and date range limits.

---

# Filtering Standard

General filtering:

| Pattern | Example |
|---|---|
| Exact match | `?status=active` |
| Multiple values | `?status=unpaid,overdue` |
| Date range | `?from=2026-06-01&to=2026-06-30` |
| Property scope | `?property_id=...` for internal routes only |
| Search | `?q=andi` |

Rules:

- All filters must be allowlisted per endpoint.
- `property_id` from request must always be checked against user scope.
- `resident` APIs must derive resident scope from authenticated user, not from arbitrary query params.
- `property_owner` APIs must derive ownership scope from property owner assignment.
- Date range filters are required for high-volume log/report endpoints.
- Search should avoid leaking hidden resources across property boundaries.

---

# Sorting Standard

Sorting format:

| Parameter | Example |
|---|---|
| `sort` | `sort=-created_at` for descending |
| Multi-sort | `sort=status,-created_at` |

Rules:

- Sort fields must be allowlisted per endpoint.
- Default sort should be deterministic, usually `-created_at` or domain-specific date descending.
- Large logs should sort by `occurred_at` descending.
- Reports should sort by period or business metric depending endpoint.

---

# Idempotency Strategy

Use idempotency for operations where retry can create duplicate business effects.

Header:

| Header | Purpose |
|---|---|
| `Idempotency-Key` | Client-generated unique key for retry-safe write operations. |

Apply to:

- Create invoice.
- Issue invoice.
- Upload payment proof finalization.
- Approve/reject payment proof.
- Complete check-in.
- Finalize check-out.
- Deposit payment/refund/settlement.
- Smart Lock command requests.
- CCTV preview session issuance.
- Report/audit export requests.

Storage:

- Redis stores short-lived idempotency key and request hash.
- PostgreSQL stores durable business result where needed.

Rules:

- Same key + same request returns same result within the idempotency window.
- Same key + different request returns conflict.
- Idempotency does not bypass authorization or state validation.

---

# Rate Limiting Strategy

Redis should be used for rate limiting.

Recommended tiers:

| Tier | Use Case | Requirement |
|---|---|---|
| Public strict | Login, password reset | Per IP and identifier. |
| Standard read | Normal authenticated GET | Per user/session. |
| Standard write | Normal mutation | Per user and route. |
| Strict write | Financial, PII, workflow state changes | Per user, property, and route. |
| Very strict security | Smart Lock command, CCTV preview, audit export | Per user, resource, IP, and route. |
| Upload strict | File upload/payment proof/photos | Per user, size, and route. |

Special rules:

- Smart Lock unlock must be more restrictive than lock.
- Failed Smart Lock attempts should feed alerting and audit.
- CCTV preview issuance should be limited per camera and user.
- Login failures should escalate with progressive delay or temporary block.
- Export endpoints should be job-based and strongly rate limited.

---

# Domain Event / Outbox Strategy

Use outbox pattern for cross-context workflows.

Recommended event flow:

| Event | Producer | Consumers |
|---|---|---|
| `resident.created` | Resident | Notification, Audit |
| `check_in.completed` | Check-In | Occupancy, Room, Smart Lock, Notification |
| `check_out.finalized` | Check-Out | Occupancy, Room, Deposit, Smart Lock, Notification |
| `invoice.issued` | Billing | Notification |
| `invoice.overdue_detected` | Billing | Notification, Smart Lock restriction workflow |
| `payment.proof_uploaded` | Penghuni/Billing | Notification, Audit |
| `payment.verified` | Billing | Invoice, Notification, Smart Lock restriction review |
| `deposit.settled` | Deposit | Notification, Audit |
| `complaint.created` | Complaint | Maintenance, Notification |
| `work_order.completed` | Maintenance | Complaint, Notification |
| `smart_lock.command_executed` | Smart Lock | Audit, Notification/Alert |
| `cctv.preview_started` | CCTV | Audit |

Rules:

- Domain writes and outbox insert should be atomic in PostgreSQL.
- Worker publishes and marks outbox events as processed.
- Consumers must be idempotent.
- Failed events should retry with backoff and dead-letter handling.
- Correlation id must propagate from API request to event and audit log.

Smart Lock overdue restriction:

1. Billing detects overdue.
2. Billing emits `invoice.overdue_detected`.
3. Smart Lock context creates pending restriction request.
4. Admin/manager approves or rejects.
5. Only after approval does backend execute restriction/unrestriction logic.
6. All steps are audited.

---

# Security Strategy

Security baseline:

- All state-changing APIs require auth.
- Authorization must be enforced server-side.
- Validation must be applied at API boundary.
- Sensitive operations require audit and correlation id.
- Secrets stay backend-only.
- Raw provider credentials and URLs are never returned to frontend.

Data protection:

- KTP, phone, email, emergency contact, identity file, payment proof, and private photos are sensitive.
- Avoid duplicating PII in logs.
- File access for sensitive documents must be audited.
- Private files use signed URL or backend streaming, not raw object keys.

Smart Lock security:

- Tuya Cloud API access only from backend.
- All command attempts are audited, including denied and failed attempts.
- Unlock is very strict rate limited.
- Device offline or restricted state must produce explicit safe response.
- No full auto-lock due to late payment without human approval in Phase 1.

CCTV security:

- No raw RTSP/IP camera exposure.
- Preview tokens are short-lived and revocable.
- Preview access must be audited.
- Recording remains local.
- `property_owner` has no CCTV access.

RBAC security:

- `property_owner` is read-only and property-scoped.
- `resident` is self-scoped.
- `technician` is assignment-scoped.
- `owner` only for RBAC changes and highest-risk administrative functions.

Operational security:

- Use request correlation id.
- Apply request size limits.
- Validate file MIME type and size.
- Scan or quarantine file uploads where possible.
- Use HTTPS-only deployment.
- Use secure cookies or secure token handling strategy depending frontend deployment.
- Apply CORS allowlist for admin and penghuni domains.

---

# Phase 1 API Scope

Phase 1 includes:

| Area | Scope |
|---|---|
| Auth/RBAC | Login, refresh, logout, sessions, user/role assignment, property scoping. |
| Property | Property profile, settings, property owner assignment. |
| Room | Room, room type, facility, status, availability. |
| Resident | Manual resident creation, profile, documents, status. |
| Occupancy | Active occupancy and occupancy history read models. |
| Check-In | Required workflow to activate occupancy. |
| Check-Out | Required workflow with inspection, tasks, settlement triggers. |
| Billing | Invoice, manual payment proof, manual verification, overdue tracking. |
| Deposit | Deposit charge, payment, deduction, refund, settlement. |
| Complaint | Resident complaint and admin management. |
| Maintenance | Work order and technician assignment. |
| Smart Lock | Device metadata, access grants, audited commands, human-approved restriction. |
| CCTV | Camera metadata, short-lived preview session, audit access. |
| Notification | Notifications, announcements, rules, FAQ. |
| File | Upload metadata, signed access, sensitive file audit. |
| Audit | Security and domain audit search/export. |
| Reporting | Occupancy, revenue, payment, complaint, maintenance, security reports. |
| Property Owner | Read-only portal for owned properties, rooms, residents, payments, revenue. |

Phase 1 excludes:

- Public booking.
- Payment gateway.
- Direct Tuya access from frontend.
- Direct CCTV stream URL exposure.
- Full auto-lock due to late payment without human approval.
- Property owner write operations.
- Property owner Smart Lock/CCTV/Settings/Billing Management access.
- Final DTO contracts.
- NestJS implementation code.
- Database migration/ORM schema.

---

# Phase 2 API Scope

Phase 2 candidates:

| Area | Scope |
|---|---|
| Public Booking | Public room browsing, booking form, booking fee, expiry workflow. |
| Payment Gateway | Gateway transaction, callback/webhook, reconciliation, automated status update. |
| Advanced Billing | Utility meter reading, invoice PDF generation, recurring schedule tuning. |
| Advanced Smart Lock | Async command queue, telemetry archive, provider token lifecycle, richer failed-attempt windows. |
| Advanced CCTV | NVR gateway management, motion events, snapshot archive, stream health analytics. |
| Chat | Full chat between Penghuni and admin. |
| Push/WhatsApp | Provider delivery tables and retry tracking. |
| Advanced Reporting | Materialized snapshots, scheduled exports, analytics views. |
| Contract/Legal | Lease contract file generation and digital signature. |
| Maintenance Expansion | Preventive maintenance schedule, vendor management, asset maintenance history. |

Phase 2 must preserve Phase 1 security decisions:

- Provider secrets stay backend-only.
- Property scoping remains mandatory.
- `property_owner` remains read-only unless a future product decision explicitly creates a new permission and audit model.
- Payment gateway callbacks must be idempotent and auditable.
- Public booking must not expose internal room/security data.
