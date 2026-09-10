import assert from "node:assert/strict";
import test from "node:test";
import { validateOwnerAssignment } from "./property-owner-assignment-validation";

test("owner assignment validation only requires the asset selection", () => {
  assert.deepEqual(
    validateOwnerAssignment({
      kind: "building",
      reason: "",
      buildingId: "",
      roomIds: [],
    }),
    {
      asset: "Pilih satu bangunan Rumah Kost.",
    },
  );

  assert.deepEqual(
    validateOwnerAssignment({
      kind: "room",
      reason: "Pemindahan hak kelola",
      buildingId: "",
      roomIds: [],
    }),
    {
      asset: "Pilih minimal satu kamar Apart Kost.",
    },
  );
});
