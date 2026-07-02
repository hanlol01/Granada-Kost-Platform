// FilePreview — renders an authorized image thumbnail or PDF/file icon.
//
// Uses useFilePreview() for authorized blob fetch. Object URL is revoked on
// unmount to prevent memory leaks.

import { useEffect, useState } from "react";
import { FileText, ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { useFilePreview } from "@/hooks/useFileUpload";
import { formatFileSize, isImageMime, isPdfMime } from "@/lib/file-utils";
import type { FileResponse } from "@granada-kost/domain";

export type FilePreviewProps = {
  /** File metadata from the backend. */
  file: FileResponse;
  /** Size of the thumbnail in pixels. Default: 64. */
  size?: number;
  /** Called when the preview is clicked. */
  onClick?: () => void;
  /** Optional className override. */
  className?: string;
};

export function FilePreview({ file, size = 64, onClick, className }: FilePreviewProps) {
  const isImage = isImageMime(file.mime_type);
  const isPdf = isPdfMime(file.mime_type);
  const { data: blobUrl, isLoading, isError } = useFilePreview(isImage ? file.id : null);
  const [revokeUrl, setRevokeUrl] = useState<string | null>(null);

  // Track and revoke object URLs on unmount.
  useEffect(() => {
    if (blobUrl && blobUrl !== revokeUrl) {
      // Revoke previous URL if it changed.
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      setRevokeUrl(blobUrl);
    }
    return () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl]);

  const containerStyle = {
    width: size,
    height: size,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (onClick ? "cursor-pointer" : "cursor-default") +
        (className ? ` ${className}` : "")
      }
      style={containerStyle}
      title={file.original_filename}
      aria-label={`Preview ${file.original_filename}`}
    >
      {isImage && isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {isImage && isError && <AlertCircle className="h-5 w-5 text-destructive" />}

      {isImage && blobUrl && (
        <img
          src={blobUrl}
          alt={file.original_filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}

      {isPdf && <FileText className="h-6 w-6 text-muted-foreground" />}

      {!isImage && !isPdf && <ImageIcon className="h-6 w-6 text-muted-foreground" />}

      {/* File size overlay */}
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[9px] leading-tight text-white">
        {formatFileSize(file.file_size_bytes)}
      </span>
    </button>
  );
}
