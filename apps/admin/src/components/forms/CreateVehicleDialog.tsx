import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useResidents } from "@/hooks/useResidents";
import { useCreateVehicle } from "@/hooks/useVehicleMutations";
import { useProperty } from "@/lib/property";
import type { VehicleType } from "@/hooks/useVehicles";
import type { ResidentListRecord } from "@/lib/admin-resident";
import { cn } from "@/lib/utils";

const VEHICLE_TYPES: Array<{ value: VehicleType; label: string }> = [
  { value: "motorcycle", label: "Motor" },
  { value: "car", label: "Mobil" },
  { value: "bicycle", label: "Sepeda" },
  { value: "electric_scooter", label: "Skuter listrik" },
  { value: "other", label: "Lainnya" },
];

function roomBuildingLabel(roomNumber: string | null): string | null {
  if (!roomNumber) return null;
  const match = /^(RK|AK)-(.+)-[^-]+$/i.exec(roomNumber);
  if (!match) return null;
  return `${match[1].toUpperCase() === "RK" ? "Rumah Kost" : "Apart Kost"} Unit ${match[2]}`;
}

function ResidentPicker({
  residents,
  value,
  onChange,
  disabled,
}: {
  residents: ResidentListRecord[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = residents.find((resident) => resident.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="min-h-11 w-full justify-between px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected
              ? `${selected.fullName}${selected.roomNumber ? ` · ${selected.roomNumber}` : ""}`
              : disabled
                ? "Memuat penghuni..."
                : "Cari dan pilih penghuni"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Cari nama, kamar, atau bangunan..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Tidak ada penghuni yang sesuai.</CommandEmpty>
            <CommandGroup heading={`${residents.length} penghuni tersedia`}>
              {residents.map((resident) => {
                const building = roomBuildingLabel(resident.roomNumber);
                return (
                  <CommandItem
                    key={resident.id}
                    value={`${resident.fullName} ${resident.roomNumber ?? ""} ${building ?? ""} ${resident.university ?? ""} ${resident.residentStatus}`}
                    onSelect={() => {
                      onChange(resident.id);
                      setOpen(false);
                    }}
                    className="min-h-12"
                  >
                    <Check
                      className={cn("h-4 w-4", value === resident.id ? "opacity-100" : "opacity-0")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{resident.fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[resident.roomNumber, building, resident.university]
                          .filter(Boolean)
                          .join(" · ") || "Belum memiliki kamar"}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VehicleTypePicker({
  value,
  customValue,
  onChange,
  disabled,
}: {
  value: VehicleType;
  customValue: string;
  onChange: (value: VehicleType, customValue: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = search.trim();
  const selectedLabel = customValue || VEHICLE_TYPES.find((item) => item.value === value)?.label;
  const exactMatch = VEHICLE_TYPES.some(
    (item) => item.label.toLocaleLowerCase("id-ID") === typed.toLocaleLowerCase("id-ID"),
  );
  const canAdd = typed.length >= 2 && !exactMatch;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="min-h-11 w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{selectedLabel ?? "Pilih jenis kendaraan"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Cari atau ketik jenis kendaraan..."
          />
          <CommandList>
            <CommandEmpty>Tidak ada jenis kendaraan yang sesuai.</CommandEmpty>
            <CommandGroup heading="Jenis kendaraan">
              {VEHICLE_TYPES.filter(
                (item) =>
                  !typed ||
                  item.label.toLocaleLowerCase("id-ID").includes(typed.toLocaleLowerCase("id-ID")),
              ).map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.label}
                  onSelect={() => {
                    onChange(item.value, "");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value === item.value && !customValue ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {canAdd ? (
              <CommandGroup heading="Tambah baru">
                <CommandItem
                  value={`add-${typed}`}
                  onSelect={() => {
                    onChange("other", typed);
                    setOpen(false);
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">Tambahkan jenis kendaraan “{typed}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  const [customVehicleType, setCustomVehicleType] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setResidentId("");
    setPlateNumber("");
    setVehicleType("motorcycle");
    setCustomVehicleType("");
    setBrand("");
    setColor("");
    setYear("");
    setNotes("");
  }, [open]);

  const canSubmit = Boolean(currentPropertyId && residentId);
  const pending = create.isPending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPropertyId || !canSubmit) return;
    try {
      await create.mutateAsync({
        propertyId: currentPropertyId,
        residentId,
        plateNumber: plateNumber.trim() || undefined,
        vehicleType,
        customVehicleType: customVehicleType || undefined,
        brand: brand.trim() || undefined,
        color: color.trim() || undefined,
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
            <ResidentPicker
              residents={residents.data?.data ?? []}
              value={residentId}
              onChange={setResidentId}
              disabled={pending || residents.isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Kendaraan tetap terikat pada penghuni dan properti ini.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nomor polisi</Label>
              <Input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="B 1234 KST"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis kendaraan *</Label>
              <VehicleTypePicker
                value={vehicleType}
                customValue={customVehicleType}
                onChange={(nextType, nextCustomType) => {
                  setVehicleType(nextType);
                  setCustomVehicleType(nextCustomType);
                }}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Merek</Label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Honda, Toyota..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Warna</Label>
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
