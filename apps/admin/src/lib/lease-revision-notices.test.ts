import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LEASE_REVISION_ERROR_NOTICES } from "./lease-revision-notices.ts";
import { ApiError } from "@granada-kost/api-client";
import { adminErrorNotice } from "./error-normalizer.ts";

test("contract payment rejections explain the balance and next action without exposing raw API text", () => {
  const exceeded = adminErrorNotice(new ApiError({ status: 422,
    code: "CONTRACT_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE", message: "technical private data" }));
  assert.equal(exceeded.title, "Nominal melebihi sisa sewa");
  assert.match(exceeded.description, /sisa sewa terbaru/);
  assert.match(exceeded.description, /perbarui data penghuni/);
  assert.doesNotMatch(exceeded.description, /technical|private/);
  const full = adminErrorNotice(new ApiError({ status: 422,
    code: "CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED", message: "" }));
  assert.match(full.description, /Lunasi Sekarang/);
});

test("unexpected errors offer a safe support reference without exposing raw server details", () => {
  const notice = adminErrorNotice(new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR",
    message: "SELECT secret FROM payments; private path", correlationId: "47ea2a6b-a211-47ce-85f1-cd63edb9f69a" }));
  assert.match(notice.description, /Kode bantuan: 47EA2A6B/);
  assert.match(notice.description, /[Cc]oba/);
  assert.doesNotMatch(notice.description, /SELECT|private|a211|d9f69a/);
  for (const correlationId of ["private/path", "47ea2a6b-<script>", "", undefined]) {
    const invalid = adminErrorNotice(new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "", correlationId }));
    assert.doesNotMatch(invalid.description, /Kode bantuan|script|private/);
  }
  const business = adminErrorNotice(new ApiError({ status: 409, code: "LEASE_CANCELLATION_REAL_OCCUPANCY",
    message: "", correlationId: "47ea2a6b-a211-47ce-85f1-cd63edb9f69a" }));
  assert.doesNotMatch(business.description, /Kode bantuan/);
});

test("correction business rejections have reviewed operational copy, not a generic server error", async () => {
  const sources = [
    "lease-data-correction.service.ts",
    "lease-revision-context.service.ts",
    "lease-room-recording-correction.service.ts",
    "lease-sponsorship-correction.service.ts",
    "lease-commercial-mode-correction.service.ts",
    "lease-revision-policy.helper.ts",
    "lease-archive.service.ts",
    "lease-archive-restoration.service.ts",
    "lease-archive-restoration-policy.helper.ts",
    "lease-archive-successor.helper.ts",
  ];
  const codes = new Set<string>();
  for (const file of sources) {
    const text = await readFile(
      new URL(`../../../../backend/api/src/modules/lease/${file}`, import.meta.url),
      "utf8",
    );
    for (const match of text.matchAll(/["'](LEASE_(?:REVISION|DATA_CORRECTION|CORRECTION|ROOM_CORRECTION|SPONSORSHIP|MODE_CORRECTION|CANCELLATION|ARCHIVE)_[A-Z_]+)["']/g)) {
      codes.add(match[1]);
    }
  }
  assert.ok(codes.size > 20, "Expected the actual correction authorities, not an empty source scan");
  const missing = [...codes].filter((code) => !LEASE_REVISION_ERROR_NOTICES[code]);
  assert.deepEqual(missing, [], `Missing actionable UI copy: ${missing.join(", ")}`);
});

test("reviewed messages explain recovery without SQL, opaque IDs or claims that money was returned", () => {
  for (const [code, notice] of Object.entries(LEASE_REVISION_ERROR_NOTICES)) {
    assert.ok(notice.title.length > 5, code);
    assert.ok(notice.description.length > 30, code);
    assert.doesNotMatch(notice.description, /Internal server error|SELECT .*FROM|constraint|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, code);
  }
  assert.match(LEASE_REVISION_ERROR_NOTICES.LEASE_REVISION_COMMIT_RESPONSE_INVALID.description, /pengajuan yang sama/);
  assert.match(LEASE_REVISION_ERROR_NOTICES.LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED.description, /tertunda atau dibalik/);
});
