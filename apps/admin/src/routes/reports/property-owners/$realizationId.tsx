import { createFileRoute } from "@tanstack/react-router";
import { OwnerRealizationDetailPage } from "@/components/reports/OwnerRealizationDetailPage";

export const Route = createFileRoute("/reports/property-owners/$realizationId")({
  component: OwnerRealizationDetailRoute,
});

function OwnerRealizationDetailRoute() {
  const { realizationId } = Route.useParams();
  return <OwnerRealizationDetailPage realizationId={realizationId} />;
}
