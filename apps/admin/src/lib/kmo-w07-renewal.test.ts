import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { toRenewalApprovalBody, toRenewalIntentBody } from "./admin-ux-lease-api";
import { normalizeLeaseDetailSearch } from "./admin-ux-lease-helpers";
import { adminUxQueryKeys, invalidationKeysFor } from "./admin-ux-query-keys";

const adminSrc = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("W07C renewal search panel normalizes safely", () => {
  assert.equal(normalizeLeaseDetailSearch({ panel: "renewal" }).panel, "renewal");
  assert.equal(normalizeLeaseDetailSearch({ panel: "bad-value" }).panel, "detail");
});

test("W07C wire bodies preserve server names and do not send a 25 percent minimum", () => {
  assert.deepEqual(toRenewalIntentBody({ effectiveDate: "2026-10-01", note: " H-60 " }), {
    effective_date: "2026-10-01",
    note: "H-60",
  });
  assert.deepEqual(
    toRenewalApprovalBody({
      termMonths: 12,
      billingCycle: "monthly",
      paymentPlanType: "annual_full",
    }),
    {
      term_months: 12,
      billing_cycle: "monthly",
      payment_plan_type: "annual_full",
    },
  );
});

test("W07C renewal caches and invalidates only property-scoped lease authority", () => {
  const propertyId = "11111111-1111-4111-8111-111111111111";
  const key = adminUxQueryKeys.leases.renewalCommands(propertyId, "lease-1");
  assert.deepEqual(key, ["leaseRenewalCommands", propertyId, "lease-1"]);
  const eligibilityKey = adminUxQueryKeys.leases.renewalEligibility(propertyId, "lease-1");
  assert.deepEqual(eligibilityKey, ["leaseRenewalEligibility", propertyId, "lease-1"]);
  const invalidated = invalidationKeysFor("lease-renewal", propertyId);
  assert.ok(invalidated.some((entry) => JSON.stringify(entry).includes("leaseRenewalCommands")));
  assert.ok(invalidated.some((entry) => JSON.stringify(entry).includes("leaseRenewalEligibility")));
  assert.ok(invalidated.some((entry) => JSON.stringify(entry).includes("invoices")));
  assert.ok(!invalidated.some((entry) => JSON.stringify(entry).includes("propertyOwners")));
});

test("W07C eligibility banner surfaces H-60/H-30/H-14 as read-only reminder facts", async () => {
  const panel = await readFile(resolve(adminSrc, "components/leases/RenewalPanel.tsx"), "utf8");
  // Banner renders the query-derived eligibility; a payment alone never clears H-30.
  assert.match(panel, /RenewalEligibilityBanner/);
  assert.match(panel, /pembayaran tercatat, namun belum menutup H-30/);
  assert.match(panel, /H-60/);
  assert.match(panel, /H-30/);
  assert.match(panel, /H-14/);
  // It must be a read model only: no reminder delivery/record endpoint.
  assert.doesNotMatch(panel, /reminders\/(send|deliver|dispatch)/);
});

test("W07C panel explains advisory DP and never exposes a deposit collection endpoint", async () => {
  const panel = await readFile(resolve(adminSrc, "components/leases/RenewalPanel.tsx"), "utf8");
  assert.match(panel, /hanya prefill/);
  assert.match(panel, /tanpa minimum 25%/);
  assert.doesNotMatch(panel, /deposit\/collect/);
});
