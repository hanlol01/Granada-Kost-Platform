// Hunian gallery write path (M19C). Backend (M19B):
//   POST   /hunian-gallery                    attach uploaded hunian_gallery fileId
//   PATCH  /hunian-gallery/:imageId           altText/caption/publicVisible/sortOrder
//   POST   /hunian-gallery/:imageId/set-cover single cover per catalog item
//   POST   /hunian-gallery/reorder            batch sortOrder within one catalog item
//   DELETE /hunian-gallery/:imageId           soft delete (underlying file kept)
// All endpoints: JWT + RBAC owner|manager|admin (room.manage), property-scoped,
// audited backend-side. property_owner is read-only and receives 403 here -
// frontend gating is UX-only, backend remains the policy authority.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import type {
  HunianGalleryCategory,
  HunianGalleryFloorCode,
  HunianGalleryGender,
  HunianGalleryImage,
} from "./useHunianGallery";

const LIST_KEY = ["hunian-gallery"] as const;

export type AttachHunianGalleryInput = {
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode?: string;
  floorCode?: HunianGalleryFloorCode;
  fileId: string;
  altText: string;
  caption?: string;
};

// Attach is intentionally toast-silent on success: the page shows one summary
// toast per upload batch instead of two toasts per photo.
export function useAttachHunianGalleryImage() {
  const qc = useQueryClient();
  return useMutation<HunianGalleryImage, unknown, AttachHunianGalleryInput>({
    mutationFn: (input) =>
      apiClient.post<HunianGalleryImage>("/hunian-gallery", input, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toastMutationError(err, "Gagal menambahkan foto ke galeri"),
  });
}

export type UpdateHunianGalleryInput = {
  imageId: string;
  altText?: string;
  caption?: string | null;
  publicVisible?: boolean;
  sortOrder?: number;
};

export function useUpdateHunianGalleryImage() {
  const qc = useQueryClient();
  return useMutation<HunianGalleryImage, unknown, UpdateHunianGalleryInput>({
    mutationFn: ({ imageId, ...body }) =>
      apiClient.patch<HunianGalleryImage>(`/hunian-gallery/${imageId}`, body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (_data, vars) => {
      if (vars.publicVisible === true) {
        toastMutationSuccess("Foto dipublikasikan ke katalog publik");
      } else if (vars.publicVisible === false) {
        toastMutationSuccess("Foto disembunyikan dari publik");
      } else {
        toastMutationSuccess("Perubahan foto disimpan");
      }
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toastMutationError(err, "Gagal menyimpan perubahan foto"),
  });
}

export function useSetHunianGalleryCover() {
  const qc = useQueryClient();
  return useMutation<HunianGalleryImage, unknown, { imageId: string }>({
    mutationFn: ({ imageId }) =>
      apiClient.post<HunianGalleryImage>(
        `/hunian-gallery/${imageId}/set-cover`,
        {},
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: () => {
      toastMutationSuccess("Foto dijadikan cover");
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toastMutationError(err, "Gagal menjadikan foto sebagai cover"),
  });
}

export type ReorderHunianGalleryInput = {
  catalogSlug: string;
  items: { id: string; sortOrder: number }[];
};

export function useReorderHunianGallery() {
  const qc = useQueryClient();
  return useMutation<HunianGalleryImage[], unknown, ReorderHunianGalleryInput>({
    mutationFn: (input) =>
      apiClient.post<HunianGalleryImage[]>("/hunian-gallery/reorder", input, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      toastMutationSuccess("Urutan foto disimpan");
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toastMutationError(err, "Gagal menyimpan urutan foto"),
  });
}

export function useDeleteHunianGalleryImage() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { imageId: string }>({
    mutationFn: ({ imageId }) => apiClient.delete(`/hunian-gallery/${imageId}`),
    onSuccess: () => {
      toastMutationSuccess("Foto dihapus dari galeri");
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toastMutationError(err, "Gagal menghapus foto"),
  });
}
