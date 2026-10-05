import assert from "node:assert/strict";
import test from "node:test";
import { createLeaseArchiveClient, parseRestorationResult } from "./lease-archive-contract.ts";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";
const propertyId = "11111111-1111-4111-8111-111111111111";
const archiveId = "22222222-2222-4222-8222-222222222222";
const leaseId = "33333333-3333-4333-8333-333333333333";
function envelope() { return { data: { restoration: { archive_id: archiveId, property_id: propertyId, lease_id: leaseId,
  resident_id: "44444444-4444-4444-8444-444444444444", room_id: "55555555-5555-4555-8555-555555555555",
  room_number: "RK-06-03", lease_code: "LSE-TEST", archive_status: "restored", lease_status: "awaiting_activation",
  room_status: "reserved", financial_resolution_state: "not_required", reason: "Pembatalan sebelumnya keliru" } } }; }
test("a restoration never implies physical check-in or paid financial settlement", () => {
  assert.equal(parseRestorationResult(envelope(), archiveId, propertyId, leaseId).roomStatus, "reserved");
  const invalid = envelope(); invalid.data.restoration.room_status = "occupied";
  assert.throws(() => parseRestorationResult(invalid, archiveId, propertyId, leaseId), { code: "LEASE_ARCHIVE_RESTORE_COMMIT_RESPONSE_INVALID" });
  const mismatch = envelope(); mismatch.data.restoration.lease_status = "active";
  assert.throws(() => parseRestorationResult(mismatch, archiveId, propertyId, leaseId));
  assert.throws(() => parseRestorationResult(envelope(), leaseId, propertyId, leaseId), { code: "LEASE_REVISION_SCOPE_CHANGED" });
});
test("restoration retries retain the exact scoped confirmed intent", async () => {
  const calls: unknown[][] = [];
  const client = createLeaseArchiveClient({ get: (async () => { throw new Error("Unexpected read"); }) as AdminUxV2Requester["get"],
    post: (async (...args: unknown[]) => { calls.push(args); return envelope(); }) as AdminUxV2Requester["post"] });
  const input = { propertyId, reason: "Pembatalan sebelumnya keliru", reviewFingerprint: "a".repeat(64), restorationConfirmed: true as const };
  await client.restore(archiveId, leaseId, input, "same-intent");
  await client.restore(archiveId, leaseId, input, "same-intent");
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0][1], { property_id: propertyId, reason: input.reason, review_fingerprint: input.reviewFingerprint, restoration_confirmed: true });
});
