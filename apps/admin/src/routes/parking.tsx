import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import {
  useParkingZones,
  useParkingSlots,
  type ParkingSlotStatus,
  type ParkingZoneRecord,
} from "@/hooks/useParking";
import { ParkingSquare, Bike, Car, CircleDot } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parking")({ component: ParkingPage });

const ZONE_TYPE_ICON: Record<ParkingZoneRecord["zoneType"], LucideIcon> = {
  motorcycle: Bike,
  car: Car,
  mixed: CircleDot,
};

const SLOT_STATUS_LABEL: Record<ParkingSlotStatus, { label: string; cls: string }> = {
  available: { label: "Tersedia", cls: "bg-success/15 text-success" },
  occupied: { label: "Terisi", cls: "bg-primary-soft text-primary" },
  reserved: { label: "Reserved", cls: "bg-chart-4/15 text-chart-4" },
  maintenance: { label: "Maintenance", cls: "bg-warning/20 text-warning-foreground" },
};

function ParkingPage() {
  const zonesQuery = useParkingZones(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Auto-select first zone when list resolves.
  useEffect(() => {
    if (!selectedZoneId && zonesQuery.data && zonesQuery.data.length > 0) {
      setSelectedZoneId(zonesQuery.data[0].id);
    }
  }, [zonesQuery.data, selectedZoneId]);

  const slotsQuery = useParkingSlots(selectedZoneId);

  const selectedZone = useMemo(
    () => zonesQuery.data?.find((z) => z.id === selectedZoneId) ?? null,
    [zonesQuery.data, selectedZoneId],
  );

  return (
    <AppShell title="Parkir" subtitle="Kelola zona dan slot parkir">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zona Parkir</CardTitle>
          </CardHeader>
          <CardContent>
            {zonesQuery.error ? (
              <ErrorState
                error={zonesQuery.error}
                onRetry={() => zonesQuery.refetch()}
                title="Gagal memuat zona"
              />
            ) : zonesQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (zonesQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<ParkingSquare className="h-5 w-5" />}
                title="Belum ada zona"
                description="Zona parkir akan tampil setelah dibuat (M11E)."
              />
            ) : (
              <div className="space-y-1">
                {(zonesQuery.data ?? []).map((z) => {
                  const Icon = ZONE_TYPE_ICON[z.zoneType] ?? CircleDot;
                  const active = z.id === selectedZoneId;
                  return (
                    <button
                      key={z.id}
                      onClick={() => setSelectedZoneId(z.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="font-medium truncate">{z.zoneName}</p>
                        <p
                          className={cn(
                            "text-[11px] truncate",
                            active ? "opacity-90" : "text-muted-foreground",
                          )}
                        >
                          {z.zoneCode} · {z.capacity} slot
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {selectedZone ? selectedZone.zoneName : "Detail Zona"}
              </CardTitle>
              {selectedZone ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedZone.locationDescription ?? "Tanpa keterangan lokasi"}
                </p>
              ) : null}
            </div>
            {selectedZone ? (
              <CapacityPill
                capacity={selectedZone.capacity}
                slots={(slotsQuery.data ?? []).map((s) => s.slotStatus)}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {!selectedZone ? (
              <EmptyState
                title="Pilih zona"
                description="Detail slot akan tampil di sini setelah zona dipilih."
              />
            ) : slotsQuery.error ? (
              <ErrorState
                error={slotsQuery.error}
                onRetry={() => slotsQuery.refetch()}
                title="Gagal memuat slot"
              />
            ) : slotsQuery.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (slotsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<ParkingSquare className="h-5 w-5" />}
                title="Belum ada slot"
                description="Slot parkir untuk zona ini belum ditambahkan (M11E)."
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {(slotsQuery.data ?? []).map((s) => {
                  const meta = SLOT_STATUS_LABEL[s.slotStatus];
                  return (
                    <div
                      key={s.id}
                      className="rounded-lg border border-border p-3 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{s.slotNumber}</p>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {s.slotType}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function CapacityPill({
  capacity,
  slots,
}: {
  capacity: number;
  slots: ParkingSlotStatus[];
}) {
  const occupied = slots.filter((s) => s === "occupied" || s === "reserved").length;
  const utilization = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">Utilisasi</p>
      <p className="text-lg font-semibold tracking-tight">{utilization}%</p>
      <p className="text-[11px] text-muted-foreground">
        {occupied} / {capacity} slot
      </p>
    </div>
  );
}
