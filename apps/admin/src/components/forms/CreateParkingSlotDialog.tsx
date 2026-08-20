import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateParkingSlot } from "@/hooks/useParkingMutations";
import type { ParkingSlotType, ParkingZoneRecord } from "@/hooks/useParking";

export function CreateParkingSlotDialog({
  open,
  onOpenChange,
  zone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: ParkingZoneRecord | null;
}) {
  const create = useCreateParkingSlot();
  const [slotNumber, setSlotNumber] = useState("");
  const [slotType, setSlotType] = useState<ParkingSlotType>("motorcycle");
  useEffect(() => {
    if (open) {
      setSlotNumber("");
      setSlotType(zone?.zoneType === "car" ? "car" : "motorcycle");
    }
  }, [open, zone?.zoneType]);
  const canSubmit = Boolean(zone && slotNumber.trim());
  const pending = create.isPending;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!zone || !canSubmit) return;
    try {
      await create.mutateAsync({ zoneId: zone.id, slotNumber, slotType });
      onOpenChange(false);
    } catch {
      /* shared mutation feedback */
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah slot parkir</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>Zona</Label>
            <p className="text-sm font-medium">{zone?.zoneName ?? "-"}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nomor slot *</Label>
            <Input
              value={slotNumber}
              onChange={(e) => setSlotNumber(e.target.value)}
              placeholder="A-01"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jenis kendaraan *</Label>
            <Select
              value={slotType}
              onValueChange={(value) => setSlotType(value as ParkingSlotType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motorcycle">Motor</SelectItem>
                <SelectItem value="car">Mobil</SelectItem>
              </SelectContent>
            </Select>
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan slot"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
