import { useState } from "react";
import { NoticeAlert } from "@/components/ui/notice-alert";

export function FilterResultNotice({
  entityLabel,
  resultCount,
  activeFilterCount,
  searchTerm,
  criteria,
  className,
}: {
  entityLabel: string;
  resultCount: number;
  activeFilterCount: number;
  searchTerm?: string;
  criteria?: readonly string[];
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (activeFilterCount === 0 || dismissed) return null;

  const explicitCriteria = criteria?.map((criterion) => criterion.trim()).filter(Boolean) ?? [];
  const normalizedSearch = searchTerm?.trim();
  const additionalFilterCount = activeFilterCount - (normalizedSearch ? 1 : 0);
  const fallbackCriteriaDescription = normalizedSearch
    ? `pencarian “${normalizedSearch}”${
        additionalFilterCount > 0 ? ` dan ${additionalFilterCount} filter tambahan` : ""
      }`
    : `${activeFilterCount} filter aktif`;
  const criteriaDescription =
    explicitCriteria.length > 0 ? explicitCriteria.join(" • ") : fallbackCriteriaDescription;

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
          ? `Sesuai filter: ${criteriaDescription}.`
          : `Belum ditemukan hasil untuk ${criteriaDescription}. Ubah atau reset filter untuk mencoba lagi.`
      }
      onDismiss={() => setDismissed(true)}
      dismissLabel="Tutup informasi hasil filter"
    />
  );
}
