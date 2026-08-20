import type { RoleCode } from "@granada-kost/domain";
import {
  adminUxV2Requester,
  type AdminUxQueryValue,
  type AdminUxV2Requester,
} from "./admin-ux-api";
import { newIdempotencyKey } from "./idempotency";

export const NOTIFICATION_CENTER_STATUSES = ["unread", "read", "archived"] as const;
export const NOTIFICATION_CENTER_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type NotificationCenterStatus = (typeof NOTIFICATION_CENTER_STATUSES)[number];
export type NotificationCenterPriority = (typeof NOTIFICATION_CENTER_PRIORITIES)[number];
export type NotificationCenterItem = {
  id: string;
  notification_type: string;
  notification_status: NotificationCenterStatus;
  priority: NotificationCenterPriority;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
  deep_link: string | null;
};
export type NotificationCenterPage = {
  data: NotificationCenterItem[];
  meta: { limit: number; offset: number; total: number; unread_count: number };
};
export type NotificationCenterInput = {
  propertyId: string;
  status?: NotificationCenterStatus;
  priority?: NotificationCenterPriority;
  notificationType?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};
export type NotificationCenterAccess = {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
};
const ROLES = new Set<RoleCode>(["owner", "manager", "admin"]);
const STATUSES = new Set<string>(NOTIFICATION_CENTER_STATUSES);
const PRIORITIES = new Set<string>(NOTIFICATION_CENTER_PRIORITIES);
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid notification center response.");
  return value as Record<string, unknown>;
}
function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Invalid notification center ${field}.`);
  return value;
}
function timestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  const text = stringValue(value, field);
  if (!RFC3339.test(text)) throw new Error(`Invalid notification center ${field}.`);
  return text;
}
function requiredTimestamp(value: unknown, field: string): string {
  const parsed = timestamp(value, field);
  if (!parsed) throw new Error(`Invalid notification center ${field}.`);
  return parsed;
}
function item(value: unknown): NotificationCenterItem {
  const row = record(value);
  const status = stringValue(row.notification_status, "status");
  const priority = stringValue(row.priority, "priority");
  if (!STATUSES.has(status) || !PRIORITIES.has(priority))
    throw new Error("Invalid notification center state.");
  const deepLink = row.deep_link === null ? null : stringValue(row.deep_link, "deep link");
  if (
    deepLink &&
    !/^\/(payments|complaints|vehicles|tenants)(\?tab=maintenance)?$/.test(deepLink)
  ) {
    throw new Error("Invalid notification center deep link.");
  }
  return {
    id: stringValue(row.id, "id"),
    notification_type: stringValue(row.notification_type, "type"),
    notification_status: status as NotificationCenterStatus,
    priority: priority as NotificationCenterPriority,
    title: stringValue(row.title, "title"),
    body: stringValue(row.body, "body"),
    read_at: timestamp(row.read_at, "read time"),
    created_at: requiredTimestamp(row.created_at, "creation time"),
    expires_at: timestamp(row.expires_at, "expiry"),
    deep_link: deepLink,
  };
}
function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error(`Invalid notification center ${field}.`);
  return value;
}
export function canReadNotificationCenter(access: NotificationCenterAccess): boolean {
  return Boolean(
    access.roles?.some((role) => ROLES.has(role)) &&
    access.permissions?.includes("notification.manage"),
  );
}
export function parseNotificationCenterPage(value: unknown): NotificationCenterPage {
  const root = record(value);
  if (!Array.isArray(root.data)) throw new Error("Invalid notification center response.");
  const meta = record(root.meta);
  return {
    data: root.data.map(item),
    meta: {
      limit: integer(meta.limit, "limit"),
      offset: integer(meta.offset, "offset"),
      total: integer(meta.total, "total"),
      unread_count: integer(meta.unread_count, "unread count"),
    },
  };
}
type Requester = Pick<AdminUxV2Requester, "get" | "post">;
export async function getNotificationCenter(
  input: NotificationCenterInput,
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  const query: Record<string, AdminUxQueryValue> = {
    property_id: input.propertyId,
    status: input.status,
    priority: input.priority,
    notification_type: input.notificationType,
    search: input.search,
    from: input.from,
    to: input.to,
    limit: input.limit ?? 20,
    offset: input.offset ?? 0,
  };
  return parseNotificationCenterPage(
    await requester.get<unknown>("/admin/notifications/center", { query, signal }),
  );
}
export function markNotificationCenterRead(
  propertyId: string,
  id: string,
  requester: Requester = adminUxV2Requester,
  idempotencyKey = newIdempotencyKey(),
) {
  return requester.post<unknown>(
    `/admin/notifications/center/${encodeURIComponent(id)}/read`,
    undefined,
    { query: { property_id: propertyId }, idempotencyKey },
  );
}
export function archiveNotificationCenter(
  propertyId: string,
  id: string,
  requester: Requester = adminUxV2Requester,
  idempotencyKey = newIdempotencyKey(),
) {
  return requester.post<unknown>(
    `/admin/notifications/center/${encodeURIComponent(id)}/archive`,
    undefined,
    { query: { property_id: propertyId }, idempotencyKey },
  );
}
export function markAllNotificationsRead(
  propertyId: string,
  requester: Requester = adminUxV2Requester,
  idempotencyKey = newIdempotencyKey(),
) {
  return requester.post<{ updated_count: number }>(
    "/admin/notifications/center/read-all",
    undefined,
    { query: { property_id: propertyId }, idempotencyKey },
  );
}
