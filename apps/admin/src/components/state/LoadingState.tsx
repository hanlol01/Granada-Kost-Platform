import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Memuat..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[40vh] w-full max-w-5xl flex-col gap-5 py-6"
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <p className="text-center text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
