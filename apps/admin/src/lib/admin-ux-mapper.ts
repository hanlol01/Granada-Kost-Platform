export type V2ListEnvelope<T> = {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
};

export type V2DataEnvelope<T> = {
  data: T;
};

export type AdminUxPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

const SENSITIVE_RESPONSE_KEYS = new Set([
  "ktp_number",
  "ktp_number_masked",
  "nik_masked",
  "nik",
  "storage_path",
  "file_url",
  "content_url",
  "signed_url",
  "identity_document_url",
  "identity_file_url",
]);

function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function mapValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_RESPONSE_KEYS.has(key))
      .map(([key, nested]) => [camelCase(key), mapValue(nested)]),
  );
}

/**
 * Maps V2 wire values at the API boundary. Known identity fields and raw file
 * locations are intentionally discarded before any query cache can receive it.
 */
export function mapSnakeToCamel<T>(value: unknown): T {
  return mapValue(value) as T;
}

export function mapV2Page<T>(envelope: V2ListEnvelope<unknown>): AdminUxPage<T> {
  return {
    items: envelope.data.map((item) => mapSnakeToCamel<T>(item)),
    total: envelope.meta.total,
    limit: envelope.meta.limit,
    offset: envelope.meta.offset,
  };
}

export function mapV2Data<T>(envelope: V2DataEnvelope<unknown>): T {
  return mapSnakeToCamel<T>(envelope.data);
}
