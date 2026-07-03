# M12D - Penghuni Complaint Create UI with Optional Attachment Upload

Date: 2026-07-03
Status: Implemented (pending Codex validation and QA)
Depends on: M12C2 (Generic Frontend Upload Engine), M12C4 (Complaint Attachment Backend Readiness)

## Implementation Summary

M12D enables Penghuni residents to create complaint tickets directly from the Penghuni app, with optional photo attachments (1-5 images) uploaded through the M12C2 generic upload engine and linked via the M12C4 `file_ids` support on `POST /my/complaints`.

The previous placeholder ("Pengajuan dari aplikasi belum aktif") is replaced by a real create form. The placeholder existed because `GET /complaint-categories` requires the `complaint.manage` permission (owner/manager/admin roles) and was not callable by a resident token. M12D closes this gap with one small backend addition: a resident-safe category listing endpoint scoped to the resident's active occupancy property.

## Files Changed

### Backend

| File | Change |
| --- | --- |
| `backend/api/src/modules/complaint/controllers/my-complaint.controller.ts` | Added `GET /my/complaints/categories` — resident-safe active category list. Declared before the `:complaintId` param route so the static path matches first. Reuses `ComplaintService.activeResidentContextForUser()` for resident self-scoping and `ComplaintCategoryService.list(propertyId)` (repository default excludes inactive categories). Guarded by the controller-level `JwtAuthGuard + RbacGuard + @RequireRoles('resident')`. |

No other backend change. `POST /my/complaints` with optional `file_ids` (max 5, purpose `complaint_attachment`) was already implemented and validated in M12C4, including the single-transaction complaint + history + attachment insert.

### Frontend (Penghuni)

| File | Change |
| --- | --- |
| `apps/penghuni/src/lib/query-client.ts` | Added `qk.penghuni.complaintCategories()` query key (distinct from the complaints list key to avoid partial-match invalidation). |
| `apps/penghuni/src/hooks/usePenghuniComplaints.ts` | Added `MyComplaintCategoryRecord` type and `useMyComplaintCategories()` hook (`staleTime` 5 min, master data per ADR-FE-002). Extended `CreateMyComplaintInput` with optional `file_ids`. Updated contract comments. |
| `apps/penghuni/src/routes/_app/complaints.tsx` | Replaced `CreateComplaintGate` placeholder with `CreateComplaintSheet` — a real create form. Updated the top info banner copy. Complaint list/read, status badges, chat support action, and FAB remain unchanged. |

No changes to: ADR docs, roadmap, changelog, `docs/README.md`, mockup folder, `packages/api-client`, `packages/domain`, admin app, upload engine components, or the File API.

## Complaint Create Flow

1. Resident taps the `+` FAB → bottom sheet opens.
2. `useMyComplaintCategories()` fetches `GET /my/complaints/categories` (resident-scoped, active only). Loading/error/empty states are handled inside the sheet; category load failure offers retry.
3. Resident fills: category (required, shows the category's default priority as a hint — priority is backend-derived and not user-selectable), title (required, min 3), description (required, min 5), location.
4. Location follows the backend contract exactly:
   - "Kamar saya" (default): neither `room_id` nor `location_note` is sent → backend defaults to the resident's active room.
   - "Area umum / lainnya": required `location_note` is sent without `room_id` → backend creates a property-level report.
5. Optional attachments (see below).
6. Submit → `POST /my/complaints` via `useCreateMyComplaint()` with idempotency key. `file_ids` is included only when at least one attachment exists; omitted entirely for zero attachments (backward-compatible payload).
7. On success: success toast (existing hook behavior), complaint + notification queries invalidated (list refreshes), form cleared, success panel shows the new `complaintCode` with "Buat tiket lain" / "Tutup" actions.
8. On failure: error toast + inline message; the form state and uploaded attachment previews are kept so the resident can retry without re-uploading. No fake success.

## Attachment Behavior

- Purpose: `file_purpose = complaint_attachment`.
- Policy (from `FILE_PURPOSE_POLICIES.complaint_attachment`, unchanged): `image/jpeg` and `image/png` only, max 2 MB each, max 5 per complaint. No PDF (the existing backend policy does not allow PDF for this purpose), no video, no chat attachment.
- Upload uses the existing M12C2 engine: `FilePickerButton` (multiple + `capture="environment"` for camera), `useFileUpload` (client validation → canvas compression at max 1600px / JPEG 0.75 → `POST /files` multipart), `FileUploadProgress` (indeterminate), `FilePreview` thumbnails, `FilePreviewModal` full-size view.
- Cumulative cap: the sheet tracks remaining slots (5 minus uploaded) across multiple selections and rejects over-selection with a clear Indonesian message; the picker also enforces per-selection limits.
- Uploads run sequentially; each successful upload is appended immediately, so a mid-batch failure never discards already-uploaded file IDs.
- Preview is backend-mediated authorized blob fetch (`GET /files/:id/content` with JWT), object URLs revoked on unmount. No public file URLs, no `storage_path` exposure.
- Removing an attachment only removes it from the pending ticket; residents cannot call `DELETE /files/:id` (admin-scoped per the M12C1 access matrix). Unlinked uploads are covered by the backend 24-hour temporary-file cleanup policy.
- WhatsApp fallback (`WhatsAppFallbackButton`, phone from `VITE_ADMIN_WHATSAPP_PHONE`) is shown when: client validation rejects an oversized file, an upload fails, or the complaint submit fails.

## Backend / API Compatibility

- `POST /my/complaints` payload is unchanged and backward compatible; `file_ids` remains optional.
- `GET /my/complaints/categories` is additive. It introduces no new write path, reuses existing services, and returns `ComplaintCategoryRecord` fields only (no file or storage data).
- All M12C4 server-side validations continue to apply: file exists, not soft-deleted, purpose is `complaint_attachment`, same property, uploaded by the same resident, max 5 unique UUIDs, single-transaction attach with rollback.
- Existing complaint list/read endpoints and responses are untouched.

## Security Behavior

- Frontend validation (MIME, size, extension, count) is UX-only; backend remains the final authority.
- Resident self-scope enforced by backend: category list derives the property from the resident's active occupancy; complaint create validates resident context; attachments must be uploaded by the same resident in the same property.
- No direct storage URL, no `storage_path` exposure, no provider secrets. File preview is authorized blob fetch only.
- No video upload. No chat attachment. Priority cannot be escalated by the resident (backend derives it from the category).

## Validation Commands to Run Later (Codex / GPT-5.5 High)

Frontend:

- `npm.cmd run lint:penghuni`
- `npm.cmd --workspace @granada-kost/penghuni run typecheck`
- `npm.cmd run build:penghuni`

Backend (changed in this milestone):

- `npm.cmd run lint:api`
- `npm.cmd run build:api`

No lint, typecheck, build, browser QA, smoke test, or API test has been run as part of this change. Validation is deferred to Codex.

## Remaining Work

- Penghuni complaint detail view with attachment thumbnails (list rows currently show metadata only; a resident-facing `GET /my/complaints/:id/files` or equivalent is not yet exposed).
- Admin-side complaint attachment review already shipped in M12C5; no change needed here.
- Technician workflow, maintenance evidence UI, chat attachment: out of scope, deferred.
- Optional per-attachment captions (`complaint_files.caption`) are not surfaced in the create form.

## Known Limitations

- Attachments removed from the pending ticket are not deleted server-side by the resident (delete is admin-scoped); they rely on the 24-hour unlinked-upload cleanup policy.
- Upload progress is indeterminate (Phase 1 fetch limitation, per M12C2).
- The property scope for uploads is derived from the resident-scoped category list; if no categories are configured, the create form is intentionally unavailable with clear Indonesian copy directing the resident to the admin.
- "Area umum" complaints intentionally carry no `room_id` (backend contract): a resident cannot attach a location note to their own room's ticket in this phase.
- Success confirmation relies on the refreshed complaint list; there is no dedicated post-create detail navigation yet.

## Verdict

Implemented. PASS/FAIL is pending Codex validation (lint, typecheck, build) and QA.
