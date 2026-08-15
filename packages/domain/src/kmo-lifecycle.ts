/**
 * KMO target vocabulary. These values are not live route enums yet: vertical
 * slices must opt in only after their schema and consumers support the target.
 */
export const KMO_LIFECYCLE_STATUSES = {
  bookingLead: [
    "new",
    "contacted",
    "negotiating",
    "awaiting_dp",
    "onboarding",
    "leased",
    "rejected",
    "expired",
    "cancelled",
  ],
  hold: ["active", "committed", "released", "expired"],
  onboarding: [
    "draft",
    "awaiting_documents",
    "awaiting_financials",
    "ready_to_commit",
    "committed",
    "completed",
    "cancelled",
  ],
  account: [
    "not_provisioned",
    "password_change_required",
    "active",
    "suspended",
    "archived",
  ],
  resident: ["draft", "pending_activation", "active", "inactive", "archived"],
  lease: [
    "draft",
    "awaiting_activation",
    "active",
    "transferred",
    "completed",
    "cancelled",
  ],
  occupancy: ["active", "ended", "cancelled"],
  room: [
    "vacant",
    "reserved",
    "occupied",
    "inspection_required",
    "maintenance",
    "inactive",
  ],
  billingPlan: ["draft", "active", "completed", "cancelled"],
  billingCycle: [
    "annual_full",
    "two_month_installments",
    "legacy_monthly",
    "legacy_yearly",
  ],
  invoice: ["draft", "issued", "partially_paid", "paid", "overdue", "void"],
  payment: ["pending_confirmation", "verified", "rejected", "reversed"],
  securityDeposit: [
    "required",
    "partially_funded",
    "held",
    "refund_pending",
    "partially_refunded",
    "refunded",
    "exhausted_by_deductions",
    "reversed",
  ],
  transfer: ["draft", "scheduled", "executed", "cancelled"],
  checkout: [
    "notice_received",
    "scheduled",
    "inspection_required",
    "settlement_pending",
    "completed",
    "cancelled",
  ],
  reminder: [
    "prepared",
    "opened",
    "manually_marked_sent",
    "queued",
    "sent",
    "delivered",
    "read",
    "failed",
    "archived",
  ],
  notification: ["unread", "read", "archived"],
  expense: [
    "draft",
    "pending_approval",
    "approved",
    "paid",
    "rejected",
    "cancelled",
    "reversed",
    "archived",
  ],
  complaint: [
    "submitted",
    "acknowledged",
    "in_progress",
    "waiting",
    "resolved",
    "closed",
    "reopened",
    "cancelled",
  ],
  workOrder: [
    "open",
    "assigned",
    "in_progress",
    "on_hold",
    "escalated",
    "completed",
    "verified",
    "rework_required",
    "cancelled",
  ],
  vehicle: [
    "pending_verification",
    "active",
    "inactive",
    "rejected",
    "archived",
  ],
  parking: [
    "pending_verification",
    "active",
    "inactive",
    "rejected",
    "archived",
  ],
  ownership: ["draft", "active", "ended", "cancelled"],
  managedContent: ["draft", "published", "archived"],
} as const;

export type KmoLifecycleDomain = keyof typeof KMO_LIFECYCLE_STATUSES;

export type KmoCompatibilityResult =
  | {
      outcome: "mapped";
      domain: KmoLifecycleDomain;
      legacyValue: string;
      targetValue: string;
    }
  | {
      outcome: "unresolved";
      domain: KmoLifecycleDomain;
      legacyValue: string;
      reasonCode: KmoCompatibilityReasonCode;
    };

export type KmoCompatibilityReasonCode =
  | "BOOKING_LEAD_HISTORY_REQUIRED"
  | "ACCOUNT_LINK_REQUIRED"
  | "PAYMENT_ALLOCATION_REQUIRED"
  | "ACTIVE_LEASE_REQUIRED"
  | "BUILDING_OWNERSHIP_REQUIRED"
  | "ROOM_INSPECTION_EVIDENCE_REQUIRED"
  | "LEGACY_STATE_UNMAPPED";

const EXACT_COMPATIBILITY_MAP: Partial<
  Record<KmoLifecycleDomain, Readonly<Record<string, string>>>
> = {
  hold: {
    active: "active",
    committed: "committed",
    released: "released",
    expired: "expired",
  },
  account: { active: "active", suspended: "suspended" },
  resident: { active: "active", inactive: "inactive" },
  lease: {
    draft: "draft",
    awaiting_activation: "awaiting_activation",
    active: "active",
    transferred: "transferred",
    ended: "completed",
    completed: "completed",
    cancelled: "cancelled",
  },
  occupancy: { active: "active", ended: "ended", cancelled: "cancelled" },
  room: {
    vacant: "vacant",
    reserved: "reserved",
    occupied: "occupied",
    maintenance: "maintenance",
    inactive: "inactive",
    inspection_required: "inspection_required",
  },
  billingPlan: {
    draft: "draft",
    active: "active",
    completed: "completed",
    cancelled: "cancelled",
  },
  billingCycle: {
    monthly: "legacy_monthly",
    yearly: "legacy_yearly",
    annual_full: "annual_full",
    two_month_installments: "two_month_installments",
  },
  invoice: {
    draft: "draft",
    issued: "issued",
    partial: "partially_paid",
    partially_paid: "partially_paid",
    paid: "paid",
    overdue: "overdue",
    void: "void",
  },
  payment: {
    pending: "pending_confirmation",
    pending_confirmation: "pending_confirmation",
    verified: "verified",
    rejected: "rejected",
    reversed: "reversed",
  },
  securityDeposit: Object.fromEntries(
    KMO_LIFECYCLE_STATUSES.securityDeposit.map((status) => [status, status]),
  ),
  transfer: {
    draft: "draft",
    scheduled: "scheduled",
    executed: "executed",
    cancelled: "cancelled",
  },
  checkout: Object.fromEntries(
    KMO_LIFECYCLE_STATUSES.checkout.map((status) => [status, status]),
  ),
  reminder: Object.fromEntries(
    KMO_LIFECYCLE_STATUSES.reminder.map((status) => [status, status]),
  ),
  notification: { unread: "unread", read: "read", archived: "archived" },
  expense: Object.fromEntries(
    KMO_LIFECYCLE_STATUSES.expense.map((status) => [status, status]),
  ),
  complaint: {
    open: "submitted",
    submitted: "submitted",
    acknowledged: "acknowledged",
    in_progress: "in_progress",
    on_hold: "waiting",
    waiting: "waiting",
    resolved: "resolved",
    closed: "closed",
    reopened: "reopened",
    cancelled: "cancelled",
  },
  workOrder: Object.fromEntries(
    KMO_LIFECYCLE_STATUSES.workOrder.map((status) => [status, status]),
  ),
  vehicle: {
    pending_approval: "pending_verification",
    pending_verification: "pending_verification",
    active: "active",
    suspended: "inactive",
    inactive: "inactive",
    rejected: "rejected",
    archived: "archived",
  },
  parking: {
    pending_approval: "pending_verification",
    pending_verification: "pending_verification",
    active: "active",
    suspended: "inactive",
    inactive: "inactive",
    rejected: "rejected",
    archived: "archived",
  },
  ownership: {
    draft: "draft",
    active: "active",
    ended: "ended",
    cancelled: "cancelled",
  },
  managedContent: {
    draft: "draft",
    published: "published",
    archived: "archived",
  },
};

const AMBIGUOUS_REASON: Partial<
  Record<KmoLifecycleDomain, KmoCompatibilityReasonCode>
> = {
  bookingLead: "BOOKING_LEAD_HISTORY_REQUIRED",
  onboarding: "BOOKING_LEAD_HISTORY_REQUIRED",
  account: "ACCOUNT_LINK_REQUIRED",
  resident: "ACCOUNT_LINK_REQUIRED",
  payment: "PAYMENT_ALLOCATION_REQUIRED",
  occupancy: "ACTIVE_LEASE_REQUIRED",
  ownership: "BUILDING_OWNERSHIP_REQUIRED",
  room: "ROOM_INSPECTION_EVIDENCE_REQUIRED",
};

/** Maps only evidence-independent values; ambiguous legacy facts stay explicit. */
export function mapKmoLegacyLifecycle(
  domain: KmoLifecycleDomain,
  legacyValue: string,
): KmoCompatibilityResult {
  const normalized = legacyValue.trim().toLowerCase();
  const targetValue = EXACT_COMPATIBILITY_MAP[domain]?.[normalized];
  if (targetValue !== undefined) {
    return { outcome: "mapped", domain, legacyValue: normalized, targetValue };
  }
  return {
    outcome: "unresolved",
    domain,
    legacyValue: normalized,
    reasonCode: AMBIGUOUS_REASON[domain] ?? "LEGACY_STATE_UNMAPPED",
  };
}
