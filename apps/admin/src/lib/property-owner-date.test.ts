import assert from "node:assert/strict";
import test from "node:test";
import { displayOwnerDate } from "./property-owner-date";

test("owner date formatter accepts canonical and timestamped API dates without crashing", () => {
  assert.equal(displayOwnerDate("2026-08-14"), "14 Agustus 2026");
  assert.equal(displayOwnerDate("2026-08-14T00:00:00.000Z"), "14 Agustus 2026");
  assert.equal(displayOwnerDate("not-a-date"), "Tanggal tidak tersedia");
  assert.equal(displayOwnerDate(null), "Tanpa batas akhir");
});
