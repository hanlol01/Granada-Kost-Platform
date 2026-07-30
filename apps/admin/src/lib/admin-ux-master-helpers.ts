import type {
  KostType,
  KostTypeCategory,
  RoomAvailabilityItem,
  RoomInventory,
  RoomStatus,
} from "@/lib/admin-ux-master-api";

export type RoomRouteSearch = {
  q: string;
  category?: KostTypeCategory;
  buildingId?: string;
  floor?: string;
  floorCode?: "A" | "B";
  status?: RoomStatus;
  visibility?: "visible" | "hidden";
  genderPolicy?: "male" | "female";
  activeOccupancy?: boolean;
  reconciliationState?: "normal" | "requires_review";
  sort?:
    | "room_number"
    | "building"
    | "category"
    | "gender_policy"
    | "status"
    | "active_resident"
    | "updated_at";
  order?: "asc" | "desc";
  offset: number;
  limit: number;
  roomId?: string;
};

const ROOM_WRITE_ROLES = new Set(["owner", "manager", "admin"]);

export function normalizeRoomCreateRequest(value: unknown): boolean {
  return value === true || value === "true";
}

export function hasRoomWriteAuthority(
  roles: readonly string[],
  hasRoomManage: boolean,
  propertyId: string | null | undefined,
): boolean {
  return Boolean(propertyId && hasRoomManage && roles.some((role) => ROOM_WRITE_ROLES.has(role)));
}

export function hasAuthoritativeRoomReferences(
  buildingId: string,
  kostTypeId: string,
  buildingIds: readonly string[],
  activeKostTypeIds: readonly string[],
): { building: boolean; kostType: boolean } {
  return {
    building: Boolean(buildingId && buildingIds.includes(buildingId)),
    kostType: Boolean(kostTypeId && activeKostTypeIds.includes(kostTypeId)),
  };
}

export function roomStructuralEditLocked(
  room: Pick<RoomInventory, "status" | "activeLease" | "activeOccupancy"> | null | undefined,
): boolean {
  return Boolean(
    room &&
    (room.status === "reserved" ||
      room.status === "occupied" ||
      room.activeLease ||
      room.activeOccupancy),
  );
}

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  vacant: "Kosong",
  reserved: "Dipesan",
  occupied: "Terisi",
  maintenance: "Maintenance",
  inactive: "Tidak Aktif",
  requires_review: "Perlu Review",
};

export const KOST_TYPE_LABEL: Record<KostTypeCategory, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

export type RoomInventorySummary = {
  statusCounts: Record<RoomStatus, number>;
  totalInventory: number;
  categoryCounts: Record<KostTypeCategory, number>;
};

export type RoomPaginationDisplay = {
  isEmptyPage: boolean;
  start: number | null;
  end: number | null;
  label: string;
};

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function summarizeRoomInventory(
  propertyId: string,
  availability: readonly Pick<RoomAvailabilityItem, "propertyId" | "status" | "total">[],
  kostTypes: readonly Pick<KostType, "propertyId" | "category" | "roomCount" | "status">[],
): RoomInventorySummary {
  const statusCounts: Record<RoomStatus, number> = {
    vacant: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0,
    inactive: 0,
    requires_review: 0,
  };
  for (const item of availability) {
    if (item.propertyId === propertyId) {
      statusCounts[item.status] += nonNegativeInteger(item.total);
    }
  }

  const categoryCounts: Record<KostTypeCategory, number> = {
    rukost: 0,
    apartkost: 0,
  };
  for (const kostType of kostTypes) {
    if (kostType.propertyId === propertyId) {
      categoryCounts[kostType.category] += nonNegativeInteger(kostType.roomCount ?? 0);
    }
  }

  return {
    statusCounts,
    totalInventory: Object.values(statusCounts).reduce((total, count) => total + count, 0),
    categoryCounts,
  };
}

export function getRoomPaginationDisplay(
  offset: number,
  limit: number,
  total: number,
): RoomPaginationDisplay {
  const safeOffset = nonNegativeInteger(offset);
  const safeLimit = Math.max(1, nonNegativeInteger(limit));
  const safeTotal = nonNegativeInteger(total);
  if (safeTotal === 0 || safeOffset >= safeTotal) {
    return {
      isEmptyPage: true,
      start: null,
      end: null,
      label: `Tidak ada kamar di halaman ini · ${safeTotal} kamar total`,
    };
  }

  const start = safeOffset + 1;
  const end = Math.min(safeTotal, safeOffset + safeLimit);
  return {
    isEmptyPage: false,
    start,
    end,
    label: `${start}–${end} dari ${safeTotal} kamar`,
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function optionalText(value: unknown, max = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

export function normalizeRoomSearch(raw: Record<string, unknown>): RoomRouteSearch {
  const category =
    raw.category === "rukost" || raw.category === "apartkost" ? raw.category : undefined;
  const status =
    raw.status === "vacant" ||
    raw.status === "reserved" ||
    raw.status === "occupied" ||
    raw.status === "maintenance" ||
    raw.status === "inactive" ||
    raw.status === "requires_review"
      ? raw.status
      : undefined;
  return {
    q: optionalText(raw.q) ?? "",
    ...(category ? { category } : {}),
    buildingId: optionalText(raw.building_id, 80),
    floor: undefined,
    ...(raw.floor_code === "A" || raw.floor_code === "B" ? { floorCode: raw.floor_code } : {}),
    status,
    visibility: undefined,
    ...(raw.gender_policy === "male" || raw.gender_policy === "female"
      ? { genderPolicy: raw.gender_policy }
      : {}),
    ...(raw.active_occupancy === true || raw.active_occupancy === "true"
      ? { activeOccupancy: true }
      : raw.active_occupancy === false || raw.active_occupancy === "false"
        ? { activeOccupancy: false }
        : {}),
    ...(raw.reconciliation_state === "normal" || raw.reconciliation_state === "requires_review"
      ? { reconciliationState: raw.reconciliation_state }
      : {}),
    ...(raw.sort === "room_number" ||
    raw.sort === "building" ||
    raw.sort === "category" ||
    raw.sort === "gender_policy" ||
    raw.sort === "status" ||
    raw.sort === "active_resident" ||
    raw.sort === "updated_at"
      ? { sort: raw.sort }
      : {}),
    ...(raw.order === "asc" || raw.order === "desc" ? { order: raw.order } : {}),
    offset: boundedInteger(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(raw.limit, 20, 1, 100),
    roomId: optionalText(raw.room_id ?? raw.roomId, 80),
  };
}

export function createKostTypeSlug(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function allowedRoomStatusTargets(
  status: RoomStatus,
): readonly Extract<RoomStatus, "vacant" | "maintenance" | "inactive" | "requires_review">[] {
  if (status === "vacant") return ["maintenance", "inactive", "requires_review"];
  if (status === "maintenance" || status === "inactive" || status === "requires_review") {
    return ["vacant"];
  }
  return [];
}

export function isRoomCommercialField(field: string): boolean {
  return ["monthly_price", "yearly_price", "deposit_amount", "facility_ids"].includes(field);
}
