import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { ERROR_CODES, isErrorEnvelope } from "@granada-kost/domain";
import { getAccessToken, notifyAuthFailure, refreshAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { qk } from "@/lib/query-client";

export const RESIDENT_CONTEXT_PATH = "/my/resident-context";

const CONTEXT_KEYS = [
  "display_name",
  "phone",
  "property_name",
  "room_number",
  "occupancy_start",
  "building_name",
  "building_code",
  "kost_type",
  "gender",
  "lease_status",
  "lease_start",
  "lease_end",
  "term_months",
  "payment_plan_type",
] as const;

export type ResidentContext = {
  displayName: string;
  phone: string | null;
  propertyName: string;
  roomNumber: string;
  occupancyStart: string;
  buildingName: string;
  buildingCode: string;
  kostType: "rukost" | "apartkost";
  gender: "male" | "female";
  leaseStatus: "awaiting_activation" | "active" | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  termMonths: number | null;
  paymentPlanType: string | null;
};

export type ResidentContextState =
  | "loading"
  | "ready"
  | "empty"
  | "conflict"
  | "forbidden"
  | "unauthenticated"
  | "invalid"
  | "recoverable-error";

export type ResidentContextStateCopy = {
  title: string;
  description: string;
  canRetry: boolean;
};

export type ResidentContextRequester = {
  get(path: string, options?: { signal?: AbortSignal }): Promise<unknown>;
};

type RequesterConfig = {
  baseUrl: string;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
  onAuthFailure: () => void;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCanonicalDate(value: string): boolean {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnly) return false;
  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]);
  const day = Number(dateOnly[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseFailure(): never {
  throw new ApiError({
    code: ERROR_CODES.PARSE_ERROR,
    message: "Resident context response is invalid.",
    status: 200,
  });
}

export function parseResidentContextEnvelope(value: unknown): ResidentContext | null {
  if (!isRecord(value) || !hasExactKeys(value, ["data"])) return parseFailure();
  if (value.data === null) return null;
  if (!isRecord(value.data) || !hasExactKeys(value.data, CONTEXT_KEYS)) return parseFailure();

  const displayName = nonEmptyString(value.data.display_name);
  const propertyName = nonEmptyString(value.data.property_name);
  const roomNumber = nonEmptyString(value.data.room_number);
  const occupancyStart = nonEmptyString(value.data.occupancy_start);
  const buildingName = nonEmptyString(value.data.building_name);
  const buildingCode = nonEmptyString(value.data.building_code);
  const phone =
    value.data.phone === null
      ? null
      : typeof value.data.phone === "string"
        ? nonEmptyString(value.data.phone)
        : null;

  const kostType =
    value.data.kost_type === "rukost" || value.data.kost_type === "apartkost"
      ? value.data.kost_type
      : null;
  const gender =
    value.data.gender === "male" || value.data.gender === "female" ? value.data.gender : null;
  const leaseStatus =
    value.data.lease_status === null
      ? null
      : value.data.lease_status === "active" || value.data.lease_status === "awaiting_activation"
        ? value.data.lease_status
        : undefined;
  const leaseStart =
    value.data.lease_start === null
      ? null
      : typeof value.data.lease_start === "string" && isCanonicalDate(value.data.lease_start)
        ? value.data.lease_start
        : undefined;
  const leaseEnd =
    value.data.lease_end === null
      ? null
      : typeof value.data.lease_end === "string" && isCanonicalDate(value.data.lease_end)
        ? value.data.lease_end
        : undefined;
  const termMonths =
    value.data.term_months === null
      ? null
      : typeof value.data.term_months === "number" &&
          Number.isInteger(value.data.term_months) &&
          value.data.term_months > 0
        ? value.data.term_months
        : undefined;
  const paymentPlanType =
    value.data.payment_plan_type === null ? null : nonEmptyString(value.data.payment_plan_type);

  if (
    !displayName ||
    !propertyName ||
    !roomNumber ||
    !occupancyStart ||
    !buildingName ||
    !buildingCode ||
    !isCanonicalDate(occupancyStart) ||
    !kostType ||
    !gender ||
    leaseStatus === undefined ||
    leaseStart === undefined ||
    leaseEnd === undefined ||
    termMonths === undefined ||
    (!paymentPlanType && value.data.payment_plan_type !== null) ||
    (value.data.phone !== null && phone === null)
  ) {
    return parseFailure();
  }

  return {
    displayName,
    phone,
    propertyName,
    roomNumber,
    occupancyStart,
    buildingName,
    buildingCode,
    kostType,
    gender,
    leaseStatus,
    leaseStart,
    leaseEnd,
    termMonths,
    paymentPlanType,
  };
}

function correlationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "resident-context-" + Date.now().toString(36);
}

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), baseUrl.replace(/\/+$/, "") + "/").toString();
}

function errorCode(payload: unknown, status: number): string {
  if (isErrorEnvelope(payload) && payload.error.code) return payload.error.code;
  if (status === 401) return ERROR_CODES.UNAUTHENTICATED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 409) return ERROR_CODES.CONFLICT;
  return ERROR_CODES.INTERNAL_ERROR;
}

export function createResidentContextRequester(config: RequesterConfig): ResidentContextRequester {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function get(
    path: string,
    options: { signal?: AbortSignal } = {},
    retriedAfterRefresh = false,
    requestCorrelationId = correlationId(),
  ): Promise<unknown> {
    const headers = new Headers({
      Accept: "application/json",
      "X-Correlation-Id": requestCorrelationId,
    });
    const token = config.getAccessToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(config.baseUrl, path), {
        method: "GET",
        headers,
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
      if (await config.refreshAccessToken()) {
        return get(path, options, true, requestCorrelationId);
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

    if (!response.ok) {
      throw new ApiError({
        code: errorCode(payload, response.status),
        message: "Resident context request failed.",
        status: response.status,
        correlationId: responseCorrelationId,
      });
    }
    return payload;
  }

  return { get };
}

export const residentContextRequester = createResidentContextRequester({
  baseUrl: env.VITE_API_BASE_URL,
  getAccessToken,
  refreshAccessToken,
  onAuthFailure: notifyAuthFailure,
});

export async function requestResidentContext(
  requester: ResidentContextRequester = residentContextRequester,
  signal?: AbortSignal,
): Promise<ResidentContext | null> {
  const envelope = await requester.get(RESIDENT_CONTEXT_PATH, { signal });
  return parseResidentContextEnvelope(envelope);
}

export function classifyResidentContextError(error: unknown): ResidentContextState {
  if (!ApiError.isApiError(error)) return "recoverable-error";
  if (error.status === 401) return "unauthenticated";
  if (error.status === 403) return "forbidden";
  if (error.status === 409 && error.code === "RESIDENT_CONTEXT_AMBIGUOUS") return "conflict";
  if (error.status === 0 || error.status >= 500) return "recoverable-error";
  return "invalid";
}

export function shouldRetryResidentContext(failureCount: number, error: unknown): boolean {
  return classifyResidentContextError(error) === "recoverable-error" && failureCount < 1;
}

export function residentContextStateCopy(state: ResidentContextState): ResidentContextStateCopy {
  switch (state) {
    case "empty":
      return {
        title: "Data hunian belum tersedia",
        description: "Hubungi pengelola agar data kamar dan hunian Anda dapat ditinjau.",
        canRetry: false,
      };
    case "conflict":
      return {
        title: "Data hunian perlu ditinjau",
        description: "Admin perlu memeriksa lebih dari satu data hunian aktif pada akun Anda.",
        canRetry: false,
      };
    case "forbidden":
      return {
        title: "Data hunian tidak dapat diakses",
        description: "Hubungi pengelola untuk memeriksa akses akun Penghuni Anda.",
        canRetry: false,
      };
    case "invalid":
      return {
        title: "Data hunian belum dapat ditampilkan",
        description: "Respons data tidak sesuai. Hubungi pengelola untuk meninjau akun Anda.",
        canRetry: false,
      };
    case "unauthenticated":
      return {
        title: "Sesi perlu diperbarui",
        description: "Silakan masuk kembali untuk melanjutkan.",
        canRetry: false,
      };
    case "recoverable-error":
      return {
        title: "Data hunian gagal dimuat",
        description: "Periksa koneksi Anda, lalu coba lagi.",
        canRetry: true,
      };
    default:
      return {
        title: "Memuat data hunian",
        description: "Data kamar dan properti sedang disiapkan.",
        canRetry: false,
      };
  }
}

export function residentContextAnnouncementRole(state: ResidentContextState): "status" | "alert" {
  return state === "empty" ? "status" : "alert";
}

export function useResidentContext(): UseQueryResult<ResidentContext | null> {
  const { status, user } = useAuth();
  const accountId =
    status === "authenticated" &&
    user?.roles?.includes("resident") &&
    typeof user.id === "string" &&
    user.id.length > 0
      ? user.id
      : null;

  return useQuery<ResidentContext | null>({
    queryKey: accountId
      ? qk.penghuni.residentContext(accountId)
      : ["penghuni", "resident-context", "disabled"],
    queryFn: ({ signal }) => requestResidentContext(residentContextRequester, signal),
    enabled: accountId !== null,
    staleTime: 30_000,
    retry: shouldRetryResidentContext,
  });
}

export function residentContextState(
  query: Pick<
    UseQueryResult<ResidentContext | null>,
    "data" | "error" | "isError" | "isLoading" | "isPending"
  >,
): ResidentContextState {
  if (query.isLoading || query.isPending) return "loading";
  if (query.isError) return classifyResidentContextError(query.error);
  return query.data === null ? "empty" : "ready";
}
