# M16E-QA - Public Room Listing UI + WhatsApp CTA Validation

> Date: 2026-07-07
> Verdict: PARTIAL
> Scope: Validation/fix only. No booking leads, no payment booking, no Smart Lock changes, no CSV import/backfill, and no intentional room inventory DB mutation.

## Branch And Git Status

- Expected branch: `m16e-public-room-listing-ui`
- Actual branch: `master`
- Initial git status: clean
- Branch mismatch is a validation issue. The M16E source files were present in the workspace, so validation continued against the checked-out code.

## Validation Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | FAIL | 3 Prettier errors in `apps/penghuni/src/routes/kamar.tsx`; additional pre-existing/baseline Prettier errors in billing/payment-related files were not touched |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS | `tsc --noEmit` passed |
| `npm --workspace @granada-kost/penghuni run build` | PASS | Vite client/SSR build passed; `/kamar` chunks emitted |
| `npm --workspace @granada-kost/api run build` | PASS | Run because port 3000 API was stale and returned 404 for M16D public endpoints |

Attempted tiny blocker fix for the `kamar.tsx` Prettier errors, but escalated file edit was rejected by auto-review usage limit. Payment Gateway/billing files were intentionally not edited.

## API Smoke

Existing API on port 3000:

- `GET /api/v1/health`: PASS, HTTP 200
- M16D public endpoints on port 3000: FAIL, HTTP 404, consistent with a stale long-running API process

Fresh built API on temporary port 3001:

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/health` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/summary` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/availability` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/availability?gender=putra` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/availability?gender=putri` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/availability?category=rukost` | PASS, HTTP 200 |
| `GET /api/v1/public/rooms/availability?category=apartkost` | PASS, HTTP 200 |

Fresh API summary:

| Metric | Value |
| --- | ---: |
| totalAvailable | 161 |
| RuKost available | 123 |
| ApartKost available | 38 |
| Male / Putra available | 97 |
| Female / Putri available | 64 |

The temporary API process on port 3001 was stopped after smoke validation.

## Route Accessibility

Browser runtime/tooling was not available, so `/kamar` was validated through build and route/static inspection.

Static result:

- `apps/penghuni/src/routes/kamar.tsx` defines `createFileRoute("/kamar")`.
- `apps/penghuni/src/routeTree.gen.ts` includes `/kamar`.
- `apps/penghuni/src/routes/__root.tsx` includes `/kamar` in `PUBLIC_ROUTES`.
- `GuardedOutlet` renders public routes outside `AuthGuard`.

Result: PARTIAL PASS by static/build validation. Browser no-login redirect/refresh-loop verification was not executed.

## UI Behavior

Static/build validation confirmed:

- Hero headline: `Temukan Kamar Kost yang Sesuai`.
- Gender selector: Putra/Putri.
- Category selector: Semua/Rumah Kost/Apart Kost.
- Availability cards render from `usePublicRoomAvailability`.
- Loading state exists via skeleton cards.
- Error state exists with retry button.
- Empty state exists.
- Footer disclaimer states booking is confirmed by admin via WhatsApp and there is no online payment for room booking.

Result: PARTIAL PASS. Browser visual rendering was not executed.

## WhatsApp CTA

Static validation confirmed:

- `VITE_PUBLIC_WHATSAPP_NUMBER` defaults to an empty string in `packages/domain/src/env.ts`.
- `getPublicWhatsAppNumber()` returns `null` when the env value is missing/empty or too short.
- The UI renders a disabled CTA when no WhatsApp number is configured.
- `buildWhatsAppUrl()` uses a `wa.me` URL only when the caller has a normalized number.
- Number normalization strips non-digits and converts a leading `0` to `62`.
- Message template includes: `Kategori`, `Untuk`, `Unit/Tipe`, `Ketersediaan`, and `Harga mulai`.
- Message template uses only group-level public fields and does not include exact room number or room code.

Result: PASS by static inspection.

## Privacy And Safety

API public response safety scan on fresh API:

- No tenant keys.
- No resident keys.
- No occupancy keys.
- No room IDs.
- No `room_code` / `roomCode`.
- No legacy room numbers.
- No import notes/source rows.
- No Payment Gateway keys.
- No Smart Lock keys.

UI source scan found these sensitive terms only in safety comments, not rendered data fields.

## Known Issues

1. Current branch is `master`, not the expected `m16e-public-room-listing-ui`.
2. Penghuni lint fails. M16E-specific formatter issues exist in `apps/penghuni/src/routes/kamar.tsx`; unrelated billing/payment formatter errors also exist and were not touched.
3. Existing API process on port 3000 is stale for M16D public endpoints and returns 404; fresh built API on port 3001 passes.
4. Browser route/visual validation was not executed because browser tooling is unavailable in this environment.
5. QA documentation was created after validation; no source feature work was added.

## Safety Summary

- No booking leads implemented.
- No payment booking implemented.
- Payment Gateway source was not modified.
- Smart Lock source was not modified.
- No CSV import/backfill was run.
- No intentional room inventory DB mutation was performed.
- No tenant PII was exposed.
- Public booking was not marked production-ready.

## Final Verdict

PARTIAL. Typecheck, build, API build, fresh API smoke, static route checks, WhatsApp CTA static checks, and public response privacy checks passed. Lint fails and the expected branch is not checked out; browser no-login/visual validation was not executed.
