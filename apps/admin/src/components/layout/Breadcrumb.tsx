import { Link, useRouterState } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getRouteBreadcrumbs, type RouteAccessContext } from "@/lib/admin-route-registry";
import { useAuth } from "@/lib/auth";

export function AppBreadcrumb() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user } = useAuth();
  const access: RouteAccessContext = {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
  };
  const crumbs = getRouteBreadcrumbs(pathname, access);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb className="mt-1.5">
      <BreadcrumbList className="text-xs">
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          const label = crumb.safeLabel ? crumb.safeLabel({}) : crumb.label;
          const canLink = !isCurrent && Boolean(crumb.to) && crumb.to !== pathname;

          return (
            <BreadcrumbItem key={crumb.id}>
              {canLink ? (
                <BreadcrumbLink asChild>
                  <Link
                    to={crumb.to as never}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className={isCurrent ? "text-foreground" : "text-muted-foreground"}>
                  {label}
                </BreadcrumbPage>
              )}
              {!isCurrent ? <BreadcrumbSeparator className="text-muted-foreground" /> : null}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
