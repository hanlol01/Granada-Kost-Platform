import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeLeaseDetailResponse,
  sanitizeTransferResult,
  toCreateLeaseBody,
} from "./admin-ux-lease-api";
import {
  canRunNonFinancialTransfer,
  isFinancialLeaseActor,
  jakartaToday,
  normalizeLeaseDetailSearch,
  normalizeLeaseListSearch,
  leaseListFilterChange,
} from "./admin-ux-lease-helpers";
import { mapSnakeToCamel } from "./admin-ux-mapper";
import { invalidationKeysFor } from "./admin-ux-query-keys";

test("M6 search parsers bound pagination and keep transfer panels explicit", () => {
  assert.deepEqual(
    normalizeLeaseListSearch({
      q: "  LSE-001 ",
      status: "active",
      overdue: "true",
      resident_id: "not-a-uuid",
      offset: -4,
      limit: 1000,
    }),
    {
      q: "LSE-001",
      status: "active",
      overdue: true,
      residentId: undefined,
      roomId: undefined,
      kostTypeId: undefined,
      offset: 0,
      limit: 100,
    },
  );
  assert.deepEqual(normalizeLeaseDetailSearch({ panel: "transfer", tab: "deposit" }), {
    panel: "transfer",
    tab: "deposit",
  });
  assert.deepEqual(normalizeLeaseDetailSearch({ panel: "unknown", tab: "unknown" }), {
    panel: "detail",
    tab: "ringkasan",
  });
});

test("M6 create payload is inventory/resident safe and omits KTP fields", () => {
  const body = toCreateLeaseBody({
    propertyId: "property-a",
    roomId: "room-a",
    resident: { fullName: "Penghuni Baru" },
    startDate: "2026-08-10",
    billingCycle: "monthly",
    notes: "  catatan internal  ",
  });
  assert.deepEqual(body, {
    property_id: "property-a",
    room_id: "room-a",
    resident_id: undefined,
    resident: { full_name: "Penghuni Baru" },
    start_date: "2026-08-10",
    billing_cycle: "monthly",
    billing_anchor_day: undefined,
    notes: "catatan internal",
  });
  assert.equal(JSON.stringify(body).includes("ktp"), false);
  assert.equal(JSON.stringify(body).includes("nik"), false);
});

test("M6 financial controls deny admin and preserve Jakarta business dates", () => {
  assert.equal(
    isFinancialLeaseActor({ roles: ["admin"], permissions: ["lease.manage", "billing.manage"] }),
    false,
  );
  assert.equal(
    isFinancialLeaseActor({ roles: ["manager"], permissions: ["lease.manage", "billing.manage"] }),
    true,
  );
  assert.equal(
    canRunNonFinancialTransfer({
      permissions: ["lease.manage"],
      leaseStatus: "active",
      transferFlagEnabled: false,
    }),
    false,
  );
  assert.equal(jakartaToday(new Date("2026-08-09T18:00:00.000Z")), "2026-08-10");
});

test("M6 mapper and lifecycle invalidation protect sensitive cache and detail refresh", () => {
  const mapped = mapSnakeToCamel<{ id: string; ktpNumberMasked?: string; storagePath?: string }>({
    id: "lease-a",
    ktp_number_masked: "1234********5678",
    storage_path: "/private/identity.pdf",
  });
  assert.deepEqual(mapped, { id: "lease-a" });

  const invalidations = invalidationKeysFor("lease-transfer", "property-a").map((key) =>
    JSON.stringify(key),
  );
  assert.equal(invalidations.includes(JSON.stringify(["lease", "property-a"])), true);
  assert.equal(invalidations.includes(JSON.stringify(["leaseBillingSummary", "property-a"])), true);
});

test("M6 lease route remains guarded when the rollout flag or read capability is absent", async () => {
  const { adminRouteRegistry, getRouteAccessDecision } = await import("./admin-route-registry");
  const leases = adminRouteRegistry.find((route) => route.id === "leases");
  assert.ok(leases);
  assert.equal(
    getRouteAccessDecision(leases, {
      roles: ["admin"],
      permissions: ["lease.read", "lease.manage"],
      isFeatureEnabled: () => false,
    }),
    "feature-disabled",
  );
  assert.equal(
    getRouteAccessDecision(leases, {
      roles: ["admin"],
      permissions: [],
      isFeatureEnabled: () => true,
    }),
    "forbidden",
  );
});

test("M6 detail cache narrows free-form and identity-adjacent response fields", () => {
  const detail = sanitizeLeaseDetailResponse({
    lease: {
      id: "lease-a",
      propertyId: "property-a",
      leaseCode: "LSE-001",
      leaseStatus: "active",
      startDate: "2026-08-10",
      endDate: null,
      billingCycle: "monthly",
      billingAnchorDay: 10,
      nextBillingDate: "2026-09-10",
      resident: {
        id: "resident-a",
        fullNameMasked: "P***i",
        hasKtpDocument: true,
        hasProfilePhoto: true,
      },
      room: { id: "room-a", number: "A-01" },
      kostType: { id: "type-a", name: "Standard" },
      lastInvoice: null,
      outstandingAmount: 0,
      notes: "NIK 1234567890123456",
      snapshot: {
        monthlyPrice: 1_000_000,
        yearlyPrice: 12_000_000,
        depositAmount: 500_000,
        roomNumber: "A-01",
        kostTypeName: "Standard",
      },
    },
    depositSummary: {
      requiredAmount: 500_000,
      collectedAmount: 500_000,
      deductionAmount: 0,
      refundedAmount: 0,
      balanceAmount: 500_000,
    },
    depositLedger: [
      {
        id: "ledger-a",
        transactionType: "collection",
        direction: "credit",
        amount: 500_000,
        reasonType: "deposit",
        reason: "KTP 1234567890123456",
        settlementStatus: "settled",
        createdAt: "2026-08-10T00:00:00.000Z",
      },
    ],
    invoices: [],
    history: [
      {
        id: "history-a",
        eventType: "lease_created",
        eventDate: "2026-08-10",
        metadata: { storage_path: "/private/identity.pdf" },
        createdAt: "2026-08-10T00:00:00.000Z",
      },
    ],
    kostTypeFacilities: [],
    transferLinks: [{ id: "transfer-a", direction: "out" }],
  } as never);

  assert.equal("notes" in detail.lease, false);
  assert.equal("hasKtpDocument" in detail.lease.resident, false);
  assert.equal(detail.depositLedger[0].reason, null);
  assert.equal("metadata" in detail.history[0], false);
  assert.equal("transferLinks" in detail, false);
});

test("M6 transfer result retains only safe server decision fields", () => {
  const transferLease = {
    id: "lease-a",
    propertyId: "property-a",
    leaseCode: "LSE-001",
    leaseStatus: "active",
    startDate: "2026-08-10",
    endDate: null,
    billingCycle: "monthly",
    billingAnchorDay: 10,
    nextBillingDate: "2026-09-10",
    room: { id: "room-a", number: "A-01" },
    kostType: { id: "type-a", name: "Standard" },
    snapshot: { monthlyPrice: 1_000_000, yearlyPrice: 12_000_000, depositAmount: 500_000 },
  };
  const result = sanitizeTransferResult({
    sourceLease: transferLease,
    targetLease: { ...transferLease, id: "lease-b", leaseCode: "LSE-002" },
    transferRecord: {
      id: "transfer-a",
      effectiveDate: "2026-08-10",
      fromRoomId: "room-a",
      toRoomId: "room-b",
      carriedDepositAmount: 500_000,
      requiredTargetDepositAmount: 500_000,
      topUpAmount: 0,
    },
    deposit: {
      requiredAmount: 500_000,
      collectedAmount: 500_000,
      deductionAmount: 0,
      refundedAmount: 0,
      balanceAmount: 500_000,
    },
    targetInvoice: {
      id: "invoice-a",
      invoiceCode: "INV-LSE-002-20260810",
      dueDate: "2026-08-25",
      totalAmount: 1_000_000,
    },
    oldOutstandingAmount: 0,
    topUpPayment: { id: "payment-a", paymentCode: "TRF-001", paymentStatus: "verified" },
  } as never);

  assert.equal("topUpPayment" in result, false);
  assert.deepEqual(result.targetInvoice, {
    id: "invoice-a",
    invoiceCode: "INV-LSE-002-20260810",
    dueDate: "2026-08-25",
    totalAmount: 1_000_000,
  });
});
test("M6 lease selectors use safe property-scoped options and reset pagination", async () => {
  assert.deepEqual(leaseListFilterChange({ residentId: "resident-a" }), {
    residentId: "resident-a",
    overdue: false,
    offset: 0,
  });
  assert.deepEqual(leaseListFilterChange({ roomId: "room-a" }), {
    roomId: "room-a",
    overdue: false,
    offset: 0,
  });
  assert.deepEqual(leaseListFilterChange({ roomId: undefined }), {
    roomId: undefined,
    overdue: false,
    offset: 0,
  });
  assert.deepEqual(leaseListFilterChange({ kostTypeId: "kost-type-a" }), {
    kostTypeId: "kost-type-a",
    overdue: false,
    offset: 0,
  });
  assert.deepEqual(leaseListFilterChange({ kostTypeId: undefined }), {
    kostTypeId: undefined,
    overdue: false,
    offset: 0,
  });

  const source = await readFile(
    new URL("../components/leases/LeaseListPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useM6LeaseResidentOptions/);
  assert.match(
    source,
    /useM4RoomInventory\(\{\s*limit: 100,\s*offset: 0,\s*includeActiveLease: false,?\s*\}\)/s,
  );
  assert.match(source, /useM4KostTypes\(\{ limit: 100, offset: 0, status: "active" \}\)/);
  assert.match(source, /roomOptions\.data\?\.items \?\? \[\]/);
  assert.match(source, /kostTypeOptions\.data\?\.items \?\? \[\]/);
  assert.match(source, /roomId: value === "all" \? undefined : value/);
  assert.match(source, /kostTypeId: value === "all" \? undefined : value/);
  assert.match(source, /displayNameMasked/);
  assert.doesNotMatch(source, /LeaseIdFilter|placeholder="UUID"/);
  assert.doesNotMatch(source, /useResidents|\/residents/);
});

test("M6 C1 lease detail route guards UUIDs and preserves partial search", async () => {
  const source = await readFile(
    new URL("../routes/penyewaan/$leaseId.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /isLeaseUuid\(params\.leaseId\)/);
  assert.match(source, /normalizeLeaseDetailSearch\(raw\)/);
  assert.match(source, /search: \(current\) => \(\{ \.\.\.current, \.\.\.next \}\)/);
  assert.match(source, /search: \{ panel: "detail", tab: "ringkasan" \}/);
  assert.match(source, /LeaseDetailPage/);
  assert.doesNotMatch(source, /RouteFoundationPage/);
});

test("M6 C2 create selector keeps resident IDs scoped and labels masked", async () => {
  const source = await readFile(
    new URL("../components/leases/LeaseCreatePage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /useM6LeaseResidentOptions\(\)/);
  assert.match(source, /useProperty\(\)/);
  assert.match(source, /\[currentPropertyId\]/);
  assert.match(source, /setResidentId\(""\)/);
  assert.match(source, /value=\{resident\.id\}/);
  assert.match(source, /resident\.displayNameMasked/);
  assert.match(source, /selectedResident\?\.displayNameMasked/);
  assert.doesNotMatch(source, /placeholder="UUID penghuni"/);
  assert.doesNotMatch(source, /existing-resident-id/);
  assert.doesNotMatch(source, /\/residents/);
});
