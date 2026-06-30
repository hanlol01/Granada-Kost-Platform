// Standard API response envelopes used by the NestJS backend.
// Reference: docs/01-architecture/BACKEND_ARCHITECTURE.md > Error Handling Architecture
// and docs/01-architecture/API_PLANNING.md > Error Response Standard / Pagination Standard.

export type PaginationMeta = {
  page: number;
  per_page: number;
  total?: number;
  total_pages?: number;
  has_next?: boolean;
};

export type SuccessEnvelope<T> = {
  success?: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
  correlation_id?: string;
  timestamp?: string;
};

export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  correlation_id?: string;
  timestamp?: string;
};

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.success === false && typeof v.error === "object" && v.error !== null;
}
