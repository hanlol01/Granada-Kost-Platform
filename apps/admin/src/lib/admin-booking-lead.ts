import type { RoomGenderPolicy, RoomStatus } from "@/lib/admin-ux-master-api";

export type BookingLeadStatus =
  | "new"
  | "contacted"
  | "visit_scheduled"
  | "negotiating"
  | "awaiting_dp"
  | "onboarding"
  | "leased"
  | "converted"
  | "rejected"
  | "expired"
  | "cancelled";
export type BookingLeadDisplayStatus = BookingLeadStatus | "awaiting_activation";
export type BookingLeadCategory = "rukost" | "apartkost";
export type BookingLeadGender = "male" | "female";
export type BookingLeadFloorCode = "A" | "B";
export type BookingLeadSource = "public_kamar" | "admin_quick_entry";

export type BookingLeadRecord = {
  id: string;
  propertyId: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode: string | null;
  floorCode: BookingLeadFloorCode | null;
  publicGroupKey: string | null;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string | null;
  preferredMoveInDate: string | null;
  paymentCommitmentStartDate: string | null;
  activeLeaseStartDate: string | null;
  status: BookingLeadStatus;
  source: BookingLeadSource;
  createdAt: string;
  updatedAt: string;
  roomId: string | null;
  roomNumber: string | null;
  visitorAddress: string | null;
  visitorUniversity: string | null;
};

/**
 * A lease is already a completed tenancy before its occupancy is activated.
 * Keep the persisted booking-lead lifecycle intact while exposing the actual
 * operational state required by the booking-lead workspace.
 */
export function bookingLeadDisplayStatus(
  lead: Pick<BookingLeadRecord, "status" | "activeLeaseStartDate">,
): BookingLeadDisplayStatus {
  return lead.status === "onboarding" && lead.activeLeaseStartDate
    ? "awaiting_activation"
    : lead.status;
}

/**
 * The date recorded with the initial payment becomes operative once a booking
 * is completed, until onboarding has created the authoritative lease date.
 */
export function bookingLeadEffectiveMoveInDate(
  lead: Pick<
    BookingLeadRecord,
    "activeLeaseStartDate" | "paymentCommitmentStartDate" | "preferredMoveInDate"
  >,
): string | null {
  return lead.activeLeaseStartDate ?? lead.paymentCommitmentStartDate ?? lead.preferredMoveInDate;
}

export function canCancelBookingLeadPaymentCommitment(
  progress: BookingLeadProgress | null | undefined,
  canManageRooms: boolean,
): boolean {
  return Boolean(
    canManageRooms &&
    progress?.leadStatus === "onboarding" &&
    progress.hold?.status === "committed" &&
    progress.paymentCommitment &&
    progress.paymentCommitment.paymentType !== "full_settlement" &&
    !progress.cancellation &&
    (!progress.tenancy || progress.tenancy.leaseStatus === "awaiting_activation"),
  );
}

export type QuickBookingDraft = {
  visitorName: string;
  gender: BookingLeadGender | "";
  visitorAddress: string;
  visitorUniversity: string;
  visitorPhone: string;
};

export type AdminBookingLeadPayload = {
  property_id: string;
  room_id: string;
  visitor_name: string;
  gender: BookingLeadGender;
  visitor_address: string;
  visitor_university?: string;
  visitor_phone: string;
};

export type BookingLeadListFilters = {
  status?: BookingLeadStatus;
  category?: BookingLeadCategory;
  gender?: BookingLeadGender;
  source?: BookingLeadSource;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type BookingLeadPage = {
  data: BookingLeadRecord[];
  meta: { limit: number; offset: number; total: number };
};

export type BookingLeadProgress = {
  propertyId: string;
  source: BookingLeadSource;
  leadStatus: BookingLeadStatus;
  recordedAt: string;
  targetRoomNumber: string | null;
  hold: {
    status: "active" | "committed" | "released" | "expired";
    roomNumber: string | null;
    startsAt: string;
    expiresAt: string;
    releasedAt: string | null;
    releaseReason: string | null;
  } | null;
  paymentCommitment: {
    id: string;
    paymentType: "booking_fee" | "down_payment" | "full_settlement";
    rentCreditAmount: number;
    securityDepositAmount: number;
    paymentMethod: "cash" | "bank_transfer";
    verificationStatus: "verified" | "pending_confirmation";
    startDate: string;
    endDate: string;
    termMonths: number;
    materializedAt: string | null;
  } | null;
  cancellation: {
    id: string;
    refundAmount: number;
    refundMethod: "cash" | "bank_transfer";
    refundNote: string | null;
    refundEvidenceFileIds: string[];
    refundedAt: string;
  } | null;
  onboarding: { status: string; committedAt: string | null } | null;
  tenancy: {
    residentId: string;
    leaseStatus: string;
    startDate: string;
    endDate: string | null;
    termMonths: number | null;
    contractRentAmount: number;
    occupancyStatus: string | null;
    occupancyStartedAt: string | null;
    activationState: string | null;
  } | null;
  paymentSummary: {
    verifiedAmount: number;
    pendingAmount: number;
    paymentCount: number;
    securityDepositBalance: number;
  };
};

type BookingLeadGet = (
  path: string,
  options: {
    query: Record<string, string | number | boolean | undefined | null>;
  },
) => Promise<unknown>;
type BookingLeadPost = (
  path: string,
  body: AdminBookingLeadPayload,
  options: { idempotencyKey: string },
) => Promise<unknown>;
type LegacyBookingLeadPatch = (
  path: string,
  body: { status: BookingLeadStatus },
  options: { idempotencyKey: string },
) => Promise<unknown>;
type BookingLeadPatch = (
  path: string,
  body: { property_id: string; status: BookingLeadStatus },
  options: { idempotencyKey: string },
) => Promise<unknown>;
type BookingLeadDelete = (
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined | null>;
    idempotencyKey?: string;
  },
) => Promise<unknown>;

type QuickBookingRoom = {
  propertyId: string;
  status: RoomStatus | string;
  genderPolicy?: RoomGenderPolicy | null;
};

type QuickBookingAccess = {
  roles: readonly string[];
  permissions: readonly string[];
  propertyId: string | null;
  room: QuickBookingRoom;
};

const RESPONSE_KEYS = [
  "activeLeaseStartDate",
  "buildingCode",
  "category",
  "createdAt",
  "floorCode",
  "gender",
  "id",
  "paymentCommitmentStartDate",
  "preferredMoveInDate",
  "propertyId",
  "publicGroupKey",
  "roomId",
  "roomNumber",
  "source",
  "status",
  "updatedAt",
  "visitorAddress",
  "visitorMessage",
  "visitorName",
  "visitorPhone",
  "visitorUniversity",
] as const;

const STATUSES = new Set<BookingLeadStatus>([
  "new",
  "contacted",
  "visit_scheduled",
  "negotiating",
  "awaiting_dp",
  "onboarding",
  "leased",
  "converted",
  "rejected",
  "expired",
  "cancelled",
]);
const CATEGORIES = new Set<BookingLeadCategory>(["rukost", "apartkost"]);
const GENDERS = new Set<BookingLeadGender>(["male", "female"]);
const SOURCES = new Set<BookingLeadSource>(["public_kamar", "admin_quick_entry"]);
const PHONE_PATTERN = /^[0-9+\s().-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const INVALID_RESPONSE = "Invalid booking lead response";
const HOLD_STATUSES = new Set(["active", "committed", "released", "expired"]);
const PAYMENT_TYPES = new Set(["booking_fee", "down_payment", "full_settlement"]);
const PAYMENT_METHODS = new Set(["cash", "bank_transfer"]);
const PAYMENT_VERIFICATION_STATUSES = new Set(["verified", "pending_confirmation"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === RESPONSE_KEYS.length &&
    actual.every((key, index) => key === RESPONSE_KEYS[index])
  );
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const current = value[key];
  if (typeof current !== "string" || current.length === 0) throw new Error(INVALID_RESPONSE);
  return current;
}

function nullableString(value: Record<string, unknown>, key: string): string | null {
  const current = value[key];
  if (current === null) return null;
  if (typeof current !== "string") throw new Error(INVALID_RESPONSE);
  return current;
}

function nullableNonEmptyString(value: Record<string, unknown>, key: string): string | null {
  const current = nullableString(value, key);
  if (current !== null && current.length === 0) throw new Error(INVALID_RESPONSE);
  return current;
}

function requiredUuid(value: Record<string, unknown>, key: string): string {
  const current = requiredString(value, key);
  if (!UUID_PATTERN.test(current)) throw new Error(INVALID_RESPONSE);
  return current;
}

function nullableUuid(value: Record<string, unknown>, key: string): string | null {
  const current = nullableNonEmptyString(value, key);
  if (current !== null && !UUID_PATTERN.test(current)) throw new Error(INVALID_RESPONSE);
  return current;
}

function requiredTimestamp(value: Record<string, unknown>, key: string): string {
  const current = requiredString(value, key);
  const match = ISO_TIMESTAMP_PATTERN.exec(current);
  if (!match) throw new Error(INVALID_RESPONSE);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((fractionText ?? "").padEnd(3, "0"));
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second ||
    calendar.getUTCMilliseconds() !== millisecond ||
    Number.isNaN(Date.parse(current))
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  return current;
}

function nullableDateOnly(value: Record<string, unknown>, key: string): string | null {
  const current = nullableNonEmptyString(value, key);
  if (current === null) return null;
  if (
    !DATE_ONLY_PATTERN.test(current) ||
    new Date(`${current}T00:00:00.000Z`).toISOString().slice(0, 10) !== current
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  return current;
}

function requiredDateOnly(value: Record<string, unknown>, key: string): string {
  const current = nullableDateOnly(value, key);
  if (current === null) throw new Error(INVALID_RESPONSE);
  return current;
}

function requiredNonNegativeInteger(value: Record<string, unknown>, key: string): number {
  const current = value[key];
  if (!Number.isSafeInteger(current) || (current as number) < 0) throw new Error(INVALID_RESPONSE);
  return current as number;
}

function requiredPositiveInteger(value: Record<string, unknown>, key: string): number {
  const current = requiredNonNegativeInteger(value, key);
  if (current < 1) throw new Error(INVALID_RESPONSE);
  return current;
}

function nullableTimestamp(value: Record<string, unknown>, key: string): string | null {
  const current = nullableNonEmptyString(value, key);
  if (current === null) return null;
  return requiredTimestamp({ [key]: current }, key);
}

function exactKeysFor(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseAdminBookingLead(value: unknown): BookingLeadRecord {
  const source = record(value);
  if (!source || !exactKeys(source)) throw new Error(INVALID_RESPONSE);

  const category = requiredString(source, "category") as BookingLeadCategory;
  const gender = requiredString(source, "gender") as BookingLeadGender;
  const status = requiredString(source, "status") as BookingLeadStatus;
  const leadSource = requiredString(source, "source") as BookingLeadSource;
  const floorCode = nullableNonEmptyString(source, "floorCode");
  if (
    !CATEGORIES.has(category) ||
    !GENDERS.has(gender) ||
    !STATUSES.has(status) ||
    !SOURCES.has(leadSource) ||
    (floorCode !== null && floorCode !== "A" && floorCode !== "B")
  ) {
    throw new Error(INVALID_RESPONSE);
  }

  return {
    id: requiredUuid(source, "id"),
    propertyId: requiredUuid(source, "propertyId"),
    category,
    gender,
    buildingCode: nullableNonEmptyString(source, "buildingCode"),
    floorCode: floorCode as BookingLeadFloorCode | null,
    publicGroupKey: nullableNonEmptyString(source, "publicGroupKey"),
    visitorName: requiredString(source, "visitorName"),
    visitorPhone: requiredString(source, "visitorPhone"),
    visitorMessage: nullableString(source, "visitorMessage"),
    preferredMoveInDate: nullableDateOnly(source, "preferredMoveInDate"),
    paymentCommitmentStartDate: nullableDateOnly(source, "paymentCommitmentStartDate"),
    activeLeaseStartDate: nullableDateOnly(source, "activeLeaseStartDate"),
    status,
    source: leadSource,
    createdAt: requiredTimestamp(source, "createdAt"),
    updatedAt: requiredTimestamp(source, "updatedAt"),
    roomId: nullableUuid(source, "roomId"),
    roomNumber: nullableNonEmptyString(source, "roomNumber"),
    visitorAddress: nullableNonEmptyString(source, "visitorAddress"),
    visitorUniversity: nullableNonEmptyString(source, "visitorUniversity"),
  };
}

export function parseAdminBookingLeadList(value: unknown): BookingLeadRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid booking lead list response");
  return value.map(parseAdminBookingLead);
}

export function parseAdminBookingLeadPage(value: unknown): BookingLeadPage {
  const envelope = record(value);
  const meta = envelope ? record(envelope.meta) : null;
  if (
    !envelope ||
    Object.keys(envelope).sort().join(",") !== "data,meta" ||
    !Array.isArray(envelope.data) ||
    !meta ||
    Object.keys(meta).sort().join(",") !== "limit,offset,total"
  ) {
    throw new Error("Invalid booking lead list response");
  }
  const limit = meta.limit;
  const offset = meta.offset;
  const total = meta.total;
  if (
    !Number.isInteger(limit) ||
    !Number.isInteger(offset) ||
    !Number.isInteger(total) ||
    (limit as number) < 1 ||
    (offset as number) < 0 ||
    (total as number) < 0
  ) {
    throw new Error("Invalid booking lead list response");
  }
  return {
    data: envelope.data.map(parseAdminBookingLead),
    meta: { limit: limit as number, offset: offset as number, total: total as number },
  };
}

export function parseBookingLeadProgress(value: unknown, propertyId: string): BookingLeadProgress {
  const envelope = record(value);
  const data = envelope ? record(envelope.data) : null;
  if (!envelope || Object.keys(envelope).join(",") !== "data" || !data) {
    throw new Error("Invalid booking lead progress response");
  }
  const progressKeys = [
    "hold",
    "cancellation",
    "lead_status",
    "onboarding",
    "payment_commitment",
    "payment_summary",
    "property_id",
    "recorded_at",
    "source",
    "target_room_number",
    "tenancy",
  ] as const;
  if (!exactKeysFor(data, progressKeys) || requiredUuid(data, "property_id") !== propertyId) {
    throw new Error("Invalid booking lead progress response");
  }
  const source = requiredString(data, "source") as BookingLeadSource;
  const leadStatus = requiredString(data, "lead_status") as BookingLeadStatus;
  if (!SOURCES.has(source) || !STATUSES.has(leadStatus)) {
    throw new Error("Invalid booking lead progress response");
  }
  const hold = data.hold === null ? null : record(data.hold);
  const cancellation = data.cancellation === null ? null : record(data.cancellation);
  const payment = data.payment_commitment === null ? null : record(data.payment_commitment);
  const onboarding = data.onboarding === null ? null : record(data.onboarding);
  const tenancy = data.tenancy === null ? null : record(data.tenancy);
  const summary = record(data.payment_summary);
  if (!summary) throw new Error("Invalid booking lead progress response");
  if (
    hold &&
    !exactKeysFor(hold, [
      "expires_at",
      "released_at",
      "release_reason",
      "room_number",
      "starts_at",
      "status",
    ])
  ) {
    throw new Error("Invalid booking lead progress response");
  }
  if (
    payment &&
    !exactKeysFor(payment, [
      "end_date",
      "id",
      "materialized_at",
      "payment_method",
      "payment_type",
      "rent_credit_amount",
      "security_deposit_amount",
      "start_date",
      "term_months",
      "verification_status",
    ])
  ) {
    throw new Error("Invalid booking lead progress response");
  }
  if (
    cancellation &&
    !exactKeysFor(cancellation, [
      "id",
      "refund_amount",
      "refund_evidence_file_ids",
      "refund_method",
      "refund_note",
      "refunded_at",
    ])
  ) {
    throw new Error("Invalid booking lead progress response");
  }
  if (onboarding && !exactKeysFor(onboarding, ["committed_at", "status"])) {
    throw new Error("Invalid booking lead progress response");
  }
  if (
    tenancy &&
    !exactKeysFor(tenancy, [
      "contract_rent_amount",
      "end_date",
      "lease_status",
      "activation_state",
      "occupancy_started_at",
      "occupancy_status",
      "resident_id",
      "start_date",
      "term_months",
    ])
  ) {
    throw new Error("Invalid booking lead progress response");
  }
  if (
    !exactKeysFor(summary, [
      "payment_count",
      "pending_amount",
      "security_deposit_balance",
      "verified_amount",
    ])
  ) {
    throw new Error("Invalid booking lead progress response");
  }
  return {
    propertyId,
    source,
    leadStatus,
    recordedAt: requiredTimestamp(data, "recorded_at"),
    targetRoomNumber: nullableNonEmptyString(data, "target_room_number"),
    hold: hold
      ? (() => {
          const status = requiredString(hold, "status");
          if (!HOLD_STATUSES.has(status)) throw new Error("Invalid booking lead progress response");
          return {
            status: status as "active" | "committed" | "released" | "expired",
            roomNumber: nullableNonEmptyString(hold, "room_number"),
            startsAt: requiredTimestamp(hold, "starts_at"),
            expiresAt: requiredTimestamp(hold, "expires_at"),
            releasedAt: nullableTimestamp(hold, "released_at"),
            releaseReason: nullableNonEmptyString(hold, "release_reason"),
          };
        })()
      : null,
    paymentCommitment: payment
      ? (() => {
          const paymentType = requiredString(payment, "payment_type");
          const paymentMethod = requiredString(payment, "payment_method");
          const verificationStatus = requiredString(payment, "verification_status");
          if (
            !PAYMENT_TYPES.has(paymentType) ||
            !PAYMENT_METHODS.has(paymentMethod) ||
            !PAYMENT_VERIFICATION_STATUSES.has(verificationStatus)
          ) {
            throw new Error("Invalid booking lead progress response");
          }
          return {
            id: requiredUuid(payment, "id"),
            paymentType: paymentType as "booking_fee" | "down_payment" | "full_settlement",
            rentCreditAmount: requiredNonNegativeInteger(payment, "rent_credit_amount"),
            securityDepositAmount: requiredNonNegativeInteger(payment, "security_deposit_amount"),
            paymentMethod: paymentMethod as "cash" | "bank_transfer",
            verificationStatus: verificationStatus as "verified" | "pending_confirmation",
            startDate: requiredDateOnly(payment, "start_date"),
            endDate: requiredDateOnly(payment, "end_date"),
            termMonths: requiredPositiveInteger(payment, "term_months"),
            materializedAt: nullableTimestamp(payment, "materialized_at"),
          };
        })()
      : null,
    cancellation: cancellation
      ? (() => {
          const refundMethod = requiredString(cancellation, "refund_method");
          if (!PAYMENT_METHODS.has(refundMethod)) {
            throw new Error("Invalid booking lead progress response");
          }
          const evidence = cancellation.refund_evidence_file_ids;
          if (!Array.isArray(evidence) || !evidence.every((value) => typeof value === "string")) {
            throw new Error("Invalid booking lead progress response");
          }
          return {
            id: requiredUuid(cancellation, "id"),
            refundAmount: requiredNonNegativeInteger(cancellation, "refund_amount"),
            refundMethod: refundMethod as "cash" | "bank_transfer",
            refundNote: nullableNonEmptyString(cancellation, "refund_note"),
            refundEvidenceFileIds: evidence.map((value) => {
              if (!UUID_PATTERN.test(value))
                throw new Error("Invalid booking lead progress response");
              return value;
            }),
            refundedAt: requiredTimestamp(cancellation, "refunded_at"),
          };
        })()
      : null,
    onboarding: onboarding
      ? {
          status: requiredString(onboarding, "status"),
          committedAt: nullableTimestamp(onboarding, "committed_at"),
        }
      : null,
    tenancy: tenancy
      ? {
          residentId: requiredUuid(tenancy, "resident_id"),
          leaseStatus: requiredString(tenancy, "lease_status"),
          startDate: requiredDateOnly(tenancy, "start_date"),
          endDate: nullableDateOnly(tenancy, "end_date"),
          termMonths:
            tenancy.term_months === null ? null : requiredPositiveInteger(tenancy, "term_months"),
          contractRentAmount: requiredNonNegativeInteger(tenancy, "contract_rent_amount"),
          occupancyStatus: nullableNonEmptyString(tenancy, "occupancy_status"),
          occupancyStartedAt: nullableDateOnly(tenancy, "occupancy_started_at"),
          activationState: nullableNonEmptyString(tenancy, "activation_state"),
        }
      : null,
    paymentSummary: {
      verifiedAmount: requiredNonNegativeInteger(summary, "verified_amount"),
      pendingAmount: requiredNonNegativeInteger(summary, "pending_amount"),
      paymentCount: requiredNonNegativeInteger(summary, "payment_count"),
      securityDepositBalance: requiredNonNegativeInteger(summary, "security_deposit_balance"),
    },
  };
}

export const bookingLeadListScopeKey = (propertyId: string) =>
  ["booking-leads", "list", { propertyId }] as const;

export async function requestAdminBookingLeads(
  get: BookingLeadGet,
  propertyId: string,
  filters: BookingLeadListFilters = {},
): Promise<BookingLeadRecord[]> {
  if (!propertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
  return parseAdminBookingLeadList(
    await get("/booking-leads", {
      query: {
        property_id: propertyId,
        status: filters.status,
        category: filters.category,
        gender: filters.gender,
        source: filters.source,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        limit: filters.limit ?? 100,
        offset: filters.offset,
      },
    }),
  );
}

export async function requestAdminBookingLeadPage(
  get: BookingLeadGet,
  propertyId: string,
  filters: BookingLeadListFilters = {},
): Promise<BookingLeadPage> {
  if (!propertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
  return parseAdminBookingLeadPage(
    await get("/booking-leads", {
      query: {
        property_id: propertyId,
        status: filters.status,
        category: filters.category,
        gender: filters.gender,
        source: filters.source,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        limit: filters.limit ?? 20,
        offset: filters.offset ?? 0,
      },
    }),
  );
}

export async function requestBookingLeadProgress(
  get: BookingLeadGet,
  input: { propertyId: string; leadId: string },
): Promise<BookingLeadProgress> {
  if (!input.propertyId || !input.leadId) throw new Error("INVALID_BOOKING_LEAD_PROGRESS_REQUEST");
  return parseBookingLeadProgress(
    await get(`/booking-leads/${input.leadId}/progress`, {
      query: { property_id: input.propertyId },
    }),
    input.propertyId,
  );
}

export async function requestCreateAdminBookingLead(
  post: BookingLeadPost,
  input: {
    propertyId: string;
    roomId: string;
    genderPolicy?: RoomGenderPolicy | null;
    draft: QuickBookingDraft;
    idempotencyKey: string;
  },
): Promise<BookingLeadRecord> {
  if (!input.idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const body = toAdminBookingLeadPayload(
    input.propertyId,
    input.roomId,
    input.draft,
    input.genderPolicy,
  );
  return parseAdminBookingLead(
    await post("/booking-leads", body, { idempotencyKey: input.idempotencyKey }),
  );
}

export async function requestUpdateAdminBookingLeadStatus(
  patch: LegacyBookingLeadPatch,
  leadId: string,
  status: BookingLeadStatus,
  idempotencyKey: string,
): Promise<BookingLeadRecord> {
  if (!leadId || !idempotencyKey) throw new Error("INVALID_BOOKING_LEAD_STATUS_REQUEST");
  return parseAdminBookingLead(
    await patch(`/booking-leads/${leadId}/status`, { status }, { idempotencyKey }),
  );
}

export async function requestUpdateAdminBookingLeadStatusCommand(
  patch: BookingLeadPatch,
  input: {
    propertyId: string;
    leadId: string;
    status: BookingLeadStatus;
    idempotencyKey: string;
  },
): Promise<BookingLeadRecord> {
  if (!input.propertyId || !input.leadId || !input.idempotencyKey) {
    throw new Error("INVALID_BOOKING_LEAD_STATUS_REQUEST");
  }
  const envelope = record(
    await patch(
      `/booking-leads/${input.leadId}/status`,
      { property_id: input.propertyId, status: input.status },
      { idempotencyKey: input.idempotencyKey },
    ),
  );
  if (!envelope || Object.keys(envelope).join(",") !== "data") {
    throw new Error(INVALID_RESPONSE);
  }
  return parseAdminBookingLead(envelope.data);
}

export async function requestArchiveAdminBookingLead(
  del: BookingLeadDelete,
  input: { propertyId: string; leadId: string; idempotencyKey: string },
): Promise<{ archived: true }> {
  if (!input.propertyId || !input.leadId || !input.idempotencyKey) {
    throw new Error("INVALID_BOOKING_LEAD_ARCHIVE_REQUEST");
  }
  const envelope = record(
    await del(`/booking-leads/${input.leadId}`, {
      query: { property_id: input.propertyId },
      idempotencyKey: input.idempotencyKey,
    }),
  );
  if (!envelope || Object.keys(envelope).join(",") !== "data") {
    throw new Error(INVALID_RESPONSE);
  }
  const data = record(envelope.data);
  if (!data || data.archived !== true) throw new Error(INVALID_RESPONSE);
  return { archived: true };
}

export function canCreateAdminBookingLead(access: QuickBookingAccess): boolean {
  const hasRole = access.roles.includes("manager") || access.roles.includes("admin");
  return (
    hasRole &&
    access.permissions.includes("room.manage") &&
    Boolean(access.propertyId) &&
    access.room.propertyId === access.propertyId &&
    access.room.status === "vacant"
  );
}

export function initialQuickBookingDraft(
  genderPolicy?: RoomGenderPolicy | null,
): QuickBookingDraft {
  return {
    visitorName: "",
    gender: genderPolicy === "male" || genderPolicy === "female" ? genderPolicy : "",
    visitorAddress: "",
    visitorUniversity: "",
    visitorPhone: "",
  };
}

export function validateQuickBookingDraft(
  draft: QuickBookingDraft,
  genderPolicy?: RoomGenderPolicy | null,
): Partial<Record<keyof QuickBookingDraft, string>> {
  const errors: Partial<Record<keyof QuickBookingDraft, string>> = {};
  const name = draft.visitorName.trim();
  const address = draft.visitorAddress.trim();
  const university = draft.visitorUniversity.trim();
  const phone = draft.visitorPhone.trim();
  if (name.length < 2 || name.length > 120) errors.visitorName = "Nama harus 2–120 karakter.";
  if (!GENDERS.has(draft.gender as BookingLeadGender)) errors.gender = "Pilih jenis kelamin.";
  if (genderPolicy !== "mixed" && genderPolicy && draft.gender !== genderPolicy) {
    errors.gender = "Jenis kelamin harus sesuai kebijakan kamar.";
  }
  if (address.length < 5 || address.length > 500)
    errors.visitorAddress = "Alamat harus 5–500 karakter.";
  if (university.length > 0 && (university.length < 2 || university.length > 160)) {
    errors.visitorUniversity = "Universitas harus 2–160 karakter.";
  }
  if (phone.length < 8 || phone.length > 32 || !PHONE_PATTERN.test(phone)) {
    errors.visitorPhone = "Nomor WhatsApp harus 8–32 karakter yang valid.";
  }
  return errors;
}

export function toAdminBookingLeadPayload(
  propertyId: string,
  roomId: string,
  draft: QuickBookingDraft,
  genderPolicy?: RoomGenderPolicy | null,
): AdminBookingLeadPayload {
  const errors = validateQuickBookingDraft(draft, genderPolicy);
  if (!propertyId || !roomId || Object.keys(errors).length > 0) {
    throw new Error("Invalid quick booking form");
  }
  const university = draft.visitorUniversity.trim();
  return {
    property_id: propertyId,
    room_id: roomId,
    visitor_name: draft.visitorName.trim(),
    gender: draft.gender as BookingLeadGender,
    visitor_address: draft.visitorAddress.trim(),
    ...(university ? { visitor_university: university } : {}),
    visitor_phone: draft.visitorPhone.trim(),
  };
}
