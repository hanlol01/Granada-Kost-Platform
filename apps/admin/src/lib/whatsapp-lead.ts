// WhatsApp follow-up helper for booking leads (M17C). Admin-side only.
// The prefilled message uses the visitor's own submitted data plus public-safe
// interest labels; it never includes exact room numbers, room IDs, room codes,
// payment data, or Smart Lock data (M17A freeze rules).
// visitorPhone is already normalized by the M17B backend (62xxxxxxxxxx), but the
// helper re-normalizes defensively and never emits an invalid wa.me URL.

export function normalizeWhatsAppPhone(raw: string): string | null {
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  if (normalized.length < 8) return null;
  return normalized;
}

export type LeadWhatsAppInput = {
  visitorName: string;
  visitorPhone: string;
  categoryLabel: string;
  genderLabel: string;
  preferredMoveInDate: string | null;
};

export function buildLeadWhatsAppMessage(input: LeadWhatsAppInput): string {
  return [
    `Halo ${input.visitorName}, terima kasih sudah mengajukan minat booking di Kostation.`,
    "Kami ingin mengonfirmasi kebutuhan kamar:",
    `- Kategori: ${input.categoryLabel}`,
    `- Untuk: ${input.genderLabel}`,
    `- Tanggal pindah: ${input.preferredMoveInDate ?? "-"}`,
    "Apakah masih berminat untuk lanjut konfirmasi?",
  ].join("\n");
}

export function buildLeadWhatsAppUrl(input: LeadWhatsAppInput): string | null {
  const phone = normalizeWhatsAppPhone(input.visitorPhone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildLeadWhatsAppMessage(input))}`;
}
