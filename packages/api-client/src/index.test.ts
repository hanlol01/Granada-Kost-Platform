import assert from "node:assert/strict";
import test from "node:test";
import { unwrapResponsePayload } from "./response-payload.ts";

test("can preserve a resource payload whose own collection is named data", () => {
  const payload = {
    period: "2026-08",
    summary: { owners: 1 },
    data: [{ owner_id: "owner-1" }],
    meta: { limit: 20, offset: 0, total: 1 },
  };
  const result = unwrapResponsePayload<typeof payload>(payload, false);

  assert.deepEqual(result, payload);
});

test("unwraps standard success payloads by default", () => {
  const result = unwrapResponsePayload<{ id: string }>({ data: { id: "resource-1" } });

  assert.deepEqual(result, { id: "resource-1" });
});
