import type { CSSProperties, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type NoticeAlertTone = "primary" | "info" | "success" | "warning" | "destructive";
export type NoticeAlertDensity = "default" | "compact";
export type NoticeAlertAttention = "none" | "subtle";

const toneClasses: Record<
  NoticeAlertTone,
  {
    surface: string;
    icon: string;
    title: string;
    description: string;
    dismiss: string;
    accent: string;
  }
> = {
  primary: {
    surface: "border-primary/45 bg-primary/10",
    icon: "bg-primary/15 text-primary",
    title: "text-primary",
    description: "text-foreground/85",
    dismiss: "hover:bg-primary/15 hover:text-primary",
    accent: "var(--primary)",
  },
  info: {
    surface: "border-info/45 bg-info/10",
    icon: "bg-info/15 text-info",
    title: "text-info",
    description: "text-foreground/85",
    dismiss: "hover:bg-info/15 hover:text-info",
    accent: "var(--info)",
  },
  success: {
    surface: "border-success/45 bg-success/10",
    icon: "bg-success/15 text-success",
    title: "text-success",
    description: "text-foreground/85",
    dismiss: "hover:bg-success/15 hover:text-success",
    accent: "var(--success)",
  },
  warning: {
    surface: "border-warning/50 bg-warning/10",
    icon: "bg-warning/15 text-warning",
    title: "text-warning",
    description: "text-foreground/85",
    dismiss: "hover:bg-warning/15 hover:text-warning",
    accent: "var(--warning)",
  },
  destructive: {
    surface: "border-destructive/50 bg-destructive/10",
    icon: "bg-destructive/15 text-destructive",
    title: "text-destructive",
    description: "text-foreground/85",
    dismiss: "hover:bg-destructive/15 hover:text-destructive",
    accent: "var(--destructive)",
  },
};

export function NoticeAlert({
  title,
  description,
  tone = "info",
  density = "default",
  attention = "none",
  className,
  id,
  action,
  onDismiss,
  dismissLabel = "Tutup pemberitahuan",
}: {
  title: ReactNode;
  description?: ReactNode;
  tone?: NoticeAlertTone;
  density?: NoticeAlertDensity;
  attention?: NoticeAlertAttention;
  className?: string;
  id?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? TriangleAlert
        : tone === "destructive"
          ? AlertCircle
          : Info;
  const styles = toneClasses[tone];
  const compact = density === "compact";

  return (
    <Alert
      id={id}
      tabIndex={id ? -1 : undefined}
      variant={tone === "destructive" ? "destructive" : "default"}
      className={cn(
        "relative block overflow-hidden rounded-xl border text-foreground shadow-sm",
        compact ? "px-3 py-3" : "px-4 py-4",
        onDismiss && (compact ? "pr-12" : "pr-14"),
        styles.surface,
        className,
      )}
    >
      {attention === "subtle" ? (
        <span
          aria-hidden="true"
          className="notice-alert__attention"
          style={{ "--notice-alert-accent": styles.accent } as CSSProperties}
        />
      ) : null}
      <div className={cn("relative z-10 flex min-w-0 items-start", compact ? "gap-2.5" : "gap-3")}>
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-lg",
            compact ? "size-7" : "size-9",
            styles.icon,
          )}
          aria-hidden="true"
        >
          <Icon className={compact ? "size-4" : "size-[1.125rem]"} />
        </span>
        <div className="min-w-0 flex-1">
          <AlertTitle
            className={cn(
              "mb-1 font-semibold tracking-[-0.01em]",
              compact ? "text-sm leading-5" : "text-[0.9375rem] leading-5",
              styles.title,
            )}
          >
            {title}
          </AlertTitle>
          {description ? (
            <AlertDescription
              className={cn(
                "max-w-[72ch]",
                compact ? "text-xs leading-5" : "text-sm leading-6",
                styles.description,
              )}
            >
              {description}
            </AlertDescription>
          ) : null}
          {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          className={cn(
            "absolute right-1.5 top-1.5 z-10 inline-flex items-center justify-center rounded-lg text-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            compact ? "size-9" : "size-11",
            styles.dismiss,
          )}
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </Alert>
  );
}
