import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { FILE_PURPOSE_POLICIES, type FilePurpose, type FileResponse } from "@granada-kost/domain";
import { Button } from "@/components/ui/button";
import { useFileDelete, useFilePreview, useFileUpload } from "@/hooks/useFileUpload";
import { adminErrorNotice } from "@/lib/error-normalizer";
import { formatFileSize, isImageMime, prepareFileForUpload } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

export type FileUploadReference = Pick<FileResponse, "id"> & Partial<Omit<FileResponse, "id">>;

type FileUploadFieldProps = {
  propertyId: string;
  filePurpose: FilePurpose;
  label: string;
  description?: string;
  value: FileUploadReference | null;
  onChange: (file: FileResponse | null) => void;
  required?: boolean;
  disabled?: boolean;
  capture?: "user" | "environment";
  className?: string;
  /** Marks the visible dropzone as invalid so form validation can focus it. */
  invalid?: boolean;
  /** Optional id of an external validation message for assistive technology. */
  errorId?: string;
  onBusyChange?: (busy: boolean) => void;
  /** Explicitly prepare image files before upload for this field. */
  compressImages?: boolean;
  /**
   * When false, removal only clears the owning form value. This prevents an
   * existing private file from being deleted before the parent mutation saves.
   */
  deleteOnRemove?: boolean;
  /** Uses a shorter add-file surface after another evidence file already exists. */
  compact?: boolean;
};

function policySummary(purpose: FilePurpose): string {
  const policy = FILE_PURPOSE_POLICIES[purpose];
  const parts = Object.entries(policy.maxBytesByMimeType).map(([mime, bytes]) => {
    const format =
      mime === "image/jpeg"
        ? "JPG"
        : mime === "image/png"
          ? "PNG"
          : mime === "image/webp"
            ? "WebP"
            : "PDF";
    return `${format} ${formatFileSize(bytes as number)}`;
  });
  return `${parts.join(" · ")}. Foto besar dikompresi otomatis sebelum diunggah.`;
}

export function FileUploadField({
  propertyId,
  filePurpose,
  label,
  description,
  value,
  onChange,
  required = false,
  disabled = false,
  capture,
  className,
  invalid = false,
  errorId,
  onBusyChange,
  compressImages,
  deleteOnRemove = true,
  compact = false,
}: FileUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);
  const propertyScopeRef = useRef(propertyId);
  propertyScopeRef.current = propertyId;
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compressionMessage, setCompressionMessage] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const upload = useFileUpload({ silent: true });
  const remove = useFileDelete({ silent: true });
  const preview = useFilePreview(value?.id ?? null);
  const policy = FILE_PURPOSE_POLICIES[filePurpose];
  const busy = disabled || isPreparing || upload.isUploading || remove.isPending;

  useEffect(() => {
    onBusyChange?.(isPreparing || upload.isUploading || remove.isPending);
  }, [isPreparing, onBusyChange, remove.isPending, upload.isUploading]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  function setLocalFile(file: File | null) {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = null;
    setLocalPreviewUrl(null);
    setSelectedName(file?.name ?? null);
    setSelectedSize(file?.size ?? null);
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      localUrlRef.current = url;
      setLocalPreviewUrl(url);
    }
  }

  async function selectFile(file: File | undefined) {
    if (!file || busy) return;
    const requestPropertyId = propertyId;
    setErrorMessage(null);
    setCompressionMessage(null);
    setIsPreparing(true);
    try {
      // Prepare the KTP in this component so the runtime behavior cannot
      // depend on a stale shared-purpose policy build.
      const prepared = await prepareFileForUpload(file, filePurpose, {
        compress: compressImages,
      });
      setLocalFile(prepared.file);
      if (prepared.wasCompressed) {
        setCompressionMessage(
          `Foto dioptimalkan dari ${formatFileSize(prepared.originalSizeBytes)} menjadi ${formatFileSize(prepared.file.size)}.`,
        );
      }
      const previous = value;
      const uploaded = await upload.uploadAsync({
        file: prepared.file,
        propertyId: requestPropertyId,
        filePurpose,
        // The file has already been normalized and compressed above.
        compress: false,
      });
      if (propertyScopeRef.current !== requestPropertyId) {
        await remove.mutateAsync(uploaded.id).catch(() => undefined);
        setLocalFile(null);
        setErrorMessage(
          "Properti aktif berubah saat file diproses. Pilih kembali file untuk properti saat ini.",
        );
        return;
      }
      onChange(uploaded);
      if (deleteOnRemove && previous && previous.id !== uploaded.id) {
        await remove.mutateAsync(previous.id).catch(() => undefined);
      }
    } catch (error) {
      setLocalFile(null);
      setCompressionMessage(null);
      const notice = adminErrorNotice(error, "File belum dapat diunggah");
      setErrorMessage(`${notice.title}. ${notice.description}`);
    } finally {
      setIsPreparing(false);
    }
  }

  async function removeFile() {
    if (!value || busy) return;
    setErrorMessage(null);
    setCompressionMessage(null);
    try {
      if (deleteOnRemove) {
        await remove.mutateAsync(value.id);
      }
      onChange(null);
      setLocalFile(null);
      upload.reset();
    } catch (error) {
      const notice = adminErrorNotice(error, "File belum dapat dihapus");
      setErrorMessage(`${notice.title}. ${notice.description}`);
    }
  }

  function openPreview() {
    if (!value || !preview.data || isOpening) return;
    setIsOpening(true);
    const link = document.createElement("a");
    link.href = preview.data;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    window.setTimeout(() => setIsOpening(false), 300);
  }

  const accept = policy.allowedMimeTypes.join(",");
  const displayedName = value?.original_filename ?? selectedName ?? "Dokumen tersimpan";
  const displayedSize = value?.file_size_bytes ?? selectedSize;
  const imagePreview = preview.data ?? localPreviewUrl;

  return (
    <section className={cn("space-y-3", className)} aria-busy={isPreparing || upload.isUploading}>
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        capture={capture}
        disabled={busy}
        onChange={(event) => {
          void selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {!value && !isPreparing && !upload.isUploading ? (
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          aria-invalid={invalid || undefined}
          aria-describedby={`${inputId}-hint${invalid && errorId ? ` ${errorId}` : ""}`}
          data-validation-target={invalid ? "true" : undefined}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!busy) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void selectFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "group flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-5 py-7 text-center outline-none transition-colors",
            compact && "min-h-0 flex-row justify-start px-4 py-3 text-left",
            "hover:border-primary/55 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragging && "border-primary bg-primary/10",
            busy && "cursor-not-allowed opacity-60",
            invalid && "border-destructive bg-destructive/5 ring-1 ring-destructive/30",
          )}
        >
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-sm",
              compact && "h-9 w-9",
            )}
          >
            {policy.allowedMimeTypes.includes("application/pdf") ? (
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {compact ? "Tambah file bukti" : "Klik untuk memilih file"}
            </p>
            <p className={cn("mt-1 text-xs text-muted-foreground", compact && "mt-0.5")}>
              {compact
                ? "Pilih atau seret file ke area ini"
                : "atau seret dan lepaskan file di area ini"}
            </p>
          </div>
        </div>
      ) : isPreparing || upload.isUploading ? (
        <div
          className="flex min-h-36 items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
          role="status"
        >
          {localPreviewUrl ? (
            <img
              src={localPreviewUrl}
              alt="Pratinjau file yang dipilih"
              className="h-20 w-20 rounded-lg border object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-lg border bg-background">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selectedName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Menyiapkan, mengompresi bila perlu, lalu mengunggah file…
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
              <Loader2 className="h-4 w-4 animate-spin" /> Sedang diproses
            </div>
          </div>
        </div>
      ) : value ? (
        <div className="grid gap-4 rounded-xl border border-success/35 bg-success/5 p-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {isImageMime(value.mime_type ?? "") && imagePreview ? (
              <img
                src={imagePreview}
                alt={`Pratinjau ${displayedName}`}
                className="h-full w-full object-cover"
              />
            ) : preview.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <FileText className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 self-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> File siap digunakan
            </div>
            <p className="mt-2 truncate text-sm font-medium" title={displayedName ?? undefined}>
              {displayedName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {displayedSize ? formatFileSize(displayedSize) : ""} · Tersimpan aman dan siap
              ditautkan.
            </p>
            {compressionMessage ? (
              <p className="mt-1 text-xs font-medium text-success">{compressionMessage}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!preview.data || isOpening}
                onClick={openPreview}
              >
                {preview.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}{" "}
                Lihat
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Ganti
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                disabled={busy}
                onClick={() => void removeFile()}
              >
                {remove.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}{" "}
                Hapus
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted-foreground">
        {policySummary(filePurpose)}
      </p>
      {errorMessage ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-destructive hover:text-destructive"
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Pilih ulang
          </Button>
        </div>
      ) : null}
    </section>
  );
}
