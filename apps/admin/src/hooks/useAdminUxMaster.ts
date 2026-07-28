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
  type GalleryTarget,
  type KostTypeCategory,
  type MasterStatus,
  type RoomInventory,
  type RoomInventoryInput,
  type RoomInventoryUpdateInput,
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

export type RoomPersistenceRequest =
  | {
      kind: "create";
      propertyId: string;
      category: KostTypeCategory;
      input: RoomInventoryInput;
    }
  | {
      kind: "update";
      propertyId: string;
      category: KostTypeCategory;
      roomId: string;
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
    roomId: request.kind === "update" ? request.roomId : null,
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
      if (request.kind === "create" && request.input.propertyId !== request.propertyId) {
        throw new Error("PROPERTY_SCOPE_MISMATCH");
      }

      const fingerprint = roomMutationFingerprint(request);
      const intent = resolveRoomMutationIntent(intentRef.current, fingerprint);
      intentRef.current = intent;
      const room =
        request.kind === "create"
          ? await adminUxMasterApi.rooms.create(request.input, intent.idempotencyKey)
          : await adminUxMasterApi.rooms.update(
              request.roomId,
              request.input,
              intent.idempotencyKey,
            );

      if (
        room.propertyId !== request.propertyId ||
        room.kostType.category !== request.category ||
        (request.kind === "update" && room.id !== request.roomId)
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
        roomPersistenceInvalidationKeys(result.propertyId, result.room.id).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      if (
        intentRef.current?.fingerprint === result.fingerprint &&
        intentRef.current.idempotencyKey === result.idempotencyKey
      ) {
        intentRef.current = null;
      }
      if (roomPersistenceScopeMatches(scopeRef.current, request)) {
        toast.success(
          request.kind === "create" ? "Kamar berhasil disimpan" : "Inventori kamar diperbarui",
        );
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
