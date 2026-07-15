import type { RoleCode } from "@granada-kost/domain";
import {
  adminUxV2Requester,
  type AdminUxQueryValue,
  type AdminUxV2Requester,
} from "@/lib/admin-ux-api";

export const ADMIN_NOTIFICATION_TYPES = [
  "billing.invoice_issued",
  "billing.invoice_overdue",
  "complaint.created",
  "complaint.resolved",
  "maintenance.work_order_assigned",
  "vehicle.approved",
  "occupancy.check_in_completed",
  "occupancy.check_out_finalized",
  "other",
] as const;

export const ADMIN_NOTIFICATION_STATUSES = ["unread", "read", "archived"] as const;
export const ADMIN_NOTIFICATION_PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];
export type AdminNotificationStatus = (typeof ADMIN_NOTIFICATION_STATUSES)[number];
export type AdminNotificationPriority = (typeof ADMIN_NOTIFICATION_PRIORITIES)[number];

export type AdminNotificationRecord = {
  id: string;
  notification_type: AdminNotificationType;
  notification_status: AdminNotificationStatus;
  priority: AdminNotificationPriority;
  created_at: string;
  expires_at: string | null;
};

export type AdminNotificationPage = {
  data: AdminNotificationRecord[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type AdminNotificationListInput = {
  propertyId: string;
  status?: AdminNotificationStatus;
  limit?: number;
  offset?: number;
};

export type AdminNotificationAccess = {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
};

type NotificationRequester = Pick<AdminUxV2Requester, "get">;

const ALLOWED_ROLES = new Set<RoleCode>(["owner", "manager", "admin"]);
const ALLOWED_TYPES = new Set<string>(ADMIN_NOTIFICATION_TYPES);
const ALLOWED_STATUSES = new Set<string>(ADMIN_NOTIFICATION_STATUSES);
const ALLOWED_PRIORITIES = new Set<string>(ADMIN_NOTIFICATION_PRIORITIES);
const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid admin notification ${field}.`);
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  const text = requiredString(value, field);
  const match = RFC3339_TIMESTAMP.exec(text);
  if (!match) throw new Error(`Invalid admin notification ${field}.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) {
    throw new Error(`Invalid admin notification ${field}.`);
  }

  return text;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid admin notification ${field}.`);
  }
  return value;
}

function parseItem(value: unknown): AdminNotificationRecord {
  if (!isRecord(value)) throw new Error("Invalid admin notification item.");

  const rawType = requiredString(value.notification_type, "type");
  const status = requiredString(value.notification_status, "status");
  const priority = requiredString(value.priority, "priority");
  if (!ALLOWED_STATUSES.has(status)) throw new Error("Invalid admin notification status.");
  if (!ALLOWED_PRIORITIES.has(priority)) throw new Error("Invalid admin notification priority.");
  if (value.expires_at !== null && typeof value.expires_at !== "string") {
    throw new Error("Invalid admin notification expiry.");
  }

  return {
    id: requiredString(value.id, "id"),
    notification_type: ALLOWED_TYPES.has(rawType) ? (rawType as AdminNotificationType) : "other",
    notification_status: status as AdminNotificationStatus,
    priority: priority as AdminNotificationPriority,
    created_at: timestamp(value.created_at, "creation time"),
    expires_at: value.expires_at === null ? null : timestamp(value.expires_at, "expiry"),
  };
}

export function canReadAdminNotifications(access: AdminNotificationAccess): boolean {
  return Boolean(
    access.roles?.some((role) => ALLOWED_ROLES.has(role)) &&
    access.permissions?.includes("notification.manage"),
  );
}

export function parseAdminNotificationsPage(value: unknown): AdminNotificationPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    throw new Error("Invalid admin notification response.");
  }

  const limit = nonNegativeInteger(value.meta.limit, "limit");
  if (limit < 1 || limit > 100) throw new Error("Invalid admin notification limit.");

  return {
    data: value.data.map(parseItem),
    meta: {
      limit,
      offset: nonNegativeInteger(value.meta.offset, "offset"),
      total: nonNegativeInteger(value.meta.total, "total"),
    },
  };
}

export async function getAdminNotifications(
  input: AdminNotificationListInput,
  signal?: AbortSignal,
  requester: NotificationRequester = adminUxV2Requester,
): Promise<AdminNotificationPage> {
  const query: Record<string, AdminUxQueryValue> = {
    property_id: input.propertyId,
    status: input.status,
    limit: input.limit ?? 20,
    offset: input.offset ?? 0,
  };
  const response = await requester.get<unknown>("/admin/notifications", { query, signal });
  return parseAdminNotificationsPage(response);
}
