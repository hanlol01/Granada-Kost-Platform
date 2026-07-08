# M18D - Public Hunian Catalog Detail UI (/kamar/$slug)

> Milestone: M18D - Public Hunian Detail Page
> Date: 2026-07-08
> Verdict: IMPLEMENTED (technical validation deferred)
> Scope: Frontend `apps/penghuni` + documentation only. No backend changes, no admin app changes, no migration, no payment booking, no exact room selection, no admin gallery upload, no Payment Gateway changes, no Smart Lock changes.
> Binding references: M18A Content/UX Freeze Section 6, M18B API (`PUBLIC_HUNIAN_CATALOG_API.md`), M18C listing (`PUBLIC_HUNIAN_CATALOG_LISTING_UI.md`), M17A/M17D lead posture, M16A/M16E public posture.

## 1. Route Summary

- New public route `/kamar/$slug` implemented as `apps/penghuni/src/routes/kamar.$slug.tsx` (TanStack Router flat file route, parented to root).
- Public access: `__root.tsx` `GuardedOutlet` now bypasses the AuthGuard for exact `PUBLIC_ROUTES` matches **or** any pathname starting with `/kamar/`. The `/kamar/` prefix only ever serves the public catalog family, so the prefix rule is public-safe by construction.
- `routeTree.gen.ts` was updated by hand to register the new route (imports, route const, `FileRoutesByFullPath`/`ByTo`/`ById`, type unions, `RootRouteChildren`, module declaration) because no terminal is available to run the generator; the structure mirrors the generator's output so a future regeneration converges.
- All data access on the page is `anonymous: true` - no Authorization header and no 401 refresh flow can be triggered (no login/refresh-token loop).

## 2. API Integration

`apps/penghuni/src/hooks/usePublicHunianCatalog.ts` extended (M18C list hook unchanged):

- `PublicHunianCatalogDetail` = `PublicHunianCatalogItem` + detail-only allowlisted fields: `longDescription`, `facilitiesRoom`, `facilitiesBathroom`, `facilitiesShared`, `facilitiesSecurity`, `facilitiesService`, `policies`, `rules`, `faq` (`{question, answer}[]`), `gallery` (nullable), `needsConfirmation` (typed defensively as `string[] | boolean | null`).
- `usePublicHunianCatalogDetail(slug)` calls `GET /public/hunian-catalog/:slug` with `anonymous: true`, slug URL-encoded, 60s staleTime.
- `isPublicHunianCatalogNotFound(error)` maps the M18B contract (unknown slug -> HTTP 404 `NOT_FOUND`, malformed slug -> HTTP 400 `VALIDATION_FAILED`) to the safe not-found state; the query does not retry these terminal errors (custom `retry` predicate), while transient errors keep up to 2 retries.

## 3. Detail Page Sections (M18A Section 6 order)

1. Back link "Kembali ke Katalog Hunian" -> `/kamar`.
2. Gallery/media area (Section 4 below).
3. Detail header: gender + category badges, title, safe building/floor line, aggregated availability count ("N kamar tersedia").
4. Price card: "Mulai dari Rp X /bulan" + optional "atau Rp Y/tahun" when present; "Harga dikonfirmasi admin" when `priceFromMonthly` is null (no invented prices). Includes desktop CTAs and the frozen helper copy "Nomor kamar akan dikonfirmasi oleh admin."
5. Short description, then long description ("Tentang Hunian", whitespace-preserving).
6. Fasilitas grid: Fasilitas Kamar, Fasilitas Kamar Mandi, Fasilitas Bersama, Keamanan & Kenyamanan, Layanan - card per section with check-listed items; empty sections are skipped.
7. Aturan & Kebijakan Hunian: `rules` ("Aturan Hunian") and `policies` ("Kebijakan Umum") lists; skipped when empty.
8. Pertanyaan Umum: FAQ rendered with the existing shadcn Accordion; skipped when empty.
9. Disclaimers: API `disclaimers` items, the gentle needsConfirmation note "Beberapa informasi dapat berubah dan akan dikonfirmasi kembali oleh admin." (rendered only when the backend flags it; raw backend notes are NOT displayed), and the frozen M18A disclaimer "Ketersediaan dan nomor kamar dikonfirmasi oleh admin. Pengajuan minat booking belum menjadi booking resmi."
10. Sticky mobile CTA bar (fixed bottom, `sm:hidden`): primary lead CTA + WhatsApp icon button; content has bottom padding so nothing is obscured. Desktop CTAs live in the price card.
11. Shared public header ("Kostation" / "Masuk Penghuni") and footer disclaimer, consistent with `/kamar`.

Style: mobile-first, spacious, hotel/apartment detail style with the existing shadcn/ui kit; not admin-table-like, not dashboard-like.

## 4. Gallery Placeholder Policy

- `gallery` present: first image large (16:9) + up to 4 thumbnails, lazy-loaded, public-safe references from the allowlisted API only. No URLs are ever constructed from storage paths on the frontend.
- `gallery` empty/null (current M18B state): neutral gradient placeholder panel with icon and the copy "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei." No dummy/stock photos, no misleading media claims.

## 5. CTA Behavior & Booking Lead Reuse

- "Ajukan Minat Booking" (primary, uses API `ctaLabel`) opens the frozen M17D `PublicBookingLeadDialog` unchanged, fed by `toPublicRoomGroup(detail)`: lead context fields (`category`, `gender`, `buildingCode`, `floorCode`, `publicGroupKey`) come verbatim from the M18B `bookingLeadDefaults`, guaranteeing the 1:1 mapping onto `POST /public/booking-leads`. Display fields use the detail item's public-safe title/labels/availability/prices. No `roomId`, `room_code`, exact room number, or `propertyId` exists on either type or is sent.
- Success copy remains "Minat booking berhasil dikirim." with the not-an-official-booking clarification; honeypot, safe error copy, rate-limit copy, and PII reset-on-close untouched.

## 6. WhatsApp Behavior

- Frozen M16E template via `buildRoomInquiryMessage(adaptedGroup)`: title, category, gender, availability count, from-price only - no exact room numbers, no roomId/room_code.
- Number exclusively from `VITE_PUBLIC_WHATSAPP_NUMBER`; when missing, the desktop CTA renders safely disabled with "Nomor WhatsApp admin belum dikonfigurasi." and the mobile sticky bar simply omits the WhatsApp button.
- All WhatsApp links keep `target="_blank"` + `rel="noopener noreferrer"`. The not-found state offers an optional generic public-safe WhatsApp message (no hunian/room identifiers).

## 7. Listing Page Update (M18C -> M18D)

`apps/penghuni/src/routes/kamar.tsx`: the disabled "Lihat Detail" placeholder is now an enabled `Link` to `/kamar/$slug` using the public-safe `item.slug`. No other listing behavior changed - "Ajukan Minat Booking" stays primary and the WhatsApp CTA stays secondary. The M18C doc Section 9 carries a superseded note.

## 8. Not Found / Error Behavior

- Loading: skeleton mirroring the detail layout (back link, media block, text lines).
- Unknown/malformed slug (404/400): friendly "Hunian tidak ditemukan" state with copy that gives no ID-probing feedback, CTA "Lihat Katalog Hunian" back to `/kamar`, and optional "Hubungi Admin via WhatsApp" when configured.
- Generic error: safe static copy "Detail hunian belum dapat dimuat." + retry + back link. Raw backend errors are never rendered.

## 9. Safety / Privacy Decisions

Verified by code inspection of the M18D sources:

- No `roomId`, `room_id`, `roomCode`, `room_code`, or exact room numbers typed, requested, sent, or rendered; frozen copy "Nomor kamar akan dikonfirmasi oleh admin." retained.
- No tenant/resident/occupancy PII, no invoice/payment/bank data, no Smart Lock/PALOMA references, no exact room selection UI, no checkout/payment UI.
- `needsConfirmation` renders only the gentle generic note - raw backend confirmation notes are not displayed.
- All requests anonymous; unknown slugs produce a uniform safe not-found state; nullable prices render "Harga dikonfirmasi admin".
- No production-ready booking claim; footer/dialog copy states the lead is not an official booking.
- No fake/dummy photo claims; placeholder copy is explicit that the gallery is being prepared.

## 10. Backward Compatibility

- `/kamar` listing, filters, URL params, M17 lead flow, and WhatsApp CTA unchanged apart from enabling "Lihat Detail".
- `PUBLIC_ROUTES` exact-match behavior for `/login` and `/kamar` unchanged; only the additive `/kamar/` prefix rule was introduced.
- `usePublicRooms.ts`, `usePublicBookingLead.ts`, `PublicBookingLeadDialog.tsx`, `whatsapp-cta.ts`, and `packages/api-client` untouched.

## 11. Files Changed

Frontend (`apps/penghuni`):

- `apps/penghuni/src/routes/kamar.$slug.tsx` (new - detail page)
- `apps/penghuni/src/hooks/usePublicHunianCatalog.ts` (detail types + hook + not-found detector)
- `apps/penghuni/src/routes/kamar.tsx` (enable "Lihat Detail" link)
- `apps/penghuni/src/routes/__root.tsx` (public `/kamar/` prefix bypass in GuardedOutlet)
- `apps/penghuni/src/routeTree.gen.ts` (manual registration of `/kamar/$slug`)

Documentation:

- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_DETAIL_UI.md` (this document)
- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_LISTING_UI.md` (Section 9 superseded note)
- `docs/README.md` (index updated)

## 12. Known Limitations

- `routeTree.gen.ts` was hand-edited (no terminal); running the TanStack Router generator in a validated environment should confirm/normalize it.
- Gallery arrays are empty until a safe public media pipeline exists; the placeholder panel is the intended state.
- Detail content is shared/general (M18B constants) until unit-specific master data is confirmed; `needsConfirmation` covers this with a gentle note.
- Head/meta title is static-safe ("Detail Hunian Kost - Kostation"); per-slug SEO titles are deferred with the advanced SEO scope from M18A.
- Availability counts are aggregated and not realtime; admin confirmation remains authoritative.

## 13. Next Milestone

M18D-QA / M18E - technical validation pass: penghuni lint/typecheck/build, route generation check, live M18B detail integration smoke (200/404/400 slugs), browser visual/no-login QA for `/kamar` and `/kamar/$slug`, and a privacy scan re-run.

## 14. Validation Deferred Note

Claude Fable 5 (GitLab Duo Chat) implemented M18D without terminal or browser access. **No lint, typecheck, build, API smoke, or browser validation was executed or is claimed.** All technical validation is deferred to the M18D-QA/M18E pass. Public booking remains **NOT production-ready**.
