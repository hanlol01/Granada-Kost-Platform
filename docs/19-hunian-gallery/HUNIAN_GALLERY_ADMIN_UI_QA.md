# M19C-QA - Hunian Gallery Admin UI Validation

> Date: 2026-07-08
> Branch: m19c-qa-admin-ui-validation
> Verdict: PASS with browser visual and live API smoke limitations

## 1. Scope

QA validation for M19C Admin Gallery Upload & Management UI.

Validated scope:

- Admin `/hunian-gallery` route and route tree wiring.
- Admin nav item `Galeri Hunian`.
- Public-safe catalog selector.
- Upload UX and upload/attach integration.
- Gallery image management actions.
- Role/permission posture.
- File purpose/domain compatibility.
- Static privacy/safety scan.
- Admin lint/typecheck/build and API build.

Out of scope:

- Browser visual QA, because this VPS has no browser tooling and the instruction explicitly forbids installing Chromium/Firefox/Playwright/Puppeteer.
- Public gallery integration on `/kamar` and `/kamar/$slug`; this remains M19D.
- Backend feature changes, public upload, video upload, payment booking, exact room selection, Payment Gateway changes, Smart Lock changes, CSV import/backfill, or DB mutation.

## 2. Git / Status

- Current branch: `m19c-qa-admin-ui-validation`
- Initial working tree: clean.
- QA changed one source file only: `apps/admin/src/routes/hunian-gallery.tsx`.
- Fix made: Prettier formatting only. No behavior or business logic changed.

## 3. Validation Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm --workspace @granada-kost/admin run lint` | PASS | 15 existing non-blocking warnings remain. Initial failure was 4 Prettier errors in `apps/admin/src/routes/hunian-gallery.tsx`; fixed by targeted formatting only. |
| `npm --workspace @granada-kost/admin run typecheck` | PASS | `tsc --noEmit` completed. |
| `npm --workspace @granada-kost/admin run build` | PASS | Vite/TanStack build completed; `hunian-gallery` bundle generated. |
| `npm --workspace @granada-kost/api run build` | PASS | Nest build completed. |
| `git diff --check` | PASS | No whitespace errors. |

Admin lint warnings are existing/baseline style warnings: `react-refresh/only-export-components`, unused eslint-disable warnings in `lib/api.ts` and `lib/env.ts`, and unrelated `react-hooks/exhaustive-deps` warnings in complaints/payments routes.

## 4. Route Generation / Route Tree

Result: PASS.

Evidence:

- `apps/admin/src/routes/hunian-gallery.tsx` exports `createFileRoute("/hunian-gallery")`.
- `apps/admin/src/routeTree.gen.ts` imports `./routes/hunian-gallery`.
- `routeTree.gen.ts` contains `/hunian-gallery` in route ids, paths, full paths, route types, and route children.
- Admin build completed successfully.
- `routeTree.gen.ts` did not change during build/typecheck validation.
- No route conflict found.

The admin workspace has no separate route-generation script in `apps/admin/package.json`; build/typecheck served as the practical convergence validation.

## 5. API Smoke / Backend Compatibility

Result: PARTIAL, with backend compatibility PASS by build/source contract.

What ran:

- `GET /api/v1/health` on existing local port `3000`: `200`.

Limitations:

- Existing port `3000` service returned `404` for `/api/v1/public/hunian-catalog`, `/api/v1/hunian-gallery`, and `/api/v1/public/rooms/summary`, indicating the running service was not a fresh M19B/M19C route set.
- Starting a fresh built API on port `3001` was blocked by automatic reviewer usage-limit.
- A broader smoke command using admin login and invalid POST was rejected by automatic reviewer because it included hardcoded credentials and a POST request. No workaround was attempted.

Compensating validation:

- `npm --workspace @granada-kost/api run build` PASS.
- M19C frontend calls match the M19B documented backend contract: `GET /hunian-gallery`, `POST /hunian-gallery`, `PATCH /hunian-gallery/:imageId`, `POST /hunian-gallery/:imageId/set-cover`, `POST /hunian-gallery/reorder`, `DELETE /hunian-gallery/:imageId`, `POST /files` with `file_purpose=hunian_gallery`, and anonymous `GET /public/hunian-catalog`.

## 6. Admin Route / Navigation

Result: PASS.

- `/hunian-gallery` admin route exists.
- Sidebar/bottom nav item `Galeri Hunian` exists in `apps/admin/src/components/layout/nav.tsx`.
- Route is in `apps/admin`; no public upload route was added.
- `git diff --name-only` for QA shows no `apps/penghuni` changes.
- Backend remains authoritative for permission; frontend gating is UX-only.

## 7. Catalog Selector

Result: PASS.

Selector source: anonymous read-only `GET /public/hunian-catalog`.

Rendered/typed fields:

- `title`
- `category`
- `categoryLabel`
- `gender`
- `genderLabel`
- `buildingCode`
- `floorCode`
- `publicGroupKey`
- `availabilityCount`

Safety result:

- No room ID, `room_id`, `roomCode`, `room_code`, or exact room number is requested or rendered.
- Loading skeleton, error retry state, empty filter state, and selected summary state exist.
- `buildingCode` and `floorCode` are public aggregate catalog fields from M18/M19B, not exact room identifiers.

## 8. Upload UX

Result: PASS.

Confirmed:

- Drag-and-drop area exists.
- Click-to-select file picker exists.
- Keyboard support exists with Enter/Space on the dropzone.
- Accept filter is exactly `image/jpeg,image/png,image/webp`.
- No video or SVG accept path.
- Client validation uses `validateFileForPurpose(file, "hunian_gallery")`.
- `hunian_gallery` policy is JPEG/PNG/WebP, max 3 MB, max 10 files.
- Upload is disabled until a catalog is selected.
- Upload is disabled/blocked when max 10 slots is reached.
- Local previews are created with `URL.createObjectURL`.
- Object URLs are revoked on remove, successful upload/attach, selected catalog change, and page unmount.
- Per-file friendly errors exist.
- Raw backend errors are not displayed directly; mutation errors go through safe toast helpers.

## 9. Upload API Integration

Result: PASS.

Confirmed:

- Upload reuses existing `POST /files`.
- Upload purpose is `hunian_gallery`.
- Attach uses `POST /hunian-gallery`.
- The returned `fileId` is used only in the admin/internal attach/preview flow.
- `fileId` is not rendered as visible UI text.
- Upload and attach use idempotency keys.
- Upload/attach runs sequentially per queued file.
- JPEG compression is allowed, while PNG/WebP upload as-is to avoid extension/content mismatch.
- Successful uploads remain Draft until explicitly published.

## 10. Gallery Management

Result: PASS.

Confirmed:

- `GET /hunian-gallery` query key is property-aware through `currentPropertyId`.
- Image cards render preview via authorized blob fetch.
- Cover badge exists.
- Publik/Draft badge exists.
- Set-cover calls `/hunian-gallery/:imageId/set-cover`.
- Publish/unpublish calls `PATCH /hunian-gallery/:imageId`.
- Edit dialog for `altText`/`caption` exists.
- `altText` required and limited to 180 chars.
- `caption` optional and limited to 240 chars.
- Move Up/Down calls `POST /hunian-gallery/reorder`.
- Delete confirmation exists.
- Delete calls `DELETE /hunian-gallery/:imageId`.
- Mutation success invalidates/refetches gallery list.
- No `storage_path` is rendered.

## 11. Role / Permission

Result: PASS.

- Mutation UI is gated by `hasPermission("room.manage")`.
- Read-only mode exists for users without manage permission.
- 403 state uses safe copy.
- Backend remains authoritative for RBAC/property scope and cannot be bypassed by client-only UI gating.
- `property_owner` view-only posture is documented and reflected by UI behavior when manage permission is absent.

## 12. File / Domain Compatibility

Result: PASS.

- `packages/domain/src/file.ts` adds `hunian_gallery` additively.
- `image/webp` support is additive.
- Existing purposes remain present: `payment_proof`, `complaint_attachment`, `maintenance_attachment`, `vehicle_photo`, `vehicle_document`, `room_photo`, `property_logo`, and `ktp`.
- Existing payment proof and complaint attachment policies still compile through admin build/typecheck.
- `apps/admin/src/lib/file-utils.ts` is WebP-aware and backward compatible.

## 13. Safety / Privacy Scan

Result: PASS.

Scanned changed admin files/docs for forbidden exposure terms: `storage_path`, `file_path`, `roomId`, `room_id`, `roomCode`, `room_code`, resident/tenant/occupancy, invoice/paymentStatus/bank/rekening, smartLock/PALOMA, `BSI 7318321153`, video upload, SVG upload, and public upload.

Findings:

- Hits in M19C files are prohibition comments or safety copy only.
- `apps/admin/src/components/layout/nav.tsx` contains the normal nav label `Penghuni`; it is unrelated to gallery data exposure.
- Docs mention forbidden terms only as must-not-expose safety statements.
- No actual UI output or API contract exposes storage paths, exact room identifiers, tenant/resident/occupancy PII, payment/bank data, or Smart Lock/PALOMA data.

## 14. Browser Visual Limitation

Browser visual QA was not executed.

Reason:

- VPS has no browser tooling available.
- The task explicitly says not to install Chromium, Chrome, Firefox, Playwright, or Puppeteer.

This is accepted for M19C-QA because lint/typecheck/build, route/static inspection, file/domain compatibility checks, and safety scan passed.

## 15. Known Limitations

- Live API smoke is partial because the existing port `3000` service is stale/not serving M19 public/gallery routes, and starting a fresh port `3001` service was blocked by automatic reviewer usage-limit.
- Authenticated admin endpoint smoke was not executed after reviewer rejected the hardcoded-login smoke command. Source contract and build validation are used instead.
- Browser visual screenshots are intentionally skipped until browser tooling is available.

## 16. Verdict

PASS with browser visual and live API smoke limitations.

M19C Admin Gallery Upload & Management UI is technically validated by static inspection, route convergence, lint/typecheck/build, file/domain compatibility checks, and safety/privacy scan. The only code change made by QA was targeted Prettier formatting in `apps/admin/src/routes/hunian-gallery.tsx`.
