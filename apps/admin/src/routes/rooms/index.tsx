import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BedDouble, Building2, DoorOpen, Layers, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Pagination,
  RoomDiscoveryFilters,
  RoomInventoryTable,
  type BuildingOption,
} from "@/components/rooms/KostTypeInventoryPage";
import { ErrorState, LoadingState } from "@/components/state";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import {
  useM4KostTypes,
  useM4AllRoomBuildings,
  useM4RoomAvailability,
  useM4RoomInventory,
} from "@/hooks/useAdminUxMaster";
import {
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
  type RoomRouteSearch,
  normalizeRoomCreateRequest,
  normalizeRoomSearch,
  summarizeRoomInventory,
} from "@/lib/admin-ux-master-helpers";
import type { KostTypeCategory, RoomStatus } from "@/lib/admin-ux-master-api";
import { useProperty } from "@/lib/property";

export const Route = createFileRoute("/rooms/")({
  validateSearch: (raw: Record<string, unknown>): RoomRouteSearch & { create?: boolean } => {
    const create = normalizeRoomCreateRequest(raw.create);
    return { ...normalizeRoomSearch(raw), ...(create ? { create } : {}) };
  },
  component: RoomsPage,
});

function RoomsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { currentPropertyId } = useProperty();
  const previousPropertyId = useRef(currentPropertyId);
  const typesQuery = useM4KostTypes({ limit: 100 });
  const availabilityQuery = useM4RoomAvailability();
  const buildingsQuery = useM4AllRoomBuildings();
  const availableRoomsQuery = useM4RoomInventory({ status: "vacant", limit: 1, offset: 0 });
  const availableRumahKostQuery = useM4RoomInventory({
    category: "rukost",
    status: "vacant",
    limit: 1,
    offset: 0,
  });
  const availableApartKostQuery = useM4RoomInventory({
    category: "apartkost",
    status: "vacant",
    limit: 1,
    offset: 0,
  });
  const roomsQuery = useM4RoomInventory({
    category: search.category,
    q: search.q,
    buildingId: search.buildingId,
    floorCode: search.floorCode,
    status: search.status,
    genderPolicy: search.genderPolicy,
    activeOccupancy: search.activeOccupancy,
    reconciliationState: search.reconciliationState,
    sort: search.sort,
    order: search.order,
    limit: search.limit,
    offset: search.offset,
    includeActiveLease: true,
  });
  const propertyChanged = previousPropertyId.current !== currentPropertyId;

  useEffect(() => {
    if (search.create) {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, create: undefined }),
      });
    }
  }, [navigate, search.create]);

  useEffect(() => {
    if (previousPropertyId.current !== currentPropertyId) {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, offset: 0 }),
      });
      previousPropertyId.current = currentPropertyId;
    }
  }, [currentPropertyId, navigate]);

  const onSearchChange = (next: Partial<RoomRouteSearch>) => {
    const categoryChanged =
      Object.prototype.hasOwnProperty.call(next, "category") && next.category !== search.category;
    void navigate({
      search: (current) => ({
        ...current,
        ...next,
        ...(categoryChanged ? { buildingId: undefined } : {}),
        create: undefined,
      }),
    });
  };

  if (
    propertyChanged ||
    typesQuery.isLoading ||
    availabilityQuery.isLoading ||
    buildingsQuery.isLoading ||
    availableRoomsQuery.isLoading ||
    availableRumahKostQuery.isLoading ||
    availableApartKostQuery.isLoading ||
    roomsQuery.isLoading
  ) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Menyiapkan ringkasan master data kamar">
        <LoadingState label="Memuat ringkasan kamar..." />
      </AppShell>
    );
  }
  if (
    typesQuery.error ||
    availabilityQuery.error ||
    buildingsQuery.error ||
    availableRoomsQuery.error ||
    availableRumahKostQuery.error ||
    availableApartKostQuery.error ||
    roomsQuery.error
  ) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Inventori fisik dan tipe kost">
        <ErrorState
          error={
            typesQuery.error ??
            availabilityQuery.error ??
            buildingsQuery.error ??
            availableRoomsQuery.error ??
            availableRumahKostQuery.error ??
            availableApartKostQuery.error ??
            roomsQuery.error
          }
          title="Gagal memuat ringkasan kamar"
          onRetry={() => {
            void typesQuery.refetch();
            void availabilityQuery.refetch();
            void buildingsQuery.refetch();
            void availableRoomsQuery.refetch();
            void availableRumahKostQuery.refetch();
            void availableApartKostQuery.refetch();
            void roomsQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  const types = typesQuery.data?.items ?? [];
  const rooms = roomsQuery.data?.items ?? [];
  const buildings: BuildingOption[] = (buildingsQuery.data ?? [])
    .filter((building) => !search.category || building.category === search.category)
    .map((building) => ({
      id: building.id,
      label: building.buildingName || building.buildingCode,
      category: building.category,
      genderPolicy: building.genderPolicy,
    }));
  const {
    statusCounts: counts,
    totalInventory: totalRooms,
    categoryCounts,
  } = summarizeRoomInventory(currentPropertyId ?? "", availabilityQuery.data ?? [], types);
  const filters: Array<{
    category: KostTypeCategory | undefined;
    label: string;
    count: number;
  }> = [
    { category: undefined, label: "Semua tersedia", count: availableRoomsQuery.data?.total ?? 0 },
    {
      category: "rukost",
      label: "Rumah Kost tersedia",
      count: availableRumahKostQuery.data?.total ?? 0,
    },
    {
      category: "apartkost",
      label: "Apart Kost tersedia",
      count: availableApartKostQuery.data?.total ?? 0,
    },
  ];
  const activeFilterCount =
    Number(search.q.trim() !== "") +
    Number(Boolean(search.category)) +
    Number(Boolean(search.buildingId)) +
    Number(Boolean(search.floorCode)) +
    Number(Boolean(search.status)) +
    Number(Boolean(search.genderPolicy)) +
    Number(search.activeOccupancy !== undefined) +
    Number(Boolean(search.reconciliationState));
  const filterSignature = [
    search.q.trim(),
    search.category,
    search.buildingId,
    search.floorCode,
    search.status,
    search.genderPolicy,
    search.activeOccupancy,
    search.reconciliationState,
  ].join("|");
  const selectedBuilding = buildings.find((building) => building.id === search.buildingId);
  const filterCriteria = [
    search.q.trim() ? `pencarian \"${search.q.trim()}\"` : "",
    search.category ? `kategori: ${KOST_TYPE_LABEL[search.category]}` : "",
    selectedBuilding ? `bangunan: ${selectedBuilding.label}` : "",
    search.floorCode ? `lantai: ${search.floorCode}` : "",
    search.status ? `status kamar: ${ROOM_STATUS_LABEL[search.status]}` : "",
    search.genderPolicy
      ? `jenis kelamin: ${search.genderPolicy === "male" ? "Putra" : "Putri"}`
      : "",
    search.activeOccupancy === true
      ? "hunian: ada penghuni aktif"
      : search.activeOccupancy === false
        ? "hunian: tanpa penghuni aktif"
        : "",
    search.reconciliationState === "normal"
      ? "rekonsiliasi: normal"
      : search.reconciliationState === "requires_review"
        ? "rekonsiliasi: perlu ditinjau"
        : "",
  ].filter(Boolean);

  return (
    <AppShell
      title="Ringkasan Kamar"
      subtitle="Master tipe kost mengendalikan harga, deposit, dan fasilitas; kamar adalah inventori fisik."
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric
            label="Total inventori"
            value={String(totalRooms)}
            icon={BedDouble}
            note="Kamar pada properti aktif"
          />
          <SummaryMetric
            label="Rumah Kost"
            value={String(categoryCounts.rukost)}
            icon={Building2}
            note="Inventori kategori Rumah Kost"
          />
          <SummaryMetric
            label="Apart Kost"
            value={String(categoryCounts.apartkost)}
            icon={Layers}
            note="Inventori kategori Apart Kost"
          />
          <SummaryMetric
            label="Kosong"
            value={String(counts.vacant)}
            icon={DoorOpen}
            note="Tersedia pada seluruh properti"
          />
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Status inventori</h2>
                <p className="text-sm text-muted-foreground">
                  Distribusi seluruh inventori pada properti aktif.
                </p>
              </div>
              <Wrench className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {(Object.entries(ROOM_STATUS_LABEL) as Array<[RoomStatus, string]>).map(
                ([status, label]) => (
                  <div key={status} className="rounded-lg border border-border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">{counts[status]}</p>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="room-category-filter-title">
          <div className="mb-3">
            <h2 id="room-category-filter-title" className="text-base font-semibold text-foreground">
              Filter kategori
            </h2>
            <p className="text-sm text-muted-foreground">
              Pilih kategori untuk melihat kamar kosong yang tersedia saat ini.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {filters.map(({ category, label, count }) => {
              const selected = search.category === category && search.status === "vacant";
              return (
                <button
                  key={category ?? "all"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onSearchChange({
                      category,
                      status: "vacant",
                      offset: 0,
                    })
                  }
                  className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card
                    className={
                      selected
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-card transition-colors hover:bg-muted/60"
                    }
                  >
                    <CardContent className="p-4">
                      <p className="inline-flex rounded-md border border-primary/30 bg-primary-soft px-2 py-1 text-xs font-medium text-accent-foreground">
                        {label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{count}</p>
                      <p className="mt-1 text-xs text-muted-foreground">kamar kosong</p>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </section>

        <RoomDiscoveryFilters
          buildings={buildings}
          search={search}
          onSearchChange={onSearchChange}
        />
        {!roomsQuery.isFetching ? (
          <FilterResultNotice
            key={filterSignature}
            entityLabel="kamar"
            resultCount={roomsQuery.data?.total ?? 0}
            activeFilterCount={activeFilterCount}
            searchTerm={search.q}
            criteria={filterCriteria}
          />
        ) : null}
        <RoomInventoryTable
          rooms={rooms}
          canManage={false}
          onEdit={() => undefined}
          onStatus={() => undefined}
          showCategory
        />
        <Pagination
          offset={roomsQuery.data?.offset ?? search.offset}
          limit={roomsQuery.data?.limit ?? search.limit}
          total={roomsQuery.data?.total ?? 0}
          onChange={(offset) => onSearchChange({ offset })}
        />
      </div>
    </AppShell>
  );
}

function SummaryMetric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof BedDouble;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          </div>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-3 truncate text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
