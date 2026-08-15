import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeRoomSearch } from "./admin-ux-master-helpers";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

const ADMIN_SRC = fileURLToPath(new URL("../", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(ADMIN_SRC, relativePath), "utf8");
}

function section(candidate: string, start: string, end: string): string {
  const startIndex = candidate.indexOf(start);
  const endIndex = candidate.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return candidate.slice(startIndex, endIndex);
}

function selectFor(candidate: string, anchor: string): string {
  const startIndex = candidate.indexOf(anchor);
  const endIndex = candidate.indexOf("</Select>", startIndex);
  assert.ok(startIndex >= 0, `Missing select anchor: ${anchor}`);
  assert.ok(endIndex > startIndex, `Missing select end: ${anchor}`);
  return candidate.slice(startIndex, endIndex);
}

test("room search normalization carries the complete canonical discovery contract", () => {
  assert.deepEqual(
    normalizeRoomSearch({
      q: "  RK-01  ",
      category: "rukost",
      building_id: "building",
      floor_code: "A",
      status: "vacant",
      gender_policy: "male",
      active_occupancy: "false",
      reconciliation_state: "normal",
      sort: "active_resident",
      order: "desc",
      offset: "20",
      limit: "20",
    }),
    {
      q: "RK-01",
      category: "rukost",
      buildingId: "building",
      floor: undefined,
      floorCode: "A",
      status: "vacant",
      visibility: undefined,
      genderPolicy: "male",
      activeOccupancy: false,
      reconciliationState: "normal",
      sort: "active_resident",
      order: "desc",
      offset: 20,
      limit: 20,
    },
  );
  assert.equal(normalizeRoomSearch({ active_occupancy: "1" }).activeOccupancy, undefined);
});

test("room list cache remains property-scoped and includes every server-side filter", () => {
  const key = adminUxQueryKeys.rooms.list("property-a", {
    q: "RK",
    category: "rukost",
    buildingId: "building",
    floorCode: "A",
    status: "vacant",
    genderPolicy: "male",
    activeOccupancy: false,
    reconciliationState: "normal",
    sort: "building",
    order: "desc",
    limit: 20,
    offset: 40,
  });
  assert.equal(key[1], "property-a");
  assert.deepEqual(key[2], {
    activeOccupancy: false,
    buildingId: "building",
    category: "rukost",
    floorCode: "A",
    genderPolicy: "male",
    limit: 20,
    offset: 40,
    order: "desc",
    q: "RK",
    reconciliationState: "normal",
    sort: "building",
    status: "vacant",
  });
});

test("all Add Room affordances and requester paths are absent while edit remains", () => {
  const files = [
    source("routes/index.tsx"),
    source("routes/rooms/index.tsx"),
    source("routes/rooms/rumah-kost.tsx"),
    source("routes/rooms/apart-kost.tsx"),
    source("components/rooms/KostTypeInventoryPage.tsx"),
    source("hooks/useAdminUxMaster.ts"),
    source("lib/admin-ux-master-api.ts"),
  ].join("\n");
  assert.doesNotMatch(files, /Tambah Kamar|RoomCreateCategoryMenu|kind:\s*"create"|rooms\.create/);
  assert.doesNotMatch(files, /\.post<unknown>\("\/rooms"/);
  assert.match(files, /Edit inventori/);
  assert.match(files, /\.patch<unknown>\("\/rooms\/"/);

  const assertFixedUi = (candidate: string) => {
    assert.doesNotMatch(
      candidate,
      /Tambah Kamar|RoomCreateCategoryMenu|kind:\s*"create"|rooms\.create/,
    );
  };
  assertFixedUi(files);
  assert.throws(() => assertFixedUi(`${files}\nconst action = "Tambah Kamar";`));
});

test("legacy create query is canonicalized away on every room list route", () => {
  for (const route of [
    source("routes/rooms/index.tsx"),
    source("routes/rooms/rumah-kost.tsx"),
    source("routes/rooms/apart-kost.tsx"),
  ]) {
    assert.match(route, /if \(search\.create\)/);
    assert.match(route, /replace:\s*true/);
    assert.match(route, /create:\s*undefined/);
    assert.doesNotMatch(route, /createRequested|onCreateConsumed|setRoomEditor/);
  }
});

test("shared discovery controls and canonical columns are wired on all room surfaces", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const summary = source("routes/rooms/index.tsx");
  assert.match(page, /export function RoomDiscoveryFilters/);
  assert.match(page, /<RoomDiscoveryFilters/);
  assert.match(summary, /<RoomDiscoveryFilters/);
  for (const label of [
    "Kamar",
    "Bangunan",
    "Kategori",
    "Jenis Kelamin",
    "Status",
    "Penghuni Aktif",
    "Aksi",
  ]) {
    assert.match(page, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(page, />Harga dari Tipe</);
  assert.match(page, /showCategory=\{false\}/);
  assert.match(summary, /showCategory(?:=\{true\})?/);

  const table = section(page, "export function RoomInventoryTable", "function draftForKostType");
  assert.doesNotMatch(table, /formatIDR|monthlyPrice|yearlyPrice|depositAmount|>Harga/);
  assert.doesNotMatch(table, /rooms\.(?:filter|sort)\(/);

  assert.match(source("routes/rooms/rumah-kost.tsx"), /category="rukost"/);
  assert.match(source("routes/rooms/apart-kost.tsx"), /category="apartkost"/);
});

test("room discovery surfaces use theme-aware cards, controls, and table contrast", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const controls = section(
    page,
    "export function RoomDiscoveryFilters",
    "export function Pagination",
  );
  const table = section(page, "export function RoomInventoryTable", "function draftForKostType");

  for (const candidate of [controls, table]) {
    assert.doesNotMatch(candidate, /(?:border|bg|text|divide)-slate-/);
  }
  assert.match(controls, /border-border bg-card shadow-sm/);
  assert.match(controls, /border-input bg-background/);
  assert.match(table, /border-border bg-card shadow-sm/);
  assert.match(table, /bg-muted\/75/);
  assert.match(table, /divide-y divide-border/);
  assert.match(table, /hover:bg-muted\/60/);
});

test("search is automatic and every filter resets the server offset", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const controls = page.slice(
    page.indexOf("export function RoomDiscoveryFilters"),
    page.indexOf("export function Pagination"),
  );
  assert.match(controls, /onSubmit=\{applySearch\}/);
  assert.match(controls, /window\.setTimeout/);
  assert.match(controls, /onSearchChange\(\{ q: nextQuery, offset: 0 \}\)/);
  assert.doesNotMatch(controls, />Cari</);
  for (const anchor of [
    "value={search.buildingId",
    "value={search.status",
    "value={search.floorCode",
    "value={search.genderPolicy",
    "search.activeOccupancy === undefined",
    "value={search.reconciliationState",
    "value={search.sort",
    "value={search.order",
  ]) {
    const control = selectFor(controls, anchor);
    assert.match(control, /offset:\s*0/);
  }
  const searchForm = section(controls, "const applySearch", "return (");
  assert.match(searchForm, /offset:\s*0/);
});

test("table pagination and metrics remain server-page and authoritative-summary driven", () => {
  const summary = source("routes/rooms/index.tsx");
  assert.match(summary, /summarizeRoomInventory\(/);
  assert.match(summary, /roomsQuery\.data\?\.total/);
  assert.match(summary, /limit:\s*search\.limit/);
  assert.match(summary, /offset:\s*search\.offset/);
  assert.doesNotMatch(summary, /rooms\.length[^;]*totalInventory|totalRooms\s*=\s*rooms\.length/);
});

test("root category cards keep authoritative building options and URL state coherent", () => {
  const summary = source("routes/rooms/index.tsx");
  const assertCategoryBinding = (candidate: string) => {
    assert.match(
      candidate,
      /\.filter\(\(building\) => !search\.category \|\| building\.category === search\.category\)/,
    );
    assert.match(
      candidate,
      /const categoryChanged =[\s\S]*?hasOwnProperty\.call\(next, "category"\)[\s\S]*?next\.category !== search\.category/,
    );
    assert.match(candidate, /categoryChanged \? \{ buildingId: undefined \} : \{\}/);
    assert.match(candidate, /onSearchChange\(\{[\s\S]*?category,[\s\S]*?offset:\s*0/);
  };
  assertCategoryBinding(summary);
  assert.throws(() =>
    assertCategoryBinding(
      summary.replace("!search.category || building.category === search.category", "true"),
    ),
  );
  assert.throws(() =>
    assertCategoryBinding(
      summary.replace("categoryChanged ? { buildingId: undefined } : {}", "{}"),
    ),
  );
});
