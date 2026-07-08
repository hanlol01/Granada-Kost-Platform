// Hunian gallery admin read hooks (M19C). Backend (M19B, hunian-gallery.controller.ts):
//   GET /hunian-gallery - JWT + RBAC (owner|manager|admin|property_owner with
//   room.read), property-scoped, includes unpublished (draft) images.
//
// Gallery images belong to PUBLIC hunian/unit/group catalog items (M19A freeze):
// they attach to catalogSlug/publicGroupKey - NEVER to exact rooms. This module
// never requests or renders roomId, room_code, exact room numbers, storage_path,
// tenant/resident/occupancy PII, payment/bank data, or Smart Lock data.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProperty } from "@/lib/property";

export type HunianGalleryCategory = "rukost" | "apartkost";
export type HunianGalleryGender = "male" | "female";
export type HunianGalleryFloorCode = "A" | "B";

// Mirrors the M19B admin response allowlist (HunianGalleryAdminResponse).
// `fileId` is admin-only and used exclusively for the authorized preview blob
// fetch (GET /files/:fileId/content) - it is never rendered as text. No
// storage_path or filesystem path exists on this contract.
export type HunianGalleryImage = {
  id: string;
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string | null;
  floorCode: HunianGalleryFloorCode | null;
  fileId: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  publicVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

// Backend service rule (M19B): max 10 active images per catalog item.
export const HUNIAN_GALLERY_MAX_IMAGES = 10;

export const HUNIAN_GALLERY_CATEGORY_LABEL: Record<HunianGalleryCategory, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

export const HUNIAN_GALLERY_GENDER_LABEL: Record<HunianGalleryGender, string> = {
  male: "Putra",
  female: "Putri",
};

// Public/detail ordering is cover first, then sortOrder, then createdAt. The
// admin manager keeps pure sortOrder + createdAt so Move Up/Down stays intuitive.
export function sortGalleryImages(images: HunianGalleryImage[]): HunianGalleryImage[] {
  return [...images].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type UseHunianGalleryFilters = {
  catalogSlug?: string;
  publicGroupKey?: string;
  category?: HunianGalleryCategory;
  gender?: HunianGalleryGender;
};

export function useHunianGallery(
  filters: UseHunianGalleryFilters = {},
): UseQueryResult<HunianGalleryImage[]> {
  const { currentPropertyId } = useProperty();
  return useQuery<HunianGalleryImage[]>({
    queryKey: ["hunian-gallery", "list", { propertyId: currentPropertyId }, filters] as const,
    queryFn: () =>
      apiClient.get<HunianGalleryImage[]>("/hunian-gallery", {
        query: {
          property_id: currentPropertyId ?? undefined,
          catalogSlug: filters.catalogSlug,
          publicGroupKey: filters.publicGroupKey,
          category: filters.category,
          gender: filters.gender,
        },
      }),
    enabled: Boolean(currentPropertyId) && Boolean(filters.catalogSlug),
  });
}

// ---------------------------------------------------------------------------
// Catalog item options for the selector (read-only)
// ---------------------------------------------------------------------------
// Source: the M18B public catalog list. It is the canonical source of the
// public-safe catalog slugs/titles rendered on /kamar, so attaching by slug
// here guarantees photos land on exactly the items the public sees.
// `anonymous: true` skips the Authorization header (read-only, public-safe
// data; same pattern as the penghuni /kamar hooks). Only allowlisted fields
// are typed - no room-level identifiers exist on this endpoint.

export type HunianCatalogOption = {
  slug: string;
  title: string;
  category: HunianGalleryCategory;
  categoryLabel: string;
  gender: HunianGalleryGender;
  genderLabel: string;
  buildingCode: string | null;
  buildingName: string | null;
  floorCode: string | null;
  floorLabel: string | null;
  publicGroupKey: string;
  availabilityCount: number;
};

export function useHunianCatalogOptions(): UseQueryResult<HunianCatalogOption[]> {
  return useQuery<HunianCatalogOption[]>({
    queryKey: ["hunian-catalog", "admin-options"],
    queryFn: () =>
      apiClient.get<HunianCatalogOption[]>("/public/hunian-catalog", { anonymous: true }),
    staleTime: 60_000,
  });
}
