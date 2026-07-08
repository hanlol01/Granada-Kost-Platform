# M18C - Public Hunian Catalog Listing UI (Modern /kamar Refresh)

> Milestone: M18C - Modern Public /kamar Listing UI Refresh
> Date: 2026-07-08
> Verdict: IMPLEMENTED (technical validation deferred)
> Scope: Frontend `apps/penghuni` + documentation only. No backend changes, no admin app changes, no migration, no detail page implementation, no payment booking, no exact room selection, no admin gallery upload, no Payment Gateway changes, no Smart Lock changes.
> Binding references: M18A Content/UX Freeze (`PUBLIC_HUNIAN_CATALOG_CONTENT_UX_FREEZE.md`), M18A-1 Normalization (`normalized/PUBLIC_CATALOG_MASTER_DATA_NORMALIZATION.md`), M18B API (`PUBLIC_HUNIAN_CATALOG_API.md`), M17A/M17D lead posture, M16A/M16E public listing posture.

## 1. Summary

M18C refreshes the unauthenticated public `/kamar` page from the M16E aggregated-availability card list into a modern, mobile-first, hotel/apartment-style hunian catalog driven by the M18B list endpoint `GET /api/v1/public/hunian-catalog`. The M17D "Ajukan Minat Booking" lead dialog and the frozen M16E WhatsApp CTA behavior are reused unchanged via a public-safe adapter. Public booking posture is unchanged: a lead is NOT a confirmed booking, admin/WhatsApp confirmation remains authoritative, and there is no online payment, exact room selection, or auto reservation.

## 2. UI Summary

- Hero: refreshed headline ("Temukan Hunian Kost yang Tepat untuk Anda"), subcopy introducing the Granada Student House Jatinangor catalog on Kostation, live availability totals (existing M16D `/public/rooms/summary`), and the frozen safe copy pill: "Pengajuan minat belum menjadi booking resmi. Ketersediaan dan nomor kamar dikonfirmasi oleh admin."
- Hero highlight chips come ONLY from M18A-1 public-safe normalized content: Fully furnished, AC per kamar, Kamar mandi dalam + air panas, WiFi, Keamanan terjaga. Claims still under `needsConfirmation` ("dekat ITB & UNPAD", "keamanan 24 jam") are NOT rendered.
- Sticky filter bar with rounded chip buttons: gender Semua/Putra/Putri and category Semua/Rumah Kost/Apart Kost; URL params (`?gender=`, `?category=`) preserved and shareable, identical to M16E.
- Modern catalog cards with gallery/media area, floating gender + category badges, short description, facility badges, availability indicator, price hierarchy, and a clear CTA stack.
- Complete states: skeleton grid matching the new card shape (media block + text lines), safe retryable error state ("Katalog hunian belum dapat dimuat." - no raw backend errors), friendly empty state per filter.
- Footer disclaimer retained and extended: admin confirmation via WhatsApp, no online payment for booking, lead is not an official booking.
- Built exclusively with the existing shadcn/ui kit in `apps/penghuni`; not admin-table-like, not dashboard-like.

## 3. API Integration

New hook module `apps/penghuni/src/hooks/usePublicHunianCatalog.ts`:

- `usePublicHunianCatalog({ gender?, category? })` calls `GET /public/hunian-catalog` with `anonymous: true` (no Authorization header, no 401 refresh flow) and 60s staleTime, mirroring the M16E hook posture.
- UI URL params stay `putra`/`putri` (M16E backward compatibility) and are mapped to the M18B API values `male`/`female` at the query layer; `category` passes through as `rukost`/`apartkost`.
- `PublicHunianCatalogItem` types exactly the allowlisted M18B list contract: `slug`, `title`, `category`/`categoryLabel`, `gender`/`genderLabel`, nullable `buildingCode`/`buildingName`/`floorCode`/`floorLabel`, `publicGroupKey`, `shortDescription`, nullable `priceFromMonthly`/`priceFromYearly`, `availabilityCount`, `facilitiesPreview`, `galleryPreview` (nullable/empty), `ctaLabel`, `bookingLeadDefaults`, `disclaimers`.
- The ApiClient unwraps the top-level `data` envelope, so the M18B sibling `summary` object is not consumed; hero totals keep using the existing M16D `/public/rooms/summary` hook (`usePublicRoomSummary`), which remains valid and unchanged.
- `toPublicRoomGroup(item)` adapter converts a catalog item to the frozen M16E `PublicRoomGroup` shape so the M17D dialog and M16E WhatsApp templates are reused without modification (see Sections 6-7).

## 4. Filters

| Filter | Options | API param |
| --- | --- | --- |
| Gender | Semua / Putra / Putri | `gender=male|female` (omitted for Semua) |
| Category | Semua / Rumah Kost / Apart Kost | `category=rukost|apartkost` (omitted for Semua) |

Filter changes update the URL search params (replace navigation, shareable links) and re-query the M18B endpoint via the React Query key. Loading keeps the polished skeleton grid; empty and error states use safe copy only.

## 5. Catalog Card Fields

Each card renders only allowlisted public-safe fields:

- Gallery/media area (see Section 8) with floating gender + category badges
- `title` and safe location line (`buildingName`/`buildingCode` + `floorLabel` when present)
- `shortDescription` (2-line clamp)
- Up to 5 facility badges from `facilitiesPreview`
- Price: when `priceFromMonthly` exists -> "Mulai dari Rp X /bulan" with optional "atau Rp Y/tahun"; when null -> "Harga dikonfirmasi admin" (no invented prices)
- Availability indicator: "N kamar tersedia" (aggregated, not realtime)
- First `disclaimers` entry when the API provides one
- CTA stack: "Ajukan Minat Booking" (primary, uses API `ctaLabel`), "Lihat Detail" (disabled placeholder, Section 9), "WhatsApp" (secondary)
- Frozen helper copy: "Nomor kamar akan dikonfirmasi oleh admin."

## 6. Booking Lead Dialog Reuse

The frozen M17D `PublicBookingLeadDialog` is reused with zero changes. The card passes `toPublicRoomGroup(item)`, whose lead-context fields (`category`, `gender`, `buildingCode`, `floorCode`, `publicGroupKey` -> `groupKey`) are taken verbatim from the M18B `bookingLeadDefaults`, guaranteeing the 1:1 mapping onto the M17B `POST /public/booking-leads` payload. Display fields (`publicTitle`, labels, `availableCount`, prices) come from the catalog item. No `roomId`, `room_code`, exact room number, or `propertyId` exists on either type or is sent. Success copy remains "Minat booking berhasil dikirim." with the not-an-official-booking clarification, honeypot, safe error copy, rate-limit copy, and PII reset-on-close all unchanged.

## 7. WhatsApp CTA

Behavior and templates are unchanged from M16E/M17D: `buildRoomInquiryMessage` (card CTA) and `buildLeadFollowUpMessage` (post-lead follow-up inside the dialog) consume only public-safe aggregated fields from the adapted group (category/gender labels, title, availability count, from-price). The number still comes exclusively from `VITE_PUBLIC_WHATSAPP_NUMBER`; when missing, the CTA renders safely disabled with the copy "Nomor WhatsApp admin belum dikonfigurasi." Links keep `target="_blank"` + `rel="noopener noreferrer"`. CTA hierarchy per the M18A freeze: lead form primary, WhatsApp secondary (WhatsApp remains the operational confirmation channel).

## 8. Gallery Placeholder Policy

`galleryPreview` is empty/nullable per the M18B gallery policy. The card media area renders:

- When `galleryPreview` has entries: the first public-safe image reference from the allowlisted API (lazy-loaded, object-cover). No URLs are ever constructed from storage paths on the frontend.
- When empty/null: a neutral gradient placeholder panel with an image icon and the copy "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei." No dummy/stock photos and no misleading media claims.

The component accepts real media without redesign once the safe media pipeline ships in a later milestone.

## 9. "Lihat Detail" Decision (M18D Preparation)

Decision: the `/kamar/$slug` detail page is deferred to M18D and **no placeholder route was added** in M18C (adding a stub route was evaluated and rejected per the task guidance to avoid expanding scope and touching `routeTree.gen.ts` / `PUBLIC_ROUTES` prematurely). Each card renders a **disabled "Lihat Detail" button** with a tooltip ("Halaman detail hunian hadir dalam pembaruan berikutnya.") so the frozen M18A card CTA structure is visually in place. M18D will: add the public route `/kamar/$slug` (outside AuthGuard, registered in `PUBLIC_ROUTES`), consume `GET /public/hunian-catalog/:slug` (a detail hook can extend `usePublicHunianCatalog.ts`), and convert the disabled button into a `Link` using the already-available `item.slug`. Unknown slugs must render a safe not-found state linking back to `/kamar`.

## 10. Safety / Privacy Decisions

Verified by code inspection of the M18C sources:

- No `roomId`, `room_id`, `roomCode`, `room_code`, or exact room numbers are typed, requested, sent, or rendered anywhere; the frozen copy "Nomor kamar akan dikonfirmasi oleh admin." is retained on cards and in the dialog.
- No tenant/resident/occupancy PII, no payment/invoice data, no bank account data, no Smart Lock/PALOMA references.
- All catalog requests use `anonymous: true` (no Authorization header, no refresh-token loop on the public page).
- Nullable prices render "Harga dikonfirmasi admin" - no invented prices.
- Error/empty states use safe static copy only; raw backend errors are never rendered.
- Hero highlights render only owner-safe normalized claims; `needsConfirmation` claims (ITB/UNPAD proximity, 24-hour security wording) are excluded.
- No production-ready booking claim anywhere; the footer and hero state the lead is not an official booking and there is no online payment for booking.
- Gallery placeholder makes no fake photo claims.

## 11. Backward Compatibility

- `/kamar` stays a public route; `__root.tsx` / `PUBLIC_ROUTES` / AuthGuard bypass untouched; `routeTree.gen.ts` untouched (no route added or removed).
- URL filter params (`?gender=putra|putri`, `?category=rukost|apartkost`) unchanged - existing shared links keep working.
- `usePublicRooms.ts`, `whatsapp-cta.ts`, and `PublicBookingLeadDialog.tsx` unchanged; `usePublicRoomSummary` still powers hero totals; the M16D availability hooks remain available.
- M17 lead flow and WhatsApp CTA behavior preserved end to end.

## 12. Files Changed

Frontend (`apps/penghuni`):

- `apps/penghuni/src/hooks/usePublicHunianCatalog.ts` (new - M18B list hook, types, adapter)
- `apps/penghuni/src/routes/kamar.tsx` (refreshed listing UI on the M18B catalog endpoint)

Documentation:

- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_LISTING_UI.md` (this document)
- `docs/README.md` (index updated)

Explicitly unchanged: backend, admin app, `packages/api-client`, `usePublicRooms.ts`, `usePublicBookingLead.ts`, `PublicBookingLeadDialog.tsx`, `whatsapp-cta.ts`, `routeTree.gen.ts`, `__root.tsx`.

## 13. Known Limitations

- "Lihat Detail" is a disabled placeholder until M18D ships `/kamar/$slug`.
- Gallery arrays are empty until a safe public media pipeline exists; the placeholder panel is the intended state.
- Catalog descriptions/facilities are shared/general (M18B constants) until unit-specific master data is confirmed.
- The M18B list `summary` sibling is not consumed (ApiClient envelope unwrapping); hero totals rely on the M16D summary endpoint.
- Availability counts are aggregated and not realtime; admin confirmation remains authoritative.

## 14. Next Milestone

M18D - public hunian detail page `/kamar/$slug` consuming `GET /api/v1/public/hunian-catalog/:slug` (gallery, long description, facilities sections, rules/policies, FAQ, sticky CTAs, safe not-found state), converting the disabled "Lihat Detail" into a real link.

## 15. Validation Deferred Note

Claude Fable 5 (GitLab Duo Chat) implemented M18C without terminal or browser access. **No lint, typecheck, build, API smoke, or browser validation was executed or is claimed.** Technical validation (penghuni lint/typecheck/build, live M18B integration smoke, browser visual/no-login QA, privacy scan re-run) is deferred to the M18C-QA pass. Public booking remains **NOT production-ready**.
