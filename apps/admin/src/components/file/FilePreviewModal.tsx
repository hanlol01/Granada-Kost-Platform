// FilePreviewModal — full-screen preview for images and PDF-friendly behavior
// for non-image files.
//
// Uses shadcn Dialog (Radix). Image preview fetches an authorized blob URL.
// PDF files are opened in a new tab via the blob URL, or rendered inline via
// <iframe> on desktop.
// Object URLs are revoked on dialog close/unmount.

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFilePreview } from "@/hooks/useFileUpload";
import { formatFileSize, isImageMime, isPdfMime, fetchFileBlob } from "@/lib/file-utils";
import type { FileResponse } from "@granada-kost/domain";

export type FilePreviewModalProps = {
  /** File metadata from the backend. Null = modal closed. */
  file: FileResponse | null;
  /** Called when the modal is closed. */
  onClose: () => void;
};

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const isOpen = file !== null;
  const isImage = file ? isImageMime(file.mime_type) : false;
  const isPdf = file ? isPdfMime(file.mime_type) : false;

  const { data: blobUrl, isLoading, isError } = useFilePreview(isOpen && isImage ? file!.id : null);

  // For PDF inline preview on desktop.
  const { data: pdfBlobUrl, isLoading: pdfLoading } = useFilePreview(
    isOpen && isPdf ? file!.id : null,
  );

  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  // Revoke locally-created object URLs when dialog closes or unmounts.
  useEffect(() => {
    return () => {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [localBlobUrl]);

  async function handleOpenNewTab() {
    if (!file) return;
    try {
      const url = await fetchFileBlob(file.id);
      setLocalBlobUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Error handling via console in fetchFileBlob.
    }
  }

  async function handleDownload() {
    if (!file) return;
    try {
      const url = await fetchFileBlob(file.id);
      setLocalBlobUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.sanitized_filename || file.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Errors surfaced via console in fetchFileBlob.
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="truncate text-sm font-semibold">
            {file?.original_filename ?? "Preview"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {file ? formatFileSize(file.file_size_bytes) : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Image preview */}
        {isImage && (
          <div className="flex min-h-[240px] items-center justify-center bg-black/5 px-4 pb-4">
            {isLoading && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
            {isError && <p className="text-sm text-destructive">Gagal memuat gambar.</p>}
            {blobUrl && (
              <img
                src={blobUrl}
                alt={file?.original_filename ?? ""}
                className="max-h-[65vh] w-auto rounded-md object-contain"
              />
            )}
          </div>
        )}

        {/* PDF inline preview (desktop — via iframe) */}
        {isPdf && (
          <div className="px-4 pb-4">
            {pdfLoading && (
              <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {pdfBlobUrl && (
              <iframe
                src={pdfBlobUrl}
                title={file?.original_filename ?? "PDF Preview"}
                className="h-[400px] w-full rounded-md border border-border"
              />
            )}
            <div className="mt-2 flex justify-center">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleOpenNewTab}>
                <ExternalLink className="h-3.5 w-3.5" />
                Buka di tab baru
              </Button>
            </div>
          </div>
        )}

        {/* Download button */}
        {file && (
          <div className="flex justify-end border-t px-4 py-3">
            <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
