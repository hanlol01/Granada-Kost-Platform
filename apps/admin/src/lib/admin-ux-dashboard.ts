export type DashboardRollout = {
  propertyId: string;
  adminUxRead: {
    enabled: boolean;
  };
  bookingHoldWrite: {
    enabled: boolean;
  };
};

export type DashboardRecentLease = {
  id: string;
  leaseCode: string;
  leaseStatus: string;
  startDate: string;
  createdAt: string;
  room: {
    number: string;
  };
};

export type DashboardRecentPayment = {
  id: string;
  paymentCode: string;
  paymentStatus: string;
  paymentMethod: string;
  amount: string;
  paidAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type DashboardSummary = {
  activeLeases: number;
  activeResidents: number;
  roomsTotal: number;
  roomsVacant: number;
  roomsOccupied: number;
  roomsMaintenance: number;
  outstandingAmount: string;
  overdueInvoiceCount: number;
  recentLeases: DashboardRecentLease[];
  recentPayments: DashboardRecentPayment[];
  timezone: "Asia/Jakarta";
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(0|[1-9]\d*)$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid dashboard response");
  }
  return value;
}

function nullableString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid dashboard response");
  return value;
}

function count(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid dashboard response");
  }
  return value;
}

function money(source: Record<string, unknown>, key: string): string {
  const value = requiredString(source, key);
  if (!DECIMAL_PATTERN.test(value)) throw new Error("Invalid dashboard response");
  return value;
}

function parseRecentLease(value: unknown): DashboardRecentLease {
  const source = record(value);
  const room = source ? record(source.room) : null;
  if (!source || !room) throw new Error("Invalid dashboard response");
  return {
    id: requiredString(source, "id"),
    leaseCode: requiredString(source, "lease_code"),
    leaseStatus: requiredString(source, "lease_status"),
    startDate: requiredString(source, "start_date"),
    createdAt: requiredString(source, "created_at"),
    room: { number: requiredString(room, "number") },
  };
}

function parseRecentPayment(value: unknown): DashboardRecentPayment {
  const source = record(value);
  if (!source) throw new Error("Invalid dashboard response");
  return {
    id: requiredString(source, "id"),
    paymentCode: requiredString(source, "payment_code"),
    paymentStatus: requiredString(source, "payment_status"),
    paymentMethod: requiredString(source, "payment_method"),
    amount: money(source, "amount"),
    paidAt: nullableString(source, "paid_at"),
    verifiedAt: nullableString(source, "verified_at"),
    createdAt: requiredString(source, "created_at"),
  };
}

/** Fail closed for malformed, mismatched, or duplicate rollout items. */
export function parseDashboardRollouts(value: unknown): DashboardRollout[] {
  if (!Array.isArray(value)) return [];

  const parsed = new Map<string, DashboardRollout | null>();
  for (const item of value) {
    const source = record(item);
    const adminUxRead = source ? record(source.adminUxRead) : null;
    const bookingHoldWrite = source ? record(source.bookingHoldWrite) : null;
    const propertyId = source?.propertyId;
    const enabled = adminUxRead?.enabled;
    if (typeof propertyId !== "string" || !UUID_PATTERN.test(propertyId)) continue;
    if (parsed.has(propertyId)) {
      parsed.set(propertyId, null);
      continue;
    }
    if (typeof enabled !== "boolean") {
      parsed.set(propertyId, null);
      continue;
    }
    parsed.set(propertyId, {
      propertyId,
      adminUxRead: { enabled },
      bookingHoldWrite: { enabled: bookingHoldWrite?.enabled === true },
    });
  }

  return [...parsed.values()].filter((item): item is DashboardRollout => item !== null);
}

export function isBookingHoldWriteEnabledForProperty(
  propertyRollouts: unknown,
  propertyId: string | null,
): boolean {
  if (!propertyId) return false;
  const matches = parseDashboardRollouts(propertyRollouts).filter(
    (rollout) => rollout.propertyId === propertyId,
  );
  return matches.length === 1 && matches[0]!.bookingHoldWrite.enabled;
}

export function isDashboardEnabledForProperty(
  propertyRollouts: unknown,
  propertyId: string | null,
): boolean {
  if (!propertyId) return false;
  const matches = parseDashboardRollouts(propertyRollouts).filter(
    (rollout) => rollout.propertyId === propertyId,
  );
  return matches.length === 1 && matches[0]!.adminUxRead.enabled;
}

export function canReadDashboard(access: {
  roles: readonly string[];
  permissions: readonly string[];
}): boolean {
  const hasRole = ["owner", "manager", "admin"].some((role) => access.roles.includes(role));
  return (
    hasRole &&
    ["room.read", "lease.read", "billing.read"].every((permission) =>
      access.permissions.includes(permission),
    )
  );
}

/** Copies only the canonical M7-D1 whitelist before insertion into query cache. */
export function parseDashboardSummary(value: unknown): DashboardSummary {
  const source = record(value);
  if (!source) throw new Error("Invalid dashboard response");
  const recentLeases = source.recent_leases;
  const recentPayments = source.recent_payments;
  if (!Array.isArray(recentLeases) || !Array.isArray(recentPayments)) {
    throw new Error("Invalid dashboard response");
  }
  if (source.timezone !== "Asia/Jakarta") throw new Error("Invalid dashboard response");

  return {
    activeLeases: count(source, "active_leases"),
    activeResidents: count(source, "active_residents"),
    roomsTotal: count(source, "rooms_total"),
    roomsVacant: count(source, "rooms_vacant"),
    roomsOccupied: count(source, "rooms_occupied"),
    roomsMaintenance: count(source, "rooms_maintenance"),
    outstandingAmount: money(source, "outstanding_amount"),
    overdueInvoiceCount: count(source, "overdue_invoice_count"),
    recentLeases: recentLeases.map(parseRecentLease),
    recentPayments: recentPayments.map(parseRecentPayment),
    timezone: "Asia/Jakarta",
    generatedAt: requiredString(source, "generated_at"),
    periodStart: requiredString(source, "period_start"),
    periodEnd: requiredString(source, "period_end"),
  };
}

export function formatDashboardIDR(value: string): string {
  if (!DECIMAL_PATTERN.test(value)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
}
