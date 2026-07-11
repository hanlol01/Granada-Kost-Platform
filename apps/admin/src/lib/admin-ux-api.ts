import { ApiError, ERROR_CODES, isErrorEnvelope } from "@granada-kost/domain";
import { env } from "@/lib/env";
import { getAccessToken, notifyAuthFailure, refreshAccessToken } from "@/lib/api";
import {
  mapSnakeToCamel,
  mapV2Data,
  mapV2Page,
  type AdminUxPage,
  type V2DataEnvelope,
  type V2ListEnvelope,
} from "@/lib/admin-ux-mapper";

export const ADMIN_UX_V2_ACCEPT = "application/vnd.granada.admin-ux.v2+json";

export type AdminUxQueryValue = string | number | boolean | undefined | null;

export type AdminUxRequestOptions = {
  query?: Record<string, AdminUxQueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type AdminUxV2Requester = {
  get<T>(path: string, options?: Omit<AdminUxRequestOptions, "body">): Promise<T>;
  post<T>(path: string, body?: unknown, options?: AdminUxRequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: AdminUxRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: AdminUxRequestOptions): Promise<T>;
  delete<T>(path: string, options?: Omit<AdminUxRequestOptions, "body">): Promise<T>;
};

type RequesterConfig = {
  baseUrl: string;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
  onAuthFailure: () => void;
  fetchImpl?: typeof fetch;
};

function correlationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "admin-ux-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, AdminUxQueryValue> | undefined,
): string {
  const url = path.startsWith("http")
    ? new URL(path)
    : new URL(path.startsWith("/") ? path : "/" + path, baseUrl.replace(/\/$/, "") + "/");

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function bodyFor(value: unknown, headers: Headers): BodyInit | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof FormData !== "undefined" && value instanceof FormData) return value;
  headers.set("Content-Type", "application/json");
  return JSON.stringify(value);
}

function apiErrorFromPayload(
  payload: unknown,
  status: number,
  fallbackCorrelationId: string,
): ApiError {
  if (isErrorEnvelope(payload)) {
    return new ApiError({
      code: payload.error.code || ERROR_CODES.INTERNAL_ERROR,
      message: payload.error.message || "Request failed.",
      status,
      details: payload.error.details,
      correlationId: payload.correlation_id ?? fallbackCorrelationId,
    });
  }

  return new ApiError({
    code:
      status === 401
        ? ERROR_CODES.UNAUTHENTICATED
        : status === 403
          ? ERROR_CODES.FORBIDDEN
          : status === 404
            ? ERROR_CODES.NOT_FOUND
            : status === 409
              ? ERROR_CODES.CONFLICT
              : status === 422
                ? ERROR_CODES.VALIDATION_FAILED
                : ERROR_CODES.INTERNAL_ERROR,
    message: "Request failed.",
    status,
    correlationId: fallbackCorrelationId,
  });
}

/**
 * The shared ApiClient deliberately unwraps the data field, which is correct
 * for legacy endpoints but loses V2 list metadata. This narrow requester
 * preserves V2 envelopes and is the only Admin surface that sends V2 Accept.
 */
export function createAdminUxV2Requester(config: RequesterConfig): AdminUxV2Requester {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options: AdminUxRequestOptions = {},
    retriedAfterRefresh = false,
    requestCorrelationId = correlationId(),
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Accept", ADMIN_UX_V2_ACCEPT);
    headers.set("X-Correlation-Id", requestCorrelationId);
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    const token = config.getAccessToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(config.baseUrl, path, options.query), {
        method,
        headers,
        body: bodyFor(options.body, headers),
        credentials: "include",
        signal: options.signal,
      });
    } catch {
      throw new ApiError({
        code: ERROR_CODES.NETWORK_ERROR,
        message: "Network request failed.",
        status: 0,
        correlationId: requestCorrelationId,
      });
    }

    if (response.status === 401 && !retriedAfterRefresh) {
      const refreshed = await config.refreshAccessToken();
      if (refreshed) {
        return request<T>(method, path, options, true, requestCorrelationId);
      }
      config.onAuthFailure();
    }

    const responseCorrelationId = response.headers.get("x-correlation-id") ?? requestCorrelationId;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError({
        code: ERROR_CODES.PARSE_ERROR,
        message: "Unable to parse server response.",
        status: response.status,
        correlationId: responseCorrelationId,
      });
    }

    if (!response.ok) throw apiErrorFromPayload(payload, response.status, responseCorrelationId);
    return payload as T;
  }

  return {
    get: <T>(path: string, options?: Omit<AdminUxRequestOptions, "body">) =>
      request<T>("GET", path, options),
    post: <T>(path: string, body?: unknown, options: AdminUxRequestOptions = {}) =>
      request<T>("POST", path, { ...options, body }),
    patch: <T>(path: string, body?: unknown, options: AdminUxRequestOptions = {}) =>
      request<T>("PATCH", path, { ...options, body }),
    put: <T>(path: string, body?: unknown, options: AdminUxRequestOptions = {}) =>
      request<T>("PUT", path, { ...options, body }),
    delete: <T>(path: string, options?: Omit<AdminUxRequestOptions, "body">) =>
      request<T>("DELETE", path, options),
  };
}

export const adminUxV2Requester = createAdminUxV2Requester({
  baseUrl: env.VITE_API_BASE_URL,
  getAccessToken,
  refreshAccessToken,
  onAuthFailure: notifyAuthFailure,
});

export type PaginationInput = {
  propertyId: string;
  limit?: number;
  offset?: number;
};

export type KostType = {
  id: string;
  propertyId: string;
  category: "rukost" | "apartkost";
  name: string;
  slug: string;
  descriptionShort?: string | null;
  descriptionLong?: string | null;
  roomSizeLabel?: string | null;
  roomSizeM2?: number | null;
  monthlyPrice: number;
  yearlyPrice: number;
  depositAmount: number;
  publicVisible: boolean;
  status: "active" | "inactive";
  facilities?: RoomFacility[];
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
  name: string;
  icon?: string | null;
  description?: string | null;
  status: "active" | "inactive";
  sortOrder: number;
};

export type KostTypeRule = {
  id: string;
  propertyId: string;
  kostTypeId?: string | null;
  ruleCategory: "general" | "guest" | "resident" | "other" | "special_notes";
  ruleText: string;
  icon?: string | null;
  isAllowed?: boolean | null;
  sortOrder: number;
};

export type RoomInventory = {
  id: string;
  propertyId: string;
  kostTypeId: string;
  number: string;
  roomCode?: string | null;
  buildingId: string;
  roomStatus: "vacant" | "reserved" | "occupied" | "maintenance" | "inactive" | "requires_review";
  publicVisible: boolean;
  kostType?: Pick<
    KostType,
    "id" | "name" | "category" | "monthlyPrice" | "yearlyPrice" | "depositAmount"
  >;
  activeLease?: {
    leaseCode?: string;
    residentName?: string;
  } | null;
};

export type GalleryTarget =
  | { targetType: "kost_type"; kostTypeId: string }
  | {
      targetType: "common_area";
      commonAreaKey: "lobby" | "dapur" | "rooftop" | "koridor" | "parkir";
    };

export type GalleryImage = {
  id: string;
  propertyId: string;
  targetType: GalleryTarget["targetType"];
  targetId: string;
  kostTypeId?: string | null;
  commonAreaKey?: string | null;
  fileId: string;
  altText: string;
  caption?: string | null;
  sortOrder: number;
  isCover: boolean;
  publicVisible: boolean;
};

function pageQuery(input: PaginationInput): Record<string, AdminUxQueryValue> {
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

async function detail<T>(path: string): Promise<T> {
  const envelope = await adminUxV2Requester.get<V2DataEnvelope<unknown>>(path);
  return mapV2Data<T>(envelope);
}

export const adminUxApi = {
  kostTypes: {
    list: (
      input: PaginationInput & {
        category?: KostType["category"];
        q?: string;
        status?: KostType["status"];
      },
    ) =>
      list<KostType>("/kost-types", {
        ...pageQuery(input),
        category: input.category,
        q: input.q?.trim() || undefined,
        status: input.status,
      }),
    detail: (id: string) => detail<KostType>("/kost-types/" + encodeURIComponent(id)),
  },
  facilities: {
    categories: (input: PaginationInput & { q?: string }) =>
      list<FacilityCategory>("/facility-categories", {
        ...pageQuery(input),
        q: input.q?.trim() || undefined,
      }),
    roomFacilities: (
      input: PaginationInput & {
        categoryId?: string;
        q?: string;
        status?: RoomFacility["status"];
      },
    ) =>
      list<RoomFacility>("/room-facilities", {
        ...pageQuery(input),
        category_id: input.categoryId,
        q: input.q?.trim() || undefined,
        status: input.status,
      }),
    rules: (
      input: PaginationInput & {
        scope: "global" | "kost_type";
        kostTypeId?: string;
        ruleCategory?: KostTypeRule["ruleCategory"];
      },
    ) =>
      list<KostTypeRule>("/kost-type-rules", {
        ...pageQuery(input),
        scope: input.scope,
        kost_type_id: input.kostTypeId,
        rule_category: input.ruleCategory,
      }),
  },
  rooms: {
    list: (
      input: PaginationInput & {
        kostTypeId?: string;
        category?: KostType["category"];
        buildingId?: string;
        floor?: string;
        status?: RoomInventory["roomStatus"];
        q?: string;
        includeActiveLease?: boolean;
      },
    ) =>
      list<RoomInventory>("/rooms", {
        ...pageQuery(input),
        kost_type_id: input.kostTypeId,
        category: input.category,
        building_id: input.buildingId,
        floor: input.floor,
        status: input.status,
        q: input.q?.trim() || undefined,
        include_active_lease: input.includeActiveLease,
      }),
    detail: (id: string, includeActiveLease = false) =>
      adminUxV2Requester
        .get<V2DataEnvelope<unknown>>("/rooms/" + encodeURIComponent(id), {
          query: { include_active_lease: includeActiveLease || undefined },
        })
        .then((envelope) => mapV2Data<RoomInventory>(envelope)),
  },
  gallery: {
    list: (input: PaginationInput & Partial<GalleryTarget>) =>
      list<GalleryImage>("/hunian-gallery", {
        ...pageQuery(input),
        target_type: input.targetType,
        kost_type_id: input.targetType === "kost_type" ? input.kostTypeId : undefined,
        common_area_key: input.targetType === "common_area" ? input.commonAreaKey : undefined,
      }),
  },
};

// Kept exported for unit tests and future domain clients.
export { mapSnakeToCamel };
