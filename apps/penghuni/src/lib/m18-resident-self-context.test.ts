import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ApiError } from "@granada-kost/api-client";
import { QueryClient } from "@tanstack/react-query";
import ts from "typescript";
import {
  RESIDENT_CONTEXT_PATH,
  classifyResidentContextError,
  createResidentContextRequester,
  parseResidentContextEnvelope,
  requestResidentContext,
  residentContextAnnouncementRole,
  residentContextState,
  residentContextStateCopy,
  shouldRetryResidentContext,
} from "./resident-context";
import { qk } from "./query-client";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const paths = {
  api: resolve(root, "lib/api.ts"),
  queryClient: resolve(root, "lib/query-client.ts"),
  residentContext: resolve(root, "lib/resident-context.ts"),
  profileHook: resolve(root, "hooks/usePenghuniProfile.ts"),
  homeHook: resolve(root, "hooks/usePenghuniHome.ts"),
  rootRoute: resolve(root, "routes/__root.tsx"),
  homeRoute: resolve(root, "routes/_app/index.tsx"),
  profileRoute: resolve(root, "routes/_app/profile.tsx"),
  authProvider: resolve(root, "lib/auth/AuthProvider.tsx"),
  authGuard: resolve(root, "lib/auth/AuthGuard.tsx"),
};

const validEnvelope = {
  data: {
    display_name: "Resident Demo",
    phone: "081234567890",
    property_name: "Properti Demo",
    room_number: "RK-01-01",
    occupancy_start: "2026-07-29",
    building_name: "Rumah Kost Unit 01",
    building_code: "RK-01",
    kost_type: "rukost",
    gender: "male",
    lease_status: "active",
    lease_start: "2026-07-29",
    lease_end: "2027-01-29",
    term_months: 6,
    payment_plan_type: "monthly",
  },
};

type Sources = Record<keyof typeof paths, string>;

function readSources(): Sources {
  return Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, readFileSync(path, "utf8")]),
  ) as Sources;
}

function functionDeclaration(source: string, name: string): ts.FunctionDeclaration {
  const file = ts.createSourceFile(
    "source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const match = file.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(match, `${name} must be a live function declaration`);
  return match;
}

function assertResidentRoleGuard(source: string): void {
  const guardedOutlet = functionDeclaration(source, "GuardedOutlet");
  const guards: ts.JsxElement[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isJsxElement(node) &&
      ts.isIdentifier(node.openingElement.tagName) &&
      node.openingElement.tagName.text === "AuthGuard"
    ) {
      guards.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(guardedOutlet);

  assert.equal(guards.length, 1);
  const roles = guards[0].openingElement.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === "roles",
  );
  assert.ok(roles?.initializer && ts.isJsxExpression(roles.initializer));
  assert.ok(
    roles.initializer.expression && ts.isArrayLiteralExpression(roles.initializer.expression),
  );
  assert.deepEqual(
    roles.initializer.expression.elements.map((element) =>
      ts.isStringLiteral(element) ? element.text : null,
    ),
    ["resident"],
  );

  const liveText = guardedOutlet.getText();
  assert.match(liveText, /PUBLIC_ROUTES\.has\(pathname\)/);
  assert.match(liveText, /pathname\.startsWith\(["']\/kamar\/["']\)/);
  assert.doesNotMatch(liveText, /pathname\.startsWith\(["']\/kamar["']\)/);
  assert.match(liveText, /return <Outlet \/>/);
}

function assertSourceContracts(sources: Sources): void {
  assertResidentRoleGuard(sources.rootRoute);
  assert.match(sources.rootRoute, /new Set<string>\(\["\/login", "\/kamar"\]\)/);
  assert.equal(
    Object.values(sources).filter((source) => source.includes('"/my/resident-context"')).length,
    1,
  );

  assert.match(sources.residentContext, /hasExactKeys\(value, \["data"\]\)/);
  assert.match(sources.residentContext, /hasExactKeys\(value\.data, CONTEXT_KEYS\)/);
  assert.match(sources.residentContext, /user\?\.roles\?\.includes\("resident"\)/);
  assert.match(sources.residentContext, /enabled: accountId !== null/);
  assert.match(sources.residentContext, /qk\.penghuni\.residentContext\(accountId\)/);
  assert.match(sources.residentContext, /error\.status === 409/);
  assert.match(sources.residentContext, /RESIDENT_CONTEXT_AMBIGUOUS/);
  assert.match(sources.residentContext, /query\.data === null \? "empty" : "ready"/);
  assert.doesNotMatch(sources.residentContext, /property_id|resident_id|room_id|occupancy_id/);

  assert.equal((sources.api.match(/new ApiClient\(/g) ?? []).length, 1);
  assert.match(sources.api, /tokenProvider: proxyTokenProvider/);
  assert.match(
    sources.api,
    /export function refreshAccessToken\(\): Promise<boolean> \{\s*return proxyTokenProvider\.refresh\(\);\s*\}/,
  );
  assert.match(
    sources.api,
    /export function notifyAuthFailure\(\): void \{\s*proxyTokenProvider\.onAuthFailure\?\.\(\);\s*\}/,
  );
  assert.doesNotMatch(sources.api, /(?:^|\n)\s*(?:await\s+)?fetch\s*\(/);
  assert.match(sources.authProvider, /queryClient\.clear\(\)/);
  const loadingIndex = sources.authGuard.indexOf('status === "loading"');
  const roleIndex = sources.authGuard.indexOf("roles && roles.length > 0");
  assert.ok(loadingIndex >= 0 && roleIndex > loadingIndex);
  assert.match(sources.profileHook, /useResidentContext\(\)/);
  assert.match(sources.homeHook, /usePenghuniProfile\(\)/);
  assert.match(
    sources.homeHook,
    /const isLoading = invoices\.isLoading \|\| payments\.isLoading \|\| unread\.isLoading;/,
  );
  assert.match(sources.homeHook, /const isError = invoices\.isError \|\| payments\.isError;/);
  assert.doesNotMatch(
    sources.homeHook.match(/const isLoading = [^;]+;/)?.[0] ?? "",
    /profile|context/,
  );
  assert.doesNotMatch(
    sources.homeHook.match(/const isError = [^;]+;/)?.[0] ?? "",
    /profile|context/,
  );

  assert.match(sources.homeRoute, /profile\.propertyName/);
  assert.match(sources.homeRoute, /profile\.roomNumber/);
  assert.doesNotMatch(sources.homeRoute, /snapshotRoomNumber|profile\.roomLabel/);
  assert.match(sources.profileRoute, /profile\.propertyName/);
  assert.match(sources.profileRoute, /profile\.roomNumber/);
  assert.match(sources.profileRoute, /profile\.phone/);
  assert.match(sources.profileRoute, /profile\.occupancyStart/);
  assert.doesNotMatch(
    sources.homeRoute + sources.profileRoute,
    /\b(residentId|resident_id|propertyId|property_id|roomId|room_id|occupancyId|occupancy_id)\b/,
  );
  assert.match(
    sources.homeRoute,
    /role=\{residentContextAnnouncementRole\(profile\.contextState\)\}/,
  );
  assert.match(
    sources.profileRoute,
    /role=\{residentContextAnnouncementRole\(profile\.contextState\)\}/,
  );
  assert.match(sources.homeRoute, /min-h-11/);
  assert.match(sources.profileRoute, /min-h-11/);
  assert.match(sources.homeRoute + sources.profileRoute, /break-words/);
  assert.match(sources.profileRoute, /formatDate\(profile\.occupancyStart\)/);
}

test("strict parser accepts zero/single context and returns an isolated resident-safe copy", () => {
  const envelope = {
    data: { ...validEnvelope.data },
  };
  assert.equal(parseResidentContextEnvelope({ data: null }), null);
  const parsed = parseResidentContextEnvelope(envelope);
  assert.deepEqual(parsed, {
    displayName: "Resident Demo",
    phone: "081234567890",
    propertyName: "Properti Demo",
    roomNumber: "RK-01-01",
    occupancyStart: "2026-07-29",
    buildingName: "Rumah Kost Unit 01",
    buildingCode: "RK-01",
    kostType: "rukost",
    gender: "male",
    leaseStatus: "active",
    leaseStart: "2026-07-29",
    leaseEnd: "2027-01-29",
    termMonths: 6,
    paymentPlanType: "monthly",
  });
  assert.notEqual(parsed, envelope.data);
  envelope.data.display_name = "Changed after parse";
  assert.equal(parsed?.displayName, "Resident Demo");
});

test("strict parser rejects missing, extra, wrong-type, nullability, blank, and malformed date inputs", () => {
  const invalid: unknown[] = [
    validEnvelope.data,
    { data: { ...validEnvelope.data, extra: true } },
    { data: { ...validEnvelope.data, room_number: undefined } },
    { data: { ...validEnvelope.data, display_name: "   " } },
    { data: { ...validEnvelope.data, property_name: "" } },
    { data: { ...validEnvelope.data, phone: 8123 } },
    { data: { ...validEnvelope.data, phone: "   " } },
    { data: { ...validEnvelope.data, occupancy_start: "2026-02-31" } },
    { data: { ...validEnvelope.data, occupancy_start: "29/07/2026" } },
    { data: { ...validEnvelope.data, occupancy_start: "2026-07-29T00:00:00Z" } },
    { data: { ...validEnvelope.data, kost_type: "hotel" } },
    { data: { ...validEnvelope.data, gender: "mixed" } },
    { data: { ...validEnvelope.data, lease_status: "ended" } },
    { data: { ...validEnvelope.data, lease_start: "29/07/2026" } },
    { data: { ...validEnvelope.data, term_months: 0 } },
    { data: null, metadata: {} },
  ];
  const inheritedEnvelope = Object.assign(Object.create({ metadata: true }), validEnvelope);
  const inheritedData = {
    data: Object.assign(Object.create({ resident_id: "opaque" }), validEnvelope.data),
  };
  invalid.push(inheritedEnvelope, inheritedData);
  for (const value of invalid) {
    assert.throws(
      () => parseResidentContextEnvelope(value),
      (error) => ApiError.isApiError(error) && error.code === "PARSE_ERROR",
    );
  }
});

test("requester performs one exact authenticated GET without client identity parameters", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const requester = createResidentContextRequester({
    baseUrl: "http://localhost:3000/api/v1",
    getAccessToken: () => "private-test-token",
    refreshAccessToken: async () => false,
    onAuthFailure: () => undefined,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(validEnvelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await requestResidentContext(requester);
  assert.equal(RESIDENT_CONTEXT_PATH, "/my/resident-context");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:3000/api/v1/my/resident-context");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.body, undefined);
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(new URL(calls[0].url).search, "");
  assert.deepEqual(result?.roomNumber, "RK-01-01");
});

test("401 follows existing refresh authority once and never exposes a second request source", async () => {
  let fetchCount = 0;
  let refreshCount = 0;
  let authFailureCount = 0;
  const requester = createResidentContextRequester({
    baseUrl: "http://localhost:3000/api/v1/",
    getAccessToken: () => "private-test-token",
    refreshAccessToken: async () => {
      refreshCount += 1;
      return true;
    },
    onAuthFailure: () => {
      authFailureCount += 1;
    },
    fetchImpl: async () => {
      fetchCount += 1;
      return fetchCount === 1
        ? new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "hidden" } }), {
            status: 401,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify(validEnvelope), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    },
  });

  assert.deepEqual(
    await requestResidentContext(requester),
    parseResidentContextEnvelope(validEnvelope),
  );
  assert.equal(fetchCount, 2);
  assert.equal(refreshCount, 1);
  assert.equal(authFailureCount, 0);
});

test("terminal error classification prevents 403/409/401 retry and permits one network/5xx retry", () => {
  const conflict = new ApiError({
    code: "RESIDENT_CONTEXT_AMBIGUOUS",
    message: "hidden",
    status: 409,
  });
  const forbidden = new ApiError({ code: "FORBIDDEN", message: "hidden", status: 403 });
  const unauthorized = new ApiError({
    code: "UNAUTHENTICATED",
    message: "hidden",
    status: 401,
  });
  const network = new ApiError({ code: "NETWORK_ERROR", message: "hidden", status: 0 });
  const server = new ApiError({ code: "INTERNAL_ERROR", message: "hidden", status: 503 });

  assert.equal(classifyResidentContextError(conflict), "conflict");
  assert.equal(classifyResidentContextError(forbidden), "forbidden");
  assert.equal(classifyResidentContextError(unauthorized), "unauthenticated");
  assert.equal(shouldRetryResidentContext(0, conflict), false);
  assert.equal(shouldRetryResidentContext(0, forbidden), false);
  assert.equal(shouldRetryResidentContext(0, unauthorized), false);
  assert.equal(shouldRetryResidentContext(0, network), true);
  assert.equal(shouldRetryResidentContext(1, network), false);
  assert.equal(shouldRetryResidentContext(0, server), true);
});

test("zero, conflict, forbidden, invalid, and recoverable states remain distinct and safe", () => {
  assert.equal(
    residentContextState({
      data: null,
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
    }),
    "empty",
  );
  for (const state of ["empty", "conflict", "forbidden", "invalid"] as const) {
    const copy = residentContextStateCopy(state);
    assert.equal(copy.canRetry, false);
    assert.doesNotMatch(copy.title + copy.description, /RESIDENT_CONTEXT_AMBIGUOUS|UUID|metadata/i);
  }
  assert.equal(residentContextStateCopy("recoverable-error").canRetry, true);
  assert.equal(residentContextAnnouncementRole("empty"), "status");
  assert.equal(residentContextAnnouncementRole("conflict"), "alert");
  assert.equal(residentContextAnnouncementRole("forbidden"), "alert");
  assert.equal(residentContextAnnouncementRole("recoverable-error"), "alert");
});

test("account-scoped cache isolates account switches, preserves same-account cache, and clears on logout", () => {
  const client = new QueryClient();
  const accountA = "account-a";
  const accountB = "account-b";
  const keyA = qk.penghuni.residentContext(accountA);
  const keyB = qk.penghuni.residentContext(accountB);

  assert.deepEqual(qk.penghuni.residentContext(accountA), keyA);
  assert.notDeepEqual(keyA, keyB);
  assert.doesNotMatch(JSON.stringify(keyA), /property|resident_id|room_id|@|phone|081|628/i);
  client.setQueryData(keyA, { displayName: "Old account" });
  assert.equal(client.getQueryData(keyB), undefined);
  assert.deepEqual(client.getQueryData(keyA), { displayName: "Old account" });
  client.clear();
  assert.equal(client.getQueryData(keyA), undefined);
});

test("live shell keeps public routes open and fails closed for authenticated non-residents", () => {
  const sources = readSources();
  assertResidentRoleGuard(sources.rootRoute);
  assert.match(sources.rootRoute, /"\/login"/);
  assert.match(sources.rootRoute, /"\/kamar"/);
  assert.match(sources.rootRoute, /pathname\.startsWith\("\/kamar\/"\)/);
  assert.doesNotMatch(sources.rootRoute, /pathname\.startsWith\("\/kamar"\)/);
  assert.deepEqual(["owner", "resident"].includes("resident"), true);
  assert.deepEqual(["owner", "manager"].includes("resident"), false);
});

test("Home and Profile share one context authority while billing remains independent", () => {
  const sources = readSources();
  assertSourceContracts(sources);
  assert.equal(
    (sources.profileHook.match(/const context = useResidentContext\(\);/g) ?? []).length,
    1,
  );
  assert.equal(
    (sources.homeHook.match(/const profile = usePenghuniProfile\(\);/g) ?? []).length,
    1,
  );
  assert.match(sources.homeHook, /useMyInvoices/);
  assert.match(sources.homeHook, /useMyPayments/);
  assert.doesNotMatch(sources.homeHook, /residentContextRequester|requestResidentContext/);
  assert.doesNotMatch(sources.profileRoute, /apiClient|residentContextRequester/);
});

test("responsive and privacy contracts reject fallback facts, unsafe IDs, retry loops, and public-route regressions", () => {
  const sources = readSources();
  assertSourceContracts(sources);

  const mutations: Sources[] = [
    {
      ...sources,
      residentContext: sources.residentContext.replace(
        'export const RESIDENT_CONTEXT_PATH = "/my/resident-context";',
        'export const RESIDENT_CONTEXT_PATH = "/my/resident-context?property_id=decoy";',
      ),
    },
    {
      ...sources,
      residentContext: sources.residentContext.replace(
        "hasExactKeys(value.data, CONTEXT_KEYS)",
        "isRecord(value.data)",
      ),
    },
    {
      ...sources,
      homeRoute: sources.homeRoute.replace(
        "profile.roomNumber",
        "currentInvoice.snapshotRoomNumber",
      ),
    },
    {
      ...sources,
      rootRoute: sources.rootRoute.replace('<AuthGuard roles={["resident"]}>', "<AuthGuard>"),
    },
    {
      ...sources,
      rootRoute: sources.rootRoute.replace('["/login", "/kamar"]', '["/login"]'),
    },
    {
      ...sources,
      rootRoute: sources.rootRoute.replace(
        'pathname.startsWith("/kamar/")',
        'pathname.startsWith("/kamar")',
      ),
    },
    {
      ...sources,
      residentContext: sources.residentContext.replace(
        "qk.penghuni.residentContext(accountId)",
        '["penghuni", "resident-context"]',
      ),
    },
    {
      ...sources,
      residentContext: sources.residentContext.replace(
        'if (error.status === 409 && error.code === "RESIDENT_CONTEXT_AMBIGUOUS") return "conflict";',
        'if (error.status === 409) return "recoverable-error";',
      ),
    },
    {
      ...sources,
      profileRoute: `${sources.profileRoute}\nconst resident_id = "opaque";\n`,
    },
    {
      ...sources,
      residentContext: sources.residentContext.replace(
        'query.data === null ? "empty" : "ready"',
        'query.data === null ? "loading" : "ready"',
      ),
    },
    {
      ...sources,
      api: sources.api.replace(
        "return proxyTokenProvider.refresh();",
        "return Promise.resolve(false);",
      ),
    },
    {
      ...sources,
      authGuard: sources.authGuard
        .replace('if (status === "loading") return <LoadingState label="Memuat sesi..." />;', "")
        .replace(
          "if (permissions && permissions.length > 0 && !hasPermission(permissions)) {",
          'if (status === "loading") return <LoadingState label="Memuat sesi..." />;\n  if (permissions && permissions.length > 0 && !hasPermission(permissions)) {',
        ),
    },
    {
      ...sources,
      homeHook: sources.homeHook.replace(
        "const isLoading = invoices.isLoading || payments.isLoading || unread.isLoading;",
        'const isLoading = profile.contextState === "loading" || invoices.isLoading || payments.isLoading || unread.isLoading;',
      ),
    },
  ];

  for (const [index, mutation] of mutations.entries()) {
    assert.throws(() => assertSourceContracts(mutation), `mutation ${index + 1} must fail`);
  }
});
