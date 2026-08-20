import { adminUxV2Requester, type AdminUxV2Requester } from "@/lib/admin-ux-api";
import type { BillingWorklist } from "@/lib/admin-w06-billing";

export type ReminderMilestone = "h60" | "h30" | "h14";
export type ReminderWorkspaceLease = {
  lease_id: string;
  resident_id: string;
  resident_name: string;
  room_number: string;
  snapshot_kost_type_name: string;
  lease_end_date: string;
  days_remaining: number;
  outstanding_amount: number;
  renewal_state: string | null;
  checkout_state: string | null;
  milestone: ReminderMilestone;
  status: "action_required";
};

export type ReminderWorkspace = {
  data: {
    as_of_date: string;
    groups: Record<ReminderMilestone, ReminderWorkspaceLease[]>;
    current_month_bills: BillingWorklist;
    badge_count: number;
  };
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} tidak valid.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} tidak valid.`);
  return value;
}
function integer(value: unknown, label: string): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) throw new Error(`${label} tidak valid.`);
  return parsed;
}
function lease(value: unknown, milestone: ReminderMilestone): ReminderWorkspaceLease {
  const item = record(value, "item workspace");
  return {
    lease_id: text(item.lease_id, "ID sewa"),
    resident_id: text(item.resident_id, "ID penghuni"),
    resident_name: text(item.resident_name, "Nama penghuni"),
    room_number: text(item.room_number, "Nomor kamar"),
    snapshot_kost_type_name: text(item.snapshot_kost_type_name, "Tipe kost"),
    lease_end_date: text(item.lease_end_date, "Tanggal selesai"),
    days_remaining: integer(item.days_remaining, "Sisa hari"),
    outstanding_amount: integer(item.outstanding_amount, "Tagihan tersisa"),
    renewal_state:
      item.renewal_state === null ? null : text(item.renewal_state, "Status perpanjangan"),
    checkout_state:
      item.checkout_state === null ? null : text(item.checkout_state, "Status checkout"),
    milestone,
    status: "action_required",
  };
}

export function parseReminderWorkspace(value: unknown): ReminderWorkspace {
  const root = record(value, "workspace pengingat");
  const data = record(root.data, "data workspace pengingat");
  const rawGroups = record(data.groups, "kelompok pengingat");
  const groups = {
    h60: Array.isArray(rawGroups.h60) ? rawGroups.h60.map((item) => lease(item, "h60")) : [],
    h30: Array.isArray(rawGroups.h30) ? rawGroups.h30.map((item) => lease(item, "h30")) : [],
    h14: Array.isArray(rawGroups.h14) ? rawGroups.h14.map((item) => lease(item, "h14")) : [],
  };
  const bills = record(data.current_month_bills, "tagihan bulan berjalan");
  if (!Array.isArray(bills.data)) throw new Error("Daftar tagihan pengingat tidak valid.");
  record(bills.meta, "paginasi tagihan pengingat");
  return {
    data: {
      as_of_date: text(data.as_of_date, "Tanggal acuan"),
      groups,
      current_month_bills: data.current_month_bills as BillingWorklist,
      badge_count: integer(data.badge_count, "Jumlah badge pengingat"),
    },
  };
}

export async function getReminderWorkspace(
  propertyId: string,
  signal?: AbortSignal,
  requester: AdminUxV2Requester = adminUxV2Requester,
): Promise<ReminderWorkspace> {
  return parseReminderWorkspace(
    await requester.get<unknown>("/admin/reminders/workspace", {
      query: { property_id: propertyId },
      signal,
    }),
  );
}
