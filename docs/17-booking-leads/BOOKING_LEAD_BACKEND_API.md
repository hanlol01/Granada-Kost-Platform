# M17B - Booking Lead Backend API

> Milestone: M17B - Booking Lead Backend API
> Date: 2026-07-08
> Verdict: PASS
> Scope: Backend-only additive foundation for Booking Lead MVP. Public booking remains NOT production-ready.

## Summary

M17B adds the backend foundation for storing public booking interest leads and managing them from authenticated admin APIs. A booking lead is an expression of interest only. It does not reserve a room, does not create an invoice, does not create an occupancy, does not create a resident account, and does not touch Payment Gateway or Smart Lock flows.

## Migration

Migration file:

- `backend/api/src/infrastructure/database/migrations/014_booking_leads.sql`

Table:

- `booking_leads`

Fields:

| Field | Notes |
| --- | --- |
| `id` | UUID primary key, `gen_random_uuid()` |
| `property_id` | Required FK to `properties(id)` |
| `category` | `rukost` or `apartkost` |
| `gender` | `male` or `female` |
| `building_code` | Nullable aggregated building/unit code |
| `floor_code` | Nullable, `A` or `B` |
| `public_group_key` | Nullable public-safe group key snapshot |
| `visitor_name` | Required, bounded length |
| `visitor_phone` | Required normalized Indonesian WhatsApp digits |
| `visitor_message` | Nullable, bounded length |
| `preferred_move_in_date` | Nullable date |
| `status` | `new`, `contacted`, `visit_scheduled`, `converted`, `rejected`, `expired`; default `new` |
| `source` | MVP value `public_kamar` |
| `metadata` | Nullable JSONB with safe context only |
| `created_at` / `updated_at` | Timestamptz |

Indexes:

- `idx_booking_leads_property_status_created`
- `idx_booking_leads_property_category_gender`
- `idx_booking_leads_visitor_phone_created`
- `idx_booking_leads_public_group_key`

Migration validation:

- `npm --workspace @granada-kost/api run db:migrate` PASS
- Migration rerun PASS, confirming project-style idempotency

## Public API

### `POST /api/v1/public/booking-leads`

Unauthenticated, write-only endpoint for public `/kamar` booking interest.

Example request:

```json
{
  "category": "rukost",
  "gender": "putra",
  "buildingCode": "01",
  "floorCode": "A",
  "publicGroupKey": "rukost-male-01-A",
  "visitorName": "Nama Pengunjung",
  "visitorPhone": "081234567890",
  "visitorMessage": "Saya ingin tanya ketersediaan.",
  "preferredMoveInDate": "2026-08-01"
}
```

Safe response:

```json
{
  "id": "23d7c2a6-ff90-4742-a90d-720edba38fec",
  "status": "new",
  "category": "rukost",
  "gender": "male",
  "createdAt": "2026-07-07T18:25:36.636Z",
  "message": "Terima kasih, admin akan menghubungi Anda via WhatsApp."
}
```

Public response rules:

- Does not echo `visitorMessage`.
- Does not return metadata.
- Does not return property ID.
- Does not return room IDs, `room_code`, `roomCode`, or exact room numbers.
- Does not expose resident, occupancy, invoice, payment, Payment Gateway, or Smart Lock data.

Validation:

- `category`: required `rukost` or `apartkost`.
- `gender`: required `male`, `female`, `putra`, or `putri`; `putra` normalizes to `male`, `putri` normalizes to `female`.
- `buildingCode`: optional uppercase alphanumeric.
- `floorCode`: optional `A` or `B`.
- `publicGroupKey`: optional lower-case safe key.
- `visitorName`: required, trimmed, 2-120 chars.
- `visitorPhone`: required, accepts Indonesian WhatsApp style input with `0` or `+62`, normalized to `62xxxxxxxxxx`.
- `visitorMessage`: optional, control characters removed, whitespace normalized, max 1000 chars.
- `preferredMoveInDate`: optional valid `YYYY-MM-DD`.
- Unknown payload fields are rejected by the global validation pipe, including `roomId`, `roomCode`, and exact room number fields.

Rate limit / duplicate behavior:

- Public create is Redis-backed and limited to 5 requests per 15 minutes per IP bucket.
- Duplicate protection checks same property + normalized phone + category + gender + `public_group_key` within 15 minutes.
- A duplicate returns the existing safe public response and does not insert a second row.

Property resolution:

- Public payload does not accept `propertyId`.
- Backend resolves the property from the public-safe room group context when possible and falls back to the first active property.

## Admin API

### `GET /api/v1/booking-leads`

Authenticated admin/manager endpoint.

Authorization:

- Guarded by JWT + RBAC.
- Roles: `manager`, `admin`.
- Permission: `room.read`.
- Property-scoped with optional `property_id` filter.
- Resident/public/property-owner users are denied.

Filters:

| Query | Notes |
| --- | --- |
| `property_id` | Optional UUID scope |
| `status` | Optional lead status |
| `category` | Optional `rukost` or `apartkost` |
| `gender` | Optional `male` or `female` |
| `dateFrom` | Optional `YYYY-MM-DD` |
| `dateTo` | Optional `YYYY-MM-DD` |
| `search` | Optional visitor name/phone search for admin follow-up |
| `limit` / `offset` | Existing pagination DTO pattern |

Response includes minimum admin follow-up PII:

- `id`
- `propertyId`
- `category`
- `gender`
- `buildingCode`
- `floorCode`
- `publicGroupKey`
- `visitorName`
- `visitorPhone`
- `visitorMessage`
- `preferredMoveInDate`
- `status`
- `source`
- `createdAt`
- `updatedAt`

It does not include payment data, Smart Lock data, room IDs, exact room numbers, or internal metadata.

### `PATCH /api/v1/booking-leads/:leadId/status`

Authenticated admin/manager endpoint.

Authorization:

- Guarded by JWT + RBAC.
- Roles: `manager`, `admin`.
- Permission: `room.manage`.
- Property-scoped by the lead's `property_id`.

Request:

```json
{
  "status": "contacted"
}
```

Status transition rules:

- `new` -> `contacted`, `rejected`, `expired`
- `contacted` -> `visit_scheduled`, `rejected`, `expired`
- `visit_scheduled` -> `converted`, `rejected`, `expired`
- `converted`, `rejected`, and `expired` are terminal in MVP

`converted` is only a manual marker. It does not create a resident, occupancy, invoice, room reservation, or payment transaction.

## Audit / Logging Safety

- Public lead creation writes audit action `booking_lead.create_public`.
- Public audit payload includes lead ID, category, gender, group context, source, and masked phone only.
- Public audit payload does not include visitor message or full phone.
- Admin status updates write audit action `booking_lead.status_update`.
- Admin audit payload includes lead ID and status transition only.
- Normal request logging redacts authorization headers through existing logger config.

## Validation Results

Commands:

| Check | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/api run lint` | PASS | Rerun after date mapper repair |
| `npm --workspace @granada-kost/api run build` | PASS | Fresh Nest build |
| `npm --workspace @granada-kost/api run db:migrate` | PASS | Applied `014_booking_leads.sql` |
| Migration rerun | PASS | Idempotent replay |
| `git diff --check` | PASS | No whitespace errors |

Fresh built API smoke on `http://127.0.0.1:3001/api/v1`:

| Smoke | Result | Notes |
| --- | --- | --- |
| `GET /health` | PASS | HTTP 200 |
| `POST /public/booking-leads` valid payload | PASS | HTTP 201, safe response |
| Invalid category | PASS | HTTP 400 |
| Invalid gender | PASS | HTTP 400 |
| Payload with `roomCode` | PASS | HTTP 400 via unknown-field rejection |
| Duplicate public payload | PASS | HTTP 201 safe existing response; `booking_leads` count remained 1 |
| `GET /booking-leads` without auth | PASS | HTTP 401 |
| `GET /booking-leads` with admin auth | PASS | HTTP 200 |
| `PATCH /booking-leads/:id/status` valid admin status | PASS | HTTP 200 |
| `PATCH /booking-leads/:id/status` invalid status | PASS | HTTP 400 |
| Property-owner/non-admin list access | PASS | HTTP 403 |

Smoke validation created one QA booking lead:

- `booking_leads` count changed from 0 to 1.
- Lead status was updated from `new` to `contacted`.
- This is the only intentional data mutation beyond audit/session records.

## DB Safety Verification

Counts before public/admin smoke:

| Table | Count |
| --- | ---: |
| `rooms` | 163 |
| `residents` | 10 |
| `occupancies` | 8 |
| `invoices` | 8 |
| `payments` | 2 |
| `payment_transactions` | 7 |
| `smart_lock_devices` | 0 |
| `booking_leads` | 0 |
| `audit_logs` | 75 |

Counts after public/admin smoke:

| Table | Count |
| --- | ---: |
| `rooms` | 163 |
| `residents` | 10 |
| `occupancies` | 8 |
| `invoices` | 8 |
| `payments` | 2 |
| `payment_transactions` | 7 |
| `smart_lock_devices` | 0 |
| `booking_leads` | 1 |
| `audit_logs` | 77 |

No existing room, resident, occupancy, invoice, payment, Payment Gateway, or Smart Lock data was mutated.

## Files Changed

Backend:

- `backend/api/src/app.module.ts`
- `backend/api/src/infrastructure/database/migrations/014_booking_leads.sql`
- `backend/api/src/modules/booking-lead/booking-lead.controller.ts`
- `backend/api/src/modules/booking-lead/booking-lead.module.ts`
- `backend/api/src/modules/booking-lead/booking-lead-rate-limiter.service.ts`
- `backend/api/src/modules/booking-lead/booking-lead.service.ts`
- `backend/api/src/modules/booking-lead/public-booking-lead.controller.ts`
- `backend/api/src/modules/booking-lead/dto/create-public-booking-lead.dto.ts`
- `backend/api/src/modules/booking-lead/dto/list-booking-leads-query.dto.ts`
- `backend/api/src/modules/booking-lead/dto/update-booking-lead-status.dto.ts`
- `backend/api/src/modules/booking-lead/repositories/booking-lead.repository.ts`
- `backend/api/src/modules/booking-lead/types/booking-lead.types.ts`

Documentation:

- `docs/17-booking-leads/BOOKING_LEAD_BACKEND_API.md`
- `docs/README.md`

## Explicitly Not Implemented

- No frontend UI.
- No online payment.
- No Payment Gateway booking integration.
- No invoice creation.
- No room reservation.
- No room status mutation.
- No occupancy creation.
- No resident account creation.
- No exact room selection or exact room number exposure publicly.
- No Smart Lock changes.
- No CSV import/backfill.
- No public lead status lookup.
- No automatic lead expiry job.
- No public booking production-ready claim.

## Next Milestone Recommendation

Recommended next milestone: **M17C Public Lead Form UI** if product wants to connect `/kamar` to the new public write endpoint, or **M17C Admin Lead Management UI** if operations needs the admin inbox first. The backend foundation is ready for either path, with public booking still not production-ready and WhatsApp/admin confirmation remaining authoritative.

## Verdict

PASS. M17B backend foundation is implemented, migrated, smoke-tested, and documented. Public lead creation is write-only, rate-limited, duplicate-protected, and PII-safe in public responses. Admin list/status endpoints are authenticated, RBAC-gated, and property-scoped. Existing room/resident/occupancy/invoice/payment/Smart Lock data remained unchanged.
