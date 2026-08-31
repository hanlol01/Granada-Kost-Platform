import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminActivityActors,
  useAdminActivityLog,
  useAdminActivityLogDetail,
} from "@/hooks/useAdminActivityLog";
import type { ActivityCategory, ActivityLogItem, ActivityResult } from "@/lib/admin-activity-log";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/activity-logs")({ component: ActivityLogsPage });

const PAGE_LIMIT = 25;
const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  booking: "Booking & onboarding",
  payment: "Pembayaran",
  lease: "Penyewaan & checkout",
  room_occupancy: "Kamar & hunian",
  inspection: "Inspeksi",
  refund: "Refund & reversal",
  notification: "Notifikasi",
  other: "Lainnya",
};
const RESULT_LABELS: Record<ActivityResult, string> = {
  succeeded: "Berhasil",
  pending: "Menunggu",
  rejected: "Ditolak",
  failed: "Gagal",
};

function ActivityLogsPage() {
  const initialRange = useMemo(defaultRange, []);
  const { currentPropertyId } = useProperty();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [result, setResult] = useState<ActivityResult | "all">("all");
  const [actor, setActor] = useState("all");
  const [action, setAction] = useState("");
  const [target, setTarget] = useState("");
  const [reference, setReference] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{ propertyId: string | null; offset: number }>({
    propertyId: currentPropertyId,
    offset: 0,
  });
  const offset = pagination.propertyId === currentPropertyId ? pagination.offset : 0;
  const actorQuery = useAdminActivityActors({ from, to });
  const query = useAdminActivityLog({
    from,
    to,
    category: category === "all" ? undefined : category,
    result: result === "all" ? undefined : result,
    actorType: actor === "system" ? "system" : undefined,
    actorId: actor !== "all" && actor !== "system" ? actor : undefined,
    action: action.trim() || undefined,
    target: target.trim() || undefined,
    reference: reference.trim() || undefined,
    limit: PAGE_LIMIT,
    offset,
  });
  const forbidden =
    !query.hasAccess || (query.error as { status?: unknown } | null | undefined)?.status === 403;
  const resetOffset = () => setPagination({ propertyId: currentPropertyId, offset: 0 });
  const resetFilters = () => {
    const range = defaultRange();
    setFrom(range.from);
    setTo(range.to);
    setCategory("all");
    setResult("all");
    setActor("all");
    setAction("");
    setTarget("");
    setReference("");
    resetOffset();
  };

  return (
    <AppShell
      title="Log Aktivitas"
      subtitle="Jejak operasional dan finansial yang aman, immutable, dan terbatas pada properti aktif"
      actions={
        <Button
          variant="outline"
          onClick={() => {
            void query.refetch();
            void actorQuery.refetch();
          }}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Perbarui
        </Button>
      }
    >
      {forbidden ? (
        <ForbiddenState description="Hanya Admin dengan izin Log Aktivitas yang dapat membuka riwayat lintas modul ini." />
      ) : (
        <div className="space-y-5">
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="flex gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Audit read-only dan property-scoped</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Data bank, file bukti pembayaran, media inspeksi, token, dan payload audit mentah
                  tidak ditampilkan. Halaman ini tidak dapat mengulang atau mengubah transaksi.
                </p>
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="activity-filter-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="activity-filter-heading" className="text-base font-semibold">
                  Filter aktivitas
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rentang bawaan 30 hari · seluruh waktu ditampilkan dalam WIB.
                </p>
              </div>
              <Button variant="destructive" onClick={resetFilters}>
                Reset filter
              </Button>
            </div>
            <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
              <LabeledInput label="Mulai tanggal">
                <Input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    resetOffset();
                  }}
                />
              </LabeledInput>
              <LabeledInput label="Sampai tanggal">
                <Input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setTo(event.target.value);
                    resetOffset();
                  }}
                />
              </LabeledInput>
              <LabeledInput label="Aktor">
                <Select
                  value={actor}
                  onValueChange={(value) => {
                    setActor(value);
                    resetOffset();
                  }}
                >
                  <SelectTrigger aria-label="Filter aktor">
                    <SelectValue placeholder="Semua aktor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua aktor</SelectItem>
                    {(actorQuery.data ?? []).map((item) => (
                      <SelectItem key={item.id ?? "system"} value={item.id ?? "system"}>
                        {item.display_name} ({item.event_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabeledInput>
              <LabeledInput label="Hasil">
                <Select
                  value={result}
                  onValueChange={(value) => {
                    setResult(value as ActivityResult | "all");
                    resetOffset();
                  }}
                >
                  <SelectTrigger aria-label="Filter hasil aktivitas">
                    <SelectValue placeholder="Semua hasil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua hasil</SelectItem>
                    {Object.entries(RESULT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabeledInput>
              <SearchInput
                label="Aktivitas"
                value={action}
                placeholder="Contoh: payment_verified"
                onChange={(value) => {
                  setAction(value);
                  resetOffset();
                }}
              />
              <SearchInput
                label="Target"
                value={target}
                placeholder="Penghuni, kamar, atau kode"
                onChange={(value) => {
                  setTarget(value);
                  resetOffset();
                }}
              />
              <SearchInput
                label="Referensi"
                value={reference}
                placeholder="Pembayaran, invoice, korelasi"
                onChange={(value) => {
                  setReference(value);
                  resetOffset();
                }}
              />
              <LabeledInput label="Modul">
                <Select
                  value={category}
                  onValueChange={(value) => {
                    setCategory(value as ActivityCategory | "all");
                    resetOffset();
                  }}
                >
                  <SelectTrigger aria-label="Filter modul aktivitas">
                    <SelectValue placeholder="Semua modul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua modul</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabeledInput>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filter cepat kategori">
              {(Object.keys(CATEGORY_LABELS) as ActivityCategory[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={category === value ? "default" : "outline"}
                  aria-pressed={category === value}
                  onClick={() => {
                    setCategory(category === value ? "all" : value);
                    resetOffset();
                  }}
                >
                  {CATEGORY_LABELS[value]}
                </Button>
              ))}
            </div>
          </section>

          {query.isPending ? (
            <LoadingState label="Memuat Log Aktivitas..." />
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
              title="Gagal memuat Log Aktivitas"
            />
          ) : query.data.data.length === 0 ? (
            <EmptyState
              title="Belum ada aktivitas yang cocok"
              description="Ubah rentang tanggal atau filter untuk melihat jejak audit properti ini."
            />
          ) : (
            <ActivityTable
              items={query.data.data}
              total={query.data.meta.total}
              offset={offset}
              onDetail={setSelectedId}
            />
          )}

          {query.data && query.data.meta.total > PAGE_LIMIT ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_LIMIT, query.data.meta.total)} dari{" "}
                {query.data.meta.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() =>
                    setPagination({
                      propertyId: currentPropertyId,
                      offset: Math.max(0, offset - PAGE_LIMIT),
                    })
                  }
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + PAGE_LIMIT >= query.data.meta.total}
                  onClick={() =>
                    setPagination({ propertyId: currentPropertyId, offset: offset + PAGE_LIMIT })
                  }
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <ActivityDetailDialog activityId={selectedId} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}

function ActivityTable({
  items,
  total,
  offset,
  onDetail,
}: {
  items: ActivityLogItem[];
  total: number;
  offset: number;
  onDetail: (id: string) => void;
}) {
  return (
    <section aria-labelledby="activity-result-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="activity-result-heading" className="text-base font-semibold">
            Riwayat aktivitas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} event cocok · terbaru lebih dahulu
          </p>
        </div>
        <Badge variant="outline">Halaman {Math.floor(offset / PAGE_LIMIT) + 1}</Badge>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Waktu
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Aktor
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Aktivitas
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Target
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Hasil
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Perubahan
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-muted/25">
                <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                  {jakartaTime(item.occurred_at)}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium">{item.actor.display_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {actorTypeLabel(item.actor.type)}
                  </p>
                </td>
                <td className="max-w-[260px] px-4 py-4">
                  <p className="font-semibold">{item.action_label}</p>
                </td>
                <td className="max-w-[220px] px-4 py-4 text-xs">{targetSummary(item)}</td>
                <td className="px-4 py-4">
                  <ResultBadge result={item.result} />
                </td>
                <td className="max-w-[260px] px-4 py-4 text-xs text-muted-foreground">
                  {item.change_summary[0]
                    ? changeText(item.change_summary[0])
                    : "Tidak ada perubahan scalar yang ditampilkan"}
                </td>
                <td className="px-4 py-4 text-right">
                  <Button size="sm" onClick={() => onDetail(item.id)}>
                    Detail
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActivityDetailDialog({
  activityId,
  onClose,
}: {
  activityId: string | null;
  onClose: () => void;
}) {
  const query = useAdminActivityLogDetail(activityId);
  return (
    <Dialog open={Boolean(activityId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail Log Aktivitas</DialogTitle>
          <DialogDescription>
            Rincian aman dan read-only dari event audit terpilih.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState label="Memuat detail aktivitas..." />
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Detail aktivitas tidak dapat dimuat"
          />
        ) : query.data ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-muted/30 p-4">
              <div>
                <h3 className="font-semibold">{query.data.action_label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{query.data.event_type}</p>
              </div>
              <ResultBadge result={query.data.result} />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Waktu" value={jakartaTime(query.data.occurred_at)} />
              <Detail
                label="Aktor"
                value={`${query.data.actor.display_name} · ${actorTypeLabel(query.data.actor.type)}`}
              />
              <Detail label="Event ID" value={query.data.id} mono />
              <Detail label="Korelasi" value={query.data.correlation_id ?? "Tidak tersedia"} mono />
              <Detail
                label="Resource"
                value={`${resourceTypeLabel(query.data.target.resource_type)} · ${query.data.target.resource_id ?? "tanpa ID"}`}
                mono
              />
              <Detail label="Kategori" value={CATEGORY_LABELS[query.data.category]} />
            </dl>
            <RelatedTargets item={query.data} />
            <section aria-labelledby="change-detail-heading">
              <h3 id="change-detail-heading" className="text-sm font-semibold">
                Ringkasan perubahan
              </h3>
              {query.data.change_summary.length ? (
                <div className="mt-2 overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Field</th>
                        <th className="px-3 py-2">Sebelum</th>
                        <th className="px-3 py-2">Sesudah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {query.data.change_summary.map((change) => (
                        <tr key={change.field}>
                          <td className="px-3 py-2 font-medium">{fieldLabel(change.field)}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {scalarText(change.before, change.field)}
                          </td>
                          <td className="px-3 py-2">{scalarText(change.after, change.field)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Tidak ada perubahan scalar aman untuk event ini.
                </p>
              )}
            </section>
            {query.data.reason ? (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <h3 className="text-sm font-semibold">Alasan administratif</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {query.data.reason}
                </p>
              </section>
            ) : null}
            {query.data.evidence_references.length ? (
              <section>
                <h3 className="text-sm font-semibold">Referensi terkait</h3>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {query.data.evidence_references.map((reference) => (
                    <li
                      key={`${reference.kind}-${reference.reference}`}
                      className="rounded-lg bg-muted p-3"
                    >
                      {fieldLabel(reference.kind)} ·{" "}
                      <span className="font-mono">{reference.reference}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RelatedTargets({ item }: { item: ActivityLogItem }) {
  const targets = [
    item.target.resident
      ? {
          label: `Penghuni · ${item.target.resident.display_name}`,
          node: (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/tenants/$residentId"
              params={{ residentId: item.target.resident.id }}
            >
              Buka detail penghuni
            </Link>
          ),
        }
      : null,
    item.target.room
      ? {
          label: `Kamar · ${item.target.room.number}`,
          node: (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/rooms/$roomNumber"
              params={{ roomNumber: item.target.room.number }}
            >
              Buka detail kamar
            </Link>
          ),
        }
      : null,
    item.target.lease
      ? {
          label: `Penyewaan · ${item.target.lease.code}`,
          node: (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/penyewaan/$leaseId"
              params={{ leaseId: item.target.lease.id }}
            >
              Buka detail penyewaan
            </Link>
          ),
        }
      : null,
    item.target.payment
      ? {
          label: `Pembayaran · ${item.target.payment.code}`,
          node: (
            <Link className="text-primary underline-offset-4 hover:underline" to="/payments">
              Buka halaman pembayaran
            </Link>
          ),
        }
      : null,
  ].filter((value) => value !== null);
  if (!targets.length) return null;
  return (
    <section aria-labelledby="related-target-heading">
      <h3 id="related-target-heading" className="text-sm font-semibold">
        Target terkait
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {targets.map((target) => (
          <div key={target.label} className="rounded-xl border p-3 text-sm">
            <p className="font-medium">{target.label}</p>
            <div className="mt-2 text-xs">{target.node}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function SearchInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <LabeledInput label={label}>
      <span className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="pl-9"
        />
      </span>
    </LabeledInput>
  );
}
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
function ResultBadge({ result }: { result: ActivityResult }) {
  const className =
    result === "succeeded"
      ? "border-success/30 bg-success/10 text-success"
      : result === "pending"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <Badge variant="outline" className={className}>
      {RESULT_LABELS[result]}
    </Badge>
  );
}
function targetSummary(item: ActivityLogItem) {
  return (
    item.target.resident?.display_name ??
    item.target.room?.number ??
    item.target.lease?.code ??
    item.target.payment?.code ??
    item.target.invoice?.code ??
    `${resourceTypeLabel(item.target.resource_type)} · ${item.target.resource_id?.slice(0, 8) ?? "tanpa ID"}`
  );
}
function changeText(change: ActivityLogItem["change_summary"][number]) {
  return `${fieldLabel(change.field)}: ${scalarText(change.before, change.field)} → ${scalarText(change.after, change.field)}`;
}
function fieldLabel(value: string) {
  const labels: Record<string, string> = {
    amount: "Nominal",
    total_amount: "Total nominal",
    rent_credit_amount: "Kredit sewa",
    shortfall_amount: "Kekurangan pembayaran",
    checkpoint_shortfall_amount: "Kekurangan checkpoint",
    recommended_refund_amount: "Rekomendasi refund",
    approved_refund_amount: "Refund disetujui",
    refund_amount: "Nominal refund",
    amount_due: "Sisa yang harus dibayar",
    deposit_offset_amount: "Potongan deposit untuk sewa",
    deduction_amount: "Potongan deposit",
    payment_status: "Status pembayaran",
    invoice_status: "Status invoice",
    lease_status: "Status penyewaan",
    resident_status: "Status penghuni",
    room_status: "Status kamar",
    checkpoint_status: "Status checkpoint",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}
function scalarText(value: string | number | boolean | null, field?: string) {
  return value === null
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Ya"
        : "Tidak"
      : typeof value === "number" && field && moneyField(field)
        ? formatRupiah(value)
        : String(value);
}
function moneyField(field: string) {
  return new Set([
    "amount",
    "total_amount",
    "rent_credit_amount",
    "shortfall_amount",
    "checkpoint_shortfall_amount",
    "recommended_refund_amount",
    "approved_refund_amount",
    "refund_amount",
    "amount_due",
    "deposit_offset_amount",
    "deduction_amount",
  ]).has(field);
}
function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
function actorTypeLabel(type: ActivityLogItem["actor"]["type"]) {
  return type === "system" ? "Sistem" : type === "admin" ? "Admin" : "Sumber terotorisasi";
}
function resourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    booking_lead_hold: "Penahanan minat booking",
    booking_lead_payment_commitment: "Komitmen pembayaran minat booking",
    booking_lead_payment_commitment_refund: "Refund komitmen minat booking",
    booking_lead: "Minat booking",
    payment: "Pembayaran",
    payment_proof: "Bukti pembayaran",
    payment_reversal: "Pembalikan pembayaran",
    invoice: "Invoice",
    lease: "Penyewaan",
    lease_checkout_command: "Proses check-out",
    lease_settlement_checkpoint: "Checkpoint pelunasan",
    resident: "Penghuni",
    room: "Kamar",
    notification: "Notifikasi",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}
function jakartaTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
function jakartaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value);
}
function defaultRange() {
  const to = jakartaDate(new Date());
  const fromDate = new Date(`${to}T00:00:00+07:00`);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: jakartaDate(fromDate), to };
}
