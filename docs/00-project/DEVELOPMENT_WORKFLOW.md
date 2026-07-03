# Development Workflow

> Diperbarui: 2026-07-03 (M12G). Menambahkan perintah backend dan pembagian peran agen/validasi. Aturan perubahan lama tetap berlaku.

## Setup

```powershell
npm install
```

## Menjalankan App

```powershell
npm run dev:admin
npm run dev:penghuni
```

Backend API NestJS berada di `backend/api` (base URL dev: `http://localhost:3000/api/v1`).

## Build, Lint, Typecheck, Migrasi

```powershell
npm run build:admin
npm run build:penghuni
npm run build:api
npm run lint:admin
npm run lint:penghuni
npm run lint:api
npm --workspace @granada-kost/admin run typecheck
npm --workspace @granada-kost/penghuni run typecheck
npm run db:migrate:api
```

## Pembagian Peran Agen dan Validasi

Workflow saat ini memakai kombinasi agen AI dengan kapabilitas berbeda. Aturan berikut wajib dipatuhi:

- **GitLab Duo / Claude** (tanpa akses shell/browser): digunakan untuk dokumentasi dan implementasi yang sadar-arsitektur (architecture-aware implementation). TIDAK boleh mengklaim telah menjalankan lint, typecheck, build, browser QA, smoke test, API test, atau pemeriksaan DB.
- **Codex GPT-5.5 High**: melakukan validasi shell (lint/typecheck/build), API smoke test, browser QA, dan validasi bugfix. Hasilnya menjadi evidensi QA yang dicatat di dokumen (contoh: QA-M12G pada `INTERNAL_DEMO_CHECKLIST.md` Section 12).
- **Jangan pernah mengklaim validasi dari tool yang tidak memiliki akses shell/browser.** Status validasi yang belum ada evidensinya dicatat sebagai PENDING/dijadwalkan, bukan PASS.

Pemisahan peran:

| Peran | Cakupan | Batasan |
| --- | --- | --- |
| Principal Engineer | Implementasi, perbaikan bug, validasi build | Mengikuti ADR yang dibekukan; tidak mengubah ADR tanpa instruksi |
| QA Engineer | Verifikasi browser/API saja | TIDAK mengedit source code |
| Release Engineer | Dokumentasi, rilis, checklist saja | TIDAK mengedit kode |

## Aturan Perubahan

- Ubah satu app saja jika kebutuhan hanya spesifik Admin atau Penghuni.
- Ekstrak ke `packages/*` hanya ketika ada kontrak atau komponen yang benar-benar dipakai bersama.
- Jangan menambah package manager kedua.
- Jangan commit `node_modules`, `dist`, `.env`, atau artefak build.
- `packages/api-client` frozen di M11B per ADR-FE-001; jangan diubah tanpa keputusan arsitektur eksplisit.
