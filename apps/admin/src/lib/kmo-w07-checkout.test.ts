import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkoutActionLabel, normalizeLeaseDetailSearch } from "./admin-ux-lease-helpers";

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
  assert.match(panel, /Rumus kompensasi/);
  assert.match(panel, /Bukti persetujuan penyesuaian biaya/);
  assert.match(panel, /Setujui & jadwalkan check-out/);
  assert.match(panel, /Persetujuan jadwal keluar dan kompensasi/);
  assert.match(panel, /Maksimum berdasarkan kebijakan/);
  assert.match(panel, /Penyelesaian akhir belum dihitung/);
  assert.match(panel, /Tidak berlaku ketika penghuni keluar sesuai akhir masa sewa/);
  assert.match(panel, /monthlyRateAmount/);
  assert.match(panel, /paymentPeriodDays/);
  assert.match(panel, /dailyRateAmount/);
  assert.match(panel, /Nominal melebihi batas maksimum/);
  assert.match(panel, /aria-invalid=\{approvedChargeExceedsRecommendation\}/);
  assert.match(panel, /<fieldset className="space-y-4 rounded-lg border border-border p-4">/);
  assert.match(panel, /border-b border-border\/70 pb-4/);
  assert.match(panel, /w-full max-w-md gap-2 text-sm font-medium text-foreground/);
  assert.match(panel, /Rumus kompensasi[\s\S]*?Kompensasi kekurangan masa pemberitahuan/);
  assert.match(panel, /setApprovedShortNoticeCharge\(Number\(open\?\.recommendedShortNoticeCharge/);
  assert.match(
    panel,
    /setApprovedShortNoticeCharge\(Number\(result\.checkout\.recommendedShortNoticeCharge/,
  );
  assert.match(panel, /const approvedCharge = Number\(approvedShortNoticeCharge\)/);
  assert.match(types, /monthlyRateAmount: number \| null/);
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

test("checkout command errors move focus and scroll to the alert", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(panel, /const errorAlertRef = useRef<HTMLDivElement>/);
  assert.match(panel, /alert\.scrollIntoView/);
  assert.match(panel, /alert\.focus/);
  assert.match(panel, /ref=\{errorAlertRef\}/);
  assert.match(panel, /tabIndex=\{-1\}/);
});

test("checkout command transitions return focus to the checkout panel", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(panel, /const checkoutPanelRef = useRef<HTMLDivElement>/);
  assert.match(panel, /const focusCheckoutPanelAfterCommandChange = useRef\(false\)/);
  assert.match(panel, /focusCheckoutPanelAfterCommandChange\.current = true/);
  assert.match(
    panel,
    /adminUxLeaseApi\.checkout\.schedule[\s\S]*?focusCheckoutPanelAfterCommandChange\.current = true/,
  );
  assert.match(panel, /md:grid-cols-2 md:gap-0 md:divide-x md:divide-border\/70/);
  assert.match(panel, /alignHeader/);
  assert.match(panel, /Bukti rekonsiliasi kendaraan dan parkir \(opsional\)/);
  assert.match(panel, /panel\.scrollIntoView\(/);
  assert.match(panel, /block: "start"/);
  assert.match(panel, /setCheckoutPanelHighlighted\(true\)/);
  assert.match(panel, /scroll-mt-24/);
  assert.match(panel, /aria-labelledby="checkout-panel-title"/);
});

test("checkout notice can be cancelled with an audited reason and rupiah input", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(api, /\/checkout\/" \+[\s\S]*?\/cancel/);
  assert.match(panel, /setCancelDialogOpen\(true\)/);
  assert.match(panel, /Tidak melanjutkan checkout/);
  assert.match(panel, /Batalkan proses check-out/);
  assert.match(panel, /<CurrencyInput[\s\S]*?formatOnChange/);
});

test("M5 Admin checkout previews authoritative settlement and requires refund evidence", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const types = await source("./admin-ux-lease-types.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(api, /\/settlement-preview/);
  assert.match(api, /deposit_rent_offset_amount: input\.depositRentOffsetAmount/);
  assert.match(api, /final_refund_amount: input\.finalRefundAmount/);
  assert.match(api, /evidence_file_ids: input\.evidenceFileIds/);
  assert.match(types, /recommendedRefundAmount: number/);
  assert.match(panel, /Hitung rincian akhir/);
  assert.match(panel, /Deposit tidak pernah otomatis digunakan/);
  assert.match(panel, /Bukti pembayaran refund/);
});

test("Stage 3 resident detail derives a safe checkout action from physical and financial state", () => {
  assert.equal(checkoutActionLabel("active", null), "Mulai proses check-out");
  assert.equal(
    checkoutActionLabel("active", {
      state: "scheduled",
      decisionStatus: null,
      refundStatus: null,
      amountDue: null,
    }),
    "Lanjutkan proses check-out",
  );
  assert.equal(
    checkoutActionLabel("ended", {
      state: "completed",
      decisionStatus: "refund_pending",
      refundStatus: "pending",
      amountDue: 0,
    }),
    "Lihat penyelesaian check-out",
  );
  assert.equal(
    checkoutActionLabel("ended", {
      state: "completed",
      decisionStatus: "closed",
      refundStatus: "settled",
      amountDue: 0,
    }),
    "Lihat riwayat check-out",
  );
  assert.equal(checkoutActionLabel("awaiting_activation", null), "Batalkan penyewaan");
  assert.equal(checkoutActionLabel(null, null), null);
});

test("Stage 3 resident detail never renders an unnamed checkout action", async () => {
  const detail = await source("../components/residents/ResidentDetailWorkspace.tsx");
  assert.match(detail, /billing\.data\?\.lease\.status === "active"/);
  assert.match(
    detail,
    /canManageTermination &&[\s\S]*?checkoutLeaseId &&[\s\S]*?checkoutLabel &&[\s\S]*?checkoutLabel !== "Batalkan penyewaan"/,
  );
});
