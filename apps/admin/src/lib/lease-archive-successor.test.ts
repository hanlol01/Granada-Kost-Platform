import assert from "node:assert/strict";
import test from "node:test";
import { archiveSuccessorIdentity, archiveSuccessorLink } from "./lease-archive-successor.ts";

const archiveId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const residentId = "33333333-3333-4333-8333-333333333333";
test("linked onboarding keeps the existing scoped resident and requires a reason", () => {
  const source = { archiveId, propertyId, residentId, leaseCode: "LEASE-OLD", residentName: "Existing resident", phone: "081234567890", gender: "male" as const, financialResolutionState: "pending_review" as const };
  assert.deepEqual(archiveSuccessorLink(source, propertyId, "  Correct mistaken lease  "), {
    source_archive_id: archiveId, resident_id: residentId, archive_replacement_reason: "Correct mistaken lease",
  });
  assert.throws(() => archiveSuccessorLink(source, archiveId, "Correct mistaken lease"));
  assert.throws(() => archiveSuccessorLink(source, propertyId, "x"));
});
test("identity comes from the current profile without copying old room, tariff or payment", () => {
  const source = { id: residentId, propertyId, fullName: "Existing resident", phone: "+62 812 3456 7890", gender: "female" as const };
  assert.deepEqual(archiveSuccessorIdentity(source, residentId, propertyId), { fullName: "Existing resident", phone: "6281234567890", gender: "female" });
  assert.throws(() => archiveSuccessorIdentity({ ...source, gender: "other" }, residentId, propertyId));
  assert.throws(() => archiveSuccessorIdentity({ ...source, phone: null }, residentId, propertyId));
  assert.throws(() => archiveSuccessorIdentity(source, archiveId, propertyId));
});
