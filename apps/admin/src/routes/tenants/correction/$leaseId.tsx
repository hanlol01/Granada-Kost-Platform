import { createFileRoute } from "@tanstack/react-router";
import { LeaseDataCorrectionPage } from "@/components/leases/LeaseDataCorrectionPage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/tenants/correction/$leaseId")({
  parseParams: (params) => {
    const leaseId = params.leaseId.trim();
    if (!UUID.test(leaseId)) throw new Error("LEASE_ID_INVALID");
    return { leaseId };
  },
  component: LeaseCorrectionRoute,
});

function LeaseCorrectionRoute() {
  const { leaseId } = Route.useParams();
  return <LeaseDataCorrectionPage leaseId={leaseId} />;
}
