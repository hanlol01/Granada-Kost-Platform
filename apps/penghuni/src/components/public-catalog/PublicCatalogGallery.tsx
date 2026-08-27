import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  resolveGalleryImageUrl,
  type PublicHunianGalleryImage,
} from "@/hooks/usePublicHunianCatalog";

type Props = {
  images: PublicHunianGalleryImage[] | null | undefined;
  title: string;
  fallbackImage: string;
};

export function PublicCatalogGallery({ images, title, fallbackImage }: Props) {
  const slides = useMemo(() => {
    const available = (images ?? [])
      .map((image) => ({
        src: resolveGalleryImageUrl(image.contentUrl),
        alt: image.altText,
        caption: image.caption,
      }))
      .filter((image): image is { src: string; alt: string; caption: string | null } =>
        Boolean(image.src),
      );
    return available.length
      ? available
      : [{ src: fallbackImage, alt: `Suasana ${title}`, caption: null }];
  }, [fallbackImage, images, title]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });

  const change = useCallback(
    (direction: number) => {
      setIndex((current) => (current + direction + slides.length) % slides.length);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    },
    [slides.length],
  );

  useEffect(() => {
    if (
      slides.length < 2 ||
      open ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }
    const timer = window.setInterval(() => change(1), 5200);
    return () => window.clearInterval(timer);
  }, [change, open, slides.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") change(-1);
      if (event.key === "ArrowRight") change(1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [change, open]);

  const active = slides[index] ?? slides[0];
  const setSafeZoom = (value: number) => {
    const next = Math.max(1, Math.min(3, value));
    setZoom(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };

  return (
    <>
      <div className="group relative min-h-[330px] overflow-hidden bg-[#210308] md:min-h-[520px]">
        <button
          type="button"
          className="absolute inset-0 h-full w-full cursor-zoom-in"
          onClick={() => setOpen(true)}
          aria-label={`Buka galeri ${title}`}
        >
          <img
            src={active.src}
            alt={active.alt}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-[#210308]/45 via-transparent to-[#210308]/10" />
        </button>
        {slides.length > 1 ? (
          <>
            <GalleryArrow direction="previous" onClick={() => change(-1)} />
            <GalleryArrow direction="next" onClick={() => change(1)} />
          </>
        ) : null}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-[#210308]/45 px-3 py-2 backdrop-blur">
          {slides.map((slide, slideIndex) => (
            <button
              key={`${slide.src}-${slideIndex}`}
              type="button"
              onClick={() => setIndex(slideIndex)}
              className={`h-1.5 rounded-full transition-all ${slideIndex === index ? "w-7 bg-white" : "w-1.5 bg-white/55"}`}
              aria-label={`Tampilkan foto ${slideIndex + 1}`}
            />
          ))}
        </div>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Galeri ${title}`}
          className="fixed inset-0 z-[100] flex flex-col bg-[#130205]/95 text-white backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.22em] text-white/60">
                Galeri hunian
              </p>
              <p className="font-public-display text-xl">{title}</p>
            </div>
            <div className="flex items-center gap-2">
              <GalleryTool label="Perkecil foto" onClick={() => setSafeZoom(zoom - 0.5)}>
                <ZoomOut />
              </GalleryTool>
              <span className="min-w-12 text-center font-mono text-xs text-white/70">
                {Math.round(zoom * 100)}%
              </span>
              <GalleryTool label="Perbesar foto" onClick={() => setSafeZoom(zoom + 0.5)}>
                <ZoomIn />
              </GalleryTool>
              <GalleryTool
                label="Reset foto"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <RotateCcw />
              </GalleryTool>
              <GalleryTool label="Tutup galeri" onClick={() => setOpen(false)}>
                <X />
              </GalleryTool>
            </div>
          </div>
          <div
            className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={(event) => {
              if (zoom <= 1) return;
              dragStart.current = { x: event.clientX, y: event.clientY };
              dragOrigin.current = offset;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragStart.current || zoom <= 1) return;
              setOffset({
                x: dragOrigin.current.x + event.clientX - dragStart.current.x,
                y: dragOrigin.current.y + event.clientY - dragStart.current.y,
              });
            }}
            onPointerUp={() => {
              dragStart.current = null;
            }}
          >
            <img
              src={active.src}
              alt={active.alt}
              draggable={false}
              className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
              style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }}
            />
            {slides.length > 1 ? (
              <>
                <GalleryArrow direction="previous" onClick={() => change(-1)} />
                <GalleryArrow direction="next" onClick={() => change(1)} />
              </>
            ) : null}
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-center text-sm text-white/65">
            {active.caption ?? `${index + 1} dari ${slides.length} foto`}
          </div>
        </div>
      ) : null}
    </>
  );
}

function GalleryArrow({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const previous = direction === "previous";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/45 bg-[#210308]/45 text-white backdrop-blur transition hover:bg-[#5C1D24] ${previous ? "left-4" : "right-4"}`}
      aria-label={previous ? "Foto sebelumnya" : "Foto berikutnya"}
    >
      {previous ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}

function GalleryTool({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 transition hover:bg-[#5C1D24] [&_svg]:h-5 [&_svg]:w-5"
      aria-label={label}
    >
      {children}
    </button>
  );
}
