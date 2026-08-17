// W07B room transfer: admin-side contract tests. Static source scans plus
// helper-level checks; no network or runtime services are exercised.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeTransferResult } from "./admin-ux-lease-api";
import {
  canRunAdminTransfer,
  canRunNonFinancialTransfer,
  canRunTransferTopUp,
  TRANSFER_COMMAND_STATE_LABEL,
  TRANSFER_REASON_LABEL,
} from "./admin-ux-lease-helpers";
import { TRANSFER_REASON_CODES } from "./admin-ux-lease-types";
import {
  genderPolicyLabel,
  isTransferRoomGenderCompatible,
  normalizeRoomSearch,
} from "../components/leases/transfer-shared";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("W07B reason taxonomy is the fixed six-value set with labels", () => {
  assert.deepEqual(
    [...TRANSFER_REASON_CODES],
    [
      "resident_request",
      "room_issue",
      "property_operation",
      "eligibility_correction",
      "commercial_adjustment",
      "other",
    ],
  );
  for (const code of TRANSFER_REASON_CODES) {
    assert.ok(TRANSFER_REASON_LABEL[code], `missing label for ${code}`);
    assert.ok(TRANSFER_REASON_LABEL[code].length > 0);
  }
  assert.equal(TRANSFER_COMMAND_STATE_LABEL.scheduled, "Terjadwal");
});

test("W07B room picker normalizes room codes and keeps gender-compatible rooms", () => {
  assert.equal(normalizeRoomSearch("AK-18-02"), "ak1802");
  assert.equal(normalizeRoomSearch(" ak 18 02 "), "ak1802");
  assert.equal(isTransferRoomGenderCompatible("female", "female"), true);
  assert.equal(isTransferRoomGenderCompatible("mixed", "female"), true);
  assert.equal(isTransferRoomGenderCompatible("male", "female"), false);
  assert.equal(genderPolicyLabel("female"), "Putri");
});

test("W07B transfer entry is admin-only and top-up needs lease.manage plus billing.manage", () => {
  const active = { leaseStatus: "active", transferFlagEnabled: true } as const;
  assert.equal(
    canRunAdminTransfer({
      roles: ["admin"],
      permissions: ["lease.manage"],
      ...active,
    }),
    true,
  );
  assert.equal(
    canRunAdminTransfer({
      roles: ["owner", "manager"],
      permissions: ["lease.manage"],
      ...active,
    }),
    false,
  );
  assert.equal(
    canRunAdminTransfer({
      roles: ["admin"],
      permissions: [],
      ...active,
    }),
    false,
  );
  assert.equal(
    canRunAdminTransfer({
      roles: ["admin"],
      permissions: ["lease.manage"],
      leaseStatus: "ended",
      transferFlagEnabled: true,
    }),
    false,
  );

  assert.equal(
    canRunTransferTopUp({
      roles: ["admin"],
      permissions: ["lease.manage", "billing.manage"],
    }),
    true,
  );
  assert.equal(
    canRunTransferTopUp({
      roles: ["owner", "manager"],
      permissions: ["lease.manage", "billing.manage"],
    }),
    false,
  );
  assert.equal(canRunTransferTopUp({ roles: ["admin"], permissions: ["billing.manage"] }), false);

  // Legacy M6 helper remains available for non-W07B checks.
  assert.equal(
    canRunNonFinancialTransfer({
      permissions: ["lease.manage"],
      leaseStatus: "active",
      transferFlagEnabled: true,
    }),
    true,
  );
});

test("W07B transfer sanitizer keeps only safe server decision fields", () => {
  const transferLease = {
    id: "lease-a",
    propertyId: "property-a",
    leaseCode: "LSE-001",
    leaseStatus: "active",
    startDate: "2026-08-10",
    endDate: null,
    billingCycle: "monthly",
    billingAnchorDay: 10,
    nextBillingDate: "2026-09-10",
    room: { id: "room-a", number: "A-01" },
    kostType: { id: "type-a", name: "Standard" },
    snapshot: { monthlyPrice: 1_000_000, yearlyPrice: 12_000_000, depositAmount: 500_000 },
  };
  const result = sanitizeTransferResult({
    sourceLease: transferLease,
    targetLease: { ...transferLease, id: "lease-b", leaseCode: "LSE-002" },
    transferRecord: {
      id: "transfer-a",
      effectiveDate: "2026-09-10",
      fromRoomId: "room-a",
      toRoomId: "room-b",
      carriedDepositAmount: 500_000,
      requiredTargetDepositAmount: 750_000,
      topUpAmount: 0,
      transferCommandId: "command-a",
      transferPath: "end_period",
      reasonCode: "resident_request",
      executedLate: true,
    },
    deposit: {
      requiredAmount: 750_000,
      collectedAmount: 500_000,
      deductionAmount: 0,
      refundedAmount: 0,
      balanceAmount: 500_000,
    },
    targetInvoice: null,
    oldOutstandingAmount: 0,
    secretAuditField: "must-not-leak",
  } as never);

  assert.equal("secretAuditField" in result, false);
  assert.equal(result.transferRecord.transferCommandId, "command-a");
  assert.equal(result.transferRecord.transferPath, "end_period");
  assert.equal(result.transferRecord.reasonCode, "resident_request");
  assert.equal(result.transferRecord.executedLate, true);

  // Legacy payloads without W07B fields stay renderable.
  const legacy = sanitizeTransferResult({
    sourceLease: transferLease,
    targetLease: transferLease,
    transferRecord: {
      id: "transfer-a",
      effectiveDate: "2026-08-10",
      fromRoomId: "room-a",
      toRoomId: "room-b",
      carriedDepositAmount: 500_000,
      requiredTargetDepositAmount: 500_000,
      topUpAmount: 0,
    },
    deposit: {
      requiredAmount: 500_000,
      collectedAmount: 500_000,
      deductionAmount: 0,
      refundedAmount: 0,
      balanceAmount: 500_000,
    },
    targetInvoice: null,
    oldOutstandingAmount: 0,
  } as never);
  assert.equal(legacy.transferRecord.transferCommandId, null);
  assert.equal(legacy.transferRecord.transferPath, "same_day_exception");
  assert.equal(legacy.transferRecord.executedLate, false);
});

test("W07B API client exposes schedule/list/cancel and sends the reason taxonomy", async () => {
  const api = await source("../lib/admin-ux-lease-api.ts");
  assert.match(api, /\/transfer\/schedule/);
  assert.match(api, /\/transfers/);
  assert.match(api, /\/cancel/);
  assert.match(api, /reason_code: input\.reasonCode/);
  assert.match(api, /exception_reason: input\.exceptionReason\.trim\(\)/);
  assert.match(api, /effectiveDate\?: string/);
  // The free-form reason field from M6 is gone from transfer bodies
  // (checkout bodies keep their own reason by design).
  const transferBodyRegion = api.slice(
    api.indexOf("function toTransferBody"),
    api.indexOf("function toTransferScheduleBody"),
  );
  assert.doesNotMatch(transferBodyRegion, /reason: input\.reason\.trim\(\)/);
  // Scheduled commands never carry a top-up.
  const scheduleRegion = api.slice(
    api.indexOf("function toTransferScheduleBody"),
    api.indexOf("export const adminUxLeaseApi"),
  );
  assert.doesNotMatch(scheduleRegion, /top_up/);
});

test("W07B TransferPanel keeps one authority for both paths and one entry per surface", async () => {
  const panel = await source("../components/leases/TransferPanel.tsx");
  assert.match(panel, /Pindah Kamar/);
  assert.match(panel, /Batas periode tagihan/);
  assert.match(panel, /Pengecualian hari yang sama/);
  assert.match(panel, /HeroUiDatePicker/);
  assert.match(panel, /CommandInput/);
  assert.match(panel, /Tinjau Perpindahan/);
  assert.match(panel, /Jadwalkan Pindah Kamar/);
  assert.match(panel, /Tanggal pindah yang direkomendasikan/);
  assert.match(panel, /TRANSFER_EFFECTIVE_DATE_NOT_BOUNDARY/);
  assert.match(
    panel,
    /Tanggal alternatif hanya dapat dipilih dari daftar tanggal yang disahkan sistem/,
  );
  assert.match(panel, /TRANSFER_REASON_LABEL/);
  assert.match(panel, /Alasan pengecualian hari yang sama/);
  assert.match(panel, /adminUxLeaseApi\.transfer\.schedule/);
  assert.match(panel, /adminUxLeaseApi\.transfer\.cancel/);
  assert.match(panel, /adminUxLeaseApi\.transfer\.command/);
  assert.match(panel, /useM6TransferCommands/);
  // Revision 3: the scheduled path refuses a deposit top-up up front.
  assert.match(panel, /Security deposit kamar tujuan belum terpenuhi/);
  assert.match(panel, /topUpRequiredAmount > 0/);
  // Revision 2: the surviving contractual end date is shown to the operator.
  assert.match(panel, /Sewa tetap berakhir/);
  assert.match(panel, /contractualEndDate/);
  assert.doesNotMatch(panel, /Preview berasal dari server/);
  assert.doesNotMatch(panel, /interval half-open/);
  assert.doesNotMatch(panel, /inspection_required/);
  // Scheduled path never sends a top-up from the browser.
  const submitSchedule = panel.slice(
    panel.indexOf("const submitSchedule"),
    panel.indexOf("const submitCancel"),
  );
  assert.doesNotMatch(submitSchedule, /topUp/);

  const leaseDetail = await source("../components/leases/LeaseDetailPage.tsx");
  assert.match(leaseDetail, /from "@\/components\/leases\/TransferPanel"/);
  assert.match(leaseDetail, /canRunAdminTransfer\(/);
  assert.match(leaseDetail, /canRunTransferTopUp\(/);
  assert.doesNotMatch(leaseDetail, /function TransferPanel\(/);
  assert.doesNotMatch(leaseDetail, /adminUxLeaseApi\.transfer\.command/);
  assert.match(leaseDetail, /Batal Pindah Kamar/);

  const resident = await source("../components/residents/ResidentDetailWorkspace.tsx");
  assert.match(resident, /import \{ TransferPanel \} from "@\/components\/leases\/TransferPanel"/);
  assert.match(resident, /canManage=\{hasRole\("admin"\) && hasPermission\("lease\.manage"\)\}/);
  assert.match(resident, /canRunTransferTopUp\(/);
  assert.match(resident, /currentTenancy\.leaseId/);
  assert.match(resident, /Batal Pindah Kamar/);
  assert.doesNotMatch(resident, /adminUxLeaseApi\.transfer\./);
});

test("W07B hooks expose transfer command queries scoped to the lease", async () => {
  const hooks = await source("../hooks/useAdminUxLeases.ts");
  assert.match(hooks, /export function useM6TransferCommands/);
  assert.match(hooks, /adminUxLeaseApi\.transfer\.commands/);
  assert.match(hooks, /transferCommands\(currentPropertyId/);

  const keys = await source("../lib/admin-ux-query-keys.ts");
  assert.match(keys, /"lease-transfer-schedule"/);
  assert.match(keys, /"lease-transfer-cancel"/);
  assert.match(keys, /leaseTransferCommands/);
});
