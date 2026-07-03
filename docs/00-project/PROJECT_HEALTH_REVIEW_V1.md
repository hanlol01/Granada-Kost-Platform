# Project Health Review v1 — Granada Kost Platform

> Tanggal review: 2026-06-30
> Reviewer role: Principal Software Architect & QA Reviewer
> Cakupan: Backend Phase 1, Smart Lock Foundation (M10A–M10E), Frontend Phase 1 (M11A–M11G / M11GV)
> Status: Advisory document. Tidak mengubah kode, backend, frontend, ataupun ADR.
> Update 02 July 2026 Time 08:37 : 
QA-01 Final Regression completed successfully.
Internal Demo status upgraded to Ready.
---

## Update

QA-01 Final Regression telah selesai.

Status berubah dari:

Internal Demo Ready (Conditional)

menjadi

Internal Demo Ready


## 1. Executive Summary

Granada Kost Platform telah menyelesaikan **fondasi Phase 1 secara utuh** untuk backend, Smart Lock Foundation, dan seluruh integrasi frontend Phase 1 (Admin + Penghuni). Milestone terakhir yang selesai adalah **M11G – Reports & Audit Minimum** dengan **M11GV** berstatus **PASS** (lint, typecheck, dan build hijau di kedua aplikasi).

Repository saat ini berada pada kondisi yang **stabil untuk internal demo**: seluruh modul operasional harian (Property, Room, Resident, Occupancy, Billing, Complaint, Maintenance, Vehicle, Parking, Notification) sudah live dari backend nyata, dan tidak ada blocker arsitektural yang belum tertangani. Beberapa bagian sistem sengaja masih berupa placeholder — Smart Lock live, CCTV, Audit Viewer, Export, File API, Booking, dan Chat — semuanya sudah dijadwalkan pada milestone berikutnya dan dilindungi oleh feature flag atau UI-gate yang eksplisit.

Kualitas kode terjaga: shared selectors menjamin **Dashboard dan Reports menghasilkan angka yang identik**, arsitektur frontend tetap sesuai ADR yang dibekukan pada M11AF, dan tidak ada perubahan backend atau ADR yang dilakukan di sepanjang M11B–M11G. Risiko utama sebelum staging berada di dua area: (a) sisi produk—Audit Viewer dan Export masih menunggu endpoint backend, (b) sisi operasional—smoke test Penghuni end-to-end belum dilakukan secara terstruktur pasca M11FV.

**Verdict akhir dituangkan di bagian akhir dokumen.**

---

## Architecture Stability

Salah satu indikator kesehatan yang paling penting dari siklus ini adalah bahwa seluruh implementasi Backend Phase 1, Smart Lock Foundation, dan Frontend Phase 1 berhasil diselesaikan **tanpa mengubah keputusan arsitektur yang telah dibekukan**. Secara konkret:

- **Domain Model** tidak berubah. Bounded context IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint, Maintenance, Vehicle, Parking, Notification, dan Smart Lock tetap sesuai `DOMAIN_MODEL.md` dan `BACKEND_ARCHITECTURE.md`.
- **Database Schema utama** tidak berubah. Migration bertambah secara aditif (Layer 5–6 seed dan migration modul baru) tanpa mengubah tabel-tabel inti yang sudah dirilis pada milestone sebelumnya.
- **API Contract** tetap konsisten dengan `API_PLANNING.md`. Endpoint yang belum dibuka tetap masuk daftar Phase 1/Phase 2 tanpa memutar balik keputusan sebelumnya, dan endpoint yang sudah rilis tidak mengalami breaking change.
- **Backend Architecture** (`BACKEND_ARCHITECTURE.md`) tetap sebagai blueprint tunggal. Modular monolith NestJS, PostgreSQL sebagai system of record, Redis untuk ephemeral workloads, provider abstraction, dan policy enforcement point di backend semuanya dipatuhi.
- **Frontend ADR** (`FRONTEND_ARCHITECTURE_DECISIONS.md`) yang dibekukan di M11AF tetap utuh. Tidak ada ADR baru yang ditambahkan setelah freeze; seluruh implementasi M11B–M11G/M11GV mengikuti ADR-FE-001 s/d ADR-FE-011.
- **UI Design Lovable** dipertahankan verbatim. Perubahan yang dilakukan hanya menambahkan skeleton, empty/error state, wiring data, dan RBAC visibility — tidak ada redesign visual.

Stabilitas ini menegaskan bahwa arsitektur yang dirancang di awal proyek berhasil menampung seluruh implementasi Phase 1 tanpa perlu revisi mendasar. Ini menjadi indikator kualitas planning dan mengurangi risiko rework saat memasuki Phase 2.

---

## 2. Status Backend

Backend berstatus **selesai untuk Phase 1**. Seluruh modul yang dijanjikan dalam `BACKEND_ARCHITECTURE.md` untuk cakupan Phase 1 telah dibangun, di-seed pada Layer 0–6, dan divalidasi melalui workflow validation script per modul.

Modul yang sudah dirilis:

- IAM/RBAC lengkap (users, roles, permissions, sessions, refresh rotation, audit hooks).
- Property + Room + Resident + Occupancy + Check-in/Check-out foundation.
- Billing Phase 1 (invoice, payment, payment proof workflow, cancellation).
- Complaint + Maintenance Phase 1 (workflow transitions, technician assignment, work orders).
- Vehicle + Parking Phase 1 (approval workflow, zone/slot manajemen).
- Notification Phase 1 (in-app + provider abstraction, Brevo email dummy delivery).
- Smart Lock Phase 1 API sampai M10E (RBAC, property scope, resident self-scope, simulated Tuya gateway).

Aspek yang belum diimplementasi (sengaja, sesuai roadmap):

- Endpoint agregat/aggregated read: `/admin/dashboard/*`, `/billing/aging-summary`, `/reports/*`, `/reports/exports`.
- Endpoint Audit surface: `/audit/logs`, `/audit/auth-events`, `/audit/smart-lock-events`, `/audit/cctv-events`, `/audit/exports`, `/files/{id}/access-logs`.
- File API (`/files`, `/files/{id}/access-url`) beserta storage adapter.
- Smart Lock Multi Gateway implementation (M10F sudah dirancang penuh sebagai design-only).
- CCTV module lengkap.
- Payment gateway, public booking, chat, push/WhatsApp — masih di Phase 2.

Secara health: **hijau**. Tidak ada endpoint yang "sebagian jadi". Semua yang ada di `app.module.ts` terhubung dan sudah lulus workflow validation.

---

## 3. Status Frontend Admin

Admin app **live sepenuhnya untuk data operasional harian** dan sudah memakai backend nyata.

Halaman live (read + mutation):

- Dashboard, Rooms (create/edit/status), Tenants (create/edit/status + check-in dialog), Payments (invoice issue/cancel + payment verify/reject), Complaints (workflow transitions), Vehicles (approve/reject/suspend/reactivate/deactivate), Parking (zones + slots + assign/release).
- Reports (M11G) sebagai halaman baru yang di-drive dari shared selectors bersama Dashboard.

Halaman yang masih placeholder atau menunggu milestone berikutnya:

- Smart Lock dan Access History (menunggu M10G real Tuya + M11H).
- CCTV (menunggu gateway lokal + M11I).
- Booking dan Manajemen Booking (Phase 2, di balik feature flag).
- Notifications Admin (list dummy; wired di milestone berikutnya).
- Settings (form statis; wired di milestone berikutnya).

Infrastruktur frontend Admin sudah lengkap dan sesuai ADR yang dibekukan: `api-client` dengan single-flight refresh queue, `domain` package sebagai single source of truth tipe, `AuthProvider` dengan token in-memory, `PropertyProvider` dengan cache-bleed protection, RBAC-aware nav dan RoleGate.

Kesehatan: **hijau untuk scope Phase 1 harian**; area yang belum tersentuh berada di kolom "menunggu backend" atau "menunggu perangkat fisik", bukan "gagal implementasi".

Secara lintas aplikasi, seluruh workflow operasional utama kini telah menggunakan backend nyata. Read dan mutation pada Rooms, Residents, Payments, Complaints, Vehicles, Parking, Notifications Penghuni, dan Reports semuanya mengalir melalui endpoint Phase 1 yang telah dirilis, bukan lagi dari `mock-data.ts` atau `dummy-data.ts`. Dummy data hanya tersisa pada halaman yang memang belum menjadi scope Phase 1 — Smart Lock UI, Access History, CCTV, Booking, Notifications Admin, Settings, dan Chat Penghuni — dan semuanya berada di balik label eksplisit atau feature flag sehingga tidak berpotensi menyesatkan pengguna saat demo.

---

## 4. Status Frontend Penghuni

Penghuni PWA selesai untuk **Penghuni Core (M11F / M11FV)**.

Halaman live:

- Home (`/_app/`): greeting `/auth/me`, current invoice dari `/my/invoices`, recent payments dari `/my/payments`, badge unread `/my/notifications/unread-count`.
- Billing (`/_app/billing`): list invoice + payment ledger. Upload bukti pembayaran disabled dengan label eksplisit menunggu File API.
- Complaints (`/_app/complaints`): list read-only dari `/my/complaints`. Buat tiket ditahan karena endpoint kategori resident-scope belum tersedia.
- Notifications (`/_app/notifications`): list + optimistic mark-as-read + mark-all + badge.
- Info (`/_app/info`): empty state eksplisit per tab (Pengumuman/Peraturan/FAQ) sampai endpoint resident tersedia.
- Profile (`/_app/profile`): header dari `/auth/me`, list sesi aktif, revoke sesi, logout, logout-all.

Bagian yang ditahan secara sadar: payment proof submit, complaint create, edit profil, change password. Semuanya menunggu endpoint backend (File API, kategori resident-scope, `PATCH /penghuni/me`).

Kesehatan: **hijau**. Struktur data dan hook sudah siap; feature yang ditahan tidak menghadirkan workflow palsu — dialog eksplisit menyatakan alasannya.

---

## 5. Status Smart Lock

Smart Lock berada di **M10E selesai** dari sisi backend Phase 1 API (RBAC, property scope, resident self-scope, simulated Tuya response, rate limit helper) dan **M10F selesai sebagai design-only** (Multi Gateway Architecture — Gateway Registry, Resolver, Failover, Credential Management, Migration workflow). Real Tuya integration (M10G) belum dimulai karena akses fisik ke perangkat PALOMA di lokasi belum tersedia; hasil investigasi perangkat dan Tuya Cloud sudah dituangkan di laporan Week_2 dengan hasil positif.

UI Smart Lock di kedua aplikasi belum dibangun dan sengaja menunggu M11H setelah runtime real Tuya siap. Frontend flag `VITE_FEATURE_SMARTLOCK_MODE` sudah disediakan sehingga transisi dari simulated ke live tidak memerlukan redesign.

Kesehatan: **kuning kontekstual** — bukan karena kualitas kode atau desain (keduanya sudah frozen dan solid), melainkan karena ketergantungan eksternal (akses fisik dan pengujian di lokasi). Rencana mitigasi sudah tersusun sebagai bagian dari strategi M10F.

---

## 6. Fitur yang Sudah Dapat Didemokan

Surface yang aman untuk **internal demo** hari ini:

- **Autentikasi**: Login Admin dan Penghuni, refresh silent, logout, sessions list dan revoke, logout-all.
- **Multi-property scope**: switching properti di Admin tanpa cache bleed.
- **Manajemen Kamar**: pembuatan, edit, status transition, filter, empty/filtered-empty state.
- **Manajemen Penghuni**: CRUD terbatas + check-in dialog dari halaman Tenants.
- **Billing Operasional**: list invoice, issue/cancel invoice, verifikasi/tolak pembayaran, tab payment proofs.
- **Komplain**: workflow transitions penuh (acknowledge / resolve / close / reopen / cancel) dengan konfirmasi.
- **Kendaraan**: approval workflow lengkap.
- **Parkir**: zona + slot + assign/release slot.
- **Reports Admin**: KPI strip, Pendapatan Bulanan per tahun, Okupansi Kamar, SummaryCard Billing Aging / Pembayaran / Komplain / Maintenance / Kendaraan / Parkir, snapshot Penghuni. Konsisten dengan Dashboard.
- **Penghuni PWA**: Home, Billing (read-only), Complaints (read-only), Notifications (aktif), Info (empty explicit), Profile (aktif).
- **RBAC UX**: Forbidden state, nav filtering, RoleGate.
- **Error handling**: skeleton, empty, filtered-empty, error dengan correlation id, retry, tanpa PII di console.

---

## 7. Placeholder / Fitur yang Belum Aktif

Semua placeholder di bawah berada di sisi UI dengan label eksplisit dan tidak menyalurkan workflow palsu:

- **Smart Lock UI (Admin + Penghuni)**: menunggu M10G real Tuya + M11H.
- **Access History**: menunggu Smart Lock live.
- **CCTV**: menunggu gateway lokal + M11I.
- **Booking + Manajemen Booking**: Phase 2 (M11J), di balik feature flag.
- **Notifications Admin** (halaman): masih list dummy — dipindah ke milestone berikutnya.
- **Settings Admin**: form statis — dipindah ke milestone berikutnya.
- **Audit Viewer** (di halaman Reports): hook `useAuditLogs` mengembalikan `available: false` dengan pesan eksplisit sampai `/audit/*` tersedia.
- **Export Reports**: tombol disabled dengan tooltip eksplisit sampai `/reports/exports` tersedia.
- **Payment Proof Submit (Penghuni)**: tombol disabled sampai File API rilis.
- **Complaint Create (Penghuni)**: dialog menjelaskan endpoint kategori resident-scope belum dibuka.
- **Edit Profil / Change Password (Penghuni)**: dipending sampai endpoint tersedia.
- **Chat Penghuni ↔ Admin**: Phase 2.

---

## 8. Hasil Smoke Test Manual

Smoke test manual dijalankan pada surface Admin utama pasca perbaikan M11GV. Hasil terangkum di bawah, disertai temuan yang muncul sebelum perbaikan dan status akhirnya.

**Admin — hasil pengujian:**

| Area | Hasil |
|---|---|
| Login Admin | Berhasil |
| Dashboard Admin dengan data seed | Tampil dengan data nyata (bukan mock) |
| Rooms | Tampil |
| Residents | Tampil |
| Payments | Tampil |
| Complaints | Tampil |
| Vehicles | Tampil |
| Parking | Tampil |
| Reports | Tampil dan konsisten dengan Dashboard |

**Isu yang muncul selama smoke test dan sudah diperbaiki:**

- Login/session sempat bermasalah karena kombinasi refresh token cookie dan property scope mismatch. Sudah diperbaiki; alur silent refresh + property switch kembali stabil.
- Reports dan Dashboard sempat mengembalikan `Request validation failed` pada beberapa query karena `limit`/query params dan `property_id` pada parking slots tidak konsisten. Sudah diperbaiki di M11GV (parking slots fan-out per zone tetap property-scoped, query key stabil).

**Setelah perbaikan**, seluruh halaman utama Admin dapat dibuka tanpa error dan terlihat aman untuk internal demo.

**Penghuni:**

Smoke test end-to-end Penghuni tidak dilakukan pada sesi ini. Status validasi resmi Penghuni Core adalah **M11FV PASS**. Untuk kesiapan demo eksternal, smoke test Penghuni end-to-end (login → home → billing → complaints → notifications → profile → session revoke) perlu dilakukan sebagai kelengkapan.

---

## 9. Bug yang Ditemukan dan Sudah Diperbaiki

Selama siklus smoke test dan M11GV berikut bug/observasi yang tercatat dan sudah selesai ditangani:

- **Refresh token + property scope**: silent refresh sempat gagal menyelaraskan `currentPropertyId` dari session terhadap property switch berikutnya. Diperbaiki dengan meninjau ulang `PropertyProvider` dan alur boot `AuthProvider`.
- **Request validation gagal pada Reports/Dashboard**: query parking slots tidak selalu membawa property scope dan beberapa endpoint menolak parameter `limit`/`offset` yang tidak sesuai DTO. Diperbaiki di M11G/M11GV dengan menyeragamkan query params di `useReports` dan `useDashboardSummary`, serta menstabilkan dependency zones di query key.
- **Hook order Reports page**: RBAC guard yang mengembalikan lebih awal menyebabkan hook `useReports`/`useAuditLogs` menjadi kondisional. Diperbaiki dengan memindahkan gating ke parent dan memisahkan body Reports ke child component.
- **Panggilan spekulatif `/billing/aging-summary`**: endpoint tidak ada di backend, menyebabkan 404 senyap pada Dashboard sebelum M11G. Diperbaiki dengan refactor `useDashboardSummary` di atas `useReports`.

Tidak ada bug kritikal yang masih terbuka dari smoke test terakhir.

---

## 10. Technical Debt

Hutang teknis yang tercatat, dikelompokkan berdasarkan prioritas:

**Prioritas menengah**:

- Agregasi Reports client-side dengan `limit=500` per resource. Aman untuk skala Granada (~163 kamar), tetapi harus digantikan endpoint `/reports/*` dedicated saat volume tumbuh.
- **Dashboard dan Reports saat ini menggunakan client-side aggregation** melalui `useReports` dan shared selectors. Pendekatan ini menjaga konsistensi angka antar surface, tetapi menempatkan beban perhitungan pada browser dan mengambil beberapa list endpoint sekaligus per kunjungan halaman. Direkomendasikan **dipindahkan ke backend melalui endpoint agregasi khusus** (`/admin/dashboard/summary`, `/reports/*`, `/billing/aging-summary`) sebelum production untuk mengurangi payload, latency, dan risiko inkonsistensi saat volume data tumbuh.
- Filter Reports masih per tahun; date-range bebas menunggu DatePicker komponen dan query date pada `/payments`/`/invoices`.
- Halaman `Notifications` dan `Settings` di Admin masih memakai dummy data. Karena masuk scope milestone berikutnya, tidak dinaikkan ke tinggi.
- Warning ESLint `exhaustive-deps` pada `complaints.tsx` dan `payments.tsx` yang bersifat legacy (tidak menyebabkan bug fungsional).

**Prioritas rendah**:

- Beberapa unused `eslint-disable` pada `api.ts` / `env.ts`.
- Warning Fast Refresh dari shadcn/provider lama.
- `vite-tsconfig-paths` dependency deprecation dan Lovable context build warning.
- Node engine sedikit di bawah requirement `eslint-visitor-keys@5.0.1` (v22.12.0), dengan 11 npm audit vulnerability dari transitive dependency. Perlu review saat dependency bump berikutnya.

**Struktural** (design decision, bukan bug):

- Smart Lock UI belum ada di kedua aplikasi. Ini sengaja menunggu M11H. Tidak dihitung sebagai debt selama roadmap dipatuhi.
- Audit Viewer & Export sebagai placeholder. Sengaja, dengan struktur yang siap di-swap satu file saat backend endpoint rilis.

---

## 11. Endpoint / API yang Belum Tersedia

Daftar konsolidasi endpoint yang direferensikan `API_PLANNING.md`/roadmap tetapi belum diimplementasi backend:

**Reporting & Dashboard**:

- `/api/v1/admin/dashboard/summary`
- `/api/v1/admin/dashboard/activity`
- `/api/v1/admin/queues/operational`
- `/api/v1/billing/aging-summary`
- `/api/v1/reports/occupancy`, `/reports/revenue`, `/reports/billing-aging`, `/reports/payments`, `/reports/complaints`, `/reports/maintenance`, `/reports/smart-locks`, `/reports/cctv`
- `/api/v1/reports/exports`

**Audit**:

- `/api/v1/audit/logs`, `/audit/auth-events`, `/audit/smart-lock-events`, `/audit/cctv-events`, `/audit/exports`
- `/api/v1/files/{id}/access-logs`

**File API**:

- `/api/v1/files`, `/api/v1/files/{id}/access-url`, `/api/v1/files/{id}` (delete)

**Penghuni self-service (menunggu buka scope)**:

- `PATCH /api/v1/penghuni/me`
- `POST /api/v1/penghuni/payments/proofs` (butuh File API dulu)
- Kategori komplain resident-scope
- `POST /api/v1/penghuni/lease-extension-requests`, `POST /api/v1/penghuni/check-out-requests`

**Smart Lock live & CCTV**:

- Real Tuya provider path (M10G), real device sync, Multi Gateway implementation (M10F).
- Seluruh module CCTV (`/cctv/*`).

**Phase 2 surfaces** (tetap ditunda):

- Payment Gateway (webhook, reconciliation), Public Booking, Chat, Push notification, WhatsApp/Fonnte delivery.

---

## 12. Risiko Sebelum Staging / Deployment

Risiko dikelompokkan berdasarkan area operasional. Semua risiko di bawah memiliki mitigasi yang jelas.

**Risiko produk / scope**:

- **R-01** — Audit Viewer dan Export di Reports masih placeholder. Bila stakeholder mengharapkan audit trail siap sebelum go-live, endpoint `/audit/logs` dan `/reports/exports` harus diprioritaskan pada milestone backend berikutnya.
- **R-02** — File API belum ada. Payment proof submit dan complaint create Penghuni tidak dapat diaktifkan tanpa File API. Untuk demo internal, ini dapat diterima; untuk soft-launch, harus ditutup.

**Risiko integrasi**:

- **R-03** — Smart Lock real Tuya (M10G) menunggu akses fisik perangkat PALOMA. Rencana cadangan sudah ada dalam design M10F (Multi Gateway) sehingga tidak akan terjadi rewrite domain saat cut-over.
- **R-04** — CCTV gateway lokal belum tersedia. Tidak ada risiko keamanan langsung karena tidak ada endpoint atau UI yang membocorkan RTSP/IP.

**Risiko operasional**:

- **R-05** — Smoke test end-to-end Penghuni belum dijalankan pasca M11FV. Perlu direncanakan sebelum demo publik untuk Penghuni.
- **R-06** — Notifications Admin dan Settings masih dummy. Harus dibarengi disclaimer saat demo, atau feature flag yang menonaktifkan sementara.
- **R-07** — Deployment target (Cloudflare) belum diuji pada build produksi dengan token flow yang menyertakan cookie HTTP-only refresh. Uji akhir CORS dan cookie SameSite perlu dilakukan sebelum staging.
- **R-08** — Backend saat ini di-seed dengan Layer 6 dummy data (10 resident, 8 occupancy, 9 vehicle, 3 zona, dsb.). Untuk staging, perlu dipastikan seed jelas dipisahkan dari data operasional yang akan mengisi properti nyata.

**Risiko keamanan (kontrol yang harus dipertahankan)**:

- **R-09** — Access token tetap in-memory saja sesuai ADR-FE-003. Perlu dijaga di setiap PR berikutnya agar tidak digeser ke `localStorage`.
- **R-10** — Tidak ada logging PII / provider payload di console. Perlu dipertahankan sebagai lint/PR rule.

---

## 13. Rekomendasi Milestone Berikutnya

Rekomendasi berdasarkan urgensi bisnis dan blocker eksternal:

1. **Backend follow-up (paling siap dimulai segera)** — buka `/audit/logs` minimum dan `/reports/exports`. Frontend sudah siap menyerap keduanya tanpa redesign; ini mengubah dua placeholder terakhir Reports menjadi live.
2. **File API** — implementasi `POST /files` + signed access URL. Membuka payment proof submit dan complaint create Penghuni yang saat ini ditahan. Nilai bisnisnya besar karena melengkapi loop tagihan dan komplain.
3. **Smoke test end-to-end Penghuni** — dokumentasikan sebagai laporan validasi sejenis M11FV lanjutan sebelum demo eksternal.
4. **M10G Smart Lock Runtime Integration** — begitu akses fisik ke lokasi diperoleh, ini menjadi jalur kritis untuk M11H (UI Smart Lock live).
5. **Notifications Admin dan Settings** — angkat dari dummy ke live. Karena endpoint sebagian besar sudah tersedia, ini menjadi milestone kecil yang cepat.
6. **M11H, M11I, M11J** — mengikuti ROADMAP tanpa perubahan urutan.

---

## Deployment Readiness

Ringkasan status kesiapan build, kualitas kode, pengujian, dan lingkungan operasional menjelang deployment:

| Aspek | Status |
|---|---|
| Backend Build | PASS |
| Frontend Admin Build | PASS |
| Frontend Penghuni Build | PASS |
| Lint | PASS (0 error, warning legacy tercatat di Technical Debt) |
| Typecheck | PASS (Admin + Penghuni) |
| Smoke Test Admin | PASS (Dashboard, Rooms, Residents, Payments, Complaints, Vehicles, Parking, Reports) |
| Smoke Test Penghuni | Perlu validasi end-to-end (M11FV sudah PASS, smoke test menyeluruh pasca M11G belum dijalankan) |
| CI/CD | Belum tersedia (belum ada pipeline lint/typecheck/build/test otomatis pada MR) |
| VPS Deployment | Belum dilakukan (belum ada image/artifact yang dideploy ke VPS target) |
| Production Environment | Belum divalidasi (CORS produksi, cookie SameSite, secret management, health check produksi belum diuji end-to-end) |

Implikasi:

- Kesiapan **kualitas kode** dan **build** sudah pada level yang aman untuk internal demo.
- Kesiapan **lingkungan operasional** belum tuntas. CI/CD, deployment ke VPS, dan validasi environment produksi perlu dijadikan pekerjaan tersendiri sebelum staging/soft-launch.
- Smoke test Penghuni end-to-end merupakan gap yang perlu ditutup sebelum demo eksternal, meskipun tidak menahan internal demo.

---

## 14. Verdict

**A. Repository siap masuk fase Internal Demo Readiness.**

Dasar penilaian: (a) seluruh modul operasional harian sudah live dari backend nyata dan tersaji di UI tanpa data dummy pada halaman kritis, (b) Dashboard dan Reports terbukti konsisten karena berbagi selector yang sama, (c) placeholder yang tersisa memiliki label eksplisit dan tidak menyalurkan workflow palsu, (d) bug yang muncul saat smoke test sudah selesai diperbaiki, (e) arsitektur frontend maupun backend masih patuh pada ADR yang dibekukan.

Catatan untuk internal demo:

- Fokuskan demo pada Admin (Dashboard → Rooms → Tenants → Payments → Complaints → Vehicles → Parking → Reports).
- Sertakan disclaimer untuk placeholder yang masih terbuka (Smart Lock, CCTV, Booking, Audit Viewer, Export, Notifications, Settings).
- Rencanakan smoke test terstruktur Penghuni sebelum demo publik.
- Prioritaskan backend follow-up `/audit/*` + `/reports/exports` dan File API pada milestone berikutnya untuk menutup dua area placeholder yang paling terlihat.

Granada Kost Platform dinilai berada dalam **kondisi sehat** untuk melangkah dari akhir Phase 1 ke tahap Internal Demo Readiness, dengan roadmap berikutnya yang jelas dan blocker eksternal (perangkat Smart Lock) yang sudah memiliki rencana mitigasi.

Update 02 July 2026 Time 08:37 : 
QA-01 Final Regression completed successfully.
Internal Demo status upgraded to Ready.

---



Update 03 July 2026 :
M12 File Upload Foundation (M12C1-M12C5) dan M12D Penghuni Complaint Create selesai.
Lihat Addendum 2026-07-03 di bawah.

---

## Addendum - 2026-07-03 · M12 File Upload Foundation & Attachment Flows

> Sifat: addendum advisory. Tidak mengubah isi review v1 di atas. Sumber kebenaran:
> dokumen implementasi di `docs/12-product-readiness/` dan
> `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`.

### Perubahan status sejak v1

- **File API kini ada dan backend-mediated.** `POST /files`, `GET /files/:id`, `GET /files/:id/content`, `DELETE /files/:id` live (M12C1). Seluruh upload/preview/download melalui otorisasi backend; tidak ada URL storage publik; `storage_path` tidak pernah diekspos ke frontend. Catatan: bentuk final memakai `GET /files/:id/content` (bukan `access-url` seperti draft awal ADR-FE-009).
- **Alur bukti pembayaran manual operasional end-to-end:** Penghuni upload bukti (M12C3) -> proof `pending_review` -> Admin preview lampiran via blob terotorisasi (M12C5) -> Admin verify/reject. Verifikasi admin tetap satu-satunya otoritas settlement; tagihan tidak otomatis lunas.
- **Alur lampiran komplain operasional end-to-end:** Penghuni membuat komplain dengan 0-5 foto opsional (M12D) -> backend memvalidasi dan meng-attach file secara transaksional (M12C4) -> Admin preview lampiran di detail komplain (M12C5). Endpoint kategori resident-safe (`GET /my/complaints/categories`) menutup blocker lama pada Section 11.
- **Risiko R-02 (File API belum ada) ditutup.** Entri "File API" pada Section 11 kini terpenuhi; "kategori komplain resident-scope" pada daftar Penghuni self-service juga terpenuhi. Payment proof submit dan complaint create Penghuni tidak lagi placeholder.
- **Upload bersifat bounded dan storage-conscious:** batas 2 MB gambar / 5 MB PDF per purpose, magic-byte validation, blocklist ekstensi, checksum SHA256, rate limit per user/properti, kebijakan cleanup 24 jam / 30 hari / 90 hari - dirancang untuk budget +-40 GB pada VPS 80 GB SSD. Kostation bukan platform penyimpanan file; upload hanya untuk bukti operasional.

### Tetap deferred (tidak berubah dari v1)

- Payment gateway / Midtrans - milestone mendatang. Tidak boleh dianggap selesai.
- Receipt / nota - milestone mendatang.
- Smart Lock live Tuya/PALOMA (M10G) - menunggu akses fisik perangkat.
- CCTV live integration - menunggu gateway lokal.
- Chat attachment - tidak didukung fase ini.
- Video upload - tidak didukung fase ini.
- `/audit/*`, `/reports/exports`, `PATCH /penghuni/me` - masih backlog backend.

### Invarian arsitektur (dipertahankan pada seluruh M12)

- Backend adalah titik penegakan kebijakan final; validasi frontend UX-only.
- PostgreSQL system of record (tabel `files` untuk metadata file); Redis hanya runtime/cache/queue/rate-limit - bukan penyimpanan file.
- Property scoping wajib pada setiap akses file; resident self-scope ditegakkan backend (kepemilikan file + resource induk).
- Preview file hanya melalui authorized blob fetch yang dimediasi backend. Tidak ada URL file publik.

### Catatan kejujuran status

- Validasi M12D selesai dengan **PASS**, dijalankan eksternal via Codex GPT-5.5 High: `lint:penghuni` PASS (setelah perbaikan format Prettier terbatas), typecheck penghuni PASS, `build:penghuni` PASS, `lint:api` PASS, `build:api` PASS, `git diff --check` bersih (hanya warning line-ending Git). Perbaikan minimal Prettier-only pada 3 file, tanpa perubahan logika. Tidak ada validasi yang dijalankan oleh agen dokumentasi.
- Item demo M12 pada `INTERNAL_DEMO_CHECKLIST.md` Section 12 berstatus PENDING QA browser. (Update 2026-07-03 M12H: final visual E2E demo pass M12 selesai dengan verdict PASS via QA-M12H, dijalankan eksternal di Codex GPT-5.5 High; Scope A-F PASS, evidensi di `artifacts/m12h-final-demo-pass/`.)
- Kesiapan CI/CD, deployment VPS, dan validasi environment produksi tidak berubah dari review v1 (belum tersedia/tervalidasi).
- Kesimpulan kesehatan tetap: **Internal Demo Ready** - kini dengan permukaan file upload yang menunggu QA pass sebelum didemokan secara eksternal. Ini bukan pernyataan production readiness.

---

**Granada Kost Platform · Project Health Review v1 · 2026-06-30 (Addendum 2026-07-03)**
