import { createFileRoute, redirect } from "@tanstack/react-router";
import { LeaseCreatePage } from "@/components/leases/LeaseCreatePage";

export const Route = createFileRoute("/penyewaan/tambah")({
  beforeLoad: () => {
    throw redirect({
      to: "/tenants",
      search: { flow: "new-lease" },
      replace: true,
    });
  },
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
