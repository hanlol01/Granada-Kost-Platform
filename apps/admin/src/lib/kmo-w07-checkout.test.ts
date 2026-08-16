import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeLeaseDetailSearch } from "./admin-ux-lease-helpers";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("W07D checkout panel remains an explicit lease-detail route", () => {
  assert.equal(normalizeLeaseDetailSearch({ panel: "checkout" }).panel, "checkout");
  assert.equal(normalizeLeaseDetailSearch({ panel: "unknown" }).panel, "detail");
});

test("W07D Admin client records explicit handover confirmations", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  assert.match(api, /keyAccessConfirmed: boolean/);
  assert.match(api, /inventoryConfirmed: boolean/);
  assert.match(api, /parkingConfirmed: boolean/);
  assert.match(api, /key_access_confirmed: input\.keyAccessConfirmed/);
  assert.match(api, /inventory_confirmed: input\.inventoryConfirmed/);
  assert.match(api, /parking_confirmed: input\.parkingConfirmed/);
  assert.match(api, /\/checkout\//);
});

test("W07D panel reloads an open checkout and cannot bypass handover confirmations", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(panel, /adminUxLeaseApi\.checkout\s*\.list/);
  assert.match(panel, /keyAccess: false/);
  assert.match(panel, /inventory: false/);
  assert.match(panel, /parking: false/);
  assert.match(panel, /const canRecordHandover = handover\.keyAccess/);
  assert.match(panel, /keyAccessConfirmed: handover\.keyAccess/);
  assert.match(panel, /Checkout tidak dapat diproses/);
  assert.doesNotMatch(panel, /adminUxLeaseApi\.close\(/);
  assert.doesNotMatch(panel, /adminUxLeaseApi\.settleRefund\(/);
});
