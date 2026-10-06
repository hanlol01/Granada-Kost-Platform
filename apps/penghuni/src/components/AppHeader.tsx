import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { NotificationBell } from "@granada-kost/ui";
import { Button } from "@/components/ui/button";
import { ResidentProfileMenu } from "@/components/ResidentProfileMenu";
import { useThemePreference } from "@/hooks/useThemePreference";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import "./AppHeader.css";
import { ResidentSidebar } from "./ResidentSidebar";

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
  const { user, status } = useAuth();
  const { dark, toggleDark } = useThemePreference();

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
        <ResidentSidebar />
        {back && (
          <Link
            to="/"
            aria-label="Kembali ke Beranda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 break-words text-base font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="line-clamp-2 break-words text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {status === "authenticated" && user ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleDark}
              aria-label={dark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
              title={dark ? "Mode terang" : "Mode gelap"}
              className="h-11 w-11 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <NotificationBell
              key={user.id}
              client={apiClient}
              accountKey={user.id}
              role="resident"
              allHref="/notifications"
            />
            <ResidentProfileMenu />
          </div>
        ) : null}
      </div>
      {action ? <div className="flex min-w-0 flex-wrap gap-2 px-4 pb-3">{action}</div> : null}
    </header>
  );
}
