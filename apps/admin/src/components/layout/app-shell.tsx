import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppBreadcrumb } from "./Breadcrumb";
import { RegistryBottomNav, RegistrySidebar } from "./registry-navigation";
import { UserMenu } from "./user-menu";
import "./app-shell.css";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leadingAction?: ReactNode;
  eyebrow?: string;
  sidebar?: ReactNode;
  bottomNavigation?: ReactNode;
  breadcrumb?: ReactNode;
  notificationAction?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  actions,
  leadingAction,
  eyebrow,
  sidebar = <RegistrySidebar />,
  bottomNavigation = <RegistryBottomNav />,
  breadcrumb = <AppBreadcrumb />,
  notificationAction,
  contentClassName,
  children,
}: Props) {
  // Dark is the product default. A previously saved light preference remains
  // respected so changing the default does not unexpectedly override a user's
  // explicit choice on this device.
  const [dark, setDark] = useState(true);
  const headerRef = useRef<HTMLElement>(null);
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

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

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          ref={headerRef}
          data-header-visible={headerVisible}
          className="app-shell-header sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur"
        >
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 md:px-8 md:py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {leadingAction ? <div className="shrink-0">{leadingAction}</div> : null}
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="mb-0.5 truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="truncate text-lg font-semibold tracking-tight text-foreground md:text-2xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-0.5 max-w-[min(60vw,42rem)] truncate text-xs text-muted-foreground sm:text-sm">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="app-shell-actions flex min-w-0 max-w-[52vw] shrink-0 items-center justify-end gap-1 overflow-x-auto sm:max-w-[62vw] sm:gap-2 md:max-w-none">
              {actions}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDark}
                aria-label="Ubah tema"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              {notificationAction ?? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  aria-label="Notifikasi"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                </Button>
              )}
              <UserMenu />
            </div>
          </div>
        </header>
        {breadcrumb ? (
          <div className="app-shell-breadcrumb border-b border-border/70 bg-muted/20 px-4 py-2 md:px-8">
            {breadcrumb}
          </div>
        ) : null}
        <main
          className={cn("flex-1 animate-fade-in px-4 py-6 pb-24 md:px-8 lg:pb-6", contentClassName)}
        >
          {children}
        </main>
      </div>
      {bottomNavigation}
    </div>
  );
}
