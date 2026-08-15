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
  parseOwnerPortal,
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
  ownership: {
    source: "room_assignment",
    effective_from: "2026-08-01",
    effective_until: null,
  },
  issues: { open_complaints: 1, open_maintenance: 0 },
  updated_at: "2026-08-06T03:00:00.000Z",
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

void test("owner portal navigation is an exact read-only allowlist", () => {
  assert.deepEqual(
    ownerPortalNavigation.map((item) => item.id),
    ["dashboard", "assets", "finance", "reports", "issues", "notifications", "account"],
  );
  assert.equal(
    ownerPortalNavigation.some((item) =>
      /tambah|ubah|hapus|setujui|bayar|verifikasi/i.test(item.label),
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

void test("owner portal has an Admin-aligned read-only application shell", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /bg-sidebar/);
  assert.match(portalComponent, /backdrop-blur/);
  assert.match(portalComponent, /aria-current/);
  assert.match(portalComponent, /Akses hanya baca/);
  assert.match(portalComponent, /OwnerPortalBoundary/);
  assert.match(
    portalComponent,
    /initialPeriod=\{historical \? portal\.data\.scope\.latestHistoricalPeriod : null\}/,
  );
  assert.doesNotMatch(
    portalComponent,
    /useMutation|propertyOwnerApi\.(?:create|update|archive|assign|release)/,
  );
});

void test("owner portal exposes the shared authenticated account menu, including logout", () => {
  const portalComponent = source("components/property-owner-portal/PropertyOwnerPortal.tsx");

  assert.match(portalComponent, /import \{ UserMenu \} from "@\/components\/layout\/user-menu"/);
  assert.match(portalComponent, /<UserMenu\s*\/>/);
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
