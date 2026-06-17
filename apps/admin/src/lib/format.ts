export const formatIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
