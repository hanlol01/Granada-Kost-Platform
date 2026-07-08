// Drag-and-drop upload zone for the hunian gallery (M19C).
// UX-only file selection: per-file validation happens in the page via
// validateFileForPurpose, and the backend remains authoritative (MIME +
// magic bytes + size + purpose + max 10 images per catalog item).

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

// Image-only accept filter. No video, no SVG, no documents (M19A freeze).
export const GALLERY_ACCEPT = "image/jpeg,image/png,image/webp";

type Props = {
  disabled?: boolean;
  disabledReason?: string;
  remainingSlots: number;
  onFilesSelected: (files: File[]) => void;
};

export function GalleryDropzone({
  disabled = false,
  disabledReason,
  remainingSlots,
  onFilesSelected,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) onFilesSelected(files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Pilih atau tarik foto galeri hunian"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
          : "cursor-pointer border-border bg-card hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && !disabled && "border-primary bg-primary/10",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={GALLERY_ACCEPT}
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFilesSelected(files);
          // Allow re-selecting the same file after removal from the queue.
          e.target.value = "";
        }}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ImagePlus className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold">
        Tarik &amp; letakkan foto di sini, atau klik untuk memilih
      </p>
      <p className="text-xs text-muted-foreground">
        JPEG, PNG, atau WebP · maks 3 MB per foto · maks 10 foto per hunian
      </p>
      {disabled && disabledReason ? (
        <p className="text-xs font-medium text-muted-foreground">{disabledReason}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Sisa slot: {remainingSlots} foto</p>
      )}
    </div>
  );
}
