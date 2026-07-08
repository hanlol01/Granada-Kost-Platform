import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarCheck,
  DoorOpen,
  Eye,
  EyeOff,
  Home,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useRooms,
  type RoomCategory,
  type RoomFloorCode,
  type RoomRecord,
  type RoomStatus,
} from "@/hooks/useRooms";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RoomFormDialog } from "@/components/forms/RoomFormDialog";
import { useAuth } from "@/lib/auth";
export const Route = createFileRoute("/rooms")({ component: RoomsPage });
type RoomGender = RoomRecord["genderPolicy"];
type TabKey = "summary" | "rukost" | "apartkost" | "availability";
type VisibilityFilter = "all" | "visible" | "hidden";
type InventoryFilters = {
  q: string;
  gender: "all" | RoomGender;
  building: "all" | string;
  floor: "all" | RoomFloorCode;
  status: "all" | RoomStatus;
  visibility: VisibilityFilter;
};
const STATUS_ORDER: RoomStatus[] = [
  "vacant",
  "reserved",
  "occupied",
  "maintenance",
  "requires_review",
  "inactive",
];
const STATUS_LABEL: Record<RoomStatus, { label: string; cls: string }> = {
  vacant: { label: "Kosong", cls: "bg-success/15 text-success" },
  reserved: { label: "Dipesan", cls: "bg-chart-4/15 text-chart-4" },
  occupied: { label: "Terisi", cls: "bg-primary-soft text-primary" },
  maintenance: { label: "Maintenance", cls: "bg-warning/20 text-warning-foreground" },
  requires_review: { label: "Perlu Review", cls: "bg-destructive/10 text-destructive" },
  inactive: { label: "Tidak Aktif", cls: "bg-muted text-muted-foreground" },
};
const CATEGORY_LABEL: Record<RoomCategory, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};
const GENDER_LABEL: Record<RoomGender, string> = {
  male: "Putra",
  female: "Putri",
  mixed: "Campur",
};
const FLOOR_LABEL: Record<RoomFloorCode, string> = {
  B: "Lantai Bawah",
  A: "Lantai Atas",
};
const DEFAULT_FILTERS: InventoryFilters = {
  q: "",
  gender: "all",
  building: "all",
  floor: "all",
  status: "all",
  visibility: "all",
};
const EMPTY_ROOMS: RoomRecord[] = [];
function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const item = STATUS_LABEL[status];
  return (
    <Badge className={cn("border-transparent", item.cls)} variant="outline">
      {item.label}
    </Badge>
  );
}
function PublicFlagBadge({ visible }: { visible: boolean }) {
  const Icon = visible ? Eye : EyeOff;
  return (
    <Badge
      className={cn(
        "gap-1 border-transparent",
        visible ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
      variant="outline"
    >
      <Icon className="h-3 w-3" />
      {visible ? "Publik" : "Internal"}
    </Badge>
  );
}
function RoomsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomRecord | null>(null);
  const { data, error, isFetching, isLoading, refetch } = useRooms();
  const rooms = data ?? EMPTY_ROOMS;
  const stats = useMemo(() => buildStats(rooms), [rooms]);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  return (
    <AppShell
      title="Manajemen Kamar"
      subtitle={data ? rooms.length + " kamar terhubung ke inventori" : "Memuat inventori kamar..."}
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Kamar
          </Button>
        ) : null
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat kamar" />
      ) : isLoading ? (
        <InventorySkeleton />
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg lg:grid-cols-4">
            <TabsTrigger className="gap-2 py-2" value="summary">
              <Home className="h-4 w-4" />
              Ringkasan
            </TabsTrigger>
            <TabsTrigger className="gap-2 py-2" value="rukost">
              <Building2 className="h-4 w-4" />
              Rumah Kost
            </TabsTrigger>
            <TabsTrigger className="gap-2 py-2" value="apartkost">
              <Layers className="h-4 w-4" />
              Apart Kost
            </TabsTrigger>
            <TabsTrigger className="gap-2 py-2" value="availability">
              <CalendarCheck className="h-4 w-4" />
              Ketersediaan
            </TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="mt-5">
            <SummaryView isFetching={isFetching} rooms={rooms} stats={stats} />
          </TabsContent>
          <TabsContent value="rukost" className="mt-5">
            <CategoryInventory category="rukost" rooms={rooms} onEdit={canManage ? setEditTarget : undefined} />
          </TabsContent>
          <TabsContent value="apartkost" className="mt-5">
            <CategoryInventory category="apartkost" rooms={rooms} onEdit={canManage ? setEditTarget : undefined} />
          </TabsContent>
          <TabsContent value="availability" className="mt-5">
            <AvailabilityView rooms={rooms} stats={stats} />
          </TabsContent>
        </Tabs>
      )}
      <RoomFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RoomFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget}
      />
    </AppShell>
  );
}
function InventorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="rounded-lg">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
function SummaryView({
  isFetching,
  rooms,
  stats,
}: {
  isFetching: boolean;
  rooms: RoomRecord[];
  stats: RoomStats;
}) {
  const buildingSummaries = useMemo(() => buildBuildingSummaries(rooms), [rooms]);
  if (rooms.length === 0) {
    return (
      <Card className="rounded-lg">
        <CardContent className="p-6">
          <EmptyState
            description="Data kamar akan muncul setelah inventori tersedia di API admin."
            icon={<BedDouble className="h-5 w-5" />}
            title="Belum ada kamar"
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className={cn("space-y-5", isFetching && "opacity-90 transition-opacity")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail={
            CATEGORY_LABEL.rukost +
            " " +
            stats.rukost +
            " / " +
            CATEGORY_LABEL.apartkost +
            " " +
            stats.apartkost
          }
          icon={BedDouble}
          label="Total Kamar"
          value={stats.total}
        />
        <MetricCard
          detail={"Putra " + stats.male + " / Putri " + stats.female}
          icon={Users}
          label="Kebijakan Gender"
          value={stats.male + stats.female + stats.mixed}
        />
        <MetricCard
          detail={stats.rukostVacant + " Rumah Kost, " + stats.apartkostVacant + " Apart Kost"}
          icon={DoorOpen}
          label="Kosong"
          value={stats.vacant}
        />
        <MetricCard
          detail={"Termasuk unit occupied hasil sinkron data"}
          icon={Home}
          label="Terisi"
          value={stats.occupied}
        />
        <MetricCard
          detail="Reserved/booked disimpan sebagai reserved"
          icon={CalendarCheck}
          label="Dipesan"
          value={stats.reserved}
        />
        <MetricCard
          detail={stats.requiresReview + " requires_review"}
          icon={AlertTriangle}
          label="Maintenance/Review"
          value={stats.maintenance + stats.requiresReview}
        />
        <MetricCard
          detail={
            stats.publicVacant + " kosong dan terlihat publik" +
            (stats.publicVisibleUnknown > 0
              ? " · " + stats.publicVisibleUnknown + " belum ditandai"
              : "")
          }
          icon={Eye}
          label="Public Visible"
          value={stats.publicVisible}
        />
        <MetricCard
          detail={buildingSummaries.length + " bangunan/unit"}
          icon={Building2}
          label="Gedung/Unit"
          value={buildingSummaries.length}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <StatusBreakdown stats={stats} />
        <BuildingSummaryTable summaries={buildingSummaries} />
      </div>
    </div>
  );
}
function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
function StatusBreakdown({ stats }: { stats: RoomStats }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Status Kamar</p>
            <p className="text-xs text-muted-foreground">
              Distribusi status operasional inventori.
            </p>
          </div>
          <BedDouble className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-3">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{STATUS_LABEL[status].label}</span>
                <span className="font-semibold">{stats.statusCounts[status]}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: progressWidth(stats.statusCounts[status], stats.total) }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
function BuildingSummaryTable({ summaries }: { summaries: BuildingSummary[] }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Bangunan dan Unit</p>
            <p className="text-xs text-muted-foreground">
              Ringkasan per gedung/unit dari field inventori.
            </p>
          </div>
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-muted-foreground">
                <th className="py-2 pr-3">Kategori</th>
                <th className="py-2 pr-3">Gedung/Unit</th>
                <th className="py-2 pr-3">Gender</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Kosong</th>
                <th className="py-2 pr-3 text-right">Terisi</th>
                <th className="py-2 text-right">Publik Kosong</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.key} className="border-b last:border-0">
                  <td className="py-3 pr-3">{CATEGORY_LABEL[summary.category]}</td>
                  <td className="py-3 pr-3 font-medium">{summary.buildingCode}</td>
                  <td className="py-3 pr-3">{summary.genderLabel}</td>
                  <td className="py-3 pr-3 text-right font-semibold">{summary.total}</td>
                  <td className="py-3 pr-3 text-right">{summary.vacant}</td>
                  <td className="py-3 pr-3 text-right">{summary.occupied}</td>
                  <td className="py-3 text-right">{summary.publicVacant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
function CategoryInventory({ category, rooms, onEdit }: { category: RoomCategory; rooms: RoomRecord[]; onEdit?: (room: RoomRecord) => void }) {
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const categoryRooms = useMemo(
    () => rooms.filter((room) => effectiveCategory(room) === category).sort(roomSort),
    [category, rooms],
  );
  const buildingOptions = useMemo(
    () => Array.from(new Set(categoryRooms.map(buildingCodeOf))).sort(naturalSort),
    [categoryRooms],
  );
  const filteredRooms = useMemo(
    () => filterRooms(categoryRooms, filters),
    [categoryRooms, filters],
  );
  const grouped = useMemo(() => groupRoomsByBuilding(filteredRooms), [filteredRooms]);
  const updateFilters = (next: Partial<InventoryFilters>) =>
    setFilters((current) => ({ ...current, ...next }));
  return (
    <div className="space-y-4">
      <InventoryFiltersBar
        buildingOptions={buildingOptions}
        category={category}
        filters={filters}
        onChange={updateFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />
      {categoryRooms.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <EmptyState
              description="Data kategori ini belum tersedia dari API admin."
              icon={<Building2 className="h-5 w-5" />}
              title={CATEGORY_LABEL[category] + " belum tersedia"}
            />
          </CardContent>
        </Card>
      ) : filteredRooms.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="p-6">
            <EmptyState
              description="Ubah filter atau pencarian untuk melihat kamar lain."
              icon={<Search className="h-5 w-5" />}
              title="Tidak ada kamar cocok"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <BuildingGroup group={group} key={group.key} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
function InventoryFiltersBar({
  buildingOptions,
  category,
  filters,
  onChange,
  onReset,
}: {
  buildingOptions: string[];
  category: RoomCategory;
  filters: InventoryFilters;
  onChange: (next: Partial<InventoryFilters>) => void;
  onReset: () => void;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,0.8fr))_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => onChange({ q: event.target.value })}
              placeholder={
                "Cari " + CATEGORY_LABEL[category].toLowerCase() + ", room code, nomor..."
              }
              value={filters.q}
            />
          </div>
          <Select
            onValueChange={(value) => onChange({ gender: value as InventoryFilters["gender"] })}
            value={filters.gender}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Gender</SelectItem>
              <SelectItem value="male">Putra</SelectItem>
              <SelectItem value="female">Putri</SelectItem>
              <SelectItem value="mixed">Campur</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(value) => onChange({ building: value })} value={filters.building}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Unit</SelectItem>
              {buildingOptions.map((building) => (
                <SelectItem key={building} value={building}>
                  {building}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => onChange({ floor: value as InventoryFilters["floor"] })}
            value={filters.floor}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Lantai</SelectItem>
              <SelectItem value="B">Lantai Bawah</SelectItem>
              <SelectItem value="A">Lantai Atas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => onChange({ status: value as InventoryFilters["status"] })}
            value={filters.status}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => onChange({ visibility: value as VisibilityFilter })}
            value={filters.visibility}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Publik</SelectItem>
              <SelectItem value="visible">Public Visible</SelectItem>
              <SelectItem value="hidden">Internal</SelectItem>
            </SelectContent>
          </Select>
          <Button className="gap-2" onClick={onReset} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
function BuildingGroup({ group, onEdit }: { group: BuildingRoomGroup; onEdit?: (room: RoomRecord) => void }) {
  const floorGroups = ["B", "A", "unknown"].map((floor) => ({
    floor,
    rooms: group.rooms.filter((room) => (floorCodeOf(room) ?? "unknown") === floor),
  }));
  return (
    <Card className="rounded-lg">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {CATEGORY_LABEL[group.category]}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{group.buildingCode}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.buildingName ?? "Nama gedung/unit belum diisi"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-transparent bg-muted text-muted-foreground" variant="outline">
              {group.rooms.length} kamar
            </Badge>
            <Badge className="border-transparent bg-success/15 text-success" variant="outline">
              {group.rooms.filter((room) => room.roomStatus === "vacant").length} kosong
            </Badge>
            <Badge className="border-transparent bg-primary-soft text-primary" variant="outline">
              {group.rooms.filter((room) => room.roomStatus === "occupied").length} terisi
            </Badge>
          </div>
        </div>
        {floorGroups.map((floorGroup) =>
          floorGroup.rooms.length ? (
            <FloorRoomTable
              floor={floorGroup.floor as RoomFloorCode | "unknown"}
              key={floorGroup.floor}
              rooms={floorGroup.rooms}
              onEdit={onEdit}
            />
          ) : null,
        )}
      </CardContent>
    </Card>
  );
}
function FloorRoomTable({
  floor,
  rooms,
  onEdit,
}: {
  floor: RoomFloorCode | "unknown";
  rooms: RoomRecord[];
  onEdit?: (room: RoomRecord) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {floor === "unknown" ? "Lantai belum dipetakan" : FLOOR_LABEL[floor]}
        </p>
        <span className="text-xs text-muted-foreground">{rooms.length} kamar</span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs font-medium uppercase text-muted-foreground">
              <th className="px-3 py-2">Room Code</th>
              <th className="px-3 py-2">Nomor Legacy</th>
              <th className="px-3 py-2">Gender</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Public</th>
              <th className="px-3 py-2 text-right">Harga</th>
              <th className="px-3 py-2">Fasilitas</th>
              {onEdit && <th className="px-3 py-2 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rooms.sort(roomSort).map((room) => (
              <tr key={room.id} className="border-t">
                <td className="px-3 py-3 font-semibold">{room.roomCode ?? room.number}</td>
                <td className="px-3 py-3 text-muted-foreground">{room.number}</td>
                <td className="px-3 py-3">{GENDER_LABEL[room.genderPolicy]}</td>
                <td className="px-3 py-3">
                  <RoomStatusBadge status={room.roomStatus} />
                </td>
                <td className="px-3 py-3">
                  <PublicFlagBadge visible={room.publicVisible} />
                </td>
                <td className="px-3 py-3 text-right font-medium">
                  {formatIDR(room.yearlyPrice ?? room.monthlyPrice)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {room.yearlyPrice ? "/tahun" : "/bulan"}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {room.facilities.length
                    ? room.facilities
                        .slice(0, 3)
                        .map((facility) => facility.name)
                        .join(", ")
                    : "-"}
                </td>
                {onEdit && (
                  <td className="px-3 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(room)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function AvailabilityView({ rooms, stats }: { rooms: RoomRecord[]; stats: RoomStats }) {
  const rukostPublicVacant = countPublicVacantByCategory(rooms, "rukost");
  const apartkostPublicVacant = countPublicVacantByCategory(rooms, "apartkost");
  const hiddenRooms = rooms.filter((room) => room.publicVisible !== true).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail="Vacant dan public_visible"
          icon={Eye}
          label="Publik Kosong"
          value={stats.publicVacant}
        />
        <MetricCard
          detail={rukostPublicVacant + " kamar tersedia publik"}
          icon={Building2}
          label="Rumah Kost"
          value={rukostPublicVacant}
        />
        <MetricCard
          detail={apartkostPublicVacant + " kamar tersedia publik"}
          icon={Layers}
          label="Apart Kost"
          value={apartkostPublicVacant}
        />
        <MetricCard
          detail={hiddenRooms + " kamar tidak tampil publik"}
          icon={EyeOff}
          label="Internal/Hidden"
          value={hiddenRooms}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Kesiapan Public Listing</p>
                <p className="text-xs text-muted-foreground">Agregat aman untuk calon penghuni.</p>
              </div>
              <CalendarCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <AvailabilityBar label="Rumah Kost" total={stats.rukost} value={rukostPublicVacant} />
            <AvailabilityBar
              label="Apart Kost"
              total={stats.apartkost}
              value={apartkostPublicVacant}
            />
            <AvailabilityBar label="Semua Kamar" total={stats.total} value={stats.publicVacant} />
          </CardContent>
        </Card>
        <Card className="rounded-lg border-primary/30 bg-primary-soft">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div className="space-y-2">
                <p className="text-sm font-semibold">Minat booking aktif</p>
                <p className="text-sm text-muted-foreground">
                  Pengajuan minat booking tetap dikonfirmasi manual oleh admin.
                  Public booking belum menjadi booking resmi.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function AvailabilityBar({ label, total, value }: { label: string; total: number; value: number }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-semibold">
          {value}/{total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: progressWidth(value, total) }}
        />
      </div>
    </div>
  );
}
type RoomStats = {
  total: number;
  rukost: number;
  apartkost: number;
  male: number;
  female: number;
  mixed: number;
  vacant: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  requiresReview: number;
  publicVisible: number;
  publicVisibleUnknown: number;
  publicVacant: number;
  rukostVacant: number;
  apartkostVacant: number;
  statusCounts: Record<RoomStatus, number>;
};
type BuildingSummary = {
  key: string;
  category: RoomCategory;
  buildingCode: string;
  genderLabel: string;
  total: number;
  vacant: number;
  occupied: number;
  publicVacant: number;
};
type BuildingRoomGroup = {
  key: string;
  category: RoomCategory;
  buildingCode: string;
  buildingName: string | null;
  rooms: RoomRecord[];
};
function createStatusCounts(): Record<RoomStatus, number> {
  return {
    vacant: 0,
    reserved: 0,
    occupied: 0,
    maintenance: 0,
    inactive: 0,
    requires_review: 0,
  };
}
function buildStats(rooms: RoomRecord[]): RoomStats {
  const statusCounts = createStatusCounts();
  const stats: RoomStats = {
    total: rooms.length,
    rukost: 0,
    apartkost: 0,
    male: 0,
    female: 0,
    mixed: 0,
    vacant: 0,
    occupied: 0,
    reserved: 0,
    maintenance: 0,
    requiresReview: 0,
    publicVisible: 0,
    publicVisibleUnknown: 0,
    publicVacant: 0,
    rukostVacant: 0,
    apartkostVacant: 0,
    statusCounts,
  };
  for (const room of rooms) {
    const category = effectiveCategory(room);
    stats[category] += 1;
    stats[room.genderPolicy] += 1;
    statusCounts[room.roomStatus] += 1;
    if (room.publicVisible === true) {
      stats.publicVisible += 1;
    } else if (room.publicVisible == null) {
      stats.publicVisibleUnknown += 1;
    }
    if (isPublicVacant(room)) {
      stats.publicVacant += 1;
    }
    if (room.roomStatus === "vacant" && category === "rukost") {
      stats.rukostVacant += 1;
    }
    if (room.roomStatus === "vacant" && category === "apartkost") {
      stats.apartkostVacant += 1;
    }
  }
  stats.vacant = statusCounts.vacant;
  stats.occupied = statusCounts.occupied;
  stats.reserved = statusCounts.reserved;
  stats.maintenance = statusCounts.maintenance;
  stats.requiresReview = statusCounts.requires_review;
  return stats;
}
function buildBuildingSummaries(rooms: RoomRecord[]): BuildingSummary[] {
  const groups = groupRoomsByBuilding(rooms);
  return groups.map((group) => {
    const genders = Array.from(new Set(group.rooms.map((room) => GENDER_LABEL[room.genderPolicy])));
    return {
      key: group.key,
      category: group.category,
      buildingCode: group.buildingCode,
      genderLabel: genders.join(", "),
      total: group.rooms.length,
      vacant: group.rooms.filter((room) => room.roomStatus === "vacant").length,
      occupied: group.rooms.filter((room) => room.roomStatus === "occupied").length,
      publicVacant: group.rooms.filter(isPublicVacant).length,
    } satisfies BuildingSummary;
  });
}
function groupRoomsByBuilding(rooms: RoomRecord[]): BuildingRoomGroup[] {
  const map = new Map<string, BuildingRoomGroup>();
  for (const room of rooms) {
    const category = effectiveCategory(room);
    const buildingCode = buildingCodeOf(room);
    const key = category + ":" + buildingCode;
    const current =
      map.get(key) ??
      ({
        key,
        category,
        buildingCode,
        buildingName: room.buildingName,
        rooms: [],
      } satisfies BuildingRoomGroup);
    current.rooms.push(room);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((left, right) => {
    if (left.category !== right.category) {
      return left.category === "rukost" ? -1 : 1;
    }
    return naturalSort(left.buildingCode, right.buildingCode);
  });
}
function filterRooms(rooms: RoomRecord[], filters: InventoryFilters): RoomRecord[] {
  const needle = filters.q.trim().toLowerCase();
  return rooms.filter((room) => {
    const haystack = [
      room.roomCode,
      room.number,
      room.unitCode,
      room.buildingCode,
      room.buildingName,
      room.floorLabel,
      room.floor,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (needle && !haystack.includes(needle)) {
      return false;
    }
    if (filters.gender !== "all" && room.genderPolicy !== filters.gender) {
      return false;
    }
    if (filters.building !== "all" && buildingCodeOf(room) !== filters.building) {
      return false;
    }
    if (filters.floor !== "all" && floorCodeOf(room) !== filters.floor) {
      return false;
    }
    if (filters.status !== "all" && room.roomStatus !== filters.status) {
      return false;
    }
    if (filters.visibility === "visible" && room.publicVisible !== true) {
      return false;
    }
    if (filters.visibility === "hidden" && room.publicVisible === true) {
      return false;
    }
    return true;
  });
}
function effectiveCategory(room: RoomRecord): RoomCategory {
  if (room.category) {
    return room.category;
  }
  const code = (room.roomCode ?? room.number ?? "").toUpperCase();
  return code.startsWith("A") || code.startsWith("AK") ? "apartkost" : "rukost";
}
function buildingCodeOf(room: RoomRecord): string {
  return room.buildingCode ?? room.unitCode ?? "Tanpa Unit";
}
function floorCodeOf(room: RoomRecord): RoomFloorCode | null {
  if (room.floorCode === "A" || room.floorCode === "B") {
    return room.floorCode;
  }
  const label = (room.floorLabel ?? room.floor ?? "").toUpperCase();
  if (label === "A" || label.includes("ATAS")) {
    return "A";
  }
  if (label === "B" || label.includes("BAWAH")) {
    return "B";
  }
  return null;
}
function isPublicVacant(room: RoomRecord): boolean {
  return room.publicVisible === true && room.roomStatus === "vacant";
}
function countPublicVacantByCategory(rooms: RoomRecord[], category: RoomCategory): number {
  return rooms.filter((room) => effectiveCategory(room) === category && isPublicVacant(room))
    .length;
}
function roomSort(left: RoomRecord, right: RoomRecord): number {
  const building = naturalSort(buildingCodeOf(left), buildingCodeOf(right));
  if (building !== 0) {
    return building;
  }
  const floor = floorRank(left) - floorRank(right);
  if (floor !== 0) {
    return floor;
  }
  return naturalSort(left.roomCode ?? left.number, right.roomCode ?? right.number);
}
function floorRank(room: RoomRecord): number {
  const floor = floorCodeOf(room);
  if (floor === "B") {
    return 0;
  }
  if (floor === "A") {
    return 1;
  }
  return 2;
}
function naturalSort(left: string, right: string): number {
  return left.localeCompare(right, "id-ID", { numeric: true, sensitivity: "base" });
}
function progressWidth(value: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  return Math.min(100, Math.round((value / total) * 100)) + "%";
}
