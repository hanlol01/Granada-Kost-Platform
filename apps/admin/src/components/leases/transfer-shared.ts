// W07B: shared labels used by both TransferPanel and the existing
// LeaseDetailPage deposit/checkout panels. Kept in its own module so the
// fast-refresh rule remains happy for every component file that imports it.
import type { PaymentMethod } from "@/lib/admin-ux-lease-types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  qris: "QRIS",
  ewallet: "E-wallet",
  other: "Lainnya",
};
