// Generic file upload hooks for the Admin app.
//
// Provides useFileUpload, useFilePreview, and useFileDelete as purpose-agnostic
// hooks. Domain-specific wiring (payment proof review, complaint detail) consumes
// these hooks — they are NOT implemented here.
//
// Reference: docs/12-product-readiness/GENERIC_UPLOAD_ENGINE_PLAN.md
// Pattern:   TanStack Query mutation/query per ADR-FE-002.

import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { type FilePurpose, type FileResponse } from "@granada-kost/domain";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { FilePreparationError, fetchFileBlob, prepareFileForUpload } from "@/lib/file-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileUploadInput = {
  /** The raw File from <input type="file">. */
  file: File;
  /** Property scope for the upload. */
  propertyId: string;
  /** Determines validation policy (MIME, size, compression). */
  filePurpose: FilePurpose;
  /** Override the purpose-default compression setting. */
  compress?: boolean;
};

export type FileUploadHookOptions = {
  /** Suppress generic mutation toasts when a domain workflow owns feedback. */
  silent?: boolean;
  /** Called after a successful upload with the server response. */
  onUploadSuccess?: (response: FileResponse) => void;
  /** Called after an upload error. */
  onUploadError?: (error: unknown) => void;
};

export const PUBLIC_GALLERY_MAX_DIMENSION = 1920;

export async function createPublicGalleryDerivative(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("GALLERY_IMAGE_TYPE_INVALID");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      PUBLIC_GALLERY_MAX_DIMENSION / bitmap.width,
      PUBLIC_GALLERY_MAX_DIMENSION / bitmap.height,
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("GALLERY_DERIVATIVE_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("GALLERY_DERIVATIVE_FAILED"))),
        file.type,
        file.type === "image/png" ? undefined : 0.86,
      );
    });
    const extension =
      file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
    const stem = file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "gallery";
    return new File([blob], `${stem}-public${extension}`, {
      type: file.type,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// useFileUpload
// ---------------------------------------------------------------------------

export function useFileUpload(options?: FileUploadHookOptions) {
  const mutation = useMutation<FileResponse, unknown, FileUploadInput>({
    mutationFn: async (input) => {
      let prepared;
      try {
        prepared = await prepareFileForUpload(input.file, input.filePurpose, {
          compress: input.compress,
        });
      } catch (error) {
        if (!(error instanceof FilePreparationError)) throw error;
        throw new ApiError({
          code: error.code,
          message: error.message,
          status: 0,
        });
      }

      // The prepared File always carries a filename extension matching its
      // normalized MIME/content. Never pair a JPEG blob with the old .png name.
      const formData = new FormData();
      formData.append("file", prepared.file);
      formData.append("property_id", input.propertyId);
      formData.append("file_purpose", input.filePurpose);

      return apiClient.post<FileResponse>("/files", formData, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: (data) => {
      if (!options?.silent) toastMutationSuccess("File berhasil diupload");
      options?.onUploadSuccess?.(data);
    },
    onError: (err) => {
      if (!options?.silent) toastMutationError(err, "Gagal mengupload file");
      options?.onUploadError?.(err);
    },
  });

  return {
    /** Fire-and-forget upload. */
    uploadFile: mutation.mutate,
    /** Async upload — returns the FileResponse. */
    uploadAsync: mutation.mutateAsync,
    /** True while the upload request is in flight. */
    isUploading: mutation.isPending,
    /** The last upload error, if any. */
    uploadError: mutation.error,
    /** The last successful upload response. */
    lastUploadedFile: mutation.data ?? null,
    /** Reset mutation state to idle. */
    reset: mutation.reset,
  };
}

// ---------------------------------------------------------------------------
// useFilePreview
// ---------------------------------------------------------------------------

/**
 * Fetches file content as an authorized blob URL for preview.
 *
 * The returned `data` is an object URL string suitable for <img src>.
 * The consuming component MUST call URL.revokeObjectURL() in a useEffect
 * cleanup to prevent memory leaks.
 */
export function useFilePreview(fileId: string | null) {
  return useQuery<string, Error>({
    queryKey: ["file", "preview", fileId],
    queryFn: () => fetchFileBlob(fileId!),
    enabled: !!fileId,
    staleTime: 5 * 60_000, // 5 min — match backend Cache-Control: max-age=300
    gcTime: 10 * 60_000,
    retry: (count, err) => {
      // Don't retry auth or not-found errors.
      if (err.message.includes("403") || err.message.includes("404")) {
        return false;
      }
      return count < 1;
    },
  });
}

// ---------------------------------------------------------------------------
// useFileDelete
// ---------------------------------------------------------------------------

export function useFileDelete(options?: { silent?: boolean }) {
  return useMutation<{ success: boolean; file: FileResponse }, unknown, string>({
    mutationFn: async (fileId: string) =>
      apiClient.delete<{ success: boolean; file: FileResponse }>(`/files/${fileId}`),
    onSuccess: () => {
      if (!options?.silent) toastMutationSuccess("File berhasil dihapus");
    },
    onError: (err) => {
      if (!options?.silent) toastMutationError(err, "Gagal menghapus file");
    },
  });
}
