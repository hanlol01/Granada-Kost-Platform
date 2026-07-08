# M19D - Hunian Gallery Public UI / Professional Preview

> Date: 2026-07-08
> Branch: m19d-public-gallery-ui
> Scope: Public penghuni frontend only (`/kamar` listing + `/kamar/$slug` detail) + documentation.
> Validation: NOT executed (no terminal access in this pass). Lint/typecheck/build, API smoke, privacy scan, and browser visual validation are deferred to M19D-QA.

## Summary

M19D integrates the M19B public gallery data into the public catalog UI with a modern, professional hotel/apartment-style preview experience: a real cover image on `/kamar` listing cards, and a hero gallery with thumbnail selector and a simple lightbox on `/kamar/$slug`. Empty galleries keep the frozen safe placeholder. No backend or admin gallery UI changes were made.

An important frontend contract fix is included: the M18C/M18D frontend typed `galleryPreview`/`gallery` as `string[]`, but M19B returns arrays of allowlisted image objects (`id`, `contentUrl`, `thumbnailUrl`, `altText`, `caption`, `sortOrder`, `isCover`). Without this fix the existing UI would have rendered broken `src` values once real images were published. The fix is frontend-only; the backend contract is unchanged.

## Data Contract (Frontend)

In `apps/penghuni/src/hooks/usePublicHunianCatalog.ts`:

- New type `PublicHunianGalleryImage` mirroring the frozen M19A Section 1 public allowlist exactly: `id`, `contentUrl`, `thumbnailUrl` (nullable), `altText`, `caption` (nullable), `sortOrder`, `isCover`. The type must never be extended beyond the allowlist.
- `PublicHunianCatalogItem.galleryPreview` and `PublicHunianCatalogDetail.gallery` retyped from `string[] | null` to `PublicHunianGalleryImage[] | null`.
- New helper `resolveGalleryImageUrl(path)`: joins the backend-mediated media path (`GET /api/v1/public/hunian-gallery/:id/content`) onto the configured `VITE_API_BASE_URL`. Handles absolute URLs, absolute `/api/...` paths, and API-base-relative paths. It never constructs storage/file-system URLs.
- Thumbnails use `thumbnailUrl ?? contentUrl` (M19B currently returns `thumbnailUrl: null`; the UI is forward-compatible with a future thumbnail pipeline).

The hooks remain anonymous and read-only (`anonymous: true`); no new fields are requested.

## Listing `/kamar` Gallery Behavior

In `apps/penghuni/src/routes/kamar.tsx` (`HunianCatalogCard`):

- The first `galleryPreview` image (backend sends cover-first) renders as the card cover in the existing `aspect-[16/10]` slot with `object-cover`, `loading="lazy"`, `decoding="async"`, and the existing hover zoom (disabled under `prefers-reduced-motion`).
- `alt` comes from `altText`, falling back to the catalog item title.
- A subtle decorative top gradient keeps the category/gender badges legible over bright photos.
- If `galleryPreview` is empty or the image fails to load (`onError`, single-shot, no retry), the card falls back to the existing polished placeholder with the frozen copy. No broken-image icon is ever shown.
- Filters, price display, availability, disclaimers, "Ajukan Minat Booking", WhatsApp CTA, and "Lihat Detail" are unchanged.

## Detail `/kamar/$slug` Hero Gallery Behavior

New shared component `apps/penghuni/src/components/public-gallery/PublicHunianGallery.tsx` replaces the M18D static gallery block:

- **Hero**: rounded, bordered, aspect-locked hero (`4/3` mobile, `16/9` from `sm:`) showing the active image with `object-cover`. The first image loads eagerly; subsequent selections lazily. An image counter pill ("2/7") and an expand hint icon sit top-right; a caption (when present) renders over a bottom legibility gradient.
- **Thumbnail selector**: shown when more than one image exists; a horizontally scrollable, snap-aligned strip of aspect-locked thumbnails. Clicking a thumbnail changes the hero image. The active thumbnail is indicated by a primary ring/border plus full opacity (not color-only), with `aria-current` for assistive tech.
- Ordering is exactly the API order (cover first, then `sortOrder`, then `createdAt` per M19B); the frontend does not reorder.

## Thumbnail / Lightbox Behavior

- Clicking (or keyboard-activating) the hero opens a **lightbox** built on the existing shadcn `Dialog` primitive - no new dependency. It provides a focus trap, Escape-to-close, and the built-in accessible close button.
- The lightbox shows the large image with `object-contain` on a dark surface (no cropping), previous/next buttons when multiple images exist, ArrowLeft/ArrowRight keyboard navigation, an `aria-live` counter, and the caption (or alt text) below the image.
- Navigation wraps around (last -> first). No zoom/pinch library was added in M19D (deferred; see Known Limitations).
- No raw URLs are ever rendered as visible text.

## Placeholder / Fallback Policy

- Empty gallery: the frozen copy "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei." renders in an aspect-locked muted panel on both pages. The copy is now single-sourced from the gallery component (`GALLERY_PLACEHOLDER_COPY`).
- Failed image bytes: the image id is added to a failed set and removed from the rotation (hero, thumbnails, and lightbox all honor this). There is no retry loop. If every image fails, the full placeholder returns.
- Missing/empty `contentUrl` values are filtered out defensively.
- All image slots have fixed aspect ratios and a `bg-muted` backing, so loading and failure never cause layout jumps or white flashes.
- No raw backend errors are surfaced; no fake/dummy photos are used anywhere.

## Image Accessibility

- Every rendered image has meaningful `alt` (`altText`, falling back to the catalog title). Thumbnail `<img>`s use empty `alt` + `aria-hidden` because their parent buttons carry descriptive `aria-label`s (avoids double announcement).
- Hero, thumbnails, and lightbox nav are real `<button>`s with visible `focus-visible` rings and descriptive Indonesian `aria-label`s ("Perbesar foto 1 dari 5: ...", "Foto sebelumnya", "Foto berikutnya").
- Selected thumbnail state uses ring + opacity + `aria-current` (not color-only).
- The lightbox has an `sr-only` `DialogTitle`/`DialogDescription`, Radix focus trap, Escape close, accessible close button, and an `aria-live="polite"` counter.
- Decorative gradients are `aria-hidden`; hover/transition motion is disabled under `prefers-reduced-motion`.

## Safety / Privacy (Verified by Code Inspection)

- Only the frozen M19B public allowlist fields are read and rendered: `id`, `contentUrl`, `thumbnailUrl`, `altText`, `caption`, `sortOrder`, `isCover`.
- No `storage_path`/file path, no internal `fileId`, no `roomId`/`room_code`/exact room number, no uploader identity, no tenant/resident/occupancy PII, no invoice/payment/bank data, no Smart Lock/PALOMA data is requested or rendered.
- Image bytes are fetched only via the backend-mediated public endpoint (`/public/hunian-gallery/:id/content` via `resolveGalleryImageUrl`); no storage URLs are constructed.
- No public upload UI, no video, no exact room selection, no checkout/payment UI. Booking posture unchanged: lead is NOT a confirmed booking; admin/WhatsApp confirmation remains authoritative.
- "Ajukan Minat Booking" (M17D dialog), WhatsApp CTA (M16E template), and "Lihat Detail" are untouched.

## Files Changed

Frontend (`apps/penghuni`):

- `src/hooks/usePublicHunianCatalog.ts` - gallery image type, retyped `galleryPreview`/`gallery`, `resolveGalleryImageUrl`
- `src/components/public-gallery/PublicHunianGallery.tsx` - new hero + thumbnails + lightbox component (exports the frozen placeholder copy)
- `src/routes/kamar.tsx` - card cover image with error fallback and badge legibility gradient
- `src/routes/kamar.$slug.tsx` - static gallery block replaced by `PublicHunianGallery`

Documentation:

- `docs/19-hunian-gallery/HUNIAN_GALLERY_PUBLIC_UI.md` (this document)
- `docs/README.md`

No backend files changed. No admin UI files changed.

## Known Limitations

- `thumbnailUrl` is `null` in M19B, so thumbnails currently load the full (max 3 MB) original; a thumbnail/optimized-variant pipeline remains a backend follow-up.
- No blur placeholder (`blurPlaceholder` was optional in M19A and is not provided by M19B).
- Lightbox has no pinch-zoom/deep-zoom; deferred to keep the modal simple and safe.
- No swipe gesture on the hero (thumbnail strip + lightbox arrows cover mobile navigation).
- SEO structured data (image objects) not included in M19D.
- Public booking remains NOT production-ready.

## Validation Deferred Note

This pass had no terminal or browser access. No lint, typecheck, build, API smoke, or browser visual validation was executed or is claimed. All validation is deferred to **M19D-QA** (recommended: penghuni lint/typecheck/build, published-image API smoke against `/public/hunian-catalog[/:slug]` and `/public/hunian-gallery/:id/content`, privacy scan of rendered output, and browser visual/keyboard/mobile checks when tooling is available).

## Next Milestone

M19D-QA - external validation of the public gallery UI; then M19E (release/handoff) per the M19A milestone plan.
