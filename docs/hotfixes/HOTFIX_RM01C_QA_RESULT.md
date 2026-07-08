# HOTFIX-RM01C QA Result

Date: 2026-07-08
Environment: staging / VPS
Branch: master
Commit at start: e3770e1f421afff00c16f7c641e866eadc7261a4

## Verdict

PASS

HOTFIX-RM01C restored the admin `/rooms` create/edit wiring in source, kept the change scoped to admin room UI plus documentation, and passed lint, typecheck, production builds, API smoke, and whitespace checks after a formatting-only Prettier cleanup.

## Files Changed

Committed RM01C scope from the latest commit:

- `apps/admin/src/routes/rooms.tsx`
- `docs/hotfixes/HOTFIX_RM01C_ADMIN_ROOMS_RECOVERY.md`

QA turn changes:

- `apps/admin/src/routes/rooms.tsx` formatting-only Prettier cleanup
- `docs/hotfixes/HOTFIX_RM01C_QA_RESULT.md`

No backend, public `/kamar`, gallery, payment gateway, smart lock, CSV import, migration, or database files were modified.

## Static Validation Checklist

| Check | Result |
| --- | --- |
| `RoomFormDialog` imported | PASS |
| `useAuth` / permission helper used | PASS |
| `Tambah Kamar` button exists in `AppShell` actions | PASS |
| `createOpen` state exists | PASS |
| `editTarget` state exists | PASS |
| `RoomFormDialog` create mode rendered | PASS |
| `RoomFormDialog` edit mode rendered | PASS |
| `FloorRoomTable` has `Aksi` column | PASS |
| Pencil/Edit button calls `onEdit(room)` | PASS |
| `onEdit` threaded `RoomsPage -> CategoryInventory -> BuildingGroup -> FloorRoomTable` | PASS |
| Stale M16F/Booking Lead Deferred copy removed from `rooms.tsx` | PASS |

## Visibility Hardening

| Check | Result |
| --- | --- |
| `buildStats()` uses `room.publicVisible === true` | PASS |
| `publicVisibleUnknown` tracked | PASS |
| `isPublicVacant()` uses `room.publicVisible === true` | PASS |
| `filterRooms()` uses explicit visibility checks | PASS |
| No public visibility toggle added | PASS |

## Command Results

| Command | Result | Notes |
| --- | --- | --- |
| `git diff --check` | PASS | No whitespace errors |
| `npm --workspace @granada-kost/admin run lint` | PASS | 0 errors, existing warnings only |
| `npm --workspace @granada-kost/admin run typecheck` | PASS | `tsc --noEmit` succeeded |
| `npm --workspace @granada-kost/admin run build` | PASS | Fresh admin client/server build generated |
| `npm --workspace @granada-kost/api run build` | PASS | Fresh API build generated |
| `npm --workspace @granada-kost/penghuni run build` | PASS | Fresh penghuni client/server build generated |
| `sudo systemctl restart granada-admin.service` | PASS | Admin SSR restarted on port 3100 |
| `sudo systemctl restart granada-penghuni.service` | PASS | Penghuni SSR restarted on port 3101 |

Initial admin lint found 6 Prettier errors in `apps/admin/src/routes/rooms.tsx`. They were corrected with local Prettier formatting only; no behavior or feature logic was changed.

## API Smoke Results

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET /api/v1/health` | 200 | 200 | PASS |
| `GET /api/v1/public/hunian-catalog` | 200 | 200 | PASS |
| `GET /api/v1/public/rooms/summary` | 200 | 200 | PASS |
| `GET /api/v1/booking-leads` unauth | 401 | 401 | PASS |
| `GET /api/v1/hunian-gallery` unauth | 401 | 401 | PASS |

Observed public data:

```text
public/hunian-catalog summary: totalItems=42, totalAvailable=161
public/rooms/summary totalAvailable=161
public/rooms/summary Rumah Kost=123
public/rooms/summary Apart Kost=38
```

## Frontend Freshness Smoke

| Target | Actual | Result |
| --- | --- | --- |
| `granada-admin.service` | active, PID 249492 | PASS |
| `granada-penghuni.service` | active, PID 249592 | PASS |
| `GET https://kelola.kostation.web.id/rooms` | 200 | PASS |
| `GET https://app.kostation.web.id/kamar` | 200 | PASS |

## Stale Copy Scan

`apps/admin/src/routes/rooms.tsx` contains none of:

- `Booking Lead Deferred`
- `M16F diperlukan`
- `Lead WhatsApp belum disimpan`

Those phrases remain only in the RM01C recovery document as historical "removed stale copy" notes.

## Safety Scan

PASS

No backend files changed.
No public `/kamar` files changed.
No M19 gallery files changed.
No Payment Gateway files changed.
No Smart Lock files changed.
No migration or CSV import/backfill was run.
No database mutation was performed.
No public visibility toggle was added.

## Browser Limitation

Browser functional QA not executed due VPS browser tooling policy.

Playwright/Puppeteer/Chromium was not installed. Validation was completed through source inspection, lint, typecheck, production builds, and live API smoke tests.

## Final Recommendation

The admin and penghuni frontend services have been restarted after the fresh builds. Perform a manual browser check with an authenticated admin session:

- `/rooms` loads without session/loading hang
- `Tambah Kamar` opens create dialog
- Pencil action opens edit dialog on room rows
- Ketersediaan shows public visibility stats consistent with RM01B data
- No stale M16F copy appears
