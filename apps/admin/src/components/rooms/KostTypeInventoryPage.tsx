// Shared M4 inventory surface for Rumah Kost and Apart Kost.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BedDouble,
  Building2,
  CircleDollarSign,
  Eye,
  EyeOff,
  FilePenLine,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
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
  type RoomInventoryInput,
  type RoomInventoryUpdateInput,
} from "@/lib/admin-ux-master-api";
import {
  KOST_TYPE_LABEL,
  ROOM_STATUS_LABEL,
  allowedRoomStatusTargets,
  createKostTypeSlug,
  getRoomPaginationDisplay,
  type RoomRouteSearch,
} from "@/lib/admin-ux-master-helpers";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useM4KostTypes, useM4Mutation, useM4RoomInventory } from "@/hooks/useAdminUxMaster";

type Props = {
  category: KostTypeCategory;
  search: RoomRouteSearch;
  onSearchChange: (next: Partial<RoomRouteSearch>) => void;
};

type BuildingOption = {
  id: string;
  label: string;
  category: KostTypeCategory;
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

function buildingOptions(rooms: RoomInventory[]): BuildingOption[] {
  const options = new Map<string, BuildingOption>();
  for (const room of rooms) {
    if (!room.buildingId) continue;
    options.set(room.buildingId, {
      id: room.buildingId,
      label: room.buildingName || room.buildingCode || room.unitCode || "Bangunan tersedia",
      category: room.kostType.category,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "id-ID"),
  );
}

function RoomStatusBadge({ status }: { status: RoomInventory["status"] }) {
  return (
    <Badge className={cn("whitespace-nowrap border", STATUS_TONE[status])} variant="outline">
      {ROOM_STATUS_LABEL[status]}
    </Badge>
  );
}

export function KostTypeInventoryPage({ category, search, onSearchChange }: Props) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");
  const typeQuery = useM4KostTypes({ category, limit: 100 });
  const roomQuery = useM4RoomInventory({
    category,
    q: search.q,
    buildingId: search.buildingId,
    floor: search.floor,
    status: search.status,
    includeActiveLease: true,
    limit: search.limit,
    offset: search.offset,
  });
  const [typeEditor, setTypeEditor] = useState<KostType | null | "create">(null);
  const [roomEditor, setRoomEditor] = useState<RoomInventory | null | "create">(null);
  const [detailRoom, setDetailRoom] = useState<RoomInventory | null>(null);
  const [statusRoom, setStatusRoom] = useState<RoomInventory | null>(null);
  const rooms = roomQuery.data?.items ?? EMPTY_ROOM_ITEMS;
  const types = typeQuery.data?.items ?? [];
  const activeType = types.find((item) => item.status === "active") ?? null;
  const buildings = useMemo(() => buildingOptions(rooms), [rooms]);

  if (typeQuery.isLoading || roomQuery.isLoading) {
    return (
      <AppShell title={KOST_TYPE_LABEL[category]} subtitle="Menyiapkan inventori dan tipe kost">
        <LoadingState label="Memuat data kamar..." />
      </AppShell>
    );
  }

  if (typeQuery.error || roomQuery.error) {
    return (
      <AppShell title={KOST_TYPE_LABEL[category]} subtitle="Inventori dan konfigurasi tipe kost">
        <ErrorState
          error={typeQuery.error ?? roomQuery.error}
          onRetry={() => {
            void typeQuery.refetch();
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
            <Button variant="outline" onClick={() => setTypeEditor(activeType ?? "create")}>
              <FilePenLine className="mr-2 h-4 w-4" />
              {activeType ? "Edit Tipe Kost" : "Buat Tipe Kost"}
            </Button>
            <Button
              onClick={() => setRoomEditor("create")}
              disabled={!activeType || buildings.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" /> Tambah Kamar
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

        <RoomFilters
          category={category}
          buildings={buildings}
          search={search}
          onSearchChange={onSearchChange}
        />
        <RoomInventoryTable
          rooms={rooms}
          canManage={canManage}
          onDetail={setDetailRoom}
          onEdit={setRoomEditor}
          onStatus={setStatusRoom}
        />
        <Pagination
          offset={search.offset}
          limit={search.limit}
          total={roomQuery.data?.total ?? 0}
          onChange={(offset) => onSearchChange({ offset })}
        />
        {!activeType && canManage ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            Inventori baru membutuhkan tipe kost aktif. Tambah kamar tersedia setelah tipe dan
            bangunan yang sesuai ditemukan.
          </p>
        ) : null}
      </div>
      <KostTypeEditor
        category={category}
        kostType={typeEditor === "create" ? null : typeEditor}
        open={typeEditor !== null}
        onOpenChange={(open) => !open && setTypeEditor(null)}
      />
      <RoomInventoryEditor
        room={roomEditor === "create" ? null : roomEditor}
        types={types.filter((item) => item.status === "active")}
        buildings={buildings}
        open={roomEditor !== null}
        onOpenChange={(open) => !open && setRoomEditor(null)}
      />
      <RoomDetailSheet
        room={detailRoom}
        open={detailRoom !== null}
        onOpenChange={(open) => !open && setDetailRoom(null)}
        onEdit={canManage ? setRoomEditor : undefined}
      />
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

function RoomFilters({
  category,
  buildings,
  search,
  onSearchChange,
}: {
  category: KostTypeCategory;
  buildings: BuildingOption[];
  search: RoomRouteSearch;
  onSearchChange: (next: Partial<RoomRouteSearch>) => void;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            className="border-slate-700 bg-slate-950 pl-9 text-slate-100"
            placeholder={`Cari ${KOST_TYPE_LABEL[category].toLowerCase()}...`}
            value={search.q}
            onChange={(event) => onSearchChange({ q: event.target.value, offset: 0 })}
          />
        </div>
        <Select
          value={search.buildingId ?? "all"}
          onValueChange={(buildingId) =>
            onSearchChange({ buildingId: buildingId === "all" ? undefined : buildingId, offset: 0 })
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
          value={search.floor ?? "all"}
          onValueChange={(floor) =>
            onSearchChange({ floor: floor === "all" ? undefined : floor, offset: 0 })
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
        <Button
          variant="outline"
          onClick={() =>
            onSearchChange({
              q: "",
              buildingId: undefined,
              floor: undefined,
              status: undefined,
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
  onDetail,
  onEdit,
  onStatus,
}: {
  rooms: RoomInventory[];
  canManage: boolean;
  onDetail: (room: RoomInventory) => void;
  onEdit: (room: RoomInventory) => void;
  onStatus: (room: RoomInventory) => void;
}) {
  if (!rooms.length) {
    return (
      <Card className="border-slate-800 bg-slate-900/80">
        <CardContent className="p-6">
          <EmptyState
            icon={<BedDouble className="h-5 w-5" />}
            title="Tidak ada kamar pada hasil ini"
            description="Ubah filter atau tambahkan inventori yang sesuai dengan tipe kost aktif."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Kamar</th>
              <th className="px-4 py-3">Bangunan</th>
              <th className="px-4 py-3">Tipe Kost</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Penghuni Aktif</th>
              <th className="px-4 py-3 text-right">Harga dari Tipe</th>
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
                  onClick={() => onDetail(room)}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-100">{roomLabel(room)}</p>
                    {room.roomCode && room.roomCode !== room.number ? (
                      <p className="text-xs text-slate-500">{room.number}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {room.buildingName || room.buildingCode || room.unitCode || "Belum bernama"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-200">{room.kostType.name}</p>
                    <p className="text-xs text-slate-500">
                      {KOST_TYPE_LABEL[room.kostType.category]}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <RoomStatusBadge status={room.status} />
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
                  <td className="px-4 py-3 text-right">
                    <p className="font-medium text-slate-100">
                      {formatIDR(room.kostType.monthlyPrice)}/bln
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatIDR(room.kostType.depositAmount)} deposit
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Aksi ${roomLabel(room)} `}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDetail(room)}>
                          Lihat detail
                        </DropdownMenuItem>
                        {canManage ? (
                          <DropdownMenuItem onClick={() => onEdit(room)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit inventori
                          </DropdownMenuItem>
                        ) : null}
                        {canManage && managedStatus ? (
                          <DropdownMenuItem onClick={() => onStatus(room)}>
                            <Wrench className="mr-2 h-3.5 w-3.5" /> Ubah status operasional
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

type RoomDraft = Omit<RoomInventoryInput, "propertyId">;

function draftForRoom(room: RoomInventory | null): RoomDraft {
  return {
    kostTypeId: room?.kostType.id ?? "",
    number: room?.number ?? "",
    roomCode: room?.roomCode ?? "",
    buildingId: room?.buildingId ?? "",
    floor: room?.floor ?? "",
    floorCode: room?.floorCode ?? null,
    floorLabel: room?.floorLabel ?? "",
    unitCode: room?.unitCode ?? "",
    genderPolicy: room?.genderPolicy ?? "mixed",
    sizeLabel: room?.sizeLabel ?? "",
    primaryPhotoFileId: room?.primaryPhotoFileId ?? null,
    publicVisible: room?.publicVisible ?? true,
  };
}

function RoomInventoryEditor({
  room,
  types,
  buildings,
  open,
  onOpenChange,
}: {
  room: RoomInventory | null;
  types: KostType[];
  buildings: BuildingOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<RoomDraft>(() => draftForRoom(room));
  const create = useM4Mutation<RoomInventory, RoomDraft>(
    "room",
    "Kamar berhasil disimpan",
    (propertyId, input, key) => adminUxMasterApi.rooms.create({ ...input, propertyId }, key),
  );
  const update = useM4Mutation<RoomInventory, { id: string; input: RoomInventoryUpdateInput }>(
    "room",
    "Inventori kamar berhasil diperbarui",
    (propertyId, variables, key) => {
      void propertyId;
      return adminUxMasterApi.rooms.update(variables.id, variables.input, key);
    },
  );
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) setDraft(draftForRoom(room));
  }, [open, room]);

  const selectedBuilding = buildings.find((item) => item.id === draft.buildingId);
  const availableTypes = types.filter(
    (type) => !selectedBuilding || type.category === selectedBuilding.category,
  );
  const selectedType = types.find((item) => item.id === draft.kostTypeId) ?? null;
  const valid = Boolean(draft.number.trim() && draft.buildingId && draft.kostTypeId);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    try {
      if (room) {
        await update.mutateAsync({ id: room.id, input: draft });
      } else {
        await create.mutateAsync(draft);
      }
      onOpenChange(false);
    } catch {
      // Safe toast is emitted by the mutation boundary.
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-slate-800 bg-slate-900 sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{room ? "Edit Inventori Kamar" : "Tambah Kamar"}</SheetTitle>
          <SheetDescription>
            Form ini hanya mengubah inventori fisik. Harga, deposit, dan fasilitas berasal dari tipe
            kost.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-5 py-5" onSubmit={submit}>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">Identitas dan lokasi</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nomor kamar" required>
                <Input
                  value={draft.number}
                  maxLength={80}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, number: event.target.value }))
                  }
                  placeholder="Mis. 101"
                />
              </Field>
              <Field label="Kode kamar">
                <Input
                  value={draft.roomCode ?? ""}
                  maxLength={80}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, roomCode: event.target.value }))
                  }
                  placeholder="Mis. RK-101"
                />
              </Field>
            </div>
            <Field
              label="Bangunan"
              required
              hint="Hanya bangunan yang sudah tersedia dari inventori saat ini."
            >
              <Select
                value={draft.buildingId || "none"}
                disabled={pending || buildings.length === 0}
                onValueChange={(buildingId) => {
                  const nextBuildingId = buildingId === "none" ? "" : buildingId;
                  const nextBuilding = buildings.find((item) => item.id === nextBuildingId);
                  setDraft((current) => ({
                    ...current,
                    buildingId: nextBuildingId,
                    kostTypeId:
                      nextBuilding && selectedType?.category !== nextBuilding.category
                        ? ""
                        : current.kostTypeId,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih bangunan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pilih bangunan</SelectItem>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.label} · {KOST_TYPE_LABEL[building.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Lantai">
                <Input
                  value={draft.floor ?? ""}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, floor: event.target.value }))
                  }
                  placeholder="1"
                />
              </Field>
              <Field label="Kode lantai">
                <Select
                  value={draft.floorCode ?? "none"}
                  disabled={pending}
                  onValueChange={(floorCode) =>
                    setDraft((current) => ({
                      ...current,
                      floorCode: floorCode === "none" ? null : (floorCode as "A" | "B"),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ditetapkan</SelectItem>
                    <SelectItem value="A">Atas</SelectItem>
                    <SelectItem value="B">Bawah</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Unit / label lantai">
                <Input
                  value={draft.unitCode ?? ""}
                  disabled={pending}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, unitCode: event.target.value }))
                  }
                  placeholder="Unit A"
                />
              </Field>
            </div>
          </section>
          <section className="space-y-4 border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-100">Atribut inventori</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipe kost" required>
                <Select
                  value={draft.kostTypeId || "none"}
                  disabled={pending || !draft.buildingId}
                  onValueChange={(kostTypeId) =>
                    setDraft((current) => ({
                      ...current,
                      kostTypeId: kostTypeId === "none" ? "" : kostTypeId,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tipe kost" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pilih tipe kost</SelectItem>
                    {availableTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Kebijakan gender">
                <Select
                  value={draft.genderPolicy ?? "mixed"}
                  disabled={pending}
                  onValueChange={(genderPolicy) =>
                    setDraft((current) => ({
                      ...current,
                      genderPolicy: genderPolicy as NonNullable<RoomInventory["genderPolicy"]>,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Putra</SelectItem>
                    <SelectItem value="female">Putri</SelectItem>
                    <SelectItem value="mixed">Campur</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Ukuran kamar">
              <Input
                value={draft.sizeLabel ?? ""}
                maxLength={80}
                disabled={pending}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sizeLabel: event.target.value }))
                }
                placeholder="Mis. 3 × 4 m"
              />
            </Field>
            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200">
              <Switch
                checked={draft.publicVisible ?? true}
                disabled={pending}
                onCheckedChange={(publicVisible) =>
                  setDraft((current) => ({ ...current, publicVisible }))
                }
              />
              Tampilkan kamar ini pada katalog publik
            </label>
          </section>
          <section className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-4 text-sm text-blue-100">
            <p className="font-semibold">Komersial dari tipe kost</p>
            {selectedType ? (
              <p className="mt-1">
                {formatIDR(selectedType.monthlyPrice)}/bulan · deposit{" "}
                {formatIDR(selectedType.depositAmount)} ·
                {` ${selectedType.facilityCount ?? selectedType.facilities?.length ?? 0} fasilitas`}
              </p>
            ) : (
              <p className="mt-1 text-blue-200">
                Pilih bangunan dan tipe kost untuk melihat nilai yang diwariskan.
              </p>
            )}
            <p className="mt-2 text-xs text-blue-200">
              Harga, deposit, dan assignment fasilitas tidak dapat diedit di form kamar.
            </p>
          </section>
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
              {room ? "Simpan Inventori" : "Tambah Kamar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function RoomDetailSheet({
  room,
  open,
  onOpenChange,
  onEdit,
}: {
  room: RoomInventory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (room: RoomInventory) => void;
}) {
  if (!room) return null;
  const residentName = room.activeLease?.residentName ?? room.activeOccupancy?.residentName;
  const facilities = room.kostType.facilities ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-slate-800 bg-slate-900 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-slate-100">
            <BedDouble className="h-5 w-5 text-blue-300" /> {roomLabel(room)}
          </SheetTitle>
          <SheetDescription>Detail inventori dan sumber komersial kamar.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 py-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">Inventori fisik</h3>
            <DetailGrid
              items={[
                [
                  "Bangunan",
                  room.buildingName || room.buildingCode || room.unitCode || "Belum bernama",
                ],
                ["Lantai", room.floorLabel || room.floor || room.floorCode || "—"],
                ["Ukuran", room.sizeLabel || "—"],
                [
                  "Kebijakan gender",
                  room.genderPolicy === "male"
                    ? "Putra"
                    : room.genderPolicy === "female"
                      ? "Putri"
                      : "Campur",
                ],
              ]}
            />
          </section>
          <section className="space-y-3 border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-100">Status dan penghuni</h3>
            <div className="flex flex-wrap gap-2">
              <RoomStatusBadge status={room.status} />
            </div>
            {residentName ? (
              <p className="text-sm text-slate-300">
                <span className="text-slate-500">Penghuni aktif:</span> {residentName}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Tidak ada penghuni aktif yang ditampilkan.</p>
            )}
            {room.status === "occupied" || room.status === "reserved" ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                Status terisi dan dipesan dikelola melalui lifecycle Penyewaan, bukan dari inventori
                kamar.
              </p>
            ) : null}
          </section>
          <section className="space-y-3 border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Dari tipe kost: {room.kostType.name}
            </h3>
            <DetailGrid
              items={[
                ["Harga bulanan", formatIDR(room.kostType.monthlyPrice)],
                ["Harga tahunan", formatIDR(room.kostType.yearlyPrice)],
                ["Deposit", formatIDR(room.kostType.depositAmount)],
              ]}
            />
            <div>
              <p className="mb-2 text-xs text-slate-500">Fasilitas tipe kost</p>
              {facilities.length ? (
                <div className="flex flex-wrap gap-2">
                  {facilities.map((facility) => (
                    <Badge
                      key={facility.id}
                      variant="outline"
                      className="border-slate-700 bg-slate-800 text-slate-200"
                    >
                      {facility.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Belum ada fasilitas yang di-assign ke tipe ini.
                </p>
              )}
            </div>
          </section>
        </div>
        <SheetFooter className="border-t border-slate-800 pt-4">
          {onEdit ? (
            <Button
              variant="outline"
              onClick={() => {
                onEdit(room);
                onOpenChange(false);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit inventori
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DetailGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
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
