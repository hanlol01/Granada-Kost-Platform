import { z } from "zod";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";
import { mapV2Data, type V2DataEnvelope } from "./admin-ux-mapper.ts";
import { LeaseRevisionContractError } from "./lease-revision-contract.ts";

const uuid = z.string().uuid();
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const relation = z.object({
  relationship: z.string().min(1),
  recordCode: z.string().nullable(),
  protected: z.boolean(),
  sharedWithAnotherLease: z.boolean(),
});
const scope = { archiveId: uuid, propertyId: uuid, leaseId: uuid };
const inventoryItem = z
  .object({
    fileId: uuid,
    filename: z.string().min(1),
    filePurpose: z.string().min(1),
    sizeBytes: bytes,
    selectable: z.boolean(),
    code: z.string().nullable(),
    message: z.string().nullable(),
    estimatedBytes: bytes,
    metadataRemoved: z.boolean(),
    onlyDigitalEvidence: z.boolean(),
    claimCommandId: uuid.nullable(),
    relationships: z.array(relation),
  })
  .refine((item) => !item.metadataRemoved || !item.onlyDigitalEvidence)
  .refine((item) =>
    item.selectable
      ? item.sizeBytes > 0 &&
        item.estimatedBytes === item.sizeBytes &&
        item.code === null &&
        item.message === null &&
        item.claimCommandId === null &&
        item.relationships.length > 0 &&
        item.relationships.every((value) => !value.protected && !value.sharedWithAnotherLease)
      : !!item.code && !!item.message && item.estimatedBytes === 0,
  );
const inventorySchema = z
  .object({
    ...scope,
    leaseCode: z.string().min(1),
    archiveStatus: z.enum(["archived", "superseded", "restored"]),
    coverageVerified: z.boolean(),
    reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    selectableCount: z.number().int().nonnegative(),
    estimatedBytes: bytes,
    capacityNote: z.string().min(1),
    items: z.array(inventoryItem),
  })
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.fileId)).size === value.items.length &&
      value.selectableCount === value.items.filter((item) => item.selectable).length &&
      value.estimatedBytes === value.items.reduce((sum, item) => sum + item.estimatedBytes, 0) &&
      ((value.coverageVerified && value.archiveStatus !== "restored") ||
        value.selectableCount === 0),
  );

const summaryFields = {
  ...scope,
  commandId: uuid,
  reason: z.string().min(3),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  selectedCount: z.number().int().min(1).max(100),
  deletedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  retryPendingCount: z.number().int().nonnegative(),
  freedBytes: bytes,
};
const validCounts = (value: {
  selectedCount: number;
  deletedCount: number;
  failedCount: number;
  retryPendingCount: number;
  freedBytes: number;
}) =>
  value.selectedCount === value.deletedCount + value.failedCount + value.retryPendingCount &&
  (value.deletedCount > 0 || value.freedBytes === 0);
const summarySchema = z.object(summaryFields).refine(validCounts);
const resultItem = z
  .object({
    fileId: uuid,
    filename: z.string().min(1),
    sizeBytes: bytes,
    relationships: z.array(relation),
    status: z.enum(["deleted", "failed", "retry_pending"]),
    attemptCount: z.number().int().nonnegative(),
    freedBytes: bytes,
    verifiedDeletedAt: z.string().datetime({ offset: true }).nullable(),
    resultCode: z.string().nullable(),
    availability: z.enum(["absent", "present", "unknown"]),
    message: z.string().min(1),
  })
  .refine((item) =>
    item.status === "deleted"
      ? !!item.verifiedDeletedAt &&
        item.attemptCount > 0 &&
        item.resultCode === null &&
        item.availability === "absent" &&
        item.freedBytes <= item.sizeBytes
      : item.verifiedDeletedAt === null &&
        item.freedBytes === 0 &&
        !!item.resultCode &&
        (item.status === "retry_pending"
          ? item.availability === "unknown"
          : item.availability !== "absent"),
  );
const resultSchema = z
  .object({ ...summaryFields, items: z.array(resultItem) })
  .refine(
    (value) =>
      validCounts(value) &&
      value.selectedCount === value.items.length &&
      new Set(value.items.map((item) => item.fileId)).size === value.items.length &&
      value.deletedCount === value.items.filter((item) => item.status === "deleted").length &&
      value.failedCount === value.items.filter((item) => item.status === "failed").length &&
      value.retryPendingCount ===
        value.items.filter((item) => item.status === "retry_pending").length &&
      value.freedBytes === value.items.reduce((sum, item) => sum + item.freedBytes, 0),
  );

export type ArchiveFileInventory = z.infer<typeof inventorySchema>;
export type ArchiveFileResult = z.infer<typeof resultSchema>;
export type ArchiveFileCommandSummary = z.infer<typeof summarySchema>;
export type ArchiveFilePurgeInput = {
  propertyId: string;
  selectedFileIds: string[];
  reason: string;
  reviewFingerprint: string;
  permanentDeletionConfirmed: true;
};

function invalid(commit = false): never {
  throw new LeaseRevisionContractError(
    commit ? "LEASE_FILE_PURGE_COMMIT_RESPONSE_INVALID" : "LEASE_FILE_PURGE_RESPONSE_INVALID",
    commit
      ? "Hasil penghapusan belum dapat dipastikan. Periksa pengajuan atau coba ulang pengajuan yang sama tanpa mengubah pilihan."
      : "Inventaris atau hasil pengajuan belum lengkap. Perbarui arsip sebelum melanjutkan.",
  );
}
function assertScope(
  value: { archiveId: string; propertyId: string; leaseId?: string; commandId?: string },
  archiveId: string,
  propertyId: string,
  leaseId?: string,
  commandId?: string,
) {
  if (
    value.archiveId !== archiveId ||
    value.propertyId !== propertyId ||
    (leaseId && value.leaseId !== leaseId) ||
    (commandId && value.commandId !== commandId)
  )
    throw new LeaseRevisionContractError(
      "LEASE_REVISION_SCOPE_CHANGED",
      "Arsip atau properti telah berubah. Buka kembali arsip yang benar.",
    );
}
export function parseArchiveFileInventory(
  envelope: V2DataEnvelope<unknown>,
  archiveId: string,
  propertyId: string,
) {
  const parsed = inventorySchema.safeParse(mapV2Data(envelope));
  if (!parsed.success) invalid();
  assertScope(parsed.data, archiveId, propertyId);
  return parsed.data;
}
export function parseArchiveFileResult(
  envelope: V2DataEnvelope<unknown>,
  archiveId: string,
  propertyId: string,
  leaseId: string,
  commandId?: string,
) {
  const parsed = resultSchema.safeParse(mapV2Data(envelope));
  if (!parsed.success) invalid(true);
  assertScope(parsed.data, archiveId, propertyId, leaseId, commandId);
  return parsed.data;
}
export function createLeaseArchiveFileClient(requester: Pick<AdminUxV2Requester, "get" | "post">) {
  const base = (id: string) => `/lease-archives/${encodeURIComponent(id)}`;
  return {
    inventory: async (archiveId: string, propertyId: string, signal?: AbortSignal) =>
      parseArchiveFileInventory(
        await requester.get<V2DataEnvelope<unknown>>(`${base(archiveId)}/files`, {
          signal,
          query: { property_id: propertyId },
        }),
        archiveId,
        propertyId,
      ),
    purge: async (
      archiveId: string,
      leaseId: string,
      input: ArchiveFilePurgeInput,
      idempotencyKey: string,
    ) =>
      parseArchiveFileResult(
        await requester.post<V2DataEnvelope<unknown>>(
          `${base(archiveId)}/file-purge`,
          {
            property_id: input.propertyId,
            selected_file_ids: input.selectedFileIds,
            reason: input.reason.trim(),
            review_fingerprint: input.reviewFingerprint,
            permanent_deletion_confirmed: input.permanentDeletionConfirmed,
          },
          { idempotencyKey },
        ),
        archiveId,
        input.propertyId,
        leaseId,
      ),
    result: async (
      archiveId: string,
      leaseId: string,
      commandId: string,
      propertyId: string,
      signal?: AbortSignal,
    ) =>
      parseArchiveFileResult(
        await requester.get<V2DataEnvelope<unknown>>(
          `${base(archiveId)}/file-purge-commands/${encodeURIComponent(commandId)}`,
          { signal, query: { property_id: propertyId } },
        ),
        archiveId,
        propertyId,
        leaseId,
        commandId,
      ),
    retry: async (
      archiveId: string,
      leaseId: string,
      commandId: string,
      propertyId: string,
      selectedFileIds: string[],
    ) =>
      parseArchiveFileResult(
        await requester.post<V2DataEnvelope<unknown>>(
          `${base(archiveId)}/file-purge-commands/${encodeURIComponent(commandId)}/retry`,
          { property_id: propertyId, selected_file_ids: selectedFileIds },
        ),
        archiveId,
        propertyId,
        leaseId,
        commandId,
      ),
    history: async (archiveId: string, propertyId: string, offset = 0, signal?: AbortSignal) => {
      const envelope = await requester.get<V2DataEnvelope<unknown>>(
        `${base(archiveId)}/file-purge-commands`,
        { signal, query: { property_id: propertyId, offset, limit: 20 } },
      );
      const parsed = z
        .object({
          items: z.array(summarySchema),
          total: z.number().int().nonnegative(),
          limit: z.literal(20),
          offset: z.number().int().nonnegative(),
        })
        .safeParse(mapV2Data(envelope));
      if (
        !parsed.success ||
        parsed.data.offset !== offset ||
        parsed.data.items.length > 20 ||
        parsed.data.items.length > parsed.data.total
      )
        invalid();
      parsed.data.items.forEach((item) => assertScope(item, archiveId, propertyId));
      return parsed.data;
    },
  };
}
