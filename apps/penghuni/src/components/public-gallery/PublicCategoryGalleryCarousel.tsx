import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Image as ImageIcon,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  resolveGalleryImageUrl,
  type PublicHunianGalleryImage,
} from "@/hooks/usePublicHunianCatalog";
import { cn } from "@/lib/utils";

type PublicCategoryGalleryCarouselProps = {
  title: string;
  images: PublicHunianGalleryImage[] | null;
  className?: string;
};

type Pan = { x: number; y: number };

const AUTO_ADVANCE_MS = 5500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
const GALLERY_PLACEHOLDER_COPY = "Galeri hunian sedang disiapkan. Hubungi Admin untuk foto terbaru atau jadwal survei.";

function wrapIndex(index: number, count: number) {
  return (index + count) % count;
}

export function PublicCategoryGalleryCarousel({
  title,
  images,
  className,
}: PublicCategoryGalleryCarouselProps) {
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  const galleryImages = useMemo(
    () => (images ?? []).filter((image) => !failedUrls.has(image.contentUrl)),
    [failedUrls, images],
  );
  const imageCount = galleryImages.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; pan: Pan } | null>(null);

  useEffect(() => {
    setActiveIndex((current) => (imageCount === 0 ? 0 : Math.min(current, imageCount - 1)));
  }, [imageCount]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const resetView = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setDragStart(null);
  }, []);

  const showImage = useCallback(
    (nextIndex: number) => {
      if (imageCount === 0) return;
      setActiveIndex(wrapIndex(nextIndex, imageCount));
      resetView();
    },
    [imageCount, resetView],
  );

  const showNext = useCallback(() => showImage(activeIndex + 1), [activeIndex, showImage]);
  const showPrevious = useCallback(
    () => showImage(activeIndex - 1),
    [activeIndex, showImage],
  );

  useEffect(() => {
    if (imageCount < 2 || isPaused || isInteracting || isOpen || reducedMotion) return;
    const timer = window.setInterval(showNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [imageCount, isInteracting, isOpen, isPaused, reducedMotion, showNext]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
      if (event.key === "-") setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, showNext, showPrevious]);

  const setClampedZoom = (nextZoom: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    setZoom(clamped);
    if (clamped === MIN_ZOOM) setPan({ x: 0, y: 0 });
  };

  const handleImageFailure = (contentUrl: string) => {
    setFailedUrls((current) => new Set(current).add(contentUrl));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY, pan });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const limit = 96 * (zoom - 1);
    setPan({
      x: Math.max(-limit, Math.min(limit, dragStart.pan.x + event.clientX - dragStart.x)),
      y: Math.max(-limit, Math.min(limit, dragStart.pan.y + event.clientY - dragStart.y)),
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  };

  const handleFocusLeavingCarousel = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsInteracting(false);
    }
  };

  if (imageCount === 0) {
    return (
      <div
        className={cn(
          "flex aspect-[16/9] flex-col items-center justify-center gap-2 bg-muted px-8 text-center",
          className,
        )}
      >
        <ImageIcon className="h-8 w-8 text-muted-foreground/45" />
        <p className="max-w-sm text-xs text-muted-foreground">{GALLERY_PLACEHOLDER_COPY}</p>
      </div>
    );
  }

  const activeImage = galleryImages[activeIndex];

  return (
    <>
      <div
        className={cn("group/gallery relative aspect-[16/9] overflow-hidden bg-muted", className)}
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => setIsInteracting(false)}
        onFocusCapture={() => setIsInteracting(true)}
        onBlurCapture={handleFocusLeavingCarousel}
        aria-roledescription="carousel"
        aria-label={`Galeri ${title}`}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {galleryImages.map((image, index) => {
            const imageUrl = resolveGalleryImageUrl(image.thumbnailUrl ?? image.contentUrl);
            return (
              <button
                key={image.contentUrl}
                type="button"
                className="relative h-full min-w-full cursor-zoom-in focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                onClick={() => {
                  setActiveIndex(index);
                  resetView();
                  setIsOpen(true);
                }}
                aria-label={`Buka foto ${index + 1} dari ${imageCount} untuk ${title}`}
              >
                <img
                  src={imageUrl ?? undefined}
                  alt={image.altText || `${title}, foto ${index + 1}`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  onError={() => handleImageFailure(image.contentUrl)}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover/gallery:bg-black/10 motion-reduce:transition-none" />
              </button>
            );
          })}
        </div>

        {imageCount > 1 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full bg-background/90 shadow-md hover:bg-background"
              onClick={showPrevious}
              aria-label="Foto sebelumnya"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full bg-background/90 shadow-md hover:bg-background"
              onClick={showNext}
              aria-label="Foto berikutnya"
            >
              <ChevronRight />
            </Button>
            <div className="absolute bottom-3 left-3 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white" aria-live="polite">
              {activeIndex + 1} / {imageCount}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full bg-background/90 hover:bg-background"
              onClick={() => setIsPaused((value) => !value)}
              aria-label={isPaused ? "Lanjutkan perputaran foto" : "Jeda perputaran foto"}
            >
              {isPaused ? <Play /> : <Pause />}
            </Button>
          </>
        ) : null}
        <span className="pointer-events-none absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-200 group-hover/gallery:opacity-100 group-focus-within/gallery:opacity-100 motion-reduce:transition-none">
          <Expand className="h-4 w-4" />
          <span className="sr-only">Tekan gambar untuk memperbesar</span>
        </span>
      </div>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetView();
        }}
      >
        <DialogContent className="max-w-6xl gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4 pr-14 sm:px-6">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1" aria-live="polite">
                Foto {activeIndex + 1} dari {imageCount}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" onClick={() => setClampedZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Perkecil foto">
                <ZoomOut />
              </Button>
              <span className="min-w-12 text-center text-xs font-medium tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button type="button" variant="outline" size="icon" onClick={() => setClampedZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Perbesar foto">
                <ZoomIn />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={resetView} disabled={zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0} aria-label="Atur ulang posisi foto">
                <RotateCcw />
              </Button>
            </div>
          </div>
          <div className="relative h-[min(68vh,44rem)] overflow-hidden bg-black/95">
            <div
              className={cn("grid h-full place-items-center", zoom > MIN_ZOOM ? "cursor-grab touch-none" : "cursor-zoom-in")}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              <img
                src={resolveGalleryImageUrl(activeImage.contentUrl) ?? undefined}
                alt={activeImage.altText || `${title}, foto ${activeIndex + 1}`}
                onError={() => handleImageFailure(activeImage.contentUrl)}
                className={cn("max-h-full max-w-full select-none object-contain", dragStart ? "cursor-grabbing" : "transition-transform duration-200 ease-out motion-reduce:transition-none")}
                style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
                draggable={false}
              />
            </div>
            {imageCount > 1 ? (
              <>
                <Button type="button" variant="secondary" size="icon" className="absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/90 hover:bg-background" onClick={showPrevious} aria-label="Foto sebelumnya">
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="secondary" size="icon" className="absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-background/90 hover:bg-background" onClick={showNext} aria-label="Foto berikutnya">
                  <ChevronRight />
                </Button>
              </>
            ) : null}
          </div>
          <p className="px-5 py-3 text-xs text-muted-foreground sm:px-6">Gunakan tombol zoom untuk memperbesar foto, lalu seret gambar untuk melihat bagiannya.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
