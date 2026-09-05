/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useM6LeaseAvailableRooms } from "@/hooks/useAdminUxLeases";
import {
  useBookingLeadCompletionContext,
  useBookingLeadCompletionQuote,
} from "@/hooks/useBookingLeadCompletion";
import { completedBookingLeadResidentId } from "@/lib/admin-booking-lead-completion";
import { useResidentOnboarding } from "@/hooks/useResidentOnboarding";
import { useAdminPaymentVerificationPolicy } from "@/hooks/useAdminBilling";
import { useFileDelete, useFileUpload } from "@/hooks/useFileUpload";
import type { LeaseRoomOption } from "@/lib/admin-ux-lease-types";
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

type Props = { onCreated: (leaseId: string) => void | Promise<void>; bookingLeadId?: string };
type Gender = "male" | "female";
type PaymentMethod = "cash" | "bank_transfer";
type PaymentChoice = "dp" | "full";
type PaymentEntryPurpose = "rent" | "booking_fee" | "security_deposit";

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
  securityDepositAmount: number;
  recordedRentFullyPaid: boolean;
  contractFullyPaid: boolean;
  hasUnsavedDraft: boolean;
  hideDraft: boolean;
  rentPurposeDisabled: boolean;
  recentlyAddedPaymentId: string | null;
  securityDepositPromptVisible: boolean;
  optionalSecurityDepositDraftOpen: boolean;
  onOpenSecurityDeposit: () => void;
  onCancelSecurityDeposit: () => void;
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

function calculateLeaseAmounts(room: LeaseRoomOption | undefined, termMonths: number) {
  if (!room || !Number.isInteger(termMonths) || termMonths < 3)
    return { contractRent: 0, minimumDp: 0, securityDeposit: 0 };
  const contractRent =
    termMonths % 12 === 0
      ? room.kostType.yearlyPrice * (termMonths / 12)
      : room.kostType.monthlyPrice * termMonths;
  return {
    contractRent,
    minimumDp: Math.ceil(contractRent * 0.25),
    securityDeposit: 0,
  };
}

function eligibleVacantRooms(
  rooms: LeaseRoomOption[],
  category: "rukost" | "apartkost" | "",
  gender: Gender | "",
  search: string,
) {
  const query = normalizeRoomSearch(search);
  return rooms.filter(
    (room) =>
      room.roomStatus === "vacant" &&
      (!category || room.kostType.category === category) &&
      (!gender || room.genderPolicy === gender || room.genderPolicy === "mixed") &&
      (!query ||
        [room.number, room.buildingName, room.buildingCode, room.kostType.name]
          .filter((value): value is string => Boolean(value))
          .some((value) => normalizeRoomSearch(value).includes(query))),
  );
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
  if (purpose === "security_deposit") return "Security Deposit";
  return "Pembayaran sewa";
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

export function LeaseCreatePage({ onCreated, bookingLeadId }: Props) {
  const { currentPropertyId } = useProperty();
  const navigate = useNavigate();
  const pageTitle = bookingLeadId ? "Tambah Penyewaan dari Minat Booking" : "Tambah Penyewaan";
  const [step, setStep] = useState<1 | 2>(1);
  const [resident, setResident] = useState<ResidentDraft>(EMPTY_RESIDENT);
  const [startDate, setStartDate] = useState("");
  const [termMonths, setTermMonths] = useState(3);
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
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [bookingFee, setBookingFee] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState<FileResponse[]>([]);
  const [paymentEvidenceBusy, setPaymentEvidenceBusy] = useState(false);
  const [paymentPurpose, setPaymentPurpose] = useState<PaymentEntryPurpose>("rent");
  const [paymentEntries, setPaymentEntries] = useState<StagedPaymentEntry[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [recentlyAddedPaymentId, setRecentlyAddedPaymentId] = useState<string | null>(null);
  const [optionalSecurityDepositDraftOpen, setOptionalSecurityDepositDraftOpen] = useState(false);
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
  const rooms = useM6LeaseAvailableRooms(deferredRoomSearch, startDate || undefined);
  const bookingLeadContext = useBookingLeadCompletionContext(bookingLeadId);
  const bookingLeadQuote = useBookingLeadCompletionQuote(bookingLeadId, startDate, termMonths);
  const onboarding = useResidentOnboarding(setTemporaryPassword);
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
    setSecurityDeposit(context.paymentCommitment.securityDepositAmount);
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
    setPaidRent(0);
    setSecurityDeposit(0);
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
    setOptionalSecurityDepositDraftOpen(false);
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
  const heldRoom = bookingRoom
    ? ({
        id: bookingRoom.id,
        number: bookingRoom.number,
        genderPolicy: bookingRoom.genderPolicy as LeaseRoomOption["genderPolicy"],
        roomStatus: "vacant",
        kostType: {
          id: bookingRoom.kostTypeId,
          name: bookingRoom.category === "rukost" ? "Rumah Kost" : "Apart Kost",
          category: bookingRoom.category,
          monthlyPrice: bookingRoom.monthlyPrice,
          yearlyPrice: bookingRoom.yearlyPrice,
          depositAmount: 0,
        },
      } satisfies LeaseRoomOption)
    : undefined;
  const leadPaymentType = bookingLeadContext.data?.paymentCommitment.paymentType;
  const bookingFeeLocked = Boolean(bookingLeadId && leadPaymentType === "booking_fee");
  const initialPaymentLocked = Boolean(
    bookingLeadId && leadPaymentType && leadPaymentType !== "booking_fee",
  );
  const historicalPaymentDateRequired = historicalEntryMode && !initialPaymentLocked;
  const selectedRoom =
    rooms.data?.items.find((room) => room.id === roomId) ??
    (heldRoom?.id === roomId ? heldRoom : undefined);
  const commercialPricingPending = Boolean(startDate && rooms.isPlaceholderData);
  const fallbackAmounts = calculateLeaseAmounts(selectedRoom, termMonths);
  const amounts =
    bookingLeadQuote.data && selectedRoom?.id === bookingLeadQuote.data.room.id
      ? {
          contractRent: bookingLeadQuote.data.contractRentAmount,
          minimumDp: bookingLeadQuote.data.suggestedDpAmount,
          securityDeposit: 0,
        }
      : fallbackAmounts;
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
  const stagedSecurityDepositAmount = paymentEntries.reduce(
    (total, entry) => total + (entry.purpose === "security_deposit" ? entry.amount : 0),
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
  const otherSecurityDepositAmount = stagedEntriesOutsideEdit.reduce(
    (total, entry) => total + (entry.purpose === "security_deposit" ? entry.amount : 0),
    0,
  );
  const draftAmount =
    paymentPurpose === "rent"
      ? paidRent
      : paymentPurpose === "booking_fee"
        ? bookingFee
        : securityDeposit;
  const prospectiveRentCredit =
    otherRentAmount +
    otherBookingFeeAmount +
    (paymentPurpose === "rent" || paymentPurpose === "booking_fee" ? draftAmount : 0);
  const prospectiveSecurityDeposit =
    otherSecurityDepositAmount + (paymentPurpose === "security_deposit" ? draftAmount : 0);
  const summaryRentAmount = stagedPaymentMode ? stagedRentAmount : paidRent;
  const summaryBookingFeeAmount = stagedPaymentMode ? stagedBookingFeeAmount : bookingFee;
  const summarySecurityDepositAmount = stagedPaymentMode
    ? stagedSecurityDepositAmount
    : securityDeposit;
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
  const maximumSecurityDeposit =
    selectedRoom && termMonths > 0 ? Math.floor(amounts.contractRent / termMonths) : 0;
  const securityDepositExceedsMaximum =
    Boolean(selectedRoom) &&
    (stagedPaymentMode ? prospectiveSecurityDeposit : securityDeposit) > maximumSecurityDeposit;
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
    ? (selectedRoom?.kostType.monthlyPrice ?? 0)
    : paymentChoice === "full"
      ? amounts.contractRent
      : (selectedRoom?.kostType.monthlyPrice ?? 0);
  const stagedRentPayments = paymentEntries.filter(
    (entry) => entry.purpose === "rent" || entry.purpose === "booking_fee",
  );
  const stagedRentVerified =
    stagedRentPayments.length > 0 && stagedRentPayments.every((entry) => entry.verified);
  const recordedRentFullyPaid =
    amounts.contractRent > 0 && totalRentCredit === amounts.contractRent;
  const contractFullyPaid = recordedRentFullyPaid && stagedRentVerified;
  const hasSecurityDepositStage = paymentEntries.some(
    (entry) => entry.purpose === "security_deposit",
  );
  const hideStagedPaymentDraft =
    stagedPaymentMode &&
    contractFullyPaid &&
    !optionalSecurityDepositDraftOpen &&
    editingPaymentId === null;
  const rentPurposeDisabled = recordedRentFullyPaid && editingPaymentId === null;
  const hasUnsavedPaymentDraft =
    optionalSecurityDepositDraftOpen ||
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
        : (paymentPurpose === "booking_fee" || paymentPurpose === "security_deposit") &&
            duplicatePurpose
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
            : securityDepositExceedsMaximum
              ? `Security deposit melebihi batas maksimal ${currency(maximumSecurityDeposit)}.`
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
  const eligibleRooms = eligibleVacantRooms(
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
  const stageOneValid = Object.keys(stageOneErrors).length === 0;
  const onboardingNotice = onboarding.error ? onboardingErrorNotice(onboarding.error) : null;
  const stageTwoValid = stagedPaymentMode
    ? Boolean(selectedRoom) &&
      paymentEntries.length > 0 &&
      totalRentCredit >= requiredInitialRent &&
      totalRentCredit <= amounts.contractRent &&
      stagedSecurityDepositAmount <= maximumSecurityDeposit &&
      !hasUnsavedPaymentDraft &&
      !commercialPricingPending &&
      !paymentEvidenceBusy &&
      confirmed
    : Boolean(selectedRoom) &&
      Number.isSafeInteger(securityDeposit) &&
      securityDeposit >= 0 &&
      Number.isSafeInteger(paidRent) &&
      paidRent >= 0 &&
      Number.isSafeInteger(bookingFee) &&
      bookingFee >= 0 &&
      !bookingFeeBelowMinimum &&
      !bookingFeeExceedsRent &&
      !rentCreditExceedsContract &&
      !securityDepositExceedsMaximum &&
      !commercialPricingPending &&
      Boolean(bookingLeadQuote.data) &&
      paymentChoiceSelected &&
      paymentMethodSelected &&
      creditedRentAmount >= requiredInitialRent &&
      (!transferEvidenceRequired || paymentEvidence.length > 0) &&
      (!historicalPaymentDateRequired || Boolean(paymentPaidAt)) &&
      !paymentEvidenceBusy &&
      confirmed;

  useEffect(() => {
    if (
      !stagedPaymentMode ||
      !recordedRentFullyPaid ||
      hasSecurityDepositStage ||
      editingPaymentId !== null ||
      paymentPurpose !== "rent"
    )
      return;
    setPaymentPurpose("security_deposit");
    setPaidRent(0);
    setSecurityDeposit(0);
    setBookingFee(0);
    setPaymentDraftAttempted(false);
  }, [
    editingPaymentId,
    hasSecurityDepositStage,
    paymentPurpose,
    recordedRentFullyPaid,
    stagedPaymentMode,
  ]);

  const stageTwoErrors = {
    roomId: selectedRoom ? "" : "Pilih satu kamar kosong terlebih dahulu.",
    paidRent: stagedPaymentMode
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
    bookingFee: stagedPaymentMode
      ? ""
      : bookingFeeBelowMinimum
        ? `Booking fee bila diisi minimal ${currency(MINIMUM_BOOKING_FEE)} atau Rp0.`
        : bookingFeeExceedsRent
          ? "Booking fee tidak boleh melebihi total sewa kontrak."
          : "",
    securityDeposit: stagedPaymentMode
      ? ""
      : securityDepositExceedsMaximum
        ? `Security deposit melebihi batas. Nominalnya opsional mulai Rp0 dan maksimal ${currency(maximumSecurityDeposit)}.`
        : "",
    paymentEvidence: stagedPaymentMode
      ? ""
      : paymentEvidenceBusy
        ? "Tunggu sampai bukti transfer selesai diproses."
        : !transferEvidenceRequired || paymentEvidence.length > 0
          ? ""
          : "Bukti transfer wajib diunggah.",
    paymentPaidAt: stagedPaymentMode
      ? ""
      : !historicalPaymentDateRequired || paymentPaidAt
        ? ""
        : "Tanggal pembayaran wajib diisi selama mode input data historis aktif.",
    paymentChoice: stagedPaymentMode
      ? ""
      : paymentChoiceSelected
        ? ""
        : "Pilih rekomendasi DP 25% atau pelunasan sewa terlebih dahulu.",
    paymentMethod: stagedPaymentMode
      ? ""
      : !paymentChoiceSelected || paymentMethodSelected
        ? ""
        : "Pilih metode pembayaran terlebih dahulu.",
    confirmed: confirmed ? "" : "Konfirmasi data wajib dicentang sebelum disimpan.",
    payments: !stagedPaymentMode
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
    if (!stagedPaymentMode || (paymentEntries.length === 0 && !hasUnsavedPaymentDraft)) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedPaymentDraft, paymentEntries.length, stagedPaymentMode]);

  const setDraft = <Key extends keyof ResidentDraft>(key: Key, value: ResidentDraft[Key]) => {
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
    setSecurityDeposit(0);
    setBookingFee(0);
    setPaymentNote("");
    setPaymentEvidence([]);
    setEditingPaymentId(null);
    setPaymentDraftAttempted(false);
  };

  const openOptionalSecurityDepositStage = () => {
    clearPaymentDraft();
    setPaymentPurpose("security_deposit");
    setOptionalSecurityDepositDraftOpen(true);
    setConfirmed(false);
  };

  const cancelOptionalSecurityDepositStage = () => {
    clearPaymentDraft();
    setOptionalSecurityDepositDraftOpen(false);
    scrollToPaymentSection();
  };

  const cancelPaymentEdit = () => {
    clearPaymentDraft();
    scrollToPaymentSection();
  };

  const pickRoom = (room: LeaseRoomOption) => {
    if (stagedPaymentMode && paymentEntries.length > 0 && roomId && room.id !== roomId) return;
    const replacingUnavailableRoom = stagedPaymentMode && paymentEntries.length > 0 && !roomId;
    setRoomId(room.id);
    setCategory(room.kostType.category);
    const nextAmounts = calculateLeaseAmounts(room, termMonths);
    if (replacingUnavailableRoom) {
      clearPaymentDraft();
    } else if (stagedPaymentMode) {
      setPaymentEntries([]);
      setEditingPaymentId(null);
      setExpandedPaymentId(null);
      setRecentlyAddedPaymentId(null);
      setOptionalSecurityDepositDraftOpen(false);
      setPaymentPurpose("rent");
      setPaymentPaidAt("");
      setPaymentNote("");
      setPaymentEvidence([]);
    }
    if (!replacingUnavailableRoom) {
      setSecurityDeposit(0);
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
    const safe = Number.isInteger(value) ? Math.max(3, Math.min(120, value)) : 3;
    setTermMonths(safe);
    if (!bookingLeadId) {
      setPaymentEntries([]);
      setEditingPaymentId(null);
      setExpandedPaymentId(null);
      setRecentlyAddedPaymentId(null);
      setOptionalSecurityDepositDraftOpen(false);
      setPaymentPurpose("rent");
      setPaymentPaidAt("");
      setPaymentNote("");
      setPaymentEvidence([]);
      const nextAmounts = calculateLeaseAmounts(selectedRoom, safe);
      setSecurityDeposit(0);
      setPaidRent(
        Math.max(
          0,
          (paymentChoice === "full"
            ? nextAmounts.contractRent
            : Math.max(nextAmounts.minimumDp, selectedRoom?.kostType.monthlyPrice ?? 0)) -
            bookingFee,
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
    setSecurityDeposit(0);
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
    if (paymentPurpose === "security_deposit") setOptionalSecurityDepositDraftOpen(false);
    clearPaymentDraft();
    setConfirmed(false);
    scrollToPaymentSection();
  };

  const editPaymentStage = (entry: StagedPaymentEntry) => {
    setOptionalSecurityDepositDraftOpen(false);
    setEditingPaymentId(entry.id);
    setExpandedPaymentId(entry.id);
    setPaymentPurpose(entry.purpose);
    setPaidRent(entry.purpose === "rent" ? entry.amount : 0);
    setBookingFee(entry.purpose === "booking_fee" ? entry.amount : 0);
    setSecurityDeposit(entry.purpose === "security_deposit" ? entry.amount : 0);
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
    if (entry.purpose === "security_deposit") setOptionalSecurityDepositDraftOpen(false);
    setConfirmed(false);
  };

  const submit = async () => {
    setAttemptedSubmit(true);
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
      billing_cycle: billingCycle,
      payment_plan_type:
        totalRentCredit === amounts.contractRent ? "annual_full" : "monthly_installments",
      accepted_terms_version: "KMO-W05-v1",
      dp_verified_amount: stagedPaymentMode ? 0 : paidRent,
      security_deposit_funded_amount: stagedPaymentMode ? 0 : securityDeposit,
      booking_fee_paid_amount: stagedPaymentMode ? undefined : bookingFee || undefined,
      payment_method: stagedPaymentMode ? "cash" : paymentMethod,
      payment_paid_at: stagedPaymentMode ? undefined : paymentPaidAt || undefined,
      payment_evidence_file_ids:
        !stagedPaymentMode && paymentEvidence.length > 0
          ? paymentEvidence.map((file) => file.id)
          : undefined,
      payment_note: stagedPaymentMode ? undefined : paymentNote.trim() || undefined,
      payment_entries: stagedPaymentMode
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
        subtitle="Lease masih menunggu aktivasi; kamar belum menjadi occupied."
      >
        <Card className="mx-auto max-w-3xl border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success" /> Siap untuk aktivasi terpisah
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  Unduh kuitansi untuk setiap uang yang telah diterima. Kuitansi security deposit
                  tetap terpisah dari pembayaran sewa.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onboarding.data.initialPayment.receipts.map((receipt) => (
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
        <StageIndicator step={step} />
        {step === 1 ? (
          <ResidentAndLeaseStep
            propertyId={currentPropertyId}
            resident={resident}
            setDraft={setDraft}
            startDate={startDate}
            onStartDate={changeStartDate}
            termMonths={termMonths}
            onTermMonths={changeTerm}
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
            leaseTermsLocked={false}
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
            rooms={bookingLeadId && heldRoom ? [heldRoom] : eligibleRooms}
            selectedRoom={selectedRoom}
            onPick={pickRoom}
            paymentSectionRef={paymentSectionRef}
            roomLocked={Boolean(bookingLeadId) || (stagedPaymentMode && paymentEntries.length > 0)}
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
            paymentChoice={paymentChoice}
            onPaymentChoiceChange={changePaymentChoice}
            bookingFeeLocked={bookingFeeLocked}
            initialPaymentLocked={initialPaymentLocked}
            creditedRentAmount={creditedRentAmount}
            bookingFeeExceedsRent={bookingFeeExceedsRent}
            rentCreditExceedsContract={rentCreditExceedsContract}
            maximumRentPayment={maximumRentPayment}
            maximumSecurityDeposit={maximumSecurityDeposit}
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
            securityDeposit={securityDeposit}
            setSecurityDeposit={setSecurityDeposit}
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
                    securityDepositAmount: stagedSecurityDepositAmount,
                    recordedRentFullyPaid,
                    contractFullyPaid,
                    hasUnsavedDraft: hasUnsavedPaymentDraft,
                    hideDraft: hideStagedPaymentDraft,
                    rentPurposeDisabled,
                    recentlyAddedPaymentId,
                    securityDepositPromptVisible:
                      contractFullyPaid &&
                      !hasSecurityDepositStage &&
                      !optionalSecurityDepositDraftOpen &&
                      editingPaymentId === null,
                    optionalSecurityDepositDraftOpen,
                    onOpenSecurityDeposit: openOptionalSecurityDepositStage,
                    onCancelSecurityDeposit: cancelOptionalSecurityDepositStage,
                  }
                : null
            }
            errors={attemptedSubmit ? stageTwoErrors : undefined}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
          />
        )}
        {onboardingNotice ? (
          <NoticeAlert
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
            disabled={step === 1 || onboarding.isPending}
            onClick={() => setStep(1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              className="min-h-11"
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
                paymentEvidenceBusy ||
                (!bookingLeadId && verificationPolicy.isLoading)
              }
              onClick={() => void submit()}
            >
              {onboarding.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Commit Onboarding
            </Button>
          )}
        </div>
      </div>
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
  setDraft,
  startDate,
  onStartDate,
  termMonths,
  onTermMonths,
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
  setDraft: <Key extends keyof ResidentDraft>(key: Key, value: ResidentDraft[Key]) => void;
  startDate: string;
  onStartDate: (value: string) => void;
  termMonths: number;
  onTermMonths: (value: number) => void;
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
            disabled={leaseTermsLocked}
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
                Tanggal mulai dan durasi di bawah dapat disesuaikan bila kesepakatan calon penghuni
                berubah. Kamar yang ditahan serta pembayaran awal tetap menjadi acuan Minat Booking.
              </p>
              {bookingPeriodChanged ? (
                <p className="mt-3 border-t border-primary/20 pt-3 text-sm font-medium text-foreground">
                  Periode baru: {startDate ? formatIndonesianDate(startDate) : "belum dipilih"} ·{" "}
                  {termMonths} bulan · berakhir{" "}
                  {endDate ? formatIndonesianDate(endDate) : "belum dihitung"}. Jumlah sewa dan sisa
                  pembayaran akan dihitung ulang, lalu diverifikasi server saat penyewaan dikomit.
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
                min={3}
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
                    className="min-h-11 px-2"
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
            </div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Tanggal Sewa Berakhir</p>
            <p className="mt-2 text-base font-semibold tabular-nums">
              {endDate ? formatDateWithDashes(endDate) : "—"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {endDate ? formatIndonesianDate(endDate) : "Pilih tanggal mulai dan durasi sewa."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Durasi sewa: {termMonths >= 3 ? `${termMonths} bulan` : "belum valid"}.
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
                className={errors.gender ? "border-destructive focus:ring-destructive" : undefined}
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
    </div>
  );
}

function RoomAndPaymentStep({
  category,
  setCategory,
  search,
  setSearch,
  rooms,
  selectedRoom,
  onPick,
  paymentSectionRef,
  roomLocked,
  roomLockMessage,
  gender,
  termMonths,
  amounts,
  paymentChoice,
  onPaymentChoiceChange,
  bookingFeeLocked,
  initialPaymentLocked,
  creditedRentAmount,
  bookingFeeExceedsRent,
  rentCreditExceedsContract,
  maximumRentPayment,
  maximumSecurityDeposit,
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
  securityDeposit,
  setSecurityDeposit,
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
  selectedRoom?: LeaseRoomOption;
  onPick: (room: LeaseRoomOption) => void;
  paymentSectionRef: { current: HTMLDivElement | null };
  roomLocked: boolean;
  roomLockMessage?: string;
  gender: Gender | "";
  termMonths: number;
  amounts: ReturnType<typeof calculateLeaseAmounts>;
  paymentChoice: PaymentChoice;
  onPaymentChoiceChange: (value: PaymentChoice) => void;
  bookingFeeLocked: boolean;
  initialPaymentLocked: boolean;
  creditedRentAmount: number;
  bookingFeeExceedsRent: boolean;
  rentCreditExceedsContract: boolean;
  maximumRentPayment: number;
  maximumSecurityDeposit: number;
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
  securityDeposit: number;
  setSecurityDeposit: (value: number) => void;
  bookingFee: number;
  setBookingFee: (value: number) => void;
  stagedPayment: StagedPaymentController | null;
  errors?: {
    roomId: string;
    paidRent: string;
    securityDeposit: string;
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
  const hasOtherSecurityDeposit =
    stagedPayment?.entries.some(
      (entry) =>
        entry.purpose === "security_deposit" && entry.id !== stagedPayment.editingPaymentId,
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
  const editorRef = useRef<HTMLDivElement>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<StagedPaymentEntry | null>(null);
  useEffect(() => {
    if (!stagedPayment?.editingPaymentId && !stagedPayment?.optionalSecurityDepositDraftOpen)
      return;
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [stagedPayment?.editingPaymentId, stagedPayment?.optionalSecurityDepositDraftOpen]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pilih kamar kosong</CardTitle>
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
              placeholder="Cari nomor kamar atau bangunan"
              aria-label="Cari kamar kosong"
              className="pl-9"
              autoComplete="off"
              disabled={roomLocked}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Hanya kamar kosong yang sesuai gender {gender === "male" ? "Putra" : "Putri"} dan
            kategori pilihan yang ditampilkan.
          </p>
          <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-1" aria-live="polite">
            <div className="grid gap-3 md:grid-cols-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => !roomLocked && onPick(room)}
                  aria-disabled={roomLocked || undefined}
                  className={
                    "min-h-28 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (selectedRoom?.id === room.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/50")
                  }
                >
                  <p className="font-semibold">{room.number}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {room.kostType.name} · {room.buildingName ?? room.buildingCode ?? "Bangunan"}
                  </p>
                  <p className="mt-2 text-xs">{currency(room.kostType.monthlyPrice)} / bulan</p>
                </button>
              ))}
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
          {rooms.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Tidak ada kamar kosong yang sesuai. Ubah kategori atau kata kunci pencarian.
            </p>
          ) : null}
        </CardContent>
      </Card>
      {selectedRoom ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <Card
            ref={paymentSectionRef}
            tabIndex={-1}
            className="min-w-0 scroll-mt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <CardHeader>
              <CardTitle>Pemenuhan pembayaran sebelum aktivasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {bookingFeeLocked ? (
                <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                  Booking Fee dari Minat Booking telah dikunci sebagai kredit sewa. Lengkapi DP atau
                  pelunasan di bawah ini.
                </p>
              ) : null}
              {initialPaymentLocked ? (
                <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                  Komitmen pembayaran awal dari Minat Booking telah tercatat dan tidak dapat diubah
                  pada formulir ini. Periode final tetap dapat disesuaikan sebelum commitment
                  onboarding disimpan.
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
                        const isLastEntry = index === stagedPayment.entries.length - 1;
                        const entriesThroughStage = stagedPayment.entries.slice(0, index + 1);
                        const rentSequence = entriesThroughStage.filter(
                          (item) => item.purpose === "rent",
                        ).length;
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
                              ? "Pelunasan sewa"
                              : rentSequence === 1
                                ? "DP / uang muka sewa"
                                : `Angsuran sewa ke-${rentSequence}`;
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
                                  Status: {entry.verified ? "Terverifikasi" : "Menunggu konfirmasi"}
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
                            {isLastEntry && stagedPayment.securityDepositPromptVisible ? (
                              <div className="flex flex-col gap-3 border-t border-success/25 bg-success/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                                  <CheckCircle2
                                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    Sewa kontrak sudah lunas. Tambahkan security deposit hanya jika
                                    pembayaran jaminan juga perlu dicatat.
                                  </span>
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-11 w-full shrink-0 whitespace-nowrap border-primary/50 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary sm:w-auto"
                                  onClick={stagedPayment.onOpenSecurityDeposit}
                                  aria-label="Tambahkan pembayaran security deposit"
                                >
                                  <Plus className="h-4 w-4" aria-hidden="true" />
                                  Tambah Security Deposit
                                </Button>
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
                      {stagedPayment.optionalSecurityDepositDraftOpen ? (
                        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 text-sm font-semibold text-foreground">
                          <CheckCircle2
                            className="h-4 w-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                          Tujuan tahap ini: Security Deposit
                        </div>
                      ) : (
                        <div
                          className="grid gap-2 sm:grid-cols-3"
                          role="group"
                          aria-label="Tujuan pembayaran"
                        >
                          {(["rent", "booking_fee", "security_deposit"] as const).map((purpose) => (
                            <Button
                              key={purpose}
                              type="button"
                              variant={stagedPayment.purpose === purpose ? "default" : "outline"}
                              className="min-h-11"
                              disabled={
                                (purpose === "rent" && stagedPayment.rentPurposeDisabled) ||
                                (purpose === "booking_fee" &&
                                  (hasOtherBookingFee || hasRecordedRent)) ||
                                (purpose === "security_deposit" && hasOtherSecurityDeposit)
                              }
                              onClick={() => stagedPayment.onPurposeChange(purpose)}
                            >
                              {paymentPurposeLabel(purpose)}
                            </Button>
                          ))}
                        </div>
                      )}
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
              {!stagedPayment?.hideDraft && (!stagedPayment || stagedPayment.purpose === "rent") ? (
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
                    {stagedPayment ? "Penuhi DP 25%" : "Rekomendasi DP 25%"}
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
                            : stagedPayment && activeRentSequence > 1
                              ? `Pembayaran angsuran sewa ke-${activeRentSequence}`
                              : "DP / uang muka sewa"}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <RupiahInput
                          id="paid-rent"
                          value={paidRent}
                          onValueChange={setPaidRent}
                          invalid={Boolean(stagedDraftErrors?.amount || errors?.paidRent)}
                          readOnly={paymentChoice === "full" || initialPaymentLocked}
                        />
                        <p className="text-xs text-muted-foreground">
                          {paymentChoice === "full"
                            ? stagedPayment
                              ? `Terhitung otomatis dari sisa sewa ${currency(maximumRentPayment)}.`
                              : `Terhitung otomatis: total sewa dikurangi booking fee ${currency(bookingFee)}.`
                            : stagedPayment
                              ? `Target DP 25% adalah ${currency(amounts.minimumDp)}. Tombol di atas hanya mengisi kekurangan dari pembayaran yang sudah tersimpan.`
                              : `Rekomendasi DP 25% adalah ${currency(amounts.minimumDp)}. Booking fee menjadi kredit sewa; total pembayaran awal boleh disesuaikan, tetapi wajib menutup minimal satu bulan sewa.`}
                        </p>
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
                            onClick={() => setBookingFee(bookingFee === 1_000_000 ? 0 : 1_000_000)}
                            disabled={bookingFeeLocked}
                          >
                            Rp1.000.000
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Isi bila calon penghuni telah membayar biaya penahanan kamar. Booking fee
                          menjadi kredit sewa: mengurangi DP atau pelunasan yang masih perlu
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
                    {!stagedPayment || stagedPayment.purpose === "security_deposit" ? (
                      <div className="space-y-2">
                        <Label htmlFor="deposit">Security deposit</Label>
                        <RupiahInput
                          id="deposit"
                          value={securityDeposit}
                          onValueChange={setSecurityDeposit}
                          invalid={Boolean(stagedDraftErrors?.amount || errors?.securityDeposit)}
                          readOnly={initialPaymentLocked}
                        />
                        <p className="text-xs text-muted-foreground">
                          Opsional. Minimal Rp0 dan maksimal {currency(maximumSecurityDeposit)}
                          (setara satu bulan berdasarkan nilai kontrak). Nominal ini terpisah dari
                          DP.
                        </p>
                        {stagedDraftErrors?.amount || errors?.securityDeposit ? (
                          <p className="text-xs text-destructive" role="alert">
                            {stagedDraftErrors?.amount || errors?.securityDeposit}
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
                      validationTarget={Boolean(stagedDraftErrors?.paidAt || errors?.paymentPaidAt)}
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
                  {!stagedPayment && (errors?.paidRent || errors?.securityDeposit) ? (
                    <NoticeAlert
                      tone="destructive"
                      density="compact"
                      title="Nominal pembayaran belum valid"
                      description={errors.securityDeposit || errors.paidRent}
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
                      ) : stagedPayment.optionalSecurityDepositDraftOpen ? (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={stagedPayment.onCancelSecurityDeposit}
                        >
                          <X className="h-4 w-4" /> Batal tambah deposit
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
                      label="Tarif bulanan"
                      value={currency(selectedRoom.kostType.monthlyPrice)}
                    />
                    <Summary label="Durasi sewa" value={`${termMonths} bulan`} />
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
                        stagedPayment ? "Total kredit sewa tersimpan" : "Total pembayaran awal sewa"
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
                      label="Security deposit tercatat"
                      value={currency(stagedPayment?.securityDepositAmount ?? securityDeposit)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Security deposit bukan pengurang sewa. Nilai ini dicatat sebagai jaminan dan
                      menjadi pengingat pengembalian saat checkout sesuai pemeriksaan kamar.
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
                          ? stagedPayment.bookingFeeAmount +
                              stagedPayment.rentAmount +
                              stagedPayment.securityDepositAmount
                          : bookingFee + paidRent + securityDeposit,
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
                  Saya meyakini data penghuni, kamar, seluruh pembayaran, dan security deposit telah
                  sesuai.
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
}: {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  invalid?: boolean;
  readOnly?: boolean;
}) {
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
    </div>
  );
}
