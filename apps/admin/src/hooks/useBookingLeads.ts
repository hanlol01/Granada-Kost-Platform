// Booking lead admin read hook (M17C). Backend (M17B, booking-lead.controller.ts):
//   GET /booking-leads - JWT + RBAC (roles manager|admin, permission room.read),
//   property-scoped with optional property_id filter.
// A booking lead is booking INTEREST only (M17A freeze): it is NOT a confirmed
// booking and never reserves a room or creates invoice/occupancy/resident data.
// Frontend filters are UX-only; the backend remains the policy authority.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  requestAdminBookingLeadPage,
  type BookingLeadCategory,
  type BookingLeadGender,
  type BookingLeadListFilters,
  type BookingLeadRecord,
  type BookingLeadPage,
  type BookingLeadStatus,
} from "@/lib/admin-booking-lead";
import { useProperty } from "@/lib/property";

export type {
  BookingLeadCategory,
  BookingLeadGender,
  BookingLeadRecord,
  BookingLeadStatus,
} from "@/lib/admin-booking-lead";

export const BOOKING_LEAD_STATUS_LABEL: Record<BookingLeadStatus, string> = {
  new: "Baru",
  contacted: "Sudah Dihubungi",
  visit_scheduled: "Status lama — tindak lanjut",
  negotiating: "Dalam Negosiasi",
  awaiting_dp: "Menunggu DP",
  onboarding: "Dalam Onboarding",
  leased: "Sewa Aktif",
  converted: "Status lama — selesai",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

export const BOOKING_LEAD_CATEGORY_LABEL: Record<BookingLeadCategory, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

export const BOOKING_LEAD_GENDER_LABEL: Record<BookingLeadGender, string> = {
  male: "Putra",
  female: "Putri",
};

export const BOOKING_LEAD_SOURCE_LABEL: Record<string, string> = {
  public_kamar: "Publik /kamar",
  admin_quick_entry: "Input cepat Admin",
};

// Mirrors the M17B backend transition rules (UX-only convenience; the backend
// enforces the state machine and rejects invalid transitions):
//   new -> contacted | rejected | expired
//   contacted -> rejected | expired
//   legacy visit_scheduled / converted and rejected / expired are read-only.
export function allowedBookingLeadTransitions(status: BookingLeadStatus): BookingLeadStatus[] {
  switch (status) {
    case "new":
      return ["contacted", "rejected", "expired"];
    case "contacted":
      return ["rejected", "expired"];
    default:
      return [];
  }
}

export type UseBookingLeadsFilters = BookingLeadListFilters;

export function useBookingLeads(
  filters: UseBookingLeadsFilters = {},
): UseQueryResult<BookingLeadPage> {
  const { currentPropertyId } = useProperty();
  return useQuery<BookingLeadPage>({
    queryKey: ["booking-leads", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return requestAdminBookingLeadPage(
        (path, options) => adminUxV2Requester.get<unknown>(path, options),
        currentPropertyId,
        filters,
      );
    },
    enabled: Boolean(currentPropertyId),
  });
}
