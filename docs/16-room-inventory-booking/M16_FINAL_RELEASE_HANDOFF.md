# M16 - Final Release / Handoff (Room Inventory & Public Booking MVP)

> Milestone: M16F - Final Docs / Release Update / Handoff
> Date: 2026-07-07
> Scope: Documentation/release update only. No backend code changes, no frontend code changes, no database migration, no CSV import/backfill, no Payment Gateway changes, no Smart Lock changes, no booking leads implementation.
> Binding statement: **Public booking is NOT production-ready.**

## 1. Milestone Summary (M16 track)

| Milestone | Scope | Status / Verdict | Document |
| --- | --- | --- | --- |
| M16A-0 | Room Master Data Cleanup / Normalization | PASS | `docs/05-master-data/room-master/ROOM_MASTER_IMPORT_NOTES.md` |
| M16A | Architecture / UX Freeze | PASS (frozen, binding) | `ROOM_INVENTORY_PUBLIC_BOOKING_ARCHITECTURE_FREEZE.md` |
| M16B | Backend schema + staging backfill | PASS (backfill PARTIAL overall accepted) | `BACKEND_ROOM_MODEL_MIGRATION_DESIGN.md`, `ADDITIVE_MIGRATION_IMPLEMENTATION.md`, `CSV_VALIDATOR_DRY_RUN_IMPLEMENTATION.md`, `IMPORT_APPLY_GUARD_IMPLEMENTATION.md`, `STAGING_BACKFILL_EXECUTION.md` |
| M16C | Admin Room Management Redesign | PASS; M16C-QA **PARTIAL accepted** | `ADMIN_ROOM_MANAGEMENT_REDESIGN.md`, `ADMIN_ROOM_MANAGEMENT_BROWSER_QA.md` |
| M16D | Public Room Listing API | PASS (validated) | `PUBLIC_ROOM_LISTING_API.md` |
| M16E | Public Room Listing UI + WhatsApp CTA | Implemented; validation **partial accepted** | `PUBLIC_ROOM_LISTING_UI_WHATSAPP_CTA.md` |
| M16F | Final Docs / Release Update / Handoff | This document | `M16_FINAL_RELEASE_HANDOFF.md` |

### M16A-0 - Room Master Data Cleanup / Normalization

- 163 total rooms: RuKost 123, ApartKost 40.
- Gender: male/Putra 99, female/Putri 64.
- Tenant PII masked/omitted in all normalized files.
- Stale RuKost gender summary from the older mapping corrected; M16A-0 normalized data is canonical.

### M16A - Architecture / UX Freeze

- Public listing strategy frozen: aggregated group-level availability, hero gender filter, no exact room numbers.
- Gender/category filtering enforced backend-side (frontend filters are UX-only).
- Public MVP uses **WhatsApp admin confirmation**; **no payment booking in MVP**.

### M16B - Backend Schema + Staging Backfill

- `room_buildings` table added; `rooms` extended additively (nullable-first).
- 26 `room_buildings` inserted; 163 rooms backfilled **in place**.
- Room IDs preserved; all occupancy/invoice/complaint FKs intact.
- No resident/occupancy mutation.

### M16C - Admin Room Management Redesign

- Admin `/rooms` redesigned with in-page tabs: Ringkasan, Rumah Kost, Apart Kost, Ketersediaan.
- New inventory fields exposed to admin additively (roomCode, category, building, floor, publicVisible, yearlyPrice) with legacy keys preserved.
- M16C-QA verdict **PARTIAL accepted**: API/lint/typecheck/build checks passed; browser visual smoke blocked because no browser tooling was available on the VPS.

### M16D - Public Room Listing API

- `GET /api/v1/public/rooms/summary`
- `GET /api/v1/public/rooms/availability` (filters: gender, category, buildingCode, floorCode)
- `GET /api/v1/public/rooms/groups/:groupKey`
- Public-safe aggregated data only; no auth required; Redis-backed rate limit.
- No room IDs / `room_code` / exact room numbers; only `vacant` + `public_visible` rooms (room and building) counted.
- Validation **PASS** (API lint/build + endpoint smoke + response safety scan, 2026-07-07).

### M16E - Public Room Listing UI + WhatsApp CTA

- Public route `/kamar` in `apps/penghuni`, accessible **without login** (registered in `PUBLIC_ROUTES`, outside the AuthGuard).
- Hero gender filter (Putra/Putri) + category filter (Semua/Rumah Kost/Apart Kost); shareable `?gender=`/`?category=` URLs; no mandatory popup.
- Aggregated availability cards consuming the M16D API anonymously.
- WhatsApp CTA "Tanya Ketersediaan via WhatsApp" using **`VITE_PUBLIC_WHATSAPP_NUMBER`**; missing env handled safely (disabled CTA + "Nomor WhatsApp admin belum dikonfigurasi.").
- No exact room numbers; no PII.
- Validation **partial accepted** (see Sections 3-4).

## 2. Delivered Capabilities

- **Canonical room inventory data**: 163 rooms / 26 buildings normalized, PII-masked, backfilled to staging with room IDs preserved.
- **Admin room inventory operations**: tabbed Kamar page with summary, category pages grouped by building/floor, filters, and inventory fields.
- **Public availability surface**: unauthenticated, rate-limited, aggregated, PII-safe API.
- **Public listing MVP**: `/kamar` page with gender/category filters, availability cards, and prefilled WhatsApp contact flow.
- **Booking MVP path**: visitor -> `/kamar` -> WhatsApp admin confirmation. Admin remains the final authority for room assignment; exact room numbers are never exposed publicly.

## 3. Validation Summary

| Milestone | Validation | Result | Executor |
| --- | --- | --- | --- |
| M16A-0 / M16A | Data totals + freeze acceptance checklist | PASS | Documented (external) |
| M16B | Migration apply/replay, dry-run validator, guarded staging backfill, health smoke | PASS (backfill run PARTIAL overall: authenticated rooms smoke skipped due tool approval limit) | External (Codex) |
| M16C | API lint/build; Admin lint/typecheck/build; health + authenticated rooms smoke (163 rooms) | PASS | External (Codex) |
| M16C-QA | Browser visual smoke | **PARTIAL accepted** - browser tooling unavailable | External (Codex) |
| M16D | API lint/build; endpoint smoke incl. 400 cases; public response safety scan | PASS | External (Codex) |
| M16E | Lint/build/browser/API validation | **Partial accepted**; remaining validation deferred to M16E-QA | Deferred to Codex |
| M16F | None (documentation only) | N/A | N/A |

**Validation deferred note:** Claude Fable 5 did not run lint/build/API/browser validation for any part of this milestone. All validation and QA execution is external (Codex) or deferred.

## 4. Accepted Partial QA Notes

- **M16C-QA (PARTIAL accepted)**: browser visual smoke, screenshots, console inspection, and browser network inspection were blocked because no Chromium/Firefox/Playwright/Puppeteer tooling was available on the VPS. All non-browser technical checks passed. Accepted with the condition that the first browser demo doubles as a visual sanity check.
- **M16E (partial accepted)**: technical validation was deferred at implementation time. Known baseline issue: the **global penghuni lint is blocked by an unrelated Payment/Billing formatting baseline** predating M16E; this must not be attributed to the M16E change set. Browser visual QA remains unavailable on the VPS (same limitation as M16C-QA).
- `apps/penghuni/src/routeTree.gen.ts` was updated manually in M16E (no terminal); the TanStack Router plugin regenerates it on the next dev/build and the regenerated output wins.

## 5. Safety / Privacy Summary

- Public API and public UI expose **only allowlisted aggregated fields**: no room IDs, no `room_code`, no exact/legacy room numbers, no tenant/resident/occupancy personal data, no import notes/source rows, no audit fields, no Smart Lock data, no Payment Gateway data.
- Only `vacant` + `public_visible=true` rooms in `public_visible=true` buildings are counted publicly; `reserved`/`occupied`/`maintenance`/`requires_review`/`inactive` are never shown as available.
- Gender filtering is enforced backend-side; public endpoints are unauthenticated but rate-limited (Redis).
- Admin surfaces render occupancy status without tenant names in the room inventory views.
- WhatsApp message template contains only public-safe fields (category, gender label, group title, count, from-price).
- Backend remains the final policy enforcement point in all cases.

## 6. Deployment / Config Notes

- **`VITE_PUBLIC_WHATSAPP_NUMBER`** (frontend validated env, ADR-FE-006; added additively in M16E with default `""`):
  - Set to the admin WhatsApp number in international digits (e.g. `62812xxxxxxx`). Non-digits are stripped; a leading `0` is normalized to `62`.
  - If empty/unset or shorter than 8 digits, the public UI renders a **safe disabled CTA** with "Nomor WhatsApp admin belum dikonfigurasi." and never generates an invalid `wa.me` URL.
  - Never hardcode a number in source; this is the only configuration point for the public CTA.
  - This is separate from the existing `VITE_ADMIN_WHATSAPP_PHONE` (file-upload fallback); configure both independently.
- `/kamar` is served by the Penghuni app; no new host, workspace, or Nginx surface was added. Public API calls are anonymous through the existing `ApiClient` base URL (`VITE_API_BASE_URL`).
- Public endpoints require no auth; ensure the staging rate-limit posture (Redis) remains enabled.
- A Penghuni frontend rebuild/redeploy is required for `/kamar` and the new env var to take effect on staging; the build also regenerates `routeTree.gen.ts`.
- No new backend env, migration, or seed is required by M16E/M16F.

## 7. Known Limitations

- **Browser visual QA unavailable on the VPS** (no Chromium/Playwright/Puppeteer): M16C and M16E visual smoke pending; first demo doubles as sanity check.
- **Global penghuni lint blocked** by an unrelated pre-existing Payment/Billing formatting baseline (not caused by M16).
- **Public booking is not production-ready.** The `/kamar` page is a staging/demo MVP surface.
- Booking leads / admin lead management not implemented (deferred).
- Online booking payment not implemented (deferred; Payment Gateway not wired to booking).
- Photos/media, facility catalog, FAQ content, and SEO landing pages deferred; cards are minimal and safe.
- **Smart Lock live execution remains NO-GO** / site trial pending (M13F-D posture unchanged).
- **Payment Gateway production activation remains NOT READY** / pending (M15C posture unchanged; sandbox/staging only).
- Availability counts are aggregated with short cache; a room can be taken between page view and WhatsApp contact - the admin confirmation step is the authoritative resolution (frozen design, R-03).

## 8. Deferred Scope

- Booking lead storage (`room_booking_leads`) + Admin lead management (Ketersediaan/Booking completion) - originally planned as the leads milestone in the M16A freeze.
- Online booking payment (only after production payment activation; separate gated track).
- Room photos/media management (`room_media`), facility catalog, availability calendar.
- SEO landing pages per category/gender; separate public marketing app/domain decision.
- Public exact room selection (only with explicit product approval; MVP frozen to group-level).
- Group detail page using `GET /public/rooms/groups/:groupKey`.
- Browser visual QA for M16C/M16E once tooling is available.

## 9. Next Recommended Milestone

**Booking Lead MVP / Admin Lead Management** (deferred from the M16A freeze plan): store `room_booking_leads` (property-scoped, PII backend-mediated, never public), lead status workflow (`new`/`contacted`/`confirmed`/`cancelled`/`converted`), and completion of the Admin Ketersediaan/Booking surface. Alternative product paths remain valid: production hardening, Smart Lock real site trial (M13F-C5), payment production activation readiness, or CCTV planning. Independently of the chosen path, schedule the pending **browser visual QA for M16C/M16E** as soon as browser tooling is available.

## 10. Release Verdict

| Area | Verdict |
| --- | --- |
| Internal/demo/staging readiness | **READY with known limitations** (Section 7) |
| Production readiness | **NOT READY for full production public booking** |
| Smart Lock live command | **NO-GO until site trial/evidence/signoff** |
| Payment booking | **DEFERRED. Manual/WhatsApp confirmation remains the MVP path** |

Binding closing statement: the M16 track delivers a staging/demo-ready room inventory and public listing MVP. **Public booking is not production-ready.** Payment Gateway remains sandbox/staging ready with production activation pending. Smart Lock live execution remains NO-GO. Production overall remains NOT READY.

## 11. Validation Deferred Note

Claude Fable 5 did not run lint/build/API/browser validation for this milestone. M16F is documentation only; all outstanding validation (M16E technical validation, M16C/M16E browser visual QA) is deferred to external QA (Codex).
