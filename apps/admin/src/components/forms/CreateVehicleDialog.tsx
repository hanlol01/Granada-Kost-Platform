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
import { useResidents } from "@/hooks/useResidents";
import { useCreateVehicle } from "@/hooks/useVehicleMutations";
import { useProperty } from "@/lib/property";
import type { VehicleType } from "@/hooks/useVehicles";

const VEHICLE_TYPES: Array<{ value: VehicleType; label: string }> = [
  { value: "motorcycle", label: "Motor" },
  { value: "car", label: "Mobil" },
  { value: "bicycle", label: "Sepeda" },
  { value: "electric_scooter", label: "Skuter listrik" },
  { value: "other", label: "Lainnya" },
];

export function CreateVehicleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentPropertyId } = useProperty();
  const residents = useResidents({ limit: 100 });
  const create = useCreateVehicle();
  const [residentId, setResidentId] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("motorcycle");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setResidentId("");
    setPlateNumber("");
    setVehicleType("motorcycle");
    setBrand("");
    setColor("");
    setYear("");
    setNotes("");
  }, [open]);

  const canSubmit = Boolean(
    currentPropertyId && residentId && plateNumber.trim() && brand.trim() && color.trim(),
  );
  const pending = create.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPropertyId || !canSubmit) return;
    try {
      await create.mutateAsync({
        propertyId: currentPropertyId,
        residentId,
        plateNumber: plateNumber.trim(),
        vehicleType,
        brand: brand.trim(),
        color: color.trim(),
        year: year.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      // Mutation feedback is handled by the shared hook.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Daftarkan kendaraan</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label>Penghuni *</Label>
            <Select
              value={residentId}
              onValueChange={setResidentId}
              disabled={pending || residents.isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={residents.isLoading ? "Memuat penghuni..." : "Pilih penghuni"}
                />
              </SelectTrigger>
              <SelectContent>
                {(residents.data?.data ?? []).map((resident) => (
                  <SelectItem key={resident.id} value={resident.id}>
                    {resident.fullName}
                    {resident.roomNumber ? ` · ${resident.roomNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Kendaraan tetap terikat pada penghuni dan properti ini.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nomor polisi *</Label>
              <Input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="B 1234 KST"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis kendaraan *</Label>
              <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Merek *</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Honda, Toyota..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Warna *</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Hitam" />
            </div>
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                placeholder="2025"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan operasional (opsional)"
              rows={3}
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
                "Simpan kendaraan"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
