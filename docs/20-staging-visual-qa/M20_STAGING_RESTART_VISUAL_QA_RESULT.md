# M20B - VPS Deployment Smoke Validation Result

Date: 2026-07-08  
Branch: `m20b-vps-smoke-validation`  
Commit: `29584c0`  
Verdict: **M20 PASS with browser visual limitation**

## Scope

This was a validation-only pass for the M20 staging restart / deployment smoke checklist. No application source code was changed.

Explicitly not done:

- No new feature implementation.
- No Payment Gateway changes.
- No Smart Lock changes.
- No payment booking.
- No exact room selection.
- No video gallery.
- No public upload.
- No CSV import/backfill.
- No intentional room inventory mutation.
- No production-ready claim.
- No browser/Playwright/Puppeteer install.

## Git State

| Check | Result |
| --- | --- |
| Branch | `m20b-vps-smoke-validation` |
| Initial status | Clean |
| Commit | `29584c0` |

## Documentation Freshness

M18, M19, and M20A documentation were present and indexed before this validation:

- `docs/18-public-hunian-catalog/`
- `docs/19-hunian-gallery/`
- `docs/20-staging-visual-qa/M20_STAGING_RESTART_VISUAL_QA_PLAN.md`

This result document records the M20B execution evidence.

## Validation Commands

| Command | Result |
| --- | --- |
| `npm --workspace @granada-kost/api run build` | PASS |
| `npm --workspace @granada-kost/admin run build` | PASS |
| `npm --workspace @granada-kost/penghuni run build` | PASS |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/admin run typecheck` | PASS |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS |
| `git diff --check` | PASS |

Notes:

- Admin build included the `hunian-gallery` bundle.
- Penghuni build included `/kamar`, `/kamar/$slug`, and public gallery bundles.

## Migration Validation

| Check | Result |
| --- | --- |
| `npm run db:migrate:api` | PASS |
| Migration replay / idempotency | PASS |
| `015_hunian_gallery.sql` | Applied |
| CSV import/backfill | Not run |
| Room inventory mutation | Not performed |

The migration runner completed through migration `015_hunian_gallery.sql` and replayed cleanly.

## Fresh API Restart Evidence

A fresh API process was started from the built backend output on port `3001`:

```text
PORT=3001 node dist/main.js
```

The process logged that Granada Kost API was listening at:

```text
http://127.0.0.1:3001/api/v1
```

Route mapping confirmed M18/M19 routes were registered, including:

- `/api/v1/public/rooms/summary`
- `/api/v1/public/hunian-catalog`
- `/api/v1/public/hunian-catalog/:slug`
- `/api/v1/hunian-gallery`
- `/api/v1/public/hunian-gallery/:imageId/content`
- `/api/v1/public/booking-leads`

## API Smoke Results

Smoke target: `http://127.0.0.1:3001/api/v1`

| Endpoint / Check | Result |
| --- | --- |
| `GET /health` | 200 |
| `GET /public/hunian-catalog` | 200 |
| Catalog item count | 42 |
| Sample slug | `apartkost-putri-unit-05a-lantai-b` |
| `GET /public/hunian-catalog/:slug` | 200 |
| `GET /public/rooms/summary` | 200 |
| Invalid `POST /public/booking-leads` | 400 |
| Unauthenticated `GET /hunian-gallery` | 401 |
| Public catalog `galleryPreview` | Array present |
| Public detail `gallery` | Array present |
| Public response leak scan | PASS, no forbidden terms found |

Forbidden-term scan covered public catalog list/detail smoke responses for room IDs, room codes, exact room numbers, tenant/resident/occupancy PII, storage paths, Payment Gateway data, and Smart Lock data.

## Admin Static Smoke

Source/build inspection confirmed:

- Admin route `/hunian-gallery` exists.
- Admin nav item "Galeri Hunian" exists.
- Upload purpose uses `hunian_gallery`.
- Client-side file policy accepts JPEG/PNG/WebP only.
- Client-side limit is 3 MB per image and 10 images per catalog item.
- Admin UI uses public-safe catalog item selection, not exact rooms.
- No public upload route was introduced.
- No Payment Gateway or Smart Lock source was touched.

Authenticated admin browser/API smoke was skipped because no admin token/browser tooling was available in this pass.

## Public Static Smoke

Source/build inspection confirmed:

- `/kamar` route remains public.
- `/kamar/$slug` route remains public via `/kamar/` AuthGuard bypass.
- Listing cards consume `galleryPreview`.
- Detail page uses the public gallery component with placeholder/fallback behavior.
- Booking lead CTA remains available.
- WhatsApp CTA remains available or safely disabled by env.
- No payment booking UI was added.
- No exact room selection UI was added.
- No public upload or video gallery was added.

## Storage and Media Checks

| Check | Result |
| --- | --- |
| `UPLOAD_STORAGE_PATH` in API env | `/var/lib/granada-kost/uploads` |
| Actual upload directory | Exists |
| Actual upload directory mode/owner | `drwxr-xr-x ubuntu ubuntu /var/lib/granada-kost/uploads` |
| Writable check | PASS |
| Public media route registered | PASS |
| Published media content smoke | SKIPPED - no published gallery sample exists |

Because no published gallery image existed in the smoke dataset, public media `200`/header validation could not be performed. This is recorded as a limitation, not a failure.

## Safety and Privacy Review

PASS:

- No public exposure of exact room numbers.
- No public exposure of internal room IDs.
- No public exposure of `room_code` / `roomCode`.
- No tenant/resident/occupancy PII in public smoke responses.
- No `storage_path` or filesystem path in public smoke responses.
- No internal `fileId` in public smoke responses.
- No Payment Gateway data exposure.
- No Smart Lock data exposure.
- Public gallery remains read-only.
- Public upload remains unavailable.
- Gallery images remain attached to catalog items/groups, not exact rooms.
- `publicVisible` remains the publication gate.

Static scan hits for sensitive terms were reviewed as documentation prohibitions, internal backend fields, or admin-only implementation details. Public API smoke responses did not include those fields.

## Browser Visual QA Limitation

Browser visual QA was intentionally not executed in this pass because browser tooling is not available on the VPS and this task explicitly disallowed installing Chromium, Firefox, Playwright, or Puppeteer.

Skipped browser items:

- Admin `/hunian-gallery` visual walkthrough.
- Public `/kamar` visual walkthrough.
- Public `/kamar/$slug` visual walkthrough.
- Lightbox screenshot capture.
- Mobile/desktop screenshot comparison.

## Known Limitations

- Browser visual QA remains deferred.
- No published gallery image sample existed, so public media content/header smoke was skipped.
- `thumbnailUrl` remains nullable; thumbnail/image optimization pipeline is still deferred.
- Manual admin image review SOP remains required before publishing photos.
- This pass does not claim production readiness.

## Final Verdict

**M20 PASS with browser visual limitation.**

M20 closes the M18/M19 staging restart and deployment smoke cycle for non-browser validation. The platform remains **not production-ready** until production release approvals, browser visual QA, storage policy hardening, and remaining production blockers are explicitly closed.
