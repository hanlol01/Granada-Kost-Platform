import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  activeBookingLeadHold,
  assertBookingHoldMutationProperty,
  bookingHoldErrorRequiresInvalidation,
  bookingHoldInvalidationKeys,
  bookingHoldPostExpiryInvalidationKeys,
  bookingLeadHoldCoverageKey,
  canCreateBookingLeadHold,
  canReadBookingLeadHolds,
  canReleaseBookingLeadHold,
  createBookingHoldCoverageExpirySync,
  createBookingHoldExpirySync,
  invalidateBookingHoldState,
  parseBookingLeadHoldDetail,
  parseBookingLeadHoldList,
  requestBookingLeadHoldCoverage,
  requestCreateBookingLeadHold,
  requestReleaseBookingLeadHold,
  type BookingLeadHoldCoverage,
  type BookingLeadHoldRecord,
} from "./admin-booking-lead-hold";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "44444444-4444-4444-8444-444444444444";
const HOLD_ID = "55555555-5555-4555-8555-555555555555";

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function holdWire(overrides: Record<string, unknown> = {}) {
  return {
    id: HOLD_ID,
    property_id: PROPERTY_ID,
    booking_lead_id: LEAD_ID,
    room_id: ROOM_ID,
    hold_status: "active",
    starts_at: "2026-07-28T00:00:00.000Z",
    expires_at: "2026-07-29T00:00:00.000Z",
    released_at: null,
    ...overrides,
  };
}

function parseTsx(text: string, fileName: string): ts.SourceFile {
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
  return parsed;
}

function functionNode(
  text: string,
  fileName: string,
  name: string,
): { parsed: ts.SourceFile; node: ts.FunctionDeclaration } {
  const parsed = parseTsx(text, fileName);
  const matches: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(matches.length, 1, `expected one ${name}`);
  return { parsed, node: matches[0]! };
}

function functionText(text: string, fileName: string, name: string): string {
  const { parsed, node } = functionNode(text, fileName, name);
  return node.getText(parsed);
}

function variableFunctionText(text: string, fileName: string, name: string): string {
  const parsed = parseTsx(text, fileName);
  const matches: Array<ts.ArrowFunction | ts.FunctionExpression> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      matches.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(matches.length, 1, `expected one ${name}`);
  return matches[0]!.getText(parsed);
}

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T,
): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function jsxAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttributes {
  return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
}

function jsxTag(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText();
}

function jsxAttribute(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  name: string,
): ts.JsxAttribute | undefined {
  return jsxAttributes(node).properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function staticClassTokens(node: ts.JsxElement | ts.JsxSelfClosingElement): string[] {
  const initializer = jsxAttribute(node, "className")?.initializer;
  return initializer && ts.isStringLiteral(initializer) ? initializer.text.split(/\s+/) : [];
}

function expressionAttribute(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  name: string,
): string | null {
  const initializer = jsxAttribute(node, name)?.initializer;
  return initializer && ts.isJsxExpression(initializer) && initializer.expression
    ? initializer.expression.getText()
    : null;
}

function assertBookingLeadPageHoldUi(text: string): void {
  const { parsed, node: page } = functionNode(text, "booking-leads.tsx", "BookingLeadsPage");
  const elements = descendants(
    page,
    (node): node is ts.JsxElement | ts.JsxSelfClosingElement =>
      ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node),
  );
  const responsiveRoots = ["md:block", "md:hidden"].map((token) => {
    const matches = elements.filter(
      (element) => jsxTag(element) === "div" && staticClassTokens(element).includes(token),
    );
    assert.equal(matches.length, 1, `one ${token} root`);
    return matches[0]!;
  });

  for (const region of responsiveRoots) {
    const maps = descendants(
      region,
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "leads" &&
        node.expression.name.text === "map",
    );
    assert.equal(maps.length, 1, "one lead item renderer per responsive branch");
    const item = maps[0]!.arguments[0];
    assert.ok(item && (ts.isArrowFunction(item) || ts.isFunctionExpression(item)));
    const itemElements = descendants(
      item,
      (node): node is ts.JsxElement | ts.JsxSelfClosingElement =>
        ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node),
    );
    const statuses = itemElements.filter((element) => jsxTag(element) === "BookingLeadHoldStatus");
    assert.equal(statuses.length, 1);
    assert.equal(expressionAttribute(statuses[0]!, "hold"), "activeHold");
    assert.equal(expressionAttribute(statuses[0]!, "now"), "holdNow");
    assert.equal(jsxAttribute(statuses[0]!, "onExpired"), undefined);
    const openCalls = descendants(
      item,
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "openHoldDialog" &&
        node.arguments.length === 1 &&
        node.arguments[0]!.getText(parsed) === "lead",
    );
    assert.equal(openCalls.length, 1, "hold action belongs to the same rendered lead");
  }
  const pageText = page.getText(parsed);
  assert.match(pageText, /useBookingLeadHolds\(\)/);
  assert.match(pageText, /<BookingLeadHoldDialog/);
  assert.match(pageText, /Memuat status tahanan\s+kamar/);
  assert.match(pageText, /Penahanan kamar belum diaktifkan untuk property\s+ini/);
  assert.match(pageText, /setHoldIntent\(null\)/);
  assert.equal(
    descendants(
      page,
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "setInterval",
    ).length,
    1,
  );
}

function assertHoldDialogSubmission(text: string): void {
  const submit = variableFunctionText(text, "BookingLeadHoldDialog.tsx", "submit");
  for (const guard of [
    "!accessAllowed",
    "propertyId !== currentPropertyId",
    "lead.id !== leadAtOpen.current",
    "submitting.current",
    "mutation.isPending",
  ]) {
    if (!new RegExp(guard.replace(".", "\\.")).test(submit)) {
      throw new Error("dialog submission guard missing");
    }
  }
  const guardIndex = submit.indexOf("submitting.current = true");
  const keyIndex = submit.indexOf("submissionKey.current ?? newIdempotencyKey()");
  const requestIndex = submit.indexOf("mutation.mutateAsync");
  const clearIndex = submit.indexOf("submissionKey.current = null", requestIndex);
  const closeIndex = submit.indexOf("onOpenChange(false)", requestIndex);
  const releaseGuardIndex = submit.lastIndexOf("submitting.current = false");
  if (
    guardIndex < 0 ||
    !(guardIndex < keyIndex) ||
    !(keyIndex < requestIndex) ||
    !(requestIndex < clearIndex) ||
    !(clearIndex < closeIndex) ||
    !(closeIndex < releaseGuardIndex)
  ) {
    throw new Error("dialog submission order invalid");
  }
}

test("strict hold parsers accept only the exact V2 envelopes and eight-field whitelist", () => {
  const detail = parseBookingLeadHoldDetail({ data: holdWire() });
  assert.deepEqual(Object.keys(detail).sort(), [
    "bookingLeadId",
    "expiresAt",
    "holdStatus",
    "id",
    "propertyId",
    "releasedAt",
    "roomId",
    "startsAt",
  ]);
  assert.deepEqual(
    parseBookingLeadHoldList({
      data: [holdWire()],
      meta: { limit: 20, offset: 0, total: 1 },
    }),
    {
      data: [detail],
      meta: { limit: 20, offset: 0, total: 1 },
    },
  );

  assert.throws(() => parseBookingLeadHoldDetail(holdWire()));
  assert.throws(() => parseBookingLeadHoldDetail({ data: holdWire(), meta: {} }));
  assert.throws(() => parseBookingLeadHoldDetail({ data: holdWire({ metadata: {} }) }));
  assert.throws(() =>
    parseBookingLeadHoldList({ data: [holdWire()], meta: { limit: 20, offset: 0 } }),
  );
  assert.throws(() =>
    parseBookingLeadHoldDetail({ data: holdWire({ hold_status: "released", released_at: null }) }),
  );
  assert.throws(() =>
    parseBookingLeadHoldDetail({
      data: holdWire({ hold_status: "active", released_at: "2026-07-28T01:00:00.000Z" }),
    }),
  );
  assert.throws(() =>
    parseBookingLeadHoldDetail({ data: holdWire({ expires_at: "not-a-timestamp" }) }),
  );
});

test("coverage requester walks every exact property-scoped page and fails closed on gaps", async () => {
  const calls: Array<{ path: string; query: Record<string, unknown> }> = [];
  const secondId = "66666666-6666-4666-8666-666666666666";
  const coverage = await requestBookingLeadHoldCoverage(
    async (path, options) => {
      calls.push({ path, query: options.query });
      const offset = Number(options.query.offset);
      return {
        data: offset === 0 ? [holdWire()] : [holdWire({ id: secondId, hold_status: "expired" })],
        meta: { limit: 1, offset, total: 2 },
      };
    },
    PROPERTY_ID,
    1,
  );

  assert.equal(coverage.complete, true);
  assert.equal(coverage.data.length, 2);
  assert.deepEqual(calls, [
    {
      path: "/booking-lead-holds",
      query: { property_id: PROPERTY_ID, limit: 1, offset: 0 },
    },
    {
      path: "/booking-lead-holds",
      query: { property_id: PROPERTY_ID, limit: 1, offset: 1 },
    },
  ]);
  assert.deepEqual(bookingLeadHoldCoverageKey(PROPERTY_ID, 100, 0), [
    "booking-lead-holds",
    PROPERTY_ID,
    { limit: 100, offset: 0 },
  ]);

  assert.deepEqual(
    await requestBookingLeadHoldCoverage(
      async () => ({ data: [], meta: { limit: 100, offset: 0, total: 0 } }),
      PROPERTY_ID,
    ),
    {
      propertyId: PROPERTY_ID,
      complete: true,
      data: [],
      meta: { limit: 100, offset: 0, total: 0 },
    },
  );

  await assert.rejects(() =>
    requestBookingLeadHoldCoverage(
      async () => ({ data: [], meta: { limit: 1, offset: 0, total: 2 } }),
      PROPERTY_ID,
      1,
    ),
  );
});

test("coverage rejects unstable totals, duplicates, wrong scope, malformed pages, and overflow", async () => {
  const secondId = "66666666-6666-4666-8666-666666666666";
  const second = holdWire({ id: secondId, hold_status: "expired" });
  const cases: unknown[][] = [
    [
      { data: [holdWire()], meta: { limit: 1, offset: 0, total: 2 } },
      { data: [second], meta: { limit: 1, offset: 1, total: 3 } },
    ],
    [
      { data: [holdWire()], meta: { limit: 1, offset: 0, total: 2 } },
      { data: [holdWire()], meta: { limit: 1, offset: 1, total: 2 } },
    ],
    [
      {
        data: [holdWire({ property_id: OTHER_PROPERTY_ID })],
        meta: { limit: 1, offset: 0, total: 1 },
      },
    ],
    [{ data: [holdWire()], meta: { limit: 2, offset: 0, total: 1 } }],
    [{ data: [holdWire()], meta: { limit: 1, offset: 1, total: 1 } }],
    [{ data: [holdWire(), second], meta: { limit: 1, offset: 0, total: 2 } }],
    [{ data: [holdWire()], meta: { limit: 1, offset: 0, total: 0 } }],
  ];

  for (const pages of cases) {
    let calls = 0;
    await assert.rejects(() =>
      requestBookingLeadHoldCoverage(
        async () => {
          const page = pages[calls++];
          if (!page) throw new Error("coverage requester exceeded the bounded page proof");
          return page;
        },
        PROPERTY_ID,
        1,
      ),
    );
    assert.ok(calls <= pages.length);
  }
});

test("hold commands preserve exact routes, body, idempotency key, and envelopes", async () => {
  const calls: unknown[] = [];
  const post = async (path: string, body: unknown, options: unknown) => {
    calls.push({ path, body, options });
    return { data: holdWire() };
  };
  await requestCreateBookingLeadHold(post, {
    propertyId: PROPERTY_ID,
    leadId: LEAD_ID,
    idempotencyKey: "idem-create-logical-action",
  });
  await requestReleaseBookingLeadHold(post, {
    propertyId: PROPERTY_ID,
    leadId: LEAD_ID,
    idempotencyKey: "idem-release-logical-action",
  });
  assert.deepEqual(calls, [
    {
      path: `/booking-leads/${LEAD_ID}/hold`,
      body: { property_id: PROPERTY_ID },
      options: { idempotencyKey: "idem-create-logical-action" },
    },
    {
      path: `/booking-leads/${LEAD_ID}/hold/release`,
      body: { property_id: PROPERTY_ID },
      options: { idempotencyKey: "idem-release-logical-action" },
    },
  ]);

  const backendError = Object.assign(new Error("Booking lead hold is no longer active"), {
    code: "BOOKING_HOLD_NOT_ACTIVE",
    status: 409,
  });
  await assert.rejects(
    requestReleaseBookingLeadHold(async () => Promise.reject(backendError), {
      propertyId: PROPERTY_ID,
      leadId: LEAD_ID,
      idempotencyKey: "idem-release-retry",
    }),
    (error) => error === backendError,
  );
});

test("read, create, and release authority stay role, permission, property, rollout, and hold scoped", () => {
  const rollout = [
    {
      propertyId: PROPERTY_ID,
      adminUxRead: { enabled: true },
      bookingHoldWrite: { enabled: true },
    },
  ];
  const lead = { id: LEAD_ID, propertyId: PROPERTY_ID, roomId: ROOM_ID, status: "new" as const };
  const coverage = {
    propertyId: PROPERTY_ID,
    complete: true as const,
    data: [] as ReturnType<typeof parseBookingLeadHoldDetail>[],
    meta: { limit: 100, offset: 0, total: 0 },
  };
  const access = {
    roles: ["admin"],
    permissions: ["room.read", "room.manage"],
    propertyId: PROPERTY_ID,
  };

  assert.equal(canReadBookingLeadHolds(access), true);
  assert.equal(canReadBookingLeadHolds({ ...access, roles: ["resident"] }), false);
  assert.equal(canReadBookingLeadHolds({ ...access, permissions: ["room.manage"] }), false);
  assert.equal(
    canCreateBookingLeadHold({ ...access, propertyRollouts: rollout, lead, coverage }),
    true,
  );
  assert.equal(
    canCreateBookingLeadHold({ ...access, propertyRollouts: [], lead, coverage }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: [...rollout, ...rollout],
      lead,
      coverage,
    }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: rollout,
      lead: { ...lead, status: "converted" },
      coverage,
    }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({ ...access, propertyRollouts: rollout, lead, coverage: null }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: rollout,
      lead,
      coverage: { ...coverage, propertyId: OTHER_PROPERTY_ID },
    }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: rollout,
      lead,
      coverage: { ...coverage, meta: { ...coverage.meta, total: 1 } },
    }),
    false,
  );
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: rollout,
      lead,
      coverage: {
        ...coverage,
        data: [parseBookingLeadHoldDetail({ data: holdWire() })],
        meta: { limit: 100, offset: 0, total: 1 },
      },
    }),
    false,
  );

  const activeHold = parseBookingLeadHoldDetail({ data: holdWire() });
  const largeHistory: BookingLeadHoldRecord[] = Array.from({ length: 162 }, (_, index) => ({
    ...activeHold,
    id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    holdStatus: "expired",
  }));
  largeHistory.push(activeHold);
  const largeCoverage: BookingLeadHoldCoverage = {
    propertyId: PROPERTY_ID,
    complete: true,
    data: largeHistory,
    meta: { limit: 100, offset: 0, total: largeHistory.length },
  };
  assert.equal(activeBookingLeadHold(largeCoverage, lead)?.id, HOLD_ID);
  assert.equal(
    canCreateBookingLeadHold({
      ...access,
      propertyRollouts: rollout,
      lead,
      coverage: largeCoverage,
    }),
    false,
  );
  assert.equal(canReleaseBookingLeadHold({ ...access, lead, hold: activeHold }), true);
  assert.equal(
    canReleaseBookingLeadHold({ ...access, lead, hold: { ...activeHold, holdStatus: "expired" } }),
    false,
  );
  assert.equal(
    canReleaseBookingLeadHold({ ...access, propertyId: OTHER_PROPERTY_ID, lead, hold: activeHold }),
    false,
  );
});

test("property-scoped invalidation covers leads, holds, rooms, availability, and dashboard", () => {
  const keys = bookingHoldInvalidationKeys(PROPERTY_ID);
  assert.deepEqual(keys, [
    ["booking-leads", "list", { propertyId: PROPERTY_ID }],
    ["booking-lead-holds", PROPERTY_ID],
    ["rooms", PROPERTY_ID],
    ["room", PROPERTY_ID],
    ["roomAvailability", PROPERTY_ID],
    ["dashboard", "summary", PROPERTY_ID],
  ]);
  assert.equal(JSON.stringify(keys).includes(OTHER_PROPERTY_ID), false);
  assert.deepEqual(bookingHoldPostExpiryInvalidationKeys(PROPERTY_ID), [
    ["booking-leads", "list", { propertyId: PROPERTY_ID }],
    ["rooms", PROPERTY_ID],
    ["room", PROPERTY_ID],
    ["roomAvailability", PROPERTY_ID],
    ["dashboard", "summary", PROPERTY_ID],
  ]);
});

test("authority conflicts execute exact property invalidation through the real helper", async () => {
  const invalidated: unknown[] = [];
  await invalidateBookingHoldState(
    {
      invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
        invalidated.push(queryKey);
      },
    } as never,
    PROPERTY_ID,
  );
  assert.deepEqual(invalidated, bookingHoldInvalidationKeys(PROPERTY_ID));
  assert.equal(JSON.stringify(invalidated).includes(OTHER_PROPERTY_ID), false);

  for (const code of [
    "BOOKING_HOLD_ALREADY_ACTIVE",
    "BOOKING_HOLD_ROOM_NOT_VACANT",
    "BOOKING_HOLD_ACTIVE_OCCUPANCY",
    "BOOKING_HOLD_ACTIVE_LEASE",
    "BOOKING_HOLD_NOT_ACTIVE",
  ]) {
    assert.equal(bookingHoldErrorRequiresInvalidation({ code }), true, code);
  }
  assert.equal(bookingHoldErrorRequiresInvalidation({ code: "NETWORK_ERROR" }), false);
  assert.equal(bookingHoldErrorRequiresInvalidation({ code: 409 }), false);
  assert.doesNotThrow(() => assertBookingHoldMutationProperty(PROPERTY_ID, PROPERTY_ID));
  assert.throws(() => assertBookingHoldMutationProperty(OTHER_PROPERTY_ID, PROPERTY_ID));
  assert.throws(() => assertBookingHoldMutationProperty(null, PROPERTY_ID));
});

test("expiry sync uses server expires_at, fires once, and cleanup cancels safely", () => {
  let scheduled: (() => void) | null = null;
  let delay = -1;
  let cleared = 0;
  let refreshed = 0;
  const cleanup = createBookingHoldExpirySync({
    expiresAt: "2026-07-28T00:00:10.000Z",
    now: () => Date.parse("2026-07-28T00:00:00.000Z"),
    schedule: (callback, milliseconds) => {
      scheduled = callback;
      delay = milliseconds;
      return 7;
    },
    clearSchedule: (handle) => {
      assert.equal(handle, 7);
      cleared += 1;
    },
    onExpire: () => {
      refreshed += 1;
    },
  });
  assert.equal(delay, 10_000);
  assert.ok(scheduled);
  const fire = scheduled as unknown as () => void;
  fire();
  fire();
  assert.equal(refreshed, 1);
  cleanup();
  assert.equal(cleared, 1);

  let cancelledRefresh = 0;
  let cancelledCallback: (() => void) | null = null;
  const cancel = createBookingHoldExpirySync({
    expiresAt: "2026-07-28T00:00:10.000Z",
    now: () => 0,
    schedule: (callback) => {
      cancelledCallback = callback;
      return 8;
    },
    clearSchedule: () => undefined,
    onExpire: () => {
      cancelledRefresh += 1;
    },
  });
  cancel();
  const fireCancelled = cancelledCallback as unknown as () => void;
  fireCancelled();
  assert.equal(cancelledRefresh, 0);
});

test("coverage owns one expiry callback per logical hold and stale active data stays one-shot", () => {
  const active = parseBookingLeadHoldDetail({ data: holdWire() });
  const coverage: BookingLeadHoldCoverage = {
    propertyId: PROPERTY_ID,
    complete: true,
    data: [active, active],
    meta: { limit: 100, offset: 0, total: 2 },
  };
  const callbacks: Array<() => void> = [];
  const fired = new Set<string>();
  const refreshed: string[] = [];
  let cleared = 0;
  const cleanup = createBookingHoldCoverageExpirySync({
    coverage,
    fired,
    now: () => Date.parse("2026-07-28T00:00:00.000Z"),
    schedule: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearSchedule: () => {
      cleared += 1;
    },
    onExpire: (propertyId) => refreshed.push(propertyId),
  });

  assert.equal(callbacks.length, 1);
  callbacks[0]!();
  callbacks[0]!();
  assert.deepEqual(refreshed, [PROPERTY_ID]);
  cleanup();
  assert.equal(cleared, 1);

  const staleCleanup = createBookingHoldCoverageExpirySync({
    coverage,
    fired,
    schedule: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    onExpire: (propertyId) => refreshed.push(propertyId),
  });
  assert.equal(callbacks.length, 1);
  staleCleanup();
  assert.deepEqual(refreshed, [PROPERTY_ID]);
});

test("hooks use V2 only, complete coverage, focus refresh, stable retries, and scoped invalidation", () => {
  const reads = source("hooks/useBookingLeadHolds.ts");
  const writes = source("hooks/useBookingLeadHoldMutations.ts");
  assert.match(reads, /adminUxV2Requester\.get/);
  assert.match(reads, /requestBookingLeadHoldCoverage/);
  assert.match(reads, /createBookingHoldCoverageExpirySync/);
  assert.match(reads, /expiryRefreshes\.current\.clear\(\)/);
  assert.match(reads, /bookingHoldPostExpiryInvalidationKeys\(propertyId\)/);
  assert.match(reads, /refetchOnWindowFocus:\s*true/);
  assert.match(reads, /bookingLeadHoldCoverageKey\(propertyId, HOLD_PAGE_LIMIT, 0\)/);
  assert.doesNotMatch(reads, /apiClient|keepPreviousData|placeholderData/);
  assert.equal(writes.match(/adminUxV2Requester\.post/g)?.length, 2);
  for (const [hook, request] of [
    ["useCreateBookingLeadHold", "requestCreateBookingLeadHold"],
    ["useReleaseBookingLeadHold", "requestReleaseBookingLeadHold"],
  ] as const) {
    const hookText = functionText(writes, "useBookingLeadHoldMutations.ts", hook);
    assert.ok(
      hookText.indexOf("assertBookingHoldMutationProperty(currentPropertyId, input.propertyId)") <
        hookText.indexOf(request),
    );
    assert.match(hookText, /invalidateBookingHoldState\(queryClient, hold\.propertyId\)/);
    assert.match(hookText, /bookingHoldErrorRequiresInvalidation\(error\)/);
    assert.match(hookText, /invalidateBookingHoldState\(queryClient, input\.propertyId\)/);
  }
  assert.doesNotMatch(writes, /apiClient|\.patch\(|\.put\(|\.delete\(/);
});

test("desktop and mobile bind hold state and action to each rendered lead without side effects", () => {
  const route = source("routes/booking-leads.tsx");
  assertBookingLeadPageHoldUi(route);
  assert.throws(() => assertBookingLeadPageHoldUi(route.replace(/BookingLeadHoldStatus/g, "span")));
  assert.throws(() =>
    assertBookingLeadPageHoldUi(route.replace("now={holdNow}", "now={Date.now()}")),
  );
  assert.throws(() =>
    assertBookingLeadPageHoldUi(
      route.replace("openHoldDialog(lead)", "openHoldDialogDecoy(lead)") +
        '\nconst decoy = "openHoldDialog(lead) now={holdNow} BookingLeadHoldStatus";',
    ),
  );
  for (const preserved of ["LeadSourceBadge", "LeadStatusBadge", "whatsAppUrlFor", "setPending"]) {
    assert.match(
      functionText(route, "booking-leads.tsx", "BookingLeadsPage"),
      new RegExp(preserved),
    );
  }
});

test("dialog keeps authority, idempotency, safe copy, and synchronous submission guards", () => {
  const dialog = source("components/booking-leads/BookingLeadHoldDialog.tsx");
  assert.match(dialog, /Tahan kamar selama 24 jam/);
  assert.match(dialog, /Tahan Kamar/);
  assert.match(dialog, /Lepaskan tahanan kamar\?/);
  assert.match(dialog, /Lepaskan/);
  assert.match(dialog, /Batal/);
  assert.match(dialog, /tidak membuat penyewaan, penghuni, atau tagihan/i);
  assertHoldDialogSubmission(dialog);
  assert.throws(() => assertHoldDialogSubmission(dialog.replace("submitting.current = true;", "")));
  assert.throws(() =>
    assertHoldDialogSubmission(
      dialog.replace("submissionKey.current ?? newIdempotencyKey()", "newIdempotencyKey()"),
    ),
  );
  assert.throws(() =>
    assertHoldDialogSubmission(dialog.replace("propertyId !== currentPropertyId", "false")),
  );
  assert.match(dialog, /currentPropertyId !== propertyAtOpen\.current/);
  assert.match(dialog, /open=\{open && accessAllowed\}/);
  const status = functionText(dialog, "BookingLeadHoldDialog.tsx", "BookingLeadHoldStatus");
  assert.doesNotMatch(status, /useEffect|setInterval|createBookingHoldExpirySync|onExpired/);
  assert.match(status, /formatBookingHoldRemaining\(hold\.expiresAt, now\)/);
  assert.match(dialog, /lead\.source === "public_kamar" \? \{ roomId: selectedRoomId \}/);
  assert.match(dialog, /room\.genderPolicy === "mixed" \|\| room\.genderPolicy === lead\?\.gender/);
  assert.match(dialog, /room\.kostType\.category === lead\?\.category/);
  assert.doesNotMatch(dialog, /metadata|raw_payload|provider|midtrans/i);
});
