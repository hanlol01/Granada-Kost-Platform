import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentRecord } from "@/hooks/useBilling";
import { selectRevenueSummary } from "./reports-selectors";

const PROPERTY_ID = "00000000-0000-4000-8000-000000000001";

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "payment-test",
    propertyId: PROPERTY_ID,
    residentId: null,
    paymentCode: "PAY-TEST",
    paymentMethod: "cash",
    paymentStatus: "verified",
    amount: 0,
    paidAt: null,
    verifiedAt: null,
    voidedAt: null,
    referenceNumber: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("groups verified payments by Asia/Jakarta calendar period", () => {
  const summary = selectRevenueSummary(
    [
      payment({
        id: "dec-boundary",
        amount: 1_800_000,
        paidAt: "2025-12-31T17:30:00.000Z",
      }),
      payment({
        id: "jan-end",
        amount: 900_000,
        paidAt: "2026-01-31T16:59:59.000Z",
      }),
      payment({
        id: "feb-boundary",
        amount: 300_000,
        paidAt: "2026-01-31T17:00:00.000Z",
      }),
    ],
    2026,
  );

  assert.equal(summary.verifiedPayments, 3);
  assert.equal(summary.monthly[0]?.amount, 2_700_000);
  assert.equal(summary.monthly[1]?.amount, 300_000);
  assert.equal(summary.verifiedAmount, 3_000_000);
});

test("excludes pending and void payments from revenue", () => {
  const summary = selectRevenueSummary(
    [
      payment({
        id: "pending",
        paymentStatus: "pending",
        amount: 1_000_000,
        paidAt: "2026-01-05T00:00:00.000Z",
      }),
      payment({
        id: "void",
        paymentStatus: "void",
        amount: 2_000_000,
        paidAt: "2026-01-06T00:00:00.000Z",
      }),
      payment({
        id: "verified",
        amount: 500_000,
        paidAt: "2026-01-07T00:00:00.000Z",
      }),
    ],
    2026,
  );

  assert.equal(summary.verifiedPayments, 1);
  assert.equal(summary.verifiedAmount, 500_000);
  assert.equal(summary.pendingPayments, 1);
  assert.equal(summary.voidedPayments, 1);
});
