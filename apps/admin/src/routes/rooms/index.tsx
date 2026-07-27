import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BedDouble, Building2, DoorOpen, Layers, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Pagination,
  RoomDetailSheet,
  RoomInventoryTable,
} from "@/components/rooms/KostTypeInventoryPage";
import { ErrorState, LoadingState } from "@/components/state";
import { Card, CardContent } from "@/components/ui/card";
import {
  useM4KostTypes,
  useM4RoomAvailability,
  useM4RoomInventory,
} from "@/hooks/useAdminUxMaster";
import {
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
  type RoomRouteSearch,
  normalizeRoomSearch,
  summarizeRoomInventory,
} from "@/lib/admin-ux-master-helpers";
import type { KostTypeCategory, RoomStatus } from "@/lib/admin-ux-master-api";
import { useProperty } from "@/lib/property";

export const Route = createFileRoute("/rooms/")({
  validateSearch: (raw: Record<string, unknown>) => normalizeRoomSearch(raw),
  component: RoomsPage,
});

function RoomsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { currentPropertyId } = useProperty();
  const previousPropertyId = useRef(currentPropertyId);
  const typesQuery = useM4KostTypes({ limit: 100 });
  const availabilityQuery = useM4RoomAvailability();
  const roomsQuery = useM4RoomInventory({
    category: search.category,
    limit: search.limit,
    offset: search.offset,
    includeActiveLease: true,
  });
  const propertyChanged = previousPropertyId.current !== currentPropertyId;

  useEffect(() => {
    if (previousPropertyId.current !== currentPropertyId) {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, offset: 0, roomId: undefined }),
      });
      previousPropertyId.current = currentPropertyId;
    }
  }, [currentPropertyId, navigate]);

  const onSearchChange = (next: Partial<RoomRouteSearch>) => {
    void navigate({ search: (current) => ({ ...current, ...next }) });
  };

  if (
    propertyChanged ||
    typesQuery.isLoading ||
    availabilityQuery.isLoading ||
    roomsQuery.isLoading
  ) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Menyiapkan ringkasan master data kamar">
        <LoadingState label="Memuat ringkasan kamar..." />
      </AppShell>
    );
  }
  if (typesQuery.error || availabilityQuery.error || roomsQuery.error) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Inventori fisik dan tipe kost">
        <ErrorState
          error={typesQuery.error ?? availabilityQuery.error ?? roomsQuery.error}
          title="Gagal memuat ringkasan kamar"
          onRetry={() => {
            void typesQuery.refetch();
            void availabilityQuery.refetch();
            void roomsQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  const types = typesQuery.data?.items ?? [];
  const rooms = roomsQuery.data?.items ?? [];
  const {
    statusCounts: counts,
    totalInventory: totalRooms,
    categoryCounts,
  } = summarizeRoomInventory(currentPropertyId ?? "", availabilityQuery.data ?? [], types);
  const selectedRoom = rooms.find((room) => room.id === search.roomId) ?? null;
  const filters: Array<{
    category: KostTypeCategory | undefined;
    label: string;
    count: number;
  }> = [
    { category: undefined, label: "Semua", count: totalRooms },
    { category: "rukost", label: KOST_TYPE_LABEL.rukost, count: categoryCounts.rukost },
    { category: "apartkost", label: KOST_TYPE_LABEL.apartkost, count: categoryCounts.apartkost },
  ];

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
              Tampilkan semua kamar atau persempit tabel berdasarkan kategori.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {filters.map(({ category, label, count }) => {
              const selected = search.category === category;
              return (
                <button
                  key={category ?? "all"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSearchChange({ category, offset: 0, roomId: undefined })}
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
                      <p className="mt-1 text-xs text-muted-foreground">kamar</p>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </section>

        <RoomInventoryTable
          rooms={rooms}
          canManage={false}
          onDetail={(room) => onSearchChange({ roomId: room.id })}
          onEdit={() => undefined}
          onStatus={() => undefined}
        />
        <Pagination
          offset={roomsQuery.data?.offset ?? search.offset}
          limit={roomsQuery.data?.limit ?? search.limit}
          total={roomsQuery.data?.total ?? 0}
          onChange={(offset) => onSearchChange({ offset, roomId: undefined })}
        />
        <RoomDetailSheet
          room={selectedRoom}
          open={Boolean(selectedRoom)}
          onOpenChange={(open) => {
            if (!open) onSearchChange({ roomId: undefined });
          }}
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
