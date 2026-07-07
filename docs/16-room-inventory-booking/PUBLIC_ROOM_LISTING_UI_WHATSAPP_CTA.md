# M16E - Public Room Listing UI + WhatsApp CTA

> Milestone: M16E - Public Room Listing UI + WhatsApp CTA
> Date: 2026-07-07
> Verdict: PASS (implementation complete; technical validation deferred to M16E-QA)
> Scope: Frontend public listing UI only. No backend changes beyond one additive frontend env schema key. No booking leads, no payment gateway, no Smart Lock, no exact room numbers, no tenant/resident/occupancy data, no new workspace.

## Scope

M16E implements the public room listing page and WhatsApp CTA on top of the M16D public room listing API, following the frozen M16A UX decisions (hero gender filter, aggregated group cards, admin WhatsApp confirmation).

Explicitly not implemented:

- Stored booking leads (M16F).
- Online booking or payment. Payment Gateway is not used for room booking.
- Photo/media management (placeholder-free minimal cards in MVP).
- Separate public marketing app/workspace.
- Exact room numbers or room codes anywhere in the public UI.

## Route / Page Implemented

- **`/kamar`** in `apps/penghuni` (`apps/penghuni/src/routes/kamar.tsx`).
- The route is registered in `PUBLIC_ROUTES` in `apps/penghuni/src/routes/__root.tsx`, so it renders **outside the AuthGuard** and is accessible without login.
- Shareable filter URLs per the M16A freeze: `/kamar?gender=putra`, `/kamar?gender=putri`, optional `&category=rukost|apartkost`. Search params are validated; invalid values are dropped.
- Page structure: header (brand + "Masuk Penghuni" link), hero ("Temukan Kamar Kost yang Sesuai" + subcopy + live availability totals), sticky filter bar (gender Putra/Putri toggle + category Semua/Rumah Kost/Apart Kost), availability card grid, footer disclaimer. No mandatory popup.

## API Consumed

- `GET /api/v1/public/rooms/summary` - hero totals (totalAvailable + per-gender counts).
- `GET /api/v1/public/rooms/availability?gender=&category=` - aggregated group cards. `buildingCode`/`floorCode` are supported by the helper but not exposed as UI filters in MVP.
- `GET /api/v1/public/rooms/groups/:groupKey` - not consumed in MVP (card data is sufficient).

Integration details:

- New hook module `apps/penghuni/src/hooks/usePublicRooms.ts` exposes `getPublicRoomSummary()`, `getPublicRoomAvailability(params)`, `usePublicRoomSummary()`, and `usePublicRoomAvailability(params)`.
- Requests go through the existing shared `ApiClient` (`apps/penghuni/src/lib/api.ts`) with `anonymous: true`, so no Authorization header is attached and no token refresh is attempted on the public page.
- The UI sends `gender=putra|putri` (accepted by the API, which maps putra->male / putri->female backend-side) and `category=rukost|apartkost`.
- Envelope note: `ApiClient` unwraps the top-level `data` key, so the sibling `summary` object of the availability response is intentionally not consumed; the dedicated `/summary` endpoint is used for totals.
- Queries use a 60s staleTime; availability is aggregated and final confirmation is by admin, so counts are not presented as realtime.

## Card Content (public-safe only)

Each card renders: `publicTitle`, `categoryLabel`, `genderLabel`, `buildingName` (fallback `buildingCode`), `floorLabel`, `availableCount` ("N kamar tersedia"), "Mulai {priceFromMonthly}/bulan", "atau {priceFromYearly}/tahun", the WhatsApp CTA, and the secondary text "Nomor kamar akan dikonfirmasi oleh admin."

## WhatsApp CTA Behavior

- Helper module: `apps/penghuni/src/lib/whatsapp-cta.ts`.
- Number source: **`VITE_PUBLIC_WHATSAPP_NUMBER`** (validated env per ADR-FE-006; added additively to `packages/domain/src/env.ts` with default `""`). The number is never hardcoded.
- Normalization: non-digits stripped; leading `0` converted to `62`; values shorter than 8 digits treated as not configured.
- Link: `https://wa.me/{number}?text={encoded message}` opened in a new tab with `rel="noopener noreferrer"`.
- Button label: "Tanya Ketersediaan via WhatsApp".
- Prefilled message template (public-safe fields only):

```
Halo Admin Kostation, saya tertarik booking kamar:
- Kategori: {categoryLabel}
- Untuk: {genderLabel}
- Unit/Tipe: {publicTitle}
- Ketersediaan: {availableCount} kamar
- Harga mulai: {price}/bulan
Mohon info ketersediaan dan proses bookingnya.
```

- **Missing env handling**: when `VITE_PUBLIC_WHATSAPP_NUMBER` is empty or unusable, no wa.me URL is generated; each card shows a disabled CTA button plus the text "Nomor WhatsApp admin belum dikonfigurasi.", and a page-level notice suggests contacting the admin directly.

## Empty / Loading / Error States

- Loading: 6-card skeleton grid.
- Empty: "Belum ada kamar tersedia untuk filter ini." via the shared `EmptyState` component.
- Error: "Data kamar belum dapat dimuat. Silakan coba lagi atau hubungi admin." with a retry button (react-query `refetch`). No internal error details are surfaced.

## Privacy / Safety Rules

- Only allowlisted aggregated fields from the M16D API are rendered.
- No room IDs, no `room_code`, no exact room numbers, no tenant/resident/occupancy data, no import notes, no Smart Lock or Payment Gateway data.
- Gender/category filtering is enforced backend-side; the UI filters are UX-only.
- Public booking remains **not production-ready**; booking confirmation remains through WhatsApp/admin; footer states no online payment for booking.

## Why `apps/penghuni` `/kamar` for MVP

- Confirmed MVP decision: no new workspace in this milestone. `apps/penghuni` already has the shared shadcn/ui kit, validated env, the shared `ApiClient` with anonymous request support, and a public-route mechanism (`PUBLIC_ROUTES`, previously used only by `/login`), making it the lowest-risk host for an unauthenticated page. A dedicated public/marketing surface can be split out later without redesign (freeze open question 20.7).

## Files Changed

Frontend (apps/penghuni):

- `apps/penghuni/src/routes/kamar.tsx` (new - public page)
- `apps/penghuni/src/routes/__root.tsx` (add `/kamar` to `PUBLIC_ROUTES`)
- `apps/penghuni/src/hooks/usePublicRooms.ts` (new - anonymous API hooks)
- `apps/penghuni/src/lib/whatsapp-cta.ts` (new - WhatsApp helpers)
- `apps/penghuni/src/routeTree.gen.ts` (route registration - see implementation note)

Shared packages:

- `packages/domain/src/env.ts` (additive: `VITE_PUBLIC_WHATSAPP_NUMBER` with default `""`)

Documentation:

- `docs/16-room-inventory-booking/PUBLIC_ROOM_LISTING_UI_WHATSAPP_CTA.md`
- `docs/README.md`

## Implementation Notes

- `routeTree.gen.ts` is normally generated by the TanStack Router plugin. It was updated manually in this change because no terminal was available; the next `dev`/`build` run will regenerate it from the route files and should produce an equivalent tree. If the generated output differs cosmetically, the regenerated file wins.
- `VITE_PUBLIC_WHATSAPP_NUMBER` was added to the shared frontend env schema (ADR-FE-006 validated env) instead of reading `import.meta.env` ad hoc, keeping env handling consistent. The default is an empty string so a missing value safely produces the disabled CTA state.
- The existing `VITE_ADMIN_WHATSAPP_PHONE` (used by the file-upload WhatsApp fallback) is intentionally not reused: the public CTA is a distinct, publicly advertised contact channel and must be configurable independently.

## Deferred

- Stored booking leads + admin lead management (M16F).
- Room photos/media, facility chips catalog, FAQ content section (later phase; MVP keeps cards minimal and safe).
- Group detail page using `/public/rooms/groups/:groupKey`.
- SEO landing pages per category/gender and separate public marketing app/domain.
- Online booking/payment (separate gated track; Payment Gateway status unchanged).

## Validation Deferred Note

Claude Fable 5 did not run lint/build/browser/API validation. Validation is deferred to M16E-QA Codex.

## Verdict

PASS - implementation complete per confirmed MVP decisions. Public route `/kamar` renders aggregated, PII-safe availability with gender/category hero filters and a WhatsApp CTA driven by `VITE_PUBLIC_WHATSAPP_NUMBER` with safe missing-env fallback. Technical validation (lint, typecheck, build, browser smoke, API smoke) is deferred to M16E-QA.
