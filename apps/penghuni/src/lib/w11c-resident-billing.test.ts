import assert from "node:assert/strict";
import test from "node:test";
import { deriveResidentBillingNotice, verifiedDpTotal } from "./w11c-resident-billing";

test("W11C billing notice prioritizes settled and overdue authority", () => {
  assert.equal(
    deriveResidentBillingNotice(
      { rent_outstanding: 0, overdue_count: 2, next_due_date: "2026-08-20" },
      "2026-08-19",
    ).kind,
    "settled",
  );
  assert.equal(
    deriveResidentBillingNotice(
      { rent_outstanding: 1_800_000, overdue_count: 1, next_due_date: "2026-08-18" },
      "2026-08-19",
    ).kind,
    "overdue",
  );
});

test("W11C billing notice distinguishes due-soon and upcoming invoices", () => {
  const dueSoon = deriveResidentBillingNotice(
    { rent_outstanding: 1_800_000, overdue_count: 0, next_due_date: "2026-08-26" },
    "2026-08-19",
  );
  assert.equal(dueSoon.kind, "due_soon");
  assert.equal(dueSoon.days_until_due, 7);

  const upcoming = deriveResidentBillingNotice(
    { rent_outstanding: 1_800_000, overdue_count: 0, next_due_date: "2026-09-19" },
    "2026-08-19",
  );
  assert.equal(upcoming.kind, "upcoming");
  assert.equal(upcoming.days_until_due, 31);
});

test("W11C verified DP total excludes pending, reversed, and non-DP payments", () => {
  assert.equal(
    verifiedDpTotal([
      { payment_purpose: "dp", payment_status: "verified", amount: 2_700_000, reversal_id: null },
      {
        payment_purpose: "dp",
        payment_status: "pending_confirmation",
        amount: 500_000,
        reversal_id: null,
      },
      { payment_purpose: "dp", payment_status: "verified", amount: 300_000, reversal_id: "rev-1" },
      { payment_purpose: "rent", payment_status: "verified", amount: 1_800_000, reversal_id: null },
    ]),
    2_700_000,
  );
});
