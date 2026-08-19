import { useState } from "react";
import { Ban, CheckCircle2, CirclePlay, ClipboardCheck, RotateCcw, Wrench } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { WORK_ORDER_STATUS_LABELS, type AdminWorkOrder } from "@/lib/admin-maintenance";
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  useReworkWorkOrder,
  useStartWorkOrder,
  useVerifyWorkOrder,
} from "@/hooks/useWorkOrderMutations";
import { cn } from "@/lib/utils";

type Action = "start" | "complete" | "verify" | "rework" | "cancel";

type Props = {
  workOrder: AdminWorkOrder;
  propertyId: string;
  onChanged?: () => void;
};

const STATUS_STYLES: Record<AdminWorkOrder["status"], string> = {
  open: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
  assigned:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  in_progress:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  on_hold:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  completed:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  verified:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  rework_required:
    "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  cancelled:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
};

export function WorkOrderLifecyclePanel({ workOrder, propertyId, onChanged }: Props) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const start = useStartWorkOrder();
  const complete = useCompleteWorkOrder();
  const verify = useVerifyWorkOrder();
  const rework = useReworkWorkOrder();
  const cancel = useCancelWorkOrder();
  const mutation =
    pendingAction === "start"
      ? start
      : pendingAction === "complete"
        ? complete
        : pendingAction === "verify"
          ? verify
          : pendingAction === "rework"
            ? rework
            : cancel;
  const canCancel = ["open", "assigned", "in_progress", "on_hold", "rework_required"].includes(
    workOrder.status,
  );

  const execute = async (reason?: string) => {
    if (!pendingAction) return;
    try {
      await mutation.mutateAsync({ workOrderId: workOrder.id, propertyId, reason });
      setPendingAction(null);
      onChanged?.();
    } catch {
      // Mutation hook already presents the normalized error.
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Status pekerjaan</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
            STATUS_STYLES[workOrder.status],
          )}
        >
          {WORK_ORDER_STATUS_LABELS[workOrder.status]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {workOrder.status === "assigned" || workOrder.status === "rework_required" ? (
          <Button size="sm" onClick={() => setPendingAction("start")} disabled={mutation.isPending}>
            <CirclePlay className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Mulai pekerjaan
          </Button>
        ) : null}
        {workOrder.status === "in_progress" || workOrder.status === "on_hold" ? (
          <Button
            size="sm"
            onClick={() => setPendingAction("complete")}
            disabled={mutation.isPending}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Tandai selesai
          </Button>
        ) : null}
        {workOrder.status === "completed" ? (
          <>
            <Button
              size="sm"
              onClick={() => setPendingAction("verify")}
              disabled={mutation.isPending}
            >
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Verifikasi
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingAction("rework")}
              disabled={mutation.isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Minta perbaikan
            </Button>
          </>
        ) : null}
        {canCancel ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingAction("cancel")}
            disabled={mutation.isPending}
          >
            <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Batalkan
          </Button>
        ) : null}
      </div>
      {workOrder.status === "verified" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Pekerjaan telah diverifikasi dan
          tersimpan di riwayat.
        </p>
      ) : null}
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction === "start"
            ? "Mulai pekerjaan?"
            : pendingAction === "complete"
              ? "Tandai pekerjaan selesai?"
              : pendingAction === "verify"
                ? "Verifikasi pekerjaan?"
                : pendingAction === "rework"
                  ? "Minta perbaikan pekerjaan"
                  : "Batalkan work order"
        }
        description={`Work order ${workOrder.workOrderCode}. Perubahan ini dicatat dalam riwayat operasional.`}
        confirmLabel={pendingAction === "cancel" ? "Batalkan" : "Konfirmasi"}
        destructive={pendingAction === "cancel"}
        pending={mutation.isPending}
        reason={
          pendingAction === "rework" || pendingAction === "cancel"
            ? { label: "Alasan", minLength: 3 }
            : undefined
        }
        onConfirm={execute}
      />
    </div>
  );
}
