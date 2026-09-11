import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ApiError } from "@granada-kost/api-client";
import { parseOwnerArchiveReceipt, parseOwnerPermanentDeleteReceipt } from "./admin-property-owner";
import { adminErrorNotice } from "./error-normalizer";
import {
  adminRouteRegistry,
  findRouteMetadata,
  getRouteAccessDecision,
} from "./admin-route-registry";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_SRC = resolve(HERE, "..");

function source(path: string): string {
  return readFileSync(join(ADMIN_SRC, path), "utf8");
}

test("W10 owner detail is a protected breadcrumb page route", () => {
  const detailRoute = adminRouteRegistry.find((route) => route.id === "property-owner-detail");

  assert.ok(detailRoute);
  assert.equal(detailRoute.to, "/property-owners/$ownerId");
  assert.equal(detailRoute.parentId, "property-owners");
  assert.equal(detailRoute.safeLabel?.({ ownerId: "untrusted-value" }), "Detail Owner");
  assert.equal(
    getRouteAccessDecision(detailRoute, {
      roles: ["admin"],
      permissions: ["property_owner.manage"],
    }),
    "allowed",
  );
  assert.equal(
    getRouteAccessDecision(detailRoute, {
      roles: ["property_owner"],
      permissions: ["property_owner.asset.read"],
    }),
    "forbidden",
  );

  const route = source("routes/property-owners/$ownerId.tsx");
  assert.match(route, /createFileRoute\("\/property-owners\/\$ownerId"\)/);
  assert.match(route, /<AppShell\b/);
  assert.match(route, /<PropertyOwnerWorkspace ownerId=\{ownerId\}/);
});

test("W10 owner parent route delegates the index and detail pages through an Outlet", () => {
  const parentRoute = source("routes/property-owners.tsx");
  const indexRoute = source("routes/property-owners/index.tsx");

  assert.match(parentRoute, /import\s+\{\s*Outlet,\s*createFileRoute\s*\}/);
  assert.match(parentRoute, /return <Outlet\s*\/>/);
  assert.match(indexRoute, /createFileRoute\("\/property-owners\/"\)/);
  assert.match(indexRoute, /<PropertyOwnerWorkspace\s*\/>/);
});

test("W10 owner portal is not mistaken for the admin owner-detail route", () => {
  const portalRoute = findRouteMetadata("/property-owners/portal");

  assert.ok(portalRoute);
  assert.equal(portalRoute.id, "property-owner-portal");
  assert.equal(
    getRouteAccessDecision(portalRoute, {
      roles: ["property_owner"],
      permissions: ["property_owner.asset.read"],
    }),
    "allowed",
  );
});

test("W10 owner list provides one Detail action that navigates to the detail page", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const actionCell = workspace.match(
    /<td className="px-5 py-4">\s*<div className="flex justify-end gap-2">([\s\S]*?)<\/div>\s*<\/td>/,
  );

  assert.ok(actionCell);
  assert.match(actionCell[1], /Detail/);
  assert.match(actionCell[1], /openDetail\(owner\.id\)/);
  assert.match(workspace, /to:\s*"\/property-owners\/\$ownerId"/);
  assert.doesNotMatch(actionCell[1], /Pencil|openEdit/);
  assert.match(workspace, /function OwnerDetailPageContent/);
  assert.doesNotMatch(workspace, /function OwnerDetailDialog/);
});

test("W10 owner detail aligns the primary back action with the detail cards", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const detailPageStart = workspace.indexOf("function OwnerDetailPageContent");
  const detailPageEnd = workspace.indexOf("function Info", detailPageStart);
  const detailPage = workspace.slice(detailPageStart, detailPageEnd);

  assert.match(
    detailPage,
    /<section className="mx-auto w-full max-w-6xl space-y-6 pb-8">\s*<div className="flex items-center">\s*<Button onClick=\{onBack\}>/,
  );
  assert.match(detailPage, /<ArrowLeft className="mr-2 size-4"\s*\/>\s*Kembali ke Owner Property/);
  assert.doesNotMatch(
    detailPage,
    /<Button variant="outline" className="shrink-0" onClick=\{onBack\}>/,
  );
});

test("W10 owner password dialogs provide the default shortcut without removing reveal controls", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");

  assert.match(workspace, /const DEFAULT_OWNER_PASSWORD = "qwerty1234#"/);
  assert.equal((workspace.match(/aria-label="Isi password default"/g) ?? []).length, 2);
  assert.equal((workspace.match(/initialPassword: DEFAULT_OWNER_PASSWORD/g) ?? []).length, 2);
  assert.equal((workspace.match(/className="pr-32"/g) ?? []).length, 2);
  assert.match(workspace, /Tampilkan password awal/);
  assert.match(workspace, /Tampilkan password baru/);
});

test("W10 owner assignment is immediate and permanent without admin-supplied dates", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const assignmentStart = workspace.indexOf('<Dialog open={modal === "assign"}');
  const assignmentEnd = workspace.indexOf('<Dialog open={modal === "reset"}', assignmentStart);
  const assignmentDialog = workspace.slice(assignmentStart, assignmentEnd);

  assert.match(assignmentDialog, /berlaku langsung dan permanen/);
  assert.doesNotMatch(assignmentDialog, /HeroUiDatePicker|Mulai berlaku|Berakhir pada/);
});

test("W10 owner release is immediate and keeps its audit history", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const releaseStart = workspace.indexOf('<Dialog open={modal === "release"}');
  const releaseEnd = workspace.indexOf(
    "<Dialog\n        open={Boolean(passwordReceipt)}",
    releaseStart,
  );
  const releaseDialog = workspace.slice(releaseStart, releaseEnd);

  assert.match(releaseDialog, /Lepaskan kepemilikan aset/);
  assert.match(releaseDialog, /Kepemilikan berhenti hari ini/);
  assert.doesNotMatch(releaseDialog, /HeroUiDatePicker|Tanggal berakhir/);
});

test("W10 owner detail supports an explicit, confirmed batch ownership release", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const ownerApi = source("lib/admin-property-owner.ts");
  const mutations = source("hooks/usePropertyOwners.ts");
  const assetBlockStart = workspace.indexOf("function AssetBlock");
  const assetBlock = workspace.slice(assetBlockStart);
  const batchDialogStart = workspace.indexOf('<Dialog open={modal === "release-batch"}');
  const batchDialog = workspace.slice(batchDialogStart);

  assert.match(ownerApi, /releaseBuildingBatch/);
  assert.match(ownerApi, /releaseRoomBatch/);
  assert.match(mutations, /releaseBatch:\s*useMutation/);
  assert.match(mutations, /assignment_ids/);
  assert.match(assetBlock, /Pilih beberapa/);
  assert.match(assetBlock, /onBulkRelease/);
  assert.match(assetBlock, /type="checkbox"/);
  assert.match(batchDialog, /Lepaskan kepemilikan aset terpilih/);
  assert.match(batchDialog, /Riwayat tetap/);
  assert.doesNotMatch(batchDialog, /HeroUiDatePicker|Tanggal berakhir/);
});

test("W10 owner batch selection uses clear actions, clickable cards, and Indonesian room gender labels", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const assetBlockStart = workspace.indexOf("function AssetBlock");
  const assetBlock = workspace.slice(assetBlockStart);

  assert.match(assetBlock, /variant="default"[\s\S]*?Pilih beberapa/);
  assert.match(assetBlock, /variant="destructive"[\s\S]*?Batal/);
  assert.match(assetBlock, /const Card = canSelect \? "label" : "article"/);
  assert.match(assetBlock, /cursor-pointer/);
  assert.match(workspace, /function roomGenderLabel/);
  assert.match(workspace, /genderPolicy === "male"\) return "Putra"/);
  assert.match(workspace, /genderPolicy === "female"\) return "Putri"/);
  assert.match(workspace, /roomGenderLabel\(asset\.genderPolicy\)/);
  assert.match(assetBlock, /Filter cepat unit yang dimiliki/);
  assert.match(assetBlock, /Rumah Kost" : "Apart Kost"\} Unit \{unit\}/);
});

test("W10 owner mutations invalidate only room-detail caches in the active property", () => {
  const mutations = source("hooks/usePropertyOwners.ts");

  assert.match(mutations, /queryKey\[0\] === "roomDetail"/);
  assert.match(mutations, /queryKey\[2\] === propertyId/);
});

test("W10 owner archive receipt accepts the compact backend response", () => {
  assert.deepEqual(
    parseOwnerArchiveReceipt({
      owner_id: "11111111-1111-4111-8111-111111111111",
      status: "archived",
    }),
    {
      ownerId: "11111111-1111-4111-8111-111111111111",
      status: "archived",
    },
  );
  assert.deepEqual(
    parseOwnerPermanentDeleteReceipt({
      owner_id: "11111111-1111-4111-8111-111111111111",
      status: "deleted",
    }),
    {
      ownerId: "11111111-1111-4111-8111-111111111111",
      status: "deleted",
    },
  );
});

test("W10 owner lifecycle gives active assignments a specific recovery message", () => {
  const notice = adminErrorNotice(
    new ApiError({
      status: 409,
      code: "PROPERTY_OWNER_ASSIGNMENTS_STILL_ACTIVE",
      message: "raw server message",
    }),
  );
  assert.equal(notice.title, "Owner masih memiliki aset");
  assert.match(notice.description, /Lepaskan seluruh kepemilikan/);
  assert.doesNotMatch(notice.description, /raw server message/);
});

test("W10 owner detail preflights archive and protects permanent deletion", () => {
  const workspace = source("components/property-owners/PropertyOwnerWorkspace.tsx");
  const ownerApi = source("lib/admin-property-owner.ts");
  const service = source(
    "../../../backend/api/src/modules/property-owner-management/property-owner-management.service.ts",
  );

  assert.match(workspace, /Owner belum dapat diarsipkan/);
  assert.match(workspace, /Kelola dan lepaskan kepemilikan/);
  assert.match(workspace, /getElementById\("owner-assets"\)/);
  assert.match(workspace, /Ketik \$\{selectedOwner\?\.fullName/);
  assert.match(ownerApi, /\.then\(parseOwnerArchiveReceipt\)/);
  assert.match(ownerApi, /deletePermanently/);
  assert.match(service, /PROPERTY_OWNER_PERMANENT_DELETE_BLOCKED/);
  assert.match(service, /owner\.profile_status !== 'archived'/);
  assert.match(service, /ownershipHistory > 0/);
  assert.match(service, /financial_record_count > 0/);
});
