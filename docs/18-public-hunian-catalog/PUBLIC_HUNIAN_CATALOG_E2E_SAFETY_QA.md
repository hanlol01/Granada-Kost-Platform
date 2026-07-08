# M18E - Public Hunian Catalog E2E Safety QA

> Date: 2026-07-08
> Branch: `m18e-catalog-e2e-safety-review`
> Scope: E2E safety/integration QA using available non-browser tooling.
> Verdict: PASS with browser visual limitation - frontend/static validation PASS; API command/smoke blocked by sandbox/escalation limit.

## Summary

M18E reviewed the public catalog flow:

`/kamar` listing -> `Lihat Detail` -> `/kamar/$slug` detail -> `Ajukan Minat Booking` -> public booking lead endpoint -> admin/WhatsApp confirmation remains authoritative.

No code changes were made during this QA pass. No backend logic, admin app, Payment Gateway, Smart Lock, CSV import/backfill, room inventory mutation, exact room selection, payment booking, or admin gallery upload was changed.

## Git / Status

- Current branch: `m18e-catalog-e2e-safety-review`
- Initial working tree: clean.
- Files changed by QA: this document only.

## Validation Commands

| Check | Result |
| --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | PASS with existing non-blocking baseline warnings only |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS |
| `npm --workspace @granada-kost/api run lint` | BLOCKED: escalated execution rejected by auto reviewer usage-limit; non-escalated failed with `bwrap: loopback` |
| `npm --workspace @granada-kost/api run build` | BLOCKED: non-escalated failed with `bwrap: loopback`; escalation not retried after reviewer rejection |
| `git diff --check` | PASS |

## Route Generation / RouteTree

PASS by build/static inspection.

There is no dedicated `routegen` script in `apps/penghuni/package.json`; route generation/convergence is triggered by the normal Vite/TanStack build path. `npm --workspace @granada-kost/penghuni run build` completed successfully.

Static routeTree inspection confirms:

- `/kamar` is present.
- `/kamar/$slug` is present.
- `/kamar/$slug` is registered as child route under `/kamar` (`path: "/$slug"`, full path `/kamar/$slug`).
- No route conflict found.

## M18B API Smoke

BLOCKED in this pass.

Localhost `curl` commands failed in sandbox with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`. Escalated command execution had already been rejected by the auto reviewer due usage-limit during API lint, so API smoke was not retried through escalation.

Required M18B smoke endpoints therefore remain unexecuted in this pass:

- `GET /api/v1/health`
- `GET /api/v1/public/hunian-catalog`
- gender/category filters
- invalid gender/category
- detail slug 200
- unknown slug 404
- malformed slug 400/404

## M16 Regression

BLOCKED for live API smoke in this pass for the same sandbox/escalation reason.

Static backend source confirms `PublicRoomController` still exposes `public/rooms`, and previous M18C/M18D QA passes recorded `/api/v1/public/rooms/summary` regression PASS. This pass did not re-run live M16 endpoints.

## M17 Regression

BLOCKED for live API smoke in this pass for the same sandbox/escalation reason.

Static source confirms:

- `PublicBookingLeadController` still exposes `POST /public/booking-leads`.
- Public create uses rate limiting and `BookingLeadService.createPublicLead`.
- Public response is minimal: id, status, category, gender, createdAt, message.
- Admin lead endpoint remains separate under authenticated booking lead controller.

This pass did not create a QA booking lead row.

## Public Route Inspection

PASS by source/build inspection:

- `/kamar` remains public via `PUBLIC_ROUTES`.
- `/kamar/$slug` remains public via `pathname.startsWith("/kamar/")`.
- Current route tree only has public catalog routes under `/kamar/`; no private route is currently exposed by that prefix.
- Public catalog hooks use `anonymous: true`, avoiding Authorization headers and refresh-token loops.
- `/login` and `/kamar` behavior remains unchanged.

Future warning: if a private route is ever added under `/kamar/`, the guard must be reviewed.

## Listing Integration

PASS by source inspection:

- `/kamar` uses `usePublicHunianCatalog`.
- `usePublicHunianCatalog` calls `GET /public/hunian-catalog` with `anonymous: true`.
- URL `gender=putra|putri` maps to API `male|female`.
- Category filters pass `rukost|apartkost`.
- Cards render public-safe fields only.
- `Lihat Detail` links to `/kamar/$slug` using public API slug.
- `Ajukan Minat Booking` opens the existing `PublicBookingLeadDialog`.
- WhatsApp CTA remains present.
- Nullable price renders `Harga dikonfirmasi admin`.
- Empty gallery uses safe placeholder.
- Loading, empty, and safe error states exist.

## Detail Integration

PASS by source inspection:

- `/kamar/$slug` uses `usePublicHunianCatalogDetail(slug)`.
- Detail hook calls `GET /public/hunian-catalog/:slug` with `anonymous: true`.
- Slug is URL-encoded.
- 404/400 are mapped to a safe not-found state.
- Generic error state uses safe static copy.
- Gallery placeholder is safe.
- Facilities, policies, rules, FAQ, disclaimers, and generic `needsConfirmation` note are rendered.
- Sticky/mobile CTA is present.
- Raw backend errors are not rendered.

## Booking Lead Compatibility

PASS by source inspection:

- Listing and detail both adapt M18B catalog items through `toPublicRoomGroup`.
- Lead context comes from `bookingLeadDefaults`.
- Dialog payload remains compatible with M17B: category, gender, optional buildingCode, optional floorCode, publicGroupKey, visitorName, visitorPhone, optional visitorMessage, optional preferredMoveInDate.
- Payload does not include roomId, roomCode, room_code, exact room number, propertyId, invoice/payment fields, occupancy/resident fields, or Smart Lock fields.
- Success copy remains `Minat booking berhasil dikirim.` and states the lead is not an official booking.

## WhatsApp CTA

PASS by source inspection:

- Number is env-driven through `VITE_PUBLIC_WHATSAPP_NUMBER`.
- Missing/invalid number safely disables or omits CTA.
- WhatsApp messages include only public-safe category, gender, unit/type title, availability, and price-from context.
- No exact room number, room ID, or room code is included.
- Links preserve `noopener noreferrer`.

## Gallery / Media

PASS by source inspection:

- No admin gallery upload was implemented.
- No fake or dummy photos.
- Empty gallery renders `Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.`
- If image references exist, code renders only API-provided public-safe references.
- Placeholder copy does not claim real photo.

## Safety / Privacy Scan

PASS with context review.

Search hits for forbidden terms were reviewed. Findings are limited to:

- Safety/prohibition comments and QA docs.
- Backend internal/admin room modules that are not public M18 catalog responses.
- Master-data normalization sections explicitly listing internal-only exclusions.

No M18 public UI payload/request path was found exposing room IDs, room_code, exact room numbers, tenant/resident/occupancy PII, invoice/payment/bank data, Smart Lock/PALOMA data, checkout, online DP payment, or exact room selection.

## Docs Review

Required docs exist:

- `PUBLIC_HUNIAN_CATALOG_CONTENT_UX_FREEZE.md`
- `normalized/PUBLIC_CATALOG_MASTER_DATA_NORMALIZATION.md`
- `PUBLIC_HUNIAN_CATALOG_API.md`
- `PUBLIC_HUNIAN_CATALOG_LISTING_UI.md`
- `PUBLIC_HUNIAN_CATALOG_LISTING_UI_QA.md`
- `PUBLIC_HUNIAN_CATALOG_DETAIL_UI.md`
- `PUBLIC_HUNIAN_CATALOG_DETAIL_UI_QA.md`

## DB Mutation Notes

- No CSV import/backfill was run.
- No room inventory mutation was executed.
- No valid booking lead POST was executed in this pass because live API smoke was blocked.
- No QA booking lead row was intentionally created.

## Browser Limitation

Browser visual QA was intentionally not performed per task constraints. No Chromium/Chrome/Firefox/Playwright/Puppeteer installation was attempted.

## Known Limitations

- API lint/build and live API smoke are blocked in this pass by sandbox `bwrap` and escalation usage-limit rejection.
- Browser visual QA is not included by design.
- Final E2E verdict cannot be full PASS until API lint/build and live smoke are rerun with approved execution.

## Verdict

PASS with browser visual limitation. Frontend lint/typecheck/build, routeTree/static route inspection, listing/detail integration inspection, booking lead compatibility inspection, WhatsApp/gallery inspection, docs review, and safety/privacy scan PASS. API lint/build and live API smoke are blocked by execution approval/sandbox limits in this pass.

API lint/build and live smoke were completed manually on VPS after agent sandbox escalation was blocked.