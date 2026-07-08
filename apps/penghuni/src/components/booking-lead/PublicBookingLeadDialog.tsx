// Public booking lead form dialog (M17D).
//
// Opened from the "Ajukan Minat Booking" CTA on each /kamar availability
// card. Submits ONLY public-safe aggregated group context (category/gender/
// building/floor/groupKey) plus the visitor's minimum follow-up PII (name,
// WhatsApp phone, optional move-in date and note) to the write-only M17B
// endpoint POST /public/booking-leads with anonymous: true — no Authorization
// header is sent and no refresh-token flow can be triggered.
//
// A booking lead is NOT a confirmed booking: nothing here reserves a room,
// creates an invoice/occupancy/resident, or touches Payment Gateway / Smart
// Lock. Never send or render room IDs, room_code, or exact room numbers.

import { useState, type FormEvent } from "react";
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
import type { PublicRoomGroup } from "@/hooks/usePublicRooms";
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
    "Pengajuan minat booking belum mengunci kamar dan belum menjadi transaksi pembayaran. Admin akan mengonfirmasi ketersediaan terlebih dahulu.",
};

type FieldErrors = { visitorName?: string; visitorPhone?: string };

type SubmittedLead = { visitorName: string; preferredMoveInDate?: string };

// UX-only validation; the backend remains the enforcement point (M17A rule 10).
function validateFields(name: string, phone: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    errors.visitorName = "Nama wajib diisi (2-120 karakter).";
  }
  if (!isLikelyWhatsAppPhone(phone)) {
    errors.visitorPhone = "Masukkan nomor WhatsApp yang valid, contoh: 08123456789.";
  }
  return errors;
}

export function PublicBookingLeadDialog({
  group,
  whatsAppNumber,
  open,
  onOpenChange,
}: {
  group: PublicRoomGroup;
  whatsAppNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [preferredMoveInDate, setPreferredMoveInDate] = useState("");
  const [visitorMessage, setVisitorMessage] = useState("");
  // Honeypot anti-spam field, hidden from humans (M17A Section 9 lightweight
  // abuse check). Bots that fill it get a fake success and no API call.
  // Backend rate limiting and validation remain authoritative.
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState<SubmittedLead | null>(null);

  const mutation = useCreatePublicBookingLead();

  const idPrefix = `lead-${group.groupKey}`;
  const today = new Date().toISOString().slice(0, 10);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Clear all form state (visitor PII) whenever the dialog closes.
      setVisitorName("");
      setVisitorPhone("");
      setPreferredMoveInDate("");
      setVisitorMessage("");
      setHoneypot("");
      setFieldErrors({});
      setSubmitted(null);
      mutation.reset();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Double-submit guard.
    if (mutation.isPending || submitted) return;
    if (honeypot.trim()) {
      setSubmitted({ visitorName: visitorName.trim() });
      return;
    }
    const errors = validateFields(visitorName, visitorPhone);
    setFieldErrors(errors);
    if (errors.visitorName || errors.visitorPhone) return;

    // Public-safe aggregated context only — never room IDs, room_code, exact
    // room numbers, or propertyId (the backend rejects unknown fields).
    const payload: CreatePublicBookingLeadInput = {
      category: group.category,
      gender: group.gender,
      ...(group.buildingCode ? { buildingCode: group.buildingCode } : {}),
      ...(group.floorCode === "A" || group.floorCode === "B"
        ? { floorCode: group.floorCode }
        : {}),
      ...(group.groupKey ? { publicGroupKey: group.groupKey } : {}),
      visitorName: visitorName.trim(),
      visitorPhone: visitorPhone.trim(),
      ...(visitorMessage.trim() ? { visitorMessage: visitorMessage.trim() } : {}),
      ...(preferredMoveInDate ? { preferredMoveInDate } : {}),
    };

    mutation.mutate(payload, {
      onSuccess: () =>
        setSubmitted({
          visitorName: payload.visitorName,
          preferredMoveInDate: payload.preferredMoveInDate,
        }),
    });
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
    submitted && whatsAppNumber
      ? buildWhatsAppUrl(
          whatsAppNumber,
          buildLeadFollowUpMessage({
            visitorName: submitted.visitorName,
            group,
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
              <p className="text-sm font-semibold">Minat booking berhasil dikirim.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Admin akan menghubungi Anda melalui WhatsApp untuk konfirmasi. Pengajuan ini
                belum menjadi booking resmi.
              </p>
            </div>
            <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
              {COPY.safety}
            </p>
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
              <p className="text-sm font-semibold leading-snug">{group.publicTitle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {group.buildingName || group.buildingCode}
                {group.floorLabel ? ` • ${group.floorLabel}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{group.categoryLabel}</Badge>
                <Badge variant={group.gender === "male" ? "default" : "secondary"}>
                  {group.genderLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {group.availableCount} kamar tersedia
                </span>
              </div>
              <p className="mt-2 text-xs font-medium">
                Mulai {formatIDR(group.priceFromMonthly)}/bulan
                {group.priceFromYearly ? ` • ${formatIDR(group.priceFromYearly)}/tahun` : ""}
              </p>
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
              />
              {fieldErrors.visitorName ? (
                <p className="text-xs text-destructive">{fieldErrors.visitorName}</p>
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
              />
              {fieldErrors.visitorPhone ? (
                <p className="text-xs text-destructive">{fieldErrors.visitorPhone}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-date`}>Tanggal Rencana Masuk (opsional)</Label>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                value={preferredMoveInDate}
                min={today}
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

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
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
