/* Hallmark · pre-emit critique: P5 H5 E5 S5 R4 V4 */
/* Hallmark · macrostructure: focused transactional dialog · theme: existing KOSTATION system · contrast/mobile/responsive: pass */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { UniversityCombobox } from "@/components/forms/UniversityCombobox";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
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
import { Label } from "@/components/ui/label";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { CurrencyInput } from "@/components/ui/currency-input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  useBookingLeadCompletionQuote,
  useCompleteBookingLead,
} from "@/hooks/useBookingLeadCompletion";
import { useAdminPaymentVerificationPolicy } from "@/hooks/useAdminBilling";
import type { BookingLeadRecord } from "@/lib/admin-booking-lead";
import type {
  LeadInitialPaymentType,
  LeadPaymentCommitment,
} from "@/lib/admin-booking-lead-completion";
import { downloadBookingLeadCommitmentNote } from "@/lib/admin-booking-lead-completion";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { revealFirstValidationError } from "@/lib/validation-focus";
import type { FileResponse } from "@granada-kost/domain";

type Props = {
  open: boolean;
  lead: BookingLeadRecord | null;
  onOpenChange: (value: boolean) => void;
  onComplete: (leadId: string, commitment: LeadPaymentCommitment) => void;
};

function endDate(start: string, months: number): string {
  if (!start || !Number.isInteger(months) || months < 1 || months > 120) return "";
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

function formatIndonesianDate(value: string): string {
  if (!value) return "Belum tersedia";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Belum tersedia";
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "Belum tersedia";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

const FIXED_BOOKING_FEE = 1_000_000;

export function CompleteBookingLeadDialog({ open, lead, onOpenChange, onComplete }: Props) {
  const { currentPropertyId } = useProperty();
  const mutation = useCompleteBookingLead();
  const idempotencyKeyRef = useRef<string | null>(null);
  const formScopeRef = useRef<HTMLDivElement>(null);
  const [receipt, setReceipt] = useState<LeadPaymentCommitment | null>(null);
  const [paymentType, setPaymentType] = useState<LeadInitialPaymentType>("booking_fee");
  const [startDate, setStartDate] = useState("");
  const [termMonths, setTermMonths] = useState(3);
  const [pricingSource, setPricingSource] = useState<"standard" | "negotiated">("standard");
  const [agreedMonthlyPrice, setAgreedMonthlyPrice] = useState(0);
  const [pricingAgreementReason, setPricingAgreementReason] = useState("");
  const [pricingVarianceAcknowledged, setPricingVarianceAcknowledged] = useState(false);
  const [pricingResetOpen, setPricingResetOpen] = useState(false);
  const [rentCredit, setRentCredit] = useState(1_000_000);
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentPaidAt, setPaymentPaidAt] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorUniversity, setVisitorUniversity] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState<FileResponse[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const quote = useBookingLeadCompletionQuote(open ? lead?.id : null, startDate, termMonths);
  const verificationPolicy = useAdminPaymentVerificationPolicy(currentPropertyId);
  const historicalEntryMode = verificationPolicy.data?.automaticVerificationActive === true;

  useEffect(() => {
    if (!open) return;
    setReceipt(null);
    setPaymentType("booking_fee");
    setStartDate(lead?.preferredMoveInDate ?? "");
    setTermMonths(3);
    setPricingSource("standard");
    setAgreedMonthlyPrice(0);
    setPricingAgreementReason("");
    setPricingVarianceAcknowledged(false);
    setPricingResetOpen(false);
    setRentCredit(FIXED_BOOKING_FEE);
    setSecurityDeposit(0);
    setPaymentMethod("cash");
    setPaymentPaidAt("");
    setPaymentNote("");
    setVisitorName(lead?.visitorName ?? "");
    setVisitorPhone(lead?.visitorPhone ?? "");
    setVisitorUniversity(lead?.visitorUniversity ?? "");
    setPaymentEvidence([]);
    setEvidenceBusy(false);
    setSubmitAttempted(false);
    idempotencyKeyRef.current = null;
  }, [
    open,
    lead?.id,
    lead?.preferredMoveInDate,
    lead?.visitorName,
    lead?.visitorPhone,
    lead?.visitorUniversity,
  ]);

  const billingCycle = termMonths % 12 === 0 ? "yearly" : "monthly";
  const referenceMonthlyPrice = quote.data?.referenceMonthlyPrice ?? 0;
  const managementFeeAmount = quote.data?.managementFeeAmount ?? 0;
  const effectiveMonthlyPrice =
    pricingSource === "negotiated" ? agreedMonthlyPrice : referenceMonthlyPrice;
  const totalRent =
    Number.isSafeInteger(effectiveMonthlyPrice) && effectiveMonthlyPrice > 0
      ? effectiveMonthlyPrice * termMonths
      : 0;
  const suggestedDp = Math.ceil(totalRent * 0.25);
  const pricingVarianceAmount = agreedMonthlyPrice - referenceMonthlyPrice;
  const pricingVarianceBasisPoints =
    referenceMonthlyPrice > 0
      ? Math.round((pricingVarianceAmount * 10_000) / referenceMonthlyPrice)
      : 0;
  const requiresVarianceAcknowledgement = Math.abs(pricingVarianceBasisPoints) >= 1_500;
  const displayedCredit =
    paymentType === "booking_fee"
      ? FIXED_BOOKING_FEE
      : paymentType === "full_settlement"
        ? totalRent
        : rentCredit;
  const error = !startDate
    ? "Tanggal mulai sewa wajib diisi."
    : !Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 120
      ? "Durasi sewa harus antara 1 sampai 120 bulan."
      : quote.isLoading
        ? "Memuat tarif kamar yang ditahan."
        : quote.isError || !quote.data
          ? "Tarif kamar yang ditahan belum dapat dimuat. Tutup dialog lalu periksa kembali status hold kamar."
          : pricingSource === "standard" && termMonths < 3
            ? "Durasi 1 atau 2 bulan wajib menggunakan kesepakatan khusus."
            : pricingSource === "negotiated" &&
                (!Number.isSafeInteger(agreedMonthlyPrice) || agreedMonthlyPrice <= 0)
              ? "Tarif bulanan kesepakatan harus lebih besar dari Rp0."
              : pricingSource === "negotiated" && agreedMonthlyPrice <= managementFeeAmount
                ? `Tarif bulanan harus lebih besar dari management fee ${formatIDR(managementFeeAmount)}.`
                : pricingSource === "negotiated" && pricingAgreementReason.trim().length < 3
                  ? "Alasan kesepakatan khusus minimal 3 karakter untuk audit internal."
                  : pricingSource === "negotiated" &&
                      requiresVarianceAcknowledgement &&
                      !pricingVarianceAcknowledged
                    ? "Konfirmasi selisih tarif 15% atau lebih sebelum menyimpan."
                    : historicalEntryMode && !paymentPaidAt
                      ? "Tanggal pembayaran wajib diisi selama mode input data historis aktif."
                      : displayedCredit <= 0
                        ? "Pembayaran awal harus lebih besar dari Rp0."
                        : totalRent > 0 && displayedCredit > totalRent
                          ? `Pembayaran awal tidak boleh melebihi total sewa ${formatIDR(totalRent)}.`
                          : paymentMethod === "bank_transfer" && paymentEvidence.length === 0
                            ? "Bukti transfer wajib diunggah minimal 1 file."
                            : null;

  useEffect(() => {
    if (submitAttempted && error) {
      revealFirstValidationError(formScopeRef.current);
    }
  }, [error, submitAttempted]);

  useEffect(() => {
    if (termMonths < 3 && pricingSource !== "negotiated") {
      setPricingSource("negotiated");
    }
  }, [pricingSource, termMonths]);

  useEffect(() => {
    if (pricingSource === "negotiated" && agreedMonthlyPrice === 0 && referenceMonthlyPrice > 0) {
      setAgreedMonthlyPrice(referenceMonthlyPrice);
    }
  }, [agreedMonthlyPrice, pricingSource, referenceMonthlyPrice]);

  useEffect(() => {
    setPricingVarianceAcknowledged(false);
  }, [agreedMonthlyPrice, pricingSource, referenceMonthlyPrice, termMonths]);

  const choosePaymentType = (next: LeadInitialPaymentType) => {
    setPaymentType(next);
    setRentCredit(
      next === "booking_fee"
        ? FIXED_BOOKING_FEE
        : next === "down_payment"
          ? suggestedDp
          : totalRent,
    );
  };

  const submit = async () => {
    setSubmitAttempted(true);
    if (!lead || !currentPropertyId || error || evidenceBusy) return;
    const commitment = await mutation.mutateAsync({
      leadId: lead.id,
      idempotencyKey:
        idempotencyKeyRef.current ?? (idempotencyKeyRef.current = newIdempotencyKey()),
      input: {
        propertyId: currentPropertyId,
        startDate,
        termMonths,
        billingCycle: termMonths % 12 === 0 ? "yearly" : "monthly",
        paymentPlanType: paymentType === "full_settlement" ? "annual_full" : "monthly_installments",
        pricingSource,
        agreedMonthlyPrice: pricingSource === "negotiated" ? agreedMonthlyPrice : undefined,
        pricingAgreementReason: pricingSource === "negotiated" ? pricingAgreementReason : undefined,
        pricingVarianceAcknowledged:
          pricingSource === "negotiated" ? pricingVarianceAcknowledged : undefined,
        paymentType,
        rentCreditAmount: displayedCredit,
        securityDepositAmount: securityDeposit,
        paymentMethod,
        paymentPaidAt: paymentPaidAt || undefined,
        paymentEvidenceFileIds:
          paymentEvidence.length > 0 ? paymentEvidence.map((file) => file.id) : undefined,
        paymentNote,
        visitorName,
        visitorPhone,
        visitorUniversity,
      },
    });
    setReceipt(commitment);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => !mutation.isPending && !evidenceBusy && onOpenChange(next)}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {receipt ? "Minat Booking siap dilengkapi" : "Selesaikan Minat Booking"}
            </DialogTitle>
            <DialogDescription>
              {receipt
                ? "Kamar dan komitmen pembayaran telah disimpan. Penghuni belum aktif dan kamar belum dihuni."
                : "Catat komitmen pembayaran awal setelah tahan kamar. Nilai akhir selalu dihitung ulang oleh sistem."}
            </DialogDescription>
          </DialogHeader>

          {receipt ? (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
              <p className="font-medium">Komitmen pembayaran berhasil dicatat</p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-muted-foreground">Periode sewa</dt>
                  <dd>
                    {receipt.startDate} – {receipt.endDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status pembayaran</dt>
                  <dd>
                    {receipt.verificationStatus === "verified"
                      ? "Terverifikasi"
                      : "Menunggu konfirmasi"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Kredit sewa</dt>
                  <dd>{formatIDR(receipt.rentCreditAmount)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tarif kontrak</dt>
                  <dd>{formatIDR(receipt.agreedMonthlyPrice)} / bulan</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sumber tarif</dt>
                  <dd>
                    {receipt.pricingSource === "negotiated" ? "Kesepakatan khusus" : "Standar"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Security deposit</dt>
                  <dd>{formatIDR(receipt.securityDepositAmount)}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-success/20 pt-3 text-muted-foreground">
                Nota komitmen pembayaran ini dapat diunduh sekarang. Kuitansi riwayat penghuni
                diterbitkan setelah data penyewaan dikomit.
              </p>
            </div>
          ) : lead ? (
            <div ref={formScopeRef} className="grid gap-6">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                <b>{lead.visitorName}</b>
                <span className="mx-2 text-muted-foreground">·</span>
                {lead.roomNumber ?? "Kamar yang ditahan"}
              </div>

              <section className="grid gap-4" aria-label="Data calon penghuni">
                <div>
                  <h3 className="text-base font-semibold">Data calon penghuni</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Perbarui informasi ini bila ada perubahan sebelum minat booking diselesaikan.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Nama calon penghuni
                    <Input
                      value={visitorName}
                      onChange={(event) => setVisitorName(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Nomor WhatsApp
                    <Input
                      inputMode="numeric"
                      value={visitorPhone}
                      onChange={(event) => setVisitorPhone(event.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                    Universitas / pendidikan{" "}
                    <span className="font-normal text-muted-foreground">(opsional)</span>
                    <UniversityCombobox
                      id="complete-booking-lead-university"
                      value={visitorUniversity}
                      propertyId={currentPropertyId}
                      onChange={setVisitorUniversity}
                    />
                  </label>
                </div>
              </section>

              <section
                className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5"
                aria-label="Periode sewa"
              >
                <div>
                  <h3 className="text-base font-semibold">Periode sewa</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pilih tanggal mulai dan durasi untuk menghitung tanggal sewa berakhir.
                  </p>
                </div>
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                  <HeroUiDatePicker
                    id="booking-lead-start-date"
                    label="Tanggal mulai sewa"
                    required
                    value={startDate || undefined}
                    onChange={(value) => setStartDate(value ?? "")}
                    error={!startDate ? "Tanggal mulai sewa wajib diisi." : undefined}
                    className="min-w-0 self-start gap-2"
                    triggerClassName="h-11 min-h-11"
                  />
                  <label className="grid min-w-0 content-start self-start gap-2 text-sm font-medium leading-none">
                    Durasi sewa (bulan)
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={termMonths}
                      onChange={(event) =>
                        setTermMonths(Math.max(0, Number(event.target.value) || 0))
                      }
                      className="h-11 min-h-11"
                      aria-invalid={termMonths < 1 || termMonths > 120}
                    />
                    <div className="grid grid-cols-3 gap-2" aria-label="Pilihan cepat durasi sewa">
                      {[3, 6, 12].map((months) => (
                        <Button
                          key={months}
                          type="button"
                          variant={termMonths === months ? "default" : "outline"}
                          className="min-h-11 w-full border border-primary/60 px-2 hover:border-primary"
                          onClick={() => setTermMonths(months)}
                        >
                          {months} bulan
                        </Button>
                      ))}
                    </div>
                  </label>
                </div>
                {lead.preferredMoveInDate && startDate && lead.preferredMoveInDate !== startDate ? (
                  <NoticeAlert
                    tone="info"
                    density="compact"
                    title="Tanggal rencana masuk diperbarui"
                    description={`Tarif, tanggal akhir, durasi, total sewa, dan pembayaran awal dihitung ulang untuk ${formatIndonesianDate(startDate)}.`}
                  />
                ) : null}
                <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-4 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Tanggal sewa berakhir</p>
                  <p className="mt-1 text-lg font-semibold" aria-live="polite">
                    {formatIndonesianDate(quote.data?.endDate ?? endDate(startDate, termMonths))}
                  </p>
                </div>
              </section>

              <section
                className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
                aria-label="Tarif sewa"
              >
                <div>
                  <h3 className="text-base font-semibold">Tarif sewa</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gunakan tarif standar atau catat kesepakatan khusus yang disetujui calon
                    penghuni.
                  </p>
                </div>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="group"
                  aria-label="Sumber tarif sewa"
                >
                  <Button
                    type="button"
                    variant={pricingSource === "standard" ? "default" : "outline"}
                    className="min-h-11 w-full whitespace-nowrap"
                    disabled={termMonths < 3}
                    onClick={() => {
                      if (pricingSource === "negotiated") setPricingResetOpen(true);
                    }}
                  >
                    Tarif standar
                  </Button>
                  <Button
                    type="button"
                    variant={pricingSource === "negotiated" ? "default" : "outline"}
                    className="min-h-11 w-full whitespace-nowrap"
                    onClick={() => {
                      setPricingSource("negotiated");
                      if (agreedMonthlyPrice === 0 && referenceMonthlyPrice > 0) {
                        setAgreedMonthlyPrice(referenceMonthlyPrice);
                      }
                    }}
                  >
                    Kesepakatan khusus
                  </Button>
                </div>
                {termMonths < 3 ? (
                  <NoticeAlert
                    tone="info"
                    density="compact"
                    title="Durasi singkat menggunakan kesepakatan khusus"
                    description="Sewa 1 atau 2 bulan tidak memakai tarif standar. Pastikan tarif dan alasannya sudah disetujui calon penghuni."
                  />
                ) : null}
                <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Tarif pembanding</p>
                    <p className="mt-1 font-semibold">{formatIDR(referenceMonthlyPrice)} / bulan</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-medium text-muted-foreground">Nilai kontrak</p>
                    <p className="mt-1 text-lg font-semibold text-primary">
                      {formatIDR(totalRent)}
                    </p>
                  </div>
                </div>
                {pricingSource === "negotiated" ? (
                  <div className="grid gap-4">
                    <label className="grid gap-2 text-sm font-medium">
                      <span>
                        Tarif bulanan yang disepakati
                        <span className="text-destructive"> *</span>
                      </span>
                      <CurrencyInput
                        aria-label="Tarif bulanan yang disepakati"
                        value={agreedMonthlyPrice}
                        onValueChange={setAgreedMonthlyPrice}
                        formatOnChange
                        error={
                          submitAttempted &&
                          (!Number.isSafeInteger(agreedMonthlyPrice) ||
                            agreedMonthlyPrice <= managementFeeAmount)
                        }
                      />
                      <span className="font-normal text-muted-foreground">
                        Harus lebih besar dari management fee {formatIDR(managementFeeAmount)} per
                        bulan.
                      </span>
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      <span>
                        Alasan kesepakatan khusus<span className="text-destructive"> *</span>
                      </span>
                      <Textarea
                        className="min-h-24 resize-y"
                        value={pricingAgreementReason}
                        onChange={(event) => setPricingAgreementReason(event.target.value)}
                        maxLength={500}
                        aria-invalid={submitAttempted && pricingAgreementReason.trim().length < 3}
                        aria-describedby="booking-lead-pricing-reason-help"
                      />
                      <span
                        id="booking-lead-pricing-reason-help"
                        className="font-normal text-muted-foreground"
                      >
                        Catatan ini hanya terlihat oleh Admin dan disimpan sebagai jejak
                        kesepakatan.
                      </span>
                    </label>
                    <NoticeAlert
                      tone={pricingVarianceAmount === 0 ? "info" : "warning"}
                      density="compact"
                      title={
                        pricingVarianceAmount === 0
                          ? "Tarif sama dengan pembanding"
                          : `Selisih ${formatIDR(Math.abs(pricingVarianceAmount))} (${Math.abs(
                              pricingVarianceBasisPoints / 100,
                            ).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%)`
                      }
                      description={
                        pricingVarianceAmount < 0
                          ? "Tarif kesepakatan lebih rendah dari tarif pembanding."
                          : pricingVarianceAmount > 0
                            ? "Tarif kesepakatan lebih tinggi dari tarif pembanding."
                            : "Kesepakatan khusus tetap membutuhkan alasan meskipun nominalnya sama."
                      }
                    />
                    {requiresVarianceAcknowledgement ? (
                      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-warning/35 bg-warning/10 p-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                          checked={pricingVarianceAcknowledged}
                          onChange={(event) => setPricingVarianceAcknowledged(event.target.checked)}
                        />
                        <span>
                          Saya sudah memeriksa tarif, selisih, durasi, dan total nilai kontrak ini.
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="grid gap-4" aria-label="Pembayaran awal">
                <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:grid-cols-2 sm:items-end">
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Kamar yang ditahan
                    </span>
                    <span className="font-semibold">
                      {quote.data ? quote.data.room.number : "Memuat kamar..."}
                    </span>
                  </div>
                  <div className="grid gap-1 sm:text-right">
                    <span className="text-xs font-medium text-muted-foreground">
                      Tarif per bulan
                    </span>
                    <span className="font-semibold">
                      {quote.data ? formatIDR(effectiveMonthlyPrice) : "Belum tersedia"}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Durasi sewa</span>
                    <span className="font-semibold">{termMonths || 0} bulan</span>
                  </div>
                  <div className="grid gap-1 sm:text-right">
                    <span className="text-xs font-medium text-muted-foreground">
                      Total sewa kontrak
                    </span>
                    <span className="text-lg font-semibold text-primary">
                      {quote.data ? formatIDR(totalRent) : "Belum tersedia"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    Rekomendasi DP 25%: {quote.data ? formatIDR(suggestedDp) : "Belum tersedia"}.
                    Security deposit dicatat terpisah dan tidak mengurangi total sewa.
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-semibold">Pembayaran awal</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Catat komitmen pembayaran yang diterima saat minat booking diselesaikan.
                  </p>
                </div>
                <fieldset className="grid gap-2.5">
                  <legend className="text-sm font-medium">Jenis pembayaran awal</legend>
                  <div
                    className="grid gap-2 sm:grid-cols-3"
                    role="group"
                    aria-label="Jenis pembayaran awal"
                  >
                    {(["booking_fee", "down_payment", "full_settlement"] as const).map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={paymentType === value ? "default" : "outline"}
                        className="min-h-11 w-full px-3"
                        onClick={() => choosePaymentType(value)}
                      >
                        {value === "booking_fee"
                          ? "Booking Fee"
                          : value === "down_payment"
                            ? "DP / Uang Muka"
                            : "Pelunasan Langsung"}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    {paymentType === "full_settlement"
                      ? "Jumlah pelunasan sewa"
                      : paymentType === "down_payment"
                        ? "DP / uang muka sewa"
                        : "Booking Fee"}
                    <CurrencyInput
                      aria-label={
                        paymentType === "full_settlement"
                          ? "Jumlah pelunasan sewa"
                          : paymentType === "down_payment"
                            ? "DP atau uang muka sewa"
                            : "Booking Fee"
                      }
                      value={displayedCredit}
                      readOnly={paymentType !== "down_payment"}
                      onValueChange={setRentCredit}
                      error={displayedCredit <= 0 || (totalRent > 0 && displayedCredit > totalRent)}
                    />
                    <span className="font-normal text-muted-foreground">
                      {paymentType === "booking_fee"
                        ? "Nilai tetap Rp1.000.000 dan menjadi kredit sewa."
                        : paymentType === "down_payment"
                          ? `Rekomendasi 25%: ${formatIDR(suggestedDp)}. Nominal di atas Rp0 tetap dapat dicatat.`
                          : "Nilai pelunasan dihitung otomatis dari total sewa."}
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Security deposit
                    <CurrencyInput
                      aria-label="Security deposit"
                      value={securityDeposit}
                      onValueChange={setSecurityDeposit}
                    />
                    <span className="font-normal text-muted-foreground">
                      Jaminan kamar; tidak mengurangi sisa sewa.
                    </span>
                  </label>
                </div>
                <fieldset className="grid gap-2.5">
                  <legend className="text-sm font-medium">Metode pembayaran</legend>
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="group"
                    aria-label="Metode pembayaran"
                  >
                    <Button
                      type="button"
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      className="min-h-11 w-full"
                      onClick={() => setPaymentMethod("cash")}
                    >
                      Tunai
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMethod === "bank_transfer" ? "default" : "outline"}
                      className="min-h-11 w-full"
                      onClick={() => setPaymentMethod("bank_transfer")}
                    >
                      Transfer Bank
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {historicalEntryMode
                      ? "Pembayaran yang dicatat Admin akan langsung terverifikasi. Bukti transfer tetap wajib diunggah."
                      : "Bukti transfer wajib diunggah. Transfer akan menunggu konfirmasi dan memblokir aktivasi kamar."}
                  </p>
                </fieldset>
                {historicalEntryMode ? (
                  <NoticeAlert
                    tone="warning"
                    density="compact"
                    title="Mode input data historis aktif"
                    description="Pembayaran tunai maupun transfer yang dicatat Admin langsung terverifikasi. Isi tanggal pembayaran sesuai bukti asli; fitur verifikasi manual tetap tersedia setelah mode ini dinonaktifkan."
                  />
                ) : null}
                {historicalEntryMode ? (
                  <HeroUiDatePicker
                    id="booking-lead-payment-date"
                    label="Tanggal pembayaran"
                    value={paymentPaidAt}
                    onChange={(value) => setPaymentPaidAt(value ?? "")}
                    required
                    validationTarget={submitAttempted && !paymentPaidAt}
                    error={
                      submitAttempted && !paymentPaidAt
                        ? "Tanggal pembayaran wajib diisi."
                        : undefined
                    }
                    description="Gunakan tanggal dana diterima atau tanggal pada bukti pembayaran."
                  />
                ) : null}
                {paymentMethod === "bank_transfer" ? (
                  <EvidenceFileUploadField
                    propertyId={currentPropertyId ?? ""}
                    label="Bukti transfer"
                    description="Unggah JPG, PNG, WebP, atau PDF. Foto besar dikompresi otomatis; gunakan Lihat untuk memeriksa file sebelum menyimpan."
                    values={paymentEvidence}
                    onChange={setPaymentEvidence}
                    onBusyChange={setEvidenceBusy}
                    disabled={!currentPropertyId || mutation.isPending}
                    capture="environment"
                    required
                    invalid={submitAttempted && paymentEvidence.length === 0}
                    errorId="complete-booking-lead-error"
                    className="rounded-xl border border-border bg-muted/20 p-4"
                  />
                ) : null}
                <label className="grid gap-1.5 text-sm font-medium">
                  Catatan pembayaran{" "}
                  <span className="font-normal text-muted-foreground">(opsional)</span>
                  <Textarea
                    className="min-h-20 resize-y"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    maxLength={500}
                  />
                </label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p>
                    Total sewa <b>{formatIDR(totalRent)}</b>
                  </p>
                  <p>
                    Sisa pembayaran sewa{" "}
                    <b>{formatIDR(Math.max(0, totalRent - displayedCredit))}</b>
                  </p>
                </div>
                {submitAttempted && error ? (
                  <p
                    id="complete-booking-lead-error"
                    data-validation-target="true"
                    role="alert"
                    tabIndex={-1}
                    className="text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </section>
            </div>
          ) : null}
          <DialogFooter>
            {receipt ? (
              <>
                <Button
                  variant="success"
                  onClick={() =>
                    currentPropertyId && lead
                      ? void downloadBookingLeadCommitmentNote({
                          propertyId: currentPropertyId,
                          leadId: lead.id,
                        })
                      : undefined
                  }
                  disabled={!currentPropertyId || !lead}
                >
                  <Download className="mr-2 h-4 w-4" /> Unduh{" "}
                  {receipt.verificationStatus === "verified" ? "kuitansi" : "nota pembayaran"}
                </Button>
                <Button variant="destructive" onClick={() => onOpenChange(false)}>
                  Tutup dan kembali ke Minat Booking
                </Button>
                <Button onClick={() => onComplete(lead!.id, receipt)}>
                  Lengkapi Data Penyewaan
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                  disabled={mutation.isPending}
                >
                  Batal
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={mutation.isPending || evidenceBusy || verificationPolicy.isLoading}
                >
                  {mutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Simpan Minat Booking
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pricingResetOpen}
        onOpenChange={setPricingResetOpen}
        title="Kembali ke tarif standar?"
        description="Tarif dan catatan kesepakatan khusus akan dihapus. Nilai kontrak serta pembayaran awal dihitung ulang dari tarif standar."
        confirmLabel="Gunakan tarif standar"
        onConfirm={() => {
          setPricingSource("standard");
          setAgreedMonthlyPrice(0);
          setPricingAgreementReason("");
          setPricingVarianceAcknowledged(false);
          setPricingResetOpen(false);
        }}
      />
    </>
  );
}
