import type { RoleCode } from "@granada-kost/domain";
import {
  adminUxV2Requester,
  type AdminUxQueryValue,
  type AdminUxV2Requester,
} from "@/lib/admin-ux-api";

export const ADMIN_INVOICE_STATUSES = [
  "draft",
  "issued",
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export const ADMIN_PAYMENT_STATUSES = ["pending", "verified", "void"] as const;

export type AdminInvoiceStatus = (typeof ADMIN_INVOICE_STATUSES)[number];
export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

export type AdminInvoiceRecord = {
  id: string;
  invoice_code: string;
  invoice_status: AdminInvoiceStatus;
  subtotal_amount: number;
  late_fee_amount: number;
  total_amount: number;
  cycle_start_date: string;
  cycle_end_date: string;
  due_date: string;
  paid_at: string | null;
};

export type AdminPaymentRecord = {
  id: string;
  payment_code: string;
  payment_status: AdminPaymentStatus;
  amount: number;
  paid_at: string | null;
  verified_at: string | null;
};

export type AdminBillingPage<T> = {
  data: T[];
  meta: { limit: number; offset: number; total: number };
};

export type AdminBillingListInput<TStatus extends string> = {
  propertyId: string;
  status?: TStatus;
  limit?: number;
  offset?: number;
};

type BillingRequester = Pick<AdminUxV2Requester, "get">;
const ALLOWED_ROLES = new Set<RoleCode>(["owner", "manager", "admin"]);
const INVOICE_STATUSES = new Set<string>(ADMIN_INVOICE_STATUSES);
const PAYMENT_STATUSES = new Set<string>(ADMIN_PAYMENT_STATUSES);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Invalid Admin billing ${field}.`);
  return value;
}

function amount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Admin billing ${field}.`);
  }
  return value;
}

function date(value: unknown, field: string): string {
  const result = string(value, field);
  if (!DATE.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new Error(`Invalid Admin billing ${field}.`);
  }
  return result;
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  const result = string(value, field);
  if (!TIMESTAMP.test(result) || Number.isNaN(Date.parse(result))) {
    throw new Error(`Invalid Admin billing ${field}.`);
  }
  return result;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid Admin billing ${field}.`);
  }
  return value;
}

function page<T>(value: unknown, parseItem: (item: unknown) => T): AdminBillingPage<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    throw new Error("Invalid Admin billing response.");
  }
  const limit = integer(value.meta.limit, "limit");
  if (limit < 1 || limit > 100) throw new Error("Invalid Admin billing limit.");
  return {
    data: value.data.map(parseItem),
    meta: {
      limit,
      offset: integer(value.meta.offset, "offset"),
      total: integer(value.meta.total, "total"),
    },
  };
}

function invoice(value: unknown): AdminInvoiceRecord {
  if (!isRecord(value)) throw new Error("Invalid Admin invoice item.");
  const status = string(value.invoice_status, "invoice status");
  if (!INVOICE_STATUSES.has(status)) throw new Error("Invalid Admin invoice status.");
  return {
    id: string(value.id, "invoice id"),
    invoice_code: string(value.invoice_code, "invoice code"),
    invoice_status: status as AdminInvoiceStatus,
    subtotal_amount: amount(value.subtotal_amount, "subtotal"),
    late_fee_amount: amount(value.late_fee_amount, "late fee"),
    total_amount: amount(value.total_amount, "total"),
    cycle_start_date: date(value.cycle_start_date, "cycle start"),
    cycle_end_date: date(value.cycle_end_date, "cycle end"),
    due_date: date(value.due_date, "due date"),
    paid_at: nullableTimestamp(value.paid_at, "paid time"),
  };
}

function payment(value: unknown): AdminPaymentRecord {
  if (!isRecord(value)) throw new Error("Invalid Admin payment item.");
  const status = string(value.payment_status, "payment status");
  if (!PAYMENT_STATUSES.has(status)) throw new Error("Invalid Admin payment status.");
  return {
    id: string(value.id, "payment id"),
    payment_code: string(value.payment_code, "payment code"),
    payment_status: status as AdminPaymentStatus,
    amount: amount(value.amount, "amount"),
    paid_at: nullableTimestamp(value.paid_at, "paid time"),
    verified_at: nullableTimestamp(value.verified_at, "verified time"),
  };
}

export function canReadAdminBilling(access: {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
}): boolean {
  return Boolean(
    access.roles?.some((role) => ALLOWED_ROLES.has(role)) &&
    access.permissions?.includes("billing.read"),
  );
}

export function parseAdminInvoicesPage(value: unknown): AdminBillingPage<AdminInvoiceRecord> {
  return page(value, invoice);
}

export function parseAdminPaymentsPage(value: unknown): AdminBillingPage<AdminPaymentRecord> {
  return page(value, payment);
}

function query<TStatus extends string>(input: AdminBillingListInput<TStatus>) {
  return {
    property_id: input.propertyId,
    status: input.status,
    limit: input.limit ?? 20,
    offset: input.offset ?? 0,
  } satisfies Record<string, AdminUxQueryValue>;
}

export async function getAdminInvoices(
  input: AdminBillingListInput<AdminInvoiceStatus>,
  signal?: AbortSignal,
  requester: BillingRequester = adminUxV2Requester,
) {
  const response = await requester.get<unknown>("/admin/invoices", { query: query(input), signal });
  return parseAdminInvoicesPage(response);
}

export async function getAdminPayments(
  input: AdminBillingListInput<AdminPaymentStatus>,
  signal?: AbortSignal,
  requester: BillingRequester = adminUxV2Requester,
) {
  const response = await requester.get<unknown>("/admin/payments", { query: query(input), signal });
  return parseAdminPaymentsPage(response);
}
