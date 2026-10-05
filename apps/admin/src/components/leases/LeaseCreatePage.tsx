/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R4 V4 */
/* Hallmark · macrostructure: progressive-disclosure lease workspace · theme: existing KOSTATION system · contrast/mobile/responsive: pass */
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileCheck2,
  Home,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/state";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { Input } from "@/components/ui/input";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { useM6LeaseRoomChoices } from "@/hooks/useAdminUxLeases";
import { useOwnerAssetOptions } from "@/hooks/usePropertyOwners";
import {
  useBookingLeadCompletionContext,
  useBookingLeadCompletionQuote,
} from "@/hooks/useBookingLeadCompletion";
import { completedBookingLeadResidentId } from "@/lib/admin-booking-lead-completion";
import { useResidentOnboarding } from "@/hooks/useResidentOnboarding";
import { useAdminPaymentVerificationPolicy } from "@/hooks/useAdminBilling";
import { useFileDelete, useFileUpload } from "@/hooks/useFileUpload";
import type { LeaseRoomOption, LeaseRoomUnavailableReason } from "@/lib/admin-ux-lease-types";
import type { OnboardingPayload, OnboardingResponse } from "@/lib/admin-onboarding";
import {
  downloadAdminContractPaidDocument,
  downloadAdminReceiptDocument,
} from "@/lib/admin-billing";
import {
  calculateLeaseEndDate,
  formatDateWithDashes,
  formatIdrInput,
  formatIndonesianDate,
  isDigitsOnly,
  normalizeDigits,
  validateNewLeaseDraft,
  type NewLeaseDraftErrors,
} from "@/lib/lease-onboarding-form";
import {
  onboardingErrorFieldErrors,
  onboardingErrorNotice,
  type OnboardingStageOneField,
} from "@/lib/onboarding-error-notice";
import { revealFirstValidationError } from "@/lib/validation-focus";
import { useProperty } from "@/lib/property";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp-lead";
import { normalizeRoomSearch } from "./transfer-shared";
import type { FileResponse } from "@granada-kost/domain";
import { ApiError } from "@granada-kost/api-client";
import { archiveSuccessorLink, type ArchiveSuccessorSource } from "@/lib/lease-archive-successor";
import { adminErrorNotice } from "@/lib/error-normalizer";
import { toast } from "sonner";

type Props = {
  onCreated: (leaseId: string) => void | Promise<void>;
  bookingLeadId?: string;
  archiveSuccessor?: ArchiveSuccessorSource;
};
type Gender = "male" | "female";
type PaymentMethod = "cash" | "bank_transfer";
type PaymentChoice = "dp" | "full";
type PaymentEntryPurpose = "rent" | "booking_fee";
type PricingSource = "standard" | "negotiated";
type CommercialMode = "rent" | "owner_sponsored";
type ManagementFeeMode = "charged" | "waived";
type ManagementFeePayer = "resident" | "owner" | "other";

type StagedPaymentEntry = {
  id: string;
  purpose: PaymentEntryPurpose;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string;
  evidence: FileResponse[];
  verified: boolean;
};

type PaymentDraftErrors = {
  purpose: string;
  amount: string;
  method: string;
  paidAt: string;
  evidence: string;
};

type StagedPaymentController = {
  purpose: PaymentEntryPurpose;
  entries: StagedPaymentEntry[];
  editingPaymentId: string | null;
  expandedPaymentId: string | null;
  draftAttempted: boolean;
  draftErrors: PaymentDraftErrors;
  onPurposeChange: (purpose: PaymentEntryPurpose) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEdit: (entry: StagedPaymentEntry) => void;
  onDelete: (entry: StagedPaymentEntry) => void;
  onToggle: (id: string) => void;
  rentAmount: number;
  bookingFeeAmount: number;
  recordedRentFullyPaid: boolean;
  contractFullyPaid: boolean;
  hasUnsavedDraft: boolean;
  hideDraft: boolean;
  rentPurposeDisabled: boolean;
  recentlyAddedPaymentId: string | null;
};

type ResidentDraft = {
  fullName: string;
  phone: string;
  email: string;
  gender: Gender | "";
  placeOfBirth: string;
  dateOfBirth: string;
  address: string;
  university: string;
  faculty: string;
  major: string;
  cohort: string;
  parentName: string;
  parentPhone: string;
  emergencyPhone: string;
  instagram: string;
  ktpNumber: string;
  ktpFileId: string;
  notes: string;
};

const EMPTY_RESIDENT: ResidentDraft = {
  fullName: "",
  phone: "",
  email: "",
  gender: "",
  placeOfBirth: "",
  dateOfBirth: "",
  address: "",
  university: "",
  faculty: "",
  major: "",
  cohort: "",
  parentName: "",
  parentPhone: "",
  emergencyPhone: "",
  instagram: "",
  ktpNumber: "",
  ktpFileId: "",
  notes: "",
};

const KTP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MINIMUM_BOOKING_FEE = 1_000_000;

async function compressResidentKtpImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 2 * 1024 * 1024) return file;
  if (typeof createImageBitmap !== "function") return file;

  const bitmap = await createImageBitmap(file);
  try {
    // KTP text must stay legible after the optional client-side compression.
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!compressed || compressed.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-ktp";
    return new File([compressed], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

function calculateLeaseAmounts(
  room: LeaseRoomOption | undefined,
  termMonths: number,
  pricingSource: PricingSource = "standard",
  agreedMonthlyPrice = 0,
) {
  if (
    !room ||
    !Number.isInteger(termMonths) ||
    termMonths < 1 ||
    termMonths > 120 ||
    (pricingSource === "standard" && termMonths < 3)
  )
    return {
      contractRent: 0,
      minimumDp: 0,
      securityDeposit: 0,
      monthlyRate: 0,
      referenceMonthlyRate: 0,
      tierLabel: "",
    };
  const referenceMonthlyRate =
    termMonths <= 5
      ? room.kostType.shortStayMonthlyPrice
      : termMonths <= 11
        ? room.kostType.mediumStayMonthlyPrice
        : room.kostType.longStayMonthlyPrice;
  const monthlyRate = pricingSource === "negotiated" ? agreedMonthlyPrice : referenceMonthlyRate;
  const contractRent = monthlyRate * termMonths;
  return {
    contractRent,
    minimumDp: Math.ceil(contractRent * 0.25),
    securityDeposit: monthlyRate * room.kostType.securityDepositMonths,
    monthlyRate,
    referenceMonthlyRate,
    tierLabel:
      termMonths <= 2
        ? "1–2 bulan (khusus)"
        : termMonths <= 5
          ? "3–5 bulan"
          : termMonths <= 11
            ? "6–11 bulan"
            : "12+ bulan",
  };
}

const UNAVAILABLE_ROOM_LABELS: Record<LeaseRoomUnavailableReason, string> = {
  reserved: "Sudah dipesan",
  awaiting_check_in: "Menunggu check-in",
  occupied: "Terisi",
  maintenance: "Dalam perawatan",
  inactive: "Tidak aktif",
  requires_review: "Perlu peninjauan",
  inspection_required: "Perlu pemeriksaan",
  active_lease: "Penyewaan aktif",
  onboarding: "Dalam proses penyewaan",
  booking_hold: "Ditahan untuk minat booking",
};

function roomIsSelectable(room: LeaseRoomOption) {
  return room.roomStatus === "vacant" && room.unavailableReason === null;
}

type RoomListFilter = "all" | "available" | "inspection_required" | "maintenance";

function roomListStatus(room: LeaseRoomOption): Exclude<RoomListFilter, "all"> | null {
  if (roomIsSelectable(room)) return "available";
  if (room.roomStatus === "inspection_required" && room.unavailableReason === "inspection_required")
    return "inspection_required";
  if (room.roomStatus === "maintenance" && room.unavailableReason === "maintenance")
    return "maintenance";
  return null;
}

function roomUnavailableLabel(room: LeaseRoomOption) {
  return room.unavailableReason
    ? UNAVAILABLE_ROOM_LABELS[room.unavailableReason]
    : "Tidak tersedia";
}

function matchingRooms(
  rooms: LeaseRoomOption[],
  category: "rukost" | "apartkost" | "",
  gender: Gender | "",
  search: string,
) {
  const query = normalizeRoomSearch(search);
  const priority = { available: 0, inspection_required: 1, maintenance: 2 };
  return rooms
    .filter(
      (room) =>
        roomListStatus(room) !== null &&
        (!category || room.kostType.category === category) &&
        (!gender || room.genderPolicy === gender || room.genderPolicy === "mixed") &&
        (!query ||
          [room.number, room.buildingName, room.buildingCode, room.kostType.name, room.plotNumber]
            .filter((value): value is string => Boolean(value))
            .some((value) => normalizeRoomSearch(value).includes(query))),
    )
    .sort((left, right) => priority[roomListStatus(left)!] - priority[roomListStatus(right)!]);
}

function currency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function paymentPurposeLabel(purpose: PaymentEntryPurpose) {
  if (purpose === "booking_fee") return "Booking Fee";
  return "Pembayaran Sewa";
}

function stagedRentChoiceLabel(
  entries: StagedPaymentEntry[],
  editingPaymentId: string | null,
): "Uang Muka" | "Angsuran" {
  const editingIndex = editingPaymentId
    ? entries.findIndex((entry) => entry.id === editingPaymentId)
    : -1;
  const entriesBeforeDraft = editingIndex >= 0 ? entries.slice(0, editingIndex) : entries;
  return entriesBeforeDraft.some(
    (entry) => entry.purpose === "rent" || entry.purpose === "booking_fee",
  )
    ? "Angsuran"
    : "Uang Muka";
}

function paymentMethodLabel(method: PaymentMethod) {
  return method === "cash" ? "Tunai" : "Transfer Bank";
}

function receiptPurposeLabel(
  purpose: OnboardingResponse["initialPayment"]["receipts"][number]["purpose"],
  rentPaymentSequence?: number | null,
) {
  if (purpose === "booking_fee") return "Booking Fee";
  if (purpose === "down_payment") return "DP / uang muka";
  if (purpose === "installment")
    return `angsuran sewa${rentPaymentSequence ? ` ke-${rentPaymentSequence}` : ""}`;
  if (purpose === "full_settlement") return "pelunasan sewa";
  return "security deposit";
}

export function LeaseCreatePage({ onCreated, bookingLeadId, archiveSuccessor }: Props) {
  const { currentPropertyId } = useProperty();
  const navigate = useNavigate();
  const pageTitle = archiveSuccessor
    ? "Penyewaan Pengganti dari Arsip"
    : bookingLeadId
      ? "Tambah Penyewaan dari Minat Booking"
      : "Tambah Penyewaan";
  const [step, setStep] = useState<1 | 2>(1);
  const [resident, setResident] = useState<ResidentDraft>(() =>
    archiveSuccessor
      ? {
          ...EMPTY_RESIDENT,
          fullName: archiveSuccessor.residentName,
          phone: archiveSuccessor.phone,
          gender: archiveSuccessor.gender,
        }
      : EMPTY_RESIDENT,
  );
  const [archiveReplacementReason, setArchiveReplacementReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [termMonths, setTermMonths] = useState(3);
  const [pricingSource, setPricingSource] = useState<PricingSource>("standard");
  const [agreedMonthlyPrice, setAgreedMonthlyPrice] = useState(0);
  const [pricingAgreementReason, setPricingAgreementReason] = useState("");
  const [pricingVarianceAcknowledged, setPricingVarianceAcknowledged] = useState(false);
  const [pricingResetOpen, setPricingResetOpen] = useState(false);
  const [commercialMode, setCommercialMode] = useState<CommercialMode>("rent");
  const [managementFeeMode, setManagementFeeMode] = useState<ManagementFeeMode>("charged");
  const [managementFeePayer, setManagementFeePayer] = useState<ManagementFeePayer>("owner");
  const [managementFeePayerName, setManagementFeePayerName] = useState("");
  const [ownerSponsorshipReason, setOwnerSponsorshipReason] = useState("");
  const [category, setCategory] = useState<"rukost" | "apartkost" | "">("");
  const [roomSearch, setRoomSearch] = useState("");
  const [roomId, setRoomId] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("dp");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [paymentPaidAt, setPaymentPaidAt] = useState("");
  const [bookingFeePaymentChoiceSelected, setBookingFeePaymentChoiceSelected] = useState(
    () => !bookingLeadId,
  );
  const [bookingFeePaymentMethodSelected, setBookingFeePaymentMethodSelected] = useState(
    () => !bookingLeadId,
  );
  const [paidRent, setPaidRent] = useState(0);
  const [bookingFee, setBookingFee] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState<FileResponse[]>([]);
  const [paymentEvidenceBusy, setPaymentEvidenceBusy] = useState(false);
  const [paymentPurpose, setPaymentPurpose] = useState<PaymentEntryPurpose>("rent");
  const [paymentEntries, setPaymentEntries] = useState<StagedPaymentEntry[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [recentlyAddedPaymentId, setRecentlyAddedPaymentId] = useState<string | null>(null);
  const [paymentDraftAttempted, setPaymentDraftAttempted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [receiptDownloadError, setReceiptDownloadError] = useState<string | null>(null);
  const [ktpDocument, setKtpDocument] = useState<FileResponse | null>(null);
  const [ktpDocumentError, setKtpDocumentError] = useState<string | null>(null);
  const [attemptedStepOne, setAttemptedStepOne] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [serverStageOneErrors, setServerStageOneErrors] = useState<
    Partial<Record<OnboardingStageOneField, string>>
  >({});
  const propertyScopeRef = useRef(currentPropertyId);
  const lastPropertyIdRef = useRef(currentPropertyId);
  const lastBookingLeadIdRef = useRef(bookingLeadId);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  propertyScopeRef.current = currentPropertyId;
  const deferredRoomSearch = useDeferredValue(roomSearch);
  const rooms = useM6LeaseRoomChoices(deferredRoomSearch, startDate || undefined);
  const ownerAssets = useOwnerAssetOptions();
  const bookingLeadContext = useBookingLeadCompletionContext(bookingLeadId);
  const bookingLeadQuote = useBookingLeadCompletionQuote(bookingLeadId, startDate, termMonths);
  const onboarding = useResidentOnboarding(setTemporaryPassword);
  const submissionFrozen = Boolean(
    archiveSuccessor && (onboarding.isPending || onboarding.submissionUncertain),
  );
  const verificationPolicy = useAdminPaymentVerificationPolicy(
    bookingLeadId ? null : currentPropertyId,
  );
  const historicalEntryMode =
    !bookingLeadId && verificationPolicy.data?.automaticVerificationActive === true;
  const ktpUpload = useFileUpload({ silent: true });
  const ktpDelete = useFileDelete({ silent: true });
  const materializedResidentId = bookingLeadId
    ? completedBookingLeadResidentId(bookingLeadContext.error)
    : null;

  const scrollToPaymentSection = () => {
    requestAnimationFrame(() => {
      const section = paymentSectionRef.current;
      if (!section) return;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    if (!recentlyAddedPaymentId) return;
    const timeout = window.setTimeout(() => setRecentlyAddedPaymentId(null), 1_000);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedPaymentId]);

  useEffect(() => {
    const context = bookingLeadContext.data;
    if (!context || !bookingLeadId) return;
    setResident((current) => ({
      ...current,
      fullName: context.lead.visitorName,
      phone: context.lead.visitorPhone,
      email: context.lead.visitorEmail ?? "",
      university: context.lead.visitorUniversity ?? "",
      gender: context.lead.gender,
    }));
    setRoomId(context.room.id);
    setCategory(context.room.category);
    setStartDate(context.paymentCommitment.startDate);
    setTermMonths(context.paymentCommitment.termMonths);
    setPricingSource(context.paymentCommitment.pricingSource);
    setAgreedMonthlyPrice(context.paymentCommitment.agreedMonthlyPrice);
    setPricingAgreementReason(context.paymentCommitment.pricingAgreementReason ?? "");
    setPricingVarianceAcknowledged(true);
    setPaymentMethod(context.paymentCommitment.paymentMethod);
    setPaymentNote(context.paymentCommitment.paymentNote ?? "");
    setBookingFee(
      context.paymentCommitment.paymentType === "booking_fee"
        ? context.paymentCommitment.rentCreditAmount
        : 0,
    );
    setPaidRent(
      context.paymentCommitment.paymentType === "booking_fee"
        ? 0
        : context.paymentCommitment.rentCreditAmount,
    );
    setPaymentChoice(context.paymentCommitment.paymentType === "full_settlement" ? "full" : "dp");
    setBookingFeePaymentChoiceSelected(context.paymentCommitment.paymentType !== "booking_fee");
    setBookingFeePaymentMethodSelected(context.paymentCommitment.paymentType !== "booking_fee");
  }, [bookingLeadContext.data, bookingLeadId]);

  useEffect(() => {
    if (
      lastPropertyIdRef.current === currentPropertyId &&
      lastBookingLeadIdRef.current === bookingLeadId
    )
      return;
    lastPropertyIdRef.current = currentPropertyId;
    lastBookingLeadIdRef.current = bookingLeadId;
    setStep(1);
    setResident(EMPTY_RESIDENT);
    setKtpDocument(null);
    setCategory("");
    setRoomSearch("");
    setRoomId("");
    setPricingSource("standard");
    setAgreedMonthlyPrice(0);
    setPricingAgreementReason("");
    setPricingVarianceAcknowledged(false);
    setCommercialMode("rent");
    setManagementFeePayer("owner");
    setManagementFeePayerName("");
    setOwnerSponsorshipReason("");
    setPaidRent(0);
    setBookingFee(0);
    setPaymentNote("");
    setPaymentPaidAt("");
    setPaymentEvidence([]);
    setPaymentEvidenceBusy(false);
    setPaymentPurpose("rent");
    setPaymentEntries([]);
    setEditingPaymentId(null);
    setExpandedPaymentId(null);
    setRecentlyAddedPaymentId(null);
    setPaymentDraftAttempted(false);
    setKtpDocumentError(null);
    setServerStageOneErrors({});
    setAttemptedStepOne(false);
    setAttemptedSubmit(false);
    setConfirmed(false);
    setBookingFeePaymentChoiceSelected(!bookingLeadId);
    setBookingFeePaymentMethodSelected(!bookingLeadId);
  }, [bookingLeadId, currentPropertyId]);

  const bookingRoom = bookingLeadQuote.data?.room ?? bookingLeadContext.data?.room;
  const committedCommercial = bookingLeadContext.data?.paymentCommitment;
  // A paid booking owns an immutable commercial snapshot. Prefer it over a live
  // room quote so later category price changes cannot rewrite the agreement.
  const bookingQuotedMonthlyRate =
    committedCommercial?.agreedMonthlyPrice ??
    (bookingLeadQuote.data && bookingLeadQuote.data.termMonths === termMonths
      ? bookingLeadQuote.data.contractRentAmount / termMonths
      : undefined);
  const heldRoom: LeaseRoomOption | undefined = bookingRoom
    ? ({
        id: bookingRoom.id,
        number: bookingRoom.number,
        genderPolicy: bookingRoom.genderPolicy as LeaseRoomOption["genderPolicy"],
        roomStatus: "vacant",
        plotNumber: null,
        unavailableReason: null,
        kostType: {
          id: bookingRoom.kostTypeId,
          name: bookingRoom.category === "rukost" ? "Rumah Kost" : "Apart Kost",
          category: bookingRoom.category,
          monthlyPrice: bookingRoom.monthlyPrice,
          yearlyPrice: bookingRoom.yearlyPrice,
          shortStayMonthlyPrice: bookingQuotedMonthlyRate ?? bookingRoom.monthlyPrice,
          mediumStayMonthlyPrice: bookingQuotedMonthlyRate ?? bookingRoom.monthlyPrice,
          longStayMonthlyPrice: bookingQuotedMonthlyRate ?? bookingRoom.yearlyPrice / 12,
          commercialEffectiveDate: startDate,
          securityDepositMonths: bookingRoom.securityDepositMonths,
          depositAmount: 0,
          managementFeeAmount: 0,
        },
      } satisfies LeaseRoomOption)
    : undefined;
  const leadPaymentType = bookingLeadContext.data?.paymentCommitment.paymentType;
  const bookingFeeLocked = Boolean(bookingLeadId && leadPaymentType === "booking_fee");
  const initialPaymentLocked = Boolean(
    bookingLeadId && leadPaymentType && leadPaymentType !== "booking_fee",
  );
  const bookingCommercialLocked = Boolean(bookingLeadId && committedCommercial);
  const historicalPaymentDateRequired =
    commercialMode !== "owner_sponsored" && historicalEntryMode && !initialPaymentLocked;
  const listedRoom = rooms.data?.items.find((room) => room.id === roomId);
  const selectedRoom =
    bookingLeadId && heldRoom?.id === roomId
      ? { ...heldRoom, plotNumber: listedRoom?.plotNumber ?? null }
      : listedRoom;
  const selectedRoomIsSelectable = Boolean(
    selectedRoom && (bookingLeadId || roomIsSelectable(selectedRoom)),
  );
  const commercialPricingPending = Boolean(startDate && rooms.isPlaceholderData);
  const fallbackAmounts = calculateLeaseAmounts(
    selectedRoom,
    termMonths,
    pricingSource,
    agreedMonthlyPrice,
  );
  const rentAmounts = committedCommercial
    ? {
        contractRent: committedCommercial.agreedMonthlyPrice * committedCommercial.termMonths,
        minimumDp: Math.ceil(
          committedCommercial.agreedMonthlyPrice * committedCommercial.termMonths * 0.25,
        ),
        securityDeposit:
          committedCommercial.agreedMonthlyPrice *
          (selectedRoom?.kostType.securityDepositMonths ?? 1),
        monthlyRate: committedCommercial.agreedMonthlyPrice,
        referenceMonthlyRate: committedCommercial.referenceMonthlyPrice,
        tierLabel:
          committedCommercial.pricingTier === "short_stay"
            ? committedCommercial.termMonths <= 2
              ? "1–2 bulan (khusus)"
              : "3–5 bulan"
            : committedCommercial.pricingTier === "medium_stay"
              ? "6–11 bulan"
              : "12+ bulan",
      }
    : bookingLeadQuote.data && selectedRoom?.id === bookingLeadQuote.data.room.id
      ? {
          contractRent: bookingLeadQuote.data.contractRentAmount,
          minimumDp: bookingLeadQuote.data.suggestedDpAmount,
          securityDeposit:
            (bookingQuotedMonthlyRate ?? fallbackAmounts.monthlyRate) *
            selectedRoom.kostType.securityDepositMonths,
          monthlyRate: bookingQuotedMonthlyRate ?? fallbackAmounts.monthlyRate,
          referenceMonthlyRate: fallbackAmounts.referenceMonthlyRate,
          tierLabel: fallbackAmounts.tierLabel,
        }
      : fallbackAmounts;
  const amounts =
    commercialMode === "owner_sponsored"
      ? {
          ...rentAmounts,
          contractRent: 0,
          minimumDp: 0,
          securityDeposit:
            rentAmounts.referenceMonthlyRate * (selectedRoom?.kostType.securityDepositMonths ?? 1),
          monthlyRate: 0,
        }
      : rentAmounts;
  const ownerAsset = selectedRoom
    ? selectedRoom.kostType.category === "rukost"
      ? ownerAssets.data?.rumahKostBuildings.find((asset) => asset.id === selectedRoom.buildingId)
      : ownerAssets.data?.apartKostRooms.find((asset) => asset.id === selectedRoom.id)
    : undefined;
  const sponsoringOwner = ownerAsset?.currentOwner ?? null;
  const projectedManagementFee =
    commercialMode === "owner_sponsored" && managementFeeMode === "charged"
      ? (selectedRoom?.kostType.managementFeeAmount ?? 0) * termMonths
      : 0;
  const pricingVariancePercent =
    amounts.referenceMonthlyRate > 0
      ? ((amounts.monthlyRate - amounts.referenceMonthlyRate) / amounts.referenceMonthlyRate) * 100
      : 0;
  const materialPricingVariance = Math.abs(pricingVariancePercent) >= 15;
  const agreedMonthlyPriceError =
    commercialMode === "rent" &&
    pricingSource === "negotiated" &&
    (!Number.isSafeInteger(agreedMonthlyPrice) || agreedMonthlyPrice <= 0)
      ? "Tarif bulanan kesepakatan wajib lebih dari Rp0."
      : "";
  const pricingAgreementReasonError =
    commercialMode === "rent" &&
    pricingSource === "negotiated" &&
    pricingAgreementReason.trim().length < 3
      ? "Catatan kesepakatan wajib diisi minimal 3 karakter."
      : "";
  const standardShortTermError =
    commercialMode === "rent" && pricingSource === "standard" && termMonths < 3
      ? "Durasi 1–2 bulan hanya tersedia melalui kesepakatan khusus."
      : "";
  const pricingVarianceError =
    commercialMode === "rent" &&
    pricingSource === "negotiated" &&
    materialPricingVariance &&
    !pricingVarianceAcknowledged
      ? "Konfirmasi selisih tarif 15% atau lebih sebelum menyimpan."
      : "";
  const stagedPaymentMode = !bookingLeadId;
  const stagedEntriesOutsideEdit = paymentEntries.filter((entry) => entry.id !== editingPaymentId);
  const stagedRentAmount = paymentEntries.reduce(
    (total, entry) => total + (entry.purpose === "rent" ? entry.amount : 0),
    0,
  );
  const stagedBookingFeeAmount = paymentEntries.reduce(
    (total, entry) => total + (entry.purpose === "booking_fee" ? entry.amount : 0),
    0,
  );
  const otherRentAmount = stagedEntriesOutsideEdit.reduce(
    (total, entry) => total + (entry.purpose === "rent" ? entry.amount : 0),
    0,
  );
  const otherBookingFeeAmount = stagedEntriesOutsideEdit.reduce(
    (total, entry) => total + (entry.purpose === "booking_fee" ? entry.amount : 0),
    0,
  );
  const draftAmount = paymentPurpose === "rent" ? paidRent : bookingFee;
  const prospectiveRentCredit = otherRentAmount + otherBookingFeeAmount + draftAmount;
  const summaryRentAmount = stagedPaymentMode ? stagedRentAmount : paidRent;
  const summaryBookingFeeAmount = stagedPaymentMode ? stagedBookingFeeAmount : bookingFee;
  const bookingFeeExceedsRent =
    Boolean(selectedRoom) &&
    (stagedPaymentMode
      ? paymentPurpose === "booking_fee" && prospectiveRentCredit > amounts.contractRent
      : bookingFee > amounts.contractRent);
  const totalRentCredit = summaryBookingFeeAmount + summaryRentAmount;
  const rentCreditExceedsContract =
    Boolean(selectedRoom) &&
    (stagedPaymentMode ? prospectiveRentCredit : totalRentCredit) > amounts.contractRent;
  const maximumRentPayment = Math.max(
    0,
    stagedPaymentMode
      ? amounts.contractRent - otherBookingFeeAmount - otherRentAmount
      : amounts.contractRent - bookingFee,
  );
  const bookingFeeBelowMinimum =
    (stagedPaymentMode ? paymentPurpose === "booking_fee" : true) &&
    bookingFee > 0 &&
    bookingFee < MINIMUM_BOOKING_FEE;
  const paymentChoiceSelected = !bookingFeeLocked || bookingFeePaymentChoiceSelected;
  const paymentMethodSelected = !bookingFeeLocked || bookingFeePaymentMethodSelected;
  const creditedRentAmount = Math.min(amounts.contractRent, totalRentCredit);
  const transferEvidenceRequired =
    paymentMethod === "bank_transfer" && !initialPaymentLocked && !historicalEntryMode;
  // The 25% figure remains a recommendation, while the activation policy now
  // requires at least one full month of rent credit before commitment.
  const requiredInitialRent = stagedPaymentMode
    ? amounts.monthlyRate
    : paymentChoice === "full"
      ? amounts.contractRent
      : amounts.monthlyRate;
  const stagedRentPayments = paymentEntries.filter(
    (entry) => entry.purpose === "rent" || entry.purpose === "booking_fee",
  );
  const stagedRentVerified =
    stagedRentPayments.length > 0 && stagedRentPayments.every((entry) => entry.verified);
  const recordedRentFullyPaid =
    amounts.contractRent > 0 && totalRentCredit === amounts.contractRent;
  const contractFullyPaid = recordedRentFullyPaid && stagedRentVerified;
  const hideStagedPaymentDraft =
    stagedPaymentMode && contractFullyPaid && editingPaymentId === null;
  const rentPurposeDisabled = recordedRentFullyPaid && editingPaymentId === null;
  const hasUnsavedPaymentDraft =
    draftAmount > 0 ||
    paymentPaidAt.length > 0 ||
    paymentNote.trim().length > 0 ||
    paymentEvidence.length > 0 ||
    editingPaymentId !== null;
  const editingPaymentIndex = editingPaymentId
    ? paymentEntries.findIndex((entry) => entry.id === editingPaymentId)
    : paymentEntries.length;
  const previousPaymentDate =
    editingPaymentIndex > 0 ? paymentEntries[editingPaymentIndex - 1]?.paidAt : undefined;
  const nextPaymentDate =
    editingPaymentIndex >= 0 && editingPaymentIndex < paymentEntries.length - 1
      ? paymentEntries[editingPaymentIndex + 1]?.paidAt
      : undefined;
  const duplicatePurpose = stagedEntriesOutsideEdit.some(
    (entry) => entry.purpose === paymentPurpose,
  );
  const editingExistingBookingFee = paymentEntries.some(
    (entry) => entry.id === editingPaymentId && entry.purpose === "booking_fee",
  );
  const paymentDraftErrors: PaymentDraftErrors = {
    purpose:
      paymentPurpose === "booking_fee" &&
      !editingExistingBookingFee &&
      stagedEntriesOutsideEdit.some((entry) => entry.purpose === "rent")
        ? "Booking fee harus dicatat sebelum pembayaran sewa."
        : paymentPurpose === "booking_fee" && duplicatePurpose
          ? `${paymentPurposeLabel(paymentPurpose)} hanya boleh dicatat satu kali.`
          : "",
    amount: commercialPricingPending
      ? "Tunggu sampai harga yang berlaku pada tanggal mulai sewa selesai dimuat."
      : !Number.isSafeInteger(draftAmount) || draftAmount <= 0
        ? "Nominal pembayaran wajib lebih dari Rp0."
        : bookingFeeBelowMinimum
          ? `Booking fee minimal ${currency(MINIMUM_BOOKING_FEE)}.`
          : rentCreditExceedsContract
            ? `Nominal melebihi sisa sewa. Maksimal yang dapat dicatat ${currency(maximumRentPayment)}.`
            : "",
    method: paymentMethodSelected ? "" : "Pilih metode pembayaran terlebih dahulu.",
    paidAt: !paymentPaidAt
      ? "Tanggal pembayaran wajib diisi."
      : previousPaymentDate && paymentPaidAt < previousPaymentDate
        ? "Tanggal tidak boleh lebih awal dari pembayaran tahap sebelumnya."
        : nextPaymentDate && paymentPaidAt > nextPaymentDate
          ? "Tanggal tidak boleh melewati pembayaran tahap berikutnya."
          : "",
    evidence: paymentEvidenceBusy
      ? "Tunggu sampai bukti transfer selesai diproses."
      : transferEvidenceRequired && paymentEvidence.length === 0
        ? "Bukti transfer wajib diunggah."
        : "",
  };
  const paymentDraftValid = Object.values(paymentDraftErrors).every((message) => !message);
  const endDate = calculateLeaseEndDate(startDate, termMonths);
  const visibleRooms = matchingRooms(
    rooms.data?.items ?? [],
    category,
    resident.gender,
    roomSearch,
  );
  const localStageOneErrors = validateNewLeaseDraft({
    fullName: resident.fullName,
    phone: resident.phone,
    email: resident.email,
    gender: resident.gender,
    startDate,
    termMonths,
    placeOfBirth: resident.placeOfBirth,
    dateOfBirth: resident.dateOfBirth,
    address: resident.address,
    university: resident.university,
    faculty: resident.faculty,
    major: resident.major,
    cohort: resident.cohort,
    parentName: resident.parentName,
    parentPhone: resident.parentPhone,
    emergencyPhone: resident.emergencyPhone,
    instagram: resident.instagram,
    ktpNumber: resident.ktpNumber,
    notes: resident.notes,
  });
  const stageOneErrors = { ...localStageOneErrors, ...serverStageOneErrors };
  const stageOneValid =
    Object.keys(stageOneErrors).length === 0 &&
    !agreedMonthlyPriceError &&
    !pricingAgreementReasonError &&
    !standardShortTermError;
  const onboardingNotice = onboarding.error ? onboardingErrorNotice(onboarding.error) : null;
  useEffect(() => {
    const target = onboarding.submissionUncertain
      ? "archive-successor-uncertain"
      : onboarding.error
        ? "onboarding-command-error"
        : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(target);
      element?.scrollIntoView({ block: "nearest" });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [onboarding.error, onboarding.submissionUncertain]);
  const ownerSponsoredValid =
    commercialMode === "owner_sponsored" &&
    selectedRoomIsSelectable &&
    Boolean(sponsoringOwner) &&
    (managementFeeMode === "waived" || (selectedRoom?.kostType.managementFeeAmount ?? 0) > 0) &&
    ownerSponsorshipReason.trim().length >= 3 &&
    (managementFeeMode === "waived" ||
      managementFeePayer !== "other" ||
      managementFeePayerName.trim().length >= 2) &&
    confirmed;
  const stageTwoValid =
    commercialMode === "owner_sponsored"
      ? ownerSponsoredValid
      : stagedPaymentMode
        ? selectedRoomIsSelectable &&
          paymentEntries.length > 0 &&
          totalRentCredit >= requiredInitialRent &&
          totalRentCredit <= amounts.contractRent &&
          !hasUnsavedPaymentDraft &&
          !pricingVarianceError &&
          !commercialPricingPending &&
          !paymentEvidenceBusy &&
          confirmed
        : selectedRoomIsSelectable &&
          Number.isSafeInteger(paidRent) &&
          paidRent >= 0 &&
          Number.isSafeInteger(bookingFee) &&
          bookingFee >= 0 &&
          !bookingFeeBelowMinimum &&
          !bookingFeeExceedsRent &&
          !rentCreditExceedsContract &&
          !pricingVarianceError &&
          !commercialPricingPending &&
          Boolean(bookingLeadQuote.data) &&
          paymentChoiceSelected &&
          paymentMethodSelected &&
          creditedRentAmount >= requiredInitialRent &&
          (!transferEvidenceRequired || paymentEvidence.length > 0) &&
          (!historicalPaymentDateRequired || Boolean(paymentPaidAt)) &&
          !paymentEvidenceBusy &&
          confirmed;

  const stageTwoErrors = {
    roomId: !selectedRoom
      ? "Pilih satu kamar kosong terlebih dahulu."
      : selectedRoomIsSelectable
        ? ""
        : `Kamar ${selectedRoom.number} sudah tidak tersedia (${roomUnavailableLabel(selectedRoom)}). Pilih kamar lain.`,
    sponsoringOwner:
      commercialMode !== "owner_sponsored" || sponsoringOwner
        ? ""
        : "Owner yang berlaku untuk kamar ini belum tersedia.",
    managementFee:
      commercialMode !== "owner_sponsored" ||
      managementFeeMode === "waived" ||
      (selectedRoom?.kostType.managementFeeAmount ?? 0) > 0
        ? ""
        : "Biaya pengelolaan properti belum ditetapkan.",
    managementFeePayerName:
      commercialMode !== "owner_sponsored" ||
      managementFeeMode === "waived" ||
      managementFeePayer !== "other" ||
      managementFeePayerName.trim().length >= 2
        ? ""
        : "Nama pihak penanggung wajib diisi minimal 2 karakter.",
    ownerSponsorshipReason:
      commercialMode !== "owner_sponsored" || ownerSponsorshipReason.trim().length >= 3
        ? ""
        : "Alasan hunian tanggungan Owner wajib diisi minimal 3 karakter.",
    paidRent:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : rentCreditExceedsContract
          ? `Jumlah pembayaran sewa melebihi sisa kewajiban. Maksimal DP atau pelunasan yang dapat dicatat ${currency(maximumRentPayment)}.`
          : bookingFeeExceedsRent
            ? "Booking fee tidak boleh melebihi total sewa kontrak."
            : creditedRentAmount >= requiredInitialRent
              ? ""
              : paymentChoice === "full"
                ? `Pelunasan sewa masih kurang ${currency(
                    Math.max(0, amounts.contractRent - creditedRentAmount),
                  )}.`
                : `Pembayaran awal wajib menutup minimal satu bulan sewa. Masih kurang ${currency(
                    Math.max(0, requiredInitialRent - creditedRentAmount),
                  )}.`,
    bookingFee:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : bookingFeeBelowMinimum
          ? `Booking fee bila diisi minimal ${currency(MINIMUM_BOOKING_FEE)} atau Rp0.`
          : bookingFeeExceedsRent
            ? "Booking fee tidak boleh melebihi total sewa kontrak."
            : "",
    paymentEvidence:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : paymentEvidenceBusy
          ? "Tunggu sampai bukti transfer selesai diproses."
          : !transferEvidenceRequired || paymentEvidence.length > 0
            ? ""
            : "Bukti transfer wajib diunggah.",
    paymentPaidAt:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : !historicalPaymentDateRequired || paymentPaidAt
          ? ""
          : "Tanggal pembayaran wajib diisi selama mode input data historis aktif.",
    paymentChoice:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : paymentChoiceSelected
          ? ""
          : "Pilih rekomendasi DP 25% atau pelunasan sewa terlebih dahulu.",
    paymentMethod:
      commercialMode === "owner_sponsored" || stagedPaymentMode
        ? ""
        : !paymentChoiceSelected || paymentMethodSelected
          ? ""
          : "Pilih metode pembayaran terlebih dahulu.",
    confirmed: confirmed ? "" : "Konfirmasi data wajib dicentang sebelum disimpan.",
    payments:
      commercialMode === "owner_sponsored" || !stagedPaymentMode
        ? ""
        : paymentEntries.length === 0
          ? "Tambahkan minimal satu pembayaran sebelum commit onboarding."
          : totalRentCredit < requiredInitialRent
            ? `Total kredit sewa belum memenuhi minimal satu bulan. Masih kurang ${currency(
                requiredInitialRent - totalRentCredit,
              )}.`
            : hasUnsavedPaymentDraft
              ? "Simpan atau batalkan pembayaran yang sedang diisi sebelum commit onboarding."
              : "",
  };

  useEffect(() => {
    if (step === 1 && attemptedStepOne) {
      revealFirstValidationError();
    }
  }, [attemptedStepOne, step]);

  useEffect(() => {
    if (step === 2 && attemptedSubmit) {
      revealFirstValidationError();
    }
  }, [attemptedSubmit, step]);

  useEffect(() => {
    if (
      !onboarding.submissionUncertain &&
      (!stagedPaymentMode || (paymentEntries.length === 0 && !hasUnsavedPaymentDraft))
    )
      return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [
    hasUnsavedPaymentDraft,
    paymentEntries.length,
    stagedPaymentMode,
    onboarding.submissionUncertain,
  ]);

  const setDraft = <Key extends keyof ResidentDraft>(key: Key, value: ResidentDraft[Key]) => {
    if (submissionFrozen) return;
    setResident((current) => ({ ...current, [key]: value }));
    if (onboarding.error) onboarding.reset();
    const errorKey = key as keyof typeof serverStageOneErrors;
    setServerStageOneErrors((current) => {
      if (!(errorKey in current)) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  };

  const clearPaymentDraft = () => {
    setPaymentPurpose("rent");
    setPaymentChoice("dp");
    setPaymentMethod("bank_transfer");
    setPaymentPaidAt("");
    setPaidRent(0);
    setBookingFee(0);
    setPaymentNote("");
    setPaymentEvidence([]);
    setEditingPaymentId(null);
    setPaymentDraftAttempted(false);
  };

  const applyPricingSource = (value: PricingSource) => {
    const nextTerm = value === "standard" ? Math.max(3, termMonths) : termMonths;
    const reference = calculateLeaseAmounts(selectedRoom, Math.max(3, nextTerm));
    setPricingSource(value);
    setTermMonths(nextTerm);
    setAgreedMonthlyPrice(value === "negotiated" ? reference.referenceMonthlyRate : 0);
    setPricingAgreementReason("");
    setPricingVarianceAcknowledged(false);
    setPaymentEntries([]);
    clearPaymentDraft();
    setConfirmed(false);
  };

  const requestPricingSourceChange = (value: PricingSource) => {
    if (value === "standard" && pricingSource === "negotiated") {
      setPricingResetOpen(true);
      return;
    }
    applyPricingSource(value);
  };

  const cancelPaymentEdit = () => {
    clearPaymentDraft();
    scrollToPaymentSection();
  };

  const pickRoom = (room: LeaseRoomOption) => {
    if (submissionFrozen) return;
    if (!roomIsSelectable(room)) return;
    if (stagedPaymentMode && paymentEntries.length > 0 && roomId && room.id !== roomId) return;
    const replacingUnavailableRoom = stagedPaymentMode && paymentEntries.length > 0 && !roomId;
    setRoomId(room.id);
    setCategory(room.kostType.category);
    const standardAmounts = calculateLeaseAmounts(room, Math.max(3, termMonths));
    const nextAgreedMonthlyPrice =
      pricingSource === "negotiated" && agreedMonthlyPrice <= 0
        ? standardAmounts.referenceMonthlyRate
        : agreedMonthlyPrice;
    if (pricingSource === "negotiated" && agreedMonthlyPrice <= 0) {
      setAgreedMonthlyPrice(nextAgreedMonthlyPrice);
    }
    const nextAmounts = calculateLeaseAmounts(
      room,
      termMonths,
      pricingSource,
      nextAgreedMonthlyPrice,
    );
    if (replacingUnavailableRoom) {
      clearPaymentDraft();
    } else if (stagedPaymentMode) {
      setPaymentEntries([]);
      setEditingPaymentId(null);
      setExpandedPaymentId(null);
      setRecentlyAddedPaymentId(null);
      setPaymentPurpose("rent");
      setPaymentPaidAt("");
      setPaymentNote("");
      setPaymentEvidence([]);
    }
    if (!replacingUnavailableRoom) {
      setPaidRent(
        Math.max(
          0,
          (paymentChoice === "full"
            ? nextAmounts.contractRent
            : Math.max(nextAmounts.minimumDp, room.kostType.monthlyPrice)) - bookingFee,
        ),
      );
    }
    setAttemptedSubmit(false);
    setConfirmed(false);
    if (onboarding.error) onboarding.reset();
  };

  const changeTerm = (value: number) => {
    const minimumTerm = pricingSource === "negotiated" ? 1 : 3;
    const safe = Number.isInteger(value)
      ? Math.max(minimumTerm, Math.min(120, value))
      : minimumTerm;
    setTermMonths(safe);
    if (!bookingLeadId) {
      setPaymentEntries([]);
      setEditingPaymentId(null);
      setExpandedPaymentId(null);
      setRecentlyAddedPaymentId(null);
      setPaymentPurpose("rent");
      setPaymentPaidAt("");
      setPaymentNote("");
      setPaymentEvidence([]);
      const nextReference = calculateLeaseAmounts(selectedRoom, Math.max(3, safe));
      const nextAgreed =
        pricingSource === "negotiated" ? nextReference.referenceMonthlyRate : agreedMonthlyPrice;
      if (pricingSource === "negotiated") setAgreedMonthlyPrice(nextAgreed);
      setPricingVarianceAcknowledged(false);
      const nextAmounts = calculateLeaseAmounts(selectedRoom, safe, pricingSource, nextAgreed);
      setPaidRent(
        Math.max(
          0,
          (paymentChoice === "full"
            ? nextAmounts.contractRent
            : Math.max(nextAmounts.minimumDp, nextAmounts.monthlyRate)) - bookingFee,
        ),
      );
    }
    setAttemptedStepOne(false);
    setAttemptedSubmit(false);
    setConfirmed(false);
  };

  const changePaymentChoice = (value: PaymentChoice) => {
    setPaymentChoice(value);
    if (bookingFeeLocked) {
      setBookingFeePaymentChoiceSelected(true);
      setBookingFeePaymentMethodSelected(false);
    }
    if (!initialPaymentLocked) {
      const required =
        value === "full"
          ? amounts.contractRent
          : Math.max(amounts.minimumDp, selectedRoom?.kostType.monthlyPrice ?? 0);
      setPaidRent(
        Math.max(
          0,
          required - (stagedPaymentMode ? otherBookingFeeAmount + otherRentAmount : bookingFee),
        ),
      );
    }
    setAttemptedSubmit(false);
    setConfirmed(false);
  };

  const changeStartDate = (value: string) => {
    setStartDate(value);
    setAttemptedStepOne(false);
    setAttemptedSubmit(false);
    setConfirmed(false);
  };

  useEffect(() => {
    if (
      !bookingLeadId ||
      !initialPaymentLocked ||
      !bookingLeadQuote.data ||
      paymentChoice !== "full" ||
      totalRentCredit === amounts.contractRent
    )
      return;
    // A historic full settlement can become only a rent credit after the
    // admin revises the final period. It must never be rewritten silently.
    setPaymentChoice("dp");
  }, [
    amounts.contractRent,
    bookingLeadId,
    bookingLeadQuote.data,
    initialPaymentLocked,
    paymentChoice,
    totalRentCredit,
  ]);

  const changeBookingFee = (value: number) => {
    setBookingFee(value);
    setPaidRent(
      Math.max(
        0,
        (paymentChoice === "full"
          ? amounts.contractRent
          : Math.max(amounts.minimumDp, selectedRoom?.kostType.monthlyPrice ?? 0)) - value,
      ),
    );
    setAttemptedSubmit(false);
    setConfirmed(false);
  };

  const changePaymentPurpose = (value: PaymentEntryPurpose) => {
    setPaymentPurpose(value);
    setPaidRent(0);
    setBookingFee(0);
    setPaymentDraftAttempted(false);
    setConfirmed(false);
  };

  const savePaymentStage = () => {
    setPaymentDraftAttempted(true);
    if (!paymentDraftValid || paymentEvidenceBusy) {
      revealFirstValidationError(paymentSectionRef.current);
      return;
    }
    const isNewPayment = editingPaymentId === null;
    const id = editingPaymentId ?? globalThis.crypto.randomUUID();
    const nextEntry: StagedPaymentEntry = {
      id,
      purpose: paymentPurpose,
      amount: draftAmount,
      method: paymentMethod,
      paidAt: paymentPaidAt,
      note: paymentNote.trim(),
      evidence: paymentEvidence,
      verified: paymentMethod === "cash" || historicalEntryMode,
    };
    setPaymentEntries((current) =>
      editingPaymentId
        ? current.map((entry) => (entry.id === editingPaymentId ? nextEntry : entry))
        : [...current, nextEntry],
    );
    setExpandedPaymentId(null);
    if (isNewPayment) setRecentlyAddedPaymentId(id);
    clearPaymentDraft();
    setConfirmed(false);
    scrollToPaymentSection();
  };

  const editPaymentStage = (entry: StagedPaymentEntry) => {
    setEditingPaymentId(entry.id);
    setExpandedPaymentId(entry.id);
    setPaymentPurpose(entry.purpose);
    setPaidRent(entry.purpose === "rent" ? entry.amount : 0);
    setBookingFee(entry.purpose === "booking_fee" ? entry.amount : 0);
    setPaymentMethod(entry.method);
    setPaymentPaidAt(entry.paidAt);
    setPaymentNote(entry.note);
    setPaymentEvidence(entry.evidence);
    setPaymentDraftAttempted(false);
    setConfirmed(false);
  };

  const deletePaymentStage = (entry: StagedPaymentEntry) => {
    setPaymentEntries((current) => current.filter((item) => item.id !== entry.id));
    if (editingPaymentId === entry.id) clearPaymentDraft();
    if (expandedPaymentId === entry.id) setExpandedPaymentId(null);
    if (recentlyAddedPaymentId === entry.id) setRecentlyAddedPaymentId(null);
    setConfirmed(false);
  };

  const submit = async () => {
    if (submissionFrozen || onboarding.isPending) return;
    setAttemptedSubmit(true);
    let archiveLink: ReturnType<typeof archiveSuccessorLink> | undefined;
    if (archiveSuccessor) {
      try {
        archiveLink = archiveSuccessorLink(
          archiveSuccessor,
          currentPropertyId ?? "",
          archiveReplacementReason,
        );
      } catch (error) {
        const notice = adminErrorNotice(error);
        toast.error(notice.title, { description: notice.description });
        document.getElementById("archive-replacement-reason")?.focus();
        return;
      }
    }
    if (
      !currentPropertyId ||
      !selectedRoom ||
      !stageTwoValid ||
      !resident.gender ||
      paymentEvidenceBusy
    ) {
      if (stagedPaymentMode && (paymentEntries.length === 0 || hasUnsavedPaymentDraft)) {
        setPaymentDraftAttempted(true);
      }
      revealFirstValidationError();
      return;
    }
    const billingCycle = termMonths % 12 === 0 ? "yearly" : "monthly";
    const payload: OnboardingPayload = {
      property_id: currentPropertyId,
      ...archiveLink,
      booking_lead_id: bookingLeadId,
      room_id: selectedRoom.id,
      visitor_name: resident.fullName.trim(),
      visitor_phone: resident.phone.trim(),
      visitor_email: resident.email.trim() || undefined,
      gender: resident.gender,
      place_of_birth: resident.placeOfBirth.trim() || undefined,
      date_of_birth: resident.dateOfBirth || undefined,
      address: resident.address.trim() || undefined,
      university: resident.university.trim() || undefined,
      faculty: resident.faculty.trim() || undefined,
      major: resident.major.trim() || undefined,
      cohort: resident.cohort.trim() || undefined,
      instagram: resident.instagram.trim() || undefined,
      parent_name: resident.parentName.trim() || undefined,
      parent_phone: resident.parentPhone.trim() || undefined,
      emergency_phone: resident.emergencyPhone.trim() || undefined,
      ktp_number: resident.ktpNumber || undefined,
      ktp_file_id: resident.ktpFileId || undefined,
      start_date: startDate,
      term_months: termMonths,
      commercial_mode: commercialMode,
      sponsoring_owner_profile_id: sponsoringOwner?.id,
      management_fee_mode: commercialMode === "owner_sponsored" ? managementFeeMode : undefined,
      management_fee_payer:
        commercialMode === "owner_sponsored" && managementFeeMode === "charged"
          ? managementFeePayer
          : undefined,
      management_fee_payer_name:
        commercialMode === "owner_sponsored" &&
        managementFeeMode === "charged" &&
        managementFeePayer === "other"
          ? managementFeePayerName.trim()
          : undefined,
      owner_sponsorship_reason:
        commercialMode === "owner_sponsored" ? ownerSponsorshipReason.trim() : undefined,
      pricing_source: commercialMode === "rent" ? pricingSource : undefined,
      agreed_monthly_price:
        commercialMode === "rent" && pricingSource === "negotiated"
          ? amounts.monthlyRate
          : undefined,
      pricing_agreement_reason:
        commercialMode === "rent" && pricingSource === "negotiated"
          ? pricingAgreementReason.trim()
          : undefined,
      pricing_variance_acknowledged:
        commercialMode === "rent" && pricingSource === "negotiated" && materialPricingVariance
          ? pricingVarianceAcknowledged
          : undefined,
      billing_cycle: billingCycle,
      payment_plan_type:
        totalRentCredit === amounts.contractRent ? "annual_full" : "monthly_installments",
      accepted_terms_version:
        commercialMode === "owner_sponsored" ? "OWNER-SPONSORED-v2" : "KMO-W05-v1",
      dp_verified_amount: commercialMode === "owner_sponsored" || stagedPaymentMode ? 0 : paidRent,
      security_deposit_funded_amount: 0,
      booking_fee_paid_amount:
        commercialMode === "owner_sponsored" || stagedPaymentMode
          ? undefined
          : bookingFee || undefined,
      payment_method:
        commercialMode === "owner_sponsored" || stagedPaymentMode ? "cash" : paymentMethod,
      payment_paid_at:
        commercialMode === "owner_sponsored" || stagedPaymentMode
          ? undefined
          : paymentPaidAt || undefined,
      payment_evidence_file_ids:
        commercialMode === "rent" && !stagedPaymentMode && paymentEvidence.length > 0
          ? paymentEvidence.map((file) => file.id)
          : undefined,
      payment_note:
        commercialMode === "owner_sponsored" || stagedPaymentMode
          ? undefined
          : paymentNote.trim() || undefined,
      payment_entries:
        commercialMode === "rent" && stagedPaymentMode
          ? paymentEntries.map((entry) => ({
              purpose: entry.purpose,
              amount: entry.amount,
              method: entry.method,
              paid_at: entry.paidAt,
              evidence_file_ids:
                entry.evidence.length > 0 ? entry.evidence.map((file) => file.id) : undefined,
              note: entry.note || undefined,
            }))
          : undefined,
      notes: resident.notes.trim() || undefined,
    };
    try {
      await onboarding.mutateAsync(payload);
    } catch (error) {
      if (
        ApiError.isApiError(error) &&
        ["ROOM_NOT_AVAILABLE", "ROOM_LIFECYCLE_CONFLICT", "ROOM_LIFECYCLE_AMBIGUOUS"].includes(
          error.code,
        )
      ) {
        setRoomId("");
        setConfirmed(false);
        setStep(2);
        void rooms.refetch();
        scrollToPaymentSection();
        return;
      }
      const fieldErrors = onboardingErrorFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setServerStageOneErrors(fieldErrors);
        setAttemptedStepOne(true);
        setStep(1);
        return;
      }
      const notice = onboardingErrorNotice(error);
      if (notice.step === 1) {
        setAttemptedStepOne(true);
        setStep(1);
      }
    }
  };

  const uploadKtpDocument = async (file: File) => {
    if (!currentPropertyId || ktpUpload.isUploading) {
      throw new Error("Unggahan foto KTP belum dapat dimulai. Coba lagi sebentar.");
    }
    setKtpDocumentError(null);
    const requestPropertyId = currentPropertyId;
    const previousFileId = resident.ktpFileId;
    try {
      const uploaded = await ktpUpload.uploadAsync({
        file,
        propertyId: requestPropertyId,
        filePurpose: "ktp",
      });
      if (propertyScopeRef.current !== requestPropertyId) {
        await ktpDelete.mutateAsync(uploaded.id);
        throw new Error("Properti aktif berubah. Pilih foto KTP kembali untuk properti saat ini.");
      }
      setDraft("ktpFileId", uploaded.id);
      setKtpDocument(uploaded);
      if (previousFileId) await ktpDelete.mutateAsync(previousFileId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("Properti aktif berubah")
          ? error.message
          : `Foto KTP belum dapat diunggah. Gunakan JPG atau PNG dengan ukuran maksimal ${KTP_IMAGE_MAX_BYTES / (1024 * 1024)} MB.`;
      setKtpDocumentError(message);
      throw new Error(message);
    }
  };

  const removeKtpDocument = async () => {
    if (!resident.ktpFileId || ktpDelete.isPending) return;
    const fileId = resident.ktpFileId;
    try {
      await ktpDelete.mutateAsync(fileId);
      if (propertyScopeRef.current === currentPropertyId) {
        setDraft("ktpFileId", "");
        setKtpDocument(null);
        setKtpDocumentError(null);
      }
    } catch {
      const message = "Foto KTP belum dapat dihapus. Coba lagi nanti.";
      setKtpDocumentError(message);
      throw new Error(message);
    }
  };

  if (bookingLeadId && bookingLeadContext.isLoading) {
    return (
      <AppShell title={pageTitle}>
        <LoadingState label="Memverifikasi Minat Booking dan kamar yang ditahan..." />
      </AppShell>
    );
  }
  if (bookingLeadId && materializedResidentId) {
    return (
      <AppShell
        title="Penyewaan sudah dikomit"
        subtitle="Minat Booking ini sudah menjadi commitment penyewaan dan tidak dapat dilengkapi ulang."
      >
        <Card className="mx-auto max-w-3xl border-success/30">
          <CardHeader>
            <CardTitle>Data penyewaan sudah tersedia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Buka Detail Penghuni untuk meninjau pembayaran awal, status lease, atau menjalankan
              aktivasi kamar saat tanggal mulai sewa telah tiba.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/tenants/$residentId",
                    params: { residentId: materializedResidentId },
                  })
                }
              >
                Buka Detail Penghuni
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void navigate({ to: "/booking-leads" })}
              >
                Kembali ke Minat Booking
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }
  if (bookingLeadId && (bookingLeadContext.error || !bookingLeadContext.data)) {
    return (
      <AppShell title={pageTitle}>
        <ErrorState
          error={bookingLeadContext.error ?? new Error("BOOKING_LEAD_CONTEXT_NOT_FOUND")}
          title="Minat Booking belum siap dilengkapi"
          onRetry={() => void bookingLeadContext.refetch()}
        />
      </AppShell>
    );
  }
  if (rooms.isLoading && !rooms.data) {
    return (
      <AppShell title={pageTitle}>
        <LoadingState label="Memuat kamar kosong..." />
      </AppShell>
    );
  }
  if (rooms.error && !rooms.data) {
    return (
      <AppShell title={pageTitle}>
        <ErrorState
          error={rooms.error}
          title="Gagal memuat kamar kosong"
          onRetry={() => void rooms.refetch()}
        />
      </AppShell>
    );
  }

  if (onboarding.data) {
    return (
      <AppShell
        title="Komitmen onboarding tersimpan"
        subtitle="Penyewaan masih menunggu aktivasi; kamar belum berstatus dihuni."
      >
        <Card className="mx-auto max-w-3xl border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success" /> Siap untuk aktivasi terpisah
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {onboarding.refreshIncomplete ? (
              <NoticeAlert
                tone="warning"
                title="Penyewaan tersimpan, tetapi daftar belum diperbarui"
                description="Jangan simpan ulang. Buka detail penyewaan dari tombol di bawah atau perbarui daftar untuk melihat hasil yang sudah tersimpan."
              />
            ) : null}
            <p className="text-sm text-muted-foreground">
              {onboarding.data.roomNumber} untuk {onboarding.data.termMonths} bulan telah tercatat
              sebagai commitment.{" "}
              {onboarding.data.initialPayment.status === "verified"
                ? `${onboarding.data.initialPayment.receipts.length} pembayaran telah dicatat dan terverifikasi.`
                : "Sebagian transfer menunggu konfirmasi di workspace Pembayaran; lease belum dapat diaktifkan."}
            </p>
            {temporaryPassword ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold">Kredensial login sementara penghuni</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Sampaikan sekali saja. Penghuni wajib mengganti password saat pertama masuk.
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 rounded-lg border border-warning/25 bg-background/70 p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nomor WhatsApp · login utama
                    </dt>
                    <dd className="mt-1 font-medium">{resident.phone.trim()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Email · opsional
                    </dt>
                    <dd className="mt-1 break-all font-medium">
                      {resident.email.trim() || "Belum diisi"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Password sementara
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-semibold">
                    {temporaryPassword}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Salin password sementara"
                    onClick={() => {
                      void navigator.clipboard.writeText(temporaryPassword);
                      setCopied(true);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {copied ? (
                    <span className="text-sm font-medium text-success">Tersalin</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-[#25D366] text-black hover:bg-[#20bd5a]"
                    onClick={() => {
                      const phone = normalizeWhatsAppPhone(resident.phone);
                      if (!phone) return;
                      const message = [
                        `Halo ${resident.fullName.trim()},`,
                        "",
                        "Berikut kredensial sementara aplikasi Penghuni Kostation:",
                        `Login WhatsApp: ${resident.phone.trim()}`,
                        `Password sementara: ${temporaryPassword}`,
                        "",
                        "Silakan masuk dan segera ganti password saat diminta. Jangan bagikan kredensial ini kepada orang lain.",
                      ].join("\n");
                      window.open(
                        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Kirim kredensial ke WhatsApp
                  </Button>
                </div>
              </div>
            ) : null}
            {onboarding.data.initialPayment.receipts.length > 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="font-medium">Dokumen pembayaran awal</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Unduh dokumen pembayaran awal yang tersedia. Kuitansi security deposit tetap
                  terpisah dari pembayaran sewa; kuitansi angsuran sewa tersedia dari riwayat
                  pembayaran setelah onboarding selesai.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onboarding.data.initialPayment.receipts
                    .filter((receipt) => receipt.purpose !== "installment")
                    .map((receipt) => (
                      <Button
                        key={receipt.id}
                        type="button"
                        variant={receipt.purpose === "security_deposit" ? "outline" : "success"}
                        onClick={() => {
                          if (!currentPropertyId) return;
                          setReceiptDownloadError(null);
                          void downloadAdminReceiptDocument(
                            currentPropertyId,
                            receipt.id,
                            {
                              booking_fee: "kuitansi-booking-fee",
                              down_payment: "kuitansi-down-payment",
                              installment: "kuitansi-angsuran-sewa",
                              full_settlement: "kuitansi-pelunasan-sewa",
                              security_deposit: "kuitansi-security-deposit",
                            }[receipt.purpose],
                          ).catch((error: unknown) =>
                            setReceiptDownloadError(
                              error instanceof Error ? error.message : "Kuitansi gagal diunduh.",
                            ),
                          );
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Unduh kuitansi{" "}
                        {receiptPurposeLabel(receipt.purpose, receipt.rentPaymentSequence)}
                      </Button>
                    ))}
                </div>
              </div>
            ) : null}
            {onboarding.data.contractPaidDocument ? (
              <div className="rounded-xl border border-success/35 bg-success/10 p-4">
                <div className="flex items-start gap-3">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-success">Kontrak sewa telah lunas</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Bukti pelunasan kontrak merangkum seluruh pembayaran sewa yang diterima.
                    </p>
                    <Button
                      type="button"
                      variant="success"
                      className="mt-3"
                      onClick={() => {
                        if (!currentPropertyId || !onboarding.data?.contractPaidDocument) return;
                        setReceiptDownloadError(null);
                        void downloadAdminContractPaidDocument(
                          currentPropertyId,
                          onboarding.data.contractPaidDocument.id,
                          onboarding.data.contractPaidDocument.documentCode,
                        ).catch((error: unknown) =>
                          setReceiptDownloadError(
                            error instanceof Error
                              ? error.message
                              : "Bukti pelunasan gagal diunduh.",
                          ),
                        );
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Unduh bukti pelunasan kontrak
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {receiptDownloadError ? (
              <NoticeAlert
                tone="destructive"
                title="Kuitansi belum dapat diunduh"
                description={receiptDownloadError}
              />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void onCreated(onboarding.data!.leaseId)}>
                Kembali ke Data Penghuni
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={pageTitle}
      subtitle="Buat penghuni pending activation dan commitment lease. Aktivasi kamar dilakukan sebagai perintah terpisah."
    >
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        {onboarding.submissionUncertain ? (
          <NoticeAlert
            id="archive-successor-uncertain"
            tone="warning"
            title="Hasil penyewaan pengganti belum dapat dipastikan"
            description="Isian dikunci agar tidak tercipta pengajuan berbeda. Coba ulang pengajuan awal untuk memeriksa hasil dengan data yang sama, atau periksa riwayat pada arsip asal. Jangan membuat penyewaan pengganti kedua."
            action={
              <Button
                variant="info"
                disabled={onboarding.isPending}
                onClick={() => {
                  void onboarding.retryOriginalSubmission().catch(() => {
                    /* The hook retains the intent and reports the persistent error. */
                  });
                }}
              >
                {onboarding.isPending ? "Memeriksa pengajuan…" : "Coba ulang pengajuan awal"}
              </Button>
            }
          />
        ) : null}
        <fieldset
          disabled={submissionFrozen}
          aria-busy={onboarding.isPending}
          className="min-w-0 space-y-6"
        >
          <legend className="sr-only">
            Isian penyewaan{archiveSuccessor ? " pengganti" : " baru"}
          </legend>
          {archiveSuccessor ? (
            <Card>
              <CardHeader>
                <CardTitle>Pengganti untuk {archiveSuccessor.leaseCode}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <NoticeAlert
                  tone={
                    archiveSuccessor.financialResolutionState === "pending_review"
                      ? "warning"
                      : "info"
                  }
                  title="Catatan penyewaan lama tetap dipertahankan"
                  description={`Pilih kamar, periode, jenis hunian dan tarif baru. Pembayaran, bukti, kuitansi serta tagihan lama tidak disalin atau dipindahkan ke penyewaan baru.${archiveSuccessor.financialResolutionState === "pending_review" ? " Peninjauan keuangan penyewaan lama tetap diperlukan, walaupun pengganti berhasil dibuat." : ""}`}
                />
                <div className="space-y-2">
                  <Label htmlFor="archive-replacement-reason">
                    Alasan membuat penyewaan pengganti <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="archive-replacement-reason"
                    value={archiveReplacementReason}
                    maxLength={1000}
                    rows={3}
                    disabled={submissionFrozen}
                    onChange={(event) => setArchiveReplacementReason(event.target.value)}
                    aria-invalid={attemptedSubmit && archiveReplacementReason.trim().length < 3}
                    aria-describedby="archive-replacement-reason-help"
                  />
                  <p id="archive-replacement-reason-help" className="text-sm text-muted-foreground">
                    Wajib 3–1.000 karakter. Catatan ini menghubungkan penyewaan baru dengan arsip
                    lama.
                  </p>
                </div>
                {attemptedSubmit && archiveReplacementReason.trim().length < 3 ? (
                  <p role="alert" className="text-sm text-destructive">
                    Isi alasan penyewaan pengganti minimal 3 karakter. Belum ada penyewaan baru yang
                    disimpan.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <StageIndicator step={step} />
          {step === 1 ? (
            <ResidentAndLeaseStep
              propertyId={currentPropertyId}
              resident={resident}
              existingResident={Boolean(archiveSuccessor)}
              setDraft={setDraft}
              startDate={startDate}
              onStartDate={changeStartDate}
              termMonths={termMonths}
              onTermMonths={changeTerm}
              pricingSource={pricingSource}
              onPricingSource={requestPricingSourceChange}
              agreedMonthlyPrice={agreedMonthlyPrice}
              onAgreedMonthlyPrice={(value) => {
                setAgreedMonthlyPrice(value);
                setPricingVarianceAcknowledged(false);
                setPaymentEntries([]);
                clearPaymentDraft();
                setConfirmed(false);
              }}
              pricingAgreementReason={pricingAgreementReason}
              onPricingAgreementReason={setPricingAgreementReason}
              pricingErrors={{
                agreedMonthlyPrice: attemptedStepOne ? agreedMonthlyPriceError : "",
                agreementReason: attemptedStepOne ? pricingAgreementReasonError : "",
                term: attemptedStepOne ? standardShortTermError : "",
              }}
              endDate={endDate}
              bookingPeriod={
                bookingLeadContext.data
                  ? {
                      startDate: bookingLeadContext.data.paymentCommitment.startDate,
                      endDate: bookingLeadContext.data.paymentCommitment.endDate,
                      termMonths: bookingLeadContext.data.paymentCommitment.termMonths,
                    }
                  : undefined
              }
              leaseTermsLocked={bookingCommercialLocked}
              errors={attemptedStepOne ? stageOneErrors : {}}
              ktpDocument={ktpDocument}
              ktpDocumentError={ktpDocumentError}
              ktpUploading={ktpUpload.isUploading}
              ktpDeleting={ktpDelete.isPending}
              onKtpSelected={uploadKtpDocument}
              onKtpRemoved={removeKtpDocument}
            />
          ) : (
            <RoomAndPaymentStep
              category={category}
              setCategory={(value) => {
                if (stagedPaymentMode && paymentEntries.length > 0) return;
                setCategory(value);
                setRoomId("");
                setConfirmed(false);
              }}
              search={roomSearch}
              setSearch={setRoomSearch}
              rooms={bookingLeadId && selectedRoom ? [selectedRoom] : visibleRooms}
              roomsLoading={rooms.isLoading}
              roomsError={Boolean(rooms.error)}
              selectedRoom={selectedRoom}
              onPick={pickRoom}
              paymentSectionRef={paymentSectionRef}
              roomLocked={
                Boolean(bookingLeadId) || (stagedPaymentMode && paymentEntries.length > 0)
              }
              roomLockMessage={
                bookingLeadId
                  ? "Kamar dikunci dari Minat Booking yang telah ditahan. Ubah target melalui proses tahan kamar, bukan dari formulir ini."
                  : paymentEntries.length > 0
                    ? "Kamar dikunci sementara karena pembayaran sudah ditambahkan. Hapus semua pembayaran sementara bila perlu mengganti kamar."
                    : undefined
              }
              gender={resident.gender}
              termMonths={termMonths}
              amounts={amounts}
              commercialMode={commercialMode}
              onCommercialMode={(value) => {
                setCommercialMode(value);
                setPaymentEntries([]);
                clearPaymentDraft();
                setConfirmed(false);
              }}
              sponsoringOwner={sponsoringOwner}
              ownerAssetsLoading={ownerAssets.isLoading || ownerAssets.isPlaceholderData}
              managementFeeMode={managementFeeMode}
              setManagementFeeMode={(value) => {
                setManagementFeeMode(value);
                setConfirmed(false);
              }}
              managementFeePayer={managementFeePayer}
              setManagementFeePayer={(value) => {
                setManagementFeePayer(value);
                setConfirmed(false);
              }}
              managementFeePayerName={managementFeePayerName}
              setManagementFeePayerName={(value) => {
                setManagementFeePayerName(value);
                setConfirmed(false);
              }}
              ownerSponsorshipReason={ownerSponsorshipReason}
              setOwnerSponsorshipReason={(value) => {
                setOwnerSponsorshipReason(value);
                setConfirmed(false);
              }}
              projectedManagementFee={projectedManagementFee}
              ownerSponsoredAvailable={!bookingLeadId}
              pricingSource={pricingSource}
              pricingAgreementReason={pricingAgreementReason}
              pricingVariancePercent={pricingVariancePercent}
              materialPricingVariance={materialPricingVariance}
              pricingVarianceAcknowledged={pricingVarianceAcknowledged}
              onPricingVarianceAcknowledged={setPricingVarianceAcknowledged}
              pricingVarianceError={attemptedSubmit ? pricingVarianceError : ""}
              paymentChoice={paymentChoice}
              onPaymentChoiceChange={changePaymentChoice}
              bookingFeeLocked={bookingFeeLocked}
              initialPaymentLocked={initialPaymentLocked}
              creditedRentAmount={creditedRentAmount}
              bookingFeeExceedsRent={bookingFeeExceedsRent}
              rentCreditExceedsContract={rentCreditExceedsContract}
              maximumRentPayment={maximumRentPayment}
              bookingFeeBelowMinimum={bookingFeeBelowMinimum}
              paymentChoiceSelected={paymentChoiceSelected}
              paymentMethodSelected={paymentMethodSelected}
              paymentMethod={paymentMethod}
              paymentPaidAt={paymentPaidAt}
              setPaymentPaidAt={setPaymentPaidAt}
              historicalEntryMode={historicalEntryMode}
              historicalPaymentDateRequired={historicalPaymentDateRequired}
              paymentVerified={
                initialPaymentLocked
                  ? bookingLeadContext.data?.paymentCommitment.verificationStatus === "verified"
                  : paymentMethod === "cash" || historicalEntryMode
              }
              setPaymentMethod={(value) => {
                setPaymentMethod(value);
                if (bookingFeeLocked) setBookingFeePaymentMethodSelected(true);
                setConfirmed(false);
              }}
              paymentNote={paymentNote}
              setPaymentNote={setPaymentNote}
              propertyId={currentPropertyId ?? ""}
              paymentEvidence={paymentEvidence}
              paymentEvidenceBusy={paymentEvidenceBusy}
              onPaymentEvidenceChange={setPaymentEvidence}
              onPaymentEvidenceBusyChange={setPaymentEvidenceBusy}
              paidRent={paidRent}
              setPaidRent={setPaidRent}
              bookingFee={bookingFee}
              setBookingFee={stagedPaymentMode ? setBookingFee : changeBookingFee}
              stagedPayment={
                stagedPaymentMode
                  ? {
                      purpose: paymentPurpose,
                      entries: paymentEntries,
                      editingPaymentId,
                      expandedPaymentId,
                      draftAttempted: paymentDraftAttempted,
                      draftErrors: paymentDraftErrors,
                      onPurposeChange: changePaymentPurpose,
                      onSave: savePaymentStage,
                      onCancelEdit: cancelPaymentEdit,
                      onEdit: editPaymentStage,
                      onDelete: deletePaymentStage,
                      onToggle: (id) =>
                        setExpandedPaymentId((current) => (current === id ? null : id)),
                      rentAmount: stagedRentAmount,
                      bookingFeeAmount: stagedBookingFeeAmount,
                      recordedRentFullyPaid,
                      contractFullyPaid,
                      hasUnsavedDraft: hasUnsavedPaymentDraft,
                      hideDraft: hideStagedPaymentDraft,
                      rentPurposeDisabled,
                      recentlyAddedPaymentId,
                    }
                  : null
              }
              errors={attemptedSubmit ? stageTwoErrors : undefined}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
            />
          )}
        </fieldset>
        {archiveSuccessor ? (
          <Button variant="outline" asChild>
            <Link
              to="/tenants/archives/$archiveId"
              params={{ archiveId: archiveSuccessor.archiveId }}
            >
              Lihat arsip asal
            </Link>
          </Button>
        ) : null}
        {onboardingNotice && !onboarding.submissionUncertain ? (
          <NoticeAlert
            id="onboarding-command-error"
            tone="destructive"
            title={onboardingNotice.title}
            description={onboardingNotice.description}
          />
        ) : null}
        <div className="flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="default"
            className="min-h-11"
            disabled={step === 1 || onboarding.isPending || submissionFrozen}
            onClick={() => setStep(1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={submissionFrozen}
              onClick={() => {
                setAttemptedStepOne(true);
                if (!stageOneValid) return;
                setAttemptedStepOne(false);
                setStep(2);
              }}
            >
              Pilih Kamar Kost <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="success"
              className="min-h-11"
              disabled={
                onboarding.isPending ||
                submissionFrozen ||
                paymentEvidenceBusy ||
                (!bookingLeadId && verificationPolicy.isLoading)
              }
              onClick={() => void submit()}
            >
              {onboarding.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Commit Onboarding
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pricingResetOpen && !submissionFrozen}
        onOpenChange={setPricingResetOpen}
        title="Kembali ke tarif standar?"
        description="Durasi, tarif, catatan kesepakatan, dan pembayaran sementara akan dikembalikan ke perhitungan standar."
        confirmLabel="Gunakan tarif standar"
        onConfirm={() => {
          applyPricingSource("standard");
          setPricingResetOpen(false);
        }}
      />
    </AppShell>
  );
}

function StageIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol className="grid grid-cols-2 gap-3" aria-label="Tahap tambah penyewaan">
      {["Penghuni & Penyewaan", "Pilih Kamar Kost"].map((label, index) => {
        const completed = step === 2 && index === 0;
        const active = step === index + 1;
        return (
          <li
            key={label}
            className={
              "rounded-xl border p-4 text-sm font-medium transition-colors " +
              (completed
                ? "border-success/50 bg-success/10 text-success"
                : active
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground")
            }
          >
            <span
              className={
                "mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                (completed ? "bg-success text-success-foreground" : "bg-background")
              }
            >
              {completed ? <Check className="h-4 w-4" aria-label="Tahap selesai" /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function ResidentAndLeaseStep({
  propertyId,
  resident,
  existingResident,
  setDraft,
  startDate,
  onStartDate,
  termMonths,
  onTermMonths,
  pricingSource,
  onPricingSource,
  agreedMonthlyPrice,
  onAgreedMonthlyPrice,
  pricingAgreementReason,
  onPricingAgreementReason,
  pricingErrors,
  endDate,
  bookingPeriod,
  leaseTermsLocked,
  errors,
  ktpDocument,
  ktpDocumentError,
  ktpUploading,
  ktpDeleting,
  onKtpSelected,
  onKtpRemoved,
}: {
  propertyId: string | null;
  resident: ResidentDraft;
  existingResident?: boolean;
  setDraft: <Key extends keyof ResidentDraft>(key: Key, value: ResidentDraft[Key]) => void;
  startDate: string;
  onStartDate: (value: string) => void;
  termMonths: number;
  onTermMonths: (value: number) => void;
  pricingSource: PricingSource;
  onPricingSource: (value: PricingSource) => void;
  agreedMonthlyPrice: number;
  onAgreedMonthlyPrice: (value: number) => void;
  pricingAgreementReason: string;
  onPricingAgreementReason: (value: string) => void;
  pricingErrors: { agreedMonthlyPrice: string; agreementReason: string; term: string };
  endDate: string;
  bookingPeriod?: { startDate: string; endDate: string; termMonths: number };
  leaseTermsLocked: boolean;
  errors: NewLeaseDraftErrors;
  ktpDocument: FileResponse | null;
  ktpDocumentError: string | null;
  ktpUploading: boolean;
  ktpDeleting: boolean;
  onKtpSelected: (file: File) => Promise<void>;
  onKtpRemoved: () => Promise<void>;
}) {
  const bookingPeriodChanged = Boolean(
    bookingPeriod &&
    (bookingPeriod.startDate !== startDate || bookingPeriod.termMonths !== termMonths),
  );
  const input = (
    key: keyof ResidentDraft,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      hint?: string;
      numeric?: boolean;
      maxLength?: number;
    } = {},
  ) => {
    const fieldError = errors[key as keyof NewLeaseDraftErrors];
    if (options.type === "date") {
      return (
        <HeroUiDatePicker
          id={key}
          label={label}
          value={String(resident[key])}
          onChange={(value) => setDraft(key, (value ?? "") as ResidentDraft[typeof key])}
          description={options.hint}
          error={fieldError}
          required={options.required}
        />
      );
    }
    if (key === "university") {
      return (
        <div className="space-y-2">
          <Label htmlFor={key}>
            {label}
            {options.required ? <span className="text-destructive"> *</span> : null}
          </Label>
          <UniversityCombobox
            id={key}
            value={String(resident[key])}
            propertyId={propertyId}
            maxLength={options.maxLength}
            aria-invalid={Boolean(fieldError)}
            onChange={(value) => setDraft(key, value as ResidentDraft[typeof key])}
          />
          {options.hint ? <p className="text-xs text-muted-foreground">{options.hint}</p> : null}
          {fieldError ? (
            <p className="text-xs text-destructive" role="alert">
              {fieldError}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <Label htmlFor={key}>
          {label}
          {options.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <Input
          id={key}
          type={options.type ?? "text"}
          value={String(resident[key])}
          inputMode={options.numeric ? "numeric" : undefined}
          maxLength={options.maxLength}
          onChange={(event) =>
            setDraft(
              key,
              options.numeric ? event.target.value.replace(/\D/g, "") : event.target.value,
            )
          }
          aria-invalid={Boolean(
            errors[key as keyof NewLeaseDraftErrors] ||
            (options.numeric && resident[key] && !isDigitsOnly(String(resident[key]))),
          )}
          className={
            errors[key as keyof NewLeaseDraftErrors] ||
            (options.numeric && resident[key] && !isDigitsOnly(String(resident[key])))
              ? "border-destructive focus-visible:ring-destructive"
              : undefined
          }
        />
        {options.hint ? (
          <p className="text-xs text-muted-foreground">{options.hint}</p>
        ) : options.numeric ? (
          <p className="text-xs text-muted-foreground">Hanya angka.</p>
        ) : null}
        {fieldError ? (
          <p className="text-xs text-destructive" role="alert">
            {fieldError}
          </p>
        ) : null}
        {options.numeric && resident[key] && !isDigitsOnly(String(resident[key])) ? (
          <p className="text-xs text-destructive" role="alert">
            {label} hanya boleh berisi angka.
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" /> Detail penyewaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bookingPeriod ? (
            <aside
              className="rounded-xl border border-primary/25 bg-primary/5 p-4"
              aria-live="polite"
            >
              <p className="text-sm font-semibold">Periode dari Minat Booking</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dicatat untuk {formatIndonesianDate(bookingPeriod.startDate)} selama{" "}
                {bookingPeriod.termMonths} bulan, berakhir{" "}
                {formatIndonesianDate(bookingPeriod.endDate)}.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {leaseTermsLocked
                  ? "Periode dan tarif telah terkunci karena pembayaran awal sudah dicatat. Gunakan proses koreksi resmi jika kesepakatan berubah."
                  : "Tanggal mulai dan durasi dapat disesuaikan sebelum pembayaran awal dicatat."}
              </p>
              {bookingPeriodChanged ? (
                <p className="mt-3 border-t border-primary/20 pt-3 text-sm font-medium text-foreground">
                  Periode baru: {startDate ? formatIndonesianDate(startDate) : "belum dipilih"} ·{" "}
                  {termMonths} bulan · berakhir{" "}
                  {endDate ? formatIndonesianDate(endDate) : "belum dihitung"}. Jumlah sewa dan sisa
                  pembayaran akan dihitung ulang, lalu diperiksa kembali saat penyewaan disimpan.
                </p>
              ) : null}
            </aside>
          ) : null}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <HeroUiDatePicker
              id="lease-start"
              label="Tanggal mulai sewa"
              value={startDate}
              onChange={(value) => onStartDate(value ?? "")}
              error={errors.startDate}
              required
              disabled={leaseTermsLocked}
              className="min-w-0 gap-2"
            />
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="term-months">
                Durasi sewa (bulan)<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="term-months"
                type="number"
                min={pricingSource === "negotiated" ? 1 : 3}
                max={120}
                value={termMonths}
                onChange={(event) => onTermMonths(Number(event.target.value))}
                disabled={leaseTermsLocked}
                aria-invalid={Boolean(errors.termMonths)}
                className={
                  errors.termMonths
                    ? "min-h-11 border-destructive focus-visible:ring-destructive"
                    : "min-h-11"
                }
              />
              <div className="grid grid-cols-3 gap-2">
                {[3, 6, 12].map((months) => (
                  <Button
                    key={months}
                    type="button"
                    variant={termMonths === months ? "default" : "outline"}
                    className="min-h-11 border border-primary/60 px-2 hover:border-primary"
                    onClick={() => onTermMonths(months)}
                    disabled={leaseTermsLocked}
                  >
                    {months} bulan
                  </Button>
                ))}
              </div>
              {errors.termMonths ? (
                <p className="text-xs text-destructive">{errors.termMonths}</p>
              ) : null}
              {pricingErrors.term ? (
                <p className="text-xs text-destructive" role="alert">
                  {pricingErrors.term}
                </p>
              ) : null}
              <Button
                type="button"
                variant={pricingSource === "negotiated" ? "success" : "outline"}
                className="min-h-11 w-full border border-primary/60 hover:border-primary"
                onClick={() =>
                  onPricingSource(pricingSource === "negotiated" ? "standard" : "negotiated")
                }
                disabled={leaseTermsLocked}
              >
                {pricingSource === "negotiated"
                  ? "Gunakan tarif standar"
                  : "Gunakan durasi & tarif khusus"}
              </Button>
            </div>
          </div>
          {pricingSource === "negotiated" ? (
            <div className="space-y-4 rounded-xl border border-success/30 bg-success/10 p-4">
              <div>
                <p className="font-semibold text-success">Kesepakatan khusus</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Durasi 1–2 bulan wajib memakai mode ini. Tarif final akan diperiksa kembali
                  terhadap harga kategori dan management fee yang berlaku.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agreed-monthly-price">
                  Tarif bulanan yang disepakati<span className="text-destructive"> *</span>
                </Label>
                <CurrencyInput
                  id="agreed-monthly-price"
                  value={agreedMonthlyPrice}
                  placeholder="Contoh: 1.750.000"
                  onValueChange={onAgreedMonthlyPrice}
                  formatOnChange
                  error={Boolean(pricingErrors.agreedMonthlyPrice)}
                  disabled={leaseTermsLocked}
                />
                {pricingErrors.agreedMonthlyPrice ? (
                  <p className="text-xs text-destructive" role="alert">
                    {pricingErrors.agreedMonthlyPrice}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-agreement-reason">
                  Catatan kesepakatan<span className="text-destructive"> *</span>
                </Label>
                <Textarea
                  id="pricing-agreement-reason"
                  value={pricingAgreementReason}
                  onChange={(event) => onPricingAgreementReason(event.target.value)}
                  maxLength={500}
                  placeholder="Jelaskan alasan durasi atau tarif khusus"
                  aria-invalid={Boolean(pricingErrors.agreementReason)}
                  disabled={leaseTermsLocked}
                />
                <p className="text-xs text-muted-foreground">
                  Catatan ini hanya dapat dilihat Admin dan tidak ditampilkan kepada Owner atau
                  Penghuni.
                </p>
                {pricingErrors.agreementReason ? (
                  <p className="text-xs text-destructive" role="alert">
                    {pricingErrors.agreementReason}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Tanggal Sewa Berakhir</p>
            <p className="mt-2 text-base font-semibold tabular-nums">
              {endDate ? formatDateWithDashes(endDate) : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {endDate ? formatIndonesianDate(endDate) : "Pilih tanggal mulai dan durasi sewa."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Durasi sewa: {termMonths >= 1 ? `${termMonths} bulan` : "belum valid"}.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan internal (opsional)</Label>
            <Textarea
              id="notes"
              value={resident.notes}
              onChange={(event) => setDraft("notes", event.target.value)}
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>
      {existingResident ? (
        <Card>
          <CardHeader>
            <CardTitle>Penghuni yang sama</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-semibold">{resident.fullName}</p>
            <p className="text-sm">WhatsApp: {resident.phone}</p>
            <p className="text-sm">{resident.gender === "male" ? "Putra" : "Putri"}</p>
            <p className="text-sm text-muted-foreground">
              Profil dan akun yang sudah ada digunakan kembali. Tidak ada penghuni baru atau salinan
              dokumen identitas yang dibuat.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" /> Data penghuni baru
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {input("fullName", "Nama lengkap", { required: true, maxLength: 160 })}
            {input("phone", "Nomor Telepon / WhatsApp", {
              required: true,
              numeric: true,
              maxLength: 20,
            })}
            {input("email", "Email untuk akses Penghuni (opsional)", {
              type: "email",
              hint: "Dapat dilengkapi kemudian pada data penghuni.",
              maxLength: 254,
            })}
            <div className="space-y-2">
              <Label>
                Jenis kelamin<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={resident.gender || "none"}
                onValueChange={(value) =>
                  setDraft("gender", value === "none" ? "" : (value as Gender))
                }
              >
                <SelectTrigger
                  aria-invalid={Boolean(errors.gender)}
                  className={
                    errors.gender ? "border-destructive focus:ring-destructive" : undefined
                  }
                >
                  <SelectValue placeholder="Pilih jenis kelamin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pilih jenis kelamin</SelectItem>
                  <SelectItem value="male">Putra</SelectItem>
                  <SelectItem value="female">Putri</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender ? <p className="text-xs text-destructive">{errors.gender}</p> : null}
            </div>
            {input("ktpNumber", "NIK (opsional)", {
              hint: "Jika diisi, gunakan 16 digit.",
              numeric: true,
              maxLength: 16,
            })}
            {input("placeOfBirth", "Tempat lahir (opsional)", { maxLength: 120 })}
            {input("dateOfBirth", "Tanggal lahir (opsional)", { type: "date" })}
            {input("university", "Universitas (opsional)", { maxLength: 160 })}
            {input("faculty", "Fakultas (opsional)", { maxLength: 120 })}
            {input("major", "Jurusan (opsional)", { maxLength: 120 })}
            {input("cohort", "Angkatan (opsional)", { maxLength: 40 })}
            {input("instagram", "Username Instagram (opsional)", { maxLength: 100 })}
            {input("parentName", "Nama orang tua (opsional)", { maxLength: 160 })}
            {input("parentPhone", "Telepon / WhatsApp orang tua (opsional)", {
              numeric: true,
              maxLength: 20,
            })}
            {input("emergencyPhone", "Kontak darurat (opsional)", {
              numeric: true,
              maxLength: 20,
            })}
            <div className="space-y-2 sm:col-span-2">
              <ImageUploadField
                id="resident-ktp-photo"
                label="Foto KTP (opsional)"
                description="JPG atau PNG, maksimal 5 MB. Di ponsel, kamera belakang dapat dipakai untuk memotret KTP."
                file={ktpDocument}
                error={ktpDocumentError}
                isUploading={ktpUploading}
                isRemoving={ktpDeleting}
                capture="environment"
                maxBytes={KTP_IMAGE_MAX_BYTES}
                prepareFile={compressResidentKtpImage}
                onFileSelected={onKtpSelected}
                onRemove={onKtpRemoved}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Alamat (opsional)</Label>
              <Textarea
                id="address"
                value={resident.address}
                onChange={(event) => setDraft("address", event.target.value)}
                maxLength={1000}
                aria-invalid={Boolean(errors.address)}
                className={
                  errors.address ? "border-destructive focus-visible:ring-destructive" : undefined
                }
              />
              {errors.address ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.address}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RoomAndPaymentStep({
  category,
  setCategory,
  search,
  setSearch,
  rooms,
  roomsLoading,
  roomsError,
  selectedRoom,
  onPick,
  paymentSectionRef,
  roomLocked,
  roomLockMessage,
  gender,
  termMonths,
  amounts,
  commercialMode,
  onCommercialMode,
  sponsoringOwner,
  ownerAssetsLoading,
  managementFeeMode,
  setManagementFeeMode,
  managementFeePayer,
  setManagementFeePayer,
  managementFeePayerName,
  setManagementFeePayerName,
  ownerSponsorshipReason,
  setOwnerSponsorshipReason,
  projectedManagementFee,
  ownerSponsoredAvailable,
  pricingSource,
  pricingAgreementReason,
  pricingVariancePercent,
  materialPricingVariance,
  pricingVarianceAcknowledged,
  onPricingVarianceAcknowledged,
  pricingVarianceError,
  paymentChoice,
  onPaymentChoiceChange,
  bookingFeeLocked,
  initialPaymentLocked,
  creditedRentAmount,
  bookingFeeExceedsRent,
  rentCreditExceedsContract,
  maximumRentPayment,
  bookingFeeBelowMinimum,
  paymentChoiceSelected,
  paymentMethodSelected,
  paymentMethod,
  paymentPaidAt,
  setPaymentPaidAt,
  historicalEntryMode,
  historicalPaymentDateRequired,
  paymentVerified,
  setPaymentMethod,
  paymentNote,
  setPaymentNote,
  propertyId,
  paymentEvidence,
  paymentEvidenceBusy,
  onPaymentEvidenceChange,
  onPaymentEvidenceBusyChange,
  paidRent,
  setPaidRent,
  bookingFee,
  setBookingFee,
  stagedPayment,
  errors,
  confirmed,
  setConfirmed,
}: {
  category: "rukost" | "apartkost" | "";
  setCategory: (value: "rukost" | "apartkost") => void;
  search: string;
  setSearch: (value: string) => void;
  rooms: LeaseRoomOption[];
  roomsLoading: boolean;
  roomsError: boolean;
  selectedRoom?: LeaseRoomOption;
  onPick: (room: LeaseRoomOption) => void;
  paymentSectionRef: { current: HTMLDivElement | null };
  roomLocked: boolean;
  roomLockMessage?: string;
  gender: Gender | "";
  termMonths: number;
  amounts: ReturnType<typeof calculateLeaseAmounts>;
  commercialMode: CommercialMode;
  onCommercialMode: (value: CommercialMode) => void;
  sponsoringOwner: { id: string; fullName: string } | null;
  ownerAssetsLoading: boolean;
  managementFeeMode: ManagementFeeMode;
  setManagementFeeMode: (value: ManagementFeeMode) => void;
  managementFeePayer: ManagementFeePayer;
  setManagementFeePayer: (value: ManagementFeePayer) => void;
  managementFeePayerName: string;
  setManagementFeePayerName: (value: string) => void;
  ownerSponsorshipReason: string;
  setOwnerSponsorshipReason: (value: string) => void;
  projectedManagementFee: number;
  ownerSponsoredAvailable: boolean;
  pricingSource: PricingSource;
  pricingAgreementReason: string;
  pricingVariancePercent: number;
  materialPricingVariance: boolean;
  pricingVarianceAcknowledged: boolean;
  onPricingVarianceAcknowledged: (value: boolean) => void;
  pricingVarianceError: string;
  paymentChoice: PaymentChoice;
  onPaymentChoiceChange: (value: PaymentChoice) => void;
  bookingFeeLocked: boolean;
  initialPaymentLocked: boolean;
  creditedRentAmount: number;
  bookingFeeExceedsRent: boolean;
  rentCreditExceedsContract: boolean;
  maximumRentPayment: number;
  bookingFeeBelowMinimum: boolean;
  paymentChoiceSelected: boolean;
  paymentMethodSelected: boolean;
  paymentMethod: PaymentMethod;
  paymentPaidAt: string;
  setPaymentPaidAt: (value: string) => void;
  historicalEntryMode: boolean;
  historicalPaymentDateRequired: boolean;
  paymentVerified: boolean;
  setPaymentMethod: (value: PaymentMethod) => void;
  paymentNote: string;
  setPaymentNote: (value: string) => void;
  propertyId: string;
  paymentEvidence: FileResponse[];
  paymentEvidenceBusy: boolean;
  onPaymentEvidenceChange: (files: FileResponse[]) => void;
  onPaymentEvidenceBusyChange: (busy: boolean) => void;
  paidRent: number;
  setPaidRent: (value: number) => void;
  bookingFee: number;
  setBookingFee: (value: number) => void;
  stagedPayment: StagedPaymentController | null;
  errors?: {
    roomId: string;
    sponsoringOwner: string;
    managementFee: string;
    managementFeePayerName: string;
    ownerSponsorshipReason: string;
    paidRent: string;
    bookingFee: string;
    paymentEvidence: string;
    paymentPaidAt: string;
    paymentChoice: string;
    paymentMethod: string;
    confirmed: string;
    payments: string;
  };
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
}) {
  const stagedDraftErrors = stagedPayment?.draftAttempted ? stagedPayment.draftErrors : null;
  const transferEvidenceRequired =
    paymentMethod === "bank_transfer" && !initialPaymentLocked && !historicalEntryMode;
  const hasStagedDraftError = Boolean(
    stagedDraftErrors && Object.values(stagedDraftErrors).some(Boolean),
  );
  const hasOtherBookingFee =
    stagedPayment?.entries.some(
      (entry) => entry.purpose === "booking_fee" && entry.id !== stagedPayment.editingPaymentId,
    ) ?? false;
  const hasRecordedRent =
    stagedPayment?.entries.some(
      (entry) => entry.purpose === "rent" && entry.id !== stagedPayment.editingPaymentId,
    ) ?? false;
  const editingStageIndex = stagedPayment?.editingPaymentId
    ? stagedPayment.entries.findIndex((entry) => entry.id === stagedPayment.editingPaymentId)
    : -1;
  const activeRentSequence = stagedPayment
    ? (editingStageIndex >= 0
        ? stagedPayment.entries.slice(0, editingStageIndex)
        : stagedPayment.entries
      ).filter((entry) => entry.purpose === "rent").length + 1
    : 1;
  const stagedRentChoice = stagedPayment
    ? stagedRentChoiceLabel(stagedPayment.entries, stagedPayment.editingPaymentId)
    : null;
  const editorRef = useRef<HTMLDivElement>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<StagedPaymentEntry | null>(null);
  const [roomFilter, setRoomFilter] = useState<RoomListFilter>("all");
  const filteredRooms =
    roomLocked || roomFilter === "all"
      ? rooms
      : rooms.filter((room) => roomListStatus(room) === roomFilter);
  useEffect(() => {
    if (!stagedPayment?.editingPaymentId) return;
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [stagedPayment?.editingPaymentId]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pilih kamar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {roomLocked ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              {roomLockMessage}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Pilih kategori kost">
            {(["rukost", "apartkost"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={category === value ? "default" : "info"}
                aria-pressed={category === value}
                className="h-14 w-full justify-center rounded-xl border-2 px-5 text-center text-base font-semibold shadow-sm"
                onClick={() => setCategory(value)}
                disabled={roomLocked}
              >
                {value === "rukost" ? "Rumah Kost" : "Apart Kost"}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nomor kamar, bangunan, atau kavling"
              aria-label="Cari kamar"
              className="pl-9"
              autoComplete="off"
              disabled={roomLocked}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Kamar yang sesuai gender{" "}
            {gender === "male" ? "Putra" : gender === "female" ? "Putri" : "penghuni"} dan kategori
            pilihan ditampilkan. Kamar tersedia ditampilkan lebih dulu; kamar yang perlu pemeriksaan
            atau dalam perawatan hanya untuk informasi dan tidak dapat dipilih.
          </p>
          {!roomLocked ? (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter ketersediaan kamar"
            >
              {(
                [
                  ["all", "Semua"],
                  ["available", "Tersedia"],
                  ["inspection_required", "Perlu pemeriksaan"],
                  ["maintenance", "Dalam perawatan"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={roomFilter === value ? "default" : "outline"}
                  className="rounded-full"
                  aria-pressed={roomFilter === value}
                  onClick={() => setRoomFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          {roomsError ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              Daftar kamar gagal dimuat. Muat ulang halaman untuk mencoba lagi.
            </p>
          ) : roomsLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Memuat daftar kamar…
            </p>
          ) : null}
          <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-1" aria-live="polite">
            <div className="grid gap-3 md:grid-cols-2">
              {filteredRooms.map((room) => {
                const selectable = roomIsSelectable(room);
                const roomAmounts = calculateLeaseAmounts(room, termMonths);
                const rateLabel =
                  roomAmounts.monthlyRate > 0
                    ? `${currency(roomAmounts.monthlyRate)} / bulan · ${roomAmounts.tierLabel}`
                    : "Pilih durasi minimal 3 bulan";
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onPick(room)}
                    disabled={roomLocked || !selectable}
                    className={
                      "min-h-32 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed " +
                      (selectedRoom?.id === room.id
                        ? "border-primary bg-primary/10"
                        : selectable
                          ? "border-border bg-card hover:border-primary/50"
                          : "border-border bg-muted/35")
                    }
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{room.number}</span>
                      <StatusBadge
                        tone={selectable ? "success" : "warning"}
                        label={selectable ? "Tersedia" : roomUnavailableLabel(room)}
                      />
                    </span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {room.kostType.name} · {room.buildingName ?? room.buildingCode ?? "Bangunan"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No. Kavling: {room.plotNumber?.trim() || "—"}
                    </p>
                    <p
                      className={
                        selectable
                          ? "mt-2 text-xs font-medium text-primary"
                          : "mt-2 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {rateLabel}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          {errors?.roomId ? (
            <p
              className="text-xs text-destructive"
              data-validation-target="true"
              role="alert"
              tabIndex={-1}
            >
              {errors.roomId}
            </p>
          ) : null}
          {!roomsLoading && !roomsError && filteredRooms.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Tidak ada kamar yang sesuai. Ubah filter, kategori, atau kata kunci pencarian.
            </p>
          ) : null}
        </CardContent>
      </Card>
      {selectedRoom ? (
        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle>Jenis pengelolaan hunian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="grid gap-3 sm:grid-cols-2"
                role="group"
                aria-label="Jenis pengelolaan hunian"
              >
                <Button
                  type="button"
                  variant={commercialMode === "rent" ? "default" : "info"}
                  className="h-auto min-h-16 justify-start whitespace-normal border-2 border-primary px-4 py-3 text-left"
                  aria-pressed={commercialMode === "rent"}
                  onClick={() => onCommercialMode("rent")}
                >
                  <span>
                    <span className="block font-semibold">Penyewaan berbayar</span>
                    <span className="mt-1 block text-xs opacity-80">
                      Sewa kamar dan pembayaran mengikuti kontrak.
                    </span>
                  </span>
                </Button>
                {ownerSponsoredAvailable ? (
                  <Button
                    type="button"
                    variant={commercialMode === "owner_sponsored" ? "default" : "info"}
                    className="h-auto min-h-16 justify-start whitespace-normal border-2 border-primary px-4 py-3 text-left"
                    aria-pressed={commercialMode === "owner_sponsored"}
                    onClick={() => onCommercialMode("owner_sponsored")}
                  >
                    <span>
                      <span className="block font-semibold">Hunian tanggungan Owner</span>
                      <span className="mt-1 block text-xs opacity-80">
                        Sewa kamar Rp0; biaya pengelolaan mengikuti pilihan Owner.
                      </span>
                    </span>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            {commercialMode === "owner_sponsored" ? (
              <Card className="min-w-0 border-success/40 bg-success/[0.04]">
                <CardHeader>
                  <CardTitle>Otoritas hunian tanggungan Owner</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {ownerAssetsLoading ? (
                    <p className="text-sm text-muted-foreground">Memuat kepemilikan kamar...</p>
                  ) : sponsoringOwner ? (
                    <div className="rounded-xl border border-success/35 bg-success/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-success">
                        Owner penanggung
                      </p>
                      <p className="mt-1 font-semibold">{sponsoringOwner.fullName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Kepemilikan aset telah terdaftar permanen.
                      </p>
                    </div>
                  ) : (
                    <NoticeAlert
                      tone="destructive"
                      title="Owner kamar belum ditetapkan"
                      description="Tetapkan owner untuk bangunan atau kamar ini sebelum membuat hunian tanggungan owner."
                    />
                  )}
                  {errors?.sponsoringOwner ? (
                    <p
                      className="text-sm font-medium text-destructive"
                      data-validation-target="true"
                      role="alert"
                      tabIndex={-1}
                    >
                      {errors.sponsoringOwner}
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    <Label>
                      Ketentuan biaya pengelolaan <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant={managementFeeMode === "charged" ? "info" : "outline"}
                        className="h-auto min-h-16 justify-start whitespace-normal border-2 border-primary px-4 py-3 text-left"
                        aria-pressed={managementFeeMode === "charged"}
                        onClick={() => setManagementFeeMode("charged")}
                      >
                        <span>
                          <span className="block font-semibold">Dengan biaya pengelolaan</span>
                          <span className="mt-1 block text-xs opacity-80">
                            Biaya dicatat terpisah dan dapat dibayar fleksibel.
                          </span>
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant={managementFeeMode === "waived" ? "success" : "outline"}
                        className="h-auto min-h-16 justify-start whitespace-normal border-2 border-success px-4 py-3 text-left"
                        aria-pressed={managementFeeMode === "waived"}
                        onClick={() => setManagementFeeMode("waived")}
                      >
                        <span>
                          <span className="block font-semibold">Tanpa biaya pengelolaan</span>
                          <span className="mt-1 block text-xs opacity-80">
                            Tidak ada sewa kamar, deposit, atau biaya pengelolaan.
                          </span>
                        </span>
                      </Button>
                    </div>
                  </div>
                  {errors?.managementFee ? (
                    <p
                      className="text-sm font-medium text-destructive"
                      data-validation-target="true"
                      role="alert"
                      tabIndex={-1}
                    >
                      {errors.managementFee}
                    </p>
                  ) : null}
                  {managementFeeMode === "charged" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>
                          Penanggung biaya pengelolaan <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={managementFeePayer}
                          onValueChange={(value) =>
                            setManagementFeePayer(value as ManagementFeePayer)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="resident">Penghuni</SelectItem>
                            <SelectItem value="other">Pihak lain</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {managementFeePayer === "other" ? (
                        <div className="space-y-2">
                          <Label>
                            Nama penanggung <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={managementFeePayerName}
                            onChange={(event) => setManagementFeePayerName(event.target.value)}
                            placeholder="Nama pihak penanggung"
                          />
                          {errors?.managementFeePayerName ? (
                            <p
                              className="text-xs font-medium text-destructive"
                              data-validation-target="true"
                              role="alert"
                              tabIndex={-1}
                            >
                              {errors.managementFeePayerName}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <NoticeAlert
                      tone="success"
                      title="Seluruh biaya hunian dibebaskan"
                      description="Kontrak dan durasi hunian tetap tercatat, tetapi tidak ada tagihan sewa maupun biaya pengelolaan."
                    />
                  )}
                  <div className="space-y-2">
                    <Label>
                      Alasan hunian tanggungan Owner <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={ownerSponsorshipReason}
                      onChange={(event) => setOwnerSponsorshipReason(event.target.value)}
                      placeholder="Contoh: Anak pemilik properti menempati kamar selama masa studi."
                      rows={3}
                    />
                    {errors?.ownerSponsorshipReason ? (
                      <p
                        className="text-xs font-medium text-destructive"
                        data-validation-target="true"
                        role="alert"
                        tabIndex={-1}
                      >
                        {errors.ownerSponsorshipReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
                    <Summary label="Sewa kamar" value="Rp0" />
                    <Summary
                      label="Biaya pengelolaan per bulan"
                      value={
                        managementFeeMode === "charged"
                          ? currency(selectedRoom.kostType.managementFeeAmount ?? 0)
                          : "Tidak ditagihkan"
                      }
                    />
                    <Summary
                      label={`Proyeksi ${termMonths} bulan`}
                      value={currency(projectedManagementFee)}
                    />
                    <Summary
                      label="Status biaya pengelolaan"
                      value={
                        managementFeeMode === "charged"
                          ? "Fleksibel · tanpa denda keterlambatan"
                          : "Dibebaskan oleh Owner"
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {managementFeeMode === "charged"
                      ? "Pembayaran biaya pengelolaan dicatat setelah penyewaan dibuat dan tidak menjadi pendapatan sewa Owner."
                      : "Tidak ada pembayaran yang perlu dicatat untuk hunian ini. Perubahan kebijakan berikutnya tidak mengubah kontrak yang sudah disimpan."}
                  </p>
                </CardContent>
              </Card>
            ) : null}
            <Card
              ref={paymentSectionRef}
              tabIndex={-1}
              className={`${commercialMode === "owner_sponsored" ? "hidden" : ""} min-w-0 scroll-mt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
            >
              <CardHeader>
                <CardTitle>Pemenuhan pembayaran sebelum aktivasi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {bookingFeeLocked ? (
                  <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                    Booking Fee dari Minat Booking telah dikunci sebagai kredit sewa. Lengkapi DP
                    atau pelunasan di bawah ini.
                  </p>
                ) : null}
                {initialPaymentLocked ? (
                  <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                    Komitmen pembayaran awal dari Minat Booking telah tercatat dan tidak dapat
                    diubah pada formulir ini. Periode final tetap dapat disesuaikan sebelum
                    commitment onboarding disimpan.
                  </p>
                ) : null}
                {stagedPayment ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="font-semibold">Daftar pembayaran sementara</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pembayaran menjadi resmi sekaligus setelah Commit Onboarding berhasil.
                        </p>
                      </div>
                      <span className="rounded-full border border-success/40 bg-success/12 px-3 py-1 text-xs font-semibold text-success">
                        {stagedPayment.entries.length} tahap tersimpan
                      </span>
                    </div>
                    {stagedPayment.entries.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-border">
                        {stagedPayment.entries.map((entry, index) => {
                          const expanded = stagedPayment.expandedPaymentId === entry.id;
                          const recentlyAdded = stagedPayment.recentlyAddedPaymentId === entry.id;
                          const entriesThroughStage = stagedPayment.entries.slice(0, index + 1);
                          const rentSequence = entriesThroughStage.filter(
                            (item) => item.purpose === "rent",
                          ).length;
                          const hasPriorRentCredit = entriesThroughStage
                            .slice(0, -1)
                            .some(
                              (item) => item.purpose === "rent" || item.purpose === "booking_fee",
                            );
                          const rentCreditThroughStage = entriesThroughStage.reduce(
                            (total, item) =>
                              total +
                              (item.purpose === "rent" || item.purpose === "booking_fee"
                                ? item.amount
                                : 0),
                            0,
                          );
                          const entryLabel =
                            entry.purpose !== "rent"
                              ? paymentPurposeLabel(entry.purpose)
                              : rentCreditThroughStage === amounts.contractRent
                                ? "Pelunasan Sewa"
                                : !hasPriorRentCredit
                                  ? "Uang Muka"
                                  : rentSequence === 1
                                    ? "Angsuran Sewa"
                                    : `Angsuran Sewa ke-${rentSequence}`;
                          return (
                            <div
                              key={entry.id}
                              className="relative border-b border-border last:border-b-0"
                            >
                              {recentlyAdded ? (
                                <div
                                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card px-4 text-success motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:animate-none"
                                  role="status"
                                  aria-live="polite"
                                >
                                  <span className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-4 py-2 text-sm font-semibold">
                                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                                    Pembayaran tahap {index + 1} berhasil ditambahkan
                                  </span>
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-3 bg-muted/15 px-4 py-3">
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => stagedPayment.onToggle(entry.id)}
                                  aria-expanded={expanded}
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-medium">{entryLabel}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {formatIndonesianDate(entry.paidAt)} ·{" "}
                                      {paymentMethodLabel(entry.method)}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-semibold">
                                    {currency(entry.amount)}
                                  </span>
                                  {expanded ? (
                                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                </button>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="default"
                                    onClick={() => stagedPayment.onEdit(entry)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setDeleteCandidate(entry)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                                  </Button>
                                </div>
                              </div>
                              {expanded ? (
                                <div className="grid gap-2 bg-background px-4 py-3 text-xs text-muted-foreground sm:grid-cols-2">
                                  <span>
                                    Status:{" "}
                                    {entry.verified ? "Terverifikasi" : "Menunggu konfirmasi"}
                                  </span>
                                  <span>
                                    {entry.evidence.length > 0
                                      ? `${entry.evidence.length} bukti pembayaran`
                                      : "Bukti belum dilampirkan"}
                                  </span>
                                  {entry.note ? (
                                    <span className="sm:col-span-2">Catatan: {entry.note}</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                        Belum ada pembayaran tersimpan. Isi formulir tahap pertama di bawah ini.
                      </div>
                    )}
                    {errors?.payments ? (
                      <p
                        className="text-xs text-destructive"
                        data-validation-target={hasStagedDraftError ? undefined : "true"}
                        role="alert"
                        tabIndex={hasStagedDraftError ? undefined : -1}
                      >
                        {errors.payments}
                      </p>
                    ) : null}
                    {!stagedPayment.hideDraft ? (
                      <>
                        <div
                          ref={editorRef}
                          tabIndex={-1}
                          className="scroll-mt-6 border-t border-border pt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          <p className="font-semibold">
                            {stagedPayment.editingPaymentId
                              ? `Edit pembayaran tahap ${
                                  stagedPayment.entries.findIndex(
                                    (entry) => entry.id === stagedPayment.editingPaymentId,
                                  ) + 1
                                }`
                              : `Pembayaran tahap ${stagedPayment.entries.length + 1}`}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Satu tahap hanya memuat satu tujuan pembayaran agar riwayat dan
                            kuitansinya jelas.
                          </p>
                        </div>
                        <div
                          className="grid gap-2 sm:grid-cols-2"
                          role="group"
                          aria-label="Tujuan pembayaran"
                        >
                          {(["rent", "booking_fee"] as const).map((purpose) => (
                            <Button
                              key={purpose}
                              type="button"
                              variant={stagedPayment.purpose === purpose ? "default" : "outline"}
                              className="min-h-11"
                              disabled={
                                (purpose === "rent" && stagedPayment.rentPurposeDisabled) ||
                                (purpose === "booking_fee" &&
                                  (hasOtherBookingFee || hasRecordedRent))
                              }
                              onClick={() => stagedPayment.onPurposeChange(purpose)}
                            >
                              {paymentPurposeLabel(purpose)}
                            </Button>
                          ))}
                        </div>
                        {stagedDraftErrors?.purpose ? (
                          <p
                            className="text-xs text-destructive"
                            data-validation-target="true"
                            role="alert"
                            tabIndex={-1}
                          >
                            {stagedDraftErrors.purpose}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
                {!stagedPayment?.hideDraft &&
                (!stagedPayment || stagedPayment.purpose === "rent") ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={
                        paymentChoiceSelected && paymentChoice === "dp" ? "default" : "outline"
                      }
                      className="min-h-11"
                      onClick={() => onPaymentChoiceChange("dp")}
                      disabled={initialPaymentLocked || Boolean(stagedPayment?.rentPurposeDisabled)}
                    >
                      {stagedPayment ? stagedRentChoice : "Rekomendasi DP 25%"}
                    </Button>
                    <Button
                      type="button"
                      variant={
                        paymentChoiceSelected && paymentChoice === "full" ? "default" : "outline"
                      }
                      className="min-h-11"
                      onClick={() => onPaymentChoiceChange("full")}
                      disabled={initialPaymentLocked || Boolean(stagedPayment?.rentPurposeDisabled)}
                    >
                      {stagedPayment ? "Lunasi Sewa" : "Lunas sewa"}
                    </Button>
                  </div>
                ) : null}
                {!stagedPayment?.hideDraft && errors?.paymentChoice ? (
                  <p
                    className="text-xs text-destructive"
                    data-validation-target="true"
                    role="alert"
                    tabIndex={-1}
                  >
                    {errors.paymentChoice}
                  </p>
                ) : null}
                {!stagedPayment?.hideDraft && paymentChoiceSelected ? (
                  <div className="space-y-2">
                    <Label>Metode pembayaran *</Label>
                    <div
                      className="grid grid-cols-2 gap-2"
                      role="group"
                      aria-label="Metode pembayaran"
                    >
                      <Button
                        type="button"
                        variant={
                          paymentMethodSelected && paymentMethod === "bank_transfer"
                            ? "default"
                            : "outline"
                        }
                        className="min-h-11"
                        aria-pressed={paymentMethodSelected && paymentMethod === "bank_transfer"}
                        onClick={() => setPaymentMethod("bank_transfer")}
                        disabled={initialPaymentLocked}
                      >
                        Transfer Bank
                      </Button>
                      <Button
                        type="button"
                        variant={
                          paymentMethodSelected && paymentMethod === "cash" ? "default" : "outline"
                        }
                        className="min-h-11"
                        aria-pressed={paymentMethodSelected && paymentMethod === "cash"}
                        onClick={() => setPaymentMethod("cash")}
                        disabled={initialPaymentLocked}
                      >
                        Tunai
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {historicalEntryMode && !initialPaymentLocked
                        ? "Pembayaran yang dicatat Admin langsung terverifikasi. Transfer bank tetap wajib menyertakan bukti."
                        : "Tunai tercatat terverifikasi. Transfer bank wajib menyertakan bukti dan berstatus menunggu konfirmasi; keduanya tanpa payment gateway."}
                    </p>
                    {stagedDraftErrors?.method || errors?.paymentMethod ? (
                      <p
                        className="text-xs text-destructive"
                        data-validation-target="true"
                        role="alert"
                        tabIndex={-1}
                      >
                        {stagedDraftErrors?.method || errors?.paymentMethod}
                      </p>
                    ) : null}
                  </div>
                ) : !stagedPayment?.hideDraft ? (
                  <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    Pilih jenis pembayaran awal untuk melanjutkan ke metode pembayaran.
                  </p>
                ) : null}
                {!stagedPayment?.hideDraft && paymentChoiceSelected && paymentMethodSelected ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {!stagedPayment || stagedPayment.purpose === "rent" ? (
                        <div className="space-y-2">
                          <Label htmlFor="paid-rent">
                            {paymentChoice === "full"
                              ? "Jumlah pelunasan sewa"
                              : stagedPayment && stagedRentChoice === "Angsuran"
                                ? activeRentSequence > 1
                                  ? `Pembayaran Angsuran Sewa ke-${activeRentSequence}`
                                  : "Pembayaran Angsuran Sewa"
                                : stagedPayment
                                  ? "Uang Muka Sewa"
                                  : "DP / uang muka sewa"}
                            <span className="text-destructive"> *</span>
                          </Label>
                          <RupiahInput
                            id="paid-rent"
                            value={paidRent}
                            onValueChange={setPaidRent}
                            invalid={Boolean(stagedDraftErrors?.amount || errors?.paidRent)}
                            readOnly={paymentChoice === "full" || initialPaymentLocked}
                            onClear={
                              paymentChoice === "dp" && !initialPaymentLocked
                                ? () => {
                                    setPaidRent(0);
                                    setConfirmed(false);
                                  }
                                : undefined
                            }
                            clearLabel="Hapus nominal rekomendasi uang muka"
                          />
                          {paymentChoice === "full" ? (
                            <p className="text-xs text-muted-foreground">
                              {stagedPayment
                                ? `Terhitung otomatis dari sisa sewa ${currency(maximumRentPayment)}.`
                                : `Terhitung otomatis: total sewa dikurangi booking fee ${currency(bookingFee)}.`}
                            </p>
                          ) : !stagedPayment ? (
                            <p className="text-xs text-muted-foreground">
                              Rekomendasi DP 25% adalah {currency(amounts.minimumDp)}. Booking fee
                              menjadi kredit sewa; total pembayaran awal boleh disesuaikan, tetapi
                              wajib menutup minimal satu bulan sewa.
                            </p>
                          ) : null}
                          {stagedDraftErrors?.amount || errors?.paidRent ? (
                            <p className="text-xs text-destructive" role="alert">
                              {stagedDraftErrors?.amount || errors?.paidRent}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {!stagedPayment || stagedPayment.purpose === "booking_fee" ? (
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="booking-fee">Booking fee (opsional)</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <RupiahInput
                                id="booking-fee"
                                value={bookingFee}
                                onValueChange={setBookingFee}
                                invalid={Boolean(
                                  stagedDraftErrors?.amount ||
                                  bookingFeeBelowMinimum ||
                                  bookingFeeExceedsRent,
                                )}
                                readOnly={bookingFeeLocked}
                              />
                            </div>
                            <Button
                              type="button"
                              variant={bookingFee === 1_000_000 ? "default" : "outline"}
                              className="min-h-11"
                              onClick={() =>
                                setBookingFee(bookingFee === 1_000_000 ? 0 : 1_000_000)
                              }
                              disabled={bookingFeeLocked}
                            >
                              Rp1.000.000
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Isi bila calon penghuni telah membayar biaya penahanan kamar. Booking
                            fee menjadi kredit sewa: mengurangi DP atau pelunasan yang masih perlu
                            dibayar, bukan security deposit. Nilai yang diizinkan adalah Rp0 atau
                            minimal {currency(MINIMUM_BOOKING_FEE)}.
                          </p>
                          {stagedDraftErrors?.amount || errors?.bookingFee ? (
                            <p className="text-xs text-destructive">
                              {stagedDraftErrors?.amount || errors?.bookingFee}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {historicalEntryMode && !initialPaymentLocked ? (
                      <NoticeAlert
                        tone="warning"
                        density="compact"
                        title="Mode input data historis aktif"
                        description="Pembayaran tunai maupun transfer yang dicatat Admin langsung terverifikasi. Isi tanggal pembayaran sesuai bukti asli; fitur verifikasi manual tetap tersedia setelah mode ini dinonaktifkan."
                      />
                    ) : null}
                    {stagedPayment || historicalPaymentDateRequired ? (
                      <HeroUiDatePicker
                        id="payment-paid-at"
                        label="Tanggal pembayaran"
                        value={paymentPaidAt}
                        onChange={(value) => setPaymentPaidAt(value ?? "")}
                        required
                        validationTarget={Boolean(
                          stagedDraftErrors?.paidAt || errors?.paymentPaidAt,
                        )}
                        error={stagedDraftErrors?.paidAt || errors?.paymentPaidAt}
                        description="Gunakan tanggal dana diterima atau tanggal pada bukti pembayaran."
                      />
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="payment-note">Catatan pembayaran (opsional)</Label>
                      <Textarea
                        id="payment-note"
                        value={paymentNote}
                        onChange={(event) => setPaymentNote(event.target.value)}
                        maxLength={500}
                        placeholder="Contoh: transfer dari rekening orang tua"
                        disabled={initialPaymentLocked}
                      />
                      <p className="text-xs text-muted-foreground">
                        Catatan ini disimpan pada catatan pembayaran, bukan catatan onboarding atau
                        lease.
                      </p>
                    </div>
                    {paymentMethod === "bank_transfer" && !initialPaymentLocked ? (
                      <div className="space-y-2">
                        <EvidenceFileUploadField
                          propertyId={propertyId}
                          label="Bukti transfer"
                          description={
                            transferEvidenceRequired
                              ? "Wajib untuk Transfer Bank. Unggah JPG, PNG, WebP, atau PDF; foto besar dikompresi otomatis. Gunakan Lihat untuk memastikan bukti sudah benar."
                              : "Opsional selama mode input data historis aktif. Anda tetap dapat melampirkan maksimal 5 file JPG, PNG, WebP, atau PDF."
                          }
                          required={transferEvidenceRequired}
                          invalid={Boolean(stagedDraftErrors?.evidence || errors?.paymentEvidence)}
                          errorId="payment-evidence-error"
                          values={paymentEvidence}
                          onChange={onPaymentEvidenceChange}
                          onBusyChange={onPaymentEvidenceBusyChange}
                          disabled={!propertyId}
                          deleteOnRemove={!stagedPayment}
                          className="rounded-xl border border-border bg-muted/20 p-4"
                        />
                        {stagedDraftErrors?.evidence || errors?.paymentEvidence ? (
                          <p
                            className="text-xs text-destructive"
                            data-validation-target="true"
                            id="payment-evidence-error"
                            role="alert"
                            tabIndex={-1}
                          >
                            {stagedDraftErrors?.evidence || errors?.paymentEvidence}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {!stagedPayment && errors?.paidRent ? (
                      <NoticeAlert
                        tone="destructive"
                        density="compact"
                        title="Nominal pembayaran belum valid"
                        description={errors.paidRent}
                      />
                    ) : null}
                    {stagedPayment && !stagedPayment.hideDraft ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                        {stagedPayment.editingPaymentId ? (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={stagedPayment.onCancelEdit}
                          >
                            <X className="h-4 w-4" /> Batalkan edit
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          className="min-h-11"
                          disabled={paymentEvidenceBusy}
                          onClick={stagedPayment.onSave}
                        >
                          {stagedPayment.editingPaymentId ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {stagedPayment.editingPaymentId
                            ? "Simpan perubahan"
                            : `Tambahkan Pembayaran Tahap ${stagedPayment.entries.length + 1}`}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:self-start">
              <CardHeader>
                <CardTitle>Ringkasan Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {selectedRoom ? (
                  <div className="divide-y rounded-xl border bg-muted/10 px-4">
                    <div className="grid gap-2 py-4 sm:grid-cols-2">
                      <Summary label="Kamar" value={selectedRoom.number} />
                      <Summary label="Tipe kost" value={selectedRoom.kostType.name} />
                      <Summary
                        label={`Tarif acuan ${amounts.tierLabel}`}
                        value={`${currency(amounts.referenceMonthlyRate)} / bulan`}
                      />
                      <Summary
                        label={
                          pricingSource === "negotiated" ? "Tarif kesepakatan" : "Tarif kontrak"
                        }
                        value={`${currency(amounts.monthlyRate)} / bulan`}
                      />
                      <Summary label="Durasi sewa" value={`${termMonths} bulan`} />
                      <Summary
                        label="Tarif efektif"
                        value={formatIndonesianDate(selectedRoom.kostType.commercialEffectiveDate)}
                      />
                      {pricingSource === "negotiated" ? (
                        <div className="space-y-2 rounded-lg border border-warning/35 bg-warning/10 p-3 sm:col-span-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-warning">Kesepakatan khusus</span>
                            <span className="rounded-full bg-background/70 px-2.5 py-1 text-xs font-semibold text-foreground">
                              Selisih {pricingVariancePercent > 0 ? "+" : ""}
                              {pricingVariancePercent.toLocaleString("id-ID", {
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Catatan internal: {pricingAgreementReason.trim() || "Belum diisi"}
                          </p>
                          {materialPricingVariance ? (
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background/75 p-2.5 text-xs">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4"
                                checked={pricingVarianceAcknowledged}
                                onChange={(event) =>
                                  onPricingVarianceAcknowledged(event.target.checked)
                                }
                              />
                              <span>
                                Saya telah meninjau dan menyetujui selisih tarif 15% atau lebih dari
                                tarif acuan.
                              </span>
                            </label>
                          ) : null}
                          {pricingVarianceError ? (
                            <p className="text-xs font-medium text-destructive" role="alert">
                              {pricingVarianceError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Perhitungan sewa
                      </p>
                      <Summary label="Total sewa kontrak" value={currency(amounts.contractRent)} />
                      {paymentChoice === "dp" ? (
                        <Summary label="Rekomendasi DP 25%" value={currency(amounts.minimumDp)} />
                      ) : null}
                      <Summary
                        label="Booking fee (kredit sewa)"
                        value={`− ${currency(stagedPayment?.bookingFeeAmount ?? bookingFee)}`}
                      />
                      <Summary
                        label={
                          stagedPayment
                            ? "Total pembayaran sewa tersimpan"
                            : paymentChoice === "full"
                              ? "Pelunasan sewa hari ini"
                              : "DP / uang muka sewa hari ini"
                        }
                        value={`− ${currency(stagedPayment?.rentAmount ?? paidRent)}`}
                      />
                      <Summary
                        label={
                          stagedPayment
                            ? "Total kredit sewa tersimpan"
                            : "Total pembayaran awal sewa"
                        }
                        value={currency(
                          stagedPayment
                            ? stagedPayment.bookingFeeAmount + stagedPayment.rentAmount
                            : bookingFee + paidRent,
                        )}
                        emphasis
                      />
                      <Summary
                        label="Sisa pembayaran sewa"
                        value={currency(Math.max(0, amounts.contractRent - creditedRentAmount))}
                        emphasis
                      />
                      {stagedPayment?.contractFullyPaid ? (
                        <div className="flex justify-center py-3">
                          <div className="-rotate-2 rounded-lg border-2 border-success bg-success/10 px-7 py-2 text-center text-lg font-black tracking-[0.18em] text-success shadow-[0_4px_14px_rgba(16,185,129,0.16)]">
                            LUNAS
                          </div>
                        </div>
                      ) : stagedPayment?.recordedRentFullyPaid ? (
                        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
                          Tercatat penuh · menunggu verifikasi pembayaran
                        </p>
                      ) : null}
                      {rentCreditExceedsContract ? (
                        <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          Total booking fee dan DP/pelunasan melebihi nilai kontrak. Maksimal
                          pembayaran sewa yang masih dapat dicatat {currency(maximumRentPayment)}.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Jaminan kamar
                      </p>
                      <Summary
                        label="Target security deposit kontrak"
                        value={currency(amounts.securityDeposit)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Opsional dan tidak mengurangi sewa. Catat setelah penyewaan tersimpan
                        melalui tombol Catat Pembayaran Security Deposit pada card Tagihan.
                      </p>
                    </div>
                    <div className="space-y-2 py-4">
                      <Summary
                        label="Metode pembayaran"
                        value={
                          stagedPayment
                            ? stagedPayment.entries.length > 1
                              ? "Sesuai tiap tahap"
                              : stagedPayment.entries[0]
                                ? paymentMethodLabel(stagedPayment.entries[0].method)
                                : "Belum dicatat"
                            : paymentMethodLabel(paymentMethod)
                        }
                      />
                      <Summary
                        label="Status pembayaran awal"
                        value={
                          stagedPayment
                            ? stagedPayment.entries.length === 0
                              ? "Belum dicatat"
                              : stagedPayment.entries.every((entry) => entry.verified)
                                ? "Terverifikasi"
                                : "Menunggu konfirmasi"
                            : paymentVerified
                              ? "Terverifikasi"
                              : "Menunggu konfirmasi"
                        }
                      />
                      <Summary
                        label="Total pembayaran awal tercatat"
                        value={currency(
                          stagedPayment
                            ? stagedPayment.bookingFeeAmount + stagedPayment.rentAmount
                            : bookingFee + paidRent,
                        )}
                        emphasis
                      />
                      {!stagedPayment && paymentNote.trim() ? (
                        <Summary label="Catatan pembayaran" value={paymentNote.trim()} />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Pilih satu kamar untuk melihat ringkasan authority komersial.
                  </p>
                )}
                <label className="mt-4 flex cursor-pointer gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    aria-invalid={Boolean(errors?.confirmed)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    {commercialMode === "owner_sponsored"
                      ? "Saya meyakini data penghuni, kamar, Owner penanggung, dan biaya pengelolaan telah sesuai."
                      : "Saya meyakini data penghuni, kamar, dan seluruh pembayaran sewa telah sesuai. Security deposit bersifat opsional dan dicatat setelah kontrak tersimpan."}
                  </span>
                </label>
                {errors?.confirmed ? (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.confirmed}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              Hapus pembayaran tahap ini?
            </DialogTitle>
            <DialogDescription>
              {deleteCandidate
                ? `${paymentPurposeLabel(deleteCandidate.purpose)} sebesar ${currency(deleteCandidate.amount)} akan dihapus dari daftar sementara.`
                : "Pembayaran yang dihapus tidak akan ikut saat Commit Onboarding."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteCandidate(null)}
            >
              <X className="h-4 w-4" /> Batalkan
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteCandidate) stagedPayment?.onDelete(deleteCandidate);
                setDeleteCandidate(null);
              }}
            >
              <Trash2 className="h-4 w-4" /> Hapus pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={"text-right font-medium " + (emphasis ? "text-primary" : "")}>{value}</span>
    </div>
  );
}

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function RupiahInput({
  id,
  value,
  onValueChange,
  invalid = false,
  readOnly = false,
  onClear,
  clearLabel = "Hapus nominal",
}: {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  invalid?: boolean;
  readOnly?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const clearAndFocusInput = () => {
    onClear?.();
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  return (
    <div
      className={
        "flex min-h-11 overflow-hidden rounded-md border bg-background shadow-xs transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 " +
        (invalid ? "border-destructive focus-within:ring-destructive/25" : "border-input")
      }
    >
      <span className="flex items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground">
        Rp
      </span>
      <input
        ref={inputRef}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={formatIdrInput(value)}
        aria-invalid={invalid}
        readOnly={readOnly}
        className={
          "min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground " +
          (readOnly ? "cursor-not-allowed text-muted-foreground" : "")
        }
        onChange={(event) => onValueChange(normalizeDigits(event.target.value))}
      />
      {onClear && !readOnly ? (
        <button
          type="button"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-l border-destructive/20 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-inset"
          onClick={clearAndFocusInput}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
