# Local Project Checkpoint - M9–M19 Recovery Closure

Recorded: 2026-07-29 (Asia/Jakarta)

Scope statement: **recovery/revision milestone M9–M19 selesai**. Pernyataan ini
hanya menutup slice recovery yang tercatat di bawah; seluruh produk KOSTATION
belum dinyatakan selesai, semua fitur belum dinyatakan lengkap, dan repository
ini tidak dinyatakan production ready.

## Git state

- Recovery implementation HEAD sebelum checkpoint final: `5e1a96a feat(penghuni): use canonical resident context`.
- Commit canonical recovery berada pada ancestry HEAD dari `17f455d` sampai
  `5e1a96a` sesuai `git log` repository.
- Aggregate read-only gate tetap canonical melalui `npm run qa:read-only`.
- Tiga dokumen untracked di `docs/plans` tetap planning/reference dan bukan
  shipped authority.

## Truth matrix M9–M19

| Milestone | Repository / automated evidence                    | Runtime boundary                                                               |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| M9        | Shipped; automated verified                        | Runtime verified untuk topologi lokal canonical                                |
| M10       | Shipped; automated verified                        | Operator-reported runtime evidence diterima                                    |
| M11       | Shipped; automated verified                        | Operator-reported runtime evidence diterima                                    |
| M12       | Aggregate read-only gate shipped                   | Stable Playwright/browser automation deferred; rollback draft bersih           |
| M13       | Shipped; automated verified                        | Lifecycle mutation runtime evidence deferred                                   |
| M14       | Shipped; automated verified                        | Operator-reported runtime evidence diterima                                    |
| M15       | Shipped; automated verified                        | Room create/edit mutation runtime evidence deferred                            |
| M16       | Shipped; automated verified                        | Authenticated runtime evidence deferred sampai credential proses-only tersedia |
| M17       | Shipped; automated verified                        | Authenticated runtime evidence deferred sampai credential proses-only tersedia |
| M18       | Shipped; automated verified                        | Authenticated runtime evidence deferred sampai credential proses-only tersedia |
| M19       | Aggregate 12/12 PASS; public/negative runtime PASS | Authenticated evidence mengikuti deferred classification M16–M18               |

## Canonical recovery commits

- M9: `17f455d` mengunci port lokal canonical.
- M10: `24e3a69`, `7fff296`, dan `8da0a64` menutup authoritative room
  summary, building references, dan seed building/room.
- M11: `4bb0f6b`, `5bbb25d`, dan `653085b` menutup Admin quick Booking Lead
  beserta route context.
- M13: `e5601e9` dan `de17d5f` membekukan lalu menegakkan canonical
  move-in/out.
- M14: `e799915`, `16a0cc9`, dan `e59a386` menutup room-hold lifecycle
  backend dan Admin.
- M15: `55d135f` dan `e74d03b` menutup persistence kamar backend dan Admin.
- Product/design authority: `8abb52c`.
- M16: `d68c5df` dan `28b60e9` menutup atomic maintenance dispatch backend
  dan Admin.
- M17: `6f08e01` dan `9f07d85` menutup persistent property Settings backend
  dan Admin.
- M18: `8df381a` dan `5e1a96a` menutup resident identity boundary backend
  dan canonical Penghuni self-context.

## Automated evidence

Final M19A aggregate inventory lulus **12/12** secara sequential dan fail-fast:

1. focused M8 gate contract;
2. backend read-only contracts;
3. Admin tests;
4. API lint;
5. API build;
6. Admin lint;
7. Admin typecheck;
8. Admin build;
9. Penghuni lint;
10. Penghuni typecheck;
11. Penghuni build;
12. `git diff --check`.

Focused coverage tambahan tetap tersedia pada:

- M9: `packages/admin-ux-qa/scripts/m9-runtime-topology.spec.ts`;
- M10: `apps/admin/src/lib/m10-rooms-inventory.test.ts`,
  `apps/admin/src/lib/m10-room-building-reference.test.ts`, dan
  `backend/api/test/admin-ux-m10/`;
- M11: `apps/admin/src/lib/m11-booking-quick-entry.test.ts` dan
  `backend/api/test/admin-ux-m11/`;
- M13-M15: pasangan focused frontend/backend di `apps/admin/src/lib/` dan
  `backend/api/test/admin-ux-m13/` sampai `backend/api/test/admin-ux-m15/`;
- M16-M17: `apps/admin/src/lib/m16-maintenance-dispatch.test.ts`,
  `apps/admin/src/lib/m17-settings.test.ts`, dan pasangan backend masing-masing;
- M18: `apps/penghuni/src/lib/m18-resident-self-context.test.ts` dan
  `backend/api/test/admin-ux-m18/`.

## Public and negative runtime evidence

M19B independently observed:

- API tersedia pada port `3000`, Admin pada `8080`, Penghuni pada `8081`, dan
  tidak ada listener fallback pada `8082`.
- `/kamar` mencapai terminal empty state pada desktop dan mobile, dengan
  horizontal overflow `0`.
- Negative authentication dan CORS checks PASS; verdict ini tidak mencakup
  known auth-refresh response di bawah.
- Initial anonymous auth refresh dapat menghasilkan exact `401
INVALID_REFRESH_TOKEN`; kondisi ini dikenal, bounded, dan non-blocking untuk
  public route. Ini bukan security PASS, bukan product defect, dan bukan bukti
  authenticated flow M16–M18.

Operator-reported runtime evidence yang diterima untuk M10, M11, dan M14 bukan
independently reproduced pada checkpoint ini. Tidak ada
browser, service, database, test, build, atau QA command baru yang dijalankan
oleh pass dokumentasi M19C/D.

## Deferred evidence and product backlog

1. Credential-backed authenticated smoke untuk M16–M18.
2. Runtime mutation evidence untuk create/edit kamar M15.
3. Runtime mutation evidence untuk lifecycle M13.
4. Stable browser automation/tooling berbasis build/preview setelah rollback
   bersih draft Playwright M12.
5. Contract resident account invitation/provisioning.
6. Lifecycle-safe resident deactivation.
7. Resident write yang transactional/idempotent dan clear-to-null edit
   semantics.
8. Resident server pagination, detail, dan lease history.
9. Peningkatan Penghuni profile, password, preferences, dan property info.
10. Readiness provider eksternal, Smart Lock, CCTV, dan payment tetap
    conditional sampai evidence serta approval masing-masing tersedia.
11. Full post-recovery product audit sebelum redesign atau feature expansion.

Unavailable credential adalah batas evidence, bukan product bug. Backlog di
atas tidak membatalkan closure recovery kecuali audit berikutnya membuktikan
security defect aktif.

## Baseline dirty yang tidak disentuh

- `apps/admin/src/routeTree.gen.ts` dan
  `apps/penghuni/src/routeTree.gen.ts`.
- `backend/api/.env.example`.
- Tooling/skills lokal dan `skills-lock.json`.
- `docs/plans/ADMIN_UX_DB_API_DESIGN.md`,
  `docs/plans/ADMIN_UX_FRONTEND_INTEGRATION.md`, dan
  `docs/plans/ADMIN_UX_QA_RELEASE_STRATEGY.md`.

## Next

Mulai dari deferred evidence berisiko tertinggi, lalu lakukan full
post-recovery product audit. Planning document tidak menjadi kontrak shipped
tanpa implementation dan evidence yang dapat ditelusuri.
