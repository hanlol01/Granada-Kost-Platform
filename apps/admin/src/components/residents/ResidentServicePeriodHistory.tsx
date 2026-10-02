import { useQuery } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Period = { startDate: string; endDate: string; servicePeriodPending?: boolean };
type Entry = {
  id: string;
  sequence_number: number;
  source: string;
  previous_snapshot: Period;
  effective_snapshot: Period;
  reason: string;
  created_at: string;
  created_by_name: string | null;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(value),
  );
const period = (value: Period) => {
  if (value.servicePeriodPending) return "Belum dimulai—menunggu check-in";
  const lastDay = new Date(`${value.endDate}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return `${date(value.startDate)} – ${date(lastDay.toISOString())}`;
};

export function ResidentServicePeriodHistory({
  leaseId,
  propertyId,
}: {
  leaseId: string;
  propertyId: string | null;
}) {
  const history = useQuery({
    queryKey: ["lease-service-period-history", propertyId, leaseId],
    enabled: !!propertyId,
    queryFn: async ({ signal }) => {
      const response = await adminUxV2Requester.get<{ data: Entry[] }>(
        `/leases/${encodeURIComponent(leaseId)}/service-period/history?${new URLSearchParams({ property_id: propertyId! })}`,
        { signal },
      );
      if (
        !Array.isArray(response.data) ||
        response.data.some(
          (entry) =>
            !entry.id ||
            !Number.isSafeInteger(entry.sequence_number) ||
            typeof entry.reason !== "string" ||
            !Number.isFinite(Date.parse(entry.created_at)) ||
            !entry.previous_snapshot ||
            !entry.effective_snapshot ||
            !Number.isFinite(Date.parse(entry.effective_snapshot.startDate)) ||
            !Number.isFinite(Date.parse(entry.effective_snapshot.endDate)) ||
            !Number.isFinite(Date.parse(entry.previous_snapshot.startDate)) ||
            !Number.isFinite(Date.parse(entry.previous_snapshot.endDate)),
        )
      )
        throw new Error("Riwayat periode belum dapat dibaca. Muat ulang data.");
      return response.data;
    },
  });
  if (!history.isLoading && !history.isError && !history.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Riwayat penetapan periode sewa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tanggal dan nominal pembayaran tetap menggunakan catatan asli. Dokumen terbaru mengikuti
          periode yang terakhir ditetapkan; kuitansi asli tetap tersedia pada riwayat pembayaran.
        </p>
        {history.isLoading ? (
          <p role="status">Memuat riwayat periode...</p>
        ) : history.isError ? (
          <div role="alert">
            <p>Riwayat periode belum dapat dimuat. Catatan penyewaan tetap tersimpan.</p>
            <Button variant="outline" onClick={() => void history.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <ol className="space-y-3">
            {history.data?.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border p-4 text-sm">
                <p className="font-semibold">
                  Versi {entry.sequence_number} ·{" "}
                  {entry.source === "physical_check_in"
                    ? "Check-in fisik"
                    : "Koreksi tanggal check-in"}
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <dt className="text-muted-foreground">Sebelumnya</dt>
                  <dd>{period(entry.previous_snapshot)}</dd>
                  <dt className="text-muted-foreground">Periode berlaku</dt>
                  <dd>{period(entry.effective_snapshot)}</dd>
                  <dt className="text-muted-foreground">Alasan</dt>
                  <dd className="break-words">{entry.reason}</dd>
                  <dt className="text-muted-foreground">Dicatat oleh</dt>
                  <dd>
                    {entry.created_by_name ?? "Pihak Pengelola"} · {date(entry.created_at)}
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
