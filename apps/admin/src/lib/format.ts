export const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Audit timestamps are instants, unlike date-only contract boundaries. */
export function formatRecordedAt(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta",
  }).format(date);
}

/** Parses digit-only Rupiah input; decimals, negatives, and overflow are rejected. */
export function parseIDR(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^\d[\d.\s]*$/.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) return null;
  return parsed;
}

export function formatIDRInput(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}
