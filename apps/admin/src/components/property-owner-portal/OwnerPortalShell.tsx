import { useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  getOwnerPortalRoute,
  getVisibleOwnerPortalRoutes,
  isOwnerPortalRouteActive,
  type OwnerPortalRouteId,
  type OwnerPortalRouteMetadata,
} from "@/lib/property-owner-route-registry";
import { cn } from "@/lib/utils";

const routeIcons: Record<OwnerPortalRouteId, LucideIcon> = {
  dashboard: LayoutDashboard,
  assets: Building2,
  occupancy: UsersRound,
  finance: CircleDollarSign,
  issues: Wrench,
  reports: FileText,
  notifications: Bell,
  account: UserRound,
};

function OwnerRouteLink({
  route,
  pathname,
  compact = false,
  onNavigate,
}: {
  route: OwnerPortalRouteMetadata;
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = routeIcons[route.id];
  const active = isOwnerPortalRouteActive(route, pathname);

  return (
    <Link
      to={route.to as never}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? route.label : undefined}
      title={compact ? route.label : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        compact && "justify-center px-2",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className="h-4 w-4 shrink-0" />
      {!compact ? <span className="truncate">{route.label}</span> : null}
    </Link>
  );
}

function OwnerPortalSidebar({ ownerName, historical }: { ownerName: string; historical: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routes = getVisibleOwnerPortalRoutes(historical);

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Kostation</p>
          <p className="truncate text-xs text-sidebar-foreground/65">Portal Pemilik Properti</p>
        </div>
      </div>

      <div className="px-4 py-5">
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/35 px-4 py-3">
          <p className="truncate text-sm font-semibold">{ownerName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-sidebar-foreground/65">
            <ShieldCheck className="h-3.5 w-3.5" /> Akses hanya baca
          </p>
        </div>
      </div>

      <nav
        aria-label="Navigasi portal owner"
        className="app-scrollbar flex-1 space-y-1 overflow-y-auto px-4 pb-5"
      >
        {routes.map((route) => (
          <OwnerRouteLink key={route.id} route={route} pathname={pathname} />
        ))}
      </nav>

      <p className="border-t border-sidebar-border px-6 py-5 text-xs leading-5 text-sidebar-foreground/60">
        Data mengikuti cakupan kepemilikan dan periode yang berlaku.
      </p>
    </aside>
  );
}

function OwnerPortalBottomNavigation({ historical }: { historical: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routes = getVisibleOwnerPortalRoutes(historical);
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = useMemo(
    () =>
      routes
        .filter((route) => route.mobilePriority !== undefined)
        .sort((left, right) => left.mobilePriority! - right.mobilePriority!)
        .slice(0, 4),
    [routes],
  );
  const more = useMemo(
    () => routes.filter((route) => !primary.some((primaryRoute) => primaryRoute.id === route.id)),
    [primary, routes],
  );

  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <nav
        aria-label="Navigasi portal owner seluler"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-8px_30px_rgba(0,0,0,0.16)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5">
          {primary.map((route) => {
            const Icon = routeIcons[route.id];
            const active = isOwnerPortalRouteActive(route, pathname);
            return (
              <Link
                key={route.id}
                to={route.to as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{route.shortLabel}</span>
              </Link>
            );
          })}
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              aria-label="Buka menu Owner lainnya"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Lainnya</span>
            </button>
          </SheetTrigger>
        </div>
      </nav>

      <SheetContent
        side="bottom"
        className="app-scrollbar max-h-[80vh] overflow-y-auto border-border bg-background px-5 pb-8"
      >
        <SheetHeader>
          <SheetTitle className="text-foreground">Menu Owner lainnya</SheetTitle>
        </SheetHeader>
        <nav aria-label="Menu Owner lainnya" className="mt-5 grid gap-1">
          {more.map((route) => (
            <OwnerRouteLink
              key={route.id}
              route={route}
              pathname={pathname}
              onNavigate={() => setMoreOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function OwnerPortalShell({
  activeRoute,
  ownerName,
  historical,
  unreadNotifications = 0,
  breadcrumbTail,
  children,
}: {
  activeRoute: OwnerPortalRouteId;
  ownerName: string;
  historical: boolean;
  unreadNotifications?: number;
  breadcrumbTail?: string;
  children: ReactNode;
}) {
  const route = getOwnerPortalRoute(activeRoute) ?? getOwnerPortalRoute("dashboard")!;
  const breadcrumb = (
    <nav
      aria-label="Breadcrumb"
      className="mt-2 flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
    >
      <Link to="/property-owners/portal" className="transition-colors hover:text-foreground">
        Portal Owner
      </Link>
      <span aria-hidden="true">/</span>
      <span className={cn("truncate font-medium", !breadcrumbTail && "text-foreground")}>
        {route.label}
      </span>
      {breadcrumbTail ? (
        <>
          <span aria-hidden="true">/</span>
          <span className="truncate font-medium text-foreground">{breadcrumbTail}</span>
        </>
      ) : null}
    </nav>
  );
  const notificationAction = (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <Link to="/property-owners/portal/notifications" aria-label="Buka notifikasi Owner">
        <Bell className="h-4 w-4" />
        {unreadNotifications > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        ) : null}
      </Link>
    </Button>
  );

  return (
    <AppShell
      eyebrow="Portal Owner"
      title={route.label}
      subtitle={`${ownerName} · Informasi sesuai penugasan kepemilikan`}
      sidebar={<OwnerPortalSidebar ownerName={ownerName} historical={historical} />}
      bottomNavigation={<OwnerPortalBottomNavigation historical={historical} />}
      breadcrumb={breadcrumb}
      notificationAction={notificationAction}
      contentClassName="lg:py-8"
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </AppShell>
  );
}
