// Typed Admin UX V2 client for the M4 master-data and room surfaces.
// Kept separate from legacy hooks so no room form can accidentally send
// commercial fields that are owned by a kost type.

import { adminUxV2Requester, type AdminUxQueryValue } from "@/lib/admin-ux-api";
import {
  mapV2Data,
  mapV2Page,
  type AdminUxPage,
  type V2DataEnvelope,
  type V2ListEnvelope,
} from "@/lib/admin-ux-mapper";

export type KostTypeCategory = "rukost" | "apartkost";
export type MasterStatus = "active" | "inactive";
export type RoomStatus =
  | "vacant"
  | "reserved"
  | "occupied"
  | "maintenance"
  | "inactive"
  | "requires_review";
export type RoomGenderPolicy = "male" | "female" | "mixed";
export type RuleCategory = "general" | "guest" | "resident" | "other" | "special_notes";
export type CommonAreaKey = "lobby" | "dapur" | "rooftop" | "koridor" | "parkir";

export type PropertyPageInput = {
  propertyId: string;
  limit?: number;
  offset?: number;
};

export type KostType = {
  id: string;
  propertyId: string;
  category: KostTypeCategory;
  name: string;
  slug: string;
  descriptionShort?: string | null;
  descriptionLong?: string | null;
  roomSizeLabel?: string | null;
  roomSizeM2?: number | null;
  monthlyPrice: number;
  yearlyPrice: number;
  depositAmount: number;
  maxOccupants?: number;
  publicVisible: boolean;
  notes?: string | null;
  status: MasterStatus;
  roomCount?: number;
  facilityCount?: number;
  facilities?: RoomFacility[];
  rules?: KostTypeRule[];
};

export type FacilityCategory = {
  id: string;
  propertyId: string;
  name: string;
  icon?: string | null;
  sortOrder: number;
};

export type RoomFacility = {
  id: string;
  propertyId: string;
  categoryId?: string | null;
  categoryName?: string | null;
  name: string;
  icon?: string | null;
  description?: string | null;
  status: MasterStatus;
  sortOrder: number;
};

export type KostTypeRule = {
  id: string;
  propertyId: string;
  kostTypeId?: string | null;
  ruleCategory: RuleCategory;
  icon?: string | null;
  ruleText: string;
  isAllowed?: boolean | null;
  sortOrder: number;
};

export type RoomInventory = {
  id: string;
  propertyId: string;
  number: string;
  roomCode?: string | null;
  buildingId: string;
  buildingCode?: string | null;
  buildingName?: string | null;
  unitCode?: string | null;
  genderPolicy?: RoomGenderPolicy | null;
  floor?: string | null;
  floorCode?: "A" | "B" | null;
  floorLabel?: string | null;
  sizeLabel?: string | null;
  status: RoomStatus;
  primaryPhotoFileId?: string | null;
  publicVisible: boolean;
  kostType: Pick<
    KostType,
    "id" | "name" | "slug" | "category" | "monthlyPrice" | "yearlyPrice" | "depositAmount"
  > & {
    facilities?: RoomFacility[];
  };
  activeLease?: {
    leaseCode?: string;
    residentName?: string;
  } | null;
  activeOccupancy?: {
    residentName?: string;
    startDate?: string;
  } | null;
};

export type RoomAvailabilityItem = {
  propertyId: string;
  status: RoomStatus;
  total: number;
};

export type GalleryTarget =
  | { targetType: "kost_type"; kostTypeId: string }
  | { targetType: "common_area"; commonAreaKey: CommonAreaKey };

export type GalleryImage = {
  id: string;
  propertyId: string;
  targetType: GalleryTarget["targetType"];
  targetId: string;
  kostTypeId?: string | null;
  kostTypeName?: string | null;
  commonAreaKey?: CommonAreaKey | null;
  fileId: string;
  altText: string;
  caption?: string | null;
  sortOrder: number;
  isCover: boolean;
  publicVisible: boolean;
};

export type KostTypeInput = {
  propertyId: string;
  category: KostTypeCategory;
  name: string;
  slug: string;
  descriptionShort?: string;
  descriptionLong?: string;
  roomSizeLabel?: string;
  roomSizeM2?: number;
  monthlyPrice: number;
  yearlyPrice: number;
  depositAmount: number;
  publicVisible?: boolean;
  notes?: string;
  status?: MasterStatus;
};

export type KostTypeUpdateInput = Partial<Omit<KostTypeInput, "propertyId" | "category">>;

export type FacilityCategoryInput = {
  propertyId: string;
  name: string;
  icon?: string | null;
  sortOrder?: number;
};

export type FacilityCategoryUpdateInput = Partial<Omit<FacilityCategoryInput, "propertyId">>;

export type RoomFacilityInput = {
  propertyId: string;
  categoryId: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  status?: MasterStatus;
  sortOrder?: number;
};

export type RoomFacilityUpdateInput = Partial<Omit<RoomFacilityInput, "propertyId">>;

export type KostTypeRuleInput = {
  propertyId: string;
  kostTypeId?: string | null;
  ruleCategory: RuleCategory;
  icon?: string | null;
  ruleText: string;
  isAllowed?: boolean | null;
  sortOrder?: number;
};

export type KostTypeRuleUpdateInput = Partial<Omit<KostTypeRuleInput, "propertyId" | "kostTypeId">>;

/** Inventory-only room input. Commercial fields intentionally do not exist here. */
export type RoomInventoryInput = {
  propertyId: string;
  kostTypeId: string;
  number: string;
  roomCode?: string | null;
  buildingId: string;
  floor?: string | null;
  floorCode?: "A" | "B" | null;
  floorLabel?: string | null;
  unitCode?: string | null;
  genderPolicy?: RoomGenderPolicy | null;
  sizeLabel?: string | null;
  primaryPhotoFileId?: string | null;
  publicVisible?: boolean;
};

export type RoomInventoryUpdateInput = Partial<Omit<RoomInventoryInput, "propertyId">>;

export type GalleryImageInput = GalleryTarget & {
  propertyId: string;
  fileId: string;
  altText: string;
  caption?: string | null;
  publicVisible?: boolean;
  sortOrder?: number;
};

export type GalleryImageUpdateInput = {
  altText?: string;
  caption?: string | null;
  publicVisible?: boolean;
  sortOrder?: number;
};

export type ReorderItem = { id: string; sortOrder: number };

function pageQuery(input: PropertyPageInput): Record<string, AdminUxQueryValue> {
  return {
    property_id: input.propertyId,
    limit: input.limit,
    offset: input.offset,
  };
}

async function list<T>(
  path: string,
  query: Record<string, AdminUxQueryValue>,
): Promise<AdminUxPage<T>> {
  const envelope = await adminUxV2Requester.get<V2ListEnvelope<unknown>>(path, { query });
  return mapV2Page<T>(envelope);
}

async function data<T>(request: Promise<V2DataEnvelope<unknown>>): Promise<T> {
  return mapV2Data<T>(await request);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    keys
      .slice()
      .sort()
      .every((key, index) => key === actual[index])
  );
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

function isRoomStatus(value: unknown): value is RoomStatus {
  return (
    value === "vacant" ||
    value === "reserved" ||
    value === "occupied" ||
    value === "maintenance" ||
    value === "inactive" ||
    value === "requires_review"
  );
}

export function parseRoomInventoryListEnvelope(value: unknown): AdminUxPage<RoomInventory> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data", "meta"]) ||
    !Array.isArray(value.data)
  ) {
    throw new Error("Invalid rooms list envelope.");
  }
  const meta = value.meta;
  if (
    !isPlainRecord(meta) ||
    !hasExactKeys(meta, ["limit", "offset", "total"]) ||
    !isIntegerAtLeast(meta.total, 0) ||
    !isIntegerAtLeast(meta.limit, 1) ||
    meta.limit > 100 ||
    !isIntegerAtLeast(meta.offset, 0)
  ) {
    throw new Error("Invalid rooms list metadata.");
  }
  return mapV2Page<RoomInventory>({
    data: value.data,
    meta: { total: meta.total, limit: meta.limit, offset: meta.offset },
  });
}

export function parseRoomAvailabilityEnvelope(value: unknown): RoomAvailabilityItem[] {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"]) || !Array.isArray(value.data)) {
    throw new Error("Invalid room availability envelope.");
  }
  return value.data.map((item) => {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, ["property_id", "status", "total"]) ||
      typeof item.property_id !== "string" ||
      item.property_id.length === 0 ||
      !isRoomStatus(item.status) ||
      !isIntegerAtLeast(item.total, 0)
    ) {
      throw new Error("Invalid room availability record.");
    }
    return {
      propertyId: item.property_id,
      status: item.status,
      total: item.total,
    };
  });
}

function kostTypeBody(input: KostTypeInput | KostTypeUpdateInput): Record<string, unknown> {
  return {
    property_id: "propertyId" in input ? input.propertyId : undefined,
    category: "category" in input ? input.category : undefined,
    name: input.name,
    slug: input.slug,
    description_short: input.descriptionShort,
    description_long: input.descriptionLong,
    room_size_label: input.roomSizeLabel,
    room_size_m2: input.roomSizeM2,
    monthly_price: input.monthlyPrice,
    yearly_price: input.yearlyPrice,
    deposit_amount: input.depositAmount,
    public_visible: input.publicVisible,
    notes: input.notes,
    status: input.status,
  };
}

/** The only room serializer used by M4. It has no price, deposit, or facilities. */
export function toRoomInventoryBody(
  input: RoomInventoryInput | RoomInventoryUpdateInput,
): Record<string, unknown> {
  return {
    property_id: "propertyId" in input ? input.propertyId : undefined,
    kost_type_id: input.kostTypeId,
    number: input.number,
    room_code: input.roomCode ?? undefined,
    building_id: input.buildingId,
    floor: input.floor ?? undefined,
    floor_code: input.floorCode ?? undefined,
    floor_label: input.floorLabel ?? undefined,
    unit_code: input.unitCode ?? undefined,
    gender_policy: input.genderPolicy ?? undefined,
    size_label: input.sizeLabel ?? undefined,
    primary_photo_file_id: input.primaryPhotoFileId ?? undefined,
    public_visible: input.publicVisible,
  };
}

function reorderItems(items: ReorderItem[]) {
  return items.map((item) => ({ id: item.id, sort_order: item.sortOrder }));
}

export const adminUxMasterApi = {
  kostTypes: {
    list: (
      input: PropertyPageInput & {
        category?: KostTypeCategory;
        q?: string;
        status?: MasterStatus;
      },
    ) =>
      list<KostType>("/kost-types", {
        ...pageQuery(input),
        category: input.category,
        q: input.q?.trim() || undefined,
        status: input.status,
      }),
    detail: (id: string) =>
      data<KostType>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>("/kost-types/" + encodeURIComponent(id)),
      ),
    create: (input: KostTypeInput, idempotencyKey?: string) =>
      data<KostType>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>("/kost-types", kostTypeBody(input), {
          idempotencyKey,
        }),
      ),
    update: (id: string, input: KostTypeUpdateInput, idempotencyKey?: string) =>
      data<KostType>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/kost-types/" + encodeURIComponent(id),
          kostTypeBody(input),
          { idempotencyKey },
        ),
      ),
    remove: (id: string, idempotencyKey?: string) =>
      data<{ id: string; deleted: boolean }>(
        adminUxV2Requester.delete<V2DataEnvelope<unknown>>(
          "/kost-types/" + encodeURIComponent(id),
          { idempotencyKey },
        ),
      ),
    replaceFacilities: (
      id: string,
      propertyId: string,
      facilityIds: string[],
      idempotencyKey?: string,
    ) =>
      data<KostType>(
        adminUxV2Requester.put<V2DataEnvelope<unknown>>(
          "/kost-types/" + encodeURIComponent(id) + "/facilities",
          { property_id: propertyId, facility_ids: facilityIds },
          { idempotencyKey },
        ),
      ),
  },
  facilities: {
    categories: (input: PropertyPageInput & { q?: string }) =>
      list<FacilityCategory>("/facility-categories", {
        ...pageQuery(input),
        q: input.q?.trim() || undefined,
      }),
    createCategory: (input: FacilityCategoryInput, idempotencyKey?: string) =>
      data<FacilityCategory>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/facility-categories",
          {
            property_id: input.propertyId,
            name: input.name,
            icon: input.icon ?? undefined,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    updateCategory: (id: string, input: FacilityCategoryUpdateInput, idempotencyKey?: string) =>
      data<FacilityCategory>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/facility-categories/" + encodeURIComponent(id),
          { name: input.name, icon: input.icon, sort_order: input.sortOrder },
          { idempotencyKey },
        ),
      ),
    removeCategory: (id: string, idempotencyKey?: string) =>
      data<{ id: string; deleted: boolean }>(
        adminUxV2Requester.delete<V2DataEnvelope<unknown>>(
          "/facility-categories/" + encodeURIComponent(id),
          { idempotencyKey },
        ),
      ),
    reorderCategories: async (
      propertyId: string,
      items: ReorderItem[],
      idempotencyKey?: string,
    ) => {
      const envelope = await adminUxV2Requester.put<V2ListEnvelope<unknown>>(
        "/facility-categories/reorder",
        { property_id: propertyId, items: reorderItems(items) },
        { idempotencyKey },
      );
      return mapV2Page<FacilityCategory>(envelope);
    },
    roomFacilities: (
      input: PropertyPageInput & {
        categoryId?: string;
        q?: string;
        status?: MasterStatus;
      },
    ) =>
      list<RoomFacility>("/room-facilities", {
        ...pageQuery(input),
        category_id: input.categoryId,
        q: input.q?.trim() || undefined,
        status: input.status,
      }),
    createRoomFacility: (input: RoomFacilityInput, idempotencyKey?: string) =>
      data<RoomFacility>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/room-facilities",
          {
            property_id: input.propertyId,
            category_id: input.categoryId,
            name: input.name,
            icon: input.icon ?? undefined,
            description: input.description ?? undefined,
            status: input.status,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    updateRoomFacility: (id: string, input: RoomFacilityUpdateInput, idempotencyKey?: string) =>
      data<RoomFacility>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/room-facilities/" + encodeURIComponent(id),
          {
            category_id: input.categoryId,
            name: input.name,
            icon: input.icon,
            description: input.description,
            status: input.status,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    removeRoomFacility: (id: string, idempotencyKey?: string) =>
      data<{ id: string; deleted: boolean }>(
        adminUxV2Requester.delete<V2DataEnvelope<unknown>>(
          "/room-facilities/" + encodeURIComponent(id),
          { idempotencyKey },
        ),
      ),
    reorderRoomFacilities: async (
      propertyId: string,
      categoryId: string | undefined,
      items: ReorderItem[],
      idempotencyKey?: string,
    ) => {
      const envelope = await adminUxV2Requester.put<V2ListEnvelope<unknown>>(
        "/room-facilities/reorder",
        { property_id: propertyId, category_id: categoryId, items: reorderItems(items) },
        { idempotencyKey },
      );
      return mapV2Page<RoomFacility>(envelope);
    },
  },
  rules: {
    list: (
      input: PropertyPageInput & {
        scope: "global" | "kost_type";
        kostTypeId?: string;
        ruleCategory?: RuleCategory;
      },
    ) =>
      list<KostTypeRule>("/kost-type-rules", {
        ...pageQuery(input),
        scope: input.scope,
        kost_type_id: input.kostTypeId,
        rule_category: input.ruleCategory,
      }),
    create: (input: KostTypeRuleInput, idempotencyKey?: string) =>
      data<KostTypeRule>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/kost-type-rules",
          {
            property_id: input.propertyId,
            kost_type_id: input.kostTypeId ?? undefined,
            rule_category: input.ruleCategory,
            icon: input.icon ?? undefined,
            rule_text: input.ruleText,
            is_allowed: input.isAllowed,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    update: (id: string, input: KostTypeRuleUpdateInput, idempotencyKey?: string) =>
      data<KostTypeRule>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/kost-type-rules/" + encodeURIComponent(id),
          {
            rule_category: input.ruleCategory,
            icon: input.icon,
            rule_text: input.ruleText,
            is_allowed: input.isAllowed,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    remove: (id: string, idempotencyKey?: string) =>
      data<{ id: string; deleted: boolean }>(
        adminUxV2Requester.delete<V2DataEnvelope<unknown>>(
          "/kost-type-rules/" + encodeURIComponent(id),
          { idempotencyKey },
        ),
      ),
    reorder: async (
      propertyId: string,
      kostTypeId: string | null | undefined,
      items: ReorderItem[],
      idempotencyKey?: string,
    ) => {
      const envelope = await adminUxV2Requester.put<V2ListEnvelope<unknown>>(
        "/kost-type-rules/reorder",
        {
          property_id: propertyId,
          kost_type_id: kostTypeId ?? undefined,
          items: reorderItems(items),
        },
        { idempotencyKey },
      );
      return mapV2Page<KostTypeRule>(envelope);
    },
  },
  rooms: {
    list: (
      input: PropertyPageInput & {
        kostTypeId?: string;
        category?: KostTypeCategory;
        buildingId?: string;
        floor?: string;
        status?: RoomStatus;
        q?: string;
        includeActiveLease?: boolean;
      },
    ) =>
      adminUxV2Requester
        .get<unknown>("/rooms", {
          query: {
            ...pageQuery(input),
            kost_type_id: input.kostTypeId,
            category: input.category,
            building_id: input.buildingId,
            floor: input.floor,
            status: input.status,
            q: input.q?.trim() || undefined,
            include_active_lease: input.includeActiveLease,
          },
        })
        .then(parseRoomInventoryListEnvelope),
    availability: (propertyId: string) =>
      adminUxV2Requester
        .get<unknown>("/rooms/availability", { query: { property_id: propertyId } })
        .then(parseRoomAvailabilityEnvelope),
    detail: (id: string, includeActiveLease = false) =>
      data<RoomInventory>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>("/rooms/" + encodeURIComponent(id), {
          query: { include_active_lease: includeActiveLease || undefined },
        }),
      ),
    create: (input: RoomInventoryInput, idempotencyKey?: string) =>
      data<RoomInventory>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>("/rooms", toRoomInventoryBody(input), {
          idempotencyKey,
        }),
      ),
    update: (id: string, input: RoomInventoryUpdateInput, idempotencyKey?: string) =>
      data<RoomInventory>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/rooms/" + encodeURIComponent(id),
          toRoomInventoryBody(input),
          { idempotencyKey },
        ),
      ),
    updateStatus: (
      id: string,
      input: {
        status: Extract<RoomStatus, "vacant" | "maintenance" | "inactive" | "requires_review">;
        reason: string;
      },
      idempotencyKey?: string,
    ) =>
      data<RoomInventory>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/rooms/" + encodeURIComponent(id) + "/status",
          input,
          { idempotencyKey },
        ),
      ),
  },
  gallery: {
    list: (input: PropertyPageInput & Partial<GalleryTarget>) =>
      list<GalleryImage>("/hunian-gallery", {
        ...pageQuery(input),
        target_type: input.targetType,
        kost_type_id: input.targetType === "kost_type" ? input.kostTypeId : undefined,
        common_area_key: input.targetType === "common_area" ? input.commonAreaKey : undefined,
      }),
    create: (input: GalleryImageInput, idempotencyKey?: string) =>
      data<GalleryImage>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/hunian-gallery",
          {
            property_id: input.propertyId,
            target_type: input.targetType,
            kost_type_id: input.targetType === "kost_type" ? input.kostTypeId : undefined,
            common_area_key: input.targetType === "common_area" ? input.commonAreaKey : undefined,
            file_id: input.fileId,
            alt_text: input.altText,
            caption: input.caption ?? undefined,
            public_visible: input.publicVisible,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    update: (id: string, input: GalleryImageUpdateInput, idempotencyKey?: string) =>
      data<GalleryImage>(
        adminUxV2Requester.patch<V2DataEnvelope<unknown>>(
          "/hunian-gallery/" + encodeURIComponent(id),
          {
            alt_text: input.altText,
            caption: input.caption,
            public_visible: input.publicVisible,
            sort_order: input.sortOrder,
          },
          { idempotencyKey },
        ),
      ),
    setCover: (id: string, idempotencyKey?: string) =>
      data<GalleryImage>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/hunian-gallery/" + encodeURIComponent(id) + "/set-cover",
          {},
          { idempotencyKey },
        ),
      ),
    reorder: (
      propertyId: string,
      target: GalleryTarget,
      items: ReorderItem[],
      idempotencyKey?: string,
    ) =>
      data<GalleryImage[]>(
        adminUxV2Requester.put<V2DataEnvelope<unknown>>(
          "/hunian-gallery/reorder",
          {
            property_id: propertyId,
            target_type: target.targetType,
            kost_type_id: target.targetType === "kost_type" ? target.kostTypeId : undefined,
            common_area_key: target.targetType === "common_area" ? target.commonAreaKey : undefined,
            items: reorderItems(items),
          },
          { idempotencyKey },
        ),
      ),
    remove: (id: string, idempotencyKey?: string) =>
      data<{ id: string; deleted: boolean }>(
        adminUxV2Requester.delete<V2DataEnvelope<unknown>>(
          "/hunian-gallery/" + encodeURIComponent(id),
          { idempotencyKey },
        ),
      ),
  },
};
