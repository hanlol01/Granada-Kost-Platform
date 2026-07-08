# M18C-QA - Modern /kamar Listing UI Validation

> Date: 2026-07-08
> Branch: `m18c-modern-kamar-listing-ui`
> Scope: QA validation + tiny formatting cleanup only.
> Verdict: PASS with browser visual limitation.

## Summary

M18C modern public `/kamar` listing UI was validated against the M18B public hunian catalog API, M16 public room summary regression, M17 booking lead reuse posture, WhatsApp CTA safety, and public privacy boundaries.

Two Prettier-only lint blockers were fixed in:

- `apps/penghuni/src/hooks/usePublicHunianCatalog.ts`
- `apps/penghuni/src/routes/kamar.tsx`

No business logic, backend behavior, admin app, Payment Gateway, Smart Lock, booking lead semantics, public exact-room selection, DB data, or import/backfill flow was changed.

## Git / Status

- Current branch: `m18c-modern-kamar-listing-ui`
- Prompt reference branch: `m18c-public-hunian-catalog-listing-ui`
- Initial working tree: clean.
- Files changed by QA: two targeted Prettier formatting fixes plus this QA document.

## Validation Commands

| Check | Result |
| --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | PASS with existing non-blocking baseline warnings only |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| `git diff --check` | PASS |

Penghuni lint initially failed on two Prettier formatting errors in the M18C hook/listing files. Targeted `npx prettier --write apps/penghuni/src/hooks/usePublicHunianCatalog.ts apps/penghuni/src/routes/kamar.tsx` resolved those errors. Remaining lint output is the known existing warning baseline (`react-refresh/only-export-components`, unused eslint-disable, and one complaints hook dependency warning).

## API Smoke

The already-running API on port 3000 was healthy but returned 404 for M18B catalog routes, indicating a stale/non-M18B process. A fresh current build was started temporarily on `http://127.0.0.1:3001/api/v1`; startup logs confirmed `PublicHunianCatalogController` routes were mapped.

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/health` | 200 |
| `GET /api/v1/public/hunian-catalog` | 200 |
| `GET /api/v1/public/hunian-catalog?gender=male` | 200 |
| `GET /api/v1/public/hunian-catalog?gender=female` | 200 |
| `GET /api/v1/public/hunian-catalog?category=rukost` | 200 |
| `GET /api/v1/public/hunian-catalog?category=apartkost` | 200 |
| `GET /api/v1/public/hunian-catalog?gender=random` | 400 |
| `GET /api/v1/public/hunian-catalog?category=random` | 400 |
| `GET /api/v1/public/hunian-catalog/apartkost-putri-unit-05a-lantai-b` | 200 |
| `GET /api/v1/public/rooms/summary` | 200 |

Smoke artifact paths:

- `/tmp/m18c-catalog-all.json`
- `/tmp/m18c-catalog-detail.json`
- `/tmp/m18c-rooms-summary.json`

## Public Route Result

Static inspection PASS:

- `/kamar` route exists in `apps/penghuni/src/routes/kamar.tsx`.
- `routeTree.gen.ts` contains `/kamar`.
- `PUBLIC_ROUTES` in `apps/penghuni/src/routes/__root.tsx` includes `/kamar`.
- `GuardedOutlet` bypasses `AuthGuard` for `/kamar`.
- `usePublicHunianCatalog` calls the API with `anonymous: true`, avoiding Authorization headers and refresh-token loops.
- URL params remain compatible: `gender=putra|putri` map to API `male|female`; `category=rukost|apartkost` passes through.

## UI Behavior Result

Static inspection PASS:

- Modern hero exists with headline `Temukan Hunian Kost yang Tepat untuk Anda`.
- Existing M16 `usePublicRoomSummary` still powers availability totals.
- Gender and category filters are present.
- Loading skeleton grid, empty state, and safe retryable error state are present.
- Cards render title, category/gender badges, short description, aggregated availability, nullable-safe price hierarchy, facility badges, gallery/media placeholder, Ajukan Minat Booking CTA, WhatsApp CTA, and disabled `Lihat Detail` placeholder.
- Footer states booking is confirmed by admin via WhatsApp, online booking payment is unavailable, and a lead is not an official booking.

## API Integration Result

PASS:

- `usePublicHunianCatalog` calls `GET /public/hunian-catalog`.
- Requests use `anonymous: true`.
- Query params are limited to `gender` and `category`.
- Public type mirrors the M18B allowlist.
- Nullable price renders as `Harga dikonfirmasi admin`.
- No `roomId`, `roomCode`, `room_code`, exact room number, tenant/resident/occupancy PII, payment/invoice, bank, or Smart Lock fields are requested or rendered by the UI.

## Booking Lead Reuse Result

PASS:

- `PublicBookingLeadDialog` remains reused through the `toPublicRoomGroup` adapter.
- Lead context comes from `bookingLeadDefaults`.
- Payload remains public-safe aggregated context only: category, gender, optional buildingCode, optional floorCode, publicGroupKey, visitor name/phone/message/move-in date.
- No room ID, room code, exact room number, propertyId, payment, invoice, occupancy/resident, or Smart Lock fields are sent.
- Success copy still clarifies that the lead is not an official booking.

## WhatsApp CTA Result

PASS:

- WhatsApp destination remains env-driven through `VITE_PUBLIC_WHATSAPP_NUMBER`.
- Missing/invalid env safely disables CTA; no invalid `wa.me` URL is generated.
- Links keep `target="_blank"` and `rel="noopener noreferrer"`.
- Message template uses public-safe category, gender, unit/type title, availability, and price-from fields only.
- No exact room number, room ID, or room code is included.

## Gallery Placeholder Result

PASS:

- No dummy/misleading photos are rendered.
- Empty/null `galleryPreview` renders the safe placeholder copy: `Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.`
- Existing code would render only allowlisted `galleryPreview` entries when present.
- Admin gallery upload was not implemented.

## Safety / Privacy Scan

PASS:

- API response scan found no forbidden tokens: `roomId`, `room_id`, `roomCode`, `room_code`, `resident`, `tenant`, `occupancy`, `invoice`, `paymentStatus`, `bank`, `rekening`, `smartLock`, `PALOMA`, `BSI 7318321153`.
- Frontend/docs scan found forbidden strings only in prohibition comments/docs, not as UI output or API payload fields.
- No tenant/resident/occupancy PII exposure.
- No Payment Gateway or Smart Lock data exposure.
- Public booking remains NOT production-ready.

## Browser Limitation

Browser visual QA was not executed because Chromium/Chrome/Firefox binaries were not available in PATH and no Playwright/Puppeteer dependency was present in the manifests. No browser tooling was installed.

Validation therefore relies on lint/typecheck/build, static route/code inspection, and live API smoke.

## Known Limitations

- Browser visual/no-login smoke is blocked by unavailable browser tooling.
- Port 3000 API process appeared stale for M18B catalog routes; fresh current build on port 3001 passed.
- `/kamar/$slug` detail page is intentionally deferred to M18D; `Lihat Detail` remains disabled/soon.
- Gallery data is currently empty and uses the intended safe placeholder.

## Verdict

PASS with browser visual limitation. M18C is validated for static build quality, public route safety, M18B API integration, M17 lead reuse, WhatsApp CTA safety, gallery placeholder behavior, and privacy boundaries.
