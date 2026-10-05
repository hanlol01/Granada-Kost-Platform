import { z } from "zod";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";
import { mapV2Data, type V2DataEnvelope } from "./admin-ux-mapper.ts";
import { LeaseRevisionContractError, leaseRevisionContextSchema, parseLeaseRevisionContext } from "./lease-revision-contract.ts";

const uuid = z.string().uuid();
const finance = z.enum(["not_required", "pending_review", "resolved"]);
const status = z.enum(["archived", "restored", "superseded"]);
const resultSchema = z.object({
  id: uuid, propertyId: uuid, leaseId: uuid, leaseCode: z.string().min(1), residentId: uuid,
  roomId: uuid, roomNumber: z.string().min(1), roomStatus: z.literal("vacant"),
  archiveStatus: z.literal("archived"), financialResolutionState: z.enum(["not_required", "pending_review"]),
  residentProfileArchived: z.boolean(), reason: z.string().min(3), voidedInvoiceIds: z.array(uuid),
}).refine((value) => value.financialResolutionState !== "pending_review" || value.voidedInvoiceIds.length === 0);
const reviewSchema = z.object({
  reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/), roomAfter: z.literal("vacant"),
  financialResolutionState: z.enum(["not_required", "pending_review"]), invoiceCount: z.number().int().nonnegative(),
  consequence: z.string().min(1),
});
const rowSchema = z.object({
  id: uuid, propertyId: uuid, leaseId: uuid, archiveStatus: status, financialResolutionState: finance,
  reason: z.string().min(3), archivedAt: z.string().datetime({ offset: true }), archivedBy: z.string().min(1),
  leaseCode: z.string().min(1), commercialMode: z.enum(["rent", "owner_sponsored"]),
  residentName: z.string().min(1), roomNumber: z.string().min(1), plotNumber: z.string().nullable(),
});
const detailSchema = z.object({
  id: uuid, propertyId: uuid, leaseId: uuid, archiveStatus: status, financialResolutionState: finance,
  reason: z.string().min(3), archivedAt: z.string().datetime({ offset: true }), archivedBy: z.string().min(1),
  originalContext: leaseRevisionContextSchema, cancellationResult: resultSchema,
  currentRoomStatus: z.string().min(1),
  restoredAt: z.string().datetime({ offset: true }).nullable(), restorationReason: z.string().nullable(), restoredBy: z.string().nullable(),
  successorLeaseId: uuid.nullable(), replacedAt: z.string().datetime({ offset: true }).nullable(), replacementReason: z.string().nullable(), replacedBy: z.string().nullable(),
}).refine((value) => value.originalContext.lease.id === value.leaseId &&
  value.originalContext.lease.propertyId === value.propertyId && value.cancellationResult.id === value.id &&
  value.cancellationResult.leaseId === value.leaseId && value.cancellationResult.propertyId === value.propertyId &&
  (value.archiveStatus === "restored" ? !!value.restoredAt && !!value.restorationReason && !!value.restoredBy && !value.successorLeaseId && !value.replacedAt
    : value.archiveStatus === "superseded" ? !value.restoredAt && !!value.successorLeaseId && value.successorLeaseId !== value.leaseId && !!value.replacedAt && !!value.replacementReason && !!value.replacedBy
      : !value.restoredAt && !value.restorationReason && !value.restoredBy && !value.successorLeaseId && !value.replacedAt && !value.replacementReason && !value.replacedBy));
const restorationResultSchema = z.object({
  archiveId: uuid, propertyId: uuid, leaseId: uuid, residentId: uuid, roomId: uuid,
  roomNumber: z.string().min(1), leaseCode: z.string().min(1), archiveStatus: z.literal("restored"),
  leaseStatus: z.enum(["awaiting_activation", "active"]), roomStatus: z.enum(["reserved", "awaiting_check_in"]),
  financialResolutionState: z.literal("not_required"), reason: z.string().min(3),
}).refine(value => value.roomStatus === (value.leaseStatus === "active" ? "awaiting_check_in" : "reserved"));
const restorationReviewSchema = z.object({
  archiveId: uuid, propertyId: uuid, originalContext: leaseRevisionContextSchema,
  financialResolutionState: finance,
  decision: z.object({ allowed: z.boolean(), code: z.string().nullable(), message: z.string().nullable(),
    recommendedAction: z.enum(["direct_restore", "linked_successor", "review_records"]) }),
  reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/), consequence: z.string().min(1),
  leaseStatusAfter: z.enum(["awaiting_activation", "active"]), roomStatusAfter: z.enum(["reserved", "awaiting_check_in"]),
}).refine(value => value.originalContext.lease.propertyId === value.propertyId &&
  value.roomStatusAfter === (value.leaseStatusAfter === "active" ? "awaiting_check_in" : "reserved") &&
  (value.decision.allowed
    ? value.decision.code === null && value.decision.message === null && value.decision.recommendedAction === "direct_restore" && !value.originalContext.lease.physicalCheckInRecorded
    : !!value.decision.code && !!value.decision.message && value.decision.recommendedAction !== "direct_restore"));

export type LeaseRestorationReview = z.infer<typeof restorationReviewSchema>;
export type LeaseRestorationResult = z.infer<typeof restorationResultSchema>;
export type LeaseRestorationInput = { propertyId: string; reason: string; reviewFingerprint: string; restorationConfirmed: true };

export type LeaseCancellationResult = z.infer<typeof resultSchema>;
export type LeaseCancellationReview = ReturnType<typeof parseCancellationReview>;
export type LeaseArchiveDetail = z.infer<typeof detailSchema>;
export type LeaseArchiveRow = z.infer<typeof rowSchema>;
export type LeaseCancellationInput = {
  reason: string; reviewFingerprint: string; cancellationConfirmed: true; mistakenActivationConfirmed: boolean;
};
export type LeaseArchiveFilters = {
  propertyId: string; q?: string; commercialMode?: "rent" | "owner_sponsored";
  financialResolutionState?: z.infer<typeof finance>; limit?: number; offset?: number;
};
function invalid(commit = false): never {
  throw new LeaseRevisionContractError(commit ? "LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID" : "LEASE_ARCHIVE_RESPONSE_INVALID",
    commit ? "Hasil pembatalan belum dapat dipastikan. Periksa arsip atau coba ulang pengajuan yang sama tanpa mengubah isian."
      : "Data arsip atau tinjauan belum lengkap. Perbarui data sebelum melanjutkan.");
}
function assertScope(value: { propertyId: string; leaseId?: string; id?: string }, propertyId: string, leaseId?: string, archiveId?: string) {
  if (value.propertyId !== propertyId || leaseId && value.leaseId !== leaseId || archiveId && value.id !== archiveId)
    throw new LeaseRevisionContractError("LEASE_REVISION_SCOPE_CHANGED", "Penyewaan atau properti berubah. Buka ulang data yang benar.");
}
export function parseCancellationReview(envelope: V2DataEnvelope<unknown>, leaseId: string, propertyId: string) {
  const context = parseLeaseRevisionContext(envelope, leaseId, propertyId);
  const additional = reviewSchema.safeParse(mapV2Data(envelope));
  if (!additional.success || !context.policies.cancellation.allowed ||
    (additional.data.financialResolutionState === "pending_review") !== context.policies.cancellation.financialResolutionRequired) invalid();
  return { ...context, ...additional.data };
}
export function parseCancellationResult(envelope: V2DataEnvelope<unknown>, leaseId: string, propertyId: string) {
  const result = z.object({ archive: resultSchema }).safeParse(mapV2Data(envelope));
  if (!result.success) invalid(true);
  assertScope(result.data.archive, propertyId, leaseId);
  return result.data.archive;
}
export function parseArchiveDetail(envelope: V2DataEnvelope<unknown>, archiveId: string, propertyId: string) {
  const result = detailSchema.safeParse(mapV2Data(envelope));
  if (!result.success) invalid();
  assertScope(result.data, propertyId, undefined, archiveId);
  return result.data;
}
export function parseRestorationReview(envelope: V2DataEnvelope<unknown>, archiveId: string, propertyId: string) {
  const result = restorationReviewSchema.safeParse(mapV2Data(envelope));
  if (!result.success) throw new LeaseRevisionContractError("LEASE_ARCHIVE_RESTORE_RESPONSE_INVALID", "Tinjauan pemulihan belum lengkap. Perbarui arsip sebelum melanjutkan.");
  assertScope({ ...result.data, id: result.data.archiveId }, propertyId, undefined, archiveId);
  return result.data;
}
export function parseRestorationResult(envelope: V2DataEnvelope<unknown>, archiveId: string, propertyId: string, leaseId: string) {
  const result = z.object({ restoration: restorationResultSchema }).safeParse(mapV2Data(envelope));
  if (!result.success) throw new LeaseRevisionContractError("LEASE_ARCHIVE_RESTORE_COMMIT_RESPONSE_INVALID", "Hasil pemulihan belum dapat dipastikan. Coba ulang pengajuan yang sama tanpa mengubah isian.");
  assertScope({ ...result.data.restoration, id: result.data.restoration.archiveId }, propertyId, leaseId, archiveId);
  return result.data.restoration;
}
export function createLeaseArchiveClient(requester: Pick<AdminUxV2Requester, "get" | "post">) {
  return {
    restorationPreview: async (archiveId: string, propertyId: string, signal?: AbortSignal) => parseRestorationReview(
      await requester.get<V2DataEnvelope<unknown>>(`/lease-archives/${encodeURIComponent(archiveId)}/restoration-preview`, { signal, query: { property_id: propertyId } }), archiveId, propertyId),
    restore: async (archiveId: string, leaseId: string, input: LeaseRestorationInput, idempotencyKey: string) => parseRestorationResult(
      await requester.post<V2DataEnvelope<unknown>>(`/lease-archives/${encodeURIComponent(archiveId)}/restore`, {
        property_id: input.propertyId, reason: input.reason.trim(), review_fingerprint: input.reviewFingerprint, restoration_confirmed: input.restorationConfirmed,
      }, { idempotencyKey }), archiveId, input.propertyId, leaseId),
    preview: async (leaseId: string, propertyId: string, signal?: AbortSignal) => parseCancellationReview(
      await requester.get<V2DataEnvelope<unknown>>(`/leases/${encodeURIComponent(leaseId)}/cancellation-preview`, { signal }), leaseId, propertyId),
    cancel: async (leaseId: string, propertyId: string, input: LeaseCancellationInput, idempotencyKey: string) => parseCancellationResult(
      await requester.post<V2DataEnvelope<unknown>>(`/leases/${encodeURIComponent(leaseId)}/cancel-and-archive`, {
        reason: input.reason.trim(), review_fingerprint: input.reviewFingerprint,
        cancellation_confirmed: input.cancellationConfirmed, mistaken_activation_confirmed: input.mistakenActivationConfirmed,
      }, { idempotencyKey }), leaseId, propertyId),
    list: async (filters: LeaseArchiveFilters, signal?: AbortSignal) => {
      const envelope = await requester.get<V2DataEnvelope<unknown>>("/lease-archives", { signal, query: {
        property_id: filters.propertyId, q: filters.q?.trim() || undefined, commercial_mode: filters.commercialMode,
        financial_resolution_state: filters.financialResolutionState, limit: filters.limit ?? 20, offset: filters.offset ?? 0,
      } });
      const result = z.object({ items: z.array(rowSchema), total: z.number().int().nonnegative(),
        limit: z.number().int().min(1).max(100), offset: z.number().int().nonnegative() }).safeParse(mapV2Data(envelope));
      if (!result.success) invalid();
      for (const item of result.data.items) assertScope(item, filters.propertyId);
      return result.data;
    },
    detail: async (archiveId: string, propertyId: string, signal?: AbortSignal) => parseArchiveDetail(
      await requester.get<V2DataEnvelope<unknown>>(`/lease-archives/${encodeURIComponent(archiveId)}`, {
        signal, query: { property_id: propertyId },
      }), archiveId, propertyId),
  };
}
