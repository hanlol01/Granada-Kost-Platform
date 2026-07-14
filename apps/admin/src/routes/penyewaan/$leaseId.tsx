import { createFileRoute } from "@tanstack/react-router";
import { LeaseDetailPage } from "@/components/leases/LeaseDetailPage";
import {
  isLeaseUuid,
  normalizeLeaseDetailSearch,
  type LeaseDetailRouteSearch,
} from "@/lib/admin-ux-lease-helpers";

type RouteSearch = LeaseDetailRouteSearch & Record<string, unknown>;

function validateSearch(raw: Record<string, unknown>): RouteSearch {
  return { ...raw, ...normalizeLeaseDetailSearch(raw) };
}

export const Route = createFileRoute("/penyewaan/$leaseId")({
  parseParams: (params) => {
    if (!isLeaseUuid(params.leaseId)) throw new Error("LEASE_ID_INVALID");
    return params;
  },
  validateSearch,
  component: DetailPenyewaanRoute,
});

function DetailPenyewaanRoute() {
  const { leaseId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <LeaseDetailPage
      leaseId={leaseId}
      search={{ panel: search.panel, tab: search.tab }}
      onSearchChange={(next) => navigate({ search: (current) => ({ ...current, ...next }) })}
      onOpenLease={(nextLeaseId) =>
        navigate({
          to: "/penyewaan/$leaseId",
          params: { leaseId: nextLeaseId },
          search: { panel: "detail", tab: "ringkasan" },
        })
      }
    />
  );
}
