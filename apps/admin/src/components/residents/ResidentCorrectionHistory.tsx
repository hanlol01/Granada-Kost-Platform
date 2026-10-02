import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { adminUxLeaseApi } from "@/lib/admin-ux-lease-api";
import type { LeaseDataCorrectionSnapshot } from "@/lib/admin-ux-lease-types";
import { formatIDR } from "@/lib/format";
import { useProperty } from "@/lib/property";

const correctionKinds: Record<string, string> = {
  check_in_date: "Tanggal check-in",
  contract_start: "Tanggal mulai sewa",
  contract_term: "Durasi sewa",
  contract_period: "Periode sewa",
  combined: "Beberapa data penyewaan",
};

function date(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
      ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
    }).format(parsed) + (withTime ? " WIB" : "")
  );
}

const amount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? formatIDR(value) : "—";

function Snapshot({
  title,
  snapshot,
  other,
}: {
  title: string;
  snapshot: Partial<LeaseDataCorrectionSnapshot>;
  other: Partial<LeaseDataCorrectionSnapshot>;
}) {
  const fields: { key: keyof LeaseDataCorrectionSnapshot; label: string; value: string }[] = [
    { key: "checkedInDate", label: "Tanggal check-in", value: date(snapshot.checkedInDate) },
    { key: "startDate", label: "Mulai sewa", value: date(snapshot.startDate) },
    { key: "endDate", label: "Akhir sewa", value: date(snapshot.endDate) },
    {
      key: "termMonths",
      label: "Durasi",
      value: snapshot.termMonths == null ? "—" : `${snapshot.termMonths} bulan`,
    },
    {
      key: "agreedMonthlyPrice",
      label: "Tarif bulanan",
      value: amount(snapshot.agreedMonthlyPrice),
    },
    {
      key: "contractRentAmount",
      label: "Nilai kontrak",
      value: amount(snapshot.contractRentAmount),
    },
  ];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <dl className="space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd
              className={`text-right tabular-nums ${snapshot[field.key] !== other[field.key] ? "font-semibold text-foreground" : "text-foreground"}`}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ResidentCorrectionHistory({ residentId }: { residentId: string }) {
  const { currentPropertyId } = useProperty();
  const history = useQuery({
    queryKey: ["resident-correction-history", currentPropertyId, residentId],
    queryFn: ({ signal }) =>
      adminUxLeaseApi.leases.listResidentDataCorrections(residentId, currentPropertyId!, signal),
    enabled: Boolean(currentPropertyId),
  });
  const records = history.data?.corrections ?? [];
  return (
    <Card id="riwayat-koreksi-penyewaan">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <History className="h-5 w-5 text-primary" /> Riwayat koreksi penyewaan
          {records.length ? (
            <StatusBadge tone="info" label={`${records.length} kali koreksi`} />
          ) : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Catatan dari seluruh kontrak penghuni, termasuk penyewaan yang sudah berakhir.
        </p>
      </CardHeader>
      <CardContent>
        {history.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : history.isError ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-destructive">Riwayat koreksi belum dapat dimuat.</p>
            <Button
              variant="info"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada koreksi data penyewaan yang tercatat.
          </p>
        ) : (
          <ol className="space-y-5">
            {records.map((entry) => (
              <li key={entry.id} className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {entry.roomNumber ?? "Kamar belum tercatat"} · Koreksi ke-
                      {entry.sequenceNumber}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {date(entry.createdAt, true)} ·{" "}
                      {entry.createdByName || "Pencatat tidak tersedia"}
                    </p>
                  </div>
                  <StatusBadge
                    tone="info"
                    label={correctionKinds[entry.correctionKind] ?? "Koreksi penyewaan"}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Alasan koreksi</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {entry.reason || "—"}
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Snapshot
                    title="Sebelum koreksi"
                    snapshot={entry.previous}
                    other={entry.corrected}
                  />
                  <Snapshot
                    title="Setelah koreksi"
                    snapshot={entry.corrected}
                    other={entry.previous}
                  />
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-3 text-sm font-semibold">Dampak keuangan</p>
                  <StatusBadge
                    tone={
                      entry.impact.additionalChargeAmount > 0
                        ? "warning"
                        : entry.impact.contractCreditAmount > 0
                          ? "info"
                          : "neutral"
                    }
                    label={
                      entry.impact.additionalChargeAmount > 0
                        ? `Tambahan kewajiban ${amount(entry.impact.additionalChargeAmount)}`
                        : entry.impact.contractCreditAmount > 0
                          ? `Kredit koreksi ${amount(entry.impact.contractCreditAmount)}`
                          : "Tidak ada perubahan nilai kontrak"
                    }
                  />
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    {[
                      ["Selisih nilai kontrak", entry.impact.contractAmountDelta],
                      [
                        "Pembayaran sewa terverifikasi saat koreksi",
                        entry.impact.verifiedRentPaymentAmount,
                      ],
                      ["Sisa kewajiban setelah koreksi", entry.impact.outstandingAmountAfter],
                      ["Kelebihan pembayaran setelah koreksi", entry.impact.overpaymentAmountAfter],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="mt-1 font-medium tabular-nums">{amount(value as number)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
