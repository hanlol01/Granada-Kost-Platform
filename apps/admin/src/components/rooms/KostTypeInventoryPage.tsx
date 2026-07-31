// Shared M4 inventory surface for Rumah Kost and Apart Kost.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BedDouble,
  Building2,
  CalendarPlus,
  CircleDollarSign,
  Eye,
  EyeOff,
  FilePenLine,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { QuickBookingDialog } from "@/components/booking-leads/QuickBookingDialog";
import { CompatibilityCheckoutDialog } from "@/components/rooms/CompatibilityCheckoutDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminUxMasterApi,
  type KostType,
  type KostTypeCategory,
  type KostTypeInput,
  type RoomInventory,
  type RoomInventoryUpdateInput,
} from "@/lib/admin-ux-master-api";
import {
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
  allowedRoomStatusTargets,
  createKostTypeSlug,
  getRoomPaginationDisplay,
  hasAuthoritativeRoomReferences,
  hasRoomWriteAuthority,
  roomStructuralEditLocked,
  roomStructuralInputChanged,
  type RoomRouteSearch,
} from "@/lib/admin-ux-master-helpers";
import { useAuth } from "@/lib/auth";
import { canCreateAdminBookingLead } from "@/lib/admin-booking-lead";
import { formatIDR } from "@/lib/format";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import {
  useM4KostTypes,
  useM4Mutation,
  useM4RoomBuildings,
  useM4RoomInventory,
  useRoomPersistenceMutation,
} from "@/hooks/useAdminUxMaster";

type Props = {
  category: KostTypeCategory;
  search: RoomRouteSearch;
  onSearchChange: (next: Partial<RoomRouteSearch>) => void;
};

export type BuildingOption = {
  id: string;
  label: string;
  category: KostTypeCategory;
  genderPolicy: "male" | "female";
};

const EMPTY_ROOM_ITEMS: RoomInventory[] = [];

const STATUS_TONE: Record<RoomInventory["status"], string> = {
  vacant: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  reserved: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  occupied: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  maintenance: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  inactive: "border-slate-700 bg-slate-800 text-slate-300",
  requires_review: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function roomLabel(room: RoomInventory): string {
  return room.roomCode?.trim() || room.number;
}

function RoomStatusBadge({ status }: { status: RoomInventory["status"] }) {
  return (
    <Badge className={cn("whitespace-nowrap border", STATUS_TONE[status])} variant="outline">
      {ROOM_STATUS_LABEL[status]}
    </Badge>
  );
}

export function KostTypeInventoryPage({ category, search, onSearchChange }: Props) {
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const canManage = hasRoomWriteAuthority(
    user?.roles ?? [],
    hasPermission("room.manage"),
    currentPropertyId,
  );
  const typeQuery = useM4KostTypes({ category, limit: 100 });
  const buildingQuery = useM4RoomBuildings(category);
  const roomQuery = useM4RoomInventory({
    category,
    q: search.q,
    buildingId: search.buildingId,
    floorCode: search.floorCode,
    status: search.status,
    genderPolicy: search.genderPolicy,
    activeOccupancy: search.activeOccupancy,
    reconciliationState: search.reconciliationState,
    sort: search.sort,
    order: search.order,
    includeActiveLease: true,
    limit: search.limit,
    offset: search.offset,
  });
  const [typeEditor, setTypeEditor] = useState<KostType | null | "create">(null);
  const [roomEditor, setRoomEditor] = useState<RoomInventory | null>(null);
  const [statusRoom, setStatusRoom] = useState<RoomInventory | null>(null);
  const currentRoomScope = `${currentPropertyId ?? ""}:${category}`;
  const previousRoomScope = useRef(currentRoomScope);
  const roomScopeChanged = previousRoomScope.current !== currentRoomScope;
  const rooms = roomQuery.data?.items ?? EMPTY_ROOM_ITEMS;
  const types = (typeQuery.data?.items ?? []).filter(
    (item) => item.propertyId === currentPropertyId && item.category === category,
  );
  const activeType = types.find((item) => item.status === "active") ?? null;
  const buildings = useMemo(
    () =>
      (buildingQuery.data ?? [])
        .filter(
          (building) => building.propertyId === currentPropertyId && building.category === category,
        )
        .map((building) => ({
          id: building.id,
          label: building.buildingName || building.buildingCode,
          category: building.category,
          genderPolicy: building.genderPolicy,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "id-ID")),
    [buildingQuery.data, category, currentPropertyId],
  );
  const canPersistRoom = Boolean(canManage && activeType && buildings.length > 0);

  useEffect(() => {
    setStatusRoom(null);
    setRoomEditor(null);
    previousRoomScope.current = currentRoomScope;
  }, [currentRoomScope]);

  useEffect(() => {
    if (!canPersistRoom) setRoomEditor(null);
  }, [canPersistRoom]);

  if (typeQuery.isLoading || buildingQuery.isLoading || roomQuery.isLoading) {
    return (
      <AppShell title={KOST_TYPE_LABEL[category]} subtitle="Menyiapkan inventori dan tipe kost">
        <LoadingState label="Memuat data kamar..." />
      </AppShell>
    );
  }

  if (typeQuery.error || buildingQuery.error || roomQuery.error) {
    return (
      <AppShell title={KOST_TYPE_LABEL[category]} subtitle="Inventori dan konfigurasi tipe kost">
        <ErrorState
          error={typeQuery.error ?? buildingQuery.error ?? roomQuery.error}
          onRetry={() => {
            void typeQuery.refetch();
            void buildingQuery.refetch();
            void roomQuery.refetch();
          }}
          title="Gagal memuat inventori"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={KOST_TYPE_LABEL[category]}
      subtitle="Harga, fasilitas, dan inventori dikelola dari sumber yang tepat"
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setTypeEditor(activeType ?? "create")}
            >
              <FilePenLine className="mr-2 h-4 w-4" />
              {activeType ? "Edit Tipe Kost" : "Buat Tipe Kost"}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        {activeType ? (
          <KostTypeHeader
            kostType={activeType}
            canManage={canManage}
            onEdit={() => setTypeEditor(activeType)}
          />
        ) : (
          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="p-6">
              <EmptyState
                icon={<Building2 className="h-5 w-5" />}
                title={`Tipe ${KOST_TYPE_LABEL[category]} belum tersedia`}
                description="Buat tipe kost terlebih dahulu. Harga dan fasilitas akan diwariskan oleh inventori kamar."
                action={
                  canManage ? (
                    <Button onClick={() => setTypeEditor("create")}>Buat Tipe Kost</Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        )}

        <RoomDiscoveryFilters
          category={category}
          buildings={buildings}
          search={search}
          onSearchChange={onSearchChange}
        />
        <RoomInventoryTable
          rooms={rooms}
          canManage={canManage}
          canEdit={canPersistRoom}
          onEdit={setRoomEditor}
          onStatus={setStatusRoom}
          showCategory={false}
        />
        <Pagination
          offset={search.offset}
          limit={search.limit}
          total={roomQuery.data?.total ?? 0}
          onChange={(offset) => onSearchChange({ offset })}
        />
      </div>
      <KostTypeEditor
        category={category}
        kostType={typeEditor === "create" ? null : typeEditor}
        open={typeEditor !== null}
        onOpenChange={(open) => !open && setTypeEditor(null)}
      />
      {roomEditor ? (
        <RoomInventoryEditor
          key={`${currentRoomScope}:${roomEditor.id}`}
          room={roomEditor}
          propertyId={currentPropertyId}
          category={category}
          types={types.filter((item) => item.status === "active")}
          buildings={buildings}
          canPersist={canPersistRoom}
          open={!roomScopeChanged && canPersistRoom}
          onOpenChange={(open) => !open && setRoomEditor(null)}
        />
      ) : null}
      <RoomStatusDialog
        room={statusRoom}
        open={statusRoom !== null}
        onOpenChange={(open) => !open && setStatusRoom(null)}
      />
    </AppShell>
  );
}

function KostTypeHeader({
  kostType,
  canManage,
  onEdit,
}: {
  kostType: KostType;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/90">
      <CardHeader className="border-b border-slate-800 pb-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-blue-500/30 bg-blue-500/10 text-blue-300" variant="outline">
                {KOST_TYPE_LABEL[kostType.category]}
              </Badge>
              <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                {kostType.status === "active" ? "Aktif" : "Tidak Aktif"}
              </Badge>
              {kostType.publicVisible ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                >
                  <Eye className="mr-1 h-3 w-3" /> Publik
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                  <EyeOff className="mr-1 h-3 w-3" /> Internal
                </Badge>
              )}
            </div>
            <CardTitle className="text-xl text-slate-100">{kostType.name}</CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              {kostType.descriptionShort || "Belum ada deskripsi singkat untuk tipe kost ini."}
            </p>
          </div>
          {canManage ? (
            <Button className="shrink-0" variant="outline" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit Tipe
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Metric label="Bulanan" value={formatIDR(kostType.monthlyPrice)} icon={CircleDollarSign} />
        <Metric label="Tahunan" value={formatIDR(kostType.yearlyPrice)} icon={CircleDollarSign} />
        <Metric label="Deposit" value={formatIDR(kostType.depositAmount)} icon={ShieldAlert} />
        <Metric
          label="Fasilitas"
          value={`${kostType.facilityCount ?? kostType.facilities?.length ?? 0} item`}
          icon={Wrench}
        />
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CircleDollarSign;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export function RoomDiscoveryFilters({
  category,
  buildings,
  search,
  onSearchChange,
}: {
  category?: KostTypeCategory;
  buildings: BuildingOption[];
  search: RoomRouteSearch;
  onSearchChange: (next: Partial<RoomRouteSearch>) => void;
}) {
  const [searchText, setSearchText] = useState(search.q);
  useEffect(() => setSearchText(search.q), [search.q]);
  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchChange({ q: searchText.trim(), offset: 0 });
  };
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <form className="flex gap-2 md:col-span-2" onSubmit={applySearch}>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="border-slate-700 bg-slate-950 pl-9 text-slate-100"
              aria-label="Cari kamar"
              placeholder={`Cari ${category ? KOST_TYPE_LABEL[category].toLowerCase() : "kamar, bangunan, tipe, atau penghuni"}...`}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
          <Button type="submit">Cari</Button>
        </form>
        <Select
          value={search.buildingId ?? "all"}
          onValueChange={(buildingId) =>
            onSearchChange({
              buildingId: buildingId === "all" ? undefined : buildingId,
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua bangunan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua bangunan</SelectItem>
            {buildings.map((building) => (
              <SelectItem key={building.id} value={building.id}>
                {building.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.status ?? "all"}
          onValueChange={(status) =>
            onSearchChange({
              status: status === "all" ? undefined : (status as RoomInventory["status"]),
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {Object.entries(ROOM_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.floorCode ?? "all"}
          onValueChange={(floorCode) =>
            onSearchChange({
              floorCode: floorCode === "all" ? undefined : (floorCode as "A" | "B"),
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua lantai" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua lantai</SelectItem>
            <SelectItem value="A">Lantai atas</SelectItem>
            <SelectItem value="B">Lantai bawah</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.genderPolicy ?? "all"}
          onValueChange={(genderPolicy) =>
            onSearchChange({
              genderPolicy:
                genderPolicy === "all" ? undefined : (genderPolicy as "male" | "female"),
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua gender</SelectItem>
            <SelectItem value="male">Putra</SelectItem>
            <SelectItem value="female">Putri</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            search.activeOccupancy === undefined
              ? "all"
              : search.activeOccupancy
                ? "active"
                : "none"
          }
          onValueChange={(value) =>
            onSearchChange({
              activeOccupancy: value === "all" ? undefined : value === "active",
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua hunian" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua hunian</SelectItem>
            <SelectItem value="active">Ada penghuni aktif</SelectItem>
            <SelectItem value="none">Tanpa penghuni aktif</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.reconciliationState ?? "all"}
          onValueChange={(reconciliationState) =>
            onSearchChange({
              reconciliationState:
                reconciliationState === "all"
                  ? undefined
                  : (reconciliationState as "normal" | "requires_review"),
              offset: 0,
            })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Semua rekonsiliasi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua rekonsiliasi</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="requires_review">Perlu rekonsiliasi</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.sort ?? "room_number"}
          onValueChange={(sort) =>
            onSearchChange({ sort: sort as RoomRouteSearch["sort"], offset: 0 })
          }
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Urutkan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="room_number">Nomor kamar</SelectItem>
            <SelectItem value="building">Bangunan</SelectItem>
            <SelectItem value="category">Kategori</SelectItem>
            <SelectItem value="gender_policy">Jenis kelamin</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="active_resident">Penghuni aktif</SelectItem>
            <SelectItem value="updated_at">Terakhir diperbarui</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.order ?? "asc"}
          onValueChange={(order) => onSearchChange({ order: order as "asc" | "desc", offset: 0 })}
        >
          <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100">
            <SelectValue placeholder="Arah urutan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Naik</SelectItem>
            <SelectItem value="desc">Turun</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() =>
            onSearchChange({
              q: "",
              category: category,
              buildingId: undefined,
              floorCode: undefined,
              status: undefined,
              genderPolicy: undefined,
              activeOccupancy: undefined,
              reconciliationState: undefined,
              sort: undefined,
              order: undefined,
              offset: 0,
            })
          }
        >
          Reset
        </Button>
      </CardContent>
    </Card>
  );
}

export function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit && offset <= 0) return null;
  const display = getRoomPaginationDisplay(offset, limit, total);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
      <span>{display.label}</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

export function RoomInventoryTable({
  rooms,
  canManage,
  canEdit = canManage,
  onEdit,
  onStatus,
  showCategory = true,
}: {
  rooms: RoomInventory[];
  canManage: boolean;
  canEdit?: boolean;
  onEdit: (room: RoomInventory) => void;
  onStatus: (room: RoomInventory) => void;
  showCategory?: boolean;
}) {
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const navigate = useNavigate();
  const [quickBookingRoom, setQuickBookingRoom] = useState<RoomInventory | null>(null);
  const [legacyCheckoutRoom, setLegacyCheckoutRoom] = useState<RoomInventory | null>(null);
  const canLegacyCheckout =
    (user?.roles ?? []).some((role) => ["owner", "manager", "admin"].includes(role)) &&
    hasPermission("checkout.manage") &&
    Boolean(currentPropertyId);
  const openDetail = (room: RoomInventory) =>
    navigate({
      to: "/rooms/$roomNumber",
      params: { roomNumber: room.number },
    });

  if (!rooms.length) {
    return (
      <Card className="border-slate-800 bg-slate-900/80">
        <CardContent className="p-6">
          <EmptyState
            icon={<BedDouble className="h-5 w-5" />}
            title="Tidak ada kamar pada hasil ini"
            description="Ubah atau reset filter untuk melihat inventori kamar yang tersedia."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <Card className="overflow-hidden border-slate-800 bg-slate-900/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Kamar</th>
                <th className="px-4 py-3">Bangunan</th>
                {showCategory ? <th className="px-4 py-3">Kategori</th> : null}
                <th className="px-4 py-3">Jenis Kelamin</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Penghuni Aktif</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rooms.map((room) => {
                const managedStatus = allowedRoomStatusTargets(room.status).length > 0;
                const residentName =
                  room.activeLease?.residentName ?? room.activeOccupancy?.residentName;
                return (
                  <tr
                    key={room.id}
                    className="cursor-pointer transition-colors hover:bg-slate-800/60"
                    onClick={() => void openDetail(room)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        className="inline-flex min-h-11 flex-col justify-center rounded-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        to="/rooms/$roomNumber"
                        params={{ roomNumber: room.number }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span>{roomLabel(room)}</span>
                        {room.roomCode && room.roomCode !== room.number ? (
                          <span className="text-xs font-normal text-slate-500">{room.number}</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {room.buildingName || room.buildingCode || room.unitCode || "Belum bernama"}
                    </td>
                    {showCategory ? (
                      <td className="px-4 py-3 text-slate-300">
                        {KOST_TYPE_LABEL[room.kostType.category]}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-slate-300">
                      {room.genderPolicy === "male" ? "Putra" : "Putri"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <RoomStatusBadge status={room.status} />
                        {room.leaseReconciliationRequired ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-200"
                          >
                            Perlu rekonsiliasi penyewaan
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {residentName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-500" /> {residentName}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-11 min-w-11"
                            aria-label={`Aksi ${roomLabel(room)}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void openDetail(room)}>
                            Lihat detail
                          </DropdownMenuItem>
                          {canCreateAdminBookingLead({
                            roles: user?.roles ?? [],
                            permissions: user?.permissions ?? [],
                            propertyId: currentPropertyId,
                            room,
                          }) && room.status === "vacant" ? (
                            <DropdownMenuItem onClick={() => setQuickBookingRoom(room)}>
                              <CalendarPlus className="mr-2 h-3.5 w-3.5" /> Catat minat booking
                            </DropdownMenuItem>
                          ) : null}
                          {canEdit ? (
                            <DropdownMenuItem onClick={() => onEdit(room)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit inventori
                            </DropdownMenuItem>
                          ) : null}
                          {canManage && managedStatus ? (
                            <DropdownMenuItem onClick={() => onStatus(room)}>
                              <Wrench className="mr-2 h-3.5 w-3.5" /> Ubah status operasional
                            </DropdownMenuItem>
                          ) : null}
                          {canLegacyCheckout && room.leaseReconciliationRequired ? (
                            <DropdownMenuItem onClick={() => setLegacyCheckoutRoom(room)}>
                              <ShieldAlert className="mr-2 h-3.5 w-3.5" /> Rekonsiliasi data lama
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <QuickBookingDialog
        room={quickBookingRoom}
        open={quickBookingRoom !== null}
        onOpenChange={(open) => !open && setQuickBookingRoom(null)}
      />
      <CompatibilityCheckoutDialog
        room={legacyCheckoutRoom}
        open={legacyCheckoutRoom !== null}
        onOpenChange={(open) => !open && setLegacyCheckoutRoom(null)}
      />
    </>
  );
}

type KostTypeDraft = Omit<KostTypeInput, "propertyId" | "category">;

function draftForKostType(kostType: KostType | null): KostTypeDraft {
  return {
    name: kostType?.name ?? "",
    slug: kostType?.slug ?? "",
    descriptionShort: kostType?.descriptionShort ?? "",
    descriptionLong: kostType?.descriptionLong ?? "",
    roomSizeLabel: kostType?.roomSizeLabel ?? "",
    roomSizeM2: kostType?.roomSizeM2 ?? undefined,
    monthlyPrice: kostType?.monthlyPrice ?? 0,
    yearlyPrice: kostType?.yearlyPrice ?? 0,
    depositAmount: kostType?.depositAmount ?? 0,
    publicVisible: kostType?.publicVisible ?? true,
    notes: kostType?.notes ?? "",
    status: kostType?.status ?? "active",
  };
}

function KostTypeEditor({
  category,
  kostType,
  open,
  onOpenChange,
}: {
  category: KostTypeCategory;
  kostType: KostType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<KostTypeDraft>(() => draftForKostType(kostType));
  const create = useM4Mutation<KostType, Omit<KostTypeInput, "propertyId">>(
    "kost-type",
    "Tipe kost berhasil disimpan",
    (propertyId, input, key) => adminUxMasterApi.kostTypes.create({ ...input, propertyId }, key),
  );
  const update = useM4Mutation<KostType, { id: string; input: KostTypeDraft }>(
    "kost-type",
    "Tipe kost berhasil diperbarui",
    (propertyId, variables, key) => {
      void propertyId;
      return adminUxMasterApi.kostTypes.update(variables.id, variables.input, key);
    },
  );
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) setDraft(draftForKostType(kostType));
  }, [kostType, open]);

  const set = <Key extends keyof KostTypeDraft>(key: Key, value: KostTypeDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const valid = Boolean(draft.name.trim() && draft.slug.trim());

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    try {
      if (kostType) {
        await update.mutateAsync({ id: kostType.id, input: draft });
      } else {
        await create.mutateAsync({ ...draft, category });
      }
      onOpenChange(false);
    } catch {
      // The shared mutation boundary exposes only a safe error message.
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-slate-800 bg-slate-900 sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{kostType ? "Edit Tipe Kost" : "Buat Tipe Kost"}</SheetTitle>
          <SheetDescription>
            Harga, deposit, ukuran, dan visibilitas dikelola pada tipe kost lalu diwariskan ke
            inventori.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-5 py-5" onSubmit={submit}>
          <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100">
            Kategori terkunci: <span className="font-semibold">{KOST_TYPE_LABEL[category]}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama tipe kost" required>
              <Input
                value={draft.name}
                maxLength={120}
                disabled={pending}
                onChange={(event) => {
                  const name = event.target.value;
                  set("name", name);
                  if (!kostType && !draft.slug) set("slug", createKostTypeSlug(name));
                }}
                placeholder="Mis. Rumah Kost Granada"
              />
            </Field>
            <Field label="Slug internal" required hint="Huruf kecil, angka, dan tanda hubung.">
              <Input
                value={draft.slug}
                maxLength={120}
                disabled={pending}
                onChange={(event) => set("slug", createKostTypeSlug(event.target.value))}
                placeholder="rumah-kost-granada"
              />
            </Field>
          </div>
          <Field label="Deskripsi singkat">
            <Textarea
              value={draft.descriptionShort ?? ""}
              maxLength={500}
              rows={2}
              disabled={pending}
              onChange={(event) => set("descriptionShort", event.target.value)}
            />
          </Field>
          <Field label="Deskripsi lengkap">
            <Textarea
              value={draft.descriptionLong ?? ""}
              maxLength={5000}
              rows={4}
              disabled={pending}
              onChange={(event) => set("descriptionLong", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label ukuran">
              <Input
                value={draft.roomSizeLabel ?? ""}
                maxLength={80}
                disabled={pending}
                onChange={(event) => set("roomSizeLabel", event.target.value)}
                placeholder="Mis. 3 × 4 m"
              />
            </Field>
            <Field label="Luas (m²)">
              <Input
                inputMode="numeric"
                value={draft.roomSizeM2 ?? ""}
                disabled={pending}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  set("roomSizeM2", Number.isInteger(next) && next > 0 ? next : undefined);
                }}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Harga bulanan" required>
              <CurrencyInput
                value={draft.monthlyPrice}
                disabled={pending}
                onValueChange={(value) => set("monthlyPrice", value)}
              />
            </Field>
            <Field label="Harga tahunan" required>
              <CurrencyInput
                value={draft.yearlyPrice}
                disabled={pending}
                onValueChange={(value) => set("yearlyPrice", value)}
              />
            </Field>
            <Field label="Deposit" required>
              <CurrencyInput
                value={draft.depositAmount}
                disabled={pending}
                onValueChange={(value) => set("depositAmount", value)}
              />
            </Field>
          </div>
          <Field label="Catatan internal">
            <Textarea
              value={draft.notes ?? ""}
              maxLength={2000}
              rows={3}
              disabled={pending}
              onChange={(event) => set("notes", event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-5 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <Switch
                checked={draft.publicVisible ?? true}
                disabled={pending}
                onCheckedChange={(checked) => set("publicVisible", checked)}
              />
              Tampilkan pada katalog publik
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <Switch
                checked={draft.status === "active"}
                disabled={pending}
                onCheckedChange={(checked) => set("status", checked ? "active" : "inactive")}
              />
              Tipe aktif
            </label>
          </div>
          <SheetFooter className="border-t border-slate-800 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {kostType ? "Simpan Perubahan" : "Buat Tipe Kost"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-200">
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

type RoomDraft = {
  kostTypeId: string;
  number: string;
  roomCode: string;
  buildingId: string;
  floorCode: "" | "A" | "B";
  unitCode: string;
  sizeLabel: string;
  primaryPhotoFileId: string | null;
  publicVisible: boolean;
};

type RoomDraftField = "number" | "buildingId" | "kostTypeId" | "floorCode";
type RoomDraftErrors = Partial<Record<RoomDraftField, string>>;

const ROOM_FIELD_ID: Record<RoomDraftField, string> = {
  number: "room-number",
  buildingId: "room-building",
  kostTypeId: "room-kost-type",
  floorCode: "room-floor-code",
};

function draftForRoom(room: RoomInventory): RoomDraft {
  return {
    kostTypeId: room.kostType.id,
    number: room.number,
    roomCode: room.roomCode ?? "",
    buildingId: room.buildingId ?? "",
    floorCode: room.floorCode ?? "",
    unitCode: room.unitCode ?? "",
    sizeLabel: room.sizeLabel ?? "",
    primaryPhotoFileId: room.primaryPhotoFileId ?? null,
    publicVisible: room.publicVisible,
  };
}

function optionalRoomText(value: string): string | null {
  return value.trim() || null;
}

function validateRoomDraft(
  draft: RoomDraft,
  buildings: readonly BuildingOption[],
  types: readonly KostType[],
): RoomDraftErrors {
  const errors: RoomDraftErrors = {};
  const number = draft.number.trim();
  if (!number) errors.number = "Nomor kamar wajib diisi.";
  else if (number.length > 80) errors.number = "Nomor kamar maksimal 80 karakter.";
  const references = hasAuthoritativeRoomReferences(
    draft.buildingId,
    draft.kostTypeId,
    buildings.map((building) => building.id),
    types.map((type) => type.id),
  );
  if (!references.building) errors.buildingId = "Pilih bangunan aktif dari referensi properti.";
  if (!references.kostType) errors.kostTypeId = "Pilih tipe kost aktif dari referensi properti.";
  if (!draft.floorCode) errors.floorCode = "Lantai wajib dipilih.";
  return errors;
}

function roomInputFromDraft(draft: RoomDraft): RoomInventoryUpdateInput {
  if (!draft.floorCode) throw new Error("ROOM_FLOOR_REQUIRED");
  return {
    kostTypeId: draft.kostTypeId,
    number: draft.number.trim(),
    roomCode: optionalRoomText(draft.roomCode),
    buildingId: draft.buildingId,
    floorCode: draft.floorCode,
    unitCode: optionalRoomText(draft.unitCode),
    sizeLabel: optionalRoomText(draft.sizeLabel),
    primaryPhotoFileId: draft.primaryPhotoFileId,
    publicVisible: draft.publicVisible,
  };
}

function RoomFormField({
  id,
  label,
  hint,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RoomInventoryEditor({
  room,
  propertyId,
  category,
  types,
  buildings,
  canPersist,
  open,
  onOpenChange,
  onSaved,
}: {
  room: RoomInventory;
  propertyId: string | null | undefined;
  category: KostTypeCategory;
  types: KostType[];
  buildings: BuildingOption[];
  canPersist: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (room: RoomInventory) => void;
}) {
  const [draft, setDraft] = useState<RoomDraft>(() => draftForRoom(room));
  const [errors, setErrors] = useState<RoomDraftErrors>({});
  const {
    discardIntent,
    isPending,
    submit: submitRoomMutation,
  } = useRoomPersistenceMutation({ propertyId, category, enabled: canPersist });
  const roomForDraft = useRef(room);
  if (roomForDraft.current?.id !== room?.id) roomForDraft.current = room;
  const editorGeneration = useRef(0);
  const editorScope = useRef({
    open,
    propertyId,
    category,
    roomId: room?.id ?? null,
    canPersist,
  });
  editorScope.current = { open, propertyId, category, roomId: room?.id ?? null, canPersist };

  useEffect(() => {
    if (open) {
      editorGeneration.current += 1;
      setDraft(draftForRoom(roomForDraft.current));
      setErrors({});
    } else {
      discardIntent();
    }
  }, [canPersist, category, discardIntent, open, propertyId, room?.id]);

  const selectedBuilding = buildings.find((item) => item.id === draft.buildingId) ?? null;
  const availableTypes = types.filter((type) => type.category === category);
  const selectedType = availableTypes.find((item) => item.id === draft.kostTypeId) ?? null;
  const structuralLocked = roomStructuralEditLocked(room);
  const pending = isPending;

  const clearError = (field: RoomDraftField) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const describedBy = (field: RoomDraftField, hasHint = false) =>
    [
      hasHint ? `${ROOM_FIELD_ID[field]}-hint` : null,
      errors[field] ? `${ROOM_FIELD_ID[field]}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateRoomDraft(draft, buildings, availableTypes);
    const firstInvalid = (Object.keys(nextErrors) as RoomDraftField[])[0];
    if (!propertyId || !canPersist || firstInvalid) {
      const scopeError = !propertyId
        ? "Pilih properti aktif terlebih dahulu."
        : !canPersist
          ? "Akses atau referensi kamar berubah. Buka kembali editor dari data terbaru."
          : null;
      setErrors(
        scopeError ? { ...nextErrors, number: nextErrors.number ?? scopeError } : nextErrors,
      );
      const targetId = firstInvalid ? ROOM_FIELD_ID[firstInvalid] : ROOM_FIELD_ID.number;
      requestAnimationFrame(() => document.getElementById(targetId)?.focus());
      return;
    }

    const beforeRequest = editorScope.current;
    if (
      !beforeRequest.open ||
      !beforeRequest.canPersist ||
      beforeRequest.propertyId !== propertyId ||
      beforeRequest.category !== category ||
      beforeRequest.roomId !== (room?.id ?? null)
    ) {
      return;
    }

    const generation = editorGeneration.current;
    const roomId = room.id;
    const updateInput = roomInputFromDraft(draft);
    if (roomStructuralEditLocked(room) && roomStructuralInputChanged(room, updateInput)) {
      setErrors({
        number: "Identitas struktural terkunci oleh status operasional terbaru.",
      });
      document.getElementById(ROOM_FIELD_ID.number)?.focus();
      return;
    }
    try {
      const result = await submitRoomMutation({
        kind: "update",
        propertyId,
        category,
        roomId,
        previousRoomNumber: room.number,
        input: updateInput,
      });
      const current = editorScope.current;
      if (
        editorGeneration.current === generation &&
        current.open &&
        current.propertyId === propertyId &&
        current.category === category &&
        current.roomId === roomId &&
        current.canPersist
      ) {
        onSaved?.(result.room);
        onOpenChange(false);
      }
    } catch {
      // The room-specific mutation boundary emits only an allowlisted error.
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="w-full max-w-full overflow-x-hidden overflow-y-auto border-border bg-background text-foreground sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader>
          <SheetTitle>Edit Inventori Kamar</SheetTitle>
          <SheetDescription>
            Form ini hanya mengubah inventori fisik. Harga, deposit, dan fasilitas berasal dari tipe
            kost.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-5 py-5" onSubmit={submit} noValidate>
          {Object.values(errors).some(Boolean) ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"
            >
              Periksa kembali field yang ditandai sebelum menyimpan kamar.
            </div>
          ) : null}
          {structuralLocked ? (
            <div
              role="note"
              className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            >
              Identitas dan lokasi kamar dikunci selama booking, hunian, atau penyewaan masih aktif.
              Anda tetap dapat mengubah ukuran, foto utama, dan visibilitas katalog.
            </div>
          ) : null}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Identitas dan lokasi</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <RoomFormField
                id={ROOM_FIELD_ID.number}
                label="Nomor kamar"
                required
                error={errors.number}
              >
                <Input
                  id={ROOM_FIELD_ID.number}
                  className="min-h-11"
                  value={draft.number}
                  maxLength={80}
                  required
                  aria-invalid={Boolean(errors.number)}
                  aria-describedby={describedBy("number")}
                  disabled={pending || structuralLocked}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, number: event.target.value }));
                    clearError("number");
                  }}
                  placeholder="Mis. 101"
                />
              </RoomFormField>
              <RoomFormField id="room-code" label="Kode kamar">
                <Input
                  id="room-code"
                  className="min-h-11"
                  value={draft.roomCode}
                  maxLength={80}
                  disabled={pending || structuralLocked}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, roomCode: event.target.value }))
                  }
                  placeholder="Mis. RK-101"
                />
              </RoomFormField>
            </div>
            <RoomFormField
              id={ROOM_FIELD_ID.buildingId}
              label="Bangunan"
              required
              error={errors.buildingId}
              hint="Hanya bangunan properti aktif yang sesuai dengan kategori ini."
            >
              <Select
                value={draft.buildingId || undefined}
                disabled={pending || structuralLocked || buildings.length === 0}
                onValueChange={(buildingId) => {
                  setDraft((current) => ({ ...current, buildingId }));
                  clearError("buildingId");
                }}
              >
                <SelectTrigger
                  id={ROOM_FIELD_ID.buildingId}
                  className="min-h-11"
                  aria-required="true"
                  aria-invalid={Boolean(errors.buildingId)}
                  aria-describedby={describedBy("buildingId", true)}
                >
                  <SelectValue placeholder="Pilih bangunan" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.label} · {KOST_TYPE_LABEL[building.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RoomFormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <RoomFormField
                id={ROOM_FIELD_ID.floorCode}
                label="Lantai"
                required
                error={errors.floorCode}
              >
                <Select
                  value={draft.floorCode || undefined}
                  disabled={pending || structuralLocked}
                  onValueChange={(floorCode) => {
                    setDraft((current) => ({ ...current, floorCode: floorCode as "A" | "B" }));
                    clearError("floorCode");
                  }}
                >
                  <SelectTrigger
                    id={ROOM_FIELD_ID.floorCode}
                    className="min-h-11"
                    aria-required="true"
                    aria-invalid={Boolean(errors.floorCode)}
                    aria-describedby={describedBy("floorCode")}
                  >
                    <SelectValue placeholder="Pilih lantai" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B">Lantai Bawah / Lantai 1</SelectItem>
                    <SelectItem value="A">Lantai Atas / Lantai 2</SelectItem>
                  </SelectContent>
                </Select>
              </RoomFormField>
              <RoomFormField id="room-unit-code" label="Unit / label lokasi">
                <Input
                  id="room-unit-code"
                  className="min-h-11"
                  value={draft.unitCode}
                  maxLength={80}
                  disabled={pending || structuralLocked}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, unitCode: event.target.value }))
                  }
                  placeholder="Mis. Unit A"
                />
              </RoomFormField>
            </div>
          </section>
          <section className="space-y-4 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">Atribut inventori</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <RoomFormField
                id={ROOM_FIELD_ID.kostTypeId}
                label="Tipe kost"
                required
                error={errors.kostTypeId}
              >
                <Select
                  value={draft.kostTypeId || undefined}
                  disabled={pending || structuralLocked || !draft.buildingId}
                  onValueChange={(kostTypeId) => {
                    setDraft((current) => ({ ...current, kostTypeId }));
                    clearError("kostTypeId");
                  }}
                >
                  <SelectTrigger
                    id={ROOM_FIELD_ID.kostTypeId}
                    className="min-h-11"
                    aria-required="true"
                    aria-invalid={Boolean(errors.kostTypeId)}
                    aria-describedby={describedBy("kostTypeId")}
                  >
                    <SelectValue placeholder="Pilih tipe kost" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </RoomFormField>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">Kebijakan gender bangunan</p>
                <div
                  id="room-building-gender"
                  className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
                >
                  {selectedBuilding
                    ? selectedBuilding.genderPolicy === "male"
                      ? "Putra"
                      : "Putri"
                    : "Pilih bangunan terlebih dahulu"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Nilai ini berasal dari referensi bangunan dan tidak dikirim sebagai pilihan form.
                </p>
              </div>
            </div>
            <RoomFormField id="room-size-label" label="Ukuran kamar">
              <Input
                id="room-size-label"
                className="min-h-11"
                value={draft.sizeLabel}
                maxLength={80}
                disabled={pending}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sizeLabel: event.target.value }))
                }
                placeholder="Mis. 3 × 4 m"
              />
            </RoomFormField>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <Switch
                id="room-public-visible"
                checked={draft.publicVisible}
                disabled={pending}
                onCheckedChange={(publicVisible) =>
                  setDraft((current) => ({ ...current, publicVisible }))
                }
              />
              <Label htmlFor="room-public-visible" className="text-sm text-foreground">
                Tampilkan kamar ini pada katalog publik
              </Label>
            </div>
          </section>
          <section className="rounded-lg border border-primary/25 bg-primary-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Komersial dari tipe kost</p>
            {selectedType ? (
              <p className="mt-1 text-muted-foreground">
                {formatIDR(selectedType.monthlyPrice)}/bulan · {formatIDR(selectedType.yearlyPrice)}
                /tahun · deposit {formatIDR(selectedType.depositAmount)} ·
                {` ${selectedType.facilityCount ?? selectedType.facilities?.length ?? 0} fasilitas`}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Pilih bangunan dan tipe kost untuk melihat nilai yang diwariskan.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Harga, deposit, dan assignment fasilitas tidak dikirim melalui mutation kamar.
            </p>
          </section>
          <SheetFooter className="border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending || !canPersist}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan Inventori
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function RoomStatusDialog({
  room,
  open,
  onOpenChange,
}: {
  room: RoomInventory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allowed = room ? allowedRoomStatusTargets(room.status) : [];
  const [status, setStatus] = useState<(typeof allowed)[number] | "">("");
  const [reason, setReason] = useState("");
  const mutation = useM4Mutation<
    RoomInventory,
    {
      roomId: string;
      status: Exclude<RoomInventory["status"], "occupied" | "reserved">;
      reason: string;
    }
  >("room", "Status operasional kamar diperbarui", (propertyId, values, key) => {
    void propertyId;
    return adminUxMasterApi.rooms.updateStatus(values.roomId, values, key);
  });

  useEffect(() => {
    if (open) {
      setStatus("");
      setReason("");
    }
  }, [open, room?.id]);

  if (!room) return null;
  const canSubmit = Boolean(status && reason.trim());
  const submit = async () => {
    if (!status || !reason.trim()) return;
    try {
      await mutation.mutateAsync({ roomId: room.id, status, reason: reason.trim() });
      onOpenChange(false);
    } catch {
      // Safe toast is emitted by the mutation boundary.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Ubah Status Operasional</DialogTitle>
          <DialogDescription>
            Status kamar {roomLabel(room)} hanya dapat berpindah melalui transisi inventori yang
            legal.
          </DialogDescription>
        </DialogHeader>
        {allowed.length ? (
          <div className="space-y-4">
            <Field label="Status tujuan" required>
              <Select
                value={status || "none"}
                onValueChange={(value) =>
                  setStatus(value === "none" ? "" : (value as typeof status))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pilih status</SelectItem>
                  {allowed.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ROOM_STATUS_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Alasan audit" required hint="Alasan disimpan pada audit status kamar.">
              <Textarea
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            Status ini dikelola oleh lifecycle penyewaan atau tidak memiliki transisi inventori yang
            tersedia.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          {allowed.length ? (
            <Button disabled={!canSubmit || mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan Status
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
