import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Archive, ChevronDown, ChevronUp, Plus, RotateCcw, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCategoryContent,
  useContentPublicationMutation,
  useM4KostTypes,
} from "@/hooks/useAdminUxMaster";
import {
  adminUxMasterApi,
  type CategoryContentWorkspace,
  type CategoryFacilityDraft,
  type KostType,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
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

const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function FasilitasRoute() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const typesQuery = useM4KostTypes({ status: "active", limit: 100 });
  const types = typesQuery.data?.items ?? [];
  const selectedType = resolveSelectedType(types, search.kost_type_id);
  const workspaceQuery = useCategoryContent(selectedType?.id);
  const [items, setItems] = useState<CategoryFacilityDraft[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(today());

  useEffect(() => {
    const canonicalSearch = facilitiesSearchString(search);
    if (
      typeof window !== "undefined" &&
      canonicalSearchReplacement(window.location.search, canonicalSearch) !== null
    ) {
      void navigate({ search: facilitiesNavigationSearch(search) as never, replace: true });
    }
  }, [navigate, search]);

  useEffect(() => {
    setItems(
      workspaceQuery.data?.facilities.map((facility) => ({
        id: facility.id,
        label: facility.label,
        publicDescription: facility.publicDescription,
        sortOrder: facility.sortOrder,
        contentState: facility.contentState,
        publicVisible: facility.publicVisible,
      })) ?? [],
    );
  }, [selectedType?.id, workspaceQuery.data]);

  const save = useContentPublicationMutation<
    CategoryContentWorkspace,
    { kostTypeId: string; items: CategoryFacilityDraft[] }
  >("category-content", "Draft fasilitas disimpan", (propertyId, values, key) =>
    adminUxMasterApi.categoryContent.replaceFacilities(
      propertyId,
      values.kostTypeId,
      values.items,
      key,
    ),
  );
  const publish = useContentPublicationMutation<
    CategoryContentWorkspace,
    { kostTypeId: string; effectiveDate: string }
  >("category-content", "Fasilitas dijadwalkan untuk publikasi", (propertyId, values, key) =>
    adminUxMasterApi.categoryContent.publish(
      propertyId,
      values.kostTypeId,
      "facilities",
      values.effectiveDate,
      key,
    ),
  );
  const restore = useContentPublicationMutation<
    CategoryContentWorkspace,
    { kostTypeId: string; versionId: string }
  >("category-content", "Versi fasilitas dipulihkan sebagai draft", (propertyId, values, key) =>
    adminUxMasterApi.categoryContent.restore(propertyId, values.kostTypeId, values.versionId, key),
  );
  const unpublish = useContentPublicationMutation<CategoryContentWorkspace, { kostTypeId: string }>(
    "category-content",
    "Publikasi fasilitas dinonaktifkan",
    (propertyId, values, key) =>
      adminUxMasterApi.categoryContent.unpublish(propertyId, values.kostTypeId, "facilities", key),
  );

  const query = search.q.trim().toLocaleLowerCase("id-ID");
  const visibleItems = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) =>
          query
            ? `${item.label} ${item.publicDescription ?? ""}`
                .toLocaleLowerCase("id-ID")
                .includes(query)
            : true,
        ),
    [items, query],
  );
  const busy = save.isPending || publish.isPending || restore.isPending || unpublish.isPending;
  const versions = workspaceQuery.data?.publication.facilities ?? [];
  const savedItems = workspaceQuery.data?.facilities ?? [];
  const normalizedLabels = items.map((item) => item.label.trim().toLocaleLowerCase("id-ID"));
  const hasMissingLabel = normalizedLabels.some((label) => !label);
  const hasDuplicateLabel =
    new Set(normalizedLabels.filter(Boolean)).size !== normalizedLabels.filter(Boolean).length;
  const draftInvalid = hasMissingLabel || hasDuplicateLabel;
  const isDirty =
    JSON.stringify(
      items.map((item, sortOrder) => ({
        id: item.id ?? null,
        label: item.label.trim(),
        publicDescription: item.publicDescription?.trim() || null,
        sortOrder,
        contentState: item.contentState,
        publicVisible: item.contentState === "active" && item.publicVisible,
      })),
    ) !==
    JSON.stringify(
      savedItems.map((item) => ({
        id: item.id,
        label: item.label,
        publicDescription: item.publicDescription,
        sortOrder: item.sortOrder,
        contentState: item.contentState,
        publicVisible: item.publicVisible,
      })),
    );

  useBlocker({
    shouldBlockFn: () =>
      isDirty && !window.confirm("Perubahan draft fasilitas belum disimpan. Tinggalkan halaman?"),
    enableBeforeUnload: isDirty,
  });

  if (typesQuery.isLoading || workspaceQuery.isLoading) {
    return (
      <AppShell title="Fasilitas Kategori" subtitle="Konten fasilitas Rumah Kost dan Apart Kost">
        <LoadingState label="Memuat authority fasilitas..." />
      </AppShell>
    );
  }
  if (typesQuery.error || workspaceQuery.error) {
    return (
      <AppShell title="Fasilitas Kategori" subtitle="Konten fasilitas Rumah Kost dan Apart Kost">
        <ErrorState
          error={typesQuery.error ?? workspaceQuery.error}
          title="Gagal memuat fasilitas kategori"
          onRetry={() => {
            void typesQuery.refetch();
            void workspaceQuery.refetch();
          }}
        />
      </AppShell>
    );
  }
  if (!selectedType || types.length !== 2) {
    return (
      <AppShell title="Fasilitas Kategori" subtitle="Konten fasilitas Rumah Kost dan Apart Kost">
        <EmptyState
          title="Authority kategori perlu direkonsiliasi"
          description="Properti aktif harus memiliki tepat satu Rumah Kost dan satu Apart Kost."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Fasilitas Kategori"
      subtitle="Fasilitas dimiliki kategori dan berlaku ke seluruh kamar pada kategori tersebut."
      actions={
        canManage ? (
          <Button
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              setItems((current) => [
                ...current,
                {
                  label: "",
                  publicDescription: "",
                  sortOrder: current.length,
                  contentState: "active",
                  publicVisible: true,
                },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Tambah fasilitas
          </Button>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <CategoryTabs
          types={types}
          selectedId={selectedType.id}
          onSelect={(kostTypeId) =>
            void navigate({
              search: (current) => ({ ...current, kost_type_id: kostTypeId }),
            })
          }
        />

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{workspaceQuery.data?.category.label}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Draft internal; publik hanya membaca versi published yang sudah efektif.
              </p>
            </div>
            <Badge variant="outline">
              {versions.find((version) => version.publicationStatus === "published")
                ? `Published v${versions.find((version) => version.publicationStatus === "published")?.version}`
                : "Belum dipublikasikan"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md">
              <Label htmlFor="facility-search">Cari fasilitas</Label>
              <Input
                id="facility-search"
                className="min-h-11"
                value={search.q}
                placeholder="Nama atau deskripsi fasilitas"
                onChange={(event) =>
                  void navigate({
                    search: (current) => ({ ...current, q: event.target.value }),
                  })
                }
              />
            </div>
            {visibleItems.length ? (
              <div className="space-y-3">
                {visibleItems.map(({ item, index }) => (
                  <FacilityRow
                    key={item.id ?? `new-${index}`}
                    item={item}
                    index={index}
                    total={items.length}
                    disabled={!canManage || busy}
                    onChange={(next) =>
                      setItems((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index ? next : candidate,
                        ),
                      )
                    }
                    onMove={(direction) =>
                      setItems((current) => moveItem(current, index, direction))
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={query ? "Fasilitas tidak ditemukan" : "Belum ada fasilitas kategori"}
                description="Tambahkan konten fasilitas yang aman ditampilkan kepada calon penghuni."
              />
            )}
            {canManage ? (
              <div className="flex flex-wrap items-end justify-end gap-3 border-t pt-4">
                <HeroUiDatePicker
                  id="facility-effective-date"
                  className="min-w-48"
                  label="Tanggal efektif publikasi"
                  value={effectiveDate}
                  onChange={(value) => setEffectiveDate(value ?? "")}
                />
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || draftInvalid}
                  onClick={() =>
                    void save.mutateAsync({
                      kostTypeId: selectedType.id,
                      items: items.map((item, sortOrder) => ({ ...item, sortOrder })),
                    })
                  }
                >
                  <Save className="mr-2 h-4 w-4" /> Simpan draft
                </Button>
                <Button
                  className="min-h-11"
                  disabled={busy || !effectiveDate || isDirty || draftInvalid}
                  onClick={() => {
                    if (!window.confirm("Publikasikan snapshot fasilitas yang sudah disimpan?"))
                      return;
                    void publish.mutateAsync({
                      kostTypeId: selectedType.id,
                      effectiveDate,
                    });
                  }}
                >
                  Publikasikan
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={
                    busy || !versions.some((version) => version.publicationStatus === "published")
                  }
                  onClick={() => {
                    if (!window.confirm("Hentikan seluruh publikasi fasilitas kategori ini?"))
                      return;
                    void unpublish.mutateAsync({ kostTypeId: selectedType.id });
                  }}
                >
                  Unpublish
                </Button>
              </div>
            ) : null}
            {isDirty ? (
              <p className="text-sm text-muted-foreground" role="status">
                Simpan perubahan draft sebelum publikasi.
              </p>
            ) : null}
            {hasDuplicateLabel ? (
              <p className="text-sm text-destructive" role="alert">
                Nama fasilitas harus unik dalam satu kategori.
              </p>
            ) : null}
            {hasMissingLabel ? (
              <p className="text-sm text-destructive" role="alert">
                Setiap fasilitas harus memiliki nama.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card aria-label="Preview draft fasilitas publik">
          <CardHeader>
            <CardTitle>Preview draft publik</CardTitle>
          </CardHeader>
          <CardContent>
            {items.some(
              (item) => item.contentState === "active" && item.publicVisible && item.label.trim(),
            ) ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {items
                  .filter(
                    (item) =>
                      item.contentState === "active" && item.publicVisible && item.label.trim(),
                  )
                  .map((item, index) => (
                    <li key={item.id ?? `preview-${index}`} className="rounded-lg border p-3">
                      <p className="font-medium">{item.label}</p>
                      {item.publicDescription ? (
                        <p className="text-sm text-muted-foreground">{item.publicDescription}</p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tidak ada fasilitas draft yang ditandai tampil publik.
              </p>
            )}
          </CardContent>
        </Card>

        <VersionHistory
          versions={versions}
          disabled={!canManage || busy}
          onRestore={(versionId) => {
            if (!window.confirm("Pulihkan versi fasilitas ini sebagai draft baru?")) return;
            void restore.mutateAsync({ kostTypeId: selectedType.id, versionId });
          }}
        />
      </div>
    </AppShell>
  );
}

function CategoryTabs({
  types,
  selectedId,
  onSelect,
}: {
  types: KostType[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kategori hunian">
      {types
        .slice()
        .sort((left, right) => left.category.localeCompare(right.category))
        .map((type) => (
          <Button
            key={type.id}
            role="tab"
            aria-selected={selectedId === type.id}
            variant={selectedId === type.id ? "default" : "outline"}
            className="min-h-11"
            onClick={() => onSelect(type.id)}
          >
            {type.category === "rukost" ? "Rumah Kost" : "Apart Kost"}
          </Button>
        ))}
    </div>
  );
}

function FacilityRow({
  item,
  index,
  total,
  disabled,
  onChange,
  onMove,
}: {
  item: CategoryFacilityDraft;
  index: number;
  total: number;
  disabled: boolean;
  onChange: (item: CategoryFacilityDraft) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_1.4fr_auto]">
      <div>
        <Label htmlFor={`facility-label-${index}`}>Nama fasilitas</Label>
        <Input
          id={`facility-label-${index}`}
          className="min-h-11"
          value={item.label}
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ ...item, label: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`facility-description-${index}`}>Deskripsi publik</Label>
        <Textarea
          id={`facility-description-${index}`}
          value={item.publicDescription ?? ""}
          maxLength={500}
          rows={2}
          disabled={disabled}
          onChange={(event) => onChange({ ...item, publicDescription: event.target.value })}
        />
      </div>
      <div className="flex min-h-11 flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={item.publicVisible}
            disabled={disabled}
            onCheckedChange={(publicVisible) => onChange({ ...item, publicVisible })}
          />
          Tampil publik
        </label>
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11"
          disabled={disabled || index === 0}
          aria-label="Naikkan fasilitas"
          onClick={() => onMove(-1)}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11"
          disabled={disabled || index === total - 1}
          aria-label="Turunkan fasilitas"
          onClick={() => onMove(1)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11"
          disabled={disabled}
          aria-label={item.contentState === "active" ? "Arsipkan fasilitas" : "Aktifkan fasilitas"}
          onClick={() =>
            onChange({
              ...item,
              contentState: item.contentState === "active" ? "archived" : "active",
              publicVisible: item.contentState !== "active",
            })
          }
        >
          {item.contentState === "active" ? (
            <Archive className="h-4 w-4" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function VersionHistory({
  versions,
  disabled,
  onRestore,
}: {
  versions: CategoryContentWorkspace["publication"]["facilities"];
  disabled: boolean;
  onRestore: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat publikasi fasilitas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions.length ? (
          versions.map((version) => (
            <div
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <p className="text-sm">
                Versi {version.version} · efektif {version.effectiveDate}
              </p>
              <Badge variant="outline">
                {version.publicationStatus === "published" ? "Published" : "Archived"}
              </Badge>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={disabled}
                onClick={() => onRestore(version.id)}
              >
                Pulihkan sebagai draft
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada versi published.</p>
        )}
      </CardContent>
    </Card>
  );
}

function resolveSelectedType(types: KostType[], requestedId?: string): KostType | null {
  return types.find((type) => type.id === requestedId) ?? types[0] ?? null;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
