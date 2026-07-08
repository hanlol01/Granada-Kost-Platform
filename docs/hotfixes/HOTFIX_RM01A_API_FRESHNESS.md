# HOTFIX-RM01A API Freshness / Route Deployment Fix

Date: 2026-07-08
Environment: staging / api.kostation.web.id
Branch: master
Commit: 0765d6eaee73d1cdcf8505b114e7bd527ff74d78

## Verdict

PASS

The stale API route issue was fixed by rebuilding the API, confirming migrations, and restarting the deployed systemd service that serves `api.kostation.web.id`.

## Scope

No application feature code was changed.
No room visibility data was changed.
No CSV import or backfill was run.
No Payment Gateway or Smart Lock code was modified.

Files changed:

- `docs/hotfixes/HOTFIX_RM01A_API_FRESHNESS.md`

## Pre-Fix Finding

The live API health endpoint returned 200, but newly added M17/M18/M19 routes returned 404:

- `GET /api/v1/public/hunian-catalog`
- `GET /api/v1/public/rooms/summary`
- `GET /api/v1/booking-leads`
- `GET /api/v1/hunian-gallery`

Source inspection showed those controllers/routes existed in the current codebase, so the live process was likely serving an older build.

## Build Result

Command:

```bash
npm --workspace @granada-kost/api run build
```

Result: PASS

Output summary:

```text
> @granada-kost/api@0.1.0 build
> nest build
```

## Migration Result

Command:

```bash
npm --workspace @granada-kost/api run db:migrate
```

Result: PASS

The migration runner completed successfully and reported migrations through:

- `013_room_inventory.sql`
- `014_booking_leads.sql`
- `015_hunian_gallery.sql`

## Restart Method

Command:

```bash
sudo systemctl restart granada-api.service
```

Result: PASS

Service after restart:

```text
granada-api.service - Granada Kost API
Active: active (running) since Wed 2026-07-08 21:52:47 WIB
Main PID: 139634 (node)
Command: /usr/bin/node dist/main.js
WorkingDirectory: /var/www/granada-kost-platform/backend/api
```

Startup logs confirmed the fresh process mapped the target routes, including:

- `/api/v1/public/booking-leads`
- `/api/v1/booking-leads`
- `/api/v1/health`

## Live Smoke Results

| Endpoint | Expected | Actual | Result |
| --- | --- | --- | --- |
| `GET https://api.kostation.web.id/api/v1/health` | 200 | 200 | PASS |
| `GET https://api.kostation.web.id/api/v1/public/hunian-catalog` | 200 | 200 | PASS |
| `GET https://api.kostation.web.id/api/v1/public/rooms/summary` | 200 | 200 | PASS |
| `GET https://api.kostation.web.id/api/v1/booking-leads` | 401 unauthenticated, not 404 | 401 | PASS |
| `GET https://api.kostation.web.id/api/v1/hunian-gallery` | 401 unauthenticated, not 404 | 401 | PASS |

Useful response details:

```text
public/hunian-catalog summary: totalItems=42, totalAvailable=161
public/rooms/summary totalAvailable=161
public/rooms/summary Rumah Kost=123
public/rooms/summary Apart Kost=38
booking-leads unauthenticated error code: UNAUTHENTICATED
hunian-gallery unauthenticated error code: UNAUTHENTICATED
```

## Root Cause

The staging API service process was stale. The source tree and build output contained the M17/M18/M19 route code, but the live systemd process had been running since before the latest route deployment and was still serving an older API build.

Restarting `granada-api.service` after a successful API build and migration check loaded the current `dist/main.js` and restored the expected routes.

## Final Recommendation

Keep API deployment as an explicit sequence:

```bash
npm --workspace @granada-kost/api run build
npm --workspace @granada-kost/api run db:migrate
sudo systemctl restart granada-api.service
```

After every API deploy, run smoke checks for:

- `/api/v1/health`
- `/api/v1/public/hunian-catalog`
- `/api/v1/public/rooms/summary`
- `/api/v1/booking-leads`
- `/api/v1/hunian-gallery`

The separate admin `/rooms` management/edit UI regression remains a frontend/source recovery task and was not changed by this hotfix.
