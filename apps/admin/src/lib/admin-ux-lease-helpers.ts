import type { LeaseStatus } from "./admin-ux-lease-types";

export type LeaseListRouteSearch = {
  q: string;
  status?: LeaseStatus;
  overdue: boolean;
  residentId?: string;
  roomId?: string;
  kostTypeId?: string;
  offset: number;
  limit: number;
};

export type LeaseDetailPanel = "detail" | "transfer" | "checkout";
export type LeaseDetailTab = "ringkasan" | "invoice" | "deposit" | "riwayat";

export type LeaseDetailRouteSearch = {
  panel: LeaseDetailPanel;
  tab: LeaseDetailTab;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function optionalText(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, max);
  return normalized || undefined;
}

export function isLeaseUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function optionalUuid(value: unknown): string | undefined {
  const candidate = optionalText(value, 64);
  return candidate && isLeaseUuid(candidate) ? candidate : undefined;
}

export function normalizeLeaseListSearch(raw: Record<string, unknown>): LeaseListRouteSearch {
  const status: LeaseStatus | undefined =
    raw.status === "active" ||
    raw.status === "ended" ||
    raw.status === "cancelled" ||
    raw.status === "transferred"
      ? raw.status
      : undefined;

  return {
    q: optionalText(raw.q) ?? "",
    status,
    overdue: raw.overdue === true || raw.overdue === "true",
    residentId: optionalUuid(raw.resident_id),
    roomId: optionalUuid(raw.room_id),
    kostTypeId: optionalUuid(raw.kost_type_id),
    offset: boundedInteger(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(raw.limit, 20, 1, 100),
  };
}

export function normalizeLeaseDetailSearch(raw: Record<string, unknown>): LeaseDetailRouteSearch {
  return {
    panel:
      raw.panel === "transfer" || raw.panel === "checkout" || raw.panel === "detail"
        ? raw.panel
        : "detail",
    tab:
      raw.tab === "invoice" ||
      raw.tab === "deposit" ||
      raw.tab === "riwayat" ||
      raw.tab === "ringkasan"
        ? raw.tab
        : "ringkasan",
  };
}

/** Business dates are displayed as Jakarta dates; the server remains authoritative. */
export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return value("year") + "-" + value("month") + "-" + value("day");
}

export const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  active: "Aktif",
  ended: "Selesai",
  cancelled: "Dibatalkan",
  transferred: "Dipindahkan",
};

export const BILLING_CYCLE_LABEL = {
  monthly: "Bulanan",
  yearly: "Tahunan",
} as const;

export function isFinancialLeaseActor(input: {
  roles: readonly string[];
  permissions: readonly string[];
}): boolean {
  return (
    input.permissions.includes("lease.manage") &&
    input.permissions.includes("billing.manage") &&
    input.roles.some((role) => role === "owner" || role === "manager")
  );
}

/**
 * Refund settlement has a narrower backend permission than collect/checkout:
 * owner/manager plus billing.manage, without a lease.manage requirement.
 */
export function canSettleLeaseRefund(input: {
  roles: readonly string[];
  permissions: readonly string[];
}): boolean {
  return (
    input.permissions.includes("billing.manage") &&
    input.roles.some((role) => role === "owner" || role === "manager")
  );
}

/**
 * Normal lease filters are not accepted by the overdue endpoint. Returning to
 * the normal list makes the URL and rendered server result agree.
 */
export function leaseListFilterChange<T extends Partial<LeaseListRouteSearch>>(
  next: T,
): T & {
  overdue: false;
  offset: 0;
} {
  return { ...next, overdue: false, offset: 0 };
}

/** UI-only completeness check; the server remains the financial authority. */
export function hasRequiredLeasePaymentReference(amount: number, reference: string): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && reference.trim().length > 0;
}

export function canRunNonFinancialTransfer(input: {
  permissions: readonly string[];
  leaseStatus: LeaseStatus;
  transferFlagEnabled: boolean;
}): boolean {
  return (
    input.transferFlagEnabled &&
    input.permissions.includes("lease.manage") &&
    input.leaseStatus === "active"
  );
}

export const TRANSFER_REASON_LABEL: Record<string, string> = {
  resident_request: "Permintaan penghuni",
  room_issue: "Masalah kamar",
  property_operation: "Operasional properti",
  eligibility_correction: "Koreksi kelayakan",
  commercial_adjustment: "Penyesuaian komersial",
  other: "Lainnya",
};

export const TRANSFER_COMMAND_STATE_LABEL: Record<string, string> = {
  scheduled: "Terjadwal",
  executed: "Dieksekusi",
  cancelled: "Dibatalkan",
  failed: "Gagal",
};

/**
 * W07B: every transfer mutation (preview included) is admin-only with
 * lease.manage. The same-day exception additionally requires billing.manage
 * whenever a deposit top-up is involved.
 */
export function canRunAdminTransfer(input: {
  roles: readonly string[];
  permissions: readonly string[];
  leaseStatus: LeaseStatus;
  transferFlagEnabled: boolean;
}): boolean {
  return (
    input.transferFlagEnabled &&
    input.roles.includes("admin") &&
    input.permissions.includes("lease.manage") &&
    input.leaseStatus === "active"
  );
}

export function canRunTransferTopUp(input: {
  roles: readonly string[];
  permissions: readonly string[];
}): boolean {
  return (
    input.roles.includes("admin") &&
    input.permissions.includes("lease.manage") &&
    input.permissions.includes("billing.manage")
  );
}

export function leaseHistoryLabel(eventType: string): string {
  const labels: Record<string, string> = {
    created: "Penyewaan dibuat",
    updated: "Catatan diperbarui",
    invoice_generated: "Tagihan diterbitkan",
    deposit_collected: "Deposit dicatat",
    deposit_deducted: "Deposit dipotong",
    deposit_refunded: "Refund deposit dibuat",
    closed: "Penyewaan di-checkout",
    transferred_out: "Dipindahkan dari kamar",
    transferred_in: "Dipindahkan ke kamar",
    transfer_scheduled: "Transfer terjadwal dicatat",
    transfer_cancelled: "Transfer terjadwal dibatalkan",
    transfer_failed: "Transfer terjadwal gagal dieksekusi",
  };
  return labels[eventType] ?? "Aktivitas penyewaan";
}
