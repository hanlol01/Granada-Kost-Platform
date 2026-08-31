import { useEffect, useRef, useState } from "react";
import type { FileResponse } from "@granada-kost/domain";
import { Loader2, RotateCcw } from "lucide-react";
import { FileUploadField } from "@/components/file/FileUploadField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCancelBookingLeadPaymentCommitment } from "@/hooks/useBookingLeadCompletion";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";

type Props = {
  open: boolean;
  leadId: string;
  residentName: string;
  roomNumber: string | null;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void | Promise<void>;
};

export function BookingLeadCancellationDialog({
  open,
  leadId,
  residentName,
  roomNumber,
  onOpenChange,
  onCancelled,
}: Props) {
  const { currentPropertyId } = useProperty();
  const cancellation = useCancelBookingLeadPaymentCommitment();
  const resetCancellation = cancellation.reset;
  const submissionKey = useRef<string | null>(null);
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank_transfer">("cash");
  const [refundNote, setRefundNote] = useState("");
  const [refundEvidence, setRefundEvidence] = useState<FileResponse | null>(null);
  const [refundEvidenceBusy, setRefundEvidenceBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    submissionKey.current = null;
    setRefundMethod("cash");
    setRefundNote("");
    setRefundEvidence(null);
    setRefundEvidenceBusy(false);
    resetCancellation();
  }, [open, resetCancellation]);

  const submit = async () => {
    if (!currentPropertyId || cancellation.isPending) return;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      await cancellation.mutateAsync({
        leadId,
        idempotencyKey,
        input: {
          propertyId: currentPropertyId,
          refundMethod,
          refundNote,
          refundEvidenceFileIds: refundEvidence ? [refundEvidence.id] : undefined,
        },
      });
      submissionKey.current = null;
      await onCancelled?.();
      onOpenChange(false);
    } catch {
      // Mutation feedback presents the authoritative backend error.
    }
  };

  const errorMessage = cancellation.error instanceof Error ? cancellation.error.message : null;
  const pending = cancellation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batalkan minat booking dan refund?</DialogTitle>
          <DialogDescription>
            Booking Fee/DP dapat dibatalkan sebelum data penyewaan lengkap atau selama status
            Menunggu Aktivasi. Pembayaran awal terverifikasi termasuk security deposit akan direfund
            dan tahan kamar dilepas. Jika sudah terbentuk, lease, kontrak, dan invoice juga
            dibatalkan. Tindakan ini tidak tersedia untuk pelunasan penuh atau sewa aktif.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Penghuni</dt>
            <dd className="break-words font-medium">{residentName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kamar</dt>
            <dd className="break-words font-medium">{roomNumber ?? "Belum terhubung"}</dd>
          </div>
        </dl>

        <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <label className="grid gap-1.5 font-medium">
            Metode refund
            <select
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value as "cash" | "bank_transfer")}
              className="min-h-11 rounded-md border border-input bg-background px-3 font-normal"
              disabled={pending}
            >
              <option value="cash">Tunai</option>
              <option value="bank_transfer">Transfer Bank</option>
            </select>
          </label>
          <FileUploadField
            propertyId={currentPropertyId ?? ""}
            filePurpose="payment_proof"
            label="Bukti refund"
            description={
              refundMethod === "bank_transfer"
                ? "Wajib untuk refund Transfer Bank. Unggah JPG, PNG, WebP, atau PDF."
                : "Opsional untuk refund Tunai."
            }
            value={refundEvidence}
            onChange={setRefundEvidence}
            onBusyChange={setRefundEvidenceBusy}
            required={refundMethod === "bank_transfer"}
            disabled={pending}
          />
          <label className="grid gap-1.5 font-medium">
            Alasan pembatalan
            <textarea
              value={refundNote}
              onChange={(event) => setRefundNote(event.target.value)}
              maxLength={500}
              className="min-h-20 rounded-md border border-input bg-background p-3 font-normal"
              placeholder="Contoh: calon penghuni membatalkan rencana masuk"
              disabled={pending}
            />
          </label>
        </div>

        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Kembali
          </Button>
          <Button
            variant="destructive"
            onClick={() => void submit()}
            disabled={
              pending || refundEvidenceBusy || (refundMethod === "bank_transfer" && !refundEvidence)
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Batalkan dan Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
