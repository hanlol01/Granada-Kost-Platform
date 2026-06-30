// @granada-kost/api-client
// Centralized fetch wrapper for Admin and Penghuni. Frozen at M11B per ADR-FE-001.
//
// Responsibilities:
//   - base URL from env (constructor)
//   - Authorization header injection from a TokenProvider
//   - Idempotency-Key passthrough for write operations
//   - X-Correlation-Id (auto-generated when missing)
//   - JSON parsing and SuccessEnvelope unwrapping (returns data)
//   - Error normalization to ApiError (from @granada-kost/domain)
//   - Single-flight refresh queue on 401 with one retry of the original request
//   - Retry of idempotent GET on network failure with exponential backoff (max 2)
//
// Non-goals:
//   - No business logic, no resource-specific helpers (use domain hooks in apps).
//   - No provider SDK imports.

import {
  ApiError,
  ERROR_CODES,
  isErrorEnvelope,
  type ApiErrorCode,
  type SuccessEnvelope,
} from "@granada-kost/domain";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown; // serialized as JSON unless FormData
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  // When true (default), the client retries idempotent GET on network failure.
  retryOnNetworkError?: boolean;
  // Skip auth header (e.g. login endpoint). Defaults to false.
  anonymous?: boolean;
};

export type TokenProvider = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  // Called when a 401 is received. Must return true if a new access token was obtained.
  refresh: () => Promise<boolean>;
  // Called when refresh fails terminally so the host app can route to /login.
  onAuthFailure?: () => void;
};

export type ApiClientConfig = {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  // Hook for tests/dev tools. Receives normalized errors before they are thrown.
  onError?: (error: ApiError) => void;
  // Default fetch implementation; defaults to globalThis.fetch.
  fetchImpl?: typeof fetch;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly onError?: (error: ApiError) => void;
  private readonly fetchImpl: typeof fetch;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.tokenProvider = config.tokenProvider;
    this.onError = config.onError;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get<T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }

  delete<T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  // Lower-level entrypoint. Returns parsed envelope when present, otherwise raw JSON.
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const correlationId = options.headers?.["X-Correlation-Id"] ?? generateCorrelationId();

    return this.executeWithAuth<T>(path, options, method, correlationId, false);
  }

  // ---- internals -----------------------------------------------------------

  private async executeWithAuth<T>(
    path: string,
    options: RequestOptions,
    method: HttpMethod,
    correlationId: string,
    didRefresh: boolean,
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers = this.buildHeaders(options, correlationId);
    const body = this.buildBody(options.body, headers);

    let response: Response;
    try {
      response = await this.doFetch(url, {
        method,
        headers,
        body,
        signal: options.signal,
        credentials: "include", // refresh cookie (ADR-FE-003)
      }, options.retryOnNetworkError !== false && method === "GET");
    } catch (networkError) {
      const err = this.normalizeNetworkError(networkError, correlationId);
      this.onError?.(err);
      throw err;
    }

    // 401 → single-flight refresh, then retry once.
    if (response.status === 401 && !options.anonymous && !didRefresh && this.tokenProvider) {
      const refreshed = await this.runRefreshOnce();
      if (refreshed) {
        return this.executeWithAuth<T>(path, options, method, correlationId, true);
      }
      this.tokenProvider.onAuthFailure?.();
    }

    return this.parseResponse<T>(response, correlationId);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const normalized = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (!query) return normalized;
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      usp.append(key, String(value));
    }
    const qs = usp.toString();
    if (!qs) return normalized;
    return normalized.includes("?") ? `${normalized}&${qs}` : `${normalized}?${qs}`;
  }

  private buildHeaders(options: RequestOptions, correlationId: string): Headers {
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");
    headers.set("X-Correlation-Id", correlationId);
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }
    if (!options.anonymous && this.tokenProvider) {
      const token = this.tokenProvider.getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  }

  private buildBody(rawBody: unknown, headers: Headers): BodyInit | undefined {
    if (rawBody === undefined || rawBody === null) return undefined;
    if (typeof FormData !== "undefined" && rawBody instanceof FormData) {
      // Let the runtime set the multipart boundary; do not set Content-Type.
      return rawBody;
    }
    if (typeof rawBody === "string") {
      if (!headers.has("Content-Type")) headers.set("Content-Type", "text/plain;charset=utf-8");
      return rawBody;
    }
    headers.set("Content-Type", "application/json");
    return JSON.stringify(rawBody);
  }

  private async doFetch(
    url: string,
    init: RequestInit,
    allowRetry: boolean,
  ): Promise<Response> {
    let attempt = 0;
    const maxAttempts = allowRetry ? 3 : 1; // initial + 2 retries
    let lastError: unknown;
    while (attempt < maxAttempts) {
      try {
        return await this.fetchImpl(url, init);
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt >= maxAttempts) break;
        // Exponential backoff: 100ms, 300ms.
        await sleep(attempt === 1 ? 100 : 300);
      }
    }
    throw lastError;
  }

  private async runRefreshOnce(): Promise<boolean> {
    if (!this.tokenProvider) return false;
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        try {
          return await this.tokenProvider!.refresh();
        } catch {
          return false;
        } finally {
          // Reset so the next 401 (after a successful refresh) can re-trigger refresh later.
          // We clear in a microtask to allow concurrent callers to read the same promise.
          queueMicrotask(() => {
            this.refreshInFlight = null;
          });
        }
      })();
    }
    return this.refreshInFlight;
  }

  private async parseResponse<T>(response: Response, correlationId: string): Promise<T> {
    const contentType = response.headers.get("content-type") ?? "";
    const serverCorrelationId = response.headers.get("x-correlation-id") ?? correlationId;

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    let payload: unknown = undefined;
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch (err) {
        const apiErr = new ApiError({
          code: ERROR_CODES.PARSE_ERROR,
          message: "Failed to parse server response.",
          status: response.status,
          details: err instanceof Error ? err.message : err,
          correlationId: serverCorrelationId,
        });
        this.onError?.(apiErr);
        throw apiErr;
      }
    } else if (response.ok) {
      // Non-JSON success. Return raw text to keep things explicit.
      return (await response.text()) as unknown as T;
    } else {
      // Non-JSON error.
      const text = await response.text().catch(() => "");
      const apiErr = new ApiError({
        code: this.statusToCode(response.status),
        message: text || `HTTP ${response.status}`,
        status: response.status,
        correlationId: serverCorrelationId,
      });
      this.onError?.(apiErr);
      throw apiErr;
    }

    if (!response.ok) {
      const apiErr = this.normalizeErrorPayload(payload, response.status, serverCorrelationId);
      this.onError?.(apiErr);
      throw apiErr;
    }

    // Success path: unwrap SuccessEnvelope when present.
    if (payload && typeof payload === "object" && "data" in payload) {
      return (payload as SuccessEnvelope<T>).data;
    }
    return payload as T;
  }

  private normalizeErrorPayload(
    payload: unknown,
    status: number,
    correlationId: string,
  ): ApiError {
    if (isErrorEnvelope(payload)) {
      return new ApiError({
        code: payload.error.code || this.statusToCode(status),
        message: payload.error.message || `HTTP ${status}`,
        status,
        details: payload.error.details,
        correlationId: payload.correlation_id ?? correlationId,
      });
    }
    // Fallback shape
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as Record<string, unknown>).message)
        : `HTTP ${status}`;
    return new ApiError({
      code: this.statusToCode(status),
      message,
      status,
      correlationId,
    });
  }

  private normalizeNetworkError(err: unknown, correlationId: string): ApiError {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new ApiError({
        code: ERROR_CODES.NETWORK_ERROR,
        message: "Request aborted.",
        status: 0,
        correlationId,
      });
    }
    return new ApiError({
      code: ERROR_CODES.NETWORK_ERROR,
      message: err instanceof Error ? err.message : "Network error.",
      status: 0,
      correlationId,
    });
  }

  private statusToCode(status: number): ApiErrorCode {
    switch (status) {
      case 400:
        return ERROR_CODES.VALIDATION_FAILED;
      case 401:
        return ERROR_CODES.UNAUTHENTICATED;
      case 403:
        return ERROR_CODES.FORBIDDEN;
      case 404:
        return ERROR_CODES.NOT_FOUND;
      case 409:
        return ERROR_CODES.CONFLICT;
      case 422:
        return ERROR_CODES.VALIDATION_FAILED;
      case 429:
        return ERROR_CODES.RATE_LIMITED;
      case 502:
      case 503:
        return ERROR_CODES.PROVIDER_UNAVAILABLE;
      default:
        return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.INTERNAL_ERROR;
    }
  }
}

function generateCorrelationId(): string {
  // Prefer the platform UUID generator (Cloudflare Workers, modern browsers, Node 19+).
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Fallback: time-based pseudo unique. Never used in browsers post-2020.
  return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export for ergonomics so apps need only one import.
export { ApiError, ERROR_CODES };
export type { ApiErrorShape, ApiErrorCode } from "@granada-kost/domain";
