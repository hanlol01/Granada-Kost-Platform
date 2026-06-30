// Check-in workflow dialog. Triggered from a resident row on the Tenants page.
// The user picks a vacant room and a start date; submission goes through
// useCompleteCheckIn (POST /check-ins). Room list is fetched fresh and
// filtered to status='vacant' so we never offer an occupied room.
//
// Backend rejects mismatched property scope, so we always pass the active
// PropertyProvider id in the mutation input. Backend remains final authority.

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProperty } from "@/lib/property";
import { useRooms } from "@/hooks/useRooms";
import { useCompleteCheckIn } from "@/hooks/useOccupancyMutations";
import { formatIDR } from "@/lib/format";

export type CheckInDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string | null;
  residentName?: string;
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CheckInDialog({
  open,
  onOpenChange,
  residentId,
  residentName,
}: CheckInDialogProps) {
  const { currentPropertyId } = useProperty();
  const vacantRooms = useRooms({ status: "vacant" });
  const checkIn = useCompleteCheckIn();
  const [roomId, setRoomId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (open) {
      setRoomId("");
      setStartDate(todayIso());
      setNotes("");
    }
  }, [open]);

  const rooms = useMemo(() => vacantRooms.data ?? [], [vacantRooms.data]);

  const canSubmit =
    Boolean(currentPropertyId) && Boolean(residentId) && Boolean(roomId) && Boolean(startDate);
  const pending = checkIn.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !residentId || !currentPropertyId) return;
    try {
      await checkIn.mutateAsync({
        propertyId: currentPropertyId,
        roomId,
        residentId,
        startDate,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      // Toast already emitted by the hook. Keep the dialog open to retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check-in Penghuni</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit} noValidate>
          <div className="space-y-1">
            <Label className="text-xs">Penghuni</Label>
            <Input value={residentName ?? "-"} disabled />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kamar (status kosong)</Label>
            <Select
              value={roomId}
              onValueChange={setRoomId}
              disabled={pending || vacantRooms.isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={vacantRooms.isLoading ? "Memuat..." : "Pilih kamar..."} />
              </SelectTrigger>
              <SelectContent>
                {rooms.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Tidak ada kamar kosong
                  </SelectItem>
                ) : (
                  rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.number}
                      {r.unitCode ? ` · ${r.unitCode}` : ""} · {formatIDR(r.monthlyPrice)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tanggal Mulai</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Catatan (opsional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
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
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...
                </span>
              ) : (
                "Selesaikan Check-in"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
