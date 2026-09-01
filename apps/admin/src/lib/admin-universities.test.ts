import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUniversityName } from "./admin-universities";

test("normalizes university names consistently for duplicate detection", () => {
  assert.equal(
    normalizeUniversityName("  Universitas   Garut "),
    "universitas garut",
  );
  assert.equal(
    normalizeUniversityName("UNIVERSITAS\u00a0GARUT"),
    "universitas garut",
  );
});
