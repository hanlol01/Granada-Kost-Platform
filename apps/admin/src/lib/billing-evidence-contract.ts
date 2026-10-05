export type BillingEvidence = {
  id: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  file_size_bytes: number;
  content_path: string | null;
  availability: "available" | "purged" | "purge_pending" | "unavailable";
  purged_at: string | null;
};

export function parseBillingEvidence(value: unknown): BillingEvidence {
  const fail = (): never => { throw new Error("Informasi ketersediaan bukti pembayaran tidak valid. Muat ulang data sebelum melanjutkan."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const file = value as Record<string, unknown>;
  const required = ["id", "original_filename", "mime_type", "file_size_bytes", "content_path"];
  const allowed = [...required, "availability", "purged_at"];
  if (required.some(key => !Object.hasOwn(file,key)) || Object.keys(file).some(key => !allowed.includes(key))) return fail();
  if (typeof file.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.id)) return fail();
  if (typeof file.original_filename !== "string" || !file.original_filename.trim()) return fail();
  if (!["image/jpeg","image/png","image/webp","application/pdf"].includes(String(file.mime_type))) return fail();
  if (typeof file.file_size_bytes !== "number" || !Number.isSafeInteger(file.file_size_bytes) || file.file_size_bytes < 0) return fail();
  // Old billing responses remain readable only with their exact canonical link.
  // An extended response must carry both explicit availability and a purge date.
  const extended = Object.hasOwn(file,"availability") || Object.hasOwn(file,"purged_at");
  if (extended && (!Object.hasOwn(file,"availability") || !Object.hasOwn(file,"purged_at"))) return fail();
  const availability = extended ? file.availability : "available";
  const purgedAt = extended ? file.purged_at : null;
  if (!["available","purged","purge_pending","unavailable"].includes(String(availability))) return fail();
  if (availability === "available") {
    if (file.content_path !== `/files/${file.id}/content` || purgedAt !== null) return fail();
  } else if (file.content_path !== null) return fail();
  if (availability === "purged") {
    if (typeof purgedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(purgedAt)
      || !Number.isFinite(Date.parse(purgedAt)) || new Date(purgedAt).toISOString() !== purgedAt) return fail();
  } else if (purgedAt !== null) return fail();
  return {
    id: file.id,
    original_filename: file.original_filename,
    mime_type: file.mime_type as BillingEvidence["mime_type"],
    file_size_bytes: file.file_size_bytes,
    content_path: file.content_path as string | null,
    availability: availability as BillingEvidence["availability"],
    purged_at: purgedAt as string | null,
  };
}

export function billingEvidenceUnavailableCopy(file: BillingEvidence) {
  switch (file.availability) {
    case "purged": return {
      title: "Bukti dihapus permanen",
      description: "Berkas tidak dapat dilihat, diunduh, atau dipulihkan. Catatan pembayaran dan kuitansi tetap mengikuti status transaksinya.",
    };
    case "purge_pending": return {
      title: "Bukti sementara tidak dapat diakses",
      description: "Penghapusan permanen sedang diperiksa atau perlu dicoba ulang dari arsip penyewaan. Belum dapat dipastikan apakah file fisiknya telah terhapus.",
    };
    default: return {
      title: "Bukti tidak tersedia",
      description: "Berkas tidak tersedia pada catatan lama. Ini bukan konfirmasi bahwa file fisiknya sudah dihapus permanen.",
    };
  }
}
