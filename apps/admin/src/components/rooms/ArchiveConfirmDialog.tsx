// Archive (Nonaktifkan) / Reactivate (Aktifkan Kembali) confirmation dialog.
// Uses existing PATCH /rooms/:id/status → inactive or vacant.

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
import type { RoomRecord } from "@/hooks/useRooms";
import { useUpdateRoomStatus } from "@/hooks/useRoomMutations";
import { AlertTriangle, Loader2, Power } from "lucide-react";

export type ArchiveConfirmDialogProps = {
  room: RoomRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ArchiveConfirmDialog({ room, open, onOpenChange }: ArchiveConfirmDialogProps) {
  const mutation = useUpdateRoomStatus();

  if (!room) return null;

  const isCurrentlyInactive = room.roomStatus === "inactive";
  const targetStatus = isCurrentlyInactive ? "vacant" : "inactive";
  const roomLabel = room.roomCode ?? room.number;

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync({
        roomId: room.id,
        status: targetStatus,
      });
      onOpenChange(false);
    } catch {
      // Error toast handled by hook.
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!mutation.isPending) {
      onOpenChange(nextOpen);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isCurrentlyInactive ? (
              <Power className="h-5 w-5 text-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {isCurrentlyInactive ? "Aktifkan Kembali Kamar" : "Nonaktifkan Kamar"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isCurrentlyInactive ? (
                <p>
                  Kamar <span className="font-semibold text-foreground">{roomLabel}</span> akan
                  diaktifkan kembali dengan status{" "}
                  <span className="font-semibold text-foreground">Kosong</span>. Kamar akan kembali
                  terlihat di daftar aktif.
                </p>
              ) : (
                <>
                  <p>
                    Yakin ingin menonaktifkan kamar{" "}
                    <span className="font-semibold text-foreground">{roomLabel}</span>?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kamar akan disembunyikan dari katalog publik dan tidak dapat dipesan. Data kamar
                    tetap tersimpan di sistem dan dapat diaktifkan kembali kapan saja.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            className={
              isCurrentlyInactive
                ? undefined
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            }
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {mutation.isPending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...
              </span>
            ) : isCurrentlyInactive ? (
              "Aktifkan Kembali"
            ) : (
              "Nonaktifkan"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
