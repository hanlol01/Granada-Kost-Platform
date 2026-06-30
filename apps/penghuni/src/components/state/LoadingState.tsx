import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Memuat..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
