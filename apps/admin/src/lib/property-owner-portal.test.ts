import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterOwnerAssets,
  formatOwnerMoney,
  groupOwnerAssets,
  getOwnerPortalViewState,
  ownerPortalNavigation,
  parseOwnerAssetDetail,
  parseOwnerOccupancyResidentDetail,
  parseOwnerPortal,
  parseOwnerResourcePage,
  parseOwnerFinance,
  parseOwnerReport,
} from "./property-owner-portal";

const source = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const portal = () => ({
  owner: { display_name: "Owner Demo" },
  scope: {
    state: "active",
    building_count: 1,
    room_count: 1,
    scheduled_count: 0,
    next_scheduled_date: null,
    expired_count: 0,
    latest_historical_period: null,
  },
  occupancy: { occupied_count: 1, reserved_count: 0, maintenance_count: 0, vacant_count: 0 },
  issues: { open_complaints: 0, open_maintenance: 0, unread_notifications: 0 },
  assets: [
    {
      room_code: "RK-01-01",
      room_status: "occupied",
      kost_type: "rukost",
      building_code: "RK-01",
      building_name: "Rumah Kost",
      lease_status: "active",
      lease_end_date: "2026-12-31",
    },
  ],
});

const assetDetail = () => ({
  room_code: "AK-05-03",
  room_status: "occupied",
  kost_type: "apartkost",
  building: {
    code: "AK-05",
    name: "Apart Kost Unit 05",
    floor_label: "Unit 05",
    unit_code: "05",
  },
  gender_policy: "female",
  commercial: { monthly_price: "1800000", annual_contract_value: "21600000" },
  lease: { status: "active", start_date: "2026-08-06", end_date: "2027-02-06" },
  resident: { display_name: "PUTRI", occupancy_start_date: "2026-08-06" },
  billing: { state: "partially_paid" },
  lifecycle: { transfer_state: null, renewal_state: "approved", checkout_state: null },
  ownership: {
    source: "room_assignment",
    effective_from: "2026-08-01",
    effective_until: null,
  },
  issues: { open_complaints: 1, open_maintenance: 0 },
  updated_at: "2026-08-06T03:00:00.000Z",
});

const occupancyResidentDetail = () => ({
  resident: { display_name: "PUTRI", occupancy_start_date: "2026-08-06" },
  room: {
    room_code: "AK-05-03",
    room_status: "occupied",
    kost_type: "apartkost",
    building_code: "AK-05",
    building_name: "Apart Kost Unit 05",
  },
  occupancy: { occupancy_status: "active", start_date: "2026-08-06" },
  lease: { status: "active", start_date: "2026-08-06", end_date: "2027-02-06" },
  billing: {
    state: "partially_paid",
    rent_invoiced: "1080000000",
    rent_verified: "270000000",
    rent_outstanding: "810000000",
    invoice_count: 6,
    overdue_count: 1,
    next_due_date: "2026-09-05",
    installment_paid: 1,
    installment_total: 6,
    installment_next_due_date: "2026-09-05",
    security_deposit_required: "180000000",
    deposit_collected: "30000000",
    deposit_deducted: "0",
    deposit_refunded: "0",
    deposit_balance: "30000000",
  },
  operations: {
    open_complaints: 1,
    open_maintenance: 0,
    transfer_state: null,
    renewal_state: "approved",
    checkout_state: null,
    active_vehicle_count: 0,
    assigned_parking_count: 0,
  },
});
const report = () => ({
  period: { period: "2026-08", start: "2026-08-01", end: "2026-08-31" },
  scope_checksum: "a".repeat(64),
  watermark: "Owner Demo | 2026-08",
  summary: {
    asset_count: 1,
    occupied_count: 1,
    active_lease_count: 1,
    gross_earned_rent: "2214000000",
    owner_entitlement: "2214000000",
    management_fee: "0",
    owner_adjustments: "-1",
    paid_out: "0",
  },
  scope: [
    {
      room_id: "room-1",
      room_code: "RK-01-01",
      scope_from: "2026-08-01",
      scope_until: "2026-09-01",
    },
  ],
  occupancies: [
    {
      occupancy_id: "occupancy-1",
      room_code: "RK-01-01",
      start_date: "2026-08-01",
      end_date: "2026-08-15",
      occupancy_status: "ended",
    },
  ],
  leases: [
    {
      lease_id: "lease-1",
      room_code: "RK-01-01",
      start_date: "2026-08-01",
      end_date: "2026-08-15",
      lease_status: "ended",
    },
  ],
  earnings: [
    {
      earning_id: "earning-1",
      room_code: "RK-01-01",
      earning_month: "2026-08-01",
      service_from: "2026-08-01",
      service_until: "2026-09-01",
      earning_status: "recognized",
      gross_earned_rent: "2214000000",
      owner_entitlement: "2000000000",
      management_fee: "214000000",
    },
  ],
  adjustments: [],
  settlements: [],
  payouts: [],
  complaints: [],
  maintenance: [],
  notifications: [],
});

const finance = () => ({
  period: { period: "2026-08", start: "2026-08-01", end: "2026-08-31" },
  scope_checksum: "a".repeat(64),
  summary: {
    gross_earned_rent: "2214000000",
    owner_entitlement: "2000000000",
    management_fee: "214000000",
    owner_adjustments: "-1000",
    adjusted_owner_entitlement: "1999999000",
    paid_out: "1999999000",
    settlement_state: "reconciled",
    settlement_counts: { draft: 0, ready_for_review: 0, approved: 0, paid: 1, void: 0 },
  },
  earnings: [
    {
      room_code: "RK-01-01",
      earning_month: "2026-08-01",
      service_from: "2026-08-01",
      service_until: "2026-09-01",
      earning_status: "recognized",
      gross_earned_rent: "2214000000",
      owner_entitlement: "2000000000",
      management_fee: "214000000",
    },
  ],
  adjustments: [
    {
      effective_month: "2026-08-01",
      adjustment_kind: "transfer_proration",
      gross_amount_delta: "-1000",
      owner_amount_delta: "-1000",
      operator_fee_amount_delta: "0",
    },
  ],
  settlements: [
    {
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      settlement_status: "paid",
      gross_amount: "2213999000",
      owner_amount: "1999999000",
      operator_fee_amount: "214000000",
    },
  ],
  payouts: [
    { recorded_at: "2026-08-31T03:00:00.000Z", payout_kind: "payout", payout_amount: "1999999000" },
  ],
});

void test("owner portal navigation is an exact read-only allowlist", () => {
  assert.deepEqual(
    ownerPortalNavigation.map((item) => item.id),
    [
      "dashboard",
      "assets",
      "occupancy",
      "finance",
      "issues",
      "reports",
      "notifications",
      "account",
    ],
  );
  assert.equal(
    ownerPortalNavigation.some((item) =>
      /tambah|ubah|hapus|setujui|^bayar$|verifikasi/i.test(item.label),
    ),
    false,
  );
});

void test("owner asset filters and groups only authoritative Rumah and Apart rooms", () => {
  const parsed = parseOwnerPortal({
    ...portal(),
    assets: [
      portal().assets[0],
      {
        ...portal().assets[0],
        room_code: "AK-05-03",
        kost_type: "apartkost",
        building_code: "AK-05",
        building_name: "Apart Kost Unit 05",
        room_status: "vacant",
      },
    ],
  });
  const grouped = groupOwnerAssets(parsed.assets);

  assert.deepEqual(
    grouped.map((group) => group.kostType),
    ["rukost", "apartkost"],
  );
  assert.deepEqual(
    filterOwnerAssets(parsed.assets, { query: "ak-05", roomStatus: "all", leaseStatus: "all" }).map(
      (asset) => asset.roomCode,
    ),
    ["AK-05-03"],
  );
});

void test("owner asset detail parser accepts safe detail and rejects tenant PII", () => {
  assert.equal(parseOwnerAssetDetail(assetDetail()).roomCode, "AK-05-03");
  const unsafe = assetDetail() as ReturnType<typeof assetDetail> & {
    resident: Record<string, unknown>;
  };
  unsafe.resident.nik = "3174";
  assert.throws(() => parseOwnerAssetDetail(unsafe));
});

void test("owner occupancy resident detail stays room-scoped and rejects tenant PII", () => {
  const parsed = parseOwnerOccupancyResidentDetail(occupancyResidentDetail());
  assert.equal(parsed.resident?.displayName, "PUTRI");
  assert.equal(parsed.room.roomCode, "AK-05-03");
  assert.equal(parsed.billing.state, "partially_paid");
  assert.equal(parsed.billing.rentOutstanding, "810000000");
  assert.equal(parsed.billing.installmentPaid, 1);
  assert.equal(parsed.billing.depositBalance, "30000000");

  const unsafe = occupancyResidentDetail() as ReturnType<typeof occupancyResidentDetail> & {
    resident: Record<string, unknown>;
  };
  unsafe.resident.email = "putri@example.test";
  assert.throws(() => parseOwnerOccupancyResidentDetail(unsafe));
});

void test("owner portal has an Admin-aligned read-only application shell", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");
  const ownerShell = source("components/property-owner-portal/OwnerPortalShell.tsx");
  const appShell = source("components/layout/app-shell.tsx");

  assert.match(ownerShell, /bg-sidebar/);
  assert.match(appShell, /backdrop-blur/);
  assert.match(ownerShell, /aria-current/);
  assert.match(ownerShell, /Akses hanya baca/);
  assert.match(portalComponent, /OwnerPortalBoundary/);
  assert.match(portalComponent, /initialPeriod=\{initialPeriod\}/);
  assert.match(portalComponent, /<Input/);
  assert.match(portalComponent, /<Select/);
  assert.match(portalComponent, /<MonthYearPicker/);
  assert.match(portalComponent, /function OperationalFilters/);
  assert.match(portalComponent, /<HeroUiDatePicker/);
  assert.match(portalComponent, /function OperationalResult/);
  assert.match(portalComponent, /roomCode/);
  assert.match(portalComponent, /priority/);
  assert.match(portalComponent, /fromDate/);
  assert.match(portalComponent, /to="\/property-owners\/portal\/assets\/\$roomCode"/);
  assert.doesNotMatch(portalComponent, /to="\/(?:complaints|maintenance|notifications)\//);
  assert.match(portalComponent, /Reset filter/);
  assert.match(portalComponent, /variant="outline"/);
  assert.doesNotMatch(
    portalComponent,
    /useMutation|propertyOwnerApi\.(?:create|update|archive|assign|release)/,
  );
});

void test("M8 Owner collection view exposes the canonical checkpoint projection read-only", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");
  const assetDetail = source("components/property-owner-portal/PropertyOwnerAssetDetailPage.tsx");

  for (const label of ["Minimum checkpoint", "Kredit checkpoint", "Kekurangan checkpoint"]) {
    assert.match(portalComponent, new RegExp(label));
    assert.match(assetDetail, new RegExp(label));
  }
  assert.match(portalComponent, /item\.settlement\.checkpoint\.dueAt/);
  assert.match(assetDetail, /collectionItem\.settlement\.checkpoint\.dueAt/);
  assert.doesNotMatch(
    `${portalComponent}\n${assetDetail}`,
    /useMutation|payment_proof|storage_path|bank_account/i,
  );
});

void test("owner occupancy detail route renders through its parent outlet", () => {
  const occupancyLayout = source("routes/property-owners/portal/occupancy/route.tsx");
  const occupancyIndex = source("routes/property-owners/portal/occupancy/index.tsx");
  const residentDetailRoute = source("routes/property-owners/portal/occupancy/$roomCode.tsx");

  assert.match(occupancyLayout, /Outlet/);
  assert.match(occupancyLayout, /createFileRoute\("\/property-owners\/portal\/occupancy"\)/);
  assert.match(occupancyIndex, /PropertyOwnerPortal view="occupancy"/);
  assert.match(residentDetailRoute, /PropertyOwnerResidentDetailPage/);
});

void test("E5 dashboard KPIs and alerts link to authoritative Owner destinations", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /function Dashboard/);
  assert.match(portalComponent, /href="\/property-owners\/portal\/assets"/);
  assert.match(portalComponent, /href="\/property-owners\/portal\/occupancy"/);
  assert.match(portalComponent, /href="\/property-owners\/portal\/issues"/);
  assert.match(portalComponent, /to="\/property-owners\/portal\/notifications"/);
  assert.match(portalComponent, /Tidak ada perhatian baru/);
  assert.match(portalComponent, /ownerPortalNavigation/);
  assert.match(portalComponent, /Ringkasan ini berasal dari data operasional/);
  assert.doesNotMatch(portalComponent, /useState\([^)]*openComplaints/);
});

void test("E5 dashboard finance snapshot is report-only and comes from the owner projection", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /function DashboardFinanceSnapshot/);
  assert.match(portalComponent, /\["property-owner", "dashboard-finance", ownerId, period\]/);
  assert.match(portalComponent, /propertyOwnerPortalApi\.finance\(period\)/);
  assert.match(portalComponent, /formatOwnerMoney\(finance\.data\.summary\.grossEarnedRent\)/);
  assert.match(
    portalComponent,
    /formatOwnerMoney\(finance\.data\.summary\.adjustedOwnerEntitlement\)/,
  );
  assert.match(portalComponent, /to="\/property-owners\/portal\/finance"/);
  assert.match(portalComponent, /Ringkasan keuangan belum tersedia/);
  assert.doesNotMatch(
    portalComponent,
    /propertyOwnerPortalApi\.(?:create|update|archive|assign|release)/,
  );
});

void test("E5 account page exposes safe identity, read-only scope, and Owner navigation", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /function Account\(\{ portal, accountEmail \}/);
  assert.match(portalComponent, /Property Owner/);
  assert.match(portalComponent, /Akses hanya baca/);
  assert.match(portalComponent, /Cakupan kepemilikan/);
  assert.match(portalComponent, /Bantuan dan keamanan/);
  assert.match(portalComponent, /penugasan aset dikelola oleh administrator Kostation/);
  assert.doesNotMatch(portalComponent, /password|payment_proof|storage_path|NIK|KTP/i);
});

void test("E6 keeps the read-only account route available without an active assignment", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /view !== "account"/);
  assert.match(portalComponent, /portal\.data\.owner === null && view !== "account"/);
  assert.match(portalComponent, /portal\.data\.owner\?\.displayName \?\? "Property Owner"/);
  assert.match(portalComponent, /Profil owner belum tersedia/);
});

void test("E6 uses a non-destructive reset control for finance filters", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  const financeStart = portalComponent.indexOf("function Finance(");
  const financeEnd = portalComponent.indexOf("function OperationalFilters(");
  assert.ok(financeStart >= 0 && financeEnd > financeStart);
  const finance = portalComponent.slice(financeStart, financeEnd);
  assert.match(finance, /variant="outline" onClick=\{resetFilters\}/);
  assert.doesNotMatch(finance, /variant="destructive" onClick=\{resetFilters\}/);
});

void test("E2 resource parser accepts safe occupancy facts and rejects resident PII", () => {
  const resource = {
    room_code: "AK-05-03",
    room_status: "occupied",
    kost_type: "apartkost",
    building_code: "AK-05",
    building_name: "Apart Kost Unit 05",
    gender_policy: "female",
    ownership: { source: "room_assignment", effective_from: "2026-08-01", effective_until: null },
    occupancy_status: "active",
    occupancy_start_date: "2026-08-06",
    lease: { status: "active", start_date: "2026-08-06", end_date: "2027-02-06" },
    resident: { display_name: "PUTRI" },
    billing_state: "partially_paid",
    ending_soon: false,
    transfer_state: null,
    renewal_state: "approved",
    checkout_state: null,
    open_complaints: 0,
    open_maintenance: 0,
    updated_at: "2026-08-06T03:00:00.000Z",
  };
  const parsed = parseOwnerResourcePage({ items: [resource], total: 1, offset: 0, limit: 20 });
  assert.equal(parsed.items[0]?.resident?.displayName, "PUTRI");
  assert.equal(parsed.items[0]?.billingState, "partially_paid");
  assert.throws(() =>
    parseOwnerResourcePage({
      items: [{ ...resource, resident: { display_name: "PUTRI", phone: "0812" } }],
      total: 1,
      offset: 0,
      limit: 20,
    }),
  );
});

void test("owner portal exposes the shared authenticated account menu, including logout", () => {
  const appShell = source("components/layout/app-shell.tsx");

  assert.match(appShell, /import \{ UserMenu \} from "\.\/user-menu"/);
  assert.match(appShell, /<UserMenu\s*\/>/);
});

void test("strict portal parser rejects unknown fields, unsafe statuses, dates, and counts", () => {
  assert.equal(parseOwnerPortal(portal()).assets[0]?.roomCode, "RK-01-01");
  type UnsafePortal = ReturnType<typeof portal> & {
    assets: Array<Record<string, unknown>>;
    scope: Record<string, unknown>;
  };
  for (const mutate of [
    (value: UnsafePortal) => {
      value.assets[0].nik = "123";
    },
    (value: UnsafePortal) => {
      value.assets[0].room_status = "anything";
    },
    (value: UnsafePortal) => {
      value.scope.room_count = -1;
    },
    (value: UnsafePortal) => {
      value.scope.room_count = 1.5;
    },
    (value: UnsafePortal) => {
      value.assets[0].lease_end_date = "tomorrow";
    },
  ]) {
    const value = portal() as UnsafePortal;
    mutate(value);
    assert.throws(() => parseOwnerPortal(value));
  }
});
void test("strict report parser preserves money above int4 and rejects overfetched data", () => {
  const parsed = parseOwnerReport(report());
  assert.equal(parsed.summary.ownerEntitlement, "2214000000");
  assert.equal(parsed.leases[0]?.leaseStatus, "ended");
  assert.equal(parsed.occupancies[0]?.occupancyStatus, "ended");
  assert.equal(parsed.occupancies[0]?.startDate, "2026-08-01");
  assert.equal(parsed.occupancies[0]?.endDate, "2026-08-15");
  assert.equal(parsed.leases[0]?.startDate, "2026-08-01");
  assert.equal(parsed.leases[0]?.endDate, "2026-08-15");
  assert.equal(parsed.earnings[0]?.serviceUntil, "2026-09-01");
  assert.match(formatOwnerMoney(parsed.summary.ownerEntitlement), /2\.214\.000\.000/);
  const value = report() as ReturnType<typeof report> & { summary: Record<string, unknown> };
  value.summary.payout_destination = "secret";
  assert.throws(() => parseOwnerReport(value));
  const signedZero = report() as ReturnType<typeof report> & { summary: Record<string, unknown> };
  signedZero.summary.owner_adjustments = "-0";
  assert.throws(() => parseOwnerReport(signedZero));
  const unboundedLifecycle = report() as ReturnType<typeof report> & {
    occupancies: Array<Record<string, unknown>>;
  };
  unboundedLifecycle.occupancies[0].original_start_date = "2026-07-01";
  assert.throws(() => parseOwnerReport(unboundedLifecycle));
});
void test("view states keep former owners historical instead of empty", () => {
  const active = parseOwnerPortal(portal());
  const historical = {
    ...active,
    scope: {
      ...active.scope,
      state: "historical" as const,
      roomCount: 0,
      expiredCount: 1,
      latestHistoricalPeriod: "2026-07",
    },
  };
  const scheduled = {
    ...active,
    scope: {
      ...active.scope,
      state: "scheduled" as const,
      roomCount: 0,
      scheduledCount: 1,
      nextScheduledDate: "2026-09-01",
    },
  };
  assert.equal(getOwnerPortalViewState(active, true, false), "loading");
  assert.equal(getOwnerPortalViewState(active, false, true), "error");
  assert.equal(getOwnerPortalViewState({ ...active, owner: null }, false, false), "empty");
  assert.equal(getOwnerPortalViewState(scheduled, false, false), "scheduled");
  assert.equal(getOwnerPortalViewState(historical, false, false), "historical");
});

void test("E3 finance parser accepts only the owner-safe financial projection", () => {
  const parsed = parseOwnerFinance(finance());
  assert.equal(parsed.summary.settlementState, "reconciled");
  assert.equal(parsed.summary.adjustedOwnerEntitlement, "1999999000");
  assert.equal(parsed.earnings[0]?.roomCode, "RK-01-01");

  const unsafe = finance() as ReturnType<typeof finance> & {
    earnings: Array<Record<string, unknown>>;
  };
  unsafe.earnings[0].earning_id = "internal-earning";
  assert.throws(() => parseOwnerFinance(unsafe));
});
