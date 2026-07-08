# M19B - Hunian Gallery Backend API / File Attachment

> Date: 2026-07-08
> Branch: m19b-backend-gallery-api
> Verdict: PASS
> Scope: Backend API, additive migration, file purpose support, public catalog wiring, documentation.

## Summary

M19B adds the backend layer for public hunian gallery images.

Gallery images attach to public hunian catalog items identified by `catalogSlug` and `publicGroupKey`. They do not attach to exact rooms. Public responses only expose public-safe gallery fields and never expose internal file paths, `storage_path`, internal `fileId`, room IDs, `room_code`, exact room numbers, tenant/resident/occupancy PII, payment data, or Smart Lock/PALOMA data.

No frontend/admin UI was implemented. No public upload was added. No Payment Gateway or Smart Lock code was changed.

## Migration / Schema

Added migration:

- `backend/api/src/infrastructure/database/migrations/015_hunian_gallery.sql`

Migration behavior:

- Extends `files.file_purpose` allowlist with `hunian_gallery`.
- Extends `files.mime_type` and `files.file_extension` constraints with WebP support.
- Creates `hunian_gallery_images` with:
  - property scope: `property_id`
  - public catalog binding: `catalog_slug`, `public_group_key`, `category`, `gender`, `building_code`, `floor_code`
  - file attachment: internal `file_id` FK to `files`
  - public metadata: `alt_text`, `caption`, `sort_order`, `is_cover`, `public_visible`
  - audit/lifecycle fields: `created_by`, `updated_by`, `deleted_at`, `deleted_by`, timestamps
- Adds indexes for property/catalog/group/public visibility/file lookup.
- Adds unique active file attachment per catalog item.
- Adds single-cover partial unique index per `property_id + catalog_slug`.

Service rules:

- Max 10 active images per catalog item.
- `publicVisible` defaults to `false`.
- `set-cover` unsets other covers for the same catalog item before marking the selected image.
- Delete soft-deletes the gallery row and does not delete the underlying file automatically.

## File Purpose

The existing M12 `POST /api/v1/files` flow is reused.

New purpose:

- `hunian_gallery`

Policy:

- JPEG, PNG, WebP only.
- Max 3 MB per image.
- MIME type and magic bytes are validated by the existing file pipeline.
- SVG, video, PDF, documents, executables, and spoofed MIME/extensions are rejected.
- `property_owner` is explicitly denied for `hunian_gallery` upload even though the role can read scoped files elsewhere.

Existing upload purposes remain compatible. Smoke validation confirmed `complaint_attachment` and `payment_proof` uploads still work.

## Endpoints

### Admin / Management

All management endpoints require JWT + RBAC + property scope.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/hunian-gallery` | List scoped gallery images, including unpublished |
| POST | `/api/v1/hunian-gallery` | Attach uploaded `hunian_gallery` file to a catalog item |
| PATCH | `/api/v1/hunian-gallery/:imageId` | Update `altText`, `caption`, `publicVisible`, `sortOrder` |
| POST | `/api/v1/hunian-gallery/:imageId/set-cover` | Set one cover per catalog item |
| POST | `/api/v1/hunian-gallery/reorder` | Batch reorder images within one catalog item |
| DELETE | `/api/v1/hunian-gallery/:imageId` | Soft-delete gallery attachment |

Query filters for list:

- `property_id`
- `catalogSlug`
- `publicGroupKey`
- `category=rukost|apartkost`
- `gender=male|female`

Admin response allowlist:

- `id`
- `catalogSlug`
- `publicGroupKey`
- `category`
- `gender`
- `buildingCode`
- `floorCode`
- `fileId` (admin-only)
- `contentUrl` (authorized `/files/:fileId/content` path)
- `thumbnailUrl`
- `altText`
- `caption`
- `sortOrder`
- `isCover`
- `publicVisible`
- `createdAt`
- `updatedAt`

No admin response includes `storage_path` or filesystem path.

### Public Media

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/public/hunian-gallery/:imageId/content` | Serve bytes for published gallery images only |

Public media behavior:

- No auth required.
- Rate-limited with Redis.
- Serves bytes only when the gallery image is active, `publicVisible=true`, the linked file is active, and file purpose is `hunian_gallery`.
- Unpublished, deleted, missing, or wrong-purpose images return 404.
- Returns `Content-Type`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and public cache header.
- Never exposes storage path or filesystem path.

## Public Catalog Wiring

Updated existing M18 endpoints:

- `GET /api/v1/public/hunian-catalog`
- `GET /api/v1/public/hunian-catalog/:slug`

List behavior:

- `galleryPreview` contains the cover image or first public-visible image only.
- Empty gallery remains `[]`, so existing placeholder UI continues to work.

Detail behavior:

- `gallery` contains all public-visible images for the slug.
- Ordering is cover first, then `sortOrder`, then `createdAt`.

Public image response allowlist:

- `id`
- `contentUrl`
- `thumbnailUrl`
- `altText`
- `caption`
- `sortOrder`
- `isCover`

Public response explicitly excludes:

- internal `fileId`
- `storage_path` / filesystem path
- room ID / `room_code` / exact room number
- uploader identity
- property internals
- tenant/resident/occupancy PII
- invoice/payment/bank data
- Smart Lock/PALOMA data

## RBAC / Property Scope

| Role | Management read | Upload/attach/manage | Public view |
| --- | --- | --- | --- |
| `owner` | Allowed | Allowed | Allowed |
| `manager` | Allowed in scope | Allowed in scope | Allowed |
| `admin` | Allowed in scope | Allowed in scope | Allowed |
| `property_owner` | Allowed in scope, read-only | Denied | Allowed |
| Public / Penghuni | Public-visible images only | Denied | Allowed |

Backend enforces role and property scope. Frontend RBAC remains UX-only.

## Validation Results

Commands:

| Check | Result |
| --- | --- |
| `npm --workspace @granada-kost/api run lint` | PASS |
| `npm --workspace @granada-kost/api run build` | PASS |
| `npm --workspace @granada-kost/api run test` | Not available; no test script in `backend/api/package.json` |
| `npm --workspace @granada-kost/api run db:migrate` | PASS |
| migration replay / idempotency | PASS |
| `git diff --check` | PASS |

Temporary API smoke ran on port `3001` from the fresh build.

| Smoke | Result |
| --- | --- |
| `GET /api/v1/health` | 200 |
| unauth `GET /api/v1/hunian-gallery` | 401 |
| admin `GET /api/v1/hunian-gallery` | 200 |
| property owner `GET /api/v1/hunian-gallery` | 200 |
| property owner `POST /api/v1/hunian-gallery` | 403 |
| invalid admin category filter | 400 |
| POST missing `fileId` | 400 |
| POST invalid `fileId` | 400 |
| upload `hunian_gallery` PNG | 201 |
| attach gallery image | 201 |
| default `publicVisible=false` | PASS |
| unpublished image hidden from public detail | PASS |
| PATCH metadata / publish | 200 |
| set cover | 201 |
| reorder | 201 |
| public detail includes published gallery | 200 / PASS |
| public media for published image | 200 |
| delete gallery attachment | 200 |
| public media after delete | 404 |
| delete temporary file | 200 |
| upload `complaint_attachment` | 201 |
| upload `payment_proof` | 201 |
| attach non-`hunian_gallery` file rejected | 400 |

Regression smoke:

| Smoke | Result |
| --- | --- |
| `GET /api/v1/public/hunian-catalog` | 200 |
| valid detail slug | 200 |
| invalid catalog gender filter | 400 |
| missing public gallery content id | 404 |
| `GET /api/v1/public/rooms/summary` | 200 |
| invalid `POST /api/v1/public/booking-leads {}` | 400 |

Safety scan:

- Public catalog list/detail responses scanned for forbidden terms/keys: PASS.
- No `storage_path`, `file_path`, `fileId`, `storagePath`, room ID, `room_code`, exact room number key, tenant/resident/occupancy, invoice, `paymentStatus`, bank/rekening, Smart Lock/PALOMA, or `BSI 7318321153` was found.

Temporary smoke records:

- One gallery image and temporary file were created during lifecycle smoke and then deleted/soft-deleted.
- Compatibility upload smoke files were also deleted/soft-deleted.
- No room inventory data was mutated.
- No CSV import/backfill was run.

## Files Changed

Backend:

- `backend/api/src/infrastructure/database/migrations/015_hunian_gallery.sql`
- `backend/api/src/app.module.ts`
- `backend/api/src/modules/file/constants/file.constants.ts`
- `backend/api/src/modules/file/file.service.ts`
- `backend/api/src/modules/file/types/file.types.ts`
- `backend/api/src/modules/hunian-gallery/**`
- `backend/api/src/modules/room/public-hunian-catalog.service.ts`
- `backend/api/src/modules/room/repositories/room.repository.ts`
- `backend/api/src/modules/room/room.module.ts`
- `backend/api/src/modules/room/types/public-hunian-catalog.types.ts`
- `backend/api/src/modules/room/types/room.types.ts`

Documentation:

- `docs/19-hunian-gallery/HUNIAN_GALLERY_BACKEND_API.md`
- `docs/README.md`
- `docs/00-project/ROADMAP.md`
- `docs/00-project/PROJECT_MASTER.md`
- `docs/00-project/PROJECT_HANDOFF.md`

## Known Limitations

- No admin frontend was implemented. Admin UI is deferred to M19C.
- No public frontend gallery UI was implemented. Public UI integration is deferred to M19D.
- No thumbnail generation or EXIF stripping pipeline was added; `thumbnailUrl` is currently `null`.
- No CDN/S3/public signed URL behavior was added; content remains backend-mediated.
- Public booking remains NOT production-ready.

## Safety Summary

- No Payment Gateway changes.
- No Smart Lock changes.
- No public upload.
- No video upload.
- No exact room selection.
- No room inventory backfill/import.
- No `storage_path` or filesystem path exposure.
- No public internal `fileId` exposure.
- No room ID / `room_code` / exact room number exposure.
- No tenant/resident/occupancy PII exposure.
- No invoice/payment/bank exposure.
- No Smart Lock/PALOMA exposure.

## Next Milestone

M19C - Admin Gallery Upload & Management UI for `/hunian-gallery`.

## Verdict

PASS. M19B backend Hunian Gallery API and file attachment layer are implemented and validated as an additive backend milestone.
