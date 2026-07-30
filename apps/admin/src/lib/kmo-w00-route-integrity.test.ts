import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ApiError } from "@granada-kost/api-client";
import { createMemoryHistory } from "@tanstack/react-router";
import ts from "typescript";
import {
  adminRouteRegistry,
  getRouteAccessDecision,
  type AdminRouteMetadata,
} from "./admin-route-registry";
import {
  canonicalSearchReplacement,
  facilitiesNavigationSearch,
  facilitiesSearchString,
  isComplaintCategoryList,
  isComplaintRecordList,
  normalizeFacilitiesSearch,
  normalizeVehiclesSearch,
  resolveComplaintRouteState,
  resolveVehicleWorkspaceTab,
  vehiclesSearchString,
  withoutPrimaryRoutes,
} from "./kmo-w00-route-integrity";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_SRC = resolve(HERE, "..");

function source(path: string): string {
  return readFileSync(join(ADMIN_SRC, path), "utf8");
}

function parseTsx(name: string, value: string): ts.SourceFile {
  const file = ts.createSourceFile(
    name,
    value,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics?.length) throw new Error("Invalid TypeScript source.");
  return file;
}

function propertyName(name: ts.PropertyName, file: ts.SourceFile): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText(file);
}

type GeneratedRoute = { path: string; parent: string | null; modulePath: string };

function productionRouteRegistrations(routeTreeSource: string): Map<string, string> {
  const file = parseTsx("routeTree.gen.ts", routeTreeSource);
  const imports = new Map<string, string>();
  const routes = new Map<string, GeneratedRoute>();
  const collections = new Map<string, string[]>();
  const wrappers = new Map<string, { route: string; children: string }>();
  let rootChildren: string | null = null;

  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith("./routes/")
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          if ((binding.propertyName ?? binding.name).text === "Route") {
            imports.set(binding.name.text, statement.moduleSpecifier.text);
          }
        }
      }
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const name = declaration.name.text;
      const initializer = declaration.initializer;
      if (ts.isObjectLiteralExpression(initializer)) {
        collections.set(
          name,
          initializer.properties.flatMap((property) => {
            if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)) {
              return [property.initializer.text];
            }
            return ts.isShorthandPropertyAssignment(property) ? [property.name.text] : [];
          }),
        );
        continue;
      }
      if (
        ts.isCallExpression(initializer) &&
        ts.isPropertyAccessExpression(initializer.expression) &&
        ts.isIdentifier(initializer.expression.expression)
      ) {
        const receiver = initializer.expression.expression.text;
        const method = initializer.expression.name.text;
        if (method === "update" && imports.has(receiver)) {
          let options: ts.Expression | undefined = initializer.arguments[0];
          while (
            options &&
            (ts.isAsExpression(options) ||
              ts.isTypeAssertionExpression(options) ||
              ts.isParenthesizedExpression(options))
          ) {
            options = options.expression;
          }
          if (!options || !ts.isObjectLiteralExpression(options)) {
            throw new Error("Malformed generated route update.");
          }
          const assignment = (key: string) =>
            options.properties.find(
              (property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property) && propertyName(property.name, file) === key,
            );
          const path = assignment("path")?.initializer;
          const parent = assignment("getParentRoute")?.initializer;
          if (!path || !ts.isStringLiteral(path)) throw new Error("Missing generated path.");
          routes.set(name, {
            path: path.text,
            parent:
              parent && ts.isArrowFunction(parent) && ts.isIdentifier(parent.body)
                ? parent.body.text
                : null,
            modulePath: imports.get(receiver)!,
          });
        } else if (
          method === "_addFileChildren" &&
          initializer.arguments[0] &&
          ts.isIdentifier(initializer.arguments[0])
        ) {
          wrappers.set(name, { route: receiver, children: initializer.arguments[0].text });
        }
      }
      if (name === "routeTree") {
        const visit = (node: ts.Node): void => {
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "_addFileChildren" &&
            node.arguments[0] &&
            ts.isIdentifier(node.arguments[0])
          ) {
            rootChildren = node.arguments[0].text;
          }
          ts.forEachChild(node, visit);
        };
        visit(initializer);
      }
    }
  }
  if (!rootChildren) throw new Error("Missing production route tree composition.");

  const reachable = new Set<string>();
  const visit = (name: string): void => {
    if (reachable.has(name)) return;
    if (routes.has(name)) return void reachable.add(name);
    const wrapper = wrappers.get(name);
    if (wrapper) return void (visit(wrapper.route), visit(wrapper.children));
    const children = collections.get(name);
    if (!children) throw new Error("Unknown production route child.");
    children.forEach(visit);
  };
  visit(rootChildren);

  const cache = new Map<string, string>();
  const fullPath = (name: string): string => {
    const cached = cache.get(name);
    if (cached) return cached;
    const route = routes.get(name);
    if (!route) throw new Error("Missing reachable route.");
    const parent = route.parent && routes.has(route.parent) ? fullPath(route.parent) : "";
    const joined = route.path === "/" ? parent || "/" : `${parent}/${route.path}`;
    const path = joined.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    cache.set(name, path);
    return path;
  };
  return new Map([...reachable].map((name) => [fullPath(name), routes.get(name)!.modulePath]));
}

function assertGetRouterUsesProductionTree(value: string): void {
  const file = parseTsx("router.tsx", value);
  let binding: string | null = null;
  let wired = false;
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "./routeTree.gen"
    ) {
      const names = statement.importClause?.namedBindings;
      if (names && ts.isNamedImports(names)) {
        const imported = names.elements.find(
          (element) => (element.propertyName ?? element.name).text === "routeTree",
        );
        binding = imported?.name.text ?? null;
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (
      binding &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createRouter" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      wired = node.arguments[0].properties.some(
        (property) =>
          (ts.isShorthandPropertyAssignment(property) && property.name.text === binding) ||
          (ts.isPropertyAssignment(property) &&
            propertyName(property.name, file) === "routeTree" &&
            ts.isIdentifier(property.initializer) &&
            property.initializer.text === binding),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(wired, true, "getRouter must receive the imported production routeTree");
}

function routeDeclaration(modulePath: string): string | null {
  const path = `${modulePath.replace("./", "")}.tsx`;
  const file = parseTsx(path, source(path));
  let declaration: string | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createFileRoute" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      declaration = node.arguments[0].text;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return declaration;
}

function assertVisibleRoutesRegistered(
  routes: readonly AdminRouteMetadata[],
  registrations: ReadonlyMap<string, string>,
): void {
  for (const route of routes.filter((item) => item.navigation?.sidebar && item.to)) {
    const path = route.to!.replace(/\/$/, "") || "/";
    const modulePath = registrations.get(path);
    assert.ok(modulePath, `visible route ${route.id} must be in the production routeTree`);
    assert.equal(routeDeclaration(modulePath!)?.replace(/\/$/, "") || "/", path);
  }
}

function assertNavigationUsesRegistrySearch(value: string): void {
  const file = parseTsx("registry-navigation.tsx", value);
  let targets = 0;
  let searches = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === "Link"
    ) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const to = attributes.find((item) => item.name.getText(file) === "to");
      const search = attributes.find((item) => item.name.getText(file) === "search");
      if (to?.initializer?.getText(file).includes("route.to")) {
        targets += 1;
        if (search?.initializer?.getText(file).includes("route.search")) searches += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(targets >= 2);
  assert.equal(searches, targets);
}

const PROPERTY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESIDENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPLAINT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ISO = "2026-07-30T00:00:00.000Z";

const validComplaint = {
  id: COMPLAINT_ID,
  propertyId: PROPERTY_ID,
  residentId: RESIDENT_ID,
  roomId: null,
  categoryId: CATEGORY_ID,
  complaintCode: "CMP-001",
  title: "Lampu mati",
  description: "Lampu kamar mati",
  priority: "medium",
  complaintStatus: "submitted",
  reopenCount: 0,
  responseSlaBreached: false,
  resolutionSlaBreached: false,
  locationNote: null,
  assignedToUserId: null,
  submittedAt: ISO,
  acknowledgedAt: null,
  resolvedAt: null,
  closedAt: null,
  cancelledAt: null,
  cancelReason: null,
  snapshotRoomNumber: "RK-01-01",
  snapshotResidentName: "Penghuni",
  createdByUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  createdAt: ISO,
  updatedAt: ISO,
};
const validCategory = {
  id: CATEGORY_ID,
  propertyId: PROPERTY_ID,
  name: "Listrik",
  normalizedCode: "electricity",
  defaultPriority: "medium",
  description: null,
  icon: null,
  isActive: true,
  sortOrder: 0,
  createdByUserId: null,
  createdAt: ISO,
  updatedAt: ISO,
};

test("KMO-W00 query normalization converges through replace-only memory history", () => {
  const cases: Array<[unknown, "vehicles" | "parking"]> = [
    [undefined, "vehicles"],
    ["", "vehicles"],
    ["vehicles", "vehicles"],
    ["parking", "parking"],
    ["unknown", "vehicles"],
    [["parking"], "vehicles"],
    [{ value: "parking" }, "vehicles"],
    [true, "vehicles"],
    [1, "vehicles"],
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(normalizeVehiclesSearch({ tab: raw }), { tab: expected });
  }

  const history = createMemoryHistory({ initialEntries: ["/vehicles?tab=unknown"] });
  let replaces = 0;
  history.subscribe(({ action }) => {
    if (action.type === "REPLACE") replaces += 1;
  });
  const canonical = vehiclesSearchString(normalizeVehiclesSearch({ tab: "unknown" }));
  const replacement = canonicalSearchReplacement(history.location.search, canonical);
  assert.equal(replacement, "?tab=vehicles");
  history.replace(`/vehicles${replacement}`);
  assert.equal(history.location.href, "/vehicles?tab=vehicles");
  assert.equal(history.length, 1);
  assert.equal(canonicalSearchReplacement(history.location.search, canonical), null);
  assert.equal(replaces, 1);

  const facilities = normalizeFacilitiesSearch({
    q: "  wifi tamu  ",
    category_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    kost_type_id: RESIDENT_ID,
    unknown: "drop",
  });
  assert.deepEqual(facilities, {
    q: "wifi tamu",
    category_id: PROPERTY_ID,
    kost_type_id: RESIDENT_ID,
  });
  assert.equal(
    facilitiesSearchString(facilities),
    `?q=wifi+tamu&category_id=${PROPERTY_ID}&kost_type_id=${RESIDENT_ID}`,
  );
  assert.equal(normalizeFacilitiesSearch({ q: "x".repeat(121) }).q.length, 120);
  for (const invalid of [true, 1, ["wifi"], { value: "wifi" }]) {
    assert.equal(normalizeFacilitiesSearch({ q: invalid }).q, "");
  }
  for (const invalid of ["", "not-a-uuid", true, 1, [PROPERTY_ID], { id: PROPERTY_ID }]) {
    assert.equal(normalizeFacilitiesSearch({ category_id: invalid }).category_id, undefined);
  }
  assert.deepEqual(facilitiesNavigationSearch({ q: "" }), {
    q: undefined,
    category_id: undefined,
    kost_type_id: undefined,
  });
  assert.equal(facilitiesSearchString(normalizeFacilitiesSearch({ q: "   " })), "");
});

test("KMO-W00 complaint state validates the live wire and actual ApiError shape", () => {
  const ready = {
    complaints: [validComplaint],
    categories: [validCategory],
    complaintError: null,
    categoryError: null,
    complaintLoading: false,
    categoryLoading: false,
  };
  assert.equal(resolveComplaintRouteState(ready), "ready");
  assert.equal(resolveComplaintRouteState({ ...ready, complaints: [] }), "ready");
  assert.equal(resolveComplaintRouteState({ ...ready, categories: [] }), "ready");
  assert.equal(resolveComplaintRouteState({ ...ready, complaintLoading: true }), "loading");
  assert.equal(
    resolveComplaintRouteState({
      ...ready,
      categoryError: new ApiError({ code: "FORBIDDEN", message: "Denied", status: 403 }),
    }),
    "forbidden",
  );
  assert.equal(
    resolveComplaintRouteState({
      ...ready,
      complaintError: new ApiError({ code: "NETWORK_ERROR", message: "Offline", status: 0 }),
    }),
    "error",
  );
  assert.equal(resolveComplaintRouteState({ ...ready, complaints: { data: [] } }), "invalid");
  for (const mutation of [
    { id: "not-a-uuid" },
    { roomId: "not-a-uuid" },
    { complaintStatus: "truthy" },
    { priority: "normal" },
    { reopenCount: -1 },
    { reopenCount: 0.5 },
    { submittedAt: "2026-07-30" },
    { resolvedAt: false },
  ]) {
    assert.equal(isComplaintRecordList([{ ...validComplaint, ...mutation }]), false);
  }
  for (const mutation of [
    { id: "category" },
    { propertyId: null },
    { defaultPriority: true },
    { sortOrder: 0.5 },
    { name: "" },
  ]) {
    assert.equal(isComplaintCategoryList([{ ...validCategory, ...mutation }]), false);
  }
  assert.equal(isComplaintRecordList([validComplaint]), true);
  assert.equal(isComplaintCategoryList([validCategory]), true);
});

test("KMO-W00 production router, registry, and backend access boundaries agree", () => {
  const routeTree = source("routeTree.gen.ts");
  const registrations = productionRouteRegistrations(routeTree);
  assertGetRouterUsesProductionTree(source("router.tsx"));
  assertVisibleRoutesRegistered(adminRouteRegistry, registrations);
  for (const path of ["/vehicles", "/parking", "/complaints", "/reports", "/rooms/fasilitas"]) {
    assert.ok(registrations.has(path), `${path} must be registered in the production tree`);
  }

  const vehicles = adminRouteRegistry.find((route) => route.id === "vehicles");
  const complaints = adminRouteRegistry.find((route) => route.id === "complaints");
  const reports = adminRouteRegistry.find((route) => route.id === "reports");
  const facilities = adminRouteRegistry.find((route) => route.id === "rooms-fasilitas");
  assert.ok(vehicles && complaints && reports && facilities);
  assert.deepEqual(vehicles.search, { tab: "vehicles" });
  assert.deepEqual([...vehicles.access.roles!].sort(), ["admin", "manager", "owner"]);
  assert.deepEqual(vehicles.access.anyReadCapabilities, ["vehicle.manage", "parking.manage"]);
  assert.deepEqual([...complaints.access.roles!].sort(), ["admin", "manager", "owner"]);
  assert.deepEqual(complaints.access.readCapabilities, ["complaint.manage"]);
  assert.deepEqual([...reports.access.roles!].sort(), ["admin", "manager", "owner"]);
  assert.deepEqual([...facilities.access.roles!].sort(), [
    "admin",
    "manager",
    "owner",
    "property_owner",
  ]);
  assert.deepEqual(facilities.access.readCapabilities, ["room.read"]);

  for (const permissions of [
    ["vehicle.manage"],
    ["parking.manage"],
    ["vehicle.manage", "parking.manage"],
  ]) {
    assert.equal(getRouteAccessDecision(vehicles, { roles: ["admin"], permissions }), "allowed");
  }
  assert.equal(
    getRouteAccessDecision(vehicles, { roles: ["admin"], permissions: [] }),
    "forbidden",
  );
  assert.equal(
    getRouteAccessDecision(complaints, {
      roles: ["technician"],
      permissions: ["complaint.manage"],
    }),
    "forbidden",
  );
  assert.equal(
    getRouteAccessDecision(complaints, { roles: ["admin"], permissions: [] }),
    "forbidden",
  );
  assert.equal(
    getRouteAccessDecision(complaints, {
      roles: ["admin"],
      permissions: ["complaint.manage"],
    }),
    "allowed",
  );

  assert.equal(
    resolveVehicleWorkspaceTab("parking", {
      canReadVehicles: true,
      canReadParking: false,
    }),
    "vehicles",
  );
  assert.equal(
    resolveVehicleWorkspaceTab("vehicles", {
      canReadVehicles: false,
      canReadParking: true,
    }),
    "parking",
  );
  assert.equal(
    resolveVehicleWorkspaceTab("parking", {
      canReadVehicles: true,
      canReadParking: true,
    }),
    "parking",
  );
  assert.equal(
    resolveVehicleWorkspaceTab("vehicles", {
      canReadVehicles: false,
      canReadParking: false,
    }),
    null,
  );
});

test("KMO-W00 registration proof fails on production tree, router, and registry mutations", () => {
  const routeTree = source("routeTree.gen.ts");
  const registrations = productionRouteRegistrations(routeTree);
  const withoutVehicles = productionRouteRegistrations(
    routeTree.replace("  VehiclesRoute: VehiclesRoute,\n", ""),
  );
  assert.equal(registrations.has("/vehicles"), true);
  assert.equal(withoutVehicles.has("/vehicles"), false);
  assert.throws(() => assertVisibleRoutesRegistered(adminRouteRegistry, withoutVehicles));
  assert.throws(() =>
    assertVisibleRoutesRegistered(
      adminRouteRegistry.map((route) =>
        route.id === "reports" ? { ...route, to: "/reports-decoy" } : route,
      ),
      registrations,
    ),
  );
  assert.throws(() =>
    assertGetRouterUsesProductionTree(source("router.tsx").replace(/\s+routeTree,\r?\n/, "\n")),
  );
});

test("KMO-W00 navigation shares search without duplicate mobile primary routes", () => {
  const navigation = source("components/layout/registry-navigation.tsx");
  assertNavigationUsesRegistrySearch(navigation);
  assert.match(navigation, /const routes = getVisibleRoutes\(access\)/g);
  assert.match(navigation, /<MoreRoutes\s+routes=\{moreRoutes\}/);
  assert.throws(() =>
    assertNavigationUsesRegistrySearch(
      navigation.replace(/search=\{route\.search as never\}/g, ""),
    ),
  );
  const routes = [{ id: "dashboard" }, { id: "rooms" }, { id: "reports" }];
  assert.deepEqual(withoutPrimaryRoutes(routes, [routes[0]!, routes[1]!]), [routes[2]]);
});

test("KMO-W00 live route wiring preserves terminal and accessibility contracts", () => {
  const vehicles = source("routes/vehicles.tsx");
  const parking = source("routes/parking.tsx");
  const complaints = source("routes/complaints.tsx");
  const reports = source("routes/reports.tsx");
  const facilities = source("routes/rooms/fasilitas.tsx");
  const foundation = source("components/layout/route-foundation-page.tsx");

  assert.match(vehicles, /validateSearch:\s*normalizeVehiclesSearch/);
  assert.match(vehicles, /resolveVehicleWorkspaceTab/);
  assert.match(vehicles, /canReadVehicles \? <TabsTrigger value="vehicles">/);
  assert.match(vehicles, /canReadParking \? <TabsTrigger value="parking">/);
  assert.match(vehicles, /activeTab === "parking"\s*\?\s*\(\s*<ParkingPage/);
  assert.match(vehicles, /canonicalSearchReplacement/);
  assert.match(vehicles, /if \(needsCanonicalSearch\)/);
  assert.ok(
    vehicles.indexOf("if (needsCanonicalSearch)") < vehicles.indexOf("const workspaceNavigation"),
    "active workspace queries must mount only after canonical search settles",
  );
  assert.match(parking, /to: "\/vehicles" as never/);
  assert.match(parking, /search: parkingRedirectSearch as never/);
  assert.match(parking, /replace: true/);
  assert.match(
    source("lib/admin-route-redirects.ts"),
    /parkingRedirectSearch = \{ tab: "parking" \}/,
  );
  assert.match(parking, /export function ParkingPage/);

  assert.match(complaints, /resolveComplaintRouteState/);
  assert.match(complaints, /case "loading":/);
  assert.match(complaints, /case "forbidden":/);
  assert.match(complaints, /case "error":/);
  assert.match(complaints, /case "invalid":/);
  assert.match(complaints, /void refetch\(\);\s*void categoriesQuery\.refetch\(\);/);
  assert.match(complaints, /isComplaintRecordList/);
  assert.match(complaints, /isComplaintCategoryList/);

  assert.match(reports, /createFileRoute\("\/reports"\)/);
  assert.match(reports, /RouteFoundationPage/);
  assert.match(reports, /KMO-W10/);
  assert.doesNotMatch(reports, /useReports|ReportsBody|revenue\.verifiedPayments/);
  assert.match(foundation, /const headingId = useId\(\)/);
  assert.doesNotMatch(foundation, /route-foundation-heading/);
  assert.match(foundation, /<section aria-labelledby=\{headingId\}>/);

  assert.match(facilities, /validateSearch:\s*normalizeFacilitiesSearch/);
  assert.match(facilities, /canonicalSearchReplacement/);
  assert.match(facilities, /replace:\s*true/);
});
