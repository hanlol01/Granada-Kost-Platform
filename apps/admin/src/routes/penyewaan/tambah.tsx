import { createFileRoute } from "@tanstack/react-router";
import { LeaseCreatePage } from "@/components/leases/LeaseCreatePage";

export const Route = createFileRoute("/penyewaan/tambah")({
  component: TambahPenyewaanRoute,
});

function TambahPenyewaanRoute() {
  const navigate = Route.useNavigate();
  return (
    <LeaseCreatePage
      onCreated={(leaseId) =>
        navigate({
          to: "/penyewaan/$leaseId",
          params: { leaseId },
          search: { panel: "detail", tab: "ringkasan" },
          replace: true,
        })
      }
    />
  );
}
