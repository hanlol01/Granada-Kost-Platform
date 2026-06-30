// Phase 1 enums. Frontend must not invent new values; backend is the source of truth.

export const ROLE_CODES = [
  "owner",
  "manager",
  "admin",
  "technician",
  "resident",
  "property_owner",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROOM_STATUSES = ["vacant", "occupied", "maintenance", "reserved"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "paid",
  "partial",
  "void",
  "overdue",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ["paid", "unpaid", "overdue", "partial"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const COMPLAINT_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const DEVICE_STATUSES = ["online", "offline", "low_battery", "unknown"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "billing",
  "complaint",
  "announcement",
  "smart_lock",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
