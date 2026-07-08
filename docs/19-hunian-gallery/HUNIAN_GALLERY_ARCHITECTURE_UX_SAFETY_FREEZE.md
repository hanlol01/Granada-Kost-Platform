# M19A - Hunian Gallery Architecture / UX / Safety Freeze

> Milestone: M19A - Hunian Gallery Architecture / UX / Safety Freeze
> Date: 2026-07-08
> Verdict: FROZEN (binding for M19B and later milestones)
> Scope: Documentation/freeze only. No application source code changes, no migrations, no seed, no QA execution, no Payment Gateway changes, no Smart Lock changes.
> Binding statement: **Gallery images belong to public hunian/unit/group catalog items, never exact rooms. Public booking remains NOT production-ready.**

## 0. Purpose / Base State

M19 adds gallery upload, management, and modern public preview for the M18 public hunian catalog. Base state (complete, unchanged by this freeze): public catalog API `GET /api/v1/public/hunian-catalog[/:slug]` (M18B), modern `/kamar` listing (M18C), public detail `/kamar/$slug` (M18D), booking lead CTA (M17D), WhatsApp CTA (M16E), and the M12 backend-mediated file upload foundation (ADR-BE-FILE-001). Gallery fields (`galleryPreview`, `gallery`) are currently schema-ready empty arrays with safe UI placeholders.

Core decision (frozen): **gallery images attach to public hunian/unit/group catalog items** (e.g. "Rumah Kost Putra - Unit 01", "Apart Kost Putri - Unit B"), identified by `catalogSlug` / `publicGroupKey` - **never to exact room numbers, `roomId`, or `room_code`**.

## 1. Gallery Product Model (Frozen)

A **Hunian Gallery Image** is a public-safe image attached to one hunian/unit/group catalog item. Conceptual model (storage design details belong to M19B; must remain additive):

| Field | Type | Visibility | Notes |
| --- | --- | --- | --- |
| `id` | uuid | internal + public-safe media id | Stable id; the only identifier public responses may reference |
| `propertyId` | uuid | internal only | Property scope enforcement |
| `catalogSlug` | string | public-safe | Links to `/kamar/$slug` catalog item |
| `publicGroupKey` | string | public-safe group key | M16D/M18B family (e.g. `rukost-male-01-A`); never derived from room ids |
| `category` | `rukost` \| `apartkost` | public-safe | |
| `gender` | `male` \| `female` | public-safe | |
| `buildingCode` | string, nullable | only if safe | Aggregated building/unit code per M16A posture |
| `floorCode` | string, nullable | only if safe | `A` \| `B` when applicable |
| `fileId` | uuid | internal only | FK to M12 `files` table; never exposed publicly |
| `publicUrl` / content endpoint reference | string | public | Safe mediated content endpoint path only; never a storage URL |
| `thumbnailUrl` | string, nullable | public | Optimized variant endpoint path if generated |
| `blurPlaceholder` | string, nullable | public | Tiny inline placeholder (e.g. base64 blur) if practical |
| `altText` | string | public | Required (or generated; see Section 7) |
| `caption` | string, nullable | public | Optional public-safe caption |
| `sortOrder` | int | public | Reorder support |
| `isCover` | boolean | public | One cover per catalog item (enforced backend) |
| `publicVisible` | boolean | internal (drives public filtering) | Default `false`; publishing is explicit |
| `createdBy` | uuid | internal only | Uploader reference for audit; never public |
| `createdAt` / `updatedAt` | timestamp | internal only | |

**Public response allowlist (frozen).** Public catalog responses may include per image ONLY:

- public image id (stable public media id)
- `publicUrl` / `contentUrl` (safe mediated endpoint)
- `thumbnailUrl`
- `altText`
- `caption`
- `sortOrder`
- `isCover`

**Public response must NOT include (frozen):**

- internal file path / `storage_path` / any file system path
- internal `fileId`, checksum, MIME internals, or size metadata
- internal room id / `room_code` / exact room number
- uploader identity or any PII
- private metadata (audit fields, timestamps, property internals)

Anything not in the allowlist is not public.

## 2. Role / Permission Matrix (Frozen)

| Role | Upload | Manage (publish/cover/reorder/caption/delete) | View management list (incl. unpublished) | View public gallery |
| --- | --- | --- | --- | --- |
| Super Admin | ✅ all scoped properties | ✅ | ✅ | ✅ |
| Admin | ✅ within assigned/scoped property | ✅ within scope | ✅ within scope | ✅ |
| Owner/Pemilik (if role exists) | ❌ | ❌ (no upload/delete unless explicitly allowed later) | ✅ view-only, scoped | ✅ |
| Penghuni | ❌ | ❌ | ❌ | ✅ (public gallery only) |
| Public visitor | ❌ | ❌ | ❌ | ✅ `publicVisible` images only, no login |
| Reporter / other roles | ❌ unless already permitted by existing project policy | ❌ | ❌ | ✅ public only |

Binding: **backend enforces role AND property scope** on every gallery mutation and management read. Frontend RBAC is UX-only, consistent with existing project posture.

## 3. Backend API Recommendation (Frozen)

### 3.1 Upload path decision

**Frozen: Option A - reuse the existing M12 file upload foundation.**

1. Admin uploads the image via the existing `POST /api/v1/files` with a new purpose **`hunian_gallery`** (additive purpose allowlist extension; inherits MIME allowlist, magic-byte validation, dangerous-extension blocklist, SHA256 checksum, size ceilings, rate limits, audit, soft delete, storage provider abstraction).
2. Admin attaches the returned `fileId` to a `catalogSlug`/`publicGroupKey` via the gallery API below.

No dedicated gallery upload endpoint is created unless M19B discovers a blocking constraint; any deviation requires a documented addendum.

### 3.2 Admin endpoints (JWT + RBAC admin/super admin, property-scoped, audited)

- `GET /api/v1/hunian-gallery?catalogSlug=&publicGroupKey=&category=&gender=` - management list, includes unpublished
- `POST /api/v1/hunian-gallery` - attach uploaded `fileId` to a catalog item (`catalogSlug`/`publicGroupKey`, `altText`, optional `caption`)
- `PATCH /api/v1/hunian-gallery/:id` - update `altText`, `caption`, `publicVisible`
- `POST /api/v1/hunian-gallery/:id/set-cover` - atomic single-cover enforcement per catalog item
- `POST /api/v1/hunian-gallery/reorder` - batch `sortOrder` update within one catalog item
- `DELETE /api/v1/hunian-gallery/:id` - soft delete (consistent with M12 `files` lifecycle)

### 3.3 Public endpoints

- Existing `GET /api/v1/public/hunian-catalog` includes `galleryPreview` built from `publicVisible` cover/first images (allowlisted shape from Section 1).
- Existing `GET /api/v1/public/hunian-catalog/:slug` includes the full `gallery` array, `publicVisible` only, ordered by `sortOrder`, cover first.
- Public image content is served through a safe mediated content endpoint (recommended: `GET /api/v1/public/hunian-gallery/:id/content` with optional thumbnail variant), rate-limited like existing public endpoints; returns bytes only when the image is `publicVisible` and not deleted; unknown/unpublished ids return 404 with no probing feedback.
- **No new public upload endpoint. No public write path of any kind.**

## 4. Storage / Image Policy (Frozen)

- **Image-only.** Allowed formats: **JPEG, PNG, WebP**. No video in M19. No executables. No PDF for this purpose. **SVG deferred** (not allowed unless a sanitization pipeline exists; see Section 9).
- Max original size: **3 MB per image** for purpose `hunian_gallery` (within the existing 5 MB multer hard ceiling; client-side compression should target well below this).
- Max images per catalog item: **10** (within the recommended 8-12 band; enforced backend).
- Validate MIME type AND magic bytes (existing `file-type` pipeline); declared MIME, extension, and detected content must agree.
- Generate thumbnail/optimized variant if practical (M19B decision on `sharp` or equivalent; if deferred, serve the compressed original and record the variant as follow-up).
- Strip or ignore unsafe metadata (EXIF GPS/device info) if practical during processing; never expose raw metadata publicly.
- Safe filename handling: user-supplied filenames are never used for storage paths (existing M12 rule: `{property_id}/{purpose}/{file_id}.{ext}`).
- **No `storage_path` exposure** anywhere; public content served only through the safe mediated content endpoint.
- Storage-conscious for VPS: client compression before upload, bounded sizes/counts, soft delete + existing cleanup flow, reuse `UPLOAD_PROPERTY_QUOTA_MB`, cacheable public responses for published images.

## 5. Admin Upload UX (Frozen)

Admin gallery management must be modern and comfortable - not an old-school file input:

- Drag-and-drop upload zone + click-to-select support (image-only accept filter)
- Instant local preview before upload; pre-upload validation feedback where possible (type/size/count)
- Upload progress per image or batch (M12C2 engine)
- Image cards after upload: thumbnail, publish/unpublish toggle, "Jadikan Cover" button, reorder via drag handles with button (up/down) fallback, edit caption/altText, delete with confirmation dialog
- Cover badge; unpublished state visually distinct; count indicator vs the 10-image limit
- Friendly empty state; safe error messages only (no raw backend errors)
- Responsive mobile layout; accessible keyboard/focus states; existing shadcn/ui kit; no new design system

**MVP placement decision (frozen): Option C - dedicated Admin page `/hunian-gallery`.** The page lists catalog items (grouped by category/gender/building/floor from the safe catalog grouping) and opens the gallery manager per item. Rationale: it avoids touching the frozen M16C `/rooms` tab design, keeps gallery RBAC/property-scope isolated, and is the simplest safe MVP. Optional convenience links from `/rooms` tabs or catalog/unit cards (Options A/B) are deferred enhancements, not MVP requirements.

## 6. Public Gallery UX (Frozen)

Public listing `/kamar`:

- Use the cover image on the catalog card when available; keep the existing polished placeholder when the gallery is empty
- Aspect-ratio-locked containers - cards must never look stretched or broken
- Lazy load images; `altText` required on every rendered image

Public detail `/kamar/$slug`:

- Hero gallery area: large cover image + thumbnails; clicking a thumbnail changes the displayed image
- Optional lightbox/modal only if simple and safe (keyboard accessible, focus trap); mobile-friendly swipe/scroll if practical
- Graceful placeholder when empty (existing frozen copy family); professional hotel/apartment website feel
- **No fake dummy photos. No claim that a placeholder is a real photo.**

## 7. Content and Accessibility (Frozen)

- `altText` required; when the admin provides none, generate from the safe catalog title + category/gender labels (never from filenames or internal ids)
- Captions optional and public-safe
- Public gallery copy friendly; error and empty states clear; no raw backend errors shown
- Image loading must not break layout (reserved aspect ratio, skeleton/blur placeholder)
- Accessible color contrast and visible focus states throughout admin and public gallery UI

## 8. Safety / Privacy (Frozen)

- Backend is the enforcement point; frontend validation is UX-only
- Admin auth (JWT + RBAC) required for all upload/manage operations; property scope required
- Public sees `publicVisible` images only; `publicVisible` defaults to false - publishing is an explicit admin action
- No exact room numbers; no internal file path / `storage_path`; no `roomId`/`room_code`; no resident/tenant/occupancy PII; no invoice/payment/bank/rekening data; no Smart Lock/PALOMA data - in any gallery surface, response, filename, altText, or caption
- Editorial rule (binding, admin-facing): photos must not show residents, personal belongings, documents, room-number plates, or operational security details (carries the M18B gallery policy forward)
- No executable uploads; no SVG unless sanitized (deferred); MIME + magic-byte validation mandatory
- Rate limit / admin upload throttling reused from M12 (per-user and per-property limits); public content endpoint rate-limited like existing public endpoints
- Audit log for upload/attach, delete, publish/unpublish, set-cover, and reorder, following the existing M12 audit pattern where supported
- No production-ready booking claim; booking/payment/Smart Lock postures unchanged

## 9. Deferred Items (Frozen - do not treat as in scope)

- Video gallery
- 360-degree room tour
- Public user upload
- AI image enhancement
- CDN / offsite object storage (S3 swap remains a separate infrastructure track)
- Advanced cropping/editing tools
- Bulk ZIP upload
- Watermarking
- Face / license plate detection
- Full media DAM (digital asset management)
- Public reviews/testimonials gallery
- Payment booking integration
- SVG support (pending sanitization pipeline)
- Convenience gallery entry points from `/rooms` tabs or catalog cards (Options A/B in Section 5)

## 10. M19 Implementation Plan (Frozen)

| Milestone | Scope |
| --- | --- |
| M19A | This freeze (architecture / UX / safety) - binding for M19B+ |
| M19B | Backend Gallery API / file attachment: additive migration, `hunian_gallery` purpose, admin endpoints, public content path, catalog API gallery wiring, audit + rate limits |
| M19C | Admin Gallery Upload & Management UI (`/hunian-gallery`, Section 5) |
| M19D | Public gallery integration on `/kamar` and `/kamar/$slug` (Section 6) |
| M19E | QA / safety / docs / release: lint/typecheck/build, API smoke, privacy scan (no `storage_path`/`fileId`/`roomId`/`room_code` leakage), browser visual QA when tooling available, final handoff |

## Validation Deferred Note

This is a documentation/freeze milestone. No application source code was changed, no migration was created, and **no lint, build, API, or browser validation was executed or is claimed**. All technical validation is deferred to M19B-M19E validation gates.
