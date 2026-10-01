import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFilePreview } from "@/hooks/useFileUpload";
import { formatFileSize, isImageMime, isPdfMime, fetchFileResponse } from "@/lib/file-utils";
import { fetchPreviewAndDownload } from "@/lib/document-download";
import type { FileResponse } from "@granada-kost/domain";

export type FilePreviewReference = Pick<
  FileResponse,
  "id" | "original_filename" | "mime_type" | "file_size_bytes"
> &
  Partial<Pick<FileResponse, "sanitized_filename">>;
export type FilePreviewModalProps = { file: FilePreviewReference | null; onClose: () => void };

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const isImage = file ? isImageMime(file.mime_type) : false;
  const isPdf = file ? isPdfMime(file.mime_type) : false;
  const {
    data: blobUrl,
    isLoading,
    isError,
  } = useFilePreview(file && (isImage || isPdf) ? file.id : null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function handleDownload() {
    if (!file || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const extension =
        file.mime_type === "application/pdf" ? "pdf" : file.mime_type.split("/")[1] || "bin";
      await fetchPreviewAndDownload(
        () => fetchFileResponse(file.id),
        `Berkas-Terlampir.${extension}`,
        { preview: false },
      );
    } catch {
      setDownloadError("Berkas gagal diunduh. Silakan coba kembali.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) {
          setDownloadError("");
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 p-4 pr-12">
          <DialogTitle className="break-words text-sm font-semibold">
            {file?.original_filename ?? "Pratinjau berkas"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {file ? formatFileSize(file.file_size_bytes) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 px-4 pb-4">
          {isLoading && (
            <Loader2
              aria-label="Memuat berkas"
              className="h-8 w-8 animate-spin text-muted-foreground"
            />
          )}
          {isError && (
            <p role="alert" className="text-sm text-destructive">
              Berkas gagal dimuat. Silakan coba kembali.
            </p>
          )}
          {isImage && blobUrl && (
            <img
              src={blobUrl}
              alt={file?.original_filename ?? "Bukti"}
              className="max-h-[65dvh] max-w-full rounded-md object-contain"
            />
          )}
          {isPdf && blobUrl && (
            <iframe
              src={`${blobUrl}#toolbar=0`}
              title="Pratinjau PDF"
              className="h-[60dvh] w-full rounded-md border border-border"
            />
          )}
        </div>
        {file && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-4 py-3">
            {downloadError && (
              <p role="alert" className="text-sm text-destructive">
                {downloadError}
              </p>
            )}
            <Button
              className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Mengunduh…" : "Unduh"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
