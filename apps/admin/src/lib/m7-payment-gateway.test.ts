import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadAdminPaymentTransactions,
  parseAdminPaymentTransaction,
  parseAdminPaymentTransactionDetail,
  parseAdminPaymentTransactionList,
} from "./admin-ux-payment-gateway";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

const RESIDENT_ID = "opaque-resident-id";
const REQUESTED_BY_USER_ID = "opaque-requester-id";

function rawTransaction() {
  return {
    id: "transaction-a",
    invoiceId: "invoice-a",
    propertyId: "property-a",
    residentId: RESIDENT_ID,
    requestedByUserId: REQUESTED_BY_USER_ID,
    provider: "midtrans",
    providerOrderId: "provider-order-a",
    amount: 1250000,
    currency: "IDR",
    status: "paid",
    paymentMethod: "bank_transfer",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:05:00.000Z",
    paidAt: "2026-07-14T00:04:00.000Z",
    failedAt: null,
    providerTransactionId: "forbidden-provider-transaction",
    expiresAt: "2026-07-15T00:00:00.000Z",
    paymentUrl: "https://forbidden.example/payment",
    snapToken: "forbidden-snap-token",
    rawStatusCode: "forbidden-raw-status",
    metadata: { rawProviderPayload: "forbidden-payload", signature: "forbidden-signature" },
    residentName: "Forbidden Resident Name",
    invoiceCode: "INV-FORBIDDEN",
  };
}

test("M7-B2 parser retains only the B1 whitelist before cache insertion", () => {
  const parsed = parseAdminPaymentTransaction(rawTransaction());

  assert.deepEqual(Object.keys(parsed).sort(), [
    "amount",
    "createdAt",
    "currency",
    "failedAt",
    "id",
    "invoiceId",
    "paidAt",
    "paymentMethod",
    "propertyId",
    "provider",
    "providerOrderId",
    "requestedByUserId",
    "residentId",
    "status",
    "updatedAt",
  ]);
  assert.equal(parsed.residentId, RESIDENT_ID);
  assert.equal(parsed.requestedByUserId, REQUESTED_BY_USER_ID);

  const serialized = JSON.stringify(parsed);
  for (const forbidden of [
    "forbidden-provider-transaction",
    "https://forbidden.example/payment",
    "forbidden-snap-token",
    "forbidden-raw-status",
    "forbidden-payload",
    "forbidden-signature",
    "Forbidden Resident Name",
    "INV-FORBIDDEN",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  const page = parseAdminPaymentTransactionList({
    data: [rawTransaction()],
    meta: { limit: 20, offset: 40, total: 81 },
  });
  assert.deepEqual(page, {
    data: [parsed],
    meta: { limit: 20, offset: 40, total: 81 },
  });
  assert.deepEqual(Object.keys(page).sort(), ["data", "meta"]);
  assert.deepEqual(Object.keys(page.meta).sort(), ["limit", "offset", "total"]);
  assert.deepEqual(parseAdminPaymentTransactionDetail({ data: rawTransaction() }), parsed);
});

test("PG3 parser accepts only exact list and detail envelopes", () => {
  for (const invalid of [
    [rawTransaction()],
    { items: [rawTransaction()], meta: { limit: 20, offset: 0, total: 1 } },
    { data: [rawTransaction()] },
    { data: [rawTransaction()], meta: { limit: 20, offset: 0, total: 1 }, cursor: null },
    { data: [rawTransaction()], meta: { limit: 20, offset: 0 } },
    { data: [rawTransaction()], meta: { limit: 20, offset: 0, total: 1, cursor: null } },
    { data: [rawTransaction()], meta: { limit: 0, offset: 0, total: 1 } },
    { data: [rawTransaction()], meta: { limit: 20, offset: -1, total: 1 } },
  ]) {
    assert.throws(
      () => parseAdminPaymentTransactionList(invalid),
      /Invalid payment transaction list/,
    );
  }

  for (const invalid of [
    rawTransaction(),
    { item: rawTransaction() },
    { data: rawTransaction(), meta: {} },
  ]) {
    assert.throws(
      () => parseAdminPaymentTransactionDetail(invalid),
      /Invalid payment transaction detail/,
    );
  }
});

test("M7-B2 parser errors are generic and never contain opaque subject IDs", () => {
  for (const invalid of [
    { ...rawTransaction(), status: "provider-private-status" },
    { ...rawTransaction(), amount: Number.MAX_SAFE_INTEGER + 1 },
    { ...rawTransaction(), currency: "USD" },
  ]) {
    assert.throws(
      () => parseAdminPaymentTransaction(invalid),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(RESIDENT_ID), false);
        assert.equal(error.message.includes(REQUESTED_BY_USER_ID), false);
        assert.equal(error.message.includes("forbidden"), false);
        return true;
      },
    );
  }
});

test("M7-B2 access predicate requires manager or admin plus billing.read", () => {
  assert.equal(
    canReadAdminPaymentTransactions({ roles: ["manager"], permissions: ["billing.read"] }),
    true,
  );
  assert.equal(
    canReadAdminPaymentTransactions({ roles: ["admin"], permissions: ["billing.read"] }),
    true,
  );
  for (const roles of [["owner"], ["property_owner"], ["technician"]]) {
    assert.equal(canReadAdminPaymentTransactions({ roles, permissions: ["billing.read"] }), false);
  }
  assert.equal(canReadAdminPaymentTransactions({ roles: ["admin"], permissions: [] }), false);
});

test("M7-B2 payment transaction query keys are property-scoped", () => {
  assert.deepEqual(
    adminUxQueryKeys.payments.list("property-a", { status: "paid", limit: 100, offset: 20 }),
    ["paymentTransactions", "property-a", { limit: 100, offset: 20, status: "paid" }],
  );
  assert.deepEqual(adminUxQueryKeys.payments.detail("property-a", "transaction-a"), [
    "paymentTransaction",
    "property-a",
    "transaction-a",
  ]);
});

test("M7-B2 hooks use only approved GET paths and enforce property/access cache boundaries", async () => {
  const source = await readFile(
    new URL("../hooks/usePaymentTransactions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /apiClient\.get<unknown>\("\/admin\/payment-transactions"/);
  assert.match(source, /apiClient\.get<unknown>\(`\/admin\/payment-transactions\/\$\{id\}`\)/);
  assert.equal((source.match(/apiClient\.get<unknown>/g) ?? []).length, 2);
  assert.match(source, /property_id: propertyId/);
  assert.match(source, /status: filters\.status \?\? null/);
  assert.match(source, /\.\.\.\(filters\.status \? \{ status: filters\.status \} : \{\}\)/);
  assert.match(source, /limit: Number\(pagination\.limit\)/);
  assert.match(source, /offset: Number\(pagination\.offset\)/);
  assert.match(source, /adminUxQueryKeys\.payments\.list\(propertyId, keyFilters\)/);
  assert.match(source, /adminUxQueryKeys\.payments\.detail\(propertyId, id\)/);
  assert.match(source, /Boolean\(currentPropertyId\).*hasAccess/s);
  assert.match(source, /parseAdminPaymentTransactionList/);
  assert.match(source, /parseAdminPaymentTransactionDetail/);
  assert.doesNotMatch(source, /apiClient\.(post|patch|put|delete)/);
  assert.doesNotMatch(source, /refetchInterval|setInterval|polling|invalidateQueries/);
  assert.doesNotMatch(source, /https?:\/\/|midtrans|webhook|settlement|refund/);
  assert.doesNotMatch(source, /paymentUrl|snapToken|providerTransactionId|metadata|rawProvider/);
});

test("M7-B2 Online list and detail expose required states without rendering opaque or forbidden fields", async () => {
  const source = await readFile(new URL("../routes/payments.tsx", import.meta.url), "utf8");
  const gatewaySection = source.slice(source.indexOf("// --- Payment gateway"));

  assert.match(
    source,
    /canReadGatewayTransactions \? <TabsTrigger value="online">Online<\/TabsTrigger> : null/,
  );
  assert.match(source, /Boolean\(currentPropertyId\).*canReadAdminPaymentTransactions/s);
  assert.match(source, /activeTab === "online" && canReadGatewayTransactions/);
  assert.match(source, /gatewayMatchesProperty.*gatewayState\.propertyId === currentPropertyId/s);
  assert.match(source, /selectedGatewayTransactionId = gatewayMatchesProperty/s);
  assert.match(gatewaySection, /query\.isPending.*Memuat transaksi pembayaran online/s);
  assert.match(source, /Belum ada transaksi pembayaran online/);
  assert.match(gatewaySection, /isForbiddenError\(query\.error\)/);
  assert.match(source, /Gagal memuat transaksi pembayaran online/);
  assert.match(gatewaySection, /query\.isPending.*Memuat detail transaksi online/s);
  assert.match(gatewaySection, /Detail transaksi tidak tersedia/);
  assert.match(gatewaySection, /isNotFoundError\(query\.error\)/);
  assert.match(gatewaySection, /Gagal memuat detail transaksi/);
  assert.match(gatewaySection, /page\.meta\.offset - page\.meta\.limit/);
  assert.match(gatewaySection, /page\.meta\.offset \+ page\.meta\.limit >= page\.meta\.total/);
  assert.match(gatewaySection, /page\.meta\.offset \+ page\.data\.length/);
  assert.match(source, /<TabsTrigger value="invoices">Invoice<\/TabsTrigger>/);
  assert.match(source, /<TabsTrigger value="payments">Pembayaran<\/TabsTrigger>/);
  assert.match(source, /<TabsContent value="invoices">/);
  assert.match(source, /<TabsContent value="payments">/);

  for (const forbiddenName of [
    "residentId",
    "requestedByUserId",
    "residentName",
    "invoiceCode",
    "providerTransactionId",
    "expiresAt",
    "paymentUrl",
    "snapToken",
    "metadata",
    "rawProvider",
  ]) {
    assert.equal(gatewaySection.includes(forbiddenName), false);
  }
  assert.doesNotMatch(gatewaySection, /console\.(log|error|warn|info)/);
  assert.doesNotMatch(
    gatewaySection,
    /mutate|mutation|polling|export|apiClient\.(post|patch|put|delete)/,
  );
});

test("PG3 keeps the generated route limited to the existing payments route", async () => {
  const generated = await readFile(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
  assert.match(generated, /payments/);
  assert.doesNotMatch(generated, /payment-transactions|PaymentTransaction|Online/);
});
