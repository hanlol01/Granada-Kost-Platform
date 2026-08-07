import type { QueryClient, QueryKey } from "@tanstack/react-query";

type QueryScalar = string | number | boolean | null | undefined;
export type QueryFilters = Record<string, QueryScalar | readonly QueryScalar[]>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SENSITIVE_KEY = /(ktp|nik|storage|file_?url|content_?url|signed_?url|path)/i;
const SIXTEEN_DIGITS = /^\d{16}$/;

function normalizeScalar(value: QueryScalar): QueryScalar {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || SIXTEEN_DIGITS.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Canonical filters make equivalent URLs share a cache entry without retaining
 * sensitive identity terms. Arrays are sorted because order has no meaning in
 * the Admin list filters covered by M3.
 */
export function normalizeQueryFilters(
  filters: QueryFilters = {},
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          const normalized = value
            .map(normalizeScalar)
            .filter((item): item is Exclude<QueryScalar, undefined> => item !== undefined)
            .sort((a, b) => String(a).localeCompare(String(b)));
          return [key, normalized];
        }
        return [key, normalizeScalar(value as QueryScalar)];
      })
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

export function normalizePagination(filters: QueryFilters = {}): Readonly<Record<string, unknown>> {
  const normalized = normalizeQueryFilters(filters);
  const limit = Number(normalized.limit ?? DEFAULT_LIMIT);
  const offset = Number(normalized.offset ?? 0);
  return {
    ...normalized,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0,
  };
}

const scoped = (domain: string, propertyId: string, ...rest: readonly unknown[]) =>
  [domain, propertyId, ...rest] as const;

function containsPropertyScope(value: unknown, propertyId: string): boolean {
  if (value === propertyId) return true;
  if (Array.isArray(value)) return value.some((item) => containsPropertyScope(item, propertyId));
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsPropertyScope(item, propertyId));
  }
  return false;
}

export function queryKeyContainsPropertyScope(
  queryKey: readonly unknown[],
  propertyId: string,
): boolean {
  return containsPropertyScope(queryKey, propertyId);
}

export function shouldDiscardAccountCache(
  previousAccountId: string | null,
  nextAccountId: string | null,
): boolean {
  return previousAccountId !== null && previousAccountId !== nextAccountId;
}

export const adminUxQueryKeys = {
  dashboard: {
    summary: (propertyId: string) => ["dashboard", "summary", propertyId] as const,
  },
  kostTypes: {
    all: (propertyId: string) => scoped("kostTypes", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("kostTypes", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, id: string) => scoped("kostType", propertyId, id),
  },
  rooms: {
    all: (propertyId: string) => scoped("rooms", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("rooms", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, id: string) => scoped("room", propertyId, id),
    detailByNumber: (accountId: string, propertyId: string, roomNumber: string) =>
      ["roomDetail", accountId, propertyId, roomNumber.trim()] as const,
    availabilityAll: (propertyId: string) => scoped("roomAvailability", propertyId),
    availability: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("roomAvailability", propertyId, normalizePagination(filters)),
    buildings: (propertyId: string, category: "rukost" | "apartkost" | "") =>
      scoped("roomBuildings", propertyId, category),
  },
  facilities: {
    categories: (propertyId: string) => scoped("facilityCategories", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("roomFacilities", propertyId, normalizePagination(filters)),
    kostTypeAssignments: (propertyId: string, kostTypeId: string) =>
      scoped("kostTypeFacilities", propertyId, kostTypeId),
  },
  rules: {
    list: (propertyId: string, scope: "global" | "kost_type", kostTypeId?: string) =>
      scoped("kostTypeRules", propertyId, scope, kostTypeId ?? null),
  },
  categoryContent: {
    all: (propertyId: string) => scoped("categoryContent", propertyId),
    workspace: (accountId: string, propertyId: string, kostTypeId: string) =>
      ["categoryContent", accountId, propertyId, kostTypeId] as const,
  },
  propertyPolicy: {
    workspace: (accountId: string, propertyId: string) =>
      ["propertyPolicy", accountId, propertyId] as const,
  },
  gallery: {
    list: (
      propertyId: string,
      targetType: "kost_type",
      kostTypeId: string,
      filters: QueryFilters = {},
    ) => scoped("hunianGallery", propertyId, targetType, kostTypeId, normalizePagination(filters)),
  },
  leases: {
    all: (propertyId: string) => scoped("leases", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("leases", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, leaseId: string) => scoped("lease", propertyId, leaseId),
    billingSummary: (propertyId: string, leaseId: string) =>
      scoped("leaseBillingSummary", propertyId, leaseId),
    overdue: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("leaseOverdue", propertyId, normalizePagination(filters)),
    residentOptions: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("leaseResidentOptions", propertyId, normalizePagination(filters)),
  },
  residents: {
    all: (propertyId: string) => scoped("residents", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("residents", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, residentId: string) =>
      scoped("residents", propertyId, "detail", residentId),
    tenancy: (propertyId: string, residentId: string) =>
      scoped("residents", propertyId, "tenancy", residentId),
  },
  invoices: {
    all: (propertyId: string) => scoped("invoices", propertyId),
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("invoices", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, invoiceId: string) => scoped("invoice", propertyId, invoiceId),
  },
  payments: {
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("paymentTransactions", propertyId, normalizePagination(filters)),
    detail: (propertyId: string, transactionId: string) =>
      scoped("paymentTransaction", propertyId, transactionId),
  },
  vehicles: {
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("vehicles", propertyId, normalizePagination(filters)),
  },
  parking: {
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("parking", propertyId, normalizePagination(filters)),
  },
  notifications: {
    list: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("notifications", propertyId, normalizePagination(filters)),
    unreadCount: (propertyId: string, filters: QueryFilters = {}) =>
      scoped("notificationUnreadCount", propertyId, normalizeQueryFilters(filters)),
  },
  settings: {
    profile: (propertyId: string) => ["settings", "property", propertyId] as const,
    preference: (userId: string) => ["settings", "preference", userId] as const,
  },
} as const;

export function roomPersistenceInvalidationKeys(
  propertyId: string,
  roomId: string,
): readonly QueryKey[] {
  return [
    adminUxQueryKeys.rooms.all(propertyId),
    adminUxQueryKeys.rooms.detail(propertyId, roomId),
    adminUxQueryKeys.rooms.availabilityAll(propertyId),
    adminUxQueryKeys.kostTypes.all(propertyId),
    adminUxQueryKeys.dashboard.summary(propertyId),
  ];
}

export function roomDetailInvalidationKey(
  accountId: string,
  propertyId: string,
  roomNumber: string,
): QueryKey {
  return adminUxQueryKeys.rooms.detailByNumber(accountId, propertyId, roomNumber);
}

export type AdminUxMutation =
  | "kost-type"
  | "room"
  | "facility"
  | "rule"
  | "gallery"
  | "lease-create"
  | "lease-update"
  | "lease-deposit"
  | "lease-close"
  | "lease-transfer"
  | "resident"
  | "invoice-payment"
  | "vehicle-parking"
  | "notification-read";

export function invalidationKeysFor(
  mutation: AdminUxMutation,
  propertyId: string,
): readonly QueryKey[] {
  switch (mutation) {
    case "kost-type":
      return [
        adminUxQueryKeys.kostTypes.all(propertyId),
        adminUxQueryKeys.rooms.all(propertyId),
        adminUxQueryKeys.dashboard.summary(propertyId),
      ];
    case "room":
      return [
        adminUxQueryKeys.rooms.all(propertyId),
        ["roomAvailability", propertyId],
        adminUxQueryKeys.dashboard.summary(propertyId),
      ];
    case "facility":
      return [
        adminUxQueryKeys.facilities.categories(propertyId),
        ["roomFacilities", propertyId],
        ["kostTypeFacilities", propertyId],
        adminUxQueryKeys.kostTypes.all(propertyId),
      ];
    case "rule":
      return [["kostTypeRules", propertyId], adminUxQueryKeys.kostTypes.all(propertyId)];
    case "gallery":
      return [["hunianGallery", propertyId], adminUxQueryKeys.kostTypes.all(propertyId)];
    case "lease-create":
      return [
        adminUxQueryKeys.leases.all(propertyId),
        ["lease", propertyId],
        ["leaseBillingSummary", propertyId],
        adminUxQueryKeys.rooms.all(propertyId),
        ["leaseResidentOptions", propertyId],
        ["roomAvailability", propertyId],
        adminUxQueryKeys.residents.all(propertyId),
        adminUxQueryKeys.invoices.all(propertyId),
        adminUxQueryKeys.dashboard.summary(propertyId),
        ["notificationUnreadCount", propertyId],
      ];
    case "lease-update":
    case "lease-deposit":
      return [
        adminUxQueryKeys.leases.all(propertyId),
        ["lease", propertyId],
        ["leaseBillingSummary", propertyId],
        adminUxQueryKeys.invoices.all(propertyId),
        adminUxQueryKeys.payments.list(propertyId),
        adminUxQueryKeys.dashboard.summary(propertyId),
      ];
    case "lease-close":
    case "lease-transfer":
      return [
        adminUxQueryKeys.leases.all(propertyId),
        ["lease", propertyId],
        ["leaseBillingSummary", propertyId],
        adminUxQueryKeys.rooms.all(propertyId),
        ["roomAvailability", propertyId],
        adminUxQueryKeys.residents.all(propertyId),
        adminUxQueryKeys.invoices.all(propertyId),
        adminUxQueryKeys.payments.list(propertyId),
        adminUxQueryKeys.dashboard.summary(propertyId),
        ["notificationUnreadCount", propertyId],
      ];
    case "resident":
      return [
        adminUxQueryKeys.residents.all(propertyId),
        adminUxQueryKeys.leases.all(propertyId),
        ["leaseResidentOptions", propertyId],
      ];
    case "invoice-payment":
      return [
        adminUxQueryKeys.invoices.all(propertyId),
        adminUxQueryKeys.payments.list(propertyId),
        adminUxQueryKeys.leases.all(propertyId),
        adminUxQueryKeys.dashboard.summary(propertyId),
      ];
    case "vehicle-parking":
      return [
        adminUxQueryKeys.vehicles.list(propertyId),
        adminUxQueryKeys.parking.list(propertyId),
        adminUxQueryKeys.residents.all(propertyId),
      ];
    case "notification-read":
      return [
        ["notifications", propertyId],
        ["notificationUnreadCount", propertyId],
      ];
  }
}

export async function invalidateAdminUxMutation(
  queryClient: QueryClient,
  mutation: AdminUxMutation,
  propertyId: string,
): Promise<void> {
  await Promise.all(
    invalidationKeysFor(mutation, propertyId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
