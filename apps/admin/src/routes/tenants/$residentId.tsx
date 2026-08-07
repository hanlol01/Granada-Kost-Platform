import { createFileRoute } from "@tanstack/react-router";
import { ResidentDetailWorkspace } from "@/components/residents/ResidentDetailWorkspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/tenants/$residentId")({
  parseParams: (params) => {
    const residentId = params.residentId.trim();
    if (!UUID.test(residentId)) throw new Error("RESIDENT_ID_INVALID");
    return { residentId };
  },
  component: ResidentDetailRoute,
});

function ResidentDetailRoute() {
  const { residentId } = Route.useParams();
  return <ResidentDetailWorkspace residentId={residentId} />;
}
