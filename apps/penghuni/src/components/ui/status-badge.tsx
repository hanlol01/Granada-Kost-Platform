import { CheckCircle2, Circle, Clock3, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral:
    "border-slate-500/35 bg-slate-100 text-slate-800 dark:border-slate-300/30 dark:bg-slate-300/10 dark:text-slate-100",
  info: "border-sky-600/35 bg-sky-100 text-sky-950 dark:border-sky-300/35 dark:bg-sky-300/15 dark:text-sky-100",
  success:
    "border-emerald-600/35 bg-emerald-100 text-emerald-950 dark:border-emerald-300/35 dark:bg-emerald-300/15 dark:text-emerald-100",
  warning:
    "border-amber-600/35 bg-amber-100 text-amber-950 dark:border-amber-300/35 dark:bg-amber-300/15 dark:text-amber-100",
  danger:
    "border-rose-600/35 bg-rose-100 text-rose-950 dark:border-rose-300/35 dark:bg-rose-300/15 dark:text-rose-100",
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
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 shadow-sm",
        toneClasses[tone],
        className,
      )}
    >
      <StatusIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
