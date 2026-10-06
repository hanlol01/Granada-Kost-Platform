import { CheckCircle2, Circle, Clock3, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral:
    "border-slate-500/35 bg-slate-100 text-slate-800 dark:border-slate-200/60 dark:bg-slate-500/30 dark:text-white",
  info: "border-sky-600/35 bg-sky-100 text-sky-950 dark:border-sky-200/60 dark:bg-sky-500/30 dark:text-white",
  success:
    "border-emerald-600/35 bg-emerald-100 text-emerald-950 dark:border-emerald-200/60 dark:bg-emerald-500/30 dark:text-white",
  warning:
    "border-amber-600/35 bg-amber-100 text-amber-950 dark:border-amber-200/60 dark:bg-amber-500/30 dark:text-white",
  danger:
    "border-rose-600/35 bg-rose-100 text-rose-950 dark:border-rose-200/60 dark:bg-rose-500/30 dark:text-white",
};

const toneIcons: Record<StatusTone, LucideIcon> = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: Clock3,
  danger: XCircle,
};

export function StatusBadge({
  label,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  label: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
}) {
  const StatusIcon = Icon ?? toneIcons[tone];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 shadow-sm dark:shadow-black/30",
        toneClasses[tone],
        className,
      )}
    >
      <StatusIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
