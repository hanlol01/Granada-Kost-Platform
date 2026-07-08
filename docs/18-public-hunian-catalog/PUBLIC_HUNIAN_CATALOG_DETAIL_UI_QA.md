# M18D-QA - Public Hunian Detail Page Validation

> Date: 2026-07-08
> Branch: `m18d-qa-detail-page-validation`
> Scope: QA validation + tiny formatting/routeTree convergence cleanup only.
> Verdict: PASS with browser visual limitation.

## Summary

M18D public hunian detail page `/kamar/$slug` was validated against frontend static checks, TanStack route tree convergence, fresh M18B API smoke, M16/M17 regressions, booking lead reuse, WhatsApp CTA safety, gallery placeholder behavior, and privacy boundaries.

QA changed only:

- Prettier formatting in `apps/penghuni/src/hooks/usePublicHunianCatalog.ts`
- Prettier formatting in `apps/penghuni/src/routes/kamar.$slug.tsx`
- Generated route tree convergence in `apps/penghuni/src/routeTree.gen.ts`
- This QA document

No backend logic, admin app, Payment Gateway, Smart Lock, DB data, CSV import/backfill, payment booking, exact room selection, admin gallery upload, or public booking production posture was changed.

## Git / Status

- Current branch: `m18d-qa-detail-page-validation`
- Prompt reference branch: `m18d-public-hunian-detail-page`
- Initial working tree: clean.
- Browser visual QA: blocked by unavailable browser tooling.

## Validation Commands

| Check | Result |
| --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | PASS with existing non-blocking baseline warnings only |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| `git diff --check` | PASS |

Penghuni lint initially failed only on Prettier formatting in the M18D hook/detail files. Targeted `npx prettier --write apps/penghuni/src/hooks/usePublicHunianCatalog.ts apps/penghuni/src/routes/kamar.$slug.tsx` resolved those errors. Remaining lint output is the existing warning baseline.

## Route Generation / RouteTree

PASS.

There is no dedicated `routegen` npm script in `apps/penghuni/package.json`. TanStack route generation/convergence is triggered by the normal Vite/TanStack build path. Running `npm --workspace @granada-kost/penghuni run build` updated `apps/penghuni/src/routeTree.gen.ts`.

The convergence changed the hand-edited route from a root child with `path: "/kamar/$slug"` into the generated nested form:

- `/kamar` is represented as `KamarRouteWithChildren`.
- `/kamar/$slug` is a child of `/kamar`.
- The child route path is `/$slug`.
- Full path remains `/kamar/$slug`.

Build and typecheck both PASS after this routeTree convergence. `/kamar` and `/kamar/$slug` are both valid routes with no routeTree conflict.

## API Smoke

A fresh current API build was started temporarily on `http://127.0.0.1:3001/api/v1`; startup logs confirmed `PublicHunianCatalogController` routes were mapped.

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/health` | 200 |
| `GET /api/v1/public/hunian-catalog` | 200 |
| `GET /api/v1/public/hunian-catalog/apartkost-putri-unit-05a-lantai-b` | 200 |
| `GET /api/v1/public/hunian-catalog/unknown-slug-for-qa` | 404 |
| `GET /api/v1/public/hunian-catalog/BAD_SLUG_FOR_QA` | 400 |
| `GET /api/v1/public/rooms/summary` | 200 |
| `POST /api/v1/public/booking-leads` with `{}` | 400 |

Smoke artifacts:

- `/tmp/m18d-catalog-all.json`
- `/tmp/m18d-catalog-detail.json`
- `/tmp/m18d-unknown-slug.json`
- `/tmp/m18d-malformed-slug.json`
- `/tmp/m18d-rooms-summary.json`
- `/tmp/m18d-booking-lead-invalid.json`

## Public Route Result

Static inspection PASS:

- `/kamar` remains public via `PUBLIC_ROUTES`.
- `/kamar/$slug` exists as `apps/penghuni/src/routes/kamar.$slug.tsx`.
- `GuardedOutlet` bypasses `AuthGuard` for exact public routes and `pathname.startsWith("/kamar/")`.
- Current route tree only has the public catalog family under `/kamar`, so the prefix bypass does not currently expose unrelated private routes.
- Both list and detail hooks use `anonymous: true`, avoiding Authorization headers and refresh-token loops.
- `/login` and `/kamar` public behavior remains unchanged.

## Listing Page Result

PASS:

- `Lihat Detail` is now enabled.
- Link target is `to="/kamar/$slug"` with `params={{ slug: item.slug }}`.
- Slug comes from the public API item.
- `Ajukan Minat Booking` remains the primary CTA.
- WhatsApp CTA remains present and env-driven.
- Existing gender/category filters remain compatible.

Known minor drift: an old top-of-file comment in `kamar.tsx` still describes the M18C disabled placeholder decision, while runtime behavior is correctly updated.

## Detail UI Result

Static inspection PASS:

- Back link to `/kamar` exists.
- Gallery area exists and renders the safe placeholder when gallery is empty.
- Title, category/gender badges, public-safe building/floor line, availability count, short description, and long description are rendered.
- Price renders `Mulai dari...` when present and `Harga dikonfirmasi admin` when null.
- Facility sections cover kamar, kamar mandi, fasilitas bersama, keamanan/kenyamanan, and layanan; empty sections are skipped.
- Rules, policies, FAQ accordion, API disclaimers, frozen disclaimer, and generic needsConfirmation note are rendered safely.
- Sticky mobile CTA exists.
- Loading skeleton, safe not-found state, and generic safe error state exist.
- Raw backend errors are not displayed.

## Detail API Integration Result

PASS:

- `usePublicHunianCatalogDetail(slug)` calls `GET /public/hunian-catalog/:slug`.
- Slug is URL-encoded with `encodeURIComponent`.
- Request uses `anonymous: true`.
- 404 and 400 are mapped to safe not-found behavior and are not retried.
- Transient errors retry up to 2 attempts.
- Response type mirrors the M18B public allowlist.
- No internal fields are expected or rendered.

## Booking Lead Reuse Result

PASS:

- Detail page reuses `PublicBookingLeadDialog`.
- Detail data is adapted through `toPublicRoomGroup(detail)`.
- Lead context comes from `bookingLeadDefaults`.
- Payload remains public-safe aggregated context only: category, gender, optional buildingCode, optional floorCode, publicGroupKey, visitor name/phone/message/move-in date.
- No room ID, room code, exact room number, propertyId, payment, invoice, occupancy/resident, or Smart Lock fields are sent.
- Success copy remains `Minat booking berhasil dikirim.` and still clarifies the lead is not an official booking.

## WhatsApp CTA Result

PASS:

- WhatsApp destination remains env-driven through `VITE_PUBLIC_WHATSAPP_NUMBER`.
- Missing/invalid env safely disables or omits the CTA.
- Links keep `target="_blank"` and `rel="noopener noreferrer"`.
- Inquiry message uses public-safe title, category, gender, availability, and price-from fields only.
- Not-found WhatsApp message is generic and safe.
- No exact room number, room ID, or room code is included.

## Gallery Placeholder Result

PASS:

- No dummy or misleading photos are rendered.
- Empty/null gallery renders: `Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.`
- Existing gallery rendering uses only API-provided safe references and lazy-loaded images.
- Admin gallery upload was not implemented.

## Safety / Privacy Scan

PASS:

- API response scan found no forbidden tokens: `roomId`, `room_id`, `roomCode`, `room_code`, `resident`, `tenant`, `occupancy`, `invoice`, `paymentStatus`, `bank`, `rekening`, `smartLock`, `PALOMA`, `BSI 7318321153`, `checkout`, `bayar sekarang`.
- Frontend/docs scan found forbidden strings only in prohibition comments/docs, not as UI output, request fields, or payload fields.
- No tenant/resident/occupancy PII exposure.
- No Payment Gateway or Smart Lock data exposure.
- No exact room selection, checkout, or booking payment UI.
- Public booking remains NOT production-ready.

## Browser Limitation

Browser visual QA was not executed because Chromium/Chrome/Firefox binaries were not available in PATH and no Playwright/Puppeteer dependency was present in the manifests. No browser tooling was installed.

Validation therefore relies on lint/typecheck/build, routeTree convergence, static route/code inspection, live API smoke, and privacy scans.

## Known Limitations

- Browser visual/no-login smoke is blocked by unavailable browser tooling.
- `GuardedOutlet` uses a broad `/kamar/` prefix bypass. It is safe in the current route tree because only `/kamar/$slug` exists under that prefix, but future private routes must not be added under `/kamar/` without revisiting the guard.
- Listing file and M18C docs still contain some superseded M18C placeholder wording, while runtime behavior is correctly enabled for M18D.
- Gallery data is currently empty and uses the intended safe placeholder.

## Verdict

PASS with browser visual limitation. M18D is validated for static build quality, routeTree convergence, public route safety, M18B detail API integration, M17 lead reuse, WhatsApp CTA safety, gallery placeholder behavior, and privacy boundaries.
