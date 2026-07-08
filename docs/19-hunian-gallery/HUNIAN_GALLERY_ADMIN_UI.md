# M19C - Hunian Gallery Admin Upload & Management UI

> Milestone: M19C - Admin Gallery Upload & Management UI
> Date: 2026-07-08
> Scope: Frontend `apps/admin` + `packages/domain` file policy + documentation only. No backend changes, no public `/kamar` UI changes (deferred to M19D), no video upload, no public upload, no exact room selection, no payment booking, no Payment Gateway/Smart Lock changes.
> Binding base: `HUNIAN_GALLERY_ARCHITECTURE_UX_SAFETY_FREEZE.md` (M19A) and `HUNIAN_GALLERY_BACKEND_API.md` (M19B).

## 1. Route Summary

- New authenticated Admin route **`/hunian-gallery`** (`apps/admin/src/routes/hunian-gallery.tsx`), registered manually in `routeTree.gen.ts` following the established M17C/M18D precedent (generator convergence expected on the next build).
- New sidebar/bottom-nav item **"Galeri Hunian"** (icon `Images`) with the UX-only role allowlist `owner | manager | admin | property_owner`, mirroring the M19B backend authorization (list allows `property_owner`; mutations require `room.manage` and return 403 for `property_owner`). Backend remains the policy authority.

## 2. UX Summary

Page structure (mobile-friendly, shadcn/ui, existing Admin design system):

1. Header: title "Galeri Hunian" + subtitle explaining photos appear on the public catalog only when published.
2. Safety alert with the frozen notice: "Foto yang dipublikasikan akan terlihat oleh calon penghuni. Pastikan foto tidak menampilkan data pribadi, dokumen, nomor kamar spesifik, atau informasi internal." plus five upload reminders (no documents/IDs, no room-number plates on doors, no residents/guests without consent, no bank/payment/internal documents, no Smart Lock/admin device screens).
3. Catalog selector card (category + gender filter, hunian Select, selected summary).
4. Drag-and-drop upload zone (manage roles only).
5. Pre-upload queue with local previews and per-file altText/caption.
6. Gallery management grid with image cards.
7. Delete confirmation dialog + edit dialog.

States covered: selector loading skeletons and error retry, "no catalog selected" empty state, gallery loading skeleton grid, gallery error with retry, 403 -> safe "Anda tidak memiliki izin mengelola galeri." forbidden state, empty gallery state, "no published photos yet" hint (public still sees placeholder), max-10 reached state (dropzone disabled with reason), per-file validation and upload/attach error states.

## 3. Upload Flow

1. Admin selects a catalog item, then drags/drops or click-selects images (`accept="image/jpeg,image/png,image/webp"`, multiple).
2. Client-side UX validation per file via the M12C2 `validateFileForPurpose` with the new domain purpose policy `hunian_gallery` (JPEG/PNG/WebP, max 3 MB); invalid files get a friendly toast and are not queued. Slot guard enforces max 10 (existing images + queue).
3. Queued files show instant local previews (`URL.createObjectURL`), file name, size, editable altText (defaulted from the catalog title) and optional caption, remove-from-queue, and a per-file status (Mengupload... / Menyimpan... / error with retry).
4. "Upload N Foto" processes the queue **sequentially**: `POST /files` with `file_purpose=hunian_gallery` and `property_id` (M12 engine; idempotency key; JPEG-only client compression - PNG/WebP upload as-is so the bytes keep matching the original filename/extension), then `POST /hunian-gallery` attaches the returned `fileId` with `catalogSlug`, `publicGroupKey`, `category`, `gender`, safe `buildingCode`/`floorCode`, `altText`, `caption`.
5. Photos are created with `publicVisible=false` (backend default) and appear as **Draft**; a batch summary toast confirms how many photos were added. Object URLs are revoked on success/removal/unmount, and the queue is cleared when the selected catalog item changes.

Backend remains authoritative for MIME, magic bytes, size, purpose, RBAC, property scope, and the max-10 rule.

## 4. Catalog Selector

- Options come **read-only** from the M18B public catalog list (`GET /api/v1/public/hunian-catalog`, `anonymous: true` - same pattern as the penghuni /kamar hooks), because it is the canonical source of the public-safe `slug`/`title`/`publicGroupKey` the public pages render. No backend change was needed.
- Selector shows only public-safe fields: `title`, `categoryLabel`, `genderLabel`, `availabilityCount`, `publicGroupKey` (plus category/gender filter selects). **No roomId, no `room_code`, no exact room numbers** exist on this endpoint or in this UI.
- Selected summary card shows title, badges, aggregated availability, public group key, and the `x/10 foto · y dipublikasikan` counters.

## 5. Gallery Card Actions

Each image card (`GalleryImageCard`) shows the authorized blob preview (via `useFilePreview` on the admin-only `fileId`; `thumbnailUrl` is currently `null` per M19B so `contentUrl`-equivalent full content is used), Cover badge, Publik/Draft badge, position `#n / total`, altText, caption, and for manage roles:

- **Jadikan Cover** -> `POST /hunian-gallery/:imageId/set-cover` (backend enforces single cover per catalog item).
- **Publish/unpublish** Switch (labels "Dipublikasikan"/"Disembunyikan") -> `PATCH publicVisible`; helper copy explains only published photos appear publicly.
- **Move Up / Move Down** -> swaps within the sorted list and saves via `POST /hunian-gallery/reorder` (full `{id, sortOrder}` list for the catalog item). Drag-and-drop reorder intentionally not implemented (MVP-safe buttons per M19A).
- **Edit** -> dialog for altText (required, <= 180) and caption (optional, <= 240) -> `PATCH`.
- **Delete** -> `ConfirmDialog` (destructive) -> `DELETE /hunian-gallery/:imageId` (soft delete backend-side).

All mutations use idempotency keys, safe Indonesian toasts, and query invalidation; raw backend errors are never rendered.

## 6. Publish / Cover / Reorder / Delete Behavior Notes

- `publicVisible` defaults to false; the grid shows an explicit hint when zero photos are published ("Galeri publik /kamar masih menampilkan placeholder...").
- Cover hint: "Cover tampil sebagai foto utama di katalog publik. Jika belum ada cover, foto Publik pertama sesuai urutan yang dipakai." (matches M19B list behavior: cover or first public-visible image).
- Admin ordering is pure `sortOrder` + `createdAt`; the public detail ordering (cover first) is a backend presentation rule.
- Delete removes the gallery attachment; the underlying file is not auto-deleted (M19B rule).

## 7. Role / Permission Behavior

- `hasPermission("room.manage")` gates all mutation UI (dropzone, queue, switches, buttons). Without it (e.g. `property_owner`), the page renders a "Mode lihat saja" alert and a read-only gallery grid.
- A backend 403 on the gallery list renders the safe forbidden state "Anda tidak memiliki izin mengelola galeri."
- Frontend gating is UX-only per project ADRs; the M19B backend enforces RBAC + property scope and audits mutations.

## 8. Safety / Privacy UI Copy

- Frozen notice rendered verbatim (Section 2) plus the five reminder bullets.
- Edit dialog warns not to write specific room numbers or personal data in altText/caption.
- Rendered data is limited to the M19B admin allowlist; `fileId` is used only for the authorized preview fetch and never displayed; no `storage_path`, roomId, `room_code`, exact room numbers, tenant/resident/occupancy PII, invoice/payment/bank data, or Smart Lock/PALOMA data is requested or rendered.

## 9. Files Changed

- `apps/admin/src/routes/hunian-gallery.tsx` (new)
- `apps/admin/src/routeTree.gen.ts` (manual `/hunian-gallery` registration)
- `apps/admin/src/components/layout/nav.tsx` (nav item "Galeri Hunian")
- `apps/admin/src/hooks/useHunianGallery.ts` (new)
- `apps/admin/src/hooks/useHunianGalleryMutations.ts` (new)
- `apps/admin/src/components/gallery/GalleryDropzone.tsx` (new)
- `apps/admin/src/components/gallery/GalleryImageCard.tsx` (new)
- `apps/admin/src/components/gallery/GalleryEditDialog.tsx` (new)
- `apps/admin/src/lib/file-utils.ts` (WebP-aware validation label + `isImageMime`)
- `packages/domain/src/file.ts` (additive `hunian_gallery` purpose policy + `image/webp` mime; `packages/api-client` untouched per ADR-FE-001)
- `docs/19-hunian-gallery/HUNIAN_GALLERY_ADMIN_UI.md`, `docs/README.md`

## 10. Known Limitations

- `routeTree.gen.ts` was edited manually (no terminal); the TanStack generator is expected to converge on the next build.
- `thumbnailUrl` is `null` (M19B); admin cards fetch full content blobs. Server-side thumbnails remain a backend follow-up.
- If upload succeeds but attach fails, retrying re-uploads the file; the orphaned earlier file is left to the existing M12 cleanup policy.
- Client compression applies to JPEG only (PNG/WebP upload unmodified within the 3 MB cap).
- Drag-and-drop reorder, bulk operations, and cropping remain deferred (M19A).
- Browser visual QA requires browser tooling (historically unavailable on the VPS).

## 11. Next Milestone

M19C-QA (external lint/typecheck/build, API smoke, privacy scan, browser visual when tooling available), then **M19D - Public Gallery Integration** on `/kamar` and `/kamar/$slug`.

## 12. Validation Deferred Note

No lint, typecheck, build, API, or browser validation was executed or is claimed for this pass. All technical validation is deferred to M19C-QA. Public booking remains NOT production-ready.
