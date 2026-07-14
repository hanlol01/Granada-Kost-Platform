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

export type AdminPaymentTransactionAccess = {
  roles: readonly string[];
  permissions: readonly string[];
};

const PAYMENT_TRANSACTION_STATUSES = new Set<AdminPaymentTransactionStatus>([
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
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid payment transaction response");
  }
  return value;
}

function nullableString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid payment transaction response");
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
  if (!source) throw new Error("Invalid payment transaction response");

  const status = requiredString(source, "status");
  const amount = source.amount;
  const currency = requiredString(source, "currency");
  if (!PAYMENT_TRANSACTION_STATUSES.has(status as AdminPaymentTransactionStatus)) {
    throw new Error("Invalid payment transaction response");
  }
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Invalid payment transaction response");
  }
  if (currency !== "IDR") throw new Error("Invalid payment transaction response");

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

export function parseAdminPaymentTransactionList(value: unknown): AdminPaymentTransaction[] {
  if (!Array.isArray(value)) throw new Error("Invalid payment transaction list response");
  return value.map(parseAdminPaymentTransaction);
}
