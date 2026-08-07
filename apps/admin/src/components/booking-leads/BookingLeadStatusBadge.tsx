import {
  BadgeCheck,
  CircleDot,
  Clock3,
  Handshake,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { BookingLeadStatus } from "@/lib/admin-booking-lead";
import { cn } from "@/lib/utils";

type StatusPresentation = {
  className: string;
  icon: LucideIcon;
};

const STATUS_PRESENTATION: Record<BookingLeadStatus, StatusPresentation> = {
  new: {
    className:
      "border-amber-600/35 bg-amber-100 text-amber-950 dark:border-amber-300/35 dark:bg-amber-300/15 dark:text-amber-100",
    icon: CircleDot,
  },
  contacted: {
    className:
      "border-sky-600/35 bg-sky-100 text-sky-950 dark:border-sky-300/35 dark:bg-sky-300/15 dark:text-sky-100",
    icon: BadgeCheck,
  },
  visit_scheduled: {
    className:
      "border-slate-500/35 bg-slate-100 text-slate-800 dark:border-slate-300/30 dark:bg-slate-300/10 dark:text-slate-100",
    icon: Clock3,
  },
  negotiating: {
    className:
      "border-violet-600/35 bg-violet-100 text-violet-950 dark:border-violet-300/35 dark:bg-violet-300/15 dark:text-violet-100",
    icon: Handshake,
  },
  awaiting_dp: {
    className:
      "border-orange-600/35 bg-orange-100 text-orange-950 dark:border-orange-300/35 dark:bg-orange-300/15 dark:text-orange-100",
    icon: Clock3,
  },
  onboarding: {
    className:
      "border-indigo-600/35 bg-indigo-100 text-indigo-950 dark:border-indigo-300/35 dark:bg-indigo-300/15 dark:text-indigo-100",
    icon: Handshake,
  },
  leased: {
    className:
      "border-emerald-600/35 bg-emerald-100 text-emerald-950 dark:border-emerald-300/35 dark:bg-emerald-300/15 dark:text-emerald-100",
    icon: BadgeCheck,
  },
  converted: {
    className:
      "border-teal-600/35 bg-teal-100 text-teal-950 dark:border-teal-300/35 dark:bg-teal-300/15 dark:text-teal-100",
    icon: BadgeCheck,
  },
  rejected: {
    className:
      "border-red-600/35 bg-red-100 text-red-950 dark:border-red-300/35 dark:bg-red-300/15 dark:text-red-100",
    icon: XCircle,
  },
  expired: {
    className:
      "border-slate-500/35 bg-slate-100 text-slate-800 dark:border-slate-300/30 dark:bg-slate-300/10 dark:text-slate-100",
    icon: Clock3,
  },
  cancelled: {
    className:
      "border-rose-600/35 bg-rose-100 text-rose-950 dark:border-rose-300/35 dark:bg-rose-300/15 dark:text-rose-100",
    icon: ShieldAlert,
  },
};

export function BookingLeadStatusBadge({
  status,
  label,
  className,
}: {
  status: BookingLeadStatus;
  label: string;
  className?: string;
}) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 whitespace-nowrap shadow-sm",
        presentation.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}
