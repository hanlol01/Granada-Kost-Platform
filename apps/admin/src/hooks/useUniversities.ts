import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUniversity, listUniversities } from "@/lib/admin-universities";
import { useProperty } from "@/lib/property";

export const universityQueryKeys = {
  all: (propertyId: string) => ["universities", propertyId] as const,
  list: (propertyId: string, search: string) =>
    ["universities", propertyId, "list", search] as const,
};

export function useUniversities(search: string, propertyIdOverride?: string | null) {
  const { currentPropertyId } = useProperty();
  const propertyId = propertyIdOverride ?? currentPropertyId;
  const normalizedSearch = search.trim();
  return useQuery({
    queryKey: universityQueryKeys.list(propertyId ?? "none", normalizedSearch),
    queryFn: ({ signal }) => listUniversities(propertyId!, normalizedSearch, signal),
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateUniversity(propertyIdOverride?: string | null) {
  const { currentPropertyId } = useProperty();
  const propertyId = propertyIdOverride ?? currentPropertyId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["universities", "create", propertyId ?? "none"],
    mutationFn: ({ name }: { name: string }) => {
      if (!propertyId) throw new Error("Property scope belum aktif.");
      return createUniversity(propertyId, name);
    },
    onSuccess: () => {
      if (propertyId) {
        void queryClient.invalidateQueries({ queryKey: universityQueryKeys.all(propertyId) });
      }
    },
  });
}
