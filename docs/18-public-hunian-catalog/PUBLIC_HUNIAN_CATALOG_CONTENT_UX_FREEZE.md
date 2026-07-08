# M18A - Public Hunian Catalog Content / UX Freeze

> Milestone: M18A - Public Hunian Catalog Content / UX Freeze
> Date: 2026-07-08
> Verdict: FROZEN (binding for M18B and later milestones)
> Scope: Documentation/freeze only. No application source code changes, no migrations, no seed, no QA execution, no Payment Gateway changes, no Smart Lock changes.
> Binding statement: **Public booking remains NOT production-ready. The public catalog displays hunian/unit/group offerings, never exact rooms.**

## 1. Purpose / Goal

M18 makes the public hunian catalog on `/kamar` look and feel modern, professional, and closer to hotel/apartment/e-commerce catalog pages, while preserving every privacy and safety rule frozen in M16A and M17A. This document freezes the public catalog product model, the modern UI direction, the listing and detail page structures, the content source strategy, and the booking/payment/safety postures before any implementation begins.

Base state (complete, unchanged by this freeze): public no-login browsing on `/kamar`, aggregated availability groups (M16D/M16E), WhatsApp CTA, "Ajukan Minat Booking" lead form with anonymous submission (M17D), backend booking lead API (M17B), and admin lead management (M17C).

## 2. Core Product Decision (Frozen)

The public catalog displays **hunian/unit/group offerings, not exact rooms**. Examples of catalog items:

- Rumah Kost Putra - Unit 01
- Rumah Kost Putri - Unit 05
- Apart Kost Putra - Unit A
- Apart Kost Putri - Unit B

The public must never see: exact room numbers, `roomId`, `room_code`, occupancy/resident data, tenant data, invoice/payment data, or Smart Lock data.

The public may see: hunian/unit/group name, category (Rumah Kost / Apart Kost), gender (Putra / Putri), building/unit label if safe, floor label if safe, availability count, price from, facilities, policies/rules, general description, photos/gallery if available and safe, FAQ, CTA "Ajukan Minat Booking", and CTA WhatsApp Admin.

## 3. Public Catalog Product Model (Frozen)

A **Hunian Catalog Item** is the public-safe product grouping consumed by the listing and detail pages. Conceptual schema (frontend/API contract shape; storage design belongs to M18B):

| Field | Type | Notes |
| --- | --- | --- |
| `slug` | string | Public-safe stable identifier for `/kamar/$slug`; derived from category/gender/building(/floor) context (e.g. `rukost-putra-unit-01`), consistent with the M16D `publicGroupKey` family. Never derived from or containing room IDs/`room_code`. |
| `title` | string | e.g. "Rumah Kost Putra - Unit 01" |
| `category` | `rukost` \| `apartkost` | |
| `categoryLabel` | string | "Rumah Kost" / "Apart Kost" |
| `gender` | `male` \| `female` | |
| `genderLabel` | string | "Putra" / "Putri" |
| `buildingCode` | string, nullable | Only if safe (aggregated building/unit code) |
| `buildingName` | string, nullable | Only if safe |
| `floorCode` | string, nullable | `A` \| `B` when applicable |
| `floorLabel` | string, nullable | |
| `shortDescription` | string | Card copy; bounded length |
| `longDescription` | string | Detail page copy |
| `priceFromMonthly` | number, nullable | |
| `priceFromYearly` | number, nullable | |
| `availabilityCount` | number | Aggregated available-room count (same semantics as M16D `availableCount`; not realtime; admin confirms) |
| `facilitiesRoom` | string[] | Room-level facilities (e.g. kasur, lemari, AC/kipas) |
| `facilitiesShared` | string[] | Shared facilities (e.g. dapur bersama, parkir, WiFi area) |
| `policies` | string[] | Kebijakan umum (e.g. jam tamu, pembayaran) |
| `rules` | string[] | Aturan hunian (e.g. khusus putra/putri, larangan) |
| `gallery` | image reference[] | Public-safe image references only, if available; empty array when none |
| `faq` | { question, answer }[] | |
| `ctaLabel` | string | |
| `bookingLeadDefaults` | object | Prefill for the existing M17 lead form: `category`, `gender`, `buildingCode`, `floorCode`, `publicGroupKey` |

**Explicitly excluded from the model (frozen):** exact room number, internal room id, `room_code`, resident/tenant details, occupancy status per exact room, payment status/fields, Smart Lock data of any kind.

Rules:

- `bookingLeadDefaults` maps 1:1 onto the existing `POST /api/v1/public/booking-leads` payload context - no new lead fields are introduced by M18.
- All fields are allowlisted; anything not in this table is not public.
- Gallery references must be public-safe media served through an approved access path decided in M18B (consistent with ADR-BE-FILE-001: no raw storage paths, no unauthorized internal file URLs). If no safe media pipeline exists yet, `gallery` stays empty and the UI renders a graceful placeholder.

## 4. Modern UI Direction (Frozen)

The public catalog UI must be:

- Modern hotel/apartment landing page style; clean and spacious; premium but friendly; visually polished.
- Mobile-first; readable typography; consistent spacing; soft shadows or subtle borders; accessible color contrast.
- NOT admin-table-like; NOT dashboard-like; easy to understand for calon penghuni.
- Strong hero section; clear filter chips; polished cards; clear price hierarchy; facility badges; visible availability indicator; clear CTA buttons.
- Complete loading (skeleton), empty, and error states with safe copy and retry - no internal error details.
- Built with the existing shadcn/ui kit in `apps/penghuni` (no new design system/workspace in MVP).

CTA hierarchy (carried from M17D): **"Ajukan Minat Booking" primary**, **WhatsApp secondary** (WhatsApp remains the primary confirmation channel operationally).

## 5. Listing Page Structure - `/kamar` (Frozen)

1. Hero section: headline + subcopy (existing "Temukan Kamar Kost yang Sesuai" family; refreshed copy allowed), live availability totals.
2. Filter bar: gender Putra/Putri; category Semua/Rumah Kost/Apart Kost (URL-shareable params preserved). Optional facility/category chips deferred to a later phase.
3. Catalog cards per hunian/unit/group, each showing:
   - title
   - category/gender badges
   - short description
   - price from (monthly primary, yearly secondary)
   - availability count
   - 3-5 facility badges
   - CTA "Lihat Detail" (to `/kamar/$slug`)
   - CTA "Ajukan Minat Booking" (existing M17D dialog)
   - CTA WhatsApp
4. No exact room numbers anywhere. No login required. Footer disclaimer retained (admin confirmation; no online payment for booking).

## 6. Detail Page Structure - `/kamar/$slug` (Frozen)

Recommended route: **`/kamar/$slug`** in `apps/penghuni`, registered as a public route (outside AuthGuard) like `/kamar`.

Sections in order:

1. Hero/detail header (title, category/gender badges).
2. Gallery/photos if available; graceful placeholder when empty.
3. Price section (from-price monthly/yearly, clear hierarchy).
4. Availability count (aggregated; "Nomor kamar akan dikonfirmasi oleh admin.").
5. Description (long).
6. Fasilitas Kamar (`facilitiesRoom`).
7. Fasilitas Bersama (`facilitiesShared`).
8. Aturan / Kebijakan (`rules` + `policies`).
9. FAQ.
10. CTA sticky on mobile: "Ajukan Minat Booking" (primary) + "WhatsApp Admin" (secondary), reusing the existing M17D lead dialog with `bookingLeadDefaults` prefilled.
11. Disclaimer (frozen copy): "Ketersediaan dan nomor kamar dikonfirmasi oleh admin. Pengajuan minat booking belum menjadi booking resmi."

Unknown/invalid slugs render a safe not-found state with a link back to `/kamar` - no internal errors, no ID probing feedback.

## 7. Content Source Strategy (Frozen)

Master data (facilities, policies, descriptions, photos) will be provided later. Therefore:

- **M18A freezes the content schema and placeholder rules** (this document). Final content completeness does NOT block M18A or M18B.
- **M18B** may implement the backend/public catalog API using existing M16 inventory data plus placeholder content for missing fields.
- Future master data import enriches facilities/policies/gallery without schema changes (additive enrichment only).
- **Do not invent detailed facility claims as facts** unless data exists. Where data is missing, use safe generic placeholder copy (e.g. "Informasi fasilitas akan segera dilengkapi. Silakan tanyakan detail ke admin via WhatsApp.") or hide the section gracefully.
- Placeholder copy must never promise amenities, prices, or availability that the data does not support.
- Content fields are plain text, sanitized/bounded, rendered safely (no HTML interpretation from data).

## 8. Booking / Payment Posture (Frozen)

- "Ajukan Minat Booking" remains the primary lead flow (existing M17 form and endpoint; unchanged).
- WhatsApp remains the confirmation channel.
- Payment Gateway booking remains **DEFERRED**. No online payment on the public catalog.
- No auto reservation; a lead never mutates room/inventory state.
- No exact room selection by public visitors.
- **Admin confirmation remains the source of truth** for any actual booking.

## 9. Safety / Privacy Freeze (Binding)

- **Backend remains the enforcement point**; frontend validation/filtering is UX-only.
- No exact room numbers public. No room IDs public. No `room_code` public - in any request, response, slug, URL, image filename, or copy.
- No tenant/resident/occupancy PII. No payment data. No Smart Lock data.
- Facilities/policies/descriptions/FAQ content must not contain sensitive internal data (no tenant names, internal codes, credentials, pricing internals, or operational security details).
- Gallery/media must be public-safe (no photos exposing resident identity/belongings/documents); media access path decided in M18B must not expose storage paths or unauthorized internal URLs.
- Public catalog endpoints remain unauthenticated read-only, rate-limited, and allowlist-based (M16D posture).
- No production-ready public booking claim anywhere in UI or docs.
- Payment Gateway and Smart Lock are untouched by the entire M18 track.

## 10. Deferred Scope (Not in M18)

- Payment gateway booking / online payment.
- Exact room selection and per-room detail.
- Checkout flow; room hold timer; auto invoice; auto resident/occupancy creation.
- User accounts for calon penghuni.
- Full media management (upload/curation pipeline) if not ready - `gallery` stays empty/placeholder until a safe pipeline exists.
- SEO advanced automation (sitemaps, structured data automation, per-page meta pipelines beyond basic titles/descriptions).
- Reviews/testimonials (not currently present).
- Map/location advanced integration.
- Notification automation for leads (unchanged from M17 deferred list).

## 11. Recommended Implementation Milestones

| Milestone | Scope |
| --- | --- |
| M18B | Backend/public catalog API: catalog item contract per Section 3 on top of existing M16 inventory data + placeholder content; slug resolution; additive only |
| M18C | Listing page `/kamar` modern redesign per Sections 4-5 (cards, hero, chips, states) |
| M18D | Detail page `/kamar/$slug` per Section 6, reusing the M17 lead dialog with `bookingLeadDefaults` |
| M18E | Master data content enrichment (facilities/policies/descriptions/gallery) when provided; import/mapping without schema changes |
| M18F | QA/validation track (external executor): lint/typecheck/build, API smoke, privacy scan; browser visual QA when tooling available (fold in pending M16/M17 visual QA) |
| M18G | Final docs / release update / handoff |

## 12. Acceptance Criteria Mapping

| Criterion | Status |
| --- | --- |
| Freeze doc created | Yes (this document) |
| Product model defined | Section 3 |
| Modern UI direction clear | Section 4 |
| Listing page structure frozen | Section 5 |
| Detail page structure frozen | Section 6 |
| Content source strategy defined | Section 7 |
| Payment deferred clear | Sections 8, 10 |
| Privacy/safety clear | Sections 2, 3, 9 |
| No production-ready overclaim | Confirmed throughout |
| No application source code changes | Confirmed - documentation only |
| No validation claim | Section 13 |

## 13. Validation Deferred Note

Claude Fable 5 did not run lint/build/API/browser validation for this milestone. M18A is documentation/freeze only; no application source code, migrations, seeds, or QA were executed. All implementation validation is deferred to M18B-M18F and external QA execution.

## 14. Verdict

**FROZEN.** The public hunian catalog product model, modern UI direction, listing/detail page structures, content source strategy, and booking/payment/safety postures are frozen for M18B and later. The public catalog presents hunian/unit/group offerings only - never exact rooms; the M17 lead flow and WhatsApp confirmation remain the booking path; payment booking remains deferred; **public booking remains NOT production-ready**; Payment Gateway and Smart Lock are untouched.
