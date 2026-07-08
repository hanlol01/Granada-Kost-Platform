# M18B - Public Hunian Catalog API

> Milestone: M18B - Backend/Public Hunian Catalog API / Data Model
> Date: 2026-07-08
> Verdict: PASS
> Scope: Backend/public API + documentation only. No frontend UI, no admin gallery upload, no migration, no CSV import/backfill, no payment booking, no exact room selection, no reservation automation, no invoice/payment generation, no occupancy/resident creation, no Payment Gateway changes, no Smart Lock changes.

## Summary

M18B adds public-safe hunian catalog endpoints on top of the existing M16 public room availability aggregation and the M18A/M18A-1 normalized public content.

The public catalog presents hunian/unit/floor group offerings, not exact rooms. It reuses live M16 availability counts and M17-compatible `bookingLeadDefaults`, while returning static public-safe descriptions, facilities, rules, FAQ, disclaimers, and empty gallery arrays until a safe media pipeline exists.

Public booking remains **NOT production-ready**. Admin/WhatsApp confirmation remains authoritative.

## Endpoints

### GET `/api/v1/public/hunian-catalog`

Returns a lightweight list of public catalog items.

Query filters:

| Param | Values | Notes |
| --- | --- | --- |
| `category` | `rukost`, `apartkost` | Optional |
| `gender` | `male`, `female` | Optional |

Response shape:

```json
{
  "data": [
    {
      "slug": "rukost-putra-unit-01-lantai-a",
      "title": "Rumah Kost Putra - RuKost Unit 01 (Lantai Atas / LT.2)",
      "category": "rukost",
      "categoryLabel": "Rumah Kost",
      "gender": "male",
      "genderLabel": "Putra",
      "buildingCode": "01",
      "buildingName": "RuKost Unit 01",
      "floorCode": "A",
      "floorLabel": "Lantai Atas / LT.2",
      "publicGroupKey": "rukost-male-01-A",
      "shortDescription": "Kost modern fully furnished dengan AC, kamar mandi dalam, water heater, WiFi, dan keamanan terjaga.",
      "priceFromMonthly": 1800000,
      "priceFromYearly": 21600000,
      "availabilityCount": 6,
      "facilitiesPreview": ["AC per kamar", "Kamar mandi dalam", "WiFi", "Pantri bersama", "Area parkir"],
      "galleryPreview": [],
      "ctaLabel": "Ajukan Minat Booking",
      "bookingLeadDefaults": {
        "category": "rukost",
        "gender": "male",
        "buildingCode": "01",
        "floorCode": "A",
        "publicGroupKey": "rukost-male-01-A"
      },
      "disclaimers": []
    }
  ],
  "summary": {
    "totalItems": 42,
    "totalAvailable": 161
  }
}
```

### GET `/api/v1/public/hunian-catalog/:slug`

Returns the full public-safe detail item for one catalog slug.

Additional detail fields:

- `longDescription`
- `facilitiesRoom`
- `facilitiesBathroom`
- `facilitiesShared`
- `facilitiesSecurity`
- `facilitiesService`
- `policies`
- `rules`
- `faq`
- `gallery`
- `needsConfirmation`

Unknown slugs return HTTP 404. Malformed slug strings return HTTP 400.

## Data Source Strategy

M16 room inventory remains the source of truth for:

- category
- gender
- building/unit labels
- floor labels
- public group key
- live aggregated availability count
- monthly/yearly from-prices
- `vacant` + `public_visible` filtering

M18A-1 normalized master data is the source of truth for:

- short/long public descriptions
- room/bathroom/shared/security/service facilities
- public-safe policies and rules
- FAQ defaults
- CTA and disclaimer copy
- `needsConfirmation` notes

No database migration was added. The M18B content is a backend public-safe constant for now, pending owner-confirmed enrichment and safe media management in later milestones.

## Gallery Policy

`galleryPreview` and `gallery` are schema-ready but intentionally empty arrays.

No dummy photos, raw storage paths, or unverified public media URLs are returned. Future gallery enrichment must use a public-safe mediated media path and must avoid photos that expose resident identity, belongings, documents, exact room numbers, internal storage paths, or operational security details.

## Price Policy

Prices come from the existing M16 room inventory aggregation (`min(monthly_price)` and `min(yearly_price or monthly_price * 12)`). The contract allows `null` prices if future data is unavailable or withheld, so frontend can safely render "Hubungi admin" style copy without inventing prices.

## Safety Exclusions

The API response is allowlisted and must not include:

- internal room IDs
- `room_code`
- exact room numbers
- tenant/resident/occupancy PII
- invoice/payment data
- bank account details
- raw akad, kuitansi, or SOP content
- Smart Lock operational data
- raw storage paths or unsafe gallery URLs

Building/unit codes and `publicGroupKey` are public group identifiers from the M16 public listing posture, not exact room identifiers.

## Files Changed

Backend:

- `backend/api/src/modules/room/dto/public-hunian-catalog-query.dto.ts`
- `backend/api/src/modules/room/public-hunian-catalog.content.ts`
- `backend/api/src/modules/room/public-hunian-catalog.controller.ts`
- `backend/api/src/modules/room/public-hunian-catalog.service.ts`
- `backend/api/src/modules/room/types/public-hunian-catalog.types.ts`
- `backend/api/src/modules/room/room.module.ts`

Documentation:

- `docs/18-public-hunian-catalog/PUBLIC_HUNIAN_CATALOG_API.md`
- `docs/README.md`
- `docs/00-project/ROADMAP.md`
- `docs/00-project/PROJECT_MASTER.md`
- `docs/00-project/PROJECT_HANDOFF.md`

## Validation Results

Validation completed against a fresh built API on temporary port `3001`. The temporary API process was stopped after smoke validation.

| Check | Result |
| --- | --- |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| `npm --workspace @granada-kost/api run test` | Not available; no `test` script exists in `backend/api/package.json` |
| `GET /api/v1/health` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog?gender=male` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog?gender=female` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog?category=rukost` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog?category=apartkost` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog?gender=random` | PASS, HTTP 400 |
| `GET /api/v1/public/hunian-catalog?category=random` | PASS, HTTP 400 |
| `GET /api/v1/public/hunian-catalog/apartkost-putri-unit-05a-lantai-b` | PASS, HTTP 200 |
| `GET /api/v1/public/hunian-catalog/unknown-hunian-slug` | PASS, HTTP 404 |
| M16 regression: `GET /api/v1/public/rooms/summary` | PASS, HTTP 200 |
| M17 regression: invalid `POST /api/v1/public/booking-leads` | PASS, HTTP 400 |
| Safety scan of list/detail responses | PASS |

Smoke summary:

| Metric | Value |
| --- | ---: |
| totalItems | 42 |
| totalAvailable | 161 |

Safety scan searched public M18B responses for forbidden keys/terms including `roomId`, `room_id`, `roomCode`, `room_code`, tenant/resident/occupancy terms, invoice/payment status terms, bank/rekening terms, Smart Lock terms, `PALOMA`, and `BSI 7318321153`; none were found.

## Known Limitations

- Browser/UI validation is out of scope for M18B because no frontend was implemented.
- Gallery arrays are empty until a safe public media pipeline exists.
- Content is shared/general across all catalog items until unit-specific master data is confirmed.
- Some master-data claims remain under `needsConfirmation`, including deposit wording, visiting-hour wording, ITB/UNPAD proximity claim, facility differences by type/unit, and gallery media.
- M18B exposes one catalog item per current M16 public availability group, including floor-level grouping.

## Next Milestone

M18C - modern public `/kamar` listing refresh using the M18B catalog list endpoint, while preserving M17 lead form and WhatsApp CTA behavior.

## Verdict

PASS. M18B backend/public hunian catalog API is implemented as an additive, public-safe, read-only API over M16 availability data and M18 normalized content. No migration, frontend, admin gallery upload, payment booking, reservation automation, exact room selection, Payment Gateway change, or Smart Lock change was introduced. Public booking remains **NOT production-ready**.
