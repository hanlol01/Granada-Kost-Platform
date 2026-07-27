# Local Project Checkpoint — Admin UX Recovery Slice

Recorded: 2026-07-27 (Asia/Jakarta)

Scope statement: checkpoint ini menandai **selesainya recovery slice Admin UX
(read-only demo lokal)** — bukan selesainya seluruh produk KOSTATION. Fitur
write/lifecycle, gateway enablement, dan hardening M8 belum dikerjakan.

## Git state

- Recovery implementation HEAD: `28cd48d` fix(admin): correct breadcrumb list structure
- Portable-EOL follow-up: `1f400cc` chore(penghuni): make prettier line endings portable

Tujuh recovery commits (urut lama → baru):

```text
a8b5384 fix(admin): preserve V2 API base path
9f6cbf5 fix(seed): align lease read RBAC grants
e1cd31c fix(api): allow disabled gateway admin reads
029b2d3 fix(admin): preserve payment transaction envelopes
1a8c74c fix(admin): align core surfaces with theme tokens
d1b48de fix(admin): resolve core light theme contrast
28cd48d fix(admin): correct breadcrumb list structure
```

## Regression results (R7-D0, 2026-07-27)

- Admin: test **64/64 PASS** (m3/m4/m6/m7 + r5 theme + r6 breadcrumb); typecheck, lint, build PASS.
- API: lint PASS, build PASS. **API automated test script belum tersedia** (tidak ada script `test` maupun file spec — gap yang sudah tercatat di QA release strategy).
- Penghuni: lint, typecheck, build **PASS setelah portable-EOL** (`endOfLine: "auto"`; sebelumnya lint gagal karena checkout CRLF Windows vs default `lf`).
- `git diff --check` PASS.

## Runtime evidence (read-only smoke)

- API dan Admin local health PASS; service lokal diadopsi tanpa restart.
- Auth fresh login PASS: role admin dengan `room.read`/`lease.read`/`billing.read`, property demo scoped, GET tanpa token → 401 (fail-closed).
- GET domain PASS: dashboard summary, kost types, invoices, payments, payment transactions (empty list dengan envelope `{data, meta}` exact adalah state valid — gateway disabled by design).
- Browser PASS: Dashboard, Rooms, Payments Invoice/Pembayaran/Online (empty state benar), pada desktop dan mobile, light dan dark; kontras teks inti memenuhi WCAG ≥ 4.5:1.
- Breadcrumb hydration fixed: `li li = 0` dan nol warning nesting di seluruh matrix.
- Nol PUT/PATCH/DELETE, nol panggilan provider/webhook/settlement, nol mutasi domain; POST hanya auth login/refresh.

## Shipped / verified

- Auth fail-closed + RBAC read grants; V2 API base path `/api/v1` dipertahankan.
- Master data M4 (kost types + room inventory read), lease read M6, billing read (invoices/payments), payment-transactions read (envelope exact), notifications read, dashboard summary M7 (`GET /dashboard/summary`, snake_case).
- Theme R5: semantic tokens pada Tier A + kontras light/dark lulus ukur; guard test AST.
- Breadcrumb semantic R6: separator sibling (keyed Fragment) + guard test AST.

## Partial / deferred

- Property switch: deferred (fixture satu properti).
- Payment Gateway enablement: frozen by design (read-only list valid kosong).
- Lease write/checkout/transfer/scheduler penuh, CSV export: belum dikerjakan (kontrak write terpisah).
- Tier B visual sweep (sub-halaman masih hard-coded dark), FOUC inline script, theme icon sync: deferred.
- Reports masih client-derived legacy (M7-D0 menandainya reference, bukan sumber metric).

## Known non-blocking baseline

- 13 Admin lint warnings unrelated (fast-refresh/eslint-disable pre-existing); 10 warning serupa di Penghuni.
- Console noise auth refresh (401 INVALID_REFRESH_TOKEN sekitar fresh login) — known, bukan defect fitur.
- Baseline dirty yang sengaja tidak dimiliki R7 dan tetap di luar commit:
  - `apps/admin/src/routeTree.gen.ts` dan `apps/penghuni/src/routeTree.gen.ts` (perbedaan EOL-only dari generator; tidak diedit manual);
  - `backend/api/.env.example` (rebranding APP_NAME lokal pre-recovery);
  - direktori tooling agent lokal dan `skills-lock.json`.
- Tiga dokumen untracked `docs/plans/ADMIN_UX_DB_API_DESIGN.md`, `ADMIN_UX_FRONTEND_INTEGRATION.md`, `ADMIN_UX_QA_RELEASE_STRATEGY.md` berstatus planning/reference dan tetap di luar checkpoint commit.

## Next milestone

M8 read-only hardening and aggregate evidence gate.
