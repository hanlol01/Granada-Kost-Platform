import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useSubmitMyW06Proof, w06BillingKey } from "../hooks/useW06Billing";
import { apiClient } from "./api";
import { AuthContext } from "./auth";
import { getMyW06Billing, parseMyW06Billing, submitMyW06Proof } from "./penghuni-w06-billing";

const propertyId = "00000000-0000-4000-8000-000000000001";
const leaseId = "00000000-0000-4000-8000-000000000002";
const invoiceId = "00000000-0000-4000-8000-000000000003";
const paymentId = "00000000-0000-4000-8000-000000000004";
const proofId = "00000000-0000-4000-8000-000000000005";
const receiptId = "00000000-0000-4000-8000-000000000006";
const fileId = "00000000-0000-4000-8000-000000000007";

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
  assert.fail("Timed out waiting for Penghuni W06 mutation lifecycle");
}

function response() {
  return {
    data: {
      lease: {
        id: leaseId,
        property_id: propertyId,
        status: "active",
        start_date: "2026-08-01",
        end_date: "2027-07-31",
        payment_plan: "two_month_installments",
        contract_rent: 21_600_000,
        monthly_rate: 1_800_000,
        remaining_days: 365,
        note: "DP adalah kredit sewa; deposit keamanan terpisah.",
      },
      summary: {
        rent_invoiced: 21_600_000,
        rent_paid: 1_800_000,
        rent_outstanding: 19_800_000,
        security_deposit_required: 1_800_000,
        deposit_collected: 1_800_000,
        deposit_deducted: 0,
        deposit_refunded: 0,
        deposit_balance: 1_800_000,
        installment_paid: 0,
        installment_total: 6,
        next_due_date: "2026-09-24",
        overdue_count: 0,
      },
      invoices: [
        {
          id: invoiceId,
          invoice_code: "INV-W06-001",
          invoice_status: "partially_paid",
          invoice_purpose: "rent",
          total_amount: 3_600_000,
          outstanding_amount: 1_800_000,
          due_date: "2026-08-01",
          coverage_start: "2026-08-01",
          coverage_end: "2026-09-30",
        },
      ],
      payments: [
        {
          id: paymentId,
          payment_code: "PAY-W06-001",
          payment_method: "bank_transfer",
          payment_status: "verified",
          payment_purpose: "dp",
          amount: 1_800_000,
          paid_at: "2026-07-31T10:00:00.000Z",
          verified_at: "2026-07-31T10:05:00.000Z",
          reversal_id: null,
          receipt_id: receiptId,
          allocations: [{ invoice_id: invoiceId, amount: 1_800_000 }],
        },
      ],
      proofs: [
        {
          id: proofId,
          invoice_id: invoiceId,
          proof_status: "verified",
          claimed_amount: 1_800_000,
          payment_purpose: "dp",
          uploaded_at: "2026-07-31T09:55:00.000Z",
          reviewed_at: "2026-07-31T10:05:00.000Z",
          reject_reason: null,
        },
      ],
    },
  };
}

test("W06 Penghuni parser accepts the exact self-scoped billing contract", () => {
  const billing = parseMyW06Billing(response());
  assert.equal(billing.lease.property_id, propertyId);
  assert.equal(billing.summary.deposit_balance, 1_800_000);
  assert.equal(billing.payments[0].allocations[0].amount, 1_800_000);
  assert.equal("resident_id" in billing.lease, false);
  const pending = response();
  pending.data.payments[0].payment_status = "pending_confirmation";
  assert.equal(parseMyW06Billing(pending).payments[0].payment_status, "pending_confirmation");
  const legacy = response();
  legacy.data.payments[0].payment_status = "pending";
  assert.throws(() => parseMyW06Billing(legacy), /tidak valid/i);
});

test("W06 Penghuni parser rejects extra fields, prototypes, malformed dates, UUIDs, timestamps, and money", () => {
  assert.throws(() => parseMyW06Billing({ ...response(), resident_id: proofId }), /tidak valid/i);

  const custom = Object.create({ resident_id: proofId }) as ReturnType<typeof response>;
  Object.assign(custom, response());
  assert.throws(() => parseMyW06Billing(custom), /tidak valid/i);

  const invalidDate = response();
  invalidDate.data.lease.end_date = "2027-02-30";
  assert.throws(() => parseMyW06Billing(invalidDate), /tidak valid/i);

  const invalidUuid = response();
  invalidUuid.data.invoices[0].id = "client-injected-resident";
  assert.throws(() => parseMyW06Billing(invalidUuid), /tidak valid/i);

  const invalidTimestamp = response();
  invalidTimestamp.data.payments[0].paid_at = "31/07/2026";
  assert.throws(() => parseMyW06Billing(invalidTimestamp), /tidak valid/i);

  const invalidMoney = response();
  invalidMoney.data.summary.rent_paid = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => parseMyW06Billing(invalidMoney), /tidak valid/i);
});

test("W06 Penghuni requesters are self-scoped, cancellable, and preserve a logical idempotency key", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];
  const requester = {
    async get(path: string, options?: unknown) {
      calls.push({ method: "GET", path, options });
      return response();
    },
    async post(path: string, body: unknown, options?: unknown) {
      calls.push({ method: "POST", path, body, options });
      return {
        data: {
          id: proofId,
          invoice_id: invoiceId,
          proof_status: "pending_review",
          claimed_amount: 1_800_000,
          payment_purpose: "rent",
          uploaded_at: "2026-07-31T10:00:00.000Z",
        },
      };
    },
  };
  const controller = new AbortController();
  await getMyW06Billing(controller.signal, requester as never);
  const input = {
    invoice_id: invoiceId,
    claimed_amount: 1_800_000,
    payment_method: "bank_transfer" as const,
    payment_purpose: "rent" as const,
    file_ids: [fileId],
  };
  await submitMyW06Proof(input, "w06-proof-command-key", requester as never);

  assert.equal(calls[0].path, "/my/billing");
  assert.equal((calls[0].options as { signal: AbortSignal }).signal, controller.signal);
  assert.equal(calls[1].path, "/my/payment-proofs");
  assert.deepEqual(calls[1].body, input);
  assert.equal((calls[1].body as Record<string, unknown>).resident_id, undefined);
  assert.equal((calls[1].body as Record<string, unknown>).property_id, undefined);
  assert.equal(
    (calls[1].options as { idempotencyKey: string }).idempotencyKey,
    "w06-proof-command-key",
  );
});

test("live Penghuni W06 mutation rejects a superseded response before account cache effects", async () => {
  const requests: Array<ReturnType<typeof deferred<unknown>>> = [];
  const invalidations: unknown[] = [];
  const originalPost = apiClient.post;
  apiClient.post = (() => {
    const request = deferred<unknown>();
    requests.push(request);
    return request.promise;
  }) as typeof apiClient.post;
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  queryClient.invalidateQueries = ((filters) => {
    invalidations.push(filters?.queryKey);
    return Promise.resolve();
  }) as typeof queryClient.invalidateQueries;
  let mutation: ReturnType<typeof useSubmitMyW06Proof> | null = null;
  function CaptureHook() {
    mutation = useSubmitMyW06Proof();
    return null;
  }
  renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        AuthContext.Provider,
        {
          value: {
            status: "authenticated",
            user: { id: propertyId, roles: ["resident"] } as never,
            hasRole: () => true,
            hasPermission: () => true,
            login: async () => undefined,
            logout: async () => undefined,
            refreshMe: async () => undefined,
          },
        },
        createElement(CaptureHook),
      ),
    ),
  );
  assert.ok(mutation);
  const activeMutation = mutation as ReturnType<typeof useSubmitMyW06Proof>;
  const input = {
    invoice_id: invoiceId,
    claimed_amount: 1_800_000,
    payment_method: "bank_transfer" as const,
    payment_purpose: "rent" as const,
    file_ids: [fileId],
  };
  const accepted = {
    data: {
      id: proofId,
      invoice_id: invoiceId,
      proof_status: "pending_review",
      claimed_amount: 1_800_000,
      payment_purpose: "rent",
      uploaded_at: "2026-07-31T10:00:00.000Z",
    },
  };
  try {
    const stale = activeMutation.mutateAsync({
      input,
      idempotencyKey: "w06-proof-command-key-1",
    });
    await waitFor(() => requests.length === 1);
    const current = activeMutation.mutateAsync({
      input,
      idempotencyKey: "w06-proof-command-key-2",
    });
    await waitFor(() => requests.length === 2);
    requests[0].resolve(accepted);
    await assert.rejects(stale, /W06_ACCOUNT_SCOPE_CHANGED|Akun berubah/);
    assert.deepEqual(invalidations, []);
    requests[1].resolve(accepted);
    assert.equal((await current).proof_status, "pending_review");
    assert.deepEqual(invalidations, [w06BillingKey(propertyId)]);
  } finally {
    apiClient.post = originalPost;
    queryClient.clear();
  }
});

test("W06 Penghuni cache keys isolate accounts and the route contains no provider checkout", () => {
  assert.notDeepEqual(w06BillingKey("account-a"), w06BillingKey("account-b"));
  const route = readFileSync(new URL("../routes/_app/billing.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(route, /usePaymentGateway|OnlinePayment|QRIS|ewallet|checkout_url/i);
  assert.doesNotMatch(route, /resident_id/);
  assert.match(route, /bank_transfer/);
  assert.match(route, /security_deposit/);
  assert.match(route, /downloadMyInvoiceDocument/);
  assert.match(
    readFileSync(new URL("./penghuni-w06-billing.ts", import.meta.url), "utf8"),
    /my\/billing\/invoices\/.*\/document/,
  );
});
