// Aggregates lightweight reads into the Dashboard StatCards.
// Phase 1 backend does not expose /api/v1/admin/dashboard/summary yet; M11C composes
// values from existing endpoints. Each call is property-scoped (ADR-FE-005) and shares
// the standard query-client defaults (ADR-FE-002).

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

type ListMeta = { total?: number };
type RoomRow = { id?: string; status?: string };
// Use unknown[] for items since we only read counts/status; this avoids coupling to
// resource DTOs that other M11 milestones will introduce.
type RoomsResponse = { data?: RoomRow[]; items?: RoomRow[]; meta?: ListMeta };
type ResidentsResponse = { meta?: ListMeta; data?: unknown[]; items?: unknown[] };
type AgingBucket = { count?: number; amount?: number; total?: number };
type AgingSummary = {
  unpaid?: AgingBucket | number;
  overdue?: AgingBucket | number;
  totals?: { count?: number; amount?: number };
  outstanding_amount?: number;
  buckets?: Record<string, AgingBucket>;
};

function asArray<T>(payload: { data?: T[]; items?: T[] } | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray((payload as { data?: T[] }).data)) return (payload as { data?: T[] }).data!;
  if (Array.isArray((payload as { items?: T[] }).items)) return (payload as { items?: T[] }).items!;
  return [];
}

function listTotal(
  payload: { meta?: ListMeta; data?: unknown[]; items?: unknown[] } | undefined,
): number {
  if (!payload) return 0;
  const metaTotal = payload.meta?.total;
  if (typeof metaTotal === "number") return metaTotal;
  return asArray<unknown>(payload).length;
}

function agingCount(bucket: AgingBucket | number | undefined): number {
  if (typeof bucket === "number") return bucket;
  if (!bucket) return 0;
  if (typeof bucket.count === "number") return bucket.count;
  if (typeof bucket.total === "number") return bucket.total;
  return 0;
}

function agingAmount(bucket: AgingBucket | number | undefined): number {
  if (typeof bucket === "number") return 0;
  if (!bucket) return 0;
  return bucket.amount ?? 0;
}

export function useDashboardSummary() {
  const { currentPropertyId } = useProperty();
  const propertyParam = currentPropertyId ? { property_id: currentPropertyId } : undefined;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["rooms", "summary", { propertyId: currentPropertyId }] as const,
        queryFn: () =>
          apiClient.get<RoomsResponse>("/rooms", {
            query: { ...propertyParam, per_page: 200 },
          }),
      },
      {
        queryKey: ["residents", "summary", { propertyId: currentPropertyId }] as const,
        queryFn: () =>
          apiClient.get<ResidentsResponse>("/residents", {
            query: { ...propertyParam, per_page: 1, status: "active" },
          }),
      },
      {
        queryKey: ["billing", "aging-summary", { propertyId: currentPropertyId }] as const,
        queryFn: () =>
          apiClient.get<AgingSummary>("/billing/aging-summary", { query: propertyParam }),
      },
    ],
  });

  const [roomsQ, residentsQ, agingQ] = queries;

  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;
  const refetch = () => {
    roomsQ.refetch();
    residentsQ.refetch();
    agingQ.refetch();
  };

  let summary: DashboardSummary | null = null;
  if (!isLoading && !error) {
    const roomRows = asArray<RoomRow>(
      roomsQ.data as unknown as { data?: RoomRow[]; items?: RoomRow[] },
    );
    const occupied = roomRows.filter((r) => r.status === "occupied").length;
    const vacant = roomRows.filter((r) => r.status === "vacant").length;
    const maintenance = roomRows.filter(
      (r) => r.status === "maintenance" || r.status === "reserved",
    ).length;
    const total = (roomsQ.data as RoomsResponse | undefined)?.meta?.total ?? roomRows.length;
    const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const totalResidents = listTotal(residentsQ.data as ResidentsResponse | undefined);

    const aging = (agingQ.data as AgingSummary | undefined) ?? {};
    const unpaidCount = agingCount(aging.unpaid);
    const overdueCount = agingCount(aging.overdue);
    const totalReceivable =
      aging.outstanding_amount ??
      aging.totals?.amount ??
      agingAmount(aging.unpaid) + agingAmount(aging.overdue);

    summary = {
      totalRooms: total,
      occupiedRooms: occupied,
      vacantRooms: vacant,
      maintenanceRooms: maintenance,
      occupancyPercent,
      totalResidents,
      unpaidInvoices: unpaidCount,
      overdueInvoices: overdueCount,
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

// Re-export for tests that need to assert envelope handling.
export type { SuccessEnvelope };
