import { createFileRoute } from "@tanstack/react-router";
import { RouteFoundationPage } from "@/components/layout/route-foundation-page";

type GallerySearch = {
  target: "rumah-kost" | "apart-kost" | "common-area";
  offset: number;
  limit: number;
};

function normalizedPositive(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

export const Route = createFileRoute("/rooms/galeri")({
  validateSearch: (raw: Record<string, unknown>): GallerySearch => ({
    target: raw.target === "apart-kost" || raw.target === "common-area" ? raw.target : "rumah-kost",
    offset: normalizedPositive(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: normalizedPositive(raw.limit, 20, 1, 100),
  }),
  component: GaleriRoute,
});

function GaleriRoute() {
  return (
    <RouteFoundationPage
      title="Galeri"
      subtitle="Galeri per tipe kost dan area bersama"
      milestone="M4 — UI master kamar"
    />
  );
}
