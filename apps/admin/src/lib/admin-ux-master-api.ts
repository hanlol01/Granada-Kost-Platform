// Typed Admin UX V2 client for the M4 master-data and room surfaces.
// Kept separate from legacy hooks so no room form can accidentally send
// commercial fields that are owned by a kost type.

import { adminUxV2Requester, type AdminUxQueryValue } from "@/lib/admin-ux-api";
import {
  mapV2Data,
  mapV2Page,
  mapSnakeToCamel,
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

export type PropertyPageInput = {
  propertyId: string;
  limit?: number;
  offset?: number;
};

export type KostTypeCommercial = {
  monthlyPrice: number;
  annualContractValue: number;
  minimumDpPercent: number;
  minimumDpAmount: number;
  paymentSchedules: Array<"annual" | "two_month_installments">;
  securityDepositMonths: number;
  securityDepositRequired: number;
  effectiveDate: string;
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
  commercial?: KostTypeCommercial;
  futureCommercial?: KostTypeCommercial | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  structuralEditLocked?: boolean;
};

export type RoomDetail = {
  id: string;
  propertyId: string;
  number: string;
  roomCode: string | null;
  building: { id: string; code: string; name: string };
  category: { id: string; code: KostTypeCategory; name: string };
  physical: {
    unitCode: string | null;
    floorCode: "A" | "B";
    floorLabel: string;
    sizeLabel: string | null;
    primaryPhotoFileId: string | null;
    genderPolicy: "male" | "female";
    status: RoomStatus;
    publicVisible: boolean;
    notes: string | null;
    structuralEditLocked: boolean;
  };
  commercial: {
    source: "current_category";
    monthlyPrice: number;
    annualContractValue: number;
    minimumDpAmount: number;
    minimumDpLabel: string;
    securityDepositRequired: number;
    paymentPlanDescription: string;
    facilities: Array<{ id: string; name: string }>;
  };
  resident: {
    displayName: string;
    accountStatus: string;
    university: string | null;
    occupancyStart: string;
  } | null;
  lease: {
    id: string;
    code: string;
    status: string;
    startDate: string;
    endDate: string | null;
    durationMonths: number;
    paymentPlan: string;
    occupancyStart: string | null;
    occupancyEnd: string | null;
    occupancyState: string | null;
  } | null;
  reconciliation: {
    state: "normal" | "lease_reconciliation_required";
    messages: string[];
  };
  billing: {
    contractValue: number | null;
    verifiedInvoiceAllocated: number;
    unpaidAmount: number;
    nextDueDate: string | null;
    nextDuePeriod: string | null;
    minimumDpAmount: number;
    dpVerifiedAmount: null;
    dpProgressLabel: string;
    securityDepositRequired: number;
    depositHeld: number;
    depositRefunded: number;
    depositDeducted: number;
    awaitingConfirmationAmount: number;
  };
  vehicles: Array<{
    code: string;
    plateNumber: string;
    vehicleType: string;
    parkingState: string | null;
  }>;
  complaints: Array<{
    code: string;
    category: string;
    status: string;
    priority: string;
    workOrderCode: string | null;
    workOrderStatus: string | null;
    technicianName: string | null;
  }>;
  ownership: {
    displayName: "KOSTATION";
    source: "policy_default";
    ownershipReconciliationRequired: true;
  };
  timeline: Array<{ eventType: string; label: string; occurredAt: string }>;
  links: {
    resident: null;
    lease: string | null;
    billing: null;
    vehicles: null;
    complaints: null;
  };
  updatedAt: string;
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

export type GalleryTarget = { targetType: "kost_type"; kostTypeId: string };

export type ContentPublicationVersion = {
  id: string;
  contentType: "facilities" | "gallery";
  version: number;
  publicationStatus: "published" | "archived";
  effectiveDate: string;
  restoredFromVersionId: string | null;
  publishedAt: string;
  publishedByUserId: string | null;
  createdAt: string;
};

export type CategoryContentFacility = {
  id: string;
  label: string;
  normalizedLabel: string;
  publicDescription: string | null;
  sortOrder: number;
  contentState: "active" | "archived";
  publicVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GalleryImage = {
  id: string;
  propertyId: string;
  targetType: "kost_type";
  kostTypeId: string;
  kostTypeName: string | null;
  sourceFileId: string;
  publicDerivativeFileId: string | null;
  sourceContentUrl: string;
  publicPreviewUrl: string | null;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  contentState: "draft" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CategoryContentWorkspace = {
  propertyId: string;
  kostTypeId: string;
  category: { category: KostTypeCategory; label: string };
  facilities: CategoryContentFacility[];
  gallery: Array<Omit<GalleryImage, "propertyId" | "targetType" | "kostTypeId" | "kostTypeName">>;
  publication: {
    facilities: ContentPublicationVersion[];
    gallery: ContentPublicationVersion[];
  };
};

export type PublicTermsContent = {
  pricingExplanation: string;
  minimumLeaseTerm: string;
  dpExplanation: string;
  securityDepositExplanation: string;
  manualPaymentMethods: string[];
  houseRules: string[];
  visitorHours: string;
  contactInformation: string;
  categoryApplicability: KostTypeCategory[];
};

export type PropertyPolicyWorkspace = {
  propertyId: string;
  draft: {
    id: string;
    internalOperatingPolicy: string;
    publicContent: PublicTermsContent;
    restoredFromVersionId: string | null;
    updatedAt: string;
  } | null;
  versions: Array<{
    id: string;
    version: number;
    publicationStatus: "published" | "archived";
    effectiveDate: string | null;
    publicContent: PublicTermsContent;
    restoredFromVersionId: string | null;
    publishedAt: string | null;
    publishedByUserId: string | null;
    createdAt: string;
  }>;
};

export type CategoryFacilityDraft = {
  id?: string;
  label: string;
  publicDescription?: string | null;
  sortOrder: number;
  contentState: "active" | "archived";
  publicVisible: boolean;
};

export type PropertyPolicyDraftInput = {
  propertyId: string;
  internalOperatingPolicy: string;
  publicContent: PublicTermsContent;
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
  effectiveDate?: string;
  paymentSchedules?: Array<"annual" | "two_month_installments">;
  securityDepositMonths?: number;
  publicVisible?: boolean;
  notes?: string;
  status?: MasterStatus;
};

export type KostTypeUpdateInput = Partial<Omit<KostTypeInput, "propertyId" | "category">> & {
  propertyId: string;
};

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
  floorCode: "A" | "B";
  unitCode?: string | null;
  sizeLabel?: string | null;
  primaryPhotoFileId?: string | null;
  publicVisible: boolean;
};

export type RoomInventoryUpdateInput = Partial<Omit<RoomInventoryInput, "propertyId">>;

export type RoomInventorySort =
  | "room_number"
  | "building"
  | "category"
  | "gender_policy"
  | "status"
  | "active_resident"
  | "updated_at";

export type GalleryImageInput = GalleryTarget & {
  propertyId: string;
  sourceFileId: string;
  publicDerivativeFileId: string;
  altText: string;
  caption?: string | null;
};

export type GalleryImageUpdateInput = {
  altText?: string;
  caption?: string | null;
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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function isKostTypeCategory(value: unknown): value is KostTypeCategory {
  return value === "rukost" || value === "apartkost";
}

const KOST_TYPE_BASE_KEYS = [
  "id",
  "property_id",
  "category",
  "name",
  "slug",
  "description_short",
  "description_long",
  "room_size_label",
  "room_size_m2",
  "monthly_price",
  "yearly_price",
  "deposit_amount",
  "max_occupants",
  "public_visible",
  "notes",
  "status",
  "deleted_at",
  "created_at",
  "updated_at",
  "commercial",
  "future_commercial",
] as const;

const COMMERCIAL_AUTHORITY_KEYS = [
  "monthly_price",
  "annual_contract_value",
  "minimum_dp_percent",
  "minimum_dp_amount",
  "payment_schedules",
  "security_deposit_months",
  "security_deposit_required",
  "effective_date",
] as const;

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.includes("T")) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCommercialAuthority(value: unknown): value is Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, COMMERCIAL_AUTHORITY_KEYS) ||
    !Array.isArray(value.payment_schedules) ||
    value.payment_schedules.length === 0 ||
    value.payment_schedules.some(
      (item) => item !== "annual" && item !== "two_month_installments",
    ) ||
    new Set(value.payment_schedules).size !== value.payment_schedules.length ||
    !isPositiveSafeInteger(value.monthly_price) ||
    !isPositiveSafeInteger(value.annual_contract_value) ||
    value.minimum_dp_percent !== 25 ||
    !isPositiveSafeInteger(value.minimum_dp_amount) ||
    (value.security_deposit_months !== 1 && value.security_deposit_months !== 2) ||
    !isPositiveSafeInteger(value.security_deposit_required) ||
    !isCanonicalDate(value.effective_date)
  ) {
    return false;
  }
  return (
    value.minimum_dp_amount ===
      Math.ceil(
        ((value.annual_contract_value as number) * (value.minimum_dp_percent as number)) / 100,
      ) &&
    value.security_deposit_required ===
      (value.monthly_price as number) * (value.security_deposit_months as number)
  );
}

const KOST_TYPE_FACILITY_KEYS = [
  "id",
  "property_id",
  "category_id",
  "name",
  "icon",
  "description",
  "status",
  "sort_order",
] as const;

function parseKostTypeFacility(value: unknown, propertyId: string): Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, KOST_TYPE_FACILITY_KEYS) ||
    !isUuidV4(value.id) ||
    value.property_id !== propertyId ||
    (value.category_id !== null && !isUuidV4(value.category_id)) ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.icon) ||
    !isNullableString(value.description) ||
    (value.status !== "active" && value.status !== "inactive") ||
    !isNonNegativeSafeInteger(value.sort_order)
  ) {
    throw new Error("Invalid kost type facility.");
  }
  return mapSnakeToCamel<Record<string, unknown>>(value);
}

const KOST_TYPE_RULE_KEYS = [
  "id",
  "property_id",
  "kost_type_id",
  "rule_category",
  "icon",
  "rule_text",
  "is_allowed",
  "sort_order",
] as const;

function parseKostTypeRuleRecord(
  value: unknown,
  propertyId: string,
  kostTypeId: string,
): Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, KOST_TYPE_RULE_KEYS) ||
    !isUuidV4(value.id) ||
    value.property_id !== propertyId ||
    (value.kost_type_id !== null && value.kost_type_id !== kostTypeId) ||
    !["general", "guest", "resident", "other", "special_notes"].includes(
      String(value.rule_category),
    ) ||
    !isNullableString(value.icon) ||
    !isNonEmptyString(value.rule_text) ||
    (value.is_allowed !== null && typeof value.is_allowed !== "boolean") ||
    !isNonNegativeSafeInteger(value.sort_order)
  ) {
    throw new Error("Invalid kost type rule.");
  }
  return mapSnakeToCamel<Record<string, unknown>>(value);
}

export function parseKostTypeRecord(value: unknown): KostType {
  if (!isPlainRecord(value)) throw new Error("Invalid kost type record.");
  const optionalKeys = ["room_count", "facility_count", "facilities", "rules"] as const;
  const actual = Object.keys(value);
  if (
    KOST_TYPE_BASE_KEYS.some((key) => !(key in value)) ||
    actual.some(
      (key) =>
        !KOST_TYPE_BASE_KEYS.includes(key as (typeof KOST_TYPE_BASE_KEYS)[number]) &&
        !optionalKeys.includes(key as (typeof optionalKeys)[number]),
    )
  ) {
    throw new Error("Invalid kost type keys.");
  }
  const commercial = value.commercial;
  const futureCommercial = value.future_commercial;
  const facilities = value.facilities;
  const rules = value.rules;
  if (
    !isCommercialAuthority(commercial) ||
    (futureCommercial !== null && !isCommercialAuthority(futureCommercial)) ||
    !isPositiveSafeInteger(value.monthly_price) ||
    !isPositiveSafeInteger(value.yearly_price) ||
    !isPositiveSafeInteger(value.deposit_amount) ||
    value.monthly_price !== commercial.monthly_price ||
    value.yearly_price !== commercial.annual_contract_value ||
    value.deposit_amount !== commercial.security_deposit_required ||
    (futureCommercial !== null &&
      String(futureCommercial.effective_date) <= String(commercial.effective_date)) ||
    !isUuidV4(value.id) ||
    !isUuidV4(value.property_id) ||
    !isKostTypeCategory(value.category) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.slug) ||
    !isNullableString(value.description_short) ||
    !isNullableString(value.description_long) ||
    !isNullableString(value.room_size_label) ||
    (value.room_size_m2 !== null && !isPositiveSafeInteger(value.room_size_m2)) ||
    !isPositiveSafeInteger(value.max_occupants) ||
    typeof value.public_visible !== "boolean" ||
    !isNullableString(value.notes) ||
    (value.status !== "active" && value.status !== "inactive") ||
    (value.deleted_at !== null && !isIsoTimestamp(value.deleted_at)) ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at) ||
    ("room_count" in value && !isNonNegativeSafeInteger(value.room_count)) ||
    ("facility_count" in value && !isNonNegativeSafeInteger(value.facility_count)) ||
    ("facilities" in value && !Array.isArray(facilities)) ||
    ("rules" in value && !Array.isArray(rules))
  ) {
    throw new Error("Invalid kost type authority.");
  }
  const copy: Record<string, unknown> = { ...value };
  if (Array.isArray(facilities)) {
    copy.facilities = facilities.map((item) =>
      parseKostTypeFacility(item, String(value.property_id)),
    );
  }
  if (Array.isArray(rules)) {
    copy.rules = rules.map((item) =>
      parseKostTypeRuleRecord(item, String(value.property_id), String(value.id)),
    );
  }
  return mapSnakeToCamel<KostType>(copy);
}

function parseKostTypeListEnvelope(value: unknown): AdminUxPage<KostType> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data", "meta"]) ||
    !Array.isArray(value.data) ||
    !isPlainRecord(value.meta) ||
    !hasExactKeys(value.meta, ["total", "limit", "offset"])
  ) {
    throw new Error("Invalid kost type list envelope.");
  }
  const { total, limit, offset } = value.meta;
  if (
    ![total, limit, offset].every(
      (item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0,
    )
  ) {
    throw new Error("Invalid kost type pagination.");
  }
  return {
    items: value.data.map(parseKostTypeRecord),
    total: total as number,
    limit: limit as number,
    offset: offset as number,
  };
}

function parseKostTypeDataEnvelope(value: unknown): KostType {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"])) {
    throw new Error("Invalid kost type envelope.");
  }
  return parseKostTypeRecord(value.data);
}

const CATEGORY_CONTENT_FACILITY_KEYS = [
  "id",
  "label",
  "normalized_label",
  "public_description",
  "sort_order",
  "content_state",
  "public_visible",
  "created_at",
  "updated_at",
] as const;
const CATEGORY_CONTENT_GALLERY_KEYS = [
  "id",
  "source_file_id",
  "public_derivative_file_id",
  "source_content_url",
  "public_preview_url",
  "alt_text",
  "caption",
  "sort_order",
  "is_cover",
  "content_state",
  "created_at",
  "updated_at",
] as const;
const CATEGORY_CONTENT_VERSION_KEYS = [
  "id",
  "content_type",
  "version",
  "publication_status",
  "effective_date",
  "restored_from_version_id",
  "published_at",
  "published_by_user_id",
  "created_at",
] as const;
const PUBLIC_TERMS_KEYS = [
  "pricing_explanation",
  "minimum_lease_term",
  "dp_explanation",
  "security_deposit_explanation",
  "manual_payment_methods",
  "house_rules",
  "visitor_hours",
  "contact_information",
  "category_applicability",
] as const;

function nullableUuid(value: unknown): value is string | null {
  return value === null || isUuidV4(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseCategoryContentFacility(value: unknown): CategoryContentFacility {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, CATEGORY_CONTENT_FACILITY_KEYS) ||
    !isUuidV4(value.id) ||
    !isNonEmptyString(value.label) ||
    typeof value.normalized_label !== "string" ||
    !nullableString(value.public_description) ||
    !isIntegerAtLeast(value.sort_order, 0) ||
    (value.content_state !== "active" && value.content_state !== "archived") ||
    typeof value.public_visible !== "boolean" ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("Invalid category facility record.");
  }
  return {
    id: value.id,
    label: value.label,
    normalizedLabel: value.normalized_label,
    publicDescription: value.public_description,
    sortOrder: value.sort_order,
    contentState: value.content_state,
    publicVisible: value.public_visible,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseCategoryGalleryImage(value: unknown): CategoryContentWorkspace["gallery"][number] {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, CATEGORY_CONTENT_GALLERY_KEYS) ||
    !isUuidV4(value.id) ||
    !isUuidV4(value.source_file_id) ||
    !nullableUuid(value.public_derivative_file_id) ||
    !nullableString(value.public_preview_url) ||
    value.source_content_url !== `/api/v1/files/${String(value.source_file_id)}/content` ||
    (value.public_derivative_file_id === null
      ? value.public_preview_url !== null
      : value.public_preview_url !==
        `/api/v1/files/${String(value.public_derivative_file_id)}/content`) ||
    !isNonEmptyString(value.alt_text) ||
    !nullableString(value.caption) ||
    !isIntegerAtLeast(value.sort_order, 0) ||
    typeof value.is_cover !== "boolean" ||
    (value.content_state !== "draft" && value.content_state !== "archived") ||
    !isIsoTimestamp(value.created_at) ||
    !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("Invalid category gallery record.");
  }
  return {
    id: value.id,
    sourceFileId: value.source_file_id,
    publicDerivativeFileId: value.public_derivative_file_id,
    sourceContentUrl: value.source_content_url,
    publicPreviewUrl: value.public_preview_url,
    altText: value.alt_text,
    caption: value.caption,
    sortOrder: value.sort_order,
    isCover: value.is_cover,
    contentState: value.content_state,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseContentPublicationVersion(value: unknown): ContentPublicationVersion {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, CATEGORY_CONTENT_VERSION_KEYS) ||
    !isUuidV4(value.id) ||
    (value.content_type !== "facilities" && value.content_type !== "gallery") ||
    !isIntegerAtLeast(value.version, 1) ||
    (value.publication_status !== "published" && value.publication_status !== "archived") ||
    !isCanonicalDate(value.effective_date) ||
    !nullableUuid(value.restored_from_version_id) ||
    !isIsoTimestamp(value.published_at) ||
    !nullableUuid(value.published_by_user_id) ||
    !isIsoTimestamp(value.created_at)
  ) {
    throw new Error("Invalid category publication version.");
  }
  return {
    id: value.id,
    contentType: value.content_type,
    version: value.version,
    publicationStatus: value.publication_status,
    effectiveDate: value.effective_date,
    restoredFromVersionId: value.restored_from_version_id,
    publishedAt: value.published_at,
    publishedByUserId: value.published_by_user_id,
    createdAt: value.created_at,
  };
}

export function parseCategoryContentWorkspaceEnvelope(
  value: unknown,
  expected?: { propertyId: string; kostTypeId: string },
): CategoryContentWorkspace {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data"]) ||
    !isPlainRecord(value.data) ||
    !hasExactKeys(value.data, [
      "property_id",
      "kost_type_id",
      "category",
      "facilities",
      "gallery",
      "publication",
    ]) ||
    !isUuidV4(value.data.property_id) ||
    !isUuidV4(value.data.kost_type_id) ||
    (expected !== undefined &&
      (value.data.property_id !== expected.propertyId ||
        value.data.kost_type_id !== expected.kostTypeId)) ||
    !isPlainRecord(value.data.category) ||
    !hasExactKeys(value.data.category, ["category", "label"]) ||
    !isKostTypeCategory(value.data.category.category) ||
    !isNonEmptyString(value.data.category.label) ||
    !Array.isArray(value.data.facilities) ||
    !Array.isArray(value.data.gallery) ||
    !isPlainRecord(value.data.publication) ||
    !hasExactKeys(value.data.publication, ["facilities", "gallery"]) ||
    !Array.isArray(value.data.publication.facilities) ||
    !Array.isArray(value.data.publication.gallery)
  ) {
    throw new Error("Invalid category content workspace envelope.");
  }
  return {
    propertyId: value.data.property_id,
    kostTypeId: value.data.kost_type_id,
    category: {
      category: value.data.category.category,
      label: value.data.category.label,
    },
    facilities: value.data.facilities.map(parseCategoryContentFacility),
    gallery: value.data.gallery.map(parseCategoryGalleryImage),
    publication: {
      facilities: value.data.publication.facilities.map(parseContentPublicationVersion),
      gallery: value.data.publication.gallery.map(parseContentPublicationVersion),
    },
  };
}

export function parsePublicTermsContent(value: unknown): PublicTermsContent {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PUBLIC_TERMS_KEYS) ||
    ![
      value.pricing_explanation,
      value.minimum_lease_term,
      value.dp_explanation,
      value.security_deposit_explanation,
      value.visitor_hours,
      value.contact_information,
    ].every(isNonEmptyString) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.visitor_hours)) ||
    !Array.isArray(value.manual_payment_methods) ||
    value.manual_payment_methods.length === 0 ||
    !value.manual_payment_methods.every(isNonEmptyString) ||
    !Array.isArray(value.house_rules) ||
    !value.house_rules.every(isNonEmptyString) ||
    !Array.isArray(value.category_applicability) ||
    value.category_applicability.length === 0 ||
    new Set(value.category_applicability).size !== value.category_applicability.length ||
    !value.category_applicability.every(isKostTypeCategory)
  ) {
    throw new Error("Invalid public terms content.");
  }
  return {
    pricingExplanation: value.pricing_explanation as string,
    minimumLeaseTerm: value.minimum_lease_term as string,
    dpExplanation: value.dp_explanation as string,
    securityDepositExplanation: value.security_deposit_explanation as string,
    manualPaymentMethods: value.manual_payment_methods as string[],
    houseRules: value.house_rules as string[],
    visitorHours: value.visitor_hours as string,
    contactInformation: value.contact_information as string,
    categoryApplicability: value.category_applicability as KostTypeCategory[],
  };
}

function parsePropertyPolicyVersion(value: unknown): PropertyPolicyWorkspace["versions"][number] {
  const keys = [
    "id",
    "version",
    "publication_status",
    "effective_date",
    "public_content",
    "restored_from_version_id",
    "published_at",
    "published_by_user_id",
    "created_at",
  ] as const;
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, keys) ||
    !isUuidV4(value.id) ||
    !isIntegerAtLeast(value.version, 1) ||
    (value.publication_status !== "published" && value.publication_status !== "archived") ||
    (value.effective_date !== null && !isCanonicalDate(value.effective_date)) ||
    !nullableUuid(value.restored_from_version_id) ||
    (value.published_at !== null && !isIsoTimestamp(value.published_at)) ||
    !nullableUuid(value.published_by_user_id) ||
    !isIsoTimestamp(value.created_at)
  ) {
    throw new Error("Invalid property policy version.");
  }
  return {
    id: value.id,
    version: value.version,
    publicationStatus: value.publication_status,
    effectiveDate: value.effective_date,
    publicContent: parsePublicTermsContent(value.public_content),
    restoredFromVersionId: value.restored_from_version_id,
    publishedAt: value.published_at,
    publishedByUserId: value.published_by_user_id,
    createdAt: value.created_at,
  };
}

export function parsePropertyPolicyWorkspaceEnvelope(
  value: unknown,
  expectedPropertyId?: string,
): PropertyPolicyWorkspace {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data"]) ||
    !isPlainRecord(value.data) ||
    !hasExactKeys(value.data, ["property_id", "draft", "versions"]) ||
    !isUuidV4(value.data.property_id) ||
    (expectedPropertyId !== undefined && value.data.property_id !== expectedPropertyId) ||
    !Array.isArray(value.data.versions)
  ) {
    throw new Error("Invalid property policy workspace envelope.");
  }
  let draft: PropertyPolicyWorkspace["draft"] = null;
  if (value.data.draft !== null) {
    const candidate = value.data.draft;
    if (
      !isPlainRecord(candidate) ||
      !hasExactKeys(candidate, [
        "id",
        "internal_operating_policy",
        "public_content",
        "restored_from_version_id",
        "updated_at",
      ]) ||
      !isUuidV4(candidate.id) ||
      typeof candidate.internal_operating_policy !== "string" ||
      !nullableUuid(candidate.restored_from_version_id) ||
      !isIsoTimestamp(candidate.updated_at)
    ) {
      throw new Error("Invalid property policy draft.");
    }
    draft = {
      id: candidate.id,
      internalOperatingPolicy: candidate.internal_operating_policy,
      publicContent: parsePropertyPolicyDraftContent(candidate.public_content),
      restoredFromVersionId: candidate.restored_from_version_id,
      updatedAt: candidate.updated_at,
    };
  }
  return {
    propertyId: value.data.property_id,
    draft,
    versions: value.data.versions.map(parsePropertyPolicyVersion),
  };
}

function parseGalleryRecord(
  value: unknown,
  expected?: { propertyId: string; kostTypeId: string },
): GalleryImage {
  const keys = [
    "id",
    "property_id",
    "target_type",
    "kost_type_id",
    "kost_type_name",
    ...CATEGORY_CONTENT_GALLERY_KEYS.slice(1),
  ];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, keys) ||
    !isUuidV4(value.property_id) ||
    value.target_type !== "kost_type" ||
    !isUuidV4(value.kost_type_id) ||
    !nullableString(value.kost_type_name) ||
    (expected !== undefined &&
      (value.property_id !== expected.propertyId || value.kost_type_id !== expected.kostTypeId))
  ) {
    throw new Error("Invalid gallery record.");
  }
  const image = parseCategoryGalleryImage(
    Object.fromEntries(CATEGORY_CONTENT_GALLERY_KEYS.map((key) => [key, value[key]])),
  );
  return {
    propertyId: value.property_id,
    targetType: "kost_type",
    kostTypeId: value.kost_type_id,
    kostTypeName: value.kost_type_name,
    ...image,
  };
}

export function parseGalleryListEnvelope(
  value: unknown,
  expected?: { propertyId: string; kostTypeId: string },
): AdminUxPage<GalleryImage> {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data", "meta"]) ||
    !Array.isArray(value.data) ||
    !isPlainRecord(value.meta) ||
    !hasExactKeys(value.meta, ["limit", "offset", "total"]) ||
    !isIntegerAtLeast(value.meta.limit, 1) ||
    value.meta.limit > 100 ||
    !isIntegerAtLeast(value.meta.offset, 0) ||
    !isIntegerAtLeast(value.meta.total, 0)
  ) {
    throw new Error("Invalid gallery list envelope.");
  }
  return {
    items: value.data.map((item) => parseGalleryRecord(item, expected)),
    limit: value.meta.limit as number,
    offset: value.meta.offset as number,
    total: value.meta.total as number,
  };
}

export function parseGalleryDataEnvelope(
  value: unknown,
  expected?: { propertyId: string; kostTypeId: string },
): GalleryImage {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"])) {
    throw new Error("Invalid gallery data envelope.");
  }
  return parseGalleryRecord(value.data, expected);
}

function parsePropertyPolicyDraftContent(value: unknown): PublicTermsContent {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PUBLIC_TERMS_KEYS) ||
    ![
      value.pricing_explanation,
      value.minimum_lease_term,
      value.dp_explanation,
      value.security_deposit_explanation,
      value.visitor_hours,
      value.contact_information,
    ].every((item) => typeof item === "string") ||
    (value.visitor_hours !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.visitor_hours))) ||
    !Array.isArray(value.manual_payment_methods) ||
    !value.manual_payment_methods.every((item) => typeof item === "string") ||
    !Array.isArray(value.house_rules) ||
    !value.house_rules.every((item) => typeof item === "string") ||
    !Array.isArray(value.category_applicability) ||
    new Set(value.category_applicability).size !== value.category_applicability.length ||
    !value.category_applicability.every(isKostTypeCategory)
  ) {
    throw new Error("Invalid property policy draft content.");
  }
  return {
    pricingExplanation: value.pricing_explanation as string,
    minimumLeaseTerm: value.minimum_lease_term as string,
    dpExplanation: value.dp_explanation as string,
    securityDepositExplanation: value.security_deposit_explanation as string,
    manualPaymentMethods: value.manual_payment_methods as string[],
    houseRules: value.house_rules as string[],
    visitorHours: value.visitor_hours as string,
    contactInformation: value.contact_information as string,
    categoryApplicability: value.category_applicability as KostTypeCategory[],
  };
}

function parseGalleryArrayEnvelope(
  value: unknown,
  expected?: { propertyId: string; kostTypeId: string },
): GalleryImage[] {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["data"]) || !Array.isArray(value.data)) {
    throw new Error("Invalid gallery array envelope.");
  }
  return value.data.map((item) => parseGalleryRecord(item, expected));
}

function parseGalleryArchiveEnvelope(value: unknown): { id: string; archived: true } {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["data"]) ||
    !isPlainRecord(value.data) ||
    !hasExactKeys(value.data, ["id", "archived"]) ||
    !isUuidV4(value.data.id) ||
    value.data.archived !== true
  ) {
    throw new Error("Invalid gallery archive envelope.");
  }
  return { id: value.data.id, archived: true };
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

export function parseRoomInventoryMutationEnvelope(value: unknown): RoomInventory {
  const room = parseRoomInventoryDetailEnvelope(value);
  const identifiers = [room.id, room.propertyId, room.buildingId, room.kostType.id];
  if (room.primaryPhotoFileId !== null && room.primaryPhotoFileId !== undefined) {
    identifiers.push(room.primaryPhotoFileId);
  }
  for (const facility of room.kostType.facilities ?? []) {
    identifiers.push(facility.id);
    if (facility.categoryId !== null && facility.categoryId !== undefined) {
      identifiers.push(facility.categoryId);
    }
  }
  if (!identifiers.every(isUuidV4)) {
    throw new Error("Invalid room mutation identifiers.");
  }
  if (
    ![room.kostType.monthlyPrice, room.kostType.yearlyPrice, room.kostType.depositAmount].every(
      (amount) => Number.isInteger(amount) && amount >= 0,
    )
  ) {
    throw new Error("Invalid room mutation commercial snapshot.");
  }
  const canonicalFloor =
    room.floorCode === "A"
      ? { floor: "2", label: "Lantai Atas / LT.2" }
      : room.floorCode === "B"
        ? { floor: "1", label: "Lantai Bawah / LT.1" }
        : null;
  if (
    (room.genderPolicy !== "male" && room.genderPolicy !== "female") ||
    !canonicalFloor ||
    room.floor !== canonicalFloor.floor ||
    room.floorLabel !== canonicalFloor.label ||
    !isNonEmptyString(room.buildingCode) ||
    !isNonEmptyString(room.buildingName) ||
    room.activeLease !== null
  ) {
    throw new Error("Invalid room mutation authority snapshot.");
  }
  return room;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isPlainRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error(`Invalid room detail ${label}.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (!isNonEmptyString(value)) throw new Error(`Invalid room detail ${label}.`);
  return value;
}

function nullableDetailString(value: unknown, label: string): string | null {
  if (!isNullableString(value)) throw new Error(`Invalid room detail ${label}.`);
  return value;
}

function safeMoney(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Invalid room detail ${label}.`);
  }
  return Number(value);
}

function nullableSafeMoney(value: unknown, label: string): number | null {
  return value === null ? null : safeMoney(value, label);
}

function dateLike(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(candidate);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    candidate,
  );
  if ((!dateOnly && !timestamp) || Number.isNaN(Date.parse(candidate))) {
    throw new Error(`Invalid room detail ${label}.`);
  }
  return candidate;
}

function exactEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Invalid room detail ${label}.`);
  }
  return value as T;
}

const ACCOUNT_STATUSES = ["active", "inactive", "suspended"] as const;
const LEASE_STATUSES = ["active"] as const;
const PAYMENT_PLANS = ["monthly", "yearly"] as const;
const OCCUPANCY_STATES = ["active"] as const;
const VEHICLE_TYPES = ["motorcycle", "car", "bicycle", "electric_scooter", "other"] as const;
const PARKING_STATES = ["available", "occupied", "reserved", "maintenance"] as const;
const COMPLAINT_STATUSES = [
  "submitted",
  "acknowledged",
  "in_progress",
  "on_hold",
  "escalated",
  "resolved",
  "reopened",
] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const WORK_ORDER_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "rework_required",
  "verified",
  "cancelled",
] as const;
const TIMELINE_EVENT_LABELS = {
  room_updated: "Inventori kamar diperbarui",
  hold_created: "Kamar ditahan untuk minat booking",
  hold_released: "Hold kamar dilepas",
  hold_expired: "Hold kamar kedaluwarsa",
  occupancy_check_in: "Penghuni check-in",
  occupancy_check_out: "Penghuni check-out",
  lease_created: "Penyewaan diaktifkan",
  lease_updated: "Penyewaan diperbarui",
  lease_invoice_generated: "Tagihan penyewaan dibuat",
  lease_deposit_collected: "Deposit jaminan diterima",
  lease_deposit_refunded: "Deposit jaminan dikembalikan",
  lease_deposit_deducted: "Deposit jaminan dipotong",
  lease_closed: "Penyewaan ditutup",
  lease_transferred_out: "Penyewaan dipindahkan dari kamar",
  lease_transferred_in: "Penyewaan dipindahkan ke kamar",
  maintenance_open: "Work order perawatan dibuka",
  maintenance_assigned: "Work order perawatan ditugaskan",
  maintenance_in_progress: "Perawatan sedang dikerjakan",
  maintenance_on_hold: "Perawatan ditunda",
  maintenance_completed: "Perawatan diselesaikan",
  maintenance_verified: "Perawatan diverifikasi",
  maintenance_cancelled: "Perawatan dibatalkan",
} as const;

export function parseRoomDetailEnvelope(value: unknown): RoomDetail {
  const envelope = exactRecord(value, ["data"], "envelope");
  const data = exactRecord(
    envelope.data,
    [
      "id",
      "property_id",
      "number",
      "room_code",
      "building",
      "category",
      "physical",
      "commercial",
      "resident",
      "lease",
      "reconciliation",
      "billing",
      "vehicles",
      "complaints",
      "ownership",
      "timeline",
      "links",
      "updated_at",
    ],
    "record",
  );
  if (!isUuidV4(data.id) || !isUuidV4(data.property_id)) {
    throw new Error("Invalid room detail scope.");
  }
  const building = exactRecord(data.building, ["id", "code", "name"], "building");
  const category = exactRecord(data.category, ["id", "code", "name"], "category");
  const physical = exactRecord(
    data.physical,
    [
      "unit_code",
      "floor_code",
      "floor_label",
      "size_label",
      "primary_photo_file_id",
      "gender_policy",
      "status",
      "public_visible",
      "notes",
      "structural_edit_locked",
    ],
    "physical",
  );
  const commercial = exactRecord(
    data.commercial,
    [
      "source",
      "monthly_price",
      "annual_contract_value",
      "minimum_dp_amount",
      "minimum_dp_label",
      "security_deposit_required",
      "payment_plan_description",
      "facilities",
    ],
    "commercial",
  );
  if (
    !isUuidV4(building.id) ||
    !isUuidV4(category.id) ||
    !isKostTypeCategory(category.code) ||
    (physical.primary_photo_file_id !== null && !isUuidV4(physical.primary_photo_file_id)) ||
    (physical.floor_code !== "A" && physical.floor_code !== "B") ||
    (physical.gender_policy !== "male" && physical.gender_policy !== "female") ||
    !isRoomStatus(physical.status) ||
    typeof physical.public_visible !== "boolean" ||
    typeof physical.structural_edit_locked !== "boolean" ||
    commercial.source !== "current_category" ||
    !Array.isArray(commercial.facilities)
  ) {
    throw new Error("Invalid room detail authority.");
  }
  const facilities = commercial.facilities.map((value) => {
    const record = exactRecord(value, ["id", "name"], "facility");
    if (!isUuidV4(record.id)) throw new Error("Invalid room detail facility.");
    return { id: record.id, name: requiredString(record.name, "facility name") };
  });
  const resident =
    data.resident === null
      ? null
      : exactRecord(
          data.resident,
          ["display_name", "account_status", "university", "occupancy_start"],
          "resident",
        );
  const lease =
    data.lease === null
      ? null
      : exactRecord(
          data.lease,
          [
            "id",
            "code",
            "status",
            "start_date",
            "end_date",
            "duration_months",
            "payment_plan",
            "occupancy_start",
            "occupancy_end",
            "occupancy_state",
          ],
          "lease",
        );
  const leaseId: string | null = lease
    ? (() => {
        if (!isUuidV4(lease.id)) throw new Error("Invalid room detail lease.");
        return lease.id;
      })()
    : null;
  const reconciliation = exactRecord(data.reconciliation, ["state", "messages"], "reconciliation");
  if (
    (reconciliation.state !== "normal" &&
      reconciliation.state !== "lease_reconciliation_required") ||
    !Array.isArray(reconciliation.messages) ||
    !reconciliation.messages.every(isNonEmptyString)
  ) {
    throw new Error("Invalid room detail reconciliation.");
  }
  const relationshipMismatch = Boolean(resident) !== Boolean(lease);
  const reconciliationRequired = reconciliation.state === "lease_reconciliation_required";
  if (
    relationshipMismatch !== reconciliationRequired ||
    (reconciliationRequired && reconciliation.messages.length === 0) ||
    (!reconciliationRequired && reconciliation.messages.length > 0)
  ) {
    throw new Error("Invalid room detail relationship.");
  }
  const billing = exactRecord(
    data.billing,
    [
      "contract_value",
      "verified_invoice_allocated",
      "unpaid_amount",
      "next_due_date",
      "next_due_period",
      "minimum_dp_amount",
      "dp_verified_amount",
      "dp_progress_label",
      "security_deposit_required",
      "deposit_held",
      "deposit_refunded",
      "deposit_deducted",
      "awaiting_confirmation_amount",
    ],
    "billing",
  );
  const vehicles = Array.isArray(data.vehicles)
    ? data.vehicles.map((value) => {
        const record = exactRecord(
          value,
          ["code", "plate_number", "vehicle_type", "parking_state"],
          "vehicle",
        );
        return {
          code: requiredString(record.code, "vehicle code"),
          plateNumber: requiredString(record.plate_number, "vehicle plate"),
          vehicleType: exactEnum(record.vehicle_type, VEHICLE_TYPES, "vehicle type"),
          parkingState:
            record.parking_state === null
              ? null
              : exactEnum(record.parking_state, PARKING_STATES, "parking state"),
        };
      })
    : (() => {
        throw new Error("Invalid room detail vehicles.");
      })();
  const complaints = Array.isArray(data.complaints)
    ? data.complaints.map((value) => {
        const record = exactRecord(
          value,
          [
            "code",
            "category",
            "status",
            "priority",
            "work_order_code",
            "work_order_status",
            "technician_name",
          ],
          "complaint",
        );
        return {
          code: requiredString(record.code, "complaint code"),
          category: requiredString(record.category, "complaint category"),
          status: exactEnum(record.status, COMPLAINT_STATUSES, "complaint status"),
          priority: exactEnum(record.priority, PRIORITIES, "complaint priority"),
          workOrderCode: nullableDetailString(record.work_order_code, "work order code"),
          workOrderStatus:
            record.work_order_status === null
              ? null
              : exactEnum(record.work_order_status, WORK_ORDER_STATUSES, "work order status"),
          technicianName: nullableDetailString(record.technician_name, "technician name"),
        };
      })
    : (() => {
        throw new Error("Invalid room detail complaints.");
      })();
  const ownership = exactRecord(
    data.ownership,
    ["display_name", "source", "ownership_reconciliation_required"],
    "ownership",
  );
  if (
    ownership.display_name !== "KOSTATION" ||
    ownership.source !== "policy_default" ||
    ownership.ownership_reconciliation_required !== true
  ) {
    throw new Error("Invalid room detail ownership.");
  }
  const timeline = Array.isArray(data.timeline)
    ? data.timeline.map((value) => {
        const record = exactRecord(value, ["event_type", "label", "occurred_at"], "timeline");
        const eventType = requiredString(record.event_type, "timeline event");
        const expectedLabel =
          TIMELINE_EVENT_LABELS[eventType as keyof typeof TIMELINE_EVENT_LABELS];
        if (!expectedLabel || record.label !== expectedLabel) {
          throw new Error("Invalid room detail timeline event.");
        }
        return {
          eventType,
          label: expectedLabel,
          occurredAt: dateLike(record.occurred_at, "timeline timestamp"),
        };
      })
    : (() => {
        throw new Error("Invalid room detail timeline.");
      })();
  const links = exactRecord(
    data.links,
    ["resident", "lease", "billing", "vehicles", "complaints"],
    "links",
  );
  const expectedLeaseLink = leaseId ? `/penyewaan/${leaseId}` : null;
  if (
    links.resident !== null ||
    links.billing !== null ||
    links.vehicles !== null ||
    links.complaints !== null ||
    links.lease !== expectedLeaseLink
  ) {
    throw new Error("Invalid room detail links.");
  }
  return {
    id: data.id,
    propertyId: data.property_id,
    number: requiredString(data.number, "number"),
    roomCode: nullableDetailString(data.room_code, "room code"),
    building: {
      id: building.id,
      code: requiredString(building.code, "building code"),
      name: requiredString(building.name, "building name"),
    },
    category: {
      id: category.id,
      code: category.code,
      name: requiredString(category.name, "category name"),
    },
    physical: {
      unitCode: nullableDetailString(physical.unit_code, "unit code"),
      floorCode: physical.floor_code,
      floorLabel: requiredString(physical.floor_label, "floor label"),
      sizeLabel: nullableDetailString(physical.size_label, "size label"),
      primaryPhotoFileId: nullableDetailString(
        physical.primary_photo_file_id,
        "primary photo file",
      ),
      genderPolicy: physical.gender_policy,
      status: physical.status,
      publicVisible: physical.public_visible,
      notes: nullableDetailString(physical.notes, "notes"),
      structuralEditLocked: physical.structural_edit_locked,
    },
    commercial: {
      source: "current_category",
      monthlyPrice: safeMoney(commercial.monthly_price, "monthly price"),
      annualContractValue: safeMoney(commercial.annual_contract_value, "annual value"),
      minimumDpAmount: safeMoney(commercial.minimum_dp_amount, "minimum DP"),
      minimumDpLabel: requiredString(commercial.minimum_dp_label, "minimum DP label"),
      securityDepositRequired: safeMoney(commercial.security_deposit_required, "security deposit"),
      paymentPlanDescription: requiredString(commercial.payment_plan_description, "payment plan"),
      facilities,
    },
    resident: resident
      ? {
          displayName: requiredString(resident.display_name, "resident name"),
          accountStatus: exactEnum(resident.account_status, ACCOUNT_STATUSES, "account status"),
          university:
            resident.university === null
              ? null
              : (() => {
                  throw new Error("Invalid room detail university authority.");
                })(),
          occupancyStart: dateLike(resident.occupancy_start, "occupancy start"),
        }
      : null,
    lease: lease
      ? {
          id: leaseId!,
          code: requiredString(lease.code, "lease code"),
          status: exactEnum(lease.status, LEASE_STATUSES, "lease status"),
          startDate: dateLike(lease.start_date, "lease start"),
          endDate: lease.end_date === null ? null : dateLike(lease.end_date, "lease end"),
          durationMonths: safeMoney(lease.duration_months, "lease duration"),
          paymentPlan: exactEnum(lease.payment_plan, PAYMENT_PLANS, "lease payment plan"),
          occupancyStart:
            lease.occupancy_start === null
              ? null
              : dateLike(lease.occupancy_start, "lease occupancy start"),
          occupancyEnd:
            lease.occupancy_end === null
              ? null
              : dateLike(lease.occupancy_end, "lease occupancy end"),
          occupancyState:
            lease.occupancy_state === null
              ? null
              : exactEnum(lease.occupancy_state, OCCUPANCY_STATES, "occupancy state"),
        }
      : null,
    reconciliation: {
      state: reconciliation.state,
      messages: reconciliation.messages as string[],
    },
    billing: {
      contractValue: nullableSafeMoney(billing.contract_value, "contract value"),
      verifiedInvoiceAllocated: safeMoney(
        billing.verified_invoice_allocated,
        "verified invoice allocated",
      ),
      unpaidAmount: safeMoney(billing.unpaid_amount, "unpaid amount"),
      nextDueDate:
        billing.next_due_date === null ? null : dateLike(billing.next_due_date, "next due"),
      nextDuePeriod: nullableDetailString(billing.next_due_period, "next due period"),
      minimumDpAmount: safeMoney(billing.minimum_dp_amount, "billing minimum DP"),
      dpVerifiedAmount:
        billing.dp_verified_amount === null
          ? null
          : (() => {
              throw new Error("Invalid room detail DP authority.");
            })(),
      dpProgressLabel: requiredString(billing.dp_progress_label, "DP progress"),
      securityDepositRequired: safeMoney(
        billing.security_deposit_required,
        "billing deposit required",
      ),
      depositHeld: safeMoney(billing.deposit_held, "deposit held"),
      depositRefunded: safeMoney(billing.deposit_refunded, "deposit refunded"),
      depositDeducted: safeMoney(billing.deposit_deducted, "deposit deducted"),
      awaitingConfirmationAmount: safeMoney(
        billing.awaiting_confirmation_amount,
        "awaiting confirmation",
      ),
    },
    vehicles,
    complaints,
    ownership: {
      displayName: "KOSTATION",
      source: "policy_default",
      ownershipReconciliationRequired: true,
    },
    timeline,
    links: {
      resident: null,
      lease: links.lease as string | null,
      billing: null,
      vehicles: null,
      complaints: null,
    },
    updatedAt: dateLike(data.updated_at, "updated timestamp"),
  };
}

export function assertRoomDetailScope(
  detail: RoomDetail,
  expectedPropertyId: string,
  expectedRoomNumber: string,
): RoomDetail {
  if (detail.propertyId !== expectedPropertyId || detail.number !== expectedRoomNumber.trim()) {
    throw new Error("ROOM_DETAIL_SCOPE_MISMATCH");
  }
  return detail;
}

export function roomDetailToInventory(detail: RoomDetail): RoomInventory {
  return {
    id: detail.id,
    propertyId: detail.propertyId,
    number: detail.number,
    roomCode: detail.roomCode,
    buildingId: detail.building.id,
    buildingCode: detail.building.code,
    buildingName: detail.building.name,
    unitCode: detail.physical.unitCode,
    genderPolicy: detail.physical.genderPolicy,
    floor: detail.physical.floorCode === "A" ? "2" : "1",
    floorCode: detail.physical.floorCode,
    floorLabel: detail.physical.floorLabel,
    sizeLabel: detail.physical.sizeLabel,
    status: detail.physical.status,
    primaryPhotoFileId: detail.physical.primaryPhotoFileId,
    publicVisible: detail.physical.publicVisible,
    kostType: {
      id: detail.category.id,
      name: detail.category.name,
      slug: detail.category.code,
      category: detail.category.code,
      monthlyPrice: detail.commercial.monthlyPrice,
      yearlyPrice: detail.commercial.annualContractValue,
      depositAmount: detail.commercial.securityDepositRequired,
      facilities: detail.commercial.facilities.map((facility, sortOrder) => ({
        id: facility.id,
        name: facility.name,
        icon: null,
        description: null,
        categoryId: null,
        sortOrder,
      })),
    },
    activeLease: detail.lease
      ? { leaseCode: detail.lease.code, residentName: detail.resident?.displayName }
      : null,
    activeOccupancy: null,
    leaseReconciliationRequired: detail.reconciliation.state === "lease_reconciliation_required",
    structuralEditLocked: detail.physical.structuralEditLocked,
  };
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

export function kostTypeBody(input: KostTypeInput | KostTypeUpdateInput): Record<string, unknown> {
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
    effective_date: input.effectiveDate,
    payment_schedules: input.paymentSchedules,
    security_deposit_months: input.securityDepositMonths,
    public_visible: input.publicVisible,
    notes: input.notes,
    status: input.status,
  };
}

/** The only room serializer used by M4. It has no price, deposit, or facilities. */
export type LegacyRoomInventoryBodyInput = {
  propertyId?: string;
  kostTypeId?: string;
  number?: string;
  roomCode?: string | null;
  buildingId?: string;
  floor?: string | null;
  floorCode?: "A" | "B" | null;
  floorLabel?: string | null;
  unitCode?: string | null;
  genderPolicy?: RoomGenderPolicy | null;
  sizeLabel?: string | null;
  primaryPhotoFileId?: string | null;
  publicVisible?: boolean;
};

/** Compatibility helper for existing non-persistence contract tests; M15 writes do not call it. */
export function toRoomInventoryBody(input: LegacyRoomInventoryBodyInput): Record<string, unknown> {
  return {
    property_id: input.propertyId,
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

export function toRoomPersistenceBody(
  input: RoomInventoryInput | RoomInventoryUpdateInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value;
  };
  if ("propertyId" in input) assign("property_id", input.propertyId);
  assign("kost_type_id", input.kostTypeId);
  assign("number", input.number);
  assign("room_code", input.roomCode);
  assign("building_id", input.buildingId);
  assign("floor_code", input.floorCode);
  assign("unit_code", input.unitCode);
  assign("size_label", input.sizeLabel);
  assign("primary_photo_file_id", input.primaryPhotoFileId);
  assign("public_visible", input.publicVisible);
  return body;
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
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/kost-types", {
          query: {
            ...pageQuery(input),
            category: input.category,
            q: input.q?.trim() || undefined,
            status: input.status,
          },
        })
        .then(parseKostTypeListEnvelope),
    detail: (id: string) =>
      adminUxV2Requester
        .get<V2DataEnvelope<unknown>>("/kost-types/" + encodeURIComponent(id))
        .then(parseKostTypeDataEnvelope),
    create: (input: KostTypeInput, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<V2DataEnvelope<unknown>>("/kost-types", kostTypeBody(input), {
          idempotencyKey,
        })
        .then(parseKostTypeDataEnvelope),
    update: (id: string, input: KostTypeUpdateInput, idempotencyKey?: string) =>
      adminUxV2Requester
        .patch<
          V2DataEnvelope<unknown>
        >("/kost-types/" + encodeURIComponent(id), kostTypeBody(input), { idempotencyKey })
        .then(parseKostTypeDataEnvelope),
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
        floorCode?: "A" | "B";
        status?: RoomStatus;
        genderPolicy?: "male" | "female";
        activeOccupancy?: boolean;
        reconciliationState?: "normal" | "requires_review";
        sort?: RoomInventorySort;
        order?: "asc" | "desc";
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
            floor_code: input.floorCode,
            status: input.status,
            gender_policy: input.genderPolicy,
            active_occupancy: input.activeOccupancy,
            reconciliation_state: input.reconciliationState,
            sort: input.sort,
            order: input.order,
            q: input.q?.trim() || undefined,
            include_active_lease: input.includeActiveLease,
          },
        })
        .then((value) => parseRoomInventoryListEnvelope(value, input.includeActiveLease ?? false)),
    availability: (propertyId: string) =>
      adminUxV2Requester
        .get<unknown>("/rooms/availability", { query: { property_id: propertyId } })
        .then(parseRoomAvailabilityEnvelope),
    buildings: (propertyId: string, category?: KostTypeCategory) =>
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
    detailByNumber: (propertyId: string, roomNumber: string) =>
      adminUxV2Requester
        .get<unknown>("/rooms/by-number/" + encodeURIComponent(roomNumber.trim()), {
          query: { property_id: propertyId },
        })
        .then(parseRoomDetailEnvelope),
    update: (id: string, input: RoomInventoryUpdateInput, idempotencyKey?: string) =>
      adminUxV2Requester
        .patch<unknown>("/rooms/" + encodeURIComponent(id), toRoomPersistenceBody(input), {
          idempotencyKey,
        })
        .then(parseRoomInventoryMutationEnvelope),
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
  categoryContent: {
    get: (propertyId: string, kostTypeId: string) =>
      adminUxV2Requester
        .get<unknown>(`/kost-types/${encodeURIComponent(kostTypeId)}/content`, {
          query: { property_id: propertyId },
        })
        .then((value) => parseCategoryContentWorkspaceEnvelope(value, { propertyId, kostTypeId })),
    replaceFacilities: (
      propertyId: string,
      kostTypeId: string,
      items: CategoryFacilityDraft[],
      idempotencyKey?: string,
    ) =>
      adminUxV2Requester
        .put<unknown>(
          `/kost-types/${encodeURIComponent(kostTypeId)}/content/facilities`,
          {
            property_id: propertyId,
            items: items.map((item) => ({
              id: item.id,
              label: item.label,
              public_description: item.publicDescription,
              sort_order: item.sortOrder,
              content_state: item.contentState,
              public_visible: item.publicVisible,
            })),
          },
          { idempotencyKey },
        )
        .then((value) => parseCategoryContentWorkspaceEnvelope(value, { propertyId, kostTypeId })),
    publish: (
      propertyId: string,
      kostTypeId: string,
      contentType: "facilities" | "gallery",
      effectiveDate: string,
      idempotencyKey?: string,
    ) =>
      adminUxV2Requester
        .post<unknown>(
          `/kost-types/${encodeURIComponent(kostTypeId)}/content/publish`,
          {
            property_id: propertyId,
            content_type: contentType,
            effective_date: effectiveDate,
          },
          { idempotencyKey },
        )
        .then((value) => parseCategoryContentWorkspaceEnvelope(value, { propertyId, kostTypeId })),
    unpublish: (
      propertyId: string,
      kostTypeId: string,
      contentType: "facilities" | "gallery",
      idempotencyKey?: string,
    ) =>
      adminUxV2Requester
        .post<unknown>(
          `/kost-types/${encodeURIComponent(kostTypeId)}/content/unpublish`,
          { property_id: propertyId, content_type: contentType },
          { idempotencyKey },
        )
        .then((value) => parseCategoryContentWorkspaceEnvelope(value, { propertyId, kostTypeId })),
    restore: (propertyId: string, kostTypeId: string, versionId: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          `/kost-types/${encodeURIComponent(kostTypeId)}/content/restore`,
          { property_id: propertyId, version_id: versionId },
          { idempotencyKey },
        )
        .then((value) => parseCategoryContentWorkspaceEnvelope(value, { propertyId, kostTypeId })),
  },
  propertyPolicy: {
    get: (propertyId: string) =>
      adminUxV2Requester
        .get<unknown>("/property-policy-documents", {
          query: { property_id: propertyId },
        })
        .then((value) => parsePropertyPolicyWorkspaceEnvelope(value, propertyId)),
    saveDraft: (input: PropertyPolicyDraftInput, idempotencyKey?: string) =>
      adminUxV2Requester
        .put<unknown>(
          "/property-policy-documents/draft",
          {
            property_id: input.propertyId,
            internal_operating_policy: input.internalOperatingPolicy,
            public_content: {
              pricing_explanation: input.publicContent.pricingExplanation,
              minimum_lease_term: input.publicContent.minimumLeaseTerm,
              dp_explanation: input.publicContent.dpExplanation,
              security_deposit_explanation: input.publicContent.securityDepositExplanation,
              manual_payment_methods: input.publicContent.manualPaymentMethods,
              house_rules: input.publicContent.houseRules,
              visitor_hours: input.publicContent.visitorHours,
              contact_information: input.publicContent.contactInformation,
              category_applicability: input.publicContent.categoryApplicability,
            },
          },
          { idempotencyKey },
        )
        .then((value) => parsePropertyPolicyWorkspaceEnvelope(value, input.propertyId)),
    publish: (propertyId: string, effectiveDate: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          "/property-policy-documents/publish",
          { property_id: propertyId, effective_date: effectiveDate },
          { idempotencyKey },
        )
        .then((value) => parsePropertyPolicyWorkspaceEnvelope(value, propertyId)),
    unpublish: (propertyId: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          "/property-policy-documents/unpublish",
          { property_id: propertyId },
          { idempotencyKey },
        )
        .then((value) => parsePropertyPolicyWorkspaceEnvelope(value, propertyId)),
    restore: (propertyId: string, versionId: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          "/property-policy-documents/restore",
          { property_id: propertyId, version_id: versionId },
          { idempotencyKey },
        )
        .then((value) => parsePropertyPolicyWorkspaceEnvelope(value, propertyId)),
  },
  gallery: {
    list: (input: PropertyPageInput & GalleryTarget) =>
      adminUxV2Requester
        .get<unknown>("/hunian-gallery", {
          query: {
            ...pageQuery(input),
            target_type: "kost_type",
            kost_type_id: input.kostTypeId,
          },
        })
        .then((value) =>
          parseGalleryListEnvelope(value, {
            propertyId: input.propertyId,
            kostTypeId: input.kostTypeId,
          }),
        ),
    create: (input: GalleryImageInput, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          "/hunian-gallery",
          {
            property_id: input.propertyId,
            target_type: "kost_type",
            kost_type_id: input.kostTypeId,
            file_id: input.sourceFileId,
            public_derivative_file_id: input.publicDerivativeFileId,
            alt_text: input.altText,
            caption: input.caption ?? undefined,
          },
          { idempotencyKey },
        )
        .then((value) =>
          parseGalleryDataEnvelope(value, {
            propertyId: input.propertyId,
            kostTypeId: input.kostTypeId,
          }),
        ),
    update: (
      propertyId: string,
      kostTypeId: string,
      id: string,
      input: GalleryImageUpdateInput,
      idempotencyKey?: string,
    ) =>
      adminUxV2Requester
        .patch<unknown>(
          "/hunian-gallery/" + encodeURIComponent(id),
          {
            property_id: propertyId,
            alt_text: input.altText,
            caption: input.caption,
          },
          { idempotencyKey },
        )
        .then((value) => parseGalleryDataEnvelope(value, { propertyId, kostTypeId })),
    setCover: (propertyId: string, kostTypeId: string, id: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .post<unknown>(
          "/hunian-gallery/" + encodeURIComponent(id) + "/set-cover",
          { property_id: propertyId },
          { idempotencyKey },
        )
        .then((value) => parseGalleryDataEnvelope(value, { propertyId, kostTypeId })),
    reorder: (
      propertyId: string,
      target: GalleryTarget,
      items: ReorderItem[],
      idempotencyKey?: string,
    ) =>
      adminUxV2Requester
        .put<unknown>(
          "/hunian-gallery/reorder",
          {
            property_id: propertyId,
            target_type: "kost_type",
            kost_type_id: target.kostTypeId,
            items: reorderItems(items),
          },
          { idempotencyKey },
        )
        .then((value) =>
          parseGalleryArrayEnvelope(value, {
            propertyId,
            kostTypeId: target.kostTypeId,
          }),
        ),
    remove: (propertyId: string, id: string, idempotencyKey?: string) =>
      adminUxV2Requester
        .delete<unknown>("/hunian-gallery/" + encodeURIComponent(id), {
          query: { property_id: propertyId },
          idempotencyKey,
        })
        .then(parseGalleryArchiveEnvelope),
  },
};
