import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  PencilLine,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { FilePreviewModal, type FilePreviewReference } from "@/components/file/FilePreviewModal";
import { HistoricalRealizationSourceCombobox } from "@/components/reports/HistoricalRealizationSourceCombobox";
import { ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
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
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  downloadOwnerRealization,
  downloadOwnerRealizationRange,
  downloadOwnerRealizationReceipt,
  ownerRealizationApi,
  type OwnerRealizationDetail,
  type OwnerRealizationStatus,
} from "@/lib/admin-owner-realization";
import { useProperty } from "@/lib/property";
import { formatIdrInput, normalizeDigits } from "@/lib/lease-onboarding-form";
import type { FileResponse } from "@granada-kost/domain";
import "./owner-settlement-workspace.css";

const labels: Record<OwnerRealizationStatus, string> = {
  draft: "Draft",
  awaiting_review: "Menunggu pemeriksaan",
  approved: "Disetujui",
  submitted_to_finance: "Diajukan ke keuangan",
  awaiting_transfer: "Menunggu transfer",
  partially_realized: "Realisasi sebagian",
  realized: "Terealisasi",
  published_to_owner: "Diterbitkan untuk Owner",
  void: "Dibatalkan",
};

const realizationTones: Record<OwnerRealizationStatus, StatusTone> = {
  draft: "neutral",
  awaiting_review: "warning",
  approved: "success",
  submitted_to_finance: "info",
  awaiting_transfer: "warning",
  partially_realized: "warning",
  realized: "success",
  published_to_owner: "success",
  void: "neutral",
};

function rupiah(value: unknown) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function date(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(
    new Date(String(value)),
  );
}

function monthLabel(period: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-01T00:00:00Z`));
}

function monthRangeLabel(from: string, to: string) {
  return from === to ? monthLabel(from) : `${monthLabel(from)} - ${monthLabel(to)}`;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "—";
}

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function RupiahField({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (amount: number) => void;
  id: string;
}) {
  return (
    <div className="flex min-h-11 items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/25">
      <span className="border-r border-input bg-muted/50 px-3 py-2.5 text-sm">Rp</span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        className="border-0 shadow-none focus-visible:ring-0"
        value={value ? formatIdrInput(value) : ""}
        onChange={(event) => onChange(normalizeDigits(event.target.value))}
        placeholder="0"
      />
    </div>
  );
}

const notEligibleReasonLabels: Record<string, string> = {
  OWNER_ASSIGNMENT_UNAVAILABLE: "Owner belum terhubung ke kamar",
  OWNER_SPONSORED_EXCLUDED: "Hunian tanggungan Owner",
  OUTSTANDING_CONTRACT_RENT: "Kontrak belum lunas",
  ALREADY_ALLOCATED_TO_REALIZATION: "Sudah masuk realisasi lain",
  PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD: "Pelunasan di luar periode",
};

function notEligibleReason(value: unknown) {
  const code = text(value);
  return notEligibleReasonLabels[code] ?? "Belum memenuhi syarat realisasi";
}

function notEligibleReasonTone(value: unknown): StatusTone {
  const code = text(value);
  if (code === "OUTSTANDING_CONTRACT_RENT") return "warning";
  if (code === "PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD") return "info";
  return "neutral";
}

const recoveryLabels: Record<string, string> = {
  recover_from_owner: "Tagih ke Owner",
  net_against_future_realization: "Potong realisasi berikutnya",
  outside_system_finance: "Diselesaikan di luar sistem",
};

const correctionLabels: Record<string, string> = {
  contract_correction: "Koreksi kontrak",
  approved_operational_adjustment: "Penyesuaian operasional",
  transfer_recovery: "Pengembalian kelebihan transfer",
};

function actionFor(status: OwnerRealizationStatus) {
  if (status === "draft")
    return { action: "submit-review" as const, label: "Ajukan pemeriksaan", icon: Send };
  if (status === "awaiting_review")
    return { action: "approve" as const, label: "Setujui realisasi", icon: CheckCircle2 };
  if (status === "approved")
    return { action: "submit-finance" as const, label: "Ajukan ke keuangan", icon: Landmark };
  if (status === "submitted_to_finance")
    return {
      action: "awaiting-transfer" as const,
      label: "Tandai menunggu transfer",
      icon: Landmark,
    };
  if (status === "realized")
    return { action: "publish" as const, label: "Terbitkan ke Owner", icon: CheckCircle2 };
  return null;
}

function ValueCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="owner-report-summary">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

export function OwnerRealizationDetailPage({ realizationId }: { realizationId: string }) {
  const { currentPropertyId } = useProperty();
  const client = useQueryClient();
  const [actionDialog, setActionDialog] = useState(false);
  const [returnDialog, setReturnDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);
  const [correctionDialog, setCorrectionDialog] = useState(false);
  const [periodCorrectionDialog, setPeriodCorrectionDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [recoveryEventFor, setRecoveryEventFor] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FilePreviewReference | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [transfer, setTransfer] = useState({
    amount: 0,
    method: "bank_transfer" as const,
    reference: "",
    transferred_at: localDateTime(),
    evidence_reference: "",
    evidence_files: [] as FileResponse[],
    finance_confirmed_by: "",
    finance_confirmation_channel: "pesan" as "pesan" | "telepon" | "email" | "tatap_muka",
    finance_confirmed_at: localDateTime(),
    legacy_evidence_reason: "",
    legacy_evidence_source: "",
  });
  const [correction, setCorrection] = useState({
    correction_kind: "contract_correction" as const,
    amount: 0,
    reason: "",
    evidence_reference: "",
    source_reference: "",
    recovery_disposition: "recover_from_owner" as const,
    evidence_files: [] as FileResponse[],
  });
  const [periodCorrection, setPeriodCorrection] = useState({ target_period: "", reason: "" });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filterApplied, setFilterApplied] = useState(false);
  const [range, setRange] = useState({ from_period: "", to_period: "" });
  const [recoveryEvent, setRecoveryEvent] = useState({
    amount: 0,
    occurred_at: localDateTime(),
    finance_reference: "",
    note: "",
    evidence_files: [] as FileResponse[],
  });
  const detail = useQuery({
    queryKey: ["owner-realization-detail", realizationId, currentPropertyId],
    queryFn: () => ownerRealizationApi.detail(realizationId, currentPropertyId!),
    enabled: Boolean(currentPropertyId),
  });
  useEffect(() => {
    const period = detail.data?.realization.period;
    if (period && !range.from_period) {
      setRange({ from_period: period.slice(0, 7), to_period: period.slice(0, 7) });
    }
  }, [detail.data?.realization.period, range.from_period]);
  const filterValid = Boolean(
    currentPropertyId && detail.data?.realization.owner_id &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(range.from_period) &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(range.to_period) &&
      range.from_period <= range.to_period,
  );
  const rangeReady = Boolean(filterApplied && filterValid);
  const realizationRange = useQuery({
    queryKey: ["owner-realization-range", detail.data?.realization.owner_id, currentPropertyId, range.from_period, range.to_period],
    queryFn: () => ownerRealizationApi.range(detail.data!.realization.owner_id, {
      property_id: currentPropertyId!,
      from_period: range.from_period,
      to_period: range.to_period,
      voided: "exclude_voided",
    }),
    enabled: rangeReady,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["owner-realization-detail", realizationId] });
    await client.invalidateQueries({ queryKey: ["owner-realizations"] });
    await client.invalidateQueries({ queryKey: ["owner-realization-range"] });
  };
  const statusAction = useMutation({
    mutationFn: () => {
      const current = detail.data?.realization;
      const action = current ? actionFor(current.status) : null;
      if (!current || !action) throw new Error("Aksi status belum tersedia.");
      return ownerRealizationApi.transition(current.id, action.action, {
        property_id: currentPropertyId!,
        note: note.trim() || "Tahap dicatat oleh Admin.",
      });
    },
    onSuccess: async () => {
      toast.success("Tahap Realisasi Owner berhasil diperbarui.");
      setActionDialog(false);
      setNote("");
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Tahap Realisasi belum dapat diperbarui.",
      ),
  });
  const returnToDraft = useMutation({
    mutationFn: () =>
      ownerRealizationApi.transition(realizationId, "return-draft", {
        property_id: currentPropertyId!,
        note: note.trim(),
      }),
    onSuccess: async () => {
      toast.success("Realisasi dikembalikan ke draft untuk diperbaiki.");
      setReturnDialog(false);
      setNote("");
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Realisasi belum dapat dikembalikan ke draft.",
      ),
  });
  const cancelRealization = useMutation({
    mutationFn: () =>
      ownerRealizationApi.cancel(realizationId, {
        property_id: currentPropertyId!,
        reason: cancelReason.trim(),
      }),
    onSuccess: async () => {
      toast.success("Realisasi dibatalkan dan jejak audit tetap tersimpan.");
      setCancelDialog(false);
      setCancelReason("");
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Realisasi belum dapat dibatalkan."),
  });
  const recordTransfer = useMutation({
    mutationFn: () =>
      ownerRealizationApi.transfer(realizationId, {
        property_id: currentPropertyId!,
        amount: transfer.amount,
        method: transfer.method,
        reference: transfer.reference.trim(),
        transferred_at: new Date(transfer.transferred_at).toISOString(),
        evidence_reference: transfer.evidence_reference.trim() || undefined,
        evidence_file_ids: transfer.evidence_files.map((file) => file.id),
        finance_confirmed_by: transfer.finance_confirmed_by.trim(),
        finance_confirmation_channel: transfer.finance_confirmation_channel,
        finance_confirmed_at: new Date(transfer.finance_confirmed_at).toISOString(),
        legacy_evidence_reason: transfer.legacy_evidence_reason.trim() || undefined,
        legacy_evidence_source: transfer.legacy_evidence_source.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success(
        "Transfer Realisasi Owner berhasil dicatat. Kuitansi tersedia pada riwayat transfer.",
      );
      setTransferDialog(false);
      setTransfer({
        amount: 0,
        method: "bank_transfer",
        reference: "",
        transferred_at: localDateTime(),
        evidence_reference: "",
        evidence_files: [],
        finance_confirmed_by: "",
        finance_confirmation_channel: "pesan",
        finance_confirmed_at: localDateTime(),
        legacy_evidence_reason: "",
        legacy_evidence_source: "",
      });
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Transfer Realisasi belum dapat dicatat.",
      ),
  });
  const addCorrection = useMutation({
    mutationFn: () =>
      ownerRealizationApi.correction(realizationId, {
        property_id: currentPropertyId!,
        correction_kind: isPostTransfer ? "transfer_recovery" : correction.correction_kind,
        amount: isPostTransfer ? -Math.abs(correction.amount) : correction.amount,
        reason: correction.reason.trim(),
        evidence_reference: correction.evidence_reference.trim() || undefined,
        source_reference: correction.source_reference.trim() || undefined,
        recovery_disposition: isPostTransfer ? correction.recovery_disposition : undefined,
        evidence_file_ids: correction.evidence_files.map((file) => file.id),
      }),
    onSuccess: async () => {
      toast.success(
        isPostTransfer
          ? "Pengembalian kelebihan transfer berhasil dicatat."
          : "Penyesuaian laporan berhasil ditambahkan.",
      );
      setCorrectionDialog(false);
      setCorrection({
        correction_kind: "contract_correction",
        amount: 0,
        reason: "",
        evidence_reference: "",
        source_reference: "",
        recovery_disposition: "recover_from_owner",
        evidence_files: [],
      });
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Penyesuaian belum dapat ditambahkan."),
  });
  const correctPeriod = useMutation({
    mutationFn: () =>
      ownerRealizationApi.correctPeriod(realizationId, {
        property_id: currentPropertyId!,
        target_period: periodCorrection.target_period,
        reason: periodCorrection.reason.trim(),
      }),
    onSuccess: async () => {
      toast.success("Periode realisasi dikoreksi. Fakta transfer tetap dipertahankan.");
      setPeriodCorrectionDialog(false);
      setPeriodCorrection({ target_period: "", reason: "" });
      await refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Periode realisasi belum dapat dikoreksi."),
  });
  const recordRecoveryEvent = useMutation({
    mutationFn: () =>
      ownerRealizationApi.recoveryEvent(realizationId, recoveryEventFor!, {
        property_id: currentPropertyId!,
        amount: recoveryEvent.amount,
        occurred_at: new Date(recoveryEvent.occurred_at).toISOString(),
        finance_reference: recoveryEvent.finance_reference.trim() || undefined,
        note: recoveryEvent.note.trim(),
        evidence_file_ids: recoveryEvent.evidence_files.map((file) => file.id),
      }),
    onSuccess: async () => {
      toast.success("Tahap pengembalian dana berlebih berhasil dicatat.");
      setRecoveryEventFor(null);
      setRecoveryEvent({
        amount: 0,
        occurred_at: localDateTime(),
        finance_reference: "",
        note: "",
        evidence_files: [],
      });
      await refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Pengembalian dana berlebih belum dapat dicatat.",
      ),
  });
  const available = useMemo(() => {
    const current = detail.data?.realization;
    return Number(current?.realization_total ?? 0) - Number(current?.transferred_total ?? 0);
  }, [detail.data]);
  const download = async (format: "pdf" | "xlsx") => {
    try {
      if (rangeReady && detail.data?.realization.owner_id) {
        await downloadOwnerRealizationRange(detail.data.realization.owner_id, {
          property_id: currentPropertyId!,
          ...range,
        }, format);
      } else {
        await downloadOwnerRealization(realizationId, currentPropertyId!, format);
      }
      toast.success(`Realisasi Owner ${format.toUpperCase()} berhasil diunduh.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dokumen belum dapat diunduh.");
    }
  };
  const focusTransfer =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("focus") === "transfer";
  useEffect(() => {
    if (!focusTransfer || detail.isLoading || !detail.data) return;
    requestAnimationFrame(() => {
      document.getElementById("transfer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detail.data, detail.isLoading, focusTransfer]);

  if (!currentPropertyId || detail.isLoading)
    return (
      <AppShell title="Rincian Realisasi Owner">
        <LoadingState label="Memuat rincian Realisasi Owner..." />
      </AppShell>
    );
  if (detail.isError || !detail.data)
    return (
      <AppShell title="Rincian Realisasi Owner">
        <ErrorState
          error={detail.error ?? new Error("Rincian Realisasi tidak tersedia.")}
          onRetry={() => void detail.refetch()}
        />
      </AppShell>
    );
  const { realization: baseRealization, lines: baseLines, corrections: baseCorrections, transfers: baseTransfers, not_eligible } = detail.data;
  const isRangeView = Boolean(rangeReady && realizationRange.data);
  const rangePeriods = realizationRange.data?.periods ?? [];
  const realization = isRangeView
    ? {
        ...baseRealization,
        period: `${range.from_period}-01`,
        reference: baseRealization.reference,
        room_count: rangePeriods.reduce((sum, period) => sum + period.lines.length, 0),
        eligible_contract_total: realizationRange.data!.summary.eligible_contract_total,
        management_fee_total: realizationRange.data!.summary.management_fee_total,
        correction_total: realizationRange.data!.summary.correction_total,
        realization_total: realizationRange.data!.summary.realization_total,
        transferred_total: realizationRange.data!.summary.transferred_total,
      }
    : baseRealization;
  const displayPeriod = isRangeView
    ? monthRangeLabel(range.from_period, range.to_period)
    : monthLabel(realization.period.slice(0, 7));
  const pageSubtitle = isRangeView
    ? `${realization.owner_name} · ${realization.reference} · ${displayPeriod}`
    : `${realization.owner_name} · ${realization.reference}`;
  const lines = isRangeView ? rangePeriods.flatMap((period) => period.lines) : baseLines;
  const transfers = isRangeView ? rangePeriods.flatMap((period) => period.transfers) : baseTransfers;
  const corrections = isRangeView ? rangePeriods.flatMap((period) => period.corrections) : baseCorrections;
  const recoveryEvents = isRangeView ? [] : detail.data.recovery_events ?? [];
  const selectedRecovery = corrections.find((item) => item.id === recoveryEventFor);
  const recoveryRemaining = selectedRecovery
    ? Math.abs(Number(selectedRecovery.amount ?? 0)) -
      recoveryEvents
        .filter((event) => event.correction_id === recoveryEventFor)
        .reduce((sum, event) => sum + Number(event.amount ?? 0), 0)
    : 0;
  const legacyTransfer =
    new Date(transfer.transferred_at).getTime() < new Date("2026-09-29T00:00:00+07:00").getTime();
  const accountNumber = String(realization.owner_snapshot?.payout_account_number ?? "");
  const maskedAccount = accountNumber.length > 4 ? `•••• ${accountNumber.slice(-4)}` : "—";
  const next = actionFor(realization.status);
  const canTransfer = ["awaiting_transfer", "partially_realized"].includes(realization.status);
  const canCorrect = realization.status === "draft";
  const canCorrectPeriod =
    realization.entry_kind === "system" &&
    !["void", "published_to_owner"].includes(realization.status);
  const canCancel =
    ["draft", "awaiting_review", "approved", "submitted_to_finance", "awaiting_transfer"].includes(
      realization.status,
    ) && Number(realization.transferred_total) === 0;
  const isPostTransfer = ["partially_realized", "realized", "published_to_owner"].includes(
    realization.status,
  );
  const ownerEntitlement = Number(realization.realization_total ?? 0);
  const transferredTotal = Number(realization.transferred_total ?? 0);
  const recordedRecoveryTotal = corrections
    .filter(
      (item) =>
        item.correction_kind === "transfer_recovery" && item.recovery_status !== "cancelled",
    )
    .reduce((sum, item) => sum + Math.abs(Number(item.amount ?? 0)), 0);
  const overpaymentTotal = Math.max(transferredTotal - ownerEntitlement, 0);
  const recoverableOverpayment = Math.max(overpaymentTotal - recordedRecoveryTotal, 0);
  const canRecordOverpayment = isPostTransfer && recoverableOverpayment > 0;
  const scopeBuildings = Array.isArray(realization.scope_snapshot.buildings)
    ? realization.scope_snapshot.buildings
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" · ")
    : "";
  const pricingReferences = Array.isArray(realization.tariff_snapshot.pricing_references)
    ? realization.tariff_snapshot.pricing_references.filter(
        (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object",
      )
    : [];
  const tariffSummary = pricingReferences.length
    ? pricingReferences
        .map(
          (reference) =>
            `${text(reference.room_code)}: ${reference.pricing_source === "negotiated" ? "kesepakatan" : "standar"} ${rupiah(reference.monthly_price)} / bln · fee ${rupiah(reference.monthly_management_fee)} / bln`,
        )
        .join("\n")
    : "Referensi tarif tidak tersedia pada data lama.";
  return (
    <AppShell
      title="Rincian Realisasi Owner"
      subtitle={pageSubtitle}
    >
      <main className="owner-report-workspace p-4 sm:p-6">
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted-foreground">
          <a className="hover:text-primary hover:underline" href="/reports">
            Laporan
          </a>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <a className="hover:text-primary hover:underline" href="/reports/property-owners">
            Realisasi Owner
          </a>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span className="font-medium text-foreground">Rincian {realization.owner_name}</span>
        </nav>
        <Button
          variant="default"
          className="mb-2 w-fit justify-self-start bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
          onClick={() => window.location.assign("/reports/property-owners")}
        >
          <ArrowLeft />
          Kembali ke Realisasi Owner
        </Button>
        <section
          className="owner-report-hero"
          style={{
            border: "2px solid rgba(96, 165, 250, 0.72)",
            backgroundColor: "rgba(37, 99, 235, 0.16)",
          }}
        >
          <div>
            <p className="owner-report-eyebrow">
              {realization.entry_kind === "system" ? "Realisasi sistem" : "Realisasi historis"}
            </p>
            <h2>{realization.owner_name}</h2>
            <p>
              {realization.reference} · Periode {displayPeriod} · {realization.room_count} kamar
              tercatat dalam realisasi ini.
            </p>
            <div className="mt-2 text-sm text-muted-foreground">
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-semibold text-foreground">Bangunan yang tercatat</p>
                <p className="mt-1 text-muted-foreground">
                  {scopeBuildings ||
                    "Belum tercatat pada data lama. Tidak ada input tambahan yang diperlukan; data baru akan menampilkan bangunan saat tersedia."}
                </p>
              </div>
            </div>
          </div>
          <div className="owner-report-hero__actions flex flex-wrap gap-3">
            <Button
              variant="destructive"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void download("pdf")}
            >
              <FileText />
              Unduh PDF
            </Button>
            <Button
              variant="success"
              className="border-green-600 bg-green-600 text-white hover:bg-green-700"
              onClick={() => void download("xlsx")}
            >
              <FileSpreadsheet />
              Unduh Excel
            </Button>
          </div>
        </section>
        <section className="owner-report-filter">
          <div className="owner-report-filter__heading">
            <div>
              <h3>Filter periode laporan</h3>
              <p>Semua ringkasan, tabel, transfer, koreksi, dan export mengikuti periode yang dipilih.</p>
            </div>
            <Badge data-tone={isRangeView ? "info" : "neutral"}>{isRangeView ? "Rentang aktif" : "Satu periode"}</Badge>
          </div>
          <div className="owner-report-filter__actions flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Periode
              <MonthYearPicker
                value={range.from_period}
                onChange={(value) => {
                  setRange({ from_period: value, to_period: value });
                  setRangeOpen(false);
                  setFilterApplied(false);
                }}
                className="owner-report-filter__month-picker"
                label="Periode realisasi"
                title="Periode realisasi"
                description="Pilih bulan dan tahun untuk laporan Realisasi Owner."
                yearLabel="Tahun realisasi"
              />
            </label>
            <Button
              type="button"
              variant={rangeOpen ? "info" : "default"}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
              onClick={() => {
                setRangeOpen((value) => !value);
                setFilterApplied(false);
              }}
            >
              {rangeOpen ? "Mode satu periode" : "Pilih rentang periode"}
            </Button>
            {rangeOpen ? <label className="grid gap-1 text-sm font-medium">
              Sampai periode
              <MonthYearPicker
                value={range.to_period}
                onChange={(value) => {
                  setRange((current) => ({ ...current, to_period: value }));
                  setFilterApplied(false);
                }}
                className="owner-report-filter__month-picker"
                label="Sampai periode realisasi"
                title="Sampai periode realisasi"
                description="Pilih batas akhir rentang laporan Realisasi Owner."
                yearLabel="Tahun realisasi"
              />
            </label> : null}
            <Button
              type="button"
              variant="success"
              className="border-emerald-700 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
              disabled={!filterValid || realizationRange.isFetching}
              onClick={() => setFilterApplied(true)}
            >
              {realizationRange.isFetching ? "Memuat…" : "Terapkan filter"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
              onClick={() => {
                const period = baseRealization.period.slice(0, 7);
                setRange({ from_period: period, to_period: period });
                setRangeOpen(false);
                setFilterApplied(false);
                void client.removeQueries({ queryKey: ["owner-realization-range"] });
              }}
            >
              Reset filter
            </Button>
          </div>
          {range.from_period > range.to_period ? <p className="mt-3 text-sm text-destructive">Periode awal harus sama atau sebelum periode akhir.</p> : null}
          {realizationRange.isError ? <p className="mt-3 text-sm text-destructive">Rentang periode belum dapat dimuat.</p> : null}
        </section>
        {realization.notes?.trim() ? (
          <section className="owner-report-list">
            <div className="p-5">
              <h3 className="font-semibold">Catatan realisasi</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                {realization.notes}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Catatan internal Admin. Catatan ini tersimpan pada Realisasi Owner dan tidak dicetak
                pada kuitansi Owner.
              </p>
            </div>
          </section>
        ) : null}
        <section className="owner-report-summary-grid">
          <ValueCard
            label="Total kontrak sewa"
            value={rupiah(realization.eligible_contract_total)}
            helper="Kontrak lunas dan layak"
          />
          <ValueCard
            label="Management fee"
            value={rupiah(realization.management_fee_total)}
            helper="Mengikuti seluruh durasi kontrak"
          />
          <ValueCard
            label="Penyesuaian"
            value={rupiah(realization.correction_total)}
            helper="Hanya koreksi yang tercatat"
          />
          <ValueCard
            label="Hak Owner"
            value={rupiah(realization.realization_total)}
            helper={`${rupiah(realization.transferred_total)} sudah ditransfer`}
          />
        </section>
        <section
          id="transfer"
          className={`owner-report-filter ${focusTransfer ? "owner-report-filter--focus" : ""}`}
          tabIndex={focusTransfer ? -1 : undefined}
        >
          <div className="owner-report-filter__heading">
            <div>
              <h3>Transfer dan tindakan realisasi</h3>
              <p>Status dan transaksi tidak mengubah nilai kontrak yang telah ditetapkan.</p>
            </div>
            <StatusBadge
              label={labels[realization.status]}
              tone={realizationTones[realization.status]}
            />
          </div>
          {!isRangeView ? <div className="owner-report-filter__actions">
            {canCorrectPeriod ? (
              <Button
                variant="outline"
                onClick={() => {
                  setPeriodCorrection({ target_period: realization.period.slice(0, 7), reason: "" });
                  setPeriodCorrectionDialog(true);
                }}
              >
                <PencilLine />
                Koreksi periode realisasi
              </Button>
            ) : null}
            {canCorrect || canRecordOverpayment ? (
              <Button
                variant="warning"
                className={
                  isPostTransfer
                    ? "border-green-600 bg-green-600 text-white hover:bg-green-700"
                    : undefined
                }
                onClick={() => setCorrectionDialog(true)}
              >
                <PencilLine />
                {isPostTransfer
                  ? "Catat pengembalian kelebihan transfer"
                  : "Tambah penyesuaian laporan"}
              </Button>
            ) : null}
            {realization.status === "awaiting_review" ? (
              <Button variant="outline" onClick={() => setReturnDialog(true)}>
                <ArrowLeft />
                Kembalikan ke draft
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setCancelReason("");
                  setCancelDialog(true);
                }}
              >
                <Ban />
                Batalkan realisasi
              </Button>
            ) : null}
            {next ? (
              <Button onClick={() => setActionDialog(true)}>
                <next.icon />
                {next.label}
              </Button>
            ) : null}
            {canTransfer ? (
              <Button
                variant="default"
                onClick={() => {
                  setTransfer((value) => ({ ...value, amount: available }));
                  setTransferDialog(true);
                }}
              >
                <Landmark />
                Catat transfer berhasil
              </Button>
            ) : null}
          </div> : <p className="text-sm text-muted-foreground">Tindakan perubahan dinonaktifkan saat rentang aktif. Pilih satu periode untuk mengubah atau mencatat transaksi.</p>}
        </section>
        <section className="owner-report-list">
          <div className="p-5">
            <h3 className="font-semibold">Referensi tarif dan biaya</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {tariffSummary}
            </p>
          </div>
        </section>
        <section className="owner-report-list">
          <div className="p-5 pb-2">
            <h3 className="font-semibold">Kontrak yang direalisasikan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Nomor kavling mengikuti data kamar. Lengkapi melalui Edit Kamar jika belum tersedia.
            </p>
          </div>
          <div
            className="w-full overflow-x-auto rounded-lg border border-border/70"
            role="region"
            aria-label="Tabel kontrak yang direalisasikan"
            tabIndex={0}
          >
          <table className="w-full min-w-[1400px] text-left text-sm">
            <thead className="border-y bg-muted/35 text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "No",
                  "Kamar",
                  "Penghuni",
                  "Pemilik",
                  "No. Kavling",
                  "Durasi",
                  "Jenis tarif",
                  "Uang diterima",
                  "Total kontrak",
                  "Outstanding",
                  "Pelunasan",
                  "Management fee",
                  "Realisasi Owner",
                  "Status realisasi",
                  "Check-in",
                  "Check-out",
                ].map((heading) => (
                  <th className="px-3 py-3 font-semibold" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr className="border-b" key={String(line.id)}>
                  <td className="px-3 py-3">{index + 1}</td>
                  <td className="px-3 py-3 font-medium">{text(line.room_code_snapshot)}</td>
                  <td className="px-3 py-3">{text(line.resident_name_snapshot)}</td>
                  <td className="px-3 py-3">{text(line.owner_name_snapshot)}</td>
                  <td className="px-3 py-3">{text(line.plot_number_snapshot)}</td>
                  <td className="px-3 py-3">
                    {line.duration_months ? `${line.duration_months} bulan` : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {line.pricing_source_snapshot === "negotiated"
                      ? "Tarif kesepakatan"
                      : "Tarif standar"}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{rupiah(line.money_received_amount)}</td>
                  <td className="px-3 py-3 tabular-nums">{rupiah(line.contract_total_amount)}</td>
                  <td className="px-3 py-3 tabular-nums">{rupiah(line.outstanding_amount)}</td>
                  <td className="px-3 py-3">{date(line.payment_completed_at)}</td>
                  <td className="px-3 py-3 tabular-nums">{rupiah(line.management_fee_amount)}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums">
                    {rupiah(line.net_realization_amount)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      label={labels[realization.status]}
                      tone={realizationTones[realization.status]}
                    />
                    {line.line_status === "historical_unlinked" ? (
                      <small className="mt-1 block text-muted-foreground">
                        Unlinked historical record
                      </small>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{date(line.check_in_at)}</td>
                  <td className="px-3 py-3">{date(line.check_out_at)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-sky-100 font-semibold text-sky-950 dark:bg-sky-950/45 dark:text-sky-100">
              <tr>
                <td className="px-3 py-3" colSpan={7}>
                  Total
                </td>
                <td className="px-3 py-3">{rupiah(realization.eligible_contract_total)}</td>
                <td className="px-3 py-3">{rupiah(realization.eligible_contract_total)}</td>
                <td className="px-3 py-3">Rp0</td>
                <td className="px-3 py-3">—</td>
                <td className="px-3 py-3">{rupiah(realization.management_fee_total)}</td>
                <td className="px-3 py-3">{rupiah(realization.realization_total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          </div>
        </section>
        <section className="owner-report-list">
          <div className="p-5">
            <h3 className="font-semibold">Riwayat transfer dan kuitansi</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Setiap transfer memiliki dokumen tersimpan yang tidak ditimpa perubahan setelahnya.
            </p>
          </div>
          {transfers.length ? (
            <div className="grid gap-3 p-4 sm:p-5">
              {transfers.map((transfer, index) => (
                <div
                  key={String(transfer.id)}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <strong>{rupiah(transfer.transfer_amount)}</strong>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {text(transfer.transfer_reference)} · {date(transfer.transferred_at)} ·{" "}
                        {text(transfer.receipt_number)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Konfirmasi Keuangan: {text(transfer.finance_confirmed_by)} ·{" "}
                        {text(transfer.finance_confirmation_channel) === "pesan"
                          ? "Pesan"
                          : text(transfer.finance_confirmation_channel) === "telepon"
                            ? "Telepon"
                            : text(transfer.finance_confirmation_channel) === "email"
                              ? "Email"
                              : text(transfer.finance_confirmation_channel) === "tatap_muka"
                                ? "Tatap muka"
                                : text(transfer.finance_confirmation_channel)}{" "}
                        · {date(transfer.finance_confirmed_at)}
                      </p>
                      {(Array.isArray(transfer.evidence_files) ? transfer.evidence_files : []).map(
                        (file) => {
                          const item = file as FilePreviewReference;
                          return (
                            <Button
                              key={item.id}
                              size="sm"
                              variant="success"
                              className="mt-2 mr-2 border-green-600 bg-green-600 text-white hover:bg-green-700"
                              onClick={() => setPreviewFile(item)}
                            >
                              Lihat bukti: {item.original_filename}
                            </Button>
                          );
                        },
                      )}
                      {transfer.legacy_evidence_reason &&
                      (!Array.isArray(transfer.evidence_files) ||
                        transfer.evidence_files.length === 0) ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Bukti digital belum tersedia pada catatan lama.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="info"
                    onClick={() =>
                      void downloadOwnerRealizationReceipt(
                        isRangeView ? String(transfer.realization_id ?? realizationId) : realizationId,
                        String(transfer.id),
                        currentPropertyId,
                      )
                    }
                  >
                    <Download />
                    Unduh kuitansi
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Belum ada transfer berhasil dicatat.
            </p>
          )}
        </section>
        <section className="grid gap-5 xl:grid-cols-2">
          <section className="owner-report-list">
            <div className="p-5">
              <h3 className="font-semibold">Penyesuaian dan pengembalian dana berlebih</h3>
              {corrections.length ? (
                <ul className="mt-3 grid gap-3">
                  {corrections.map((item) => (
                    <li key={String(item.id)} className="rounded-lg border p-3">
                      <strong>{rupiah(item.amount)}</strong>
                      <p className="mt-1 text-sm">{text(item.reason)}</p>
                      <small className="text-muted-foreground">
                        {correctionLabels[String(item.correction_kind)] ?? "Penyesuaian"} ·{" "}
                        {date(item.created_at)}
                      </small>
                      {item.recovery_disposition ? (
                        <small className="mt-1 block text-muted-foreground">
                          {recoveryLabels[String(item.recovery_disposition)] ??
                            "Pengembalian dana berlebih"}{" "}
                          ·{" "}
                          {item.recovery_status === "resolved"
                            ? "Selesai"
                            : recoveryEvents.some((event) => event.correction_id === item.id)
                              ? "Pengembalian sebagian"
                              : "Belum ada pengembalian"}
                        </small>
                      ) : null}
                      {(Array.isArray(item.evidence_files) ? item.evidence_files : []).map(
                        (file) => {
                          const evidence = file as FilePreviewReference;
                          return (
                            <Button
                              key={evidence.id}
                              size="sm"
                              variant="success"
                              className="mt-2 mr-2 border-green-600 bg-green-600 text-white hover:bg-green-700"
                              onClick={() => setPreviewFile(evidence)}
                            >
                              Lihat bukti: {evidence.original_filename}
                            </Button>
                          );
                        },
                      )}
                      {item.recovery_disposition ? (
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                          <p className="font-semibold">Tahap penyelesaian</p>
                          <p className="mt-1 text-muted-foreground">
                            Dipulihkan{" "}
                            {rupiah(
                              recoveryEvents
                                .filter((event) => event.correction_id === item.id)
                                .reduce((sum, event) => sum + Number(event.amount ?? 0), 0),
                            )}{" "}
                            dari {rupiah(Math.abs(Number(item.amount ?? 0)))}
                          </p>
                          {recoveryEvents
                            .filter((event) => event.correction_id === item.id)
                            .map((event) => (
                              <div key={String(event.id)} className="mt-2 border-t pt-2">
                                {rupiah(event.amount)} · {date(event.occurred_at)} ·{" "}
                                {text(event.finance_reference)}
                                {(Array.isArray(event.evidence_files)
                                  ? event.evidence_files
                                  : []
                                ).map((file) => {
                                  const evidence = file as FilePreviewReference;
                                  return (
                                    <Button
                                      key={evidence.id}
                                      size="sm"
                                      variant="success"
                                      className="mt-2 mr-2 border-green-600 bg-green-600 text-white hover:bg-green-700"
                                      onClick={() => setPreviewFile(evidence)}
                                    >
                                      Lihat bukti: {evidence.original_filename}
                                    </Button>
                                  );
                                })}
                              </div>
                            ))}
                          {item.recovery_status === "open" ? (
                            <Button
                              size="sm"
                              className="mt-3"
                              onClick={() => setRecoveryEventFor(String(item.id))}
                            >
                              Catat tahap pengembalian
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Belum ada penyesuaian.</p>
              )}
            </div>
          </section>
          <section className="owner-report-list">
            <div className="p-5">
              <h3 className="font-semibold">Belum Kriteria Realisasi</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Daftar Admin saja; tidak pernah dipublikasikan ke Owner.
              </p>
              {not_eligible.length ? (
                <ul className="mt-3 grid gap-2">
                  {not_eligible.slice(0, 12).map((row) => (
                    <li key={String(row.lease_id)} className="flex justify-between gap-3 text-sm">
                      <span>
                        {text(row.room_code)} · {text(row.resident_name)}
                      </span>
                      <StatusBadge
                        label={notEligibleReason(row.reason_code)}
                        tone={notEligibleReasonTone(row.reason_code)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Tidak ada data pengecualian untuk realisasi ini.
                </p>
              )}
            </div>
          </section>
        </section>
      </main>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <Dialog open={actionDialog} onOpenChange={setActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{next?.label}</DialogTitle>
            <DialogDescription>
              Aksi ini memindahkan status Realisasi tanpa mengubah kontrak yang sudah terkunci.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Catatan tindakan
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(false)}>
              Batal
            </Button>
            <Button disabled={statusAction.isPending} onClick={() => statusAction.mutate()}>
              {statusAction.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={periodCorrectionDialog} onOpenChange={setPeriodCorrectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koreksi periode realisasi</DialogTitle>
            <DialogDescription>
              Gunakan untuk memindahkan realisasi yang salah periode berdasarkan bulan pelunasan.
              Tanggal, nominal, referensi, dan kuitansi transfer tidak diubah. Perubahan tercatat di
              audit Admin.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Periode realisasi yang benar
            <Input
              type="month"
              value={periodCorrection.target_period}
              onChange={(event) =>
                setPeriodCorrection((value) => ({ ...value, target_period: event.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Alasan koreksi
            <Textarea
              value={periodCorrection.reason}
              onChange={(event) =>
                setPeriodCorrection((value) => ({ ...value, reason: event.target.value }))
              }
              placeholder="Contoh: pelunasan terverifikasi pada Agustus, tetapi batch tersimpan di September."
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodCorrectionDialog(false)}>
              Batal
            </Button>
            <Button
              disabled={
                correctPeriod.isPending ||
                !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodCorrection.target_period) ||
                periodCorrection.reason.trim().length < 5
              }
              onClick={() => correctPeriod.mutate()}
            >
              {correctPeriod.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Simpan koreksi periode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kembalikan Realisasi ke draft</DialogTitle>
            <DialogDescription>
              Gunakan bila laporan memerlukan koreksi sebelum disetujui. Catatan alasan wajib
              tersimpan dalam audit.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Alasan pengembalian
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog(false)}>
              Batal
            </Button>
            <Button
              disabled={returnToDraft.isPending || note.trim().length < 3}
              onClick={() => returnToDraft.mutate()}
            >
              {returnToDraft.isPending ? <Loader2 className="animate-spin" /> : <ArrowLeft />}
              Kembalikan ke draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan realisasi</DialogTitle>
            <DialogDescription>
              Realisasi ini belum memiliki transfer berhasil. Pembatalan akan melepaskan kontrak
              yang terkunci agar dapat dibuat ulang. Data dan alasan pembatalan tetap tersimpan
              sebagai audit.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-semibold">{realization.owner_name}</p>
            <p className="text-muted-foreground">
              {realization.reference} · Hak Owner {rupiah(realization.realization_total)}
            </p>
          </div>
          <label className="space-y-1 text-sm font-medium">
            Alasan pembatalan <span className="text-destructive">*</span>
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              placeholder="Contoh: rekening Owner salah, perlu dibuat ulang dengan rekening terbaru."
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>
              Kembali
            </Button>
            <Button
              variant="destructive"
              disabled={cancelRealization.isPending || cancelReason.trim().length < 3}
              onClick={() => cancelRealization.mutate()}
            >
              {cancelRealization.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
              Batalkan realisasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={transferDialog} onOpenChange={setTransferDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Catat transfer Realisasi Owner</DialogTitle>
            <DialogDescription>
              Sisa hak Owner yang dapat ditransfer: {rupiah(available)}. Sistem membuat kuitansi
              transfer baru setelah berhasil dicatat.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm sm:col-span-2 sm:grid-cols-3">
              <span>
                Hak Owner <strong className="block">{rupiah(realization.realization_total)}</strong>
              </span>
              <span>
                Sudah ditransfer{" "}
                <strong className="block">{rupiah(realization.transferred_total)}</strong>
              </span>
              <span>
                Sisa transfer <strong className="block">{rupiah(available)}</strong>
              </span>
            </div>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Nominal transfer <span className="text-destructive">*</span>
              <RupiahField
                id="realization-transfer-amount"
                value={transfer.amount}
                onChange={(amount) => setTransfer((value) => ({ ...value, amount }))}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Metode transfer
              <Input readOnly value="Transfer Bank" className="bg-muted/45" />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tanggal dan waktu transfer <span className="text-destructive">*</span>
              <Input
                type="datetime-local"
                value={transfer.transferred_at}
                onChange={(event) =>
                  setTransfer((value) => ({ ...value, transferred_at: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Referensi transfer unik <span className="text-destructive">*</span>
              <Input
                value={transfer.reference}
                onChange={(event) =>
                  setTransfer((value) => ({ ...value, reference: event.target.value }))
                }
                placeholder="Contoh: TRF-RLS-SEP-001"
              />
            </label>
            <div className="rounded-lg border bg-muted/25 p-3 text-sm sm:col-span-2">
              <strong>Rekening tujuan tersimpan</strong>
              <p>
                {text(realization.owner_snapshot?.payout_bank_name)} · {maskedAccount} ·{" "}
                {text(realization.owner_snapshot?.payout_account_holder)}
              </p>
            </div>
            <label className="space-y-1 text-sm font-medium">
              Nama pemberi konfirmasi Keuangan <span className="text-destructive">*</span>
              <HistoricalRealizationSourceCombobox
                id="owner-realization-finance-confirmer"
                value={transfer.finance_confirmed_by}
                options={detail.data.finance_confirmers ?? []}
                required
                placeholder="Pilih atau tambah nama pemberi konfirmasi"
                searchPlaceholder="Cari nama tersimpan atau ketik nama baru..."
                storedLabel="Nama yang pernah digunakan pada properti ini"
                addLabel="nama pemberi konfirmasi"
                emptyMessage="Belum ada nama yang cocok. Ketik minimal 3 karakter untuk menambahkan nama baru."
                onChange={(value) =>
                  setTransfer((current) => ({ ...current, finance_confirmed_by: value }))
                }
              />
            </label>
            <div className="space-y-1 text-sm font-medium">
              Jalur konfirmasi Keuangan <span className="text-destructive">*</span>
              <Select
                value={transfer.finance_confirmation_channel}
                onValueChange={(channel) =>
                  setTransfer((value) => ({
                    ...value,
                    finance_confirmation_channel:
                      channel as typeof value.finance_confirmation_channel,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pesan">Pesan</SelectItem>
                  <SelectItem value="telepon">Telepon</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="tatap_muka">Tatap muka</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Waktu konfirmasi Keuangan <span className="text-destructive">*</span>
              <Input
                type="datetime-local"
                value={transfer.finance_confirmed_at}
                onChange={(event) =>
                  setTransfer((value) => ({ ...value, finance_confirmed_at: event.target.value }))
                }
              />
            </label>
            <div className="sm:col-span-2">
              <EvidenceFileUploadField
                propertyId={currentPropertyId}
                filePurpose="owner_realization_evidence"
                label="Bukti transfer"
                required={!legacyTransfer}
                description="JPG, PNG, WebP, atau PDF. Maksimal 3 file, 5 MB per file. Bukti hanya dapat diakses Admin."
                maxFiles={3}
                values={transfer.evidence_files}
                onChange={(files) => setTransfer((value) => ({ ...value, evidence_files: files }))}
                onBusyChange={setUploadBusy}
              />
            </div>
            {legacyTransfer && transfer.evidence_files.length === 0 ? (
              <>
                <p className="text-xs text-amber-700 sm:col-span-2">
                  Pengecualian hanya untuk transfer sebelum fitur bukti diterapkan. Alasan dan
                  sumber wajib dicatat; ini bukan pengganti bukti transfer.
                </p>
                <label className="space-y-1 text-sm font-medium">
                  Alasan bukti digital tidak tersedia <span className="text-destructive">*</span>
                  <Input
                    value={transfer.legacy_evidence_reason}
                    onChange={(event) =>
                      setTransfer((value) => ({
                        ...value,
                        legacy_evidence_reason: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Sumber catatan lama <span className="text-destructive">*</span>
                  <Input
                    value={transfer.legacy_evidence_source}
                    onChange={(event) =>
                      setTransfer((value) => ({
                        ...value,
                        legacy_evidence_source: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog(false)}>
              Batal
            </Button>
            <Button
              disabled={
                recordTransfer.isPending ||
                uploadBusy ||
                transfer.amount < 1 ||
                transfer.amount > available ||
                transfer.reference.trim().length < 3 ||
                transfer.finance_confirmed_by.trim().length < 3 ||
                !transfer.finance_confirmed_at ||
                (transfer.evidence_files.length === 0 &&
                  (!legacyTransfer ||
                    transfer.legacy_evidence_reason.trim().length < 5 ||
                    transfer.legacy_evidence_source.trim().length < 3))
              }
              onClick={() => recordTransfer.mutate()}
            >
              {recordTransfer.isPending ? <Loader2 className="animate-spin" /> : <Landmark />}Catat
              transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={correctionDialog} onOpenChange={setCorrectionDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isPostTransfer
                ? "Catat pengembalian kelebihan transfer"
                : "Tambah penyesuaian laporan"}
            </DialogTitle>
            <DialogDescription>
              {isPostTransfer
                ? "Dokumen dan kuitansi transfer awal tetap utuh. Catat cara pengembalian dana berlebih yang disetujui Keuangan."
                : "Hanya untuk koreksi yang memiliki sumber dan bukti. Penyesuaian tidak dapat menambahkan kontrak outstanding, deposit, atau hunian tanggungan Owner."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {isPostTransfer ? (
              <>
                <div className="grid gap-3 rounded-lg border bg-muted/25 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Hak Owner</p>
                    <p className="mt-1 font-semibold tabular-nums">{rupiah(ownerEntitlement)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Total yang sudah ditransfer
                    </p>
                    <p className="mt-1 font-semibold tabular-nums">{rupiah(transferredTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Kelebihan yang belum dikembalikan
                    </p>
                    <p className="mt-1 font-semibold tabular-nums text-red-700 dark:text-red-300">
                      {rupiah(recoverableOverpayment)}
                    </p>
                  </div>
                </div>
                <label className="space-y-1 text-sm font-medium">
                  Cara pengembalian dana berlebih
                  <Select
                    value={correction.recovery_disposition}
                    onValueChange={(path) =>
                      setCorrection((value) => ({
                        ...value,
                        recovery_disposition: path as typeof value.recovery_disposition,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recover_from_owner">Tagih ke Owner</SelectItem>
                      <SelectItem value="net_against_future_realization">
                        Potong realisasi berikutnya
                      </SelectItem>
                      <SelectItem value="outside_system_finance">
                        Diselesaikan di luar sistem
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </>
            ) : (
              <label className="space-y-1 text-sm font-medium">
                Jenis penyesuaian
                <select
                  value={correction.correction_kind}
                  onChange={(event) =>
                    setCorrection((value) => ({
                      ...value,
                      correction_kind: event.target.value as typeof value.correction_kind,
                    }))
                  }
                >
                  <option value="contract_correction">Koreksi kontrak</option>
                  <option value="approved_operational_adjustment">
                    Penyesuaian operasional disetujui
                  </option>
                </select>
              </label>
            )}
            <label className="space-y-1 text-sm font-medium">
              {isPostTransfer ? "Nominal pengembalian dana berlebih" : "Nominal penyesuaian"}{" "}
              <span className="text-destructive">*</span>
              {isPostTransfer ? (
                <>
                  <RupiahField
                    id="recovery-amount"
                    value={Math.abs(correction.amount)}
                    onChange={(amount) => setCorrection((value) => ({ ...value, amount }))}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    Maksimal {rupiah(recoverableOverpayment)} berdasarkan kelebihan transfer yang
                    belum dikembalikan.
                  </span>
                </>
              ) : (
                <Input
                  type="number"
                  value={correction.amount || ""}
                  onChange={(event) =>
                    setCorrection((value) => ({ ...value, amount: Number(event.target.value) }))
                  }
                />
              )}
            </label>
            <label className="space-y-1 text-sm font-medium">
              Alasan <span className="text-destructive">*</span>
              <Textarea
                value={correction.reason}
                onChange={(event) =>
                  setCorrection((value) => ({ ...value, reason: event.target.value }))
                }
                rows={3}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              {isPostTransfer ? (
                "Referensi keuangan (jika tersedia)"
              ) : (
                <>
                  Sumber koreksi <span className="text-destructive">*</span>
                </>
              )}
              <Input
                value={correction.source_reference}
                onChange={(event) =>
                  setCorrection((value) => ({ ...value, source_reference: event.target.value }))
                }
              />
            </label>
            <EvidenceFileUploadField
              propertyId={currentPropertyId}
              filePurpose="owner_realization_evidence"
              label="Lampiran bukti penyesuaian"
              required={!isPostTransfer}
              description="Lampirkan dokumen pendukung maksimal 5 MB per file. Tahap penyelesaian berikutnya wajib memiliki bukti atau referensi yang dapat ditelusuri."
              maxFiles={3}
              values={correction.evidence_files}
              onChange={(files) => setCorrection((value) => ({ ...value, evidence_files: files }))}
              onBusyChange={setUploadBusy}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionDialog(false)}>
              Batal
            </Button>
            <Button
              disabled={
                addCorrection.isPending ||
                uploadBusy ||
                correction.amount === 0 ||
                correction.reason.trim().length < 5 ||
                (!isPostTransfer &&
                  (correction.source_reference.trim().length < 3 ||
                    !correction.evidence_files.length)) ||
                (isPostTransfer &&
                  (correction.amount <= 0 || correction.amount > recoverableOverpayment))
              }
              onClick={() => addCorrection.mutate()}
            >
              {addCorrection.isPending ? <Loader2 className="animate-spin" /> : <PencilLine />}
              {isPostTransfer ? "Simpan pengembalian" : "Simpan penyesuaian"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(recoveryEventFor)}
        onOpenChange={(open) => !open && setRecoveryEventFor(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Catat tahap pengembalian dana berlebih</DialogTitle>
            <DialogDescription>
              Catat setiap penyelesaian secara terpisah. Riwayat yang sudah disimpan tidak dapat
              ditimpa.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
            Sisa nominal yang perlu dikembalikan: <strong>{rupiah(recoveryRemaining)}</strong>
          </p>
          <div className="grid gap-4">
            <label className="space-y-1 text-sm font-medium">
              Nominal yang dikembalikan <span className="text-destructive">*</span>
              <RupiahField
                id="recovery-event-amount"
                value={recoveryEvent.amount}
                onChange={(amount) => setRecoveryEvent((value) => ({ ...value, amount }))}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tanggal dan waktu penyelesaian <span className="text-destructive">*</span>
              <Input
                type="datetime-local"
                value={recoveryEvent.occurred_at}
                onChange={(event) =>
                  setRecoveryEvent((value) => ({ ...value, occurred_at: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Referensi Keuangan (jika tidak ada berkas)
              <Input
                value={recoveryEvent.finance_reference}
                onChange={(event) =>
                  setRecoveryEvent((value) => ({ ...value, finance_reference: event.target.value }))
                }
                placeholder="Nomor bukti atau catatan keuangan"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Catatan penyelesaian <span className="text-destructive">*</span>
              <Textarea
                rows={3}
                value={recoveryEvent.note}
                onChange={(event) =>
                  setRecoveryEvent((value) => ({ ...value, note: event.target.value }))
                }
              />
            </label>
            <EvidenceFileUploadField
              propertyId={currentPropertyId}
              filePurpose="owner_realization_evidence"
              label="Bukti pengembalian dana berlebih"
              description="Unggah bukti maksimal 5 MB per file atau isi referensi Keuangan yang dapat ditelusuri."
              maxFiles={3}
              values={recoveryEvent.evidence_files}
              onChange={(files) =>
                setRecoveryEvent((value) => ({ ...value, evidence_files: files }))
              }
              onBusyChange={setUploadBusy}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryEventFor(null)}>
              Batal
            </Button>
            <Button
              disabled={
                recordRecoveryEvent.isPending ||
                uploadBusy ||
                recoveryEvent.amount < 1 ||
                recoveryEvent.amount > recoveryRemaining ||
                recoveryEvent.note.trim().length < 5 ||
                (!recoveryEvent.evidence_files.length &&
                  recoveryEvent.finance_reference.trim().length < 3)
              }
              onClick={() => recordRecoveryEvent.mutate()}
            >
              {recordRecoveryEvent.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}{" "}
              Simpan tahap pengembalian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
