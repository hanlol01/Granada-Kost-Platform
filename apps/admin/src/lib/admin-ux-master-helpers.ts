import type { KostTypeCategory, RoomStatus } from "@/lib/admin-ux-master-api";

export type RoomRouteSearch = {
  q: string;
  buildingId?: string;
  floor?: string;
  status?: RoomStatus;
  visibility?: "visible" | "hidden";
  offset: number;
  limit: number;
  roomId?: string;
};

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
    buildingId: optionalText(raw.building_id, 80),
    floor: optionalText(raw.floor, 80),
    status,
    visibility:
      raw.visibility === "visible" || raw.visibility === "hidden" ? raw.visibility : undefined,
    offset: boundedInteger(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(raw.limit, 20, 1, 100),
    roomId: optionalText(raw.room_id, 80),
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
