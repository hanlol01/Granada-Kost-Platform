import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseRoomInventoryDetailEnvelope,
  parseRoomInventoryListEnvelope,
} from "./admin-ux-master-api";
import {
  canUseCompatibilityCheckout,
  legacyCheckoutRoomQueryKey,
} from "../hooks/useOccupancyMutations";

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function roomWire() {
  return {
    id: "room-opaque",
    property_id: "property-opaque",
    number: "RK-01-01",
    room_code: "RK-01-01",
    building_id: "building-opaque",
    building_code: "RK-01",
    building_name: "Rumah Kost 01",
    unit_code: "01",
    gender_policy: "male",
    floor: "1",
    floor_code: "A",
    floor_label: "Lantai 1",
    size_label: "3 x 4 m",
    status: "occupied",
    primary_photo_file_id: null,
    public_visible: true,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
    kost_type: {
      id: "kost-type-opaque",
      name: "Rumah Kost",
      slug: "rukost",
      category: "rukost",
      monthly_price: 1800000,
      yearly_price: 0,
      deposit_amount: 0,
      facilities: [
        {
          id: "facility-opaque",
          name: "Wi-Fi",
          icon: null,
          description: null,
          category_id: null,
          sort_order: 1,
        },
      ],
    },
    active_lease: null,
    active_occupancy: {
      id: "occupancy-opaque",
      resident_id: "resident-opaque",
      resident_name: "Nama Aman",
      start_date: "2026-07-28",
    },
    lease_reconciliation_required: true,
  };
}

function parsedRoom() {
  return parseRoomInventoryListEnvelope(
    { data: [roomWire()], meta: { limit: 20, offset: 0, total: 1 } },
    true,
  ).items[0]!;
}

function assertDialogSafety(dialog: string, hooks: string): void {
  assert.match(dialog, /open=\{open && accessAllowed\}/);
  assert.match(
    dialog,
    /if \(!canSubmit \|\| !occupancyId \|\| !currentPropertyId \|\| submissionLock\.current\) return;/,
  );
  assert.match(
    dialog,
    /submissionLock\.current = true;[\s\S]*finally \{[\s\S]*submissionLock\.current = false;/,
  );
  assert.match(dialog, /create\.mutateAsync\(\{[\s\S]*propertyId: currentPropertyId/);
  assert.match(dialog, /finalize\.mutateAsync\(\{[\s\S]*propertyId: currentPropertyId/);
  assert.match(hooks, /legacyCheckoutRoomQueryKey\(input\.propertyId\)/);
  assert.doesNotMatch(hooks, /queryKey:\s*\["rooms"\]/);
}

test("strict Rooms V2 parser maps exact reconciliation boolean and transport whitelist", () => {
  const parsed = parseRoomInventoryListEnvelope(
    { data: [roomWire()], meta: { limit: 20, offset: 0, total: 1 } },
    true,
  );
  assert.equal(parsed.items[0]?.leaseReconciliationRequired, true);
  assert.deepEqual(parsed.items[0]?.activeOccupancy, {
    id: "occupancy-opaque",
    residentId: "resident-opaque",
    residentName: "Nama Aman",
    startDate: "2026-07-28",
  });
  assert.deepEqual(Object.keys(parsed.items[0] ?? {}).sort(), [
    "activeLease",
    "activeOccupancy",
    "buildingCode",
    "buildingId",
    "buildingName",
    "floor",
    "floorCode",
    "floorLabel",
    "genderPolicy",
    "id",
    "kostType",
    "leaseReconciliationRequired",
    "number",
    "primaryPhotoFileId",
    "propertyId",
    "publicVisible",
    "roomCode",
    "sizeLabel",
    "status",
    "unitCode",
  ]);
  assert.equal("raw_payload" in (parsed.items[0] ?? {}), false);
});

test("conditional anomaly contract rejects missing, wrong type, and extra leakage", () => {
  const missing = roomWire() as Record<string, unknown>;
  delete missing.lease_reconciliation_required;
  assert.throws(() =>
    parseRoomInventoryListEnvelope(
      { data: [missing], meta: { limit: 20, offset: 0, total: 1 } },
      true,
    ),
  );
  assert.throws(() =>
    parseRoomInventoryListEnvelope(
      {
        data: [{ ...roomWire(), lease_reconciliation_required: "true" }],
        meta: { limit: 20, offset: 0, total: 1 },
      },
      true,
    ),
  );
  assert.throws(() =>
    parseRoomInventoryListEnvelope(
      {
        data: [{ ...roomWire(), raw_occupancy: { secret: true } }],
        meta: { limit: 20, offset: 0, total: 1 },
      },
      true,
    ),
  );
  assert.throws(() =>
    parseRoomInventoryDetailEnvelope(
      {
        data: {
          ...roomWire(),
          active_occupancy: { ...roomWire().active_occupancy, internal_actor: "unsafe" },
        },
      },
      true,
    ),
  );
});

test("default Rooms wire remains compatible while exact detail wrapper is enforced", () => {
  const base = roomWire() as Record<string, unknown>;
  delete base.active_occupancy;
  delete base.lease_reconciliation_required;
  const parsed = parseRoomInventoryListEnvelope(
    { data: [base], meta: { limit: 20, offset: 0, total: 1 } },
    false,
  );
  assert.equal(parsed.items[0]?.leaseReconciliationRequired, undefined);
  assert.equal(parsed.items[0]?.activeOccupancy, undefined);
  assert.equal(
    parseRoomInventoryDetailEnvelope({ data: roomWire() }, true).leaseReconciliationRequired,
    true,
  );
  assert.throws(() => parseRoomInventoryDetailEnvelope(roomWire(), true));
  assert.throws(() =>
    parseRoomInventoryDetailEnvelope({ data: roomWire(), meta: { total: 1 } }, true),
  );
});

test("Admin move-in uses canonical Lease route and contains every direct check-in caller", () => {
  const tenants = source("routes/tenants.tsx");
  const hooks = source("hooks/useOccupancyMutations.ts");
  const oldDialog = fileURLToPath(
    new URL("../components/forms/CheckInDialog.tsx", import.meta.url),
  );
  assert.equal(existsSync(oldDialog), false);
  assert.doesNotMatch(tenants + hooks, /\/check-ins|CheckInDialog|useCompleteCheckIn/);
  assert.match(tenants, /to="\/penyewaan\/tambah"/);
  assert.match(tenants, /Tambah Penyewaan/);
  assert.match(tenants, /lease\.read[\s\S]*lease\.manage[\s\S]*currentPropertyId/);
  assert.match(tenants, /isAdminUxLeaseEnabled\(\)/);
  assert.match(tenants, /Fitur Penyewaan belum diaktifkan untuk rollout ini\./);
});

test("anomaly UI is conditional, permission-gated, and never renders opaque ids", () => {
  const inventory = source("components/rooms/KostTypeInventoryPage.tsx");
  const dialog = source("components/rooms/CompatibilityCheckoutDialog.tsx");
  assert.match(inventory, /hasPermission\("checkout\.manage"\)/);
  assert.match(inventory, /room\.leaseReconciliationRequired \? \(/);
  assert.match(inventory, /Perlu rekonsiliasi penyewaan/);
  assert.match(inventory, /canLegacyCheckout && room\.leaseReconciliationRequired/);
  assert.match(inventory, /setLegacyCheckoutRoom\(room\)/);
  assert.match(dialog, /Jalur ini hanya menutup data hunian lama/);
  assert.match(dialog, /"vacant" \| "maintenance"/);
  assert.doesNotMatch(
    inventory + dialog,
    />\s*\{(?:room|occupancy|lease)\.(?:id|roomId|occupancyId|leaseId)\}\s*</,
  );
});

test("compatibility access predicate fails closed for role, permission, property, and anomaly", () => {
  const room = parsedRoom();
  const allowed = {
    roles: ["manager"],
    permissions: ["checkout.manage"],
    propertyId: room.propertyId,
    room,
  };
  assert.equal(canUseCompatibilityCheckout(allowed), true);
  assert.equal(canUseCompatibilityCheckout({ ...allowed, roles: ["resident"] }), false);
  assert.equal(canUseCompatibilityCheckout({ ...allowed, permissions: [] }), false);
  assert.equal(canUseCompatibilityCheckout({ ...allowed, propertyId: "other-property" }), false);
  assert.equal(
    canUseCompatibilityCheckout({
      ...allowed,
      room: { ...room, leaseReconciliationRequired: false },
    }),
    false,
  );
  assert.equal(
    canUseCompatibilityCheckout({ ...allowed, room: { ...room, activeOccupancy: null } }),
    false,
  );
});

test("compatibility invalidation key is property-scoped", () => {
  assert.deepEqual(legacyCheckoutRoomQueryKey("property-a"), ["rooms", "property-a"]);
  assert.notDeepEqual(
    legacyCheckoutRoomQueryKey("property-a"),
    legacyCheckoutRoomQueryKey("property-b"),
  );
});

test("compatibility dialog prevents double submit and resets across property or room changes", () => {
  const dialog = source("components/rooms/CompatibilityCheckoutDialog.tsx");
  const hooks = source("hooks/useOccupancyMutations.ts");
  assert.match(dialog, /const pending = create\.isPending \|\| finalize\.isPending/);
  assert.match(dialog, /disabled=\{!canSubmit \|\| pending\}/);
  assert.match(
    dialog,
    /if \(!requestId\)[\s\S]*create\.mutateAsync[\s\S]*setCheckOutId\(requestId\)/,
  );
  assert.match(dialog, /\[open, room\?\.id, currentPropertyId,/);
  assert.match(hooks, /apiClient\.post<unknown>\("\/check-outs"/);
  assert.match(hooks, /`\/check-outs\/\$\{encodeURIComponent\(input\.checkOutId\)\}\/finalize`/);
  assert.doesNotMatch(hooks, /\/leases|\/invoices|\/residents/);
  assertDialogSafety(dialog, hooks);
  assert.throws(() => assertDialogSafety(dialog.replace(" || submissionLock.current", ""), hooks));
  assert.throws(() =>
    assertDialogSafety(
      dialog,
      hooks.replace("legacyCheckoutRoomQueryKey(input.propertyId)", '["rooms"]'),
    ),
  );
});
