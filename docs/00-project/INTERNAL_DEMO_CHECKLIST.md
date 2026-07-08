# Internal Demo Checklist

Tanggal QA: 2026-07-02
Role: QA Engineer
Scope: QA-01 Final Regression

## 1. Test Environment

| Item | Value |
| --- | --- |
| Project | Granada Kost Platform / Kostation |
| Admin app | `http://localhost:8080` |
| Penghuni app | `http://localhost:8081` |
| Backend API | `http://localhost:3000/api/v1` |
| Backend health | PASS: database up, Redis up |
| Browser automation | Local Google Chrome via Chrome DevTools Protocol |
| Artifact directory | `artifacts/internal-demo/` |
| Smoke result JSON | `artifacts/internal-demo/smoke-result.json` |
| Automation driver | `artifacts/internal-demo/smoke-test.cjs` |
| Final smoke finished at | `2026-07-02T01:21:10.510Z` |

Notes:
- Dev servers were already reachable on `3000`, `8080`, and `8081`.
- Final regression used a fresh Chrome profile and cleared cookies between Admin and Penghuni sessions.

## 2. Test Accounts Used

| App | Login | Password |
| --- | --- | --- |
| Admin | `dev.admin@kostation.test` | `********` |
| Penghuni | `dev.resident.alpha@kostation.test` | `********` |

## 3. Admin Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Open Admin `/login` | PASS | `artifacts/internal-demo/admin-login.png` |
| Login as Admin | PASS | Dashboard reached after login |
| Dashboard renders | PASS | `artifacts/internal-demo/admin-dashboard.png` |
| Rooms renders | PASS | `artifacts/internal-demo/admin-rooms.png` |
| Residents renders | PASS | `artifacts/internal-demo/admin-tenants.png` |
| Payments renders | PASS | `artifacts/internal-demo/admin-payments.png` |
| Complaints renders | PASS | `artifacts/internal-demo/admin-complaints.png` |
| Vehicles renders | PASS | `artifacts/internal-demo/admin-vehicles.png` |
| Parking renders | PASS | `artifacts/internal-demo/admin-parking.png` |
| Reports renders | PASS | `artifacts/internal-demo/admin-reports.png` |
| No React warning | PASS | No `Cannot update a component` warning in final smoke result |
| No validation error | PASS | No `VALIDATION_ERROR` / status `400` in final smoke result |
| No fatal console error | PASS | Only expected unauthenticated bootstrap/favicon observations remained |
| No infinite loading | PASS | No persistent loading state in final smoke result |
| No broken navigation | PASS | All scoped routes reached expected content |
| Logout works | PASS | Returned to `http://localhost:8080/login` |

## 4. Penghuni Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Open Penghuni `/login` | PASS | `artifacts/internal-demo/penghuni-login.png` |
| Login as Penghuni | PASS | Home reached as `Dev Resident Alpha` |
| Home renders | PASS | `artifacts/internal-demo/penghuni-home.png` |
| Billing renders | PASS | `artifacts/internal-demo/penghuni-billing.png` |
| Complaints renders | PASS | `artifacts/internal-demo/penghuni-complaints.png` |
| Notifications renders | PASS | `artifacts/internal-demo/penghuni-notifications.png` |
| Profile renders | PASS | `artifacts/internal-demo/penghuni-profile.png` |
| No React warning | PASS | No `Cannot update a component` warning in final smoke result |
| No validation error | PASS | No `VALIDATION_ERROR` / status `400` in final smoke result |
| No fatal console error | PASS | Only expected unauthenticated bootstrap/logout observations remained |
| No infinite loading | PASS | No persistent loading state in final smoke result |
| No broken navigation | PASS | All scoped routes reached expected content |
| Logout works | PASS | Returned to `http://localhost:8081/login` |

## 5. Console/Network Observations

Final regression did not reproduce the previously blocking findings:
- `QA-01-BUG-001`: no React `Cannot update a component ... LoginPage` warning.
- `QA-01-BUG-002`: no `400 VALIDATION_ERROR` from vehicle/parking/report flows.

Expected low-risk observations:
- Initial unauthenticated silent refresh can produce `401 INVALID_REFRESH_TOKEN` after browser cookies are cleared.
- After Penghuni logout, in-flight profile/session requests can produce `401 UNAUTHENTICATED` / `401 INVALID_REFRESH_TOKEN`; logout still returns to `/login`.
- `favicon.ico` can return `404` in local dev. This is not a functional smoke failure.

## 6. Known Placeholders

Accepted placeholders, not counted as failures:
- Smart Lock live not tested.
- CCTV not tested.
- Booking not tested.
- Chat real not tested.
- Audit Viewer placeholder.
- Export disabled.
- Payment proof upload disabled. (Update 2026-07-03: RESOLVED oleh M12C3 - lihat Section 12; visual E2E PASS via QA-M12H.)
- Complaint create resident disabled. (Update 2026-07-03: RESOLVED oleh M12D - lihat Section 12; visual E2E PASS via QA-M12H.)
- Admin Notifications page may still be placeholder if not in current scope.
- Admin Settings may still be placeholder if not in current scope.
- Penghuni Info announcement endpoint placeholder is visible and accepted for current scope.

## 7. Bug Status

| ID | Status | Verification |
| --- | --- | --- |
| QA-01-BUG-001 | CLOSED | Final regression confirmed login works and React warning no longer appears |
| QA-01-BUG-002 | CLOSED | Final regression confirmed Vehicles, Parking, and Reports do not emit `400 VALIDATION_ERROR` |

See also: `docs/11-qa/BUG_TRIAGE_001.md`.

## 8. Screenshots Path List

- `artifacts/internal-demo/admin-login.png`
- `artifacts/internal-demo/admin-dashboard.png`
- `artifacts/internal-demo/admin-rooms.png`
- `artifacts/internal-demo/admin-tenants.png`
- `artifacts/internal-demo/admin-payments.png`
- `artifacts/internal-demo/admin-complaints.png`
- `artifacts/internal-demo/admin-vehicles.png`
- `artifacts/internal-demo/admin-parking.png`
- `artifacts/internal-demo/admin-reports.png`
- `artifacts/internal-demo/penghuni-login.png`
- `artifacts/internal-demo/penghuni-home.png`
- `artifacts/internal-demo/penghuni-billing.png`
- `artifacts/internal-demo/penghuni-complaints.png`
- `artifacts/internal-demo/penghuni-notifications.png`
- `artifacts/internal-demo/penghuni-info.png`
- `artifacts/internal-demo/penghuni-profile.png`

## 9. Human UX Review

Manual notes:


## 10. Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint:admin` | PASS | 0 errors, 15 existing warnings |
| `npm run lint:penghuni` | PASS | 0 errors, 9 existing warnings |
| `npm --workspace @granada-kost/admin run typecheck` | PASS | `tsc --noEmit` completed |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS | `tsc --noEmit` completed |
| `npm run build:admin` | PASS | Vite client and SSR build completed |
| `npm run build:penghuni` | PASS | Vite client and SSR build completed |

## 11. Final Verdict

Internal Demo Ready

Reason:
- Full Admin and Penghuni Internal Demo smoke test passed.
- `QA-01-BUG-001` and `QA-01-BUG-002` are closed.
- Lint, typecheck, and build passed for Admin and Penghuni.

## 12. M12 File Upload Demo Additions (Updated 2026-07-03 via M12F, M12G)

Cakupan demo bertambah setelah M12C1-M12C5 (File Upload Foundation) dan M12D (Penghuni Complaint Create).

Catatan status: hasil PASS pada Positive/Negative checks dicatat pada M12F berdasarkan evidensi QA milestone M12C/M12D. Hasil pada subseksi Security Boundary dicatat pada M12G berdasarkan **QA-M12G Cross-Scope File Security Boundary Verification** yang dijalankan **eksternal di Codex GPT-5.5 High** dengan verdict **PASS**. Tidak ada QA yang dijalankan oleh agen dokumentasi (M12F/M12G tanpa akses shell/browser).

Placeholder lama pada Section 6 ("Payment proof upload disabled" dan "Complaint create resident disabled") tidak lagi berlaku - lihat catatan pembaruan pada Section 6.

### Positive checks

| Check | Result |
| --- | --- |
| Penghuni Billing: upload bukti pembayaran manual (JPEG/PNG/PDF) lalu submit proof dengan `file_ids` | PASS |
| Penghuni Billing: proof tersubmit berstatus menunggu review admin; tagihan TIDAK otomatis lunas | PASS |
| Admin Payments: buka detail proof ("Lihat Bukti"), thumbnail lampiran tampil, `FilePreviewModal` menampilkan gambar penuh | PASS |
| Admin Payments: verifikasi / tolak proof dari dialog review | PASS |
| Penghuni Complaints: buat tiket TANPA lampiran (kategori, judul, deskripsi, lokasi) - sukses dan muncul di Riwayat Tiket | PASS |
| Penghuni Complaints: buat tiket DENGAN 1-5 lampiran foto; preview tampil; hapus lampiran sebelum submit berfungsi | PASS |
| Penghuni Complaints: bila submit gagal setelah upload sukses, preview lampiran tetap tampil dan retry tidak perlu upload ulang | PASS |
| Admin Complaints: detail komplain menampilkan thumbnail lampiran + preview penuh terotorisasi | PASS |

### Negative checks

| Check | Result |
| --- | --- |
| File melebihi batas ukuran (mis. gambar > 2 MB) ditolak dengan pesan Indonesia yang jelas + WhatsApp fallback tampil | PASS |
| Tipe file tidak didukung (mis. `.exe`, `.svg`, `.html`, video) ditolak di client dan backend | PASS |
| Network tab: tidak ada URL storage publik; seluruh byte file mengalir lewat `GET /api/v1/files/:id/content` terotorisasi | PASS |
| Response API file/proof/complaint tidak memuat `storage_path` atau path internal lainnya | PASS |
| Resident tidak dapat mengakses file resident lain / properti lain (403/404 tanpa membocorkan keberadaan resource) | PASS (QA-M12G) |

### Security boundary checks (QA-M12G - Codex GPT-5.5 High, 2026-07-03, verdict PASS)

Eksekusi eksternal via Codex: `npm.cmd run db:migrate:api`, health check `GET /api/v1/health` (200), skrip boundary API via node terhadap `http://127.0.0.1:3000/api/v1`, pemeriksaan DB via `pg`. Akun uji: `dev.admin@kostation.test`, `dev.resident.alpha@kostation.test`, `dev.resident.bravo@kostation.test`, `dev.property.owner@kostation.test`, `owner@kostation.test`.

| Check | Result |
| --- | --- |
| Auth login (201) dan health (200) | PASS |
| Upload file valid (201) | PASS |
| Metadata/content file tanpa autentikasi ditolak (401) | PASS |
| Resident (Alpha) mengakses metadata/content file miliknya sendiri (200) | PASS |
| Resident (Alpha) mengakses content file resident lain (Bravo) ditolak (403) | PASS |
| Endpoint metadata file Admin tanpa autentikasi ditolak (401) | PASS |
| Resident mengakses endpoint file Admin ditolak (403) | PASS |
| Admin mengakses file complaint/payment yang terotorisasi (200) | PASS |
| Admin/property owner ter-scope mengakses file lintas properti ditolak (403) | PASS |
| Attach file milik resident lain ditolak (400) | PASS |
| Attach file dengan purpose salah ditolak (400) | PASS |
| Content file yang sudah dihapus ditolak (404) | PASS |
| Attach file yang sudah dihapus ditolak (400) | PASS |
| Tidak ada 500 tak terduga pada seluruh skenario boundary | PASS |
| DB: 0 baris invalid pada `complaints`, `complaint_files`, payment proofs, `payment_proof_files` (tidak ada orphan setelah attach gagal) | PASS |
| Tidak ada `storage_path`/`storagePath` pada respons apa pun | PASS |
| Tidak ada URL file publik; akses konten hanya via `GET /api/v1/files/:fileId/content` | PASS |
| Source/docs tidak berubah selama QA (`git status --short` dan `git diff --stat` bersih) | PASS |

Keterbatasan QA-M12G yang tercatat: uji cross-resident memakai akun seed pada properti yang sama; boundary lintas-properti diverifikasi memakai file yang dibuat global owner pada properti "Validation Cross Property" - admin/property owner ter-scope ditolak (403). Issues found: none.

### Visual E2E demo pass (QA-M12H - Codex GPT-5.5 High, 2026-07-03, verdict PASS)

Final visual E2E demo pass untuk seluruh permukaan M12 dijalankan **eksternal di Codex GPT-5.5 High** dengan verdict **PASS**. Evidensi: file hasil akhir `artifacts/m12h-final-demo-pass/m12h-final-result.json` dan 15 screenshot di `artifacts/m12h-final-demo-pass/`. Hasil dicatat pada M12H (dokumentasi saja; tidak ada QA yang dijalankan oleh agen dokumentasi).

| Scope | Cakupan | Result |
| --- | --- | --- |
| A | Penghuni Manual Payment Proof: UI bukti pembayaran manual tampil, upload PNG/JPG valid, preview tampil, submit proof sukses, status `pending_review` tampil, tagihan TIDAK otomatis lunas | PASS |
| B | Admin Payment Proof Preview: tab Verifikasi di Payments tampil, "Lihat Bukti" membuka dialog review, thumbnail tampil, preview penuh terbuka, kontrol verify/reject tetap tampil | PASS |
| C | Penghuni Complaint Create tanpa lampiran: form/sheet tampil, submit tanpa lampiran sukses, UI sukses tampil, list refresh, request tanpa `file_ids` atau payload kosong yang kompatibel | PASS |
| D | Penghuni Complaint Create dengan lampiran: upload PNG/JPG valid sukses, preview tampil, `POST /files` memakai `file_purpose = complaint_attachment`, `POST /my/complaints` menyertakan `file_ids`, UI sukses tampil, list refresh | PASS |
| E | Admin Complaint Attachment Preview: detail komplain menampilkan "Lampiran Komplain", thumbnail tampil, preview penuh terbuka via `/api/v1/files/:fileId/content` | PASS |
| F | Negative File UX: tipe file tidak didukung ditolak dengan error UI jelas, gambar oversize ditolak dengan error UI jelas, WhatsApp fallback tampil di tempat yang diimplementasikan | PASS |

Security checks (QA-M12H): tanpa `storage_path`/`storagePath` pada respons; tanpa URL file publik; preview/content hanya via `/api/v1/files/:fileId/content`. Tanpa fatal console error; tanpa 400/500 tak terduga pada happy path. Git status aman untuk source/docs: hanya `artifacts/m12h-final-demo-pass/` yang untracked.

Catatan: item Smart Lock live, CCTV live, payment gateway, receipt/nota, reports export, dan audit viewer TIDAK termasuk cakupan ini dan tetap deferred.

## 13. M14 Demo Script Refresh Pointer (Updated 2026-07-04 via M14E)

Skrip demo internal terbaru dan yang wajib dipakai untuk demo berikutnya: **`docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md`** (M14D), berbasis evidensi M14B (API regression & security smoke PASS) dan M14C (browser regression PASS). Pendekatan login yang divalidasi M14C adalah **Hybrid Interactive Login**: login manual pada profil browser terisolasi (Admin dan Penghuni terpisah) + regression otomatis pasca-login. Evidensi browser terbaru: `artifacts/m14c-browser-regression/` (qa-summary.json + 20 screenshot).

**Cakupan demo aman (per M14C/M14D):**

- Auth (Admin + Penghuni), logout, session handling.
- Dashboard Admin.
- Dashboard/Home Penghuni.
- Upload bukti pembayaran manual (Penghuni) + preview/review Admin (verify/reject; `pending_review`, tagihan tidak otomatis lunas).
- Complaint create dengan/tanpa lampiran (Penghuni) + preview lampiran Admin.
- Smart Lock HANYA dalam kondisi simulated / read-only / guarded disabled (perintah berakhir `LIVE_COMMAND_DISABLED` - itu perilaku fail-closed yang benar).

**JANGAN didemokan sebagai production-ready:**

- Physical live unlock (belum pernah dieksekusi; NO-GO).
- Remote lock (`UNSUPPORTED_CAPABILITY`).
- Temporary PIN (M13G, belum dibangun).
- Resident unlock (ditolak `403` oleh kebijakan yang dibekukan).
- Fleet rollout (constraint satu perangkat uji).

Eksekusi live Smart Lock tetap **NO-GO** per M13F-C4/M13F-D; `SMART_LOCK_LIVE_ENABLED` tetap `false`.

## 14. Payment Gateway Sandbox Demo Note (Added 2026-07-05 via M15C-G)

Payment Gateway kini dapat didemokan **hanya dalam mode staging/sandbox** (VPS staging + Midtrans Sandbox). Evidensi QA: `docs/15c-payment-gateway/PAYMENT_GATEWAY_SANDBOX_E2E_QA.md` (M15C-F/F2, verdict PASS).

**Cakupan demo aman:**

- Penghuni "Bayar Online" dari halaman Billing.
- Halaman pembayaran Midtrans **Sandbox** (Snap TEST) terbuka.
- Status lunas dikonfirmasi backend via **webhook** bertanda tangan (webhook is the source of truth; redirect is UX only - jangan klaim lunas dari redirect/return).
- Admin tab "Online": tabel/detail transaksi gateway (badge Gateway / "Terkonfirmasi Otomatis" / "Perlu Tinjauan"; tanpa verify/reject untuk baris gateway).
- Manual payment proof remains fallback - alur bukti manual Section 12/13 tetap boleh didemokan berdampingan.

**JANGAN:**

- Mempresentasikan sebagai aktivasi payment production - **production payment activation pending; Payment Gateway is not production-ready**.
- Menggunakan Midtrans **production keys** dalam bentuk apa pun (sandbox only; secrets backend-only dan tidak pernah ditampilkan).
- Mengubah postur Smart Lock untuk demo (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`).

## 15. Public Room Listing Demo Note (Added 2026-07-07 via M16F)

Public room listing (M16) dapat didemokan sebagai **MVP staging/demo**. Evidensi/dokumen: `docs/16-room-inventory-booking/M16_FINAL_RELEASE_HANDOFF.md`, `PUBLIC_ROOM_LISTING_API.md`, `PUBLIC_ROOM_LISTING_UI_WHATSAPP_CTA.md`.

**Cakupan demo aman:**

- Halaman publik `/kamar` pada app Penghuni **tanpa login**; filter gender Putra/Putri + kategori (Semua/Rumah Kost/Apart Kost).
- Kartu ketersediaan agregat: judul grup, label kategori/gender, label lantai, jumlah kamar tersedia, harga mulai per bulan/tahun.
- CTA "Tanya Ketersediaan via WhatsApp" dengan template terisi - membutuhkan `VITE_PUBLIC_WHATSAPP_NUMBER`; jika kosong CTA tampil disabled dengan "Nomor WhatsApp admin belum dikonfigurasi." (itu perilaku aman yang benar, bukan bug).
- Admin Kamar bertab (Ringkasan, Rumah Kost, Apart Kost, Ketersediaan) dengan field inventory.

**JANGAN:**

- Menampilkan atau menjanjikan **nomor kamar eksak / `room_code`** di permukaan publik - konfirmasi nomor kamar tetap oleh admin via WhatsApp.
- Mempresentasikan public booking sebagai **production-ready** atau sebagai online booking/payment - **payment booking DEFERRED; konfirmasi manual/WhatsApp adalah jalur MVP**.
- Menghubungkan booking dengan Payment Gateway dalam bentuk apa pun.
- Mengubah postur Smart Lock untuk demo dari `SMART_LOCK_PROVIDER=simulated` dan `SMART_LOCK_LIVE_ENABLED=false`.

Catatan: browser visual QA M16C/M16E belum dieksekusi (browser tooling tidak tersedia di VPS); demo visual pertama sekaligus berfungsi sebagai sanity check visual.

## 16. Booking Lead Demo Note (Added 2026-07-08 via M17E)

Booking Lead MVP (M17) dapat didemokan sebagai **MVP staging/demo dengan konfirmasi admin/manual**. Evidensi/dokumen: `docs/17-booking-leads/M17_BOOKING_LEAD_FINAL_RELEASE_HANDOFF.md`, `BOOKING_LEAD_BACKEND_API.md`, `BOOKING_LEAD_ADMIN_UI.md` + `BOOKING_LEAD_ADMIN_UI_QA.md`, `BOOKING_LEAD_PUBLIC_FORM_UI.md` + `BOOKING_LEAD_PUBLIC_FORM_UI_QA.md`.

**Cakupan demo aman:**

- Publik `/kamar` tanpa login: CTA "Ajukan Minat Booking" membuka dialog form (Nama Lengkap + Nomor WhatsApp wajib; Tanggal Rencana Masuk + Catatan opsional); submit anonim; success state "Minat booking berhasil dikirim." yang menegaskan **bukan booking resmi**.
- WhatsApp follow-up pasca submit ("Hubungi Admin via WhatsApp", membutuhkan `VITE_PUBLIC_WHATSAPP_NUMBER`) + CTA "Tanya Ketersediaan via WhatsApp" tetap tersedia.
- Admin `/booking-leads` ("Minat Booking", role manager/admin): list/filter lead, update status (Baru -> Sudah Dihubungi -> Jadwal Survey -> Dikonversi; Ditolak/Kedaluwarsa; "Dikonversi" hanya penanda manual), "Hubungi via WhatsApp".
- Duplicate submission dalam window duplicate-protection menghasilkan respons sukses yang sama tanpa baris ganda (perilaku benar, bukan bug). Rate limit publik aktif (Redis).

**JANGAN:**

- Mempresentasikan lead sebagai booking terkonfirmasi / reservasi kamar - **admin confirmation remains source of truth**; lead tidak pernah memutasi status kamar.
- Menampilkan atau menjanjikan nomor kamar eksak, room ID, atau `room_code` di permukaan publik.
- Menghubungkan lead dengan pembayaran/invoice/occupancy/resident otomatis atau Payment Gateway - **payment booking DEFERRED; production payment activation pending**.
- Mempresentasikan public booking sebagai production-ready - **public booking NOT production-ready**.
- Mengubah postur Smart Lock (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`) - live command **NO-GO until site trial/evidence/signoff**.

Catatan: browser visual QA M17C/M17D belum dieksekusi (limitasi tooling); demo visual pertama sekaligus berfungsi sebagai sanity check visual.

## 17. Hunian Gallery Demo Note (Added 2026-07-08 via M19E)

Hunian Gallery (M19) dapat didemokan sebagai **MVP staging/demo dengan limitasi tercatat**. Evidensi/dokumen: `docs/19-hunian-gallery/M19_HUNIAN_GALLERY_FINAL_RELEASE_HANDOFF.md`, `HUNIAN_GALLERY_BACKEND_API.md`, `HUNIAN_GALLERY_ADMIN_UI.md` + `HUNIAN_GALLERY_ADMIN_UI_QA.md`, `HUNIAN_GALLERY_PUBLIC_UI.md` + `HUNIAN_GALLERY_PUBLIC_UI_QA.md`.

**Pra-demo (wajib):**

- Restart API agar route M18/M19 aktif (limitasi QA: proses port 3000 sebelumnya stale); pastikan migration `015_hunian_gallery.sql` sudah diterapkan; pastikan permission direktori upload storage; pastikan `VITE_API_BASE_URL` benar untuk URL media publik; redeploy app Admin dan Penghuni/public.

**Cakupan demo aman:**

- Admin membuka `/hunian-gallery` (nav "Galeri Hunian"), memilih item katalog, upload gambar (drag-and-drop atau click; JPEG/PNG/WebP maks 3 MB, maks 10/item), edit altText/caption, set cover, publish gambar.
- Publik `/kamar` tanpa login menampilkan cover image pada kartu item yang punya gambar terpublikasi; item tanpa gambar publik tetap menampilkan placeholder aman "Galeri hunian sedang disiapkan..." (perilaku benar, bukan bug).
- Publik `/kamar/$slug` menampilkan hero gallery + thumbnail selector + lightbox (prev/next, panah keyboard, Escape).
- Foto Draft (`publicVisible=false`, default upload) TIDAK tampil publik - itu perilaku aman yang benar; setelah unpublish/delete, konten media publik mengembalikan 404.

**JANGAN:**

- Meng-upload/mendemokan foto yang memperlihatkan plat nomor kamar, wajah penghuni, dokumen, atau informasi internal (review foto adalah SOP manual admin; tanpa deteksi otomatis).
- Menampilkan atau menjanjikan nomor kamar eksak / roomId / `room_code` di permukaan publik.
- Mempresentasikan galeri atau public booking sebagai production-ready - **production NOT READY**; **public booking NOT production-ready**; **payment booking DEFERRED**.
- Mengubah postur Smart Lock (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`) - live command **NO-GO**.

Catatan: browser visual QA M19C/M19D belum dieksekusi (tooling tidak tersedia di VPS) dan live API smoke QA M19C/M19D terbatas (port stale); `thumbnailUrl` masih `null` sehingga thumbnail publik memuat gambar asli; demo visual pertama sekaligus berfungsi sebagai sanity check visual.

## 18. M20 Pre-Demo Staging Restart & Visual QA Pointer (Added 2026-07-08 via M20A)

Sebelum demo berikutnya, jalankan checklist **`docs/20-staging-visual-qa/M20_STAGING_RESTART_VISUAL_QA_PLAN.md`** (M20A):

- Restart/deploy staging: pull master terbaru, migration `015_hunian_gallery.sql`, restart API (menutup limitasi port 3000 stale; route M18/M19 aktif), redeploy Admin + Penghuni, cek env `VITE_API_BASE_URL`/`VITE_PUBLIC_WHATSAPP_NUMBER`, storage upload writable, media endpoint publik.
- API smoke + admin gallery smoke + public catalog/gallery smoke sesuai checklist Sections 4-6.
- Browser visual QA (opsional) dijalankan **lokal** terhadap URL staging - VPS tidak punya browser tooling; simpan screenshot sebagai evidensi.
- Verdict wording: **"M20 PASS with browser visual limitation"** (tanpa visual QA lokal) atau **"M20 PASS with browser visual QA completed"**.

M20 TANPA fitur baru dan **TIDAK mengklaim production readiness**; postur Smart Lock (`SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`) dan Payment Gateway (sandbox/staging) tidak berubah.
