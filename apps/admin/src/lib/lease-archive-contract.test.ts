import assert from "node:assert/strict";
import test from "node:test";
import { createLeaseArchiveClient, parseCancellationResult } from "./lease-archive-contract.ts";
import type { AdminUxV2Requester } from "./admin-ux-api.ts";

const leaseId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const archiveId = "33333333-3333-4333-8333-333333333333";
function envelope() { return { data: { archive: {
  id: archiveId, property_id: propertyId, lease_id: leaseId, lease_code: "LSE-TEST-01",
  resident_id: "44444444-4444-4444-8444-444444444444", room_id: "55555555-5555-4555-8555-555555555555",
  room_number: "RK-06-03", room_status: "vacant", archive_status: "archived",
  financial_resolution_state: "pending_review", resident_profile_archived: true,
  reason: "Pencatatan penyewaan keliru", voided_invoice_ids: Array<string>(),
} } }; }

test("cancellation result preserves pending finance without promising a refund", () => {
  const result = parseCancellationResult(envelope(), leaseId, propertyId);
  assert.equal(result.financialResolutionState, "pending_review");
  assert.deepEqual(result.voidedInvoiceIds, []);
  assert.equal(result.roomNumber, "RK-06-03");
});
test("incomplete or contradictory cancellation result is an uncertain outcome", () => {
  const partial = envelope(); Reflect.deleteProperty(partial.data.archive, "resident_profile_archived");
  assert.throws(() => parseCancellationResult(partial, leaseId, propertyId), { code: "LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID" });
  const contradictory = envelope(); contradictory.data.archive.voided_invoice_ids = [archiveId];
  assert.throws(() => parseCancellationResult(contradictory, leaseId, propertyId), { code: "LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID" });
  const wrongRoom = envelope(); wrongRoom.data.archive.room_status = "occupied";
  assert.throws(() => parseCancellationResult(wrongRoom, leaseId, propertyId));
});
test("cancellation success from a different lease or property is never accepted", () => {
  assert.throws(() => parseCancellationResult(envelope(), archiveId, propertyId), { code: "LEASE_REVISION_SCOPE_CHANGED" });
  assert.throws(() => parseCancellationResult(envelope(), leaseId, archiveId), { code: "LEASE_REVISION_SCOPE_CHANGED" });
});
test("confirmed intent retains exact fingerprint and idempotency key on retries", async () => {
  const calls: unknown[][] = [];
  const client = createLeaseArchiveClient({
    get: (async () => { throw new Error("Unexpected read"); }) as AdminUxV2Requester["get"],
    post: (async (...args: unknown[]) => { calls.push(args); return envelope(); }) as AdminUxV2Requester["post"],
  });
  const input = { reason: "  Pencatatan keliru  ", reviewFingerprint: "a".repeat(64), cancellationConfirmed: true as const, mistakenActivationConfirmed: false };
  await client.cancel(leaseId, propertyId, input, "same-intent");
  await client.cancel(leaseId, propertyId, input, "same-intent");
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0][1], { reason: "Pencatatan keliru", review_fingerprint: "a".repeat(64), cancellation_confirmed: true, mistaken_activation_confirmed: false });
  assert.deepEqual(calls[0][2], { idempotencyKey: "same-intent" });
});
test("archive search rejects rows from other properties and invalid totals", async () => {
  const client = (response: unknown) => createLeaseArchiveClient({ get: (async () => response) as AdminUxV2Requester["get"],
    post: (async () => { throw new Error("Unexpected write"); }) as AdminUxV2Requester["post"] });
  assert.deepEqual(await client({ data: { items: [], total: 0, limit: 20, offset: 0 } }).list({ propertyId }),
    { items: [], total: 0, limit: 20, offset: 0 });
  await assert.rejects(client({ data: { items: [], total: -1, limit: 20, offset: 0 } }).list({ propertyId }), { code: "LEASE_ARCHIVE_RESPONSE_INVALID" });
  const row = { id: archiveId, property_id: archiveId, lease_id: leaseId, archive_status: "archived", financial_resolution_state: "pending_review",
    reason: "Pencatatan keliru", archived_at: "2026-10-04T08:00:00.000Z", archived_by: "Admin uji", lease_code: "LSE-TEST", commercial_mode: "rent", resident_name: "Penghuni uji", room_number: "RK-06-03", plot_number: null };
  await assert.rejects(client({ data: { items: [row], total: 1, limit: 20, offset: 0 } }).list({ propertyId }), { code: "LEASE_REVISION_SCOPE_CHANGED" });
});
