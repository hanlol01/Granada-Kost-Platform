import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { adminUxQueryKeys } from "@/lib/admin-ux-query-keys";
import {
  parseResidentDetail,
  parseResidentPage,
  parseResidentTenancy,
  type ResidentAccountStatus,
  type ResidentDetail,
  type ResidentPage,
  type ResidentStatus,
  type ResidentTenancy,
} from "@/lib/admin-resident";
import { useProperty } from "@/lib/property";

export type { ResidentDetail, ResidentListRecord, ResidentStatus } from "@/lib/admin-resident";
export type ResidentRecord = ResidentDetail;

export type UseResidentsFilters = {
  status?: ResidentStatus;
  accountStatus?: ResidentAccountStatus;
  gender?: "male" | "female" | "other";
  tenancyStatus?: "awaiting_activation" | "active" | "none";
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
            account_status: filters.accountStatus,
            gender: filters.gender,
            tenancy_status: filters.tenancyStatus,
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
