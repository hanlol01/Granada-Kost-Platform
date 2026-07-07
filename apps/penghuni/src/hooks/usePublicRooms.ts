// Public room listing hooks (M16E).
//
// Anonymous, read-only access to the M16D public availability API.
// The API returns ONLY safe aggregated fields: no room IDs, no room_code,
// no exact room numbers, no tenant/resident/occupancy data. This hook must
// never be extended to request or render such data.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export type PublicGender = "putra" | "putri";
export type PublicCategory = "rukost" | "apartkost";

export type PublicRoomGroup = {
  groupKey: string;
  category: PublicCategory;
  categoryLabel: string;
  gender: "male" | "female";
  genderLabel: string;
  buildingCode: string;
  buildingName: string;
  floorCode: string;
  floorLabel: string;
  availableCount: number;
  priceFromMonthly: number | null;
  priceFromYearly: number | null;
  publicTitle: string;
  ctaLabel: string;
};

export type PublicRoomSummary = {
  totalAvailable: number;
  categories: { category: PublicCategory; categoryLabel: string; availableCount: number }[];
  genders: { gender: "male" | "female"; genderLabel: string; availableCount: number }[];
  categoryGenders: unknown[];
};

export type PublicAvailabilityParams = {
  gender?: PublicGender;
  category?: PublicCategory;
  buildingCode?: string;
  floorCode?: "A" | "B";
};

export function getPublicRoomSummary(): Promise<PublicRoomSummary> {
  return apiClient.get<PublicRoomSummary>("/public/rooms/summary", { anonymous: true });
}

export function getPublicRoomAvailability(
  params: PublicAvailabilityParams = {},
): Promise<PublicRoomGroup[]> {
  // Note: ApiClient unwraps the top-level `data` envelope, so the sibling
  // `summary` object of this endpoint is not consumed here. The dedicated
  // /public/rooms/summary endpoint is used for totals instead.
  return apiClient.get<PublicRoomGroup[]>("/public/rooms/availability", {
    anonymous: true,
    query: {
      gender: params.gender,
      category: params.category,
      buildingCode: params.buildingCode,
      floorCode: params.floorCode,
    },
  });
}

// Availability is aggregated and admin-confirmed via WhatsApp; a short cache
// keeps the public page snappy without pretending counts are realtime.
const STALE_TIME_MS = 60_000;

export function usePublicRoomSummary(): UseQueryResult<PublicRoomSummary> {
  return useQuery<PublicRoomSummary>({
    queryKey: ["public-rooms", "summary"],
    queryFn: getPublicRoomSummary,
    staleTime: STALE_TIME_MS,
  });
}

export function usePublicRoomAvailability(
  params: PublicAvailabilityParams,
): UseQueryResult<PublicRoomGroup[]> {
  return useQuery<PublicRoomGroup[]>({
    queryKey: [
      "public-rooms",
      "availability",
      params.gender ?? "all",
      params.category ?? "all",
      params.buildingCode ?? "all",
      params.floorCode ?? "all",
    ],
    queryFn: () => getPublicRoomAvailability(params),
    staleTime: STALE_TIME_MS,
  });
}
