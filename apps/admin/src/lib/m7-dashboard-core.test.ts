import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadDashboard,
  isBookingHoldWriteEnabledForProperty,
  isDashboardEnabledForProperty,
  parseDashboardRollouts,
  parseDashboardSummary,
} from "./admin-ux-dashboard";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";

function rawSummary() {
  return {
    active_leases: 2,
    active_residents: 3,
    rooms_total: 5,
    rooms_vacant: 2,
    rooms_occupied: 3,
    rooms_maintenance: 0,
    outstanding_amount: "9007199254740993",
    overdue_invoice_count: 1,
    recent_leases: [
      {
        id: "lease-a",
        lease_code: "LS-001",
        lease_status: "active",
        start_date: "2026-07-01",
        created_at: "2026-07-14T00:00:00.000Z",
        room: { number: "A-01", id: "forbidden-room-id" },
        resident_name: "Forbidden Resident",
      },
    ],
    recent_payments: [
      {
        id: "payment-a",
        payment_code: "PAY-001",
        payment_status: "verified",
        payment_method: "bank_transfer",
        amount: "1250000",
        paid_at: "2026-07-14T00:00:00.000Z",
        verified_at: "2026-07-14T00:05:00.000Z",
        created_at: "2026-07-14T00:00:00.000Z",
        reference_number: "forbidden-reference",
      },
    ],
    timezone: "Asia/Jakarta",
    generated_at: "2026-07-14T00:00:00.000Z",
    period_start: "2026-06-30T17:00:00.000Z",
    period_end: "2026-07-31T17:00:00.000Z",
    verified_revenue_current_month: "forbidden-deferred-field",
    urgent_maintenance_count: 99,
  };
}

test("M7-D2B Dashboard access uses the existing three-permission capability", () => {
  assert.equal(
    canReadDashboard({
      roles: ["owner"],
      permissions: ["room.read", "lease.read", "billing.read"],
    }),
    true,
  );
  assert.equal(
    canReadDashboard({ roles: ["manager"], permissions: ["room.read", "lease.read"] }),
    false,
  );
  assert.equal(
    canReadDashboard({
      roles: ["technician"],
      permissions: ["room.read", "lease.read", "billing.read"],
    }),
    false,
  );
});

test("M7-D2B rollout parser fails closed for missing, malformed, mismatched, and duplicate flags", () => {
  const enabled = [
    {
      propertyId: PROPERTY_ID,
      adminUxRead: { enabled: true },
      bookingHoldWrite: { enabled: true },
    },
  ];
  assert.equal(isDashboardEnabledForProperty(enabled, PROPERTY_ID), true);
  assert.equal(isBookingHoldWriteEnabledForProperty(enabled, PROPERTY_ID), true);
  assert.equal(isDashboardEnabledForProperty(undefined, PROPERTY_ID), false);
  assert.equal(isDashboardEnabledForProperty({}, PROPERTY_ID), false);
  assert.equal(
    isDashboardEnabledForProperty(
      [{ propertyId: PROPERTY_ID, adminUxRead: { enabled: "true" } }],
      PROPERTY_ID,
    ),
    false,
  );
  assert.equal(
    isDashboardEnabledForProperty(
      [{ propertyId: "22222222-2222-4222-8222-222222222222", adminUxRead: { enabled: true } }],
      PROPERTY_ID,
    ),
    false,
  );
  assert.equal(isDashboardEnabledForProperty([...enabled, ...enabled], PROPERTY_ID), false);
  assert.equal(isBookingHoldWriteEnabledForProperty([...enabled, ...enabled], PROPERTY_ID), false);
  assert.deepEqual(parseDashboardRollouts([...enabled, ...enabled]), []);
  for (const bookingHoldWrite of [undefined, null, {}, { enabled: "true" }, { enabled: 1 }]) {
    const parsed = parseDashboardRollouts([
      { propertyId: PROPERTY_ID, adminUxRead: { enabled: true }, bookingHoldWrite },
    ]);
    assert.deepEqual(parsed, [
      {
        propertyId: PROPERTY_ID,
        adminUxRead: { enabled: true },
        bookingHoldWrite: { enabled: false },
      },
    ]);
    assert.equal(isBookingHoldWriteEnabledForProperty(parsed, PROPERTY_ID), false);
  }
});

test("M7-D2B parser keeps the canonical whitelist and decimal money as strings", () => {
  const summary = parseDashboardSummary(rawSummary());
  assert.equal(summary.outstandingAmount, "9007199254740993");
  assert.equal(summary.recentPayments[0]?.amount, "1250000");
  assert.deepEqual(Object.keys(summary).sort(), [
    "activeLeases",
    "activeResidents",
    "generatedAt",
    "outstandingAmount",
    "overdueInvoiceCount",
    "periodEnd",
    "periodStart",
    "recentLeases",
    "recentPayments",
    "roomsMaintenance",
    "roomsOccupied",
    "roomsTotal",
    "roomsVacant",
    "timezone",
  ]);
  const serialized = JSON.stringify(summary);
  for (const forbidden of [
    "Forbidden Resident",
    "forbidden-room-id",
    "forbidden-reference",
    "forbidden-deferred-field",
    "verified_revenue_current_month",
    "urgent_maintenance_count",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("M7-D2B hook always mounts one canonical query and gates requests with enabled", async () => {
  const source = await readFile(
    new URL("../hooks/useDashboardSummary.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /useQuery<DashboardSummary>\(\{/);
  assert.match(source, /apiClient\.get<unknown>\("\/dashboard\/summary"/);
  assert.match(source, /query: \{ property_id: propertyId \}/);
  assert.match(source, /enabled,/);
  assert.match(source, /signal,/);
  assert.match(source, /if \(enabled && !forbidden\) return/);
  assert.match(source, /cancelQueries\(\{ queryKey, exact: true \}\)/);
  assert.match(source, /removeQueries\(\{ queryKey, exact: true \}\)/);
  assert.doesNotMatch(
    source,
    /useReports|reports|localStorage|sessionStorage|setInterval|refetchInterval/,
  );
});

test("M7-D2B disabled or malformed flags cannot request Dashboard or expose legacy cache/snapshot", async () => {
  const hookSource = await readFile(
    new URL("../hooks/useDashboardSummary.ts", import.meta.url),
    "utf8",
  );
  const dashboardSource = await readFile(new URL("../routes/index.tsx", import.meta.url), "utf8");

  assert.match(
    hookSource,
    /const enabled = Boolean\(currentPropertyId\) && hasAccess && rolloutEnabled/,
  );
  assert.match(hookSource, /summary: enabled && !query\.error \? \(query\.data \?\? null\) : null/);
  assert.match(dashboardSource, /if \(!rolloutEnabled\) return <FeatureDisabledState \/>/);
  assert.doesNotMatch(
    hookSource,
    /initialData|placeholderData|keepPreviousData|persist|snapshot|legacy/,
  );
  assert.doesNotMatch(dashboardSource, /useReports|formatIDR\(|to="\/reports"/);
});

test("M7-D2B route capability matches the backend Dashboard permission boundary", async () => {
  const source = await readFile(new URL("./admin-route-registry.ts", import.meta.url), "utf8");
  const dashboardEntry = source.slice(
    source.indexOf('id: "dashboard"'),
    source.indexOf('id: "rooms"'),
  );

  assert.match(dashboardEntry, /roles: OWNER_MANAGER_ADMIN/);
  assert.match(
    dashboardEntry,
    /readCapabilities: \["room\.read", "lease\.read", "billing\.read"\]/,
  );
});
