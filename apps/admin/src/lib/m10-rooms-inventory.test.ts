import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  parseRoomAvailabilityEnvelope,
  parseRoomInventoryListEnvelope,
} from "./admin-ux-master-api";
import {
  getRoomPaginationDisplay,
  normalizeRoomSearch,
  summarizeRoomInventory,
} from "./admin-ux-master-helpers";

const readAdminSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

type ParsedSourceFile = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

function parseTsx(source: string, fileName = "rooms/index.tsx"): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  ) as ParsedSourceFile;
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  assert.equal(diagnostics.length, 0, `${fileName} must be valid TSX`);
  return sourceFile;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function jsxAttribute(
  element: ts.JsxSelfClosingElement,
  name: string,
): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function findTotalMetric(sourceFile: ts.SourceFile): ts.JsxSelfClosingElement {
  const matches: ts.JsxSelfClosingElement[] = [];
  visit(sourceFile, (node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "SummaryMetric"
    ) {
      const label = jsxAttribute(node, "label");
      if (label?.initializer && ts.isStringLiteral(label.initializer)) {
        if (label.initializer.text === "Total inventori") matches.push(node);
      }
    }
  });
  assert.equal(matches.length, 1, "expected one total inventory SummaryMetric");
  return matches[0]!;
}

function totalMetricValueExpression(sourceFile: ts.SourceFile): ts.Expression {
  const value = jsxAttribute(findTotalMetric(sourceFile), "value");
  assert.ok(
    value?.initializer && ts.isJsxExpression(value.initializer) && value.initializer.expression,
    "total metric requires a value expression",
  );
  return value.initializer.expression;
}

function assertAuthoritativeTotalMetricWiring(source: string): void {
  const sourceFile = parseTsx(source);
  const valueExpression = totalMetricValueExpression(sourceFile);
  assert.ok(
    ts.isCallExpression(valueExpression) &&
      ts.isIdentifier(valueExpression.expression) &&
      valueExpression.expression.text === "String" &&
      valueExpression.arguments.length === 1 &&
      ts.isIdentifier(valueExpression.arguments[0]) &&
      valueExpression.arguments[0].text === "totalRooms",
    "total metric value must be exactly String(totalRooms)",
  );

  let summaryDeclaration: ts.VariableDeclaration | undefined;
  visit(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.some(
        (element) =>
          element.propertyName &&
          ts.isIdentifier(element.propertyName) &&
          element.propertyName.text === "totalInventory" &&
          ts.isIdentifier(element.name) &&
          element.name.text === "totalRooms",
      )
    ) {
      summaryDeclaration = node;
    }
  });
  assert.ok(summaryDeclaration, "totalRooms must alias totalInventory through destructuring");
  assert.ok(
    summaryDeclaration.initializer &&
      ts.isCallExpression(summaryDeclaration.initializer) &&
      ts.isIdentifier(summaryDeclaration.initializer.expression) &&
      summaryDeclaration.initializer.expression.text === "summarizeRoomInventory",
    "totalInventory must come from summarizeRoomInventory",
  );

  const summaryCall = summaryDeclaration.initializer;
  assert.equal(summaryCall.arguments.length, 3, "summary helper accepts exactly three inputs");
  const [property, availability, kostTypes] = summaryCall.arguments;
  assert.ok(
    ts.isBinaryExpression(property) &&
      property.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isIdentifier(property.left) &&
      property.left.text === "currentPropertyId" &&
      ts.isStringLiteral(property.right) &&
      property.right.text === "",
    "summary property input must be currentPropertyId ?? empty string",
  );
  assert.ok(
    ts.isBinaryExpression(availability) &&
      availability.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isPropertyAccessExpression(availability.left) &&
      ts.isIdentifier(availability.left.expression) &&
      availability.left.expression.text === "availabilityQuery" &&
      availability.left.name.text === "data" &&
      ts.isArrayLiteralExpression(availability.right) &&
      availability.right.elements.length === 0,
    "summary availability input must be availabilityQuery.data ?? []",
  );
  assert.ok(
    ts.isIdentifier(kostTypes) && kostTypes.text === "types",
    "summary kost type input must be property-scoped types",
  );
}

function assertCanonicalRoomDetailWiring(route: string, inventory: string): void {
  assert.doesNotMatch(route, /RoomDetailSheet|search\.roomId|\broomId\s*:/);
  assert.doesNotMatch(inventory, /RoomDetailSheet/);
  assert.equal(
    (
      inventory.match(
        /navigate\(\{\s*to:\s*"\/rooms\/\$roomNumber",\s*params:\s*\{\s*roomNumber:\s*room\.number\s*\},\s*\}\)/g,
      ) ?? []
    ).length,
    1,
    "room table must navigate exactly once to the canonical room-number detail route",
  );
}

test("room list and availability parsers accept only exact V2 envelopes", () => {
  assert.deepEqual(
    parseRoomInventoryListEnvelope({
      data: [],
      meta: { total: 163, limit: 20, offset: 0 },
    }),
    { items: [], total: 163, limit: 20, offset: 0 },
  );
  assert.deepEqual(
    parseRoomAvailabilityEnvelope({
      data: [
        {
          property_id: "property-a",
          status: "vacant",
          total: 80,
        },
      ],
    }),
    [{ propertyId: "property-a", status: "vacant", total: 80 }],
  );

  for (const invalid of [
    [],
    { items: [], meta: { total: 0, limit: 20, offset: 0 } },
    { data: [], meta: { total: 0, limit: 20, offset: 0 }, extra: true },
    { data: [], meta: { total: 0, limit: 20, offset: 0, cursor: null } },
    { data: [], meta: { total: -1, limit: 20, offset: 0 } },
  ]) {
    assert.throws(() => parseRoomInventoryListEnvelope(invalid));
  }

  for (const invalid of [
    [],
    { data: [], meta: {} },
    { data: [{ property_id: "property-a", status: "invalid", total: 1 }] },
    { data: [{ property_id: "property-a", status: "vacant", total: -1 }] },
    { data: [{ property_id: "property-a", status: "vacant", total: 1, extra: true }] },
  ]) {
    assert.throws(() => parseRoomAvailabilityEnvelope(invalid));
  }
});

test("room search defaults to all categories and bounds pagination", () => {
  assert.deepEqual(normalizeRoomSearch({}), {
    q: "",
    buildingId: undefined,
    floor: undefined,
    status: undefined,
    visibility: undefined,
    offset: 0,
    limit: 20,
  });
  assert.equal("roomId" in normalizeRoomSearch({ roomId: "legacy-room-id" }), false);
  assert.equal(normalizeRoomSearch({ category: "rukost" }).category, "rukost");
  assert.equal(normalizeRoomSearch({ category: "apartkost" }).category, "apartkost");
  assert.equal(normalizeRoomSearch({ category: "other" }).category, undefined);
});

test("authoritative summary ignores page rows and includes active plus inactive kost types", () => {
  const summary = summarizeRoomInventory(
    "property-a",
    [
      { propertyId: "property-a", status: "vacant", total: 80 },
      { propertyId: "property-a", status: "occupied", total: 83 },
      { propertyId: "property-b", status: "vacant", total: 999 },
    ],
    [
      { propertyId: "property-a", category: "rukost", status: "active", roomCount: 60 },
      { propertyId: "property-a", category: "rukost", status: "inactive", roomCount: 20 },
      { propertyId: "property-a", category: "apartkost", status: "active", roomCount: 83 },
      { propertyId: "property-b", category: "apartkost", status: "active", roomCount: 999 },
    ],
  );

  assert.equal(summarizeRoomInventory.length, 3);
  assert.deepEqual(summary, {
    statusCounts: {
      vacant: 80,
      reserved: 0,
      awaiting_check_in: 0,
      occupied: 83,
      maintenance: 0,
      inactive: 0,
      requires_review: 0,
    },
    totalInventory: 163,
    categoryCounts: { rukost: 80, apartkost: 83 },
  });
});

test("pagination display stays ordered across empty, first, middle, and last pages", () => {
  assert.deepEqual(getRoomPaginationDisplay(0, 20, 3), {
    isEmptyPage: false,
    start: 1,
    end: 3,
    label: "1–3 dari 3 kamar",
  });
  assert.deepEqual(getRoomPaginationDisplay(20, 20, 3), {
    isEmptyPage: true,
    start: null,
    end: null,
    label: "Tidak ada kamar di halaman ini · 3 kamar total",
  });
  assert.deepEqual(getRoomPaginationDisplay(0, 20, 0), {
    isEmptyPage: true,
    start: null,
    end: null,
    label: "Tidak ada kamar di halaman ini · 0 kamar total",
  });
  assert.deepEqual(getRoomPaginationDisplay(0, 20, 45), {
    isEmptyPage: false,
    start: 1,
    end: 20,
    label: "1–20 dari 45 kamar",
  });
  assert.deepEqual(getRoomPaginationDisplay(20, 20, 45), {
    isEmptyPage: false,
    start: 21,
    end: 40,
    label: "21–40 dari 45 kamar",
  });
  assert.deepEqual(getRoomPaginationDisplay(40, 20, 45), {
    isEmptyPage: false,
    start: 41,
    end: 45,
    label: "41–45 dari 45 kamar",
  });
});

test("rooms summary uses property-wide aggregate, shared table, filters, and exact pagination", () => {
  const route = readAdminSource("routes/rooms/index.tsx");
  const inventory = readAdminSource("components/rooms/KostTypeInventoryPage.tsx");
  const hooks = readAdminSource("hooks/useAdminUxMaster.ts");
  const api = readAdminSource("lib/admin-ux-master-api.ts");

  assert.match(route, /useM4RoomAvailability\(\)/);
  assert.match(route, /category:\s*search\.category/);
  assert.match(route, /limit:\s*search\.limit/);
  assert.match(route, /offset:\s*search\.offset/);
  assert.match(route, /aria-pressed=/);
  assert.doesNotMatch(route, /<Link\b|Kelola/);
  assert.match(route, /useM4RoomInventory\(\{ status: "vacant", limit: 1, offset: 0 \}\)/);
  assert.match(route, /category: "rukost",\s*status: "vacant",\s*limit: 1,\s*offset: 0/s);
  assert.match(route, /category: "apartkost",\s*status: "vacant",\s*limit: 1,\s*offset: 0/s);
  assert.match(route, /availableRoomsQuery\.data\?\.total/);
  assert.match(route, /availableRumahKostQuery\.data\?\.total/);
  assert.match(route, /availableApartKostQuery\.data\?\.total/);
  assert.match(route, /onSearchChange\(\{\s*category,\s*status: "vacant",\s*offset: 0,\s*\}\)/s);
  assert.match(route, /canManage=\{false\}/);
  assert.match(route, /<RoomInventoryTable/);
  assert.match(route, /<Pagination/);
  assert.doesNotMatch(route, /rooms\.reduce/);

  assert.match(inventory, /export function RoomInventoryTable/);
  assert.match(inventory, /export function Pagination/);
  assert.match(inventory, /if \(total <= limit && offset <= 0\) return null/);
  assert.doesNotThrow(() => assertCanonicalRoomDetailWiring(route, inventory));

  for (const [routeMutation, inventoryMutation] of [
    [`${route}\nconst legacyRoomDetail = search.roomId;\n`, inventory],
    [`${route}\nconst legacyRoomDetail = <RoomDetailSheet />;\n`, inventory],
    [route, inventory.replace('to: "/rooms/$roomNumber"', 'to: "/rooms/$roomId"')],
  ] as const) {
    assert.throws(() => assertCanonicalRoomDetailWiring(routeMutation, inventoryMutation));
  }

  assert.match(hooks, /adminUxQueryKeys\.rooms\.availability\(currentPropertyId \?\? ""\)/);
  assert.match(hooks, /adminUxMasterApi\.rooms\.availability\(currentPropertyId!\)/);
  assert.match(hooks, /enabled:\s*Boolean\(currentPropertyId\)/);
  assert.match(api, /"\/rooms\/availability"/);
  assert.match(api, /property_id:\s*propertyId/);
});

test("RoomsPage delegates metrics to the authoritative summary helper", () => {
  const route = readAdminSource("routes/rooms/index.tsx");
  assert.match(route, /summarizeRoomInventory\(/);
});

test("category summary includes inactive kost types", () => {
  const route = readAdminSource("routes/rooms/index.tsx");
  assert.doesNotMatch(route, /type\.status === "active"/);
});

test("Pagination delegates display ranges and never builds an inverted range inline", () => {
  const inventory = readAdminSource("components/rooms/KostTypeInventoryPage.tsx");
  assert.match(inventory, /getRoomPaginationDisplay\(/);
  assert.doesNotMatch(inventory, /const currentStart = offset \+ 1/);
});

test("total inventory metric is AST-bound to authoritative summary output", () => {
  const source = readAdminSource("routes/rooms/index.tsx");
  assert.doesNotThrow(() => assertAuthoritativeTotalMetricWiring(source));

  const sourceFile = parseTsx(source);
  const valueExpression = totalMetricValueExpression(sourceFile);
  const mutation =
    source.slice(0, valueExpression.getStart(sourceFile)) +
    "String(rooms.length)" +
    source.slice(valueExpression.getEnd());
  assert.throws(
    () => assertAuthoritativeTotalMetricWiring(mutation),
    /exactly String\(totalRooms\)/,
  );
});

test("sidebar scrollbars remain visible, thin, and theme-aware", () => {
  const navigation = readAdminSource("components/layout/registry-navigation.tsx");
  const styles = readAdminSource("styles.css");

  assert.equal((navigation.match(/app-scrollbar/g) ?? []).length, 2);
  assert.match(styles, /\.app-scrollbar\s*\{/);
  assert.match(styles, /scrollbar-width:\s*thin/);
  assert.match(styles, /scrollbar-color:\s*var\(--sidebar-border\)/);
  assert.match(styles, /\.app-scrollbar::?-webkit-scrollbar/);
  assert.doesNotMatch(styles, /scrollbar-width:\s*none|scrollbar[^{}]*display:\s*none/s);
});

test("room search navigation preserves the viewport while filters update", () => {
  for (const routePath of [
    "routes/rooms/index.tsx",
    "routes/rooms/rumah-kost.tsx",
    "routes/rooms/apart-kost.tsx",
  ]) {
    const route = readAdminSource(routePath);
    assert.match(
      route,
      /navigate\(\{[\s\S]*?resetScroll:\s*false[\s\S]*?search:/,
      `${routePath} must disable scroll reset when updating room filters`,
    );
  }
});
