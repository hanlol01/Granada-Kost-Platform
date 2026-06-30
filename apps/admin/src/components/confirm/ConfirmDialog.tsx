// Generic confirmation dialog used by every destructive / state-changing
// mutation per the M11E UX requirements. Builds on shadcn AlertDialog so the
// visual remains aligned with the Lovable design system (no redesign).
//
// Two modes:
//   - Confirmation only (description + Confirm button).
//   - Confirmation with a typed reason. Reason is required and trimmed to
//     match backend MinLength(3) validation (CancelInvoiceDto, VehicleReasonDto,
//     RejectPaymentDto, CancelComplaintDto).
//
// The dialog forwards the typed reason to onConfirm so callers do not need to
// maintain a separate piece of state.

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  reason?: {
    label?: string;
    placeholder?: string;
    helperText?: string;
    minLength?: number;
  };
  onConfirm: (reason?: string) => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  destructive = false,
  pending = false,
  reason,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = useState("");
  const min = reason?.minLength ?? 3;

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  const reasonInvalid = !!reason && text.trim().length < min;
  const disabled = pending || reasonInvalid;

  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (disabled) return;
    void onConfirm(reason ? text.trim() : undefined);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {reason ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason" className="text-xs">
              {reason.label ?? "Alasan"}
            </Label>
            <Textarea
              id="confirm-reason"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reason.placeholder ?? "Tuliskan alasan singkat..."}
              rows={3}
              disabled={pending}
            />
            <p
              className={cn(
                "text-[11px]",
                reasonInvalid ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {reason.helperText ?? `Minimal ${min} karakter.`}
            </p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            onClick={handleConfirm}
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses...
              </span>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
