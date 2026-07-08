// Status change confirmation dialog. Lets admin pick a new status from the
// backend-supported values and confirms before calling useUpdateRoomStatus.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { RoomRecord, RoomStatus } from "@/hooks/useRooms";
import { useUpdateRoomStatus } from "@/hooks/useRoomMutations";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const STATUS_OPTIONS: { value: RoomStatus; label: string; cls: string }[] = [
  { value: "vacant", label: "Kosong", cls: "bg-success/15 text-success" },
  { value: "reserved", label: "Dipesan", cls: "bg-chart-4/15 text-chart-4" },
  { value: "occupied", label: "Terisi", cls: "bg-primary-soft text-primary" },
  {
    value: "maintenance",
    label: "Maintenance",
    cls: "bg-warning/20 text-warning-foreground",
  },
  {
    value: "requires_review",
    label: "Perlu Review",
    cls: "bg-destructive/10 text-destructive",
  },
  {
    value: "inactive",
    label: "Tidak Aktif",
    cls: "bg-muted text-muted-foreground",
  },
];

export type StatusChangeDialogProps = {
  room: RoomRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StatusChangeDialog({ room, open, onOpenChange }: StatusChangeDialogProps) {
  const [selected, setSelected] = useState<RoomStatus | null>(null);
  const mutation = useUpdateRoomStatus();

  if (!room) return null;

  const currentStatus = room.roomStatus;
  const effectiveSelected = selected ?? currentStatus;

  const handleConfirm = async () => {
    if (!selected || selected === currentStatus) return;
    try {
      await mutation.mutateAsync({ roomId: room.id, status: selected });
      onOpenChange(false);
      setSelected(null);
    } catch {
      // Error toast is handled by the mutation hook.
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!mutation.isPending) {
      onOpenChange(nextOpen);
      if (!nextOpen) setSelected(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ubah Status Kamar</AlertDialogTitle>
          <AlertDialogDescription>
            Ubah status kamar{" "}
            <span className="font-semibold text-foreground">{room.roomCode ?? room.number}</span> ke
            status baru.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-2 py-3">
          {STATUS_OPTIONS.map((option) => {
            const isActive = effectiveSelected === option.value;
            const isCurrent = currentStatus === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={mutation.isPending}
                onClick={() => setSelected(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <Badge className={cn("border-transparent", option.cls)} variant="outline">
                  {option.label}
                </Badge>
                {isCurrent && <span className="text-xs text-muted-foreground">(saat ini)</span>}
              </button>
            );
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || !selected || selected === currentStatus}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {mutation.isPending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...
              </span>
            ) : (
              "Simpan Status"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
