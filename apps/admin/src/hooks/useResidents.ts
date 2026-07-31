import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  parseResidentDetail,
  parseResidentPage,
  type ResidentDetail,
  type ResidentPage,
  type ResidentStatus,
} from "@/lib/admin-resident";
import { useProperty } from "@/lib/property";

export type { ResidentDetail, ResidentListRecord, ResidentStatus } from "@/lib/admin-resident";
export type ResidentRecord = ResidentDetail;

export type UseResidentsFilters = {
  status?: ResidentStatus;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useResidents(filters: UseResidentsFilters = {}): UseQueryResult<ResidentPage> {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentPage>({
    queryKey: ["residents", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: async ({ signal }) => {
      if (!currentPropertyId) throw new Error("Property scope belum aktif.");
      return parseResidentPage(
        await adminUxV2Requester.get("/residents", {
          query: {
            property_id: currentPropertyId,
            status: filters.status,
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
    queryKey: ["residents", "detail", { propertyId: currentPropertyId, residentId }] as const,
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
