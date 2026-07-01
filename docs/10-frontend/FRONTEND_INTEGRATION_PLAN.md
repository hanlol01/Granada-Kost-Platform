# Frontend Integration Plan — Granada Kost Platform

> Milestone: M11A — Frontend Integration Planning
> Status: Phase 1 demoable after M11G/M11GV.
> Tanggal: 2026-06-30
> Peran pembuat: Technical Architect & Frontend Integration Planner
> Cakupan: Admin (`apps/admin`) dan Penghuni (`apps/penghuni`) terhadap backend NestJS di `backend/api`.

---

## 1. Executive Summary

Backend Granada Kost Platform sudah menyelesaikan modul inti Phase 1: IAM/RBAC, Property, Room, Resident, Occupancy, Billing, Complaint, Maintenance, Vehicle, Parking, Notification, dan Smart Lock foundation/runtime/validation sampai M10E. Real Tuya integration ditunda karena belum ada akses fisik ke perangkat di lokasi.

Frontend Admin dan Penghuni hasil generasi Lovable saat ini sepenuhnya bekerja dengan data lokal (`apps/admin/src/lib/mock-data.ts` dan `apps/penghuni/src/lib/dummy-data.ts`). Tidak ada API client, tidak ada auth flow, tidak ada query layer terhubung ke backend, dan tidak ada guard route. Routing TanStack Router sudah rapi dan UI sudah memakai shadcn/ui + Tailwind dengan kualitas yang baik.

Dokumen ini menetapkan rencana integrasi bertahap mulai dari fondasi infrastruktur klien (API client, auth, query layer) hingga penggantian dummy data per domain. Prinsip utama: tidak redesign UI, hanya mengganti sumber data, dan menegakkan business rule tetap di backend.

Status terkini per 2026-07-01: M11G selesai, M11GV PASS, dan Frontend Admin/Penghuni Phase 1 demoable. Admin sudah demoable untuk Dashboard, Rooms, Tenants, Payments, Complaints, Vehicles, Parking, dan Reports. Penghuni sudah demoable untuk Home, Billing, Complaints read, Notifications, Info, dan Profile/session. Smart Lock real UI, CCTV preview, Booking, Chat, File upload fisik, Audit endpoint, dan Reports export tetap deferred/placeholder eksplisit.

Verdict akhir tersedia di bagian 22.

---

## 2. Struktur Frontend Admin Saat Ini

Lokasi: `apps/admin/`.

Stack:
- React 19 + TanStack Router (file-based, file `routeTree.gen.ts` auto-generated).
- TanStack React Query 5 sudah dipasang sebagai dependency, sudah ada `QueryClientProvider` di `__root.tsx`, tetapi belum ada query/mutation aktual.
- shadcn/ui + Tailwind v4.
- recharts untuk chart, sonner untuk toast, lucide-react untuk ikon.
- Vite + Cloudflare plugin (deploy via wrangler).

Route (flat) di `apps/admin/src/routes/`:
- `index.tsx` — Dashboard.
- `rooms.tsx` — Manajemen Kamar.
- `tenants.tsx` — Manajemen Penghuni.
- `payments.tsx` — Pembayaran.
- `complaints.tsx` — Komplain.
- `cctv.tsx` — CCTV (placeholder UI).
- `smart-lock.tsx` — Smart Lock dashboard simulated.
- `access-history.tsx` — Riwayat akses Smart Lock simulated.
- `booking.tsx` — Form booking kamar.
- `bookings.tsx` — Manajemen booking.
- `notifications.tsx` — Notifikasi.
- `reports.tsx` — Laporan.
- `settings.tsx` — Pengaturan.

Layout:
- `components/layout/app-shell.tsx` membungkus sidebar dan area konten.
- `components/layout/nav.tsx` mendefinisikan `Sidebar` desktop dan `BottomNav` mobile dengan daftar `navItems` statis.

Observasi penting:
- Tidak ada route `login` atau `auth` di Admin.
- Tidak ada `AuthGuard`, tidak ada penanganan token.
- Tidak ada API client (tidak ada `lib/api`, tidak ada `axios`/`ky`/`fetch wrapper`).
- Tidak ada environment variable terdefinisi.
- Tidak ada konteks role/permission.

---

## 3. Struktur Frontend Penghuni Saat Ini

Lokasi: `apps/penghuni/`.

Stack identik dengan Admin (React 19, TanStack Router/Query, shadcn/ui, Tailwind v4, Vite + Cloudflare).

Route (nested) di `apps/penghuni/src/routes/`:
- `__root.tsx` — root layout.
- `_app.tsx` — layout grup `_app` (membungkus halaman pasca-login secara visual).
- `_app/index.tsx` — Home.
- `_app/billing.tsx` — Tagihan dan riwayat pembayaran.
- `_app/complaints.tsx` — Komplain.
- `_app/notifications.tsx` — Notifikasi.
- `_app/info.tsx` — Pengumuman/Rules/FAQ.
- `_app/profile.tsx` — Profil penghuni.
- `_app/chat.tsx` — Chat (dummy; secara backlog masuk Phase 2).

Layout:
- `components/AppHeader.tsx` header sederhana.
- `components/BottomNav.tsx` bottom navigation (Home/Tagihan/Komplain/Notif/Profil).

Observasi penting:
- Tidak ada route `login` atau `onboarding`.
- Tidak ada Smart Lock UI di Penghuni saat ini (akan ditambahkan saat M10G/M11C).
- Tidak ada API client, tidak ada auth.
- Chat hanya tampilan dummy (consumer Phase 2, bukan prioritas M11).

---

## 4. Halaman yang Masih Memakai Dummy Data

Status per M11E (2026-06-30): mayoritas halaman Admin sudah memakai data backend (read + mutation). Penghuni app masih dummy sepenuhnya sampai M11F.

Admin - sudah live (read + mutation):
- Dashboard (`/`) - agregat `/rooms`, `/residents`, `/billing/aging-summary`.
- Kamar (`/rooms`) - list + create/edit/update status.
- Penghuni (`/tenants`) - list + create/edit/update status + check-in dialog.
- Pembayaran (`/payments`) - invoice list + issue/cancel; payment verify/reject di tab Verifikasi.
- Komplain (`/complaints`) - list + workflow transitions (acknowledge/resolve/close/reopen/cancel). Assign teknisi masih disabled (no picker).
- Kendaraan (`/vehicles`) - list + approve/reject/suspend/reactivate/deactivate.
- Parkir (`/parking`) - zones + slots + assign/release.

Admin - sudah live tambahan (per M11G, 2026-06-30):
- Laporan (`/reports`) - live agregasi dari endpoint Phase 1 melalui `useReports` + shared selectors (`apps/admin/src/lib/reports-selectors.ts`). KPI strip, Pendapatan Bulanan (per tahun), Okupansi Kamar, SummaryCard untuk Billing Aging / Pembayaran / Komplain / Maintenance / Kendaraan / Parkir, snapshot Penghuni. Loading skeleton, empty, filtered-empty, error+correlation id, retry, year filter, Forbidden untuk role di luar allowlist. Dashboard dan Reports memakai selector yang sama sehingga angka konsisten.
- Audit Viewer section (di halaman Reports) - placeholder eksplisit. Hook `useAuditLogs` mengembalikan `available: false` sampai endpoint `/audit/*` tersedia.
- Export Readiness - tombol Export di Reports dirender disabled dengan tooltip `"Export laporan tersedia setelah backend membuka /reports/exports."`. Struktur UI sudah siap di-swap tanpa redesign saat endpoint export rilis.

Admin - masih placeholder/dummy:
- Smart Lock (`/smart-lock`) - `smartLocks`, `lockActivityHourly`, `lockAlerts`. Live setelah M10G + M11H.
- Access History (`/access-history`) - dummy log. Live di M11H.
- CCTV (`/cctv`) - placeholder list kamera. Live di M11I.
- Booking (`/booking`, `/bookings`) - `bookingRooms`, `BOOKING_FEE`. Phase 2 (M11J).
- Notifikasi (`/notifications`) - list dummy. Dipindah ke milestone berikutnya (di luar M11G karena scope M11G hanya Reports + Audit minimum).
- Pengaturan (`/settings`) - form statis tanpa persistensi. Dipindah ke milestone berikutnya.

Penghuni - status per M11F (2026-06-30):
- Home (`/_app/`) - live. Komposisi `/auth/me` + `/my/invoices` (selector current invoice) + `/my/payments` + `/my/notifications/unread-count`. Bagian Pengumuman menjadi empty-state eksplisit sampai endpoint resident tersedia.
- Tagihan (`/_app/billing`) - live read. `/my/invoices` + `/my/payments`. Upload bukti pembayaran masih disabled dengan label jelas (menunggu File API).
- Komplain (`/_app/complaints`) - live read dari `/my/complaints`. Tombol Buat Tiket tetap muncul namun dialognya menjelaskan endpoint kategori belum tersedia untuk resident, sehingga create ditahan tanpa workflow palsu.
- Notifikasi (`/_app/notifications`) - live: list + mark-as-read (optimistic) + read-all via `/my/notifications/*`.
- Info (`/_app/info`) - placeholder empty-state per tab. Hook `usePenghuniInfo` siap di-swap saat endpoint resident dirilis.
- Profil (`/_app/profile`) - live: header dari `/auth/me`, list sesi aktif `/auth/sessions` + revoke + logout-all. Edit profil dan change password sengaja disabled (no `PATCH /penghuni/me`; form change password ditahan ke milestone berikutnya).
- Chat (`/_app/chat`) - tetap placeholder Phase 2.

---

## 5. Mapping Halaman Admin ke Endpoint Backend

Berdasarkan `docs/01-architecture/API_PLANNING.md`.

| Halaman Admin | Endpoint utama | Tambahan |
|---|---|---|
| `/` Dashboard | `GET /api/v1/admin/dashboard/summary`, `GET /api/v1/admin/dashboard/activity` | `GET /api/v1/admin/queues/operational` untuk widget antrian |
| `/rooms` | `GET /api/v1/rooms`, `POST /api/v1/rooms`, `PATCH /api/v1/rooms/{id}`, `PATCH /api/v1/rooms/{id}/status`, `GET /api/v1/rooms/availability` | `GET /api/v1/room-types`, `GET /api/v1/room-facilities` |
| `/tenants` (Penghuni) | `GET /api/v1/residents`, `POST /api/v1/residents`, `PATCH /api/v1/residents/{id}`, `PATCH /api/v1/residents/{id}/status`, `GET /api/v1/residents/{id}/billing-summary` | Check-in `POST /api/v1/check-ins`, Check-out `POST /api/v1/check-outs` |
| `/payments` | `GET /api/v1/billing/invoices`, `GET /api/v1/billing/payments`, `GET /api/v1/billing/payment-proofs`, `POST /api/v1/billing/payment-proofs/{id}/approve|reject`, `POST /api/v1/billing/invoices/{id}/issue|void` | `GET /api/v1/billing/aging-summary` |
| `/complaints` | `GET /api/v1/complaints`, `POST /api/v1/complaints/{id}/assign`, `POST /api/v1/complaints/{id}/status` | `GET /api/v1/complaint-categories`, `GET /api/v1/maintenance/work-orders` |
| `/smart-lock` | `GET /api/v1/smart-locks/devices`, `POST /api/v1/smart-locks/devices/{id}/lock|unlock`, `POST /api/v1/smart-locks/devices/{id}/sync-status`, `GET /api/v1/smart-locks/alerts` | UI tetap simulated sampai M10G selesai |
| `/access-history` | `GET /api/v1/smart-locks/access-logs` | Filter date range + device |
| `/cctv` | `GET /api/v1/cctv/cameras`, `POST /api/v1/cctv/cameras/{id}/preview-sessions`, `DELETE /api/v1/cctv/preview-sessions/{id}`, `GET /api/v1/cctv/alerts` | Ditunda (no real stream) |
| `/booking`, `/bookings` | Tidak masuk Phase 1 (public booking di-defer). Mapping sementara ke `GET /api/v1/rooms/availability` untuk pra-booking internal. | Endpoint booking dedicated baru di Phase 2 |
| `/notifications` | `GET /api/v1/notifications`, `PATCH /api/v1/notifications/{id}/read`, `GET /api/v1/announcements`, `POST /api/v1/announcements` | `GET /api/v1/kost-rules`, `GET /api/v1/faqs` |
| `/reports` | `GET /api/v1/reports/occupancy|revenue|billing-aging|payments|complaints|maintenance|smart-locks|cctv` | Export job: `POST /api/v1/reports/exports` |
| `/settings` | `GET /api/v1/admin/settings`, `PATCH /api/v1/admin/settings`, `GET|PATCH /api/v1/properties/{id}/settings`, `GET|POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/{id}/roles` | RBAC management hanya owner |

Kendaraan dan parkir belum punya UI Admin. Direkomendasikan ditambahkan di M11D (lihat bagian 19) memakai endpoint Vehicle/Parking yang sudah selesai backend-nya.

---

## 6. Mapping Halaman Penghuni ke Endpoint Backend

| Halaman Penghuni | Endpoint utama | Tambahan |
|---|---|---|
| `/_app/` Home | `GET /api/v1/penghuni/me`, `GET /api/v1/penghuni/room`, `GET /api/v1/penghuni/billing/current`, `GET /api/v1/announcements` | `GET /api/v1/penghuni/notifications` (badge) |
| `/_app/billing` | `GET /api/v1/penghuni/billing/current`, `GET /api/v1/penghuni/billing/history`, `POST /api/v1/penghuni/payments/proofs` | Upload via `POST /api/v1/files` lalu attach proof |
| `/_app/complaints` | `GET /api/v1/penghuni/complaints`, `POST /api/v1/penghuni/complaints`, `GET /api/v1/complaint-categories` | Upload foto via File API |
| `/_app/notifications` | `GET /api/v1/penghuni/notifications`, `PATCH /api/v1/penghuni/notifications/{id}/read` | `PATCH /api/v1/notifications/read-all` |
| `/_app/info` | `GET /api/v1/announcements`, `GET /api/v1/kost-rules`, `GET /api/v1/faqs` | Filter property scope server-side |
| `/_app/profile` | `GET /api/v1/penghuni/me`, `PATCH /api/v1/penghuni/me`, `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/{id}` | `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all` |
| `/_app/chat` | Tidak ada di Phase 1. Tampilan boleh dipertahankan sebagai placeholder "Coming soon". | Phase 2 |
| Smart Lock (belum ada UI) | `POST /api/v1/penghuni/smart-locks/{deviceId}/unlock|lock`, status dari `GET /api/v1/penghuni/room` | Ditambahkan setelah M10G real Tuya selesai |

---

## 7. Prioritas Integrasi Frontend

Urutan dipilih berdasarkan: nilai bisnis harian, tingkat kesiapan backend, dan minimnya dependensi pada modul yang ditunda.

Tinggi (wajib dahulu, blocker semua halaman lain):
1. Infrastruktur klien: API client (fetch wrapper), env config, error shape mapper, correlation id passthrough.
2. Auth flow: login, refresh, logout, session store, `AuthGuard`, role context.
3. Query layer: konvensi `queryKey`, `staleTime`, retry, dan invalidation.

Tinggi (data harian Admin):
4. Rooms, Residents, Occupancy ringkas.
5. Billing: invoice list, payment proofs approve/reject, aging summary.
6. Complaint + Maintenance work orders.
7. Notifikasi Admin dan Announcements.

Tinggi (data harian Penghuni):
8. Penghuni `me`, room, billing current/history, payment proof upload.
9. Complaint create + history Penghuni.
10. Notifikasi Penghuni dan Info/Rules/FAQ.

Sedang:
11. Reports Admin (occupancy, revenue, billing aging, payments).
12. Settings dan RBAC admin/users.
13. Vehicle + Parking UI baru di Admin (dan Penghuni read-only kendaraan miliknya).

Rendah / ditunda:
14. Smart Lock UI tetap simulated; integrasi data nyata setelah M10G.
15. CCTV preview tetap placeholder sampai integrasi gateway nyata.
16. Booking UI tetap, mapping definitif menunggu Phase 2.
17. Chat Penghuni placeholder.

---

## 8. Urutan Milestone Frontend (Rekomendasi)

Lihat juga bagian 19 untuk daftar M11B+ detail.

- M11A — Planning (dokumen ini).
- M11B — Foundation (API client, auth, query layer, AuthGuard, role context, env validation).
- M11C — Core data Admin (Rooms, Residents, Billing, Complaint).
- M11D — Core data Penghuni (me/room/billing/complaint/notifikasi/info), plus Vehicle Admin UI baru.
- M11E — Notifications, Announcements, Rules, FAQ, Settings, RBAC users.
- M11F — Reports + Audit minimum admin.
- M11G — Smart Lock UI integration (begitu M10G runtime real selesai).
- M11H — CCTV preview (saat gateway tersedia).
- M11I — Booking dan Chat (saat Phase 2 dimulai).

---

## 9. Data Contract yang Perlu Distandarkan

Sebelum integrasi dimulai, perlu paket bersama `packages/api-client` dan `packages/domain` (sudah dibahas di `BACKLOG.md`).

Kontrak minimum yang harus disepakati:

- Response envelope sukses: `{ data, meta?, correlation_id, timestamp }`.
- Response envelope error: `{ success: false, error: { code, message, details? }, correlation_id, timestamp }`.
- Pagination: `meta.page`, `meta.per_page`, `meta.total`, `meta.total_pages`, `meta.has_next`.
- Field casing API: konsisten (rekomendasi `snake_case` di backend, mapper ke `camelCase` di klien — atau sepakati `camelCase` di kedua sisi sejak awal).
- Money: minor unit integer (rupiah dalam integer penuh, tanpa float).
- Date/time: ISO 8601 UTC. Frontend menampilkan dengan zona lokal.
- Enum stabil: `room_status`, `payment_status`, `invoice_status`, `complaint_status`, `work_order_status`, `device_status`, `notification_type`. Frontend tidak boleh menebak nilai enum baru.
- Error code stabil yang sudah dipakai UI: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_STATE_TRANSITION`.
- Idempotency: header `Idempotency-Key` untuk write berisiko (lihat strategi di `API_PLANNING.md`).
- Correlation id: header `X-Correlation-Id`, request id ditampilkan di error UI untuk reporting.

Deliverable terkait:
- `packages/domain` berisi tipe TS hasil generate atau hand-written.
- `packages/api-client` membungkus fetch + retry + auth header + error normalization.

---

## 10. Auth / Session / Token Handling

Mengacu pada `BACKEND_ARCHITECTURE.md` (Authentication Architecture) dan `API_PLANNING.md` (Auth API).

Rencana di frontend:
- Storage access token: in-memory (state React/Zustand). Tidak boleh di localStorage karena risiko XSS.
- Storage refresh: bila backend mendukung HTTP-only cookie, gunakan cookie (preferred). Bila tidak, simpan refresh di memori dan rotate via `POST /api/v1/auth/refresh` saat 401/expired.
- Interceptor di API client: setelah 401 + token expired, jalankan refresh sekali; bila refresh gagal, redirect ke `/login` dan invalidate query cache.
- Tidak menyimpan rahasia provider apa pun di frontend (Tuya, CCTV NVR, Brevo, dst.). Frontend hanya menerima hasil ringkas dari backend.
- Logout: `POST /api/v1/auth/logout`, clear query cache, redirect ke `/login`.
- Logout-all dari Profil Penghuni: `POST /api/v1/auth/logout-all`.
- Session list dan revoke: tersedia di Profil (Penghuni) dan Settings (Admin) melalui `GET /api/v1/auth/sessions` dan `DELETE /api/v1/auth/sessions/{id}`.

Planning:
- Admin perlu route baru: `/login`, dan `__root.tsx` di-wrap dengan `AuthGuard`.
- Penghuni perlu route baru: `/login`, dan grup `_app` di-wrap dengan `AuthGuard` (route saat ini `_app.tsx` adalah tempat tepat untuk guard).
- Reset password: route baru `/password/forgot` dan `/password/reset` di kedua app.

---

## 11. Error Handling dan Empty State

Konvensi yang akan diterapkan saat integrasi:

- Hook `useQuery` mengembalikan `error` typed. UI menampilkan komponen `<EmptyState />` atau `<ErrorState />` sesuai kasus.
- 401 ditangani interceptor (refresh → retry → redirect login). UI tidak perlu menampilkan banner 401 sendiri.
- 403 menampilkan halaman "Tidak berwenang" dengan tetap menjaga shell.
- 404 cross-property dianggap not found (sesuai security policy backend), UI menampilkan empty state aman tanpa membocorkan keberadaan resource.
- 409 / 422 menampilkan inline error pada form, memakai `error.details`.
- 429 menampilkan toast "Terlalu banyak permintaan" dan tombol retry dengan backoff.
- 5xx menampilkan halaman error global yang sudah tersedia di `__root.tsx` (sudah ada `ErrorComponent`).
- Setiap halaman list memiliki: skeleton (loading), empty state (zero data), filtered-empty state (filter aktif tidak match), error state (dengan tombol retry).
- Setiap mutation memunculkan toast sukses/gagal via `sonner` dan menginvalidate query terkait.

---

## 12. Loading State

- Memakai `Skeleton` dari shadcn (`components/ui/skeleton.tsx` sudah ada di kedua app).
- Skeleton dirancang per layout: card list, table row, stat card, chart.
- Halaman pertama setelah login memakai `prefetchQuery` untuk data kritis (me, room, billing current, notifications count).
- Mutation memakai `pending` state pada tombol; tombol mengunci untuk mencegah double submit.
- TanStack Query `staleTime` direkomendasikan: list operasional 30 detik, dashboard summary 60 detik, master data (room-types, complaint-categories) 5 menit.
- Optimistic update untuk: `notification mark as read`, `complaint status` (Admin), `payment proof verdict`.

---

## 13. RBAC dan Menu Visibility

Daftar `navItems` di `apps/admin/src/components/layout/nav.tsx` saat ini menampilkan semua menu untuk semua user. Setelah integrasi, perlu:

- `useAuth()` mengembalikan `roles[]` dan `permissions[]` dari `GET /api/v1/auth/me`.
- `navItems` di-filter:
  - Settings, Smart Lock, CCTV → `owner`, `manager`.
  - Booking dan Pembayaran management → `owner`, `manager`, `admin`.
  - Reports → `owner`, `manager`, `admin`.
  - Access History → `owner`, `manager`.
- Property Owner login Admin tidak boleh melihat menu Settings, Smart Lock, CCTV, Billing Management. Mereka diarahkan ke set route property-owner-only (dibuat di M11E atau aplikasi terpisah di Phase 2).
- Technician sebaiknya tidak login ke Admin web full; jika memang masuk Admin, hanya boleh melihat menu Komplain dan Maintenance dengan scope assignment.
- Frontend RBAC hanya untuk UX. Backend tetap final authority — setiap mutation tetap akan ditolak server bila tidak diizinkan.

---

## 14. Property Scope Handling

- Token dari backend membawa `property_ids` ringkas (lihat `API_PLANNING.md` Auth Strategy).
- State global frontend menyimpan `currentPropertyId` jika user multi-property. Default: properti pertama dari `property_ids`.
- Komponen `<PropertySwitcher />` ditempatkan di header Admin untuk user dengan lebih dari satu properti.
- Semua query Admin yang berbasis property mengirim `?property_id=...` sesuai `currentPropertyId`.
- Backend tetap memverifikasi scope; frontend tidak boleh menampilkan data lintas property meski user terlihat punya akses.
- Penghuni: tidak menampilkan property switcher. `property_id` diambil dari `me`/`room` aktif Penghuni.

---

## 15. Resident Self-Scope Handling

- Semua endpoint Penghuni (`/api/v1/penghuni/...`) memakai identitas dari token. Tidak ada parameter `residentId` di URL Penghuni.
- Frontend Penghuni tidak boleh menerima atau mengirim `resident_id` dari path/query.
- Komponen Penghuni mengasumsikan satu identitas penghuni per session. Bila user logout, semua cache dibersihkan.
- Untuk akses Smart Lock Penghuni nanti, perangkat akan didapat dari `GET /api/v1/penghuni/room` (lock device id) dan command via `POST /api/v1/penghuni/smart-locks/{deviceId}/unlock|lock`.

---

## 16. Komponen yang Dipertahankan dari Desain Lovable

Semua komponen di bawah dipertahankan apa adanya. Tidak ada redesign.

Admin:
- `components/layout/app-shell.tsx`, `nav.tsx` (sidebar + bottom nav).
- Semua komponen `components/ui/*` shadcn.
- `components/status-badge.tsx`.
- Pola card statistik `StatCard` di dashboard.
- Pola layout dashboard, halaman tabel kamar, tabel pembayaran, tabel komplain.
- Chart `AreaChart` recharts untuk monthly income.
- Toolbar pencarian + filter di tiap halaman list.
- Dialog konfirmasi `Dialog` shadcn (untuk Smart Lock command, dsb.).

Penghuni:
- `components/AppHeader.tsx`, `BottomNav.tsx`.
- Semua komponen `components/ui/*` shadcn.
- Hero section di Home dengan gradient.
- `QuickAction`, `StatCard`, `SectionTitle`, `PriorityBadge` (internal di route home).
- Card tagihan, list pembayaran, list komplain, list pengumuman.
- Bottom-sheet/drawer (vaul) untuk form di mobile.

---

## 17. Komponen yang Perlu Disesuaikan

Perubahan kecil, bukan redesign:

- `navItems` di `nav.tsx` Admin: tambahkan filter berdasarkan role/permission.
- `app-shell.tsx`: tambah slot header kanan untuk `<PropertySwitcher />` (kalau multi-property), `<UserMenu />` (logout, sessions), `<NotificationBell />` (badge unread).
- `__root.tsx` Admin & Penghuni: tambah `AuthGuard` wrapper dan provider auth/role.
- Form-form mutation: ganti state lokal `useState` menjadi mutation `useMutation` dengan optimistic update dan toast.
- Tabel list: tambah skeleton, empty state, error state, dan pagination state (sudah ada `pagination.tsx` di UI lib).
- `mock-data.ts` dan `dummy-data.ts`: dijaga sementara untuk fallback storybook/dev, tetapi route tidak mengimpor langsung lagi setelah migrasi per halaman selesai.
- Komponen Smart Lock di Admin: tetap simulated; tambahkan flag `import.meta.env.VITE_SMARTLOCK_MODE=simulated|live` agar transisi ke real Tuya tidak butuh redesign.
- Komponen CCTV: ganti placeholder ke alur `preview-sessions`; sampai gateway tersedia, tampilkan banner "Belum tersedia di lokasi ini".

---

## 18. Risiko Integrasi Frontend

R-01 — Mismatch casing/enum antara backend dan frontend.
Mitigasi: paket `packages/domain` jadi single source of truth tipe; mapper di `api-client` jika kasus snake_case ↔ camelCase.

R-02 — Token storage tidak aman.
Mitigasi: in-memory access, HTTP-only cookie untuk refresh, atau strategi yang disepakati Security; pengujian XSS minimal di hardening.

R-03 — Refresh storm dan race condition saat 401.
Mitigasi: single-flight refresh queue di API client.

R-04 — Property scope bocor antar properti.
Mitigasi: backend tetap menegakkan scope; frontend tidak menampilkan data tanpa property aktif; query key memuat `property_id`.

R-05 — Penghuni mengirim `resident_id` arbitrer.
Mitigasi: aturan kode + lint review; backend tetap mengabaikan dan memakai token sebagai sumber identitas.

R-06 — Smart Lock command tertahan saat provider Tuya belum aktif.
Mitigasi: tetap pakai simulated gateway; flag UI menampilkan badge "simulasi".

R-07 — CCTV preview gagal karena gateway tidak tersedia.
Mitigasi: empty state khusus, tidak menampilkan RTSP/IP, sesuai security policy.

R-08 — File upload (KTP, payment proof, foto komplain) menumpuk besar.
Mitigasi: validasi MIME + size di client, multipart langsung ke File API backend; backend tetap re-validate.

R-09 — Real-time update notifikasi belum ada.
Mitigasi: polling `staleTime` 30 detik untuk notifikasi; real-time (SSE/WebSocket/push) di Phase 2.

R-10 — Routing ganda Admin/Penghuni di domain berbeda.
Mitigasi: konfirmasi `admin.kostsaya.com` vs `penghuni.kostsaya.com`; CORS allowlist sudah disebut di security policy.

R-11 — Booking page tidak punya backend Phase 1.
Mitigasi: feature flag `VITE_BOOKING_ENABLED=false`, tampilkan banner "Phase 2". Mengindari ekspektasi keliru.

R-12 — Cloudflare wrangler deploy mengubah SSR/edge runtime.
Mitigasi: pastikan fetch dilakukan dari komponen klien; API client tidak memakai Node-only API.

R-13 — Schema audit/masking untuk PII di UI (KTP, nomor telepon).
Mitigasi: tampilkan masked, full hanya saat user dengan permission membuka detail; backend audit setiap akses.

---

## 19. Definition of Done untuk Frontend Integration

Untuk setiap halaman yang diintegrasikan:
- Tidak ada import dari `mock-data` / `dummy-data` (hapus secara bertahap per milestone).
- Memakai `useQuery` / `useMutation` dengan `queryKey` terdokumentasi.
- Loading state via `Skeleton` ada.
- Empty state, filtered-empty state, dan error state ada.
- 401/403/404/409/422/429/5xx tertangani sesuai bagian 11.
- Form memvalidasi dengan `zod` + `react-hook-form` (sudah tersedia).
- Mutation memakai `Idempotency-Key` untuk operasi yang membutuhkan (lihat API_PLANNING.md bagian Idempotency Strategy).
- Toast sukses/gagal untuk mutation memakai `sonner`.
- Permission/role check ada untuk tombol aksi (UX), backend tetap final authority.
- Tidak ada PII bocor di console.log dan tidak ada secret di bundle (`grep` cek di CI).
- Lint, type-check, build berhasil.

Untuk milestone:
- README perubahan ditambahkan di `docs/00-project/CHANGELOG.md`.
- Daftar halaman yang sudah migrasi diperbarui di dokumen ini (bagian 4 berubah jadi "halaman yang masih dummy" menyempit).

---

## 20. Rekomendasi Milestone Lanjutan (M11B, M11C, M11D, dst.)

M11B — Frontend Foundation:
- `packages/api-client` (fetch wrapper, error normalization, correlation id, idempotency, refresh queue).
- `packages/domain` (tipe shared minimum: User, Property, Room, Resident, Invoice, Payment, Complaint, WorkOrder, Notification, Announcement, SmartLockDevice, AccessLog).
- Env validation (`zod`) untuk `VITE_API_BASE_URL`, feature flags.
- Halaman `/login` dan password reset di kedua app.
- `AuthGuard`, `useAuth`, `RoleGate`, `PermissionGate`.
- TanStack Query config + devtools dev-only.
- Logout, sessions list, dan profile fetch.
- Wiring `__root.tsx` Admin dan `_app.tsx` Penghuni dengan provider auth dan property context.

M11C — Admin Core Data:
- Rooms (list, create, edit, status transition, room-types, facilities).
- Residents (list, detail, create, edit, status, files via File API).
- Occupancy ringkas di detail Resident.
- Check-in dan Check-out workflow dialog.
- Dashboard summary tersambung backend.

M11D — Admin Operational:
- Billing (invoices, payments, payment proofs queue, late fee, aging).
- Complaint + Maintenance (assign teknisi, status transition).
- Vehicle + Parking baru sebagai halaman Admin (saat ini belum ada UI; backend sudah selesai M8).

M11E — Notifications, Communication, Settings:
- Notifications Admin + Announcements + Kost Rules + FAQ CRUD.
- Settings property + RBAC users management (owner only).
- Property switcher untuk multi-property user.

M11F — Penghuni Core:
- Penghuni Home/Billing/Complaint/Notifications/Info/Profile fully integrated.
- Payment proof upload (multipart) via File API.
- Lease extension request, check-out request.

M11G — Reports + Audit minimum: SELESAI.
- Reports occupancy, revenue (per tahun), billing aging, payments, complaints, maintenance, vehicles, parking, resident snapshot: live, agregasi client-side dari endpoint list yang sudah ada (tidak ada `/reports/*` di backend).
- Shared selectors `apps/admin/src/lib/reports-selectors.ts` dipakai bersama Dashboard untuk menjamin konsistensi angka.
- Hooks: `useReports`, `useAuditLogs` (placeholder), `useWorkOrders`. `useDashboardSummary` di-refactor di atasnya.
- Audit Viewer untuk owner/manager: render placeholder dengan pesan eksplisit; siap di-swap ke tabel saat `/audit/logs` rilis.
- Export jobs UI: tombol Export disabled dengan tooltip eksplisit; siap di-swap saat `/reports/exports` rilis.
- Tidak ada endpoint baru di backend. Tidak ada perubahan ADR. Tidak ada laporan dummy. Tidak ada export client-side.
- Status: M11G selesai.
- Validation: M11GV PASS.
- Verdict: Frontend Admin/Penghuni Phase 1 demoable.
- Endpoint backend yang masih ditunggu untuk fitur M11G penuh: `/api/v1/audit/logs`, `/audit/auth-events`, `/audit/smart-lock-events`, `/audit/cctv-events`, `/audit/exports`, `/reports/exports`, dan opsional `/reports/*` dedicated, `/billing/aging-summary`, `/admin/dashboard/*`.

M11H — Smart Lock UI Integration (setelah M10G real Tuya):
- Admin Smart Lock dashboard switch ke data live (tetap UI Lovable, hanya ganti sumber).
- Access history live.
- Penghuni Smart Lock unlock/lock UI baru (mengikuti desain card pada Home Penghuni; kebutuhan UX detail dibuat di milestone-nya).
- Restriction approval workflow.

M11I — CCTV preview:
- Camera list, preview session token, snapshot.
- Aktif hanya pada properti yang sudah punya gateway lokal.

M11J — Phase 2 surfaces (deferred):
- Booking publik UI.
- Chat real Penghuni ↔ admin.
- Payment gateway flow.
- Push/WhatsApp delivery monitoring.

---

## 21. Hal yang Sengaja Ditunda

- Real Tuya integration (menunggu akses fisik smart lock di lokasi → M10G).
- CCTV real stream (menunggu gateway lokal siap).
- Payment gateway (di-defer ke Phase 2 sesuai roadmap).
- WhatsApp / Fonnte (di-defer ke Phase 2).
- Push notification PWA (di-defer ke Phase 2).
- Public booking publik (di-defer ke Phase 2; halaman Lovable tetap ada tapi dimatikan via feature flag).
- Chat real Penghuni ↔ admin (Phase 2).
- Property Owner portal lengkap (Phase 1 cukup read-only minimum; portal penuh boleh menyusul setelah Penghuni dan Admin core selesai).

Smart Lock UI di kedua app boleh tetap simulated/skeleton sampai M10G selesai. Tidak ada perubahan visual berarti saat transisi ke live; hanya sumber data dan badge mode yang berubah.

---

## 22. Verdict

Verdict: A. Siap lanjut M11B.

Update 2026-07-01:
- M11G selesai.
- M11GV PASS.
- Frontend Admin/Penghuni Phase 1 demoable.

Alasan:
- Backend Phase 1 untuk Property, Room, Resident, Occupancy, Billing, Complaint/Maintenance, Vehicle/Parking, Notification, dan Smart Lock foundation sudah selesai dan terdokumentasi rapi.
- Frontend Admin dan Penghuni hasil Lovable sudah memiliki struktur route, layout, dan komponen UI yang baik dan tidak perlu redesign.
- Tidak ada blocker arsitektural untuk memulai fondasi integrasi (auth, API client, query layer).
- Risiko utama yang tersisa (R-02 token, R-04 property scope, R-08 file upload) sudah punya mitigasi yang jelas pada bagian 18 dan tetap konsisten dengan `BACKEND_ARCHITECTURE.md` dan `API_PLANNING.md`.

Audit frontend tambahan tidak diperlukan sebelum M11B. Audit tambahan baru perlu dilakukan setelah M11E (sebelum Reports) untuk memastikan PII masking dan permission gating sudah konsisten lintas halaman.

---

## 23. M11AF — Architecture Freeze Review (Addendum)

> Status: Reviewed dan dibekukan pada 2026-06-30.
> Peran reviewer: Principal Software Architect.
> Hasil: Frontend Architecture Frozen. ADR final ada di `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md`.

### 23.1 Hasil Review per Pertanyaan

1. **Urutan milestone frontend** — Tepat. M11B (foundation) → M11C (Admin core) → M11D (Admin operational + Vehicle/Parking) → M11E (Notifications/Settings/RBAC) → M11F (Penghuni core) → M11G (Reports) → M11H (Smart Lock live) → M11I (CCTV) → M11J (Phase 2 surfaces). Penomoran di bagian 20 disinkronkan: M11D kini juga memuat Vehicle/Parking, dan M11F adalah Penghuni Core.

2. **Dependency yang terlupakan** — Tiga yang sebelumnya implisit dijadikan eksplisit di addendum ini: (a) File API harus diintegrasikan sebelum payment proof, complaint photo, dan resident KTP; (b) `packages/domain` harus rilis di M11B bersamaan dengan `packages/api-client`; (c) generator OpenAPI/Swagger dari backend belum disepakati — diputuskan tetap hand-written types untuk Phase 1 (lihat ADR-FE-001).

3. **Risiko yang belum terdokumentasi** — Ditambah di bagian 18 melalui addendum 23.4: R-14 (file upload patterns), R-15 (correlation-id propagation), R-16 (PropertyProvider cache bleed saat property switch).

4. **Mapping backend ↔ frontend** — Seluruh modul backend yang sudah selesai sudah punya mapping kecuali Vehicle/Parking yang baru ditambahkan di addendum 23.2.

5. **Endpoint tanpa rencana UI** — `/api/v1/audit/*`, `/api/v1/files/{id}/access-logs`, dan `/api/v1/property-owner/*` belum punya UI Phase 1. Diputuskan: audit viewer minimum masuk M11G; Property Owner portal minimum read-only di M11E (atau dipisah ke aplikasi sendiri di Phase 2 jika scope membesar).

6. **Halaman yang sebaiknya ditunda** — Booking (`/booking`, `/bookings`) dan Chat Penghuni tetap ditunda Phase 2 di balik feature flag (ADR-FE-006). CCTV tetap placeholder sampai gateway lokal tersedia.

7. **Halaman yang justru sebaiknya diprioritaskan** — Vehicle + Parking dinaikkan ke M11D karena backend M8 sudah selesai, datanya operasional harian, dan tidak ada blocker provider.

8. **Dashboard Admin sebagai halaman pertama** — Tidak. Dashboard memanggil agregat lintas modul (`/api/v1/admin/dashboard/summary`, `/queues/operational`) sehingga bergantung pada Rooms/Residents/Billing/Complaint terintegrasi lebih dulu. Urutan benar: M11B foundation → Rooms → Residents → Billing → Complaint → Dashboard (akhir M11C). Penjelasan ditambahkan di bagian 7.

9. **Vehicle & Parking lebih awal** — Ya. Dimasukkan ke M11D dengan endpoint `GET /api/v1/vehicles`, `POST /api/v1/vehicles`, `GET /api/v1/parking/zones`, `GET /api/v1/parking/slots`, `POST /api/v1/parking/assignments` (mengacu pada `docs/02-domains/VEHICLE_DOMAIN.md`). UI baru di Admin tanpa redesign tema.

10. **Smart Lock simulated strategy** — Tepat. Disahkan sebagai ADR-FE-010. Frontend memanggil endpoint nyata, backend mengembalikan hasil simulated sampai M10G. Toggle melalui `VITE_FEATURE_SMARTLOCK_MODE`.

11. **Konsistensi terhadap backend architecture** — Konsisten. Cocok dengan `BACKEND_ARCHITECTURE.md` pada: backend sebagai policy enforcement point, secret backend-only, property scoping, resident self-scope, correlation id, error taxonomy, idempotency, dan File API sebagai jalur akses sensitif.

12. **Keputusan baru yang dibekukan** — Sebelas ADR (ADR-FE-001..ADR-FE-011) di `FRONTEND_ARCHITECTURE_DECISIONS.md`. Tiga ADR baru ditambahkan di freeze ini: ADR-FE-009 (File Upload Pattern), ADR-FE-010 (Smart Lock Simulated Strategy), ADR-FE-011 (Observability on Frontend).

### 23.2 Penyesuaian Mapping — Vehicle & Parking (Admin)

UI baru di M11D, mengikuti pola tabel + dialog yang sudah ada di Admin:

| Halaman baru | Endpoint utama | Catatan |
|---|---|---|
| `/vehicles` | `GET /api/v1/vehicles`, `POST /api/v1/vehicles`, `PATCH /api/v1/vehicles/{id}`, `DELETE /api/v1/vehicles/{id}` | Filter property/resident/type |
| `/parking` | `GET /api/v1/parking/zones`, `GET /api/v1/parking/slots`, `GET /api/v1/parking/assignments` | Visualisasi zona + slot |
| `/parking/assignments` | `POST /api/v1/parking/assignments`, `PATCH /api/v1/parking/assignments/{id}`, `DELETE /api/v1/parking/assignments/{id}` | Pairing kendaraan ↔ slot |

Penghuni: tampilkan kendaraan miliknya di Profil (read-only) memakai `GET /api/v1/penghuni/me/vehicles` (jika tersedia) atau turunkan dari payload `me` saat dibutuhkan. Konfirmasi route tepat dilakukan saat M11F.

### 23.3 Penyesuaian Urutan Prioritas (bagian 7)

Klarifikasi yang dibekukan:
- Dashboard Admin BUKAN halaman pertama. Dashboard diintegrasikan di akhir M11C setelah Rooms/Residents/Billing/Complaint live.
- Vehicle/Parking dinaikkan ke M11D, sebelum Notifications/Settings.
- Reports digeser ke M11G (sebelumnya disebut M11F di draft awal); penomoran final mengikuti bagian 20 yang sudah diperbarui di addendum ini.

### 23.4 Tambahan Risiko

- **R-14 — File upload tanpa standar.** Mitigasi: ADR-FE-009 menetapkan jalur File API, MIME allowlist, dan ukuran maksimum.
- **R-15 — Correlation-id hilang antar retry/refresh.** Mitigasi: ADR-FE-011 memastikan id dipertahankan per operasi logis; refresh queue tidak meng-overwrite.
- **R-16 — Cache bleed saat ganti property.** Mitigasi: ADR-FE-005 menetapkan `removeQueries` ber-predicate berdasarkan `propertyId` yang lama.

### 23.5 Endpoint Backend Tanpa UI Phase 1 — Diputuskan

| Endpoint | Keputusan |
|---|---|
| `/api/v1/audit/*` | Viewer read-only minimum (owner/manager) di M11G. Export job tetap. |
| `/api/v1/files/{id}/access-logs` | Tidak ada halaman dedicated Phase 1. Diakses melalui audit viewer M11G bila perlu. |
| `/api/v1/property-owner/*` | Read-only portal minimum di M11E sebagai route group `/property-owner` di Admin. Aplikasi terpisah dipertimbangkan untuk Phase 2. |
| `/api/v1/penghuni/lease-extension-requests`, `/api/v1/penghuni/check-out-requests` | UI di Profil Penghuni di M11F. |

### 23.6 Verdict Akhir M11AF

**A. Frontend Architecture Frozen.**

Implementasi M11B boleh dimulai. Tidak ada perubahan arsitektur yang diperbolehkan di tengah jalan kecuali melalui ADR baru di `FRONTEND_ARCHITECTURE_DECISIONS.md`.
