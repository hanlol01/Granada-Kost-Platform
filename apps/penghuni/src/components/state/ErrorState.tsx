import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@granada-kost/api-client";

type Props = {
  error: unknown;
  onRetry?: () => void;
  title?: string;
};

export function ErrorState({ error, onRetry, title = "Gagal memuat data" }: Props) {
  const apiErr = ApiError.isApiError(error) ? error : null;
  const message =
    apiErr?.message ?? (error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.");
  const cid = apiErr?.correlationId;

  return (
    <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        {cid ? (
          <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            ref: {cid}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}
