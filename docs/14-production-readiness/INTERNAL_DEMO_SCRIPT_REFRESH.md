# M14D — Internal Demo Script Refresh

> **Milestone:** M14D (documentation only — no implementation, no QA execution, no live commands)
> **Date:** 2026-07-04
> **Role:** Kostation Release / Demo Script Reviewer
> **Status:** Demo script recorded; input for M14E documentation refresh and M14F release readiness verdict
> **Binding inputs:** `docs/14-production-readiness/PRODUCTION_READINESS_AUDIT.md` (M14A), `docs/14-production-readiness/API_REGRESSION_SECURITY_SMOKE.md` (M14B, PASS), `docs/14-production-readiness/BROWSER_REGRESSION_INTERNAL_DEMO_FLOW.md` (M14C, PASS), `docs/00-project/INTERNAL_DEMO_CHECKLIST.md` (QA-01 + Section 12 M12 updates), `docs/13-smart-lock/SMART_LOCK_LIVE_SITE_TRIAL_GO_NO_GO_DECISION.md` (M13F-C4), `docs/13-smart-lock/SMART_LOCK_READY_FOR_SITE_TRIAL_EXECUTION_PENDING_FREEZE.md` (M13F-D), `docs/01-architecture/SECURITY_POLICY.md`
> **Evidence inputs:** `artifacts/m14b-api-regression-smoke/`, `artifacts/m14c-browser-regression/`, `artifacts/m13f-c4-site-evidence-pack/`, `artifacts/m12h-final-demo-pass/`, `artifacts/internal-demo/`
>
> This document contains **no real secrets and no real device IDs**. All credentials are masked or placeholders.
> No lint, typecheck, build, API smoke, browser QA, migration, or any terminal command was run for M14D. GitLab Duo has no shell access; all cited validation results were produced earlier and externally (Codex) and are referenced from committed documents/artifacts, not re-executed here.
> **No live Smart Lock command was executed for this document.** `SMART_LOCK_LIVE_ENABLED` remains `false`.
> **Smart Lock live integration is NOT marked complete by this document.** ADR-SL-001 and all M13 freezes remain binding and unchanged.

---

## 1. Executive Summary

- **Internal demo is READY.** All demo-scope surfaces were re-validated after M12+M13 backend changes.
- **Production is NOT READY** (per M14A: local-disk storage, missing audit viewer/export endpoints, unexecuted deployment/env checklist, unconfirmed secret rotation, stale governance docs).
- **M14B API Regression & Security Smoke: PASS** (2026-07-04, commit `5f1b96b`, zero failures, leakage PASS).
- **M14C Browser Regression / Internal Demo Flow: PASS** (2026-07-04, Hybrid Interactive Login + automated post-login regression, 0 leakage findings, no fatal console errors).
- **Smart Lock live execution remains NO-GO** (M13F-C4 / M13F-D: CONDITIONAL GO for preparation only; no physical live unlock has ever been executed).
- **Smart Lock must be demonstrated only as simulated / read-only / guarded-disabled flow** — the command guard returning `LIVE_COMMAND_DISABLED` is itself the demo highlight (fail-closed safety posture).

## 2. Demo Principles

1. **Never claim physical Smart Lock live unlock is production-ready.** It has never been executed and remains NO-GO until real site trial evidence exists.
2. **Never set `SMART_LOCK_LIVE_ENABLED=true`** — not before, during, or after the demo, and not as a fallback.
3. **Never use real Tuya secrets or real device IDs.** Simulated provider and seeded/synthetic devices only.
4. **Never show raw provider IDs, `storage_path`, or any secret** on screen. Provider IDs are masked by design (post-`757b0db9` fix); do not attempt to un-mask anything.
5. **Use seeded/demo accounts only** (Section 4). No production or personal accounts.
6. **If automation is used, use Hybrid Interactive Login** (manual login in isolated browser profiles, automated post-login flows) — this is the M14C-validated mode and avoids shared refresh-cookie collisions between Admin and Penghuni.
7. **Keep demo scope aligned with M14C evidence.** Only demo routes and flows that passed M14C; anything else is out of scope for this script.
8. Do not open `.env` files, terminals with secrets, password managers, or provider consoles on the shared screen.

## 3. Pre-Demo Checklist

- [ ] Latest `master` branch/commit pulled (M14B/M14C evidence corresponds to commit `5f1b96b` lineage).
- [ ] Backend API starts and health endpoint responds (database up, Redis up).
- [ ] Admin frontend starts and `/login` renders.
- [ ] Penghuni frontend starts and `/login` renders.
- [ ] Database seeded (demo property, rooms, residents, invoices, complaint categories).
- [ ] Redis running (required for rate limit, idempotency, token cache; Smart Lock guard fails closed without it).
- [ ] Backend env verified safe: `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`. Verify before screen sharing starts.
- [ ] No `.env` file or secret value displayed on screen at any point.
- [ ] Test upload files ready: one valid JPEG/PNG ≤ 2 MB (payment proof), 1–2 valid photos (complaint), one invalid-type file, one oversized file (negative UX).
- [ ] Browser windows ready: two isolated profiles (Admin and Penghuni), logged out, at `/login`.
- [ ] Optional: `artifacts/m14c-browser-regression/screenshots/` open in a local folder as backup evidence.
- [ ] Fallback plan reviewed (Section 11); presenter knows where each fallback artifact lives.

## 4. Demo Accounts

| Role | Login | Password | Notes |
| --- | --- | --- | --- |
| Admin | `dev.admin@kostation.test` | `<PASSWORD_MASKED>` | Full admin surface (M14C-validated) |
| Penghuni | `dev.resident.alpha@kostation.test` | `<PASSWORD_MASKED>` | Resident self-scope flows (M14C-validated) |
| Property owner (optional) | `<PROPERTY_OWNER_DEMO_ACCOUNT>` | `<PASSWORD_MASKED>` | Only if demonstrating read-only owner scope / RBAC denial (M14B-validated at API level) |

Passwords are never written in this document or shown on screen. Real passwords live only in the local seed/env, outside the repository.

## 5. Recommended Demo Flow Overview

Total target: **± 30 minutes** (25 min content + 5 min buffer).

| Seg | Actor | Feature | Est. time | Demo goal | Evidence source | Risk / fallback |
| --- | --- | --- | --- | --- | --- | --- |
| A | Presenter | Opening / project status | 2 min | Frame scope: demo-ready vs production-pending | M14A Sections 1, 6 | Low — static slide/doc |
| B | Admin | Login + Dashboard | 2 min | Auth + admin overview render | M14C `admin-login.png`, `admin-dashboard.png` | Manual login; screenshot fallback |
| C | Penghuni | Login + Home | 2 min | Resident PWA + Tagihan Aktif | M14C `penghuni-login.png`, `penghuni-dashboard.png` | Manual login; screenshot fallback |
| D | Penghuni | Manual payment proof upload | 4 min | Upload → `pending_review`; no auto-settlement | M14C billing/proof screenshots | Pre-created proof; screenshots |
| E | Admin | Payment proof preview/review | 3 min | Authorized preview; verify/reject = settlement authority | M14C `admin-payments-verification.png`, `admin-payment-proof-preview.png` | Screenshot fallback |
| F | Penghuni | Complaint create (no attachment) | 2 min | Base complaint flow | M14C `penghuni-complaint-create-no-attachment.png` | Screenshot fallback |
| G | Penghuni | Complaint create (with attachment) | 3 min | 1–5 photos, transactional attach | M14C `penghuni-complaint-create-with-attachment-success.png` | Pre-created complaint; screenshots |
| H | Admin | Complaint attachment preview | 2 min | Safe metadata, backend-mediated preview | M14C `admin-complaint-attachment-preview.png` | Screenshot fallback |
| I | Penghuni | File upload negative UX | 2 min | Invalid type + oversized rejected | M14C `invalid-file-error.png`, `oversized-file-error.png` | Screenshot fallback |
| J | Admin | Smart Lock safe state (simulated / guarded disabled) | 4 min | Safety posture: guard, `LIVE_COMMAND_DISABLED`, masked IDs | M14C `admin-smart-lock-simulated-safe-state.png`; M14B guard results; M13F-C4.1 pack | Show M14B/M13F-C4.1 results; **never enable live flag** |
| K | Presenter | Closing / production blockers / next steps | 3 min | Production NOT READY; M14E→M14F path | M14A Sections 5, 7 | Low — static doc |

## 6. Presenter Script (Bahasa Indonesia)

### A. Pembukaan / Status Proyek
- **Katakan:** "Hari ini kami menunjukkan demo internal Kostation. Seluruh alur yang akan kami tunjukkan sudah lulus regression API (M14B) dan regression browser (M14C) per 4 Juli 2026. Yang kami tunjukkan adalah kesiapan demo internal — bukan klaim production-ready."
- **Klik/Tunjukkan:** Ringkasan status (boleh slide atau Section 1 dokumen ini).
- **Hasil yang diharapkan:** Audiens memahami batas scope sejak awal.
- **Jangan katakan:** "Sistem siap production", "Smart lock sudah bisa buka pintu".
- **Fallback:** Tidak ada dependensi teknis; segmen ini selalu bisa jalan.

### B. Login Admin + Dashboard
- **Katakan:** "Kami login sebagai admin dengan akun demo. Autentikasi memakai JWT dengan refresh rotation."
- **Klik/Tunjukkan:** Admin `/login` → login manual → Dashboard.
- **Hasil yang diharapkan:** Dashboard render dengan angka ringkasan; tanpa error fatal di console.
- **Jangan katakan:** Menyebut password atau isi `.env`.
- **Fallback:** Jika lambat, tunggu sambil menjelaskan RBAC; jika gagal, tunjukkan `admin-dashboard.png` dari artefak M14C.

### C. Login Penghuni + Home
- **Katakan:** "Aplikasi Penghuni adalah PWA mobile-first. Penghuni hanya melihat data miliknya sendiri — self-scope ditegakkan backend."
- **Klik/Tunjukkan:** Penghuni `/login` di profil browser terpisah → Home → kartu Tagihan Aktif.
- **Hasil yang diharapkan:** Home render sebagai `Dev Resident Alpha`; Tagihan Aktif tampil.
- **Jangan katakan:** "Penghuni bisa akses fitur admin".
- **Fallback:** Screenshot `penghuni-dashboard.png` (M14C).

### D. Upload Bukti Pembayaran Manual
Lihat Section 7 untuk naskah detail.

### E. Preview/Review Bukti Pembayaran oleh Admin
Lihat Section 7 untuk naskah detail.

### F. Buat Komplain Tanpa Lampiran
Lihat Section 8 untuk naskah detail.

### G. Buat Komplain Dengan Lampiran
Lihat Section 8 untuk naskah detail.

### H. Preview Lampiran Komplain oleh Admin
Lihat Section 8 untuk naskah detail.

### I. Negative UX Upload File
- **Katakan:** "Validasi bukan hanya di frontend. Backend memvalidasi MIME, magic byte, dan ukuran file. Di sini kami coba file yang salah tipe dan file yang terlalu besar."
- **Klik/Tunjukkan:** Form upload → pilih file tipe salah → error; pilih file oversized → error.
- **Hasil yang diharapkan:** Pesan error jelas; tidak ada file tersimpan; tidak ada 500.
- **Jangan katakan:** "Validasi hanya di sisi client".
- **Fallback:** Screenshot `invalid-file-error.png` dan `oversized-file-error.png` (M14C).

### J. Smart Lock — Kondisi Aman (Simulated / Read-Only / Guarded Disabled)
Lihat Section 9 untuk naskah detail dan batasan kata yang mengikat.

### K. Penutup / Blocker Produksi / Langkah Berikutnya
- **Katakan:** "Demo internal siap. Namun production belum siap: site trial Smart Lock masih pending, checklist deployment/env belum dieksekusi, dan dokumen roadmap/handoff perlu refresh. Milestone berikutnya adalah M14E lalu M14F untuk verdict release."
- **Klik/Tunjukkan:** Section 13 dokumen ini atau M14A Section 5.
- **Hasil yang diharapkan:** Ekspektasi audiens terkelola; next steps jelas.
- **Jangan katakan:** "Tinggal deploy", "Semua sudah selesai".
- **Fallback:** Tidak ada dependensi teknis.

## 7. Payment Proof Demo Script

1. **Penghuni membuka Billing/Tagihan.** Katakan: "Penghuni melihat tagihan aktif miliknya sendiri."
2. **Upload file bukti** (JPEG/PNG ≤ 2 MB) via engine upload — preview tampil sebelum submit.
3. **Submit bukti.** Katakan: "Bukti masuk dengan status `pending_review`."
4. **Jelaskan `pending_review`:** "Upload bukti tidak otomatis melunasi tagihan. Ini jalur fallback transfer manual."
5. **Jelaskan otoritas settlement:** "Tagihan tetap belum lunas sampai admin memverifikasi. Verifikasi admin adalah satu-satunya otoritas settlement." (Divalidasi M14B: proof tetap pending dan invoice tetap belum lunas.)
6. **Admin membuka tab verifikasi pembayaran** di halaman Payments.
7. **Admin preview file bukti.** Katakan: "Preview memakai akses terotorisasi yang dimediasi backend — konten hanya via `GET /files/:fileId/content`."
8. **Sebutkan eksplisit:** "`storage_path` tidak pernah diekspos ke frontend, dan tidak ada URL file publik." (Leakage check M14B/M14C: 0 temuan.)
9. **Opsional:** Admin verify/reject di dialog untuk menutup alur.
- **Fallback jika preview lambat:** jelaskan arsitektur backend-mediated sambil menunggu; jika tetap gagal, tunjukkan `admin-payment-proof-preview.png` dan `penghuni-billing-proof-pending-review.png` dari `artifacts/m14c-browser-regression/screenshots/`.

## 8. Complaint Attachment Demo Script

1. **Penghuni buat komplain tanpa lampiran:** kategori, judul, deskripsi, lokasi. Submit → sukses. (M14C: PASS.)
2. **Penghuni buat komplain dengan lampiran:** 1–2 foto (maks 5, JPEG/PNG, maks 2 MB per foto). Preview tampil sebelum submit. Submit → sukses; lampiran ter-attach secara transaksional.
3. **Jelaskan restriksi:** "Tipe file dibatasi JPEG/PNG dengan validasi magic-byte di backend, maksimal 5 foto, 2 MB per foto."
4. **Admin buka detail komplain** yang baru dibuat.
5. **Admin preview lampiran.** Katakan: "Metadata yang tampil aman — tanpa `storage_path`; konten via akses terotorisasi."
6. **Fallback WhatsApp (jika relevan operasional):** jelaskan bahwa jika penghuni kesulitan dengan aplikasi, pelaporan via WhatsApp tetap dimungkinkan secara operasional dan admin dapat mencatat komplain — proses manual, bukan integrasi otomatis (integrasi WhatsApp/push masih deferred).
7. **Fallback jika upload lambat:** lanjutkan narasi validasi backend; jika gagal, gunakan komplain yang sudah dibuat sebelumnya atau screenshot `admin-complaint-detail-attachments.png` / `admin-complaint-attachment-preview.png` (M14C).

## 9. Smart Lock Demo Script

**Framing wajib (boleh dikatakan):**
- Fondasi backend Smart Lock **siap**: provider config, signing client, token cache (simulated default).
- **Read-only diagnostic dan sync siap**, dengan provider ID ter-mask dan safe failure ternormalisasi.
- **Command guard siap**: fail-closed gates, RBAC (admin/manager + `smart_lock.manage`), property scope, confirmation + reason + idempotency, rate limit, audit intent/result.
- **Guarded live unlock transport sudah diimplementasikan** (M13F-C2) — tetapi belum pernah dieksekusi ke perangkat nyata.
- **Eksekusi live menunggu site trial nyata** (M13F-C5), dengan approval dan evidence lengkap.
- Dalam demo, perintah unlock **harus** berakhir dengan `LIVE_COMMAND_DISABLED` atau kondisi disabled yang aman — **itulah bukti keamanannya**.

**Framing terlarang (jangan pernah dikatakan):**
- "Live unlock production-ready."
- "Pintu fisik bisa dibuka sekarang."
- "Penghuni bisa unlock sendiri" (resident unlock ditolak `403` oleh kebijakan yang dibekukan).
- "PIN sementara tersedia" (M13G belum dibangun, masih gated).
- "Siap rollout banyak perangkat" (constraint satu perangkat uji).

**Naskah wajib (gunakan kata-kata persis ini):**

> "Untuk Smart Lock, sistem sudah memiliki fondasi backend, guard, audit, idempotency, dan mode read-only. Namun live unlock fisik belum kami klaim production-ready karena masih menunggu site trial dengan perangkat PALOMA/Tuya asli."

**Langkah demo:**
1. Admin buka halaman `/smart-lock` → tunjukkan kondisi simulated yang aman (M14C: `admin-smart-lock-simulated-safe-state.png`).
2. Jelaskan mode read-only diagnostic/sync di level API sebagai "fondasi backend, bukan live".
3. Jika menunjukkan perintah (API-level saja): tunjukkan respons `accepted:false`, `error_code:LIVE_COMMAND_DISABLED` — jelaskan ini perilaku fail-closed yang benar dan diinginkan saat ini.
4. Tutup dengan naskah wajib di atas.
- **Fallback:** jika halaman/API tidak tersedia, tunjukkan hasil guard dari M14B ("Smart Lock command guard returns fail-closed responses with live disabled: PASS") dan ringkasan `artifacts/m13f-c4-site-evidence-pack/`. **Jangan pernah** mengubah env atau flag live sebagai bagian dari fallback.

## 10. Negative / Security Talking Points

- **RBAC:** penghuni tidak bisa mengakses rute/aksi admin dan sebaliknya; boundary 401/403 divalidasi M14B.
- **Property scope** ditegakkan backend pada semua resource operasional; resident self-scope pada data penghuni.
- **File storage path tersembunyi:** tidak ada `storage_path`/URL publik di respons mana pun; konten hanya via endpoint terotorisasi.
- **Secret Smart Lock backend-only:** kredensial Tuya tidak pernah ada di repo, log, atau konfigurasi yang bisa dijangkau client.
- **Tidak ada env Tuya di frontend** — tidak ada variabel provider apa pun di build `apps/admin` / `apps/penghuni`.
- **Kill-switch live command ada:** `SMART_LOCK_LIVE_ENABLED=false` menghentikan perintah sebelum IO provider (fail-closed), plus rollback path ke provider simulated.
- **Eksekusi live Smart Lock tetap NO-GO** sampai seluruh kriteria M13F-C4 PASS dengan evidence tercatat.

## 11. Fallback Plan

| Situasi | Tindakan |
| --- | --- |
| Login automation lambat/gagal | Login manual di profil browser terpisah (mode Hybrid Interactive yang divalidasi M14C) |
| Upload lambat/gagal | Gunakan bukti/komplain yang sudah dibuat sebelumnya, atau screenshot M14C |
| Preview lambat/gagal | Tunjukkan screenshot artefak M14C yang relevan sambil menjelaskan arsitektur |
| Halaman Smart Lock tidak tersedia | Tunjukkan ringkasan hasil API dari dokumen M14B dan pack M13F-C4.1 |
| Backend lambat/down | Beralih penuh ke evidence statis: screenshot M14C + `qa-summary.json` M14B/M14C |
| Apa pun yang terjadi | **JANGAN PERNAH** mengaktifkan `SMART_LOCK_LIVE_ENABLED=true` atau mengganti provider ke `tuya` selama demo/fallback |

## 12. Demo Artifacts Reference

- `artifacts/m14c-browser-regression/screenshots/` — 20 screenshot seluruh alur demo (login, billing/proof, complaints, negative UX, smart-lock safe state).
- `artifacts/m14c-browser-regression/qa-summary.json` — ringkasan hasil browser regression M14C.
- `artifacts/m14b-api-regression-smoke/qa-summary.json` — ringkasan hasil API regression & security smoke M14B.
- `artifacts/m13f-c4-site-evidence-pack/` — sanitized C3-class dry-run evidence pack Smart Lock (PASS, 0 leakage hits, B-23 partially closed).
- Pendukung: `artifacts/m12h-final-demo-pass/`, `artifacts/internal-demo/` (baseline QA-01).

## 13. Production Readiness Closing

- **Internal demo: READY** (M14A audit + M14B PASS + M14C PASS).
- **Production: NOT READY.** Blocker utama:
  1. **Smart Lock live site trial pending** — approvals, rotasi kredensial, mapping perangkat nyata, dan site-env dry-run belum ada (M13F-C4 Sections 6–7).
  2. **Keputusan release pasca-demo dibutuhkan** — verdict konsolidasi belum dibuat (M14F).
  3. **Deployment/env checklist belum dieksekusi** terhadap environment target mana pun (M14A Section 8).
  4. **Refresh docs roadmap/handoff pending** — `ROADMAP.md`, `CHANGELOG.md`, `PROJECT_MASTER.md`, `PROJECT_HANDOFF.md` belum memuat entri M13/M14.
- **Milestone berikutnya yang direkomendasikan:** **M14E — Documentation/Roadmap/Handoff Refresh**, lalu **M14F — Release Readiness Verdict**.

## 14. Acceptance Checklist

- [x] Demo script created (`docs/14-production-readiness/INTERNAL_DEMO_SCRIPT_REFRESH.md`).
- [x] Safe demo scope defined (aligned with M14A Section 6 and M14C evidence).
- [x] Presenter script included (Bahasa Indonesia, per segment, with fallbacks).
- [x] Payment proof flow included (Section 7).
- [x] Complaint attachment flow included (Section 8).
- [x] Smart Lock wording constrained (Section 9, mandatory quote + forbidden framings).
- [x] Fallback plan included (Section 11).
- [x] Artifacts referenced (Section 12).
- [x] No code implementation (documentation only).
- [x] No live Smart Lock execution (`SMART_LOCK_LIVE_ENABLED` remains `false`; NO-GO unchanged).
