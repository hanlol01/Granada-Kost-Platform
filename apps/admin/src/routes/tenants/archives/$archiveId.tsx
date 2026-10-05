import { createFileRoute } from "@tanstack/react-router";
import { LeaseArchiveWorkspace } from "@/components/leases/LeaseArchiveWorkspace";

export const Route = createFileRoute("/tenants/archives/$archiveId")({ component: () => {
  const { archiveId } = Route.useParams();
  return <LeaseArchiveWorkspace archiveId={archiveId} />;
} });
