export type AdminPaymentTransactionStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "denied"
  | "challenge"
  | "requires_review"
  | "unknown";

export type AdminPaymentTransaction = {
  id: string;
  invoiceId: string;
  propertyId: string;
  residentId: string;
  requestedByUserId: string | null;
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: "IDR";
  status: AdminPaymentTransactionStatus;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  failedAt: string | null;
};

export type AdminPaymentTransactionPage = {
  data: AdminPaymentTransaction[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type AdminPaymentTransactionAccess = {
  roles: readonly string[];
  permissions: readonly string[];
};

export const ADMIN_PAYMENT_TRANSACTION_STATUSES: readonly AdminPaymentTransactionStatus[] = [
  "created",
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "denied",
  "challenge",
  "requires_review",
  "unknown",
];

const PAYMENT_TRANSACTION_STATUSES = new Set(ADMIN_PAYMENT_TRANSACTION_STATUSES);
const INVALID_RESPONSE = "Invalid payment transaction response";
const INVALID_LIST_RESPONSE = "Invalid payment transaction list response";
const INVALID_DETAIL_RESPONSE = "Invalid payment transaction detail response";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function nullableString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(INVALID_RESPONSE);
  return value;
}

function hasExactKeys(source: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(source).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonNegativeInteger(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(INVALID_LIST_RESPONSE);
  }
  return value;
}

export function canReadAdminPaymentTransactions(access: AdminPaymentTransactionAccess): boolean {
  const hasRole = access.roles.includes("manager") || access.roles.includes("admin");
  return hasRole && access.permissions.includes("billing.read");
}

/**
 * Copies only the M7-B1 response whitelist before the record enters UI cache.
 * Opaque subject IDs remain transport/cache values and must never be rendered.
 */
export function parseAdminPaymentTransaction(value: unknown): AdminPaymentTransaction {
  const source = record(value);
  if (!source) throw new Error(INVALID_RESPONSE);

  const status = requiredString(source, "status");
  const amount = source.amount;
  const currency = requiredString(source, "currency");
  if (!PAYMENT_TRANSACTION_STATUSES.has(status as AdminPaymentTransactionStatus)) {
    throw new Error(INVALID_RESPONSE);
  }
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(INVALID_RESPONSE);
  }
  if (currency !== "IDR") throw new Error(INVALID_RESPONSE);

  return {
    id: requiredString(source, "id"),
    invoiceId: requiredString(source, "invoiceId"),
    propertyId: requiredString(source, "propertyId"),
    residentId: requiredString(source, "residentId"),
    requestedByUserId: nullableString(source, "requestedByUserId"),
    provider: requiredString(source, "provider"),
    providerOrderId: requiredString(source, "providerOrderId"),
    amount,
    currency: "IDR",
    status: status as AdminPaymentTransactionStatus,
    paymentMethod: nullableString(source, "paymentMethod"),
    createdAt: requiredString(source, "createdAt"),
    updatedAt: requiredString(source, "updatedAt"),
    paidAt: nullableString(source, "paidAt"),
    failedAt: nullableString(source, "failedAt"),
  };
}

export function parseAdminPaymentTransactionList(value: unknown): AdminPaymentTransactionPage {
  const source = record(value);
  if (!source || !hasExactKeys(source, ["data", "meta"]) || !Array.isArray(source.data)) {
    throw new Error(INVALID_LIST_RESPONSE);
  }
  const meta = record(source.meta);
  if (!meta || !hasExactKeys(meta, ["limit", "offset", "total"])) {
    throw new Error(INVALID_LIST_RESPONSE);
  }
  const limit = nonNegativeInteger(meta, "limit");
  if (limit < 1 || limit > 100) throw new Error(INVALID_LIST_RESPONSE);
  return {
    data: source.data.map(parseAdminPaymentTransaction),
    meta: {
      limit,
      offset: nonNegativeInteger(meta, "offset"),
      total: nonNegativeInteger(meta, "total"),
    },
  };
}

export function parseAdminPaymentTransactionDetail(value: unknown): AdminPaymentTransaction {
  const source = record(value);
  if (!source || !hasExactKeys(source, ["data"])) {
    throw new Error(INVALID_DETAIL_RESPONSE);
  }
  return parseAdminPaymentTransaction(source.data);
}
