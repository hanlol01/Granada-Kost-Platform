export type GalleryRedirectSearch = {
  target: "rumah-kost" | "apart-kost";
  offset: number;
  limit: number;
};

function pageValue(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

/** Maps only documented legacy gallery query fields to the canonical route. */
export function normalizeLegacyGalleryRedirectSearch(
  raw: Readonly<Record<string, unknown>>,
): GalleryRedirectSearch {
  return {
    target: raw.category === "apartkost" ? "apart-kost" : "rumah-kost",
    offset: pageValue(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: pageValue(raw.limit, 20, 1, 100),
  };
}

export const parkingRedirectSearch = { tab: "parking" } as const;
