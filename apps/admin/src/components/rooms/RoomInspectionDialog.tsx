import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUxMasterApi } from "@/lib/admin-ux-master-api";
import { queryKeyContainsPropertyScope } from "@/lib/admin-ux-query-keys";
import { useAuth } from "@/lib/auth";
import { safeErrorMessage } from "@/lib/error-normalizer";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";

export function RoomInspectionDialog({
  roomId,
  roomNumber,
  propertyId,
  open,
  onOpenChange,
}: {
  roomId: string;
  roomNumber: string;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const attemptedScope = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const scope = `${user?.id}:${currentPropertyId}`;
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const allowed =
    user?.roles.includes("admin") &&
    hasPermission("room.manage") &&
    currentPropertyId === propertyId;
  const mutation = useMutation({
    mutationFn: async () => {
      attemptedScope.current = scope;
      if (!allowed) throw new Error("Akses pemeriksaan kamar tidak tersedia.");
      const input = { outcome, notes: notes.trim() || undefined };
      const fingerprint = JSON.stringify({ roomId, propertyId, scope, input });
      if (intent.current?.fingerprint !== fingerprint)
        intent.current = { fingerprint, key: newIdempotencyKey() };
      const result = await adminUxMasterApi.rooms.resolveInspection(
        roomId,
        input,
        intent.current.key,
      );
      if (result.id !== roomId || result.propertyId !== propertyId)
        throw new Error("Hasil pemeriksaan kamar tidak sesuai.");
      return { result, requestedScope: scope };
    },
    onSuccess: ({ result, requestedScope }) => {
      intent.current = null;
      // A successful command stays successful even when a subsequent refresh fails.
      void queryClient.invalidateQueries({
        predicate: (query) => queryKeyContainsPropertyScope(query.queryKey, propertyId),
      });
      if (liveScope.current !== requestedScope) return;
      toast.success(
        result.roomStatus === "vacant"
          ? `Kamar ${roomNumber} siap digunakan dan berstatus Kosong.`
          : `Kamar ${roomNumber} masuk Perawatan.`,
      );
      onOpenChange(false);
    },
    onError: (failure) => {
      if (liveScope.current === attemptedScope.current) setError(safeErrorMessage(failure));
    },
  });
  const pending = mutation.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Periksa kamar {roomNumber}</DialogTitle>
          <DialogDescription>
            Periksa kondisi kamar setelah penghuni pindah atau check-out, lalu catat hasilnya
            sebelum kamar digunakan kembali.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && allowed && (outcome === "pass" || notes.trim())) {
              setError(null);
              mutation.mutate();
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="room-inspection-outcome">
              Hasil pemeriksaan <span className="text-destructive">*</span>
            </Label>
            <Select
              value={outcome}
              disabled={pending}
              onValueChange={(value) => {
                setOutcome(value as "pass" | "fail");
                setError(null);
              }}
            >
              <SelectTrigger id="room-inspection-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Siap digunakan → Kosong</SelectItem>
                <SelectItem value="fail">Perlu perbaikan → Perawatan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-foreground">
            {outcome === "pass"
              ? "Kamar akan tersedia untuk penyewaan baru setelah hasil pemeriksaan disimpan."
              : "Kamar tetap tidak tersedia untuk penyewaan. Lanjutkan perbaikan melalui alur perawatan yang tersedia."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="room-inspection-notes">
              {outcome === "fail" ? "Alasan perlu perbaikan" : "Catatan pemeriksaan (opsional)"}{" "}
              {outcome === "fail" ? <span className="text-destructive">*</span> : null}
            </Label>
            <Textarea
              id="room-inspection-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={pending}
              required={outcome === "fail"}
              maxLength={2000}
              rows={3}
              placeholder={
                outcome === "fail"
                  ? "Jelaskan kondisi yang perlu diperbaiki."
                  : "Keterangan hasil pemeriksaan jika diperlukan."
              }
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={!allowed || pending || (outcome === "fail" && !notes.trim())}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan hasil
              pemeriksaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
