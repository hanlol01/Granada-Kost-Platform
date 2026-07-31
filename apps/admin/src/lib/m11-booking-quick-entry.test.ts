import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
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
import { normalizeWhatsAppPhone } from "./whatsapp-lead";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

type ParsedSourceFile = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

function parseTsx(text: string, fileName: string): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  ) as ParsedSourceFile;
  assert.equal(sourceFile.parseDiagnostics?.length ?? 0, 0, `${fileName} must be valid TSX`);
  return sourceFile;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function findFunction(sourceFile: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const matches: ts.FunctionDeclaration[] = [];
  visit(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
  });
  assert.equal(matches.length, 1, `expected exactly one ${name} function`);
  return matches[0]!;
}

function jsxName(node: JsxNode): string | undefined {
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return ts.isIdentifier(tagName) ? tagName.text : undefined;
}

function jsxNodes(scope: ts.Node, name: string): JsxNode[] {
  const matches: JsxNode[] = [];
  visit(scope, (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && jsxName(node) === name) {
      matches.push(node);
    }
  });
  return matches;
}

function directJsxChildren(element: ts.JsxElement): JsxNode[] {
  return element.children.filter(
    (child): child is JsxNode => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child),
  );
}

function exactDirectChild(element: ts.JsxElement, name: string): JsxNode {
  const matches = directJsxChildren(element).filter((child) => jsxName(child) === name);
  assert.equal(matches.length, 1, `<${jsxName(element)}> must directly contain one <${name}>`);
  return matches[0]!;
}

function jsxFromExpression(expression: ts.Expression, label: string): JsxNode {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  assert.ok(
    ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current),
    `${label} must return JSX directly`,
  );
  return current;
}

function directReturnJsx(block: ts.Block, label: string): JsxNode {
  const returns = block.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, `${label} must have exactly one direct return`);
  assert.ok(returns[0]!.expression, `${label} return must have an expression`);
  return jsxFromExpression(returns[0]!.expression, label);
}

function statementReturnJsx(statement: ts.Statement, label: string): JsxNode {
  if (ts.isBlock(statement)) return directReturnJsx(statement, label);
  assert.ok(ts.isReturnStatement(statement), `${label} must return directly`);
  assert.ok(statement.expression, `${label} return must have an expression`);
  return jsxFromExpression(statement.expression, label);
}

function assertPersistentPropertyProviderTopology(text: string): void {
  const sourceFile = parseTsx(text, "__root.tsx");
  const root = findFunction(sourceFile, "RootComponent");
  const guarded = findFunction(sourceFile, "GuardedOutlet");

  assert.equal(jsxNodes(sourceFile, "PropertyProvider").length, 1, "exactly one provider allowed");
  assert.equal(jsxNodes(root, "PropertyProvider").length, 1, "provider must live in RootComponent");
  assert.equal(
    jsxNodes(guarded, "PropertyProvider").length,
    0,
    "GuardedOutlet must not own provider",
  );

  assert.ok(root.body);
  const queryProvider = directReturnJsx(root.body, "RootComponent");
  assert.equal(jsxName(queryProvider), "QueryClientProvider");
  assert.ok(ts.isJsxElement(queryProvider));
  const authProvider = exactDirectChild(queryProvider, "AuthProvider");
  assert.ok(ts.isJsxElement(authProvider));
  const propertyProvider = exactDirectChild(authProvider, "PropertyProvider");
  assert.ok(ts.isJsxElement(propertyProvider));
  assert.equal(jsxName(exactDirectChild(propertyProvider, "GuardedOutlet")), "GuardedOutlet");
  assert.equal(jsxNodes(authProvider, "Toaster").length, 1, "Toaster must remain mounted");

  assert.ok(guarded.body);
  const publicBranches = guarded.body.statements.filter(
    (statement): statement is ts.IfStatement =>
      ts.isIfStatement(statement) &&
      statement.expression.getText(sourceFile) === "PUBLIC_ROUTES.has(pathname)",
  );
  assert.equal(publicBranches.length, 1, "public route branch must remain explicit");
  const publicOutlet = statementReturnJsx(publicBranches[0]!.thenStatement, "public route branch");
  assert.equal(jsxName(publicOutlet), "Outlet");
  assert.ok(ts.isJsxSelfClosingElement(publicOutlet));
  assert.equal(publicOutlet.attributes.properties.length, 0, "public Outlet must remain direct");

  const protectedReturns = guarded.body.statements.filter(ts.isReturnStatement);
  assert.equal(protectedReturns.length, 1, "GuardedOutlet must have one protected direct return");
  assert.ok(protectedReturns[0]!.expression);
  const authGuard = jsxFromExpression(protectedReturns[0]!.expression, "protected route branch");
  assert.ok(ts.isJsxElement(authGuard) && jsxName(authGuard) === "AuthGuard");
  const boundary = exactDirectChild(authGuard, "RouteAccessBoundary");
  assert.ok(ts.isJsxElement(boundary));
  assert.equal(jsxName(exactDirectChild(boundary, "Outlet")), "Outlet");
}

function classTokens(node: JsxNode): Set<string> {
  const element = ts.isJsxElement(node) ? node.openingElement : node;
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "className",
  );
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer)
    ? new Set(attribute.initializer.text.split(/\s+/u))
    : new Set();
}

function hasLeadSourceExpression(node: JsxNode): boolean {
  const element = ts.isJsxElement(node) ? node.openingElement : node;
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "source",
  );
  const expression =
    attribute?.initializer && ts.isJsxExpression(attribute.initializer)
      ? attribute.initializer.expression
      : undefined;
  return (
    expression !== undefined &&
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "lead" &&
    expression.name.text === "source"
  );
}

function leadMapItemRoot(collection: ts.JsxElement, label: string): JsxNode {
  const maps: ts.CallExpression[] = [];
  visit(collection, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "leads" &&
      node.expression.name.text === "map"
    ) {
      maps.push(node);
    }
  });
  assert.equal(maps.length, 1, `${label} collection must have one leads.map`);
  const callback = maps[0]!.arguments[0];
  assert.ok(
    callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)),
    `${label} leads.map must use a function callback`,
  );
  return ts.isBlock(callback.body)
    ? directReturnJsx(callback.body, `${label} item callback`)
    : jsxFromExpression(callback.body, `${label} item callback`);
}

function assertLeadSourceBadgeCoverage(text: string): void {
  const sourceFile = parseTsx(text, "booking-leads.tsx");
  const page = findFunction(sourceFile, "BookingLeadsPage");
  const badge = findFunction(sourceFile, "LeadSourceBadge");
  assert.match(badge.getText(sourceFile), /BOOKING_LEAD_SOURCE_LABEL\[source\]\s*\?\?\s*source/u);

  const divs = jsxNodes(page, "div").filter(ts.isJsxElement);
  const desktop = divs.filter((node) => classTokens(node).has("md:block"));
  const mobile = divs.filter((node) => classTokens(node).has("md:hidden"));
  assert.equal(desktop.length, 1, "expected one desktop lead collection");
  assert.equal(mobile.length, 1, "expected one mobile lead collection");

  for (const [label, collection, itemName] of [
    ["desktop", desktop[0]!, "tr"],
    ["mobile", mobile[0]!, "article"],
  ] as const) {
    const item = leadMapItemRoot(collection, label);
    assert.equal(jsxName(item), itemName, `${label} filtered item root changed`);
    const badges = jsxNodes(item, "LeadSourceBadge").filter(hasLeadSourceExpression);
    assert.equal(badges.length, 1, `${label} lead item must render LeadSourceBadge`);
  }
}

function moveBadgeOutsideItem(text: string, viewportToken: "md:block" | "md:hidden"): string {
  const sourceFile = parseTsx(text, "booking-leads-mutation.tsx");
  const page = findFunction(sourceFile, "BookingLeadsPage");
  const collection = jsxNodes(page, "div")
    .filter(ts.isJsxElement)
    .find((node) => classTokens(node).has(viewportToken));
  assert.ok(collection);
  const item = leadMapItemRoot(collection, viewportToken);
  const badges = jsxNodes(item, "LeadSourceBadge").filter(hasLeadSourceExpression);
  assert.equal(badges.length, 1);
  const badge = badges[0]!;
  const badgeText = badge.getText(sourceFile);
  const start = badge.getStart(sourceFile);
  const end = badge.getEnd();
  const withoutBadge = text.slice(0, start) + text.slice(end);
  const closingStart = collection.closingElement.getStart(sourceFile) - (end - start);
  return (
    withoutBadge.slice(0, closingStart) +
    `<div>${badgeText}</div>` +
    withoutBadge.slice(closingStart)
  );
}

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

  assert.match(listHook, /requestAdminBookingLeadPage\(/);
  assert.match(listHook, /propertyId:\s*currentPropertyId/);
  assert.match(mutations, /requestCreateAdminBookingLead\(/);
  assert.match(mutations, /requestUpdateAdminBookingLeadStatusCommand\(/);
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
  const detail = source("components/booking-leads/BookingLeadDetailsDialog.tsx");
  assert.match(hook, /admin_quick_entry:\s*"Input cepat Admin"/);
  assert.match(route, /roomNumber/);
  assert.match(`${route}\n${detail}`, /visitorAddress/);
  assert.match(`${route}\n${detail}`, /visitorUniversity/);
  assert.doesNotMatch(`${route}\n${detail}`, /\broomId\b/);
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
  assert.match(route, /publik \/kamar dan input cepat Admin/);
  assert.doesNotMatch(
    `${hook}\n${source("hooks/useBookingLeadMutations.ts")}`,
    /localStorage|sessionStorage|console\.|telemetry/i,
  );
});

test("root keeps one persistent PropertyProvider around public and protected route transitions", () => {
  const root = source("routes/__root.tsx");
  assertPersistentPropertyProviderTopology(root);

  const oldProtectedTopology = `
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) return <Outlet />;
      return <AuthGuard><PropertyProvider><RouteAccessBoundary><Outlet /></RouteAccessBoundary></PropertyProvider></AuthGuard>;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider><GuardedOutlet /><Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  const unrelatedDecoy = `
    function Decoy() { return <PropertyProvider><GuardedOutlet /></PropertyProvider>; }
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) return <Outlet />;
      return <AuthGuard><RouteAccessBoundary><Outlet /></RouteAccessBoundary></AuthGuard>;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider><GuardedOutlet /><Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  const duplicateProvider = `
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) return <Outlet />;
      return <AuthGuard><RouteAccessBoundary><Outlet /></RouteAccessBoundary></AuthGuard>;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider><PropertyProvider><GuardedOutlet /></PropertyProvider><PropertyProvider><span /></PropertyProvider><Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  const conditionalProvider = `
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) return <Outlet />;
      return <AuthGuard><RouteAccessBoundary><Outlet /></RouteAccessBoundary></AuthGuard>;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider>{enabled ? <PropertyProvider><GuardedOutlet /></PropertyProvider> : <GuardedOutlet />}<Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  const publicBranchDecoy = `
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) {
        function PublicOutletDecoy() { return <Outlet />; }
      }
      return <AuthGuard><RouteAccessBoundary><Outlet /></RouteAccessBoundary></AuthGuard>;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider><PropertyProvider><GuardedOutlet /></PropertyProvider><Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  const protectedBranchDecoy = `
    function GuardedOutlet() {
      if (PUBLIC_ROUTES.has(pathname)) return <Outlet />;
      function ProtectedDecoy() {
        return <AuthGuard><RouteAccessBoundary><Outlet /></RouteAccessBoundary></AuthGuard>;
      }
      return <Outlet />;
    }
    function RootComponent() {
      return <QueryClientProvider><AuthProvider><PropertyProvider><GuardedOutlet /></PropertyProvider><Toaster /></AuthProvider></QueryClientProvider>;
    }
  `;
  assert.throws(() => assertPersistentPropertyProviderTopology(oldProtectedTopology));
  assert.throws(() => assertPersistentPropertyProviderTopology(unrelatedDecoy));
  assert.throws(() => assertPersistentPropertyProviderTopology(duplicateProvider));
  assert.throws(() => assertPersistentPropertyProviderTopology(conditionalProvider));
  assert.throws(() => assertPersistentPropertyProviderTopology(publicBranchDecoy));
  assert.throws(() => assertPersistentPropertyProviderTopology(protectedBranchDecoy));
});

test("lead source is visible on desktop and mobile while QA phone normalization stays exact", () => {
  const route = source("routes/booking-leads.tsx");
  assertLeadSourceBadgeCoverage(route);
  assert.equal("081111111111".replace(/\D+/gu, "").length, 12);
  assert.equal(normalizeWhatsAppPhone("081111111111"), "6281111111111");

  const sourceFile = parseTsx(route, "booking-leads.tsx");
  const page = findFunction(sourceFile, "BookingLeadsPage");
  const mobile = jsxNodes(page, "div")
    .filter(ts.isJsxElement)
    .find((node) => classTokens(node).has("md:hidden"));
  assert.ok(mobile);
  const mobileBadge = jsxNodes(mobile, "LeadSourceBadge").find(hasLeadSourceExpression);
  assert.ok(mobileBadge);
  const desktopOnlyMutation =
    route.slice(0, mobileBadge.getStart(sourceFile)) + route.slice(mobileBadge.getEnd());
  assert.throws(() => assertLeadSourceBadgeCoverage(desktopOnlyMutation));
  assert.throws(() => assertLeadSourceBadgeCoverage(moveBadgeOutsideItem(route, "md:block")));
  assert.throws(() => assertLeadSourceBadgeCoverage(moveBadgeOutsideItem(route, "md:hidden")));

  const labels = source("hooks/useBookingLeads.ts");
  assert.match(labels, /public_kamar:\s*"Publik \/kamar"/u);
  assert.match(labels, /admin_quick_entry:\s*"Input cepat Admin"/u);
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
