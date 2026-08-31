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
  assert.match(api, /inventory_items: input\.inventoryItems\.map/);
  assert.match(api, /key_access_items: input\.keyAccessItems\.map/);
  assert.match(api, /utility_readings: input\.utilityReadings\?\.map/);
  assert.match(api, /\/checkout\//);
});

test("M5 Admin client separates exit request from charge approval", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const types = await source("./admin-ux-lease-types.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(api, /exitType: "resident_early_termination" \| "normal_expiry"/);
  assert.match(api, /approved_short_notice_charge: input\.approvedShortNoticeCharge/);
  assert.match(api, /short_notice_waiver_reason: text\(input\.shortNoticeWaiverReason\)/);
  assert.match(panel, /Rekomendasi: \{rupiah\.format\(recommendedCharge\)\}/);
  assert.match(panel, /Alasan waiver\/pengurangan/);
  assert.match(panel, /Setujui & jadwalkan checkout/);
  assert.match(types, /physicalCheckoutConfirmedAt: string \| null/);
});

test("W07D panel reloads an open checkout and cannot bypass handover confirmations", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(panel, /adminUxLeaseApi\.checkout\s*\.list/);
  assert.match(panel, /keyAccess: false/);
  assert.match(panel, /inventory: false/);
  assert.match(panel, /parking: false/);
  assert.match(panel, /const canRecordHandover =/);
  assert.match(panel, /handoverDetailInvalid/);
  assert.match(panel, /Rincian inventaris/);
  assert.match(panel, /Pembacaan utilitas/);
  assert.match(panel, /keyAccessConfirmed: handover\.keyAccess/);
  assert.match(panel, /Checkout tidak dapat diproses/);
  assert.doesNotMatch(panel, /adminUxLeaseApi\.close\(/);
  assert.doesNotMatch(panel, /adminUxLeaseApi\.settleRefund\(/);
});

test("M5 Admin checkout previews authoritative settlement and requires refund evidence", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const types = await source("./admin-ux-lease-types.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(api, /\/settlement-preview/);
  assert.match(api, /deposit_rent_offset_amount: input\.depositRentOffsetAmount/);
  assert.match(api, /final_refund_amount: input\.finalRefundAmount/);
  assert.match(api, /evidence_file_id: input\.evidenceFileId/);
  assert.match(types, /recommendedRefundAmount: number/);
  assert.match(panel, /Hitung rekomendasi final/);
  assert.match(panel, /Deposit tidak pernah otomatis digunakan/);
  assert.match(panel, /Bukti pembayaran refund/);
});
