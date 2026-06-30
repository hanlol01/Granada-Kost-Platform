// Stable, machine-readable error codes shared between backend and frontend.
// Frontend MUST handle every code listed in API_PLANNING.md > Error Response Standard.

export const ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
} as const;

export type ApiErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | (string & {});

export type ApiErrorShape = {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: unknown;
  correlationId?: string;
};

// Concrete error class consumed by both apps. Defined in @granada-kost/domain
// so feature code never depends on a transport-specific error.
export class ApiError extends Error implements ApiErrorShape {
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly details?: unknown;
  public readonly correlationId?: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.code = shape.code;
    this.status = shape.status;
    this.details = shape.details;
    this.correlationId = shape.correlationId;
  }

  static isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}
