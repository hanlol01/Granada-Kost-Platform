import assert from "node:assert/strict";
import test from "node:test";
import { createOnboardingIdempotencyLedger } from "./onboarding-idempotency.ts";
import type { OnboardingPayload } from "./admin-onboarding.ts";

test("linked-successor uncertainty preserves the original key and deep payload until resolved", () => {
  let sequence = 0;
  const ledger = createOnboardingIdempotencyLedger(() => `key-${++sequence}`);
  const payload = {
    property_id: "property",
    source_archive_id: "archive",
    room_id: "room-a",
    payment_entries: [{ amount: 100, evidence_file_ids: ["proof-a"] }],
  } as unknown as OnboardingPayload;
  assert.equal(ledger.keyFor(payload), "key-1");
  ledger.freeze(payload);
  const saved = ledger.uncertainPayload();
  assert.deepEqual(saved, payload);
  payload.payment_entries![0].amount = 200;
  assert.equal(ledger.uncertainPayload()!.payment_entries![0].amount, 100);
  assert.throws(() => ledger.keyFor(payload), {
    code: "LEASE_ARCHIVE_SUCCESSOR_SUBMISSION_UNCERTAIN",
  });
  assert.doesNotThrow(
    () => ledger.freeze(payload),
    "An error handler must not replace or throw over an already frozen intent",
  );
  assert.equal(ledger.uncertainPayload()!.payment_entries![0].amount, 100);
  assert.equal(ledger.reset(), false, "Ordinary edits cannot discard an unresolved submission");
  assert.equal(ledger.keyFor(saved!), "key-1");
  ledger.resolve();
  assert.equal(ledger.uncertainPayload(), null);
  assert.equal(ledger.keyFor(payload), "key-2");
});
test("normal onboarding still rotates changed payloads; an explicit scope reset discards local stale intent", () => {
  let sequence = 0;
  const ledger = createOnboardingIdempotencyLedger(() => `key-${++sequence}`);
  const first = { property_id: "property", room_id: "room-a" } as OnboardingPayload;
  assert.equal(ledger.keyFor(first), "key-1");
  assert.equal(ledger.keyFor({ ...first, room_id: "room-b" }), "key-2");
  ledger.freeze(first);
  assert.equal(ledger.uncertainPayload(), null);
  assert.equal(ledger.reset(), true);
  ledger.freeze({ ...first, source_archive_id: "archive" });
  assert.equal(ledger.reset(true), true);
  assert.equal(ledger.uncertainPayload(), null);
});
