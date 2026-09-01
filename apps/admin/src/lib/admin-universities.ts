import { adminUxV2Requester } from "@/lib/admin-ux-api";
import {
  mapSnakeToCamel,
  mapV2Data,
  type AdminUxPage,
  type V2DataEnvelope,
  type V2ListEnvelope,
} from "@/lib/admin-ux-mapper";

export type UniversityOption = {
  id: string;
  propertyId: string;
  name: string;
};

export function normalizeUniversityName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function assertScope(option: UniversityOption, propertyId: string): UniversityOption {
  if (option.propertyId !== propertyId || !option.id || !option.name) {
    throw new Error("Respons universitas tidak sesuai properti aktif.");
  }
  return option;
}

export async function listUniversities(
  propertyId: string,
  search?: string,
  signal?: AbortSignal,
): Promise<AdminUxPage<UniversityOption>> {
  const envelope = await adminUxV2Requester.get<V2ListEnvelope<unknown>>(
    "/residents/universities",
    {
      query: { property_id: propertyId, search: search?.trim() || undefined, limit: 100 },
      signal,
    },
  );
  const items = envelope.data.map((item) =>
    assertScope(mapSnakeToCamel<UniversityOption>(item), propertyId),
  );
  return {
    items,
    total: envelope.meta.total,
    limit: envelope.meta.limit,
    offset: envelope.meta.offset,
  };
}

export async function createUniversity(
  propertyId: string,
  name: string,
  signal?: AbortSignal,
): Promise<UniversityOption> {
  const envelope = await adminUxV2Requester.post<V2DataEnvelope<unknown>>(
    `/residents/universities?property_id=${encodeURIComponent(propertyId)}`,
    { name },
    { signal },
  );
  return assertScope(mapV2Data<UniversityOption>(envelope), propertyId);
}
