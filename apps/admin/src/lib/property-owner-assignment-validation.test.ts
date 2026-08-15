import assert from "node:assert/strict";
import test from "node:test";
import { validateOwnerAssignment } from "./property-owner-assignment-validation";

test("owner assignment validation returns field-specific errors for incomplete and invalid periods", () => {
  assert.deepEqual(
    validateOwnerAssignment({
      kind: "building",
      effectiveFrom: "",
      effectiveUntil: "",
      reason: "",
      buildingId: "",
      roomIds: [],
    }),
    {
      effectiveFrom: "Tanggal mulai berlaku wajib diisi.",
      reason: "Alasan assignment wajib diisi.",
      asset: "Pilih satu bangunan Rumah Kost.",
    },
  );

  assert.deepEqual(
    validateOwnerAssignment({
      kind: "room",
      effectiveFrom: "2026-08-14",
      effectiveUntil: "2026-08-14",
      reason: "Pemindahan hak kelola",
      buildingId: "",
      roomIds: [],
    }),
    {
      effectiveUntil: "Tanggal berakhir harus setelah tanggal mulai.",
      asset: "Pilih minimal satu kamar Apart Kost.",
    },
  );
});
