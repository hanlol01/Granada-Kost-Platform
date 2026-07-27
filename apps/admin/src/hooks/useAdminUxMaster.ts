// M4 property-scoped React Query hooks for Admin UX master data.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminUxMasterApi,
  type GalleryTarget,
  type KostTypeCategory,
  type MasterStatus,
  type RoomStatus,
} from "@/lib/admin-ux-master-api";
import {
  adminUxQueryKeys,
  invalidateAdminUxMutation,
  normalizePagination,
  type AdminUxMutation,
} from "@/lib/admin-ux-query-keys";
import { safeErrorMessage } from "@/lib/error-normalizer";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";

const MASTER_PAGE_LIMIT = 100;

type PageOptions = {
  limit?: number;
  offset?: number;
};

export type RoomInventoryFilters = PageOptions & {
  category?: KostTypeCategory;
  kostTypeId?: string;
  buildingId?: string;
  floor?: string;
  status?: RoomStatus;
  q?: string;
  includeActiveLease?: boolean;
};

export function useM4KostTypes(
  filters: PageOptions & { category?: KostTypeCategory; q?: string; status?: MasterStatus } = {},
) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...filters, limit: filters.limit ?? MASTER_PAGE_LIMIT };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.kostTypes.list(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxMasterApi.kostTypes.list({
        propertyId: currentPropertyId!,
        category: filters.category,
        q: filters.q,
        status: filters.status,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4KostType(id: string | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.kostTypes.detail(currentPropertyId ?? "", id ?? ""),
    queryFn: () => adminUxMasterApi.kostTypes.detail(id!),
    enabled: Boolean(currentPropertyId && id),
  });
}

export function useM4FacilityCategories() {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.facilities.categories(currentPropertyId ?? ""),
    queryFn: () =>
      adminUxMasterApi.facilities.categories({
        propertyId: currentPropertyId!,
        limit: MASTER_PAGE_LIMIT,
        offset: 0,
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4RoomFacilities(
  filters: PageOptions & { categoryId?: string; q?: string; status?: MasterStatus } = {},
) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...filters, limit: filters.limit ?? MASTER_PAGE_LIMIT };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.facilities.list(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxMasterApi.facilities.roomFacilities({
        propertyId: currentPropertyId!,
        categoryId: filters.categoryId,
        q: filters.q,
        status: filters.status,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4KostTypeRules(scope: "global" | "kost_type", kostTypeId?: string | null) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.rules.list(currentPropertyId ?? "", scope, kostTypeId ?? undefined),
    queryFn: () =>
      adminUxMasterApi.rules.list({
        propertyId: currentPropertyId!,
        scope,
        kostTypeId: kostTypeId ?? undefined,
        limit: MASTER_PAGE_LIMIT,
        offset: 0,
      }),
    enabled: Boolean(currentPropertyId) && (scope === "global" || Boolean(kostTypeId)),
  });
}

export function useM4RoomInventory(filters: RoomInventoryFilters = {}) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...filters, limit: filters.limit ?? 20 };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.list(currentPropertyId ?? "", keyFilters),
    queryFn: () =>
      adminUxMasterApi.rooms.list({
        propertyId: currentPropertyId!,
        category: filters.category,
        kostTypeId: filters.kostTypeId,
        buildingId: filters.buildingId,
        floor: filters.floor,
        status: filters.status,
        q: filters.q,
        includeActiveLease: filters.includeActiveLease,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4RoomAvailability() {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.availability(currentPropertyId ?? ""),
    queryFn: () => adminUxMasterApi.rooms.availability(currentPropertyId!),
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4RoomBuildings(category: KostTypeCategory | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.buildings(currentPropertyId ?? "", category ?? ""),
    queryFn: () => adminUxMasterApi.rooms.buildings(currentPropertyId!, category!),
    enabled: Boolean(currentPropertyId && category),
  });
}

export function useM4Gallery(target: GalleryTarget | null, options: PageOptions = {}) {
  const { currentPropertyId } = useProperty();
  const targetId =
    target?.targetType === "kost_type"
      ? target.kostTypeId
      : target?.targetType === "common_area"
        ? "common_area:" + target.commonAreaKey
        : "";
  const keyFilters = { ...options, limit: options.limit ?? 20 };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.gallery.list(
      currentPropertyId ?? "",
      target?.targetType ?? "common_area",
      targetId,
      keyFilters,
    ),
    queryFn: () =>
      adminUxMasterApi.gallery.list({
        propertyId: currentPropertyId!,
        ...target!,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      }),
    enabled: Boolean(currentPropertyId && target),
  });
}

type M4MutationRunner<TData, TVariables> = (
  propertyId: string,
  variables: TVariables,
  idempotencyKey: string,
) => Promise<TData>;

/**
 * Shared mutation boundary for M4. Every write receives a fresh idempotency key,
 * invalidates only the relevant property scope, and emits an allowlisted error.
 */
export function useM4Mutation<TData, TVariables>(
  domain: AdminUxMutation,
  successMessage: string,
  runner: M4MutationRunner<TData, TVariables>,
): UseMutationResult<TData, unknown, TVariables> {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      if (!currentPropertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      return runner(currentPropertyId, variables, newIdempotencyKey());
    },
    onSuccess: async () => {
      if (currentPropertyId)
        await invalidateAdminUxMutation(queryClient, domain, currentPropertyId);
      toast.success(successMessage);
    },
    onError: (error) => {
      toast.error(safeErrorMessage(error));
    },
  });
}
