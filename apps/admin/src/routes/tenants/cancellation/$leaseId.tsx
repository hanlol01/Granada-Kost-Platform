import { createFileRoute } from "@tanstack/react-router";
import { LeaseCancellationPage } from "@/components/leases/LeaseCancellationPage";

export const Route = createFileRoute("/tenants/cancellation/$leaseId")({
  component: () => {
    const { leaseId } = Route.useParams();
    return <LeaseCancellationPage leaseId={leaseId} />;
  },
});
