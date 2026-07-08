// WhatsApp CTA helpers for the public room listing (M16E).
//
// The destination number comes exclusively from VITE_PUBLIC_WHATSAPP_NUMBER
// (validated env, ADR-FE-006). It is never hardcoded. When the value is
// missing or unusable, callers must render a safe disabled CTA instead of
// generating an invalid wa.me URL.

import { env } from "@/lib/env";
import { formatIDR } from "@/lib/format";
import type { PublicRoomGroup } from "@/hooks/usePublicRooms";

export function getPublicWhatsAppNumber(): string | null {
  const raw = (env.VITE_PUBLIC_WHATSAPP_NUMBER ?? "").trim();
  if (!raw) return null;
  // wa.me requires digits-only international format (e.g. 62812xxxxxxx).
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return digits;
}

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Frozen M16E inquiry template. Uses only public-safe aggregated fields.
export function buildRoomInquiryMessage(group: PublicRoomGroup): string {
  return [
    "Halo Admin Kostation, saya tertarik booking kamar:",
    `- Kategori: ${group.categoryLabel}`,
    `- Untuk: ${group.genderLabel}`,
    `- Unit/Tipe: ${group.publicTitle}`,
    `- Ketersediaan: ${group.availableCount} kamar`,
    `- Harga mulai: ${formatIDR(group.priceFromMonthly)}/bulan`,
    "Mohon info ketersediaan dan proses bookingnya.",
  ].join("\n");
}

// M17D post-lead follow-up template. Uses only public-safe aggregated fields
// plus the visitor's own name/date (visitor-initiated share to the admin).
export function buildLeadFollowUpMessage(params: {
  visitorName: string;
  group: PublicRoomGroup;
  preferredMoveInDate?: string;
}): string {
  return [
    "Halo Admin Kostation, saya sudah mengajukan minat booking melalui website.",
    `Nama: ${params.visitorName}`,
    `Kategori: ${params.group.categoryLabel}`,
    `Untuk: ${params.group.genderLabel}`,
    `Unit/Tipe: ${params.group.publicTitle}`,
    `Tanggal masuk: ${params.preferredMoveInDate || "-"}`,
    "Mohon dibantu konfirmasi ketersediaannya.",
  ].join("\n");
}
