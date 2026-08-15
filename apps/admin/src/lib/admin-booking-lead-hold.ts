import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { BookingLeadRecord } from "./admin-booking-lead";
import { bookingLeadListScopeKey } from "./admin-booking-lead";
import { adminUxQueryKeys } from "./admin-ux-query-keys";
import { isBookingHoldWriteEnabledForProperty } from "./admin-ux-dashboard";

export type BookingLeadHoldStatus = "active" | "committed" | "released" | "expired";

export type BookingLeadHoldRecord = {
  id: string;
  propertyId: string;
  bookingLeadId: string;
  roomId: string;
  holdStatus: BookingLeadHoldStatus;
  startsAt: string;
  expiresAt: string;
  releasedAt: string | null;
};

export type BookingLeadHoldPage = {
  data: BookingLeadHoldRecord[];
  meta: { limit: number; offset: number; total: number };
};

export type BookingLeadHoldCoverage = BookingLeadHoldPage & {
  propertyId: string;
  complete: true;
};

type HoldGet = (
  path: string,
  options: { query: Record<string, string | number | boolean | null | undefined> },
) => Promise<unknown>;

type HoldPost = (
  path: string,
  body: { property_id: string; room_id?: string },
  options: { idempotencyKey: string },
) => Promise<unknown>;

type HoldCommandInput = {
  propertyId: string;
  leadId: string;
  idempotencyKey: string;
  roomId?: string;
};

type HoldAccess = {
  roles: readonly string[];
  permissions: readonly string[];
  propertyId: string | null;
};

type HoldLead = Pick<BookingLeadRecord, "id" | "propertyId" | "roomId" | "status">;

const HOLD_RESPONSE_KEYS = [
  "booking_lead_id",
  "expires_at",
  "hold_status",
  "id",
  "property_id",
  "released_at",
  "room_id",
  "starts_at",
] as const;
const HOLD_STATUSES = new Set<BookingLeadHoldStatus>([
  "active",
  "committed",
  "released",
  "expired",
]);
const ELIGIBLE_LEAD_STATUSES = new Set(["new", "contacted", "visit_scheduled"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const INVALID_RESPONSE = "Invalid booking lead hold response";
const AUTHORITY_CONFLICT_CODES = new Set([
  "BOOKING_HOLD_ACTIVE_LEASE",
  "BOOKING_HOLD_ACTIVE_OCCUPANCY",
  "BOOKING_HOLD_ALREADY_ACTIVE",
  "BOOKING_HOLD_LEAD_NOT_ELIGIBLE",
  "BOOKING_HOLD_NOT_ACTIVE",
  "BOOKING_HOLD_NOT_FOUND",
  "BOOKING_HOLD_ROOM_LINK_INVALID",
  "BOOKING_HOLD_ROOM_NOT_VACANT",
  "BOOKING_HOLD_ROOM_REQUIRED",
]);

function record(value: unknown): Record<string, unknown> | null {
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
  if (typeof value !== "string" || value.length === 0) throw new Error(INVALID_RESPONSE);
  return value;
}

function requiredUuid(source: Record<string, unknown>, key: string): string {
  const value = requiredString(source, key);
  if (!UUID_PATTERN.test(value)) throw new Error(INVALID_RESPONSE);
  return value;
}

function requiredTimestamp(source: Record<string, unknown>, key: string): string {
  const value = requiredString(source, key);
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function safeCount(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function parseBookingLeadHoldRecord(value: unknown): BookingLeadHoldRecord {
  const source = record(value);
  if (!source || !exactKeys(source, HOLD_RESPONSE_KEYS)) throw new Error(INVALID_RESPONSE);
  const holdStatus = requiredString(source, "hold_status") as BookingLeadHoldStatus;
  if (!HOLD_STATUSES.has(holdStatus)) throw new Error(INVALID_RESPONSE);
  const releasedAt = source.released_at;
  if (releasedAt !== null && typeof releasedAt !== "string") throw new Error(INVALID_RESPONSE);
  if (holdStatus === "released") {
    if (typeof releasedAt !== "string") throw new Error(INVALID_RESPONSE);
    requiredTimestamp(source, "released_at");
  } else if (releasedAt !== null) {
    throw new Error(INVALID_RESPONSE);
  }

  return {
    id: requiredUuid(source, "id"),
    propertyId: requiredUuid(source, "property_id"),
    bookingLeadId: requiredUuid(source, "booking_lead_id"),
    roomId: requiredUuid(source, "room_id"),
    holdStatus,
    startsAt: requiredTimestamp(source, "starts_at"),
    expiresAt: requiredTimestamp(source, "expires_at"),
    releasedAt: releasedAt as string | null,
  };
}

export function parseBookingLeadHoldDetail(value: unknown): BookingLeadHoldRecord {
  const envelope = record(value);
  if (!envelope || !exactKeys(envelope, ["data"])) throw new Error(INVALID_RESPONSE);
  return parseBookingLeadHoldRecord(envelope.data);
}

export function parseBookingLeadHoldList(value: unknown): BookingLeadHoldPage {
  const envelope = record(value);
  const meta = envelope ? record(envelope.meta) : null;
  if (
    !envelope ||
    !exactKeys(envelope, ["data", "meta"]) ||
    !Array.isArray(envelope.data) ||
    !meta ||
    !exactKeys(meta, ["limit", "offset", "total"])
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  return {
    data: envelope.data.map(parseBookingLeadHoldRecord),
    meta: {
      limit: safeCount(meta, "limit"),
      offset: safeCount(meta, "offset"),
      total: safeCount(meta, "total"),
    },
  };
}

export const bookingLeadHoldScopeKey = (propertyId: string) =>
  ["booking-lead-holds", propertyId] as const;

export const bookingLeadHoldCoverageKey = (propertyId: string, limit: number, offset: number) =>
  [...bookingLeadHoldScopeKey(propertyId), { limit, offset }] as const;

export async function requestBookingLeadHoldCoverage(
  get: HoldGet,
  propertyId: string,
  limit = 100,
): Promise<BookingLeadHoldCoverage> {
  if (!UUID_PATTERN.test(propertyId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("PROPERTY_SCOPE_REQUIRED");
  }

  const data: BookingLeadHoldRecord[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let total: number | null = null;
  while (total === null || data.length < total) {
    const page = parseBookingLeadHoldList(
      await get("/booking-lead-holds", {
        query: { property_id: propertyId, limit, offset },
      }),
    );
    if (page.meta.limit !== limit || page.meta.offset !== offset) throw new Error(INVALID_RESPONSE);
    if (total === null) total = page.meta.total;
    if (page.meta.total !== total) throw new Error(INVALID_RESPONSE);
    if (total === 0) {
      if (page.data.length !== 0) throw new Error(INVALID_RESPONSE);
      break;
    }
    if (page.data.length === 0) throw new Error(INVALID_RESPONSE);
    for (const hold of page.data) {
      if (hold.propertyId !== propertyId || ids.has(hold.id)) throw new Error(INVALID_RESPONSE);
      ids.add(hold.id);
      data.push(hold);
    }
    offset += page.data.length;
    if (data.length > total || page.data.length > limit) throw new Error(INVALID_RESPONSE);
  }

  const exactTotal = total ?? 0;
  return {
    propertyId,
    complete: true,
    data,
    meta: { limit, offset: 0, total: exactTotal },
  };
}

async function requestBookingLeadHoldCommand(
  post: HoldPost,
  input: HoldCommandInput,
  suffix: "" | "/release",
): Promise<BookingLeadHoldRecord> {
  if (
    !UUID_PATTERN.test(input.propertyId) ||
    !UUID_PATTERN.test(input.leadId) ||
    !input.idempotencyKey
  ) {
    throw new Error("Invalid booking lead hold request");
  }
  return parseBookingLeadHoldDetail(
    await post(
      `/booking-leads/${encodeURIComponent(input.leadId)}/hold${suffix}`,
      { property_id: input.propertyId, ...(input.roomId ? { room_id: input.roomId } : {}) },
      { idempotencyKey: input.idempotencyKey },
    ),
  );
}

export function requestCreateBookingLeadHold(
  post: HoldPost,
  input: HoldCommandInput,
): Promise<BookingLeadHoldRecord> {
  return requestBookingLeadHoldCommand(post, input, "");
}

export function requestReleaseBookingLeadHold(
  post: HoldPost,
  input: HoldCommandInput,
): Promise<BookingLeadHoldRecord> {
  return requestBookingLeadHoldCommand(post, input, "/release");
}

function hasManageAuthority(access: HoldAccess): boolean {
  return (
    (access.roles.includes("manager") || access.roles.includes("admin")) &&
    access.permissions.includes("room.manage") &&
    Boolean(access.propertyId)
  );
}

export function canReadBookingLeadHolds(access: HoldAccess): boolean {
  return (
    (access.roles.includes("manager") || access.roles.includes("admin")) &&
    access.permissions.includes("room.read") &&
    Boolean(access.propertyId)
  );
}

export function canCreateBookingLeadHold(
  access: HoldAccess & {
    propertyRollouts: unknown;
    lead: HoldLead;
    coverage: BookingLeadHoldCoverage | null | undefined;
  },
): boolean {
  const { propertyId, lead, coverage } = access;
  if (
    !hasManageAuthority(access) ||
    !propertyId ||
    lead.propertyId !== propertyId ||
    !ELIGIBLE_LEAD_STATUSES.has(lead.status) ||
    !isBookingHoldWriteEnabledForProperty(access.propertyRollouts, propertyId) ||
    !coverage ||
    coverage.propertyId !== propertyId ||
    coverage.complete !== true ||
    coverage.data.length !== coverage.meta.total
  ) {
    return false;
  }
  return !coverage.data.some(
    (hold) =>
      (hold.holdStatus === "active" || hold.holdStatus === "committed") &&
      (hold.bookingLeadId === lead.id || (lead.roomId !== null && hold.roomId === lead.roomId)),
  );
}

export function canReleaseBookingLeadHold(
  access: HoldAccess & { lead: HoldLead; hold: BookingLeadHoldRecord | null | undefined },
): boolean {
  const { propertyId, lead, hold } = access;
  return Boolean(
    hasManageAuthority(access) &&
    propertyId &&
    lead.propertyId === propertyId &&
    hold &&
    hold.propertyId === propertyId &&
    hold.bookingLeadId === lead.id &&
    (!lead.roomId || hold.roomId === lead.roomId) &&
    hold.holdStatus === "active",
  );
}

export function activeBookingLeadHold(
  coverage: BookingLeadHoldCoverage | null | undefined,
  lead: HoldLead,
): BookingLeadHoldRecord | null {
  if (!coverage || coverage.complete !== true || coverage.propertyId !== lead.propertyId)
    return null;
  return (
    coverage.data.find(
      (hold) =>
        (hold.holdStatus === "active" || hold.holdStatus === "committed") &&
        hold.bookingLeadId === lead.id,
    ) ?? null
  );
}

export function bookingHoldInvalidationKeys(propertyId: string): readonly QueryKey[] {
  return [
    bookingLeadListScopeKey(propertyId),
    bookingLeadHoldScopeKey(propertyId),
    adminUxQueryKeys.rooms.all(propertyId),
    ["room", propertyId],
    ["roomAvailability", propertyId],
    adminUxQueryKeys.dashboard.summary(propertyId),
  ];
}

export function bookingHoldPostExpiryInvalidationKeys(propertyId: string): readonly QueryKey[] {
  const [bookingLeads, _holdCoverage, ...dependentKeys] = bookingHoldInvalidationKeys(propertyId);
  return [bookingLeads!, ...dependentKeys];
}

export async function invalidateBookingHoldState(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  propertyId: string,
): Promise<void> {
  await Promise.all(
    bookingHoldInvalidationKeys(propertyId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function bookingHoldErrorRequiresInvalidation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && AUTHORITY_CONFLICT_CODES.has(code);
}

export function assertBookingHoldMutationProperty(
  currentPropertyId: string | null,
  inputPropertyId: string,
): void {
  if (!currentPropertyId || inputPropertyId !== currentPropertyId) {
    throw new Error("PROPERTY_SCOPE_CHANGED");
  }
}

export function formatBookingHoldRemaining(expiresAt: string, now = Date.now()): string {
  const remaining = Math.max(0, Date.parse(expiresAt) - now);
  if (remaining === 0) return "Menunggu sinkronisasi…";
  const totalMinutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}j ${minutes}m tersisa` : `${minutes}m tersisa`;
}

type ExpiryTimerOptions = {
  expiresAt: string;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => unknown;
  clearSchedule?: (handle: unknown) => void;
  onExpire: () => void;
};

export function createBookingHoldExpirySync(options: ExpiryTimerOptions): () => void {
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds));
  const clearSchedule =
    options.clearSchedule ?? ((handle: unknown) => clearTimeout(handle as number));
  let active = true;
  let fired = false;
  const delay = Math.max(0, Date.parse(options.expiresAt) - now());
  const handle = schedule(() => {
    if (!active || fired) return;
    fired = true;
    options.onExpire();
  }, delay);
  return () => {
    active = false;
    clearSchedule(handle);
  };
}

type CoverageExpirySyncOptions = Pick<ExpiryTimerOptions, "now" | "schedule" | "clearSchedule"> & {
  coverage: BookingLeadHoldCoverage;
  fired: Set<string>;
  onExpire: (propertyId: string) => void;
};

export function createBookingHoldCoverageExpirySync(
  options: CoverageExpirySyncOptions,
): () => void {
  const scheduled = new Set<string>();
  const cleanups: Array<() => void> = [];
  for (const hold of options.coverage.data) {
    if (hold.holdStatus !== "active" || hold.propertyId !== options.coverage.propertyId) continue;
    const key = `${hold.propertyId}:${hold.id}:${hold.expiresAt}`;
    if (scheduled.has(key) || options.fired.has(key)) continue;
    scheduled.add(key);
    cleanups.push(
      createBookingHoldExpirySync({
        expiresAt: hold.expiresAt,
        now: options.now,
        schedule: options.schedule,
        clearSchedule: options.clearSchedule,
        onExpire: () => {
          if (options.fired.has(key)) return;
          options.fired.add(key);
          options.onExpire(hold.propertyId);
        },
      }),
    );
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
