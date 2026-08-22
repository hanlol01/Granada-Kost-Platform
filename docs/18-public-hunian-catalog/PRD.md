# PRD — Public `/kamar` Catalog

**Status:** Draft for redesign  
**Decision owner:** KOSTATION Product/Domain Lead  
**Primary route:** `http://localhost:8081/kamar`  
**Audience:** Public visitors and prospective residents (no login required)

This document is the product contract for the design and implementation agents. A redesign may
change layout, visual language, copy presentation, and component composition, but it must not
change the business meaning, backend authority, or public-data boundaries defined here.

## 1. Product objective

The `/kamar` page helps prospective residents understand the available Rumah Kost and Apart Kost
options, see a published availability snapshot, and submit an expression of booking interest to
Admin.

This page is **not** a reservation engine, checkout flow, or resident portal. Visitors do not select
an individual room number and do not make an online payment.

## 2. Redesign architecture decision

The redesign uses a **static-first** model for `/kamar`.

### Only two dynamic capabilities

1. **Category/gender availability** — the currently published count of available rooms for a
   category and gender combination. This number is an indicator, not a reservation guarantee.
2. **Booking-interest submission** — submission to the public booking-lead endpoint, preserving the
   existing validation, rate limiting, deduplication, idempotency, audit, and outbox behavior.

### Content that becomes static and version-controlled

- hero imagery, photographs, gallery assets, and illustrations;
- category and gender names/descriptions;
- facilities and neighborhood descriptions;
- public terms and conditions;
- prices, recommended DP, deposit information, and payment-plan examples;
- booking-process copy, FAQ, reassurance copy, and footer content.

Static content must live in a reviewed content registry/JSON/TypeScript module and versioned assets
inside the repository (for example `apps/penghuni/src/content/public-kamar/*` and
`apps/penghuni/public/*`). Price, terms, and image changes happen through a reviewed source change
and release, not through an opaque runtime response.

> “Static” means the content is part of an auditable application artifact. It must not be an
> unreviewed mock that contradicts domain decisions.

## 3. Current implementation and authority to preserve

The incumbent implementation is primarily located in:

- `apps/penghuni/src/routes/kamar.tsx` — page shell, hero, listing, filters, CTAs, facilities,
  process explanation, and public terms;
- `apps/penghuni/src/components/booking-lead/PublicBookingLeadDialog.tsx` — booking-interest form;
- `apps/penghuni/src/hooks/usePublicBookingLead.ts` — anonymous submit with idempotency;
- `apps/penghuni/src/hooks/usePublicHunianCatalog.ts` — current catalog source that will be narrowed
  to stock-only data or replaced by a stock adapter;
- `backend/api/src/modules/room/public-hunian-catalog.controller.ts` and its service — the
  property-scoped public projection that must not expose resident data;
- `backend/api/src/modules/booking-lead/public-booking-lead.controller.ts` — the authoritative
  public lead-submit endpoint.

The current catalog API still returns content, gallery, facilities, prices, disclaimers, and
`availabilityCount`. The redesign must not treat that response content as the primary visual source;
the frontend may consume only the agreed stock fields from the dynamic contract.

## 4. Public business flow

### 4.1 Entering the page

1. A visitor opens `/kamar` without authentication.
2. The page renders its complete static content even when the stock API is unavailable.
3. The anonymous stock request refreshes the published category/gender availability counts.

### 4.2 Selecting a housing type

The visitor selects:

- **Category:** Rumah Kost or Apart Kost;
- **Gender:** Putra or Putri, where relevant to the selected category.

These selections filter the category cards and provide the context for the form. The UI must not
show individual room numbers or imply that a particular room has been reserved.

When stock cannot be loaded, cards remain readable but show a clear “Availability is being updated”
state. The CTA must not claim that a specific room is available.

### 4.3 Viewing an option card

Each category/gender card may show the static category/gender name, price and payment-plan copy,
facilities, neighborhood summary, the API availability badge (or an unavailable state), and the
**Submit Booking Interest** button.

Cards must never expose residents, leases, invoices, payment proofs, property IDs, room IDs, storage
paths, or internal identifiers.

### 4.4 Submitting booking interest

Clicking **Submit Booking Interest** opens the existing lead form in a dialog or sheet. The selected
category and gender are inherited from the card and must not become an individual room selection.

| Field | Rule |
|---|---|
| Prospective resident name | Required, 2–120 characters |
| Email | Optional, valid email format, maximum 254 characters |
| WhatsApp/phone number | Required, 8–32 characters; both `0...` and `+62...` formats are accepted |
| University/education | Required, 2–160 characters |
| Planned move-in date | Optional; sent as `YYYY-MM-DD` in the payload |
| Message | Optional, maximum 1000 characters |
| Consent to be contacted | Required and must be `true` |

The form must use visible labels, helper text, inline validation, a pending state, and human-readable
error messages. It must not ask for a password, national ID, transfer proof, room number, or payment
data.

### 4.5 Submission and result

The frontend sends:

```text
POST /api/v1/public/booking-leads
Idempotency-Key: <uuid-per-submit>
```

with the selected category/gender and the form fields above. The endpoint remains anonymous and
applies Indonesian phone normalization, a Redis-backed rate limit of five requests per 15 minutes per
IP, a 15-minute duplicate-protection window, idempotent replay handling, and a safe response that
does not echo PII, room IDs, property IDs, or internal metadata.

The success state must explain that the interest has been recorded, that interest is **not** a
reservation or room hold, that the final room number and placement are confirmed by Admin, that no
online payment has been made, and that Admin may contact the visitor through the applicable
operational channel.

The failure state must provide a safe retry action without creating duplicate leads. HTTP 429,
network failures, and validation failures must have distinct, understandable copy and must not expose
stacks or technical correlation IDs.

## 5. Dynamic stock data contract

Recommended minimal contract:

```ts
type PublicHunianStock = {
  category: "rukost" | "apartkost";
  gender: "male" | "female";
  availableCount: number | null;
  asOf: string;
};
```

If a new endpoint is not created immediately, an adapter may temporarily read the existing catalog
endpoint but must extract only the required availability summary. The frontend must ignore content,
gallery, facilities, prices, disclaimers, and all unrelated metadata from that response.

Stock rules:

- availability is a published snapshot, not an allocation guarantee;
- submitting the form must not decrement stock;
- the flow must not create a hold, lease, invoice, payment, or occupancy;
- show a localized “last updated” timestamp when available;
- provide loading, unavailable, stale, and no-result states;
- a cache must not override a newer response without an explicit stale indicator.

## 6. UI redesign scope

The design agent may choose the visual composition as long as this information hierarchy remains
obvious:

1. header/brand and the purpose of the page;
2. hero explaining the student-housing proposition and trust signals;
3. an easy-to-scan category/gender selector;
4. option cards with clear availability;
5. a prominent but non-misleading booking-interest CTA;
6. static facilities and neighborhood information;
7. a three-step booking process;
8. terms, disclaimers, and FAQ;
9. a footer clarifying Admin’s confirmation authority.

### Visual requirements

- Use the KOSTATION tokens defined in `DESIGN.md`; do not introduce a new palette, radius system, or
  font scale.
- The public catalog may use a wider layout (approximately 72rem maximum), but must never create
  horizontal overflow.
- Use semantic colors: blue for actions/information, green for available/success, yellow for
  attention, and red for errors; every status also needs text.
- Primary/secondary buttons, badges, date inputs, dropdowns, dialogs, and error states need visible
  focus styles and readable contrast in light and dark themes.
- Design mobile-first: cards stack, CTAs remain easy to reach, dialogs are never clipped, and touch
  targets are at least 44px.
- Do not use a carousel to hide important terms; every image requires meaningful alt text.

## 7. Security and domain boundaries

- `/kamar` and lead submission remain anonymous; login must not be required.
- Never display or submit tenant/resident data, leases, invoices, payments, deposit-ledger data,
  proof files, credentials, raw audits, storage paths, room IDs, or property IDs.
- Never turn a lead into a booking, reservation, hold, occupancy, invoice, or payment.
- The frontend is not the stock authority; availability comes from the public projection.
- Admin remains the authority for room confirmation, final price, schedule, and next steps.
- Do not add a payment gateway, transfer-proof upload, Smart Lock, chat, or automated notification to
  this PRD.
- A static redesign must not bypass the booking-lead rate limit, idempotency, deduplication, audit,
  or outbox contract.

## 8. Non-goals

The following are outside this PRD:

- resident login or owner portal;
- individual room-number selection;
- reservations and room holds;
- checkout, contracts, occupancy, transfers, or renewals;
- online payment, invoice, security-deposit collection, or refund;
- synchronization of resident/admin detail into the public page;
- a runtime CMS or public-content editor;
- redesign of `/kamar/$slug` unless assigned as a separate package.

## 9. Acceptance criteria

### Product and behavior

- [ ] `/kamar` renders its full static content when the stock API is disabled or returns HTTP 500;
  only the stock panel enters an unavailable state.
- [ ] The page makes no content/gallery/facility/terms requests; only the stock request and
  `POST /public/booking-leads` on submit are allowed.
- [ ] Selected category and gender are carried correctly into the form and payload.
- [ ] Invalid form input is rejected inline with friendly success/error states.
- [ ] Idempotent replay does not create duplicate leads; rate limiting and duplicate protection remain
  effective.
- [ ] Success copy states “interest, not a reservation” and identifies Admin as the confirmation
  authority.
- [ ] No room number or resident personal data appears in HTML, payloads, or public API responses.

### Design and accessibility

- [ ] Desktop, tablet, and mobile layouts have no horizontal overflow.
- [ ] All controls are keyboard accessible, labeled, focus-visible, and images have alt text.
- [ ] Stock, unavailable, error, and success states are understandable without color alone.
- [ ] Light and dark themes provide readable borders, text, and badges.
- [ ] Loading states do not cause major layout shifts or confusing CTA movement.

### Engineering

- [ ] Static content registry and assets live in the repository and have an owner/review process.
- [ ] `usePublicHunianCatalog` is no longer the source of content UI; the stock adapter has a narrow
  type and response validation.
- [ ] Unit/contract tests cover stock mapping, category/gender filtering, form payloads, validation,
  retry behavior, and the idempotency header.
- [ ] Build, lint, typecheck, Prettier, and `git diff --check` pass for every changed workspace.

## 10. Recommended implementation packages

1. **P0 — Content freeze:** finalize copy, prices, facilities, terms, and the asset manifest; obtain
   product/domain review.
2. **P1 — Stock adapter:** narrow the dynamic contract to stock and implement unavailable/stale
   states.
3. **P2 — Visual redesign:** implement the responsive layout using `DESIGN.md` and the UI skills
   selected by the design agent.
4. **P3 — Lead-flow hardening:** preserve the dialog, validation, idempotency, rate limiting, and
   success/error copy without changing backend authority.
5. **P4 — Verification:** run unit/contract tests, build/lint/typecheck, a static network audit, and
   desktop/mobile visual QA.

## 11. Decisions to lock before coding

- final prices and facilities to freeze in the release;
- approved photo assets and their licenses;
- whether `plannedStart` remains visible as a filter or only as an optional form field;
- whether `paymentSchedule` remains as static educational copy or is removed from the UI;
- whether a new `public/hunian-stock` endpoint is needed or an adapter over the existing catalog is
  sufficient;
- stock refresh interval and the agreed stale/unavailable labels;
- whether the WhatsApp CTA remains a static link or is deferred.

## 12. Authoritative references

- `DESIGN.md`
- `docs/17-booking-leads/BOOKING_LEAD_BACKEND_API.md`
- `docs/17-booking-leads/BOOKING_LEAD_PUBLIC_FORM_UI.md`
- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_API.md`
- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_LISTING_UI.md`
- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_LISTING_UI_QA.md`
- `apps/penghuni/src/routes/kamar.tsx`
- `apps/penghuni/src/components/booking-lead/PublicBookingLeadDialog.tsx`
- `backend/api/src/modules/booking-lead/public-booking-lead.controller.ts`
- `backend/api/src/modules/room/public-hunian-catalog.controller.ts`
