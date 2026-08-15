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
import { formatFileSize, isImageMime } from "@/lib/file-utils";
import { fileUploadErrorMessage } from "@/lib/mutation-feedback";
import { cn } from "@/lib/utils";

type Props = {
  propertyId: string;
  filePurpose: FilePurpose;
  label: string;
  description?: string;
  value: FileResponse | null;
  onChange: (file: FileResponse | null) => void;
  required?: boolean;
  disabled?: boolean;
  capture?: "user" | "environment";
  className?: string;
  onBusyChange?: (busy: boolean) => void;
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
  onBusyChange,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef<string | null>(null);
  const propertyScopeRef = useRef(propertyId);
  propertyScopeRef.current = propertyId;
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const upload = useFileUpload({ silent: true });
  const remove = useFileDelete({ silent: true });
  const preview = useFilePreview(value?.id ?? null);
  const policy = FILE_PURPOSE_POLICIES[filePurpose];
  const busy = disabled || upload.isUploading || remove.isPending;

  useEffect(() => {
    onBusyChange?.(upload.isUploading || remove.isPending);
  }, [onBusyChange, remove.isPending, upload.isUploading]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(
    () => () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    },
    [],
  );

  function setLocalFile(file: File | null) {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = null;
    setLocalPreviewUrl(null);
    setSelectedName(file?.name ?? null);
    setSelectedSize(file?.size ?? null);
    if (file?.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      localUrlRef.current = url;
      setLocalPreviewUrl(url);
    }
  }

  async function selectFile(file?: File) {
    if (!file || busy) return;
    const requestPropertyId = propertyId;
    setErrorMessage(null);
    setLocalFile(file);
    try {
      const previous = value;
      const saved = await upload.uploadAsync({ file, propertyId: requestPropertyId, filePurpose });
      if (propertyScopeRef.current !== requestPropertyId) {
        await remove.mutateAsync(saved.id).catch(() => undefined);
        setLocalFile(null);
        setErrorMessage(
          "Data akun berubah saat file diproses. Pilih kembali file untuk akun saat ini.",
        );
        return;
      }
      onChange(saved);
      if (previous && previous.id !== saved.id) {
        await remove.mutateAsync(previous.id).catch(() => undefined);
      }
    } catch (error) {
      setLocalFile(null);
      setErrorMessage(fileUploadErrorMessage(error, "File belum dapat diunggah"));
    }
  }

  async function removeFile() {
    if (!value || busy) return;
    setErrorMessage(null);
    try {
      await remove.mutateAsync(value.id);
      onChange(null);
      setLocalFile(null);
      upload.reset();
    } catch (error) {
      setErrorMessage(fileUploadErrorMessage(error, "File belum dapat dihapus"));
    }
  }

  function openPreview() {
    if (!preview.data) return;
    const link = document.createElement("a");
    link.href = preview.data;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }

  const displayedName = value?.original_filename ?? selectedName;
  const displayedSize = value?.file_size_bytes ?? selectedSize;
  const imagePreview = preview.data ?? localPreviewUrl;

  return (
    <section className={cn("space-y-3", className)} aria-busy={upload.isUploading}>
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
        accept={policy.allowedMimeTypes.join(",")}
        capture={capture}
        disabled={busy}
        onChange={(event) => {
          void selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {!value && !upload.isUploading ? (
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
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
            "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center outline-none transition-colors",
            "hover:border-primary/55 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring",
            isDragging && "border-primary bg-primary/10",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border bg-background shadow-sm">
            {policy.allowedMimeTypes.includes("application/pdf") ? (
              <FileText className="h-5 w-5 text-primary" />
            ) : (
              <ImagePlus className="h-5 w-5 text-primary" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold">Klik untuk memilih file</p>
            <p className="mt-1 text-xs text-muted-foreground">
              atau seret dan lepaskan file di area ini
            </p>
          </div>
        </div>
      ) : upload.isUploading ? (
        <div
          className="flex min-h-36 items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5"
          role="status"
        >
          {localPreviewUrl ? (
            <img
              src={localPreviewUrl}
              alt="Pratinjau file"
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
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
              <Loader2 className="h-4 w-4 animate-spin" /> Sedang diproses
            </p>
          </div>
        </div>
      ) : value ? (
        <div className="grid gap-4 rounded-xl border border-success/35 bg-success/5 p-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-background">
            {isImageMime(value.mime_type) && imagePreview ? (
              <img
                src={imagePreview}
                alt={`Pratinjau ${displayedName}`}
                className="h-full w-full object-cover"
              />
            ) : preview.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <FileText className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 self-center">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> File siap digunakan
            </p>
            <p className="mt-2 truncate text-sm font-medium">{displayedName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {displayedSize ? formatFileSize(displayedSize) : ""} · Tersimpan aman.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!preview.data}
                onClick={openPreview}
              >
                <Eye className="h-4 w-4" /> Lihat
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
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">{policySummary(filePurpose)}</p>
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
            className="h-8 text-destructive"
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Pilih ulang
          </Button>
        </div>
      ) : null}
    </section>
  );
}
