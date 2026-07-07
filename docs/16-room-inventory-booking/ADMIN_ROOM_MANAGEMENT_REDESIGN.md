# M16C - Admin Room Management Redesign

> Milestone: M16C - Admin Room Management Redesign
> Date: 2026-07-07
> Verdict: PASS

## Scope

M16C redesigns the existing Admin Kamar route to consume the M16B backfilled room inventory data. The implementation keeps the existing /api/v1/rooms contract compatible while adding inventory fields for admin-only usage.

Implemented scope:

- Admin /rooms now uses in-page tabs: Ringkasan, Rumah Kost, Apart Kost, and Ketersediaan.
- Ringkasan shows total rooms, category totals, gender totals, vacant, occupied, reserved, maintenance/requires_review, public visible, and building/unit totals.
- Rumah Kost and Apart Kost tabs provide filters for gender, building/unit code, floor A/B, status, public visibility, and search by room code, legacy number, building, or floor.
- Category tabs group rooms by category -> building/unit -> floor and render admin inventory tables.
- Ketersediaan tab shows lightweight availability counts and explicitly marks booking lead management as deferred.
- Backend /api/v1/rooms response is extended additively with roomCode, category, buildingId, buildingCode, buildingName, floorCode, floorLabel, publicVisible, and yearlyPrice.
- Existing legacy room response keys are preserved.
- Admin report selectors now tolerate requires_review and include it in the existing maintenance bucket.

## Explicit Non-goals

- No CSV import or backfill was run.
- No database mutation was intentionally executed.
- No room deletion, recreation, seed execution, public listing API, public website, or booking lead storage was implemented.
- Payment Gateway files and behavior were not changed.
- Smart Lock files and behavior were not changed.
- No tenant PII is exposed in the redesigned admin room inventory view.
- Public booking remains not production-ready.

## Files Changed

Backend:

- backend/api/src/modules/room/types/room.types.ts
- backend/api/src/modules/room/repositories/room.repository.ts
- backend/api/src/modules/room/dto/list-rooms-query.dto.ts
- backend/api/src/modules/room/dto/update-room.dto.ts

Admin frontend:

- apps/admin/src/hooks/useRooms.ts
- apps/admin/src/routes/rooms.tsx
- apps/admin/src/lib/reports-selectors.ts

Documentation:

- docs/16-room-inventory-booking/ADMIN_ROOM_MANAGEMENT_REDESIGN.md
- docs/README.md

## API Compatibility

Legacy keys preserved in /api/v1/rooms:

- id
- propertyId
- roomTypeId
- number
- unitCode
- genderPolicy
- floor
- monthlyPrice
- depositAmount
- roomStatus
- facilities

Inventory keys added:

- roomCode
- category
- buildingId
- buildingCode
- buildingName
- floorCode
- floorLabel
- publicVisible
- yearlyPrice

The status type also accepts requires_review for admin visibility and future import-review rows.

## Validation

Technical validation performed on 2026-07-07:

- API lint: PASS - npm --workspace @granada-kost/api run lint
- API build: PASS - npm --workspace @granada-kost/api run build
- Admin lint: PASS - npm --workspace @granada-kost/admin run lint. Existing repository warnings remain, with 0 errors.
- Admin typecheck: PASS - npm --workspace @granada-kost/admin run typecheck
- Admin build: PASS - npm --workspace @granada-kost/admin run build
- Health smoke on existing localhost:3000 API: PASS - HTTP 200, database up, redis up.
- Authenticated rooms smoke on existing localhost:3000 API: PASS - login 201, rooms 200, roomCount 163, legacy keys present, no API 500.
- Temporary built API smoke on localhost:3001: PASS - health 200, rooms 200, roomCount 163, legacy keys present, inventory keys present, categories apartkost and rukost present, no API 500.

The temporary API process on port 3001 was stopped after validation. The long-running process on port 3000 was not restarted during this milestone.

Browser screenshot QA was not performed in this run. The admin route was validated through lint, typecheck, and production build.

## Safety Notes

- Room IDs remain preserved by the prior M16B-4B backfill; M16C does not alter IDs or execute import logic.
- The authenticated rooms smoke confirms the admin API still returns 163 rooms.
- The UI only consumes room inventory fields and facility names; it does not request or render occupancy identity, resident names, phone numbers, or tenant PII.
- The Ketersediaan tab is intentionally read-only and does not create booking leads.

## Deferred

- Nested sidebar dropdown can be revisited later; M16C uses the approved fallback of tabs inside the Kamar page.
- Public listing API and public website remain M16D/M16E work.
- Stored booking leads and admin lead management remain M16F work.
- Public booking production readiness remains blocked until later QA and release milestones.
