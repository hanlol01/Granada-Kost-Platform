// Shared report selectors.
//
// Phase 1 backend exposes neither /reports/* nor /admin/dashboard/summary,
// so the Admin app derives operational summaries from existing list endpoints.
// Both Dashboard (useDashboardSummary) and Reports (useReports) MUST go through
// the selectors in this file so any displayed number stays consistent across
// surfaces. Selectors are pure and dependency-free; they accept already-fetched
// arrays so they are trivial to unit-test once a testing setup lands.
//
// Source of truth for status/amount semantics: backend module types referenced
// by the corresponding hooks (useRooms, useBilling, etc.).

import type { RoomRecord, RoomStatus } from "@/hooks/useRooms";
import type { ResidentRecord } from "@/hooks/useResidents";
import type { InvoiceRecord, InvoiceStatus, PaymentRecord } from "@/hooks/useBilling";
import type { ComplaintRecord, StoredComplaintStatus } from "@/hooks/useComplaints";
import type { VehicleRecord, VehicleStatus } from "@/hooks/useVehicles";
import type { ParkingSlotRecord, ParkingSlotStatus, ParkingZoneRecord } from "@/hooks/useParking";
import type { WorkOrderRecord, WorkOrderStatus } from "@/hooks/useWorkOrders";

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

export type OccupancySummary = {
  totalRooms: number;
  occupied: number;
  vacant: number;
  reserved: number;
  maintenance: number;
  inactive: number;
  occupancyPercent: number;
};

export function selectOccupancySummary(rooms: readonly RoomRecord[]): OccupancySummary {
  const counts: Record<RoomStatus, number> = {
    vacant: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0,
    inactive: 0,
    requires_review: 0,
  };
  for (const room of rooms) counts[room.roomStatus] = (counts[room.roomStatus] ?? 0) + 1;
  const total = rooms.length;
  // Denominator excludes inactive rooms because they are not part of the
  // bookable inventory; this mirrors how operational dashboards report KPI.
  const denominator = total - counts.inactive;
  const percent = denominator > 0 ? Math.round((counts.occupied / denominator) * 100) : 0;
  return {
    totalRooms: total,
    occupied: counts.occupied,
    vacant: counts.vacant,
    reserved: counts.reserved,
    maintenance: counts.maintenance + counts.requires_review,
    inactive: counts.inactive,
    occupancyPercent: percent,
  };
}

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------

export type ResidentSummary = {
  total: number;
  active: number;
  inactive: number;
};

export function selectResidentSummary(residents: readonly ResidentRecord[]): ResidentSummary {
  let active = 0;
  let inactive = 0;
  for (const r of residents) {
    if (r.residentStatus === "active") active += 1;
    else if (r.residentStatus === "inactive") inactive += 1;
  }
  return { total: residents.length, active, inactive };
}

// ---------------------------------------------------------------------------
// Billing aging (derived from /invoices)
// ---------------------------------------------------------------------------

export type BillingAgingSummary = {
  totalInvoices: number;
  unpaid: number; // status in {issued, unpaid, partially_paid}
  overdue: number; // unpaid AND due_date < today
  paid: number;
  voided: number;
  outstandingAmount: number; // sum of totalAmount for unpaid+overdue invoices
  overdueAmount: number;
};

const OPEN_INVOICE_STATUSES: ReadonlyArray<InvoiceStatus> = [
  "issued",
  "unpaid",
  "partially_paid",
  "overdue",
];

export function isOpenInvoice(invoice: InvoiceRecord): boolean {
  return OPEN_INVOICE_STATUSES.includes(invoice.invoiceStatus);
}

export function isOverdueInvoice(invoice: InvoiceRecord, today = new Date()): boolean {
  if (invoice.invoiceStatus === "overdue") return true;
  if (!isOpenInvoice(invoice)) return false;
  if (!invoice.dueDate) return false;
  const due = new Date(invoice.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  // Compare on calendar-day boundary in local time.
  due.setHours(23, 59, 59, 999);
  return due.getTime() < today.getTime();
}

export function selectBillingAgingSummary(
  invoices: readonly InvoiceRecord[],
  today = new Date(),
): BillingAgingSummary {
  let unpaid = 0;
  let overdue = 0;
  let paid = 0;
  let voided = 0;
  let outstandingAmount = 0;
  let overdueAmount = 0;
  for (const inv of invoices) {
    if (inv.invoiceStatus === "paid") paid += 1;
    else if (inv.invoiceStatus === "void") voided += 1;
    if (isOpenInvoice(inv)) {
      unpaid += 1;
      outstandingAmount += inv.totalAmount ?? 0;
      if (isOverdueInvoice(inv, today)) {
        overdue += 1;
        overdueAmount += inv.totalAmount ?? 0;
      }
    }
  }
  return {
    totalInvoices: invoices.length,
    unpaid,
    overdue,
    paid,
    voided,
    outstandingAmount,
    overdueAmount,
  };
}

// ---------------------------------------------------------------------------
// Revenue / Payments (year-filtered)
// ---------------------------------------------------------------------------

export type RevenueSummary = {
  verifiedPayments: number;
  pendingPayments: number;
  voidedPayments: number;
  verifiedAmount: number;
  monthly: { month: number; amount: number }[]; // length 12, indices 0..11 == Jan..Dec
  totalAmount: number;
  averageMonthlyAmount: number;
  bestMonth: { month: number; amount: number } | null;
};

export function selectRevenueSummary(
  payments: readonly PaymentRecord[],
  year: number,
): RevenueSummary {
  let verified = 0;
  let pending = 0;
  let voided = 0;
  let verifiedAmount = 0;
  const monthly: number[] = new Array(12).fill(0);
  for (const p of payments) {
    if (p.paymentStatus === "pending") pending += 1;
    else if (p.paymentStatus === "void") voided += 1;
    if (p.paymentStatus !== "verified") continue;
    const when = p.paidAt ?? p.verifiedAt;
    if (!when) continue;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getFullYear() !== year) continue;
    verified += 1;
    verifiedAmount += p.amount ?? 0;
    monthly[date.getMonth()] += p.amount ?? 0;
  }
  const months = monthly.map((amount, idx) => ({ month: idx, amount }));
  const monthsWithRevenue = months.filter((m) => m.amount > 0);
  const average =
    monthsWithRevenue.length > 0
      ? Math.round(
          monthsWithRevenue.reduce((sum, m) => sum + m.amount, 0) / monthsWithRevenue.length,
        )
      : 0;
  let best: { month: number; amount: number } | null = null;
  for (const m of months) {
    if (m.amount > 0 && (!best || m.amount > best.amount)) best = m;
  }
  return {
    verifiedPayments: verified,
    pendingPayments: pending,
    voidedPayments: voided,
    verifiedAmount,
    monthly: months,
    totalAmount: verifiedAmount,
    averageMonthlyAmount: average,
    bestMonth: best,
  };
}

// ---------------------------------------------------------------------------
// Complaint summary
// ---------------------------------------------------------------------------

export type ComplaintSummary = {
  total: number;
  open: number; // submitted/acknowledged/in_progress/on_hold/escalated/reopened
  resolved: number;
  closed: number;
  cancelled: number;
  byStatus: Record<StoredComplaintStatus, number>;
  slaBreached: number;
};

const OPEN_COMPLAINT_STATUSES = new Set<StoredComplaintStatus>([
  "submitted",
  "acknowledged",
  "in_progress",
  "on_hold",
  "escalated",
  "reopened",
]);

export function selectComplaintSummary(complaints: readonly ComplaintRecord[]): ComplaintSummary {
  const byStatus = {
    submitted: 0,
    acknowledged: 0,
    in_progress: 0,
    on_hold: 0,
    escalated: 0,
    resolved: 0,
    reopened: 0,
    closed: 0,
    cancelled: 0,
  } satisfies Record<StoredComplaintStatus, number>;
  let open = 0;
  let slaBreached = 0;
  for (const c of complaints) {
    byStatus[c.complaintStatus] = (byStatus[c.complaintStatus] ?? 0) + 1;
    if (OPEN_COMPLAINT_STATUSES.has(c.complaintStatus)) open += 1;
    if (c.responseSlaBreached || c.resolutionSlaBreached) slaBreached += 1;
  }
  return {
    total: complaints.length,
    open,
    resolved: byStatus.resolved,
    closed: byStatus.closed,
    cancelled: byStatus.cancelled,
    byStatus,
    slaBreached,
  };
}

// ---------------------------------------------------------------------------
// Vehicle summary
// ---------------------------------------------------------------------------

export type VehicleSummary = {
  total: number;
  active: number;
  pendingApproval: number;
  suspended: number;
  rejected: number;
  inactive: number;
  byStatus: Record<VehicleStatus, number>;
};

export function selectVehicleSummary(vehicles: readonly VehicleRecord[]): VehicleSummary {
  const byStatus = {
    pending_approval: 0,
    active: 0,
    rejected: 0,
    suspended: 0,
    transfer_pending: 0,
    inactive: 0,
  } satisfies Record<VehicleStatus, number>;
  for (const v of vehicles) {
    byStatus[v.vehicleStatus] = (byStatus[v.vehicleStatus] ?? 0) + 1;
  }
  return {
    total: vehicles.length,
    active: byStatus.active,
    pendingApproval: byStatus.pending_approval,
    suspended: byStatus.suspended,
    rejected: byStatus.rejected,
    inactive: byStatus.inactive,
    byStatus,
  };
}

// ---------------------------------------------------------------------------
// Parking summary
// ---------------------------------------------------------------------------

export type ParkingSummary = {
  totalZones: number;
  totalCapacity: number;
  totalSlotsKnown: number; // sum of slots seen across zones (may be < capacity if some zones not yet inspected)
  occupied: number;
  available: number;
  reserved: number;
  maintenance: number;
  utilizationPercent: number; // occupied/knownSlots
  byStatus: Record<ParkingSlotStatus, number>;
};

export function selectParkingSummary(
  zones: readonly ParkingZoneRecord[],
  allSlots: readonly ParkingSlotRecord[],
): ParkingSummary {
  const byStatus = {
    available: 0,
    occupied: 0,
    reserved: 0,
    maintenance: 0,
  } satisfies Record<ParkingSlotStatus, number>;
  for (const s of allSlots) byStatus[s.slotStatus] = (byStatus[s.slotStatus] ?? 0) + 1;
  const totalCapacity = zones.reduce((sum, z) => sum + (z.capacity ?? 0), 0);
  const totalSlotsKnown = allSlots.length;
  const utilization =
    totalSlotsKnown > 0 ? Math.round((byStatus.occupied / totalSlotsKnown) * 100) : 0;
  return {
    totalZones: zones.length,
    totalCapacity,
    totalSlotsKnown,
    occupied: byStatus.occupied,
    available: byStatus.available,
    reserved: byStatus.reserved,
    maintenance: byStatus.maintenance,
    utilizationPercent: utilization,
    byStatus,
  };
}

// ---------------------------------------------------------------------------
// Maintenance summary
// ---------------------------------------------------------------------------

export type MaintenanceSummary = {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  verified: number;
  cancelled: number;
  byStatus: Record<WorkOrderStatus, number>;
};

const OPEN_WORK_ORDER_STATUSES = new Set<WorkOrderStatus>([
  "created",
  "assigned",
  "on_hold",
  "reworking",
]);

export function selectMaintenanceSummary(
  workOrders: readonly WorkOrderRecord[],
): MaintenanceSummary {
  const byStatus = {
    created: 0,
    assigned: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
    verified: 0,
    reworking: 0,
    cancelled: 0,
  } satisfies Record<WorkOrderStatus, number>;
  for (const w of workOrders) {
    byStatus[w.workOrderStatus] = (byStatus[w.workOrderStatus] ?? 0) + 1;
  }
  let open = 0;
  for (const w of workOrders) {
    if (OPEN_WORK_ORDER_STATUSES.has(w.workOrderStatus)) open += 1;
  }
  return {
    total: workOrders.length,
    open,
    inProgress: byStatus.in_progress,
    completed: byStatus.completed,
    verified: byStatus.verified,
    cancelled: byStatus.cancelled,
    byStatus,
  };
}
