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
  assert.match(panel, /const refreshOpenCheckout = async/);
  assert.match(panel, /const approvedCharge = Number\(approvedShortNoticeCharge\)/);
  assert.match(types, /monthlyRateAmount: number \| null/);
  assert.match(types, /physicalCheckoutConfirmedAt: string \| null/);
});

test("new checkouts use a three-day late-checkout penalty policy while legacy commands remain readable", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const types = await source("./admin-ux-lease-types.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(api, /createLateCheckoutPlan/);
  assert.match(api, /confirmLateCheckoutPlan/);
  assert.match(api, /late-checkout-plan/);
  assert.match(types, /late_checkout_penalty_v1/);
  assert.match(types, /lateCheckoutGraceDays/);
  assert.match(panel, /Masa toleransi dan denda check-out/);
  assert.match(panel, /Batas check-out tanpa denda/);
  assert.match(api, /late_checkout_daily_penalty_amount/);
  assert.match(api, /dailyPenaltyAmount/);
  assert.match(panel, /Tarif denda per hari/);
  assert.match(panel, /CurrencyInput/);
  assert.match(panel, /lateCheckoutDailyPenaltyAmount/);
  assert.match(panel, /Perkiraan denda bila serah-terima sesuai rencana/);
  assert.match(panel, /Nilai final mengikuti tanggal serah-terima yang benar-benar dicatat/);
  assert.match(panel, /Ringkasan kontrak/);
  assert.match(panel, /residentFullName/);
  assert.match(panel, /Durasi kontrak/);
  assert.match(panel, /derivedContractMonths/);
  assert.match(panel, /tahun \$\{remainingMonths\} bulan/);
  assert.match(panel, /Tanggal rencana serah-terima/);
  assert.match(panel, /handoverScheduleNotReached/);
  assert.match(panel, /Serah-terima belum dapat dicatat sebelum/);
  assert.match(panel, /Denda keterlambatan check-out/);
  assert.match(panel, /!isLateCheckoutPolicy/);
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
  assert.match(panel, /Bukti rekonsiliasi kendaraan dan parkir/);
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
  assert.match(panel, /Batalkan & mulai ulang/);
  assert.match(panel, /Batalkan dan mulai ulang proses check-out/);
  assert.match(panel, /<CurrencyInput[\s\S]*?formatOnChange/);
});

test("checkout operational evidence is optional and monetary evidence remains protected", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.doesNotMatch(panel, /noticeExceptionEvidence\.length === 0/);
  assert.match(panel, /label="Bukti pendukung pemberitahuan singkat"/);
  assert.match(panel, /label="Bukti pengembalian kunci dan akses"/);
  assert.match(panel, /label="Bukti pemeriksaan inventaris"/);
  assert.match(panel, /label="Bukti hasil inspeksi kamar"/);
  assert.match(panel, /label=\{`Bukti potongan/);
  assert.match(panel, /label="Bukti transfer pengembalian dana"[\s\S]*?required/);
  assert.doesNotMatch(panel, /\(opsional\)/);
});

test("checkout uses shared date and Rupiah inputs with guarded stage confirmations", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  assert.match(panel, /<HeroUiDatePicker[\s\S]*?label="Tanggal keluar yang direncanakan"/);
  assert.doesNotMatch(panel, /type="date"/);
  assert.match(panel, /Gunakan deposit untuk melunasi tunggakan sewa/);
  assert.match(panel, /value=\{Number\(depositOffsetAmount \|\| 0\)\}/);
  assert.match(panel, /value=\{Number\(finalRefundAmount \|\| 0\)\}/);
  assert.match(panel, /confirmationCopy/);
  assert.match(panel, /setConfirmationIntent\("settlement"\)/);
  assert.match(panel, /Check-out berhasil diselesaikan/);
});

test("checkout uses Admin-only restart, hospitality copy, multiline notes, and completion documents", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  const residentDetail = await source("../components/residents/ResidentDetailWorkspace.tsx");

  assert.match(panel, /Simpan rencana check-out/);
  assert.match(panel, /Rencana check-out tersimpan/);
  assert.doesNotMatch(panel, /Ajukan koreksi resmi/);
  assert.doesNotMatch(panel, /rekomendasi server|keputusan server/i);
  assert.match(panel, /command\.state !== "completed"[\s\S]*?Batalkan & mulai ulang/);
  assert.match(panel, /<Textarea[\s\S]*?value=\{item\.notes\}/);
  assert.match(panel, /<Textarea[\s\S]*?value=\{reading\.outstandingUsageNotes\}/);
  assert.match(panel, /<Textarea[\s\S]*?value=\{item\.reason\}/);
  assert.match(panel, /completionDialogOpen[\s\S]*?Dokumen hasil check-out/);
  assert.match(panel, /finishCheckoutView/);
  assert.match(residentDetail, /billing\.data\.exit_documents\.map/);
  assert.match(residentDetail, /profile-checkout-document-/);
  assert.match(residentDetail, /resident\.residentStatus === "inactive"[\s\S]*?Sudah checkout/);
  assert.doesNotMatch(residentDetail, /header-checkout-document-/);
});

test("checkout settlement keeps the deduction input compact and separates the profile", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  const residentDetail = await source("../components/residents/ResidentDetailWorkspace.tsx");

  assert.match(
    panel,
    /<label className="grid w-full max-w-xs gap-2 text-sm font-medium text-foreground">[\s\S]*?Nominal potongan/,
  );
  assert.match(
    panel,
    /<Textarea[\s\S]*?className="min-h-24 w-full max-w-full resize-y \[field-sizing:content\]"[\s\S]*?value=\{item\.reason\}/,
  );
  assert.match(
    residentDetail,
    /role="separator"[\s\S]*?aria-label="Pemisah proses check-out dan informasi penghuni"/,
  );
});

test("evidence busy callbacks cannot create a render-cleanup feedback loop", async () => {
  const evidence = await source("../components/file/EvidenceFileUploadField.tsx");
  const upload = await source("../components/file/FileUploadField.tsx");
  assert.match(evidence, /const onBusyChangeRef = useRef\(onBusyChange\)/);
  assert.match(evidence, /onBusyChangeRef\.current\?\.\(busy\)/);
  assert.match(evidence, /onBusyChangeRef\.current\?\.\(false\), \[\]\)/);
  assert.match(upload, /const onBusyChangeRef = useRef\(onBusyChange\)/);
  assert.match(upload, /onBusyChangeRef\.current\?\.\(false\), \[\]\)/);
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
  assert.match(panel, /Bukti transfer pengembalian dana/);
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

test("checkout refund follow-up is discoverable from resident list and detail", async () => {
  const residentTypes = await source("./admin-resident.ts");
  const residentHooks = await source("../hooks/useResidents.ts");
  const residentList = await source("../routes/tenants.tsx");
  const residentDetail = await source("../components/residents/ResidentDetailWorkspace.tsx");

  assert.match(residentTypes, /export type CheckoutFinancialStatus/);
  assert.match(residentHooks, /checkout_financial_status: filters\.checkoutFinancialStatus/);
  assert.match(residentList, /Menunggu pengembalian dana/);
  assert.match(residentList, /CheckoutFinancialStatusPill/);
  assert.match(residentDetail, /Tindak lanjut pengembalian dana/);
  assert.match(residentDetail, /Pengembalian dana menunggu pembayaran/);
  assert.match(residentDetail, /checkoutLoadError/);
});

test("refund follow-up opens the actionable refund form instead of the checkout summary", async () => {
  const panel = await source("../components/leases/CheckoutPanel.tsx");
  const residentDetail = await source("../components/residents/ResidentDetailWorkspace.tsx");

  assert.match(residentDetail, /type CheckoutEntryFocus/);
  assert.match(residentDetail, /setCheckoutEntryFocus\("refund"\)[\s\S]*?setCheckoutOpen\(true\)/);
  assert.match(residentDetail, /initialFocus=\{checkoutEntryFocus\}/);
  assert.match(panel, /export type CheckoutEntryFocus = "overview" \| "refund"/);
  assert.match(panel, /initialFocus\?: CheckoutEntryFocus/);
  assert.match(panel, /const refundSectionRef = useRef<HTMLDivElement>/);
  assert.match(panel, /initialFocus !== "refund"/);
  assert.match(panel, /ref=\{refundSectionRef\}/);
  assert.match(
    panel,
    /command\.state === "completed" && visibleStage === 5 && !hasPendingExitRefund/,
  );
});

test("refund follow-up keeps optional notes optional and exposes persisted transfer evidence", async () => {
  const api = await source("./admin-ux-lease-api.ts");
  const types = await source("./admin-ux-lease-types.ts");
  const panel = await source("../components/leases/CheckoutPanel.tsx");

  assert.match(panel, /formatIndonesianFullDate\(command\.exitRefundDueDate\)/);
  assert.doesNotMatch(panel, /Referensi pembayaran<span className="text-destructive"> \*<\/span>/);
  assert.doesNotMatch(
    panel,
    /Alasan penghuni melepaskan hak pengembalian dana[\s\S]*?text-destructive[\s\S]*?\*/,
  );
  assert.match(panel, /const refundSettlementInvalid =\s*refundEvidence\.length === 0/);
  assert.match(panel, /exitRefundEvidenceFiles/);
  assert.match(panel, /Bukti transfer/);
  assert.match(panel, /<FilePreviewModal/);
  assert.match(api, /external_reference: text\(input\.externalReference\)/);
  assert.match(api, /\{ reason: text\(reason\) \}/);
  assert.match(types, /exitRefundEvidenceFiles\?: Array/);
});
