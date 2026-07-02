// FilePickerButton — generic file input with client-side validation.
//
// Purpose-driven: the `filePurpose` prop determines which MIME types and
// size limits are shown and enforced (UX only — backend is authoritative).
//
// Supports optional `multiple` for multi-file surfaces and `capture` for
// mobile camera capture.

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FILE_PURPOSE_POLICIES,
  type FilePurpose,
  type SupportedMimeType,
} from "@granada-kost/domain";
import { validateFileForPurpose, formatFileSize } from "@/lib/file-utils";

export type FilePickerButtonProps = {
  /** Determines allowed MIME types, size limits, and UI label. */
  filePurpose: FilePurpose;
  /** Called when files pass client-side validation. */
  onFilesSelected: (files: File[]) => void;
  /** Allow selecting multiple files. Default: false. */
  multiple?: boolean;
  /** Mobile camera capture attribute ("environment" | "user"). */
  capture?: "environment" | "user";
  /** Whether the picker is disabled. */
  disabled?: boolean;
  /** Optional className override. */
  className?: string;
};

export function FilePickerButton({
  filePurpose,
  onFilesSelected,
  multiple = false,
  capture,
  disabled = false,
  className,
}: FilePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const policy = FILE_PURPOSE_POLICIES[filePurpose];
  const acceptTypes = policy.allowedMimeTypes.join(",");

  const maxSizes = Object.entries(policy.maxBytesByMimeType)
    .map(([mime, bytes]) => {
      const label = mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : "PDF";
      return `${label} maks. ${formatFileSize(bytes as number)}`;
    })
    .join(", ");

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setValidationError(null);
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const maxFiles = multiple ? policy.maxFilesPerEntity : 1;

    if (files.length > maxFiles) {
      setValidationError(`Maksimum ${maxFiles} file.`);
      resetInput();
      return;
    }

    // Validate each file.
    for (const file of files) {
      const result = validateFileForPurpose(file, filePurpose);
      if (!result.valid) {
        setValidationError(result.message);
        resetInput();
        return;
      }
    }

    onFilesSelected(files);
    resetInput();
  }

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        multiple={multiple}
        capture={capture}
        onChange={handleChange}
        className="sr-only"
        id={`file-picker-${filePurpose}`}
        disabled={disabled}
        aria-label={`Pilih ${policy.label.toLowerCase()}`}
      />

      <Button
        type="button"
        variant="outline"
        size="default"
        disabled={disabled}
        className="w-full justify-start gap-2 rounded-xl"
        onClick={() => inputRef.current?.click()}
      >
        {policy.allowedMimeTypes.includes("application/pdf" as SupportedMimeType) ? (
          <FileText className="h-4 w-4 shrink-0" />
        ) : (
          <ImagePlus className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">Pilih {policy.label.toLowerCase()}</span>
      </Button>

      <p className="mt-1 text-[11px] text-muted-foreground">{maxSizes}</p>

      {validationError && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}
