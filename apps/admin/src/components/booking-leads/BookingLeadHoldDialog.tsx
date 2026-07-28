import { useEffect, useRef } from "react";
import { Clock3, Loader2, LockKeyhole, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateBookingLeadHold,
  useReleaseBookingLeadHold,
} from "@/hooks/useBookingLeadHoldMutations";
import type { BookingLeadRecord } from "@/lib/admin-booking-lead";
import {
  canCreateBookingLeadHold,
  canReleaseBookingLeadHold,
  formatBookingHoldRemaining,
  type BookingLeadHoldCoverage,
  type BookingLeadHoldRecord,
} from "@/lib/admin-booking-lead-hold";
import { useAuth } from "@/lib/auth";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";

type HoldDialogProps = {
  open: boolean;
  mode: "create" | "release";
  lead: BookingLeadRecord | null;
  hold: BookingLeadHoldRecord | null;
  coverage: BookingLeadHoldCoverage | null;
  onOpenChange: (open: boolean) => void;
};

export function BookingLeadHoldStatus({
  hold,
  now,
  compact = false,
}: {
  hold: BookingLeadHoldRecord;
  now: number;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-1 text-xs font-medium text-warning-foreground">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Ditahan
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          compact && "text-[11px]",
        )}
      >
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        {formatBookingHoldRemaining(hold.expiresAt, now)}
      </span>
    </span>
  );
}

function safeErrorMessage(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

export function BookingLeadHoldDialog({
  open,
  mode,
  lead,
  hold,
  coverage,
  onOpenChange,
}: HoldDialogProps) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const create = useCreateBookingLeadHold();
  const release = useReleaseBookingLeadHold();
  const resetCreate = create.reset;
  const resetRelease = release.reset;
  const propertyAtOpen = useRef<string | null>(null);
  const leadAtOpen = useRef<string | null>(null);
  const submissionKey = useRef<string | null>(null);
  const submitting = useRef(false);

  const access = {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
  };
  const accessAllowed = Boolean(
    lead &&
    (mode === "create"
      ? canCreateBookingLeadHold({
          ...access,
          propertyRollouts: user?.propertyRollouts,
          lead,
          coverage,
        })
      : canReleaseBookingLeadHold({ ...access, lead, hold })),
  );
  const mutation = mode === "create" ? create : release;
  const pending = mutation.isPending || submitting.current;

  useEffect(() => {
    if (!open) {
      propertyAtOpen.current = null;
      leadAtOpen.current = null;
      submissionKey.current = null;
      resetCreate();
      resetRelease();
      return;
    }
    if (propertyAtOpen.current === null && leadAtOpen.current === null) {
      propertyAtOpen.current = currentPropertyId;
      leadAtOpen.current = lead?.id ?? null;
      submissionKey.current = null;
      resetCreate();
      resetRelease();
      return;
    }
    if (currentPropertyId !== propertyAtOpen.current || lead?.id !== leadAtOpen.current) {
      submissionKey.current = null;
      resetCreate();
      resetRelease();
      onOpenChange(false);
    }
  }, [currentPropertyId, lead?.id, onOpenChange, open, resetCreate, resetRelease]);

  if (!lead) return null;

  const submit = async () => {
    const propertyId = propertyAtOpen.current;
    if (
      !accessAllowed ||
      !propertyId ||
      propertyId !== currentPropertyId ||
      lead.id !== leadAtOpen.current ||
      submitting.current ||
      mutation.isPending
    ) {
      return;
    }
    submitting.current = true;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      await mutation.mutateAsync({ propertyId, leadId: lead.id, idempotencyKey });
      submissionKey.current = null;
      onOpenChange(false);
    } catch {
      // The exact backend error remains available on the mutation and in the safe toast.
    } finally {
      submitting.current = false;
    }
  };

  const createMode = mode === "create";
  const errorMessage = safeErrorMessage(mutation.error);
  return (
    <Dialog open={open && accessAllowed} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {createMode ? "Tahan kamar selama 24 jam" : "Lepaskan tahanan kamar?"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {createMode
              ? "Tindakan ini menandai kamar sebagai Dipesan selama 24 jam. Tahanan tidak membuat penyewaan, penghuni, atau tagihan."
              : "Tahanan aktif akan dilepaskan dan kamar kembali Kosong bila tetap aman. Tindakan ini tidak membuat penyewaan, penghuni, atau tagihan."}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Calon penghuni</dt>
            <dd className="break-words font-medium">{lead.visitorName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Kamar</dt>
            <dd className="break-words font-medium">{lead.roomNumber ?? "Belum terhubung"}</dd>
          </div>
        </dl>

        {errorMessage ? (
          <p role="alert" className="break-words text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button
            variant={createMode ? "default" : "destructive"}
            onClick={() => void submit()}
            disabled={!accessAllowed || pending}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : createMode ? (
              <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Unlock className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {createMode ? "Tahan Kamar" : "Lepaskan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
