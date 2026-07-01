// Operational reports aggregator for the Admin app.
//
// Phase 1 backend does not expose dedicated /reports/* endpoints, so this hook
// composes property-scoped list calls and runs them through the shared report
// selectors. Reports and Dashboard share the SAME selectors so any number
// shown in both places is guaranteed to be identical (M11G principle).
//
// Each underlying query is property-scoped per ADR-FE-005, registered under a
// key that contains propertyId so cache bleed cannot happen on property switch.

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";
import type { RoomRecord } from "@/hooks/useRooms";
import type { ResidentRecord } from "@/hooks/useResidents";
import type { InvoiceRecord, PaymentRecord } from "@/hooks/useBilling";
import type { ComplaintRecord } from "@/hooks/useComplaints";
import type { VehicleRecord } from "@/hooks/useVehicles";
import type { ParkingZoneRecord, ParkingSlotRecord } from "@/hooks/useParking";
import type { WorkOrderRecord } from "@/hooks/useWorkOrders";
import {
  selectBillingAgingSummary,
  selectComplaintSummary,
  selectMaintenanceSummary,
  selectOccupancySummary,
  selectParkingSummary,
  selectResidentSummary,
  selectRevenueSummary,
  selectVehicleSummary,
  type BillingAgingSummary,
  type ComplaintSummary,
  type MaintenanceSummary,
  type OccupancySummary,
  type ParkingSummary,
  type ResidentSummary,
  type RevenueSummary,
  type VehicleSummary,
} from "@/lib/reports-selectors";

const REPORTS_PAGE_LIMIT = 100;

export type ReportsFilters = {
  // Year is used to slice the Revenue / Payments report. Default: current year.
  year?: number;
};

export type ReportsData = {
  occupancy: OccupancySummary;
  residents: ResidentSummary;
  billingAging: BillingAgingSummary;
  revenue: RevenueSummary;
  complaints: ComplaintSummary;
  vehicles: VehicleSummary;
  parking: ParkingSummary;
  maintenance: MaintenanceSummary;
};

export type UseReportsResult = {
  data: ReportsData | null;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
  // Sub-resource ready signal so the UI can short-circuit charts whose
  // backing query is still loading even if cousins are ready.
  ready: {
    occupancy: boolean;
    residents: boolean;
    billing: boolean;
    payments: boolean;
    complaints: boolean;
    vehicles: boolean;
    parking: boolean;
    maintenance: boolean;
  };
};

export function useReports(filters: ReportsFilters = {}): UseReportsResult {
  const { currentPropertyId } = useProperty();
  const propertyParam = currentPropertyId ? { property_id: currentPropertyId } : undefined;
  const year = filters.year ?? new Date().getFullYear();
  const enabled = Boolean(currentPropertyId);

  const queries = useQueries({
    queries: [
      {
        queryKey: ["rooms", "list", { propertyId: currentPropertyId }, {}] as const,
        queryFn: () => apiClient.get<RoomRecord[]>("/rooms", { query: propertyParam }),
        enabled,
      },
      {
        queryKey: ["residents", "list", { propertyId: currentPropertyId }, {}] as const,
        queryFn: () => apiClient.get<ResidentRecord[]>("/residents", { query: propertyParam }),
        enabled,
      },
      {
        queryKey: [
          "billing",
          "invoices",
          { propertyId: currentPropertyId },
          { limit: REPORTS_PAGE_LIMIT },
        ] as const,
        queryFn: () =>
          apiClient.get<InvoiceRecord[]>("/invoices", {
            query: { ...propertyParam, limit: REPORTS_PAGE_LIMIT },
          }),
        enabled,
      },
      {
        queryKey: [
          "billing",
          "payments",
          { propertyId: currentPropertyId },
          { limit: REPORTS_PAGE_LIMIT },
        ] as const,
        queryFn: () =>
          apiClient.get<PaymentRecord[]>("/payments", {
            query: { ...propertyParam, limit: REPORTS_PAGE_LIMIT },
          }),
        enabled,
      },
      {
        queryKey: [
          "complaints",
          "list",
          { propertyId: currentPropertyId },
          { limit: REPORTS_PAGE_LIMIT },
        ] as const,
        queryFn: () =>
          apiClient.get<ComplaintRecord[]>("/complaints", {
            query: { ...propertyParam, limit: REPORTS_PAGE_LIMIT },
          }),
        enabled,
      },
      {
        queryKey: [
          "vehicles",
          "list",
          { propertyId: currentPropertyId },
          { limit: REPORTS_PAGE_LIMIT },
        ] as const,
        queryFn: () =>
          apiClient.get<VehicleRecord[]>("/vehicles", {
            query: { ...propertyParam, limit: REPORTS_PAGE_LIMIT },
          }),
        enabled,
      },
      {
        queryKey: [
          "parking",
          "zones",
          { propertyId: currentPropertyId },
          { activeOnly: true },
        ] as const,
        queryFn: () =>
          apiClient.get<ParkingZoneRecord[]>("/parking/zones", {
            query: { ...propertyParam, active_only: true },
          }),
        enabled,
      },
      {
        queryKey: [
          "work-orders",
          "list",
          { propertyId: currentPropertyId },
          { limit: REPORTS_PAGE_LIMIT },
        ] as const,
        queryFn: () =>
          apiClient.get<WorkOrderRecord[]>("/work-orders", {
            query: { ...propertyParam, limit: REPORTS_PAGE_LIMIT },
          }),
        enabled,
      },
    ],
  });

  const [roomsQ, residentsQ, invoicesQ, paymentsQ, complaintsQ, vehiclesQ, zonesQ, workOrdersQ] =
    queries;

  // Parking slots require zone_id. Fan out one query per zone using useQueries.
  const zones = useMemo(() => (zonesQ.data ?? []) as ParkingZoneRecord[], [zonesQ.data]);
  const slotsQueries = useQueries({
    queries: zones.map((zone) => ({
      queryKey: [
        "parking",
        "slots",
        { propertyId: currentPropertyId },
        { zoneId: zone.id },
      ] as const,
      queryFn: () =>
        apiClient.get<ParkingSlotRecord[]>("/parking/slots", {
          query: { zone_id: zone.id },
        }),
      enabled: enabled && Boolean(zone.id),
    })),
  });

  const allSlots: ParkingSlotRecord[] = slotsQueries
    .flatMap((q) => (Array.isArray(q.data) ? (q.data as ParkingSlotRecord[]) : []))
    .filter((s): s is ParkingSlotRecord => Boolean(s));

  const ready = {
    occupancy: !roomsQ.isLoading && !roomsQ.error,
    residents: !residentsQ.isLoading && !residentsQ.error,
    billing: !invoicesQ.isLoading && !invoicesQ.error,
    payments: !paymentsQ.isLoading && !paymentsQ.error,
    complaints: !complaintsQ.isLoading && !complaintsQ.error,
    vehicles: !vehiclesQ.isLoading && !vehiclesQ.error,
    parking:
      !zonesQ.isLoading && !zonesQ.error && slotsQueries.every((q) => !q.isLoading && !q.error),
    maintenance: !workOrdersQ.isLoading && !workOrdersQ.error,
  } as const;

  const isLoading = queries.some((q) => q.isLoading) || slotsQueries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching) || slotsQueries.some((q) => q.isFetching);
  // Surface the first error so the page can render a single ErrorState with
  // its correlation id (ADR-FE-008). Individual sub-resource readiness is
  // still exposed via `ready` so partial errors degrade gracefully.
  const error = [...queries, ...slotsQueries].find((q) => q.error)?.error ?? null;

  const refetch = () => {
    queries.forEach((q) => void q.refetch());
    slotsQueries.forEach((q) => void q.refetch());
  };

  const data = useMemo<ReportsData | null>(() => {
    if (!enabled) return null;
    // Allow partial data when at least the room list is ready; selectors handle
    // empty inputs gracefully.
    const rooms = (roomsQ.data ?? []) as RoomRecord[];
    const residents = (residentsQ.data ?? []) as ResidentRecord[];
    const invoices = (invoicesQ.data ?? []) as InvoiceRecord[];
    const payments = (paymentsQ.data ?? []) as PaymentRecord[];
    const complaints = (complaintsQ.data ?? []) as ComplaintRecord[];
    const vehicles = (vehiclesQ.data ?? []) as VehicleRecord[];
    const workOrders = (workOrdersQ.data ?? []) as WorkOrderRecord[];

    return {
      occupancy: selectOccupancySummary(rooms),
      residents: selectResidentSummary(residents),
      billingAging: selectBillingAgingSummary(invoices),
      revenue: selectRevenueSummary(payments, year),
      complaints: selectComplaintSummary(complaints),
      vehicles: selectVehicleSummary(vehicles),
      parking: selectParkingSummary(zones, allSlots),
      maintenance: selectMaintenanceSummary(workOrders),
    };
  }, [
    enabled,
    year,
    roomsQ.data,
    residentsQ.data,
    invoicesQ.data,
    paymentsQ.data,
    complaintsQ.data,
    vehiclesQ.data,
    zones,
    allSlots,
    workOrdersQ.data,
  ]);

  return { data, isLoading, isFetching, error, refetch, ready };
}
