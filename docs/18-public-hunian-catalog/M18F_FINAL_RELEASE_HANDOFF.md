# M18F - Final Public Hunian Catalog Release / Handoff

> Date: 2026-07-08
> Track: M18 Public Hunian Catalog
> Status: CLOSED / SUCCESS
> Verdict: PASS with browser visual limitation

## 1. Milestone Verdict

M18 Public Hunian Catalog is closed successfully.

Final verdict: **PASS with browser visual limitation**.

Browser visual QA was limited by unavailable browser tooling on the VPS. All non-browser checks, static reviews, builds, API smoke tests, and safety checks passed.

## 2. Summary of Delivered Features

M18 delivers a public-safe hunian catalog for Kostation.

- Public Catalog API: `GET /api/v1/public/hunian-catalog` supports gender and category filters, and `GET /api/v1/public/hunian-catalog/:slug` returns public-safe detail data.
- Modern `/kamar` listing UI: the public room page now feels closer to an ecommerce or hotel catalog, with filter chips, polished cards, safe gallery placeholders, availability counts, price display, WhatsApp CTA, and booking lead CTA.
- Public `/kamar/$slug` detail page: each catalog item has a detail page showing safe descriptions, room facilities, bathroom facilities, shared facilities, security/comfort facilities, service facilities, rules, policies, FAQ, disclaimers, and CTAs.
- Existing foundations reused safely: M16 aggregate availability remains the source for public availability counts, and the M17 public booking lead form is reused without turning a lead into a confirmed booking.

Public booking posture is unchanged:

- A booking lead is not a confirmed booking.
- No exact room selection.
- No automatic reservation.
- No invoice or payment generation.
- No occupancy or resident auto-creation.
- Admin and WhatsApp confirmation remain authoritative.
- Public booking remains **NOT production-ready**.

## 3. Strict Safety & Privacy Review Checklist

Result: **15/15 PASS**.

1. PASS - No exact room numbers are exposed to the public.
2. PASS - No internal room IDs are exposed to the public.
3. PASS - No `room_code` / `roomCode` is exposed to the public.
4. PASS - Public slugs are safe marketing identifiers, not internal IDs.
5. PASS - No tenant PII is exposed.
6. PASS - No resident PII is exposed.
7. PASS - No occupancy personal data is exposed.
8. PASS - No invoice data is exposed.
9. PASS - No payment status or payment transaction data is exposed.
10. PASS - No bank account numbers are exposed.
11. PASS - Raw rental agreements remain hidden.
12. PASS - Raw receipts and payment proof content remain hidden.
13. PASS - Internal SOPs and staff workflows remain hidden.
14. PASS - Smart Lock / PALOMA data is untouched and not exposed.
15. PASS - No public UI claims online booking payment, room hold, or production-ready public booking.

## 4. Critical Data Gaps

These items are carried over to the Product Owner for final confirmation:

- Actual prices per category/unit.
- Final public-safe unit marketing display names.
- Final deposit rules: 1 month, 2 months, or a range.

Until confirmed, the catalog must keep safe placeholder-style copy and admin-confirmation disclaimers.

## 5. Verification & Technical Evidence Log

Backend/API validation passed:

| Check | Expected | Result |
| --- | --- | --- |
| API lint | PASS | PASS |
| API build | PASS | PASS |
| `GET /api/v1/health` | 200 | 200 |
| `GET /api/v1/public/hunian-catalog` | 200 | 200 |
| `GET /api/v1/public/hunian-catalog?gender=male` | 200 | 200 |
| `GET /api/v1/public/hunian-catalog?gender=female` | 200 | 200 |
| `GET /api/v1/public/hunian-catalog?category=rukost` | 200 | 200 |
| `GET /api/v1/public/hunian-catalog?category=apartkost` | 200 | 200 |
| Invalid gender filter | 400 | 400 |
| Invalid category filter | 400 | 400 |
| Valid slug detail | 200 | 200 |
| Unknown slug | 404 | 404 |
| `GET /api/v1/public/rooms/summary` regression | 200 | 200 |
| Invalid public booking lead POST | 400 | 400 |

Frontend Penghuni validation passed:

| Check | Result |
| --- | --- |
| Penghuni lint | PASS with existing non-blocking baseline warnings only |
| Penghuni typecheck | PASS |
| Penghuni build | PASS |
| `/kamar` public route inspection | PASS |
| `/kamar/$slug` public route inspection | PASS |
| AuthGuard regression check | PASS |
| Refresh-token loop check | PASS |
| Booking lead reuse check | PASS |
| WhatsApp CTA safety check | PASS |
| Privacy/safety scan | PASS |

Route generation evidence:

- `/kamar` is registered as a public route.
- `/kamar/$slug` is registered as the public detail route.
- RouteTree convergence passed through the normal Penghuni build flow.

## 6. Deployment & Operation Instructions

Before staging or production verification:

1. Restart the API server process so the M18B public routes are registered by the running process.
2. Confirm `GET /api/v1/health` returns 200 after restart.
3. Confirm `GET /api/v1/public/hunian-catalog` returns 200.
4. Confirm one known detail slug returns 200.
5. Confirm `/kamar` and `/kamar/$slug` can load without login.

Operational notes:

- `/kamar/` intentionally bypasses AuthGuard for the public catalog family.
- Public catalog API calls use `anonymous: true`, so they do not send Authorization headers and do not trigger refresh-token loops.
- Do not add private routes under `/kamar/` without reviewing the AuthGuard bypass.
- Do not enable payment booking, exact room selection, room holds, invoice generation, or resident creation from public catalog flows without a new architecture freeze and QA cycle.

## Final Handoff

M18 is ready for internal/demo/staging use with admin and WhatsApp confirmation.

M18 is not a production-ready online booking system. It is a public-safe catalog and lead intake flow.

Recommended next owner actions:

- Confirm final prices.
- Confirm final public-safe unit marketing names.
- Confirm deposit rules.
- Plan visual/browser QA when browser tooling is available.
- Keep Payment Gateway and Smart Lock scopes separate from public booking until explicitly approved.
