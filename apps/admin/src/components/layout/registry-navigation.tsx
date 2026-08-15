import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  getVisibleRoutes,
  isRouteActive,
  navSectionLabels,
  type AdminNavSection,
  type AdminRouteMetadata,
  type RouteAccessContext,
} from "@/lib/admin-route-registry";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";
import { cn } from "@/lib/utils";
import { withoutPrimaryRoutes } from "@/lib/kmo-w00-route-integrity";

const SECTION_ORDER: readonly AdminNavSection[] = [
  "master-data",
  "pengelolaan",
  "operasional-terbatas",
  "lainnya",
];

function useRouteAccess(): RouteAccessContext {
  const { user } = useAuth();
  return {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  };
}

function RouteLink({
  route,
  pathname,
  nested = false,
  compact = false,
  onNavigate,
}: {
  route: AdminRouteMetadata;
  pathname: string;
  nested?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = route.icon;
  const active = isRouteActive(route, pathname);

  return (
    <Link
      to={route.to as never}
      search={route.search as never}
      onClick={onNavigate}
      aria-label={compact ? route.label : undefined}
      title={compact ? route.label : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-in-out",
        nested && "ml-3 py-2 text-[13px]",
        compact && "justify-center px-2",
        active
          ? "bg-primary-soft font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className={cn("h-4 w-4 shrink-0", nested && "h-3.5 w-3.5")} />
      {!compact ? <span className="truncate">{route.label}</span> : null}
    </Link>
  );
}

function NavSection({
  section,
  routes,
  pathname,
  compact = false,
}: {
  section: AdminNavSection;
  routes: readonly AdminRouteMetadata[];
  pathname: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const rooms = routes.find((route) => route.id === "rooms");
  const roomChildren = routes.filter(
    (route) => route.parentId === "rooms" && route.navigation?.sidebar,
  );
  const roomActive = Boolean(rooms && isRouteActive(rooms, pathname));
  const storageKey =
    "granada.nav.rooms." + (user?.id ?? "anonymous") + "." + (currentPropertyId ?? "none");
  const [roomsOpen, setRoomsOpen] = useState(roomActive);

  useEffect(() => {
    if (roomActive) {
      setRoomsOpen(true);
      return;
    }
    try {
      setRoomsOpen(window.sessionStorage.getItem(storageKey) === "true");
    } catch {
      setRoomsOpen(false);
    }
  }, [roomActive, storageKey]);

  const toggleRooms = () => {
    const next = !roomsOpen;
    setRoomsOpen(next);
    try {
      window.sessionStorage.setItem(storageKey, String(next));
    } catch {
      // Session state is a convenience, never a navigation dependency.
    }
  };

  const roots = routes.filter((route) => route.navigation?.sidebar && !route.parentId);

  if (roots.length === 0) return null;

  return (
    <section className="space-y-1">
      {compact ? (
        <span className="sr-only">{navSectionLabels[section]}</span>
      ) : (
        <span className="mb-2 block px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {navSectionLabels[section]}
        </span>
      )}
      {roots.map((route) => {
        if (route.id !== "rooms") {
          return <RouteLink key={route.id} route={route} pathname={pathname} compact={compact} />;
        }

        const Icon = route.icon;
        return (
          <div key={route.id}>
            <div className="flex items-center">
              <Link
                to={route.to as never}
                search={route.search as never}
                aria-label={compact ? route.label : undefined}
                title={compact ? route.label : undefined}
                className={cn(
                  "relative flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-in-out",
                  compact && "justify-center px-2",
                  roomActive
                    ? "bg-primary-soft font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {roomActive ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                ) : null}
                <Icon className="h-4 w-4 shrink-0" />
                {!compact ? <span className="truncate">{route.label}</span> : null}
              </Link>
              {!compact ? (
                <button
                  type="button"
                  className="mr-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label={roomsOpen ? "Tutup menu Kamar" : "Buka menu Kamar"}
                  aria-expanded={roomsOpen}
                  onClick={toggleRooms}
                >
                  {roomsOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : null}
            </div>
            {roomsOpen && !compact ? (
              <div className="mt-1 space-y-0.5 border-l border-sidebar-border">
                {roomChildren.map((child) => (
                  <RouteLink key={child.id} route={child} pathname={pathname} nested />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function MoreRoutes({
  routes,
  pathname,
  onNavigate,
}: {
  routes: readonly AdminRouteMetadata[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-5">
      {SECTION_ORDER.map((section) => {
        const sectionRoutes = routes.filter(
          (route) => route.section === section && route.navigation?.sidebar,
        );
        if (sectionRoutes.length === 0) return null;

        return (
          <section key={section} className="space-y-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {navSectionLabels[section]}
            </p>
            {sectionRoutes.map((route) => (
              <RouteLink
                key={route.id}
                route={route}
                pathname={pathname}
                nested={Boolean(route.parentId)}
                onNavigate={onNavigate}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function RegistrySidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const access = useRouteAccess();
  const routes = getVisibleRoutes(access);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || pinned;

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex",
        expanded ? "w-72" : "w-[4.75rem]",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border py-6",
          expanded ? "gap-3 px-6" : "justify-center px-3",
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        {expanded ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">Kos Management</p>
            <p className="truncate text-xs text-muted-foreground">Sistem Pengelolaan</p>
          </div>
        ) : null}
        {expanded ? (
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label={pinned ? "Minimalkan sidebar" : "Pin sidebar tetap terbuka"}
            title={pinned ? "Minimalkan sidebar" : "Pin sidebar tetap terbuka"}
            onClick={() => setPinned((value) => !value)}
          >
            {pinned ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
      <nav
        className={cn(
          "app-scrollbar flex-1 overflow-y-auto py-5",
          expanded ? "space-y-6 px-3" : "space-y-3 px-2",
        )}
      >
        {SECTION_ORDER.map((section) => (
          <NavSection
            key={section}
            section={section}
            routes={routes.filter((route) => route.section === section)}
            pathname={pathname}
            compact={!expanded}
          />
        ))}
      </nav>
    </aside>
  );
}

export function RegistryBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const access = useRouteAccess();
  const routes = getVisibleRoutes(access);
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryRoutes = useMemo(
    () =>
      routes
        .filter((route) => !route.parentId && route.navigation?.mobilePriority !== undefined)
        .sort((left, right) => left.navigation!.mobilePriority! - right.navigation!.mobilePriority!)
        .slice(0, 4),
    [routes],
  );
  const moreRoutes = useMemo(
    () => withoutPrimaryRoutes(routes, primaryRoutes),
    [primaryRoutes, routes],
  );

  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-8px_30px_rgba(0,0,0,0.2)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {primaryRoutes.map((route) => {
            const Icon = route.icon;
            const active = isRouteActive(route, pathname);
            return (
              <Link
                key={route.id}
                to={route.to as never}
                search={route.search as never}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate font-medium">{route.label}</span>
              </Link>
            );
          })}
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Buka menu lainnya"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="font-medium">Lainnya</span>
            </button>
          </SheetTrigger>
        </div>
      </nav>
      <SheetContent
        side="bottom"
        className="app-scrollbar max-h-[80vh] overflow-y-auto border-border bg-background px-5 pb-8"
      >
        <SheetHeader>
          <SheetTitle className="text-foreground">Lainnya</SheetTitle>
        </SheetHeader>
        <div className="mt-5">
          <MoreRoutes
            routes={moreRoutes}
            pathname={pathname}
            onNavigate={() => setMoreOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
