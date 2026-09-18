import { useEffect, useRef, useState } from "react";
import { ApiError, type FileResponse } from "@granada-kost/domain";
import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck2,
  Calculator,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { FilePreviewModal, type FilePreviewReference } from "@/components/file/FilePreviewModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUxLeaseApi, downloadLeaseExitDocument } from "@/lib/admin-ux-lease-api";
import type { CheckoutCommand, CheckoutSettlementQuote } from "@/lib/admin-ux-lease-types";
import { jakartaToday } from "@/lib/admin-ux-lease-helpers";
import { newIdempotencyKey } from "@/lib/idempotency";

export type CheckoutEntryFocus = "overview" | "refund";

type Props = {
  leaseId: string;
  propertyId: string;
  onClose: () => void;
  onCompleted?: () => void | Promise<unknown>;
  onChanged?: (command: CheckoutCommand | null) => void | Promise<unknown>;
  initialFocus?: CheckoutEntryFocus;
};
type CheckoutMode = "resident_early_termination" | "same_day" | "normal_expiry";
type HandoverConfirmation = { keyAccess: boolean; inventory: boolean; parking: boolean };
type InventoryDraft = {
  key: number;
  name: string;
  expectedQuantity: string;
  returnedQuantity: string;
  condition: "complete" | "partial" | "damaged" | "missing" | "not_applicable";
  notes: string;
};
type AccessDraft = {
  key: number;
  name: string;
  expectedQuantity: string;
  returnedQuantity: string;
  status: "returned" | "partial" | "damaged" | "missing" | "not_applicable";
  notes: string;
};
type UtilityDraft = {
  key: number;
  utilityType: string;
  meterNumber: string;
  checkoutReading: string;
  unit: string;
  outstandingUsageNotes: string;
};
type DamageDraft = {
  key: number;
  amount: string;
  reason: string;
  evidence: FileResponse[];
  busy: boolean;
};

const openCheckout = (commands: CheckoutCommand[]) =>
  commands.find((item) => item.state !== "cancelled") ?? null;

const inventoryDraft = (key: number): InventoryDraft => ({
  key,
  name: "",
  expectedQuantity: "1",
  returnedQuantity: "1",
  condition: "complete",
  notes: "",
});

const accessDraft = (key: number): AccessDraft => ({
  key,
  name: "",
  expectedQuantity: "1",
  returnedQuantity: "1",
  status: "returned",
  notes: "",
});

function messageFrom(error: unknown) {
  if (ApiError.isApiError(error) && error.code === "LEASE_CHECKOUT_DISABLED") {
    return "Proses check-out belum tersedia untuk properti ini. Periksa pengaturan properti sebelum mencoba kembali.";
  }
  if (
    ApiError.isApiError(error) &&
    error.code === "CHECKOUT_SHORT_NOTICE_CHARGE_EXCEEDS_RECOMMENDATION"
  ) {
    return "Kompensasi pemberitahuan singkat melebihi batas kebijakan. Kurangi nominal, lalu coba kembali.";
  }
  if (
    ApiError.isApiError(error) &&
    error.code === "CHECKOUT_SHORT_NOTICE_WAIVER_AUTHORITY_REQUIRED"
  ) {
    return "Pengurangan kompensasi memerlukan alasan persetujuan.";
  }
  if (ApiError.isApiError(error) && error.code === "CHECKOUT_EFFECTIVE_DATE_NOT_REACHED") {
    return "Serah-terima fisik belum dapat dicatat karena tanggal rencana check-out belum tiba.";
  }
  return error instanceof Error ? error.message : "Checkout tidak dapat diproses. Coba lagi.";
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const fullIndonesianDate = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function formatIndonesianFullDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? "-" : fullIndonesianDate.format(date);
}

function businessDateMilliseconds(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00+07:00`);
  return Number.isNaN(milliseconds) ? null : milliseconds;
}

function lateCheckoutPlanEstimate(command: CheckoutCommand, dailyPenaltyOverride?: number) {
  const penaltyFreeUntil = businessDateMilliseconds(command.penaltyFreeUntilDate);
  const plannedCheckout = businessDateMilliseconds(command.effectiveDate);
  const dailyPenalty = Number(dailyPenaltyOverride ?? command.lateCheckoutDailyPenaltyAmount ?? 0);
  if (
    penaltyFreeUntil === null ||
    plannedCheckout === null ||
    !Number.isSafeInteger(dailyPenalty) ||
    dailyPenalty < 0
  )
    return null;

  const overdueDays = Math.max(0, Math.round((plannedCheckout - penaltyFreeUntil) / 86_400_000));
  const chargedDays = Math.min(overdueDays, command.lateCheckoutPenaltyDayCap ?? 30);
  return {
    overdueDays,
    chargedDays,
    amount: chargedDays * dailyPenalty,
  };
}

function derivedContractMonths(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null;
  const start = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(startDate);
  const end = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(endDate);
  if (!start || !end) return null;

  const months = (Number(end[1]) - Number(start[1])) * 12 + Number(end[2]) - Number(start[2]);
  return Number.isSafeInteger(months) && months > 0 ? months : null;
}

function leaseTermLabel(months: number | null, startDate: string | null, endDate: string | null) {
  const resolvedMonths =
    months && Number.isSafeInteger(months) && months > 0
      ? months
      : derivedContractMonths(startDate, endDate);
  if (!resolvedMonths) return "Durasi tidak tersedia";

  const years = Math.floor(resolvedMonths / 12);
  const remainingMonths = resolvedMonths % 12;
  if (years && remainingMonths) return `${years} tahun ${remainingMonths} bulan`;
  if (years) return `${years} tahun`;
  return `${resolvedMonths} bulan`;
}

function refundStatusLabel(status: CheckoutCommand["exitRefundStatus"]) {
  if (status === "pending") return "Menunggu pembayaran";
  if (status === "settled") return "Sudah dibayarkan";
  if (status === "waived") return "Hak pengembalian dilepaskan";
  if (status === "reversed") return "Dibatalkan melalui koreksi";
  return "-";
}

function refundMethodLabel(method: CheckoutCommand["exitRefundPaymentMethod"]) {
  if (method === "cash") return "Tunai";
  if (method === "bank_transfer") return "Transfer bank";
  if (method === "qris") return "QRIS";
  if (method === "ewallet") return "E-wallet";
  if (method === "other") return "Lainnya";
  return "Tidak dicatat";
}

const checkoutStateLabel: Record<string, string> = {
  notice_received: "Rencana check-out tersimpan",
  scheduled: "Check-out terjadwal",
  inspection_required: "Menunggu inspeksi kamar",
  settlement_pending: "Menunggu penyelesaian keuangan",
  completed: "Proses check-out selesai",
  cancelled: "Proses dibatalkan",
};

const checkoutStages = [
  { id: 1, label: "Rencana check-out" },
  { id: 2, label: "Konfirmasi rencana" },
  { id: 3, label: "Serah-terima" },
  { id: 4, label: "Inspeksi" },
  { id: 5, label: "Penyelesaian" },
] as const;

type CheckoutStage = (typeof checkoutStages)[number]["id"];

function checkoutDocumentLabel(documentKind: string) {
  return (
    {
      checkout_handover: "Berita acara check-out",
      final_settlement: "Rincian penyelesaian akhir",
      refund_receipt: "Kuitansi pengembalian dana",
    }[documentKind] ?? "Dokumen check-out"
  );
}
type ConfirmationIntent =
  | "notice"
  | "approval"
  | "handover"
  | "inspection"
  | "settlement"
  | "refund_settlement"
  | "refund_waiver";

const confirmationCopy: Record<
  ConfirmationIntent,
  { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
  notice: {
    title: "Simpan rencana check-out?",
    description:
      "Periksa kembali jenis keluar, tanggal keluar, sumber permintaan, dan alasannya. Jika rencana berubah, Admin dapat membatalkan proses dan memulainya kembali.",
    confirmLabel: "Ya, simpan rencana",
  },
  approval: {
    title: "Lanjutkan ke serah-terima?",
    description:
      "Pastikan rencana check-out sudah sesuai. Tahap berikutnya adalah serah-terima fisik kamar dan kunci.",
    confirmLabel: "Ya, lanjutkan",
  },
  handover: {
    title: "Catat serah-terima fisik?",
    description:
      "Periksa kembali kunci, akses, inventaris, parkir, dan pembacaan utilitas. Pencatatan ini mengakhiri okupansi dan memindahkan kamar ke proses inspeksi.",
    confirmLabel: "Ya, catat serah-terima",
  },
  inspection: {
    title: "Catat hasil inspeksi kamar?",
    description:
      "Pastikan kondisi kamar dan catatan pemeriksaan sudah benar. Hasil ini menjadi dasar penyelesaian keuangan akhir.",
    confirmLabel: "Ya, catat inspeksi",
  },
  settlement: {
    title: "Tetapkan penyelesaian akhir?",
    description:
      "Periksa seluruh sewa, denda keterlambatan bila ada, deposit, potongan, tagihan, dan pengembalian dana. Setelah diterbitkan, koreksi harus melalui prosedur keuangan resmi.",
    confirmLabel: "Ya, tetapkan penyelesaian",
  },
  refund_settlement: {
    title: "Catat pengembalian dana telah dibayar?",
    description:
      "Pastikan metode, nominal, dan bukti pembayaran sesuai transaksi sebenarnya. Referensi dapat dikosongkan bila tidak tersedia.",
    confirmLabel: "Ya, catat pembayaran refund",
  },
  refund_waiver: {
    title: "Catat pelepasan hak pengembalian dana?",
    description:
      "Tindakan ini mencatat bahwa penghuni melepaskan hak pengembalian dana. Alasan dapat dicatat bila tersedia.",
    confirmLabel: "Ya, catat pelepasan hak",
    destructive: true,
  },
};

function stageForCommand(command: CheckoutCommand | null): CheckoutStage {
  if (!command) return 1;
  switch (command.state) {
    case "notice_received":
      return 2;
    case "scheduled":
      return 3;
    case "inspection_required":
      return 4;
    case "settlement_pending":
    case "completed":
      return 5;
    default:
      return 1;
  }
}

function previousStage(stage: CheckoutStage): CheckoutStage {
  return Math.max(1, stage - 1) as CheckoutStage;
}

function CheckoutStageNavigator({
  activeStage,
  availableStage,
  onSelect,
}: {
  activeStage: CheckoutStage;
  availableStage: CheckoutStage;
  onSelect: (stage: CheckoutStage) => void;
}) {
  return (
    <nav aria-label="Tahapan proses check-out" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 rounded-lg border border-border bg-muted/30 p-1.5 sm:min-w-0 sm:justify-between">
        {checkoutStages.map((stage, index) => {
          const isActive = stage.id === activeStage;
          const isAvailable = stage.id <= availableStage;
          const isCompleted = stage.id < availableStage;
          return (
            <li key={stage.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!isAvailable}
                aria-current={isActive ? "step" : undefined}
                aria-label={
                  isActive
                    ? "Tahap " + stage.id + ": " + stage.label + ", sedang dibuka"
                    : isCompleted
                      ? "Tahap " + stage.id + ": " + stage.label + ", sudah tersimpan"
                      : "Tahap " + stage.id + ": " + stage.label + ", belum tersedia"
                }
                onClick={() => onSelect(stage.id)}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isAvailable
                      ? "text-success hover:bg-success/10"
                      : "cursor-not-allowed text-muted-foreground/65"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : isAvailable
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : stage.id}
                </span>
                <span>{stage.label}</span>
              </button>
              {index < checkoutStages.length - 1 ? (
                <span
                  className={
                    isCompleted ? "h-px w-2 bg-success/50 sm:w-4" : "h-px w-2 bg-border sm:w-4"
                  }
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckoutStageHistory({
  stage,
  command,
  onEdit,
}: {
  stage: CheckoutStage;
  command: CheckoutCommand;
  onEdit?: () => void;
}) {
  const copy: Record<CheckoutStage, { title: string; detail: string }> = {
    1: {
      title: "Rencana check-out telah disimpan",
      detail: `Rencana keluar ${command.effectiveDate}. Alasan dan sumber permintaan tersimpan di riwayat proses.`,
    },
    2: {
      title:
        command.chargePolicy === "late_checkout_penalty_v1"
          ? "Rencana serah-terima telah dikonfirmasi"
          : "Persetujuan jadwal telah dicatat",
      detail:
        command.chargePolicy === "late_checkout_penalty_v1"
          ? `Batas check-out tanpa denda: ${formatIndonesianFullDate(command.penaltyFreeUntilDate)}. Denda dihitung dari serah-terima fisik.`
          : `Kompensasi pemberitahuan singkat yang disetujui: ${rupiah.format(command.approvedShortNoticeCharge ?? 0)}.`,
    },
    3: {
      title: "Serah-terima telah dicatat",
      detail: "Konfirmasi akses, inventaris, parkir, dan bukti serah-terima telah tersimpan.",
    },
    4: {
      title: "Inspeksi kamar telah dicatat",
      detail: "Hasil inspeksi dan bukti pendukung tersimpan untuk penyelesaian keuangan.",
    },
    5: {
      title: "Penyelesaian akhir telah dicatat",
      detail: "Keputusan keuangan dan dokumen resmi sudah diterbitkan sebagai catatan tetap.",
    },
  };

  const item = copy[stage];
  return (
    <div className="rounded-lg border border-success/25 bg-success/5 p-4">
      <div className="flex gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {onEdit
              ? "Perubahan tahap ini tetap dicatat dalam riwayat proses."
              : "Tahap ini sudah tersimpan. Gunakan “Batalkan & mulai ulang” jika proses perlu diisi kembali dari awal."}
          </p>

          {onEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="success" onClick={onEdit}>
                Edit tahap ini
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** W07D command UI. It never invokes compatibility close/refund endpoints. */
export function CheckoutPanel({
  leaseId,
  propertyId,
  onClose,
  onCompleted,
  onChanged,
  initialFocus = "overview",
}: Props) {
  const [command, setCommand] = useState<CheckoutCommand | null>(null);
  const [visibleStage, setVisibleStage] = useState<CheckoutStage>(1);
  const [editingStage, setEditingStage] = useState<CheckoutStage | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(jakartaToday());
  const [exitMode, setExitMode] = useState<CheckoutMode>("resident_early_termination");
  const [reason, setReason] = useState("");
  const [requestSource, setRequestSource] = useState<"resident" | "parent" | "admin" | "other">(
    "resident",
  );
  const [noticeExceptionReason, setNoticeExceptionReason] = useState("");
  const [noticeExceptionEvidence, setNoticeExceptionEvidence] = useState<FileResponse[]>([]);
  const [noticeExceptionEvidenceBusy, setNoticeExceptionEvidenceBusy] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [approvedShortNoticeCharge, setApprovedShortNoticeCharge] = useState(0);
  const [lateCheckoutDailyPenaltyAmount, setLateCheckoutDailyPenaltyAmount] = useState(0);
  const [waiverReason, setWaiverReason] = useState("");
  const [waiverEvidence, setWaiverEvidence] = useState<FileResponse[]>([]);
  const [waiverEvidenceBusy, setWaiverEvidenceBusy] = useState(false);
  const [roomResult, setRoomResult] = useState<"inspection_required" | "maintenance">(
    "inspection_required",
  );
  const [handover, setHandover] = useState<HandoverConfirmation>({
    keyAccess: false,
    inventory: false,
    parking: false,
  });
  const [inventoryItems, setInventoryItems] = useState<InventoryDraft[]>([inventoryDraft(1)]);
  const [accessItems, setAccessItems] = useState<AccessDraft[]>([accessDraft(2)]);
  const [utilityReadings, setUtilityReadings] = useState<UtilityDraft[]>([]);
  const [nextHandoverKey, setNextHandoverKey] = useState(3);
  const [keyAccessEvidence, setKeyAccessEvidence] = useState<FileResponse[]>([]);
  const [keyAccessEvidenceBusy, setKeyAccessEvidenceBusy] = useState(false);
  const [inventoryEvidence, setInventoryEvidence] = useState<FileResponse[]>([]);
  const [inventoryEvidenceBusy, setInventoryEvidenceBusy] = useState(false);
  const [parkingEvidence, setParkingEvidence] = useState<FileResponse[]>([]);
  const [parkingEvidenceBusy, setParkingEvidenceBusy] = useState(false);
  const [inspectionEvidence, setInspectionEvidence] = useState<FileResponse[]>([]);
  const [inspectionEvidenceBusy, setInspectionEvidenceBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [confirmationIntent, setConfirmationIntent] = useState<ConfirmationIntent | null>(null);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [damages, setDamages] = useState<DamageDraft[]>([]);
  const [nextDamageKey, setNextDamageKey] = useState(1);
  const [depositOffsetAmount, setDepositOffsetAmount] = useState("0");
  const [depositOffsetReason, setDepositOffsetReason] = useState("");
  const [depositOffsetEvidence, setDepositOffsetEvidence] = useState<FileResponse[]>([]);
  const [depositOffsetEvidenceBusy, setDepositOffsetEvidenceBusy] = useState(false);
  const [settlementQuote, setSettlementQuote] = useState<CheckoutSettlementQuote | null>(null);
  const [finalRefundAmount, setFinalRefundAmount] = useState("0");
  const [refundAdjustmentReason, setRefundAdjustmentReason] = useState("");
  const [refundAdjustmentEvidence, setRefundAdjustmentEvidence] = useState<FileResponse[]>([]);
  const [refundAdjustmentEvidenceBusy, setRefundAdjustmentEvidenceBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "bank_transfer" | "qris" | "ewallet" | "other"
  >("bank_transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundEvidence, setRefundEvidence] = useState<FileResponse[]>([]);
  const [refundEvidenceBusy, setRefundEvidenceBusy] = useState(false);
  const [refundNotes, setRefundNotes] = useState("");
  const [refundWaiverReason, setRefundWaiverReason] = useState("");
  const [refundPreviewFile, setRefundPreviewFile] = useState<FilePreviewReference | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const checkoutPanelRef = useRef<HTMLDivElement>(null);
  const refundSectionRef = useRef<HTMLDivElement>(null);
  const focusCheckoutPanelAfterCommandChange = useRef(false);
  const [checkoutPanelHighlighted, setCheckoutPanelHighlighted] = useState(false);
  const intentKey = useRef<string | null>(null);
  const key = () => (intentKey.current ??= newIdempotencyKey());
  const exitType: "resident_early_termination" | "normal_expiry" =
    exitMode === "normal_expiry" ? "normal_expiry" : "resident_early_termination";
  const commandId = command?.id;
  const commandState = command?.state;
  const hasPendingExitRefund =
    command?.state === "completed" &&
    command.exitRefundStatus === "pending" &&
    Boolean(command.exitRefundId);

  useEffect(() => {
    if (exitMode === "same_day") setEffectiveDate(jakartaToday());
  }, [exitMode]);

  useEffect(() => {
    if (!error) return;
    const alert = errorAlertRef.current;
    if (!alert) return;
    alert.scrollIntoView({ behavior: "smooth", block: "center" });
    alert.focus({ preventScroll: true });
  }, [error]);

  useEffect(() => {
    if (!focusCheckoutPanelAfterCommandChange.current || !commandId) return;
    focusCheckoutPanelAfterCommandChange.current = false;
    const panel = checkoutPanelRef.current;
    if (!panel) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    panel.focus({ preventScroll: true });
    setCheckoutPanelHighlighted(true);
    const timeout = window.setTimeout(() => setCheckoutPanelHighlighted(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [commandId, commandState]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void adminUxLeaseApi.checkout
      .list(leaseId)
      .then(({ commands }) => {
        if (current) {
          const open = openCheckout(commands);
          setCommand(open);
          setVisibleStage(stageForCommand(open));
          setApprovedShortNoticeCharge(Number(open?.recommendedShortNoticeCharge ?? 0));
          setLateCheckoutDailyPenaltyAmount(Number(open?.lateCheckoutDailyPenaltyAmount ?? 0));
          if (open?.inspectionRoomStatus) setRoomResult(open.inspectionRoomStatus);
        }
      })
      .catch((loadError: unknown) => {
        if (current) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [leaseId]);

  useEffect(() => {
    if (initialFocus !== "refund" || !hasPendingExitRefund) return;
    const section = refundSectionRef.current;
    if (!section) return;
    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      section.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasPendingExitRefund, initialFocus]);

  const perform = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      intentKey.current = null;
      return true;
    } catch (actionError) {
      setError(messageFrom(actionError));
      return false;
    } finally {
      setPending(false);
    }
  };

  // Mutation responses intentionally contain only the fields needed by the
  // command itself. Reload the authoritative checkout projection so the
  // contract summary (resident, duration, and dates) never becomes blank
  // after an admin advances a stage.
  const refreshOpenCheckout = async () => {
    const refreshed = await adminUxLeaseApi.checkout.list(leaseId);
    const open = openCheckout(refreshed.commands);
    setCommand(open);
    setApprovedShortNoticeCharge(Number(open?.recommendedShortNoticeCharge ?? 0));
    setLateCheckoutDailyPenaltyAmount(Number(open?.lateCheckoutDailyPenaltyAmount ?? 0));
    if (open?.inspectionRoomStatus) setRoomResult(open.inspectionRoomStatus);
    return open;
  };

  const submitNotice = () =>
    perform(async () => {
      const result = await adminUxLeaseApi.checkout.createLateCheckoutPlan(
        leaseId,
        {
          exitType,
          effectiveDate,
          reason,
          requestSource,
          internalNote: internalNote.trim() || undefined,
        },
        key(),
      );
      const open = await refreshOpenCheckout();
      focusCheckoutPanelAfterCommandChange.current = true;
      await onChanged?.(open);
      setVisibleStage(stageForCommand(open));
    });

  const beginNoticeEdit = () => {
    if (!command || !["notice_received", "scheduled"].includes(command.state)) return;
    setEffectiveDate(command.effectiveDate);
    setExitMode(
      command.exitType === "normal_expiry" ? "normal_expiry" : "resident_early_termination",
    );
    setReason(command.noticeReason);
    setRequestSource((command.requestSource ?? "resident") as typeof requestSource);
    setNoticeExceptionReason(command.noticeExceptionReason ?? "");
    setInternalNote(command.internalNote ?? "");
    setVisibleStage(1);
    setEditingStage(1);
  };

  const saveNoticeEdit = () => {
    if (!command || editingStage !== 1) return;
    return perform(async () => {
      const input = {
        exitType,
        effectiveDate,
        reason,
        requestSource,
        internalNote: internalNote.trim() || undefined,
      };
      if (command.chargePolicy === "late_checkout_penalty_v1")
        await adminUxLeaseApi.checkout.editLateCheckoutPlan(leaseId, command.id, input, key());
      else
        await adminUxLeaseApi.checkout.editNotice(
          leaseId,
          command.id,
          {
            ...input,
            noticeExceptionReason: noticeExceptionReason.trim() || undefined,
          },
          key(),
        );
      const open = await refreshOpenCheckout();
      setEditingStage(null);
      setVisibleStage(stageForCommand(open));
    });
  };

  const beginApprovalEdit = () => {
    if (!command || command.state !== "scheduled") return;
    setApprovedShortNoticeCharge(Number(command.approvedShortNoticeCharge ?? 0));
    setWaiverReason(command.shortNoticeWaiverReason ?? "");
    setWaiverEvidence([]);
    setVisibleStage(2);
    setEditingStage(2);
  };

  const saveApprovalEdit = () => {
    if (!command || editingStage !== 2) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.editApproval(
        leaseId,
        command.id,
        {
          approvedShortNoticeCharge,
          shortNoticeWaiverReason: waiverReason.trim() || undefined,
          shortNoticeWaiverEvidenceFileIds: waiverEvidence.map((file) => file.id),
        },
        key(),
      );
      const open = await refreshOpenCheckout();
      setEditingStage(null);
      setVisibleStage(stageForCommand(open));
    });
  };

  const damageInput = () =>
    damages.map((item) => ({
      amount: Number(item.amount),
      reason: item.reason.trim(),
      evidenceFileIds: item.evidence.map((file) => file.id),
    }));

  const settlementInput = (includeFinalDecision: boolean) => ({
    roomStatusAfter: roomResult,
    damageDeductions: damageInput(),
    depositRentOffsetAmount: Number(depositOffsetAmount || 0),
    depositRentOffsetReason: depositOffsetReason.trim() || undefined,
    depositRentOffsetEvidenceFileIds: depositOffsetEvidence.map((file) => file.id),
    finalRefundAmount: includeFinalDecision ? Number(finalRefundAmount || 0) : undefined,
    refundAdjustmentReason: includeFinalDecision
      ? refundAdjustmentReason.trim() || undefined
      : undefined,
    refundAdjustmentEvidenceFileIds: includeFinalDecision
      ? refundAdjustmentEvidence.map((file) => file.id)
      : undefined,
  });

  const previewSettlement = () => {
    if (!command) return;
    return perform(async () => {
      const result = await adminUxLeaseApi.checkout.previewSettlement(
        leaseId,
        command.id,
        settlementInput(false),
      );
      setSettlementQuote(result.quote);
      setFinalRefundAmount(String(result.quote.recommendedRefundAmount));
      setRefundAdjustmentReason("");
      setRefundAdjustmentEvidence([]);
    });
  };

  const completeSettlement = () => {
    if (!command) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.complete(leaseId, command.id, settlementInput(true), key());
      const open = await refreshOpenCheckout();
      focusCheckoutPanelAfterCommandChange.current = true;
      await onChanged?.(open);
      setVisibleStage(stageForCommand(open));
      setCompletionDialogOpen(true);
    });
  };

  const finishCheckoutView = async () => {
    setCompletionDialogOpen(false);
    try {
      await onCompleted?.();
    } catch {
      // The completed command remains valid even if the surrounding detail
      // needs to refresh again on the next query cycle.
    } finally {
      onClose();
    }
  };

  const settleExitRefund = () => {
    if (!command?.exitRefundId || refundEvidence.length === 0) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.settleRefund(
        leaseId,
        command.id,
        command.exitRefundId!,
        {
          paymentMethod: refundMethod,
          externalReference: refundReference,
          evidenceFileIds: refundEvidence.map((file) => file.id),
          notes: refundNotes || undefined,
        },
        key(),
      );
      const open = await refreshOpenCheckout();
      await onChanged?.(open);
      setVisibleStage(stageForCommand(open));
    });
  };

  const waiveExitRefund = () => {
    if (!command?.exitRefundId) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.waiveRefund(
        leaseId,
        command.id,
        command.exitRefundId!,
        refundWaiverReason,
        key(),
      );
      const open = await refreshOpenCheckout();
      await onChanged?.(open);
      setVisibleStage(stageForCommand(open));
    });
  };

  const downloadDocument = async (document: NonNullable<CheckoutCommand["documents"]>[number]) => {
    if (!command) return;
    setDownloadingDocumentId(document.id);
    setError(null);
    try {
      await downloadLeaseExitDocument(leaseId, command.id, document.id, document.documentCode);
    } catch (downloadError) {
      setError(messageFrom(downloadError));
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const advance = () => {
    if (!command) return;
    if (command.state === "scheduled" && command.effectiveDate > jakartaToday()) {
      setError(
        `Serah-terima fisik belum dapat dicatat. Jadwal check-out adalah ${formatIndonesianFullDate(command.effectiveDate)}.`,
      );
      return false;
    }
    return perform(async () => {
      if (command.state === "notice_received") {
        if (command.chargePolicy === "late_checkout_penalty_v1")
          await adminUxLeaseApi.checkout.confirmLateCheckoutPlan(
            leaseId,
            command.id,
            { dailyPenaltyAmount: lateCheckoutDailyPenaltyAmount },
            key(),
          );
        else
          await adminUxLeaseApi.checkout.schedule(
            leaseId,
            command.id,
            {
              approvedShortNoticeCharge: Number(approvedShortNoticeCharge),
              shortNoticeWaiverReason: waiverReason || undefined,
              shortNoticeWaiverEvidenceFileIds: waiverEvidence.map((file) => file.id),
            },
            key(),
          );
        const open = await refreshOpenCheckout();
        focusCheckoutPanelAfterCommandChange.current = true;
        await onChanged?.(open);
        setVisibleStage(stageForCommand(open));
      } else if (command.state === "scheduled") {
        await adminUxLeaseApi.checkout.handover(
          leaseId,
          command.id,
          {
            keyAccessConfirmed: handover.keyAccess,
            inventoryConfirmed: handover.inventory,
            parkingConfirmed: handover.parking,
            inventoryItems: inventoryItems.map((item) => ({
              name: item.name,
              expectedQuantity: Number(item.expectedQuantity),
              returnedQuantity: Number(item.returnedQuantity),
              condition: item.condition,
              notes: item.notes || undefined,
            })),
            keyAccessItems: accessItems.map((item) => ({
              name: item.name,
              expectedQuantity: Number(item.expectedQuantity),
              returnedQuantity: Number(item.returnedQuantity),
              status: item.status,
              notes: item.notes || undefined,
            })),
            utilityReadings: utilityReadings.map((reading) => ({
              utilityType: reading.utilityType,
              meterNumber: reading.meterNumber || undefined,
              checkoutReading: reading.checkoutReading,
              unit: reading.unit,
              outstandingUsageNotes: reading.outstandingUsageNotes || undefined,
            })),
            keyAccessFileIds: keyAccessEvidence.map((file) => file.id),
            inventoryFileIds: inventoryEvidence.map((file) => file.id),
            parkingFileIds: parkingEvidence.map((file) => file.id),
            notes: notes || undefined,
          },
          key(),
        );
        const open = await refreshOpenCheckout();
        focusCheckoutPanelAfterCommandChange.current = true;
        await onChanged?.(open);
        setVisibleStage(stageForCommand(open));
      } else if (command.state === "inspection_required") {
        await adminUxLeaseApi.checkout.inspection(
          leaseId,
          command.id,
          {
            roomStatusAfter: roomResult,
            inspectionFileIds: inspectionEvidence.map((file) => file.id),
            notes: notes || undefined,
          },
          key(),
        );
        const open = await refreshOpenCheckout();
        focusCheckoutPanelAfterCommandChange.current = true;
        await onChanged?.(open);
        setVisibleStage(stageForCommand(open));
      }
    });
  };

  const resetCheckoutDraft = () => {
    setCommand(null);
    setVisibleStage(1);
    setEditingStage(null);
    setEffectiveDate(jakartaToday());
    setExitMode("resident_early_termination");
    setReason("");
    setRequestSource("resident");
    setNoticeExceptionReason("");
    setNoticeExceptionEvidence([]);
    setNoticeExceptionEvidenceBusy(false);
    setInternalNote("");
    setApprovedShortNoticeCharge(0);
    setWaiverReason("");
    setWaiverEvidence([]);
    setWaiverEvidenceBusy(false);
    setRoomResult("inspection_required");
    setHandover({ keyAccess: false, inventory: false, parking: false });
    setInventoryItems([inventoryDraft(1)]);
    setAccessItems([accessDraft(2)]);
    setUtilityReadings([]);
    setNextHandoverKey(3);
    setKeyAccessEvidence([]);
    setKeyAccessEvidenceBusy(false);
    setInventoryEvidence([]);
    setInventoryEvidenceBusy(false);
    setParkingEvidence([]);
    setParkingEvidenceBusy(false);
    setInspectionEvidence([]);
    setInspectionEvidenceBusy(false);
    setNotes("");
    setDamages([]);
    setNextDamageKey(1);
    setDepositOffsetAmount("0");
    setDepositOffsetReason("");
    setDepositOffsetEvidence([]);
    setDepositOffsetEvidenceBusy(false);
    setSettlementQuote(null);
    setFinalRefundAmount("0");
    setRefundAdjustmentReason("");
    setRefundAdjustmentEvidence([]);
    setRefundAdjustmentEvidenceBusy(false);
    setRefundMethod("bank_transfer");
    setRefundReference("");
    setRefundEvidence([]);
    setRefundEvidenceBusy(false);
    setRefundNotes("");
    setRefundWaiverReason("");
    setDownloadingDocumentId(null);
    setCancelDialogOpen(false);
    setConfirmationIntent(null);
    setError(null);
  };

  const cancel = (cancellationReason: string) => {
    if (!command) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.cancel(leaseId, command.id, cancellationReason, key());
      resetCheckoutDraft();
      try {
        await onCompleted?.();
      } catch {
        // Cancellation has already been stored; do not present a refresh issue
        // as though the cancellation itself failed.
      }
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmationIntent) return;
    const intent = confirmationIntent;
    const result =
      intent === "notice"
        ? await submitNotice()
        : intent === "approval" || intent === "handover" || intent === "inspection"
          ? await advance()
          : intent === "settlement"
            ? await completeSettlement()
            : intent === "refund_settlement"
              ? await settleExitRefund()
              : await waiveExitRefund();
    if (result !== false) setConfirmationIntent(null);
  };

  const invalidQuantity = (expected: string, returned: string) => {
    const expectedNumber = Number(expected);
    const returnedNumber = Number(returned);
    return (
      !Number.isSafeInteger(expectedNumber) ||
      !Number.isSafeInteger(returnedNumber) ||
      expectedNumber < 0 ||
      returnedNumber < 0 ||
      returnedNumber > expectedNumber
    );
  };
  const handoverDetailInvalid =
    inventoryItems.length === 0 ||
    accessItems.length === 0 ||
    inventoryItems.some(
      (item) => !item.name.trim() || invalidQuantity(item.expectedQuantity, item.returnedQuantity),
    ) ||
    accessItems.some(
      (item) => !item.name.trim() || invalidQuantity(item.expectedQuantity, item.returnedQuantity),
    ) ||
    utilityReadings.some(
      (reading) =>
        !reading.utilityType.trim() || !reading.checkoutReading.trim() || !reading.unit.trim(),
    );
  const isLateCheckoutPolicy = command?.chargePolicy === "late_checkout_penalty_v1";
  const handoverScheduleNotReached =
    command?.state === "scheduled" && command.effectiveDate > jakartaToday();
  const canRecordHandover =
    handover.keyAccess &&
    handover.inventory &&
    handover.parking &&
    !handoverDetailInvalid &&
    !keyAccessEvidenceBusy &&
    !inventoryEvidenceBusy &&
    !parkingEvidenceBusy &&
    !handoverScheduleNotReached;
  const inspectionInvalid = inspectionEvidenceBusy;
  const recommendedCharge = Number(command?.recommendedShortNoticeCharge ?? 0);
  const isEarlyTermination = command?.exitType === "resident_early_termination";
  const monthlyRateAmount = Number(command?.monthlyRateAmount ?? 0);
  const paymentPeriodDays = Number(command?.paymentPeriodDays ?? 0);
  const dailyRateAmount = Number(command?.dailyRateAmount ?? 0);
  const missingNoticeDays = Number(command?.missingNoticeDays ?? 0);
  const noticeCalculationAvailable = monthlyRateAmount > 0 && paymentPeriodDays > 0;
  const approvedCharge = Number(approvedShortNoticeCharge);
  const approvedChargeExceedsRecommendation = approvedCharge > recommendedCharge;
  const approvalInvalid =
    !Number.isSafeInteger(approvedCharge) ||
    approvedCharge < 0 ||
    approvedChargeExceedsRecommendation ||
    (approvedCharge < recommendedCharge && (waiverReason.trim().length < 3 || waiverEvidenceBusy));
  const damageInvalid = damages.some((item) => {
    const amount = Number(item.amount);
    return (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !item.reason.trim() ||
      item.evidence.length === 0
    );
  });
  const damageUploadBusy = damages.some((item) => item.busy);
  const offsetAmount = Number(depositOffsetAmount || 0);
  const offsetInvalid =
    !Number.isSafeInteger(offsetAmount) ||
    offsetAmount < 0 ||
    (offsetAmount > 0 &&
      (depositOffsetReason.trim().length < 3 || depositOffsetEvidence.length === 0));
  const finalRefund = Number(finalRefundAmount || 0);
  const finalRefundInvalid =
    !settlementQuote ||
    !Number.isSafeInteger(finalRefund) ||
    finalRefund < 0 ||
    finalRefund > settlementQuote.recommendedRefundAmount ||
    (finalRefund !== settlementQuote.recommendedRefundAmount &&
      (refundAdjustmentReason.trim().length < 3 ||
        refundAdjustmentEvidence.length === 0 ||
        refundAdjustmentEvidenceBusy));
  const settlementDraftInvalid =
    damageInvalid || damageUploadBusy || offsetInvalid || depositOffsetEvidenceBusy;
  const refundSettlementInvalid = refundEvidence.length === 0 || refundEvidenceBusy;
  const noticeDays = effectiveDate
    ? Math.floor(
        (Date.parse(`${effectiveDate}T00:00:00+07:00`) -
          Date.parse(`${jakartaToday()}T00:00:00+07:00`)) /
          86_400_000,
      )
    : -1;
  const noticeExceptionRequired =
    exitType === "resident_early_termination" && noticeDays >= 0 && noticeDays < 14;
  const lateCheckoutEstimate =
    command && isLateCheckoutPolicy
      ? lateCheckoutPlanEstimate(command, lateCheckoutDailyPenaltyAmount)
      : null;
  const next =
    command?.state === "notice_received"
      ? isLateCheckoutPolicy
        ? "Lanjutkan ke serah-terima"
        : "Setujui & jadwalkan check-out"
      : command?.state === "scheduled"
        ? handoverScheduleNotReached
          ? "Menunggu tanggal serah-terima"
          : "Catat serah-terima"
        : command?.state === "inspection_required"
          ? "Catat inspeksi"
          : null;
  const currentStage = stageForCommand(command);
  const isReviewingPreviousStage = Boolean(command && visibleStage < currentStage);

  return (
    <Card
      ref={checkoutPanelRef}
      tabIndex={-1}
      aria-labelledby="checkout-panel-title"
      className={`scroll-mt-24 border-border bg-card shadow-sm transition-shadow duration-300 ${
        checkoutPanelHighlighted
          ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
          : ""
      }`}
    >
      <CardHeader className="space-y-2 border-b border-border pb-5">
        <CardTitle id="checkout-panel-title" className="flex items-center gap-2 text-foreground">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          Proses check-out
        </CardTitle>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Catat rencana, serah-terima, inspeksi, dan penyelesaian keuangan secara bertahap. Masa
          toleransi dan denda hanya dihitung dari tanggal kamar serta kunci benar-benar
          dikembalikan.
        </p>
        <CheckoutStageNavigator
          activeStage={visibleStage}
          availableStage={currentStage}
          onSelect={setVisibleStage}
        />
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {error ? (
          <div
            ref={errorAlertRef}
            role="alert"
            tabIndex={-1}
            className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat status checkout…
          </div>
        ) : !command ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>
                Jenis keluar<span className="text-destructive"> *</span>
              </span>
              <Select
                value={exitMode}
                onValueChange={(value) => setExitMode(value as CheckoutMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident_early_termination">Berhenti lebih awal</SelectItem>
                  <SelectItem value="normal_expiry">Masa sewa berakhir</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <HeroUiDatePicker
              id="checkout-effective-date"
              label="Tanggal keluar yang direncanakan"
              value={effectiveDate}
              onChange={(value) => setEffectiveDate(value ?? "")}
              required
              className="min-w-0 gap-2"
            />
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-5 text-muted-foreground">
              {exitMode === "normal_expiry"
                ? "Penghuni mendapat masa toleransi tiga hari setelah akhir masa sewa untuk mengosongkan kamar dan mengembalikan kunci."
                : "Keluar lebih awal tidak dikenai denda. Denda hanya berlaku apabila kamar atau kunci dikembalikan setelah masa toleransi akhir sewa."}
            </p>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>
                Sumber permintaan<span className="text-destructive"> *</span>
              </span>
              <Select
                value={requestSource}
                onValueChange={(value) => setRequestSource(value as typeof requestSource)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident">Penghuni</SelectItem>
                  <SelectItem value="parent">Orang tua / wali</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="other">Pihak lainnya</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
              <span>
                Alasan check-out<span className="text-destructive"> *</span>
              </span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
              Catatan internal
              <Textarea
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder="Hanya terlihat oleh tim operasional."
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button
                disabled={!reason.trim() || !effectiveDate || pending}
                onClick={() => setConfirmationIntent("notice")}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarCheck2 className="mr-2 h-4 w-4" />
                )}
                Simpan rencana check-out
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={onClose}>
                <XCircle className="mr-2 h-4 w-4" />
                Tutup
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Status proses
              </p>
              <p className="mt-1 text-base font-semibold capitalize text-foreground">
                {checkoutStateLabel[command.state] ?? command.state.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Rencana keluar {command.effectiveDate} · Dicatat {command.noticeRecordedDate}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {command.exitType === "normal_expiry"
                  ? "Check-out normal saat masa sewa berakhir"
                  : "Permintaan penghentian dini penghuni"}
              </p>
              <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-semibold text-foreground">Ringkasan kontrak</p>
                <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Penghuni</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {command.residentFullName || "Tidak tersedia"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Durasi kontrak</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {leaseTermLabel(
                        command.leaseTermMonths,
                        command.leaseStartDate,
                        command.plannedLeaseEndDate,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Masa kontrak</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {formatIndonesianFullDate(command.leaseStartDate)} s.d.{" "}
                      {formatIndonesianFullDate(command.plannedLeaseEndDate)}
                    </dd>
                  </div>
                  {isLateCheckoutPolicy ? (
                    <>
                      <div>
                        <dt className="text-muted-foreground">Hari terakhir masa sewa</dt>
                        <dd className="mt-1 font-semibold text-foreground">
                          {formatIndonesianFullDate(command.contractLastOccupancyDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Batas keluar tanpa denda</dt>
                        <dd className="mt-1 font-semibold text-foreground">
                          {formatIndonesianFullDate(command.penaltyFreeUntilDate)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Tanggal rencana serah-terima</dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {formatIndonesianFullDate(command.effectiveDate)}
                    </dd>
                  </div>
                </dl>
              </div>
              {command.state !== "completed" ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="success"
                      disabled={pending}
                      onClick={beginNoticeEdit}
                    >
                      Edit rencana check-out
                    </Button>
                    {command.state === "scheduled" && !isLateCheckoutPolicy ? (
                      <Button
                        type="button"
                        variant="success"
                        disabled={pending}
                        onClick={beginApprovalEdit}
                      >
                        Edit tahap persetujuan
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Rencana berubah?</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Batalkan proses dan isi ulang dari tahap pertama. Jika serah-terima sudah
                        dicatat, status penyewaan, hunian, kamar, akses, dan parkir akan dipulihkan.
                        Riwayat pembatalan tetap tersimpan.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="shrink-0"
                      disabled={pending}
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Batalkan & mulai ulang
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            {editingStage === 1 ? (
              <fieldset className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Edit rencana check-out
                </legend>
                <p className="text-sm leading-6 text-muted-foreground">
                  {isLateCheckoutPolicy
                    ? "Perubahan rencana akan mengatur ulang konfirmasi serah-terima. Masa toleransi dan tarif denda harian tetap mengikuti kebijakan yang tersimpan."
                    : command.state === "scheduled"
                      ? "Persetujuan jadwal sebelumnya akan dibatalkan dan perlu disetujui ulang setelah perubahan."
                      : "Perubahan ini tersedia sebelum persetujuan jadwal. Sistem akan menghitung ulang hari pemberitahuan dan kompensasi."}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    <span>
                      Jenis keluar<span className="text-destructive"> *</span>
                    </span>
                    <Select
                      value={exitMode}
                      onValueChange={(value) => setExitMode(value as CheckoutMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resident_early_termination">
                          Berhenti lebih awal
                        </SelectItem>
                        {!isLateCheckoutPolicy ? (
                          <SelectItem value="same_day">Check-out mendadak (hari ini)</SelectItem>
                        ) : null}
                        <SelectItem value="normal_expiry">Masa sewa berakhir</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <HeroUiDatePicker
                    id="checkout-effective-date-edit"
                    label="Tanggal keluar yang direncanakan"
                    value={effectiveDate}
                    onChange={(value) => setEffectiveDate(value ?? "")}
                    required
                    disabled={!isLateCheckoutPolicy && exitMode === "same_day"}
                    className="min-w-0 gap-2"
                  />
                  <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
                    <span>
                      Alasan check-out<span className="text-destructive"> *</span>
                    </span>
                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    <span>
                      Sumber permintaan<span className="text-destructive"> *</span>
                    </span>
                    <Select
                      value={requestSource}
                      onValueChange={(value) => setRequestSource(value as typeof requestSource)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resident">Penghuni</SelectItem>
                        <SelectItem value="parent">Orang tua / wali</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="other">Pihak lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Catatan internal
                    <Textarea
                      rows={3}
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                    />
                  </label>
                  {!isLateCheckoutPolicy && noticeExceptionRequired ? (
                    <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
                      <span>
                        Penjelasan pemberitahuan kurang dari 14 hari
                        <span className="text-destructive"> *</span>
                      </span>
                      <Textarea
                        value={noticeExceptionReason}
                        onChange={(event) => setNoticeExceptionReason(event.target.value)}
                      />
                      <span className="text-xs font-normal text-muted-foreground">
                        Bukti pendukung yang sudah tersimpan tetap dipakai untuk revisi ini.
                      </span>
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      setEditingStage(null);
                      setVisibleStage(currentStage);
                    }}
                  >
                    Batal edit
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      pending ||
                      !reason.trim() ||
                      !effectiveDate ||
                      (!isLateCheckoutPolicy && noticeDays < 0) ||
                      (!isLateCheckoutPolicy &&
                        noticeExceptionRequired &&
                        !noticeExceptionReason.trim())
                    }
                    onClick={saveNoticeEdit}
                  >
                    {pending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Simpan perubahan
                  </Button>
                </div>
              </fieldset>
            ) : editingStage === 2 ? (
              <fieldset className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Edit persetujuan dan kompensasi
                </legend>
                <p className="text-sm leading-6 text-muted-foreground">
                  Perubahan persetujuan hanya tersedia sebelum serah-terima fisik. Batas maksimum
                  akan dihitung ulang secara otomatis.
                </p>
                <label className="grid w-full max-w-md gap-2 text-sm font-medium text-foreground">
                  <span>
                    Kompensasi kekurangan masa pemberitahuan
                    <span className="text-destructive"> *</span>
                  </span>
                  <CurrencyInput
                    value={approvedShortNoticeCharge}
                    onValueChange={setApprovedShortNoticeCharge}
                    formatOnChange
                    onClear={() => setApprovedShortNoticeCharge(0)}
                    error={approvedChargeExceedsRecommendation}
                    aria-invalid={approvedChargeExceedsRecommendation}
                  />
                </label>
                {approvedCharge < recommendedCharge ? (
                  <div className="space-y-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <label className="grid gap-2 text-sm font-medium text-foreground">
                      <span>
                        Alasan pengurangan kompensasi<span className="text-destructive"> *</span>
                      </span>
                      <Textarea
                        value={waiverReason}
                        onChange={(event) => setWaiverReason(event.target.value)}
                      />
                    </label>
                    <EvidenceFileUploadField
                      propertyId={propertyId}
                      label="Bukti persetujuan pengurangan"
                      description="Unggah bukti persetujuan bila tersedia."
                      values={waiverEvidence}
                      onChange={setWaiverEvidence}
                      onBusyChange={setWaiverEvidenceBusy}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => {
                      setEditingStage(null);
                      setVisibleStage(currentStage);
                    }}
                  >
                    Batal edit
                  </Button>
                  <Button
                    type="button"
                    disabled={pending || approvalInvalid}
                    onClick={saveApprovalEdit}
                  >
                    {pending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Simpan perubahan
                  </Button>
                </div>
              </fieldset>
            ) : isReviewingPreviousStage ||
              (command.state === "completed" && visibleStage === 5 && !hasPendingExitRefund) ? (
              <CheckoutStageHistory
                stage={visibleStage}
                command={command}
                onEdit={
                  visibleStage === 1 && ["notice_received", "scheduled"].includes(command.state)
                    ? beginNoticeEdit
                    : visibleStage === 2 && command.state === "scheduled" && !isLateCheckoutPolicy
                      ? beginApprovalEdit
                      : undefined
                }
              />
            ) : (
              <>
                {command.state === "notice_received" && isLateCheckoutPolicy ? (
                  <fieldset className="space-y-4 rounded-lg border border-border p-4">
                    <legend className="px-1 text-sm font-semibold text-foreground">
                      Masa toleransi dan denda check-out
                    </legend>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      Penghuni dapat mengosongkan kamar serta mengembalikan kunci sampai batas tanpa
                      denda. Tarif denda ditetapkan untuk rencana check-out ini dan jumlah akhirnya
                      mengikuti tanggal serah-terima fisik.
                    </p>
                    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        Perkiraan denda bila serah-terima sesuai rencana
                      </p>
                      {lateCheckoutEstimate ? (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {lateCheckoutEstimate.chargedDays > 0 ? (
                            <>
                              {lateCheckoutEstimate.chargedDays} hari setelah batas tanpa denda ×{" "}
                              {rupiah.format(lateCheckoutDailyPenaltyAmount)} ={" "}
                              <strong className="text-destructive">
                                {rupiah.format(lateCheckoutEstimate.amount)}
                              </strong>
                              .
                            </>
                          ) : (
                            <>
                              Rp0 karena tanggal rencana masih berada dalam masa toleransi tiga
                              hari.
                            </>
                          )}{" "}
                          Nilai final mengikuti tanggal serah-terima yang benar-benar dicatat.
                        </p>
                      ) : (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          Estimasi denda belum tersedia dari data kontrak.
                        </p>
                      )}
                    </div>
                    <dl className="grid gap-x-6 gap-y-4 border-y border-border/70 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground">Hari terakhir masa sewa</dt>
                        <dd className="mt-1 font-semibold text-foreground">
                          {formatIndonesianFullDate(command.contractLastOccupancyDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Masa toleransi</dt>
                        <dd className="mt-1 font-semibold text-foreground">
                          {command.lateCheckoutGraceDays ?? 3} hari kalender
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Batas check-out tanpa denda</dt>
                        <dd className="mt-1 font-semibold text-foreground">
                          {formatIndonesianFullDate(command.penaltyFreeUntilDate)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>Tarif denda per hari</dt>
                        <dd className="mt-2 max-w-xs">
                          <CurrencyInput
                            value={lateCheckoutDailyPenaltyAmount}
                            onValueChange={setLateCheckoutDailyPenaltyAmount}
                            formatOnChange
                            onClear={() => setLateCheckoutDailyPenaltyAmount(0)}
                            aria-label="Tarif denda per hari"
                          />
                        </dd>
                        <p className="mt-2 text-xs font-normal leading-5 text-muted-foreground">
                          Terisi otomatis dari tarif bulanan ÷ 30 hari. Sesuaikan bila kebijakan
                          kamar berbeda; tarif ini hanya berlaku untuk proses check-out ini.
                        </p>
                      </div>
                    </dl>
                    <div className="flex gap-2.5 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                      <Calculator
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <p>
                        Denda = tarif harian × hari setelah batas check-out tanpa denda. Denda
                        paling banyak dihitung untuk {command.lateCheckoutPenaltyDayCap ?? 30} hari
                        dan akan muncul di penyelesaian keuangan akhir bila ada.
                      </p>
                    </div>
                  </fieldset>
                ) : command.state === "notice_received" ? (
                  <fieldset className="space-y-4 rounded-lg border border-border p-4">
                    <legend className="px-1 text-sm font-semibold text-foreground">
                      Persetujuan jadwal keluar dan kompensasi
                    </legend>
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                      Tetapkan jadwal keluar dan, bila berlaku, kompensasi karena masa pemberitahuan
                      kurang. Penyelesaian sewa, deposit, dan kerusakan dihitung setelah
                      serah-terima serta inspeksi kamar.
                    </p>
                    <div className="space-y-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-2.5">
                          <Calculator
                            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          <div>
                            <p className="font-semibold text-foreground">
                              Kompensasi masa pemberitahuan
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {isEarlyTermination
                                ? "Dihitung dari tarif sewa dan hari pada periode bulanan yang memuat tanggal efektif keluar."
                                : "Tidak berlaku ketika penghuni keluar sesuai akhir masa sewa."}
                            </p>
                          </div>
                        </div>
                        <span className="self-start rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-foreground dark:text-white">
                          {isEarlyTermination ? "Maksimum berdasarkan kebijakan" : "Tidak berlaku"}
                        </span>
                      </div>
                      {isEarlyTermination ? (
                        <>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/70 py-3 tabular-nums sm:grid-cols-3">
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                Tarif sewa per bulan
                              </dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {monthlyRateAmount > 0
                                  ? rupiah.format(monthlyRateAmount)
                                  : "Tidak tersedia"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                Hari pada periode tarif
                              </dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {paymentPeriodDays} hari
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">Masa pemberitahuan</dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {command.noticeDays ?? 0} hari
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">Tarif harian</dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {rupiah.format(dailyRateAmount)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                Hari yang belum diberitahukan
                              </dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {missingNoticeDays} dari 14 hari
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">Maksimum kompensasi</dt>
                              <dd className="mt-0.5 font-semibold text-foreground">
                                {rupiah.format(recommendedCharge)}
                              </dd>
                            </div>
                          </dl>
                          <div className="space-y-1.5 border-b border-border/70 pb-4">
                            <p className="text-xs font-medium text-foreground">Rumus kompensasi</p>
                            {noticeCalculationAvailable ? (
                              <p className="font-semibold text-foreground tabular-nums">
                                {rupiah.format(monthlyRateAmount)} ÷ {paymentPeriodDays} hari ×{" "}
                                {missingNoticeDays} hari = {rupiah.format(recommendedCharge)}
                              </p>
                            ) : (
                              <p className="text-xs leading-5 text-muted-foreground">
                                Rincian tarif kontrak tidak tersedia pada data lama. Batas batas
                                kebijakan tetap berlaku.
                              </p>
                            )}
                            <p className="text-xs leading-5 text-muted-foreground">
                              Nilai akhir dibulatkan satu kali ke Rupiah penuh agar tidak terjadi
                              selisih pembulatan harian.
                            </p>
                          </div>
                          <div className="space-y-3">
                            <label className="grid w-full max-w-md gap-2 text-sm font-medium text-foreground">
                              <span>
                                Kompensasi kekurangan masa pemberitahuan
                                <span className="text-destructive"> *</span>
                              </span>
                              <CurrencyInput
                                value={approvedShortNoticeCharge}
                                onValueChange={setApprovedShortNoticeCharge}
                                formatOnChange
                                onClear={() => setApprovedShortNoticeCharge(0)}
                                error={approvedChargeExceedsRecommendation}
                                aria-invalid={approvedChargeExceedsRecommendation}
                                aria-describedby={
                                  approvedChargeExceedsRecommendation
                                    ? "checkout-short-notice-charge-help checkout-short-notice-charge-error"
                                    : "checkout-short-notice-charge-help"
                                }
                                aria-label="Kompensasi kekurangan masa pemberitahuan"
                              />
                              <span
                                id="checkout-short-notice-charge-help"
                                className="text-xs font-normal leading-5 text-muted-foreground"
                              >
                                Nominal ini hanya untuk kekurangan masa pemberitahuan. Sewa yang
                                telah menjadi hak, sisa pembayaran, deposit, dan kerusakan dicatat
                                terpisah pada penyelesaian akhir.
                              </span>
                              {approvedChargeExceedsRecommendation ? (
                                <span
                                  id="checkout-short-notice-charge-error"
                                  role="alert"
                                  className="flex gap-2 rounded-md border border-destructive/35 bg-destructive/5 p-3 text-xs font-normal leading-5 text-destructive"
                                >
                                  <AlertCircle
                                    className="mt-0.5 h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    Nominal melebihi batas maksimum{" "}
                                    {rupiah.format(recommendedCharge)}. Kurangi nominal ini. Biaya
                                    sewa atau kerusakan dicatat pada penyelesaian akhir dengan
                                    alasan dan bukti terpisah.
                                  </span>
                                </span>
                              ) : null}
                            </label>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2.5 rounded-md border border-border/80 bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                          <p>
                            Tidak ada kompensasi kekurangan masa pemberitahuan. Tahap penyelesaian
                            akhir tetap mencatat sewa, deposit, dan kerusakan bila ada.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2.5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <p>
                        <span className="font-medium text-foreground">
                          Penyelesaian akhir belum dihitung.
                        </span>{" "}
                        Setelah serah-terima dan inspeksi, sistem menghitung sewa yang menjadi hak,
                        pengembalian pembayaran, deposit, serta tagihan akhir.
                      </p>
                    </div>
                    {isEarlyTermination && approvedCharge < recommendedCharge ? (
                      <div className="space-y-4 rounded-lg border border-warning/35 bg-warning/5 p-4">
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                          <span>
                            Alasan pengurangan atau penghapusan biaya
                            <span className="text-destructive"> *</span>
                          </span>
                          <Textarea
                            value={waiverReason}
                            onChange={(event) => setWaiverReason(event.target.value)}
                          />
                        </label>
                        <EvidenceFileUploadField
                          propertyId={propertyId}
                          label="Bukti persetujuan penyesuaian biaya"
                          description="Unggah bukti persetujuan bila tersedia."
                          values={waiverEvidence}
                          onChange={setWaiverEvidence}
                          onBusyChange={setWaiverEvidenceBusy}
                        />
                      </div>
                    ) : null}
                  </fieldset>
                ) : null}
                {command.state === "scheduled" ? (
                  <fieldset className="space-y-4 rounded-lg border border-border p-4">
                    <legend className="px-1 text-sm font-semibold text-foreground">
                      Konfirmasi serah-terima<span className="text-destructive"> *</span>
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      Seluruh konfirmasi wajib sebelum bukti serah-terima disimpan.
                    </p>
                    {handoverScheduleNotReached ? (
                      <div
                        role="status"
                        className="flex gap-2.5 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm leading-6 text-warning-foreground dark:text-white"
                      >
                        <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>
                          Serah-terima belum dapat dicatat sebelum{" "}
                          <strong>{formatIndonesianFullDate(command.effectiveDate)}</strong>. Isi
                          tahap ini setelah kamar dan kunci benar-benar diserahkan. Denda final akan
                          dihitung dari tanggal serah-terima aktual, bukan dari tanggal rencana.
                        </p>
                      </div>
                    ) : null}
                    {(
                      [
                        ["keyAccess", "Kunci dan akses telah dikembalikan atau didokumentasikan."],
                        ["inventory", "Inventaris kamar telah diperiksa dan dicatat."],
                        [
                          "parking",
                          "Parkir sudah direkonsiliasi, termasuk bila penghuni tidak memiliki kendaraan.",
                        ],
                      ] as const
                    ).map(([field, label]) => (
                      <label
                        key={field}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm text-foreground hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={handover[field]}
                          onCheckedChange={(checked) =>
                            setHandover((current) => ({ ...current, [field]: checked === true }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}

                    <div className="grid gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border/70">
                      <div className="min-w-0 md:pr-4">
                        <EvidenceFileUploadField
                          propertyId={propertyId}
                          label="Bukti pengembalian kunci dan akses"
                          description="Unggah foto atau dokumen kunci, kartu akses, remote, atau akses digital bila tersedia."
                          alignHeader
                          values={keyAccessEvidence}
                          onChange={setKeyAccessEvidence}
                          onBusyChange={setKeyAccessEvidenceBusy}
                        />
                      </div>
                      <div className="min-w-0 md:pl-4">
                        <EvidenceFileUploadField
                          propertyId={propertyId}
                          label="Bukti pemeriksaan inventaris"
                          description="Unggah foto kondisi inventaris saat kamar diserahterimakan bila tersedia."
                          alignHeader
                          values={inventoryEvidence}
                          onChange={setInventoryEvidence}
                          onBusyChange={setInventoryEvidenceBusy}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <EvidenceFileUploadField
                        propertyId={propertyId}
                        label="Bukti rekonsiliasi kendaraan dan parkir"
                        description="Gunakan bila ada stiker, kartu parkir, kendaraan, atau akses parkir yang dikembalikan. Konfirmasi tertulis tetap cukup bila penghuni tidak memiliki kendaraan."
                        values={parkingEvidence}
                        onChange={setParkingEvidence}
                        onBusyChange={setParkingEvidenceBusy}
                      />
                    </div>

                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Rincian inventaris
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Catat jumlah yang seharusnya tersedia dan yang diterima kembali.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="info"
                          onClick={() => {
                            setInventoryItems((current) => [
                              ...current,
                              inventoryDraft(nextHandoverKey),
                            ]);
                            setNextHandoverKey((value) => value + 1);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Tambah inventaris
                        </Button>
                      </div>
                      {inventoryItems.map((item, index) => (
                        <div
                          key={item.key}
                          className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                        >
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-4">
                            <span>
                              Nama item<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              value={item.name}
                              placeholder="Contoh: Lemari"
                              onChange={(event) =>
                                setInventoryItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, name: event.target.value }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                            <span>
                              Seharusnya<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              inputMode="numeric"
                              value={item.expectedQuantity}
                              onChange={(event) =>
                                setInventoryItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? {
                                          ...draft,
                                          expectedQuantity: event.target.value.replace(/\D/g, ""),
                                        }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                            <span>
                              Dikembalikan<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              inputMode="numeric"
                              value={item.returnedQuantity}
                              onChange={(event) =>
                                setInventoryItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? {
                                          ...draft,
                                          returnedQuantity: event.target.value.replace(/\D/g, ""),
                                        }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-3">
                            <span>
                              Kondisi<span className="text-destructive"> *</span>
                            </span>
                            <Select
                              value={item.condition}
                              onValueChange={(value) =>
                                setInventoryItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? {
                                          ...draft,
                                          condition: value as InventoryDraft["condition"],
                                        }
                                      : draft,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="complete">Lengkap</SelectItem>
                                <SelectItem value="partial">Sebagian</SelectItem>
                                <SelectItem value="damaged">Rusak</SelectItem>
                                <SelectItem value="missing">Hilang</SelectItem>
                                <SelectItem value="not_applicable">Tidak berlaku</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="self-end text-destructive md:col-span-1"
                            aria-label={`Hapus inventaris ${index + 1}`}
                            onClick={() =>
                              setInventoryItems((current) =>
                                current.filter((draft) => draft.key !== item.key),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-12">
                            Catatan item
                            <Textarea
                              rows={3}
                              value={item.notes}
                              onChange={(event) =>
                                setInventoryItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, notes: event.target.value }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Kunci dan akses</p>
                          <p className="text-xs text-muted-foreground">
                            Termasuk kunci fisik, kartu akses, remote, atau smart-lock.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="info"
                          onClick={() => {
                            setAccessItems((current) => [...current, accessDraft(nextHandoverKey)]);
                            setNextHandoverKey((value) => value + 1);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Tambah akses
                        </Button>
                      </div>
                      {accessItems.map((item, index) => (
                        <div
                          key={item.key}
                          className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                        >
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-4">
                            <span>
                              Jenis akses<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              value={item.name}
                              placeholder="Contoh: Kunci kamar"
                              onChange={(event) =>
                                setAccessItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, name: event.target.value }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                            <span>
                              Seharusnya<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              inputMode="numeric"
                              value={item.expectedQuantity}
                              onChange={(event) =>
                                setAccessItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? {
                                          ...draft,
                                          expectedQuantity: event.target.value.replace(/\D/g, ""),
                                        }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                            <span>
                              Dikembalikan<span className="text-destructive"> *</span>
                            </span>
                            <Input
                              inputMode="numeric"
                              value={item.returnedQuantity}
                              onChange={(event) =>
                                setAccessItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? {
                                          ...draft,
                                          returnedQuantity: event.target.value.replace(/\D/g, ""),
                                        }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-3">
                            <span>
                              Status<span className="text-destructive"> *</span>
                            </span>
                            <Select
                              value={item.status}
                              onValueChange={(value) =>
                                setAccessItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, status: value as AccessDraft["status"] }
                                      : draft,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="returned">Dikembalikan</SelectItem>
                                <SelectItem value="partial">Sebagian</SelectItem>
                                <SelectItem value="damaged">Rusak</SelectItem>
                                <SelectItem value="missing">Hilang</SelectItem>
                                <SelectItem value="not_applicable">Tidak berlaku</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="self-end text-destructive md:col-span-1"
                            aria-label={`Hapus akses ${index + 1}`}
                            onClick={() =>
                              setAccessItems((current) =>
                                current.filter((draft) => draft.key !== item.key),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-12">
                            Catatan akses
                            <Textarea
                              rows={3}
                              value={item.notes}
                              onChange={(event) =>
                                setAccessItems((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, notes: event.target.value }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Pembacaan utilitas
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Catat meter listrik, air, atau utilitas lain bila tersedia.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="info"
                          onClick={() => {
                            setUtilityReadings((current) => [
                              ...current,
                              {
                                key: nextHandoverKey,
                                utilityType: "",
                                meterNumber: "",
                                checkoutReading: "",
                                unit: "",
                                outstandingUsageNotes: "",
                              },
                            ]);
                            setNextHandoverKey((value) => value + 1);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Tambah meter
                        </Button>
                      </div>
                      {utilityReadings.map((reading, index) => (
                        <div
                          key={reading.key}
                          className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                        >
                          {(
                            [
                              ["utilityType", "Jenis utilitas", "Contoh: Listrik"],
                              ["meterNumber", "Nomor meter", "Nomor meter"],
                              ["checkoutReading", "Angka akhir", "Contoh: 1234.5"],
                              ["unit", "Satuan", "kWh / m³"],
                            ] as const
                          ).map(([field, label, placeholder]) => (
                            <label
                              key={field}
                              className="grid gap-1 text-xs font-medium text-foreground md:col-span-3"
                            >
                              <span>
                                {label}
                                {field !== "meterNumber" ? (
                                  <span className="text-destructive"> *</span>
                                ) : null}
                              </span>
                              <Input
                                value={reading[field]}
                                placeholder={placeholder}
                                onChange={(event) =>
                                  setUtilityReadings((current) =>
                                    current.map((draft) =>
                                      draft.key === reading.key
                                        ? { ...draft, [field]: event.target.value }
                                        : draft,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                          <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-11">
                            Catatan pemakaian/tagihan tersisa
                            <Textarea
                              rows={3}
                              value={reading.outstandingUsageNotes}
                              onChange={(event) =>
                                setUtilityReadings((current) =>
                                  current.map((draft) =>
                                    draft.key === reading.key
                                      ? { ...draft, outstandingUsageNotes: event.target.value }
                                      : draft,
                                  ),
                                )
                              }
                            />
                          </label>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="self-end text-destructive md:col-span-1"
                            aria-label={`Hapus meter ${index + 1}`}
                            onClick={() =>
                              setUtilityReadings((current) =>
                                current.filter((draft) => draft.key !== reading.key),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Catatan serah-terima"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </fieldset>
                ) : null}
                {["inspection_required", "settlement_pending"].includes(command.state) ? (
                  <div className="grid gap-4">
                    <label className="grid max-w-xl gap-2 text-sm font-medium text-foreground">
                      <span>
                        Hasil kondisi kamar<span className="text-destructive"> *</span>
                      </span>
                      <Select
                        value={roomResult}
                        disabled={command.state === "settlement_pending"}
                        onValueChange={(value) => setRoomResult(value as typeof roomResult)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inspection_required">
                            Perlu inspeksi lanjutan
                          </SelectItem>
                          <SelectItem value="maintenance">Masuk maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    {command.state === "inspection_required" ? (
                      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                        <EvidenceFileUploadField
                          propertyId={propertyId}
                          label="Bukti hasil inspeksi kamar"
                          description="Unggah foto atau dokumen kondisi kamar bila tersedia."
                          values={inspectionEvidence}
                          onChange={setInspectionEvidence}
                          onBusyChange={setInspectionEvidenceBusy}
                        />
                        <Textarea
                          placeholder="Catatan inspeksi"
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {command.state === "settlement_pending" ? (
                  <div className="space-y-5 rounded-lg border border-border p-4">
                    <div>
                      <p className="font-semibold text-foreground">Penyelesaian keuangan akhir</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Sistem menghitung sewa terpakai, pembayaran terverifikasi,
                        {isLateCheckoutPolicy
                          ? " denda keterlambatan,"
                          : " kompensasi pemberitahuan,"}{" "}
                        deposit, dan kerusakan secara terpisah. Hitung ulang setiap kali rincian
                        diubah.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Potongan inspeksi</p>
                          <p className="text-xs text-muted-foreground">
                            Setiap potongan wajib memiliki alasan dan bukti.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="info"
                          onClick={() => {
                            setDamages((current) => [
                              ...current,
                              {
                                key: nextDamageKey,
                                amount: "",
                                reason: "",
                                evidence: [],
                                busy: false,
                              },
                            ]);
                            setNextDamageKey((value) => value + 1);
                            setSettlementQuote(null);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Tambah potongan
                        </Button>
                      </div>
                      {damages.map((item, index) => (
                        <div
                          key={item.key}
                          className="grid gap-4 rounded-md border border-border bg-muted/20 p-4 md:grid-cols-2"
                        >
                          <label className="grid w-full max-w-xs gap-2 text-sm font-medium text-foreground">
                            <span>
                              Nominal potongan<span className="text-destructive"> *</span>
                            </span>
                            <CurrencyInput
                              value={Number(item.amount || 0)}
                              formatOnChange
                              onClear={() => {
                                setDamages((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key ? { ...draft, amount: "0" } : draft,
                                  ),
                                );
                                setSettlementQuote(null);
                              }}
                              onValueChange={(amount) => {
                                setDamages((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key
                                      ? { ...draft, amount: String(amount) }
                                      : draft,
                                  ),
                                );
                                setSettlementQuote(null);
                              }}
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-foreground">
                            <span>
                              Alasan potongan<span className="text-destructive"> *</span>
                            </span>
                            <Textarea
                              rows={3}
                              className="min-h-24 w-full max-w-full resize-y [field-sizing:content]"
                              value={item.reason}
                              onChange={(event) => {
                                const reason = event.target.value;
                                setDamages((current) =>
                                  current.map((draft) =>
                                    draft.key === item.key ? { ...draft, reason } : draft,
                                  ),
                                );
                                setSettlementQuote(null);
                              }}
                            />
                          </label>
                          <EvidenceFileUploadField
                            className="md:col-span-2"
                            propertyId={command.propertyId}
                            label={`Bukti potongan ${index + 1}`}
                            description="Foto atau dokumen hasil inspeksi kamar."
                            values={item.evidence}
                            onChange={(evidence) => {
                              setDamages((current) =>
                                current.map((draft) =>
                                  draft.key === item.key ? { ...draft, evidence } : draft,
                                ),
                              );
                              setSettlementQuote(null);
                            }}
                            onBusyChange={(busy) =>
                              setDamages((current) => {
                                const target = current.find((draft) => draft.key === item.key);
                                if (!target || target.busy === busy) return current;
                                return current.map((draft) =>
                                  draft.key === item.key ? { ...draft, busy } : draft,
                                );
                              })
                            }
                            required
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            className="md:col-span-2 md:justify-self-start"
                            onClick={() => {
                              setDamages((current) =>
                                current.filter((draft) => draft.key !== item.key),
                              );
                              setSettlementQuote(null);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Hapus potongan
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-2">
                      <label className="grid max-w-md gap-2 text-sm font-medium text-foreground md:col-span-2">
                        Gunakan deposit untuk melunasi tunggakan sewa
                        <CurrencyInput
                          value={Number(depositOffsetAmount || 0)}
                          formatOnChange
                          onClear={() => {
                            setDepositOffsetAmount("0");
                            setSettlementQuote(null);
                          }}
                          onValueChange={(amount) => {
                            setDepositOffsetAmount(String(amount));
                            setSettlementQuote(null);
                          }}
                        />
                        <span className="text-xs font-normal leading-5 text-muted-foreground">
                          Isi hanya bila sebagian security deposit disetujui untuk mengurangi
                          tunggakan sewa. Deposit tidak berubah menjadi pendapatan dan tidak
                          digunakan otomatis.
                        </span>
                      </label>
                      {offsetAmount > 0 ? (
                        <>
                          <label className="grid gap-2 text-sm font-medium text-foreground">
                            <span>
                              Alasan penggunaan deposit<span className="text-destructive"> *</span>
                            </span>
                            <Textarea
                              rows={3}
                              value={depositOffsetReason}
                              onChange={(event) => {
                                setDepositOffsetReason(event.target.value);
                                setSettlementQuote(null);
                              }}
                            />
                          </label>
                          <EvidenceFileUploadField
                            className="md:col-span-2"
                            propertyId={command.propertyId}
                            label="Bukti persetujuan offset deposit"
                            description="Wajib. Deposit tidak pernah otomatis digunakan untuk menutup sewa."
                            values={depositOffsetEvidence}
                            onChange={(files) => {
                              setDepositOffsetEvidence(files);
                              setSettlementQuote(null);
                            }}
                            onBusyChange={setDepositOffsetEvidenceBusy}
                            required
                          />
                        </>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant="info"
                      disabled={pending || settlementDraftInvalid}
                      onClick={previewSettlement}
                    >
                      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Hitung rincian akhir
                    </Button>

                    {settlementQuote ? (
                      <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
                        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <p>
                            Pembayaran sewa terverifikasi
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.verifiedRentPaymentAmount)}
                            </strong>
                          </p>
                          <p>
                            Kredit invoice sebelumnya
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.existingInvoiceCreditAmount)}
                            </strong>
                          </p>
                          <p>
                            Sewa terpakai
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.earnedRentAmount)}
                            </strong>
                          </p>
                          <p>
                            {isLateCheckoutPolicy
                              ? "Denda keterlambatan check-out"
                              : "Kompensasi pemberitahuan singkat"}
                            <strong className="block text-foreground">
                              {rupiah.format(
                                isLateCheckoutPolicy
                                  ? settlementQuote.lateCheckoutPenaltyAmount
                                  : settlementQuote.approvedShortNoticeCharge,
                              )}
                            </strong>
                          </p>
                          <p>
                            Saldo deposit
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.depositLiabilityAmount)}
                            </strong>
                          </p>
                          <p>
                            Kerusakan terdokumentasi
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.documentedDamageAmount)}
                            </strong>
                          </p>
                          <p>
                            Kerusakan dipotong dari deposit
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.depositDeductionAmount)}
                            </strong>
                          </p>
                          <p>
                            Kerusakan di luar deposit
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.damageAmountDue)}
                            </strong>
                          </p>
                          <p>
                            Deposit untuk tunggakan sewa
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.depositRentOffsetAmount)}
                            </strong>
                          </p>
                          <p>
                            Deposit yang dapat dikembalikan
                            <strong className="block text-foreground">
                              {rupiah.format(settlementQuote.refundableDepositAmount)}
                            </strong>
                          </p>
                        </div>
                        <div className="grid gap-3 border-t border-primary/20 pt-4 sm:grid-cols-2">
                          <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-success">
                              Total hak pengembalian
                            </p>
                            <strong className="mt-1 block text-lg text-foreground">
                              {rupiah.format(settlementQuote.grossRefundAmount)}
                            </strong>
                          </div>
                          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                              Total kewajiban
                            </p>
                            <strong className="mt-1 block text-lg text-foreground">
                              {rupiah.format(settlementQuote.grossAmountDue)}
                            </strong>
                          </div>
                          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 sm:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                              Hasil bersih
                            </p>
                            <strong className="mt-1 block text-lg text-foreground">
                              {settlementQuote.amountDue > 0
                                ? `Penghuni perlu membayar ${rupiah.format(settlementQuote.amountDue)}`
                                : settlementQuote.recommendedRefundAmount > 0
                                  ? `Penghuni menerima ${rupiah.format(settlementQuote.recommendedRefundAmount)}`
                                  : "Tidak ada tagihan atau pengembalian dana"}
                            </strong>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Sisa kewajiban penghuni
                          <strong className="block text-foreground">
                            {rupiah.format(settlementQuote.amountDue)}
                          </strong>
                        </p>
                        <p className="border-t border-primary/20 pt-3 text-sm font-semibold text-primary">
                          Rekomendasi pengembalian dana:{" "}
                          {rupiah.format(settlementQuote.recommendedRefundAmount)}
                        </p>
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                          <span>
                            Pengembalian dana final yang diputuskan Admin
                            <span className="text-destructive"> *</span>
                          </span>
                          <CurrencyInput
                            value={Number(finalRefundAmount || 0)}
                            formatOnChange
                            onClear={() => setFinalRefundAmount("0")}
                            onValueChange={(amount) => setFinalRefundAmount(String(amount))}
                          />
                        </label>
                        {finalRefund !== settlementQuote.recommendedRefundAmount ? (
                          <div className="space-y-4">
                            <label className="grid gap-2 text-sm font-medium text-foreground">
                              <span>
                                Alasan penyesuaian pengembalian dana
                                <span className="text-destructive"> *</span>
                              </span>
                              <Textarea
                                value={refundAdjustmentReason}
                                onChange={(event) => setRefundAdjustmentReason(event.target.value)}
                              />
                            </label>
                            <EvidenceFileUploadField
                              propertyId={command.propertyId}
                              label="Bukti penyesuaian pengembalian dana"
                              description="Wajib saat keputusan Admin lebih rendah dari rekomendasi sistem."
                              values={refundAdjustmentEvidence}
                              onChange={setRefundAdjustmentEvidence}
                              onBusyChange={setRefundAdjustmentEvidenceBusy}
                              required
                            />
                          </div>
                        ) : null}
                        <Button
                          variant="success"
                          disabled={pending || settlementDraftInvalid || finalRefundInvalid}
                          onClick={() => setConfirmationIntent("settlement")}
                        >
                          {pending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Tetapkan penyelesaian akhir
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {command.state === "completed" ? (
                  <div className="space-y-5 rounded-lg border border-border p-4">
                    <div>
                      <p className="font-semibold text-foreground">Check-out selesai</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Keputusan final tersimpan dan tidak dihitung ulang dari data UI.
                      </p>
                    </div>
                    {command.finalSettlementId ? (
                      <div className="grid gap-3 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-3">
                        <p>
                          Rekomendasi pengembalian dana
                          <strong className="block text-foreground">
                            {rupiah.format(command.recommendedRefundAmount ?? 0)}
                          </strong>
                        </p>
                        <p>
                          Pengembalian dana final
                          <strong className="block text-foreground">
                            {rupiah.format(command.finalRefundAmount ?? 0)}
                          </strong>
                        </p>
                        <p>
                          Pengembalian dana sewa
                          <strong className="block text-foreground">
                            {rupiah.format(command.finalRentRefundAmount ?? 0)}
                          </strong>
                        </p>
                        <p>
                          Pengembalian deposit
                          <strong className="block text-foreground">
                            {rupiah.format(command.finalDepositRefundAmount ?? 0)}
                          </strong>
                        </p>
                        <p>
                          Penyesuaian Admin
                          <strong className="block text-foreground">
                            {rupiah.format(command.refundAdjustmentAmount ?? 0)}
                          </strong>
                        </p>
                        <p>
                          Sisa kewajiban
                          <strong className="block text-foreground">
                            {rupiah.format(command.amountDue ?? 0)}
                          </strong>
                        </p>
                      </div>
                    ) : null}
                    {(command.documents ?? []).length ? (
                      <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                        <div>
                          <p className="font-semibold text-foreground">Dokumen resmi check-out</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            PDF yang sudah diterbitkan bersifat tetap dan memakai template kuitansi
                            resmi.
                          </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(command.documents ?? []).map((document) => (
                            <Button
                              key={document.id}
                              variant="info"
                              disabled={downloadingDocumentId === document.id}
                              onClick={() => void downloadDocument(document)}
                            >
                              {downloadingDocumentId === document.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              {document.documentKind === "checkout_handover"
                                ? "Berita acara check-out"
                                : document.documentKind === "final_settlement"
                                  ? "Penyelesaian akhir"
                                  : "Kuitansi pengembalian dana"}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {command.exitRefundId && command.exitRefundStatus === "pending" ? (
                      <div
                        ref={refundSectionRef}
                        tabIndex={-1}
                        aria-label="Pencatatan pengembalian dana"
                        className="scroll-mt-24 space-y-4 rounded-md border border-success/30 bg-success/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <p className="font-semibold text-success">
                          Pengembalian dana menunggu pembayaran:{" "}
                          {rupiah.format(command.exitRefundAmount ?? 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Target pembayaran paling lambat{" "}
                          {formatIndonesianFullDate(command.exitRefundDueDate)}.
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-foreground">
                            <span>
                              Metode pengembalian dana<span className="text-destructive"> *</span>
                            </span>
                            <Select
                              value={refundMethod}
                              onValueChange={(value) =>
                                setRefundMethod(value as typeof refundMethod)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bank_transfer">Transfer bank</SelectItem>
                                <SelectItem value="cash">Tunai</SelectItem>
                                <SelectItem value="qris">QRIS</SelectItem>
                                <SelectItem value="ewallet">E-wallet</SelectItem>
                                <SelectItem value="other">Lainnya</SelectItem>
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-foreground">
                            <span>Referensi pembayaran</span>
                            <Input
                              value={refundReference}
                              onChange={(event) => setRefundReference(event.target.value)}
                            />
                          </label>
                        </div>
                        <EvidenceFileUploadField
                          propertyId={command.propertyId}
                          label="Bukti transfer pengembalian dana"
                          description="Wajib sebelum pengembalian dana dinyatakan selesai."
                          values={refundEvidence}
                          onChange={setRefundEvidence}
                          onBusyChange={setRefundEvidenceBusy}
                          required
                        />
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                          Catatan pembayaran
                          <Textarea
                            value={refundNotes}
                            onChange={(event) => setRefundNotes(event.target.value)}
                          />
                        </label>
                        <Button
                          disabled={pending || refundSettlementInvalid}
                          onClick={() => setConfirmationIntent("refund_settlement")}
                        >
                          Catat pengembalian telah dibayar
                        </Button>
                        <div className="border-t border-success/20 pt-4">
                          <label className="grid gap-2 text-sm font-medium text-foreground">
                            <span>Alasan penghuni melepaskan hak pengembalian dana</span>
                            <Textarea
                              value={refundWaiverReason}
                              onChange={(event) => setRefundWaiverReason(event.target.value)}
                            />
                          </label>
                          <Button
                            className="mt-3"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => setConfirmationIntent("refund_waiver")}
                          >
                            Catat hak pengembalian dilepaskan
                          </Button>
                        </div>
                      </div>
                    ) : command.exitRefundId ? (
                      <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                        <div>
                          <p className="font-semibold text-foreground">Riwayat pengembalian dana</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Informasi pembayaran dan bukti transfer tetap tersedia untuk
                            pemeriksaan.
                          </p>
                        </div>
                        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <dt className="text-muted-foreground">Status</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {refundStatusLabel(command.exitRefundStatus)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Nominal</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {rupiah.format(command.exitRefundAmount ?? 0)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Metode pembayaran</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {refundMethodLabel(command.exitRefundPaymentMethod)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Referensi pembayaran</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {command.exitRefundExternalReference || "Tidak dicatat"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Tanggal pencatatan</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {formatIndonesianFullDate(command.exitRefundSettledAt)}
                            </dd>
                          </div>
                          {command.exitRefundTransactionCode ? (
                            <div>
                              <dt className="text-muted-foreground">Kode transaksi</dt>
                              <dd className="mt-1 font-medium text-foreground">
                                {command.exitRefundTransactionCode}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {command.exitRefundSettlementReason ? (
                          <div className="rounded-md border border-border bg-background p-3 text-sm">
                            <p className="text-muted-foreground">
                              {command.exitRefundStatus === "waived"
                                ? "Alasan pelepasan hak"
                                : "Catatan pembayaran"}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-foreground">
                              {command.exitRefundSettlementReason}
                            </p>
                          </div>
                        ) : null}
                        {command.exitRefundStatus === "settled" ? (
                          <div className="space-y-2 border-t border-border pt-4">
                            <p className="text-sm font-semibold text-foreground">Bukti transfer</p>
                            {command.exitRefundEvidenceFiles?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {command.exitRefundEvidenceFiles.map((file) => (
                                  <Button
                                    key={file.id}
                                    type="button"
                                    variant="info"
                                    className="max-w-full"
                                    title={`Lihat ${file.originalFilename}`}
                                    onClick={() =>
                                      setRefundPreviewFile({
                                        id: file.id,
                                        original_filename: file.originalFilename,
                                        sanitized_filename: file.sanitizedFilename,
                                        mime_type: file.mimeType,
                                        file_size_bytes: file.fileSizeBytes,
                                      })
                                    }
                                  >
                                    <Eye className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="truncate">Lihat {file.originalFilename}</span>
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Bukti transfer belum tersedia pada riwayat ini.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {visibleStage > 1 ? (
                  <Button
                    type="button"
                    variant="success"
                    disabled={pending}
                    aria-label={`Kembali ke tahap ${visibleStage - 1}`}
                    onClick={() => setVisibleStage(previousStage(visibleStage))}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Kembali
                  </Button>
                ) : null}
                {isReviewingPreviousStage ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => setVisibleStage(currentStage)}
                  >
                    Lanjutkan tahap saat ini
                  </Button>
                ) : next ? (
                  <Button
                    disabled={
                      pending ||
                      (command.state === "notice_received" &&
                        !isLateCheckoutPolicy &&
                        approvalInvalid) ||
                      (command.state === "scheduled" && !canRecordHandover) ||
                      (command.state === "inspection_required" && inspectionInvalid)
                    }
                    onClick={() =>
                      setConfirmationIntent(
                        command.state === "notice_received"
                          ? "approval"
                          : command.state === "scheduled"
                            ? "handover"
                            : "inspection",
                      )
                    }
                  >
                    {pending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {next}
                  </Button>
                ) : null}
              </div>
              <Button type="button" variant="destructive" disabled={pending} onClick={onClose}>
                <XCircle className="mr-2 h-4 w-4" />
                Tutup
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Batalkan dan mulai ulang proses check-out?"
        description={
          command?.physicalCheckoutConfirmedAt
            ? "Seluruh isian proses ini akan dikosongkan. Penyewaan, hunian, kamar, akses, dan parkir akan dipulihkan agar Admin dapat memulai kembali dari tahap pertama. Riwayat pembatalan tetap tersimpan."
            : "Seluruh isian proses ini akan dikosongkan dan Admin dapat memulai kembali dari tahap pertama. Penyewaan dan kamar tetap aktif; riwayat pembatalan tetap tersimpan."
        }
        confirmLabel="Batalkan & mulai ulang"
        cancelLabel="Kembali"
        destructive
        pending={pending}
        reason={{
          label: "Alasan pembatalan",
          placeholder: "Contoh: Penghuni memutuskan tetap melanjutkan masa sewa.",
          helperText: "Wajib diisi minimal 3 karakter agar perubahan dapat ditelusuri.",
          minLength: 3,
        }}
        onConfirm={async (reason) => {
          if (reason) await cancel(reason);
        }}
      />
      {confirmationIntent ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmationIntent(null);
          }}
          title={confirmationCopy[confirmationIntent].title}
          description={confirmationCopy[confirmationIntent].description}
          confirmLabel={confirmationCopy[confirmationIntent].confirmLabel}
          cancelLabel="Periksa kembali"
          destructive={confirmationCopy[confirmationIntent].destructive}
          pending={pending}
          onConfirm={executeConfirmedAction}
        />
      ) : null}
      <ConfirmDialog
        open={completionDialogOpen}
        onOpenChange={(open) => {
          if (!open) void finishCheckoutView();
        }}
        title="Check-out berhasil diselesaikan"
        description="Penyewaan ini resmi nonaktif. Status penghuni juga dinonaktifkan bila tidak ada penyewaan aktif lain. Status kamar dan penyelesaian keuangan telah mengikuti hasil akhir yang ditetapkan."
        confirmLabel="Selesai"
        cancelLabel="Tutup"
        onConfirm={finishCheckoutView}
      >
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="font-semibold text-foreground">Dokumen hasil check-out</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Unduh berita acara dan rincian penyelesaian untuk arsip operasional.
          </p>
          {command?.documents?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {command.documents.map((document) => (
                <Button
                  key={document.id}
                  type="button"
                  variant="info"
                  disabled={downloadingDocumentId === document.id}
                  onClick={() => void downloadDocument(document)}
                >
                  {downloadingDocumentId === document.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {checkoutDocumentLabel(document.documentKind)}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Dokumen dapat diunduh kembali dari detail penghuni.
            </p>
          )}
        </div>
      </ConfirmDialog>
      <FilePreviewModal file={refundPreviewFile} onClose={() => setRefundPreviewFile(null)} />
    </Card>
  );
}
