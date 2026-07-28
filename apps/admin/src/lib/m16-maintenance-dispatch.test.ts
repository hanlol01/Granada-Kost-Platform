import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import {
  canDispatchComplaint,
  findActionableComplaintWorkOrder,
  invalidateMaintenanceDispatch,
  maintenanceDispatchInvalidationKeys,
  MAINTENANCE_PRIORITY_LABELS,
  parseMaintenanceDispatch,
  parseTechnicianList,
  parseWorkOrderDetail,
  parseWorkOrderList,
  requestComplaintDispatch,
  requestTechnicianReferences,
  requestWorkOrderCoverage,
  requestWorkOrderDetail,
  resolveComplaintWorkOrderAuthority,
  WORK_ORDER_STATUS_LABELS,
  type AdminWorkOrder,
  type MaintenanceDispatchInput,
} from "./admin-maintenance";
import { selectMaintenanceSummary } from "./reports-selectors";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const COMPLAINT_ID = "33333333-3333-4333-8333-333333333333";
const WORK_ORDER_ID = "44444444-4444-4444-8444-444444444444";
const TECHNICIAN_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_WORK_ORDER_ID = "66666666-6666-4666-8666-666666666666";
const ROOM_ID = "77777777-7777-4777-8777-777777777777";
const IDEMPOTENCY_KEY = "m16-admin-dispatch-0001";

const source = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");

function workOrderWire(overrides: Record<string, unknown> = {}) {
  return {
    id: WORK_ORDER_ID,
    propertyId: PROPERTY_ID,
    roomId: null,
    complaintId: COMPLAINT_ID,
    workOrderCode: "WO-DEMO-2026-0001",
    priority: "medium",
    status: "assigned",
    assignedToUserId: TECHNICIAN_ID,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
    ...overrides,
  };
}

function complaintWire(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPLAINT_ID,
    propertyId: PROPERTY_ID,
    roomId: null,
    complaintCode: "CMP-DEMO-2026-0001",
    priority: "medium",
    status: "in_progress",
    assignedToUserId: TECHNICIAN_ID,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
    ...overrides,
  };
}

function dispatchWire(
  complaintOverrides: Record<string, unknown> = {},
  workOrderOverrides: Record<string, unknown> = {},
) {
  return {
    data: {
      complaint: complaintWire(complaintOverrides),
      work_order: workOrderWire(workOrderOverrides),
    },
  };
}

function dispatchInput(
  overrides: Partial<MaintenanceDispatchInput> = {},
): MaintenanceDispatchInput {
  return {
    propertyId: PROPERTY_ID,
    complaintId: COMPLAINT_ID,
    complaintCode: "CMP-DEMO-2026-0001",
    roomId: null,
    priority: "medium",
    technicianUserId: TECHNICIAN_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
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

function functionText(text: string, fileName: string, name: string): string {
  const parsed = parseTsx(text, fileName);
  const matches: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(matches.length, 1, `expected one ${name}`);
  return matches[0]!.getText(parsed);
}

function renderedPropertyNames(text: string, fileName: string): string[] {
  const parsed = parseTsx(text, fileName);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isPropertyAccessExpression(node.expression) &&
      !ts.isJsxAttribute(node.parent)
    ) {
      names.push(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return names;
}

function assertComplaintPriorityLabelsBound(text: string): void {
  const parsed = parseTsx(text, "complaints.tsx");
  let listBadges = 0;
  let detailBadges = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "MAINTENANCE_PRIORITY_LABELS" &&
      node.argumentExpression &&
      ts.isPropertyAccessExpression(node.argumentExpression) &&
      node.argumentExpression.name.text === "priority" &&
      ts.isIdentifier(node.argumentExpression.expression)
    ) {
      const owner = node.argumentExpression.expression.text;
      let current: ts.Node | undefined = node.parent;
      while (current && !ts.isJsxElement(current)) current = current.parent;
      assert.ok(current && ts.isJsxElement(current), "priority label must render in JSX");
      assert.equal(current.openingElement.tagName.getText(parsed), "span");
      const className = current.openingElement.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === "className",
      );
      assert.ok(className?.initializer?.getText(parsed).includes(`PRIO_META[${owner}.priority]`));

      if (owner === "c") {
        let arrow: ts.Node | undefined = current.parent;
        while (arrow && !ts.isArrowFunction(arrow)) arrow = arrow.parent;
        assert.ok(arrow && ts.isArrowFunction(arrow));
        assert.equal(arrow.parameters[0]?.name.getText(parsed), "c");
        assert.ok(ts.isCallExpression(arrow.parent));
        assert.equal(arrow.parent.expression.getText(parsed), "filtered.map");
        listBadges += 1;
      } else if (owner === "selected") {
        let ancestor: ts.Node | undefined = current.parent;
        let inDialogTitle = false;
        while (ancestor) {
          if (
            ts.isJsxElement(ancestor) &&
            ancestor.openingElement.tagName.getText(parsed) === "DialogTitle"
          ) {
            inDialogTitle = true;
            break;
          }
          ancestor = ancestor.parent;
        }
        assert.equal(inDialogTitle, true);
        detailBadges += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(listBadges, 1);
  assert.equal(detailBadges, 1);
}

function assertDispatchSubmissionSafety(text: string): void {
  const submit = functionText(text, "MaintenanceDispatchDialog.tsx", "MaintenanceDispatchDialog");
  for (const required of [
    "!technicianUserId",
    "!technicianIsAuthoritative",
    "submitting.current",
    "mutation.isPending",
    "const accessIsCurrent = canDispatchComplaint",
    "!accessIsCurrent",
    "submissionKey.current ?? newIdempotencyKey()",
    "propertyAtOpen.current !== currentPropertyId",
    "complaintAtOpen.current !== complaint.id",
    "technicianAtSubmit.current !== technicianUserId",
    "complaintCode: complaint.complaintCode",
    "roomId: complaint.roomId",
    "priority: complaint.priority",
    "submissionKey.current = null",
    "onOpenChange(false)",
  ]) {
    assert.ok(submit.includes(required), `missing dispatch safety: ${required}`);
  }
  assert.match(
    submit,
    /Boolean\(techniciansError\)\s*\|\|\s*submitting\.current\s*\|\|\s*mutation\.isPending/,
    "the synchronous guard must block while either submission signal is pending",
  );
  const guardIndex = submit.indexOf("submitting.current = true");
  const authorityIndex = submit.indexOf("const technicianIsAuthoritative");
  const keyIndex = submit.indexOf("submissionKey.current ?? newIdempotencyKey()");
  const requestIndex = submit.indexOf("mutation.mutateAsync");
  const staleIndex = submit.indexOf("propertyAtOpen.current !== currentPropertyId", requestIndex);
  const toastIndex = submit.indexOf("toastMutationSuccess", requestIndex);
  const closeIndex = submit.indexOf("onOpenChange(false)", toastIndex);
  assert.ok(
    guardIndex >= 0 &&
      authorityIndex >= 0 &&
      authorityIndex < guardIndex &&
      guardIndex < keyIndex &&
      keyIndex < requestIndex &&
      requestIndex < staleIndex &&
      staleIndex < toastIndex &&
      toastIndex < closeIndex,
    "dispatch ordering must guard, reuse key, request, reject stale result, then notify and close",
  );
}

function assertCanonicalReportsSource(reports: string, workOrderHooks: string): void {
  for (const status of ["open", "assigned", "in_progress", "on_hold", "rework_required"]) {
    assert.match(reports, new RegExp(`"${status}"`));
  }
  assert.doesNotMatch(reports, /["'](?:created|reworking)["']/);
  assert.doesNotMatch(workOrderHooks, /\btitle:\s*string|\bdescription:\s*string/);
}

function assertScopedInvalidationSource(text: string): void {
  const invalidation = functionText(
    text,
    "admin-maintenance.ts",
    "maintenanceDispatchInvalidationKeys",
  );
  assert.match(invalidation, /\["complaints",\s*"list",\s*\{\s*propertyId\s*\}\]/);
  assert.match(invalidation, /\["maintenance",\s*"work-orders",\s*propertyId\]/);
  assert.match(invalidation, /adminUxQueryKeys\.dashboard\.summary\(propertyId\)/);
  assert.doesNotMatch(invalidation, /\["complaints"\s*\]/);
  assert.doesNotMatch(invalidation, /\["maintenance",\s*"work-orders"\s*\]/);
}

test("strict parsers accept exact V2 envelopes and copy only maintenance whitelists", () => {
  assert.deepEqual(
    parseTechnicianList({
      data: [{ user_id: TECHNICIAN_ID, display_name: "Teknisi Demo", skill_tags: "listrik, AC" }],
    }),
    [{ userId: TECHNICIAN_ID, displayName: "Teknisi Demo", skillTags: "listrik, AC" }],
  );
  const workOrder = parseWorkOrderDetail({ data: workOrderWire() });
  assert.deepEqual(Object.keys(workOrder).sort(), [
    "assignedToUserId",
    "complaintId",
    "completedAt",
    "createdAt",
    "id",
    "priority",
    "propertyId",
    "roomId",
    "scheduledAt",
    "startedAt",
    "status",
    "updatedAt",
    "verifiedAt",
    "workOrderCode",
  ]);
  assert.deepEqual(
    parseWorkOrderList({ data: [workOrderWire()], meta: { limit: 20, offset: 0, total: 1 } }),
    {
      data: [workOrder],
      meta: { limit: 20, offset: 0, total: 1 },
    },
  );
  const dispatch = parseMaintenanceDispatch(dispatchWire());
  assert.equal(dispatch.complaint.id, COMPLAINT_ID);
  assert.equal(dispatch.workOrder.id, WORK_ORDER_ID);

  assert.throws(() => parseTechnicianList([{ user_id: TECHNICIAN_ID }]));
  assert.throws(() =>
    parseTechnicianList({
      data: [
        {
          user_id: TECHNICIAN_ID,
          display_name: "Teknisi Demo",
          skill_tags: null,
          phone: "forbidden",
        },
      ],
    }),
  );
  assert.throws(() =>
    parseTechnicianList({
      data: [{ user_id: TECHNICIAN_ID, display_name: "   ", skill_tags: null }],
    }),
  );
  assert.throws(() => parseWorkOrderDetail(workOrderWire()));
  assert.throws(() => parseWorkOrderDetail({ data: workOrderWire({ metadata: {} }) }));
  assert.throws(() => parseWorkOrderDetail({ data: workOrderWire({ workOrderCode: "  " }) }));
  assert.throws(() => parseWorkOrderDetail({ data: workOrderWire({ status: "created" }) }));
  assert.throws(() => parseWorkOrderDetail({ data: workOrderWire({ status: "reworking" }) }));
  assert.throws(() => parseWorkOrderDetail({ data: workOrderWire({ updatedAt: "yesterday" }) }));
  assert.throws(() =>
    parseWorkOrderList({ data: [workOrderWire()], meta: { limit: 20, offset: 0 } }),
  );
  assert.throws(() => parseMaintenanceDispatch({ data: dispatchWire().data, metadata: {} }));
  assert.throws(() =>
    parseMaintenanceDispatch(dispatchWire({}, { complaintId: OTHER_WORK_ORDER_ID })),
  );
  assert.throws(() =>
    parseMaintenanceDispatch(dispatchWire({}, { propertyId: OTHER_PROPERTY_ID })),
  );
  assert.throws(() =>
    parseMaintenanceDispatch(dispatchWire({}, { assignedToUserId: OTHER_WORK_ORDER_ID })),
  );
  assert.throws(() => parseMaintenanceDispatch(dispatchWire({}, { roomId: ROOM_ID })));
  assert.throws(() => parseMaintenanceDispatch(dispatchWire({}, { priority: "urgent" })));
});

test("requesters use exact endpoints, property query, payload and logical idempotency key", async () => {
  const gets: Array<{ path: string; options: unknown }> = [];
  await requestTechnicianReferences(async (path, options) => {
    gets.push({ path, options });
    return { data: [{ user_id: TECHNICIAN_ID, display_name: "Teknisi Demo", skill_tags: null }] };
  }, PROPERTY_ID);
  await requestWorkOrderDetail(async (path, options) => {
    gets.push({ path, options });
    return { data: workOrderWire() };
  }, WORK_ORDER_ID);
  assert.deepEqual(gets, [
    {
      path: "/maintenance/technicians",
      options: { query: { property_id: PROPERTY_ID }, signal: undefined },
    },
    { path: `/work-orders/${WORK_ORDER_ID}`, options: { signal: undefined } },
  ]);

  const posts: Array<{ path: string; body: unknown; options: unknown }> = [];
  const result = await requestComplaintDispatch(async (path, body, options) => {
    posts.push({ path, body, options });
    return dispatchWire();
  }, dispatchInput());
  assert.equal(result.workOrder.assignedToUserId, TECHNICIAN_ID);
  assert.deepEqual(posts, [
    {
      path: `/complaints/${COMPLAINT_ID}/assign`,
      body: { assigned_to_user_id: TECHNICIAN_ID },
      options: { idempotencyKey: IDEMPOTENCY_KEY },
    },
  ]);
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () => dispatchWire({}, { propertyId: OTHER_PROPERTY_ID }),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () => dispatchWire({ id: OTHER_WORK_ORDER_ID }, { complaintId: OTHER_WORK_ORDER_ID }),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () =>
        dispatchWire({ propertyId: OTHER_PROPERTY_ID }, { propertyId: OTHER_PROPERTY_ID }),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () =>
        dispatchWire(
          { assignedToUserId: OTHER_WORK_ORDER_ID },
          { assignedToUserId: OTHER_WORK_ORDER_ID },
        ),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () => dispatchWire({ complaintCode: "CMP-OTHER" }),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () => dispatchWire({ roomId: ROOM_ID }, { roomId: ROOM_ID }),
      dispatchInput(),
    ),
  );
  await assert.rejects(() =>
    requestComplaintDispatch(
      async () => dispatchWire({ priority: "urgent" }, { priority: "urgent" }),
      dispatchInput(),
    ),
  );
});

test("authoritative coverage traverses all pages and rejects unstable or incomplete property data", async () => {
  const controller = new AbortController();
  const calls: Array<{ path: string; query: unknown; signal: AbortSignal | undefined }> = [];
  const coverage = await requestWorkOrderCoverage(
    async (path, options) => {
      calls.push({ path, query: options?.query, signal: options?.signal });
      const offset = Number(options?.query?.offset);
      return {
        data:
          offset === 0
            ? [workOrderWire()]
            : [workOrderWire({ id: OTHER_WORK_ORDER_ID, status: "verified" })],
        meta: { limit: 1, offset, total: 2 },
      };
    },
    PROPERTY_ID,
    undefined,
    controller.signal,
    1,
  );
  assert.equal(coverage.complete, true);
  assert.equal(coverage.data.length, 2);
  assert.deepEqual(
    calls.map(({ path, query }) => ({ path, query })),
    [
      {
        path: "/work-orders",
        query: { property_id: PROPERTY_ID, limit: 1, offset: 0, status: undefined },
      },
      {
        path: "/work-orders",
        query: { property_id: PROPERTY_ID, limit: 1, offset: 1, status: undefined },
      },
    ],
  );
  assert.equal(
    calls.every((call) => call.signal === controller.signal),
    true,
  );

  const rejectCoverage = (
    responder: (offset: number) => {
      data: Record<string, unknown>[];
      meta: { limit: number; offset: number; total: number };
    },
  ) =>
    assert.rejects(() =>
      requestWorkOrderCoverage(
        async (_path, options) => responder(Number(options?.query?.offset)),
        PROPERTY_ID,
        undefined,
        undefined,
        1,
      ),
    );

  await rejectCoverage((offset) => ({
    data: [workOrderWire({ id: offset === 0 ? WORK_ORDER_ID : OTHER_WORK_ORDER_ID })],
    meta: { limit: 1, offset, total: offset === 0 ? 2 : 3 },
  }));
  await rejectCoverage((offset) => ({
    data: [workOrderWire()],
    meta: { limit: 1, offset, total: 2 },
  }));
  await rejectCoverage((offset) => ({
    data:
      offset === 0
        ? [workOrderWire()]
        : [workOrderWire({ id: OTHER_WORK_ORDER_ID, propertyId: OTHER_PROPERTY_ID })],
    meta: { limit: 1, offset, total: 2 },
  }));
  await rejectCoverage((offset) => ({
    data: offset === 0 ? [workOrderWire()] : [],
    meta: { limit: 1, offset, total: 2 },
  }));
  await rejectCoverage((offset) => ({
    data: [workOrderWire()],
    meta: { limit: 1, offset: offset + 1, total: 1 },
  }));

  let boundedCalls = 0;
  await assert.rejects(() =>
    requestWorkOrderCoverage(
      async (_path, options) => {
        boundedCalls += 1;
        const offset = Number(options?.query?.offset);
        return {
          data: [
            workOrderWire({
              id: `00000000-0000-4000-8000-${String(offset).padStart(12, "0")}`,
            }),
          ],
          meta: { limit: 1, offset, total: 101 },
        };
      },
      PROPERTY_ID,
      undefined,
      undefined,
      1,
    ),
  );
  assert.equal(boundedCalls, 100);
});

test("access fails closed on role, dual permissions, property, terminal complaint and completed work", () => {
  const base = {
    roles: ["manager"],
    permissions: ["complaint.manage", "maintenance.manage"],
    propertyId: PROPERTY_ID,
    complaint: {
      id: COMPLAINT_ID,
      propertyId: PROPERTY_ID,
      complaintStatus: "acknowledged" as const,
    },
    actionableWorkOrder: null,
    authorityAnomaly: false,
    coverageComplete: true,
  };
  for (const role of ["owner", "manager", "admin"]) {
    assert.equal(canDispatchComplaint({ ...base, roles: [role] }), true);
  }
  assert.equal(canDispatchComplaint({ ...base, roles: ["technician"] }), false);
  assert.equal(canDispatchComplaint({ ...base, permissions: ["complaint.manage"] }), false);
  assert.equal(canDispatchComplaint({ ...base, permissions: ["maintenance.manage"] }), false);
  assert.equal(canDispatchComplaint({ ...base, propertyId: OTHER_PROPERTY_ID }), false);
  assert.equal(canDispatchComplaint({ ...base, authorityAnomaly: true }), false);
  assert.equal(canDispatchComplaint({ ...base, coverageComplete: false }), false);
  for (const status of ["resolved", "closed", "cancelled"] as const) {
    assert.equal(
      canDispatchComplaint({ ...base, complaint: { ...base.complaint, complaintStatus: status } }),
      false,
    );
  }
  assert.equal(
    canDispatchComplaint({
      ...base,
      actionableWorkOrder: {
        propertyId: PROPERTY_ID,
        complaintId: COMPLAINT_ID,
        status: "completed",
      },
    }),
    false,
  );
  assert.equal(
    canDispatchComplaint({
      ...base,
      actionableWorkOrder: {
        propertyId: PROPERTY_ID,
        complaintId: OTHER_WORK_ORDER_ID,
        status: "assigned",
      },
    }),
    false,
  );
});

test("actionable lookup and status labels follow canonical M16 contract", () => {
  const completed = workOrderWire({ status: "completed" }) as unknown as AdminWorkOrder;
  const verified = workOrderWire({
    id: OTHER_WORK_ORDER_ID,
    status: "verified",
    updatedAt: "2026-07-28T02:00:00.000Z",
  }) as unknown as AdminWorkOrder;
  assert.equal(
    findActionableComplaintWorkOrder(
      {
        propertyId: PROPERTY_ID,
        complete: true,
        data: [completed, verified],
        meta: { limit: 100, offset: 0, total: 2 },
      },
      PROPERTY_ID,
      COMPLAINT_ID,
    )?.status,
    "completed",
  );
  const assigned = workOrderWire({
    id: OTHER_WORK_ORDER_ID,
    status: "assigned",
    updatedAt: "2026-07-28T03:00:00.000Z",
  }) as unknown as AdminWorkOrder;
  const multiple = {
    propertyId: PROPERTY_ID,
    complete: true as const,
    data: [completed, assigned],
    meta: { limit: 100, offset: 0, total: 2 },
  };
  assert.deepEqual(resolveComplaintWorkOrderAuthority(multiple, PROPERTY_ID, COMPLAINT_ID), {
    workOrder: null,
    actionableWorkOrder: null,
    anomaly: true,
  });
  assert.equal(findActionableComplaintWorkOrder(multiple, PROPERTY_ID, COMPLAINT_ID), null);

  const cancelled = workOrderWire({
    status: "cancelled",
    updatedAt: "2026-07-28T04:00:00.000Z",
  }) as unknown as AdminWorkOrder;
  const terminalAuthority = resolveComplaintWorkOrderAuthority(
    {
      propertyId: PROPERTY_ID,
      complete: true,
      data: [verified, cancelled],
      meta: { limit: 100, offset: 0, total: 2 },
    },
    PROPERTY_ID,
    COMPLAINT_ID,
  );
  assert.equal(terminalAuthority.anomaly, false);
  assert.equal(terminalAuthority.actionableWorkOrder, null);
  assert.equal(terminalAuthority.workOrder?.status, "cancelled");

  const actionableAuthority = resolveComplaintWorkOrderAuthority(
    {
      propertyId: PROPERTY_ID,
      complete: true,
      data: [verified, completed],
      meta: { limit: 100, offset: 0, total: 2 },
    },
    PROPERTY_ID,
    COMPLAINT_ID,
  );
  assert.equal(actionableAuthority.workOrder?.status, "completed");
  assert.equal(actionableAuthority.actionableWorkOrder?.status, "completed");
  assert.deepEqual(WORK_ORDER_STATUS_LABELS, {
    open: "Terbuka",
    assigned: "Ditugaskan",
    in_progress: "Dikerjakan",
    on_hold: "Ditunda",
    completed: "Selesai, menunggu verifikasi",
    rework_required: "Perlu dikerjakan ulang",
    verified: "Terverifikasi",
    cancelled: "Dibatalkan",
  });
  assert.deepEqual(MAINTENANCE_PRIORITY_LABELS, {
    low: "Rendah",
    medium: "Sedang",
    high: "Tinggi",
    urgent: "Mendesak",
  });
});

test("success invalidates only exact active-property complaint, work-order and dashboard scopes", async () => {
  assert.deepEqual(maintenanceDispatchInvalidationKeys(PROPERTY_ID), [
    ["complaints", "list", { propertyId: PROPERTY_ID }],
    ["maintenance", "work-orders", PROPERTY_ID],
    ["dashboard", "summary", PROPERTY_ID],
  ]);
  const invalidated: unknown[] = [];
  await invalidateMaintenanceDispatch(
    {
      invalidateQueries: async (filters) => {
        invalidated.push(filters?.queryKey);
      },
    },
    PROPERTY_ID,
  );
  assert.deepEqual(invalidated, maintenanceDispatchInvalidationKeys(PROPERTY_ID));
  assert.equal(JSON.stringify(invalidated).includes(OTHER_PROPERTY_ID), false);
  assert.equal(JSON.stringify(invalidated).includes(IDEMPOTENCY_KEY), false);

  const maintenance = source("lib/admin-maintenance.ts");
  assertScopedInvalidationSource(maintenance);
  assert.match(
    source("hooks/useComplaints.ts"),
    /queryKey:\s*\["complaints",\s*"list",\s*\{\s*propertyId:\s*currentPropertyId\s*\},\s*filters\]/,
  );
  assert.throws(() =>
    assertScopedInvalidationSource(
      maintenance.replace('["complaints", "list", { propertyId }]', '["complaints"]'),
    ),
  );
});

test("Reports counts every canonical open status without legacy enum or invented V2 fields", () => {
  const summary = selectMaintenanceSummary(
    [
      "open",
      "assigned",
      "in_progress",
      "on_hold",
      "rework_required",
      "completed",
      "verified",
      "cancelled",
    ].map((workOrderStatus) => ({
      workOrderStatus: workOrderStatus as Parameters<
        typeof selectMaintenanceSummary
      >[0][number]["workOrderStatus"],
    })),
  );
  assert.equal(summary.total, 8);
  assert.equal(summary.open, 5);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.verified, 1);
  assert.equal(summary.cancelled, 1);

  const reports = source("lib/reports-selectors.ts");
  const workOrderHooks = source("hooks/useWorkOrders.ts");
  assertCanonicalReportsSource(reports, workOrderHooks);
  assert.throws(() =>
    assertCanonicalReportsSource(reports.replace('"open"', '"created"'), workOrderHooks),
  );
  assert.throws(() => assertCanonicalReportsSource(reports, `${workOrderHooks}\ntitle: string;`));
});

test("hooks consume only Admin UX V2 maintenance wire with property-safe query keys", () => {
  const workOrders = source("hooks/useWorkOrders.ts");
  const mutations = source("hooks/useComplaintMutations.ts");
  const route = functionText(source("routes/complaints.tsx"), "complaints.tsx", "ComplaintsPage");
  assert.match(workOrders, /adminUxV2Requester/);
  assert.doesNotMatch(workOrders, /\bapiClient\b/);
  assert.match(workOrders, /requestWorkOrderCoverage/);
  assert.match(workOrders, /requestTechnicianReferences/);
  assert.match(workOrders, /maintenanceQueryKeys\.workOrders/);
  assert.match(workOrders, /maintenanceQueryKeys\.technicians/);
  assert.match(mutations, /requestComplaintDispatch/);
  assert.match(mutations, /adminUxV2Requester\.post/);
  assert.match(mutations, /invalidateMaintenanceDispatch/);
  assert.match(route, /const maintenanceDetailNeeded = Boolean/);
  assert.match(route, /canReadMaintenance\s*&&/);
  assert.match(route, /selected\?\.propertyId === currentPropertyId/);
  assert.match(route, /useWorkOrders\(\{\}, maintenanceDetailNeeded\)/);
  assert.match(route, /useMaintenanceTechnicians\(maintenanceDetailNeeded\)/);
  assert.doesNotMatch(route, /useWorkOrders\(\{\}, canReadMaintenance\)/);
  assert.doesNotMatch(route, /useMaintenanceTechnicians\(canReadMaintenance\)/);
});

test("complaint detail owns dispatch action and read-only work-order tracking without lifecycle endpoints", () => {
  const routeSource = source("routes/complaints.tsx");
  const route = functionText(routeSource, "complaints.tsx", "ComplaintsPage");
  assert.match(route, /<ComplaintWorkOrderPanel/);
  assert.match(route, /<MaintenanceDispatchDialog/);
  assert.match(route, /setDispatchTarget\(selected\)/);
  assert.match(route, /"Assign Teknisi"/);
  assert.match(route, /"Ganti Teknisi"/);
  assert.match(route, /selectedActionableWorkOrder/);
  assert.match(route, /authority=\{selectedWorkOrderAuthority\}/);
  assert.match(route, /authorityAnomaly=\{dispatchWorkOrderAuthority\.anomaly\}/);
  assert.match(route, /complaint=\{dispatchTarget\}/);
  assert.match(route, /authorityAnomaly:\s*selectedWorkOrderAuthority\.anomaly/);
  assertComplaintPriorityLabelsBound(routeSource);
  assert.doesNotMatch(route, /\{(?:c|selected)\.priority\}/);
  assert.throws(() =>
    assertComplaintPriorityLabelsBound(
      routeSource.replace("{MAINTENANCE_PRIORITY_LABELS[c.priority]}", "{c.priority}"),
    ),
  );
  assert.throws(() =>
    assertComplaintPriorityLabelsBound(
      routeSource.replace(
        "{MAINTENANCE_PRIORITY_LABELS[selected.priority]}",
        "{selected.priority}",
      ),
    ),
  );
  assert.doesNotMatch(route, /Picker teknisi belum tersedia/);

  const panel = source("components/maintenance/ComplaintWorkOrderPanel.tsx");
  assert.match(panel, /const workOrder = authority\.workOrder/);
  assert.match(panel, /authority\.anomaly/);
  assert.match(panel, /Rekonsiliasi data diperlukan/);
  assert.doesNotMatch(panel, /findComplaintWorkOrders[\s\S]*\[0\]/);

  const production = [
    source("lib/admin-maintenance.ts"),
    source("hooks/useWorkOrders.ts"),
    source("components/maintenance/MaintenanceDispatchDialog.tsx"),
    source("components/maintenance/ComplaintWorkOrderPanel.tsx"),
  ].join("\n");
  for (const forbidden of [
    "/start",
    "/complete",
    "/verify",
    "/rework",
    "/cancel",
    "midtrans",
    "webhook",
    "settlement",
  ]) {
    assert.equal(production.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("dialog enforces stable logical idempotency, synchronous guard and stale-scope isolation", () => {
  const dialog = source("components/maintenance/MaintenanceDispatchDialog.tsx");
  assertDispatchSubmissionSafety(dialog);
  assert.match(dialog, /nextTechnicianId !== technicianUserId/);
  assert.match(dialog, /submissionKey\.current = null/);
  assert.match(dialog, /currentPropertyId !== propertyAtOpen\.current/);
  assert.match(dialog, /complaint\?\.id !== complaintAtOpen\.current/);
  assert.match(dialog, /setTechnicianUserId\(\(current\) =>/);
  assert.match(
    dialog,
    /technicians\?\.some\(\(technician\) => technician\.userId === technicianUserId\) === true/,
  );
  assert.match(
    dialog,
    /if \(!technicians\?\.some\(\(technician\) => technician\.userId === nextTechnicianId\)\) return/,
  );

  assert.throws(() =>
    assertDispatchSubmissionSafety(dialog.replace("submitting.current ||", "false ||")),
  );
  assert.throws(() =>
    assertDispatchSubmissionSafety(
      dialog.replace("submissionKey.current ?? newIdempotencyKey()", "newIdempotencyKey()"),
    ),
  );
  assert.throws(() =>
    assertDispatchSubmissionSafety(
      dialog.replace("propertyAtOpen.current !== currentPropertyId", "false"),
    ),
  );
  assert.throws(() =>
    assertDispatchSubmissionSafety(dialog.replace("!technicianIsAuthoritative", "false")),
  );
  assert.throws(() => assertDispatchSubmissionSafety(dialog.replace("!accessIsCurrent", "false")));
});

test("dialog and tracking remain accessible, responsive and never render opaque identifiers", () => {
  const dialog = source("components/maintenance/MaintenanceDispatchDialog.tsx");
  const panel = source("components/maintenance/ComplaintWorkOrderPanel.tsx");
  parseTsx(dialog, "MaintenanceDispatchDialog.tsx");
  parseTsx(panel, "ComplaintWorkOrderPanel.tsx");
  for (const required of [
    'role="alert"',
    "aria-describedby",
    "autoFocus",
    "min-h-11",
    "w-[calc(100vw-2rem)]",
    "flex-col-reverse",
    "sm:flex-row",
    "Memuat teknisi",
    "Belum ada teknisi aktif",
    "Coba lagi",
  ]) {
    assert.ok(dialog.includes(required), required);
  }
  for (const required of [
    "Memuat work order",
    "Belum ada work order",
    "Gagal memuat work order",
    "WORK_ORDER_STATUS_LABELS",
    "MAINTENANCE_PRIORITY_LABELS",
  ]) {
    assert.ok(panel.includes(required), required);
  }
  const rendered = [
    ...renderedPropertyNames(dialog, "MaintenanceDispatchDialog.tsx"),
    ...renderedPropertyNames(panel, "ComplaintWorkOrderPanel.tsx"),
  ];
  for (const opaque of ["userId", "id", "complaintId", "roomId", "assignedToUserId"]) {
    assert.equal(rendered.includes(opaque), false, `${opaque} must not be rendered`);
  }
  assert.doesNotMatch(dialog, /\b(?:slate|blue)-\d{2,3}\b|text-white/);
  assert.doesNotMatch(panel, /\b(?:slate|blue)-\d{2,3}\b|text-white/);
});
