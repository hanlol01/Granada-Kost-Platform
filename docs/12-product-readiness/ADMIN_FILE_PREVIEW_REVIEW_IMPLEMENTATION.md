# M12C5 — Admin File Preview & Manual Payment Proof Review Implementation

> Milestone: M12C5  
> Status: Complete  
> Date: 2026-07-03

## Summary

Implements admin-side file preview for payment proof attachments and complaint
attachments. Adds backend file metadata endpoints and admin UI components for
reviewing manual payment proofs before verification/rejection.

## Architecture Decision

**Backend-mediated file access** — per ADR-BE-FILE-001, all file access goes
through authorized endpoints. No public storage URLs are exposed. The admin
frontend fetches file blobs via `fetchFileBlob()` using the user's access token.

## Backend Changes

### Payment Proof File Metadata

| File | Change |
|------|--------|
| `billing/controllers/payment-proof.controller.ts` | Added `GET /payment-proofs/:proofId/files` endpoint |
| `billing/services/payment-proof.service.ts` | Added `listFiles(proofId)` method joining through `payment_proof_files` junction |

The endpoint returns safe file metadata via `FileService.toResponse()` which
strips `storage_path` and internal-only fields.

### Complaint File Metadata

| File | Change |
|------|--------|
| `complaint/controllers/complaint.controller.ts` | Added `GET /complaints/:complaintId/files` endpoint |
| `complaint/services/complaint.service.ts` | Added `listFileRecords(complaintId)` method resolving junction → file records |

Same pattern: returns safe file metadata, no storage paths.

### Authorization

Both new endpoints follow the existing pattern:
1. Fetch the parent resource (proof/complaint)
2. `assertCanReadProperty(user, resource.propertyId)`
3. Return file metadata only if the user has property-scoped access

## Frontend Changes

### New Hooks

| File | Hook | Purpose |
|------|------|---------|
| `hooks/useBilling.ts` | `usePaymentProofDetail` | Fetch single proof by ID |
| `hooks/useBilling.ts` | `usePaymentProofFiles` | Fetch file metadata for a proof |
| `hooks/useComplaints.ts` | `useComplaintFiles` | Fetch file metadata for a complaint |

### New Types

| File | Type | Purpose |
|------|------|---------|
| `hooks/useBilling.ts` | `FileMetadataRecord` | Shared snake_case file metadata type matching backend response |
| `hooks/useBilling.ts` | `PaymentProofRecord` | Expanded from stub to full backend shape |

### New Components

| File | Component | Purpose |
|------|-----------|---------|
| `components/file/AttachedFilesPreview.tsx` | `AttachedFilesPreview` | Reusable file thumbnail row with click-to-preview. Maps `FileMetadataRecord` → `FileResponse` for M12C2 components |

### Modified Routes

#### `routes/payments.tsx`

- **Verifikasi tab** now shows `PaymentProofRecord[]` instead of generic `PaymentRecord[]`
- **PendingProofList** replaces `PendingPaymentList`:
  - Shows payment method, claimed amount, upload date, proof status badge
  - "Lihat Bukti" button opens proof review dialog
  - "Verifikasi" and "Tolak" buttons for quick actions
- **PaymentProofReviewDialog** (new):
  - Shows proof details (method, amount, date, status, notes)
  - Displays attached proof files via `AttachedFilesPreview` (80px thumbnails)
  - Click a thumbnail → `FilePreviewModal` for full-size authorized preview
  - Verify/Reject actions inside the dialog

#### `routes/complaints.tsx`

- **ComplaintAttachments** component added inside the complaint detail dialog
- Renders between location notes and action buttons
- Uses `useComplaintFiles` hook + `AttachedFilesPreview` (64px thumbnails)
- Returns null gracefully when no attachments exist

## Data Flow

```
Admin clicks "Lihat Bukti"
  → PaymentProofReviewDialog opens
  → usePaymentProofFiles(proofId) fetches GET /payment-proofs/:id/files
  → AttachedFilesPreview maps FileMetadataRecord → FileResponse
  → FilePreview renders thumbnail via useFilePreview(fileId)
    → fetchFileBlob() → GET /files/:id/content (authorized blob)
    → Creates Object URL → renders <img>
  → Admin clicks thumbnail → FilePreviewModal opens full-size view
  → Admin clicks "Verifikasi" → ConfirmDialog → POST /payments/:id/verify
```

## Validation Results

| Check | Result |
|-------|--------|
| `npm run lint:api` | ✅ 0 errors |
| `npm run build:api` | ✅ PASS |
| `npm run lint:admin` | ✅ 0 errors (15 pre-existing warnings) |
| `npm run build:admin` | ✅ PASS |

## Scope Adherence

- ✅ No payment gateway / Midtrans implementation
- ✅ No receipt generation
- ✅ No complaint creation UI
- ✅ No video upload
- ✅ No public storage URLs
- ✅ All file access is backend-mediated and authorized
- ✅ Reusable AttachedFilesPreview component (not one-off)
