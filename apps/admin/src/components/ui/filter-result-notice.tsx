import { useState } from "react";
import { NoticeAlert } from "@/components/ui/notice-alert";

export function FilterResultNotice({
  entityLabel,
  resultCount,
  activeFilterCount,
  searchTerm,
  className,
}: {
  entityLabel: string;
  resultCount: number;
  activeFilterCount: number;
  searchTerm?: string;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (activeFilterCount === 0 || dismissed) return null;

  const normalizedSearch = searchTerm?.trim();
  const additionalFilterCount = activeFilterCount - (normalizedSearch ? 1 : 0);
  const criteriaDescription = normalizedSearch
    ? `pencarian “${normalizedSearch}”${
        additionalFilterCount > 0 ? ` dan ${additionalFilterCount} filter tambahan` : ""
      }`
    : `${activeFilterCount} filter aktif`;

  return (
    <NoticeAlert
      className={className}
      tone={resultCount > 0 ? "success" : "warning"}
      title={
        resultCount > 0
          ? `Menampilkan ${resultCount} data ${entityLabel}`
          : `Tidak ada data ${entityLabel} yang cocok`
      }
      description={
        resultCount > 0
          ? `Hasil telah diperbarui berdasarkan ${criteriaDescription}.`
          : `Belum ditemukan hasil untuk ${criteriaDescription}. Ubah atau reset filter untuk mencoba lagi.`
      }
      onDismiss={() => setDismissed(true)}
      dismissLabel="Tutup informasi hasil filter"
    />
  );
}
