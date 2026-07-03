import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell } from "lucide-react";
import type { ReactNode } from "react";

export function AppHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-4">
        {back && (
          <Link
            to="/"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action ?? (
          <Link
            to="/notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent"
          >
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
          </Link>
        )}
      </div>
    </header>
  );
}
