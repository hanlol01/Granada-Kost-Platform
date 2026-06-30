// Money helpers. IDR uses integer minor units (rupiah without decimals).

export function formatIDR(value: number | bigint): string {
  const num = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(num)) return "Rp 0";
  return "Rp " + Math.trunc(num).toLocaleString("id-ID");
}
