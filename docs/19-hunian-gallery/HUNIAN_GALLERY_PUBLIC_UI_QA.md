# M19D-QA - Hunian Gallery Public UI Validation

> Date: 2026-07-08
> Branch: m19d-qa-public-gallery-validation
> Verdict: PASS with browser visual and live API smoke limitations

## 1. Scope

QA validation for M19D Public Gallery UI.

Validated scope:

- Public `/kamar` listing gallery preview.
- Public `/kamar/$slug` detail gallery.
- Lightbox/modal behavior by source inspection.
- Public gallery type contract.
- Booking lead and WhatsApp regression.
- Public route/AuthGuard regression.
- Safety/privacy scan.
- Penghuni lint/typecheck/build and API build.

Out of scope:

- Browser visual QA, because this VPS has no browser tooling and the task explicitly forbids installing Chromium/Chrome/Firefox/Playwright/Puppeteer.
- Public upload, video gallery, payment booking, exact room selection, backend feature changes, admin gallery UI changes, Payment Gateway changes, Smart Lock changes, CSV import/backfill, or DB mutation.

## 2. Git / Status

- Current branch: `m19d-qa-public-gallery-validation`
- Initial working tree: clean.
- QA changed one source file only: `apps/penghuni/src/components/public-gallery/PublicHunianGallery.tsx`.
- Fix made: Prettier formatting only. No behavior or business logic changed.

## 3. Validation Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/penghuni run lint` | PASS | 10 existing non-blocking warnings remain. Initial failure was 2 Prettier errors in `PublicHunianGallery.tsx`; fixed by targeted formatting only. |
| `npm --workspace @granada-kost/penghuni run typecheck` | PASS | `tsc --noEmit` completed. |
| `npm --workspace @granada-kost/penghuni run build` | PASS | Vite/TanStack build completed; `PublicHunianGallery`, `/kamar`, and `/kamar/$slug` bundles generated. |
| `npm --workspace @granada-kost/api run build` | PASS | Nest build completed. |
| `git diff --check` | PASS | No whitespace errors. |

Penghuni lint warnings are existing/baseline warnings in shared UI/provider files and unrelated complaints route dependency warnings.

## 4. API Smoke / Contract

Result: PARTIAL, with contract validation PASS by source/build inspection.

What ran:

- `GET /api/v1/health` on existing local port `3000`: `200`.

Limitations:

- Existing port `3000` service returned `404` for `/api/v1/public/hunian-catalog` and `/api/v1/public/rooms/summary`, indicating the running service was not a fresh M18/M19 route set.
- Fresh API start on port `3001` was not attempted in this pass because prior reviewer policy blocked that action by usage-limit.

Compensating validation:

- API build PASS.
- M19D frontend type contract matches M19B public allowlist.
- Public hooks use anonymous read-only `GET /public/hunian-catalog` and `GET /public/hunian-catalog/:slug`.
- Gallery media URLs are resolved from backend-mediated `contentUrl`/`thumbnailUrl`, not storage paths.

## 5. Type Contract

Result: PASS.

- `PublicHunianGalleryImage` contains only `id`, `contentUrl`, `thumbnailUrl`, `altText`, `caption`, `sortOrder`, and `isCover`.
- `galleryPreview` and `gallery` are typed as `PublicHunianGalleryImage[] | null`.
- No old public UI `string[]` gallery assumption remains in the inspected files.
- `resolveGalleryImageUrl` handles absolute URLs, `/api/...` paths, and API-base-relative paths with `VITE_API_BASE_URL`.
- `thumbnailUrl ?? contentUrl` fallback is used safely.
- Null/empty gallery is safe.
- No `[object Object]` image `src` path exists.

## 6. Listing `/kamar`

Result: PASS.

- Card cover uses `galleryPreview[0]` when available.
- Image slot has fixed `aspect-[16/10]`.
- Image uses `object-cover`, `loading="lazy"`, and `decoding="async"`.
- `altText` falls back to the public catalog title.
- `onError` falls back to the frozen placeholder, avoiding broken image icons.
- No fake/dummy photos are used.
- Category/gender badges remain over the image with a legibility gradient.
- Filters remain unchanged.
- `Ajukan Minat Booking`, WhatsApp, and `Lihat Detail` CTAs remain.

## 7. Detail `/kamar/$slug`

Result: PASS.

- Detail page uses `PublicHunianGallery`.
- Hero image exists when gallery exists.
- Thumbnail selector exists when multiple usable images exist.
- Active selected thumbnail uses border/ring, opacity, and `aria-current`; it is not color-only.
- Caption and count are safe.
- Empty/fully failed gallery shows frozen placeholder: "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei."
- Failed image IDs are removed from rotation; all failed images revert to placeholder.
- Layout uses fixed aspect ratios (`4/3` mobile, `16/9` from `sm:`).
- No raw URL or raw backend error is rendered.

## 8. Lightbox / Modal

Result: PASS by source inspection.

- Uses existing shadcn `Dialog`; no new heavy dependency.
- Main image opens preview.
- Dialog close button is provided by the primitive.
- Previous/next controls exist when multiple images exist.
- ArrowLeft/ArrowRight key handling exists.
- Escape close is supported by Dialog.
- `DialogTitle` and `DialogDescription` are present with `sr-only` copy.
- Caption/alt fallback is safe.
- Raw content URL is not displayed as text.
- Structure is mobile-friendly with max height and object-contain image.

## 9. Accessibility

Result: PASS by source inspection.

- Meaningful image `alt` uses `altText` or safe title fallback.
- Thumbnail images are decorative with `alt=""` and parent buttons carry descriptive labels.
- Gallery buttons have `aria-label`.
- Selected thumbnail uses `aria-current`.
- Focus rings are present.
- Modal close/keyboard behavior is available through Dialog.
- Counter uses `aria-live="polite"`.
- Motion is reduced through `motion-reduce` classes for hover transitions.

## 10. Booking Lead / WhatsApp Regression

Result: PASS.

- `PublicBookingLeadDialog` usage remains unchanged.
- `bookingLeadDefaults` still flows through `toPublicRoomGroup`.
- Lead payload mapping still excludes room IDs, room code, exact room numbers, property ID, invoice/payment fields, occupancy/resident fields, and Smart Lock fields.
- WhatsApp CTA remains unchanged and uses `buildRoomInquiryMessage` / `buildWhatsAppUrl`.
- `target="_blank"` links keep `rel="noopener noreferrer"`.
- No checkout, payment booking, or exact room selection was added.

## 11. Public Route Regression

Result: PASS.

- `/kamar` remains public via `PUBLIC_ROUTES`.
- `/kamar/$slug` remains public via `pathname.startsWith("/kamar/")`.
- Public catalog hooks use `anonymous: true`, avoiding Authorization headers and refresh-token loops.
- `routeTree.gen.ts` did not change during build/typecheck validation.
- No AuthGuard regression found by source inspection/build.

## 12. Safety / Privacy Scan

Result: PASS.

Scanned public frontend files/docs for forbidden exposure terms:

- `storage_path`, `file_path`, `fileId`
- `roomId`, `room_id`, `roomCode`, `room_code`
- resident, tenant, occupancy
- invoice, paymentStatus, bank, rekening
- smartLock, PALOMA, `BSI 7318321153`
- public upload, video upload, checkout, `bayar sekarang`, `pilih nomor kamar`
- fake/dummy photo references

Findings:

- Hits are prohibition comments or safety docs only.
- Actual UI code renders only public-safe aggregate/gallery data.
- No public UI exposes storage paths, internal file IDs, exact room identifiers, PII, payment/bank data, or Smart Lock/PALOMA data.
- No fake/dummy photos are used.

## 13. Browser Visual Limitation

Browser visual QA was not executed.

Reason:

- VPS has no browser tooling available.
- The task explicitly says not to install Chromium, Chrome, Firefox, Playwright, or Puppeteer.

This is accepted for M19D-QA because lint/typecheck/build, route/static inspection, type-contract checks, regression checks, and safety scan passed.

## 14. Known Limitations

- Live API smoke is partial because the existing port `3000` service is stale/not serving M18/M19 public routes.
- Browser screenshots and actual keyboard/image rendering checks are deferred until browser tooling is available.
- `thumbnailUrl` is currently nullable and may fall back to full image content per M19B.

## 15. Verdict

PASS with browser visual and live API smoke limitations.

M19D Public Gallery UI is technically validated by static inspection, type-contract checks, public route regression, booking/WhatsApp regression, lint/typecheck/build, API build, and safety/privacy scan. The only source change made by QA was targeted Prettier formatting in `apps/penghuni/src/components/public-gallery/PublicHunianGallery.tsx`.
