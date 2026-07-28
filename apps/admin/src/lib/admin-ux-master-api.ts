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
    facilities?: Array<
      Pick<RoomFacility, "id" | "name" | "icon" | "description" | "categoryId" | "sortOrder">
    >;
  };
  activeLease?: {
    leaseCode?: string;
    residentName?: string;
  } | null;
  activeOccupancy?: {
    id: string;
    residentId: string;
    residentName?: string;
    startDate?: string;
  } | null;
  leaseReconciliationRequired?: boolean;
};

export type RoomAvailabilityItem = {
  propertyId: string;
  status: RoomStatus;
  total: number;
};

export type RoomBuildingReference = {
  id: string;
  propertyId: string;
  category: KostTypeCategory;
  buildingCode: string;
  buildingName: string;
  genderPolicy: Exclude<RoomGenderPolicy, "mixed">;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKostTypeCategory(value: unknown): value is KostTypeCategory {
  return value === "rukost" || value === "apartkost";
}

function isRoomBuildingGenderPolicy(
  value: unknown,
): value is RoomBuildingReference["genderPolicy"] {
  return value === "male" || value === "female";
}

const ROOM_BASE_KEYS = [
  "id",
  "property_id",
  "number",
  "room_code",
  "building_id",
  "building_code",
  "building_name",
  "unit_code",
  "gender_policy",
  "floor",
  "floor_code",
  "floor_label",
  "size_label",
  "status",
  "primary_photo_file_id",
  "public_visible",
  "created_at",
  "updated_at",
  "kost_type",
  "active_lease",
] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseRoomFacility(
  value: unknown,
): NonNullable<RoomInventory["kostType"]["facilities"]>[number] {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["id", "name", "icon", "description", "category_id", "sort_order"]) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.icon) ||
    !isNullableString(value.description) ||
    !isNullableString(value.category_id) ||
    !isIntegerAtLeast(value.sort_order, 0)
  ) {
    throw new Error("Invalid room facility record.");
  }
  return {
    id: value.id,
    name: value.name,
    icon: value.icon,
    description: value.description,
    categoryId: value.category_id,
    sortOrder: value.sort_order,
  };
}

function parseRoomInventoryRecord(value: unknown, includeActiveLease: boolean): RoomInventory {
  const expectedKeys = includeActiveLease
    ? [...ROOM_BASE_KEYS, "active_occupancy", "lease_reconciliation_required"]
    : [...ROOM_BASE_KEYS];
  if (!isPlainRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new Error("Invalid room inventory record.");
  }
  const kostType = value.kost_type;
  if (
    !isPlainRecord(kostType) ||
    !hasExactKeys(kostType, [
      "id",
      "name",
      "slug",
      "category",
      "monthly_price",
      "yearly_price",
      "deposit_amount",
      "facilities",
    ]) ||
    !isNonEmptyString(kostType.id) ||
    !isNonEmptyString(kostType.name) ||
    !isNonEmptyString(kostType.slug) ||
    !isKostTypeCategory(kostType.category) ||
    typeof kostType.monthly_price !== "number" ||
    typeof kostType.yearly_price !== "number" ||
    typeof kostType.deposit_amount !== "number" ||
    !Array.isArray(kostType.facilities)
  ) {
    throw new Error("Invalid room kost type record.");
  }
  const activeLease = value.active_lease;
  if (
    activeLease !== null &&
    (!isPlainRecord(activeLease) ||
      !hasExactKeys(activeLease, ["lease_code", "resident_name"]) ||
      !isNullableString(activeLease.lease_code) ||
      !isNullableString(activeLease.resident_name))
  ) {
    throw new Error("Invalid active lease record.");
  }
  const activeOccupancy = includeActiveLease ? value.active_occupancy : undefined;
  if (
    includeActiveLease &&
    activeOccupancy !== null &&
    (!isPlainRecord(activeOccupancy) ||
      !hasExactKeys(activeOccupancy, ["id", "resident_id", "resident_name", "start_date"]) ||
      !isNonEmptyString(activeOccupancy.id) ||
      !isNonEmptyString(activeOccupancy.resident_id) ||
      !isNullableString(activeOccupancy.resident_name) ||
      !isNullableString(activeOccupancy.start_date))
  ) {
    throw new Error("Invalid active occupancy record.");
  }
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.property_id) ||
    !isNonEmptyString(value.number) ||
    !isNullableString(value.room_code) ||
    !isNonEmptyString(value.building_id) ||
    !isNullableString(value.building_code) ||
    !isNullableString(value.building_name) ||
    !isNullableString(value.unit_code) ||
    (value.gender_policy !== null &&
      value.gender_policy !== "male" &&
      value.gender_policy !== "female" &&
      value.gender_policy !== "mixed") ||
    !isNullableString(value.floor) ||
    (value.floor_code !== null && value.floor_code !== "A" && value.floor_code !== "B") ||
    !isNullableString(value.floor_label) ||
    !isNullableString(value.size_label) ||
    !isRoomStatus(value.status) ||
    !isNullableString(value.primary_photo_file_id) ||
    typeof value.public_visible !== "boolean" ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string" ||
    (includeActiveLease && typeof value.lease_reconciliation_required !== "boolean")
  ) {
    throw new Error("Invalid room inventory record.");
  }
  const activeLeaseRecord = activeLease as Record<string, unknown> | null;
  const activeOccupancyRecord = activeOccupancy as Record<string, unknown> | null | undefined;
  return {
    id: value.id,
    propertyId: value.property_id,
    number: value.number,
    roomCode: value.room_code,
    buildingId: value.building_id,
    buildingCode: value.building_code,
    buildingName: value.building_name,
    unitCode: value.unit_code,
    genderPolicy: value.gender_policy,
    floor: value.floor,
    floorCode: value.floor_code,
    floorLabel: value.floor_label,
    sizeLabel: value.size_label,
    status: value.status,
    primaryPhotoFileId: value.primary_photo_file_id,
    publicVisible: value.public_visible,
    kostType: {
      id: kostType.id,
      name: kostType.name,
      slug: kostType.slug,
      category: kostType.category,
      monthlyPrice: kostType.monthly_price,
      yearlyPrice: kostType.yearly_price,
      depositAmount: kostType.deposit_amount,
      facilities: kostType.facilities.map(parseRoomFacility),
    },
    activeLease:
      activeLeaseRecord === null
        ? null
        : {
            leaseCode: (activeLeaseRecord.lease_code as string | null) ?? undefined,
            residentName: (activeLeaseRecord.resident_name as string | null) ?? undefined,
          },
    activeOccupancy:
      !includeActiveLease || activeOccupancyRecord === null
        ? includeActiveLease
          ? null
          : undefined
        : {
            id: activeOccupancyRecord!.id as string,
            residentId: activeOccupancyRecord!.resident_id as string,
            residentName: (activeOccupancyRecord!.resident_name as string | null) ?? undefined,
            startDate: (activeOccupancyRecord!.start_date as string | null) ?? undefined,
          },
    leaseReconciliationRequired: includeActiveLease
      ? (value.lease_reconciliation_required as boolean)
      : undefined,
  };
}

export function parseRoomInventoryListEnvelope(
  value: unknown,
  includeActiveLease = false,
): AdminUxPage<RoomInventory> {
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
  return {
    items: value.data.map((item) => parseRoomInventoryRecord(item, includeActiveLease)),
    total: meta.total,
    limit: meta.limit,
    offset: meta.offset,
  };
}

export function parseRoomInventoryDetailEnvelope(
  value: unknown,
  includeActiveLease = false,
): RoomInventory {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"])) {
    throw new Error("Invalid room detail envelope.");
  }
  return parseRoomInventoryRecord(value.data, includeActiveLease);
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

export function parseRoomBuildingReferenceEnvelope(value: unknown): RoomBuildingReference[] {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"]) || !Array.isArray(value.data)) {
    throw new Error("Invalid room building reference envelope.");
  }
  return value.data.map((item) => {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, [
        "id",
        "property_id",
        "category",
        "building_code",
        "building_name",
        "gender_policy",
      ]) ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.property_id) ||
      !isKostTypeCategory(item.category) ||
      !isNonEmptyString(item.building_code) ||
      !isNonEmptyString(item.building_name) ||
      !isRoomBuildingGenderPolicy(item.gender_policy)
    ) {
      throw new Error("Invalid room building reference record.");
    }
    return {
      id: item.id,
      propertyId: item.property_id,
      category: item.category,
      buildingCode: item.building_code,
      buildingName: item.building_name,
      genderPolicy: item.gender_policy,
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
        .then((value) => parseRoomInventoryListEnvelope(value, input.includeActiveLease ?? false)),
    availability: (propertyId: string) =>
      adminUxV2Requester
        .get<unknown>("/rooms/availability", { query: { property_id: propertyId } })
        .then(parseRoomAvailabilityEnvelope),
    buildings: (propertyId: string, category: KostTypeCategory) =>
      adminUxV2Requester
        .get<unknown>("/rooms/buildings", {
          query: { property_id: propertyId, category },
        })
        .then(parseRoomBuildingReferenceEnvelope),
    detail: (id: string, includeActiveLease = false) =>
      adminUxV2Requester
        .get<unknown>("/rooms/" + encodeURIComponent(id), {
          query: { include_active_lease: includeActiveLease || undefined },
        })
        .then((value) => parseRoomInventoryDetailEnvelope(value, includeActiveLease)),
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
