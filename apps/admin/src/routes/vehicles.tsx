import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useVehicles,
  type VehicleStatus,
  type VehicleType,
} from "@/hooks/useVehicles";
import { Search, Plus, Bike, Car, Zap, CircleDot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vehicles")({ component: VehiclesPage });

const STATUS_LABEL: Record<VehicleStatus, { label: string; cls: string }> = {
  pending_approval: {
    label: "Menunggu Approval",
    cls: "bg-warning/20 text-warning-foreground",
  },
  active: { label: "Aktif", cls: "bg-success/15 text-success" },
  rejected: { label: "Ditolak", cls: "bg-destructive/15 text-destructive" },
  suspended: { label: "Suspended", cls: "bg-warning/20 text-warning-foreground" },
  transfer_pending: {
    label: "Transfer",
    cls: "bg-chart-4/15 text-chart-4",
  },
  inactive: { label: "Tidak Aktif", cls: "bg-muted text-muted-foreground" },
};

const TYPE_ICON: Record<VehicleType, LucideIcon> = {
  motorcycle: Bike,
  car: Car,
  bicycle: Bike,
  electric_scooter: Zap,
  other: CircleDot,
};

function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const meta = STATUS_LABEL[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
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

function VehiclesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | VehicleStatus>("all");
  const [type, setType] = useState<"all" | VehicleType>("all");

  const { data, isLoading, error, refetch, isFetching } = useVehicles({
    status: status === "all" ? undefined : status,
    vehicleType: type === "all" ? undefined : type,
    limit: 100,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q) return data;
    const needle = q.toLowerCase();
    return data.filter(
      (v) =>
        v.plateNumber.toLowerCase().includes(needle) ||
        v.vehicleCode.toLowerCase().includes(needle) ||
        v.snapshotResidentName.toLowerCase().includes(needle) ||
        (v.snapshotRoomNumber?.toLowerCase().includes(needle) ?? false),
    );
  }, [data, q]);

  const hasFilter = q !== "" || status !== "all" || type !== "all";

  return (
    <AppShell
      title="Kendaraan"
      subtitle={data ? `${data.length} kendaraan terdaftar` : "Memuat..."}
      actions={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled>
                  <Plus className="h-4 w-4 mr-1" /> Daftar Kendaraan
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Pendaftaran kendaraan tersedia di M11E.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari plat, kode, penghuni, atau kamar..."
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
        <Select value={type} onValueChange={(v) => setType(v as "all" | VehicleType)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="motorcycle">Motor</SelectItem>
            <SelectItem value="car">Mobil</SelectItem>
            <SelectItem value="bicycle">Sepeda</SelectItem>
            <SelectItem value="electric_scooter">Skuter Listrik</SelectItem>
            <SelectItem value="other">Lainnya</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const Icon = TYPE_ICON[v.vehicleType] ?? CircleDot;
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
                              <p className="text-xs text-muted-foreground">
                                {v.vehicleCode}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium">{v.snapshotResidentName}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.snapshotRoomNumber
                              ? `Kamar ${v.snapshotRoomNumber}`
                              : "–"}
                          </p>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{v.plateNumber}</td>
                        <td className="px-5 py-3 text-muted-foreground capitalize">
                          {v.vehicleType.replace("_", " ")}
                        </td>
                        <td className="px-5 py-3">
                          <VehicleStatusBadge status={v.vehicleStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-border">
              {filtered.map((v) => {
                const Icon = TYPE_ICON[v.vehicleType] ?? CircleDot;
                return (
                  <div key={v.id} className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {v.brand} · <span className="font-mono text-xs">{v.plateNumber}</span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.snapshotResidentName}
                        {v.snapshotRoomNumber ? ` · Kamar ${v.snapshotRoomNumber}` : ""}
                      </p>
                    </div>
                    <VehicleStatusBadge status={v.vehicleStatus} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
