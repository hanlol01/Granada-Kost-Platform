// Aggregates lightweight reads into the Dashboard StatCards.
// M11C used /billing/aging-summary which the backend does not implement at
// the documented path. M11D switches to two cheap calls on /invoices with
// status filter (the actual implemented controller route).

import { useQueries } from "@tanstack/react-query";
import type { SuccessEnvelope } from "@granada-kost/domain";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type DashboardSummary = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
  occupancyPercent: number;
  totalResidents: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  totalReceivable: number; // sum of outstanding amount in IDR minor units
};

type RoomRow = { id: string; roomStatus?: string };
type ResidentRow = { id: string; residentStatus?: string };
type InvoiceRow = { id: string; totalAmount?: number };

function sumAmount(rows: InvoiceRow[] | undefined): number {
  if (!rows) return 0;
  return rows.reduce((sum, r) => sum + (typeof r.totalAmount === "number" ? r.totalAmount : 0), 0);
}

export function useDashboardSummary() {
  const { currentPropertyId } = useProperty();
  const propertyParam = currentPropertyId ? { property_id: currentPropertyId } : undefined;
  const enabled = Boolean(currentPropertyId);

  const queries = useQueries({
    queries: [
      {
        queryKey: ["rooms", "summary", { propertyId: currentPropertyId }] as const,
        queryFn: () => apiClient.get<RoomRow[]>("/rooms", { query: propertyParam }),
        enabled,
      },
      {
        queryKey: ["residents", "summary", { propertyId: currentPropertyId }] as const,
        queryFn: () =>
          apiClient.get<ResidentRow[]>("/residents", {
            query: { ...propertyParam, status: "active" },
          }),
        enabled,
      },
      {
        queryKey:
          ["billing", "invoices", { propertyId: currentPropertyId }, { status: "unpaid" }] as const,
        queryFn: () =>
          apiClient.get<InvoiceRow[]>("/invoices", {
            query: { ...propertyParam, status: "unpaid", limit: 100 },
          }),
        enabled,
      },
      {
        queryKey:
          ["billing", "invoices", { propertyId: currentPropertyId }, { status: "overdue" }] as const,
        queryFn: () =>
          apiClient.get<InvoiceRow[]>("/invoices", {
            query: { ...propertyParam, status: "overdue", limit: 100 },
          }),
        enabled,
      },
    ],
  });

  const [roomsQ, residentsQ, unpaidQ, overdueQ] = queries;

  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;
  const refetch = () => {
    roomsQ.refetch();
    residentsQ.refetch();
    unpaidQ.refetch();
    overdueQ.refetch();
  };

  let summary: DashboardSummary | null = null;
  if (!isLoading && !error) {
    const rooms = (roomsQ.data as RoomRow[] | undefined) ?? [];
    const occupied = rooms.filter((r) => r.roomStatus === "occupied").length;
    const vacant = rooms.filter((r) => r.roomStatus === "vacant").length;
    const maintenance = rooms.filter(
      (r) => r.roomStatus === "maintenance" || r.roomStatus === "reserved",
    ).length;
    const total = rooms.length;
    const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const totalResidents = (residentsQ.data as ResidentRow[] | undefined)?.length ?? 0;

    const unpaid = (unpaidQ.data as InvoiceRow[] | undefined) ?? [];
    const overdue = (overdueQ.data as InvoiceRow[] | undefined) ?? [];
    const totalReceivable = sumAmount(unpaid) + sumAmount(overdue);

    summary = {
      totalRooms: total,
      occupiedRooms: occupied,
      vacantRooms: vacant,
      maintenanceRooms: maintenance,
      occupancyPercent,
      totalResidents,
      unpaidInvoices: unpaid.length,
      overdueInvoices: overdue.length,
      totalReceivable,
    };
  }

  return {
    summary,
    isLoading,
    error,
    refetch,
  } as const;
}

export type { SuccessEnvelope };
