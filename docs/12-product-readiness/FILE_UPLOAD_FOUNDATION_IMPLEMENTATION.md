# M12C1 Backend File API Foundation Implementation

Date: 2026-07-02

Source:
- `docs/12-product-readiness/FILE_UPLOAD_FOUNDATION_PLAN.md`
- `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`

Scope completed:
- Backend File API foundation only.
- No frontend upload UI.
- No payment gateway.
- No complaint create UI.
- No Admin file preview UI.
- No ADR changes.

## Files changed

Backend:
- `backend/api/src/infrastructure/database/migrations/011_files.sql`
- `backend/api/src/modules/file/file.module.ts`
- `backend/api/src/modules/file/file.controller.ts`
- `backend/api/src/modules/file/file.service.ts`
- `backend/api/src/modules/file/file.repository.ts`
- `backend/api/src/modules/file/storage/file-storage.provider.ts`
- `backend/api/src/modules/file/storage/local-file-storage.ts`
- `backend/api/src/modules/file/dto/upload-file.dto.ts`
- `backend/api/src/modules/file/dto/file-query.dto.ts`
- `backend/api/src/modules/file/constants/file.constants.ts`
- `backend/api/src/modules/file/types/file.types.ts`
- `backend/api/src/app.module.ts`
- `backend/api/src/infrastructure/config/configuration.ts`
- `backend/api/src/infrastructure/config/environment.validation.ts`
- `backend/api/.env.example`
- `backend/api/package.json`
- `package-lock.json`
- `.gitignore`

## Migration added

Added `011_files.sql`.

Migration behavior:
- Creates centralized `files` table.
- Stores metadata in PostgreSQL as the source of truth.
- Adds purpose check constraint for:
  - `payment_proof`
  - `complaint_attachment`
  - `maintenance_attachment`
  - `vehicle_photo`
  - `vehicle_document`
  - `room_photo`
  - `property_logo`
  - `ktp`
- Adds storage driver check constraint for `local` and `s3`.
- Adds MIME/extension/size/checksum/delete-state constraints.
- Adds indexes for property/purpose, uploader, checksum, and soft-deleted cleanup.
- Adds FK constraints to existing file junction tables only when safe, so existing orphan dev/test file IDs do not break migration.

## Endpoints added

Global API prefix remains `api/v1`, so endpoints are:

- `POST /api/v1/files`
  - Accepts `multipart/form-data`.
  - Expects multipart field `file`.
  - Expects body fields `property_id` and `file_purpose`.

- `GET /api/v1/files/:fileId`
  - Returns authorized file metadata.

- `GET /api/v1/files/:fileId/content`
  - Streams authorized file content through backend.
  - Supports `?download=true` for attachment disposition.

- `DELETE /api/v1/files/:fileId`
  - Performs soft delete.

## Storage behavior

- File bytes are stored via `FileStorageProvider`.
- Phase 1 provider is `LocalFileStorage`.
- Default storage path is `./uploads`.
- Storage paths are property-scoped:
  - `{property_id}/{file_purpose}/{file_id}.{ext}`
- User-supplied filenames are never used for storage paths.
- `.gitignore` excludes `uploads/` and `backend/api/uploads/`.
- No public storage URL is created.
- Content access always goes through backend authorization.

## Validation behavior

Backend validates every upload:
- Purpose is validated against the accepted purpose allowlist.
- MIME type is purpose-scoped.
- Video MIME types are not allowed.
- Unsupported MIME types are rejected.
- Dangerous extensions are rejected.
- Extension must match detected file content.
- Declared MIME type must match detected file content.
- Magic bytes are validated with `file-type`.
- SHA256 checksum is computed and persisted.
- Multer hard ceiling remains 5 MB.
- `UPLOAD_MAX_FILE_SIZE_MB` is enforced, max 5 MB.
- Purpose-specific limits are enforced:
  - Images: 2 MB, except property logo 1 MB.
  - PDFs: 5 MB where allowed.
- Optional `UPLOAD_PROPERTY_QUOTA_MB` rejects uploads that would exceed property quota.

## Security behavior

- Backend is the only policy enforcement point.
- PostgreSQL `files` table is metadata source of truth.
- Redis is used only for upload rate limiting, not file storage.
- Per-user upload limits:
  - 10 uploads per minute.
  - 50 uploads per hour.
- Per-property upload limit:
  - 100 uploads per hour.
- Privileged staff roles can access files in property scope.
- Non-staff users can only access files they uploaded in M12C1.
- Resident upload purposes are limited to `payment_proof` and `complaint_attachment`.
- Technician upload purpose is limited to `maintenance_attachment`.
- Content responses set:
  - `Content-Type`
  - `Content-Disposition`
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: private, max-age=300`
- File binary content is never logged.

## Audit behavior

Audit writes are implemented for:
- `file.upload`
- `file.upload.failed`
- `file.upload.denied`
- `file.download`
- `file.download.denied`
- `file.delete`
- `file.delete.denied`
- `file.metadata.denied`

Audit payload includes metadata such as file ID, property ID, purpose, MIME type, size, checksum, and result status. Denied access attempts are logged where the current audit pattern supports it.

## Env vars added

Added to `backend/api/.env.example` and config validation:

- `UPLOAD_STORAGE_PATH=./uploads`
- `UPLOAD_MAX_FILE_SIZE_MB=5`
- `UPLOAD_PROPERTY_QUOTA_MB` optional and disabled by default

## Dependency added

Added backend API dependency:

- `file-type`

Reason:
- Used for magic byte validation as required by ADR-BE-FILE-001.
- Loaded through an ESM-compatible dynamic import shim because the backend currently builds as CommonJS.

## Validation result

Commands run:
- `npm.cmd run lint:api` passed.
- `npm.cmd run build:api` passed.
- `npm.cmd --workspace @granada-kost/api run` inspected available backend scripts.

Notes:
- Initial `npm run ...` attempts were blocked by Windows PowerShell `npm.ps1` execution policy, then rerun successfully via `npm.cmd`.
- No backend test script exists in `backend/api/package.json`.
- `npm.cmd --workspace @granada-kost/api run format:check` was inspected but is not a requested validation gate; it currently fails due broad pre-existing formatting drift across many backend files.
- No browser launched.
- No smoke test run.

## Remaining work for M12C2-M12C5

M12C2:
- Add frontend File API client hooks/components.
- Add client-side validation and authorized blob preview helpers.

M12C3:
- Wire Penghuni payment proof upload.
- Extend payment proof submit flow with `file_ids`.
- Attach uploaded files to `payment_proof_files`.

M12C4:
- Add backend complaint attachment readiness.
- Extend complaint create DTO/service with optional `file_ids`.
- Attach uploaded files to `complaint_files`.

M12C5:
- Add Admin file preview/review UI for payment proofs and complaints.
- Fetch metadata and authorized content via backend endpoints.

Cleanup:
- Scheduler/cleanup script is not implemented in M12C1.
- Retention policy remains documented for later implementation:
  - temporary unlinked uploads
  - soft-deleted files
  - rejected/expired proof files
  - orphaned storage files

## Known limitations

- M12C1 does not attach uploaded files to payment proof, complaint, maintenance, vehicle, room, or property entities.
- M12C1 does not implement Admin file preview UI.
- M12C1 does not implement frontend upload UI.
- Resident access in M12C1 is uploader-only until domain-specific attachment ownership is implemented.
- Technician access in M12C1 is uploader-only until work-order assignment ownership is implemented.
- Physical cleanup of soft-deleted files is deferred.
- Malware scanning is not implemented.

## Verdict

PASS.

The backend File API foundation is implemented with centralized metadata, local storage abstraction, strict validation, backend-mediated content access, soft delete, audit logging, and upload config/env validation.
