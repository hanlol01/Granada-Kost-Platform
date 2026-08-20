import assert from "node:assert/strict";
import test from "node:test";
import {
  canReadNotificationCenter,
  getNotificationCenter,
  parseNotificationCenterPage,
} from "./admin-ux-notification-center";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  notification_type: "billing.invoice_issued",
  notification_status: "unread",
  priority: "normal",
  title: "Tagihan baru",
  body: "Tagihan baru tersedia untuk ditinjau.",
  read_at: null,
  created_at: "2026-08-18T00:00:00.000Z",
  expires_at: null,
  deep_link: "/payments",
};

test("W08D permits only authorized Admin notification-center access", () => {
  assert.equal(
    canReadNotificationCenter({ roles: ["admin"], permissions: ["notification.manage"] }),
    true,
  );
  assert.equal(
    canReadNotificationCenter({ roles: ["property_owner"], permissions: ["notification.manage"] }),
    false,
  );
  assert.equal(canReadNotificationCenter({ roles: ["admin"], permissions: [] }), false);
});

test("W08D parser requires a safe response including a valid creation timestamp and deep link", () => {
  const parsed = parseNotificationCenterPage({
    data: [item],
    meta: { limit: 20, offset: 0, total: 1, unread_count: 1 },
  });
  assert.equal(parsed.data[0]?.deep_link, "/payments");
  assert.throws(() =>
    parseNotificationCenterPage({
      data: [{ ...item, created_at: null }],
      meta: { limit: 20, offset: 0, total: 1, unread_count: 1 },
    }),
  );
  assert.throws(() =>
    parseNotificationCenterPage({
      data: [{ ...item, deep_link: "/property-owners/private-record" }],
      meta: { limit: 20, offset: 0, total: 1, unread_count: 1 },
    }),
  );
});

test("W08D center request is property-scoped and preserves filtering inputs", async () => {
  let path = "";
  let options: unknown;
  const requester = {
    get: async <T>(nextPath: string, nextOptions?: unknown): Promise<T> => {
      path = nextPath;
      options = nextOptions;
      return { data: [item], meta: { limit: 20, offset: 0, total: 1, unread_count: 1 } } as T;
    },
    post: async <T>(): Promise<T> => ({}) as T,
  };
  await getNotificationCenter(
    { propertyId: "property-a", status: "unread", priority: "high", search: "tagihan" },
    undefined,
    requester,
  );
  assert.equal(path, "/admin/notifications/center");
  assert.deepEqual(options, {
    query: {
      property_id: "property-a",
      status: "unread",
      priority: "high",
      notification_type: undefined,
      search: "tagihan",
      from: undefined,
      to: undefined,
      limit: 20,
      offset: 0,
    },
    signal: undefined,
  });
});
