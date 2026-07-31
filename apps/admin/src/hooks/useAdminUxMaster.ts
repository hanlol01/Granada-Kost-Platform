// M4 property-scoped React Query hooks for Admin UX master data.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  adminUxMasterApi,
  assertRoomDetailScope,
  type CategoryContentWorkspace,
  type GalleryTarget,
  type KostType,
  type KostTypeCategory,
  type MasterStatus,
  type PropertyPolicyWorkspace,
  type RoomInventory,
  type RoomInventoryUpdateInput,
  type RoomInventorySort,
  type RoomStatus,
} from "@/lib/admin-ux-master-api";
import {
  adminUxQueryKeys,
  invalidateAdminUxMutation,
  normalizePagination,
  roomPersistenceInvalidationKeys,
  type AdminUxMutation,
} from "@/lib/admin-ux-query-keys";
import { normalizeAdminError, safeErrorMessage } from "@/lib/error-normalizer";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { useAuth } from "@/lib/auth";

const MASTER_PAGE_LIMIT = 100;

type PageOptions = {
  limit?: number;
  offset?: number;
};

export type RoomInventoryFilters = PageOptions & {
  category?: KostTypeCategory;
  kostTypeId?: string;
  buildingId?: string;
  floorCode?: "A" | "B";
  status?: RoomStatus;
  genderPolicy?: "male" | "female";
  activeOccupancy?: boolean;
  reconciliationState?: "normal" | "requires_review";
  sort?: RoomInventorySort;
  order?: "asc" | "desc";
  q?: string;
  includeActiveLease?: boolean;
};

export function assertKostTypeScope(
  record: Pick<KostType, "propertyId" | "category">,
  propertyId: string,
  category?: KostTypeCategory,
): void {
  if (
    record.propertyId !== propertyId ||
    (category !== undefined && record.category !== category)
  ) {
    throw new Error("KOST_TYPE_SCOPE_MISMATCH");
  }
}

export function assertKostTypePageScope(
  page: { items: Array<Pick<KostType, "propertyId" | "category">> },
  propertyId: string,
  category?: KostTypeCategory,
): void {
  for (const record of page.items) assertKostTypeScope(record, propertyId, category);
}

export function useM4KostTypes(
  filters: PageOptions & { category?: KostTypeCategory; q?: string; status?: MasterStatus } = {},
) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...filters, limit: filters.limit ?? MASTER_PAGE_LIMIT };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.kostTypes.list(currentPropertyId ?? "", keyFilters),
    queryFn: async () => {
      const propertyId = currentPropertyId!;
      const page = await adminUxMasterApi.kostTypes.list({
        propertyId: currentPropertyId!,
        category: filters.category,
        q: filters.q,
        status: filters.status,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      });
      assertKostTypePageScope(page, propertyId, filters.category);
      return page;
    },
    enabled: Boolean(currentPropertyId),
  });
}

export function useM4KostType(id: string | null | undefined) {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.kostTypes.detail(currentPropertyId ?? "", id ?? ""),
    queryFn: async () => {
      const propertyId = currentPropertyId!;
      const record = await adminUxMasterApi.kostTypes.detail(id!);
      assertKostTypeScope(record, propertyId);
      return record;
    },
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
        floorCode: filters.floorCode,
        status: filters.status,
        genderPolicy: filters.genderPolicy,
        activeOccupancy: filters.activeOccupancy,
        reconciliationState: filters.reconciliationState,
        sort: filters.sort,
        order: filters.order,
        q: filters.q,
        includeActiveLease: filters.includeActiveLease,
        limit: Number(normalized.limit),
        offset: Number(normalized.offset),
      }),
    enabled: Boolean(currentPropertyId),
  });
}

export function useRoomDetailByNumber(roomNumber: string | null | undefined) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const normalized = roomNumber?.trim() ?? "";
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.detailByNumber(
      user?.id ?? "",
      currentPropertyId ?? "",
      normalized,
    ),
    queryFn: async () => {
      const propertyId = currentPropertyId!;
      const detail = await adminUxMasterApi.rooms.detailByNumber(propertyId, normalized);
      return assertRoomDetailScope(detail, propertyId, normalized);
    },
    enabled: Boolean(user?.id && currentPropertyId && normalized),
    retry: false,
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

export function useM4AllRoomBuildings() {
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.rooms.buildings(currentPropertyId ?? "", ""),
    queryFn: () => adminUxMasterApi.rooms.buildings(currentPropertyId!),
    enabled: Boolean(currentPropertyId),
  });
}

export type RoomPersistenceRequest = {
  kind: "update";
  propertyId: string;
  category: KostTypeCategory;
  roomId: string;
  previousRoomNumber: string;
  input: RoomInventoryUpdateInput;
};

export type RoomMutationIntentState = {
  fingerprint: string;
  idempotencyKey: string;
};

type RoomPersistenceResult = {
  room: RoomInventory;
  propertyId: string;
  fingerprint: string;
  idempotencyKey: string;
};

export type RoomPersistenceScope = {
  propertyId: string | null | undefined;
  category: KostTypeCategory;
  enabled: boolean;
};

export type ActiveRoomSubmission<T> = {
  fingerprint: string;
  promise: Promise<T>;
};

export function roomPersistenceScopeMatches(
  scope: RoomPersistenceScope,
  request: RoomPersistenceRequest,
): boolean {
  return Boolean(
    scope.enabled &&
    scope.propertyId &&
    scope.propertyId === request.propertyId &&
    scope.category === request.category,
  );
}

export function roomPersistenceErrorMessage(error: unknown): string {
  const normalized = normalizeAdminError(error);
  if (normalized.code === "ROOM_STRUCTURAL_EDIT_BLOCKED") {
    return "Identitas dan lokasi kamar tidak dapat diubah selama booking, hunian, atau penyewaan masih aktif.";
  }
  if (normalized.code === "ROOM_CONFLICT") {
    return "Nomor kamar sudah digunakan pada properti ini. Periksa nomor lalu coba kembali.";
  }
  if (normalized.code === "ROOM_BUILDING_COUNTER_INVALID") {
    return "Inventori bangunan berubah saat diproses. Muat ulang data kamar lalu coba kembali.";
  }
  return normalized.message;
}

export function roomMutationFingerprint(request: RoomPersistenceRequest): string {
  const payload = Object.fromEntries(
    Object.entries(request.input).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    kind: request.kind,
    propertyId: request.propertyId,
    category: request.category,
    roomId: request.roomId,
    previousRoomNumber: request.previousRoomNumber,
    payload,
  });
}

export function resolveRoomMutationIntent(
  current: RoomMutationIntentState | null,
  fingerprint: string,
  createKey: () => string = newIdempotencyKey,
): RoomMutationIntentState {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, idempotencyKey: createKey() };
}

export function runRoomSubmissionOnce<T>(
  active: { current: ActiveRoomSubmission<T> | null },
  fingerprint: string,
  request: () => Promise<T>,
): Promise<T> {
  if (active.current) {
    if (active.current.fingerprint === fingerprint) return active.current.promise;
    return Promise.reject(new Error("ROOM_SUBMISSION_IN_PROGRESS"));
  }
  const entry: ActiveRoomSubmission<T> = {
    fingerprint,
    promise: request().finally(() => {
      if (active.current === entry) active.current = null;
    }),
  };
  active.current = entry;
  return entry.promise;
}

export function useRoomPersistenceMutation(scope: RoomPersistenceScope) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scopeRef = useRef(scope);
  const intentRef = useRef<RoomMutationIntentState | null>(null);
  const activeRef = useRef<ActiveRoomSubmission<RoomPersistenceResult> | null>(null);
  scopeRef.current = scope;

  const mutation = useMutation<RoomPersistenceResult, unknown, RoomPersistenceRequest>({
    mutationFn: async (request) => {
      if (!roomPersistenceScopeMatches(scopeRef.current, request)) {
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      const fingerprint = roomMutationFingerprint(request);
      const intent = resolveRoomMutationIntent(intentRef.current, fingerprint);
      intentRef.current = intent;
      const room = await adminUxMasterApi.rooms.update(
        request.roomId,
        request.input,
        intent.idempotencyKey,
      );

      if (
        room.propertyId !== request.propertyId ||
        room.kostType.category !== request.category ||
        room.id !== request.roomId
      ) {
        throw new Error("ROOM_MUTATION_SCOPE_MISMATCH");
      }
      return {
        room,
        propertyId: request.propertyId,
        fingerprint,
        idempotencyKey: intent.idempotencyKey,
      };
    },
    onSuccess: async (result, request) => {
      await Promise.all(
        [
          ...roomPersistenceInvalidationKeys(result.propertyId, result.room.id),
          ...(user?.id
            ? [
                adminUxQueryKeys.rooms.detailByNumber(
                  user.id,
                  result.propertyId,
                  request.previousRoomNumber,
                ),
                adminUxQueryKeys.rooms.detailByNumber(
                  user.id,
                  result.propertyId,
                  result.room.number,
                ),
              ]
            : []),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      if (
        intentRef.current?.fingerprint === result.fingerprint &&
        intentRef.current.idempotencyKey === result.idempotencyKey
      ) {
        intentRef.current = null;
      }
      if (roomPersistenceScopeMatches(scopeRef.current, request)) {
        toast.success("Inventori kamar diperbarui");
      }
    },
    onError: (error, request) => {
      if (roomPersistenceScopeMatches(scopeRef.current, request)) {
        toast.error(roomPersistenceErrorMessage(error));
      }
    },
  });

  const submit = useCallback(
    (request: RoomPersistenceRequest) => {
      const fingerprint = roomMutationFingerprint(request);
      return runRoomSubmissionOnce(activeRef, fingerprint, () => mutation.mutateAsync(request));
    },
    [mutation],
  );
  const discardIntent = useCallback(() => {
    intentRef.current = null;
    activeRef.current = null;
  }, []);

  return { submit, discardIntent, isPending: mutation.isPending };
}

export function useM4Gallery(target: GalleryTarget | null, options: PageOptions = {}) {
  const { currentPropertyId } = useProperty();
  const keyFilters = { ...options, limit: options.limit ?? 20 };
  const normalized = normalizePagination(keyFilters);
  return useQuery({
    queryKey: adminUxQueryKeys.gallery.list(
      currentPropertyId ?? "",
      "kost_type",
      target?.kostTypeId ?? "",
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

export function useCategoryContent(kostTypeId: string | null | undefined) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.categoryContent.workspace(
      user?.id ?? "",
      currentPropertyId ?? "",
      kostTypeId ?? "",
    ),
    queryFn: () => adminUxMasterApi.categoryContent.get(currentPropertyId!, kostTypeId!),
    enabled: Boolean(user?.id && currentPropertyId && kostTypeId),
    retry: false,
  });
}

export function usePropertyPolicyWorkspace() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  return useQuery({
    queryKey: adminUxQueryKeys.propertyPolicy.workspace(user?.id ?? "", currentPropertyId ?? ""),
    queryFn: () => adminUxMasterApi.propertyPolicy.get(currentPropertyId!),
    enabled: Boolean(user?.id && currentPropertyId),
    retry: false,
  });
}

export async function invalidateCategoryContent(
  queryClient: ReturnType<typeof useQueryClient>,
  propertyId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "categoryContent" && query.queryKey[2] === propertyId,
    }),
    queryClient.invalidateQueries({ queryKey: ["hunianGallery", propertyId] }),
    queryClient.invalidateQueries({ queryKey: adminUxQueryKeys.kostTypes.all(propertyId) }),
    queryClient.invalidateQueries({ queryKey: adminUxQueryKeys.rooms.all(propertyId) }),
    queryClient.invalidateQueries({ queryKey: adminUxQueryKeys.rooms.availabilityAll(propertyId) }),
    queryClient.invalidateQueries({ queryKey: adminUxQueryKeys.dashboard.summary(propertyId) }),
    queryClient.invalidateQueries({ queryKey: ["kostTypeFacilities", propertyId] }),
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "roomDetail" && query.queryKey[2] === propertyId,
    }),
  ]);
}

type ContentMutationDomain = "category-content" | "property-policy";

export function useContentPublicationMutation<TData, TVariables>(
  domain: ContentMutationDomain,
  successMessage: string,
  runner: M4MutationRunner<TData, TVariables>,
): UseMutationResult<TData, unknown, TVariables> {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyRef = useRef(currentPropertyId);
  const intentRef = useRef<CommercialIntent | null>(null);
  const activeRef = useRef<ActiveCommercialSubmission<TData> | null>(null);
  const successfulPropertyRef = useRef<string | null>(null);
  const attemptedPropertyRef = useRef<string | null>(null);
  propertyRef.current = currentPropertyId;

  return useMutation({
    mutationFn: async (variables) => {
      successfulPropertyRef.current = null;
      const propertyId = propertyRef.current;
      if (!propertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      attemptedPropertyRef.current = propertyId;
      const fingerprint = commercialMutationFingerprint(propertyId, variables);
      const intent = resolveCommercialMutationIntent(intentRef.current, fingerprint);
      intentRef.current = intent;
      let result: TData;
      try {
        result = await runCommercialSubmissionOnce(activeRef, fingerprint, () =>
          runner(propertyId, variables, intent.idempotencyKey),
        );
      } catch (error) {
        if (propertyRef.current !== propertyId) throw new Error("PROPERTY_SCOPE_CHANGED");
        throw error;
      }
      if (propertyRef.current !== propertyId) throw new Error("PROPERTY_SCOPE_CHANGED");
      successfulPropertyRef.current = propertyId;
      return result;
    },
    onSuccess: async () => {
      const propertyId = successfulPropertyRef.current;
      if (!propertyId || propertyRef.current !== propertyId) return;
      if (domain === "category-content") {
        await invalidateCategoryContent(queryClient, propertyId);
      } else {
        await queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "propertyPolicy" && query.queryKey[2] === propertyId,
        });
      }
      intentRef.current = null;
      successfulPropertyRef.current = null;
      attemptedPropertyRef.current = null;
      toast.success(successMessage);
    },
    onError: (error) => {
      successfulPropertyRef.current = null;
      const attemptedProperty = attemptedPropertyRef.current;
      attemptedPropertyRef.current = null;
      if (!attemptedProperty || propertyRef.current !== attemptedProperty) return;
      if (isCommercialScopeMismatch(error)) return;
      if (propertyRef.current) toast.error(safeErrorMessage(error));
    },
  });
}

export type CategoryContentMutationResult = CategoryContentWorkspace;
export type PropertyPolicyMutationResult = PropertyPolicyWorkspace;

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

type CommercialIntent = {
  fingerprint: string;
  idempotencyKey: string;
};

type ActiveCommercialSubmission<T> = {
  fingerprint: string;
  promise: Promise<T>;
};

export function commercialMutationFingerprint(propertyId: string, variables: unknown): string {
  return JSON.stringify({ propertyId, variables });
}

export function resolveCommercialMutationIntent(
  current: CommercialIntent | null,
  fingerprint: string,
  createKey: () => string = newIdempotencyKey,
): CommercialIntent {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, idempotencyKey: createKey() };
}

export function runCommercialSubmissionOnce<T>(
  active: { current: ActiveCommercialSubmission<T> | null },
  fingerprint: string,
  request: () => Promise<T>,
): Promise<T> {
  if (active.current) {
    if (active.current.fingerprint === fingerprint) return active.current.promise;
    return Promise.reject(new Error("COMMERCIAL_SUBMISSION_IN_PROGRESS"));
  }
  const entry: ActiveCommercialSubmission<T> = {
    fingerprint,
    promise: request().finally(() => {
      if (active.current === entry) active.current = null;
    }),
  };
  active.current = entry;
  return entry.promise;
}

export function isCommercialScopeMismatch(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "PROPERTY_SCOPE_CHANGED" || error.message === "KOST_TYPE_SCOPE_MISMATCH")
  );
}

export async function invalidateKostTypeCommercial(
  queryClient: ReturnType<typeof useQueryClient>,
  propertyId: string,
): Promise<void> {
  await Promise.all([
    invalidateAdminUxMutation(queryClient, "kost-type", propertyId),
    queryClient.invalidateQueries({ queryKey: ["kostType", propertyId] }),
    queryClient.invalidateQueries({ queryKey: ["room", propertyId] }),
    queryClient.invalidateQueries({ queryKey: ["roomAvailability", propertyId] }),
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "roomDetail" && query.queryKey[2] === propertyId,
    }),
  ]);
}

export function useKostTypeCommercialMutation<TData, TVariables>(
  successMessage: string,
  runner: M4MutationRunner<TData, TVariables>,
  validateResult: (result: TData, propertyId: string) => void,
): UseMutationResult<TData, unknown, TVariables> {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const propertyRef = useRef(currentPropertyId);
  const intentRef = useRef<CommercialIntent | null>(null);
  const activeRef = useRef<ActiveCommercialSubmission<TData> | null>(null);
  const successfulPropertyRef = useRef<string | null>(null);
  propertyRef.current = currentPropertyId;

  return useMutation({
    mutationFn: async (variables) => {
      successfulPropertyRef.current = null;
      const propertyId = propertyRef.current;
      if (!propertyId) throw new Error("PROPERTY_SCOPE_REQUIRED");
      const fingerprint = commercialMutationFingerprint(propertyId, variables);
      const intent = resolveCommercialMutationIntent(intentRef.current, fingerprint);
      intentRef.current = intent;
      const result = await runCommercialSubmissionOnce(activeRef, fingerprint, () =>
        runner(propertyId, variables, intent.idempotencyKey),
      );
      if (propertyRef.current !== propertyId) throw new Error("PROPERTY_SCOPE_CHANGED");
      validateResult(result, propertyId);
      successfulPropertyRef.current = propertyId;
      return result;
    },
    onSuccess: async () => {
      const propertyId = successfulPropertyRef.current;
      if (!propertyId || propertyRef.current !== propertyId) return;
      await invalidateKostTypeCommercial(queryClient, propertyId);
      intentRef.current = null;
      successfulPropertyRef.current = null;
      toast.success(successMessage);
    },
    onError: (error) => {
      successfulPropertyRef.current = null;
      if (isCommercialScopeMismatch(error)) return;
      if (propertyRef.current) toast.error(safeErrorMessage(error));
    },
  });
}
