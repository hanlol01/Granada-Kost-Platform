import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Check,
  Copy,
  Download,
  Home,
  KeyRound,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { FileUploadField } from "@/components/file/FileUploadField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useFileDelete, useFileUpload } from "@/hooks/useFileUpload";
import type { LeaseRoomOption } from "@/lib/admin-ux-lease-types";
import type { OnboardingPayload } from "@/lib/admin-onboarding";
import { downloadAdminReceiptDocument } from "@/lib/admin-w06-billing";
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
import type { FileResponse } from "@granada-kost/domain";

type Props = { onCreated: (leaseId: string) => void | Promise<void>; bookingLeadId?: string };
type Gender = "male" | "female";
type PaymentMethod = "cash" | "bank_transfer";
type PaymentChoice = "dp" | "full";

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
  const query = search.trim().toLocaleLowerCase("id-ID");
  return rooms.filter(
    (room) =>
      room.roomStatus === "vacant" &&
      (!category || room.kostType.category === category) &&
      (!gender || room.genderPolicy === gender || room.genderPolicy === "mixed") &&
      (!query ||
        [room.number, room.buildingName, room.buildingCode, room.kostType.name]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase("id-ID").includes(query))),
  );
}

function currency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
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
  const [paymentEvidence, setPaymentEvidence] = useState<FileResponse | null>(null);
  const [paymentEvidenceBusy, setPaymentEvidenceBusy] = useState(false);
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
  propertyScopeRef.current = currentPropertyId;
  const deferredRoomSearch = useDeferredValue(roomSearch);
  const rooms = useM6LeaseAvailableRooms(deferredRoomSearch);
  const bookingLeadContext = useBookingLeadCompletionContext(bookingLeadId);
  const bookingLeadQuote = useBookingLeadCompletionQuote(bookingLeadId, startDate, termMonths);
  const onboarding = useResidentOnboarding(setTemporaryPassword);
  const ktpUpload = useFileUpload({ silent: true });
  const ktpDelete = useFileDelete({ silent: true });
  const materializedResidentId = bookingLeadId
    ? completedBookingLeadResidentId(bookingLeadContext.error)
    : null;

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
    if (lastPropertyIdRef.current === currentPropertyId) return;
    lastPropertyIdRef.current = currentPropertyId;
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
    setPaymentEvidence(null);
    setPaymentEvidenceBusy(false);
    setKtpDocumentError(null);
    setServerStageOneErrors({});
    setAttemptedStepOne(false);
    setAttemptedSubmit(false);
    setConfirmed(false);
    setBookingFeePaymentChoiceSelected(!bookingLeadId);
    setBookingFeePaymentMethodSelected(!bookingLeadId);
  }, [currentPropertyId]);

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
  const selectedRoom =
    rooms.data?.items.find((room) => room.id === roomId) ??
    (heldRoom?.id === roomId ? heldRoom : undefined);
  const fallbackAmounts = calculateLeaseAmounts(selectedRoom, termMonths);
  const amounts =
    bookingLeadQuote.data && selectedRoom?.id === bookingLeadQuote.data.room.id
      ? {
          contractRent: bookingLeadQuote.data.contractRentAmount,
          minimumDp: bookingLeadQuote.data.suggestedDpAmount,
          securityDeposit: 0,
        }
      : fallbackAmounts;
  const bookingFeeExceedsRent = Boolean(selectedRoom) && bookingFee > amounts.contractRent;
  const totalRentCredit = bookingFee + paidRent;
  const leadCreditExceedsRent = Boolean(bookingLeadId) && totalRentCredit > amounts.contractRent;
  const bookingFeeBelowMinimum = bookingFee > 0 && bookingFee < MINIMUM_BOOKING_FEE;
  const paymentChoiceSelected = !bookingFeeLocked || bookingFeePaymentChoiceSelected;
  const paymentMethodSelected = !bookingFeeLocked || bookingFeePaymentMethodSelected;
  const creditedRentAmount = Math.min(amounts.contractRent, totalRentCredit);
  // The 25% figure remains a recommendation, while the activation policy now
  // requires at least one full month of rent credit before commitment.
  const requiredInitialRent =
    paymentChoice === "full" ? amounts.contractRent : (selectedRoom?.kostType.monthlyPrice ?? 0);
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
  const stageTwoValid =
    Boolean(selectedRoom) &&
    Number.isSafeInteger(securityDeposit) &&
    securityDeposit >= 0 &&
    Number.isSafeInteger(paidRent) &&
    paidRent >= 0 &&
    Number.isSafeInteger(bookingFee) &&
    bookingFee >= 0 &&
    !bookingFeeBelowMinimum &&
    !bookingFeeExceedsRent &&
    !leadCreditExceedsRent &&
    (!bookingLeadId || Boolean(bookingLeadQuote.data)) &&
    paymentChoiceSelected &&
    paymentMethodSelected &&
    creditedRentAmount >= requiredInitialRent &&
    (Boolean(bookingLeadId) || paymentMethod === "cash" || Boolean(paymentEvidence)) &&
    !paymentEvidenceBusy &&
    confirmed;

  const stageTwoErrors = {
    roomId: selectedRoom ? "" : "Pilih satu kamar kosong terlebih dahulu.",
    paidRent: leadCreditExceedsRent
      ? "Kredit pembayaran dari Minat Booking lebih besar dari total sewa periode baru. Batalkan atau sesuaikan Minat Booking terlebih dahulu."
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
    bookingFee: bookingFeeBelowMinimum
      ? `Booking fee bila diisi minimal ${currency(MINIMUM_BOOKING_FEE)} atau Rp0.`
      : bookingFeeExceedsRent
        ? "Booking fee tidak boleh melebihi total sewa kontrak."
        : "",
    paymentEvidence: paymentEvidenceBusy
      ? "Tunggu sampai bukti transfer selesai diproses."
      : bookingLeadId || paymentMethod === "cash" || paymentEvidence
        ? ""
        : "Bukti transfer wajib diunggah.",
    paymentChoice: paymentChoiceSelected
      ? ""
      : "Pilih rekomendasi DP 25% atau pelunasan sewa terlebih dahulu.",
    paymentMethod:
      !paymentChoiceSelected || paymentMethodSelected
        ? ""
        : "Pilih metode pembayaran terlebih dahulu.",
    confirmed: confirmed ? "" : "Konfirmasi data wajib dicentang sebelum disimpan.",
  };

  useEffect(() => {
    if (step === 1 && attemptedStepOne && !stageOneValid) {
      revealFirstValidationError();
    }
  }, [attemptedStepOne, stageOneErrors, stageOneValid, step]);

  useEffect(() => {
    if (step === 2 && attemptedSubmit && !stageTwoValid) {
      revealFirstValidationError();
    }
  }, [attemptedSubmit, stageTwoErrors, stageTwoValid, step]);

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

  const pickRoom = (room: LeaseRoomOption) => {
    setRoomId(room.id);
    setCategory(room.kostType.category);
    const nextAmounts = calculateLeaseAmounts(room, termMonths);
    setSecurityDeposit(0);
    setPaidRent(
      Math.max(
        0,
        (paymentChoice === "full"
          ? nextAmounts.contractRent
          : Math.max(nextAmounts.minimumDp, room.kostType.monthlyPrice)) - bookingFee,
      ),
    );
    setAttemptedSubmit(false);
    setConfirmed(false);
  };

  const changeTerm = (value: number) => {
    const safe = Number.isInteger(value) ? Math.max(3, Math.min(120, value)) : 3;
    setTermMonths(safe);
    if (!bookingLeadId) {
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
      setPaidRent(Math.max(0, required - bookingFee));
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

  const submit = async () => {
    setAttemptedSubmit(true);
    if (
      !currentPropertyId ||
      !selectedRoom ||
      !stageTwoValid ||
      !resident.gender ||
      paymentEvidenceBusy
    )
      return;
    const billingCycle = termMonths % 12 === 0 ? "yearly" : "monthly";
    const payload: OnboardingPayload = {
      property_id: currentPropertyId,
      booking_lead_id: bookingLeadId,
      room_id: selectedRoom.id,
      visitor_name: resident.fullName.trim(),
      visitor_phone: resident.phone.trim(),
      visitor_email: resident.email.trim(),
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
      payment_plan_type: paymentChoice === "full" ? "annual_full" : "monthly_installments",
      accepted_terms_version: "KMO-W05-v1",
      dp_verified_amount: paidRent,
      security_deposit_funded_amount: securityDeposit,
      booking_fee_paid_amount: bookingFee || undefined,
      payment_method: paymentMethod,
      payment_evidence_file_ids: paymentEvidence ? [paymentEvidence.id] : undefined,
      payment_note: paymentNote.trim() || undefined,
      notes: resident.notes.trim() || undefined,
    };
    try {
      await onboarding.mutateAsync(payload);
    } catch (error) {
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
                ? "Pembayaran tunai awal telah tercatat terverifikasi."
                : "Transfer awal menunggu konfirmasi di workspace Pembayaran; lease belum dapat diaktifkan."}
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
                      Email login
                    </dt>
                    <dd className="mt-1 break-all font-medium">{resident.email.trim()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nomor WhatsApp
                    </dt>
                    <dd className="mt-1 font-medium">{resident.phone.trim()}</dd>
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
                        `Login: ${resident.email.trim() || resident.phone.trim()}`,
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
                      variant={receipt.purpose === "dp" ? "success" : "outline"}
                      onClick={() => {
                        if (!currentPropertyId) return;
                        setReceiptDownloadError(null);
                        void downloadAdminReceiptDocument(
                          currentPropertyId,
                          receipt.id,
                          receipt.purpose === "dp"
                            ? "kuitansi-pembayaran-sewa-awal"
                            : "kuitansi-security-deposit",
                        ).catch((error: unknown) =>
                          setReceiptDownloadError(
                            error instanceof Error ? error.message : "Kuitansi gagal diunduh.",
                          ),
                        );
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {receipt.purpose === "dp"
                        ? "Unduh kuitansi pembayaran sewa"
                        : "Unduh kuitansi security deposit"}
                    </Button>
                  ))}
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
              setCategory(value);
              setRoomId("");
              setConfirmed(false);
            }}
            search={roomSearch}
            setSearch={setRoomSearch}
            rooms={bookingLeadId && heldRoom ? [heldRoom] : eligibleRooms}
            selectedRoom={selectedRoom}
            onPick={pickRoom}
            roomLocked={Boolean(bookingLeadId)}
            gender={resident.gender}
            termMonths={termMonths}
            amounts={amounts}
            paymentChoice={paymentChoice}
            onPaymentChoiceChange={changePaymentChoice}
            bookingFeeLocked={bookingFeeLocked}
            initialPaymentLocked={initialPaymentLocked}
            creditedRentAmount={creditedRentAmount}
            bookingFeeExceedsRent={bookingFeeExceedsRent}
            leadCreditExceedsRent={leadCreditExceedsRent}
            bookingFeeBelowMinimum={bookingFeeBelowMinimum}
            paymentChoiceSelected={paymentChoiceSelected}
            paymentMethodSelected={paymentMethodSelected}
            paymentMethod={paymentMethod}
            setPaymentMethod={(value) => {
              setPaymentMethod(value);
              if (bookingFeeLocked) setBookingFeePaymentMethodSelected(true);
              setConfirmed(false);
            }}
            paymentNote={paymentNote}
            setPaymentNote={setPaymentNote}
            propertyId={currentPropertyId ?? ""}
            paymentEvidence={paymentEvidence}
            onPaymentEvidenceChange={setPaymentEvidence}
            onPaymentEvidenceBusyChange={setPaymentEvidenceBusy}
            paidRent={paidRent}
            setPaidRent={setPaidRent}
            securityDeposit={securityDeposit}
            setSecurityDeposit={setSecurityDeposit}
            bookingFee={bookingFee}
            setBookingFee={changeBookingFee}
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
            variant="secondary"
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
              className="min-h-11"
              disabled={onboarding.isPending || paymentEvidenceBusy}
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
          {input("email", "Email untuk akses Penghuni", {
            type: "email",
            required: true,
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
  roomLocked,
  gender,
  termMonths,
  amounts,
  paymentChoice,
  onPaymentChoiceChange,
  bookingFeeLocked,
  initialPaymentLocked,
  creditedRentAmount,
  bookingFeeExceedsRent,
  leadCreditExceedsRent,
  bookingFeeBelowMinimum,
  paymentChoiceSelected,
  paymentMethodSelected,
  paymentMethod,
  setPaymentMethod,
  paymentNote,
  setPaymentNote,
  propertyId,
  paymentEvidence,
  onPaymentEvidenceChange,
  onPaymentEvidenceBusyChange,
  paidRent,
  setPaidRent,
  securityDeposit,
  setSecurityDeposit,
  bookingFee,
  setBookingFee,
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
  roomLocked: boolean;
  gender: Gender | "";
  termMonths: number;
  amounts: ReturnType<typeof calculateLeaseAmounts>;
  paymentChoice: PaymentChoice;
  onPaymentChoiceChange: (value: PaymentChoice) => void;
  bookingFeeLocked: boolean;
  initialPaymentLocked: boolean;
  creditedRentAmount: number;
  bookingFeeExceedsRent: boolean;
  leadCreditExceedsRent: boolean;
  bookingFeeBelowMinimum: boolean;
  paymentChoiceSelected: boolean;
  paymentMethodSelected: boolean;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (value: PaymentMethod) => void;
  paymentNote: string;
  setPaymentNote: (value: string) => void;
  propertyId: string;
  paymentEvidence: FileResponse | null;
  onPaymentEvidenceChange: (file: FileResponse | null) => void;
  onPaymentEvidenceBusyChange: (busy: boolean) => void;
  paidRent: number;
  setPaidRent: (value: number) => void;
  securityDeposit: number;
  setSecurityDeposit: (value: number) => void;
  bookingFee: number;
  setBookingFee: (value: number) => void;
  errors?: {
    roomId: string;
    paidRent: string;
    bookingFee: string;
    paymentEvidence: string;
    paymentChoice: string;
    paymentMethod: string;
    confirmed: string;
  };
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pilih kamar kosong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {roomLocked ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              Kamar dikunci dari Minat Booking yang telah ditahan. Ubah target melalui proses tahan
              kamar, bukan dari formulir ini.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Pilih kategori kost">
            {(["rukost", "apartkost"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={category === value ? "default" : "outline"}
                aria-pressed={category === value}
                className="h-14 w-full justify-start rounded-xl border px-5 text-left shadow-sm"
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
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pembayaran awal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentChoiceSelected && paymentChoice === "dp" ? "default" : "outline"}
                  className="min-h-11"
                  onClick={() => onPaymentChoiceChange("dp")}
                  disabled={initialPaymentLocked}
                >
                  Rekomendasi DP 25%
                </Button>
                <Button
                  type="button"
                  variant={
                    paymentChoiceSelected && paymentChoice === "full" ? "default" : "outline"
                  }
                  className="min-h-11"
                  onClick={() => onPaymentChoiceChange("full")}
                  disabled={initialPaymentLocked}
                >
                  Lunas sewa
                </Button>
              </div>
              {errors?.paymentChoice ? (
                <p
                  className="text-xs text-destructive"
                  data-validation-target="true"
                  role="alert"
                  tabIndex={-1}
                >
                  {errors.paymentChoice}
                </p>
              ) : null}
              {paymentChoiceSelected ? (
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
                        paymentMethodSelected && paymentMethod === "cash" ? "default" : "outline"
                      }
                      className="min-h-11"
                      aria-pressed={paymentMethodSelected && paymentMethod === "cash"}
                      onClick={() => setPaymentMethod("cash")}
                      disabled={initialPaymentLocked}
                    >
                      Tunai
                    </Button>
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
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tunai tercatat terverifikasi. Transfer bank wajib menyertakan bukti dan
                    berstatus menunggu konfirmasi; keduanya tanpa payment gateway.
                  </p>
                  {errors?.paymentMethod ? (
                    <p
                      className="text-xs text-destructive"
                      data-validation-target="true"
                      role="alert"
                      tabIndex={-1}
                    >
                      {errors.paymentMethod}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Pilih jenis pembayaran awal untuk melanjutkan ke metode pembayaran.
                </p>
              )}
              {paymentChoiceSelected && paymentMethodSelected ? (
                <>
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
                      <FileUploadField
                        propertyId={propertyId}
                        filePurpose="payment_proof"
                        label="Bukti transfer"
                        description="Wajib untuk Transfer Bank. Unggah JPG, PNG, WebP, atau PDF; foto besar dikompresi otomatis. Gunakan Lihat untuk memastikan bukti sudah benar."
                        required
                        value={paymentEvidence}
                        onChange={onPaymentEvidenceChange}
                        onBusyChange={onPaymentEvidenceBusyChange}
                        disabled={!propertyId}
                        capture="environment"
                        className="rounded-xl border border-border bg-muted/20 p-4"
                      />
                      {errors?.paymentEvidence ? (
                        <p
                          className="text-xs text-destructive"
                          data-validation-target="true"
                          role="alert"
                          tabIndex={-1}
                        >
                          {errors.paymentEvidence}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="paid-rent">
                        {paymentChoice === "full" ? "Jumlah pelunasan sewa" : "DP / uang muka sewa"}
                        <span className="text-destructive"> *</span>
                      </Label>
                      <RupiahInput
                        id="paid-rent"
                        value={paidRent}
                        onValueChange={setPaidRent}
                        invalid={Boolean(errors?.paidRent)}
                        readOnly={paymentChoice === "full" || initialPaymentLocked}
                      />
                      <p className="text-xs text-muted-foreground">
                        {paymentChoice === "full"
                          ? `Terhitung otomatis: total sewa dikurangi booking fee ${currency(bookingFee)}.`
                          : `Rekomendasi DP 25% adalah ${currency(amounts.minimumDp)}. Booking fee menjadi kredit sewa; total pembayaran awal boleh disesuaikan, tetapi wajib menutup minimal satu bulan sewa.`}
                      </p>
                      {errors?.paidRent ? (
                        <p className="text-xs text-destructive" role="alert">
                          {errors.paidRent}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deposit">Security deposit</Label>
                      <RupiahInput
                        id="deposit"
                        value={securityDeposit}
                        onValueChange={setSecurityDeposit}
                        readOnly={initialPaymentLocked}
                      />
                      <p className="text-xs text-muted-foreground">
                        Uang jaminan kamar. Opsional, bebas diisi, dan terpisah dari DP.
                      </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="booking-fee">Booking fee (opsional)</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <RupiahInput
                            id="booking-fee"
                            value={bookingFee}
                            onValueChange={setBookingFee}
                            invalid={bookingFeeBelowMinimum || bookingFeeExceedsRent}
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
                        menjadi kredit sewa: mengurangi DP atau pelunasan yang masih perlu dibayar,
                        bukan security deposit. Nilai yang diizinkan adalah Rp0 atau minimal{" "}
                        {currency(MINIMUM_BOOKING_FEE)}.
                      </p>
                      {errors?.bookingFee ? (
                        <p className="text-xs text-destructive">{errors.bookingFee}</p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
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
                      value={`− ${currency(bookingFee)}`}
                    />
                    <Summary
                      label={
                        paymentChoice === "full"
                          ? "Pelunasan sewa hari ini"
                          : "DP / uang muka sewa hari ini"
                      }
                      value={`− ${currency(paidRent)}`}
                    />
                    <Summary
                      label="Total pembayaran awal sewa"
                      value={currency(bookingFee + paidRent)}
                      emphasis
                    />
                    <Summary
                      label="Sisa pembayaran sewa"
                      value={currency(Math.max(0, amounts.contractRent - creditedRentAmount))}
                      emphasis
                    />
                    {leadCreditExceedsRent ? (
                      <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Kredit pembayaran Minat Booking melebihi total sewa periode yang dipilih.
                        Gunakan periode yang sesuai atau lakukan penyesuaian melalui Minat Booking.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Jaminan kamar
                    </p>
                    <Summary label="Security deposit tercatat" value={currency(securityDeposit)} />
                    <p className="text-xs text-muted-foreground">
                      Security deposit bukan pengurang sewa. Nilai ini dicatat sebagai jaminan dan
                      menjadi pengingat pengembalian saat checkout sesuai pemeriksaan kamar.
                    </p>
                  </div>
                  <div className="space-y-2 py-4">
                    <Summary
                      label="Metode pembayaran"
                      value={paymentMethod === "cash" ? "Tunai" : "Transfer Bank"}
                    />
                    <Summary
                      label="Status pembayaran awal"
                      value={paymentMethod === "cash" ? "Terverifikasi" : "Menunggu konfirmasi"}
                    />
                    <Summary
                      label="Total pembayaran awal tercatat"
                      value={currency(bookingFee + paidRent + securityDeposit)}
                      emphasis
                    />
                    {paymentNote.trim() ? (
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
                  Saya meyakini data penghuni, kamar, DP, dan security deposit telah sesuai.
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
