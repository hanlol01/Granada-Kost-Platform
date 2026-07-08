// Public hunian catalog hooks (M18C).
//
// Anonymous, read-only access to the M18B public hunian catalog API:
//   GET /api/v1/public/hunian-catalog (list + gender/category filters)
//
// The API returns ONLY public-safe hunian/unit/group offerings (M18A frozen
// allowlist): no room IDs, no room_code, no exact room numbers, no tenant/
// resident/occupancy data, no payment/invoice data, no Smart Lock data.
// This module must never be extended to request or render such data.
//
// `anonymous: true` makes the shared ApiClient skip the Authorization header
// AND the 401 single-flight refresh, so the public /kamar page can never
// trigger a login/refresh-token loop.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { PublicCategory, PublicGender, PublicRoomGroup } from "@/hooks/usePublicRooms";

// API-level gender values (M18B contract). The /kamar URL keeps the M16E
// `putra`/`putri` params for shareable-link backward compatibility and maps
// them to the API values at this query layer.
export type PublicHunianGender = "male" | "female";

// Prefill context for the existing M17 lead form. Maps 1:1 onto the
// `POST /api/v1/public/booking-leads` payload context (M18A rule) — no new
// lead fields are introduced by M18.
export type PublicHunianBookingLeadDefaults = {
  category: PublicCategory;
  gender: PublicHunianGender;
  buildingCode?: string | null;
  floorCode?: string | null;
  publicGroupKey?: string | null;
};

// M18B list item (allowlisted public-safe fields only).
export type PublicHunianCatalogItem = {
  slug: string;
  title: string;
  category: PublicCategory;
  categoryLabel: string;
  gender: PublicHunianGender;
  genderLabel: string;
  buildingCode: string | null;
  buildingName: string | null;
  floorCode: string | null;
  floorLabel: string | null;
  publicGroupKey: string;
  shortDescription: string;
  priceFromMonthly: number | null;
  priceFromYearly: number | null;
  availabilityCount: number;
  facilitiesPreview: string[];
  galleryPreview: string[] | null;
  ctaLabel: string;
  bookingLeadDefaults: PublicHunianBookingLeadDefaults;
  disclaimers: string[];
};

export type PublicHunianCatalogParams = {
  // UI-level values from the /kamar URL search params.
  gender?: PublicGender;
  category?: PublicCategory;
};

const GENDER_API_MAP: Record<PublicGender, PublicHunianGender> = {
  putra: "male",
  putri: "female",
};

export function getPublicHunianCatalog(
  params: PublicHunianCatalogParams = {},
): Promise<PublicHunianCatalogItem[]> {
  // Note: the ApiClient unwraps the top-level `data` envelope, so the sibling
  // `summary` object of this endpoint is not consumed here. The existing
  // /public/rooms/summary endpoint (M16D) remains the source for hero totals.
  return apiClient.get<PublicHunianCatalogItem[]>("/public/hunian-catalog", {
    anonymous: true,
    query: {
      gender: params.gender ? GENDER_API_MAP[params.gender] : undefined,
      category: params.category,
    },
  });
}

// Availability is aggregated and admin-confirmed via WhatsApp; a short cache
// keeps the public page snappy without pretending counts are realtime.
const STALE_TIME_MS = 60_000;

export function usePublicHunianCatalog(
  params: PublicHunianCatalogParams,
): UseQueryResult<PublicHunianCatalogItem[]> {
  return useQuery<PublicHunianCatalogItem[]>({
    queryKey: ["public-hunian-catalog", "list", params.gender ?? "all", params.category ?? "all"],
    queryFn: () => getPublicHunianCatalog(params),
    staleTime: STALE_TIME_MS,
  });
}

// Adapter: catalog item -> frozen M16E `PublicRoomGroup` shape, so the M17D
// `PublicBookingLeadDialog` and the frozen M16E WhatsApp templates are reused
// WITHOUT modification. The lead payload context fields (category, gender,
// buildingCode, floorCode, publicGroupKey) are taken from the M18B
// `bookingLeadDefaults` verbatim to guarantee the 1:1 mapping onto the M17B
// endpoint. Only public-safe aggregated fields are mapped — never roomId,
// room_code, or exact room numbers (they do not exist on either type).
export function toPublicRoomGroup(item: PublicHunianCatalogItem): PublicRoomGroup {
  const defaults = item.bookingLeadDefaults;
  return {
    groupKey: defaults.publicGroupKey ?? item.publicGroupKey,
    category: defaults.category ?? item.category,
    categoryLabel: item.categoryLabel,
    gender: defaults.gender ?? item.gender,
    genderLabel: item.genderLabel,
    buildingCode: defaults.buildingCode ?? item.buildingCode ?? "",
    buildingName: item.buildingName ?? "",
    floorCode: defaults.floorCode ?? item.floorCode ?? "",
    floorLabel: item.floorLabel ?? "",
    availableCount: item.availabilityCount,
    priceFromMonthly: item.priceFromMonthly,
    priceFromYearly: item.priceFromYearly,
    publicTitle: item.title,
    ctaLabel: item.ctaLabel,
  };
}
