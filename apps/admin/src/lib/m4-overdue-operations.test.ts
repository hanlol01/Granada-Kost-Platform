import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

void test("Admin exposes audited extension, promise-to-pay, and manual termination boundaries", () => {
  const api = source("lib/admin-billing.ts");
  const hook = source("hooks/useAdminBilling.ts");
  const workspace = source("components/residents/ResidentDetailWorkspace.tsx");
  assert.match(api, /contract-settlement\/payment-promise/);
  assert.match(hook, /useRecordLeasePaymentPromise/);
  assert.match(workspace, /Catat janji bayar/);
  assert.match(workspace, /tidak mengubah status overdue, saldo, tenggat/);
  assert.match(workspace, /settlement\.termination_eligible/);
  assert.match(workspace, /Ubah batas pelunasan/);
  assert.doesNotMatch(workspace, /minDate=\{nextJakartaDate\(finalDueAt\)\}/);
  assert.doesNotMatch(workspace, /minDate=\{jakartaDateInput\(\)\}/);
  assert.match(workspace, /Catatan komunikasi[\s\S]*min-h-16[\s\S]*rows=\{2\}/);
  assert.match(workspace, /label="Tanggal rencana pembayaran"[\s\S]*forceBottom/);
  const datePicker = source("components/ui/heroui-date-picker.tsx");
  assert.match(datePicker, /collisionPadding=\{16\}/);
  assert.match(datePicker, /sticky="always"/);
  assert.match(datePicker, /max-h-\[calc\(100vh-2rem\)\]/);
  assert.match(datePicker, /avoidCollisions=\{!forceBottom\}/);
});

void test("tenant settlement filter includes every M4 V2 checkpoint and overdue stage", () => {
  const resident = source("lib/admin-resident.ts");
  const tenants = source("routes/tenants.tsx");
  for (const stage of [
    "checkpoint_two_pending",
    "checkpoint_two_met",
    "overdue_grace",
    "extended",
    "admin_action_required",
    "termination_eligible",
  ]) {
    assert.match(resident, new RegExp(stage));
    assert.match(tenants, new RegExp(stage));
  }
  assert.match(tenants, /Masa toleransi/);
  assert.match(tenants, /Perpanjangan aktif/);
  assert.match(tenants, /Pemberhentian tersedia/);
});
