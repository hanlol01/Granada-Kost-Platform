import { apiClient, getAccessToken } from "@/lib/api";
import { env } from "@/lib/env";

export type OwnerPortalTab =
  | "dashboard"
  | "assets"
  | "finance"
  | "reports"
  | "issues"
  | "notifications"
  | "account";
export type OwnerScopeState = "active" | "scheduled" | "historical" | "empty";
export type Money = string;
type RoomStatus =
  | "vacant"
  | "reserved"
  | "occupied"
  | "maintenance"
  | "inactive"
  | "requires_review";
type LeaseStatus =
  | "draft"
  | "awaiting_activation"
  | "active"
  | "ended"
  | "completed"
  | "cancelled"
  | "transferred";

export const ownerPortalNavigation: ReadonlyArray<{ id: OwnerPortalTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "assets", label: "Aset Saya" },
  { id: "finance", label: "Pendapatan & Settlement" },
  { id: "reports", label: "Laporan" },
  { id: "issues", label: "Komplain & Maintenance" },
  { id: "notifications", label: "Notifikasi" },
  { id: "account", label: "Profil Akun" },
];

export type OwnerPortal = {
  owner: { displayName: string } | null;
  scope: {
    state: OwnerScopeState;
    buildingCount: number;
    roomCount: number;
    scheduledCount: number;
    nextScheduledDate: string | null;
    expiredCount: number;
    latestHistoricalPeriod: string | null;
  };
  occupancy: {
    occupiedCount: number;
    reservedCount: number;
    maintenanceCount: number;
    vacantCount: number;
  };
  issues: { openComplaints: number; openMaintenance: number; unreadNotifications: number };
  assets: Array<{
    roomCode: string;
    roomStatus: RoomStatus;
    buildingCode: string | null;
    buildingName: string | null;
    leaseStatus: LeaseStatus | null;
    leaseEndDate: string | null;
  }>;
};

export type OwnerReport = {
  period: { period: string; start: string; end: string };
  scopeChecksum: string;
  watermark: string;
  summary: {
    assetCount: number;
    occupiedCount: number;
    activeLeaseCount: number;
    grossEarnedRent: Money;
    ownerEntitlement: Money;
    managementFee: Money;
    ownerAdjustments: Money;
    paidOut: Money;
  };
  scope: Array<{ roomId: string; roomCode: string; scopeFrom: string; scopeUntil: string }>;
  occupancies: Array<{
    occupancyId: string;
    roomCode: string;
    startDate: string;
    endDate: string | null;
    occupancyStatus: "active" | "ended" | "transferred";
  }>;
  leases: Array<{
    leaseId: string;
    roomCode: string;
    startDate: string;
    endDate: string | null;
    leaseStatus: "active" | "ended" | "completed" | "transferred";
  }>;
  earnings: Array<{
    earningId: string;
    roomCode: string;
    earningMonth: string;
    serviceFrom: string;
    serviceUntil: string;
    earningStatus: "recognized" | "reversed";
    grossEarnedRent: Money;
    ownerEntitlement: Money;
    managementFee: Money;
  }>;
  adjustments: Array<{
    adjustmentId: string;
    earningId: string;
    settlementId: string;
    effectiveMonth: string;
    adjustmentKind: "reversal" | "refund" | "transfer_proration" | "clawback";
    grossAmountDelta: Money;
    ownerAmountDelta: Money;
    operatorFeeAmountDelta: Money;
  }>;
  settlements: Array<{
    settlementId: string;
    periodStart: string;
    periodEnd: string;
    settlementStatus: "draft" | "ready_for_review" | "approved" | "paid" | "void";
    grossAmount: Money;
    ownerAmount: Money;
    operatorFeeAmount: Money;
  }>;
  payouts: Array<{
    payoutId: string;
    settlementId: string;
    recordedAt: string;
    payoutKind: "payout" | "reversal";
    payoutAmount: Money;
  }>;
  complaints: Array<{
    complaintId: string;
    complaintCode: string;
    complaintStatus:
      | "submitted"
      | "acknowledged"
      | "in_progress"
      | "on_hold"
      | "escalated"
      | "resolved"
      | "reopened"
      | "closed"
      | "cancelled";
    priority: "low" | "medium" | "high" | "urgent";
    createdAt: string;
  }>;
  maintenance: Array<{
    workOrderId: string;
    workOrderCode: string;
    workOrderStatus:
      | "open"
      | "assigned"
      | "in_progress"
      | "on_hold"
      | "completed"
      | "rework_required"
      | "verified"
      | "cancelled";
    priority: "low" | "medium" | "high" | "urgent";
    createdAt: string;
  }>;
  notifications: Array<{
    notificationId: string;
    notificationType: string;
    notificationStatus: "unread" | "read" | "archived";
    priority: "urgent" | "high" | "normal" | "low";
    title: string;
    sourceEventType: string;
    sourceResourceId: string;
    createdAt: string;
  }>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function exact(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (
    !isObject(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return value;
}
function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return value;
}
function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field);
}
function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  const parsed = string(value, field) as T;
  if (!values.includes(parsed)) throw new Error(`Owner portal response is invalid: ${field}.`);
  return parsed;
}
function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return value;
}
function money(value: unknown, field: string, signed = false): Money {
  const parsed = string(value, field);
  if (!(signed ? /^(0|-?[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(parsed))
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return parsed;
}
function date(value: unknown, field: string): string {
  const parsed = string(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed))
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return parsed;
}
function period(value: unknown, field: string): string {
  const parsed = string(value, field);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed))
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return parsed;
}
function timestamp(value: unknown, field: string): string {
  const parsed = string(value, field);
  if (Number.isNaN(Date.parse(parsed)))
    throw new Error(`Owner portal response is invalid: ${field}.`);
  return parsed;
}
const list = <T>(value: unknown, field: string, parser: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) throw new Error(`Owner portal response is invalid: ${field}.`);
  return value.map(parser);
};

export function parseOwnerPortal(value: unknown): OwnerPortal {
  const root = exact(value, ["owner", "scope", "occupancy", "issues", "assets"], "root");
  const owner =
    root.owner === null
      ? null
      : (() => {
          const parsed = exact(root.owner, ["display_name"], "owner");
          return { displayName: string(parsed.display_name, "owner.display_name") };
        })();
  const scope = exact(
    root.scope,
    [
      "state",
      "building_count",
      "room_count",
      "scheduled_count",
      "next_scheduled_date",
      "expired_count",
      "latest_historical_period",
    ],
    "scope",
  );
  const occupancy = exact(
    root.occupancy,
    ["occupied_count", "reserved_count", "maintenance_count", "vacant_count"],
    "occupancy",
  );
  const issues = exact(
    root.issues,
    ["open_complaints", "open_maintenance", "unread_notifications"],
    "issues",
  );
  return {
    owner,
    scope: {
      state: enumValue(scope.state, ["active", "scheduled", "historical", "empty"], "scope.state"),
      buildingCount: count(scope.building_count, "scope.building_count"),
      roomCount: count(scope.room_count, "scope.room_count"),
      scheduledCount: count(scope.scheduled_count, "scope.scheduled_count"),
      nextScheduledDate:
        scope.next_scheduled_date === null
          ? null
          : date(scope.next_scheduled_date, "scope.next_scheduled_date"),
      expiredCount: count(scope.expired_count, "scope.expired_count"),
      latestHistoricalPeriod:
        scope.latest_historical_period === null
          ? null
          : period(scope.latest_historical_period, "scope.latest_historical_period"),
    },
    occupancy: {
      occupiedCount: count(occupancy.occupied_count, "occupancy.occupied_count"),
      reservedCount: count(occupancy.reserved_count, "occupancy.reserved_count"),
      maintenanceCount: count(occupancy.maintenance_count, "occupancy.maintenance_count"),
      vacantCount: count(occupancy.vacant_count, "occupancy.vacant_count"),
    },
    issues: {
      openComplaints: count(issues.open_complaints, "issues.open_complaints"),
      openMaintenance: count(issues.open_maintenance, "issues.open_maintenance"),
      unreadNotifications: count(issues.unread_notifications, "issues.unread_notifications"),
    },
    assets: list(root.assets, "assets", (item) => {
      const asset = exact(
        item,
        [
          "room_code",
          "room_status",
          "building_code",
          "building_name",
          "lease_status",
          "lease_end_date",
        ],
        "asset",
      );
      return {
        roomCode: string(asset.room_code, "asset.room_code"),
        roomStatus: enumValue<RoomStatus>(
          asset.room_status,
          ["vacant", "reserved", "occupied", "maintenance", "inactive", "requires_review"],
          "asset.room_status",
        ),
        buildingCode: nullableString(asset.building_code, "asset.building_code"),
        buildingName: nullableString(asset.building_name, "asset.building_name"),
        leaseStatus:
          asset.lease_status === null
            ? null
            : enumValue<LeaseStatus>(
                asset.lease_status,
                [
                  "draft",
                  "awaiting_activation",
                  "active",
                  "ended",
                  "completed",
                  "cancelled",
                  "transferred",
                ],
                "asset.lease_status",
              ),
        leaseEndDate:
          asset.lease_end_date === null ? null : date(asset.lease_end_date, "asset.lease_end_date"),
      };
    }),
  };
}

export function parseOwnerReport(value: unknown): OwnerReport {
  const root = exact(
    value,
    [
      "period",
      "scope_checksum",
      "watermark",
      "summary",
      "scope",
      "occupancies",
      "leases",
      "earnings",
      "adjustments",
      "settlements",
      "payouts",
      "complaints",
      "maintenance",
      "notifications",
    ],
    "report",
  );
  const period = exact(root.period, ["period", "start", "end"], "period");
  const summary = exact(
    root.summary,
    [
      "asset_count",
      "occupied_count",
      "active_lease_count",
      "gross_earned_rent",
      "owner_entitlement",
      "management_fee",
      "owner_adjustments",
      "paid_out",
    ],
    "summary",
  );
  return {
    period: {
      period: string(period.period, "period.period"),
      start: date(period.start, "period.start"),
      end: date(period.end, "period.end"),
    },
    scopeChecksum: string(root.scope_checksum, "scope_checksum"),
    watermark: string(root.watermark, "watermark"),
    summary: {
      assetCount: count(summary.asset_count, "summary.asset_count"),
      occupiedCount: count(summary.occupied_count, "summary.occupied_count"),
      activeLeaseCount: count(summary.active_lease_count, "summary.active_lease_count"),
      grossEarnedRent: money(summary.gross_earned_rent, "summary.gross_earned_rent"),
      ownerEntitlement: money(summary.owner_entitlement, "summary.owner_entitlement"),
      managementFee: money(summary.management_fee, "summary.management_fee"),
      ownerAdjustments: money(summary.owner_adjustments, "summary.owner_adjustments", true),
      paidOut: money(summary.paid_out, "summary.paid_out", true),
    },
    scope: list(root.scope, "scope", (item) => {
      const row = exact(item, ["room_id", "room_code", "scope_from", "scope_until"], "scope");
      return {
        roomId: string(row.room_id, "scope.room_id"),
        roomCode: string(row.room_code, "scope.room_code"),
        scopeFrom: date(row.scope_from, "scope.scope_from"),
        scopeUntil: date(row.scope_until, "scope.scope_until"),
      };
    }),
    occupancies: list(root.occupancies, "occupancies", (item) => {
      const row = exact(
        item,
        ["occupancy_id", "room_code", "start_date", "end_date", "occupancy_status"],
        "occupancy",
      );
      return {
        occupancyId: string(row.occupancy_id, "occupancy.occupancy_id"),
        roomCode: string(row.room_code, "occupancy.room_code"),
        startDate: date(row.start_date, "occupancy.start_date"),
        endDate: row.end_date === null ? null : date(row.end_date, "occupancy.end_date"),
        occupancyStatus: enumValue(
          row.occupancy_status,
          ["active", "ended", "transferred"],
          "occupancy.occupancy_status",
        ),
      };
    }),
    leases: list(root.leases, "leases", (item) => {
      const row = exact(
        item,
        ["lease_id", "room_code", "start_date", "end_date", "lease_status"],
        "lease",
      );
      return {
        leaseId: string(row.lease_id, "lease.lease_id"),
        roomCode: string(row.room_code, "lease.room_code"),
        startDate: date(row.start_date, "lease.start_date"),
        endDate: row.end_date === null ? null : date(row.end_date, "lease.end_date"),
        leaseStatus: enumValue(
          row.lease_status,
          ["active", "ended", "completed", "transferred"],
          "lease.lease_status",
        ),
      };
    }),
    earnings: list(root.earnings, "earnings", (item) => {
      const row = exact(
        item,
        [
          "earning_id",
          "room_code",
          "earning_month",
          "service_from",
          "service_until",
          "earning_status",
          "gross_earned_rent",
          "owner_entitlement",
          "management_fee",
        ],
        "earning",
      );
      return {
        earningId: string(row.earning_id, "earning.earning_id"),
        roomCode: string(row.room_code, "earning.room_code"),
        earningMonth: date(row.earning_month, "earning.earning_month"),
        serviceFrom: date(row.service_from, "earning.service_from"),
        serviceUntil: date(row.service_until, "earning.service_until"),
        earningStatus: enumValue(
          row.earning_status,
          ["recognized", "reversed"],
          "earning.earning_status",
        ),
        grossEarnedRent: money(row.gross_earned_rent, "earning.gross_earned_rent"),
        ownerEntitlement: money(row.owner_entitlement, "earning.owner_entitlement"),
        managementFee: money(row.management_fee, "earning.management_fee"),
      };
    }),
    adjustments: list(root.adjustments, "adjustments", (item) => {
      const row = exact(
        item,
        [
          "adjustment_id",
          "earning_id",
          "settlement_id",
          "effective_month",
          "adjustment_kind",
          "gross_amount_delta",
          "owner_amount_delta",
          "operator_fee_amount_delta",
        ],
        "adjustment",
      );
      return {
        adjustmentId: string(row.adjustment_id, "adjustment.adjustment_id"),
        earningId: string(row.earning_id, "adjustment.earning_id"),
        settlementId: string(row.settlement_id, "adjustment.settlement_id"),
        effectiveMonth: date(row.effective_month, "adjustment.effective_month"),
        adjustmentKind: enumValue(
          row.adjustment_kind,
          ["reversal", "refund", "transfer_proration", "clawback"],
          "adjustment.adjustment_kind",
        ),
        grossAmountDelta: money(row.gross_amount_delta, "adjustment.gross_amount_delta", true),
        ownerAmountDelta: money(row.owner_amount_delta, "adjustment.owner_amount_delta", true),
        operatorFeeAmountDelta: money(
          row.operator_fee_amount_delta,
          "adjustment.operator_fee_amount_delta",
          true,
        ),
      };
    }),
    settlements: list(root.settlements, "settlements", (item) => {
      const row = exact(
        item,
        [
          "settlement_id",
          "period_start",
          "period_end",
          "settlement_status",
          "gross_amount",
          "owner_amount",
          "operator_fee_amount",
        ],
        "settlement",
      );
      return {
        settlementId: string(row.settlement_id, "settlement.settlement_id"),
        periodStart: date(row.period_start, "settlement.period_start"),
        periodEnd: date(row.period_end, "settlement.period_end"),
        settlementStatus: enumValue(
          row.settlement_status,
          ["draft", "ready_for_review", "approved", "paid", "void"],
          "settlement.settlement_status",
        ),
        grossAmount: money(row.gross_amount, "settlement.gross_amount"),
        ownerAmount: money(row.owner_amount, "settlement.owner_amount"),
        operatorFeeAmount: money(row.operator_fee_amount, "settlement.operator_fee_amount"),
      };
    }),
    payouts: list(root.payouts, "payouts", (item) => {
      const row = exact(
        item,
        ["payout_id", "settlement_id", "recorded_at", "payout_kind", "payout_amount"],
        "payout",
      );
      return {
        payoutId: string(row.payout_id, "payout.payout_id"),
        settlementId: string(row.settlement_id, "payout.settlement_id"),
        recordedAt: timestamp(row.recorded_at, "payout.recorded_at"),
        payoutKind: enumValue(row.payout_kind, ["payout", "reversal"], "payout.payout_kind"),
        payoutAmount: money(row.payout_amount, "payout.payout_amount"),
      };
    }),
    complaints: list(root.complaints, "complaints", (item) => {
      const row = exact(
        item,
        ["complaint_id", "complaint_code", "complaint_status", "priority", "created_at"],
        "complaint",
      );
      return {
        complaintId: string(row.complaint_id, "complaint.complaint_id"),
        complaintCode: string(row.complaint_code, "complaint.complaint_code"),
        complaintStatus: enumValue(
          row.complaint_status,
          [
            "submitted",
            "acknowledged",
            "in_progress",
            "on_hold",
            "escalated",
            "resolved",
            "reopened",
            "closed",
            "cancelled",
          ],
          "complaint.complaint_status",
        ),
        priority: enumValue(
          row.priority,
          ["low", "medium", "high", "urgent"],
          "complaint.priority",
        ),
        createdAt: timestamp(row.created_at, "complaint.created_at"),
      };
    }),
    maintenance: list(root.maintenance, "maintenance", (item) => {
      const row = exact(
        item,
        ["work_order_id", "work_order_code", "work_order_status", "priority", "created_at"],
        "maintenance",
      );
      return {
        workOrderId: string(row.work_order_id, "maintenance.work_order_id"),
        workOrderCode: string(row.work_order_code, "maintenance.work_order_code"),
        workOrderStatus: enumValue(
          row.work_order_status,
          [
            "open",
            "assigned",
            "in_progress",
            "on_hold",
            "completed",
            "rework_required",
            "verified",
            "cancelled",
          ],
          "maintenance.work_order_status",
        ),
        priority: enumValue(
          row.priority,
          ["low", "medium", "high", "urgent"],
          "maintenance.priority",
        ),
        createdAt: timestamp(row.created_at, "maintenance.created_at"),
      };
    }),
    notifications: list(root.notifications, "notifications", (item) => {
      const row = exact(
        item,
        [
          "notification_id",
          "notification_type",
          "notification_status",
          "priority",
          "title",
          "source_event_type",
          "source_resource_id",
          "created_at",
        ],
        "notification",
      );
      return {
        notificationId: string(row.notification_id, "notification.notification_id"),
        notificationType: string(row.notification_type, "notification.notification_type"),
        notificationStatus: enumValue(
          row.notification_status,
          ["unread", "read", "archived"],
          "notification.notification_status",
        ),
        priority: enumValue(
          row.priority,
          ["urgent", "high", "normal", "low"],
          "notification.priority",
        ),
        title: string(row.title, "notification.title"),
        sourceEventType: string(row.source_event_type, "notification.source_event_type"),
        sourceResourceId: string(row.source_resource_id, "notification.source_resource_id"),
        createdAt: timestamp(row.created_at, "notification.created_at"),
      };
    }),
  };
}

export type OwnerPortalViewState =
  | "loading"
  | "error"
  | "empty"
  | "scheduled"
  | "historical"
  | "ready";
export function getOwnerPortalViewState(
  portal: OwnerPortal | undefined,
  isLoading: boolean,
  hasError: boolean,
): OwnerPortalViewState {
  if (isLoading) return "loading";
  if (hasError) return "error";
  if (!portal || portal.owner === null) return "empty";
  return portal.scope.state === "active" ? "ready" : portal.scope.state;
}
export function formatOwnerMoney(value: Money): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
}

export const propertyOwnerPortalApi = {
  get: () => apiClient.get<unknown>("/my/property-owner/portal").then(parseOwnerPortal),
  preview: (period: string) =>
    apiClient
      .get<unknown>("/my/property-owner/reports/preview", { query: { period } })
      .then(parseOwnerReport),
};
export async function downloadOwnerReport(period: string, format: "pdf" | "xlsx"): Promise<void> {
  const token = getAccessToken();
  const query = new URLSearchParams({ period, format });
  const response = await fetch(
    `${env.VITE_API_BASE_URL}/my/property-owner/reports/export?${query}`,
    { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!response.ok) throw new Error(`Owner report export failed (HTTP ${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `owner-report-${period}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
