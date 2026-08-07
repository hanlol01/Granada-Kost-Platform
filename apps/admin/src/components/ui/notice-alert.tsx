import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type NoticeAlertTone = "primary" | "info" | "success" | "warning" | "destructive";

const toneClasses: Record<NoticeAlertTone, string> = {
  primary: "border-primary/30 bg-primary/10 text-foreground [&>svg]:text-primary",
  info: "border-info/30 bg-info/10 text-foreground [&>svg]:text-info",
  success: "border-success/30 bg-success/10 text-foreground [&>svg]:text-success",
  warning: "border-warning/35 bg-warning/10 text-foreground [&>svg]:text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-foreground [&>svg]:text-destructive",
};

export function NoticeAlert({
  title,
  description,
  tone = "info",
  className,
  onDismiss,
  dismissLabel = "Tutup pemberitahuan",
}: {
  title: ReactNode;
  description?: ReactNode;
  tone?: NoticeAlertTone;
  className?: string;
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

  return (
    <Alert
      variant={tone === "destructive" ? "destructive" : "default"}
      className={cn(
        "rounded-xl border px-4 py-3 shadow-none [&>svg]:top-3.5 [&>svg~*]:pl-7",
        onDismiss && "pr-14",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <div className="min-w-0">
        <AlertTitle className="mb-1 leading-5">{title}</AlertTitle>
        {description ? (
          <AlertDescription className="text-foreground/75">{description}</AlertDescription>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          className="absolute right-1.5 top-1.5 inline-flex size-11 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </Alert>
  );
}
