import type { RoleCode } from "@granada-kost/domain";
import {
  adminUxV2Requester,
  type AdminUxQueryValue,
  type AdminUxV2Requester,
} from "@/lib/admin-ux-api";

export const ACTIVITY_CATEGORIES = [
  "booking",
  "payment",
  "lease",
  "room_occupancy",
  "inspection",
  "refund",
  "notification",
  "other",
] as const;
export const ACTIVITY_RESULTS = ["succeeded", "pending", "rejected", "failed"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number];
export type ActivityActor = {
  id: string | null;
  type: "admin" | "system" | "source";
  display_name: string;
};
export type ActivityLogItem = {
  id: string;
  event_type: string;
  action_label: string;
  category: ActivityCategory;
  result: ActivityResult;
  occurred_at: string;
  actor: ActivityActor;
  target: {
    property_id: string;
    resource_type: string;
    resource_id: string | null;
    resident: { id: string; display_name: string } | null;
    room: { id: string; number: string } | null;
    lease: { id: string; code: string } | null;
    payment: { id: string; code: string } | null;
    invoice: { id: string; code: string } | null;
  };
  change_summary: Array<{
    field: string;
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }>;
  reason: string | null;
  evidence_references: Array<{ kind: string; reference: string }>;
  correlation_id: string | null;
};
export type ActivityLogPage = {
  data: ActivityLogItem[];
  meta: {
    limit: number;
    offset: number;
    total: number;
    timezone: "Asia/Jakarta";
    default_range_days: number;
  };
};
export type ActivityActorOption = ActivityActor & { event_count: number };
export type ActivityLogFilters = {
  propertyId: string;
  from?: string;
  to?: string;
  actorId?: string;
  actorType?: "admin" | "system" | "source";
  category?: ActivityCategory;
  action?: string;
  result?: ActivityResult;
  target?: string;
  reference?: string;
  limit?: number;
  offset?: number;
};
export type ActivityLogAccess = {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
};

type Requester = Pick<AdminUxV2Requester, "get">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function exact(value: unknown, keys: readonly string[], label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return row;
}
function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return value;
}
function nullableText(value: unknown, label: string) {
  return value === null ? null : text(value, label);
}
function uuid(value: unknown, label: string) {
  const parsed = text(value, label);
  if (!UUID.test(parsed)) throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return parsed;
}
function nullableUuid(value: unknown, label: string) {
  return value === null ? null : uuid(value, label);
}
function integer(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return value;
}
function enumValue<T extends string>(value: unknown, options: readonly T[], label: string): T {
  const parsed = text(value, label);
  if (!options.includes(parsed as T))
    throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return parsed as T;
}
function timestamp(value: unknown, label: string) {
  const parsed = text(value, label);
  if (!RFC3339.test(parsed)) throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
  return parsed;
}
function scalar(value: unknown, label: string): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`Respons Log Aktivitas tidak valid: ${label}.`);
}
function nullableEntity(value: unknown, keys: readonly string[], label: string) {
  if (value === null) return null;
  const row = exact(value, keys, label);
  return row;
}

function parseItem(value: unknown): ActivityLogItem {
  const row = exact(
    value,
    [
      "id",
      "event_type",
      "action_label",
      "category",
      "result",
      "occurred_at",
      "actor",
      "target",
      "change_summary",
      "reason",
      "evidence_references",
      "correlation_id",
    ],
    "aktivitas",
  );
  const actor = exact(row.actor, ["id", "type", "display_name"], "aktor");
  const target = exact(
    row.target,
    [
      "property_id",
      "resource_type",
      "resource_id",
      "resident",
      "room",
      "lease",
      "payment",
      "invoice",
    ],
    "target",
  );
  const resident = nullableEntity(target.resident, ["id", "display_name"], "penghuni");
  const room = nullableEntity(target.room, ["id", "number"], "kamar");
  const lease = nullableEntity(target.lease, ["id", "code"], "penyewaan");
  const payment = nullableEntity(target.payment, ["id", "code"], "pembayaran");
  const invoice = nullableEntity(target.invoice, ["id", "code"], "invoice");
  if (!Array.isArray(row.change_summary) || !Array.isArray(row.evidence_references))
    throw new Error("Respons Log Aktivitas tidak valid: rincian.");
  return {
    id: uuid(row.id, "ID aktivitas"),
    event_type: text(row.event_type, "jenis event"),
    action_label: text(row.action_label, "label aktivitas"),
    category: enumValue(row.category, ACTIVITY_CATEGORIES, "kategori"),
    result: enumValue(row.result, ACTIVITY_RESULTS, "hasil"),
    occurred_at: timestamp(row.occurred_at, "waktu"),
    actor: {
      id: nullableUuid(actor.id, "ID aktor"),
      type: enumValue(actor.type, ["admin", "system", "source"] as const, "jenis aktor"),
      display_name: text(actor.display_name, "nama aktor"),
    },
    target: {
      property_id: uuid(target.property_id, "ID properti"),
      resource_type: text(target.resource_type, "jenis resource"),
      resource_id: nullableUuid(target.resource_id, "ID resource"),
      resident: resident
        ? {
            id: uuid(resident.id, "ID penghuni"),
            display_name: text(resident.display_name, "nama penghuni"),
          }
        : null,
      room: room
        ? { id: uuid(room.id, "ID kamar"), number: text(room.number, "nomor kamar") }
        : null,
      lease: lease
        ? { id: uuid(lease.id, "ID penyewaan"), code: text(lease.code, "kode penyewaan") }
        : null,
      payment: payment
        ? { id: uuid(payment.id, "ID pembayaran"), code: text(payment.code, "kode pembayaran") }
        : null,
      invoice: invoice
        ? { id: uuid(invoice.id, "ID invoice"), code: text(invoice.code, "kode invoice") }
        : null,
    },
    change_summary: row.change_summary.map((entry, index) => {
      const change = exact(entry, ["field", "before", "after"], `perubahan ${index + 1}`);
      return {
        field: text(change.field, "nama perubahan"),
        before: scalar(change.before, "nilai sebelum"),
        after: scalar(change.after, "nilai setelah"),
      };
    }),
    reason: nullableText(row.reason, "alasan"),
    evidence_references: row.evidence_references.map((entry, index) => {
      const evidence = exact(entry, ["kind", "reference"], `referensi ${index + 1}`);
      return {
        kind: text(evidence.kind, "jenis referensi"),
        reference: text(evidence.reference, "referensi"),
      };
    }),
    correlation_id: nullableText(row.correlation_id, "ID korelasi"),
  };
}

export function canReadActivityLog(access: ActivityLogAccess) {
  return Boolean(
    access.roles?.includes("admin") && access.permissions?.includes("activity_log.read"),
  );
}

export function parseActivityLogPage(value: unknown): ActivityLogPage {
  const root = exact(value, ["data", "meta"], "halaman");
  if (!Array.isArray(root.data)) throw new Error("Respons Log Aktivitas tidak valid: data.");
  const meta = exact(
    root.meta,
    ["limit", "offset", "total", "timezone", "default_range_days"],
    "metadata",
  );
  return {
    data: root.data.map(parseItem),
    meta: {
      limit: integer(meta.limit, "limit"),
      offset: integer(meta.offset, "offset"),
      total: integer(meta.total, "total"),
      timezone: enumValue(meta.timezone, ["Asia/Jakarta"] as const, "zona waktu"),
      default_range_days: integer(meta.default_range_days, "rentang bawaan"),
    },
  };
}

export function parseActivityLogDetail(value: unknown) {
  const root = exact(value, ["data"], "detail");
  return parseItem(root.data);
}

export function parseActivityActors(value: unknown): ActivityActorOption[] {
  const root = exact(value, ["data"], "aktor");
  if (!Array.isArray(root.data)) throw new Error("Respons Log Aktivitas tidak valid: aktor.");
  return root.data.map((value, index) => {
    const actor = exact(value, ["id", "type", "display_name", "event_count"], `aktor ${index + 1}`);
    return {
      id: nullableUuid(actor.id, "ID aktor"),
      type: enumValue(actor.type, ["admin", "system", "source"] as const, "jenis aktor"),
      display_name: text(actor.display_name, "nama aktor"),
      event_count: integer(actor.event_count, "jumlah aktivitas"),
    };
  });
}

function queryOf(input: ActivityLogFilters): Record<string, AdminUxQueryValue> {
  return {
    property_id: input.propertyId,
    from: input.from,
    to: input.to,
    actor_id: input.actorId,
    actor_type: input.actorType,
    category: input.category,
    action: input.action,
    result: input.result,
    target: input.target,
    reference: input.reference,
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
  };
}

export async function getActivityLog(
  input: ActivityLogFilters,
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseActivityLogPage(
    await requester.get<unknown>("/admin/activity-logs", { query: queryOf(input), signal }),
  );
}

export async function getActivityLogDetail(
  propertyId: string,
  activityId: string,
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseActivityLogDetail(
    await requester.get<unknown>(`/admin/activity-logs/${activityId}`, {
      query: { property_id: propertyId },
      signal,
    }),
  );
}

export async function getActivityActors(
  propertyId: string,
  range: { from?: string; to?: string },
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseActivityActors(
    await requester.get<unknown>("/admin/activity-logs/actors", {
      query: { property_id: propertyId, from: range.from, to: range.to },
      signal,
    }),
  );
}
