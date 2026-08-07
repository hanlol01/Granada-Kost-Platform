import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useVerifyPayment } from "../hooks/useAdminW06Billing";
import {
  canManageW06Billing,
  canVerifyW06Payment,
  getBillingPayments,
  getBillingWorklist,
  parseBillingPayments,
  parseBillingReceipt,
  parseBillingWorklist,
  parseSafePayment,
  recordManualPayment,
  rejectPayment,
} from "./admin-w06-billing";
import { adminUxV2Requester } from "./admin-ux-api";

const invoiceId = "00000000-0000-4000-8000-000000000001";
const residentId = "00000000-0000-4000-8000-000000000002";
const leaseId = "00000000-0000-4000-8000-000000000003";
const paymentId = "00000000-0000-4000-8000-000000000004";
const fileId = "00000000-0000-4000-8000-000000000005";

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Timed out waiting for W06 mutation lifecycle");
}

function workspacePayment(status = "pending_confirmation") {
  return {
    id: paymentId,
    payment_code: "PAY-W06-001",
    payment_method: "bank_transfer",
    payment_status: status,
    payment_purpose: "rent",
    amount: 1_800_000,
    paid_at: "2026-07-31T10:00:00.000Z",
    verified_at: null,
    reversal_id: null,
    receipt_id: null,
    allocations: [{ invoice_id: invoiceId, amount: 1_800_000 }],
    resident_id: residentId,
    lease_id: leaseId,
    resident_name: "Ayu",
    room_number: "A-01",
    reference_number: "TRX-001",
    rent_allocation_amount: 1_800_000,
    settles_rent_contract: false,
    evidence: [
      {
        id: fileId,
        original_filename: "transfer.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 512,
        content_path: "/files/" + fileId + "/content",
      },
    ],
  };
}

function worklist() {
  return {
    data: [
      {
        id: invoiceId,
        invoice_code: "INV-W06-001",
        resident_id: residentId,
        lease_id: leaseId,
        resident_name: "Ayu",
        room_number: "A-01",
        coverage_start: "2026-08-01",
        coverage_end: "2027-07-31",
        due_date: "2026-08-01",
        invoice_status: "issued",
        total_amount: 21_600_000,
        outstanding_amount: 21_600_000,
      },
    ],
    meta: { limit: 20, offset: 0, total: 1, month: "2026-08-01" },
  };
}

test("W06 Admin parsers accept the exact public billing contract", () => {
  const result = parseBillingWorklist(worklist());
  assert.equal(result.data[0].invoice_code, "INV-W06-001");
  assert.equal(result.data[0].outstanding_amount, 21_600_000);
  assert.equal(result.meta.month, "2026-08-01");
  const pending = parseBillingPayments({
    data: [workspacePayment()],
    meta: { limit: 20, offset: 0, total: 1 },
  });
  assert.equal(pending.data[0].payment_status, "pending_confirmation");
  assert.equal(pending.data[0].evidence[0].content_path, "/files/" + fileId + "/content");
  assert.throws(() =>
    parseBillingPayments({
      data: [workspacePayment("pending")],
      meta: { limit: 20, offset: 0, total: 1 },
    }),
  );

  const payment = parseSafePayment({
    data: {
      payment_id: paymentId,
      payment_code: "PAY-W06-001",
      payment_status: "verified",
      payment_purpose: "rent",
      amount: 1_800_000,
      receipt_id: null,
    },
  });
  assert.equal(payment.payment_status, "verified");

  const receipt = parseBillingReceipt({
    data: {
      id: paymentId,
      receipt_code: "RCT-W06-001",
      receipt_kind: "payment",
      amount: 1_800_000,
      issued_at: "2026-07-31T10:05:00.000Z",
      snapshot: {
        payment_code: "PAY-W06-001",
        payment_method: "bank_transfer",
        payment_purpose: "rent",
        lease_id: leaseId,
        allocations: [{ invoice_id: invoiceId, amount: 1_800_000 }],
      },
    },
  });
  assert.equal(receipt.snapshot.allocations[0].amount, 1_800_000);
});

test("W06 Admin parsers fail closed on extra fields, custom prototypes, invalid dates, UUIDs, and money", () => {
  assert.throws(
    () => parseBillingWorklist({ ...worklist(), unexpected: true }),
    /tidak valid|tidak dikenal/i,
  );

  const custom = Object.create({ inherited: true }) as ReturnType<typeof worklist>;
  Object.assign(custom, worklist());
  assert.throws(() => parseBillingWorklist(custom), /tidak valid/i);

  const invalidDate = worklist();
  invalidDate.data[0].due_date = "2026-02-31";
  assert.throws(() => parseBillingWorklist(invalidDate), /tanggal|valid/i);

  const invalidUuid = worklist();
  invalidUuid.data[0].resident_id = "resident-from-client";
  assert.throws(() => parseBillingWorklist(invalidUuid), /valid/i);

  const invalidMoney = worklist();
  invalidMoney.data[0].total_amount = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => parseBillingWorklist(invalidMoney), /bilangan|valid/i);
});

test("W06 Admin requesters preserve property scope, cancellation, and caller-owned idempotency", async () => {
  const controller = new AbortController();
  const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];
  const requester = {
    async get(path: string, options?: unknown) {
      calls.push({ method: "GET", path, options });
      return worklist();
    },
    async post(path: string, body: unknown, options?: unknown) {
      calls.push({ method: "POST", path, body, options });
      return {
        data: {
          payment_id: paymentId,
          payment_code: "PAY-W06-001",
          payment_status: "pending_confirmation",
          payment_purpose: "rent",
          amount: 1_800_000,
          receipt_id: null,
        },
      };
    },
  };

  await getBillingWorklist(
    {
      propertyId: residentId,
      month: "2026-08",
      limit: 20,
      offset: 0,
      dueWithinDays: 30,
    },
    controller.signal,
    requester as never,
  );
  await recordManualPayment(
    {
      property_id: residentId,
      resident_id: residentId,
      lease_id: leaseId,
      method: "bank_transfer",
      payment_purpose: "rent",
      amount: 1_800_000,
      allocations: [{ invoice_id: invoiceId, amount: 1_800_000 }],
    },
    "w06-logical-command-key",
    requester as never,
  );

  assert.equal(calls[0].path, "/admin/billing/current");
  assert.deepEqual((calls[0].options as { query: unknown }).query, {
    property_id: residentId,
    month: "2026-08",
    limit: 20,
    offset: 0,
    search: undefined,
    due_within_days: 30,
  });
  assert.equal((calls[0].options as { signal: AbortSignal }).signal, controller.signal);
  assert.equal(
    (calls[1].options as { idempotencyKey: string }).idempotencyKey,
    "w06-logical-command-key",
  );
});

test("W06 Admin pending workspace and rejection use exact property-scoped endpoints", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];
  const requester = {
    async get(path: string, options?: unknown) {
      calls.push({ method: "GET", path, options });
      return { data: [workspacePayment()], meta: { limit: 20, offset: 0, total: 1 } };
    },
    async post(path: string, body: unknown, options?: unknown) {
      calls.push({ method: "POST", path, body, options });
      return {
        data: {
          payment_id: paymentId,
          payment_code: "PAY-W06-001",
          payment_status: "rejected",
          payment_purpose: "rent",
          amount: 1_800_000,
          receipt_id: null,
        },
      };
    },
  };
  const pending = await getBillingPayments(
    { propertyId: residentId, status: "pending_confirmation", dueWithinDays: 30 },
    undefined,
    requester as never,
  );
  const rejected = await rejectPayment(
    residentId,
    paymentId,
    "Bukti transfer tidak sesuai",
    "w06-reject-command-key",
    requester as never,
  );
  assert.equal(pending.data[0].resident_id, residentId);
  assert.equal(rejected.payment_status, "rejected");
  assert.deepEqual((calls[0].options as { query: unknown }).query, {
    property_id: residentId,
    status: "pending_confirmation",
    limit: 20,
    offset: 0,
    due_within_days: 30,
  });
  assert.equal(calls[1].path, "/admin/billing/payments/" + paymentId + "/reject");
  assert.deepEqual(calls[1].body, {
    property_id: residentId,
    reason: "Bukti transfer tidak sesuai",
  });
  assert.equal(
    (calls[1].options as { idempotencyKey: string }).idempotencyKey,
    "w06-reject-command-key",
  );
});

test("live Admin W06 mutation rejects a superseded response before cache effects", async () => {
  const requests: Array<ReturnType<typeof deferred<unknown>>> = [];
  const invalidations: unknown[] = [];
  const originalPost = adminUxV2Requester.post;
  adminUxV2Requester.post = (() => {
    const request = deferred<unknown>();
    requests.push(request);
    return request.promise;
  }) as typeof adminUxV2Requester.post;
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  queryClient.invalidateQueries = ((filters) => {
    invalidations.push(filters?.queryKey);
    return Promise.resolve();
  }) as typeof queryClient.invalidateQueries;
  let mutation: ReturnType<typeof useVerifyPayment> | null = null;
  function CaptureHook() {
    mutation = useVerifyPayment(residentId);
    return null;
  }
  renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(CaptureHook)),
  );
  assert.ok(mutation);
  const activeMutation = mutation as ReturnType<typeof useVerifyPayment>;
  const response = {
    data: {
      payment_id: paymentId,
      payment_code: "PAY-W06-001",
      payment_status: "verified",
      payment_purpose: "rent",
      amount: 1_800_000,
      receipt_id: null,
    },
  };
  try {
    const stale = activeMutation.mutateAsync({
      paymentId,
      idempotencyKey: "w06-verify-command-key-1",
    });
    await waitFor(() => requests.length === 1);
    const current = activeMutation.mutateAsync({
      paymentId,
      idempotencyKey: "w06-verify-command-key-2",
    });
    await waitFor(() => requests.length === 2);
    requests[0].resolve(response);
    await assert.rejects(stale, /W06_SCOPE_CHANGED|Scope billing berubah/);
    assert.deepEqual(invalidations, []);
    requests[1].resolve(response);
    assert.equal((await current).payment_status, "verified");
    assert.equal(invalidations.length, 6);
  } finally {
    adminUxV2Requester.post = originalPost;
    queryClient.clear();
  }
});

test("W06 Admin authorization and route expose manual workflows without gateway actions", () => {
  assert.equal(canManageW06Billing({ roles: ["manager"], permissions: ["billing.manage"] }), true);
  assert.equal(canManageW06Billing({ roles: ["admin"], permissions: ["billing.manage"] }), false);
  assert.equal(canVerifyW06Payment({ roles: ["admin"], permissions: ["payment.verify"] }), true);
  assert.equal(
    canVerifyW06Payment({ roles: ["resident"], permissions: ["payment.verify"] }),
    false,
  );

  const route = readFileSync(new URL("../routes/payments.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(
    new URL("../components/billing/W06PaymentsWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /W06PaymentsWorkspace/);
  assert.doesNotMatch(`${route}\n${workspace}`, /usePaymentGateway|OnlinePayment|QRIS|ewallet/i);
  assert.match(workspace, /security_deposit/);
  assert.match(workspace, /documented_damage/);
  assert.match(workspace, /downloadAdminInvoiceDocument/);
  assert.match(workspace, /downloadAdminReceiptDocument/);
  assert.match(workspace, /settles_rent_contract/);
  assert.match(workspace, /Sewa kontrak lunas/);
  assert.match(workspace, /scrollIntoView/);
  assert.doesNotMatch(workspace, /Kuitansi tersedia/);
  assert.match(workspace, /pending_confirmation/);
  assert.match(workspace, /useVerifyPayment/);
  assert.match(workspace, /useRejectPayment/);
  const apiSource = readFileSync(new URL("./admin-w06-billing.ts", import.meta.url), "utf8");
  assert.match(apiSource, /billing\/invoices\/.*\/document/);
  assert.match(apiSource, /billing\/receipts\/.*\/document/);
});

test("W07 settlement UI uses operational copy, contextual payment controls, and stacked payment history", () => {
  const residentDetail = readFileSync(
    new URL("../components/residents/ResidentDetailWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const workspace = readFileSync(
    new URL("../components/billing/W06PaymentsWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const noticeAlert = readFileSync(
    new URL("../components/ui/notice-alert.tsx", import.meta.url),
    "utf8",
  );

  assert.match(residentDetail, /className="space-y-5" aria-label="Tagihan dan pembayaran"/);
  assert.match(residentDetail, /Total pembayaran sewa yang sudah diterima/);
  assert.match(residentDetail, /Sisa yang wajib dilunasi/);
  assert.match(residentDetail, /Tenggat jatuh tempo pelunasan/);
  assert.match(residentDetail, /triggerLabel="Catat Pembayaran"/);
  assert.match(residentDetail, /triggerLabel="Lunasi Sisa"/);
  assert.match(residentDetail, /Status verifikasi/);
  assert.match(residentDetail, /Keterangan pembayaran/);
  assert.match(residentDetail, /Pembayaran awal sewa/);
  assert.match(residentDetail, /Pembayaran tambahan yang sudah diterima/);
  assert.match(residentDetail, /Pembayaran awal sewa \(DP\)/);
  assert.match(residentDetail, /Pembayaran untuk sewa kontrak/);
  assert.match(residentDetail, /Bayar sebagian untuk pelunasan sewa kontrak/);
  assert.match(residentDetail, /Bukan tagihan sewa bulanan/);
  assert.match(residentDetail, /Skema pelunasan/);
  assert.match(residentDetail, /Pelunasan penuh sebelum tenggat/);
  assert.match(residentDetail, /ContractPaymentBadges/);
  assert.match(residentDetail, /Bayar sebagian/);
  assert.match(residentDetail, /Yang perlu diperhatikan/);
  assert.match(residentDetail, /Pelunasan sewa selesai/);
  assert.match(residentDetail, /Tindakan admin diperlukan/);
  assert.match(residentDetail, /transfer menunggu konfirmasi/);
  assert.match(residentDetail, /Tutup pengingat:/);
  assert.match(noticeAlert, /onDismiss/);
  assert.match(noticeAlert, /Tutup pemberitahuan/);
  assert.doesNotMatch(
    residentDetail,
    /<SummaryMetric label="Kredit awal"|<SummaryMetric label="Pembayaran ledger"|<SummaryMetric label="Saldo sewa"/,
  );

  assert.match(workspace, /Bayar Sebagian/);
  assert.match(workspace, /Lunasi Sekarang/);
  assert.match(workspace, /Bukti transfer \(wajib\)/);
  assert.match(workspace, /<option value="cash">Tunai<\/option>/);
  assert.match(workspace, /Nominal pembayaran sewa/);
  assert.match(workspace, /Jumlah yang akan dicatat/);
  assert.match(workspace, /Sisa pembayaran sewa setelah dicatat/);
  assert.match(workspace, /Pembayaran sebagian tidak mengubah tenggat pelunasan kontrak/);
  assert.match(workspace, /tidak\s+ada\s+tagihan sewa bulanan baru/);
  assert.match(workspace, /Nomor bukti penerimaan \(opsional\)/);
  assert.match(workspace, /Nomor referensi transfer \(opsional\)/);
  assert.match(workspace, /Pilih bukti pembayaran/);
  assert.match(workspace, /toastMutationSuccess/);
  assert.match(workspace, /Pembayaran berhasil dicatat dan terverifikasi/);
  assert.match(workspace, /setReference\(""\);/);
  assert.match(workspace, /setNote\(""\);/);
  assert.match(
    workspace,
    /contractSettlementMode === "full" \? contractSettlementInvoice\.outstanding_amount : 0/,
  );
  assert.match(
    workspace,
    /Nominal belum diisi\. Masukkan nominal lebih dari Rp0 untuk mencatat pembayaran\./,
  );
  assert.doesNotMatch(workspace, /Alokasi invoice/);
});
