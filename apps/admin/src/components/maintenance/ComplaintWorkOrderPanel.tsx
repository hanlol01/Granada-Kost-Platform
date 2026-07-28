import { AlertCircle, ClipboardCheck, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAINTENANCE_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type ComplaintWorkOrderAuthority,
  type TechnicianReference,
} from "@/lib/admin-maintenance";
import { cn } from "@/lib/utils";

type ComplaintWorkOrderPanelProps = {
  authority: ComplaintWorkOrderAuthority;
  coverageComplete: boolean;
  technicians: TechnicianReference[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
};

function relevantTimestamp(
  workOrder: NonNullable<ComplaintWorkOrderAuthority["workOrder"]>,
): string {
  return (
    workOrder.verifiedAt ??
    workOrder.completedAt ??
    workOrder.startedAt ??
    workOrder.scheduledAt ??
    workOrder.updatedAt
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ComplaintWorkOrderPanel({
  authority,
  coverageComplete,
  technicians,
  isLoading,
  error,
  onRetry,
}: ComplaintWorkOrderPanelProps) {
  const workOrder = authority.workOrder;

  return (
    <section
      aria-labelledby="complaint-work-order-title"
      className="min-w-0 rounded-xl border border-border bg-muted/25 p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="complaint-work-order-title" className="text-sm font-semibold">
            Work order terkait
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pemantauan pekerjaan maintenance untuk tiket ini.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Memuat work order…
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-col items-start gap-2" role="alert">
          <span className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Gagal memuat work order terkait.
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      ) : !coverageComplete ? (
        <p className="mt-4 text-sm text-muted-foreground">Menunggu cakupan data lengkap…</p>
      ) : authority.anomaly ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Terdapat lebih dari satu work order aktif. Rekonsiliasi data diperlukan sebelum teknisi
          dapat ditugaskan.
        </p>
      ) : !workOrder ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Belum ada work order untuk komplain ini.
        </p>
      ) : (
        <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Kode work order</dt>
            <dd className="break-words font-medium">{workOrder.workOrderCode}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd
              className={cn(
                "mt-1 inline-flex rounded-full border border-border bg-background px-2 py-1 text-xs font-medium",
              )}
            >
              {WORK_ORDER_STATUS_LABELS[workOrder.status]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Prioritas</dt>
            <dd className="font-medium">{MAINTENANCE_PRIORITY_LABELS[workOrder.priority]}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Teknisi</dt>
            <dd className="break-words font-medium">
              {workOrder.assignedToUserId
                ? (technicians?.find((item) => item.userId === workOrder.assignedToUserId)
                    ?.displayName ?? "Teknisi tidak tersedia")
                : "Belum ditugaskan"}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Pembaruan terakhir</dt>
            <dd className="font-medium">{formatTimestamp(relevantTimestamp(workOrder))}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
