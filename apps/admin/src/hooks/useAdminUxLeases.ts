// Property-scoped M6 React Query hooks. Lifecycle commands deliberately have
// no optimistic handlers: the committed server response is the source of truth.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { adminUxLeaseApi, type LeaseListInput } from "@/lib/admin-ux-lease-api";
import {
  adminUxQueryKeys,
  invalidateAdminUxMutation,
  normalizePagination,
  type AdminUxMutation,
} from "@/lib/admin-ux-query-keys";
import { safeErrorMessage } from "@/lib/error-normalizer";
import { useProperty } from "@/lib/property";

const SELECT_LIMIT = 100;

export type LeaseListFilters = Omit<LeaseListInput, "propertyId" | "limit" | "offset"> & {
  limit?: number;
  offset?: number;
};

export function useM6Leases(filters: LeaseListFilters = {}) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...filters, limit: filters.limit ?? 20 };
  const page = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.leases.list(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxLeaseApi.leases.list({
        propertyId: currentPropertyId!,
        status: filters.status,
        residentId: filters.residentId,
        roomId: filters.roomId,
        kostTypeId: filters.kostTypeId,
        q: filters.q,
        limit: Number(page.limit),
        offset: Number(page.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM6OverdueLeases(options: { limit?: number; offset?: number } = {}) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...options, limit: options.limit ?? 20 };
  const page = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.leases.overdue(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxLeaseApi.leases.overdue({
        propertyId: currentPropertyId!,
        limit: Number(page.limit),
        offset: Number(page.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM6LeaseResidentOptions(options: { limit?: number; offset?: number } = {}) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...options, limit: options.limit ?? SELECT_LIMIT };
  const page = normalizePagination(keyFilters);

  return useQuery({
    queryKey: adminUxQueryKeys.leases.residentOptions(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxLeaseApi.leases.residentOptions({
        propertyId: currentPropertyId!,
        limit: Number(page.limit),
        offset: Number(page.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM6Lease(leaseId: string | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.leases.detail(currentPropertyId ?? "", leaseId ?? ""),
    queryFn: () => adminUxLeaseApi.leases.detail(leaseId!),
    enabled: Boolean(currentPropertyId && leaseId),
  });
}

export function useM6LeaseBillingSummary(leaseId: string | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.leases.billingSummary(currentPropertyId ?? "", leaseId ?? ""),
    queryFn: () => adminUxLeaseApi.leases.billingSummary(leaseId!),
    enabled: Boolean(currentPropertyId && leaseId),
  });
}

export function useM6LeaseAvailableRooms(q = "") {
  const { currentPropertyId } = useProperty();
  const keyFilters = { q, status: "vacant", limit: SELECT_LIMIT };
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.availability(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxLeaseApi.rooms.listAvailable({
        propertyId: currentPropertyId!,
        q,
        limit: SELECT_LIMIT,
        offset: 0,
      }),
    enabled: Boolean(currentPropertyId),
  });
}

type LeaseMutationRunner<TData, TVariables> = (
  propertyId: string,
  variables: TVariables,
) => Promise<TData>;

/**
 * A shared non-optimistic mutation boundary. Idempotency keys are intentionally
 * passed in the variables so a form can retain one key for a deliberate retry.
 */
export function useM6LeaseMutation<TData, TVariables>(
  domain: AdminUxMutation,
  successMessage: string,
  runner: LeaseMutationRunner<TData, TVariables>,
): UseMutationResult<TData, unknown, TVariables> {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async (variables) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return runner(currentPropertyId, variables);
    },
    onSuccess: async () => {
      if (currentPropertyId) {
        await invalidateAdminUxMutation(queryClient, domain, currentPropertyId);
      }
      toast.success(successMessage);
    },
    onError: (error) => toast.error(safeErrorMessage(error)),
  });
}
