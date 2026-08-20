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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateParkingZone } from "@/hooks/useParkingMutations";
import { useProperty } from "@/lib/property";
import type { ParkingZoneType } from "@/hooks/useParking";

export function CreateParkingZoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentPropertyId } = useProperty();
  const create = useCreateParkingZone();
  const [zoneCode, setZoneCode] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [zoneType, setZoneType] = useState<ParkingZoneType>("mixed");
  const [capacity, setCapacity] = useState("");
  const [locationDescription, setLocationDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setZoneCode("");
    setZoneName("");
    setZoneType("mixed");
    setCapacity("");
    setLocationDescription("");
  }, [open]);

  const canSubmit = Boolean(currentPropertyId && zoneCode.trim() && zoneName.trim());
  const pending = create.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPropertyId || !canSubmit) return;
    try {
      await create.mutateAsync({
        propertyId: currentPropertyId,
        zoneCode,
        zoneName,
        zoneType,
        capacity: capacity.trim() ? Number(capacity) : undefined,
        locationDescription,
      });
      onOpenChange(false);
    } catch {
      /* shared mutation feedback */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Tambah zona parkir</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode zona *</Label>
              <Input
                value={zoneCode}
                onChange={(e) => setZoneCode(e.target.value)}
                placeholder="PARK-A"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nama zona *</Label>
              <Input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="Parkir depan"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis kendaraan</Label>
              <Select
                value={zoneType}
                onValueChange={(value) => setZoneType(value as ParkingZoneType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Campuran</SelectItem>
                  <SelectItem value="motorcycle">Motor</SelectItem>
                  <SelectItem value="car">Mobil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kapasitas slot</Label>
              <Input
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="Opsional"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Lokasi</Label>
            <Textarea
              value={locationDescription}
              onChange={(e) => setLocationDescription(e.target.value)}
              rows={2}
              placeholder="Keterangan lokasi (opsional)"
            />
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
                "Simpan zona"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
