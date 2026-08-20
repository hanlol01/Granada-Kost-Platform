import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canReadAdminNotifications,
  getAdminNotifications,
  parseAdminNotificationsPage,
} from "./admin-ux-notifications";
import { adminRouteRegistry, getRouteAccessDecision } from "./admin-route-registry";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const item = {
  id: "11111111-1111-4111-8111-111111111111",
  notification_type: "billing.invoice_issued",
  notification_status: "unread",
  priority: "normal",
  created_at: "2026-07-15T00:00:00.000Z",
  expires_at: null,
};

test("M7 notification access requires exact role and permission", () => {
  for (const role of ["owner", "manager", "admin"] as const) {
    assert.equal(
      canReadAdminNotifications({ roles: [role], permissions: ["notification.manage"] }),
      true,
    );
  }
  for (const role of ["property_owner", "technician", "resident"] as const) {
    assert.equal(
      canReadAdminNotifications({ roles: [role], permissions: ["notification.manage"] }),
      false,
    );
  }
  assert.equal(canReadAdminNotifications({ roles: ["admin"], permissions: [] }), false);

  const route = adminRouteRegistry.find((candidate) => candidate.id === "notifications");
  assert.ok(route);
  assert.deepEqual(route.access.roles, ["owner", "manager", "admin"]);
  assert.deepEqual(route.access.readCapabilities, ["notification.manage"]);
  assert.equal(
    getRouteAccessDecision(route, {
      roles: ["technician"],
      permissions: ["notification.manage"],
      isFeatureEnabled: () => true,
    }),
    "forbidden",
  );
});

test("M7 notification parser stores only the closed response whitelist", () => {
  const parsed = parseAdminNotificationsPage({
    data: [
      {
        ...item,
        property_id: "forbidden-property",
        recipient_user_id: "forbidden-recipient",
        title: "forbidden-title",
        body: "forbidden-body",
        metadata: { secret: true },
        provider: "forbidden-provider",
      },
    ],
    meta: { limit: 20, offset: 0, total: 1, cursor: "forbidden-cursor" },
  });

  assert.deepEqual(Object.keys(parsed).sort(), ["data", "meta"]);
  assert.deepEqual(Object.keys(parsed.data[0]).sort(), [
    "created_at",
    "expires_at",
    "id",
    "notification_status",
    "notification_type",
    "priority",
  ]);
  assert.deepEqual(parsed.meta, { limit: 20, offset: 0, total: 1 });
  assert.doesNotMatch(
    JSON.stringify(parsed),
    /forbidden-property|forbidden-recipient|forbidden-title|forbidden-body|secret|provider|cursor/,
  );
});

test("M7 notification parser normalizes unknown type and rejects malformed values", () => {
  const parsed = parseAdminNotificationsPage({
    data: [{ ...item, notification_type: "custom.raw-secret" }],
    meta: { limit: 20, offset: 0, total: 1 },
  });
  assert.equal(parsed.data[0].notification_type, "other");
  assert.doesNotMatch(JSON.stringify(parsed), /custom\.raw-secret/);

  for (const payload of [
    null,
    { data: {}, meta: {} },
    {
      data: [{ ...item, notification_status: "pending" }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    { data: [{ ...item, priority: "critical" }], meta: { limit: 20, offset: 0, total: 1 } },
    { data: [{ ...item, created_at: "not-a-date" }], meta: { limit: 20, offset: 0, total: 1 } },
    {
      data: [{ ...item, created_at: "2026-07-15 00:00:00Z" }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    {
      data: [{ ...item, created_at: "2026-02-30T00:00:00Z" }],
      meta: { limit: 20, offset: 0, total: 1 },
    },
    { data: [item], meta: { limit: 0, offset: 0, total: 1 } },
  ]) {
    assert.throws(() => parseAdminNotificationsPage(payload));
  }
});

test("M7 notification request is GET-only, property-scoped, and forwards AbortSignal", async () => {
  const signal = new AbortController().signal;
  let capturedPath = "";
  let capturedOptions: unknown;
  const requester = {
    get: async <T>(path: string, options?: unknown): Promise<T> => {
      capturedPath = path;
      capturedOptions = options;
      return { data: [item], meta: { limit: 20, offset: 40, total: 41 } } as T;
    },
  };

  const result = await getAdminNotifications(
    {
      propertyId: "property-a",
      status: "read",
      limit: 20,
      offset: 40,
    },
    signal,
    requester,
  );
  assert.equal(capturedPath, "/admin/notifications");
  assert.deepEqual(capturedOptions, {
    query: { property_id: "property-a", status: "read", limit: 20, offset: 40 },
    signal,
  });
  assert.equal(result.meta.total, 41);
});

test("M7 notification query key isolates property, status, limit, and offset", () => {
  const base = adminUxQueryKeys.notifications.list("property-a", {
    status: "unread",
    limit: 20,
    offset: 0,
  });
  assert.notDeepEqual(
    base,
    adminUxQueryKeys.notifications.list("property-b", { status: "unread", limit: 20, offset: 0 }),
  );
  assert.notDeepEqual(
    base,
    adminUxQueryKeys.notifications.list("property-a", { status: "read", limit: 20, offset: 0 }),
  );
  assert.notDeepEqual(
    base,
    adminUxQueryKeys.notifications.list("property-a", { status: "unread", limit: 10, offset: 0 }),
  );
  assert.notDeepEqual(
    base,
    adminUxQueryKeys.notifications.list("property-a", { status: "unread", limit: 20, offset: 20 }),
  );
});

test("M7 notification route keeps its path while W08D adds scoped inbox state actions", async () => {
  const route = await readFile(resolve(root, "routes/notifications.tsx"), "utf8");
  const hook = await readFile(resolve(root, "hooks/useAdminNotifications.ts"), "utf8");

  assert.match(route, /createFileRoute\("\/notifications"\)/);
  assert.match(route, /ForbiddenState/);
  assert.match(route, /LoadingState/);
  assert.match(route, /ErrorState/);
  assert.match(route, /EmptyState/);
  assert.match(route, /query\.data\.data\.map/);
  assert.match(route, /pagination\.propertyId === currentPropertyId/);
  assert.match(route, /query\.data\.meta\.offset > 0/);
  assert.match(hook, /enabled: Boolean\(currentPropertyId\) && hasAccess/);
  assert.match(hook, /\{ signal \}/);
  assert.doesNotMatch(hook, /setCurrentPropertyId/);
  assert.doesNotMatch(route + hook, /mock-data|refetchInterval|placeholderData|keepPreviousData/);
  assert.match(route, /useAdminNotificationCenter/);
  assert.match(route, /Tandai semua dibaca/);
  assert.match(route, /Arsipkan/);
  assert.match(route, /Tandai dibaca/);
});
