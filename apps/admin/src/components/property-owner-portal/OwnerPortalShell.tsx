import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Menu,
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
import "./owner-portal.css";

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
  onNavigate,
}: {
  route: OwnerPortalRouteMetadata;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = routeIcons[route.id];
  const active = isOwnerPortalRouteActive(route, pathname);

  return (
    <Link
      to={route.to as never}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : "false"}
      className="owner-nav-link relative flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--owner-nav-background)]"
    >
      {active ? <span className="absolute inset-y-3 left-1 w-1 rounded-full bg-white" /> : null}
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{route.label}</span>
    </Link>
  );
}

function OwnerPortalNavigationDrawer({
  ownerName,
  historical,
}: {
  ownerName: string;
  historical: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routes = getVisibleOwnerPortalRoutes(historical);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 border-primary/30 bg-primary/10 text-primary shadow-sm hover:bg-primary/15"
          aria-label="Buka menu Portal Owner"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="owner-nav-surface owner-nav-drawer flex w-[calc(100%-1rem)] max-w-sm flex-col gap-0 border-r-0 p-0 shadow-2xl [&>button]:h-11 [&>button]:w-11 [&>button]:text-white [&>button]:ring-offset-[var(--owner-nav-background)] [&>button]:hover:bg-white/10"
      >
        <SheetHeader className="owner-dashboard-finance-rule border-b px-5 py-6 pr-16 text-left">
          <div className="flex items-center gap-3">
            <img
              src="/images/brand/kostation-mark.png"
              alt="Kostation"
              className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm"
            />
            <div className="min-w-0">
              <SheetTitle className="truncate text-base text-white">Kostation</SheetTitle>
              <p className="truncate text-sm text-[var(--owner-nav-muted)]">
                Portal Pemilik Properti
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 py-5">
          <div className="rounded-xl bg-[var(--owner-nav-panel)] px-4 py-4">
            <p className="truncate text-base font-semibold text-white">{ownerName}</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--owner-nav-muted)]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Akses hanya baca
            </p>
          </div>
        </div>

        <nav
          aria-label="Navigasi Portal Owner"
          className="app-scrollbar flex-1 space-y-1 overflow-y-auto px-4 pb-5"
        >
          {routes.map((route) => (
            <OwnerRouteLink
              key={route.id}
              route={route}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>

        <p className="owner-dashboard-finance-rule border-t px-5 py-5 text-sm leading-6 text-[var(--owner-nav-muted)]">
          Data mengikuti kepemilikan dan periode yang berlaku.
        </p>
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
      className="mt-2 hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex"
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
      className="relative h-11 w-11 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
      subtitle={`${ownerName} · Informasi kepemilikan`}
      leadingAction={<OwnerPortalNavigationDrawer ownerName={ownerName} historical={historical} />}
      sidebar={null}
      bottomNavigation={null}
      breadcrumb={breadcrumb}
      notificationAction={notificationAction}
      contentClassName="pb-8 lg:py-8"
    >
      <div className="owner-portal-root mx-auto w-full max-w-7xl">{children}</div>
    </AppShell>
  );
}
