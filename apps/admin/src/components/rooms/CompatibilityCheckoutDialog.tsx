import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  canUseCompatibilityCheckout,
  useCreateLegacyCheckout,
  useFinalizeLegacyCheckout,
} from "@/hooks/useOccupancyMutations";
import type { RoomInventory } from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";

function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CompatibilityCheckoutDialog({
  room,
  open,
  onOpenChange,
}: {
  room: RoomInventory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const create = useCreateLegacyCheckout();
  const finalize = useFinalizeLegacyCheckout();
  const resetCreate = create.reset;
  const resetFinalize = finalize.reset;
  const [endDate, setEndDate] = useState(todayIso());
  const [roomStatusAfter, setRoomStatusAfter] = useState<"vacant" | "maintenance">("vacant");
  const [checkOutId, setCheckOutId] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const pending = create.isPending || finalize.isPending;
  const error = finalize.error ?? create.error;
  const forbidden = (error as { status?: unknown } | null)?.status === 403;
  const occupancyId = room?.activeOccupancy?.id ?? null;
  const accessAllowed = canUseCompatibilityCheckout({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
    room,
  });
  const canSubmit = Boolean(accessAllowed && endDate);

  useEffect(() => {
    setEndDate(todayIso());
    setRoomStatusAfter("vacant");
    setCheckOutId(null);
    submissionLock.current = false;
    resetCreate();
    resetFinalize();
  }, [open, room?.id, currentPropertyId, resetCreate, resetFinalize]);

  useEffect(() => {
    if (open && !accessAllowed) onOpenChange(false);
  }, [accessAllowed, onOpenChange, open]);

  const submit = async () => {
    if (!canSubmit || !occupancyId || !currentPropertyId || submissionLock.current) return;
    submissionLock.current = true;
    try {
      let requestId = checkOutId;
      if (!requestId) {
        requestId = await create.mutateAsync({
          propertyId: currentPropertyId,
          occupancyId,
          requestedCheckOutDate: endDate,
        });
        setCheckOutId(requestId);
      }
      await finalize.mutateAsync({
        propertyId: currentPropertyId,
        checkOutId: requestId,
        endDate,
        roomStatusAfter,
      });
      onOpenChange(false);
    } catch {
      // Safe mutation feedback is shown; a created request id is retained for retry.
    } finally {
      submissionLock.current = false;
    }
  };

  return (
    <Dialog open={open && accessAllowed} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Rekonsiliasi Penyewaan Lama</DialogTitle>
          <DialogDescription>
            Jalur ini hanya menutup data hunian lama yang tidak mempunyai Penyewaan aktif. Jalur ini
            tidak membuat Penyewaan, invoice, atau penghuni baru.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mr-2 inline h-4 w-4" />
            Pastikan data lama memang perlu direkonsiliasi sebelum melanjutkan.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legacy-checkout-end-date">Tanggal selesai</Label>
            <Input
              id="legacy-checkout-end-date"
              type="date"
              value={endDate}
              disabled={pending}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status kamar setelah selesai</Label>
            <Select
              value={roomStatusAfter}
              disabled={pending}
              onValueChange={(value) => setRoomStatusAfter(value as "vacant" | "maintenance")}
            >
              <SelectTrigger aria-label="Status kamar setelah rekonsiliasi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacant">Kosong</SelectItem>
                <SelectItem value="maintenance">Pemeliharaan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">
              {forbidden
                ? "Anda tidak berwenang menjalankan checkout kompatibilitas."
                : "Rekonsiliasi gagal. Periksa keadaan terbaru lalu coba lagi."}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!canSubmit || pending} onClick={() => void submit()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Selesaikan Data Lama
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
