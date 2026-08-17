// W07B: shared labels used by both TransferPanel and the existing
// LeaseDetailPage deposit/checkout panels. Kept in its own module so the
// fast-refresh rule remains happy for every component file that imports it.
import type { LeaseRoomOption, PaymentMethod } from "@/lib/admin-ux-lease-types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  qris: "QRIS",
  ewallet: "E-wallet",
  other: "Lainnya",
};

export type ResidentGender = "male" | "female" | "other";

export function normalizeRoomSearch(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function genderPolicyLabel(value: LeaseRoomOption["genderPolicy"]): string {
  return value === "male" ? "Putra" : value === "female" ? "Putri" : "Campuran";
}

export function isTransferRoomGenderCompatible(
  roomGender: LeaseRoomOption["genderPolicy"],
  residentGender?: ResidentGender,
): boolean {
  if (!residentGender) return true;
  if (residentGender === "other") return roomGender === "mixed";
  return roomGender === "mixed" || roomGender === residentGender;
}
