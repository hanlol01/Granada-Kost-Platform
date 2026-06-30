import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { RoomFormDialog } from "@/components/forms/RoomFormDialog";
import { useRooms, type RoomRecord, type RoomStatus } from "@/hooks/useRooms";
import { useUpdateRoomStatus } from "@/hooks/useRoomMutations";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { Plus, Search, Pencil, BedDouble, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rooms")({ component: RoomsPage });

const STATUS_LABEL: Record<RoomStatus, { label: string; cls: string }> = {
  occupied: { label: "Terisi", cls: "bg-primary-soft text-primary" },
  vacant: { label: "Kosong", cls: "bg-success/15 text-success" },
  reserved: { label: "Dipesan", cls: "bg-chart-4/15 text-chart-4" },
  maintenance: { label: "Maintenance", cls: "bg-warning/20 text-warning-foreground" },
  inactive: { label: "Tidak Aktif", cls: "bg-muted text-muted-foreground" },
};

const STATUS_OPTIONS: RoomStatus[] = ["vacant", "reserved", "occupied", "maintenance", "inactive"];

function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const item = STATUS_LABEL[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
        item.cls,
      )}
    >
      {item.label}
    </span>
  );
}

function RoomsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RoomStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomRecord | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ room: RoomRecord; next: RoomStatus } | null>(
    null,
  );

  const { hasPermission } = useAuth();
  const canManage = hasPermission("room.manage");

  const { data, isLoading, error, refetch, isFetching } = useRooms({
    status: status === "all" ? undefined : status,
  });
  const statusMut = useUpdateRoomStatus();

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q) return data;
    const needle = q.toLowerCase();
    return data.filter(
      (r) =>
        r.number.toLowerCase().includes(needle) ||
        (r.unitCode?.toLowerCase().includes(needle) ?? false) ||
        (r.floor?.toLowerCase().includes(needle) ?? false),
    );
  }, [data, q]);

  const hasFilter = q !== "" || status !== "all";

  return (
    <AppShell
      title="Manajemen Kamar"
      subtitle={data ? `${data.length} kamar terdaftar` : "Memuat..."}
      actions={
        canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Kamar
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor, unit, atau lantai..."
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | RoomStatus)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="occupied">Terisi</SelectItem>
            <SelectItem value="vacant">Kosong</SelectItem>
            <SelectItem value="reserved">Dipesan</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Tidak Aktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat kamar" />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<BedDouble className="h-5 w-5" />}
              title={hasFilter ? "Tidak ada kamar cocok" : "Belum ada kamar"}
              description={
                hasFilter
                  ? "Coba ubah pencarian atau filter status."
                  : canManage
                    ? "Klik 'Tambah Kamar' untuk membuat data pertama."
                    : "Anda tidak memiliki izin untuk menambah kamar."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
            isFetching && "opacity-90 transition-opacity",
          )}
        >
          {filtered.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-all hover:-translate-y-0.5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Kamar</p>
                    <p className="text-2xl font-bold tracking-tight">{r.number}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.unitCode ?? "–"}
                      {r.floor ? ` · Lt. ${r.floor}` : ""}
                    </p>
                  </div>
                  <RoomStatusBadge status={r.roomStatus} />
                </div>
                <p className="text-lg font-semibold text-primary">
                  {formatIDR(r.monthlyPrice)}
                  <span className="text-xs text-muted-foreground font-normal">/bulan</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-3 mb-4 min-h-[2rem]">
                  {r.facilities.slice(0, 4).map((f) => (
                    <span
                      key={f.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {f.name}
                    </span>
                  ))}
                  {r.facilities.length > 4 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      +{r.facilities.length - 4}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-3 border-t border-border">
                  {canManage ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditTarget(r)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" aria-label="Ubah status">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Ubah Status
                          </div>
                          <DropdownMenuSeparator />
                          {STATUS_OPTIONS.filter((s) => s !== r.roomStatus).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => setStatusTarget({ room: r, next: s })}
                            >
                              {STATUS_LABEL[s].label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Hanya owner/manager/admin dengan permission room.manage.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create + edit form. The same dialog handles both modes. */}
      <RoomFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RoomFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget}
      />

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title="Ubah status kamar"
        description={
          statusTarget
            ? `Ubah status kamar ${statusTarget.room.number} menjadi ${STATUS_LABEL[statusTarget.next].label}?`
            : null
        }
        confirmLabel="Ubah Status"
        destructive={statusTarget?.next === "inactive"}
        pending={statusMut.isPending}
        onConfirm={async () => {
          if (!statusTarget) return;
          try {
            await statusMut.mutateAsync({
              roomId: statusTarget.room.id,
              status: statusTarget.next,
            });
            setStatusTarget(null);
          } catch {
            // Already toasted; let user retry from the dialog.
          }
        }}
      />
    </AppShell>
  );
}
