import assert from "node:assert/strict";
import test from "node:test";
import { toRoomInventoryBody } from "./admin-ux-master-api";
import {
  allowedRoomStatusTargets,
  createKostTypeSlug,
  normalizeRoomSearch,
} from "./admin-ux-master-helpers";
import { parseIDR } from "./format";

test("room V2 serializer only contains physical inventory fields", () => {
  const body = toRoomInventoryBody({
    propertyId: "property-a",
    kostTypeId: "type-a",
    number: "101",
    buildingId: "building-a",
    publicVisible: true,
  });

  assert.deepEqual(body, {
    property_id: "property-a",
    kost_type_id: "type-a",
    number: "101",
    room_code: undefined,
    building_id: "building-a",
    floor: undefined,
    floor_code: undefined,
    floor_label: undefined,
    unit_code: undefined,
    gender_policy: undefined,
    size_label: undefined,
    primary_photo_file_id: undefined,
    public_visible: true,
  });
  assert.equal("monthly_price" in body, false);
  assert.equal("yearly_price" in body, false);
  assert.equal("deposit_amount" in body, false);
  assert.equal("facility_ids" in body, false);
});

test("room status transitions exclude lease lifecycle statuses", () => {
  assert.deepEqual(allowedRoomStatusTargets("vacant"), [
    "maintenance",
    "inactive",
    "requires_review",
  ]);
  assert.deepEqual(allowedRoomStatusTargets("maintenance"), ["vacant"]);
  assert.deepEqual(allowedRoomStatusTargets("occupied"), []);
  assert.deepEqual(allowedRoomStatusTargets("reserved"), []);
});

test("room search is bounded and cost type slug is safe", () => {
  assert.deepEqual(normalizeRoomSearch({ q: "  A-101  ", limit: 999, offset: -9, status: "bad" }), {
    q: "A-101",
    buildingId: undefined,
    floor: undefined,
    status: undefined,
    visibility: undefined,
    offset: 0,
    limit: 100,
  });
  assert.equal("roomId" in normalizeRoomSearch({ roomId: "legacy-room-id" }), false);
  assert.equal(createKostTypeSlug(" Rumah Kost Granada! "), "rumah-kost-granada");
});

test("Rupiah parser rejects decimals, negatives, and overflow", () => {
  assert.equal(parseIDR("1.250.000"), 1_250_000);
  assert.equal(parseIDR("12,5"), null);
  assert.equal(parseIDR("-1"), null);
  assert.equal(parseIDR("999999999999999999999"), null);
});
