# ADR-BE-FILE-001 — Backend-Mediated File Access

Status: **Accepted**

Date: 2026-07-02

Supersedes: None

Related:
- `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md` (ADR-FE-009 — File Upload Pattern)
- `docs/12-product-readiness/FILE_UPLOAD_FOUNDATION_PLAN.md` (M12C Plan)
- `docs/01-architecture/BACKEND_ARCHITECTURE.md`

---

## 1. Context

The Granada Kost Platform (Kostation) requires file upload capability for operational evidence:
- **Payment proof**: Resident uploads bank transfer screenshot or QRIS receipt for admin verification.
- **Complaint attachment**: Resident or admin attaches photo of damage/issue.
- **Maintenance attachment**: Technician or admin attaches completion/progress photo.
- **Vehicle document**: STNK scan or vehicle photo for parking registration.
- **Identity verification**: KTP image for resident onboarding.
- **Property asset**: Room photos, property logo.

The current codebase has **no file upload endpoint** and **no central `files` table**. Four domain-specific junction tables (`payment_proof_files`, `complaint_files`, `maintenance_work_order_files`, `vehicle_files`) exist with `file_id UUID` columns that reference no parent table. The `@granada-kost/api-client` already supports `FormData` upload. The `@nestjs/platform-express` package includes Multer but it is not configured.

### Production Constraints

The production/staging VPS may start with:

| Resource | Capacity |
| --- | --- |
| CPU | 2 vCPU |
| RAM | 8 GB |
| Disk | **80 GB SSD** |

After accounting for OS, PostgreSQL, Redis, application code, and logs, approximately **40 GB** is available for file uploads. Kostation is **not a file storage platform**. File upload exists solely for operational evidence and must be storage-conscious and abuse-resistant.

---

## 2. Decision

### 2.1 PostgreSQL as Source of Truth

The `files` table in PostgreSQL is the **single source of truth** for all file metadata. Every uploaded file has a metadata record with: `id`, `property_id`, `uploader_user_id`, `original_filename`, `mime_type`, `file_size_bytes`, `file_purpose`, `storage_path`, `storage_driver`, `checksum_sha256`, `is_deleted`, `created_at`.

File content (bytes) is stored separately via a storage provider.

### 2.2 Storage Provider Abstraction

File bytes are persisted through a `FileStorageProvider` interface:

```typescript
export interface FileStorageProvider {
  save(fileId: string, propertyId: string, purpose: string, buffer: Buffer, ext: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}
```

**Phase 1**: `LocalFileStorage` implementation writes to local disk.
**Phase 2+**: `S3FileStorage` implementation may be swapped via config (`UPLOAD_STORAGE_DRIVER=s3`).

The storage driver is recorded per file (`storage_driver` column) to support mixed-mode migration.

### 2.3 Backend-Mediated Access (No Public Storage URLs)

All file access — upload, preview, download, and delete — goes through the backend API:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/files` | Upload file (multipart/form-data) |
| `GET /api/v1/files/:id` | Get file metadata |
| `GET /api/v1/files/:id/content` | Download/preview file content |
| `DELETE /api/v1/files/:id` | Soft-delete file |

The frontend **must not** access storage URLs directly. No public-accessible storage paths. The uploads directory must be outside the web root.

Frontend preview should use **authorized blob fetch via the API client** (`apiClient.rawFetch('/files/:id/content')` → `URL.createObjectURL(blob)`), not direct `<img src>` pointing to the content endpoint, because the API client manages JWT auth headers and cookie-based content auth is not supported.

### 2.4 Access Control

File access is scoped by **role**, **property**, **resident ownership**, and **purpose context**:

1. **Property scope**: `file.propertyId` must be in `user.propertyIds`. Enforced on every access.
2. **Role-based access**:
   - `owner`, `manager`, `admin`: full access within their property scope.
   - `technician`: access only to files attached to their assigned work orders or complaints.
   - `resident`: access only to files they uploaded or files attached to their own resources (own invoices, own complaints).
3. **Purpose context**: Upload is restricted by `file_purpose`. A resident can only upload `payment_proof` (to their own invoice) or `complaint_attachment` (to their own complaint).

### 2.5 Backend Validation

The backend validates every upload authoritatively. Client-side validation is UX-only.

1. **MIME type**: Strict per-purpose allowlist. Only `image/jpeg`, `image/png`, and `application/pdf` (where applicable).
2. **Magic bytes**: Verified via the `file-type` npm package to prevent MIME spoofing. `file-type` is a new validation dependency (not currently installed).
3. **File size**: Purpose-specific limits. Max 2 MB for images, max 5 MB for PDFs. 1 MB for property logo.
4. **Dangerous extensions**: Blocklist enforced (`.exe`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.html`, `.htm`, `.svg`, `.xml`, `.php`, `.asp`, `.jar`, `.war`).
5. **File purpose**: Must be a valid enum value. Each purpose has its own MIME + size + count policy.
6. **File count**: Domain services enforce max files per entity (e.g., 3 per payment proof, 5 per complaint).
7. **SHA256 checksum**: Computed and stored for every file. Duplicate detection available (warn in Phase 1).
8. **Ownership context**: User must have access to the target property and, for residents, to the target resource.

### 2.6 Audit

All file lifecycle actions are audited via `AuditRepository.write()`:

- `file.upload` — successful upload
- `file.upload.failed` — validation failure
- `file.upload.denied` — authorization failure
- `file.download` — successful preview/download
- `file.download.denied` — unauthorized access attempt
- `file.delete` — soft-delete
- `file.cleanup` — automated cleanup of expired/temporary files

Audit records include: `actor_user_id`, `property_id`, `ip_address`, `user_agent`, `correlation_id`. File binary content is never logged.

### 2.7 Storage-Conscious Limits

Because the initial VPS may only have 80 GB SSD (~40 GB available for uploads):

| Limit | Value |
| --- | --- |
| Max image upload size | 2 MB |
| Max PDF upload size | 5 MB |
| Property logo max size | 1 MB |
| Multer hard ceiling | 5 MB |
| Upload rate limit (per user) | 10/min, 50/hr |
| Upload rate limit (per property) | 100/hr |
| Optional per-property storage quota | Configurable via env |

### 2.8 Cleanup and Retention

| Category | Retention | Action |
| --- | --- | --- |
| Temporary unlinked uploads | 24 hours | Soft-delete → physical delete |
| Soft-deleted files | 30 days | Physical delete from disk |
| Rejected payment proof files | 90 days after rejection | Soft-delete → physical delete |
| Expired payment proof files | 90 days after expiry | Soft-delete → physical delete |
| Orphaned files | On detection | Log warning, admin review |

Phase 1: manual cleanup via `npm run file:cleanup`. Phase 2: automated cron job.

### 2.9 Redis Usage

Redis is **not used as file storage**. Redis may be used for:
- Upload rate limiting (existing rate limiter pattern).
- Optional file metadata caching (short TTL, read-through).

File bytes and metadata are always persisted to disk and PostgreSQL respectively.

### 2.10 No Video Upload

Video upload is **not supported in Phase 1**. No video MIME types are included in any purpose allowlist. This is a deliberate storage-conscious decision given the VPS constraint.

### 2.11 No Chat Attachment

Chat file attachment is **not supported in Phase 1**. If enabled later, max 1 MB per image.

---

## 3. Consequences

### Positive

- **Security**: No direct storage access from frontend. Every file access is authorized, audited, and scoped.
- **Portability**: Storage abstraction enables zero-downtime migration from local disk to S3.
- **Storage safety**: Purpose-specific size limits, rate limiting, and cleanup policies protect the constrained VPS.
- **Auditability**: Complete lifecycle logging for compliance and operational tracing.
- **Consistency**: File upload follows the same Repository → Service → Controller pattern as all other modules.

### Negative

- **Latency**: Backend-mediated download adds one hop vs. direct-to-CDN. Acceptable for Phase 1 operational use (not a media platform).
- **CPU cost**: SHA256 computation and magic byte detection add processing per upload. Negligible for 2 vCPU at expected upload volume.
- **Dependency**: `file-type` is a new npm dependency. It is well-maintained, small, and has no native bindings.

### Neutral

- Frontend must implement authorized blob fetch pattern (`apiClient.rawFetch` → `createObjectURL`) instead of simple `<img src>`. This is a small additional complexity.
- Cleanup scripts must be run manually in Phase 1. Automation deferred to Phase 2.

---

## 4. Security Implications

| Threat | Mitigation |
| --- | --- |
| MIME spoofing (e.g., `.jpg` containing executable) | Magic byte validation via `file-type` |
| Path traversal via crafted filenames | Storage paths use `{file_id}.{ext}` only. No user-supplied filenames in paths. |
| Cross-property file access | `file.propertyId ∈ user.propertyIds` enforced on every read/download |
| Cross-resident data leak | Residents can only access files they uploaded or files attached to their own resources |
| Storage exhaustion DoS | Per-file size limits (max 5 MB), per-user rate limits (10/min), per-property rate limits (100/hr), optional quota |
| Stored XSS via filenames | `originalFilename` sanitized. Never rendered as raw HTML. |
| Direct storage URL exposure | Storage directory outside web root. nginx deny rules. No public URL. |
| Malware upload | Phase 1: type/size/magic-byte validation + authenticated-only access. Phase 2+: ClamAV or cloud scanning. |

Response headers on `/files/:id/content`:
- `Content-Type`: original MIME type
- `Content-Disposition`: `inline` (or `attachment` with `?download=true`)
- `X-Content-Type-Options: nosniff`
- `Cache-Control: private, max-age=300`

---

## 5. Storage Constraints

| Constraint | Value | Rationale |
| --- | --- | --- |
| VPS disk | 80 GB SSD | Initial production/staging specification |
| Upload budget | ~40 GB | After OS, DB, Redis, app, logs |
| Max per-file (image) | 2 MB | Prevents oversized camera photos without client compression |
| Max per-file (PDF) | 5 MB | Sufficient for scanned documents |
| Multer hard ceiling | 5 MB | Rejects at transport layer before application processing |
| Worst-case per property | ~15 GB | Based on 100 residents, 12 months, all file types maxed |
| Cleanup cycle | 24h / 30d / 90d | Prevents accumulation of temporary, deleted, and rejected files |

Storage exhaustion is monitored via the `/health` endpoint (total file count + total bytes).

---

## 6. Implementation Constraints

1. **Framework**: NestJS 11.x with Multer (via `@nestjs/platform-express`, already installed).
2. **Database**: Raw SQL via `pg` Pool. No Prisma. Consistent with all existing repositories.
3. **Validation**: `class-validator` + `class-transformer` for DTOs. `file-type` for magic bytes (new dependency).
4. **Auth**: `JwtAuthGuard` + `RbacGuard` + `@CurrentUser()` decorator (existing pattern).
5. **Audit**: `AuditRepository.write()` (existing pattern).
6. **Storage path**: `{property_id}/{purpose}/{file_id}.{ext}` — property-scoped for operational clarity.
7. **Checksum**: SHA256 computed server-side for every upload.
8. **Rate limiting**: Redis-based, per-user and per-property (existing rate limiter pattern).
9. **Soft-delete**: `is_deleted` flag + `deleted_at` timestamp. Physical cleanup deferred.
10. **Migration**: New migration `011_files.sql`. FK constraints on existing junction tables via conditional migration.

---

## 7. Out of Scope

| Item | Status | Notes |
| --- | --- | --- |
| Payment gateway | Out of scope | Separate milestone |
| Direct-to-S3 upload from frontend | Phase 2 | Phase 1 uploads via backend only |
| Virus/malware scanning (ClamAV) | Future enhancement | Phase 1 relies on type/size/magic-byte validation |
| Video upload | Not supported Phase 1 | VPS storage constraint |
| Chat attachment | Not supported Phase 1 | Feature deferred |
| Server-side image resize/thumbnails | Future enhancement | Phase 1 relies on client-side compression |
| CDN / edge caching | Phase 2+ | Phase 1 backend-mediated download |
| Real-time upload progress (WebSocket) | Not in scope | Use standard XHR progress events |
| `browser-image-compression` dependency | Evaluate if needed | Start with native `<canvas>` API |
| Automated cleanup scheduler (cron) | Phase 2 | Phase 1: manual `npm run file:cleanup` |

---

## 8. Change Log

- 2026-07-02 — ADR-BE-FILE-001 created. Status: Accepted.
