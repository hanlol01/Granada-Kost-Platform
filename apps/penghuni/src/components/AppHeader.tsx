import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell } from "lucide-react";
import "./AppHeader.css";

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
  const headerRef = useRef<HTMLElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const focusedInHeader = headerRef.current?.contains(document.activeElement) ?? false;

      if (focusedInHeader || currentScrollY < 12) {
        setHeaderVisible(true);
      } else if (currentScrollY > lastScrollY + 4) {
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY - 4) {
        setHeaderVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      data-header-visible={headerVisible}
      className="resident-app-header sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl"
    >
      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
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
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
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
