import type { OwnerRealizationDocument } from "./property-owner-portal";

export type OwnerRealizationDestination = {
  realizationId?: string;
  transferId?: string;
  invalidDocumentLink?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOwnerRealizationDestination(value: unknown): OwnerRealizationDestination {
  if (!value || typeof value !== "object") return {};
  const search = value as Record<string, unknown>;
  const hasRealization = search.realizationId !== undefined;
  const hasTransfer = search.transferId !== undefined;
  if (!hasRealization && !hasTransfer) {
    return search.invalidDocumentLink === true ? { invalidDocumentLink: true } : {};
  }
  if (
    typeof search.realizationId !== "string" ||
    !UUID.test(search.realizationId) ||
    (hasTransfer && (typeof search.transferId !== "string" || !UUID.test(search.transferId)))
  ) {
    return { invalidDocumentLink: true };
  }
  return {
    realizationId: search.realizationId.toLowerCase(),
    ...(hasTransfer ? { transferId: (search.transferId as string).toLowerCase() } : {}),
  };
}

// A URL never grants access. Only rows returned by the current Owner's fresh
// authorized document query may supply detail or download identifiers.
export function selectOwnerRealizationDocuments(
  rows: readonly OwnerRealizationDocument[],
  destination: OwnerRealizationDestination,
): OwnerRealizationDocument[] {
  if (!destination.realizationId || destination.invalidDocumentLink) return [];
  return rows.filter(
    (row) =>
      row.id === destination.realizationId &&
      Boolean(row.published_at) &&
      (!destination.transferId || row.transfer_id === destination.transferId),
  );
}
