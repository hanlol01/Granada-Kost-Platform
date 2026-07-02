// WhatsAppFallbackButton — opens a wa.me deep link with a pre-filled Indonesian
// message when upload fails, is unavailable, or file is too large.
//
// Shown as a safety net per ADR-BE-FILE-001 WhatsApp admin fallback policy.

import { MessageCircle } from "lucide-react";
import { buildWhatsAppFallbackUrl } from "@/lib/file-utils";

export type WhatsAppFallbackButtonProps = {
  /** Context string inserted into the pre-filled message (e.g., "bukti pembayaran"). */
  context: string;
  /** The admin WhatsApp phone number in international format (e.g., "6281234567890"). */
  adminPhone: string;
  /** Optional className override. */
  className?: string;
};

export function WhatsAppFallbackButton({
  context,
  adminPhone,
  className,
}: WhatsAppFallbackButtonProps) {
  const url = buildWhatsAppFallbackUrl(adminPhone, context);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-green-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 " +
        (className ?? "")
      }
    >
      <MessageCircle className="h-4 w-4" />
      Kirim via WhatsApp
    </a>
  );
}
