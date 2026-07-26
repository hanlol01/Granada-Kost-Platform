import { Link, createFileRoute } from "@tanstack/react-router";
import { BedDouble, Building2, DoorOpen, Layers, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useM4KostTypes, useM4RoomInventory } from "@/hooks/useAdminUxMaster";
import {
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
  normalizeRoomSearch,
} from "@/lib/admin-ux-master-helpers";

export const Route = createFileRoute("/rooms/")({
  validateSearch: (raw: Record<string, unknown>) => normalizeRoomSearch(raw),
  component: RoomsPage,
});

function RoomsPage() {
  const typesQuery = useM4KostTypes({ limit: 100 });
  const roomsQuery = useM4RoomInventory({ limit: 100, includeActiveLease: true });

  if (typesQuery.isLoading || roomsQuery.isLoading) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Menyiapkan ringkasan master data kamar">
        <LoadingState label="Memuat ringkasan kamar..." />
      </AppShell>
    );
  }
  if (typesQuery.error || roomsQuery.error) {
    return (
      <AppShell title="Ringkasan Kamar" subtitle="Inventori fisik dan tipe kost">
        <ErrorState
          error={typesQuery.error ?? roomsQuery.error}
          title="Gagal memuat ringkasan kamar"
          onRetry={() => {
            void typesQuery.refetch();
            void roomsQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  const types = typesQuery.data?.items ?? [];
  const rooms = roomsQuery.data?.items ?? [];
  const totalRooms = roomsQuery.data?.total ?? 0;
  const roomByCategory = (category: "rukost" | "apartkost") =>
    types.find((type) => type.category === category && type.status === "active");
  const counts = rooms.reduce<Record<string, number>>((current, room) => {
    current[room.status] = (current[room.status] ?? 0) + 1;
    return current;
  }, {});

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
            value={String(roomByCategory("rukost")?.roomCount ?? 0)}
            icon={Building2}
            note={roomByCategory("rukost")?.name ?? "Tipe belum dibuat"}
          />
          <SummaryMetric
            label="Apart Kost"
            value={String(roomByCategory("apartkost")?.roomCount ?? 0)}
            icon={Layers}
            note={roomByCategory("apartkost")?.name ?? "Tipe belum dibuat"}
          />
          <SummaryMetric
            label="Kosong"
            value={String(counts.vacant ?? 0)}
            icon={DoorOpen}
            note="Pada data inventori yang dimuat"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {(["rukost", "apartkost"] as const).map((category) => {
            const type = roomByCategory(category);
            return (
              <Card key={category} className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Badge
                        className="border-primary/30 bg-primary-soft text-accent-foreground"
                        variant="outline"
                      >
                        {KOST_TYPE_LABEL[category]}
                      </Badge>
                      <h2 className="mt-3 text-lg font-semibold text-foreground">
                        {type?.name ?? `Belum ada tipe ${KOST_TYPE_LABEL[category]}`}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {type
                          ? `${type.roomCount ?? 0} kamar · ${type.facilityCount ?? 0} fasilitas · harga dikelola pada tipe.`
                          : "Buat tipe kost untuk memulai konfigurasi harga dan inventori."}
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link
                        to={category === "rukost" ? "/rooms/rumah-kost" : "/rooms/apart-kost"}
                        search={{ q: "", offset: 0, limit: 20 }}
                      >
                        Kelola
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Status inventori</h2>
                <p className="text-sm text-muted-foreground">
                  Distribusi pada halaman data yang dimuat.
                </p>
              </div>
              <Wrench className="h-5 w-5 text-muted-foreground" />
            </div>
            {rooms.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {Object.entries(ROOM_STATUS_LABEL).map(([status, label]) => (
                  <div key={status} className="rounded-lg border border-border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {counts[status] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<BedDouble className="h-5 w-5" />}
                title="Belum ada inventori kamar"
                description="Mulai dengan tipe kost aktif, lalu kelola inventori pada halaman kategorinya."
              />
            )}
          </CardContent>
        </Card>
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
