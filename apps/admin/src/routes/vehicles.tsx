import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { Input } from "@/components/ui/input";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { CreateVehicleDialog } from "@/components/forms/CreateVehicleDialog";
import { VehicleHistoryDialog } from "@/components/forms/VehicleHistoryDialog";
import {
  useVehicles,
  type VehicleRecord,
  type VehicleStatus,
  type VehicleType,
} from "@/hooks/useVehicles";
import {
  useApproveVehicle,
  useDeactivateVehicle,
  useReactivateVehicle,
  useRejectVehicle,
  useSuspendVehicle,
} from "@/hooks/useVehicleMutations";
import { useAuth } from "@/lib/auth";
import {
  Search,
  Plus,
  Bike,
  Car,
  Zap,
  CircleDot,
  MoreHorizontal,
  Check,
  Ban,
  Pause,
  Play,
  PowerOff,
  History,
  UserRound,
  BedDouble,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParkingPage } from "./parking";
import {
  canonicalSearchReplacement,
  normalizeVehiclesSearch,
  resolveVehicleWorkspaceTab,
  vehiclesSearchString,
  type VehiclesRouteSearch,
} from "@/lib/kmo-w00-route-integrity";
import { ForbiddenState, LoadingState } from "@/components/state";

export const Route = createFileRoute("/vehicles")({
  validateSearch: normalizeVehiclesSearch,
  component: VehiclesRoute,
});

function VehicleWorkspaceTabs({
  value,
  onChange,
  canReadVehicles,
  canReadParking,
}: {
  value: VehiclesRouteSearch["tab"];
  onChange: (tab: VehiclesRouteSearch["tab"]) => void;
  canReadVehicles: boolean;
  canReadParking: boolean;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next === "parking" ? "parking" : "vehicles")}
      className="mb-4"
    >
      <TabsList aria-label="Bagian kendaraan dan parkir">
        {canReadVehicles ? <TabsTrigger value="vehicles">Kendaraan</TabsTrigger> : null}
        {canReadParking ? <TabsTrigger value="parking">Parkir</TabsTrigger> : null}
      </TabsList>
    </Tabs>
  );
}

function VehiclesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { hasPermission } = useAuth();
  const canReadVehicles = hasPermission("vehicle.manage");
  const canReadParking = hasPermission("parking.manage");
  const activeTab = resolveVehicleWorkspaceTab(search.tab, {
    canReadVehicles,
    canReadParking,
  });
  const canonicalSearch = activeTab ? vehiclesSearchString({ tab: activeTab }) : null;
  const needsCanonicalSearch =
    typeof window !== "undefined" &&
    canonicalSearch !== null &&
    canonicalSearchReplacement(window.location.search, canonicalSearch) !== null;

  useEffect(() => {
    if (activeTab === null || canonicalSearch === null || !needsCanonicalSearch) return;
    void navigate({ search: { tab: activeTab }, replace: true });
  }, [activeTab, canonicalSearch, navigate, needsCanonicalSearch]);

  if (activeTab === null) {
    return (
      <AppShell title="Kendaraan & Parkir" subtitle="Akses dibatasi">
        <ForbiddenState description="Akun Anda tidak memiliki izin kendaraan atau parkir." />
      </AppShell>
    );
  }

  if (needsCanonicalSearch) {
    return (
      <AppShell title="Kendaraan & Parkir" subtitle="Menyiapkan tampilan">
        <LoadingState label="Menyiapkan tab..." />
      </AppShell>
    );
  }

  const workspaceNavigation = (
    <VehicleWorkspaceTabs
      value={activeTab}
      onChange={(tab) => void navigate({ search: { tab }, replace: true })}
      canReadVehicles={canReadVehicles}
      canReadParking={canReadParking}
    />
  );

  return activeTab === "parking" ? (
    <ParkingPage workspaceNavigation={workspaceNavigation} />
  ) : (
    <VehiclesPage workspaceNavigation={workspaceNavigation} />
  );
}

const STATUS_LABEL: Record<VehicleStatus, { label: string; cls: string }> = {
  pending_approval: { label: "Menunggu Approval", cls: "bg-warning/20 text-warning-foreground" },
  active: { label: "Aktif", cls: "bg-success/15 text-success" },
  rejected: { label: "Ditolak", cls: "bg-destructive/15 text-destructive" },
  suspended: { label: "Suspended", cls: "bg-warning/20 text-warning-foreground" },
  transfer_pending: { label: "Transfer", cls: "bg-chart-4/15 text-chart-4" },
  inactive: { label: "Tidak Aktif", cls: "bg-muted text-muted-foreground" },
};

const TYPE_ICON: Record<VehicleType, LucideIcon> = {
  motorcycle: Bike,
  car: Car,
  bicycle: Bike,
  electric_scooter: Zap,
  other: CircleDot,
};

type TransitionKind = "approve" | "reject" | "suspend" | "reactivate" | "deactivate";
type VehicleTypeFilter = "all" | VehicleType | `custom:${string}`;

const vehicleTypeLabel = (vehicle: VehicleRecord): string =>
  vehicle.customVehicleType ||
  {
    motorcycle: "Motor",
    car: "Mobil",
    bicycle: "Sepeda",
    electric_scooter: "Skuter listrik",
    other: "Lainnya",
  }[vehicle.vehicleType];

const vehicleIdentity = (vehicle: VehicleRecord): string =>
  [vehicle.brand, vehicle.plateNumber].filter(Boolean).join(" · ") || vehicle.vehicleCode;

function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const meta = STATUS_LABEL[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function availableActions(status: VehicleStatus): TransitionKind[] {
  switch (status) {
    case "pending_approval":
      return ["approve", "reject"];
    case "active":
      return ["suspend", "deactivate"];
    case "suspended":
      return ["reactivate", "deactivate"];
    case "transfer_pending":
      return ["approve", "reject"];
    default:
      return [];
  }
}

function VehiclesPage({ workspaceNavigation }: { workspaceNavigation: ReactNode }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | VehicleStatus>("all");
  const [type, setType] = useState<VehicleTypeFilter>("all");
  const [building, setBuilding] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{ vehicle: VehicleRecord; kind: TransitionKind } | null>(
    null,
  );
  const [historyTarget, setHistoryTarget] = useState<VehicleRecord | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission("vehicle.manage");

  const { data, isLoading, error, refetch, isFetching } = useVehicles({
    status: status === "all" ? undefined : status,
    vehicleType:
      type === "all" ? undefined : type.startsWith("custom:") ? "other" : (type as VehicleType),
    limit: 100,
  });

  const approveMut = useApproveVehicle();
  const rejectMut = useRejectVehicle();
  const suspendMut = useSuspendVehicle();
  const reactivateMut = useReactivateVehicle();
  const deactivateMut = useDeactivateVehicle();

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.toLowerCase();
    return data.filter((vehicle) => {
      const matchesSearch =
        !needle ||
        (vehicle.plateNumber?.toLowerCase().includes(needle) ?? false) ||
        vehicle.vehicleCode.toLowerCase().includes(needle) ||
        vehicle.snapshotResidentName.toLowerCase().includes(needle) ||
        vehicleTypeLabel(vehicle).toLowerCase().includes(needle) ||
        (vehicle.currentRoomNumber?.toLowerCase().includes(needle) ?? false) ||
        (vehicle.currentBuildingName?.toLowerCase().includes(needle) ?? false) ||
        (vehicle.currentBuildingCode?.toLowerCase().includes(needle) ?? false);
      const matchesBuilding = building === "all" || vehicle.currentBuildingCode === building;
      const matchesCustomType =
        !type.startsWith("custom:") || vehicle.customVehicleType === type.slice("custom:".length);
      return matchesSearch && matchesBuilding && matchesCustomType;
    });
  }, [building, data, q, type]);

  const buildings = useMemo(() => {
    const options = new Map<string, string>();
    for (const vehicle of data ?? []) {
      if (vehicle.currentBuildingCode) {
        options.set(
          vehicle.currentBuildingCode,
          vehicle.currentBuildingName || vehicle.currentBuildingCode,
        );
      }
    }
    return [...options].sort((left, right) => left[1].localeCompare(right[1], "id-ID"));
  }, [data]);

  const customTypes = useMemo(
    () =>
      [...new Set((data ?? []).map((vehicle) => vehicle.customVehicleType).filter(Boolean))].sort(
        (left, right) => left!.localeCompare(right!, "id-ID"),
      ) as string[],
    [data],
  );

  const hasFilter = q !== "" || status !== "all" || type !== "all" || building !== "all";
  const activeFilterCount =
    Number(Boolean(q.trim())) +
    Number(status !== "all") +
    Number(type !== "all") +
    Number(building !== "all");
  const filterSignature = `${q}:${status}:${type}:${building}`;
  const filterCriteria = [
    q.trim() ? `pencarian "${q.trim()}"` : "",
    status !== "all"
      ? `status kendaraan: ${
          {
            pending_approval: "Menunggu approval",
            active: "Aktif",
            suspended: "Suspended",
            rejected: "Ditolak",
            transfer_pending: "Transfer",
            inactive: "Tidak aktif",
          }[status]
        }`
      : "",
    type !== "all"
      ? `jenis kendaraan: ${
          type.startsWith("custom:")
            ? type.slice("custom:".length)
            : {
                motorcycle: "Motor",
                car: "Mobil",
                bicycle: "Sepeda",
                electric_scooter: "Skuter listrik",
                other: "Lainnya",
              }[type as VehicleType]
        }`
      : "",
    building !== "all"
      ? `bangunan: ${buildings.find(([code]) => code === building)?.[1] ?? building}`
      : "",
  ].filter(Boolean);
  const pendingApprovalCount =
    data?.filter((vehicle) => vehicle.vehicleStatus === "pending_approval").length ?? 0;
  const mutationPending =
    approveMut.isPending ||
    rejectMut.isPending ||
    suspendMut.isPending ||
    reactivateMut.isPending ||
    deactivateMut.isPending;

  const transitionMeta = (kind: TransitionKind) => {
    switch (kind) {
      case "approve":
        return {
          title: "Setujui kendaraan",
          confirm: "Setujui",
          destructive: false,
          requiresReason: false,
        };
      case "reject":
        return {
          title: "Tolak kendaraan",
          confirm: "Tolak",
          destructive: true,
          requiresReason: true,
        };
      case "suspend":
        return {
          title: "Suspend kendaraan",
          confirm: "Suspend",
          destructive: true,
          requiresReason: true,
        };
      case "reactivate":
        return {
          title: "Aktifkan kembali",
          confirm: "Aktifkan",
          destructive: false,
          requiresReason: false,
        };
      case "deactivate":
        return {
          title: "Nonaktifkan kendaraan",
          confirm: "Nonaktifkan",
          destructive: true,
          requiresReason: true,
        };
    }
  };

  const runTransition = async (vehicle: VehicleRecord, kind: TransitionKind, reason?: string) => {
    try {
      if (kind === "approve") await approveMut.mutateAsync({ vehicleId: vehicle.id });
      else if (kind === "reject")
        await rejectMut.mutateAsync({ vehicleId: vehicle.id, reason: reason! });
      else if (kind === "suspend")
        await suspendMut.mutateAsync({ vehicleId: vehicle.id, reason: reason! });
      else if (kind === "reactivate") await reactivateMut.mutateAsync({ vehicleId: vehicle.id });
      else if (kind === "deactivate")
        await deactivateMut.mutateAsync({ vehicleId: vehicle.id, reason: reason! });
      setPending(null);
    } catch {
      // Already toasted by hook.
    }
  };

  return (
    <AppShell
      title="Kendaraan"
      subtitle={data ? `${data.length} kendaraan terdaftar` : "Memuat..."}
      actions={
        <Button onClick={() => setCreateOpen(true)} disabled={!canManage}>
          <Plus className="h-4 w-4 mr-1" /> Daftar Kendaraan
        </Button>
      }
    >
      {workspaceNavigation}
      <NoticeAlert
        className="mb-4"
        tone={pendingApprovalCount > 0 ? "warning" : "info"}
        title={
          pendingApprovalCount > 0
            ? `${pendingApprovalCount} kendaraan menunggu persetujuan`
            : "Perhatikan status kendaraan"
        }
        description={
          pendingApprovalCount > 0
            ? "Periksa data kendaraan dan penghuni sebelum menyetujui atau menolak pendaftaran."
            : "Status kendaraan berubah melalui proses persetujuan, penolakan, suspend, atau aktivasi kembali."
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_13rem_13rem_15rem_auto]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari plat, kode, penghuni, kamar, atau bangunan..."
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | VehicleStatus)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="pending_approval">Menunggu Approval</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
            <SelectItem value="transfer_pending">Transfer</SelectItem>
            <SelectItem value="inactive">Tidak Aktif</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as VehicleTypeFilter)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="motorcycle">Motor</SelectItem>
            <SelectItem value="car">Mobil</SelectItem>
            <SelectItem value="bicycle">Sepeda</SelectItem>
            <SelectItem value="electric_scooter">Skuter Listrik</SelectItem>
            <SelectItem value="other">Lainnya</SelectItem>
            {customTypes.map((customType) => (
              <SelectItem key={customType} value={`custom:${customType}`}>
                {customType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={building} onValueChange={setBuilding}>
          <SelectTrigger>
            <SelectValue placeholder="Semua bangunan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Bangunan</SelectItem>
            {buildings.map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setQ("");
            setStatus("all");
            setType("all");
            setBuilding("all");
          }}
          disabled={!hasFilter}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> Reset filter
        </Button>
      </div>

      {!isLoading && !isFetching && !error ? (
        <FilterResultNotice
          key={filterSignature}
          entityLabel="kendaraan"
          resultCount={filtered.length}
          activeFilterCount={activeFilterCount}
          searchTerm={q}
          criteria={filterCriteria}
        />
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat kendaraan" />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Bike className="h-5 w-5" />}
              title={hasFilter ? "Tidak ada kendaraan cocok" : "Belum ada kendaraan terdaftar"}
              description={
                hasFilter
                  ? "Ubah pencarian atau filter status/jenis."
                  : "Daftar kendaraan akan tampil setelah penghuni mendaftarkannya."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className={cn(isFetching && "opacity-90 transition-opacity")}>
          <CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Kendaraan</th>
                    <th className="px-5 py-3 font-medium">Penghuni</th>
                    <th className="px-5 py-3 font-medium">Plat</th>
                    <th className="px-5 py-3 font-medium">Jenis</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    {canManage ? <th className="px-5 py-3 font-medium text-right">Aksi</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const Icon = TYPE_ICON[v.vehicleType] ?? CircleDot;
                    const actions = availableActions(v.vehicleStatus);
                    return (
                      <tr
                        key={v.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {v.brand} {v.color ? `· ${v.color}` : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">{v.vehicleCode}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium">
                            <Link
                              to="/tenants/$residentId"
                              params={{ residentId: v.residentId }}
                              className="hover:text-primary hover:underline"
                            >
                              {v.snapshotResidentName}
                            </Link>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {v.currentRoomNumber ? (
                              <Link
                                to="/rooms/$roomNumber"
                                params={{ roomNumber: v.currentRoomNumber }}
                                className="hover:text-primary hover:underline"
                              >
                                Kamar {v.currentRoomNumber}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </p>
                          <p className="hidden">
                            {v.currentRoomNumber ? `Kamar ${v.currentRoomNumber}` : "–"}
                          </p>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{v.plateNumber || "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground capitalize">
                          {vehicleTypeLabel(v)}
                        </td>
                        <td className="px-5 py-3">
                          <VehicleStatusBadge status={v.vehicleStatus} />
                        </td>
                        {canManage ? (
                          <td className="px-5 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" aria-label="Aksi kendaraan">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link
                                    to="/tenants/$residentId"
                                    params={{ residentId: v.residentId }}
                                  >
                                    <UserRound className="mr-2 h-3.5 w-3.5" /> Lihat penghuni
                                  </Link>
                                </DropdownMenuItem>
                                {v.currentRoomNumber ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to="/rooms/$roomNumber"
                                      params={{ roomNumber: v.currentRoomNumber }}
                                    >
                                      <BedDouble className="mr-2 h-3.5 w-3.5" /> Lihat kamar
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                {actions.map((kind, idx) => (
                                  <div key={kind}>
                                    {idx > 0 ? <DropdownMenuSeparator /> : null}
                                    <DropdownMenuItem
                                      className={
                                        kind === "deactivate" || kind === "reject"
                                          ? "text-destructive"
                                          : undefined
                                      }
                                      onClick={() => setPending({ vehicle: v, kind })}
                                    >
                                      {kind === "approve" ? (
                                        <>
                                          <Check className="h-3.5 w-3.5 mr-2" /> Setujui
                                        </>
                                      ) : kind === "reject" ? (
                                        <>
                                          <Ban className="h-3.5 w-3.5 mr-2" /> Tolak
                                        </>
                                      ) : kind === "suspend" ? (
                                        <>
                                          <Pause className="h-3.5 w-3.5 mr-2" /> Suspend
                                        </>
                                      ) : kind === "reactivate" ? (
                                        <>
                                          <Play className="h-3.5 w-3.5 mr-2" /> Aktifkan
                                        </>
                                      ) : (
                                        <>
                                          <PowerOff className="h-3.5 w-3.5 mr-2" /> Nonaktifkan
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </div>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setHistoryTarget(v)}>
                                  <History className="h-3.5 w-3.5 mr-2" /> Lihat riwayat
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-border">
              {filtered.map((v) => {
                const Icon = TYPE_ICON[v.vehicleType] ?? CircleDot;
                const actions = availableActions(v.vehicleStatus);
                return (
                  <div key={v.id} className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{vehicleIdentity(v)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        <Link
                          to="/tenants/$residentId"
                          params={{ residentId: v.residentId }}
                          className="hover:text-primary hover:underline"
                        >
                          {v.snapshotResidentName}
                        </Link>
                        {v.currentRoomNumber ? (
                          <>
                            {" · "}
                            <Link
                              to="/rooms/$roomNumber"
                              params={{ roomNumber: v.currentRoomNumber }}
                              className="hover:text-primary hover:underline"
                            >
                              Kamar {v.currentRoomNumber}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <VehicleStatusBadge status={v.vehicleStatus} />
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label="Aksi kendaraan">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/tenants/$residentId" params={{ residentId: v.residentId }}>
                              <UserRound className="mr-2 h-3.5 w-3.5" /> Lihat penghuni
                            </Link>
                          </DropdownMenuItem>
                          {v.currentRoomNumber ? (
                            <DropdownMenuItem asChild>
                              <Link
                                to="/rooms/$roomNumber"
                                params={{ roomNumber: v.currentRoomNumber }}
                              >
                                <BedDouble className="mr-2 h-3.5 w-3.5" /> Lihat kamar
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          {actions.map((kind) => (
                            <DropdownMenuItem
                              key={kind}
                              className={
                                kind === "deactivate" || kind === "reject"
                                  ? "text-destructive"
                                  : undefined
                              }
                              onClick={() => setPending({ vehicle: v, kind })}
                            >
                              {kind === "approve"
                                ? "Setujui"
                                : kind === "reject"
                                  ? "Tolak"
                                  : kind === "suspend"
                                    ? "Suspend"
                                    : kind === "reactivate"
                                      ? "Aktifkan"
                                      : "Nonaktifkan"}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setHistoryTarget(v)}>
                            <History className="h-3.5 w-3.5 mr-2" /> Lihat riwayat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? transitionMeta(pending.kind).title : ""}
        description={
          pending ? `${vehicleIdentity(pending.vehicle)} (${pending.vehicle.vehicleCode})` : null
        }
        confirmLabel={pending ? transitionMeta(pending.kind).confirm : "Konfirmasi"}
        destructive={pending ? transitionMeta(pending.kind).destructive : false}
        reason={
          pending && transitionMeta(pending.kind).requiresReason
            ? { label: "Alasan", minLength: 3 }
            : undefined
        }
        pending={mutationPending}
        onConfirm={async (reason) => {
          if (!pending) return;
          if (transitionMeta(pending.kind).requiresReason && !reason) return;
          await runTransition(pending.vehicle, pending.kind, reason);
        }}
      />

      <CreateVehicleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VehicleHistoryDialog
        vehicle={historyTarget}
        open={historyTarget !== null}
        onOpenChange={(open) => !open && setHistoryTarget(null)}
      />
    </AppShell>
  );
}
