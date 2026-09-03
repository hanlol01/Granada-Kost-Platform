import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { type FilePurpose, type FileResponse } from "@granada-kost/domain";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/file/FilePreview";
import { FilePreviewModal } from "@/components/file/FilePreviewModal";
import { FileUploadField } from "@/components/file/FileUploadField";
import { useFileDelete } from "@/hooks/useFileUpload";
import { adminErrorNotice } from "@/lib/error-normalizer";
import { formatFileSize } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

type EvidenceFileUploadFieldProps = {
  propertyId: string;
  filePurpose?: FilePurpose;
  label: string;
  description?: string;
  values: FileResponse[];
  onChange: (files: FileResponse[]) => void;
  required?: boolean;
  disabled?: boolean;
  capture?: "user" | "environment";
  maxFiles?: number;
  invalid?: boolean;
  errorId?: string;
  onBusyChange?: (busy: boolean) => void;
  deleteOnRemove?: boolean;
  className?: string;
};

export function EvidenceFileUploadField({
  propertyId,
  filePurpose = "payment_proof",
  label,
  description,
  values,
  onChange,
  required = false,
  disabled = false,
  capture,
  maxFiles = 5,
  invalid = false,
  errorId,
  onBusyChange,
  deleteOnRemove = true,
  className,
}: EvidenceFileUploadFieldProps) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileResponse | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const remove = useFileDelete({ silent: true });
  const busy = uploadBusy || remove.isPending;
  const canAdd = values.length < maxFiles;

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const appendFile = (file: FileResponse | null) => {
    if (!file) return;
    setErrorMessage(null);
    if (values.some((item) => item.id === file.id)) return;
    if (values.length >= maxFiles) {
      setErrorMessage(`Maksimal ${maxFiles} file bukti dapat dilampirkan.`);
      return;
    }
    onChange([...values, file]);
  };

  const removeFile = async (file: FileResponse) => {
    if (busy) return;
    setErrorMessage(null);
    setRemovingId(file.id);
    try {
      if (deleteOnRemove) await remove.mutateAsync(file.id);
      onChange(values.filter((item) => item.id !== file.id));
      if (previewFile?.id === file.id) setPreviewFile(null);
    } catch (error) {
      const notice = adminErrorNotice(error, "Bukti belum dapat dihapus");
      setErrorMessage(`${notice.title}. ${notice.description}`);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section
      className={cn("space-y-3", className)}
      aria-busy={busy}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && errorId ? errorId : undefined}
      data-validation-target={invalid ? "true" : undefined}
      tabIndex={invalid ? -1 : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </p>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
          aria-live="polite"
        >
          {values.length} dari maksimal {maxFiles} file
        </span>
      </div>

      {values.length > 0 ? (
        <div className="grid gap-3" aria-label={`Daftar ${label.toLowerCase()}`}>
          {values.map((file, index) => (
            <article
              key={file.id}
              className="grid min-w-0 gap-3 rounded-xl border border-success/30 bg-success/5 p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center"
            >
              <FilePreview file={file} size={72} onClick={() => setPreviewFile(file)} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Bukti {index + 1} siap digunakan
                </p>
                <p className="mt-1 truncate text-sm font-medium" title={file.original_filename}>
                  {file.original_filename}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFileSize(file.file_size_bytes)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button type="button" variant="info" onClick={() => setPreviewFile(file)}>
                  <Eye className="h-4 w-4" aria-hidden="true" /> Lihat
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void removeFile(file)}
                >
                  {removingId === file.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Hapus
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {canAdd ? (
        <FileUploadField
          propertyId={propertyId}
          filePurpose={filePurpose}
          label={values.length > 0 ? "Tambah bukti lain" : "Tambah bukti"}
          description={
            values.length > 0
              ? `Anda masih dapat menambahkan ${maxFiles - values.length} file.`
              : undefined
          }
          value={null}
          onChange={appendFile}
          disabled={disabled || busy}
          capture={capture}
          onBusyChange={setUploadBusy}
          compressImages
          deleteOnRemove={false}
          compact={values.length > 0}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
          Batas {maxFiles} file telah tercapai. Hapus salah satu bukti untuk menggantinya.
        </div>
      )}

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {canAdd && values.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Setiap bukti dapat dilihat atau dihapus secara terpisah.
        </p>
      ) : null}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </section>
  );
}
