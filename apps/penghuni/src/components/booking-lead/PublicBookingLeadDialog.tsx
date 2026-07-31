// Public booking lead form dialog (M17D).
//
// Opened from the "Ajukan Minat Booking" CTA on each /kamar availability
// card. Submits ONLY category/gender context plus the visitor's minimum
// follow-up data to the public booking-lead endpoint.
// endpoint POST /public/booking-leads with anonymous: true — no Authorization
// header is sent and no refresh-token flow can be triggered.
//
// A booking lead is NOT a confirmed booking: nothing here reserves a room,
// creates an invoice/occupancy/resident, or touches Payment Gateway / Smart
// Lock. Never send or render room IDs, room_code, or exact room numbers.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MessageCircle, Send } from "lucide-react";
import { ApiError, ERROR_CODES } from "@granada-kost/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatIDR } from "@/lib/format";
import {
  getJakartaDateBounds,
  toPublicRoomGroup,
  type PublicHunianCatalogItem,
  type PublicHunianGender,
} from "@/hooks/usePublicHunianCatalog";
import {
  isLikelyWhatsAppPhone,
  useCreatePublicBookingLead,
  type CreatePublicBookingLeadInput,
} from "@/hooks/usePublicBookingLead";
import { buildLeadFollowUpMessage, buildWhatsAppUrl } from "@/lib/whatsapp-cta";

const COPY = {
  rateLimited:
    "Pengajuan Anda sudah diterima atau terlalu sering dikirim. Silakan tunggu beberapa saat atau hubungi admin via WhatsApp.",
  validation: "Periksa kembali data yang Anda isi, lalu coba lagi.",
  generic: "Pengajuan belum dapat dikirim. Silakan coba lagi atau hubungi admin via WhatsApp.",
  safety:
    "Ini baru pengajuan minat: belum menjadi reservasi, belum menahan atau memilih nomor kamar, dan tidak meminta pembayaran. Admin akan mengonfirmasi ketersediaan; lease hanya terbentuk melalui proses selanjutnya.",
};

type FieldErrors = {
  visitorName?: string;
  visitorPhone?: string;
  visitorEmail?: string;
  visitorUniversity?: string;
  gender?: string;
  consent?: string;
};

type SubmittedLead = {
  visitorName: string;
  preferredMoveInDate?: string;
  reference: string;
  category: string;
  gender: string;
};

// UX-only validation; the backend remains the enforcement point (M17A rule 10).
function validateFields(
  name: string,
  phone: string,
  email: string,
  university: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    errors.visitorName = "Nama wajib diisi (2-120 karakter).";
  }
  if (!isLikelyWhatsAppPhone(phone)) {
    errors.visitorPhone = "Masukkan nomor WhatsApp yang valid, contoh: 08123456789.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.visitorEmail = "Masukkan alamat email yang valid.";
  }
  if (university.trim().length < 2 || university.trim().length > 160) {
    errors.visitorUniversity = "Universitas atau ringkasan pendidikan wajib diisi.";
  }
  return errors;
}

export function PublicBookingLeadDialog({
  item,
  initialGender,
  whatsAppNumber,
  open,
  onOpenChange,
}: {
  item: PublicHunianCatalogItem;
  initialGender?: PublicHunianGender;
  whatsAppNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorUniversity, setVisitorUniversity] = useState("");
  const [consent, setConsent] = useState(false);
  const [preferredMoveInDate, setPreferredMoveInDate] = useState("");
  const [visitorMessage, setVisitorMessage] = useState("");
  const [selectedGender, setSelectedGender] = useState<PublicHunianGender | "">("");
  // Honeypot anti-spam field, hidden from humans (M17A Section 9 lightweight
  // abuse check). Bots that fill it get a fake success and no API call.
  // Backend rate limiting and validation remain authoritative.
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<SubmittedLead | null>(null);
  const [submissionIdentity, setSubmissionIdentity] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const mutation = useCreatePublicBookingLead();

  const idPrefix = `lead-${item.slug}`;
  const dateBounds = getJakartaDateBounds();
  const selectedGroup = selectedGender ? toPublicRoomGroup(item, selectedGender) : null;

  useEffect(() => {
    if (!open) return;
    const available = item.genderAvailability.map((entry) => entry.gender);
    setSelectedGender(
      initialGender && available.includes(initialGender) ? initialGender : (available[0] ?? ""),
    );
  }, [initialGender, item.genderAvailability, open]);

  useEffect(() => {
    if (submitted) successHeadingRef.current?.focus();
  }, [submitted]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Clear all form state (visitor PII) whenever the dialog closes.
      setVisitorName("");
      setVisitorPhone("");
      setVisitorEmail("");
      setVisitorUniversity("");
      setConsent(false);
      setPreferredMoveInDate("");
      setVisitorMessage("");
      setSelectedGender("");
      setHoneypot("");
      setFieldErrors({});
      setSubmitted(null);
      setSubmissionIdentity(null);
      mutation.reset();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Double-submit guard.
    if (mutation.isPending || submitted) return;
    if (honeypot.trim()) {
      setSubmitted({
        visitorName: visitorName.trim(),
        reference: "MINAT-DITERIMA",
        category: item.category,
        gender: selectedGender || "female",
      });
      return;
    }
    const errors = validateFields(visitorName, visitorPhone, visitorEmail, visitorUniversity);
    if (!selectedGroup) errors.gender = "Pilih hunian Putra atau Putri.";
    if (!consent) errors.consent = "Persetujuan diperlukan sebelum pengajuan dikirim.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !selectedGroup) return;

    // Public-safe aggregated context only — never room IDs, room_code, exact
    // room numbers, or propertyId (the backend rejects unknown fields).
    const payload: Omit<CreatePublicBookingLeadInput, "idempotencyKey"> = {
      category: selectedGroup.category,
      gender: selectedGroup.gender,
      visitorName: visitorName.trim(),
      visitorEmail: visitorEmail.trim(),
      visitorPhone: visitorPhone.trim(),
      visitorUniversity: visitorUniversity.trim(),
      consent: true,
      ...(visitorMessage.trim() ? { visitorMessage: visitorMessage.trim() } : {}),
      ...(preferredMoveInDate ? { preferredMoveInDate } : {}),
    };
    const fingerprint = JSON.stringify(payload);
    const idempotencyKey =
      submissionIdentity?.fingerprint === fingerprint
        ? submissionIdentity.key
        : crypto.randomUUID();
    setSubmissionIdentity({ fingerprint, key: idempotencyKey });

    mutation.mutate(
      { ...payload, idempotencyKey },
      {
        onSuccess: (result) => {
          setSubmissionIdentity(null);
          setSubmitted({
            visitorName: payload.visitorName,
            preferredMoveInDate: payload.preferredMoveInDate,
            reference: result.reference,
            category: result.category,
            gender: result.gender,
          });
        },
      },
    );
  };

  // Safe error copy only — never raw backend errors. A duplicate submission
  // within the backend window returns the same safe 201 success response, so
  // duplicates naturally land on the success state.
  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const errorMessage = !mutation.isError
    ? null
    : apiError?.code === ERROR_CODES.RATE_LIMITED
      ? COPY.rateLimited
      : apiError?.code === ERROR_CODES.VALIDATION_FAILED
        ? COPY.validation
        : COPY.generic;

  const followUpHref =
    submitted && whatsAppNumber && selectedGroup
      ? buildWhatsAppUrl(
          whatsAppNumber,
          buildLeadFollowUpMessage({
            visitorName: submitted.visitorName,
            group: selectedGroup,
            preferredMoveInDate: submitted.preferredMoveInDate,
          }),
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan Minat Booking</DialogTitle>
          <DialogDescription>
            Isi data singkat berikut. Admin akan menghubungi Anda untuk konfirmasi ketersediaan
            kamar.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <div>
              <h2 ref={successHeadingRef} tabIndex={-1} className="text-sm font-semibold">
                Minat booking berhasil dikirim.
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Admin akan menghubungi Anda melalui WhatsApp untuk konfirmasi. Pengajuan ini belum
                menjadi booking resmi.
              </p>
            </div>
            <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
              {COPY.safety}
            </p>
            <dl className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 text-left text-xs">
              <div>
                <dt className="text-muted-foreground">Referensi</dt>
                <dd className="font-semibold">{submitted.reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Kategori dan untuk</dt>
                <dd className="font-semibold">
                  {submitted.category === "rukost" ? "Rumah Kost" : "Apart Kost"} ·{" "}
                  {submitted.gender === "male" ? "Putra" : "Putri"}
                </dd>
              </div>
            </dl>

            <div className="space-y-1.5">
              {followUpHref ? (
                <Button asChild className="w-full">
                  <a href={followUpHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Hubungi Admin via WhatsApp
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleOpenChange(false)}
              >
                Lihat Kamar Lain
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="rounded-lg border bg-muted/40 p-3 text-left">
              <p className="text-sm font-semibold leading-snug">{item.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{item.categoryLabel}</Badge>
                {item.genderAvailability.map((entry) => (
                  <Button
                    key={entry.gender}
                    type="button"
                    size="sm"
                    className="min-h-11"
                    variant={selectedGender === entry.gender ? "default" : "outline"}
                    aria-pressed={selectedGender === entry.gender}
                    onClick={() => setSelectedGender(entry.gender)}
                  >
                    {entry.genderLabel} · {entry.availabilityCount}
                  </Button>
                ))}
              </div>
              {fieldErrors.gender ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.gender}</p>
              ) : null}
              {item.priceFromMonthly !== null ? (
                <p className="mt-2 text-xs font-medium">
                  Mulai {formatIDR(item.priceFromMonthly)}/bulan
                  {item.priceFromYearly ? ` • ${formatIDR(item.priceFromYearly)}/tahun` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nomor kamar akan dikonfirmasi oleh admin.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-name`}>Nama Lengkap *</Label>
              <Input
                id={`${idPrefix}-name`}
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="Nama Anda"
                maxLength={120}
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.visitorName)}
                aria-describedby={fieldErrors.visitorName ? `${idPrefix}-name-error` : undefined}
              />
              {fieldErrors.visitorName ? (
                <p id={`${idPrefix}-name-error`} className="text-xs text-destructive">
                  {fieldErrors.visitorName}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-phone`}>Nomor WhatsApp *</Label>
              <Input
                id={`${idPrefix}-phone`}
                type="tel"
                inputMode="tel"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                placeholder="08123456789"
                maxLength={20}
                autoComplete="tel"
                aria-invalid={Boolean(fieldErrors.visitorPhone)}
                aria-describedby={fieldErrors.visitorPhone ? `${idPrefix}-phone-error` : undefined}
              />
              {fieldErrors.visitorPhone ? (
                <p id={`${idPrefix}-phone-error`} className="text-xs text-destructive">
                  {fieldErrors.visitorPhone}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-email`}>Email *</Label>
              <Input
                id={`${idPrefix}-email`}
                type="email"
                value={visitorEmail}
                onChange={(event) => setVisitorEmail(event.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.visitorEmail)}
                aria-describedby={fieldErrors.visitorEmail ? `${idPrefix}-email-error` : undefined}
                required
              />
              {fieldErrors.visitorEmail ? (
                <p id={`${idPrefix}-email-error`} className="text-xs text-destructive">
                  {fieldErrors.visitorEmail}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-university`}>Universitas / pendidikan *</Label>
              <Input
                id={`${idPrefix}-university`}
                value={visitorUniversity}
                onChange={(event) => setVisitorUniversity(event.target.value)}
                maxLength={160}
                aria-invalid={Boolean(fieldErrors.visitorUniversity)}
                aria-describedby={
                  fieldErrors.visitorUniversity ? `${idPrefix}-university-error` : undefined
                }
                required
              />
              {fieldErrors.visitorUniversity ? (
                <p id={`${idPrefix}-university-error`} className="text-xs text-destructive">
                  {fieldErrors.visitorUniversity}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-date`}>Tanggal Rencana Masuk (opsional)</Label>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                value={preferredMoveInDate}
                min={dateBounds.today}
                max={dateBounds.max}
                onChange={(e) => setPreferredMoveInDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-message`}>Catatan untuk Admin (opsional)</Label>
              <Textarea
                id={`${idPrefix}-message`}
                value={visitorMessage}
                onChange={(e) => setVisitorMessage(e.target.value)}
                placeholder="Contoh: Saya ingin survey lokasi dulu minggu ini."
                maxLength={1000}
                rows={3}
              />
              {visitorMessage.length > 0 ? (
                <p className="text-right text-[11px] text-muted-foreground">
                  {visitorMessage.length}/1000
                </p>
              ) : null}
            </div>

            {/* Honeypot: hidden from humans; bots that fill it are ignored. */}
            <div className="hidden" aria-hidden="true">
              <Label htmlFor={`${idPrefix}-website`}>Website</Label>
              <Input
                id={`${idPrefix}-website`}
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {errorMessage ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {errorMessage}
              </p>
            ) : null}

            <p className="text-[11px] text-muted-foreground">{COPY.safety}</p>

            <div>
              <label className="flex min-h-11 items-start gap-2 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  aria-invalid={Boolean(fieldErrors.consent)}
                  aria-describedby={fieldErrors.consent ? `${idPrefix}-consent-error` : undefined}
                  className="mt-0.5 h-5 w-5 rounded border-input"
                />
                <span>
                  Saya setuju dihubungi Admin dan data pengajuan ini diproses untuk tindak lanjut
                  minat hunian.
                </span>
              </label>
              {fieldErrors.consent ? (
                <p id={`${idPrefix}-consent-error`} className="mt-1 text-xs text-destructive">
                  {fieldErrors.consent}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending || !consent}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {mutation.isPending ? "Mengirim..." : "Kirim Minat Booking"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
