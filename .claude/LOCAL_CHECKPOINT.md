# Local Project Checkpoint — M9–M12 Recovery Closure

Recorded: 2026-07-28 (Asia/Jakarta)

Scope statement: checkpoint ini menutup recovery milestone M9–M12 untuk demo
lokal dan regression read-only. **Seluruh produk KOSTATION belum dinyatakan
selesai.**

## Git state

- Recovery HEAD sebelum checkpoint: `653085b fix(admin): stabilize booking lead route context`.
- M8 aggregate gate tetap canonical melalui `npm run qa:read-only`.

## Milestone selesai

### M9 — Local runtime topology

- `17f455d fix(dev): lock local frontend ports`.
- Topologi canonical: API `localhost:3000`, Admin `localhost:8080`, dan
  Penghuni `localhost:8081`.
- Strict-port dan CORS Penghuni tervalidasi; route publik `/kamar` tersedia.

### M10 — Rooms inventory correctness

- `24e3a69 fix(admin-ux): make room inventory summary authoritative`: summary
  property-wide, filter kategori, tabel, dan server-side pagination.
- `7fff296 fix(admin-ux): use authoritative room building references`:
  referensi building authoritative dan Add Room readiness.
- `8da0a64 fix(seed): bootstrap authoritative room buildings`: development
  seed menghasilkan 26 building, 163 linked rooms, dan mempertahankan invariant
  lifecycle/occupancy.

### M11 — Admin quick booking lead

- `4bb0f6b feat(booking): add admin quick lead entry`: backend quick-entry
  property-scoped untuk manager/admin dengan authority yang sesuai.
- `5bbb25d feat(admin): add quick booking lead entry`: frontend quick-entry dan
  WhatsApp action read-safe.
- `653085b fix(admin): stabilize booking lead route context`: topology
  `PropertyProvider` persistent dan source badge stabil pada desktop/mobile.

Booking lead adalah minat calon penghuni, bukan reservasi atau occupancy. Quick
entry tidak mengubah status kamar. Migration 019 hanya diterapkan secara
targeted pada database demo lokal.

### M12 — Recovery closure

- Final `npm run qa:read-only`: **12/12 PASS**.
- Final `git diff --check`: **PASS**.
- Draft Playwright M12-Q1 telah di-rollback penuh; tidak ada config, test,
  script, dependency, atau lockfile delta Playwright tersisa.

## Batas kebenaran

- Recovery milestone M9–M12 selesai; ini bukan deklarasi bahwa seluruh produk,
  UX, dan domain KOSTATION selesai.
- Property switch/cross-property QA masih deferred karena demo hanya memiliki
  satu property.
- Tiga dokumen untracked di `docs/plans` tetap planning/reference dan tidak
  otomatis authoritative.

## Deferred debt

- Stable browser automation harus didesain ulang memakai build/preview, bukan
  Vite dev/HMR; browser automation bukan release gate saat ini.
- Migration runner belum memiliki ledger dan tidak aman untuk replay produksi.
- Full product/UX/domain audit dan revisi lanjutan dilakukan setelah checkpoint
  ini.

## Baseline dirty yang tidak disentuh

- `apps/admin/src/routeTree.gen.ts` dan
  `apps/penghuni/src/routeTree.gen.ts`.
- `backend/api/.env.example`.
- Tooling/skills lokal dan `skills-lock.json`.
- `docs/plans/ADMIN_UX_DB_API_DESIGN.md`,
  `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md`, dan
  `docs/plans/ADMIN_UX_QA_RELEASE_STRATEGY.md`.

## Next

Lanjutkan full product/UX/domain audit dari checkpoint ini tanpa menganggap
planning document sebagai kontrak shipped.
