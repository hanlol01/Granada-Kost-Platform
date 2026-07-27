import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bookingLeadListScopeKey,
  canCreateAdminBookingLead,
  parseAdminBookingLead,
  requestAdminBookingLeads,
  requestCreateAdminBookingLead,
  requestUpdateAdminBookingLeadStatus,
  toAdminBookingLeadPayload,
  validateQuickBookingDraft,
} from "./admin-booking-lead";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

const room = {
  id: ROOM_ID,
  propertyId: PROPERTY_ID,
  status: "vacant" as const,
  genderPolicy: "female" as const,
};

const draft = {
  visitorName: "  Siti Aminah  ",
  gender: "female" as const,
  visitorAddress: "  Jalan Melati 10  ",
  visitorUniversity: "   ",
  visitorPhone: "  +62 812-3456-7890  ",
};

const record = {
  id: "33333333-3333-4333-8333-333333333333",
  propertyId: PROPERTY_ID,
  category: "rukost",
  gender: "female",
  buildingCode: "RK-03",
  floorCode: "B",
  publicGroupKey: null,
  visitorName: "Siti Aminah",
  visitorPhone: "6281234567890",
  visitorMessage: null,
  preferredMoveInDate: null,
  status: "new",
  source: "admin_quick_entry",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  roomId: ROOM_ID,
  roomNumber: "RK-03-02",
  visitorAddress: "Jalan Melati 10",
  visitorUniversity: null,
};

test("quick-entry access is fail-closed by role, permission, scope, and vacancy", () => {
  for (const role of ["manager", "admin"]) {
    assert.equal(
      canCreateAdminBookingLead({
        roles: [role],
        permissions: ["room.manage"],
        propertyId: PROPERTY_ID,
        room,
      }),
      true,
    );
  }

  for (const denied of [
    { roles: [], permissions: ["room.manage"], propertyId: PROPERTY_ID, room },
    { roles: ["owner"], permissions: ["room.manage"], propertyId: PROPERTY_ID, room },
    { roles: ["property_owner"], permissions: ["room.manage"], propertyId: PROPERTY_ID, room },
    { roles: ["technician"], permissions: ["room.manage"], propertyId: PROPERTY_ID, room },
    { roles: ["resident"], permissions: ["room.manage"], propertyId: PROPERTY_ID, room },
    { roles: ["admin"], permissions: [], propertyId: PROPERTY_ID, room },
    { roles: ["admin"], permissions: ["room.manage"], propertyId: null, room },
    { roles: ["admin"], permissions: ["room.manage"], propertyId: "", room },
    {
      roles: ["admin"],
      permissions: ["room.manage"],
      propertyId: PROPERTY_ID,
      room: { ...room, propertyId: "other-property" },
    },
    ...["reserved", "occupied", "maintenance", "inactive", "requires_review"].map((status) => ({
      roles: ["admin"],
      permissions: ["room.manage"],
      propertyId: PROPERTY_ID,
      room: { ...room, status },
    })),
  ]) {
    assert.equal(canCreateAdminBookingLead(denied), false);
  }
});

test("form boundaries trim values, omit blank university, and enforce room gender", () => {
  assert.deepEqual(validateQuickBookingDraft(draft, "female"), {});
  assert.deepEqual(toAdminBookingLeadPayload(PROPERTY_ID, ROOM_ID, draft, "female"), {
    property_id: PROPERTY_ID,
    room_id: ROOM_ID,
    visitor_name: "Siti Aminah",
    gender: "female",
    visitor_address: "Jalan Melati 10",
    visitor_phone: "+62 812-3456-7890",
  });

  assert.ok(validateQuickBookingDraft({ ...draft, visitorName: "A" }, "female").visitorName);
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorAddress: "abc" }, "female").visitorAddress,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorUniversity: "X" }, "female").visitorUniversity,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorPhone: "0812abc" }, "female").visitorPhone,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorName: "x".repeat(121) }, "female").visitorName,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorAddress: "x".repeat(501) }, "female")
      .visitorAddress,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorUniversity: "x".repeat(161) }, "female")
      .visitorUniversity,
  );
  assert.ok(
    validateQuickBookingDraft({ ...draft, visitorPhone: "1".repeat(33) }, "female").visitorPhone,
  );
  assert.ok(validateQuickBookingDraft({ ...draft, gender: "male" }, "female").gender);
  assert.ok(validateQuickBookingDraft({ ...draft, gender: "" }, "mixed").gender);
  assert.deepEqual(
    validateQuickBookingDraft(
      {
        visitorName: "x".repeat(120),
        gender: "male",
        visitorAddress: "x".repeat(500),
        visitorUniversity: "x".repeat(160),
        visitorPhone: "+62 (812) 34-56",
      },
      "mixed",
    ),
    {},
  );
});

test("payload remains the exact seven-key server-authority contract", () => {
  const payload = toAdminBookingLeadPayload(
    PROPERTY_ID,
    ROOM_ID,
    { ...draft, visitorUniversity: "Universitas Granada" },
    "female",
  );
  assert.deepEqual(Object.keys(payload).sort(), [
    "gender",
    "property_id",
    "room_id",
    "visitor_address",
    "visitor_name",
    "visitor_phone",
    "visitor_university",
  ]);
  for (const forbidden of [
    "category",
    "building",
    "floor",
    "room_number",
    "status",
    "source",
    "metadata",
    "actor",
  ]) {
    assert.equal(forbidden in payload, false);
  }
});

test("parser accepts only the exact 19-field record and copies its whitelist", () => {
  const parsed = parseAdminBookingLead(record);
  assert.deepEqual(parsed, record);
  assert.notEqual(parsed, record);
  assert.equal(Object.keys(parsed).length, 19);
});

test("parser rejects missing, extra, invalid enum, and invalid nullability", async () => {
  assert.deepEqual(parseAdminBookingLead(record), record);
  const { roomNumber: _roomNumber, ...missing } = record;
  for (const invalid of [
    missing,
    { ...record, metadata: {} },
    { ...record, status: "pending" },
    { ...record, source: "internal" },
    { ...record, category: "other" },
    { ...record, gender: "mixed" },
    { ...record, floorCode: "C" },
    { ...record, id: "not-a-uuid" },
    { ...record, roomId: "" },
    { ...record, buildingCode: "" },
    { ...record, visitorUniversity: "" },
    { ...record, preferredMoveInDate: "2026-02-30" },
    { ...record, createdAt: "not-a-timestamp" },
    { ...record, visitorAddress: undefined },
  ]) {
    assert.throws(() => parseAdminBookingLead(invalid));
  }
  await assert.rejects(requestAdminBookingLeads(async () => record, PROPERTY_ID));
});

test("request helpers bind exact endpoints, stable idempotency, parsers, and property scope", async () => {
  const calls: Array<{ method: string; path: string; body?: unknown; options: unknown }> = [];
  const listed = await requestAdminBookingLeads(
    async (path, options) => {
      calls.push({ method: "GET", path, options });
      return [record];
    },
    PROPERTY_ID,
    { status: "new", limit: 20 },
  );
  const created = await requestCreateAdminBookingLead(
    async (path, body, options) => {
      calls.push({ method: "POST", path, body, options });
      return record;
    },
    {
      propertyId: PROPERTY_ID,
      roomId: ROOM_ID,
      genderPolicy: "female",
      draft,
      idempotencyKey: "idem-logical-submit",
    },
  );
  const updated = await requestUpdateAdminBookingLeadStatus(
    async (path, body, options) => {
      calls.push({ method: "PATCH", path, body, options });
      return { ...record, status: "contacted" };
    },
    record.id,
    "contacted",
    "idem-status",
  );

  assert.deepEqual(listed, [record]);
  assert.deepEqual(created, record);
  assert.equal(updated.status, "contacted");
  assert.equal(calls[0].path, "/booking-leads");
  assert.equal(
    (calls[0].options as { query: Record<string, unknown> }).query.property_id,
    PROPERTY_ID,
  );
  assert.deepEqual(calls[1], {
    method: "POST",
    path: "/booking-leads",
    body: {
      property_id: PROPERTY_ID,
      room_id: ROOM_ID,
      visitor_name: "Siti Aminah",
      gender: "female",
      visitor_address: "Jalan Melati 10",
      visitor_phone: "+62 812-3456-7890",
    },
    options: { idempotencyKey: "idem-logical-submit" },
  });
  assert.deepEqual(calls[2], {
    method: "PATCH",
    path: `/booking-leads/${record.id}/status`,
    body: { status: "contacted" },
    options: { idempotencyKey: "idem-status" },
  });
  assert.deepEqual(bookingLeadListScopeKey(PROPERTY_ID), [
    "booking-leads",
    "list",
    { propertyId: PROPERTY_ID },
  ]);
  assert.equal(JSON.stringify(bookingLeadListScopeKey(PROPERTY_ID)).includes("Siti"), false);

  await assert.rejects(
    requestCreateAdminBookingLead(async () => ({ ...record, metadata: {} }), {
      propertyId: PROPERTY_ID,
      roomId: ROOM_ID,
      genderPolicy: "female",
      draft,
      idempotencyKey: "idem-malformed",
    }),
  );
});

test("hooks parse before cache and create with scope, idempotency, invalidation, and success UX", () => {
  const listHook = source("hooks/useBookingLeads.ts");
  const mutations = source("hooks/useBookingLeadMutations.ts");
  const dialog = source("components/booking-leads/QuickBookingDialog.tsx");

  assert.match(listHook, /requestAdminBookingLeads\(/);
  assert.match(listHook, /propertyId:\s*currentPropertyId/);
  assert.match(mutations, /requestCreateAdminBookingLead\(/);
  assert.match(mutations, /requestUpdateAdminBookingLeadStatus\(/);
  assert.match(mutations, /input\.propertyId !== currentPropertyId/);
  assert.equal(mutations.match(/bookingLeadListScopeKey\(lead\.propertyId\)/g)?.length, 2);
  assert.doesNotMatch(mutations, /bookingLeadListScopeKey\(currentPropertyId\)/);
  assert.match(dialog, /to:\s*"\/booking-leads"/);
  assert.match(dialog, /currentPropertyId !== propertyAtOpen\.current/);
  assert.match(dialog, /submissionKey\.current \?\? newIdempotencyKey\(\)/);
  assert.match(dialog, /idempotencyKey,/);
  assert.match(dialog, /createLead\.isPending/);
});

test("shared room table exposes quick entry only through the eligibility boundary", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const actionStart = page.indexOf("{canCreateAdminBookingLead(");
  const actionEnd = page.indexOf("</DropdownMenuItem>", actionStart);
  assert.notEqual(actionStart, -1);
  assert.notEqual(actionEnd, -1);
  const actionRegion = page.slice(actionStart, actionEnd);
  assert.match(actionRegion, /room\.status === "vacant"/);
  assert.match(actionRegion, /Catat minat booking/);
  assert.match(actionRegion, /setQuickBookingRoom\(room\)/);
  assert.match(page, /<QuickBookingDialog/);
  assert.match(page, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(page, /export function RoomInventoryTable/);
  assert.match(source("routes/rooms/index.tsx"), /<RoomInventoryTable/);
  assert.doesNotMatch(page, /apiClient\.(post|patch|put|delete)/);
});

test("dialog copy, fields, locked gender policy, and exact request authority are explicit", () => {
  const dialog = source("components/booking-leads/QuickBookingDialog.tsx");
  assert.match(dialog, /Minat booking belum mereservasi kamar/);
  assert.match(dialog, /status kamar tetap Kosong/);
  for (const label of [
    "Nama calon penghuni",
    "Jenis kelamin",
    "Alamat",
    "Universitas",
    "Nomor WhatsApp",
  ]) {
    assert.match(dialog, new RegExp(label));
  }
  assert.match(dialog, /genderPolicy !== "mixed"/);
  assert.match(dialog, /room\?\.id !== roomAtOpen\.current/);
  assert.match(dialog, /createLead\.reset\(\)|resetCreateLead\(\)/);
  assert.equal(dialog.match(/aria-describedby=/g)?.length, 5);
  assert.match(dialog, /role="alert"/);
  assert.doesNotMatch(dialog, /room_status|created_by|metadata/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|console\.|telemetry/i);
});

test("lead UI renders quick source and nullable admin fields without leaking roomId to UI or WhatsApp", () => {
  const hook = source("hooks/useBookingLeads.ts");
  const route = source("routes/booking-leads.tsx");
  assert.match(hook, /admin_quick_entry:\s*"Input cepat Admin"/);
  assert.match(route, /roomNumber/);
  assert.match(route, /visitorAddress/);
  assert.match(route, /visitorUniversity/);
  assert.doesNotMatch(route, /\broomId\b/);
  assert.match(route, /target="_blank" rel="noopener noreferrer"/);
  const whatsAppStart = route.indexOf("function whatsAppUrlFor");
  const whatsAppEnd = route.indexOf("function BookingLeadsPage", whatsAppStart);
  const whatsAppRegion = route.slice(whatsAppStart, whatsAppEnd);
  assert.notEqual(whatsAppStart, -1);
  assert.notEqual(whatsAppEnd, -1);
  assert.match(whatsAppRegion, /buildLeadWhatsAppUrl\(/);
  assert.doesNotMatch(
    whatsAppRegion,
    /roomId|roomNumber|visitorAddress|visitorUniversity|buildingCode|floorCode/,
  );
  assert.match(route, /halaman publik \/kamar atau input cepat Admin/);
  assert.doesNotMatch(
    `${hook}\n${source("hooks/useBookingLeadMutations.ts")}`,
    /localStorage|sessionStorage|console\.|telemetry/i,
  );
});

test("quick entry contains no room lifecycle mutation and leaves routeTree untouched", () => {
  const contract = source("lib/admin-booking-lead.ts");
  const mutations = source("hooks/useBookingLeadMutations.ts");
  const dialog = source("components/booking-leads/QuickBookingDialog.tsx");
  const postTargets = [...contract.matchAll(/await post\(\s*(["'`][^"'`]+["'`])/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(postTargets, ['"/booking-leads"']);
  assert.doesNotMatch(dialog, /apiClient\.(post|patch|put|delete)/);
  assert.doesNotMatch(mutations, /apiClient\.(put|delete)/);
  assert.doesNotMatch(`${contract}\n${mutations}\n${dialog}`, /room_status|Midtrans|webhook/i);
  assert.equal(source("routeTree.gen.ts").includes("QuickBookingDialog"), false);
});
