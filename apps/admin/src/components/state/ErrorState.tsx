import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeErrorMessage } from "@/lib/error-normalizer";

type Props = {
  error: unknown;
  onRetry?: () => void;
  title?: string;
};

export function ErrorState({ error, onRetry, title = "Gagal memuat data" }: Props) {
  return (
    <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="max-w-md">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{safeErrorMessage(error)}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button className="bg-blue-600 text-white hover:bg-blue-500" onClick={onRetry}>
            Coba Lagi
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link to="/">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
