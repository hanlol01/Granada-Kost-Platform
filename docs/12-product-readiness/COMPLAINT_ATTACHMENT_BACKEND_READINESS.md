# M12C4 - Complaint Attachment Backend Readiness

Date: 2026-07-03
Status: Implemented

## Implementation Summary

M12C4 adds backend readiness for complaint attachments. Resident complaint creation can now accept optional `file_ids` for files that were uploaded through the File API with `file_purpose = complaint_attachment`.

This milestone is backend-only. It does not add Penghuni complaint create UI, Admin complaint file preview, maintenance evidence UI, chat attachment, video upload, or any direct storage URL behavior.

## Backend Files Changed

| File | Change |
| --- | --- |
| `backend/api/src/modules/complaint/dto/create-my-complaint.dto.ts` | Added optional `file_ids` array with UUID, uniqueness, and max-5 validation. |
| `backend/api/src/modules/complaint/controllers/my-complaint.controller.ts` | Passes `file_ids` into the resident complaint create service flow. |
| `backend/api/src/modules/complaint/types/complaint.types.ts` | Added optional `fileIds` to `CreateComplaintInput`. |
| `backend/api/src/modules/complaint/complaint.module.ts` | Imports `FileModule` so complaint service can use central file metadata. |
| `backend/api/src/modules/complaint/services/complaint.service.ts` | Validates resident context and attachment file metadata before linking files. |
| `backend/api/src/modules/complaint/constants/complaint.constants.ts` | Added `complaint.file_attach` audit action. |
| `backend/api/src/modules/complaint/repositories/complaint.repository.ts` | Allows complaint creation through an optional transaction client. |
| `backend/api/src/modules/complaint/repositories/complaint-history.repository.ts` | Allows complaint history insert through an optional transaction client. |
| `backend/api/src/modules/complaint/repositories/complaint-file.repository.ts` | Allows complaint file attach through an optional transaction client. |

## DTO / API Changes

`POST /api/v1/my/complaints` remains backward compatible. `file_ids` is optional.

Example request:

```json
{
  "category_id": "uuid",
  "room_id": "uuid",
  "title": "AC bocor",
  "description": "Air menetes dari unit indoor sejak pagi.",
  "location_note": "Dekat meja belajar",
  "file_ids": ["uuid"]
}
```

Existing clients that do not send `file_ids` continue to work.

## Validation Behavior

The backend is the final authority. During resident complaint creation it validates:

- Authenticated resident has an active occupancy.
- Complaint property and resident context match the authenticated resident.
- Optional `room_id` is the resident's active room; property-level location-note complaints may omit `room_id`.
- `file_ids` contains at most 5 unique UUIDs.
- Each file exists in the centralized `files` table.
- Each file is not soft-deleted.
- Each file purpose is exactly `complaint_attachment`.
- Each file belongs to the same property as the complaint.
- Each file was uploaded by the same authenticated resident user.

Validated files are attached through the existing `complaint_files` junction table via `ComplaintFileRepository.attach()`.

## Transaction Behavior

When `file_ids` is provided, the backend uses a single PostgreSQL transaction for:

- inserting the complaint row,
- inserting the initial complaint status history row,
- inserting all `complaint_files` attachment rows.

Validation still happens before the transaction. If any validation fails, no complaint is created. If complaint creation succeeds but a history or attachment insert fails, the transaction rolls back so no partial complaint remains.

The no-attachment path remains compatible with the previous create behavior.

## Security Behavior

- No direct public file URL is exposed.
- No video upload is supported.
- No chat attachment is supported.
- Resident cannot attach another resident's file.
- Resident cannot attach deleted files.
- Resident cannot attach non-`complaint_attachment` files.
- Resident cannot attach files from another property.

Frontend validation remains UX-only; backend validation is authoritative.

## Audit Behavior

Complaint creation continues to write `complaint.create`.

When files are attached during creation, the service also writes `complaint.file_attach` with the attached `fileIds`. The create audit snapshot includes `fileIds` as additional after-data.

## Remaining Work for Frontend Complaint Create UI

- Build the Penghuni complaint create form.
- Use the generic upload engine with `file_purpose = complaint_attachment`.
- Submit complaint metadata plus `file_ids`.
- Show upload failure and oversized-file fallback states.
- Keep client-side validation as UX-only.

## Remaining Work for Admin Complaint File Preview

- Fetch complaint attachment metadata for Admin complaint detail.
- Add authorized backend-mediated preview/download through `GET /files/:fileId/content`.
- Reuse Admin `FilePreview` / `FilePreviewModal` from the generic upload engine.
- Preserve audit logging on file download/preview.

## Validation Result

| Command | Result |
| --- | --- |
| `npm.cmd run lint:api` | PASS |
| `npm.cmd run build:api` | PASS |

Backend `package.json` has no dedicated `typecheck` or test script. Optional live API sanity was not run because this milestone did not launch a backend server or perform smoke testing.

## Known Limitations

- No Penghuni complaint create UI is implemented in M12C4.
- No Admin/technician file preview UI is implemented in M12C4.
- Existing complaint list/read responses remain complaint metadata only; attachment metadata retrieval is deferred to Admin/Penghuni UI integration milestones.
- Audit writes occur after the complaint transaction commits, preserving existing audit behavior.

## Verdict

PASS
