import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FilePickerButton } from "@/components/file/FilePickerButton";
import { FilePreview } from "@/components/file/FilePreview";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import {
  useBookingLeadCompletionQuote,
  useCompleteBookingLead,
} from "@/hooks/useBookingLeadCompletion";
import type { BookingLeadRecord } from "@/lib/admin-booking-lead";
import type {
  LeadInitialPaymentType,
  LeadPaymentCommitment,
} from "@/lib/admin-booking-lead-completion";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property";
import { revealFirstValidationError } from "@/lib/validation-focus";
import { useFileDelete, useFileUpload } from "@/hooks/useFileUpload";
import type { FileResponse } from "@granada-kost/domain";

type Props = {
  open: boolean;
  lead: BookingLeadRecord | null;
  onOpenChange: (value: boolean) => void;
  onComplete: (leadId: string, commitment: LeadPaymentCommitment) => void;
};

function endDate(start: string, months: number): string {
  if (!start || !Number.isInteger(months) || months < 3) return "";
  const [year, month, day] = start.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

function formatIndonesianDate(value: string): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "—";
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
  const [rentCredit, setRentCredit] = useState(1_000_000);
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorUniversity, setVisitorUniversity] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState<FileResponse | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const quote = useBookingLeadCompletionQuote(open ? lead?.id : null, startDate, termMonths);
  const evidenceUpload = useFileUpload({ silent: true });
  const evidenceDelete = useFileDelete({ silent: true });

  useEffect(() => {
    if (!open) return;
    setReceipt(null);
    setPaymentType("booking_fee");
    setStartDate(lead?.preferredMoveInDate ?? "");
    setTermMonths(3);
    setRentCredit(FIXED_BOOKING_FEE);
    setSecurityDeposit(0);
    setPaymentMethod("cash");
    setPaymentNote("");
    setVisitorName(lead?.visitorName ?? "");
    setVisitorPhone(lead?.visitorPhone ?? "");
    setVisitorUniversity(lead?.visitorUniversity ?? "");
    setPaymentEvidence(null);
    setEvidenceError(null);
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
  const totalRent = quote.data?.contractRentAmount ?? 0;
  const suggestedDp = quote.data?.suggestedDpAmount ?? 0;
  const displayedCredit =
    paymentType === "booking_fee"
      ? FIXED_BOOKING_FEE
      : paymentType === "full_settlement"
        ? totalRent
        : rentCredit;
  const error = !startDate
    ? "Tanggal mulai sewa wajib diisi."
    : termMonths < 3
      ? "Durasi sewa minimal 3 bulan."
      : quote.isLoading
        ? "Memuat tarif kamar yang ditahan."
        : quote.isError || !quote.data
          ? "Tarif kamar yang ditahan belum dapat dimuat. Tutup dialog lalu periksa kembali status hold kamar."
          : paymentType === "down_payment" && displayedCredit > totalRent
            ? `DP tidak boleh melebihi total sewa ${formatIDR(totalRent)}.`
            : null;

  useEffect(() => {
    if (submitAttempted && error) {
      revealFirstValidationError(formScopeRef.current);
    }
  }, [error, submitAttempted]);

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
    if (!lead || !currentPropertyId || error) return;
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
        paymentType,
        rentCreditAmount: displayedCredit,
        securityDepositAmount: securityDeposit,
        paymentMethod,
        paymentEvidenceFileIds: paymentEvidence ? [paymentEvidence.id] : undefined,
        paymentNote,
        visitorName,
        visitorPhone,
        visitorUniversity,
      },
    });
    setReceipt(commitment);
  };

  const uploadEvidence = async (file: File) => {
    if (!currentPropertyId || evidenceUpload.isUploading) return;
    setEvidenceError(null);
    try {
      const uploaded = await evidenceUpload.uploadAsync({
        file,
        propertyId: currentPropertyId,
        filePurpose: "payment_proof",
      });
      if (currentPropertyId !== lead?.propertyId) {
        await evidenceDelete.mutateAsync(uploaded.id);
        throw new Error("PROPERTY_SCOPE_CHANGED");
      }
      setPaymentEvidence(uploaded);
    } catch {
      setEvidenceError("Bukti transfer belum dapat diunggah. Periksa format dan ukuran file.");
    }
  };

  const removeEvidence = async () => {
    if (!paymentEvidence || evidenceDelete.isPending) return;
    try {
      await evidenceDelete.mutateAsync(paymentEvidence.id);
      setPaymentEvidence(null);
    } catch {
      setEvidenceError("Bukti transfer belum dapat dihapus. Coba lagi.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {receipt ? "Minat Booking siap dilengkapi" : "Selesaikan Minat Booking"}
          </DialogTitle>
          <DialogDescription>
            {receipt
              ? "Kamar dan komitmen pembayaran telah disimpan. Penghuni belum aktif dan kamar belum occupied."
              : "Catat komitmen pembayaran awal setelah tahan kamar. Nilai final selalu dihitung ulang oleh server."}
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
                <dt className="text-muted-foreground">Security deposit</dt>
                <dd>{formatIDR(receipt.securityDepositAmount)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-success/20 pt-3 text-muted-foreground">
              Ini masih komitmen pembayaran Minat Booking. Kuitansi resmi tersedia setelah data
              penyewaan dikomit dan pembayaran dimaterialisasi ke riwayat penghuni.
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
                  <Input
                    value={visitorUniversity}
                    onChange={(event) => setVisitorUniversity(event.target.value)}
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
                    min={3}
                    max={120}
                    value={termMonths}
                    onChange={(event) =>
                      setTermMonths(Math.max(0, Number(event.target.value) || 0))
                    }
                    className="h-11 min-h-11"
                    aria-invalid={termMonths < 3}
                  />
                  <div className="grid grid-cols-3 gap-2" aria-label="Pilihan cepat durasi sewa">
                    {[3, 6, 12].map((months) => (
                      <Button
                        key={months}
                        type="button"
                        variant={termMonths === months ? "default" : "outline"}
                        className="min-h-11 w-full px-2"
                        onClick={() => setTermMonths(months)}
                      >
                        {months} bulan
                      </Button>
                    ))}
                  </div>
                </label>
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">Tanggal sewa berakhir</p>
                <p className="mt-1 text-lg font-semibold" aria-live="polite">
                  {formatIndonesianDate(quote.data?.endDate ?? endDate(startDate, termMonths))}
                </p>
              </div>
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
                  <span className="text-xs font-medium text-muted-foreground">Tarif per bulan</span>
                  <span className="font-semibold">
                    {quote.data ? formatIDR(quote.data.room.monthlyPrice) : "â€”"}
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
                    {quote.data ? formatIDR(totalRent) : "â€”"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Rekomendasi DP 25%: {quote.data ? formatIDR(suggestedDp) : "â€”"}. Security
                  deposit dicatat terpisah dan tidak mengurangi total sewa.
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
                    error={paymentType === "down_payment" && displayedCredit > totalRent}
                  />
                  <span className="font-normal text-muted-foreground">
                    {paymentType === "booking_fee"
                      ? "Nilai tetap Rp1.000.000 dan menjadi kredit sewa."
                      : paymentType === "down_payment"
                        ? `Rekomendasi 25%: ${formatIDR(suggestedDp)}. Nilai lebih kecil tetap dapat dicatat.`
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
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Metode pembayaran">
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
                  Bukti transfer opsional. Transfer akan menunggu konfirmasi dan memblokir aktivasi
                  kamar.
                </p>
              </fieldset>
              {paymentMethod === "bank_transfer" ? (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <Label>
                    Bukti transfer{" "}
                    <span className="font-normal text-muted-foreground">(opsional)</span>
                  </Label>
                  {paymentEvidence ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <FilePreview file={paymentEvidence} size={56} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {paymentEvidence.original_filename}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void removeEvidence()}
                        disabled={evidenceDelete.isPending}
                      >
                        Hapus
                      </Button>
                    </div>
                  ) : (
                    <FilePickerButton
                      filePurpose="payment_proof"
                      disabled={evidenceUpload.isUploading}
                      onFilesSelected={(files) => void uploadEvidence(files[0]!)}
                    />
                  )}
                  {evidenceError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {evidenceError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium">
                Catatan pembayaran{" "}
                <span className="font-normal text-muted-foreground">(opsional)</span>
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background p-3 text-sm"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                />
              </label>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>
                  Total sewa <b>{formatIDR(totalRent)}</b>
                </p>
                <p>
                  Sisa pembayaran sewa <b>{formatIDR(Math.max(0, totalRent - displayedCredit))}</b>
                </p>
              </div>
              {submitAttempted && error ? (
                <p
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Tutup dan kembali ke Minat Booking
              </Button>
              <Button onClick={() => onComplete(lead!.id, receipt)}>Lengkapi Data Penyewaan</Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Batal
              </Button>
              <Button onClick={() => void submit()} disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
  );
}
