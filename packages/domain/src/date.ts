// Tiny, framework-free date helpers. Apps may use date-fns for richer formatting.

export function toIso(date: Date): string {
  return date.toISOString();
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
