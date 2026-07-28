import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { adminUxQueryKeys } from "./admin-ux-query-keys";

export const WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "rework_required",
  "verified",
  "cancelled",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";

export type TechnicianReference = {
  userId: string;
  displayName: string;
  skillTags: string | null;
};

export type AdminWorkOrder = {
  id: string;
  propertyId: string;
  roomId: string | null;
  complaintId: string | null;
  workOrderCode: string;
  priority: MaintenancePriority;
  status: WorkOrderStatus;
  assignedToUserId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminComplaintDispatch = {
  id: string;
  propertyId: string;
  roomId: string | null;
  complaintCode: string;
  priority: MaintenancePriority;
  status:
    | "submitted"
    | "acknowledged"
    | "in_progress"
    | "on_hold"
    | "escalated"
    | "resolved"
    | "reopened"
    | "closed"
    | "cancelled";
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceDispatchResult = {
  complaint: AdminComplaintDispatch;
  workOrder: AdminWorkOrder;
};

export type WorkOrderPage = {
  data: AdminWorkOrder[];
  meta: { limit: number; offset: number; total: number };
};

export type WorkOrderCoverage = WorkOrderPage & {
  propertyId: string;
  complete: true;
};

type MaintenanceGet = (
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | null | undefined>;
    signal?: AbortSignal;
  },
) => Promise<unknown>;

type MaintenancePost = (
  path: string,
  body: { assigned_to_user_id: string },
  options: { idempotencyKey: string },
) => Promise<unknown>;

export type MaintenanceDispatchInput = {
  propertyId: string;
  complaintId: string;
  complaintCode: string;
  roomId: string | null;
  priority: MaintenancePriority;
  technicianUserId: string;
  idempotencyKey: string;
};

type DispatchAccess = {
  roles: readonly string[];
  permissions: readonly string[];
  propertyId: string | null;
  complaint: {
    id: string;
    propertyId: string;
    complaintStatus: AdminComplaintDispatch["status"];
  };
  actionableWorkOrder?: Pick<AdminWorkOrder, "propertyId" | "complaintId" | "status"> | null;
  authorityAnomaly: boolean;
  coverageComplete: boolean;
};

export type ComplaintWorkOrderAuthority = {
  workOrder: AdminWorkOrder | null;
  actionableWorkOrder: AdminWorkOrder | null;
  anomaly: boolean;
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const PRIORITIES = new Set<MaintenancePriority>(["low", "medium", "high", "urgent"]);
const WORK_ORDER_STATUS_SET = new Set<WorkOrderStatus>(WORK_ORDER_STATUSES);
const COMPLAINT_STATUSES = new Set<AdminComplaintDispatch["status"]>([
  "submitted",
  "acknowledged",
  "in_progress",
  "on_hold",
  "escalated",
  "resolved",
  "reopened",
  "closed",
  "cancelled",
]);
const DISPATCHABLE_COMPLAINT_STATUSES = new Set<AdminComplaintDispatch["status"]>([
  "submitted",
  "acknowledged",
  "in_progress",
  "on_hold",
  "escalated",
  "reopened",
]);
const ACTIONABLE_WORK_ORDER_STATUSES = new Set<WorkOrderStatus>([
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "rework_required",
]);
const TECHNICIAN_KEYS = ["display_name", "skill_tags", "user_id"] as const;
const WORK_ORDER_KEYS = [
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
] as const;
const COMPLAINT_DISPATCH_KEYS = [
  "assignedToUserId",
  "complaintCode",
  "createdAt",
  "id",
  "priority",
  "propertyId",
  "roomId",
  "status",
  "updatedAt",
] as const;
const INVALID_RESPONSE = "Invalid maintenance response";
const COVERAGE_PAGE_LIMIT = 100;
const MAX_COVERAGE_PAGES = 100;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(source: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(source).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(INVALID_RESPONSE);
  return value;
}

function requiredUuid(source: Record<string, unknown>, key: string): string {
  const value = requiredString(source, key);
  if (!UUID_V4_PATTERN.test(value)) throw new Error(INVALID_RESPONSE);
  return value;
}

function nullableUuid(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string" || !UUID_V4_PATTERN.test(value)) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function requiredTimestamp(source: Record<string, unknown>, key: string): string {
  const value = requiredString(source, key);
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function nullableTimestamp(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(INVALID_RESPONSE);
  return requiredTimestamp(source, key);
}

function safeCount(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function priority(source: Record<string, unknown>): MaintenancePriority {
  const value = requiredString(source, "priority") as MaintenancePriority;
  if (!PRIORITIES.has(value)) throw new Error(INVALID_RESPONSE);
  return value;
}

export function parseTechnicianReference(value: unknown): TechnicianReference {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, TECHNICIAN_KEYS)) throw new Error(INVALID_RESPONSE);
  const skillTags = source.skill_tags;
  if (skillTags !== null && typeof skillTags !== "string") throw new Error(INVALID_RESPONSE);
  return {
    userId: requiredUuid(source, "user_id"),
    displayName: requiredString(source, "display_name"),
    skillTags,
  };
}

export function parseTechnicianList(value: unknown): TechnicianReference[] {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, ["data"]) || !Array.isArray(source.data)) {
    throw new Error(INVALID_RESPONSE);
  }
  const technicians = source.data.map(parseTechnicianReference);
  if (new Set(technicians.map((technician) => technician.userId)).size !== technicians.length) {
    throw new Error(INVALID_RESPONSE);
  }
  return technicians;
}

export function parseAdminWorkOrder(value: unknown): AdminWorkOrder {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, WORK_ORDER_KEYS)) throw new Error(INVALID_RESPONSE);
  const status = requiredString(source, "status") as WorkOrderStatus;
  if (!WORK_ORDER_STATUS_SET.has(status)) throw new Error(INVALID_RESPONSE);
  return {
    id: requiredUuid(source, "id"),
    propertyId: requiredUuid(source, "propertyId"),
    roomId: nullableUuid(source, "roomId"),
    complaintId: nullableUuid(source, "complaintId"),
    workOrderCode: requiredString(source, "workOrderCode"),
    priority: priority(source),
    status,
    assignedToUserId: nullableUuid(source, "assignedToUserId"),
    scheduledAt: nullableTimestamp(source, "scheduledAt"),
    startedAt: nullableTimestamp(source, "startedAt"),
    completedAt: nullableTimestamp(source, "completedAt"),
    verifiedAt: nullableTimestamp(source, "verifiedAt"),
    createdAt: requiredTimestamp(source, "createdAt"),
    updatedAt: requiredTimestamp(source, "updatedAt"),
  };
}

export function parseWorkOrderList(value: unknown): WorkOrderPage {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, ["data", "meta"]) || !Array.isArray(source.data)) {
    throw new Error(INVALID_RESPONSE);
  }
  const meta = objectRecord(source.meta);
  if (!meta || !exactKeys(meta, ["limit", "offset", "total"])) {
    throw new Error(INVALID_RESPONSE);
  }
  const limit = safeCount(meta, "limit");
  if (limit < 1 || limit > 100) throw new Error(INVALID_RESPONSE);
  return {
    data: source.data.map(parseAdminWorkOrder),
    meta: {
      limit,
      offset: safeCount(meta, "offset"),
      total: safeCount(meta, "total"),
    },
  };
}

export function parseWorkOrderDetail(value: unknown): AdminWorkOrder {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, ["data"])) throw new Error(INVALID_RESPONSE);
  return parseAdminWorkOrder(source.data);
}

function parseComplaintDispatch(value: unknown): AdminComplaintDispatch {
  const source = objectRecord(value);
  if (!source || !exactKeys(source, COMPLAINT_DISPATCH_KEYS)) {
    throw new Error(INVALID_RESPONSE);
  }
  const status = requiredString(source, "status") as AdminComplaintDispatch["status"];
  if (!COMPLAINT_STATUSES.has(status)) throw new Error(INVALID_RESPONSE);
  return {
    id: requiredUuid(source, "id"),
    propertyId: requiredUuid(source, "propertyId"),
    roomId: nullableUuid(source, "roomId"),
    complaintCode: requiredString(source, "complaintCode"),
    priority: priority(source),
    status,
    assignedToUserId: nullableUuid(source, "assignedToUserId"),
    createdAt: requiredTimestamp(source, "createdAt"),
    updatedAt: requiredTimestamp(source, "updatedAt"),
  };
}

export function parseMaintenanceDispatch(value: unknown): MaintenanceDispatchResult {
  const envelope = objectRecord(value);
  if (!envelope || !exactKeys(envelope, ["data"])) throw new Error(INVALID_RESPONSE);
  const data = objectRecord(envelope.data);
  if (!data || !exactKeys(data, ["complaint", "work_order"])) {
    throw new Error(INVALID_RESPONSE);
  }
  const complaint = parseComplaintDispatch(data.complaint);
  const workOrder = parseAdminWorkOrder(data.work_order);
  if (
    workOrder.complaintId !== complaint.id ||
    workOrder.propertyId !== complaint.propertyId ||
    workOrder.assignedToUserId !== complaint.assignedToUserId ||
    workOrder.roomId !== complaint.roomId ||
    workOrder.priority !== complaint.priority
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  return { complaint, workOrder };
}

export async function requestTechnicianReferences(
  get: MaintenanceGet,
  propertyId: string,
  signal?: AbortSignal,
): Promise<TechnicianReference[]> {
  if (!UUID_V4_PATTERN.test(propertyId)) throw new Error(INVALID_RESPONSE);
  return parseTechnicianList(
    await get("/maintenance/technicians", {
      query: { property_id: propertyId },
      signal,
    }),
  );
}

export async function requestWorkOrderDetail(
  get: MaintenanceGet,
  workOrderId: string,
  signal?: AbortSignal,
): Promise<AdminWorkOrder> {
  if (!UUID_V4_PATTERN.test(workOrderId)) throw new Error(INVALID_RESPONSE);
  return parseWorkOrderDetail(
    await get(`/work-orders/${encodeURIComponent(workOrderId)}`, { signal }),
  );
}

export async function requestWorkOrderCoverage(
  get: MaintenanceGet,
  propertyId: string,
  status?: WorkOrderStatus,
  signal?: AbortSignal,
  pageLimit = COVERAGE_PAGE_LIMIT,
): Promise<WorkOrderCoverage> {
  if (!UUID_V4_PATTERN.test(propertyId) || pageLimit < 1 || pageLimit > 100) {
    throw new Error(INVALID_RESPONSE);
  }
  const records: AdminWorkOrder[] = [];
  const ids = new Set<string>();
  let expectedTotal: number | null = null;
  let offset = 0;
  let pages = 0;

  do {
    if (pages >= MAX_COVERAGE_PAGES) throw new Error(INVALID_RESPONSE);
    const page = parseWorkOrderList(
      await get("/work-orders", {
        query: {
          property_id: propertyId,
          limit: pageLimit,
          offset,
          status,
        },
        signal,
      }),
    );
    pages += 1;
    if (page.meta.limit !== pageLimit || page.meta.offset !== offset) {
      throw new Error(INVALID_RESPONSE);
    }
    if (expectedTotal === null) expectedTotal = page.meta.total;
    else if (page.meta.total !== expectedTotal) throw new Error(INVALID_RESPONSE);
    if (page.data.length > pageLimit || offset + page.data.length > expectedTotal) {
      throw new Error(INVALID_RESPONSE);
    }
    if (page.data.length === 0 && offset < expectedTotal) throw new Error(INVALID_RESPONSE);

    for (const workOrder of page.data) {
      if (
        workOrder.propertyId !== propertyId ||
        (status !== undefined && workOrder.status !== status) ||
        ids.has(workOrder.id)
      ) {
        throw new Error(INVALID_RESPONSE);
      }
      ids.add(workOrder.id);
      records.push(workOrder);
    }
    offset += page.data.length;
  } while (expectedTotal === null || offset < expectedTotal);

  if (expectedTotal === null || records.length !== expectedTotal) {
    throw new Error(INVALID_RESPONSE);
  }
  return {
    propertyId,
    complete: true,
    data: records,
    meta: { limit: pageLimit, offset: 0, total: expectedTotal },
  };
}

export async function requestComplaintDispatch(
  post: MaintenancePost,
  input: MaintenanceDispatchInput,
): Promise<MaintenanceDispatchResult> {
  if (
    !UUID_V4_PATTERN.test(input.propertyId) ||
    !UUID_V4_PATTERN.test(input.complaintId) ||
    typeof input.complaintCode !== "string" ||
    input.complaintCode.trim().length === 0 ||
    (input.roomId !== null && !UUID_V4_PATTERN.test(input.roomId)) ||
    !PRIORITIES.has(input.priority) ||
    !UUID_V4_PATTERN.test(input.technicianUserId) ||
    input.idempotencyKey.trim().length < 16 ||
    input.idempotencyKey.trim().length > 128
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  const result = parseMaintenanceDispatch(
    await post(
      `/complaints/${encodeURIComponent(input.complaintId)}/assign`,
      { assigned_to_user_id: input.technicianUserId },
      { idempotencyKey: input.idempotencyKey },
    ),
  );
  if (
    result.complaint.id !== input.complaintId ||
    result.complaint.propertyId !== input.propertyId ||
    result.complaint.complaintCode !== input.complaintCode ||
    result.complaint.roomId !== input.roomId ||
    result.complaint.priority !== input.priority ||
    result.complaint.assignedToUserId !== input.technicianUserId ||
    result.workOrder.complaintId !== input.complaintId ||
    result.workOrder.propertyId !== input.propertyId ||
    result.workOrder.assignedToUserId !== input.technicianUserId
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  return result;
}

export function canDispatchComplaint(access: DispatchAccess): boolean {
  const { propertyId, complaint, actionableWorkOrder } = access;
  return Boolean(
    access.coverageComplete &&
    !access.authorityAnomaly &&
    propertyId &&
    complaint.propertyId === propertyId &&
    (access.roles.includes("owner") ||
      access.roles.includes("manager") ||
      access.roles.includes("admin")) &&
    access.permissions.includes("complaint.manage") &&
    access.permissions.includes("maintenance.manage") &&
    DISPATCHABLE_COMPLAINT_STATUSES.has(complaint.complaintStatus) &&
    (!actionableWorkOrder ||
      (actionableWorkOrder.propertyId === propertyId &&
        actionableWorkOrder.complaintId === complaint.id &&
        actionableWorkOrder.status !== "completed")),
  );
}

export function findComplaintWorkOrders(
  coverage: WorkOrderCoverage | null | undefined,
  propertyId: string | null,
  complaintId: string,
): AdminWorkOrder[] {
  if (
    !coverage ||
    coverage.complete !== true ||
    !propertyId ||
    coverage.propertyId !== propertyId
  ) {
    return [];
  }
  return coverage.data
    .filter(
      (workOrder) => workOrder.propertyId === propertyId && workOrder.complaintId === complaintId,
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function findActionableComplaintWorkOrder(
  coverage: WorkOrderCoverage | null | undefined,
  propertyId: string | null,
  complaintId: string,
): AdminWorkOrder | null {
  return resolveComplaintWorkOrderAuthority(coverage, propertyId, complaintId).actionableWorkOrder;
}

export function resolveComplaintWorkOrderAuthority(
  coverage: WorkOrderCoverage | null | undefined,
  propertyId: string | null,
  complaintId: string,
): ComplaintWorkOrderAuthority {
  const workOrders = findComplaintWorkOrders(coverage, propertyId, complaintId);
  const actionableWorkOrders = workOrders.filter((workOrder) =>
    ACTIONABLE_WORK_ORDER_STATUSES.has(workOrder.status),
  );
  if (actionableWorkOrders.length > 1) {
    return { workOrder: null, actionableWorkOrder: null, anomaly: true };
  }
  if (actionableWorkOrders.length === 1) {
    const actionableWorkOrder = actionableWorkOrders[0]!;
    return { workOrder: actionableWorkOrder, actionableWorkOrder, anomaly: false };
  }
  return {
    workOrder: workOrders[0] ?? null,
    actionableWorkOrder: null,
    anomaly: false,
  };
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Terbuka",
  assigned: "Ditugaskan",
  in_progress: "Dikerjakan",
  on_hold: "Ditunda",
  completed: "Selesai, menunggu verifikasi",
  rework_required: "Perlu dikerjakan ulang",
  verified: "Terverifikasi",
  cancelled: "Dibatalkan",
};

export const MAINTENANCE_PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

export const maintenanceQueryKeys = {
  technicians: (propertyId: string) => ["maintenance", "technicians", propertyId] as const,
  workOrders: (propertyId: string, status?: WorkOrderStatus) =>
    ["maintenance", "work-orders", propertyId, status ?? null] as const,
};

export function maintenanceDispatchInvalidationKeys(propertyId: string): readonly QueryKey[] {
  return [
    ["complaints", "list", { propertyId }],
    ["maintenance", "work-orders", propertyId],
    adminUxQueryKeys.dashboard.summary(propertyId),
  ];
}

export async function invalidateMaintenanceDispatch(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  propertyId: string,
): Promise<void> {
  await Promise.all(
    maintenanceDispatchInvalidationKeys(propertyId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
