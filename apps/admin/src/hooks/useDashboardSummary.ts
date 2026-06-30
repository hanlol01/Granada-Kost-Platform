// Dashboard summary on top of useReports / shared selectors.
//
// Phase 1 backend does not expose /admin/dashboard/summary nor
// /billing/aging-summary, so the Admin app derives Dashboard KPIs from the
// same selectors that power Reports (M11G). Both surfaces MUST show the
// same numbers for the same property because they consume the same source.
//
// The hook keeps its public shape so existing Dashboard markup does not
// require a redesign.

import { useReports } from "./useReports";

export type DashboardSummary = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
  occupancyPercent: number;
  totalResidents: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  totalReceivable: number; // outstanding amount (IDR minor units)
};

export function useDashboardSummary() {
  const { data, isLoading, error, refetch } = useReports();

  const summary: DashboardSummary | null = data
    ? {
        totalRooms: data.occupancy.totalRooms,
        occupiedRooms: data.occupancy.occupied,
        vacantRooms: data.occupancy.vacant,
        maintenanceRooms: data.occupancy.maintenance + data.occupancy.reserved,
        occupancyPercent: data.occupancy.occupancyPercent,
        totalResidents: data.residents.active,
        unpaidInvoices: data.billingAging.unpaid,
        overdueInvoices: data.billingAging.overdue,
        totalReceivable: data.billingAging.outstandingAmount,
      }
    : null;

  return {
    summary,
    isLoading,
    error,
    refetch,
  } as const;
}
