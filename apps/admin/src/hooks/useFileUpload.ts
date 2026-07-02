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
import { FILE_PURPOSE_POLICIES, type FilePurpose, type FileResponse } from "@granada-kost/domain";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { compressImage, fetchFileBlob, validateFileForPurpose } from "@/lib/file-utils";

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
  /** Called after a successful upload with the server response. */
  onUploadSuccess?: (response: FileResponse) => void;
  /** Called after an upload error. */
  onUploadError?: (error: unknown) => void;
};

// ---------------------------------------------------------------------------
// useFileUpload
// ---------------------------------------------------------------------------

export function useFileUpload(options?: FileUploadHookOptions) {
  const mutation = useMutation<FileResponse, unknown, FileUploadInput>({
    mutationFn: async (input) => {
      // 1. Client-side validation (UX only — backend is authoritative).
      const validation = validateFileForPurpose(input.file, input.filePurpose);
      if (!validation.valid) {
        throw new ApiError({
          code: validation.code,
          message: validation.message,
          status: 0,
        });
      }

      // 2. Optional image compression.
      const policy = FILE_PURPOSE_POLICIES[input.filePurpose];
      const shouldCompress = input.compress ?? policy.compressImages;
      let fileToUpload: File | Blob = input.file;
      if (shouldCompress && input.file.type.startsWith("image/")) {
        fileToUpload = await compressImage(input.file);
      }

      // 3. Build FormData.
      const formData = new FormData();
      formData.append("file", fileToUpload, input.file.name);
      formData.append("property_id", input.propertyId);
      formData.append("file_purpose", input.filePurpose);

      // 4. Upload via API client (multipart/form-data).
      return apiClient.post<FileResponse>("/files", formData, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: (data) => {
      toastMutationSuccess("File berhasil diupload");
      options?.onUploadSuccess?.(data);
    },
    onError: (err) => {
      toastMutationError(err, "Gagal mengupload file");
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

export function useFileDelete() {
  return useMutation<{ success: boolean; file: FileResponse }, unknown, string>({
    mutationFn: async (fileId: string) =>
      apiClient.delete<{ success: boolean; file: FileResponse }>(`/files/${fileId}`),
    onSuccess: () => {
      toastMutationSuccess("File berhasil dihapus");
    },
    onError: (err) => {
      toastMutationError(err, "Gagal menghapus file");
    },
  });
}
