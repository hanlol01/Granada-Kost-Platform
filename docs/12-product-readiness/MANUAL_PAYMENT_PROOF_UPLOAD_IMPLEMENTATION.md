# M12C3 - Penghuni Manual Payment Proof Upload Implementation

Date: 2026-07-03
Status: Implemented

## Implementation Summary

M12C3 enables Penghuni users to upload manual payment proof files and submit them with payment proof metadata. This is a fallback/manual payment flow only. Uploading proof creates a `pending_review` payment proof and attaches file metadata through `payment_proof_files`; it does not mark the invoice as paid.

Admin verification remains the authority for manual payment settlement.

## Backend Files Changed

| File | Change |
| --- | --- |
| `backend/api/src/modules/billing/dto/create-my-payment-proof.dto.ts` | Added optional `file_ids` array with UUID, uniqueness, and max-3 validation. |
| `backend/api/src/modules/billing/types/billing.types.ts` | Added payment proof file record/input types and `fileIds` on proof submit input. |
| `backend/api/src/modules/billing/repositories/payment-proof-file.repository.ts` | Added raw SQL repository for `payment_proof_files` attach/list. |
| `backend/api/src/modules/billing/billing.module.ts` | Imported `FileModule` and registered `PaymentProofFileRepository`. |
| `backend/api/src/modules/billing/services/payment-proof.service.ts` | Validates invoice/user context and attached files before proof creation; attaches files; writes submit audit. |
| `backend/api/src/modules/billing/controllers/my-billing.controller.ts` | Passes `file_ids` and audit context into `PaymentProofService.submitProof()`. |
| `backend/api/src/modules/billing/constants/billing.constants.ts` | Added `payment_proof.submit` audit action. |

## Frontend Files Changed

| File | Change |
| --- | --- |
| `apps/penghuni/src/routes/_app/billing.tsx` | Replaced disabled payment proof placeholder with manual proof upload flow using the generic upload engine. |
| `apps/penghuni/src/hooks/usePenghuniBilling.ts` | Added `file_ids` to manual proof submit request shape. |
| `apps/penghuni/src/components/file/FilePickerButton.tsx` | Added optional validation callback so callers can show WhatsApp fallback for oversized files. |
| `packages/domain/src/env.ts` | Added typed `VITE_ADMIN_WHATSAPP_PHONE` env value used by the fallback button. |

## API / DTO Changes

`POST /api/v1/my/payment-proofs` now accepts:

```json
{
  "invoice_id": "uuid",
  "payment_account_id": "uuid",
  "claimed_amount": 1000000,
  "payment_method": "bank_transfer",
  "notes": "optional",
  "file_ids": ["uuid"]
}
```

`file_ids` is optional for backward compatibility and exceptional manual cases. When provided, the backend validates each file before attaching it.

## Backend Validation Behavior

The backend is the final authority. For submitted `file_ids`, it validates:

- Invoice belongs to the authenticated resident user.
- Invoice property/resident context matches the payment proof payload.
- File exists in the central `files` table.
- File is not soft-deleted.
- File purpose is exactly `payment_proof`.
- File property matches the invoice property.
- File uploader matches the authenticated resident user.
- Maximum 3 payment proof files per submission.

The submit flow writes `payment_proof.submit` audit data including attached file IDs.

## Payment Proof Lifecycle

Manual payment proof lifecycle remains unchanged:

- `pending_review` after resident submission.
- `verified` only after admin verification.
- `rejected` only after admin rejection.
- `expired` remains available for future lifecycle handling.

M12C3 does not auto-create a verified payment and does not auto-mark invoices as paid.

## Frontend Flow Behavior

Penghuni billing now shows `Upload Bukti Pembayaran Manual` for actionable invoices:

1. Resident sees selected invoice and total amount.
2. Resident picks a payment proof file with `file_purpose = payment_proof`.
3. Generic upload engine uploads to `POST /files`.
4. Returned file metadata is previewed through authorized backend-mediated preview.
5. Resident selects manual payment method and optional notes.
6. Resident submits `POST /my/payment-proofs` with `file_ids`.
7. UI shows pending admin review and explicitly says the tagihan is not automatically paid.
8. WhatsApp fallback appears when upload fails or file validation blocks an oversized file.

## Manual Fallback Positioning

The UI copy positions this as a manual fallback path for:

- Bank transfer/manual QRIS proof.
- Cash payment confirmation.
- Payment gateway outage.
- Exceptional reconciliation.

## Future Payment Gateway Compatibility

This implementation does not assume proof upload is mandatory for future online payments. When a payment gateway is implemented later, successful gateway payment should mark invoice/payment status through webhook or callback. Manual proof upload remains a parallel fallback flow.

## Validation Result

| Command | Result |
| --- | --- |
| `npm.cmd run lint:api` | PASS |
| `npm.cmd run build:api` | PASS |
| `npm.cmd run lint:penghuni` | PASS with 9 pre-existing warnings |
| `npm.cmd --workspace @granada-kost/penghuni run typecheck` | PASS |
| `npm.cmd run build:penghuni` | PASS |

No browser and no smoke test were run, per scope.

## Remaining Work for M12C5 Admin Preview / Review

- Add Admin payment proof detail file preview.
- Fetch attached proof file metadata for admin review queues.
- Allow admin to view proof content through `GET /files/:fileId/content`.
- Keep verification/rejection as the only authority for manual proof settlement.

## Known Limitations

- Submitted proof pending state is shown immediately after submission in the current page session; a persistent Penghuni "my proof history" endpoint is not added in M12C3.
- Admin file preview/review UI is intentionally deferred to M12C5.
- Manual proof upload does not support receipt/nota generation.
- Payment gateway and Midtrans integration are intentionally out of scope.

## Verdict

PASS
