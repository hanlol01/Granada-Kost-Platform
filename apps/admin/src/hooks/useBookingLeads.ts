// Booking lead admin read hook (M17C). Backend (M17B, booking-lead.controller.ts):
//   GET /booking-leads - JWT + RBAC (roles manager|admin, permission room.read),
//   property-scoped with optional property_id filter.
// A booking lead is booking INTEREST only (M17A freeze): it is NOT a confirmed
// booking and never reserves a room or creates invoice/occupancy/resident data.
// Frontend filters are UX-only; the backend remains the policy authority.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type BookingLeadStatus =
  | "new"
  | "contacted"
  | "visit_scheduled"
  | "converted"
  | "rejected"
  | "expired";
export type BookingLeadCategory = "rukost" | "apartkost";
export type BookingLeadGender = "male" | "female";

export type BookingLeadRecord = {
  id: string;
  propertyId: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode: string | null;
  floorCode: string | null;
  publicGroupKey: string | null;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string | null;
  preferredMoveInDate: string | null;
  status: BookingLeadStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export const BOOKING_LEAD_STATUS_LABEL: Record<BookingLeadStatus, string> = {
  new: "Baru",
  contacted: "Sudah Dihubungi",
  visit_scheduled: "Jadwal Survey",
  converted: "Dikonversi",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
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
};

// Mirrors the M17B backend transition rules (UX-only convenience; the backend
// enforces the state machine and rejects invalid transitions):
//   new -> contacted | rejected | expired
//   contacted -> visit_scheduled | rejected | expired
//   visit_scheduled -> converted | rejected | expired
//   converted / rejected / expired are terminal in MVP.
export function allowedBookingLeadTransitions(status: BookingLeadStatus): BookingLeadStatus[] {
  switch (status) {
    case "new":
      return ["contacted", "rejected", "expired"];
    case "contacted":
      return ["visit_scheduled", "rejected", "expired"];
    case "visit_scheduled":
      return ["converted", "rejected", "expired"];
    default:
      return [];
  }
}

export type UseBookingLeadsFilters = {
  status?: BookingLeadStatus;
  category?: BookingLeadCategory;
  gender?: BookingLeadGender;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export function useBookingLeads(
  filters: UseBookingLeadsFilters = {},
): UseQueryResult<BookingLeadRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<BookingLeadRecord[]>({
    queryKey: ["booking-leads", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<BookingLeadRecord[]>("/booking-leads", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          category: filters.category,
          gender: filters.gender,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          search: filters.search,
          limit: filters.limit ?? 100,
          offset: filters.offset,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
