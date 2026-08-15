function parseOwnerDate(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function displayOwnerDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Tanpa batas akhir";
  if (typeof value !== "string") return "Tanggal tidak tersedia";

  const date = parseOwnerDate(value);
  return date
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(date)
    : "Tanggal tidak tersedia";
}
