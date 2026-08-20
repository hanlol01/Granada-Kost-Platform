import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { useVehicleHistory, type VehicleRecord } from "@/hooks/useVehicles";
import { format } from "date-fns";

export function VehicleHistoryDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: VehicleRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const history = useVehicleHistory(open ? (vehicle?.id ?? null) : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Riwayat kendaraan{vehicle ? ` · ${vehicle.plateNumber}` : ""}</DialogTitle>
        </DialogHeader>
        {history.error ? (
          <ErrorState
            error={history.error}
            onRetry={() => history.refetch()}
            title="Gagal memuat riwayat"
          />
        ) : history.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-14 w-full" />
            ))}
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState
            title="Belum ada riwayat"
            description="Perubahan status kendaraan akan tercatat di sini."
          />
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {(history.data ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">
                    {item.fromStatus ? `${item.fromStatus} → ` : ""}
                    {item.toStatus}
                  </p>
                  <time className="text-xs text-muted-foreground">
                    {format(new Date(item.changedAt), "dd MMM yyyy HH:mm")}
                  </time>
                </div>
                {item.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
