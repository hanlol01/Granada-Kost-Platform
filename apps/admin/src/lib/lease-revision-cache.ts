import { queryKeyContainsPropertyScope } from "./admin-ux-query-keys.ts";

type Scope = { propertyId: string; leaseId: string; residentId: string };
type Filter = { predicate: (query: { queryKey: readonly unknown[] }) => boolean };
type Invalidator = {
  cancelQueries?(filters: Filter): unknown;
  removeQueries?(filters: Filter): unknown;
  invalidateQueries(
    filters: Filter,
    options?: { throwOnError: boolean },
  ): unknown;
};

/** Refresh is a separate outcome from the already-confirmed server command. */
export async function refreshLeaseRevisionProjections(
  queryClient: Invalidator,
  scope: Scope,
  unavailableFileIds: readonly string[] = [],
): Promise<boolean> {
  let previewsCleared = true;
  if (unavailableFileIds.length) {
    const ids = new Set(unavailableFileIds);
    const filters: Filter = { predicate: ({ queryKey }) => queryKey[0] === "file" &&
      queryKey[1] === "preview" && typeof queryKey[2] === "string" && ids.has(queryKey[2]) };
    try {
      if (!queryClient.cancelQueries || !queryClient.removeQueries) throw new Error("Evidence cache controls unavailable");
      await queryClient.cancelQueries(filters);
      queryClient.removeQueries(filters);
    } catch { previewsCleared = false; }
  }
  try {
    await queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        // These are consumed command reviews, not projections. Rechecking a
        // now-terminal lease would replace its confirmed completion with an error.
        queryKey[0] !== "lease-cancellation-preview" &&
        queryKey[0] !== "lease-archive-restoration-preview" &&
        (queryKeyContainsPropertyScope(queryKey, scope.propertyId) ||
          queryKey.includes(scope.leaseId) || queryKey.includes(scope.residentId)),
    }, { throwOnError: true });
    return previewsCleared;
  } catch {
    return false;
  }
}
