/* Hallmark: operational finance workbench; calm blue authority; one primary action per owner row. */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  ListPlus,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ReportNavigation } from "@/components/reports/ReportsWorkspace";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  downloadOwnerSettlementReport,
  ownerSettlementReportApi,
  type OwnerReportReviewStatus,
  type OwnerSettlementDetail,
  type OwnerSettlementFilters,
  type OwnerSettlementReportRow,
} from "@/lib/admin-owner-settlement-report";
import { useProperty } from "@/lib/property";
import "./owner-settlement-workspace.css";

const PAGE_SIZE = 20;

function previousJakartaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  let year = Number(parts.find((part) => part.type === "year")?.value);
  let month = Number(parts.find((part) => part.type === "month")?.value) - 1;
  if (month === 0) {
    year -= 1;
    month = 12;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function rupiah(value: number | string | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(`${value}-01T00:00:00`),
  );
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Belum tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

const reviewLabels: Record<OwnerReportReviewStatus, string> = {
  not_prepared: "Belum disiapkan",
  draft: "Draft",
  ready_for_review: "Menunggu pemeriksaan",
  approved: "Disetujui",
  paid: "Setoran selesai",
  void: "Dibatalkan",
};

function statusTone(status: OwnerReportReviewStatus) {
  if (status === "void") return "danger";
  if (status === "paid" || status === "approved") return "success";
  if (status === "ready_for_review") return "warning";
  if (status === "draft") return "info";
  return "neutral";
}

function StatusBadge({ row }: { row: OwnerSettlementReportRow }) {
  return (
    <div className="owner-report-badges">
      <Badge data-tone={statusTone(row.review_status)}>{reviewLabels[row.review_status]}</Badge>
      <Badge data-tone={row.publication_status === "published" ? "success" : "neutral"}>
        {row.publication_status === "published" ? "Sudah terbit" : "Belum terbit"}
      </Badge>
      <Badge data-tone={row.payout_status === "paid" ? "success" : "neutral"}>
        {row.payout_status === "paid" ? "Sudah disetor" : "Belum disetor"}
      </Badge>
    </div>
  );
}

function nextAction(row: OwnerSettlementReportRow) {
  if (row.review_status === "not_prepared")
    return { action: "prepare" as const, label: "Siapkan laporan", icon: FileText };
  if (row.review_status === "draft")
    return { action: "submit-review" as const, label: "Ajukan pemeriksaan", icon: Send };
  if (row.review_status === "ready_for_review")
    return { action: "approve" as const, label: "Setujui laporan", icon: ShieldCheck };
  if (row.review_status === "approved" && row.publication_status === "not_published") {
    return { action: "publish" as const, label: "Terbitkan untuk Owner", icon: FileCheck2 };
  }
  if (row.review_status === "approved" && Number(row.payout_outstanding) > 0) {
    return { action: "payout" as const, label: "Catat setoran", icon: Landmark };
  }
  if (row.review_status === "void") return null;
  return null;
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  return (
    <article className="owner-report-summary" data-tone={tone}>
      <span className="owner-report-summary__icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

export function OwnerSettlementWorkspace() {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const defaultPeriod = previousJakartaMonth();
  const [draft, setDraft] = useState<OwnerSettlementFilters>({
    property_id: currentPropertyId ?? "",
    period: defaultPeriod,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [applied, setApplied] = useState(draft);
  const [selected, setSelected] = useState<OwnerSettlementReportRow | null>(null);
  const [payoutTarget, setPayoutTarget] = useState<OwnerSettlementReportRow | null>(null);
  const [adjustmentTarget, setAdjustmentTarget] = useState<OwnerSettlementReportRow | null>(null);
  const [notes, setNotes] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [payout, setPayout] = useState({
    amount: 0,
    method: "bank_transfer" as "bank_transfer" | "cash" | "other",
    reference: "",
    destinationMask: "Rekening ****",
    transferredAt: new Date().toISOString().slice(0, 16),
  });
  const [adjustment, setAdjustment] = useState({
    kind: "transfer_proration" as "reversal" | "refund" | "transfer_proration" | "clawback",
    ownerDelta: 0,
    feeDelta: 0,
    earningId: "",
    reason: "",
  });

  useEffect(() => {
    if (!currentPropertyId) return;
    const params = new URLSearchParams(window.location.search);
    const restored: OwnerSettlementFilters = {
      property_id: currentPropertyId,
      period: params.get("period") ?? defaultPeriod,
      q: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      review_status: params.get("review_status") ?? undefined,
      publication_status: params.get("publication_status") ?? undefined,
      payout_status: params.get("payout_status") ?? undefined,
      actionable_only: params.get("actionable_only") ?? undefined,
      limit: PAGE_SIZE,
      offset: Math.max(0, Number(params.get("offset")) || 0),
    };
    setDraft(restored);
    setApplied(restored);
  }, [currentPropertyId, defaultPeriod]);

  const filters = useMemo(
    () => ({ ...applied, property_id: currentPropertyId ?? "", limit: PAGE_SIZE }),
    [applied, currentPropertyId],
  );
  const reports = useQuery({
    queryKey: ["owner-settlement-reports", filters],
    queryFn: () => ownerSettlementReportApi.list(filters),
    enabled: Boolean(currentPropertyId),
    placeholderData: (previous) => previous,
  });
  const detail = useQuery({
    queryKey: ["owner-settlement-detail", currentPropertyId, selected?.owner_id, applied.period],
    queryFn: () =>
      ownerSettlementReportApi.detail(currentPropertyId!, selected!.owner_id, applied.period),
    enabled: Boolean(currentPropertyId && selected),
  });
  const command = useMutation({
    mutationFn: async ({
      row,
      action,
    }: {
      row: OwnerSettlementReportRow;
      action: "prepare" | "submit-review" | "approve" | "publish";
    }) =>
      ownerSettlementReportApi.command(row.owner_id, action, {
        property_id: currentPropertyId!,
        period: applied.period,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success("Tahap laporan Owner berhasil diperbarui.");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-detail"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Tahap laporan gagal diperbarui."),
  });
  const payoutMutation = useMutation({
    mutationFn: (row: OwnerSettlementReportRow) =>
      ownerSettlementReportApi.payout(row.owner_id, {
        property_id: currentPropertyId!,
        period: applied.period,
        amount: payout.amount,
        method: payout.method,
        reference: payout.reference.trim(),
        destination_mask: payout.destinationMask.trim(),
        transferred_at: new Date(payout.transferredAt).toISOString(),
      }),
    onSuccess: async () => {
      toast.success("Setoran Owner berhasil dicatat.");
      setPayoutTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-detail"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Setoran gagal dicatat."),
  });
  const adjustmentMutation = useMutation({
    mutationFn: (row: OwnerSettlementReportRow) =>
      ownerSettlementReportApi.adjustment(row.owner_id, {
        property_id: currentPropertyId!,
        period: applied.period,
        adjustment_kind: adjustment.kind,
        gross_amount_delta: adjustment.ownerDelta + adjustment.feeDelta,
        owner_amount_delta: adjustment.ownerDelta,
        operator_fee_amount_delta: adjustment.feeDelta,
        reason: adjustment.reason.trim(),
        earning_id: adjustment.earningId,
      }),
    onSuccess: async () => {
      toast.success("Penyesuaian laporan berhasil ditambahkan.");
      setAdjustmentTarget(null);
      setAdjustment((current) => ({
        ...current,
        ownerDelta: 0,
        feeDelta: 0,
        earningId: "",
        reason: "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-reports"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-settlement-detail"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Penyesuaian gagal ditambahkan."),
  });

  const set = (key: keyof OwnerSettlementFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value || undefined }));
  const syncUrl = (next: OwnerSettlementFilters) => {
    const url = new URL(window.location.href);
    url.search = "";
    Object.entries(next).forEach(([key, value]) => {
      if (value !== undefined && value !== "" && key !== "property_id" && key !== "limit") {
        url.searchParams.set(key, String(value));
      }
    });
    history.replaceState(null, "", url);
  };
  const apply = () => {
    const next = { ...draft, property_id: currentPropertyId ?? "", limit: PAGE_SIZE, offset: 0 };
    setApplied(next);
    syncUrl(next);
  };
  const reset = () => {
    const next = {
      property_id: currentPropertyId ?? "",
      period: defaultPeriod,
      limit: PAGE_SIZE,
      offset: 0,
    };
    setDraft(next);
    setApplied(next);
    history.replaceState(null, "", window.location.pathname);
  };
  const page = (offset: number) => {
    const next = { ...applied, offset: Math.max(0, offset) };
    setApplied(next);
    syncUrl(next);
  };
  const exportReport = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      await downloadOwnerSettlementReport(format, currentPropertyId!, applied.period);
      toast.success(`Laporan Owner ${format.toUpperCase()} berhasil dibuat.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekspor laporan Owner gagal.");
    } finally {
      setExporting(null);
    }
  };
  const runAction = (row: OwnerSettlementReportRow) => {
    const next = nextAction(row);
    if (!next) return;
    if (next.action === "payout") {
      setPayoutTarget(row);
      setPayout((current) => ({ ...current, amount: Number(row.payout_outstanding) }));
      return;
    }
    command.mutate({ row, action: next.action });
  };

  if (!currentPropertyId) {
    return (
      <AppShell title="Laporan">
        <LoadingState label="Menyiapkan properti..." />
      </AppShell>
    );
  }

  const data = reports.data;
  const start = data?.meta.total ? data.meta.offset + 1 : 0;
  const end = data ? Math.min(data.meta.offset + data.data.length, data.meta.total) : 0;

  return (
    <AppShell title="Laporan" subtitle="Ringkasan resmi untuk operasional dan keuangan properti">
      <main className="owner-report-workspace">
        <ReportNavigation active="property-owners" />

        <section className="owner-report-hero" aria-labelledby="owner-report-heading">
          <div>
            <p className="owner-report-eyebrow">Laporan hak dan setoran Owner</p>
            <h2 id="owner-report-heading">Satu alur pemeriksaan sebelum angka dibagikan</h2>
            <p>
              Sistem menghitung data. Admin memeriksa, menyetujui, menerbitkan, lalu mencatat
              setoran tanpa mengubah sumber transaksi.
            </p>
          </div>
          <div className="owner-report-hero__actions">
            <Button
              variant="info"
              onClick={() => void exportReport("pdf")}
              disabled={Boolean(exporting)}
            >
              {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
              Unduh PDF
            </Button>
            <Button
              variant="success"
              onClick={() => void exportReport("xlsx")}
              disabled={Boolean(exporting)}
            >
              {exporting === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              Unduh XLSX
            </Button>
          </div>
        </section>

        <section className="owner-report-summary-grid" aria-label="Ringkasan setoran Owner">
          <SummaryCard
            label="Hak Owner periode ini"
            value={rupiah(data?.summary.owner_amount)}
            helper={`${data?.summary.owners ?? 0} Owner aktif`}
            icon={<WalletCards />}
          />
          <SummaryCard
            label="Laporan sudah diterbitkan"
            value={rupiah(data?.summary.published_amount)}
            helper="Terlihat pada portal Owner"
            icon={<FileCheck2 />}
            tone="blue"
          />
          <SummaryCard
            label="Setoran sudah dicatat"
            value={rupiah(data?.summary.payout_recorded)}
            helper="Berdasarkan bukti transfer"
            icon={<CheckCircle2 />}
            tone="green"
          />
          <SummaryCard
            label="Masih perlu disetor"
            value={rupiah(data?.summary.payout_outstanding)}
            helper="Prioritas tindak lanjut Admin"
            icon={<Landmark />}
            tone="amber"
          />
        </section>

        <section className="owner-report-filter" aria-labelledby="owner-filter-heading">
          <div className="owner-report-filter__heading">
            <div>
              <h3 id="owner-filter-heading">Daftar laporan per Owner</h3>
              <p>Periode final memakai bulan yang telah selesai.</p>
            </div>
            <Badge variant="outline">{monthLabel(applied.period)}</Badge>
          </div>
          <div className="owner-report-filter__grid">
            <label>
              Periode laporan
              <Input
                type="month"
                value={draft.period}
                max={defaultPeriod}
                onChange={(event) => set("period", event.target.value)}
              />
            </label>
            <label className="owner-report-filter__search">
              Cari Owner
              <span className="relative block">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={draft.q ?? ""}
                  onChange={(event) => set("q", event.target.value)}
                  placeholder="Nama, email, atau nomor telepon"
                />
              </span>
            </label>
            <label>
              Tahap pemeriksaan
              <select
                value={draft.review_status ?? ""}
                onChange={(event) => set("review_status", event.target.value)}
              >
                <option value="">Semua tahap</option>
                <option value="not_prepared">Belum disiapkan</option>
                <option value="draft">Draft</option>
                <option value="ready_for_review">Menunggu pemeriksaan</option>
                <option value="approved">Disetujui</option>
                <option value="paid">Setoran selesai</option>
                <option value="void">Dibatalkan</option>
              </select>
            </label>
            <label>
              Publikasi
              <select
                value={draft.publication_status ?? ""}
                onChange={(event) => set("publication_status", event.target.value)}
              >
                <option value="">Semua publikasi</option>
                <option value="not_published">Belum terbit</option>
                <option value="published">Sudah terbit</option>
              </select>
            </label>
            <label>
              Setoran
              <select
                value={draft.payout_status ?? ""}
                onChange={(event) => set("payout_status", event.target.value)}
              >
                <option value="">Semua status setoran</option>
                <option value="not_paid">Belum disetor</option>
                <option value="partially_paid">Sebagian disetor</option>
                <option value="paid">Sudah disetor</option>
              </select>
            </label>
            <label>
              Jenis aset
              <select
                value={draft.category ?? ""}
                onChange={(event) => set("category", event.target.value)}
              >
                <option value="">Semua aset</option>
                <option value="rukost">Rumah Kost</option>
                <option value="apartkost">Apart Kost</option>
              </select>
            </label>
          </div>
          <div className="owner-report-filter__actions">
            <Button onClick={apply} disabled={reports.isFetching}>
              <FileText />
              Tampilkan
            </Button>
            <Button variant="destructive" onClick={reset}>
              <RefreshCcw />
              Reset filter
            </Button>
          </div>
        </section>

        {reports.isLoading ? <LoadingState label="Memuat laporan Owner..." /> : null}
        {reports.isError ? (
          <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
        ) : null}
        {data && !reports.isError ? (
          <section className="owner-report-list" aria-live="polite">
            {data.data.length === 0 ? (
              <div className="owner-report-empty">
                <Building2 />
                <h3>Tidak ada laporan yang sesuai</h3>
                <p>Ubah periode atau reset filter untuk melihat Owner lainnya.</p>
              </div>
            ) : (
              data.data.map((row) => {
                const paid = Number(row.payout_recorded);
                const entitlement = Number(row.owner_amount);
                const progress =
                  entitlement > 0 ? Math.min(100, Math.round((paid / entitlement) * 100)) : 0;
                const action = nextAction(row);
                return (
                  <article className="owner-report-row" key={row.owner_id}>
                    <div className="owner-report-row__owner">
                      <span className="owner-report-avatar">
                        {row.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <h3>{row.full_name}</h3>
                        <p>
                          {row.room_count} kamar · {row.occupied_room_count} terisi
                        </p>
                      </div>
                    </div>
                    <StatusBadge row={row} />
                    <div className="owner-report-row__money">
                      <span>Hak Owner</span>
                      <strong>{rupiah(row.owner_amount)}</strong>
                      <small>
                        Bruto {rupiah(row.gross_amount)} · fee {rupiah(row.operator_fee_amount)}
                      </small>
                    </div>
                    <div className="owner-report-row__progress">
                      <span>
                        <span>Setoran tercatat</span>
                        <strong>{progress}%</strong>
                      </span>
                      <Progress value={progress} />
                      <small>
                        {rupiah(row.payout_recorded)} dari {rupiah(row.owner_amount)}
                      </small>
                    </div>
                    <div className="owner-report-row__actions">
                      <Button variant="info" onClick={() => setSelected(row)}>
                        <Eye />
                        Rincian
                      </Button>
                      {row.review_status === "draft" ? (
                        <Button
                          variant="warning"
                          onClick={() => {
                            setSelected(row);
                            setAdjustmentTarget(row);
                          }}
                        >
                          <ListPlus />
                          Penyesuaian
                        </Button>
                      ) : null}
                      {action ? (
                        <Button
                          onClick={() => runAction(row)}
                          disabled={command.isPending || payoutMutation.isPending}
                        >
                          <action.icon />
                          {action.label}
                        </Button>
                      ) : (
                        <Button variant="success" disabled>
                          <CheckCircle2 />
                          Selesai
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            <footer className="owner-report-pagination">
              <p>
                Menampilkan {start}–{end} dari {data.meta.total} Owner
              </p>
              <div>
                <Button
                  variant="info"
                  disabled={data.meta.offset === 0}
                  onClick={() => page(data.meta.offset - PAGE_SIZE)}
                >
                  <ArrowLeft />
                  Kembali
                </Button>
                <span>
                  Halaman {Math.floor(data.meta.offset / PAGE_SIZE) + 1} dari{" "}
                  {Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE))}
                </span>
                <Button
                  variant="info"
                  disabled={data.meta.offset + data.meta.limit >= data.meta.total}
                  onClick={() => page(data.meta.offset + PAGE_SIZE)}
                >
                  Lanjut
                  <ArrowRight />
                </Button>
              </div>
            </footer>
          </section>
        ) : null}
      </main>

      <OwnerDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        detail={detail.data}
        loading={detail.isLoading}
        error={detail.error}
      />

      <Dialog open={Boolean(payoutTarget)} onOpenChange={(open) => !open && setPayoutTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Catat setoran untuk {payoutTarget?.full_name}</DialogTitle>
            <DialogDescription>
              Setoran final periode {monthLabel(applied.period)} sebesar{" "}
              {rupiah(payoutTarget?.payout_outstanding)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Nominal setoran
              <Input
                type="number"
                min={1}
                max={Number(payoutTarget?.payout_outstanding ?? 0)}
                value={payout.amount || ""}
                onChange={(event) =>
                  setPayout((current) => ({ ...current, amount: Number(event.target.value) }))
                }
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Maksimal sisa hak Owner {rupiah(payoutTarget?.payout_outstanding)}.
              </span>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Metode setoran
              <select
                value={payout.method}
                onChange={(event) => {
                  const method = event.target.value as typeof payout.method;
                  setPayout((current) => ({
                    ...current,
                    method,
                    destinationMask: method === "cash" ? "Tunai *****" : current.destinationMask,
                  }));
                }}
              >
                <option value="bank_transfer">Transfer bank</option>
                <option value="cash">Tunai</option>
                <option value="other">Lainnya</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tanggal transfer
              <Input
                type="datetime-local"
                value={payout.transferredAt}
                onChange={(event) =>
                  setPayout((current) => ({ ...current, transferredAt: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Referensi transaksi
              <Input
                value={payout.reference}
                onChange={(event) =>
                  setPayout((current) => ({ ...current, reference: event.target.value }))
                }
                placeholder="Contoh: TRF-OWNER-SEP-001"
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Tujuan tersamarkan
              <Input
                value={payout.destinationMask}
                onChange={(event) =>
                  setPayout((current) => ({ ...current, destinationMask: event.target.value }))
                }
                placeholder="Contoh: BCA **** 1234"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Jangan tulis nomor rekening lengkap.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setPayoutTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={
                !payoutTarget ||
                payout.amount < 1 ||
                payout.amount > Number(payoutTarget.payout_outstanding) ||
                payout.reference.trim().length < 3 ||
                !payout.destinationMask.includes("*") ||
                payoutMutation.isPending
              }
              onClick={() => payoutTarget && payoutMutation.mutate(payoutTarget)}
            >
              {payoutMutation.isPending ? <Loader2 className="animate-spin" /> : <Landmark />}Catat
              setoran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(adjustmentTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustmentTarget(null);
            setAdjustment((current) => ({
              ...current,
              ownerDelta: 0,
              feeDelta: 0,
              earningId: "",
              reason: "",
            }));
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tambah penyesuaian laporan</DialogTitle>
            <DialogDescription>
              Gunakan penyesuaian hanya untuk koreksi yang memiliki alasan dan bukti. Penyesuaian
              ini tersimpan sebagai catatan tambahan dan harus diperiksa sebelum laporan
              diterbitkan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Sumber kamar / pendapatan
              <select
                value={adjustment.earningId}
                onChange={(event) =>
                  setAdjustment((current) => ({ ...current, earningId: event.target.value }))
                }
                disabled={detail.isLoading || !detail.data?.lines.length}
              >
                <option value="">Pilih baris pendapatan</option>
                {detail.data?.lines.map((line) => (
                  <option key={line.earning_id} value={line.earning_id}>
                    {line.room_code} · {line.resident_name ?? "Tanpa nama"} ·{" "}
                    {rupiah(line.owner_amount)}
                  </option>
                ))}
              </select>
              <span className="block text-xs font-normal text-muted-foreground">
                Penyesuaian harus terhubung ke kamar atau pendapatan agar dapat diaudit.
              </span>
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Jenis penyesuaian
              <select
                value={adjustment.kind}
                onChange={(event) =>
                  setAdjustment((current) => ({
                    ...current,
                    kind: event.target.value as typeof adjustment.kind,
                  }))
                }
              >
                <option value="transfer_proration">Prorata pindah kamar</option>
                <option value="reversal">Pembalikan transaksi</option>
                <option value="refund">Pengembalian dana</option>
                <option value="clawback">Koreksi penarikan kembali</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Perubahan hak Owner
              <Input
                type="number"
                step="1"
                value={adjustment.ownerDelta}
                onChange={(event) =>
                  setAdjustment((current) => ({
                    ...current,
                    ownerDelta: Number(event.target.value) || 0,
                  }))
                }
                placeholder="Bisa negatif"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Perubahan: {rupiah(adjustment.ownerDelta)}
              </span>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Perubahan management fee
              <Input
                type="number"
                step="1"
                value={adjustment.feeDelta}
                onChange={(event) =>
                  setAdjustment((current) => ({
                    ...current,
                    feeDelta: Number(event.target.value) || 0,
                  }))
                }
                placeholder="Bisa negatif"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Bruto otomatis {rupiah(adjustment.ownerDelta + adjustment.feeDelta)}
              </span>
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Alasan penyesuaian
              <Textarea
                value={adjustment.reason}
                onChange={(event) =>
                  setAdjustment((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Contoh: prorata pindah dari RK-01-02 ke RK-01-06 pada 12 September"
                rows={3}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                setAdjustmentTarget(null);
                setAdjustment((current) => ({
                  ...current,
                  ownerDelta: 0,
                  feeDelta: 0,
                  earningId: "",
                  reason: "",
                }));
              }}
            >
              Batal
            </Button>
            <Button
              variant="warning"
              disabled={
                !adjustmentTarget ||
                !adjustment.earningId ||
                adjustment.ownerDelta + adjustment.feeDelta === 0 ||
                adjustment.reason.trim().length < 3 ||
                adjustmentMutation.isPending
              }
              onClick={() => adjustmentTarget && adjustmentMutation.mutate(adjustmentTarget)}
            >
              {adjustmentMutation.isPending ? <Loader2 className="animate-spin" /> : <ListPlus />}
              Simpan penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function OwnerDetailDialog({
  open,
  onOpenChange,
  detail,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: OwnerSettlementDetail | undefined;
  loading: boolean;
  error: unknown;
}) {
  const totals = detail?.settlement;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="owner-report-detail max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rincian laporan {detail?.owner.full_name ?? "Owner"}</DialogTitle>
          <DialogDescription>
            Sumber per kamar, periode layanan, management fee, publikasi, dan riwayat setoran.
          </DialogDescription>
        </DialogHeader>
        {loading ? <LoadingState label="Memuat rincian laporan..." /> : null}
        {error ? <ErrorState error={error} /> : null}
        {detail ? (
          <div className="space-y-5">
            <section className="owner-report-detail__totals">
              <div>
                <span>Pendapatan bruto</span>
                <strong>{rupiah(totals?.gross_amount)}</strong>
              </div>
              <div>
                <span>Management fee</span>
                <strong>{rupiah(totals?.operator_fee_amount)}</strong>
              </div>
              <div>
                <span>Hak Owner</span>
                <strong>{rupiah(totals?.owner_amount)}</strong>
              </div>
              <div>
                <span>Setoran tercatat</span>
                <strong>{rupiah(totals?.payout_recorded)}</strong>
              </div>
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Rincian per kamar</h3>
              <div className="owner-report-detail__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kamar / penghuni</th>
                      <th>Kontrak</th>
                      <th>Layanan tercatat</th>
                      <th>Bruto</th>
                      <th>Fee</th>
                      <th>Hak Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.earning_id}>
                        <td>
                          <strong>{line.room_code}</strong>
                          <small>{line.resident_name ?? "Tanpa nama penghuni"}</small>
                        </td>
                        <td>
                          <strong>{line.lease_code ?? "-"}</strong>
                          <small>
                            {line.term_months
                              ? `${line.term_months} bulan`
                              : "Durasi tidak tersedia"}
                          </small>
                        </td>
                        <td>
                          {dateLabel(line.service_from)} s.d. {dateLabel(line.service_until)}
                        </td>
                        <td>{rupiah(line.gross_amount)}</td>
                        <td>{rupiah(line.operator_fee_amount)}</td>
                        <td>
                          <strong>{rupiah(line.owner_amount)}</strong>
                        </td>
                      </tr>
                    ))}
                    {detail.lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted-foreground">
                          Belum ada pendapatan tercatat untuk periode ini.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Riwayat setoran</h3>
              {detail.payouts.length ? (
                detail.payouts.map((item) => (
                  <div className="owner-report-payout" key={item.id}>
                    <div>
                      <strong>{rupiah(item.payout_amount)}</strong>
                      <span>{item.payout_reference}</span>
                    </div>
                    <div>
                      <strong>{dateLabel(item.transferred_at)}</strong>
                      <span>{item.destination_mask}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border bg-muted/25 p-4 text-sm text-muted-foreground">
                  Belum ada setoran yang dicatat.
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Penyesuaian tercatat</h3>
              {detail.adjustments?.length ? (
                detail.adjustments.map((item) => (
                  <div className="owner-report-adjustment" key={item.id}>
                    <div>
                      <strong>{item.adjustment_kind.replaceAll("_", " ")}</strong>
                      <span>{item.reason}</span>
                    </div>
                    <div>
                      <strong>{rupiah(item.owner_amount_delta)}</strong>
                      <span>{dateLabel(item.created_at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border bg-muted/25 p-4 text-sm text-muted-foreground">
                  Belum ada penyesuaian pada laporan ini.
                </p>
              )}
            </section>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="destructive" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
