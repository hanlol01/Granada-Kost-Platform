import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

void test("Admin exposes audited extension, promise-to-pay, and manual termination boundaries", () => {
  const api = source("lib/admin-w06-billing.ts");
  const hook = source("hooks/useAdminW06Billing.ts");
  const workspace = source("components/residents/ResidentDetailWorkspace.tsx");
  assert.match(api, /contract-settlement\/payment-promise/);
  assert.match(hook, /useRecordLeasePaymentPromise/);
  assert.match(workspace, /Catat janji bayar/);
  assert.match(workspace, /tidak mengubah status overdue, saldo, tenggat/);
  assert.match(workspace, /settlement\.termination_eligible/);
  assert.match(workspace, /Beri perpanjangan/);
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
