import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { FilePreview } from "@/components/file/FilePreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-utils";
import type { FileResponse } from "@granada-kost/domain";

type ImageUploadFieldProps = {
  id: string;
  label: string;
  description: string;
  file: FileResponse | null;
  error: string | null;
  isUploading: boolean;
  isRemoving: boolean;
  capture?: "user" | "environment";
  maxBytes: number;
  prepareFile?: (file: File) => Promise<File>;
  onFileSelected: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export function ImageUploadField({
  id,
  label,
  description,
  file,
  error,
  isUploading,
  isRemoving,
  capture,
  maxBytes,
  prepareFile,
  onFileSelected,
  onRemove,
}: ImageUploadFieldProps) {
  const inputId = `${id}-input`;
  const headingId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const clearLocalPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setLocalPreviewUrl(null);
    setLocalFile(null);
  };

  const selectFile = async (candidate: File | undefined) => {
    if (!candidate || isUploading || isRemoving) return;
    setLocalError(null);
    if (!IMAGE_TYPES.has(candidate.type)) {
      setLocalError("Gunakan foto KTP berformat JPG atau PNG.");
      return;
    }
    if (candidate.size > maxBytes) {
      setLocalError(`Ukuran foto KTP maksimal ${formatFileSize(maxBytes)}.`);
      return;
    }

    try {
      const prepared = prepareFile ? await prepareFile(candidate) : candidate;
      if (prepared.size > maxBytes) {
        setLocalError(`Ukuran foto KTP maksimal ${formatFileSize(maxBytes)}.`);
        return;
      }
      clearLocalPreview();
      const url = URL.createObjectURL(prepared);
      previewUrlRef.current = url;
      setLocalPreviewUrl(url);
      setLocalFile(prepared);
      await onFileSelected(prepared);
    } catch (selectionError) {
      clearLocalPreview();
      setLocalError(
        selectionError instanceof Error
          ? selectionError.message
          : "Foto KTP belum dapat diunggah. Coba lagi.",
      );
    }
  };

  const handleInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await selectFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleRemove = async () => {
    if (!file || isUploading || isRemoving) return;
    setLocalError(null);
    try {
      await onRemove();
      clearLocalPreview();
    } catch (removeError) {
      setLocalError(
        removeError instanceof Error
          ? removeError.message
          : "Foto KTP belum dapat dihapus. Coba lagi.",
      );
    }
  };

  const activeError = error ?? localError;
  const hasPreview = Boolean(file || localPreviewUrl);
  const fileName = file?.original_filename ?? localFile?.name ?? "Foto KTP";
  const fileSize = file?.file_size_bytes ?? localFile?.size ?? 0;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border/80 bg-card/30 p-4 sm:p-5"
    >
      <div className="mb-4 space-y-1">
        <h3 id={headingId} className="text-sm font-semibold">
          {label}
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png"
        capture={capture}
        onChange={handleInputChange}
      />

      {!hasPreview ? (
        <div
          role="button"
          tabIndex={isUploading || isRemoving ? -1 : 0}
          aria-controls={inputId}
          aria-disabled={isUploading || isRemoving}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isUploading && !isRemoving) setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void selectFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center outline-none transition-colors",
            "border-muted-foreground/30 bg-muted/20 hover:border-primary/55 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragging && "border-primary bg-primary/10",
            (isUploading || isRemoving) && "cursor-wait opacity-70",
          )}
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold">
              {isUploading ? "Mengunggah foto KTP..." : "Klik untuk memilih foto"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              atau seret dan lepaskan file di sini
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 rounded-lg border border-border/80 bg-muted/10 p-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
          <div className="relative h-28 overflow-hidden rounded-md border bg-background sm:h-full">
            {file ? (
              <FilePreview file={file} size={112} className="h-full w-full object-cover" />
            ) : localPreviewUrl ? (
              <img
                src={localPreviewUrl}
                alt={`Pratinjau ${label}`}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 self-center">
            <p className="truncate text-sm font-semibold" title={fileName}>
              {fileName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fileSize ? `${formatFileSize(fileSize)}. ` : ""}
              {isUploading ? "Foto sedang diunggah." : "Foto siap ditautkan ke penghuni."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isUploading || isRemoving}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden="true" /> Ganti foto
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-destructive hover:text-destructive"
                disabled={isUploading || isRemoving}
                onClick={() => void handleRemove()}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}

      {isUploading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-primary" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Mengunggah foto KTP...
        </div>
      ) : null}
      {activeError ? (
        <div className="mt-3 flex items-start gap-2 text-sm text-destructive" role="alert">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{activeError}</span>
        </div>
      ) : null}
    </section>
  );
}
