import { createFileRoute } from "@tanstack/react-router";
import { LeaseListPage } from "@/components/leases/LeaseListPage";
import { normalizeLeaseListSearch } from "@/lib/admin-ux-lease-helpers";

type RouteSearch = {
  q: string;
  status?: "active" | "ended" | "cancelled" | "transferred";
  overdue: boolean;
  resident_id?: string;
  room_id?: string;
  kost_type_id?: string;
  offset: number;
  limit: number;
};

function validateSearch(raw: Record<string, unknown>): RouteSearch {
  const search = normalizeLeaseListSearch(raw);
  return {
    q: search.q,
    status: search.status,
    overdue: search.overdue,
    resident_id: search.residentId,
    room_id: search.roomId,
    kost_type_id: search.kostTypeId,
    offset: search.offset,
    limit: search.limit,
  };
}

export const Route = createFileRoute("/penyewaan/")({
  validateSearch,
  component: PenyewaanIndexRoute,
});

function PenyewaanIndexRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LeaseListPage
      search={{
        q: search.q,
        status: search.status,
        overdue: search.overdue,
        residentId: search.resident_id,
        roomId: search.room_id,
        kostTypeId: search.kost_type_id,
        offset: search.offset,
        limit: search.limit,
      }}
      onSearchChange={(next) =>
        navigate({
          search: (current) => ({
            q: Object.prototype.hasOwnProperty.call(next, "q") ? (next.q ?? "") : current.q,
            status: Object.prototype.hasOwnProperty.call(next, "status")
              ? next.status
              : current.status,
            overdue: Object.prototype.hasOwnProperty.call(next, "overdue")
              ? (next.overdue ?? false)
              : current.overdue,
            resident_id: Object.prototype.hasOwnProperty.call(next, "residentId")
              ? next.residentId
              : current.resident_id,
            room_id: Object.prototype.hasOwnProperty.call(next, "roomId")
              ? next.roomId
              : current.room_id,
            kost_type_id: Object.prototype.hasOwnProperty.call(next, "kostTypeId")
              ? next.kostTypeId
              : current.kost_type_id,
            offset: Object.prototype.hasOwnProperty.call(next, "offset")
              ? (next.offset ?? 0)
              : current.offset,
            limit: current.limit,
          }),
        })
      }
    />
  );
}
