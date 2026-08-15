import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import {
  parseResidentDetail,
  parseResidentPage,
  parseResidentTenancy,
  type ResidentDetail,
  type ResidentPage,
  type ContractSettlementStage,
  type RentPaymentStatus,
  type ResidentStatus,
  type ResidentTenancy,
} from "@/lib/admin-resident";
import { useProperty } from "@/lib/property";

export type {
  ResidentDetail,
  ResidentListRecord,
  RentPaymentStatus,
  ContractSettlementStage,
  ResidentStatus,
} from "@/lib/admin-resident";
export type ResidentRecord = ResidentDetail;

export type UseResidentsFilters = {
  status?: ResidentStatus;
  rentPaymentStatus?: Exclude<RentPaymentStatus, "none">;
  gender?: "male" | "female" | "other";
  tenancyStatus?: "awaiting_activation" | "active" | "none";
  settlementStage?: Exclude<ContractSettlementStage, "none">;
  settlementDueWithinDays?: number;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useResidents(filters: UseResidentsFilters = {}): UseQueryResult<ResidentPage> {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentPage>({
    queryKey: adminUxQueryKeys.residents.list(currentPropertyId ?? "none", filters),
    queryFn: async ({ signal }) => {
      if (!currentPropertyId) throw new Error("Property scope belum aktif.");
      return parseResidentPage(
        await adminUxV2Requester.get("/residents", {
          query: {
            property_id: currentPropertyId,
            status: filters.status,
            rent_payment_status: filters.rentPaymentStatus,
            gender: filters.gender,
            tenancy_status: filters.tenancyStatus,
            contract_settlement_stage: filters.settlementStage,
            settlement_due_within_days: filters.settlementDueWithinDays,
            created_from: filters.createdFrom,
            created_to: filters.createdTo,
            q: filters.q?.trim() || undefined,
            limit: filters.limit ?? 20,
            offset: filters.offset ?? 0,
          },
          signal,
        }),
        currentPropertyId,
      );
    },
    enabled: Boolean(currentPropertyId),
  });
}

export function useResidentDetail(residentId: string | null): UseQueryResult<ResidentDetail> {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentDetail>({
    queryKey: adminUxQueryKeys.residents.detail(currentPropertyId ?? "none", residentId ?? "none"),
    queryFn: async ({ signal }) => {
      if (!currentPropertyId || !residentId) throw new Error("Property scope belum aktif.");
      return parseResidentDetail(
        await adminUxV2Requester.get(`/residents/${encodeURIComponent(residentId)}`, {
          signal,
        }),
        currentPropertyId,
      );
    },
    enabled: Boolean(currentPropertyId && residentId),
  });
}

export function useResidentTenancy(
  residentId: string | null,
): UseQueryResult<ResidentTenancy | null> {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentTenancy | null>({
    queryKey: adminUxQueryKeys.residents.tenancy(currentPropertyId ?? "none", residentId ?? "none"),
    queryFn: async ({ signal }) => {
      if (!currentPropertyId || !residentId) throw new Error("Property scope belum aktif.");
      return parseResidentTenancy(
        await adminUxV2Requester.get(`/residents/${encodeURIComponent(residentId)}/tenancy`, {
          query: { property_id: currentPropertyId },
          signal,
        }),
        currentPropertyId,
        residentId,
      );
    },
    enabled: Boolean(currentPropertyId && residentId),
  });
}
