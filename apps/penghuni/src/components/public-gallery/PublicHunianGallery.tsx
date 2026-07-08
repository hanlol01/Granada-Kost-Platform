// Public hunian gallery (M19D) — professional hero preview + thumbnail
// selector + simple lightbox for the public /kamar/$slug detail page.
//
// Data source is EXCLUSIVELY the frozen M19B public gallery allowlist
// (id, contentUrl, thumbnailUrl, altText, caption, sortOrder, isCover) from
// GET /public/hunian-catalog/:slug. This component must never request or
// render storage_path/file paths, internal fileId, roomId/room_code/exact
// room numbers, uploader identity, tenant/resident/occupancy PII,
// invoice/payment/bank data, or Smart Lock/PALOMA data.
//
// Read-only: no upload UI, no mutation, no video. An empty gallery renders
// the frozen safe placeholder copy — never fake/dummy photos. Images whose
// bytes fail to load are dropped from the rotation (no infinite retry, no
// broken-image icon); if all fail, the placeholder returns.
//
// The lightbox reuses the existing shadcn Dialog primitive (focus trap,
// Escape-to-close, accessible close button) instead of a new dependency.

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  resolveGalleryImageUrl,
  type PublicHunianGalleryImage,
} from "@/hooks/usePublicHunianCatalog";

// Frozen public-safe placeholder copy (M18C/M18D). Exported so the /kamar
// listing cards reuse the exact same copy (single source of truth).
export const GALLERY_PLACEHOLDER_COPY =
  "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.";

export function PublicHunianGallery({
  images,
  title,
  className,
}: {
  images: PublicHunianGalleryImage[];
  title: string;
  className?: string;
}) {
  // Failed image ids are removed from the rotation instead of rendering a
  // broken image. State only grows (no retry loop for the same id).
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const usableImages = useMemo(
    () => images.filter((image) => Boolean(image.contentUrl) && !failedIds.has(image.id)),
    [images, failedIds],
  );

  const markFailed = useCallback((id: string) => {
    setFailedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const count = usableImages.length;
  const safeIndex = count > 0 ? Math.min(activeIndex, count - 1) : 0;
  const active = count > 0 ? usableImages[safeIndex] : null;

  const goPrev = useCallback(() => {
    if (count > 1) setActiveIndex((safeIndex - 1 + count) % count);
  }, [count, safeIndex]);
  const goNext = useCallback(() => {
    if (count > 1) setActiveIndex((safeIndex + 1) % count);
  }, [count, safeIndex]);

  // Empty (or fully failed) gallery: frozen safe placeholder, no dummy photos.
  if (!active) {
    return (
      <div className={cn("overflow-hidden rounded-xl border bg-muted", className)}>
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/50 px-6 text-center sm:aspect-[16/9]">
          <ImageIcon className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="max-w-sm text-xs leading-snug text-muted-foreground">
            {GALLERY_PLACEHOLDER_COPY}
          </p>
        </div>
      </div>
    );
  }

  const activeUrl = resolveGalleryImageUrl(active.contentUrl);
  const activeAlt = active.altText || title;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Hero image — click/Enter opens the lightbox preview. */}
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={`Perbesar foto ${safeIndex + 1} dari ${count}: ${activeAlt}`}
          className="group block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9]">
            <img
              key={active.id}
              src={activeUrl ?? undefined}
              alt={activeAlt}
              loading={safeIndex === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={() => markFailed(active.id)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          </div>
          {/* Legibility gradient for caption/counter (decorative only). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent"
          />
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
            <Expand className="h-3 w-3" aria-hidden="true" />
            {safeIndex + 1}/{count}
          </span>
          {active.caption ? (
            <span className="absolute inset-x-0 bottom-0 block truncate px-4 pb-3 text-left text-xs font-medium text-white">
              {active.caption}
            </span>
          ) : null}
        </button>
      </div>

      {/* Thumbnail selector — horizontal scroll, mobile-friendly, max 10
          images per the frozen M19A policy. */}
      {count > 1 ? (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label={`Pilih foto ${title}`}>
          {usableImages.map((image, index) => {
            const isActive = index === safeIndex;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Lihat foto ${index + 1} dari ${count}: ${image.altText || title}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative aspect-[4/3] w-20 shrink-0 snap-start overflow-hidden rounded-lg border bg-muted transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-24",
                  isActive
                    ? "border-primary ring-2 ring-primary ring-offset-1"
                    : "opacity-75 hover:opacity-100",
                )}
              >
                <img
                  src={resolveGalleryImageUrl(image.thumbnailUrl ?? image.contentUrl) ?? undefined}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  onError={() => markFailed(image.id)}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Lightbox — existing shadcn Dialog: focus trap, Escape close, and an
          accessible built-in close button. Arrow keys switch images. */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-4xl gap-0 overflow-hidden border-none bg-black/95 p-0 text-white [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/60 [&>button:last-child]:p-1.5 [&>button:last-child]:text-white [&>button:last-child]:opacity-100"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              goPrev();
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              goNext();
            }
          }}
        >
          <DialogTitle className="sr-only">Galeri foto {title}</DialogTitle>
          <DialogDescription className="sr-only">
            Pratinjau foto hunian. Gunakan tombol atau tombol panah kiri/kanan untuk berpindah foto,
            dan Escape untuk menutup.
          </DialogDescription>
          <div className="relative flex max-h-[80vh] min-h-[40vh] items-center justify-center bg-black">
            <img
              key={active.id}
              src={activeUrl ?? undefined}
              alt={activeAlt}
              decoding="async"
              onError={() => markFailed(active.id)}
              className="max-h-[80vh] w-full object-contain"
            />
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Foto sebelumnya"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Foto berikutnya"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 truncate text-xs text-white/90">{active.caption || activeAlt}</p>
            <p aria-live="polite" className="shrink-0 text-xs font-medium text-white/70">
              {safeIndex + 1}/{count}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
