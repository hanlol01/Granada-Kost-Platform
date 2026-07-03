// AttachedFilesPreview — displays a row of file thumbnails with click-to-preview.
//
// Used by both payment proof review and complaint detail to show attached files.
// Fetches authorized blob URLs via useFilePreview / FilePreview from M12C2.

import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { FilePreview } from "@/components/file/FilePreview";
import { FilePreviewModal } from "@/components/file/FilePreviewModal";
import type { FileMetadataRecord } from "@/hooks/useBilling";
import type { FileResponse } from "@granada-kost/domain";

type AttachedFilesPreviewProps = {
  /** File metadata from the backend endpoint. */
  files: FileMetadataRecord[] | undefined;
  /** Whether files are loading. */
  isLoading?: boolean;
  /** Label shown above the file row. Default: "Lampiran". */
  label?: string;
  /** Thumbnail size in px. Default: 56. */
  size?: number;
};

/** Maps backend snake_case FileMetadataRecord to the camelCase FileResponse expected by FilePreview. */
function toFileResponse(f: FileMetadataRecord): FileResponse {
  return {
    id: f.id,
    property_id: f.property_id,
    uploader_user_id: f.uploader_user_id,
    original_filename: f.original_filename,
    sanitized_filename: f.sanitized_filename,
    mime_type: f.mime_type,
    file_extension: f.file_extension,
    file_size_bytes: f.file_size_bytes,
    file_purpose: f.file_purpose,
    storage_driver: f.storage_driver,
    checksum_sha256: f.checksum_sha256,
    is_deleted: f.is_deleted,
    deleted_at: f.deleted_at,
    created_at: f.created_at,
    updated_at: f.updated_at,
  };
}

export function AttachedFilesPreview({
  files,
  isLoading = false,
  label = "Lampiran",
  size = 56,
}: AttachedFilesPreviewProps) {
  const [previewFile, setPreviewFile] = useState<FileResponse | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Memuat lampiran…</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return null;
  }

  const mapped = files.map(toFileResponse);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        {label} ({files.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {mapped.map((f) => (
          <FilePreview key={f.id} file={f} size={size} onClick={() => setPreviewFile(f)} />
        ))}
      </div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
