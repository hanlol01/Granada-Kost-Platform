// Dialog used by routes/parking.tsx to pick a vehicle for an empty slot.
// The vehicle picker is fed by useVehicles({status:'active'}) and filtered
// to slot.slotType so the backend never receives a mismatch (the backend
// rejects with PARKING_SLOT_TYPE_MISMATCH otherwise).

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVehicles, type VehicleType } from "@/hooks/useVehicles";
import { useAssignParkingSlot } from "@/hooks/useParkingMutations";
import type { ParkingSlotRecord } from "@/hooks/useParking";

export type AssignSlotDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: ParkingSlotRecord | null;
};

// Map slot-type vocabulary onto vehicle-type vocabulary. The backend Vehicle
// enum has more values; we lift those that match the slot type so e.g.
// electric_scooter parks under a motorcycle slot.
function allowedVehicleTypes(slotType: ParkingSlotRecord["slotType"]): VehicleType[] {
  if (slotType === "car") return ["car"];
  return ["motorcycle", "bicycle", "electric_scooter"];
}

export function AssignSlotDialog({ open, onOpenChange, slot }: AssignSlotDialogProps) {
  const assign = useAssignParkingSlot();
  const vehicles = useVehicles({ status: "active", limit: 100 });
  const [vehicleId, setVehicleId] = useState<string>("");

  useEffect(() => {
    if (open) setVehicleId("");
  }, [open]);

  const list = useMemo(() => {
    if (!slot) return [];
    const allow = new Set(allowedVehicleTypes(slot.slotType));
    return (vehicles.data ?? []).filter((v) => allow.has(v.vehicleType));
  }, [vehicles.data, slot]);

  const pending = assign.isPending;
  const canSubmit = Boolean(slot) && Boolean(vehicleId);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot || !canSubmit) return;
    try {
      await assign.mutateAsync({ slotId: slot.id, vehicleId });
      onOpenChange(false);
    } catch {
      // Already toasted by hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Slot Parkir</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit} noValidate>
          <div className="space-y-1">
            <Label className="text-xs">Slot</Label>
            <p className="text-sm font-medium">
              {slot ? `${slot.slotNumber} · ${slot.slotType}` : "–"}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kendaraan</Label>
            <Select
              value={vehicleId}
              onValueChange={setVehicleId}
              disabled={pending || vehicles.isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={vehicles.isLoading ? "Memuat..." : "Pilih kendaraan..."}
                />
              </SelectTrigger>
              <SelectContent>
                {list.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Tidak ada kendaraan aktif yang cocok untuk slot ini
                  </SelectItem>
                ) : (
                  list.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plateNumber} · {v.brand} · {v.snapshotResidentName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Hanya kendaraan aktif pada properti aktif yang ditampilkan.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!canSubmit || pending}>
              {pending ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...
                </span>
              ) : (
                "Assign Slot"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
