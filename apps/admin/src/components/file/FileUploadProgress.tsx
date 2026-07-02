// FileUploadProgress — indeterminate progress indicator shown during upload.
//
// Phase 1 uses an indeterminate animation because fetch() does not support
// upload progress events. Files are ≤ 2 MB and upload in < 2 seconds on
// typical connections, making a percentage bar unnecessary.

import { Loader2 } from "lucide-react";

export type FileUploadProgressProps = {
  /** The filename being uploaded. */
  filename: string;
  /** Optional className override. */
  className?: string;
};

export function FileUploadProgress({ filename, className }: FileUploadProgressProps) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 " + (className ?? "")
      }
      role="status"
      aria-label="Mengupload file"
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{filename}</p>
        <p className="text-xs text-muted-foreground">Mengupload…</p>
      </div>
    </div>
  );
}
