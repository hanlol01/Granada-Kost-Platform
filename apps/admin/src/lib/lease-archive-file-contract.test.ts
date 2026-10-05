import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeaseArchiveFileClient,
  parseArchiveFileInventory,
  parseArchiveFileResult,
} from "./lease-archive-file-contract.ts";

const archiveId = "10000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000002";
const leaseId = "10000000-0000-4000-8000-000000000003";
const fileId = "10000000-0000-4000-8000-000000000004";
const commandId = "10000000-0000-4000-8000-000000000005";
const relationships = [
  {
    relationship: "Bukti koreksi",
    record_code: "LS-001-KOREKSI-1",
    protected: false,
    shared_with_another_lease: false,
  },
];
const inventory = {
  archive_id: archiveId,
  property_id: propertyId,
  lease_id: leaseId,
  lease_code: "LS-001",
  archive_status: "archived",
  coverage_verified: true,
  review_fingerprint: "a".repeat(64),
  selectable_count: 1,
  estimated_bytes: 100,
  capacity_note: "Ukuran perkiraan, bukan ruang terverifikasi.",
  items: [
    {
      file_id: fileId,
      filename: "Bukti-Arsip-LS-001-01.pdf",
      file_purpose: "lease_revision_evidence",
      size_bytes: 100,
      selectable: true,
      code: null,
      message: null,
      estimatedBytes: 100,
      metadata_removed: false,
      onlyDigitalEvidence: true,
      claim_command_id: null,
      relationships,
    },
  ],
};
const result = {
  command_id: commandId,
  archive_id: archiveId,
  property_id: propertyId,
  lease_id: leaseId,
  created_at: "2026-10-04T00:00:00.000Z",
  created_by: "Pengelola",
  reason: "Berkas keliru",
  selected_count: 1,
  deleted_count: 0,
  failed_count: 0,
  retry_pending_count: 1,
  freed_bytes: 0,
  items: [
    {
      file_id: fileId,
      filename: "Bukti-Arsip-LS-001-01.pdf",
      size_bytes: 100,
      relationships,
      status: "retry_pending",
      attempt_count: 1,
      freed_bytes: 0,
      verified_deleted_at: null,
      result_code: "FILE_PURGE_STORAGE_UNVERIFIED",
      availability: "unknown",
      message: "Coba ulang untuk memastikan keadaan berkas.",
    },
  ],
};

test("inventory preserves reviewed exclusive ownership and only-evidence warning without raw paths", () => {
  const parsed = parseArchiveFileInventory(
    { data: { ...inventory, storage_path: "private" } },
    archiveId,
    propertyId,
  );
  assert.equal(parsed.items[0].onlyDigitalEvidence, true);
  assert.equal(parsed.estimatedBytes, 100);
  assert.equal("storagePath" in parsed, false);
});
test("legacy hidden evidence is selectable without pretending it is an available sole attachment", () => {
  const hidden = {
    ...inventory,
    items: inventory.items.map((item) => ({
      ...item,
      metadata_removed: true,
      onlyDigitalEvidence: false,
    })),
  };
  const parsed = parseArchiveFileInventory({ data: hidden }, archiveId, propertyId);
  assert.equal(parsed.items[0].selectable, true);
  assert.equal(parsed.items[0].metadataRemoved, true);
  assert.equal(parsed.items[0].onlyDigitalEvidence, false);
  assert.throws(
    () =>
      parseArchiveFileInventory(
        {
          data: {
            ...hidden,
            items: hidden.items.map((item) => ({ ...item, onlyDigitalEvidence: true })),
          },
        },
        archiveId,
        propertyId,
      ),
    { code: "LEASE_FILE_PURGE_RESPONSE_INVALID" },
  );
});
test("inconsistent eligibility, scope, count, size and duplicate selections fail closed", () => {
  for (const patch of [
    { property_id: archiveId },
    { coverage_verified: false },
    { selectable_count: 0 },
    { estimated_bytes: 0 },
    { items: [...inventory.items, ...inventory.items] },
    { items: [{ ...inventory.items[0], claim_command_id: commandId }] },
    {
      items: [{ ...inventory.items[0], relationships: [{ ...relationships[0], protected: true }] }],
    },
  ])
    assert.throws(() =>
      parseArchiveFileInventory({ data: { ...inventory, ...patch } }, archiveId, propertyId),
    );
});
test("uncertain results never claim deleted bytes and verified deletion requires a tombstone", () => {
  const parsed = parseArchiveFileResult(
    { data: result },
    archiveId,
    propertyId,
    leaseId,
    commandId,
  );
  assert.equal(parsed.items[0].availability, "unknown");
  assert.equal(parsed.freedBytes, 0);
  for (const patch of [
    { freed_bytes: 100 },
    { deleted_count: 1 },
    { command_id: fileId },
    { items: [{ ...result.items[0], availability: "present" }] },
    {
      items: [
        {
          ...result.items[0],
          status: "deleted",
          verified_deleted_at: null,
          availability: "absent",
        },
      ],
    },
  ])
    assert.throws(() =>
      parseArchiveFileResult(
        { data: { ...result, ...patch } },
        archiveId,
        propertyId,
        leaseId,
        commandId,
      ),
    );
  const deleted = {
    ...result,
    deleted_count: 1,
    retry_pending_count: 0,
    freed_bytes: 100,
    items: [
      {
        ...result.items[0],
        status: "deleted",
        availability: "absent",
        result_code: null,
        verified_deleted_at: "2026-10-04T00:01:00.000Z",
        freed_bytes: 100,
      },
    ],
  };
  assert.equal(
    parseArchiveFileResult({ data: deleted }, archiveId, propertyId, leaseId, commandId)
      .deletedCount,
    1,
  );
});
test("purge and retry use scoped endpoints and preserve the submission key", async () => {
  const calls: unknown[][] = [];
  const client = createLeaseArchiveFileClient({
    get: async () => ({ data: inventory }),
    post: async (...args: unknown[]) => {
      calls.push(args);
      return { data: result };
    },
  } as never);
  await client.purge(
    archiveId,
    leaseId,
    {
      propertyId,
      selectedFileIds: [fileId],
      reason: " Berkas keliru ",
      reviewFingerprint: inventory.review_fingerprint,
      permanentDeletionConfirmed: true,
    },
    "stable-key",
  );
  assert.deepEqual(calls[0], [
    `/lease-archives/${archiveId}/file-purge`,
    {
      property_id: propertyId,
      selected_file_ids: [fileId],
      reason: "Berkas keliru",
      review_fingerprint: inventory.review_fingerprint,
      permanent_deletion_confirmed: true,
    },
    { idempotencyKey: "stable-key" },
  ]);
  await client.retry(archiveId, leaseId, commandId, propertyId, [fileId]);
  assert.equal(calls[1][0], `/lease-archives/${archiveId}/file-purge-commands/${commandId}/retry`);
});
