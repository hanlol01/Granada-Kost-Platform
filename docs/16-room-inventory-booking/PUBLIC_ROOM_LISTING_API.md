# M16D - Public Room Listing API

> Milestone: M16D - Public Room Listing API
> Date: 2026-07-07
> Verdict: PASS - API lint/build and endpoint smoke completed
> Scope: Backend API only. No public frontend UI, no WhatsApp CTA UI, no booking lead storage, no online booking/payment, no CSV import/backfill.

## Scope

M16D adds unauthenticated read-only public room listing endpoints for future public website usage. The endpoints expose aggregated, group-level availability only and keep exact room assignment under admin confirmation.

Explicitly not implemented:

- Public frontend UI.
- WhatsApp CTA UI or generated public link.
- Stored booking leads.
- Online booking or payment.
- CSV import/backfill.
- Room inventory data mutation.
- Public booking production readiness.

Payment Gateway and Smart Lock behavior are unchanged.

## Endpoints Implemented

### GET `/api/v1/public/rooms/availability`

Returns public-safe aggregated availability groups.

Query params:

| Param | Values | Notes |
| --- | --- | --- |
| `gender` | `putra`, `putri`, `male`, `female` | `putra` maps to `male`; `putri` maps to `female` |
| `category` | `rukost`, `apartkost` | Optional category filter |
| `buildingCode` | e.g. `01`, `05A`, `18D` | Optional building/unit filter |
| `floorCode` | `A`, `B` | Optional floor filter |

Response shape:

```json
{
  "data": [
    {
      "groupKey": "rukost-male-01-A",
      "category": "rukost",
      "categoryLabel": "Rumah Kost",
      "gender": "male",
      "genderLabel": "Putra",
      "buildingCode": "01",
      "buildingName": "RuKost Unit 01",
      "floorCode": "A",
      "floorLabel": "Lantai Atas / LT.2",
      "availableCount": 6,
      "priceFromMonthly": 1800000,
      "priceFromYearly": 21600000,
      "publicTitle": "Rumah Kost Putra - RuKost Unit 01",
      "ctaLabel": "Tanya Ketersediaan"
    }
  ],
  "summary": {
    "totalAvailable": 161,
    "byCategory": {
      "rukost": 123,
      "apartkost": 38
    },
    "byGender": {
      "male": 97,
      "female": 64
    }
  }
}
```

### GET `/api/v1/public/rooms/summary`

Returns public-safe totals by category, gender, and category+gender.

Response shape:

```json
{
  "data": {
    "totalAvailable": 161,
    "categories": [
      {
        "category": "rukost",
        "categoryLabel": "Rumah Kost",
        "availableCount": 123
      },
      {
        "category": "apartkost",
        "categoryLabel": "Apart Kost",
        "availableCount": 38
      }
    ],
    "genders": [
      {
        "gender": "male",
        "genderLabel": "Putra",
        "availableCount": 97
      },
      {
        "gender": "female",
        "genderLabel": "Putri",
        "availableCount": 64
      }
    ],
    "categoryGenders": []
  }
}
```

### GET `/api/v1/public/rooms/groups/:groupKey`

Optional safe group-detail endpoint. The group key is category + gender + building + floor, for example `rukost-male-01-A`. It still does not expose exact room IDs, exact room numbers, resident data, or occupancy personal data.

## Public Safety Rules

- Public availability counts only rooms where `rooms.room_status='vacant'`, `rooms.public_visible=true`, and `room_buildings.public_visible=true`.
- `reserved`, `occupied`, `maintenance`, `requires_review`, and `inactive` rooms are not counted as available.
- Responses use an explicit allowlist of safe fields.
- No tenant names, resident rows, occupancy personal data, import notes, import source rows, audit fields, Smart Lock data, or Payment Gateway data are exposed.
- Exact room IDs, `room_code`, and legacy room numbers are not exposed in public responses.
- Gender filtering is enforced backend-side.
- Invalid `gender`, `category`, `floorCode`, or malformed `buildingCode` query values return HTTP 400 through the global validation pipe.
- Public routes are unauthenticated and protected by a small Redis-backed request rate limit.

## Data Notes

Current inventory state remains:

| Metric | Value |
| --- | ---: |
| Total rooms | 163 |
| RuKost rooms | 123 |
| ApartKost rooms | 40 |
| Male / Putra rooms | 99 |
| Female / Putri rooms | 64 |
| Public visible rooms | 161 |

Public available counts differ from category/gender totals when non-vacant rooms exist. The two occupied ApartKost 18D rooms are not counted as available and are not exposed publicly.

Expected public available totals after M16B backfill:

| Metric | Value |
| --- | ---: |
| Total available | 161 |
| RuKost available | 123 |
| ApartKost available | 38 |
| Male / Putra available | 97 |
| Female / Putri available | 64 |

## Validation Results

Validation completed on 2026-07-07 against a fresh built API on temporary port 3001. The temporary API process was stopped after smoke validation.

| Check | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/api run lint` | PASS | Initial DTO lint issue was fixed; rerun passed |
| `npm --workspace @granada-kost/api run build` | PASS | Nest build passed |
| `GET /api/v1/health` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/summary` | PASS | HTTP 200; totalAvailable 161 |
| `GET /api/v1/public/rooms/availability` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/availability?gender=putra` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/availability?gender=putri` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/availability?category=rukost` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/availability?category=apartkost` | PASS | HTTP 200 |
| `GET /api/v1/public/rooms/availability?gender=random` | PASS | HTTP 400 |
| Public response safety scan | PASS | No tenant/resident/occupancy keys, room IDs, room_code/roomCode, legacy room numbers, import notes/source rows, Payment Gateway data, or Smart Lock data detected |

Smoke summary:

| Metric | Value |
| --- | ---: |
| totalAvailable | 161 |
| RuKost available | 123 |
| ApartKost available | 38 |
| Male / Putra available | 97 |
| Female / Putri available | 64 |

## Files Changed

Backend:

- `backend/api/src/modules/room/dto/public-room-query.dto.ts`
- `backend/api/src/modules/room/public-room.controller.ts`
- `backend/api/src/modules/room/public-room.service.ts`
- `backend/api/src/modules/room/public-room-rate-limiter.service.ts`
- `backend/api/src/modules/room/repositories/room.repository.ts`
- `backend/api/src/modules/room/room.module.ts`
- `backend/api/src/modules/room/types/room.types.ts`

Documentation:

- `docs/16-room-inventory-booking/PUBLIC_ROOM_LISTING_API.md`
- `docs/README.md`

## Next Milestone

M16E - Public Listing UI + WhatsApp CTA.

## Verdict

PASS. Backend implementation is in place with public-safe, aggregated read-only endpoints. API lint/build and endpoint smoke validation passed, including public response safety verification.
