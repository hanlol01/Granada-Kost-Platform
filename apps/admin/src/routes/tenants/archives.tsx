import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { LeaseArchiveWorkspace } from "@/components/leases/LeaseArchiveWorkspace";

export const Route = createFileRoute("/tenants/archives")({ component: ArchivesRoute });
function ArchivesRoute() {
  const detail = useRouterState({ select: (state) => state.matches.some((match) => match.routeId === "/tenants/archives/$archiveId") });
  return detail ? <Outlet /> : <LeaseArchiveWorkspace />;
}
