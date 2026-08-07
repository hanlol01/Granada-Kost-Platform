import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UploadStatusCardState = "preparing" | "uploading" | "success" | "error";

type UploadStatusCardProps = {
  state: UploadStatusCardState;
  title: string;
  description: string;
  onRetry?: () => void;
  className?: string;
};

/** A truthful status surface: network uploads are indeterminate until the API exposes bytes sent. */
export function UploadStatusCard({
  state,
  title,
  description,
  onRetry,
  className,
}: UploadStatusCardProps) {
  const isWorking = state === "preparing" || state === "uploading";
  const isError = state === "error";

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isWorking && "border-primary/20 bg-primary/5",
        state === "success" && "border-emerald-500/25 bg-emerald-500/5",
        isError && "border-destructive/30 bg-destructive/5",
        className,
      )}
      role={isError ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {isWorking ? (
          <Loader2
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary"
            aria-hidden="true"
          />
        ) : state === "success" ? (
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", isError && "text-destructive")}>{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {isWorking ? (
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15"
              role="progressbar"
              aria-label="Unggahan sedang diproses"
              aria-valuetext="Sedang diproses"
            >
              <div className="h-full w-2/5 animate-pulse rounded-full bg-primary" />
            </div>
          ) : null}
        </div>
        {isError && onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/40"
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </Button>
        ) : null}
      </div>
    </div>
  );
}
