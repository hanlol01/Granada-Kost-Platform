// Residents domain hook. Backend: GET /api/v1/residents (resident.controller.ts).
// Returns ResidentRecord[]. Search is server-side via ?q=.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type ResidentStatus = "active" | "inactive";
export type ResidentGender = "male" | "female" | "other";

export type ResidentRecord = {
  id: string;
  propertyId: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  ktpNumber: string | null;
  gender: ResidentGender | null;
  residentStatus: ResidentStatus;
  emergencyContacts: { id: string; contactName: string; phone: string }[];
  createdAt: string;
  updatedAt: string;
};

export type UseResidentsFilters = {
  status?: ResidentStatus;
  q?: string;
};

export function useResidents(filters: UseResidentsFilters = {}): UseQueryResult<ResidentRecord[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<ResidentRecord[]>({
    queryKey: ["residents", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<ResidentRecord[]>("/residents", {
        query: {
          property_id: currentPropertyId ?? undefined,
          status: filters.status,
          q: filters.q || undefined,
        },
      }),
    enabled: Boolean(currentPropertyId),
  });
}
