# M19E - Hunian Gallery Final Release / Handoff

> Date: 2026-07-08
> Scope: Documentation/release update only. No application source code changes, no migrations, no DB mutation, no CSV import/backfill, no Payment Gateway changes, no Smart Lock changes.
> Validation: NO new validation executed or claimed in this pass. All validation results below reuse the existing M19B, M19C-QA, and M19D-QA records.
> Verdict: **M19 Gallery MVP: READY for internal/demo/staging with known limitations. Production: NOT READY** until browser visual QA, deployment smoke, storage policy, and image review SOP are completed. **Public booking remains NOT production-ready. Payment booking deferred. Smart Lock live command NO-GO.**

## 1. Milestone Summary

M19 goal: enable Admin/Super Admin to upload/manage gallery images for public hunian/unit/group catalog items, and enable public visitors/calon penghuni to preview published gallery images professionally on `/kamar` and `/kamar/$slug`.

| Milestone | Scope | Status / Verdict | Document |
| --- | --- | --- | --- |
| M19A | Gallery Architecture / UX / Safety Freeze | FROZEN (binding) | `HUNIAN_GALLERY_ARCHITECTURE_UX_SAFETY_FREEZE.md` |
| M19B | Backend Gallery API / File Attachment | PASS (validated) | `HUNIAN_GALLERY_BACKEND_API.md` |
| M19C | Admin Gallery Upload & Management UI | Done | `HUNIAN_GALLERY_ADMIN_UI.md` |
| M19C-QA | Admin UI validation | **PASS with browser visual and live API smoke limitations** | `HUNIAN_GALLERY_ADMIN_UI_QA.md` |
| M19D | Public Gallery Integration / Professional Preview UI | Done | `HUNIAN_GALLERY_PUBLIC_UI.md` |
| M19D-QA | Public UI validation | **PASS with browser visual and live API smoke limitations** | `HUNIAN_GALLERY_PUBLIC_UI_QA.md` |
| M19E | Final Release / Handoff | This document | `M19_HUNIAN_GALLERY_FINAL_RELEASE_HANDOFF.md` |

Binding product rule (M19A, unchanged): **gallery images belong to public hunian/unit/group catalog items (`catalogSlug`/`publicGroupKey`) - never exact rooms, `roomId`, or `room_code`.**

## 2. Delivered Capabilities

### Backend (M19B)

- New file purpose `hunian_gallery` on the M12 file pipeline (JPEG/PNG/WebP only, max 3 MB, MIME + magic-byte validation).
- Additive migration `015_hunian_gallery.sql` (`hunian_gallery_images` table; property scope; catalog binding; max 10 active images per item; single cover per item; `publicVisible` default `false`).
- Admin scoped gallery API: list (incl. unpublished), attach, PATCH metadata, set-cover, batch reorder, soft-delete.
- Publish/unpublish via `publicVisible`; only published images are ever exposed publicly.
- Public catalog wiring: list `galleryPreview` (cover/first published image), detail `gallery` (all published, cover first, then `sortOrder`).
- Safe public media endpoint `GET /api/v1/public/hunian-gallery/:imageId/content` (rate-limited; 404 for unpublished/deleted/missing; no probing feedback).
- No public upload endpoint of any kind.

### Admin UI (M19C)

- Route `/hunian-gallery` + nav "Galeri Hunian" (owner/manager/admin manage; `property_owner` view-only, mutations 403 backend-side).
- Public-safe catalog item selector (no roomId/`room_code`/exact room numbers).
- Drag-and-drop + click-to-select upload with instant local preview and client validation (type/size/max 10 - UX-only; backend authoritative).
- Upload via `POST /files` purpose `hunian_gallery`, then attach to the catalog item.
- Image card management: set cover, publish/unpublish, reorder, edit altText/caption, delete with confirmation.
- Frozen safety notices (photo privacy reminders); photos start as Draft with explicit "public still sees placeholder" hint.

### Public UI (M19D)

- `/kamar` cards render the published cover image when available; polished placeholder when empty or on image failure.
- `/kamar/$slug` professional hero gallery: aspect-locked hero, thumbnail selector (horizontal snap scroll), lightbox/modal preview with prev/next and keyboard navigation (arrows/Escape), captions, `aria-live` counter.
- Lazy loading, locked aspect ratios, single-shot `onError` fallback (no broken image, no retry loop), no dummy/fake photos.
- Frontend contract fix: `galleryPreview`/`gallery` typed to the M19B allowlist object shape + `resolveGalleryImageUrl` for the backend-mediated media path.
- Booking lead ("Ajukan Minat Booking") and WhatsApp CTAs unchanged; no public upload; no exact room selection.

## 3. End-to-End Flow

1. **Admin upload/manage**: Admin opens `/hunian-gallery`, selects a catalog item (e.g. "Rumah Kost Putra - Unit 01"), uploads images (drag-and-drop; JPEG/PNG/WebP <= 3 MB; <= 10 per item), edits altText/caption, reorders, and sets one cover. New images are Draft (`publicVisible=false`) - the public still sees the placeholder.
2. **Publish image**: Admin toggles publish; the backend now includes the image in public responses and serves its bytes via the mediated public media endpoint.
3. **Public catalog listing shows cover**: `GET /public/hunian-catalog` returns `galleryPreview` (cover-first) and the `/kamar` card renders the cover image; items without published images keep the safe placeholder.
4. **Public detail shows hero gallery/lightbox**: `GET /public/hunian-catalog/:slug` returns the full published `gallery`; `/kamar/$slug` renders the hero gallery, thumbnail selector, and lightbox preview. Unpublishing or deleting an image removes it from public responses and its content returns 404.

## 4. Validation Summary (Existing Results Only - No New Validation)

### M19B backend (PASS)

- API lint/build PASS; migration apply PASS; migration replay/idempotency PASS.
- Fresh API smoke PASS on port 3001: full gallery lifecycle (upload 201, attach 201, `publicVisible=false` default, unpublished hidden from public, PATCH/publish 200, set-cover 201, reorder 201, public detail includes published gallery, public media 200 for published / 404 after delete), RBAC (401/403/400 cases), upload compatibility (`complaint_attachment`, `payment_proof` still 201).
- M16/M17 regression smoke PASS; safety scan PASS (no forbidden terms/keys in public responses).

### M19C-QA (PASS with limitations)

- Admin lint/typecheck/build PASS; API build PASS; routeTree convergence PASS.
- Static upload/gallery-management/permission/privacy safety checks PASS.
- One QA-only Prettier fix applied to `apps/admin/src/routes/hunian-gallery.tsx`.
- Live API smoke limited (stale port 3000; fresh API startup blocked by reviewer/usage limits); browser visual QA not available on VPS.

### M19D-QA (PASS with limitations)

- Penghuni lint/typecheck/build PASS; API build PASS; `git diff --check` PASS.
- Gallery contract / static listing/detail/lightbox/accessibility safety checks PASS; booking lead + WhatsApp regression checks PASS.
- One QA-only Prettier fix applied to `apps/penghuni/src/components/public-gallery/PublicHunianGallery.tsx`.
- Live API smoke limited (stale port 3000; fresh API startup blocked); browser visual QA not available on VPS.

## 5. Accepted Limitations (QA / Validation)

- **Browser visual QA was not executed** for M19C/M19D because the VPS has no browser tooling. The first staging demo doubles as the visual sanity check.
- **Live API smoke for M19C/M19D QA was limited**: port 3000 was stale and fresh API startup was blocked by reviewer/usage limits. The M19B fresh backend smoke did pass earlier on port 3001; a fresh restart + smoke is a pre-demo requirement (see Section 7).
- These limitations are accepted for internal/demo/staging scope only; they are production blockers.

## 6. Safety / Privacy Checklist

| Rule | Status |
| --- | --- |
| Gallery belongs to hunian/unit/group catalog items, not exact rooms | ENFORCED (M19A frozen; M19B schema) |
| Public only sees `publicVisible` images | ENFORCED (backend filter + 404 media guard) |
| No public upload (of any kind) | ENFORCED |
| No exact room number exposure | ENFORCED |
| No roomId/`room_code` exposure | ENFORCED |
| No `storage_path`/file-system path exposure | ENFORCED |
| No internal `fileId` in public responses | ENFORCED (`fileId` admin-only) |
| No resident/tenant/occupancy PII exposure | ENFORCED |
| No invoice/payment/bank data exposure | ENFORCED |
| No Smart Lock/PALOMA exposure | ENFORCED |
| Backend remains the enforcement point (frontend RBAC is UX-only) | ENFORCED |
| Editorial rule: no resident faces, documents, room-number plates, or internal info in photos | **MANUAL ADMIN SOP** (no automated detection - see limitations) |

## 7. Deployment Instructions

Before demoing or relying on the gallery on staging:

1. **Restart the API service** so the M18 (public hunian catalog) and M19 (gallery) routes are active - the stale-port limitation in M19C/M19D QA means the currently running process may predate these routes.
2. **Ensure migration `015_hunian_gallery.sql` is applied** (`npm run db:migrate:api`; the runner is replay-safe/idempotent per M19B).
3. **Ensure upload storage permissions**: the API process must be able to write the local-disk upload directory (M12 storage layout `{property_id}/{purpose}/{file_id}.{ext}`, outside the web root); confirm `UPLOAD_PROPERTY_QUOTA_MB` posture.
4. **Ensure `VITE_API_BASE_URL` is correct** in the penghuni/public app build so `resolveGalleryImageUrl` produces valid public media URLs (staging: `https://api.kostation.web.id/api/v1`).
5. **Redeploy the admin app** (`apps/admin`) so `/hunian-gallery` + nav "Galeri Hunian" are live.
6. **Redeploy the penghuni/public app** (`apps/penghuni`) so the `/kamar` cover integration and `/kamar/$slug` hero gallery are live.
7. Keep unchanged postures: `SMART_LOCK_PROVIDER=simulated`, `SMART_LOCK_LIVE_ENABLED=false`; Payment Gateway sandbox/staging posture per M15C; no Midtrans production keys.

## 8. Demo Checklist

| Step | Expected |
| --- | --- |
| Admin opens `/hunian-gallery` (nav "Galeri Hunian") | Management page loads with catalog selector and safety notices |
| Admin selects a catalog item | Gallery grid for that item loads (empty state if none) |
| Admin uploads an image (drag-and-drop or click) | Local preview, client validation, upload + attach succeed; card appears as Draft |
| Admin sets cover | "Cover" badge moves to the selected image (one cover per item) |
| Admin publishes the image | Badge changes Draft -> Publik |
| Public `/kamar` (no login) shows the cover | Card for that item renders the published cover; other items keep the placeholder |
| Public `/kamar/$slug` shows gallery/lightbox | Hero image + thumbnails; thumbnail click switches hero; hero click opens lightbox (prev/next, arrows, Escape) |

Demo don'ts: never upload photos showing room-number plates, resident faces, documents, or internal info; never promise exact room numbers publicly; never present the gallery or public booking as production-ready.

## 9. Known Limitations

- `thumbnailUrl` is currently `null` backend-side: public thumbnails load the original image (up to 3 MB) until a thumbnail pipeline exists.
- No video gallery. No image cropping editor. No CDN/S3/offsite object storage (content remains backend-mediated on local disk). No advanced image optimization pipeline yet.
- No face/license-plate/room-plate detection automation - **admins must manually ensure uploaded images do not show room-number plates, resident faces, documents, or internal information**.
- Browser visual QA and fresh live API smoke for M19C/M19D remain outstanding (Section 5).
- Public booking remains NOT production-ready; payment booking remains deferred; Smart Lock live command remains NO-GO until site trial/evidence/signoff.

## 10. Deferred Improvements

- Thumbnail/optimized-variant generation (`sharp` or equivalent) + `blurPlaceholder`.
- EXIF stripping pipeline hardening; CDN/S3 storage swap; image cropping editor; bulk upload (ZIP); watermarking.
- Automated sensitive-content detection (faces/plates/documents).
- Lightbox pinch-zoom/swipe gestures; SEO image structured data.
- Public booking production hardening (separate track; unchanged posture).

## 11. Next Recommended Milestone

**Primary recommendation: M20 - Staging Restart & Visual QA Pass.** Given that (a) M19C/M19D live API smoke was limited by the stale staging process, (b) browser visual QA has never run for M16C/M16E/M17C/M17D/M19C/M19D surfaces, and (c) the project's next likely event is an internal/stakeholder demo, the highest-value step is confidence: restart the staging API (Section 7 steps 1-6), run a fresh API smoke on the M18/M19 routes, and execute a local browser visual QA pass across `/kamar`, `/kamar/$slug`, and `/hunian-gallery`.

**Alternative (if image performance is the priority): M20 - Image Optimization / Thumbnail Pipeline / Deployment Smoke** - backend thumbnail/optimized-variant generation to fill `thumbnailUrl` (the public UI is already forward-compatible via `thumbnailUrl ?? contentUrl`), plus EXIF stripping hardening and a deployment smoke.

Both can be sequenced; the visual QA pass is recommended first because it also validates M19 end-to-end with real published images.

## 12. Release Verdict

- **M19 Gallery MVP: READY for internal/demo/staging with known limitations.**
- **Production readiness: NOT READY** until browser visual QA, deployment smoke, storage policy, and image review SOP are completed.
- **Public booking remains NOT production-ready.**
- **Payment booking deferred.**
- **Smart Lock live command NO-GO** until site trial/evidence/signoff.

Documentation only; no source code changes; no new lint/build/API/browser validation executed or claimed in this pass.
