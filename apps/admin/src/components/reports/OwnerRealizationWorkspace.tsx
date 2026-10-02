/* Operational Owner realization queue. It deliberately keeps one visual system
 * with the existing report workspace while moving detail work to its own route. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileClock,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Trash,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import type { FileResponse } from "@granada-kost/domain";
import { ReportNavigation } from "@/components/reports/ReportsWorkspace";
import { ErrorState, LoadingState } from "@/components/state";
import { HistoricalRealizationSourceCombobox } from "@/components/reports/HistoricalRealizationSourceCombobox";
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
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
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
  downloadOwnerRealizationQueue,
  downloadOwnerRealizationNotEligible,
  downloadOwnerRealizationFinanceRequest,
  ownerRealizationApi,
  type OwnerRealizationFilters,
  type OwnerRealizationOwnerCounts,
  type OwnerRealizationRow,
  type OwnerRealizationStatus,
} from "@/lib/admin-owner-realization";
import { propertyOwnerApi } from "@/lib/admin-property-owner";
import { useProperty } from "@/lib/property";
import { formatIdrInput, normalizeDigits } from "@/lib/lease-onboarding-form";
import "./owner-settlement-workspace.css";

const PAGE_SIZE = 20;

type HistoricalTransferDraft = {
  id: string;
  amount: number;
  method: "bank_transfer";
  reference: string;
  evidenceReference: string;
  transferredAt: string;
  evidenceFiles: FileResponse[];
  legacyEvidenceReason: string;
  financeConfirmedBy: string;
  financeConfirmationChannel: "pesan" | "telepon" | "email" | "tatap_muka";
  financeConfirmedAt: string;
};

type HistoricalLineDraft = {
  id: string;
  source: "system" | "manual";
  leaseId?: string;
  roomCode: string;
  residentName: string;
  contractTotal: number;
  managementFee: number;
  correctionAmount: number;
  legacyReference: string;
  durationMonths?: number;
  paymentCompletedAt: string;
  checkInAt: string;
  checkOutAt: string;
};

function emptyHistoricalLine(): HistoricalLineDraft {
  return {
    id: crypto.randomUUID(),
    source: "manual",
    roomCode: "",
    residentName: "",
    contractTotal: 0,
    managementFee: 0,
    correctionAmount: 0,
    legacyReference: "",
    durationMonths: undefined,
    paymentCompletedAt: "",
    checkInAt: "",
    checkOutAt: "",
  };
}

function historicalLineFromLease(
  lease: NonNullable<OwnerRealizationRow["eligible_leases"]>[number],
): HistoricalLineDraft {
  return {
    ...emptyHistoricalLine(),
    source: "system",
    leaseId: lease.id,
    roomCode: lease.room_code,
    residentName: lease.resident_name,
    contractTotal: Number(lease.contract_total),
    managementFee: Number(lease.management_fee),
  };
}

function localDateTimeInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function emptyHistoricalTransfer(): HistoricalTransferDraft {
  return {
    id: crypto.randomUUID(),
    amount: 0,
    method: "bank_transfer",
    reference: "",
    evidenceReference: "",
    transferredAt: localDateTimeInputValue(),
    evidenceFiles: [],
    legacyEvidenceReason: "",
    financeConfirmedBy: "",
    financeConfirmationChannel: "pesan",
    financeConfirmedAt: localDateTimeInputValue(),
  };
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

function HistoricalRupiahInput({
  id,
  value,
  onChange,
  invalid = false,
  required = false,
  readOnly = false,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div
      className={`flex min-h-11 w-full items-center overflow-hidden rounded-md border border-input bg-background shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 ${readOnly ? "bg-muted/45 text-muted-foreground" : ""}`}
      data-invalid={invalid || undefined}
    >
      <span className="border-r border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
        Rp
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        readOnly={readOnly}
        aria-required={required || undefined}
        aria-invalid={invalid}
        value={value > 0 ? formatIdrInput(value) : ""}
        onChange={(event) => onChange(normalizeDigits(event.target.value))}
        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 read-only:cursor-not-allowed read-only:text-muted-foreground"
        placeholder="0"
      />
    </div>
  );
}

const statusLabel: Record<OwnerRealizationStatus | "not_prepared", string> = {
  not_prepared: "Belum disiapkan",
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

function rupiah(value: string | number | null | undefined) {
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

function tone(status: OwnerRealizationStatus | "not_prepared"): StatusTone {
  if (status === "void") return "danger";
  if (status === "realized" || status === "published_to_owner") return "success";
  if (["awaiting_review", "submitted_to_finance", "awaiting_transfer"].includes(status))
    return "warning";
  if (["draft", "approved", "partially_realized"].includes(status)) return "info";
  return "neutral";
}

function transferProgressTone(progress: number) {
  if (progress >= 100) return "success";
  if (progress >= 70) return "info";
  if (progress >= 40) return "warning";
  return "danger";
}

function notEligibleLabel(reason: string) {
  const labels: Record<string, string> = {
    OUTSTANDING_CONTRACT_RENT: "Kontrak belum lunas",
    OWNER_SPONSORED_EXCLUDED: "Hunian tanggungan Owner",
    ALREADY_ALLOCATED_TO_REALIZATION: "Sudah masuk realisasi lain",
    PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD: "Pelunasan di luar periode",
    OWNER_ASSIGNMENT_UNAVAILABLE: "Owner belum terhubung ke kamar",
  };
  return labels[reason] ?? reason;
}

async function listAllOwnersForHistoricalInput(
  propertyId: string,
  ownerProfileStatus: "active" | "archived" | "all" = "active",
) {
  const filters = {
    limit: 100,
    ...(ownerProfileStatus === "all" ? {} : { status: ownerProfileStatus }),
  };
  const first = await propertyOwnerApi.list(propertyId, filters);
  const owners = [...first.data];
  for (let offset = first.meta.limit; offset < first.meta.total; offset += first.meta.limit) {
    const next = await propertyOwnerApi.list(propertyId, {
      ...filters,
      offset,
      limit: first.meta.limit,
    });
    owners.push(...next.data);
  }
  return owners;
}

function nextAction(row: OwnerRealizationRow) {
  const status = row.realization?.status;
  if (!row.realization)
    return { label: "Buat Realisasi", action: "prepare" as const, icon: FilePlus2 };
  if (status === "draft")
    return { label: "Ajukan pemeriksaan", action: "submit-review" as const, icon: Send };
  if (status === "awaiting_review")
    return { label: "Setujui realisasi", action: "approve" as const, icon: ClipboardCheck };
  if (status === "approved")
    return { label: "Ajukan ke keuangan", action: "submit-finance" as const, icon: Landmark };
  if (status === "submitted_to_finance")
    return {
      label: "Tandai menunggu transfer",
      action: "awaiting-transfer" as const,
      icon: FileClock,
    };
  if (status === "awaiting_transfer" || status === "partially_realized")
    return {
      label: status === "partially_realized" ? "Lanjutkan transfer" : "Catat transfer",
      action: "record-transfer" as const,
      icon: Landmark,
    };
  if (status === "realized")
    return { label: "Terbitkan ke Owner", action: "publish" as const, icon: CheckCircle2 };
  return null;
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
  tone: cardTone = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  return (
    <article className="owner-report-summary" data-tone={cardTone}>
      <span className="owner-report-summary__icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function OwnerProgressSummary({
  workspace,
  counts,
  resultCount,
  criteria,
  cardRef,
}: {
  workspace: "active" | "history";
  counts: OwnerRealizationOwnerCounts;
  resultCount: number;
  criteria: readonly string[];
  cardRef?: (node: HTMLElement | null) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const isHistory = workspace === "history";
  const remaining = isHistory
    ? counts.waiting_publication
    : Math.max(counts.total - counts.published, 0);
  const resultTitle =
    resultCount > 0
      ? `Menampilkan ${resultCount} data realisasi Owner`
      : "Tidak ada data realisasi Owner yang cocok";
  const resultDescription =
    resultCount > 0
      ? `Sesuai filter: ${criteria.join(" • ")}.`
      : `Belum ditemukan hasil untuk ${criteria.join(" • ")}. Ubah atau reset filter untuk mencoba lagi.`;
  if (dismissed) return null;

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-emerald-950 shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:text-emerald-50"
      aria-live="polite"
      aria-label={
        isHistory ? "Ringkasan penerbitan riwayat realisasi" : "Ringkasan realisasi Owner"
      }
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{resultTitle}</p>
          <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
            {resultDescription}
          </p>
          <div className="mt-3 border-t border-emerald-700/15 pt-3 dark:border-emerald-100/20">
            <p className="text-sm font-semibold">
              {isHistory ? "Ringkasan Riwayat Realisasi Owner" : "Ringkasan Realisasi Owner"}
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight">
              {counts.published} Owner {isHistory ? "sudah diterbitkan" : "sudah direalisasi"} dari{" "}
              {counts.total} Owner
            </p>
            <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
              {remaining} Owner {isHistory ? "menunggu diterbitkan" : "belum direalisasi"}
              {counts.voided > 0 ? ` · ${counts.voided} Owner dibatalkan` : ""}
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1.5 text-emerald-800/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 dark:text-emerald-100/70 dark:hover:text-emerald-50"
        aria-label="Tutup ringkasan realisasi Owner"
        title="Tutup ringkasan"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </section>
  );
}

export function OwnerRealizationWorkspace() {
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const defaultPeriod = previousJakartaMonth();
  const [draft, setDraft] = useState<OwnerRealizationFilters>({
    property_id: currentPropertyId ?? "",
    period: defaultPeriod,
    workspace: "active",
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [applied, setApplied] = useState(draft);
  const [prepareTarget, setPrepareTarget] = useState<OwnerRealizationRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<OwnerRealizationRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [workflowTarget, setWorkflowTarget] = useState<OwnerRealizationRow | null>(null);
  const [historicalDialogOpen, setHistoricalDialogOpen] = useState(false);
  const [historicalUploadBusy, setHistoricalUploadBusy] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<"future" | "historical">("future");
  const [historicalOwnerId, setHistoricalOwnerId] = useState("");
  const [creationTarget, setCreationTarget] = useState<OwnerRealizationRow | null>(null);
  const [selectedLeaseIds, setSelectedLeaseIds] = useState<string[]>([]);
  const [filterNoticeRevision, setFilterNoticeRevision] = useState(1);
  const searchDebounceRef = useRef<number | null>(null);
  const ownerProgressRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [note, setNote] = useState("");
  const [historical, setHistorical] = useState({
    source: "Rekap manual Admin",
    lines: [] as HistoricalLineDraft[],
    transfers: [] as HistoricalTransferDraft[],
    notes: "",
  });
  useEffect(() => {
    if (!currentPropertyId) return;
    const restoreFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const workspaceParam = params.get("workspace");
      const workspace =
        workspaceParam === "history" || workspaceParam === "not_eligible"
          ? workspaceParam
          : "active";
      const offset = Number(params.get("offset"));
      const restored: OwnerRealizationFilters = {
        property_id: currentPropertyId,
        period: params.get("period") || defaultPeriod,
        workspace,
        limit: PAGE_SIZE,
        offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
        ...(params.get("q") ? { q: params.get("q")! } : {}),
        ...(params.get("status")
          ? { status: params.get("status") as OwnerRealizationFilters["status"] }
          : {}),
        owner_profile_status:
          params.get("owner_profile_status") === "archived" ||
          params.get("owner_profile_status") === "all"
            ? (params.get(
                "owner_profile_status",
              ) as OwnerRealizationFilters["owner_profile_status"])
            : "active",
      };
      setFilterNoticeRevision(1);
      setDraft(restored);
      setApplied(restored);
    };
    restoreFromUrl();
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [currentPropertyId, defaultPeriod]);

  useEffect(
    () => () => {
      if (searchDebounceRef.current !== null) window.clearTimeout(searchDebounceRef.current);
    },
    [],
  );

  const list = useQuery({
    queryKey: ["owner-realizations", applied],
    queryFn: () => ownerRealizationApi.list(applied),
    enabled: Boolean(currentPropertyId && applied.property_id),
  });
  const notEligible = useQuery({
    queryKey: ["owner-realizations-not-eligible", applied],
    queryFn: () => ownerRealizationApi.notEligible({ ...applied, workspace: "not_eligible" }),
    enabled: Boolean(
      currentPropertyId && applied.property_id && applied.workspace === "not_eligible",
    ),
  });
  const owners = useQuery({
    queryKey: [
      "property-owners-for-owner-realization",
      currentPropertyId,
      applied.owner_profile_status ?? "active",
    ],
    queryFn: () =>
      listAllOwnersForHistoricalInput(currentPropertyId!, applied.owner_profile_status ?? "active"),
    enabled: Boolean(currentPropertyId),
  });
  const historicalSources = useQuery({
    queryKey: ["owner-realization-historical-sources", currentPropertyId],
    queryFn: () => ownerRealizationApi.historicalSources(currentPropertyId!),
    enabled: Boolean(currentPropertyId && historicalDialogOpen && creationMode === "historical"),
    staleTime: 5 * 60 * 1000,
  });
  const financeConfirmers = useQuery({
    queryKey: ["owner-realization-finance-confirmers", currentPropertyId],
    queryFn: () => ownerRealizationApi.financeConfirmers(currentPropertyId!),
    enabled: Boolean(currentPropertyId && historicalDialogOpen),
    staleTime: 5 * 60 * 1000,
  });
  const historicalSourceOptions = useMemo(
    () => ["Rekap manual Admin", ...(historicalSources.data?.items ?? [])],
    [historicalSources.data?.items],
  );
  const financeConfirmerOptions = useMemo(
    () => financeConfirmers.data?.items ?? [],
    [financeConfirmers.data?.items],
  );
  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: ["owner-realizations"] });
  const prepare = useMutation({
    mutationFn: ({ ownerId, leaseIds }: { ownerId: string; leaseIds?: string[] }) =>
      ownerRealizationApi.prepare(ownerId, {
        property_id: currentPropertyId!,
        period: applied.period!,
        notes: note.trim() || undefined,
        selected_lease_ids: leaseIds?.length ? leaseIds : undefined,
      }),
    onSuccess: async () => {
      toast.success("Draft Realisasi Owner berhasil disiapkan.");
      setPrepareTarget(null);
      setHistoricalDialogOpen(false);
      setSaveConfirmationOpen(false);
      setHistoricalOwnerId("");
      setCreationTarget(null);
      setSelectedLeaseIds([]);
      setNote("");
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Realisasi belum dapat disiapkan."),
  });
  const cancelRealization = useMutation({
    mutationFn: (row: OwnerRealizationRow) => {
      if (
        !row.realization ||
        ![
          "draft",
          "awaiting_review",
          "approved",
          "submitted_to_finance",
          "awaiting_transfer",
        ].includes(row.realization.status) ||
        Number(row.realization.transferred_total) > 0
      )
        throw new Error("Realisasi tidak dapat dibatalkan setelah transfer berhasil.");
      return ownerRealizationApi.cancel(row.realization.id, {
        property_id: currentPropertyId!,
        reason: voidReason.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("Realisasi dibatalkan. Kontrak kembali tersedia untuk batch berikutnya.");
      setVoidTarget(null);
      setVoidReason("");
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Realisasi belum dapat dibatalkan."),
  });
  const workflow = useMutation({
    mutationFn: (row: OwnerRealizationRow) => {
      const action = nextAction(row)?.action;
      if (!action || action === "prepare" || action === "record-transfer" || !row.realization)
        throw new Error("Aksi Realisasi tidak tersedia.");
      return ownerRealizationApi.transition(row.realization.id, action, {
        property_id: currentPropertyId!,
        note: note.trim() || "Dicatat melalui workspace Realisasi Owner.",
      });
    },
    onSuccess: async () => {
      toast.success("Tahap Realisasi Owner berhasil diperbarui.");
      setWorkflowTarget(null);
      setNote("");
      await invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Tahap Realisasi belum dapat diperbarui.",
      ),
  });
  const historicalMutation = useMutation({
    mutationFn: (ownerId: string) => {
      if (!ownerId) throw new Error("Pilih Owner untuk realisasi historis terlebih dahulu.");
      const lines = historical.lines.map((line, index) => {
        const roomCode = line.roomCode.trim();
        const residentName = line.residentName.trim();
        const total = line.contractTotal;
        const fee = line.managementFee;
        if (
          !roomCode ||
          !residentName ||
          !Number.isSafeInteger(total) ||
          total < 0 ||
          !Number.isSafeInteger(fee) ||
          fee < 0
        ) {
          throw new Error(
            `Baris ${index + 1} belum valid. Isi kamar, nama penghuni, total sewa, dan management fee.`,
          );
        }
        const correction = line.correctionAmount || undefined;
        if (correction !== undefined && !Number.isSafeInteger(correction)) {
          throw new Error(`Penyesuaian pada baris ${index + 1} harus berupa nominal Rupiah bulat.`);
        }
        const duration = line.durationMonths;
        if (
          duration !== undefined &&
          (!Number.isSafeInteger(duration) || duration < 1 || duration > 120)
        ) {
          throw new Error(`Durasi pada baris ${index + 1} harus berupa jumlah bulan 1–120.`);
        }
        const dateFields = [
          ["tanggal pelunasan", line.paymentCompletedAt],
          ["tanggal check-in", line.checkInAt],
          ["tanggal check-out", line.checkOutAt],
        ] as const;
        for (const [label, value] of dateFields) {
          if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error(
              `${label} pada baris ${index + 1} harus menggunakan format YYYY-MM-DD.`,
            );
          }
        }
        return {
          ...(line.source === "system" && line.leaseId ? { lease_id: line.leaseId } : {}),
          room_code: roomCode,
          resident_name: residentName,
          contract_total: total,
          management_fee: fee,
          correction_amount: correction,
          legacy_reference: line.legacyReference.trim() || undefined,
          duration_months: duration,
          payment_completed_at: line.paymentCompletedAt || undefined,
          check_in_at: line.checkInAt || undefined,
          check_out_at: line.checkOutAt || undefined,
        };
      });
      if (!lines.length) throw new Error("Masukkan setidaknya satu baris realisasi historis.");
      if (!historical.source.trim() || historical.source.trim().length < 3) {
        throw new Error("Pilih atau tambahkan sumber historis dengan minimal 3 karakter.");
      }
      if (historical.source.trim().length > 120)
        throw new Error("Sumber data historis tidak boleh lebih dari 120 karakter.");
      const references = new Set<string>();
      const transfers = historical.transfers.map((transfer, index) => {
        if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0)
          throw new Error(`Nominal transfer ke-${index + 1} harus lebih dari Rp 0.`);
        const reference = transfer.reference.trim();
        if (reference.length < 3 || reference.length > 150)
          throw new Error(`Referensi transfer ke-${index + 1} harus berisi 3–150 karakter.`);
        const normalizedReference = reference.toLocaleLowerCase("id-ID");
        if (references.has(normalizedReference))
          throw new Error("Setiap transfer harus memiliki referensi yang berbeda.");
        references.add(normalizedReference);
        if (!transfer.transferredAt || Number.isNaN(new Date(transfer.transferredAt).getTime()))
          throw new Error(`Tanggal transfer ke-${index + 1} belum valid.`);
        if (transfer.evidenceReference.trim().length > 300)
          throw new Error(`Referensi bukti transfer ke-${index + 1} maksimal 300 karakter.`);
        const legacy =
          new Date(transfer.transferredAt).getTime() <
          new Date("2026-09-29T00:00:00+07:00").getTime();
        if (
          !transfer.evidenceFiles.length &&
          (!legacy || transfer.legacyEvidenceReason.trim().length < 5)
        )
          throw new Error(
            `Transfer ke-${index + 1} memerlukan bukti unggahan, atau alasan pengecualian untuk transaksi lama.`,
          );
        return {
          amount: transfer.amount,
          method: transfer.method,
          reference,
          evidence_reference: transfer.evidenceReference.trim() || undefined,
          transferred_at: new Date(transfer.transferredAt).toISOString(),
          evidence_file_ids: transfer.evidenceFiles.map((file) => file.id),
          legacy_evidence_reason: transfer.legacyEvidenceReason.trim() || undefined,
          finance_confirmed_by: transfer.financeConfirmedBy.trim() || undefined,
          finance_confirmation_channel: transfer.financeConfirmedBy.trim()
            ? transfer.financeConfirmationChannel
            : undefined,
          finance_confirmed_at:
            transfer.financeConfirmedBy.trim() && transfer.financeConfirmedAt
              ? new Date(transfer.financeConfirmedAt).toISOString()
              : undefined,
        };
      });
      const transferTotal = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
      if (!Number.isSafeInteger(transferTotal))
        throw new Error("Total transfer melebihi batas nominal aman yang dapat diproses.");
      return ownerRealizationApi.historical(ownerId, {
        property_id: currentPropertyId!,
        period: applied.period!,
        entry_kind: "historical_manual",
        historical_source: historical.source.trim() || "Rekap manual Admin",
        notes: historical.notes.trim() || undefined,
        lines,
        ...(transfers.length ? { transfers } : {}),
      });
    },
    onSuccess: async () => {
      toast.success(
        "Realisasi historis berhasil disimpan. Dokumen kuitansi tersedia bila transfer tercatat.",
      );
      setHistoricalDialogOpen(false);
      setHistoricalOwnerId("");
      setHistorical({
        source: "Rekap manual Admin",
        lines: [],
        transfers: [],
        notes: "",
      });
      await queryClient.invalidateQueries({
        queryKey: ["owner-realization-historical-sources", currentPropertyId],
      });
      await invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Realisasi historis belum dapat disimpan.",
      ),
  });

  const rows = list.data?.rows ?? [];
  const notEligibleRows = notEligible.data?.rows ?? [];
  const total =
    applied.workspace === "not_eligible"
      ? (notEligible.data?.meta.total ?? 0)
      : (list.data?.meta.total ?? 0);
  const noticeQuery = applied.workspace === "not_eligible" ? notEligible : list;
  const filterLoading = noticeQuery.isFetching;
  useEffect(() => {
    if (
      filterNoticeRevision <= 1 ||
      noticeQuery.isFetching ||
      noticeQuery.isError ||
      !noticeQuery.data
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = ownerProgressRef.current ?? workspaceRef.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterNoticeRevision, noticeQuery.data, noticeQuery.isError, noticeQuery.isFetching]);
  const workspaceLabel =
    applied.workspace === "history"
      ? "Riwayat realisasi"
      : applied.workspace === "not_eligible"
        ? "Tidak layak"
        : "Realisasi aktif";
  const ownerProfileStatusLabel =
    applied.owner_profile_status === "archived"
      ? "Owner diarsipkan"
      : applied.owner_profile_status === "all"
        ? "Semua Owner"
        : "Owner aktif";
  const filterCriteria = [
    `periode ${monthLabel(applied.period ?? defaultPeriod)}`,
    applied.q?.trim() ? `pencarian "${applied.q.trim()}"` : "",
    `ruang kerja: ${workspaceLabel}`,
    applied.status ? `status: ${statusLabel[applied.status] ?? applied.status}` : "",
    `status profil: ${ownerProfileStatusLabel}`,
  ].filter(Boolean);
  const displayedCount =
    applied.workspace === "not_eligible" ? notEligibleRows.length : rows.length;
  const shown = useMemo(
    () => ({
      start: total ? (applied.offset ?? 0) + 1 : 0,
      end: Math.min((applied.offset ?? 0) + displayedCount, total),
    }),
    [applied.offset, displayedCount, total],
  );
  const apply = (nextDraft: OwnerRealizationFilters = draft) => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const next = {
      ...nextDraft,
      property_id: currentPropertyId ?? "",
      offset: 0,
      limit: PAGE_SIZE,
    };
    setApplied(next);
    setFilterNoticeRevision((revision) => revision + 1);
    const url = new URL(window.location.href);
    ["period", "q", "workspace", "status", "owner_profile_status"].forEach((key) => {
      const value = next[key as keyof OwnerRealizationFilters];
      if (value) url.searchParams.set(key, String(value));
      else url.searchParams.delete(key);
    });
    url.searchParams.delete("offset");
    history.replaceState(null, "", url);
  };
  const set = (key: keyof OwnerRealizationFilters, value: string) => {
    const next = { ...draft, [key]: value || undefined };
    setDraft(next);
    if (key === "q") {
      if (searchDebounceRef.current !== null) window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = window.setTimeout(() => apply(next), 400);
      return;
    }
    apply(next);
  };
  const reset = () => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const next = {
      property_id: currentPropertyId ?? "",
      period: defaultPeriod,
      workspace: "active" as const,
      limit: PAGE_SIZE,
      offset: 0,
    };
    setDraft(next);
    setApplied(next);
    setFilterNoticeRevision((revision) => revision + 1);
    history.replaceState(null, "", window.location.pathname);
  };
  const page = (offset: number) =>
    setApplied((current) => ({ ...current, offset: Math.max(0, offset) }));
  const detailPath = (row: OwnerRealizationRow) =>
    row.realization ? `/reports/property-owners/${row.realization.id}` : null;
  const transferPath = (row: OwnerRealizationRow) =>
    row.realization ? `${detailPath(row)}?focus=transfer` : null;
  const canCancelRow = (row: OwnerRealizationRow) =>
    Boolean(
      row.realization &&
      [
        "draft",
        "awaiting_review",
        "approved",
        "submitted_to_finance",
        "awaiting_transfer",
      ].includes(row.realization.status) &&
      Number(row.realization.transferred_total) === 0,
    );
  const exportQueue = async (format: "pdf" | "xlsx") => {
    try {
      if (applied.workspace === "not_eligible") {
        await downloadOwnerRealizationNotEligible(applied, format);
        toast.success(`Daftar tidak layak ${format.toUpperCase()} berhasil diunduh.`);
      } else {
        await downloadOwnerRealizationQueue(applied, format);
        toast.success(`Antrian Realisasi Owner ${format.toUpperCase()} berhasil diunduh.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Antrian Realisasi belum dapat diunduh.",
      );
    }
  };
  const exportFinanceRequest = async (format: "pdf" | "xlsx") => {
    try {
      await downloadOwnerRealizationFinanceRequest(applied, format);
      toast.success(`Form pengajuan Finance ${format.toUpperCase()} berhasil diunduh.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Form pengajuan Finance belum dapat diunduh.",
      );
    }
  };
  const switchWorkspace = (workspace: "active" | "history" | "not_eligible") => {
    apply({ ...draft, workspace });
    setDraft((value) => ({ ...value, workspace }));
  };
  const seedHistoricalLines = (target: OwnerRealizationRow | null) =>
    target?.eligible_leases?.length
      ? target.eligible_leases.map(historicalLineFromLease)
      : [emptyHistoricalLine()];
  const openCreation = (ownerId = "", mode: "future" | "historical" = "future") => {
    setCreationMode(mode);
    setHistoricalOwnerId(ownerId);
    const target = rows.find((row) => row.owner_id === ownerId) ?? null;
    setCreationTarget(target);
    setSelectedLeaseIds(target?.eligible_lease_ids ?? []);
    setHistorical((value) => ({
      ...value,
      lines: mode === "historical" ? seedHistoricalLines(target) : [],
    }));
    setHistoricalDialogOpen(true);
  };
  const creationOwnerId = historicalOwnerId || creationTarget?.owner_id || "";
  const selectedCreationOwner = useMemo(
    () => (owners.data ?? []).find((owner) => owner.id === creationOwnerId) ?? null,
    [creationOwnerId, owners.data],
  );
  const exportScopeLabel =
    applied.workspace === "history"
      ? "Riwayat Realisasi"
      : applied.workspace === "not_eligible"
        ? "Tidak Layak Realisasi"
        : "Realisasi Aktif";
  const historicalTransferTotal = historical.transfers.reduce(
    (sum, transfer) => sum + transfer.amount,
    0,
  );
  const historicalTransferTotalIsSafe = Number.isSafeInteger(historicalTransferTotal);
  const historicalOwnerTotal = useMemo(
    () =>
      historical.lines.reduce(
        (total, line) =>
          total + line.contractTotal - line.managementFee + (line.correctionAmount || 0),
        0,
      ),
    [historical.lines],
  );
  const historicalContractTotal = historical.lines.reduce(
    (sum, line) => sum + line.contractTotal,
    0,
  );
  const historicalFeeTotal = historical.lines.reduce((sum, line) => sum + line.managementFee, 0);
  const historicalCorrectionTotal = historical.lines.reduce(
    (sum, line) => sum + (line.correctionAmount || 0),
    0,
  );
  const historicalRemaining = Math.max(historicalOwnerTotal - historicalTransferTotal, 0);
  const historicalTransferExceedsOwner = historicalTransferTotal > historicalOwnerTotal;
  const historicalOwnerName = creationTarget?.owner_name ?? historicalOwnerId;
  const historicalPeriodLabel = monthLabel(applied.period ?? defaultPeriod);
  const latestPeriodLabel = (value: string) => monthLabel(value.slice(0, 7));
  const openSaveConfirmation = () => {
    if (!creationOwnerId) {
      toast.error("Pilih Owner untuk realisasi historis terlebih dahulu.");
      return;
    }
    if (!historical.lines.length) {
      toast.error("Masukkan setidaknya satu baris realisasi historis.");
      return;
    }
    const invalidLine = historical.lines.find(
      (line) =>
        !line.roomCode.trim() ||
        !line.residentName.trim() ||
        !Number.isSafeInteger(line.contractTotal) ||
        line.contractTotal < 0 ||
        !Number.isSafeInteger(line.managementFee) ||
        line.managementFee < 0,
    );
    if (invalidLine) {
      toast.error("Lengkapi kamar, nama penghuni, total sewa, dan management fee terlebih dahulu.");
      return;
    }
    if (!historical.source.trim() || historical.source.trim().length < 3) {
      toast.error("Pilih atau tambahkan sumber data historis terlebih dahulu.");
      return;
    }
    if (!historicalTransferTotalIsSafe || historicalTransferExceedsOwner) {
      toast.error("Total transfer tidak boleh melebihi Hak Owner pada baris realisasi.");
      return;
    }
    setSaveConfirmationOpen(true);
  };

  if (!currentPropertyId)
    return (
      <AppShell title="Realisasi Owner">
        <LoadingState label="Menyiapkan properti..." />
      </AppShell>
    );

  return (
    <AppShell title="Realisasi Owner" subtitle="Rilis hak Owner dari kontrak sewa yang telah lunas">
      <main className="owner-report-workspace">
        <ReportNavigation active="property-owners" />
        <section className="owner-report-hero" aria-labelledby="owner-realization-heading">
          <div>
            <p className="owner-report-eyebrow">Realisasi hak Owner</p>
            <h2 id="owner-realization-heading">
              Satu kontrak lunas, satu jejak realisasi yang dapat diaudit
            </h2>
            <p>
              Hanya sewa berbayar yang sudah lunas masuk realisasi. Deposit keamanan dan hunian
              tanggungan Owner tidak tercampur ke hak Owner.
            </p>
          </div>
        </section>
        <section className="owner-report-summary-grid" aria-label="Ringkasan Realisasi Owner">
          <SummaryCard
            label="Total kontrak layak"
            value={rupiah(list.data?.summary.eligible_contract_total)}
            helper="Kontrak sewa yang sudah lunas"
            icon={<WalletCards />}
          />
          <SummaryCard
            label="Total management fee"
            value={rupiah(list.data?.summary.management_fee_total)}
            helper="Mengikuti data kontrak saat dibuat"
            icon={<Building2 />}
            tone="slate"
          />
          <SummaryCard
            label="Hak Owner direalisasikan"
            value={rupiah(list.data?.summary.realization_total)}
            helper="Setelah fee dan penyesuaian sah"
            icon={<Landmark />}
            tone="blue"
          />
          <SummaryCard
            label="Dana sudah ditransfer"
            value={rupiah(list.data?.summary.transferred_total)}
            helper="Termasuk realisasi bertahap"
            icon={<CheckCircle2 />}
            tone="green"
          />
        </section>
        <section
          ref={workspaceRef}
          tabIndex={-1}
          className="owner-report-workspace-switcher outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2"
          aria-labelledby="owner-realization-workspace-heading"
        >
          <div className="owner-report-workspace-switcher__copy">
            <h3 id="owner-realization-workspace-heading">Ruang kerja Realisasi Owner</h3>
            <p>Pilih antrean untuk ditinjau atau mulai membuat realisasi baru.</p>
          </div>
          <div
            className="owner-report-workspace-switcher__actions"
            role="group"
            aria-label="Ruang kerja dan tindakan realisasi"
          >
            <Button
              variant={applied.workspace === "active" ? "info" : "outline"}
              className="owner-report-workspace-switcher__tab"
              aria-pressed={applied.workspace === "active"}
              onClick={() => switchWorkspace("active")}
            >
              <FileClock />
              Realisasi aktif
            </Button>
            <Button
              variant={applied.workspace === "history" ? "info" : "outline"}
              className="owner-report-workspace-switcher__tab"
              aria-pressed={applied.workspace === "history"}
              onClick={() => switchWorkspace("history")}
            >
              <WalletCards />
              Riwayat realisasi
            </Button>
            <Button
              variant={applied.workspace === "not_eligible" ? "info" : "outline"}
              className="owner-report-workspace-switcher__tab"
              aria-pressed={applied.workspace === "not_eligible"}
              onClick={() => switchWorkspace("not_eligible")}
            >
              <ClipboardCheck />
              Tidak layak
            </Button>
            <Button
              variant="success"
              className="owner-report-workspace-switcher__create"
              aria-haspopup="dialog"
              aria-expanded={historicalDialogOpen}
              onClick={() => openCreation()}
            >
              <FilePlus2 />
              Buat Realisasi Manual
            </Button>
          </div>
        </section>
        <section className="owner-report-filter" aria-labelledby="owner-realization-filter-heading">
          <div className="owner-report-filter__heading">
            <div>
              <h3 id="owner-realization-filter-heading">Antrian Realisasi Owner</h3>
              <p>
                Periode dapat dipilih untuk laporan baru maupun rekam data manual Agustus 2026 dan
                setelahnya.
              </p>
            </div>
            <Badge className="owner-report-period-badge" variant="outline">
              {monthLabel(applied.period ?? defaultPeriod)}
            </Badge>
          </div>
          <div className="owner-report-filter__grid">
            <label>
              Periode realisasi
              <MonthYearPicker
                value={draft.period ?? ""}
                onChange={(value) => set("period", value)}
                className="owner-report-filter__month-picker"
                label="Periode realisasi"
                title="Periode realisasi"
                description="Pilih bulan dan tahun untuk antrean Realisasi Owner."
                yearLabel="Tahun realisasi"
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      apply({ ...draft, q: event.currentTarget.value || undefined });
                    }
                  }}
                  placeholder="Nama atau nomor telepon"
                />
              </span>
            </label>
            <label>
              Ruang kerja
              <select
                className="owner-report-filter__select"
                value={draft.workspace ?? "active"}
                onChange={(event) => set("workspace", event.target.value)}
              >
                <option value="active">Realisasi aktif</option>
                <option value="history">Riwayat realisasi</option>
                <option value="not_eligible">Tidak memenuhi syarat</option>
              </select>
            </label>
            <label>
              Status
              <select
                className="owner-report-filter__select"
                value={draft.status ?? ""}
                onChange={(event) => set("status", event.target.value)}
              >
                <option value="">Semua status</option>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status profil Owner
              <select
                className="owner-report-filter__select"
                value={draft.owner_profile_status ?? "active"}
                onChange={(event) => set("owner_profile_status", event.target.value)}
              >
                <option value="active">Owner aktif</option>
                <option value="archived">Owner diarsipkan</option>
                <option value="all">Semua Owner</option>
              </select>
            </label>
          </div>
          <div className="owner-report-filter__actions">
            <Button variant="destructive" onClick={reset}>
              <RefreshCcw />
              Reset filter
            </Button>
            <Button
              variant="destructive"
              className="owner-report-export--pdf ml-auto whitespace-normal text-center leading-tight"
              onClick={() => void exportQueue("pdf")}
              disabled={filterLoading}
            >
              <FileText />
              Unduh PDF {exportScopeLabel}
            </Button>
            <Button
              variant="success"
              className="owner-report-export--excel whitespace-normal text-center leading-tight"
              onClick={() => void exportQueue("xlsx")}
              disabled={filterLoading}
            >
              <FileSpreadsheet />
              Unduh Excel {exportScopeLabel}
            </Button>
            {applied.workspace === "history" ? (
              <>
                <Button
                  variant="destructive"
                  className="owner-report-export--pdf whitespace-normal text-center leading-tight"
                  onClick={() => void exportFinanceRequest("pdf")}
                  disabled={filterLoading}
                >
                  <FileText />
                  Unduh Form Finance PDF
                </Button>
                <Button
                  variant="success"
                  className="owner-report-export--excel whitespace-normal text-center leading-tight"
                  onClick={() => void exportFinanceRequest("xlsx")}
                  disabled={filterLoading}
                >
                  <FileSpreadsheet />
                  Unduh Form Finance Excel
                </Button>
              </>
            ) : null}
          </div>
        </section>
        {applied.workspace !== "not_eligible" && list.data && !list.isFetching && !list.isError ? (
          <OwnerProgressSummary
            key={filterNoticeRevision}
            workspace={applied.workspace === "history" ? "history" : "active"}
            counts={list.data.summary.owner_counts}
            resultCount={list.data.meta.total}
            criteria={filterCriteria}
            cardRef={(node) => {
              ownerProgressRef.current = node;
            }}
          />
        ) : null}
        {applied.workspace === "not_eligible" &&
        filterNoticeRevision > 0 &&
        notEligible.data &&
        !notEligible.isFetching &&
        !notEligible.isError ? (
          <FilterResultNotice
            key={filterNoticeRevision}
            entityLabel="kontrak belum layak"
            resultCount={notEligible.data.meta.total}
            activeFilterCount={filterCriteria.length}
            searchTerm={applied.q}
            criteria={filterCriteria}
          />
        ) : null}
        {applied.workspace !== "not_eligible" && list.isLoading ? (
          <LoadingState label="Memuat Realisasi Owner..." />
        ) : null}
        {applied.workspace !== "not_eligible" && list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : null}
        {applied.workspace === "not_eligible" && notEligible.isLoading ? (
          <LoadingState label="Memuat kontrak yang belum layak..." />
        ) : null}
        {applied.workspace === "not_eligible" && notEligible.isError ? (
          <ErrorState error={notEligible.error} onRetry={() => void notEligible.refetch()} />
        ) : null}
        {applied.workspace === "not_eligible" && !notEligible.isLoading && !notEligible.isError ? (
          <section className="owner-report-list overflow-x-auto" aria-live="polite">
            <div className="p-5">
              <h3 className="font-semibold">Kontrak belum memenuhi syarat realisasi</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tampilan ini hanya tersedia untuk Admin. Deposit dan Hunian Tanggungan Owner tidak
                dapat menjadi hak Owner.
              </p>
            </div>
            {notEligibleRows.length ? (
              <table className="owner-report-table owner-report-table--not-eligible w-full min-w-[760px] text-left text-sm">
                <thead className="border-y bg-muted/35 text-xs uppercase text-muted-foreground">
                  <tr>
                    {["Owner", "Kamar", "Penghuni", "Total kontrak", "Alasan"].map((heading) => (
                      <th className="px-4 py-3 font-semibold" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {notEligibleRows.map((row) => (
                    <tr className="border-b" key={row.lease_id}>
                      <td className="px-4 py-3 font-medium">{row.owner_name}</td>
                      <td className="px-4 py-3">{row.room_code}</td>
                      <td className="px-4 py-3">{row.resident_name}</td>
                      <td className="px-4 py-3 tabular-nums">{rupiah(row.contract_rent_amount)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={row.reason_label ?? notEligibleLabel(row.reason_code)}
                          tone="warning"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="owner-report-empty">
                <CheckCircle2 />
                <h3>Semua kontrak pada periode ini sudah layak direalisasikan.</h3>
              </div>
            )}
            <footer className="owner-report-pagination">
              <p>
                Menampilkan {shown.start}–{shown.end} dari {total} kontrak
              </p>
              <div>
                <Button
                  variant="info"
                  disabled={(applied.offset ?? 0) === 0}
                  onClick={() => page((applied.offset ?? 0) - PAGE_SIZE)}
                >
                  <ArrowLeft />
                  Kembali
                </Button>
                <span>
                  Halaman {Math.floor((applied.offset ?? 0) / PAGE_SIZE) + 1} dari{" "}
                  {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <Button
                  variant="info"
                  disabled={(applied.offset ?? 0) + PAGE_SIZE >= total}
                  onClick={() => page((applied.offset ?? 0) + PAGE_SIZE)}
                >
                  Lanjut
                  <ArrowRight />
                </Button>
              </div>
            </footer>
          </section>
        ) : null}
        {applied.workspace !== "not_eligible" && !list.isLoading && !list.isError ? (
          <section className="owner-report-list" aria-live="polite">
            {rows.length === 0 ? (
              <div className="owner-report-empty">
                <Building2 />
                <h3>Belum ada Realisasi yang sesuai</h3>
                <p>Kontrak muncul di sini setelah seluruh nilai sewa terverifikasi lunas.</p>
              </div>
            ) : (
              <div className="owner-report-table-wrap">
                <table className="owner-report-table">
                  <thead>
                    <tr>
                      <th scope="col">No.</th>
                      <th scope="col">Owner dan aset</th>
                      <th scope="col">Tahap</th>
                      <th scope="col">Realisasi terakhir</th>
                      <th scope="col">Hak Owner</th>
                      <th scope="col">Realisasi transfer</th>
                      <th scope="col">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const latestBelongsToSelectedPeriod =
                        Boolean(row.latest_realization?.period) &&
                        row.latest_realization!.period.slice(0, 7) ===
                          (applied.period ?? defaultPeriod);
                      const currentStatus =
                        row.realization?.status ??
                        (latestBelongsToSelectedPeriod
                          ? row.latest_realization!.status
                          : "not_prepared");
                      const action = nextAction(row);
                      // A cached response from before the structured asset payload was added
                      // may still be in TanStack Query while Vite applies this component.
                      const ownerAssets = Array.isArray(row.assets) ? row.assets : null;
                      const progress = Number(row.realization_total)
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              Math.round(
                                (Number(row.transferred_total) / Number(row.realization_total)) *
                                  100,
                              ),
                            ),
                          )
                        : 0;
                      const progressTone = transferProgressTone(progress);
                      return (
                        <tr key={row.owner_id}>
                          <td className="owner-report-table__number" data-label="No.">
                            {(applied.offset ?? 0) + index + 1}
                          </td>
                          <td data-label="Owner dan aset">
                            <div className="owner-report-table__owner">
                              <h3>{row.owner_name}</h3>
                              <div className="owner-report-assets">
                                {ownerAssets?.length ? (
                                  ownerAssets.map((asset) => {
                                    const assetRooms = Array.isArray(asset.rooms)
                                      ? asset.rooms
                                      : [];
                                    return (
                                      <details className="owner-report-asset" key={asset.id}>
                                        <summary className="owner-report-asset__summary">
                                          <span className="owner-report-asset__identity">
                                            <strong>
                                              {asset.building_code
                                                ? `${asset.building_code} · `
                                                : ""}
                                              {asset.building_name ||
                                                "Aset historis belum tercatat"}
                                            </strong>
                                            <small>No. Kavling {asset.plot_number ?? "—"}</small>
                                            <small>
                                              {assetRooms.length}{" "}
                                              {row.realization
                                                ? "kamar dalam realisasi ini"
                                                : "kontrak lunas pada periode ini"}
                                            </small>
                                            {asset.snapshot_incomplete ? (
                                              <small>
                                                Identitas bangunan belum tersedia pada data ini
                                                lama.
                                              </small>
                                            ) : null}
                                          </span>
                                          <ChevronDown
                                            className="owner-report-asset__chevron"
                                            aria-hidden="true"
                                          />
                                        </summary>
                                        <div className="owner-report-asset__rooms">
                                          {assetRooms.length > 0 ? (
                                            assetRooms.map((room) => (
                                              <div
                                                className="owner-report-asset-room"
                                                key={room.id}
                                              >
                                                <span className="owner-report-asset-room__identity">
                                                  <strong>{room.room_code}</strong>
                                                  <span>
                                                    No. Kavling: {room.plot_number || "—"}
                                                  </span>
                                                  <span>
                                                    {room.resident_name ??
                                                      "Nama penghuni tidak tersedia"}
                                                  </span>
                                                </span>
                                                <small>
                                                  Hak Owner {rupiah(room.realization_total)}
                                                </small>
                                              </div>
                                            ))
                                          ) : (
                                            <p className="owner-report-asset__empty">
                                              Belum ada kontrak lunas pada periode ini.
                                            </p>
                                          )}
                                        </div>
                                      </details>
                                    );
                                  })
                                ) : ownerAssets === null ? (
                                  <p className="owner-report-asset__empty">
                                    Rincian aset belum dimuat. Muat ulang daftar realisasi.
                                  </p>
                                ) : (
                                  <p className="owner-report-asset__empty">
                                    {row.realization
                                      ? "Rincian aset belum tersedia pada Realisasi ini."
                                      : "Belum ada aset aktif yang tercatat."}
                                  </p>
                                )}
                              </div>
                              <p>
                                {row.realization
                                  ? `${row.room_count} kamar dalam Realisasi ini`
                                  : `${row.eligible_contract_count} kontrak lunas siap direalisasikan`}
                              </p>
                            </div>
                          </td>
                          <td data-label="Tahap">
                            <div className="owner-report-badges">
                              <StatusBadge
                                label={statusLabel[currentStatus]}
                                tone={tone(currentStatus)}
                              />
                              {row.realization && row.realization.entry_kind !== "system" ? (
                                <Badge data-tone="neutral">Historis</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td data-label="Realisasi terakhir">
                            {row.latest_realization ? (
                              <div className="owner-report-latest">
                                <strong>{latestPeriodLabel(row.latest_realization.period)}</strong>
                                <small>
                                  {row.latest_realization.realized_at
                                    ? `Tercatat ${new Intl.DateTimeFormat("id-ID", {
                                        dateStyle: "medium",
                                      }).format(new Date(row.latest_realization.realized_at))}`
                                    : row.latest_realization.reference}
                                </small>
                              </div>
                            ) : (
                              <span className="owner-report-latest__empty">
                                Belum pernah direalisasikan
                              </span>
                            )}
                          </td>
                          <td data-label="Hak Owner">
                            <div className="owner-report-row__money">
                              <span>Hak Owner</span>
                              <strong>{rupiah(row.realization_total)}</strong>
                              <small>
                                Kontrak {rupiah(row.eligible_contract_total)} · fee{" "}
                                {rupiah(row.management_fee_total)}
                              </small>
                            </div>
                          </td>
                          <td data-label="Realisasi transfer">
                            <div className="owner-report-row__progress" data-tone={progressTone}>
                              <span>
                                <span>Realisasi transfer</span>
                                <strong>{progress}%</strong>
                              </span>
                              <div
                                className="owner-report-progress__track"
                                role="progressbar"
                                aria-label="Realisasi transfer"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={progress}
                                aria-valuetext={`${progress}%`}
                              >
                                <div
                                  className="owner-report-progress__value"
                                  data-tone={progressTone}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <small>
                                {rupiah(row.transferred_total)} dari {rupiah(row.realization_total)}
                              </small>
                            </div>
                          </td>
                          <td data-label="Aksi">
                            <div className="owner-report-row__actions">
                              {detailPath(row) ? (
                                <Button
                                  variant="info"
                                  onClick={() => {
                                    window.location.assign(detailPath(row)!);
                                  }}
                                >
                                  <Search />
                                  Rincian
                                </Button>
                              ) : null}
                              {canCancelRow(row) ? (
                                <Button
                                  variant="outline"
                                  className="border-destructive/40 text-destructive hover:bg-destructive/5"
                                  onClick={() => {
                                    setVoidTarget(row);
                                    setVoidReason("");
                                  }}
                                  disabled={cancelRealization.isPending}
                                >
                                  <Ban />
                                  Batalkan realisasi
                                </Button>
                              ) : null}
                              {!row.realization ? (
                                <Button
                                  variant="default"
                                  onClick={() => openCreation(row.owner_id, "future")}
                                >
                                  <FilePlus2 />
                                  Buat Realisasi
                                </Button>
                              ) : null}
                              {action && action.action !== "prepare" ? (
                                <Button
                                  onClick={() =>
                                    action.action === "record-transfer"
                                      ? window.location.assign(transferPath(row)!)
                                      : setWorkflowTarget(row)
                                  }
                                  disabled={prepare.isPending || workflow.isPending}
                                >
                                  <action.icon />
                                  {action.label}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="owner-report-pagination">
              <p>
                Menampilkan {shown.start}–{shown.end} dari {total} Owner
              </p>
              <div>
                <Button
                  variant="info"
                  disabled={(applied.offset ?? 0) === 0}
                  onClick={() => page((applied.offset ?? 0) - PAGE_SIZE)}
                >
                  <ArrowLeft />
                  Kembali
                </Button>
                <span>
                  Halaman {Math.floor((applied.offset ?? 0) / PAGE_SIZE) + 1} dari{" "}
                  {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <Button
                  variant="info"
                  disabled={(applied.offset ?? 0) + PAGE_SIZE >= total}
                  onClick={() => page((applied.offset ?? 0) + PAGE_SIZE)}
                >
                  Lanjut
                  <ArrowRight />
                </Button>
              </div>
            </footer>
          </section>
        ) : null}
      </main>
      <Dialog
        open={Boolean(prepareTarget)}
        onOpenChange={(open) => !open && setPrepareTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Siapkan Realisasi Owner</DialogTitle>
            <DialogDescription>
              Hanya kontrak sewa berbayar yang sudah lunas akan dikunci ke draft. Kontrak
              outstanding, deposit, dan hunian tanggungan Owner dikecualikan.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Catatan persiapan (opsional)
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Contoh: realisasi kontrak lunas bulan September"
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrepareTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={!prepareTarget || prepare.isPending}
              onClick={() => prepareTarget && prepare.mutate({ ownerId: prepareTarget.owner_id })}
            >
              {prepare.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}Siapkan
              draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(voidTarget)}
        onOpenChange={(open) => {
          if (!open && !cancelRealization.isPending) {
            setVoidTarget(null);
            setVoidReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Batalkan Realisasi</DialogTitle>
            <DialogDescription>
              Pembatalan hanya tersedia sebelum ada transfer berhasil. Kontrak yang terkunci akan
              dilepas agar dapat dimasukkan ke batch Realisasi berikutnya, sementara alasan tetap
              tersimpan dalam audit.
            </DialogDescription>
          </DialogHeader>
          {voidTarget ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{voidTarget.owner_name}</p>
              <p className="text-muted-foreground">
                {voidTarget.realization?.reference} · {rupiah(voidTarget.realization_total)}
              </p>
            </div>
          ) : null}
          <label className="space-y-1 text-sm font-medium">
            Alasan pembatalan <span className="text-destructive">*</span>
            <Textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Jelaskan mengapa draft ini dibatalkan"
              rows={3}
              maxLength={500}
              required
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVoidTarget(null);
                setVoidReason("");
              }}
              disabled={cancelRealization.isPending}
            >
              Kembali
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
              disabled={!voidTarget || voidReason.trim().length < 3 || cancelRealization.isPending}
              onClick={() => voidTarget && cancelRealization.mutate(voidTarget)}
            >
              {cancelRealization.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
              Batalkan realisasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(workflowTarget)}
        onOpenChange={(open) => !open && setWorkflowTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {workflowTarget ? nextAction(workflowTarget)?.label : "Perbarui Realisasi"}
            </DialogTitle>
            <DialogDescription>
              Perubahan tahap dicatat dalam audit Realisasi Owner dan tidak mengubah nilai kontrak
              yang sudah ditetapkan.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm font-medium">
            Catatan tindakan
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Keterangan pemeriksaan atau komunikasi keuangan"
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkflowTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={!workflowTarget || workflow.isPending}
              onClick={() => workflowTarget && workflow.mutate(workflowTarget)}
            >
              {workflow.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Simpan
              tahap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={historicalDialogOpen}
        onOpenChange={(open) => {
          setHistoricalDialogOpen(open);
          if (!open) {
            setHistoricalOwnerId("");
            setCreationTarget(null);
            setSelectedLeaseIds([]);
          }
        }}
      >
        <DialogContent className="owner-report-creation-dialog max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Realisasi Owner</DialogTitle>
            <DialogDescription>
              Satu alur untuk realisasi yang sudah ditransfer maupun yang masih menunggu transfer
              keuangan. Pilih kondisi faktualnya terlebih dahulu.
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-xl border border-primary/35 bg-primary/5 px-4 py-3"
            role="status"
            aria-label={`Periode realisasi yang dipilih ${historicalPeriodLabel}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Periode realisasi yang dipilih
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">{historicalPeriodLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Data yang disimpan melalui formulir ini akan dicatat untuk periode tersebut.
            </p>
          </div>
          <div className="grid gap-4">
            <div
              className="owner-report-creation-mode"
              role="radiogroup"
              aria-label="Kondisi transfer"
            >
              <Button
                type="button"
                role="radio"
                aria-checked={creationMode === "future"}
                variant={creationMode === "future" ? "default" : "info"}
                className="owner-report-creation-mode__option owner-report-creation-mode__option--future h-auto min-h-16 justify-start whitespace-normal border-2 border-primary px-4 py-3 text-left"
                onClick={() => {
                  setCreationMode("future");
                  setHistorical((value) => ({ ...value, lines: [] }));
                }}
              >
                <span>
                  <span className="block font-semibold">Transfer belum dilakukan</span>
                  <span className="mt-1 block text-xs opacity-80">
                    Buat draft, ajukan pemeriksaan, lalu catat transfer dari keuangan.
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                role="radio"
                aria-checked={creationMode === "historical"}
                variant={creationMode === "historical" ? "default" : "info"}
                className="owner-report-creation-mode__option owner-report-creation-mode__option--historical h-auto min-h-16 justify-start whitespace-normal border-2 border-primary px-4 py-3 text-left"
                onClick={() => {
                  setCreationMode("historical");
                  setHistorical((value) => ({
                    ...value,
                    lines: seedHistoricalLines(creationTarget),
                  }));
                }}
              >
                <span>
                  <span className="block font-semibold">Transfer sudah dilakukan</span>
                  <span className="mt-1 block text-xs opacity-80">
                    Catat fakta historis dan buktinya pada periode yang dipilih.
                  </span>
                </span>
              </Button>
            </div>
            <label className="owner-report-field">
              <span className="font-semibold">
                Owner penerima realisasi <RequiredMark />
              </span>
              <Select
                value={creationOwnerId || "__none__"}
                onValueChange={(ownerId) => {
                  const selectedOwnerId = ownerId === "__none__" ? "" : ownerId;
                  setHistoricalOwnerId(selectedOwnerId);
                  const target = rows.find((row) => row.owner_id === selectedOwnerId) ?? null;
                  setCreationTarget(target);
                  setSelectedLeaseIds(target?.eligible_lease_ids ?? []);
                  if (creationMode === "historical") {
                    setHistorical((value) => ({ ...value, lines: seedHistoricalLines(target) }));
                  }
                }}
                disabled={owners.isLoading || owners.isError}
              >
                <SelectTrigger className="min-h-11 rounded-lg bg-background" aria-required="true">
                  <SelectValue placeholder="Pilih Owner Property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Pilih Owner Property</SelectItem>
                  {(owners.data ?? []).map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.fullName}
                      {owner.profileStatus === "archived" ? " (diarsipkan)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {owners.isError ? (
                <span className="block text-xs font-normal text-destructive">
                  Daftar Owner belum dapat dimuat. Coba tutup lalu buka kembali formulir ini.
                </span>
              ) : null}
              {selectedCreationOwner ? (
                <div className="mt-3 grid gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm sm:grid-cols-3">
                  <div>
                    <span className="block text-xs text-muted-foreground">Bank penerima</span>
                    <strong>{selectedCreationOwner.payoutBankName || "Belum diisi"}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-muted-foreground">Nomor rekening</span>
                    <strong>{selectedCreationOwner.payoutAccountNumber || "Belum diisi"}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-muted-foreground">Atas nama</span>
                    <strong>{selectedCreationOwner.payoutAccountHolder || "Belum diisi"}</strong>
                  </div>
                </div>
              ) : null}
            </label>
            {creationMode === "future" ? (
              <div className="owner-report-creation-panel rounded-xl border border-primary/45 bg-primary/5 p-4 text-sm">
                <p className="font-semibold text-foreground">Draft akan mengambil kontrak layak</p>
                <p className="mt-1 text-muted-foreground">
                  Sistem memilih kontrak sewa normal yang sudah lunas dan terverifikasi. Deposit,
                  hunian tanggungan Owner, dan kontrak outstanding tidak masuk hak Owner.
                </p>
                <label className="owner-report-field mt-4">
                  Catatan persiapan (opsional)
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Contoh: realisasi kontrak lunas bulan September"
                    rows={3}
                  />
                </label>
              </div>
            ) : null}
            {creationMode === "future" && creationTarget?.eligible_leases?.length ? (
              <fieldset className="owner-report-lease-selection">
                <legend>Kontrak yang masuk draft</legend>
                <p className="owner-report-lease-selection__hint">
                  Semua kontrak layak dipilih secara default. Batalkan centang bila kontrak ini
                  belum ingin dimasukkan ke batch realisasi.
                </p>
                <div className="owner-report-lease-selection__list">
                  {creationTarget.eligible_leases.map((lease) => {
                    const checked = selectedLeaseIds.includes(lease.id);
                    return (
                      <label key={lease.id} className="owner-report-lease-selection__item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedLeaseIds((current) =>
                              checked
                                ? current.filter((id) => id !== lease.id)
                                : [...current, lease.id],
                            )
                          }
                        />
                        <span>
                          <strong>{lease.room_code}</strong> · {lease.resident_name}
                          <small>
                            Hak Owner {rupiah(lease.realization_total)} · Kontrak{" "}
                            {rupiah(lease.contract_total)}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {creationMode === "historical" ? (
              <>
                <label className="owner-report-field">
                  <span className="font-semibold">
                    Sumber data historis <RequiredMark />
                  </span>
                  <HistoricalRealizationSourceCombobox
                    id="historical-realization-source"
                    value={historical.source}
                    options={historicalSourceOptions}
                    loading={historicalSources.isLoading}
                    required
                    onChange={(source) => setHistorical((value) => ({ ...value, source }))}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    Pilih sumber yang pernah dipakai pada properti ini atau tambahkan sumber baru;
                    pilihan baru akan tersimpan setelah realisasi berhasil disimpan.
                  </span>
                </label>
                <fieldset className="owner-report-field min-w-0 rounded-xl border border-border bg-primary/5 p-4">
                  <legend className="px-1 text-sm font-semibold">Baris kontrak realisasi</legend>
                  <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                    Sistem mengisi kontrak lunas yang tersedia. Periksa nominal yang sudah tercatat,
                    lalu tambahkan baris manual bila sumber lama tidak punya pasangan kontrak yang
                    pasti. Tidak ada lagi format titik koma atau nominal tanpa format Rupiah.
                  </p>
                  <div className="owner-report-historical-lines overflow-x-auto rounded-lg border-2 border-black/80 dark:border-white/35">
                    <table className="w-full min-w-[960px] text-left text-sm">
                      <thead className="border-b-2 border-black/80 bg-muted/35 text-xs uppercase text-foreground dark:border-white/35">
                        <tr>
                          <th className="w-14 px-3 py-3 font-bold">No.</th>
                          <th className="px-3 py-3 font-bold">
                            Kamar <RequiredMark />
                          </th>
                          <th className="px-3 py-3 font-bold">
                            Nama penghuni <RequiredMark />
                          </th>
                          <th className="px-3 py-3 font-bold">
                            Total sewa <RequiredMark />
                          </th>
                          <th className="px-3 py-3 font-bold">
                            Management fee <RequiredMark />
                          </th>
                          <th className="px-3 py-3 font-bold">Hak Owner</th>
                          <th className="px-3 py-3 font-bold">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historical.lines.map((line, index) => (
                          <Fragment key={line.id}>
                            <tr className="align-top">
                              <td className="w-14 px-3 py-3 text-center font-semibold tabular-nums">
                                {index + 1}
                              </td>
                              <td className="min-w-36 px-3 py-3">
                                <Input
                                  value={line.roomCode}
                                  readOnly={line.source === "system"}
                                  className={
                                    line.source === "system"
                                      ? "bg-muted/45 text-muted-foreground"
                                      : undefined
                                  }
                                  onChange={(event) =>
                                    setHistorical((value) => ({
                                      ...value,
                                      lines: value.lines.map((item) =>
                                        item.id === line.id
                                          ? { ...item, roomCode: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                  placeholder="RK-05-01"
                                  required
                                  aria-required="true"
                                  aria-label={`Kamar baris ${index + 1}`}
                                />
                              </td>
                              <td className="min-w-48 px-3 py-3">
                                <Input
                                  value={line.residentName}
                                  readOnly={line.source === "system"}
                                  className={
                                    line.source === "system"
                                      ? "bg-muted/45 text-muted-foreground"
                                      : undefined
                                  }
                                  onChange={(event) =>
                                    setHistorical((value) => ({
                                      ...value,
                                      lines: value.lines.map((item) =>
                                        item.id === line.id
                                          ? { ...item, residentName: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                  placeholder="Nama penghuni"
                                  required
                                  aria-required="true"
                                  aria-label={`Nama penghuni baris ${index + 1}`}
                                />
                              </td>
                              <td className="min-w-44 px-3 py-3">
                                <HistoricalRupiahInput
                                  id={`historical-line-contract-${line.id}`}
                                  value={line.contractTotal}
                                  required
                                  readOnly={line.source === "system"}
                                  onChange={(contractTotal) =>
                                    setHistorical((value) => ({
                                      ...value,
                                      lines: value.lines.map((item) =>
                                        item.id === line.id ? { ...item, contractTotal } : item,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className="min-w-44 px-3 py-3">
                                <HistoricalRupiahInput
                                  id={`historical-line-fee-${line.id}`}
                                  value={line.managementFee}
                                  required
                                  readOnly={line.source === "system"}
                                  onChange={(managementFee) =>
                                    setHistorical((value) => ({
                                      ...value,
                                      lines: value.lines.map((item) =>
                                        item.id === line.id ? { ...item, managementFee } : item,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">
                                {rupiah(
                                  line.contractTotal - line.managementFee + line.correctionAmount,
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      const details = document.getElementById(
                                        `historical-line-details-${line.id}`,
                                      );
                                      if (details instanceof HTMLDetailsElement)
                                        details.open = !details.open;
                                    }}
                                  >
                                    Detail
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`Hapus baris ${index + 1}`}
                                    onClick={() =>
                                      setHistorical((value) => ({
                                        ...value,
                                        lines: value.lines.filter((item) => item.id !== line.id),
                                      }))
                                    }
                                  >
                                    <Trash aria-hidden="true" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b-2 border-black/80 dark:border-white/35 last:border-b-0">
                              <td className="px-3 pb-3" colSpan={7}>
                                <details id={`historical-line-details-${line.id}`}>
                                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                                    Detail tambahan (opsional)
                                  </summary>
                                  <div className="mt-3 grid gap-3 rounded-lg border border-dashed border-border bg-muted/10 p-3 sm:grid-cols-2">
                                    <label className="owner-report-field min-w-0 self-start">
                                      <span className="font-semibold">Penyesuaian baris</span>
                                      <HistoricalRupiahInput
                                        id={`historical-line-correction-${line.id}`}
                                        value={line.correctionAmount}
                                        onChange={(correctionAmount) =>
                                          setHistorical((value) => ({
                                            ...value,
                                            lines: value.lines.map((item) =>
                                              item.id === line.id
                                                ? { ...item, correctionAmount }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                      <span className="text-xs font-normal text-muted-foreground">
                                        Isi hanya jika ada koreksi yang memiliki alasan dan bukti.
                                      </span>
                                    </label>
                                    <label className="owner-report-field min-w-0 self-start">
                                      <span className="font-semibold">Referensi lama</span>
                                      <Input
                                        value={line.legacyReference}
                                        onChange={(event) =>
                                          setHistorical((value) => ({
                                            ...value,
                                            lines: value.lines.map((item) =>
                                              item.id === line.id
                                                ? { ...item, legacyReference: event.target.value }
                                                : item,
                                            ),
                                          }))
                                        }
                                        placeholder="MANUAL-AGT-001"
                                      />
                                    </label>
                                    <label className="owner-report-field min-w-0 self-start">
                                      <span className="font-semibold">Durasi (bulan)</span>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={line.durationMonths ?? ""}
                                        onChange={(event) =>
                                          setHistorical((value) => ({
                                            ...value,
                                            lines: value.lines.map((item) =>
                                              item.id === line.id
                                                ? {
                                                    ...item,
                                                    durationMonths: event.target.value
                                                      ? Number(event.target.value)
                                                      : undefined,
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                        placeholder="12"
                                      />
                                    </label>
                                    <HeroUiDatePicker
                                      id={`historical-line-payment-completed-${line.id}`}
                                      label="Tanggal pelunasan"
                                      value={line.paymentCompletedAt || undefined}
                                      onChange={(paymentCompletedAt) =>
                                        setHistorical((value) => ({
                                          ...value,
                                          lines: value.lines.map((item) =>
                                            item.id === line.id
                                              ? {
                                                  ...item,
                                                  paymentCompletedAt: paymentCompletedAt ?? "",
                                                }
                                              : item,
                                          ),
                                        }))
                                      }
                                      className="min-w-0 gap-2"
                                      triggerClassName="h-11 min-h-11"
                                    />
                                    <HeroUiDatePicker
                                      id={`historical-line-check-in-${line.id}`}
                                      label="Tanggal check-in"
                                      value={line.checkInAt || undefined}
                                      onChange={(checkInAt) =>
                                        setHistorical((value) => ({
                                          ...value,
                                          lines: value.lines.map((item) =>
                                            item.id === line.id
                                              ? { ...item, checkInAt: checkInAt ?? "" }
                                              : item,
                                          ),
                                        }))
                                      }
                                      className="min-w-0 gap-2"
                                      triggerClassName="h-11 min-h-11"
                                    />
                                    <HeroUiDatePicker
                                      id={`historical-line-check-out-${line.id}`}
                                      label="Tanggal check-out"
                                      value={line.checkOutAt || undefined}
                                      onChange={(checkOutAt) =>
                                        setHistorical((value) => ({
                                          ...value,
                                          lines: value.lines.map((item) =>
                                            item.id === line.id
                                              ? { ...item, checkOutAt: checkOutAt ?? "" }
                                              : item,
                                          ),
                                        }))
                                      }
                                      className="min-w-0 gap-2"
                                      triggerClassName="h-11 min-h-11"
                                    />
                                  </div>
                                </details>
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-black/80 bg-primary/10 font-bold dark:border-white/35">
                        <tr>
                          <th colSpan={3} className="px-3 py-3 text-left">
                            Total {historical.lines.length} baris kontrak
                          </th>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                            {rupiah(historicalContractTotal)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                            {rupiah(historicalFeeTotal)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                            {rupiah(historicalOwnerTotal)}
                          </td>
                          <td className="px-3 py-3" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {historicalCorrectionTotal !== 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Hak Owner sudah termasuk penyesuaian baris {rupiah(historicalCorrectionTotal)}
                      .
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      <RequiredMark /> Kamar, nama penghuni, total sewa, dan management fee wajib
                      diisi.
                    </span>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() =>
                        setHistorical((value) => ({
                          ...value,
                          lines: [...value.lines, emptyHistoricalLine()],
                        }))
                      }
                    >
                      <Plus aria-hidden="true" /> Tambah baris manual
                    </Button>
                  </div>
                </fieldset>
                <fieldset className="grid min-w-0 gap-4 rounded-xl border border-border bg-primary/5 p-4">
                  <legend className="px-1 text-sm font-semibold">Transfer historis aktual</legend>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-xl text-xs font-semibold leading-relaxed text-muted-foreground">
                      Catat setiap transfer sebagai transaksi tersendiri. Referensi wajib unik;
                      bukti dapat diisi per transfer. Kosongkan daftar ini bila belum ada dana yang
                      ditransfer.
                    </p>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={historical.transfers.length >= 20}
                      onClick={() =>
                        setHistorical((value) => ({
                          ...value,
                          transfers: [...value.transfers, emptyHistoricalTransfer()],
                        }))
                      }
                    >
                      <Plus aria-hidden="true" /> Tambah transfer
                    </Button>
                  </div>
                  {historical.transfers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                      Belum ada transfer dicatat. Realisasi akan tersimpan sebagai draft historis
                      tanpa kuitansi transfer.
                    </p>
                  ) : null}
                  <div className="grid min-w-0 gap-3">
                    {historical.transfers.map((transfer, index) => (
                      <section
                        key={transfer.id}
                        aria-labelledby={`historical-transfer-heading-${transfer.id}`}
                        className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 shadow-sm sm:p-4"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                          <h4
                            id={`historical-transfer-heading-${transfer.id}`}
                            className="text-sm font-semibold"
                          >
                            Transfer {index + 1}
                          </h4>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            aria-label={`Hapus transfer ${index + 1}`}
                            onClick={() =>
                              setHistorical((value) => ({
                                ...value,
                                transfers: value.transfers.filter(
                                  (item) => item.id !== transfer.id,
                                ),
                              }))
                            }
                          >
                            <Trash aria-hidden="true" /> Hapus Transfer {index + 1}
                          </Button>
                        </div>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                          <label className="owner-report-field">
                            <span className="font-semibold">
                              Nominal transfer ke-{index + 1} <RequiredMark />
                            </span>
                            <HistoricalRupiahInput
                              id={`historical-transfer-amount-${transfer.id}`}
                              value={transfer.amount}
                              required
                              onChange={(amount) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id ? { ...item, amount } : item,
                                  ),
                                }))
                              }
                              invalid={transfer.amount <= 0}
                            />
                          </label>
                          <label className="owner-report-field">
                            <span className="font-semibold">
                              Metode transfer <RequiredMark />
                            </span>
                            <Input readOnly value="Transfer Bank" className="bg-muted/45" />
                          </label>
                          <label className="owner-report-field">
                            <span className="font-semibold">
                              Referensi transfer <RequiredMark />
                            </span>
                            <Input
                              required
                              minLength={3}
                              maxLength={150}
                              value={transfer.reference}
                              onChange={(event) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? { ...item, reference: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                              placeholder="Contoh: TRF-OWNER-2026-001"
                            />
                          </label>
                          <label className="owner-report-field">
                            Referensi arsip transfer (opsional)
                            <Input
                              maxLength={300}
                              value={transfer.evidenceReference}
                              onChange={(event) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? { ...item, evidenceReference: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                              placeholder="Nomor arsip atau catatan Keuangan; bukan pengganti unggahan bukti"
                            />
                          </label>
                          <label className="owner-report-field sm:col-span-2">
                            <span className="font-semibold">
                              Tanggal transfer <RequiredMark />
                            </span>
                            <Input
                              required
                              type="datetime-local"
                              value={transfer.transferredAt}
                              onChange={(event) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? { ...item, transferredAt: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <div className="sm:col-span-2">
                            <EvidenceFileUploadField
                              propertyId={currentPropertyId!}
                              filePurpose="owner_realization_evidence"
                              label={`Bukti transfer ${index + 1}`}
                              maxFiles={3}
                              description="JPG, PNG, WebP, atau PDF. Maksimal 3 file, 5 MB per file. Dapat dilihat kembali di rincian."
                              required={
                                new Date(transfer.transferredAt).getTime() >=
                                new Date("2026-09-29T00:00:00+07:00").getTime()
                              }
                              values={transfer.evidenceFiles}
                              onChange={(files) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? { ...item, evidenceFiles: files }
                                      : item,
                                  ),
                                }))
                              }
                              onBusyChange={setHistoricalUploadBusy}
                            />
                          </div>
                          <label className="owner-report-field">
                            <span className="font-semibold">
                              Pemberi konfirmasi Keuangan (jika diketahui)
                            </span>
                            <HistoricalRealizationSourceCombobox
                              id={`historical-finance-confirmer-${transfer.id}`}
                              value={transfer.financeConfirmedBy}
                              options={financeConfirmerOptions}
                              loading={financeConfirmers.isLoading}
                              placeholder="Pilih atau tambah nama pemberi konfirmasi"
                              searchPlaceholder="Cari nama atau ketik nama baru..."
                              storedLabel="Pemberi konfirmasi tersimpan"
                              addLabel="pemberi konfirmasi"
                              emptyMessage="Belum ada nama tersimpan. Ketik minimal 3 karakter untuk menambahkan nama baru."
                              onChange={(value) =>
                                setHistorical((current) => ({
                                  ...current,
                                  transfers: current.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? { ...item, financeConfirmedBy: value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label className="owner-report-field">
                            Jalur konfirmasi
                            <Select
                              value={transfer.financeConfirmationChannel}
                              onValueChange={(channel) =>
                                setHistorical((value) => ({
                                  ...value,
                                  transfers: value.transfers.map((item) =>
                                    item.id === transfer.id
                                      ? {
                                          ...item,
                                          financeConfirmationChannel:
                                            channel as HistoricalTransferDraft["financeConfirmationChannel"],
                                        }
                                      : item,
                                  ),
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
                          </label>
                          {transfer.financeConfirmedBy.trim() ? (
                            <label className="owner-report-field sm:col-span-2">
                              Waktu konfirmasi Keuangan
                              <Input
                                type="datetime-local"
                                value={transfer.financeConfirmedAt}
                                onChange={(event) =>
                                  setHistorical((value) => ({
                                    ...value,
                                    transfers: value.transfers.map((item) =>
                                      item.id === transfer.id
                                        ? { ...item, financeConfirmedAt: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          ) : null}
                          {transfer.evidenceFiles.length === 0 &&
                          new Date(transfer.transferredAt).getTime() <
                            new Date("2026-09-29T00:00:00+07:00").getTime() ? (
                            <label className="owner-report-field sm:col-span-2">
                              Alasan bukti digital lama tidak tersedia <RequiredMark />
                              <Input
                                value={transfer.legacyEvidenceReason}
                                onChange={(event) =>
                                  setHistorical((value) => ({
                                    ...value,
                                    transfers: value.transfers.map((item) =>
                                      item.id === transfer.id
                                        ? { ...item, legacyEvidenceReason: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          ) : null}
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
                    <span className="font-medium">Total seluruh transfer</span>
                    <strong className="tabular-nums">
                      {historicalTransferTotalIsSafe
                        ? rupiah(historicalTransferTotal)
                        : "Total di luar batas nominal aman"}
                    </strong>
                  </div>
                  {historicalTransferExceedsOwner ? (
                    <p className="owner-report-confirmation__error" role="alert">
                      Total transfer melebihi Hak Owner sebesar{" "}
                      {rupiah(historicalTransferTotal - historicalOwnerTotal)}. Kurangi nominal
                      transfer sebelum melanjutkan.
                    </p>
                  ) : null}
                </fieldset>
                <label className="owner-report-field">
                  Catatan (opsional)
                  <Textarea
                    rows={2}
                    value={historical.notes}
                    onChange={(event) =>
                      setHistorical((value) => ({ ...value, notes: event.target.value }))
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setHistoricalDialogOpen(false);
                setHistoricalOwnerId("");
              }}
            >
              Batal
            </Button>
            {creationMode === "future" ? (
              <Button
                disabled={
                  prepare.isPending ||
                  !creationOwnerId ||
                  Boolean(
                    creationTarget &&
                    Array.isArray(creationTarget.eligible_lease_ids) &&
                    selectedLeaseIds.length === 0,
                  )
                }
                onClick={() =>
                  prepare.mutate({
                    ownerId: creationOwnerId,
                    leaseIds: selectedLeaseIds,
                  })
                }
              >
                {prepare.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
                Siapkan draft
              </Button>
            ) : (
              <Button
                disabled={historicalMutation.isPending || historicalUploadBusy || !creationOwnerId}
                onClick={openSaveConfirmation}
              >
                {historicalMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FilePlus2 />
                )}
                Simpan realisasi
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={saveConfirmationOpen} onOpenChange={setSaveConfirmationOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Konfirmasi simpan realisasi</DialogTitle>
            <DialogDescription>
              Pastikan ringkasan di bawah sudah sesuai sebelum realisasi historis disimpan. Setelah
              tersimpan, data menjadi bagian dari riwayat audit Owner.
            </DialogDescription>
          </DialogHeader>
          <div className="owner-report-confirmation" aria-live="polite">
            <div className="owner-report-confirmation__heading">
              <span>Owner penerima</span>
              <strong>{historicalOwnerName || "Belum dipilih"}</strong>
            </div>
            <dl className="owner-report-confirmation__summary">
              <div>
                <dt>Periode realisasi</dt>
                <dd>{historicalPeriodLabel}</dd>
              </div>
              <div>
                <dt>Kondisi transfer</dt>
                <dd>Transfer sudah dilakukan</dd>
              </div>
              <div>
                <dt>Jumlah baris kontrak</dt>
                <dd>{historical.lines.length} baris</dd>
              </div>
              <div>
                <dt>Total sewa</dt>
                <dd>
                  {rupiah(historical.lines.reduce((sum, line) => sum + line.contractTotal, 0))}
                </dd>
              </div>
              <div>
                <dt>Total management fee</dt>
                <dd>
                  {rupiah(historical.lines.reduce((sum, line) => sum + line.managementFee, 0))}
                </dd>
              </div>
              <div>
                <dt>Hak Owner</dt>
                <dd>{rupiah(historicalOwnerTotal)}</dd>
              </div>
              <div>
                <dt>Total transfer tercatat</dt>
                <dd>{rupiah(historicalTransferTotal)}</dd>
              </div>
              <div>
                <dt>Sisa belum ditransfer</dt>
                <dd className={historicalRemaining > 0 ? "text-amber-700" : "text-emerald-700"}>
                  {rupiah(historicalRemaining)}
                </dd>
              </div>
            </dl>
            {historicalTransferExceedsOwner ? (
              <p className="owner-report-confirmation__error">
                Total transfer melebihi Hak Owner. Periksa kembali setiap transfer sebelum
                menyimpan.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveConfirmationOpen(false)}>
              Kembali periksa
            </Button>
            <Button
              disabled={historicalMutation.isPending || historicalTransferExceedsOwner}
              onClick={() => {
                setSaveConfirmationOpen(false);
                historicalMutation.mutate(creationOwnerId);
              }}
            >
              {historicalMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Simpan realisasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
