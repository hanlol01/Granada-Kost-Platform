export type VehiclesRouteSearch = {
  tab: "vehicles" | "parking";
};

export type FacilitiesRouteSearch = {
  q: string;
  category_id?: string;
  kost_type_id?: string;
};

export type ComplaintRouteState = "loading" | "forbidden" | "error" | "invalid" | "ready";

export type VehicleWorkspaceAccess = {
  canReadVehicles: boolean;
  canReadParking: boolean;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLAINT_STATUSES = new Set([
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
const COMPLAINT_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function normalizedUuid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return UUID_V4.test(normalized) ? normalized : undefined;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function isNullableUuid(value: unknown): boolean {
  return value === null || isUuid(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNullableIsoTimestamp(value: unknown): boolean {
  return value === null || isIsoTimestamp(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeVehiclesSearch(
  raw: Readonly<Record<string, unknown>>,
): VehiclesRouteSearch {
  return { tab: raw.tab === "parking" ? "parking" : "vehicles" };
}

export function vehiclesSearchString(search: VehiclesRouteSearch): string {
  return `?tab=${search.tab}`;
}

export function resolveVehicleWorkspaceTab(
  requestedTab: VehiclesRouteSearch["tab"],
  access: VehicleWorkspaceAccess,
): VehiclesRouteSearch["tab"] | null {
  if (requestedTab === "parking" && access.canReadParking) return "parking";
  if (requestedTab === "vehicles" && access.canReadVehicles) return "vehicles";
  if (access.canReadVehicles) return "vehicles";
  if (access.canReadParking) return "parking";
  return null;
}

export function canonicalSearchReplacement(
  currentSearch: string,
  canonicalSearch: string,
): string | null {
  return currentSearch === canonicalSearch ? null : canonicalSearch;
}

export function normalizeFacilitiesSearch(
  raw: Readonly<Record<string, unknown>>,
): FacilitiesRouteSearch {
  return {
    q: typeof raw.q === "string" ? raw.q.trim().slice(0, 120) : "",
    category_id: normalizedUuid(raw.category_id),
    kost_type_id: normalizedUuid(raw.kost_type_id),
  };
}

export function facilitiesNavigationSearch(
  search: FacilitiesRouteSearch,
): Readonly<Record<string, string | undefined>> {
  return {
    q: search.q || undefined,
    category_id: search.category_id,
    kost_type_id: search.kost_type_id,
  };
}

export function facilitiesSearchString(search: FacilitiesRouteSearch): string {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.category_id) params.set("category_id", search.category_id);
  if (search.kost_type_id) params.set("kost_type_id", search.kost_type_id);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isComplaintRecord(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    isUuid(record.id) &&
    isUuid(record.propertyId) &&
    isUuid(record.residentId) &&
    isNullableUuid(record.roomId) &&
    isUuid(record.categoryId) &&
    isNonEmptyString(record.complaintCode) &&
    isNonEmptyString(record.title) &&
    isNonEmptyString(record.description) &&
    typeof record.priority === "string" &&
    COMPLAINT_PRIORITIES.has(record.priority) &&
    typeof record.complaintStatus === "string" &&
    COMPLAINT_STATUSES.has(record.complaintStatus) &&
    Number.isInteger(record.reopenCount) &&
    (record.reopenCount as number) >= 0 &&
    typeof record.responseSlaBreached === "boolean" &&
    typeof record.resolutionSlaBreached === "boolean" &&
    isNullableString(record.locationNote) &&
    isNullableUuid(record.assignedToUserId) &&
    isIsoTimestamp(record.submittedAt) &&
    isNullableIsoTimestamp(record.acknowledgedAt) &&
    isNullableIsoTimestamp(record.resolvedAt) &&
    isNullableIsoTimestamp(record.closedAt) &&
    isNullableIsoTimestamp(record.cancelledAt) &&
    isNullableString(record.cancelReason) &&
    isNullableString(record.snapshotRoomNumber) &&
    isNonEmptyString(record.snapshotResidentName) &&
    isIsoTimestamp(record.createdAt) &&
    isIsoTimestamp(record.updatedAt)
  );
}

function isComplaintCategory(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    isUuid(record.id) &&
    isUuid(record.propertyId) &&
    isNonEmptyString(record.name) &&
    isNonEmptyString(record.normalizedCode) &&
    typeof record.defaultPriority === "string" &&
    COMPLAINT_PRIORITIES.has(record.defaultPriority) &&
    isNullableString(record.description) &&
    isNullableString(record.icon) &&
    typeof record.isActive === "boolean" &&
    Number.isInteger(record.sortOrder)
  );
}

export function isComplaintRecordList(value: unknown): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isComplaintRecord);
}

export function isComplaintCategoryList(
  value: unknown,
): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isComplaintCategory);
}

export function isForbiddenRouteError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && (error as { status?: unknown }).status === 403,
  );
}

export function resolveComplaintRouteState(input: {
  complaints: unknown;
  categories: unknown;
  complaintError: unknown;
  categoryError: unknown;
  complaintLoading: boolean;
  categoryLoading: boolean;
}): ComplaintRouteState {
  if (isForbiddenRouteError(input.complaintError) || isForbiddenRouteError(input.categoryError)) {
    return "forbidden";
  }
  if (input.complaintError || input.categoryError) return "error";
  if (input.complaintLoading || input.categoryLoading) return "loading";
  if (!isComplaintRecordList(input.complaints) || !isComplaintCategoryList(input.categories)) {
    return "invalid";
  }
  return "ready";
}

export function withoutPrimaryRoutes<T extends { id: string }>(
  routes: readonly T[],
  primaryRoutes: readonly T[],
): readonly T[] {
  const primaryIds = new Set(primaryRoutes.map((route) => route.id));
  return routes.filter((route) => !primaryIds.has(route.id));
}
