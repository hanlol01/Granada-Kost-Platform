import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertRoomDetailScope,
  parseRoomDetailEnvelope,
  roomDetailToInventory,
} from "./admin-ux-master-api";
import { roomStructuralInputChanged } from "./admin-ux-master-helpers";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const BUILDING_ID = "33333333-3333-4333-8333-333333333333";
const TYPE_ID = "44444444-4444-4444-8444-444444444444";
const FACILITY_ID = "55555555-5555-4555-8555-555555555555";
const LEASE_ID = "66666666-6666-4666-8666-666666666666";
const PHOTO_ID = "77777777-7777-4777-8777-777777777777";
const OWNER_ID = "88888888-8888-4888-8888-888888888888";
const RESIDENT_ID = "99999999-9999-4999-8999-999999999999";
const ADMIN_SRC = fileURLToPath(new URL("../", import.meta.url));

const source = (relativePath: string): string =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function detailWire() {
  return {
    data: {
      id: ROOM_ID,
      property_id: PROPERTY_ID,
      number: "RK-01-01",
      room_code: "RK-01-01",
      building: { id: BUILDING_ID, code: "RK-01", name: "RuKost 01" },
      category: { id: TYPE_ID, code: "rukost", name: "Rumah Kost" },
      physical: {
        unit_code: "01",
        floor_code: "B",
        floor_label: "Lantai Bawah / LT.1",
        size_label: "3 × 4 m",
        primary_photo_file_id: PHOTO_ID,
        gender_policy: "male",
        status: "vacant",
        public_visible: true,
        notes: null,
        structural_edit_locked: false,
      },
      commercial: {
        source: "current_category",
        monthly_price: 1_800_000,
        annual_contract_value: 21_600_000,
        minimum_dp_amount: 5_400_000,
        minimum_dp_label: "Rekomendasi 25% dari nilai kontrak tahunan",
        security_deposit_required: 1_800_000,
        payment_plan_description: "Tahunan penuh atau angsuran per dua bulan",
        facilities: [{ id: FACILITY_ID, name: "Kasur" }],
      },
      resident: {
        id: RESIDENT_ID,
        display_name: "Penghuni Aktif",
        account_status: "active",
        university: null,
        occupancy_start: "2026-07-01",
      },
      lease: {
        id: LEASE_ID,
        code: "LEASE-001",
        status: "active",
        start_date: "2026-07-01",
        end_date: "2027-07-01",
        duration_months: 12,
        payment_plan: "yearly",
        occupancy_start: "2026-07-01",
        occupancy_end: null,
        occupancy_state: "active",
      },
      reconciliation: { state: "normal", messages: [] },
      billing: {
        contract_value: 21_600_000,
        verified_invoice_allocated: 5_400_000,
        unpaid_amount: 16_200_000,
        next_due_date: "2026-09-01",
        next_due_period: "2026-09",
        minimum_dp_amount: 5_400_000,
        dp_verified_amount: null,
        dp_progress_label: "DP belum dapat direkonsiliasi",
        security_deposit_required: 1_000_000,
        deposit_held: 1_000_000,
        deposit_refunded: 0,
        deposit_deducted: 0,
        awaiting_confirmation_amount: 0,
      },
      vehicles: [
        {
          code: "VEH-001",
          plate_number: "D 1000 QA",
          vehicle_type: "motorcycle",
          parking_state: "occupied",
        },
      ],
      complaints: [
        {
          code: "CMP-001",
          category: "Plumbing",
          status: "acknowledged",
          priority: "medium",
          work_order_code: "WO-001",
          work_order_status: "assigned",
          technician_name: "Teknisi",
        },
      ],
      ownership: {
        owner_profile_id: OWNER_ID,
        display_name: "Hans",
        source: "room_assignment",
        assignment_kind: "room",
        effective_from: "2026-08-14",
        effective_until: null,
        assignment_status: "active",
      },
      timeline: [
        {
          event_type: "room_updated",
          label: "Inventori kamar diperbarui",
          occurred_at: "2026-07-31T00:00:00.000Z",
        },
      ],
      links: {
        resident: `/tenants/${RESIDENT_ID}`,
        lease: `/penyewaan/${LEASE_ID}`,
        billing: null,
        vehicles: null,
        complaints: null,
      },
      updated_at: "2026-07-31T00:00:00.000Z",
    },
  };
}

test("room detail parser is an exact nested whitelist and preserves safe edit authority", () => {
  const detail = parseRoomDetailEnvelope(detailWire());
  assert.equal(detail.propertyId, PROPERTY_ID);
  assert.equal(detail.number, "RK-01-01");
  assert.equal(detail.commercial.minimumDpAmount, 5_400_000);
  assert.equal(detail.commercial.securityDepositRequired, 1_800_000);
  assert.equal(detail.ownership.displayName, "Hans");
  assert.equal(detail.ownership.ownerProfileId, OWNER_ID);
  assert.equal(detail.ownership.source, "room_assignment");
  assert.equal(detail.resident?.id, RESIDENT_ID);
  assert.equal(detail.links.resident, `/tenants/${RESIDENT_ID}`);
  const kostationOwned = parseRoomDetailEnvelope({
    ...detailWire(),
    data: {
      ...detailWire().data,
      ownership: {
        owner_profile_id: null,
        display_name: "KOSTATION",
        source: "kostation_default",
        assignment_kind: null,
        effective_from: null,
        effective_until: null,
        assignment_status: null,
      },
    },
  });
  assert.equal(kostationOwned.ownership.displayName, "KOSTATION");
  assert.equal(kostationOwned.ownership.assignmentStatus, null);
  assert.equal(detail.links.lease, `/penyewaan/${LEASE_ID}`);
  assert.equal(detail.billing.verifiedInvoiceAllocated, 5_400_000);
  assert.equal(assertRoomDetailScope(detail, PROPERTY_ID, " RK-01-01 "), detail);
  assert.throws(() => assertRoomDetailScope(detail, BUILDING_ID, detail.number));
  assert.throws(() => assertRoomDetailScope(detail, PROPERTY_ID, "RK-99-99"));

  const inventory = roomDetailToInventory(detail);
  assert.equal(inventory.unitCode, "01");
  assert.equal(inventory.primaryPhotoFileId, PHOTO_ID);
  assert.equal(inventory.buildingId, BUILDING_ID);
  assert.equal(inventory.kostType.id, TYPE_ID);
  assert.equal(
    roomStructuralInputChanged(inventory, {
      kostTypeId: TYPE_ID,
      buildingId: BUILDING_ID,
      number: inventory.number,
      roomCode: inventory.roomCode,
      unitCode: inventory.unitCode,
      floorCode: inventory.floorCode ?? undefined,
    }),
    false,
  );
  assert.equal(roomStructuralInputChanged(inventory, { number: "RK-01-02" }), true);

  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: { ...detailWire().data, raw_audit_payload: {} },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        ownership: {
          ...detailWire().data.ownership,
          source: "policy_default",
        },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        timeline: [
          {
            ...detailWire().data.timeline[0],
            label: "Label dari payload mentah",
          },
        ],
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        ownership: { ...detailWire().data.ownership, phone: "0857979541137" },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        resident: { ...detailWire().data.resident, phone: "6281111111111" },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        resident: { ...detailWire().data.resident, account_status: "unknown" },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: { ...detailWire().data, updated_at: "not-a-timestamp" },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        reconciliation: { state: "lease_reconciliation_required", messages: ["decoy"] },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        links: { ...detailWire().data.links, lease: `/penyewaan/${ROOM_ID}` },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        billing: { ...detailWire().data.billing, dp_verified_amount: 5_400_000 },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        timeline: [
          {
            event_type: "raw_audit_event",
            label: "Raw event",
            occurred_at: "2026-07-31T00:00:00.000Z",
          },
        ],
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        links: { ...detailWire().data.links, billing: "/payments?room_id=opaque" },
      },
    }),
  );
  assert.throws(() =>
    parseRoomDetailEnvelope({
      ...detailWire(),
      data: {
        ...detailWire().data,
        physical: { ...detailWire().data.physical, primary_photo_file_id: "not-a-uuid" },
      },
    }),
  );
});

test("detail cache is isolated by account, property, and canonical room number", () => {
  const first = adminUxQueryKeys.rooms.detailByNumber("account-a", "property-a", " RK-01-01 ");
  assert.deepEqual(first, ["roomDetail", "account-a", "property-a", "RK-01-01"]);
  assert.notDeepEqual(
    first,
    adminUxQueryKeys.rooms.detailByNumber("account-b", "property-a", "RK-01-01"),
  );
  assert.notDeepEqual(
    first,
    adminUxQueryKeys.rooms.detailByNumber("account-a", "property-b", "RK-01-01"),
  );
});

test("production route, table navigation, and registry expose one full-page detail authority", () => {
  const route = source("routes/rooms/$roomNumber.tsx");
  const page = source("components/rooms/RoomDetailPage.tsx");
  const inventory = source("components/rooms/KostTypeInventoryPage.tsx");
  const summary = source("routes/rooms/index.tsx");
  const registry = source("lib/admin-route-registry.ts");
  const routeTree = source("routeTree.gen.ts");

  assert.match(route, /createFileRoute\("\/rooms\/\$roomNumber"\)/);
  assert.match(route, /<RoomDetailPage roomNumber=\{roomNumber\}/);
  assert.match(inventory, /to:\s*"\/rooms\/\$roomNumber"/);
  assert.match(inventory, /<Link[\s\S]*?to="\/rooms\/\$roomNumber"/);
  assert.doesNotMatch(inventory, /RoomDetailSheet/);
  assert.doesNotMatch(summary, /RoomDetailSheet|search\.roomId|roomId:\s*undefined/);
  assert.match(registry, /id:\s*"room-detail"[\s\S]*?to:\s*"\/rooms\/\$roomNumber"/);
  assert.match(
    registry,
    /id:\s*"room-detail"[\s\S]*?roles:\s*OWNER_MANAGER_ADMIN[\s\S]*?readCapabilities:\s*\["room\.read"\]/,
  );
  assert.match(routeTree, /rooms\/\$roomNumber/);
  assert.match(page, /Breadcrumb detail kamar/);
  assert.match(page, /KOST_TYPE_LABEL\[detail\.category\.code\]/);
  assert.match(page, /ownershipSourceLabel\(detail\.ownership\.source\)/);
  assert.match(page, /ownershipPeriodLabel\(/);
  assert.doesNotMatch(page, /ownershipReconciliationRequired|KMO-W10|Kebijakan default/);
});

test("full page keeps every operational section, terminal state, and honest quick-link policy", () => {
  const page = source("components/rooms/RoomDetailPage.tsx");
  for (const title of [
    "Inventori fisik",
    "Sumber komersial kategori",
    "Kepemilikan",
    "Penghuni aktif",
    "Penyewaan dan hunian",
    "Ringkasan Penyewaan dan Pembayaran",
    "Kendaraan dan parkir",
    "Komplain dan work order",
    "Aktivitas kamar",
  ]) {
    assert.match(page, new RegExp(title));
  }
  assert.match(page, /LoadingState/);
  assert.match(page, /ErrorState/);
  assert.match(page, /EmptySectionCopy/);
  assert.match(page, /UnavailableLink/);
  assert.match(page, /Kamar tidak ditemukan/);
  assert.match(page, /Akses detail kamar ditolak/);
  assert.match(page, /Respons detail kamar tidak valid/);
  assert.match(page, /<section aria-labelledby=\{titleId\}/);
  assert.match(page, /<h2 id=\{titleId\}/);
  assert.match(page, /min-h-11/);
  assert.match(page, /break-words/);
  assert.doesNotMatch(page, />\{detail\.(?:id|propertyId)\}</);
  assert.doesNotMatch(page, /room_id=|resident_id=|property_id=/);
  assert.doesNotMatch(page, /href=.*\/(?:tenants|payments|vehicles|complaints)/);
  assert.doesNotMatch(page, /WhatsApp|wa\.me|resident\.phone/);

  const fakeLink = page.replace(
    '<UnavailableLink label="Tagihan belum menerima filter kamar aman pada KMO-W02A." />',
    '<a href="/payments?room_id=opaque">Tagihan</a>',
  );
  assert.match(fakeLink, /room_id=opaque/);
});

test("room detail keeps semantic status badges and aligned high-contrast data cards", () => {
  const page = source("components/rooms/RoomDetailPage.tsx");

  assert.match(page, /roomStatusBadgeClass\(detail\.physical\.status\)/);
  assert.match(page, /bg-success\/10/);
  assert.match(page, /border-foreground\/15/);
  assert.match(page, /className="min-w-0 h-full"/);
  assert.match(page, /className="h-full min-w-0/);
});

test("room detail keeps operational spacing and owner-scoped navigation", () => {
  const page = source("components/rooms/RoomDetailPage.tsx");

  assert.match(page, /\["Unit", detail\.physical\.floorLabel\]/);
  assert.match(page, /\["DP rekomendasi", detail\.commercial\.minimumDpLabel\]/);
  assert.match(page, /px-6 pb-6 pt-5/);
  assert.match(page, /gap-x-8 gap-y-5/);
  assert.match(page, /to="\/property-owners\/\$ownerId"/);
  assert.match(page, /params=\{\{ ownerId: detail\.ownership\.ownerProfileId \}\}/);
  assert.match(page, /Buka detail owner/);
  assert.match(
    page,
    /Pembayaran owner belum tersedia sebagai rute admin yang terikat ke pemilik dan\s+periode\./,
  );
  assert.doesNotMatch(page, /<Link to="\/payments">/);
});

test("room tenancy action routes to the active resident, not lease detail", () => {
  const page = source("components/rooms/RoomDetailPage.tsx");

  assert.match(page, /href=\{detail\.links\.resident\}/);
  assert.match(page, /enabledLabel="Buka detail penghuni"/);
  assert.doesNotMatch(page, /href=\{detail\.links\.lease\}/);
  assert.doesNotMatch(page, /enabledLabel="Buka detail penyewaan"/);
});

test("safe editor is update-only, lifecycle-aware, and refreshes old and new detail keys", () => {
  const page = source("components/rooms/RoomDetailPage.tsx");
  const editor = source("components/rooms/KostTypeInventoryPage.tsx");
  const hooks = source("hooks/useAdminUxMaster.ts");
  const api = source("lib/admin-ux-master-api.ts");

  assert.match(page, /roomDetailToInventory\(detail\)/);
  assert.match(page, /<RoomInventoryEditor/);
  assert.match(page, /onSaved=/);
  assert.match(page, /replace:\s*true/);
  assert.match(editor, /previousRoomNumber:\s*room\.number/);
  assert.match(editor, /roomStructuralEditLocked\(room\)/);
  assert.match(
    editor,
    /roomStructuralEditLocked\(room\)\s*&&\s*roomStructuralInputChanged\(room, updateInput\)/,
  );
  assert.match(hooks, /assertRoomDetailScope\(detail, propertyId, normalized\)/);
  assert.match(hooks, /request\.previousRoomNumber/);
  assert.ok((hooks.match(/detailByNumber\(/g) ?? []).length >= 4);
  assert.match(api, /unitCode:\s*detail\.physical\.unitCode/);
  assert.match(api, /primaryPhotoFileId:\s*detail\.physical\.primaryPhotoFileId/);
  assert.match(hooks, /room\.propertyId !== request\.propertyId/);
  assert.match(hooks, /roomPersistenceInvalidationKeys\(result\.propertyId/);
  assert.doesNotMatch(editor, /monthlyPrice.*setDraft|depositAmount.*setDraft|facility.*setDraft/i);
});

test("focused contract paths remain inside the approved Admin source boundary", () => {
  assert.ok(ADMIN_SRC.endsWith("apps\\admin\\src\\") || ADMIN_SRC.endsWith("apps/admin/src/"));
});
