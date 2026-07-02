# M12C2-PLAN — Generic Frontend Upload Engine Architecture

Date: 2026-07-02

Source:
- `docs/12-product-readiness/FILE_UPLOAD_FOUNDATION_PLAN.md`
- `docs/01-architecture/ADR-BE-FILE-001_BACKEND_MEDIATED_FILE_ACCESS.md`
- `docs/12-product-readiness/FILE_UPLOAD_FOUNDATION_IMPLEMENTATION.md`
- `docs/01-architecture/FRONTEND_ARCHITECTURE_DECISIONS.md`
- Current frontend codebase inspection

---

## 1. Executive Summary

This document designs a **reusable, generic upload engine** for both Kostation frontend apps (Admin and Penghuni). The engine is not a one-off payment proof uploader — it is a purpose-agnostic foundation that serves all current and future file upload surfaces:

| Surface | App | Status |
| --- | --- | --- |
| Payment proof upload | Penghuni | M12C3 |
| Complaint attachment | Penghuni / Admin | M12C4 |
| Maintenance evidence | Admin | Future |
| Resident document (KTP) | Admin | Future |
| Vehicle photo / STNK | Admin | Future |
| Room photo | Admin | Future |
| Property logo | Admin | Future |
| Smart Lock snapshot/evidence | Admin | Future |
| CCTV evidence | Admin | Future |

The engine is split into three layers:
1. **Shared domain constants** — file purpose policies, validation rules, MIME/size limits — in `packages/domain`.
2. **Upload hooks** — `useFileUpload`, `useFilePreview`, `useFileDelete` — in each app's `hooks/` directory, built on TanStack Query mutations.
3. **Upload UI components** — `FilePickerButton`, `FilePreview`, `FilePreviewModal`, `FileUploadProgress`, `WhatsAppFallbackButton` — in each app's `components/file/` directory.

Key design principles:
- **Frontend is not the policy enforcement point.** All validation is UX-only. Backend is authoritative.
- **No public storage URL.** Preview uses authorized blob fetch via `apiClient` + `URL.createObjectURL`.
- **Purpose-driven.** Every upload component receives a `filePurpose` prop that determines MIME allowlist, size limits, and UI copy.
- **Compression by default.** Camera/photo uploads are client-side compressed before upload (max 1600px, JPEG quality 0.75–0.80).
- **WhatsApp fallback.** When upload fails, is unavailable, or file is too large, a WhatsApp deep link to property admin is offered.
- **Consistent with existing patterns.** Uses `apiClient.post()`, `useMutation`, `newIdempotencyKey()`, `toastMutationSuccess/Error`, and `qk` query key conventions.

---

## 2. Current Frontend State

### 2.1 API Client (`packages/api-client`)

The `ApiClient` class (frozen at M11B per ADR-FE-001) already supports `FormData` upload:

```typescript
// buildBody() in packages/api-client/src/index.ts, line 168–173
if (typeof FormData !== "undefined" && rawBody instanceof FormData) {
  // Let the runtime set the multipart boundary; do not set Content-Type.
  return rawBody;
}
```

This means **no changes are needed to the API client for file upload**. The `apiClient.post('/files', formData)` call will automatically:
- Skip `Content-Type` header (letting the browser set `multipart/form-data; boundary=...`).
- Include `Authorization: Bearer <token>` via the `TokenProvider`.
- Include `X-Correlation-Id` and `Idempotency-Key`.

However, the `ApiClient` currently only returns parsed JSON (via `parseResponse`). For binary content download (file preview), a **new method or raw fetch helper** is needed because `GET /files/:id/content` returns binary data with `Content-Type: image/jpeg` (not JSON). The existing `parseResponse` would attempt `.json()` on success and fall back to `.text()`, which corrupts binary data.

**Gap identified:** Need a `rawFetch` or `fetchBlob` method on `ApiClient` or a standalone helper that uses the same auth headers.

### 2.2 TanStack Query Patterns

Both apps follow ADR-FE-002:

**Queries:**
- Query keys: `qk.<domain>.<resource>(filters?)` — arrays like `["penghuni", "billing", "history", {...}]`.
- Domain hooks: `hooks/use<Domain>.ts` — e.g., `usePenghuniBilling.ts`, `useBilling.ts`.
- No ad-hoc `useQuery` in route components.

**Mutations:**
- Mutation hooks: `hooks/use<Domain>Mutations.ts` — e.g., `useBillingMutations.ts`.
- Pattern: `useMutation<TData, unknown, TInput>({ mutationFn, onSuccess, onError })`.
- `onSuccess`: `toastMutationSuccess(message)` + `queryClient.invalidateQueries({ queryKey })`.
- `onError`: `toastMutationError(err, fallbackMessage)`.
- Idempotency: `newIdempotencyKey()` in `mutationFn` options.

**File upload mutations will follow this exact pattern.**

### 2.3 Error Handling (ADR-FE-008)

- `ApiError { code, message, details, status, correlationId }` is the normalized error shape.
- `toastMutationError()` handles 403, 429, 409, 422, 5xx, and network errors with Indonesian UI text.
- `correlationId` is surfaced in toast descriptions for support handoff.

**Relevant backend error codes for file upload:**
- `FILE_REQUIRED` (400) — no file in multipart body.
- `FILE_EXTENSION_NOT_ALLOWED` (400) — dangerous extension.
- `FILE_TYPE_UNSUPPORTED` (400) — magic bytes don't match allowlist.
- `FILE_MIME_MISMATCH` (400) — declared MIME ≠ detected MIME.
- `FILE_EXTENSION_MISMATCH` (400) — extension ≠ detected content.
- `FILE_TOO_LARGE` (400) — exceeds global max (5 MB).
- `FILE_TOO_LARGE_FOR_PURPOSE` (400) — exceeds purpose-specific limit.
- `FILE_STORAGE_QUOTA_EXCEEDED` (413) — property quota exceeded.
- `FILE_PURPOSE_DENIED` (403) — user role can't upload this purpose.
- `FILE_ACCESS_DENIED` (403) — user can't access this file.
- `RATE_LIMITED` (429) — upload rate limit exceeded.

### 2.4 Disabled Upload Placeholders

| Location | Component | Text | Action Required |
| --- | --- | --- | --- |
| Penghuni Billing | `PayActionDisabled()` in `billing.tsx:179` | "Tersedia setelah File API rilis" | Replace with `FilePickerButton` + upload flow |
| Admin Settings | Upload Logo button in `settings.tsx:87` | "Pilih File" (dummy) | Wire to file upload with `purpose=property_logo` |
| Admin Complaints | No production upload surface | — | Add file preview in detail view |
| Admin Payments | No file preview in proof detail | — | Add file preview via `FilePreviewModal` |

### 2.5 Component Architecture

Per ADR-FE-007:
- shadcn/ui components live independently in each app (`components/ui/`).
- Cross-app reuse is restricted to `packages/*` (non-visual code).
- Lovable-generated layouts are preserved.

**Implication:** Upload UI components (`FilePickerButton`, `FilePreview`, etc.) are duplicated across apps with app-specific styling. Shared logic (validation rules, types, constants) lives in `packages/domain`.

### 2.6 Existing State Components

Penghuni has standardized state components in `components/state/`:
- `EmptyState.tsx`, `ErrorState.tsx`, `ForbiddenState.tsx`, `LoadingState.tsx`.

Upload components should use these patterns for error/empty states.

---

## 3. Backend File API Contract Summary

### 3.1 Endpoints (from M12C1)

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| `POST` | `/api/v1/files` | JWT + RBAC | `{ data: FileResponse }` |
| `GET` | `/api/v1/files/:fileId` | JWT + access check | `{ data: FileResponse }` |
| `GET` | `/api/v1/files/:fileId/content` | JWT + access check | Binary stream |
| `DELETE` | `/api/v1/files/:fileId` | JWT + access check | `{ success, file: FileResponse }` |

### 3.2 Upload Request

```
POST /api/v1/files
Content-Type: multipart/form-data

Fields:
  file:          (binary, required)
  property_id:   (UUID, required)
  file_purpose:  (string, required) — one of: payment_proof, complaint_attachment,
                  maintenance_attachment, vehicle_photo, vehicle_document,
                  room_photo, property_logo, ktp
```

### 3.3 FileResponse Shape (from `FileService.toResponse()`)

```typescript
type FileResponse = {
  id: string;
  property_id: string;
  uploader_user_id: string | null;
  original_filename: string;
  sanitized_filename: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  file_purpose: string;
  storage_driver: string;
  checksum_sha256: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
```

### 3.4 Content Response

```
GET /api/v1/files/:fileId/content

200 OK
Content-Type: image/jpeg (or image/png, application/pdf)
Content-Disposition: inline; filename="bukti-transfer.jpg"
X-Content-Type-Options: nosniff
Cache-Control: private, max-age=300

(binary data)
```

### 3.5 Error Response Shape

All file errors follow the standard envelope:

```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE_FOR_PURPOSE",
    "message": "File exceeds the purpose-specific size limit",
    "details": { "max_bytes": 2097152, "actual_bytes": 3500000, "file_purpose": "payment_proof" }
  },
  "correlation_id": "uuid"
}
```

---

## 4. Upload Engine Goals and Non-Goals

### Goals

1. Create a **generic, purpose-driven upload engine** reusable across all file upload surfaces.
2. Provide shared file types and validation constants in `packages/domain`.
3. Provide `useFileUpload()` hook for both apps — wraps `apiClient.post('/files', FormData)` with TanStack `useMutation`.
4. Provide `useFilePreview()` hook — authorized blob fetch for `<img>` display.
5. Provide `useFileDelete()` hook — soft-delete mutation.
6. Provide reusable UI components: `FilePickerButton`, `FilePreview`, `FilePreviewModal`, `FileUploadProgress`.
7. Implement client-side validation (MIME, size, extension) as UX-only guard.
8. Implement client-side image compression for camera uploads.
9. Provide WhatsApp admin fallback when upload is unavailable or fails.
10. Handle all backend error codes with clear, Indonesian-language user feedback.
11. Support both Admin (desktop) and Penghuni (mobile PWA) form factors.

### Non-Goals

- **No backend changes in M12C2.** Backend File API is already complete (M12C1).
- **No payment proof submission flow in M12C2.** That is M12C3 (wiring upload to `POST /my/payment-proofs`).
- **No complaint attachment wiring in M12C2.** That is M12C4.
- **No video upload.** Not supported in Phase 1.
- **No chat attachment.** Not supported in Phase 1.
- **No direct-to-S3 upload.** Phase 2.
- **No `packages/ui-kit`.** Per ADR-FE-007, UI components are per-app in Phase 1.
- **No modification to `packages/api-client`.** It is frozen at M11B. The blob fetch helper will be a standalone utility in each app.

---

## 5. Proposed Module / Component Structure

### 5.1 Shared Package (`packages/domain`)

```
packages/domain/src/
├── index.ts              (add export)
└── file.ts               [NEW] — shared file types, purposes, validation rules
```

### 5.2 Penghuni App

```
apps/penghuni/src/
├── hooks/
│   └── useFileUpload.ts          [NEW] — upload, preview, delete hooks
├── lib/
│   └── file-utils.ts             [NEW] — blob fetch helper, compression, WhatsApp URL
├── components/
│   └── file/
│       ├── FilePickerButton.tsx   [NEW] — file input + client validation
│       ├── FilePreview.tsx        [NEW] — thumbnail/icon with filename
│       ├── FilePreviewModal.tsx   [NEW] — full-screen authorized preview
│       ├── FileUploadProgress.tsx [NEW] — upload progress indicator
│       └── WhatsAppFallbackButton.tsx [NEW] — fallback when upload fails
```

### 5.3 Admin App

```
apps/admin/src/
├── hooks/
│   └── useFileUpload.ts          [NEW] — upload, preview, delete hooks
├── lib/
│   └── file-utils.ts             [NEW] — blob fetch helper, compression, WhatsApp URL
├── components/
│   └── file/
│       ├── FilePickerButton.tsx   [NEW] — file input + client validation
│       ├── FilePreview.tsx        [NEW] — thumbnail/icon with filename
│       ├── FilePreviewModal.tsx   [NEW] — full-screen authorized preview
│       ├── FileUploadProgress.tsx [NEW] — upload progress indicator
│       └── WhatsAppFallbackButton.tsx [NEW] — fallback when upload fails
```

### 5.4 Why Not a Shared Package?

Per ADR-FE-007:
- Admin (desktop-dense) and Penghuni (mobile PWA) have divergent design tokens.
- shadcn/ui components are per-app.
- Hooks use app-specific `apiClient` singletons (`apps/admin/src/lib/api.ts` vs `apps/penghuni/src/lib/api.ts`).
- Cross-app reuse is limited to non-visual code in `packages/*`.

**Therefore:**
- **Types and constants** → `packages/domain/src/file.ts` (shared).
- **Hooks** → per-app `hooks/useFileUpload.ts` (import shared types, use app-specific `apiClient`).
- **UI components** → per-app `components/file/` (app-specific styling).
- **Utility functions** → per-app `lib/file-utils.ts` (shared logic patterns, app-specific imports).

The hooks and utils will be functionally identical between apps. If a `packages/ui-kit` is introduced in Phase 2, they can be deduplicated then.

---

## 6. Shared Domain Types and Constants

### 6.1 New File: `packages/domain/src/file.ts`

This file mirrors the backend's `file.constants.ts` for client-side use. It does NOT import from the backend — it is a self-contained, framework-agnostic module.

```typescript
// packages/domain/src/file.ts

export const FILE_PURPOSES = [
  'payment_proof',
  'complaint_attachment',
  'maintenance_attachment',
  'vehicle_photo',
  'vehicle_document',
  'room_photo',
  'property_logo',
  'ktp',
] as const;

export type FilePurpose = (typeof FILE_PURPOSES)[number];

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'application/pdf';

export type FilePurposePolicy = {
  purpose: FilePurpose;
  allowedMimeTypes: SupportedMimeType[];
  maxBytesByMimeType: Partial<Record<SupportedMimeType, number>>;
  maxFilesPerEntity: number;
  label: string;             // Indonesian UI label
  compressImages: boolean;   // Whether to apply client-side compression
};

export const FILE_PURPOSE_POLICIES: Record<FilePurpose, FilePurposePolicy> = {
  payment_proof: {
    purpose: 'payment_proof',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
      'application/pdf': 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 3,
    label: 'Bukti pembayaran',
    compressImages: true,
  },
  complaint_attachment: {
    purpose: 'complaint_attachment',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 5,
    label: 'Foto keluhan',
    compressImages: true,
  },
  maintenance_attachment: {
    purpose: 'maintenance_attachment',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 5,
    label: 'Foto pekerjaan',
    compressImages: true,
  },
  vehicle_photo: {
    purpose: 'vehicle_photo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 3,
    label: 'Foto kendaraan',
    compressImages: true,
  },
  vehicle_document: {
    purpose: 'vehicle_document',
    allowedMimeTypes: ['application/pdf'],
    maxBytesByMimeType: {
      'application/pdf': 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 2,
    label: 'Dokumen kendaraan',
    compressImages: false,
  },
  room_photo: {
    purpose: 'room_photo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
    },
    maxFilesPerEntity: 10,
    label: 'Foto kamar',
    compressImages: true,
  },
  property_logo: {
    purpose: 'property_logo',
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxBytesByMimeType: {
      'image/jpeg': 1 * 1024 * 1024,
      'image/png': 1 * 1024 * 1024,
    },
    maxFilesPerEntity: 1,
    label: 'Logo properti',
    compressImages: false,
  },
  ktp: {
    purpose: 'ktp',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytesByMimeType: {
      'image/jpeg': 2 * 1024 * 1024,
      'image/png': 2 * 1024 * 1024,
      'application/pdf': 5 * 1024 * 1024,
    },
    maxFilesPerEntity: 1,
    label: 'KTP',
    compressImages: false,
  },
};

// Backend API response shape (matches FileService.toResponse())
export type FileResponse = {
  id: string;
  property_id: string;
  uploader_user_id: string | null;
  original_filename: string;
  sanitized_filename: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  file_purpose: string;
  storage_driver: string;
  checksum_sha256: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// Client-side validation result
export type FileValidationResult =
  | { valid: true }
  | { valid: false; code: string; message: string };

// Backend file error codes the frontend should handle
export const FILE_ERROR_CODES = {
  FILE_REQUIRED: 'FILE_REQUIRED',
  FILE_EXTENSION_NOT_ALLOWED: 'FILE_EXTENSION_NOT_ALLOWED',
  FILE_TYPE_UNSUPPORTED: 'FILE_TYPE_UNSUPPORTED',
  FILE_MIME_MISMATCH: 'FILE_MIME_MISMATCH',
  FILE_EXTENSION_MISMATCH: 'FILE_EXTENSION_MISMATCH',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TOO_LARGE_FOR_PURPOSE: 'FILE_TOO_LARGE_FOR_PURPOSE',
  FILE_STORAGE_QUOTA_EXCEEDED: 'FILE_STORAGE_QUOTA_EXCEEDED',
  FILE_PURPOSE_DENIED: 'FILE_PURPOSE_DENIED',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
} as const;

// Compression settings
export const IMAGE_COMPRESSION = {
  maxWidthPx: 1600,
  jpegQuality: 0.75,
  outputFormat: 'image/jpeg' as const,
} as const;
```

### 6.2 Export from `packages/domain/src/index.ts`

Add:
```typescript
export * from "./file";
```

---

## 7. `useFileUpload` Hook Design

### 7.1 API

```typescript
type FileUploadInput = {
  file: File;                   // the raw File from <input>
  propertyId: string;           // scoping context
  filePurpose: FilePurpose;     // determines validation policy
  compress?: boolean;           // override: force enable/disable compression
};

type FileUploadHookOptions = {
  onUploadSuccess?: (response: FileResponse) => void;
  onUploadError?: (error: ApiError) => void;
};

type UseFileUploadReturn = {
  uploadFile: UseMutateFunction<FileResponse, ApiError, FileUploadInput>;
  uploadAsync: UseMutateAsyncFunction<FileResponse, ApiError, FileUploadInput>;
  isUploading: boolean;
  uploadProgress: number;       // 0–100 (percentage)
  uploadError: ApiError | null;
  lastUploadedFile: FileResponse | null;
  reset: () => void;
};
```

### 7.2 Implementation Pattern

```typescript
// apps/<app>/src/hooks/useFileUpload.ts

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError } from "@/lib/mutation-feedback";
import { compressImage, validateFileForPurpose } from "@/lib/file-utils";
import { FILE_PURPOSE_POLICIES, type FileResponse, type FilePurpose } from "@granada-kost/domain";

export function useFileUpload(options?: FileUploadHookOptions): UseFileUploadReturn {
  const mutation = useMutation<FileResponse, ApiError, FileUploadInput>({
    mutationFn: async (input) => {
      // 1. Client-side validation (UX only)
      const validation = validateFileForPurpose(input.file, input.filePurpose);
      if (!validation.valid) {
        throw new ApiError({
          code: validation.code,
          message: validation.message,
          status: 0,
        });
      }

      // 2. Optional image compression
      const policy = FILE_PURPOSE_POLICIES[input.filePurpose];
      const shouldCompress = input.compress ?? policy.compressImages;
      let fileToUpload: File | Blob = input.file;
      if (shouldCompress && input.file.type.startsWith("image/")) {
        fileToUpload = await compressImage(input.file);
      }

      // 3. Build FormData
      const formData = new FormData();
      formData.append("file", fileToUpload, input.file.name);
      formData.append("property_id", input.propertyId);
      formData.append("file_purpose", input.filePurpose);

      // 4. Upload via API client
      return apiClient.post<FileResponse>("/files", formData, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: (data) => {
      options?.onUploadSuccess?.(data);
    },
    onError: (err) => {
      toastMutationError(err, "Gagal mengupload file");
      options?.onUploadError?.(err);
    },
  });

  return {
    uploadFile: mutation.mutate,
    uploadAsync: mutation.mutateAsync,
    isUploading: mutation.isPending,
    uploadProgress: 0, // See Section 10 for progress design
    uploadError: mutation.error as ApiError | null,
    lastUploadedFile: mutation.data ?? null,
    reset: mutation.reset,
  };
}
```

### 7.3 Multi-File Upload Pattern

For surfaces that allow multiple files (e.g., complaint attachments: up to 5), the calling component manages an array of `FileResponse[]` and calls `uploadAsync` sequentially or in parallel:

```typescript
// In the calling component:
const { uploadAsync } = useFileUpload();
const [uploadedFiles, setUploadedFiles] = useState<FileResponse[]>([]);

async function handleFiles(files: File[]) {
  for (const file of files) {
    const result = await uploadAsync({
      file,
      propertyId,
      filePurpose: 'complaint_attachment',
    });
    setUploadedFiles(prev => [...prev, result]);
  }
}
```

The hook itself is single-file-at-a-time. Orchestration of multi-file is the caller's responsibility. This keeps the hook simple and composable.

---

## 8. File Validation Design

### 8.1 Client-Side Validation Function

```typescript
// apps/<app>/src/lib/file-utils.ts

import { FILE_PURPOSE_POLICIES, type FilePurpose, type FileValidationResult } from "@granada-kost/domain";

export function validateFileForPurpose(file: File, purpose: FilePurpose): FileValidationResult {
  const policy = FILE_PURPOSE_POLICIES[purpose];

  // 1. MIME type check
  if (!policy.allowedMimeTypes.includes(file.type as any)) {
    const allowed = policy.allowedMimeTypes
      .map(m => m === 'image/jpeg' ? 'JPEG' : m === 'image/png' ? 'PNG' : 'PDF')
      .join(', ');
    return {
      valid: false,
      code: 'CLIENT_MIME_NOT_ALLOWED',
      message: `Format file tidak didukung. Gunakan ${allowed}.`,
    };
  }

  // 2. Size check (purpose-specific)
  const maxBytes = policy.maxBytesByMimeType[file.type as keyof typeof policy.maxBytesByMimeType] ?? 0;
  if (maxBytes > 0 && file.size > maxBytes) {
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      code: 'CLIENT_FILE_TOO_LARGE',
      message: `File terlalu besar. Maksimum ${maxMB} MB untuk ${policy.label}.`,
    };
  }

  // 3. Extension check
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const DANGEROUS = new Set(['exe','sh','bat','cmd','ps1','vbs','js','html','htm','svg','xml','php','asp','jar','war']);
  if (DANGEROUS.has(ext)) {
    return {
      valid: false,
      code: 'CLIENT_EXTENSION_DANGEROUS',
      message: 'Jenis file ini tidak diizinkan.',
    };
  }

  return { valid: true };
}
```

### 8.2 Validation Layering

```
 ┌──────────────────────────────────────────────┐
 │  Client-Side (UX only)                       │
 │  ├─ MIME type check (from file.type)         │
 │  ├─ Size check (from file.size)              │
 │  └─ Dangerous extension check                │
 │  → Instant feedback, no network call         │
 ├──────────────────────────────────────────────┤
 │  Multer Layer (transport)                    │
 │  └─ Hard ceiling: 5 MB                      │
 ├──────────────────────────────────────────────┤
 │  Backend FileService (authoritative)         │
 │  ├─ MIME type vs purpose allowlist           │
 │  ├─ Magic bytes via file-type                │
 │  ├─ MIME mismatch detection                  │
 │  ├─ Extension mismatch detection             │
 │  ├─ Purpose-specific size limits             │
 │  ├─ Rate limiting                            │
 │  ├─ Property quota check                     │
 │  └─ Role/purpose authorization               │
 └──────────────────────────────────────────────┘
```

Client-side validation catches ~90% of user errors immediately. Backend catches the remaining edge cases and malicious attempts.

---

## 9. Image Compression Design

### 9.1 When to Compress

Compression is applied when:
- The file is an image (`file.type.startsWith('image/')`)
- The policy's `compressImages` is `true` (payment proof, complaint, maintenance, vehicle photo, room photo)
- The caller has not explicitly set `compress: false`

Compression is NOT applied to:
- PDFs
- Property logos (these are designed assets, not camera photos)
- KTP documents (legal documents should not be altered)

### 9.2 Compression Algorithm

Uses native `<canvas>` API. No external library.

```typescript
// apps/<app>/src/lib/file-utils.ts

import { IMAGE_COMPRESSION } from "@granada-kost/domain";

export async function compressImage(file: File): Promise<Blob> {
  const { maxWidthPx, jpegQuality, outputFormat } = IMAGE_COMPRESSION;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;

      // Only downscale, never upscale
      if (width > maxWidthPx) {
        height = Math.round((height * maxWidthPx) / width);
        width = maxWidthPx;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Only use compressed version if it's actually smaller
          resolve(blob.size < file.size ? blob : file);
        },
        outputFormat,
        jpegQuality,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}
```

### 9.3 Compression Rules

| Rule | Value |
| --- | --- |
| Max width | 1600 px (maintain aspect ratio) |
| JPEG quality | 0.75 |
| Output format | Always `image/jpeg` |
| Never upscale | Only downscale if width > 1600 px |
| Use original if smaller | If compressed blob is larger, keep original |
| No external dependency | Native `<canvas>` API only |

### 9.4 Future: `browser-image-compression`

If canvas-based compression produces unsatisfactory quality (e.g., transparency loss from PNG→JPEG, artifacts), `browser-image-compression` can be evaluated as a drop-in replacement. For Phase 1, native canvas is sufficient and zero-dependency.

---

## 10. Upload Progress Design

### 10.1 Challenge

The `ApiClient` uses `globalThis.fetch` internally, and `fetch()` does not natively support upload progress events. `XMLHttpRequest.upload.onprogress` does, but the `ApiClient` is built on `fetch`.

### 10.2 Recommended Approach: Indeterminate Progress

For Phase 1, use an **indeterminate progress indicator** (spinner/pulse animation) rather than a percentage bar. This avoids:
- Adding `XMLHttpRequest` as a parallel transport alongside `fetch`.
- Modifying the frozen `ApiClient` package.
- Complexity that is unnecessary for files ≤ 2 MB (upload completes in < 2 seconds on typical connections).

### 10.3 UI Behavior

```
 ┌─────────────────────────────────────┐
 │  Idle          →  "Pilih file"      │
 │  Selected      →  Show filename     │
 │  Validating    →  "Memeriksa..."    │
 │  Compressing   →  "Mengompres..."   │
 │  Uploading     →  Spinner + text    │
 │  Success       →  ✓ + thumbnail     │
 │  Error         →  Error message     │
 │  Error + WA    →  Error + WA button │
 └─────────────────────────────────────┘
```

### 10.4 Phase 2: Percentage Progress (Optional)

If percentage progress is later required (e.g., for large PDFs on slow connections), implement a `fetchWithProgress` helper that wraps `XMLHttpRequest` with the same auth headers from `tokenProvider`:

```typescript
// Future: lib/file-utils.ts (Phase 2)
function fetchWithProgress(url, formData, token, onProgress): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve(new Response(xhr.response, { status: xhr.status }));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });
}
```

This is deferred to Phase 2. Phase 1 indeterminate progress is sufficient.

---

## 11. File Preview / Download Design

### 11.1 Authorized Blob Fetch

Per ADR-BE-FILE-001, preview must use **authorized blob fetch via the API client**. The frontend must NOT point `<img src>` directly at the content endpoint because:
- The API client manages JWT via `Authorization: Bearer <token>` header.
- Direct `<img src>` would require cookie-based auth, which is not supported.

### 11.2 Blob Fetch Helper

```typescript
// apps/<app>/src/lib/file-utils.ts

import { apiClient } from "@/lib/api";

export async function fetchFileBlob(fileId: string): Promise<string> {
  // Build the URL the same way ApiClient does (base URL + path).
  // We need raw fetch with auth headers, not JSON-parsed response.
  const token = /* tokenProvider.getAccessToken() */ null; // resolved from auth context
  const url = `${apiClient.baseUrl}/files/${fileId}/content`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`File fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
```

**Important:** The caller must call `URL.revokeObjectURL(url)` when the component unmounts to prevent memory leaks.

### 11.3 `useFilePreview` Hook

```typescript
import { useQuery } from "@tanstack/react-query";

export function useFilePreview(fileId: string | null) {
  return useQuery<string>({
    queryKey: ["file", "preview", fileId],
    queryFn: () => fetchFileBlob(fileId!),
    enabled: !!fileId,
    staleTime: 5 * 60_000,  // 5 minutes (match backend Cache-Control)
    gcTime: 10 * 60_000,
    // Don't retry on 403/404
    retry: (count, err) => {
      if (err instanceof ApiError && [403, 404].includes(err.status)) return false;
      return count < 1;
    },
  });
}
```

**Note:** The query data is an object URL string. TanStack Query will garbage-collect it after `gcTime`, but the object URL won't be revoked automatically. The component must handle revocation in a `useEffect` cleanup.

### 11.4 Preview Component Lifecycle

```
Component mounts → useFilePreview(fileId)
    → fetch blob from /files/:id/content (authorized)
    → create object URL
    → render <img src={objectUrl}>

Component unmounts → useEffect cleanup
    → URL.revokeObjectURL(objectUrl)
```

### 11.5 PDF Preview

For PDF files, two options:
1. **Link-style**: Show a PDF icon + filename. Click opens blob URL in a new tab (`window.open(objectUrl, '_blank')`).
2. **Inline**: Use `<iframe src={objectUrl}>` for inline PDF preview (Admin only, desktop).

Penghuni (mobile): option 1 (link-style).
Admin (desktop): option 2 (inline iframe) for `FilePreviewModal`, option 1 for inline list.

---

## 12. Error Handling and Fallback Design

### 12.1 Error Code Mapping

| Backend Code | Status | Indonesian UI Message | Fallback |
| --- | --- | --- | --- |
| `FILE_REQUIRED` | 400 | "File tidak ditemukan. Silakan pilih file terlebih dahulu." | — |
| `FILE_EXTENSION_NOT_ALLOWED` | 400 | "Jenis file ini tidak diizinkan." | — |
| `FILE_TYPE_UNSUPPORTED` | 400 | "Format file tidak didukung." | — |
| `FILE_MIME_MISMATCH` | 400 | "Isi file tidak sesuai dengan format yang dinyatakan." | — |
| `FILE_EXTENSION_MISMATCH` | 400 | "Ekstensi file tidak sesuai dengan isi file." | — |
| `FILE_TOO_LARGE` | 400 | "File terlalu besar (maks. 5 MB)." | Show WA fallback |
| `FILE_TOO_LARGE_FOR_PURPOSE` | 400 | "File terlalu besar untuk {purpose}." | Show WA fallback |
| `FILE_STORAGE_QUOTA_EXCEEDED` | 413 | "Kuota penyimpanan properti telah penuh." | Show WA fallback |
| `FILE_PURPOSE_DENIED` | 403 | "Anda tidak diizinkan mengupload file jenis ini." | — |
| `FILE_ACCESS_DENIED` | 403 | "Anda tidak memiliki akses ke file ini." | — |
| `RATE_LIMITED` | 429 | "Terlalu banyak upload. Coba lagi nanti." | — |
| `NETWORK_ERROR` | 0 | "Jaringan terputus. Periksa koneksi internet." | Show WA fallback |
| (5xx) | 500+ | "Server sedang bermasalah. Coba lagi nanti." | Show WA fallback |

### 12.2 Error Display Strategy

- **Client-side validation errors** → inline text below `FilePickerButton` (red text, no toast).
- **Upload errors (backend)** → toast via `toastMutationError()` + inline error text in the upload component.
- **Preview errors** → `ErrorState` component inside `FilePreview`.
- **Too-large / quota / network / 5xx errors** → toast + WhatsApp fallback button.

### 12.3 Consecutive Failure Tracking

Track consecutive 5xx failures in the upload hook. After 3 consecutive 5xx responses, automatically show the WhatsApp fallback button even for the next attempt.

```typescript
// Inside useFileUpload
const [consecutiveServerErrors, setConsecutiveServerErrors] = useState(0);

// In onError:
if (err.status >= 500) {
  setConsecutiveServerErrors(prev => prev + 1);
} else {
  setConsecutiveServerErrors(0);
}

const showWhatsAppFallback = consecutiveServerErrors >= 3
  || lastErrorCode === 'FILE_TOO_LARGE'
  || lastErrorCode === 'FILE_TOO_LARGE_FOR_PURPOSE'
  || lastErrorCode === 'FILE_STORAGE_QUOTA_EXCEEDED'
  || lastErrorCode === 'NETWORK_ERROR';
```

---

## 13. WhatsApp Fallback Policy

### 13.1 When to Show

The WhatsApp fallback button is shown when:
1. Upload endpoint returns 5xx three times in a row.
2. Client-side validation rejects the file as too large.
3. Backend returns `FILE_TOO_LARGE`, `FILE_TOO_LARGE_FOR_PURPOSE`, or `FILE_STORAGE_QUOTA_EXCEEDED`.
4. Network connectivity issue detected (`status === 0`).
5. File upload feature flag is disabled (future).

### 13.2 WhatsApp URL Builder

```typescript
// apps/<app>/src/lib/file-utils.ts

export function buildWhatsAppFallbackUrl(
  adminPhone: string,
  context: string,
): string {
  const message = encodeURIComponent(
    `Halo Admin, saya ingin mengirim ${context} tapi tidak dapat mengupload melalui aplikasi. Mohon bantuan.`
  );
  return `https://wa.me/${adminPhone}?text=${message}`;
}
```

### 13.3 Admin Phone Source

For Phase 1, the admin WhatsApp phone number comes from the environment:

```
VITE_ADMIN_WHATSAPP_PHONE=6281234567890
```

Future (Phase 2): from `property_settings` via a dedicated endpoint.

### 13.4 Component

```tsx
// WhatsAppFallbackButton.tsx
function WhatsAppFallbackButton({ context, adminPhone }: Props) {
  const url = buildWhatsAppFallbackUrl(adminPhone, context);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 h-10 text-sm font-semibold text-white">
      <MessageCircle className="h-4 w-4" />
      Kirim via WhatsApp
    </a>
  );
}
```

---

## 14. Admin Integration Targets

The upload engine serves these Admin surfaces:

| Surface | Route | Upload Action | Preview Action |
| --- | --- | --- | --- |
| Payment Proof Review | `payments.tsx` | None (admin reviews, doesn't upload) | `FilePreviewModal` for proof images |
| Complaint Detail | `complaints.tsx` | None in Phase 1 | `FilePreview` for complaint photos |
| Room Management | `rooms.tsx` | Upload room photos (future) | `FilePreview` for room photos |
| Vehicle Management | `vehicles.tsx` (future) | Upload vehicle photo/document | `FilePreview` for vehicle docs |
| Resident Management | `residents.tsx` | Upload KTP (future) | `FilePreview` for KTP |
| Settings | `settings.tsx` | Upload property logo | Logo preview |
| Maintenance Work Orders | `work-orders.tsx` (future) | Upload maintenance evidence | Evidence preview |

### Admin-Specific Behaviors

- **Property-scoped uploads**: Admin always provides `propertyId` from `PropertyProvider` context.
- **Desktop form factor**: `FilePreviewModal` can use inline `<iframe>` for PDF preview.
- **Batch operations**: Admin may upload multiple room photos in sequence.
- **Review-only access**: For payment proofs, admin downloads/previews but doesn't upload.

---

## 15. Penghuni Integration Targets

| Surface | Route | Upload Action | Preview Action |
| --- | --- | --- | --- |
| Payment Proof | `billing.tsx` | Upload proof image/PDF | Preview own uploaded proof |
| Complaint Create | `complaints.tsx` (future M12D) | Upload complaint photos | Preview own attached photos |

### Penghuni-Specific Behaviors

- **No property switcher**: Property is derived server-side from resident identity. The `propertyId` for uploads must come from the user's auth context (`auth/me` → `property_ids[0]`).
- **Mobile form factor**: `FilePickerButton` should support camera capture (`accept="image/*"` with `capture="environment"` for mobile camera).
- **Camera compression**: Photo uploads from camera are automatically compressed to reduce bandwidth and storage.
- **Single-file flow**: Payment proof typically involves one screenshot or photo.
- **WhatsApp fallback is critical**: Penghuni users may have unreliable connections. The WA fallback is a first-class safety net.

---

## 16. Smart Lock / CCTV Future Compatibility

### 16.1 Smart Lock Snapshot

When Smart Lock integration goes live (M11G+), the admin may need to upload:
- Evidence photos for lock-related incidents.
- Snapshot images from lock events.

These would use `file_purpose = 'general'` or a future `smart_lock_evidence` purpose. The upload engine's purpose-driven design supports this without changes — just add a new purpose to `FILE_PURPOSES` and `FILE_PURPOSE_POLICIES`.

**No engine changes needed.** Add purpose constant + policy entry.

### 16.2 CCTV Evidence

CCTV evidence capture (screenshot from CCTV feed) would also use the file upload engine. Since video is not supported in Phase 1, CCTV evidence would be:
- Screenshot images (`image/jpeg`, `image/png`).
- Maximum 2 MB per image.
- Purpose: `general` or future `cctv_evidence`.

**No engine changes needed.** Same pattern as maintenance evidence.

### 16.3 Extensibility Contract

To add a new file purpose in the future:
1. Backend: Add to `FILE_PURPOSES` array in `file.constants.ts`.
2. Backend: Add to `FILE_PURPOSE_POLICIES` in `file.constants.ts`.
3. Backend: Update `files_purpose_check` constraint in migration.
4. Frontend: Add to `FILE_PURPOSES` and `FILE_PURPOSE_POLICIES` in `packages/domain/src/file.ts`.
5. Frontend: No changes to hooks or components — they are purpose-agnostic.

---

## 17. Implementation Breakdown

### M12C2 — Frontend Upload Engine Foundation

**Scope**: Generic upload engine — shared types, hooks, utilities, UI components. No domain-specific wiring.

**Files:**

| Status | Path | Description |
| --- | --- | --- |
| `[NEW]` | `packages/domain/src/file.ts` | Shared file types, purposes, policies, validation |
| `[MODIFY]` | `packages/domain/src/index.ts` | Add `export * from "./file"` |
| `[NEW]` | `apps/penghuni/src/hooks/useFileUpload.ts` | Upload, preview, delete hooks |
| `[NEW]` | `apps/penghuni/src/lib/file-utils.ts` | Validation, compression, blob fetch, WhatsApp URL |
| `[NEW]` | `apps/penghuni/src/components/file/FilePickerButton.tsx` | File input with validation |
| `[NEW]` | `apps/penghuni/src/components/file/FilePreview.tsx` | Thumbnail/icon preview |
| `[NEW]` | `apps/penghuni/src/components/file/FilePreviewModal.tsx` | Full-screen preview dialog |
| `[NEW]` | `apps/penghuni/src/components/file/FileUploadProgress.tsx` | Upload progress indicator |
| `[NEW]` | `apps/penghuni/src/components/file/WhatsAppFallbackButton.tsx` | WA fallback |
| `[NEW]` | `apps/admin/src/hooks/useFileUpload.ts` | Upload, preview, delete hooks |
| `[NEW]` | `apps/admin/src/lib/file-utils.ts` | Validation, compression, blob fetch, WhatsApp URL |
| `[NEW]` | `apps/admin/src/components/file/FilePickerButton.tsx` | File input with validation |
| `[NEW]` | `apps/admin/src/components/file/FilePreview.tsx` | Thumbnail/icon preview |
| `[NEW]` | `apps/admin/src/components/file/FilePreviewModal.tsx` | Full-screen preview dialog |
| `[NEW]` | `apps/admin/src/components/file/FileUploadProgress.tsx` | Upload progress indicator |
| `[NEW]` | `apps/admin/src/components/file/WhatsAppFallbackButton.tsx` | WA fallback |

**Acceptance:**
- `packages/domain` exports file types, purposes, policies, `FileResponse`, validation types.
- `useFileUpload()` hook works in both apps — calls `POST /files` with `FormData`.
- `useFilePreview()` hook works in both apps — authorized blob fetch.
- `FilePickerButton` validates MIME, size, extension client-side with clear Indonesian error messages.
- `compressImage()` resizes images to max 1600px width, JPEG quality 0.75.
- `FilePreview` renders authorized image thumbnail or PDF icon.
- `FilePreviewModal` displays full-screen preview.
- `WhatsAppFallbackButton` opens WA deep link with pre-filled context.
- Both apps build, lint, and type-check.

---

### M12C3 — Penghuni Payment Proof Upload

**Scope**: Wire the upload engine into the payment proof submission flow.

**Files:**

| Status | Path | Description |
| --- | --- | --- |
| `[MODIFY]` | `backend/api/src/modules/billing/dto/create-my-payment-proof.dto.ts` | Add `file_ids` |
| `[MODIFY]` | `backend/api/src/modules/billing/controllers/my-billing.controller.ts` | Handle file_ids |
| `[MODIFY]` | `backend/api/src/modules/billing/services/payment-proof.service.ts` | Attach files |
| `[NEW]` | `backend/api/src/modules/billing/repositories/payment-proof-file.repository.ts` | Junction table ops |
| `[MODIFY]` | `apps/penghuni/src/routes/_app/billing.tsx` | Replace `PayActionDisabled` with upload flow |
| `[MODIFY]` | `apps/penghuni/src/hooks/usePenghuniBilling.ts` | Add `file_ids` to `SubmitPaymentProofInput` |

**Acceptance:**
- Resident selects file → client validates → compresses → uploads via `POST /files`.
- Resident submits proof via `POST /my/payment-proofs` with `file_ids`.
- `PayActionDisabled` is replaced with working `FilePickerButton` + submit form.
- WhatsApp fallback shown when upload fails.
- Backend persists proof + file junction + audit.

---

### M12C4 — Complaint Attachment

**Scope**: Backend readiness for complaint file attachment. Frontend deferred to M12D.

**Files:**

| Status | Path | Description |
| --- | --- | --- |
| `[MODIFY]` | `backend/api/src/modules/complaint/dto/create-my-complaint.dto.ts` | Add optional `file_ids` |
| `[MODIFY]` | `backend/api/src/modules/complaint/controllers/my-complaint.controller.ts` | Handle file_ids |
| `[MODIFY]` | `backend/api/src/modules/complaint/services/complaint.service.ts` | Attach files on create |

**Acceptance:**
- `POST /my/complaints` accepts optional `file_ids` array.
- Backend validates files exist, belong to same property, purpose is `complaint_attachment`.
- No frontend UI changes (deferred to M12D).

---

### M12C5 — Admin File Preview/Review

**Scope**: Admin can view uploaded files in payment proof review and complaint detail.

**Files:**

| Status | Path | Description |
| --- | --- | --- |
| `[MODIFY]` | `apps/admin/src/routes/payments.tsx` | Add file preview in proof detail |
| `[MODIFY]` | `apps/admin/src/hooks/useBilling.ts` | Fetch proof file metadata |
| `[MODIFY]` | `apps/admin/src/routes/complaints.tsx` | Add file preview in complaint detail |

**Acceptance:**
- Admin payment proof detail shows attached file thumbnails via `FilePreview`.
- Clicking thumbnail opens `FilePreviewModal` with full authorized image.
- Admin complaint detail shows attached file thumbnails.
- All file access goes through authorized blob fetch.
- Object URLs revoked on unmount.

---

## 18. Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Binary blob fetch via raw `fetch`**: Uses standalone `fetch` outside `ApiClient` for binary content. Token management and 401 refresh are not handled by `ApiClient` for blob requests. | Medium | The blob fetch helper reads the token from the same `tokenProvider` used by `ApiClient`. 401 refresh is not automatically retried for blob fetches — the component can catch 401 and re-fetch. |
| **Object URL memory leaks**: `URL.createObjectURL()` creates persistent blob references that must be explicitly revoked. | Medium | `useEffect` cleanup in preview components. Document pattern clearly. |
| **Canvas compression quality**: Converting PNG to JPEG loses transparency. | Low | Only applied for camera captures where transparency is not expected. PDFs and logos are not compressed. |
| **Large file upload on slow mobile**: 2 MB image on 3G may take 10+ seconds with no progress feedback. | Low | Phase 1: indeterminate spinner. Phase 2: XHR progress. WhatsApp fallback as safety net. |
| **Token expiry during upload**: If access token expires mid-upload, the upload fails with 401 and is not retried. | Low | Tokens are typically valid for 15+ minutes. A 2 MB upload completes in < 5 seconds. |

### Open Questions

1. **Blob fetch 401 handling**: Should the blob fetch helper integrate with the `ApiClient`'s refresh flow, or is a simple "retry once on 401" sufficient?
   - Recommendation: Simple retry once. The blob fetch helper calls `tokenProvider.refresh()` on 401, then retries. This avoids modifying the frozen `ApiClient`.

2. **Admin WhatsApp phone in env**: Is `VITE_ADMIN_WHATSAPP_PHONE` acceptable for Phase 1, or should it come from the property settings API from day one?
   - Recommendation: Env var for Phase 1. Add to `apps/penghuni/.env.example` and `apps/admin/.env.example`.

3. **`FilePreviewModal` implementation**: Should it use shadcn `Dialog` or a custom full-screen overlay?
   - Recommendation: Use shadcn `Dialog` component (already available in both apps' `components/ui/`). Content is an authorized `<img>` or `<iframe>` depending on MIME type.

4. **Camera capture attribute**: Should `FilePickerButton` on Penghuni use `capture="environment"` to directly open the rear camera?
   - Recommendation: Add `capture` as an optional prop. Default: no capture attribute (shows file chooser). For complaint attachments, set `capture="environment"` to encourage live photos.

5. **Multi-file picker UX**: Should the file input use `multiple` attribute for surfaces that allow multiple files?
   - Recommendation: Yes, controlled by `maxFiles` prop on `FilePickerButton`. Default: 1.

---

## 19. Acceptance Criteria

### Shared Domain (`packages/domain`)

- [ ] `file.ts` exports `FILE_PURPOSES`, `FilePurpose`, `FILE_PURPOSE_POLICIES`, `FileResponse`, `FileValidationResult`, `FILE_ERROR_CODES`, `IMAGE_COMPRESSION`.
- [ ] `index.ts` re-exports `file.ts`.
- [ ] Types match the backend `FileService.toResponse()` shape.
- [ ] `packages/domain` builds and type-checks.

### Penghuni Upload Engine

- [ ] `useFileUpload()` hook calls `POST /api/v1/files` with `FormData`.
- [ ] `useFilePreview()` hook fetches authorized blob and returns object URL.
- [ ] `useFileDelete()` hook calls `DELETE /api/v1/files/:id`.
- [ ] `validateFileForPurpose()` validates MIME, size, extension client-side.
- [ ] `compressImage()` resizes to max 1600px width, JPEG quality 0.75.
- [ ] `FilePickerButton` shows file input, validates before upload, shows inline error if invalid.
- [ ] `FilePreview` displays authorized image thumbnail or PDF icon.
- [ ] `FilePreviewModal` displays full-screen authorized preview.
- [ ] `FileUploadProgress` shows indeterminate spinner during upload.
- [ ] `WhatsAppFallbackButton` opens WA deep link with pre-filled message.
- [ ] Object URLs are revoked on component unmount.
- [ ] Penghuni app builds, lints, and type-checks.

### Admin Upload Engine

- [ ] Same hooks and components as Penghuni (adapted for admin styling).
- [ ] `FilePreviewModal` supports inline PDF preview via `<iframe>`.
- [ ] Admin app builds, lints, and type-checks.

### Error Handling

- [ ] Client-side validation errors show inline Indonesian message.
- [ ] Backend upload errors show toast via `toastMutationError()`.
- [ ] File-too-large errors show toast + WhatsApp fallback.
- [ ] Network errors show toast + WhatsApp fallback.
- [ ] 3 consecutive 5xx errors trigger WhatsApp fallback.
- [ ] `correlationId` surfaced in toast descriptions.

---

## 20. Final Recommendation

**Proceed with M12C2 implementation in the following order:**

1. **`packages/domain/src/file.ts`** — shared types and constants (30 min).
2. **`lib/file-utils.ts`** (both apps) — validation, compression, blob fetch, WhatsApp URL (1 hour).
3. **`hooks/useFileUpload.ts`** (both apps) — upload, preview, delete hooks (1 hour).
4. **UI components** (both apps) — `FilePickerButton`, `FilePreview`, `FilePreviewModal`, `FileUploadProgress`, `WhatsAppFallbackButton` (2–3 hours).
5. **Build verification** — build, lint, type-check both apps (30 min).

**Estimated effort: 1–2 days.**

**Dependencies:**
- M12C1 (Backend File API) is complete and committed. ✅
- No backend changes needed for M12C2.
- No `packages/api-client` changes needed.
- No new npm dependencies. Native `<canvas>` API for compression.

**Next step after M12C2:**
- M12C3 (Penghuni Payment Proof Upload): Wire `FilePickerButton` + `useFileUpload` into `billing.tsx`, replace `PayActionDisabled`, extend `SubmitPaymentProofInput` with `file_ids`.

**Key architectural decisions:**
- Upload engine is purpose-agnostic. Any future file surface adds a purpose constant + policy entry — zero hook/component changes.
- Preview uses authorized blob fetch, not direct `<img src>`. Object URLs are managed by components.
- Client-side validation is UX-only. Backend is authoritative.
- Indeterminate upload progress for Phase 1. XHR-based percentage progress deferred to Phase 2.
- WhatsApp fallback is a first-class feature, not an afterthought.
- Per-app hooks and components (not shared package) per ADR-FE-007.

**Verdict:** M12C2 is ready for implementation. The design is consistent with all existing frontend patterns (ADR-FE-001 through ADR-FE-011), purpose-agnostic for all current and future upload surfaces, and requires zero changes to frozen packages.
