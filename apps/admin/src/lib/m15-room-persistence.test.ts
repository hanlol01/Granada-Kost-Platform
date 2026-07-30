import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ApiError } from "@granada-kost/api-client";
import ts from "typescript";
import {
  parseRoomInventoryMutationEnvelope,
  toRoomPersistenceBody,
  type RoomInventory,
  type RoomInventoryUpdateInput,
} from "./admin-ux-master-api";
import {
  hasAuthoritativeRoomReferences,
  hasRoomWriteAuthority,
  normalizeRoomCreateRequest,
  roomStructuralEditLocked,
} from "./admin-ux-master-helpers";
import { roomPersistenceInvalidationKeys } from "./admin-ux-query-keys";
import {
  resolveRoomMutationIntent,
  roomPersistenceErrorMessage,
  roomPersistenceScopeMatches,
  roomMutationFingerprint,
  runRoomSubmissionOnce,
  type ActiveRoomSubmission,
  type RoomPersistenceRequest,
} from "../hooks/useAdminUxMaster";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ROOM_ID = "88888888-8888-4888-8888-888888888888";
const BUILDING_ID = "44444444-4444-4444-8444-444444444444";
const KOST_TYPE_ID = "55555555-5555-4555-8555-555555555555";
const FACILITY_ID = "66666666-6666-4666-8666-666666666666";
const CATEGORY_ID = "77777777-7777-4777-8777-777777777777";

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function functionText(text: string, fileName: string, name: string): string {
  const parsed = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics = (parsed as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  assert.equal(diagnostics?.length ?? 0, 0, `${fileName} must parse`);
  const matches: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(matches.length, 1, `expected one ${name}`);
  return matches[0]!.getText(parsed);
}

function jsxElements(text: string, fileName: string, tagName: string): ts.JsxOpeningLikeElement[] {
  const parsed = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics = (parsed as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  assert.equal(diagnostics?.length ?? 0, 0, `${fileName} must parse`);
  const matches: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(parsed) === tagName
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return matches;
}

function stringJsxAttribute(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  return attribute && attribute.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : undefined;
}

function roomWire(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOM_ID,
    property_id: PROPERTY_ID,
    number: "RK-01-99",
    room_code: "RK-01-99",
    building_id: BUILDING_ID,
    building_code: "RK-01",
    building_name: "RuKost 01",
    unit_code: null,
    gender_policy: "male",
    floor: "1",
    floor_code: "B",
    floor_label: "Lantai Bawah / LT.1",
    size_label: "3 × 4 m",
    status: "vacant",
    primary_photo_file_id: null,
    public_visible: true,
    created_at: "2026-07-28T00:00:00.000Z",
    updated_at: "2026-07-28T00:00:00.000Z",
    kost_type: {
      id: KOST_TYPE_ID,
      name: "Rumah Kost",
      slug: "rukost",
      category: "rukost",
      monthly_price: 1_800_000,
      yearly_price: 0,
      deposit_amount: 0,
      facilities: [
        {
          id: FACILITY_ID,
          name: "Kasur",
          icon: null,
          description: null,
          category_id: CATEGORY_ID,
          sort_order: 0,
        },
      ],
    },
    active_lease: null,
    ...overrides,
  };
}

const updateInput = {
  kostTypeId: KOST_TYPE_ID,
  number: "RK-01-99",
  roomCode: null,
  buildingId: BUILDING_ID,
  floorCode: "B" as const,
  unitCode: null,
  sizeLabel: "3 × 4 m",
  primaryPhotoFileId: null,
  publicVisible: true,
};

test("create query accepts only exact true and write authority is fail-closed", () => {
  assert.equal(normalizeRoomCreateRequest(true), true);
  assert.equal(normalizeRoomCreateRequest("true"), true);
  for (const value of [false, "false", "1", "yes", 1, {}, null, undefined]) {
    assert.equal(normalizeRoomCreateRequest(value), false);
  }
  for (const role of ["owner", "manager", "admin"]) {
    assert.equal(hasRoomWriteAuthority([role], true, PROPERTY_ID), true);
  }
  for (const role of ["property_owner", "resident", "technician"]) {
    assert.equal(hasRoomWriteAuthority([role], true, PROPERTY_ID), false);
  }
  assert.equal(hasRoomWriteAuthority(["admin"], false, PROPERTY_ID), false);
  assert.equal(hasRoomWriteAuthority(["admin"], true, null), false);
});

test("dashboard and room summaries expose no routine create affordance", () => {
  const dashboard = source("routes/index.tsx");
  const rooms = source("routes/rooms/index.tsx");
  assert.doesNotMatch(dashboard, /RoomCreateCategoryMenu|Tambah Kamar/);
  assert.doesNotMatch(rooms, /RoomCreateCategoryMenu|Tambah Kamar/);
});

test("category routes canonicalize legacy create query without opening an editor", () => {
  for (const file of ["routes/rooms/rumah-kost.tsx", "routes/rooms/apart-kost.tsx"]) {
    const route = source(file);
    assert.match(route, /create:\s*normalizeRoomCreateRequest\(raw\.create\) \|\| undefined/);
    assert.match(route, /if \(search\.create\)/);
    assert.match(route, /replace:\s*true/);
    assert.match(route, /create:\s*undefined/);
    assert.doesNotMatch(route, /createRequested|onCreateConsumed/);
  }
});

test("update body contains only canonical physical fields", () => {
  const updateBody = toRoomPersistenceBody(updateInput);
  assert.equal("property_id" in updateBody, false);
  for (const forbidden of [
    "gender_policy",
    "category",
    "status",
    "floor",
    "floor_label",
    "monthly_price",
    "yearly_price",
    "deposit_amount",
    "facility_ids",
    "actor_id",
  ]) {
    assert.equal(forbidden in updateBody, false, forbidden);
  }
  const sparse = toRoomPersistenceBody({
    number: undefined,
    roomCode: null,
    sizeLabel: undefined,
  } as RoomInventoryUpdateInput);
  assert.deepEqual(sparse, { room_code: null });
});

test("mutation parser accepts only the exact V2 envelope and UUID-safe whitelist", () => {
  const parsed = parseRoomInventoryMutationEnvelope({ data: roomWire() });
  assert.equal(parsed.id, ROOM_ID);
  assert.equal(parsed.propertyId, PROPERTY_ID);
  assert.deepEqual(Object.keys(parsed).sort(), [
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
  assert.throws(() => parseRoomInventoryMutationEnvelope(roomWire()));
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire(), meta: {} }));
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire({ raw_payload: {} }) }));
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire({ id: "not-a-uuid" }) }));
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({ data: roomWire({ public_visible: 1 }) }),
  );
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire({ floor_code: "C" }) }));
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({ data: roomWire({ gender_policy: "mixed" }) }),
  );
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({ data: roomWire({ gender_policy: null }) }),
  );
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire({ floor_code: null }) }));
  assert.throws(() => parseRoomInventoryMutationEnvelope({ data: roomWire({ floor: "2" }) }));
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({ data: roomWire({ primary_photo_file_id: "" }) }),
  );
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({
      data: roomWire({
        kost_type: {
          ...(roomWire().kost_type as object),
          facilities: [
            {
              ...((roomWire().kost_type as { facilities: object[] }).facilities[0] as object),
              category_id: "",
            },
          ],
        },
      }),
    }),
  );
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({
      data: roomWire({ active_lease: { lease_code: null, resident_name: null } }),
    }),
  );
  assert.throws(() =>
    parseRoomInventoryMutationEnvelope({
      data: roomWire({
        kost_type: { ...(roomWire().kost_type as object), monthly_price: 1.5 },
      }),
    }),
  );
});

test("logical retries reuse one key while payload and scope changes rotate it", () => {
  let sequence = 0;
  const createKey = () => `key-${++sequence}`;
  const base: RoomPersistenceRequest = {
    kind: "update",
    propertyId: PROPERTY_ID,
    category: "rukost",
    roomId: ROOM_ID,
    input: updateInput,
  };
  const firstFingerprint = roomMutationFingerprint(base);
  const first = resolveRoomMutationIntent(null, firstFingerprint, createKey);
  const retry = resolveRoomMutationIntent(first, roomMutationFingerprint(base), createKey);
  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.equal(sequence, 1);

  const changed = resolveRoomMutationIntent(
    retry,
    roomMutationFingerprint({ ...base, input: { ...updateInput, number: "RK-01-100" } }),
    createKey,
  );
  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
  const changedProperty = resolveRoomMutationIntent(
    changed,
    roomMutationFingerprint({
      ...base,
      propertyId: OTHER_PROPERTY_ID,
    }),
    createKey,
  );
  assert.notEqual(changedProperty.idempotencyKey, changed.idempotencyKey);

  const updateBase: RoomPersistenceRequest = {
    kind: "update",
    propertyId: PROPERTY_ID,
    category: "rukost",
    roomId: ROOM_ID,
    input: updateInput,
  };
  const update = resolveRoomMutationIntent(null, roomMutationFingerprint(updateBase), createKey);
  const changedRoom = resolveRoomMutationIntent(
    update,
    roomMutationFingerprint({ ...updateBase, roomId: OTHER_ROOM_ID }),
    createKey,
  );
  assert.notEqual(changedRoom.idempotencyKey, update.idempotencyKey);
});

test("synchronous submission guard deduplicates one intent and isolates scope reset", async () => {
  let calls = 0;
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstDeferred = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const secondDeferred = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const active: { current: ActiveRoomSubmission<void> | null } = { current: null };
  const firstRequester = () => {
    calls += 1;
    return firstDeferred;
  };
  const first = runRoomSubmissionOnce(active, "scope-a", firstRequester);
  const duplicate = runRoomSubmissionOnce(active, "scope-a", firstRequester);
  assert.equal(first, duplicate);
  assert.equal(calls, 1);

  await assert.rejects(
    () => runRoomSubmissionOnce(active, "changed-payload", firstRequester),
    /ROOM_SUBMISSION_IN_PROGRESS/,
  );
  assert.equal(calls, 1);

  active.current = null;
  const second = runRoomSubmissionOnce(active, "scope-b", () => {
    calls += 1;
    return secondDeferred;
  });
  assert.equal((active.current as ActiveRoomSubmission<void> | null)?.fingerprint, "scope-b");
  assert.equal(calls, 2);

  releaseFirst();
  await first;
  assert.equal((active.current as ActiveRoomSubmission<void> | null)?.fingerprint, "scope-b");
  releaseSecond();
  await second;
  assert.equal(active.current, null);
});

test("scope, authoritative references, lifecycle, and safe recovery are behavioral", () => {
  const request: RoomPersistenceRequest = {
    kind: "update",
    propertyId: PROPERTY_ID,
    category: "rukost",
    roomId: ROOM_ID,
    input: updateInput,
  };
  assert.equal(
    roomPersistenceScopeMatches(
      { propertyId: PROPERTY_ID, category: "rukost", enabled: true },
      request,
    ),
    true,
  );
  for (const scope of [
    { propertyId: OTHER_PROPERTY_ID, category: "rukost" as const, enabled: true },
    { propertyId: PROPERTY_ID, category: "apartkost" as const, enabled: true },
    { propertyId: PROPERTY_ID, category: "rukost" as const, enabled: false },
    { propertyId: null, category: "rukost" as const, enabled: true },
  ]) {
    assert.equal(roomPersistenceScopeMatches(scope, request), false);
  }

  assert.deepEqual(
    hasAuthoritativeRoomReferences(BUILDING_ID, KOST_TYPE_ID, [BUILDING_ID], [KOST_TYPE_ID]),
    { building: true, kostType: true },
  );
  assert.deepEqual(
    hasAuthoritativeRoomReferences("stale", "stale", [BUILDING_ID], [KOST_TYPE_ID]),
    {
      building: false,
      kostType: false,
    },
  );

  type LifecycleRoom = Pick<RoomInventory, "status" | "activeLease" | "activeOccupancy">;
  const lifecycleRoom = (overrides: Partial<LifecycleRoom>): LifecycleRoom => ({
    status: "vacant",
    activeLease: null,
    activeOccupancy: null,
    ...overrides,
  });
  assert.equal(roomStructuralEditLocked(lifecycleRoom({})), false);
  assert.equal(roomStructuralEditLocked(lifecycleRoom({ status: "reserved" })), true);
  assert.equal(roomStructuralEditLocked(lifecycleRoom({ status: "occupied" })), true);
  assert.equal(
    roomStructuralEditLocked(
      lifecycleRoom({ activeLease: { leaseCode: undefined, residentName: undefined } }),
    ),
    true,
  );
  assert.equal(
    roomStructuralEditLocked(
      lifecycleRoom({
        activeOccupancy: {
          id: ROOM_ID,
          residentId: OTHER_ROOM_ID,
          residentName: undefined,
          startDate: undefined,
        },
      }),
    ),
    true,
  );

  assert.match(
    roomPersistenceErrorMessage(
      new ApiError({ code: "ROOM_STRUCTURAL_EDIT_BLOCKED", message: "raw", status: 409 }),
    ),
    /tidak dapat diubah selama booking, hunian, atau penyewaan masih aktif/,
  );
  assert.doesNotMatch(
    roomPersistenceErrorMessage(
      new ApiError({ code: "ROOM_STRUCTURAL_EDIT_BLOCKED", message: "raw secret", status: 409 }),
    ),
    /raw secret/,
  );
});

test("room persistence invalidation is exact and property-scoped", () => {
  assert.deepEqual(roomPersistenceInvalidationKeys(PROPERTY_ID, ROOM_ID), [
    ["rooms", PROPERTY_ID],
    ["room", PROPERTY_ID, ROOM_ID],
    ["roomAvailability", PROPERTY_ID],
    ["kostTypes", PROPERTY_ID],
    ["dashboard", "summary", PROPERTY_ID],
  ]);
  assert.equal(
    JSON.stringify(roomPersistenceInvalidationKeys(PROPERTY_ID, ROOM_ID)).includes(
      OTHER_PROPERTY_ID,
    ),
    false,
  );
});

test("room requester uses strict mutation parsing and preserves generic mutation semantics", () => {
  const api = source("lib/admin-ux-master-api.ts");
  const roomsApi = api.slice(api.indexOf("rooms: {"), api.indexOf("updateStatus:"));
  assert.doesNotMatch(roomsApi, /\.post<unknown>/);
  assert.match(roomsApi, /\.patch<unknown>/);
  assert.equal((roomsApi.match(/toRoomPersistenceBody/g) ?? []).length, 1);
  assert.doesNotMatch(roomsApi, /toRoomInventoryBody/);
  assert.equal((roomsApi.match(/\.then\(parseRoomInventoryMutationEnvelope\)/g) ?? []).length, 1);
  assert.doesNotMatch(roomsApi, /data<RoomInventory>/);

  const hooks = source("hooks/useAdminUxMaster.ts");
  const genericMutation = functionText(hooks, "useAdminUxMaster.ts", "useM4Mutation");
  assert.match(genericMutation, /newIdempotencyKey\(\)/);
  assert.match(genericMutation, /invalidateAdminUxMutation/);
});

test("editor authority, scope reset, and stale-success close are explicit", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const inventoryPage = functionText(page, "KostTypeInventoryPage.tsx", "KostTypeInventoryPage");
  const editor = functionText(page, "KostTypeInventoryPage.tsx", "RoomInventoryEditor");
  const validator = functionText(page, "KostTypeInventoryPage.tsx", "validateRoomDraft");
  assert.match(inventoryPage, /hasRoomWriteAuthority/);
  assert.match(inventoryPage, /canPersistRoom/);
  assert.doesNotMatch(inventoryPage, /setRoomEditor\("create"\)|Tambah Kamar/);
  assert.match(inventoryPage, /if \(!canPersistRoom\) setRoomEditor\(null\)/);
  assert.match(inventoryPage, /setRoomEditor\(null\)/);
  assert.match(
    inventoryPage,
    /<RoomInventoryEditor[\s\S]*?key=\{`\$\{currentRoomScope\}:\$\{roomEditor\.id\}`\}/,
  );
  assert.match(validator, /hasAuthoritativeRoomReferences/);
  assert.match(editor, /beforeRequest\.canPersist/);
  assert.match(editor, /current\.propertyId === propertyId/);
  assert.match(editor, /current\.category === category/);
  assert.match(editor, /current\.roomId === roomId/);
  assert.match(editor, /discardIntent\(\)/);

  const hooks = source("hooks/useAdminUxMaster.ts");
  const mutationHook = functionText(hooks, "useAdminUxMaster.ts", "useRoomPersistenceMutation");
  assert.ok((mutationHook.match(/roomPersistenceScopeMatches/g) ?? []).length >= 3);
  assert.match(mutationHook, /activeRef\.current = null/);
  assert.match(
    mutationHook,
    /if \(roomPersistenceScopeMatches\(scopeRef\.current, request\)\) \{[\s\S]*?toast\.success/,
  );
  assert.match(
    mutationHook,
    /onError:[\s\S]*?if \(roomPersistenceScopeMatches\(scopeRef\.current, request\)\) \{[\s\S]*?toast\.error/,
  );

  const withoutScopeCheck = editor.replace("current.propertyId === propertyId &&", "");
  assert.doesNotMatch(withoutScopeCheck, /current\.propertyId === propertyId/);
});

test("editor renders authoritative gender, exact floors, and no forbidden payload fields", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const editor = functionText(page, "KostTypeInventoryPage.tsx", "RoomInventoryEditor");
  const body = functionText(page, "KostTypeInventoryPage.tsx", "roomInputFromDraft");
  assert.match(editor, /selectedBuilding\.genderPolicy === "male"/);
  assert.match(editor, /Lantai Bawah \/ Lantai 1/);
  assert.match(editor, /Lantai Atas \/ Lantai 2/);
  assert.doesNotMatch(editor, /<SelectItem value="mixed">/);
  assert.doesNotMatch(body, /genderPolicy|category|floorLabel|monthlyPrice|depositAmount|facilit/);
  assert.match(body, /floorCode: draft\.floorCode/);
  assert.match(editor, /roomStructuralEditLocked\(room\)/);
  assert.match(editor, /disabled=\{pending \|\| structuralLocked\}/);
  assert.match(editor, /Identitas dan lokasi kamar dikunci/);
});

test("editor has associated labels, inline errors, pending locks, and responsive semantic Sheet", () => {
  const page = source("components/rooms/KostTypeInventoryPage.tsx");
  const editor = functionText(page, "KostTypeInventoryPage.tsx", "RoomInventoryEditor");
  const field = functionText(page, "KostTypeInventoryPage.tsx", "RoomFormField");
  assert.match(field, /htmlFor=\{id\}/);
  assert.match(field, /\$\{id\}-error/);
  assert.match(field, /role="alert"/);
  assert.match(editor, /aria-invalid/);
  assert.match(editor, /aria-describedby/);
  assert.match(editor, /requestAnimationFrame/);
  assert.match(editor, /disabled=\{pending\}/);
  assert.match(editor, /!pending && onOpenChange\(next\)/);
  assert.match(editor, /w-full max-w-full overflow-x-hidden/);
  assert.match(editor, /sm:max-w-2xl lg:max-w-3xl/);
  assert.match(editor, /border-border bg-background text-foreground/);
  assert.match(editor, /min-h-11/);
  assert.doesNotMatch(editor, /slate-/);
});
