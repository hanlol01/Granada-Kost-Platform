import { ApiError, ERROR_CODES } from "@granada-kost/domain";

export const RESIDENT_ATTENTION = {
  outstanding: {
    label: "Pembayaran sewa belum lunas",
    description: "Penyewaan aktif dengan sisa pembayaran sewa.",
    tone: "danger",
  },
  awaiting_activation: {
    label: "Menunggu aktivasi",
    description: "Penyewaan sudah disiapkan, kamar belum diaktifkan.",
    tone: "info",
  },
  lease_expired: {
    label: "Masa sewa berakhir",
    description: "Perlu menyiapkan check-out atau meninjau penyewaan.",
    tone: "danger",
  },
  refund_pending: {
    label: "Pengembalian dana tertunda",
    description: "Check-out selesai, pengembalian dana belum selesai.",
    tone: "warning",
  },
  amount_due: {
    label: "Tagihan akhir belum lunas",
    description: "Masih ada kewajiban pembayaran setelah check-out.",
    tone: "danger",
  },
  lease_ending: {
    label: "Masa sewa segera berakhir",
    description: "Akhir masa sewa dalam 30 hari, belum dijadwalkan serah-terima.",
    tone: "warning",
  },
  awaiting_handover: {
    label: "Menunggu tanggal serah-terima",
    description: "Serah-terima dijadwalkan hari ini atau hari berikutnya.",
    tone: "info",
  },
  handover_overdue: {
    label: "Terlambat serah-terima",
    description: "Tanggal rencana terlewati, serah-terima belum dicatat.",
    tone: "danger",
  },
} as const;

export type ResidentAttentionCategory = keyof typeof RESIDENT_ATTENTION;
export type ResidentAttentionSummary = {
  propertyId: string;
  counts: Record<ResidentAttentionCategory, number>;
};

export function parseResidentAttention(
  value: unknown,
  propertyId: string,
): ResidentAttentionSummary {
  const envelope = value as {
    data?: { property_id?: unknown; counts?: Record<string, unknown> };
  } | null;
  const data = envelope?.data;
  const counts = data?.counts;
  const categories = Object.keys(RESIDENT_ATTENTION) as ResidentAttentionCategory[];
  if (
    data?.property_id !== propertyId ||
    !counts ||
    Object.keys(counts).length !== categories.length ||
    categories.some((key) => !Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0)
  ) {
    throw new ApiError({
      code: ERROR_CODES.PARSE_ERROR,
      message: "Pemberitahuan penghuni tidak valid.",
      status: 200,
    });
  }
  return { propertyId, counts: counts as Record<ResidentAttentionCategory, number> };
}
