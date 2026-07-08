// Room detail drawer (slide-out panel). Shows full room information from
// already-loaded RoomRecord data. No extra API calls needed.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { RoomRecord } from "@/hooks/useRooms";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BedDouble, Building2, ChevronDown, Eye, EyeOff, Layers, Pencil } from "lucide-react";
import { useState } from "react";

const GENDER_LABEL: Record<string, string> = {
  male: "Putra",
  female: "Putri",
  mixed: "Campur",
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  vacant: { label: "Kosong", cls: "bg-success/15 text-success" },
  reserved: { label: "Dipesan", cls: "bg-chart-4/15 text-chart-4" },
  occupied: { label: "Terisi", cls: "bg-primary-soft text-primary" },
  maintenance: { label: "Maintenance", cls: "bg-warning/20 text-warning-foreground" },
  requires_review: { label: "Perlu Review", cls: "bg-destructive/10 text-destructive" },
  inactive: { label: "Tidak Aktif", cls: "bg-muted text-muted-foreground" },
};

const CATEGORY_LABEL: Record<string, string> = {
  rukost: "Rumah Kost",
  apartkost: "Apart Kost",
};

const FLOOR_LABEL: Record<string, string> = {
  B: "Lantai Bawah",
  A: "Lantai Atas",
};

export type RoomDetailDrawerProps = {
  room: RoomRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (room: RoomRecord) => void;
};

export function RoomDetailDrawer({ room, open, onOpenChange, onEdit }: RoomDetailDrawerProps) {
  const [metadataOpen, setMetadataOpen] = useState(false);

  if (!room) return null;

  const statusInfo = STATUS_LABEL[room.roomStatus] ?? STATUS_LABEL.vacant;
  const genderLabel = GENDER_LABEL[room.genderPolicy] ?? room.genderPolicy;
  const categoryLabel = room.category ? CATEGORY_LABEL[room.category] : "—";
  const floorLabel =
    room.floorCode && FLOOR_LABEL[room.floorCode]
      ? FLOOR_LABEL[room.floorCode]
      : (room.floorLabel ?? room.floor ?? "—");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-primary" />
            {room.roomCode ?? room.number}
          </SheetTitle>
          <SheetDescription>Detail lengkap kamar {room.roomCode ?? room.number}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 py-4">
          {/* Informasi Kamar */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Informasi Kamar</h3>
            <div className="grid grid-cols-2 gap-y-2.5 text-sm">
              <DetailRow label="Kode Kamar" value={room.roomCode ?? "—"} />
              <DetailRow label="Nomor Kamar" value={room.number} />
              <DetailRow label="Kategori" value={categoryLabel} />
              <DetailRow label="Gedung/Unit" value={room.buildingCode ?? room.unitCode ?? "—"} />
              <DetailRow label="Lantai" value={floorLabel} />
              <DetailRow label="Ukuran Kamar" value={room.sizeLabel ?? "—"} />
              <DetailRow label="Kebijakan Gender" value={genderLabel} />
            </div>
          </section>

          <Separator />

          {/* Status & Visibilitas */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Status & Visibilitas</h3>
            <div className="flex flex-wrap gap-2">
              <Badge className={cn("border-transparent", statusInfo.cls)} variant="outline">
                {statusInfo.label}
              </Badge>
              <Badge
                className={cn(
                  "gap-1 border-transparent",
                  room.publicVisible
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground",
                )}
                variant="outline"
              >
                {room.publicVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {room.publicVisible ? "Publik" : "Internal"}
              </Badge>
            </div>
          </section>

          <Separator />

          {/* Harga */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Harga</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Harga Bulanan</span>
                <span className="font-semibold">{formatIDR(room.monthlyPrice)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Harga Tahunan</span>
                <span className="font-semibold">
                  {room.yearlyPrice ? formatIDR(room.yearlyPrice) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Deposit</span>
                <span className="font-semibold">{formatIDR(room.depositAmount)}</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Fasilitas */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Fasilitas</h3>
            {room.facilities.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {room.facilities.map((facility) => (
                  <Badge
                    key={facility.id}
                    variant="outline"
                    className="border-transparent bg-muted text-muted-foreground"
                  >
                    {facility.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fasilitas berlaku untuk semua kamar{" "}
                {room.category ? CATEGORY_LABEL[room.category] : ""}.
              </p>
            )}
          </section>

          <Separator />

          {/* Metadata — Collapsible */}
          <section className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setMetadataOpen(!metadataOpen)}
            >
              <span>Metadata</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  metadataOpen && "rotate-180",
                )}
              />
            </button>
            {metadataOpen && (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium">Room ID:</span> {room.id}
                </p>
                <p>
                  <span className="font-medium">Property ID:</span> {room.propertyId}
                </p>
                {room.roomTypeId && (
                  <p>
                    <span className="font-medium">Room Type ID:</span> {room.roomTypeId}
                  </p>
                )}
                {room.buildingId && (
                  <p>
                    <span className="font-medium">Building ID:</span> {room.buildingId}
                  </p>
                )}
                {room.buildingName && (
                  <p>
                    <span className="font-medium">Nama Gedung:</span> {room.buildingName}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="border-t pt-4">
          {onEdit && (
            <Button
              variant="outline"
              onClick={() => {
                onEdit(room);
                onOpenChange(false);
              }}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit Kamar
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </>
  );
}
