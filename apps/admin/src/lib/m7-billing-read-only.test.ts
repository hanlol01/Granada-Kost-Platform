import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canReadAdminBilling,
  getAdminInvoices,
  getAdminPayments,
  parseAdminInvoicesPage,
  parseAdminPaymentsPage,
} from "./admin-ux-billing-read-only";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invoice = {
  id: "invoice-id",
  invoice_code: "INV-001",
  invoice_status: "paid",
  subtotal_amount: 1000,
  late_fee_amount: 50,
  total_amount: 1050,
  cycle_start_date: "2026-07-01",
  cycle_end_date: "2026-07-31",
  due_date: "2026-07-10",
  paid_at: "2026-07-09T01:00:00.000Z",
};
const payment = {
  id: "payment-id",
  payment_code: "PAY-001",
  payment_status: "verified",
  amount: 1050,
  paid_at: "2026-07-09T01:00:00.000Z",
  verified_at: "2026-07-09T02:00:00.000Z",
};

test("M7 billing access requires exact role and billing.read", () => {
  for (const role of ["owner", "manager", "admin"] as const) {
    assert.equal(canReadAdminBilling({ roles: [role], permissions: ["billing.read"] }), true);
  }
  for (const role of ["property_owner", "technician", "resident"] as const) {
    assert.equal(canReadAdminBilling({ roles: [role], permissions: ["billing.read"] }), false);
  }
  assert.equal(canReadAdminBilling({ roles: ["admin"], permissions: [] }), false);
});

test("M7 billing parsers retain only explicit response allowlists", () => {
  const invoices = parseAdminInvoicesPage({
    data: [{ ...invoice, property_id: "forbidden", snapshot_resident_name: "forbidden" }],
    meta: { limit: 20, offset: 0, total: 1, cursor: "forbidden" },
  });
  const payments = parseAdminPaymentsPage({
    data: [{ ...payment, resident_id: "forbidden", reference_number: "forbidden", notes: "x" }],
    meta: { limit: 20, offset: 0, total: 1, cursor: "forbidden" },
  });

  assert.deepEqual(Object.keys(invoices.data[0]).sort(), [
    "cycle_end_date",
    "cycle_start_date",
    "due_date",
    "id",
    "invoice_code",
    "invoice_status",
    "late_fee_amount",
    "paid_at",
    "subtotal_amount",
    "total_amount",
  ]);
  assert.deepEqual(Object.keys(payments.data[0]).sort(), [
    "amount",
    "id",
    "paid_at",
    "payment_code",
    "payment_status",
    "verified_at",
  ]);
  assert.doesNotMatch(
    JSON.stringify({ invoices, payments }),
    /forbidden|resident|reference|notes|cursor/,
  );
});

test("M7 billing requests are GET-only and property-scoped", async () => {
  const calls: Array<{ path: string; options?: unknown }> = [];
  const requester = {
    get: async <T>(path: string, options?: unknown): Promise<T> => {
      calls.push({ path, options });
      const data = path.endsWith("invoices") ? [invoice] : [payment];
      return { data, meta: { limit: 20, offset: 40, total: 41 } } as T;
    },
  };
  const signal = new AbortController().signal;
  await getAdminInvoices(
    { propertyId: "property-a", status: "paid", limit: 20, offset: 40 },
    signal,
    requester,
  );
  await getAdminPayments(
    { propertyId: "property-a", status: "verified", limit: 20, offset: 40 },
    signal,
    requester,
  );
  assert.deepEqual(calls, [
    {
      path: "/admin/invoices",
      options: {
        query: { property_id: "property-a", status: "paid", limit: 20, offset: 40 },
        signal,
      },
    },
    {
      path: "/admin/payments",
      options: {
        query: { property_id: "property-a", status: "verified", limit: 20, offset: 40 },
        signal,
      },
    },
  ]);
});

test("M7 billing route delegates to the W06 workspace with isolated states and property authority", async () => {
  const route = await readFile(resolve(root, "routes/payments.tsx"), "utf8");
  const workspace = await readFile(
    resolve(root, "components/billing/PaymentsWorkspace.tsx"),
    "utf8",
  );
  const hook = await readFile(resolve(root, "hooks/useAdminBilling.ts"), "utf8");
  assert.match(route, /createFileRoute\(['"]\/payments['"]\)/);
  assert.match(route, /PaymentsWorkspace/);
  assert.match(workspace, /ForbiddenState/);
  assert.match(workspace, /LoadingState/);
  assert.match(workspace, /ErrorState/);
  assert.match(workspace, /EmptyState/);
  assert.match(workspace, /permissions\?\.includes\("billing\.read"\)/);
  assert.match(workspace, /propertyId=\{currentPropertyId\}/);
  assert.match(hook, /scope\.begin\(requestedProperty\(variables\)\)/);
  assert.match(hook, /propertyId !== scopeRef\.current/);
  assert.doesNotMatch(route, /useMutation|apiClient\.(post|patch|put|delete)|Midtrans|webhook/i);
});
