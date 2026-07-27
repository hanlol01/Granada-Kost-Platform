import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseRoomBuildingReferenceEnvelope, toRoomInventoryBody } from "./admin-ux-master-api";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const PROPERTY_A = "11111111-1111-4111-8111-111111111111";
const BUILDING_A = "22222222-2222-4222-8222-222222222222";

const exactEnvelope = {
  data: [
    {
      id: BUILDING_A,
      property_id: PROPERTY_A,
      category: "rukost",
      building_code: "RK-A",
      building_name: "Rumah Kost A",
      gender_policy: "female",
    },
  ],
} as const;

test("building reference parser accepts only the exact safe V2 envelope", () => {
  assert.deepEqual(parseRoomBuildingReferenceEnvelope(exactEnvelope), [
    {
      id: BUILDING_A,
      propertyId: PROPERTY_A,
      category: "rukost",
      buildingCode: "RK-A",
      buildingName: "Rumah Kost A",
      genderPolicy: "female",
    },
  ]);

  for (const invalid of [
    exactEnvelope.data,
    { items: exactEnvelope.data },
    { ...exactEnvelope, meta: {} },
    { data: [{ ...exactEnvelope.data[0], metadata: {} }] },
    { data: [{ ...exactEnvelope.data[0], id: "" }] },
    { data: [{ ...exactEnvelope.data[0], property_id: "" }] },
    { data: [{ ...exactEnvelope.data[0], category: "other" }] },
    { data: [{ ...exactEnvelope.data[0], gender_policy: "mixed" }] },
    { data: [{ ...exactEnvelope.data[0], gender_policy: "other" }] },
    { data: [{ ...exactEnvelope.data[0], building_code: "" }] },
    { data: [{ ...exactEnvelope.data[0], building_name: "" }] },
  ]) {
    assert.throws(() => parseRoomBuildingReferenceEnvelope(invalid));
  }
});

test("building reference cache key is property and category scoped", () => {
  assert.deepEqual(adminUxQueryKeys.rooms.buildings(PROPERTY_A, "rukost"), [
    "roomBuildings",
    PROPERTY_A,
    "rukost",
  ]);
  assert.notDeepEqual(
    adminUxQueryKeys.rooms.buildings(PROPERTY_A, "rukost"),
    adminUxQueryKeys.rooms.buildings(PROPERTY_A, "apartkost"),
  );
});

test("building hook uses the exact read endpoint and fails closed without scope", () => {
  const hooks = source("hooks/useAdminUxMaster.ts");
  const api = source("lib/admin-ux-master-api.ts");

  assert.match(api, /\.get<unknown>\(\s*"\/rooms\/buildings"/);
  assert.match(api, /property_id:\s*propertyId/);
  assert.match(api, /category/);
  assert.match(api, /\.then\(parseRoomBuildingReferenceEnvelope\)/);
  assert.match(hooks, /export function useM4RoomBuildings/);
  assert.match(
    hooks,
    /queryKey:\s*adminUxQueryKeys\.rooms\.buildings\(currentPropertyId \?\? "", category \?\? ""\)/,
  );
  assert.match(
    hooks,
    /queryFn:\s*\(\) => adminUxMasterApi\.rooms\.buildings\(currentPropertyId!, category!\)/,
  );
  assert.match(hooks, /enabled:\s*Boolean\(currentPropertyId && category\)/);
});

test("inventory page uses authoritative buildings independent of room page filters", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");

  assert.match(page, /useM4RoomBuildings\(category\)/);
  assert.doesNotMatch(page, /function buildingOptions\s*\(/);
  assert.doesNotMatch(page, /buildingOptions\(rooms\)/);
  assert.match(page, /buildingQuery\.isLoading/);
  assert.match(page, /buildingQuery\.error/);
  assert.match(page, /void buildingQuery\.refetch\(\)/);
  assert.match(page, /disabled=\{!canManage \|\| !activeType \|\| buildings\.length === 0\}/);
  assert.match(page, /Belum ada bangunan untuk kategori/);
  assert.doesNotMatch(page, /useMemo\(\(\) => buildingOptions\(rooms\), \[rooms\]\)/);
});

test("room create serializer stays inventory-only", () => {
  assert.deepEqual(
    toRoomInventoryBody({
      propertyId: PROPERTY_A,
      kostTypeId: "33333333-3333-4333-8333-333333333333",
      number: "101",
      buildingId: BUILDING_A,
      genderPolicy: "female",
    }),
    {
      property_id: PROPERTY_A,
      kost_type_id: "33333333-3333-4333-8333-333333333333",
      number: "101",
      room_code: undefined,
      building_id: BUILDING_A,
      floor: undefined,
      floor_code: undefined,
      floor_label: undefined,
      unit_code: undefined,
      gender_policy: "female",
      size_label: undefined,
      primary_photo_file_id: undefined,
      public_visible: undefined,
    },
  );
});
