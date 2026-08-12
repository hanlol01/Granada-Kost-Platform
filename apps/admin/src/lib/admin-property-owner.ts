import { adminUxV2Requester } from "@/lib/admin-ux-api";

export type PropertyOwnerStatus = "active" | "archived";
export type OwnerAccountStatus = "active" | "inactive" | "suspended";
export type AssignmentStatus = "active" | "scheduled" | "ended" | "released";

export type PropertyOwner = {
  id: string;
  propertyId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  profileStatus: PropertyOwnerStatus;
  accountStatus: OwnerAccountStatus;
  activeRumahKostBuildings: number;
  activeApartKostRooms: number;
  scheduledAssignments: number;
  createdAt: string;
};

export type OwnerBuildingAssignment = {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string | null;
  genderPolicy: string | null;
  coveredRoomCount: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignmentStatus: AssignmentStatus;
  reason: string;
};

export type OwnerRoomAssignment = {
  id: string;
  roomId: string;
  roomCode: string;
  buildingCode: string | null;
  buildingName: string | null;
  genderPolicy: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignmentStatus: AssignmentStatus;
  reason: string;
};

export type OwnerHistoryItem = {
  id: string;
  ownershipKind: "building" | "room";
  assetCode: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignmentStatus: AssignmentStatus;
  reason: string;
};

export type PropertyOwnerDetail = PropertyOwner & {
  assets: { rumahKostBuildings: OwnerBuildingAssignment[]; apartKostRooms: OwnerRoomAssignment[] };
  ownershipHistory: OwnerHistoryItem[];
  credentials: { loginEmail: string | null; loginPhone: string | null; resetAvailable: boolean };
};

export type OwnerAssetOption = {
  id: string;
  code: string;
  name: string | null;
  genderPolicy: string | null;
  roomCount?: number;
  roomStatus?: string | null;
  availability: "available" | "assigned";
  currentOwner: { id: string; fullName: string } | null;
};

export type PropertyOwnerAssetOptions = {
  effectiveDate: string;
  rumahKostBuildings: OwnerAssetOption[];
  apartKostRooms: OwnerAssetOption[];
};

export type PropertyOwnerList = {
  data: PropertyOwner[];
  meta: { offset: number; limit: number; total: number };
};
export type OwnerCreateReceipt = {
  status: "created" | "already_created";
  owner: PropertyOwner;
  temporaryPassword: string | null;
};
export type OwnerPasswordReceipt = {
  ownerId: string;
  temporaryPassword: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new Error(`Respons Owner Property tidak valid: ${field}.`);
  return value;
};
const nullableString = (value: unknown, field: string): string | null =>
  value === null ? null : string(value, field);
const number = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Respons Owner Property tidak valid: ${field}.`);
  return value;
};
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], field: string): T => {
  const parsed = string(value, field) as T;
  if (!allowed.includes(parsed)) throw new Error(`Respons Owner Property tidak valid: ${field}.`);
  return parsed;
};

function parseOwner(value: unknown): PropertyOwner {
  if (!isObject(value)) throw new Error("Respons Owner Property tidak valid.");
  return {
    id: string(value.id, "id"),
    propertyId: string(value.property_id, "property_id"),
    fullName: string(value.full_name, "full_name"),
    phone: nullableString(value.phone, "phone"),
    email: nullableString(value.email, "email"),
    address: nullableString(value.address, "address"),
    profileStatus: enumValue(value.profile_status, ["active", "archived"], "profile_status"),
    accountStatus: enumValue(
      value.account_status,
      ["active", "inactive", "suspended"],
      "account_status",
    ),
    activeRumahKostBuildings: number(
      value.active_rumah_kost_buildings,
      "active_rumah_kost_buildings",
    ),
    activeApartKostRooms: number(value.active_apart_kost_rooms, "active_apart_kost_rooms"),
    scheduledAssignments: number(value.scheduled_assignments, "scheduled_assignments"),
    createdAt: string(value.created_at, "created_at"),
  };
}

function parseBuilding(value: unknown): OwnerBuildingAssignment {
  if (!isObject(value)) throw new Error("Respons assignment bangunan tidak valid.");
  return {
    id: string(value.id, "id"),
    buildingId: string(value.building_id, "building_id"),
    buildingCode: string(value.building_code, "building_code"),
    buildingName: nullableString(value.building_name, "building_name"),
    genderPolicy: nullableString(value.gender_policy, "gender_policy"),
    coveredRoomCount: number(value.covered_room_count, "covered_room_count"),
    effectiveFrom: string(value.effective_from, "effective_from"),
    effectiveUntil: nullableString(value.effective_until, "effective_until"),
    assignmentStatus: enumValue(
      value.assignment_status,
      ["active", "scheduled", "ended", "released"],
      "assignment_status",
    ),
    reason: string(value.reason, "reason"),
  };
}
function parseRoom(value: unknown): OwnerRoomAssignment {
  if (!isObject(value)) throw new Error("Respons assignment kamar tidak valid.");
  return {
    id: string(value.id, "id"),
    roomId: string(value.room_id, "room_id"),
    roomCode: string(value.room_code, "room_code"),
    buildingCode: nullableString(value.building_code, "building_code"),
    buildingName: nullableString(value.building_name, "building_name"),
    genderPolicy: nullableString(value.gender_policy, "gender_policy"),
    effectiveFrom: string(value.effective_from, "effective_from"),
    effectiveUntil: nullableString(value.effective_until, "effective_until"),
    assignmentStatus: enumValue(
      value.assignment_status,
      ["active", "scheduled", "ended", "released"],
      "assignment_status",
    ),
    reason: string(value.reason, "reason"),
  };
}

export function parsePropertyOwnerList(value: unknown): PropertyOwnerList {
  if (!isObject(value) || !Array.isArray(value.data) || !isObject(value.meta))
    throw new Error("Daftar Owner Property tidak valid.");
  return {
    data: value.data.map(parseOwner),
    meta: {
      offset: number(value.meta.offset, "meta.offset"),
      limit: number(value.meta.limit, "meta.limit"),
      total: number(value.meta.total, "meta.total"),
    },
  };
}
export function parsePropertyOwnerDetail(value: unknown): PropertyOwnerDetail {
  const owner = parseOwner(value);
  if (
    !isObject(value) ||
    !isObject(value.active_and_scheduled_assets) ||
    !Array.isArray(value.ownership_history) ||
    !isObject(value.credentials)
  )
    throw new Error("Detail Owner Property tidak valid.");
  const assets = value.active_and_scheduled_assets;
  if (!Array.isArray(assets.rumah_kost_buildings) || !Array.isArray(assets.apart_kost_rooms))
    throw new Error("Aset Owner Property tidak valid.");
  return {
    ...owner,
    assets: {
      rumahKostBuildings: assets.rumah_kost_buildings.map(parseBuilding),
      apartKostRooms: assets.apart_kost_rooms.map(parseRoom),
    },
    ownershipHistory: value.ownership_history.map((item) => {
      if (!isObject(item)) throw new Error("Riwayat Owner Property tidak valid.");
      return {
        id: string(item.id, "history.id"),
        ownershipKind: enumValue(item.ownership_kind, ["building", "room"], "ownership_kind"),
        assetCode: string(item.asset_code, "asset_code"),
        effectiveFrom: string(item.effective_from, "effective_from"),
        effectiveUntil: nullableString(item.effective_until, "effective_until"),
        assignmentStatus: enumValue(
          item.assignment_status,
          ["active", "scheduled", "ended", "released"],
          "assignment_status",
        ),
        reason: string(item.reason, "reason"),
      };
    }),
    credentials: {
      loginEmail: nullableString(value.credentials.login_email, "login_email"),
      loginPhone: nullableString(value.credentials.login_phone, "login_phone"),
      resetAvailable: value.credentials.reset_available === true,
    },
  };
}
export function parseOwnerAssetOptions(value: unknown): PropertyOwnerAssetOptions {
  if (
    !isObject(value) ||
    !Array.isArray(value.rumah_kost_buildings) ||
    !Array.isArray(value.apart_kost_rooms)
  )
    throw new Error("Pilihan aset Owner Property tidak valid.");
  const parse = (item: unknown, kind: "building" | "room"): OwnerAssetOption => {
    if (!isObject(item)) throw new Error("Pilihan aset tidak valid.");
    const current = item.current_owner;
    return {
      id: string(item.id, "asset.id"),
      code: string(kind === "building" ? item.building_code : item.room_code, "asset.code"),
      name: nullableString(
        kind === "building" ? item.building_name : item.building_name,
        "asset.name",
      ),
      genderPolicy: nullableString(item.gender_policy, "asset.gender_policy"),
      roomCount: kind === "building" ? number(item.room_count, "room_count") : undefined,
      roomStatus: kind === "room" ? nullableString(item.room_status, "room_status") : undefined,
      availability: enumValue(item.availability, ["available", "assigned"], "availability"),
      currentOwner:
        current === null
          ? null
          : (() => {
              if (!isObject(current)) throw new Error("current_owner tidak valid.");
              return {
                id: string(current.id, "current_owner.id"),
                fullName: string(current.full_name, "current_owner.full_name"),
              };
            })(),
    };
  };
  return {
    effectiveDate: string(value.effective_date, "effective_date"),
    rumahKostBuildings: value.rumah_kost_buildings.map((item) => parse(item, "building")),
    apartKostRooms: value.apart_kost_rooms.map((item) => parse(item, "room")),
  };
}

function parseOwnerPasswordReceipt(value: unknown): OwnerPasswordReceipt {
  if (!isObject(value)) throw new Error("Receipt reset password Owner Property tidak valid.");
  return {
    ownerId: string(value.owner_id, "owner_id"),
    temporaryPassword: nullableString(value.temporary_password, "temporary_password"),
  };
}

const withScope = (
  propertyId: string,
  query: Record<string, string | number | undefined> = {},
) => ({ query: { property_id: propertyId, ...query } });
export const propertyOwnerApi = {
  list: (
    propertyId: string,
    filters: { q?: string; status?: PropertyOwnerStatus; offset?: number; limit?: number } = {},
  ) =>
    adminUxV2Requester
      .get("/admin/property-owners", withScope(propertyId, filters))
      .then(parsePropertyOwnerList),
  detail: (propertyId: string, ownerId: string) =>
    adminUxV2Requester
      .get(`/admin/property-owners/${encodeURIComponent(ownerId)}`, withScope(propertyId))
      .then(parsePropertyOwnerDetail),
  assetOptions: (propertyId: string, effectiveDate?: string) =>
    adminUxV2Requester
      .get(
        "/admin/property-owners/asset-options",
        withScope(propertyId, { effective_date: effectiveDate }),
      )
      .then(parseOwnerAssetOptions),
  create: (body: Record<string, unknown>, idempotencyKey: string) =>
    adminUxV2Requester.post("/admin/property-owners", body, { idempotencyKey }).then((value) => {
      if (!isObject(value)) throw new Error("Receipt Owner Property tidak valid.");
      return {
        status: enumValue(value.status, ["created", "already_created"], "status"),
        owner: parseOwner(value.owner),
        temporaryPassword: nullableString(value.temporary_password, "temporary_password"),
      } satisfies OwnerCreateReceipt;
    }),
  update: (ownerId: string, body: Record<string, unknown>, idempotencyKey: string) =>
    adminUxV2Requester
      .patch(`/admin/property-owners/${encodeURIComponent(ownerId)}`, body, { idempotencyKey })
      .then(parseOwner),
  archive: (ownerId: string, propertyId: string, idempotencyKey: string) =>
    adminUxV2Requester
      .delete(`/admin/property-owners/${encodeURIComponent(ownerId)}`, {
        query: { property_id: propertyId },
        idempotencyKey,
      })
      .then(parseOwner),
  resetPassword: (ownerId: string, body: Record<string, unknown>, idempotencyKey: string) =>
    adminUxV2Requester
      .post(`/admin/property-owners/${encodeURIComponent(ownerId)}/reset-password`, body, {
        idempotencyKey,
      })
      .then(parseOwnerPasswordReceipt),
  assignBuildings: (ownerId: string, body: Record<string, unknown>, idempotencyKey: string) =>
    adminUxV2Requester.post(
      `/admin/property-owners/${encodeURIComponent(ownerId)}/building-assignments`,
      body,
      { idempotencyKey },
    ),
  assignRooms: (ownerId: string, body: Record<string, unknown>, idempotencyKey: string) =>
    adminUxV2Requester.post(
      `/admin/property-owners/${encodeURIComponent(ownerId)}/room-assignments`,
      body,
      { idempotencyKey },
    ),
  releaseBuilding: (
    ownerId: string,
    assignmentId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    adminUxV2Requester.post(
      `/admin/property-owners/${encodeURIComponent(ownerId)}/building-assignments/${encodeURIComponent(assignmentId)}/release`,
      body,
      { idempotencyKey },
    ),
  releaseRoom: (
    ownerId: string,
    assignmentId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    adminUxV2Requester.post(
      `/admin/property-owners/${encodeURIComponent(ownerId)}/room-assignments/${encodeURIComponent(assignmentId)}/release`,
      body,
      { idempotencyKey },
    ),
};
