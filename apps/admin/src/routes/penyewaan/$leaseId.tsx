import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/state";
import { useM6Lease } from "@/hooks/useAdminUxLeases";
import { isLeaseUuid } from "@/lib/admin-ux-lease-helpers";

export const Route = createFileRoute("/penyewaan/$leaseId")({
  parseParams: (params) => {
    if (!isLeaseUuid(params.leaseId)) throw new Error("LEASE_ID_INVALID");
    return params;
  },
  component: DetailPenyewaanRoute,
});

function DetailPenyewaanRoute() {
  const { leaseId } = Route.useParams();
  const detailQuery = useM6Lease(leaseId);
  const detail = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <AppShell
        title="Mengalihkan ke detail penghuni"
        subtitle="Membuka konteks penghuni penyewaan"
      >
        <LoadingState label="Menyiapkan detail penghuni..." />
      </AppShell>
    );
  }

  if (detailQuery.error || !detail) {
    return (
      <AppShell title="Detail penghuni tidak tersedia" subtitle="Penyewaan tidak dapat dialihkan">
        <ErrorState
          error={detailQuery.error ?? new Error("Data penyewaan tidak ditemukan.")}
          title="Detail penghuni tidak dapat dibuka"
          onRetry={() => void detailQuery.refetch()}
        />
      </AppShell>
    );
  }

  return (
    <Navigate to="/tenants/$residentId" params={{ residentId: detail.lease.resident.id }} replace />
  );
}
