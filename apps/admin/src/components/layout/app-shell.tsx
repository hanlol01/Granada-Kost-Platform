import { useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppBreadcrumb } from "./Breadcrumb";
import { RegistryMobileSidebar, RegistrySidebar } from "./registry-navigation";
import { UserMenu } from "./user-menu";
import { AdminNotificationBell } from "@/components/notifications/RoleNotifications";
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
  bottomNavigation,
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
          <div className="app-shell-header-layout grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 px-4 py-3 md:px-8 md:py-3.5">
            {sidebar === null ? null : <RegistryMobileSidebar />}
            <div
              className={cn(
                "flex min-w-0 items-center gap-2",
                sidebar === null ? "col-start-1 row-start-1" : "col-span-2 row-start-2",
                "lg:col-span-1 lg:row-start-1",
              )}
            >
              {leadingAction ? <div className="shrink-0">{leadingAction}</div> : null}
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="mb-0.5 truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="line-clamp-2 break-words text-lg font-semibold tracking-tight text-foreground md:text-2xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground sm:text-sm">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="app-shell-controls col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDark}
                aria-label="Ubah tema"
                className="h-11 w-11 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              {notificationAction ?? <AdminNotificationBell />}
              <UserMenu />
            </div>
            {actions ? (
              <div className="app-shell-actions col-span-2 flex min-w-0 flex-wrap items-center gap-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-end">
                {actions}
              </div>
            ) : null}
          </div>
        </header>
        {breadcrumb ? (
          <div className="app-shell-breadcrumb border-b border-border/70 bg-muted/20 px-4 py-2 md:px-8">
            {breadcrumb}
          </div>
        ) : null}
        <main className={cn("flex-1 animate-fade-in px-4 py-6 md:px-8", contentClassName)}>
          {children}
        </main>
      </div>
      {bottomNavigation}
    </div>
  );
}
