import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminUxMasterApi,
  type FacilityCategory,
  type FacilityCategoryInput,
  type KostType,
  type RoomFacility,
  type RoomFacilityInput,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import {
  useM4FacilityCategories,
  useM4KostType,
  useM4KostTypes,
  useM4Mutation,
  useM4RoomFacilities,
} from "@/hooks/useAdminUxMaster";
import {
  canonicalSearchReplacement,
  facilitiesNavigationSearch,
  facilitiesSearchString,
  normalizeFacilitiesSearch,
} from "@/lib/kmo-w00-route-integrity";

export const Route = createFileRoute("/rooms/fasilitas")({
  validateSearch: normalizeFacilitiesSearch,
  component: FasilitasRoute,
});

type CategoryDraft = { name: string; icon: string };
const EMPTY_FACILITIES: RoomFacility[] = [];

type FacilityDraft = {
  categoryId: string;
  name: string;
  icon: string;
  description: string;
  status: "active" | "inactive";
};

function FasilitasRoute() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canonicalSearch = facilitiesSearchString(search);
  const categoriesQuery = useM4FacilityCategories();
  const facilitiesQuery = useM4RoomFacilities({ limit: 100 });
  const typesQuery = useM4KostTypes({ status: "active", limit: 100 });
  const [categoryEditor, setCategoryEditor] = useState<FacilityCategory | "create" | null>(null);
  const [facilityEditor, setFacilityEditor] = useState<RoomFacility | "create" | null>(null);
  const [assignmentIds, setAssignmentIds] = useState<string[]>([]);
  const categories = categoriesQuery.data?.items ?? [];
  const facilities = facilitiesQuery.data?.items ?? EMPTY_FACILITIES;
  const types = typesQuery.data?.items ?? [];
  const selectedKostTypeId = search.kost_type_id ?? types[0]?.id ?? null;
  const selectedKostTypeQuery = useM4KostType(selectedKostTypeId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (canonicalSearchReplacement(window.location.search, canonicalSearch) === null) return;
    void navigate({ search: facilitiesNavigationSearch(search) as never, replace: true });
  }, [canonicalSearch, navigate, search]);

  useEffect(() => {
    setAssignmentIds(selectedKostTypeQuery.data?.facilities?.map((facility) => facility.id) ?? []);
  }, [selectedKostTypeQuery.data?.facilities, selectedKostTypeId]);

  const visibleFacilities = useMemo(
    () =>
      facilities.filter((facility) => {
        const query = search.q.toLowerCase();
        return (
          (!search.category_id || facility.categoryId === search.category_id) &&
          (!query || `${facility.name} ${facility.description ?? ""}`.toLowerCase().includes(query))
        );
      }),
    [facilities, search.category_id, search.q],
  );

  if (categoriesQuery.isLoading || facilitiesQuery.isLoading || typesQuery.isLoading) {
    return (
      <AppShell title="Fasilitas" subtitle="Master fasilitas dan assignment tipe kost">
        <LoadingState label="Memuat fasilitas..." />
      </AppShell>
    );
  }
  if (categoriesQuery.error || facilitiesQuery.error || typesQuery.error) {
    return (
      <AppShell title="Fasilitas" subtitle="Master fasilitas dan assignment tipe kost">
        <ErrorState
          error={categoriesQuery.error ?? facilitiesQuery.error ?? typesQuery.error}
          title="Gagal memuat fasilitas"
          onRetry={() => {
            void categoriesQuery.refetch();
            void facilitiesQuery.refetch();
            void typesQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  const updateSearch = (next: Partial<typeof search>) =>
    navigate({ search: (current) => ({ ...current, ...next }) });

  return (
    <AppShell
      title="Fasilitas"
      subtitle="Kelola kategori dan master fasilitas; assignment berlaku per tipe kost, bukan per kamar."
      actions={
        canManage ? (
          <Button onClick={() => setFacilityEditor("create")} disabled={!categories.length}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Fasilitas
          </Button>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <FacilityCatalog
            categories={categories}
            facilities={visibleFacilities}
            canManage={canManage}
            selectedCategoryId={search.category_id}
            onSelectCategory={(categoryId) => updateSearch({ category_id: categoryId })}
            onCreateCategory={() => setCategoryEditor("create")}
            onEditCategory={setCategoryEditor}
            onCreateFacility={() => setFacilityEditor("create")}
            onEditFacility={setFacilityEditor}
          />
          <AssignmentPanel
            types={types}
            selectedTypeId={selectedKostTypeId}
            selectedType={selectedKostTypeQuery.data ?? null}
            facilities={facilities.filter((facility) => facility.status === "active")}
            assignedIds={assignmentIds}
            canManage={canManage}
            loading={selectedKostTypeQuery.isLoading}
            onTypeChange={(kostTypeId) => updateSearch({ kost_type_id: kostTypeId })}
            onChange={setAssignmentIds}
          />
        </div>
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            className="border-slate-700 bg-slate-950 pl-9"
            value={search.q}
            placeholder="Cari fasilitas"
            onChange={(event) => updateSearch({ q: event.target.value })}
          />
        </div>
      </div>
      <CategoryEditor
        category={categoryEditor === "create" ? null : categoryEditor}
        open={categoryEditor !== null}
        onOpenChange={(open) => !open && setCategoryEditor(null)}
      />
      <FacilityEditor
        categories={categories}
        facility={facilityEditor === "create" ? null : facilityEditor}
        open={facilityEditor !== null}
        onOpenChange={(open) => !open && setFacilityEditor(null)}
      />
    </AppShell>
  );
}

function FacilityCatalog({
  categories,
  facilities,
  canManage,
  selectedCategoryId,
  onSelectCategory,
  onCreateCategory,
  onEditCategory,
  onCreateFacility,
  onEditFacility,
}: {
  categories: FacilityCategory[];
  facilities: RoomFacility[];
  canManage: boolean;
  selectedCategoryId?: string;
  onSelectCategory: (categoryId?: string) => void;
  onCreateCategory: () => void;
  onEditCategory: (category: FacilityCategory) => void;
  onCreateFacility: () => void;
  onEditFacility: (facility: RoomFacility) => void;
}) {
  const reorderCategories = useM4Mutation<unknown, { items: { id: string; sortOrder: number }[] }>(
    "facility",
    "Urutan kategori disimpan",
    (propertyId, values, key) =>
      adminUxMasterApi.facilities.reorderCategories(propertyId, values.items, key),
  );
  const reorderFacilities = useM4Mutation<
    unknown,
    { categoryId?: string; items: { id: string; sortOrder: number }[] }
  >("facility", "Urutan fasilitas disimpan", (propertyId, values, key) =>
    adminUxMasterApi.facilities.reorderRoomFacilities(
      propertyId,
      values.categoryId,
      values.items,
      key,
    ),
  );
  const deleteCategory = useM4Mutation<unknown, { id: string }>(
    "facility",
    "Kategori dihapus",
    (_propertyId, values, key) => adminUxMasterApi.facilities.removeCategory(values.id, key),
  );
  const deleteFacility = useM4Mutation<unknown, { id: string }>(
    "facility",
    "Fasilitas dihapus",
    (_propertyId, values, key) => adminUxMasterApi.facilities.removeRoomFacility(values.id, key),
  );
  const grouped = categories.map((category) => ({
    category,
    facilities: facilities
      .filter((facility) => facility.categoryId === category.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  const moveCategory = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    void reorderCategories.mutateAsync({
      items: next.map((item, sortOrder) => ({ id: item.id, sortOrder })),
    });
  };
  const moveFacility = (
    categoryId: string,
    items: RoomFacility[],
    index: number,
    direction: -1 | 1,
  ) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    void reorderFacilities.mutateAsync({
      categoryId,
      items: next.map((item, sortOrder) => ({ id: item.id, sortOrder })),
    });
  };

  return (
    <Card className="border-slate-800 bg-slate-900/85">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Master fasilitas</h2>
            <p className="text-sm text-slate-400">Urutkan kategori dan fasilitas secara atomik.</p>
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={onCreateCategory}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Kategori
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 border-y border-slate-800 py-3">
          <Button
            size="sm"
            variant={!selectedCategoryId ? "secondary" : "ghost"}
            onClick={() => onSelectCategory(undefined)}
          >
            Semua
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              size="sm"
              variant={selectedCategoryId === category.id ? "secondary" : "ghost"}
              onClick={() => onSelectCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>
        {grouped.length ? (
          grouped.map(({ category, facilities: categoryFacilities }, index) => (
            <section
              key={category.id}
              className="rounded-xl border border-slate-800 bg-slate-950/45"
            >
              <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-100">{category.name}</p>
                  <p className="text-xs text-slate-500">{categoryFacilities.length} fasilitas</p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={index === 0 || reorderCategories.isPending}
                      onClick={() => moveCategory(index, -1)}
                      aria-label="Naikkan kategori"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={index === categories.length - 1 || reorderCategories.isPending}
                      onClick={() => moveCategory(index, 1)}
                      aria-label="Turunkan kategori"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEditCategory(category)}
                      aria-label="Edit kategori"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-rose-300 hover:text-rose-200"
                      onClick={() => {
                        if (window.confirm(`Hapus kategori ${category.name}?`))
                          void deleteCategory.mutateAsync({ id: category.id });
                      }}
                      aria-label="Hapus kategori"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </header>
              {categoryFacilities.length ? (
                <div className="divide-y divide-slate-800">
                  {categoryFacilities.map((facility, facilityIndex) => (
                    <div
                      key={facility.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200">{facility.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {facility.description || "Tanpa deskripsi"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant="outline"
                          className={
                            facility.status === "active"
                              ? "border-emerald-500/30 text-emerald-300"
                              : "border-slate-700 text-slate-400"
                          }
                        >
                          {facility.status === "active" ? "Aktif" : "Nonaktif"}
                        </Badge>
                        {canManage ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={facilityIndex === 0 || reorderFacilities.isPending}
                              onClick={() =>
                                moveFacility(category.id, categoryFacilities, facilityIndex, -1)
                              }
                              aria-label="Naikkan fasilitas"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={
                                facilityIndex === categoryFacilities.length - 1 ||
                                reorderFacilities.isPending
                              }
                              onClick={() =>
                                moveFacility(category.id, categoryFacilities, facilityIndex, 1)
                              }
                              aria-label="Turunkan fasilitas"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onEditFacility(facility)}
                              aria-label="Edit fasilitas"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-rose-300 hover:text-rose-200"
                              onClick={() => {
                                if (window.confirm(`Hapus fasilitas ${facility.name}?`))
                                  void deleteFacility.mutateAsync({ id: facility.id });
                              }}
                              aria-label="Hapus fasilitas"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-5 text-sm text-slate-500">
                  Belum ada fasilitas pada kategori ini.
                </p>
              )}
            </section>
          ))
        ) : (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="Belum ada kategori fasilitas"
            description="Buat kategori sebelum menambahkan fasilitas."
            action={
              canManage ? <Button onClick={onCreateCategory}>Buat Kategori</Button> : undefined
            }
          />
        )}
        {canManage && categories.length ? (
          <Button variant="outline" className="w-full" onClick={onCreateFacility}>
            <Plus className="mr-2 h-4 w-4" /> Tambah fasilitas
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AssignmentPanel({
  types,
  selectedTypeId,
  selectedType,
  facilities,
  assignedIds,
  canManage,
  loading,
  onTypeChange,
  onChange,
}: {
  types: KostType[];
  selectedTypeId: string | null;
  selectedType: KostType | null;
  facilities: RoomFacility[];
  assignedIds: string[];
  canManage: boolean;
  loading: boolean;
  onTypeChange: (id?: string) => void;
  onChange: (ids: string[]) => void;
}) {
  const replace = useM4Mutation<KostType, { id: string; facilityIds: string[] }>(
    "facility",
    "Assignment fasilitas diperbarui",
    (propertyId, values, key) =>
      adminUxMasterApi.kostTypes.replaceFacilities(values.id, propertyId, values.facilityIds, key),
  );
  const toggle = (id: string) =>
    onChange(
      assignedIds.includes(id) ? assignedIds.filter((item) => item !== id) : [...assignedIds, id],
    );
  const grouped = new Map<string, RoomFacility[]>();
  for (const facility of facilities) {
    const label = facility.categoryName || "Tanpa kategori";
    grouped.set(label, [...(grouped.get(label) ?? []), facility]);
  }
  const changed = selectedType
    ? [...assignedIds].sort().join("|") !==
      [...(selectedType.facilities?.map((item) => item.id) ?? [])].sort().join("|")
    : false;

  return (
    <Card className="h-fit border-slate-800 bg-slate-900/85">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Assignment tipe kost</h2>
          <p className="mt-1 text-sm text-slate-400">
            Satu checklist mengganti set fasilitas secara atomik.
          </p>
        </div>
        <Select
          value={selectedTypeId ?? "none"}
          onValueChange={(id) => onTypeChange(id === "none" ? undefined : id)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih tipe kost" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Pilih tipe kost</SelectItem>
            {types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading ? (
          <LoadingState label="Memuat assignment..." />
        ) : selectedType ? (
          <>
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100">
              {selectedType.name} · {assignedIds.length} fasilitas terpilih
            </div>
            <div className="max-h-[440px] space-y-4 overflow-y-auto pr-1">
              {[...grouped.entries()].map(([category, categoryFacilities]) => (
                <div key={category}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {category}
                  </p>
                  <div className="space-y-2">
                    {categoryFacilities.map((facility) => {
                      const checked = assignedIds.includes(facility.id);
                      return (
                        <label
                          key={facility.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3 transition hover:border-slate-700"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-blue-500"
                            checked={checked}
                            disabled={!canManage || replace.isPending}
                            onChange={() => toggle(facility.id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-200">
                              {facility.name}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {facility.description || "Tanpa deskripsi"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {canManage ? (
              <Button
                className="w-full"
                disabled={!changed || replace.isPending}
                onClick={() =>
                  void replace.mutateAsync({ id: selectedType.id, facilityIds: assignedIds })
                }
              >
                {replace.isPending ? "Menyimpan assignment..." : "Simpan Assignment"}
              </Button>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<Wrench className="h-5 w-5" />}
            title="Pilih tipe kost"
            description="Assignment fasilitas akan muncul setelah tipe kost dipilih."
          />
        )}
      </CardContent>
    </Card>
  );
}

function CategoryEditor({
  category,
  open,
  onOpenChange,
}: {
  category: FacilityCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<CategoryDraft>({ name: "", icon: "" });
  const create = useM4Mutation<FacilityCategory, CategoryDraft>(
    "facility",
    "Kategori fasilitas disimpan",
    (propertyId, input, key) =>
      adminUxMasterApi.facilities.createCategory({ ...input, propertyId }, key),
  );
  const update = useM4Mutation<FacilityCategory, { id: string; input: CategoryDraft }>(
    "facility",
    "Kategori fasilitas diperbarui",
    (_propertyId, values, key) =>
      adminUxMasterApi.facilities.updateCategory(values.id, values.input, key),
  );
  const pending = create.isPending || update.isPending;
  useEffect(() => {
    if (open) setDraft({ name: category?.name ?? "", icon: category?.icon ?? "" });
  }, [category, open]);
  const submit = async () => {
    if (!draft.name.trim()) return;
    try {
      if (category) await update.mutateAsync({ id: category.id, input: draft });
      else await create.mutateAsync(draft);
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>{category ? "Edit kategori" : "Buat kategori"}</DialogTitle>
          <DialogDescription>Kategori membantu mengelompokkan fasilitas aktif.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nama kategori</Label>
            <Input
              value={draft.name}
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ikon (opsional)</Label>
            <Input
              value={draft.icon}
              maxLength={80}
              placeholder="Mis. wifi"
              onChange={(event) =>
                setDraft((current) => ({ ...current, icon: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!draft.name.trim() || pending} onClick={() => void submit()}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FacilityEditor({
  categories,
  facility,
  open,
  onOpenChange,
}: {
  categories: FacilityCategory[];
  facility: RoomFacility | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<FacilityDraft>({
    categoryId: "",
    name: "",
    icon: "",
    description: "",
    status: "active",
  });
  const create = useM4Mutation<RoomFacility, Omit<RoomFacilityInput, "propertyId">>(
    "facility",
    "Fasilitas berhasil disimpan",
    (propertyId, input, key) =>
      adminUxMasterApi.facilities.createRoomFacility({ ...input, propertyId }, key),
  );
  const update = useM4Mutation<RoomFacility, { id: string; input: FacilityDraft }>(
    "facility",
    "Fasilitas berhasil diperbarui",
    (_propertyId, values, key) =>
      adminUxMasterApi.facilities.updateRoomFacility(values.id, values.input, key),
  );
  const pending = create.isPending || update.isPending;
  useEffect(() => {
    if (open)
      setDraft({
        categoryId: facility?.categoryId ?? categories[0]?.id ?? "",
        name: facility?.name ?? "",
        icon: facility?.icon ?? "",
        description: facility?.description ?? "",
        status: facility?.status ?? "active",
      });
  }, [categories, facility, open]);
  const valid = Boolean(draft.categoryId && draft.name.trim());
  const submit = async () => {
    if (!valid) return;
    try {
      if (facility) await update.mutateAsync({ id: facility.id, input: draft });
      else await create.mutateAsync(draft);
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>{facility ? "Edit fasilitas" : "Tambah fasilitas"}</DialogTitle>
          <DialogDescription>Fasilitas di-assign ke tipe kost setelah dibuat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select
              value={draft.categoryId || "none"}
              onValueChange={(categoryId) =>
                setDraft((current) => ({
                  ...current,
                  categoryId: categoryId === "none" ? "" : categoryId,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pilih kategori</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nama fasilitas</Label>
            <Input
              value={draft.name}
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Deskripsi</Label>
            <Textarea
              value={draft.description}
              maxLength={500}
              rows={3}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <Label>Fasilitas aktif</Label>
            <Switch
              checked={draft.status === "active"}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, status: checked ? "active" : "inactive" }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!valid || pending} onClick={() => void submit()}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
