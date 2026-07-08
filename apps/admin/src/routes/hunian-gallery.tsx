// Admin Hunian Gallery Management (M19C). Consumes the M19B backend:
//   GET    /hunian-gallery                (list incl. drafts; owner|manager|admin|property_owner)
//   POST   /hunian-gallery                (attach uploaded hunian_gallery fileId; room.manage)
//   PATCH  /hunian-gallery/:imageId       (altText/caption/publicVisible)
//   POST   /hunian-gallery/:imageId/set-cover
//   POST   /hunian-gallery/reorder
//   DELETE /hunian-gallery/:imageId
// Upload reuses the M12 engine: POST /files with purpose `hunian_gallery`
// (JPEG/PNG/WebP, max 3 MB - backend validates MIME + magic bytes), then the
// returned fileId is attached to a PUBLIC catalog item (catalogSlug/
// publicGroupKey). Gallery images NEVER attach to exact rooms; this page never
// requests or renders roomId, room_code, exact room numbers, storage_path,
// tenant/resident/occupancy PII, payment/bank data, or Smart Lock data.
// publicVisible defaults to false backend-side: new photos start as Draft.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@granada-kost/api-client";
import { toast } from "sonner";
import { Images, Loader2, ShieldCheck, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/state";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { GalleryDropzone } from "@/components/gallery/GalleryDropzone";
import { GalleryEditDialog } from "@/components/gallery/GalleryEditDialog";
import { GalleryImageCard } from "@/components/gallery/GalleryImageCard";
import { useFileUpload } from "@/hooks/useFileUpload";
import {
  HUNIAN_GALLERY_MAX_IMAGES,
  sortGalleryImages,
  useHunianCatalogOptions,
  useHunianGallery,
  type HunianGalleryCategory,
  type HunianGalleryGender,
  type HunianGalleryImage,
} from "@/hooks/useHunianGallery";
import {
  useAttachHunianGalleryImage,
  useDeleteHunianGalleryImage,
  useReorderHunianGallery,
  useSetHunianGalleryCover,
  useUpdateHunianGalleryImage,
} from "@/hooks/useHunianGalleryMutations";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";
import { formatFileSize, validateFileForPurpose } from "@/lib/file-utils";

export const Route = createFileRoute("/hunian-gallery")({ component: HunianGalleryPage });

const SAFETY_NOTICE =
  "Foto yang dipublikasikan akan terlihat oleh calon penghuni. Pastikan foto tidak menampilkan data pribadi, dokumen, nomor kamar spesifik, atau informasi internal.";

const UPLOAD_REMINDERS = [
  "Jangan upload foto yang menampilkan dokumen atau kartu identitas.",
  "Jangan tampilkan nomor kamar spesifik yang terlihat di pintu/plat.",
  "Jangan tampilkan penghuni atau tamu tanpa persetujuan.",
  "Jangan tampilkan dokumen bank, pembayaran, atau dokumen internal.",
  "Jangan tampilkan layar perangkat Smart Lock atau layar admin.",
] as const;

type QueueStatus = "queued" | "uploading" | "attaching" | "error";

type QueueItem = {
  key: string;
  file: File;
  previewUrl: string;
  altText: string;
  caption: string;
  status: QueueStatus;
  errorMessage: string | null;
};

let queueSeq = 0;

function HunianGalleryPage() {
  const { hasPermission } = useAuth();
  // UX-only gate; the backend enforces room.manage + property scope and
  // returns 403 for property_owner mutations.
  const canManage = hasPermission("room.manage");
  const { currentPropertyId } = useProperty();

  const [category, setCategory] = useState<"all" | HunianGalleryCategory>("all");
  const [gender, setGender] = useState<"all" | HunianGalleryGender>("all");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<HunianGalleryImage | null>(null);
  const [editImage, setEditImage] = useState<HunianGalleryImage | null>(null);

  const optionsQuery = useHunianCatalogOptions();

  const filteredOptions = useMemo(() => {
    const all = optionsQuery.data ?? [];
    return all.filter(
      (o) =>
        (category === "all" || o.category === category) &&
        (gender === "all" || o.gender === gender),
    );
  }, [optionsQuery.data, category, gender]);

  const selected = useMemo(
    () => (optionsQuery.data ?? []).find((o) => o.slug === selectedSlug) ?? null,
    [optionsQuery.data, selectedSlug],
  );

  const galleryQuery = useHunianGallery({ catalogSlug: selected?.slug });
  const images = useMemo(() => sortGalleryImages(galleryQuery.data ?? []), [galleryQuery.data]);
  const publishedCount = images.filter((i) => i.publicVisible).length;

  const isForbidden =
    ApiError.isApiError(galleryQuery.error) && galleryQuery.error.status === 403;

  // Upload queue --------------------------------------------------------------
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  // Revoke leftover local preview object URLs on unmount.
  useEffect(
    () => () => {
      for (const item of queueRef.current) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  // Changing the target catalog item clears the pending queue (previews are
  // per-hunian; altText defaults come from the selected title).
  useEffect(() => {
    setQueue((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, [selectedSlug]);

  const remainingSlots = Math.max(0, HUNIAN_GALLERY_MAX_IMAGES - images.length - queue.length);
  const maxReached = images.length + queue.length >= HUNIAN_GALLERY_MAX_IMAGES;

  const upload = useFileUpload();
  const attachMut = useAttachHunianGalleryImage();
  const updateMut = useUpdateHunianGalleryImage();
  const coverMut = useSetHunianGalleryCover();
  const reorderMut = useReorderHunianGallery();
  const deleteMut = useDeleteHunianGalleryImage();

  const busy =
    isProcessing ||
    attachMut.isPending ||
    updateMut.isPending ||
    coverMut.isPending ||
    reorderMut.isPending ||
    deleteMut.isPending;

  const addFiles = (files: File[]) => {
    if (!selected || !canManage || isProcessing) return;
    const additions: QueueItem[] = [];
    let slots = HUNIAN_GALLERY_MAX_IMAGES - images.length - queue.length;
    for (const file of files) {
      if (slots <= 0) {
        toast.error("Maksimal 10 foto per hunian tercapai.");
        break;
      }
      const validation = validateFileForPurpose(file, "hunian_gallery");
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.message}`);
        continue;
      }
      additions.push({
        key: `q-${Date.now()}-${queueSeq++}`,
        file,
        previewUrl: URL.createObjectURL(file),
        altText: selected.title,
        caption: "",
        status: "queued",
        errorMessage: null,
      });
      slots -= 1;
    }
    if (additions.length > 0) setQueue((prev) => [...prev, ...additions]);
  };

  const removeQueueItem = (key: string) => {
    setQueue((prev) => {
      const target = prev.find((q) => q.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((q) => q.key !== key);
    });
  };

  const updateQueueItem = (key: string, patch: Partial<Pick<QueueItem, "altText" | "caption">>) => {
    setQueue((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  // Sequential upload -> attach per queued item. Errors keep the item in the
  // queue with a retry-able error state; error details are toasted by the
  // upload/attach hooks with safe copy only.
  const uploadAll = async () => {
    if (!selected || !currentPropertyId || !canManage || isProcessing) return;
    setIsProcessing(true);
    const target = selected;
    const items = queueRef.current.filter((i) => i.status === "queued" || i.status === "error");
    let okCount = 0;
    for (const item of items) {
      const setItem = (patch: Partial<QueueItem>) =>
        setQueue((prev) => prev.map((q) => (q.key === item.key ? { ...q, ...patch } : q)));
      try {
        setItem({ status: "uploading", errorMessage: null });
        const current = queueRef.current.find((q) => q.key === item.key) ?? item;
        const uploaded = await upload.uploadAsync({
          file: item.file,
          propertyId: currentPropertyId,
          filePurpose: "hunian_gallery",
          // Only JPEG is compressed client-side. PNG/WebP are uploaded as-is:
          // the canvas compressor re-encodes to JPEG, which would no longer
          // match the original filename/extension for backend content checks.
          compress: item.file.type === "image/jpeg",
        });
        setItem({ status: "attaching" });
        await attachMut.mutateAsync({
          catalogSlug: target.slug,
          publicGroupKey: target.publicGroupKey,
          category: target.category,
          gender: target.gender,
          buildingCode: target.buildingCode ?? undefined,
          floorCode:
            target.floorCode === "A" || target.floorCode === "B" ? target.floorCode : undefined,
          fileId: uploaded.id,
          altText: current.altText.trim() || target.title,
          caption: current.caption.trim() === "" ? undefined : current.caption.trim(),
        });
        okCount += 1;
        URL.revokeObjectURL(item.previewUrl);
        setQueue((prev) => prev.filter((q) => q.key !== item.key));
      } catch {
        // Error details already toasted by the mutation hooks (safe copy).
        setItem({ status: "error", errorMessage: "Upload atau penyimpanan gagal. Coba lagi." });
      }
    }
    if (okCount > 0) {
      toast.success(`${okCount} foto ditambahkan ke galeri sebagai Draft.`);
    }
    setIsProcessing(false);
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const next = [...images];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    reorderMut.mutate({
      catalogSlug: selected.slug,
      items: next.map((img, i) => ({ id: img.id, sortOrder: i })),
    });
  };

  const hasUploadable = queue.some((i) => i.status === "queued" || i.status === "error");

  return (
    <AppShell
      title="Galeri Hunian"
      subtitle="Kelola foto galeri untuk katalog publik /kamar. Foto hanya tampil ke publik setelah dipublikasikan."
    >
      <Alert className="mb-4">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Perhatian privasi &amp; keamanan foto</AlertTitle>
        <AlertDescription>
          <p>{SAFETY_NOTICE}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">
            {UPLOAD_REMINDERS.map((reminder) => (
              <li key={reminder}>{reminder}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      {!canManage ? (
        <Alert className="mb-4">
          <AlertTitle>Mode lihat saja</AlertTitle>
          <AlertDescription>
            Anda tidak memiliki izin mengelola galeri. Anda tetap dapat melihat foto galeri sesuai
            properti Anda.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="mb-6">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold">Pilih Hunian</p>
            <p className="text-xs text-muted-foreground">
              Galeri melekat pada item katalog hunian/unit/grup publik - bukan nomor kamar
              tertentu.
            </p>
          </div>
          {optionsQuery.error ? (
            <ErrorState
              error={optionsQuery.error}
              onRetry={() => optionsQuery.refetch()}
              title="Daftar hunian belum dapat dimuat."
            />
          ) : optionsQuery.isLoading ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-10 w-full sm:w-44" />
              <Skeleton className="h-10 w-full sm:w-40" />
              <Skeleton className="h-10 w-full flex-1" />
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as "all" | HunianGalleryCategory)}
                disabled={isProcessing}
              >
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  <SelectItem value="rukost">Rumah Kost</SelectItem>
                  <SelectItem value="apartkost">Apart Kost</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={gender}
                onValueChange={(v) => setGender(v as "all" | HunianGalleryGender)}
                disabled={isProcessing}
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Gender</SelectItem>
                  <SelectItem value="male">Putra</SelectItem>
                  <SelectItem value="female">Putri</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={selectedSlug === "" ? undefined : selectedSlug}
                onValueChange={setSelectedSlug}
                disabled={isProcessing}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pilih hunian..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredOptions.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Tidak ada hunian untuk filter ini
                    </SelectItem>
                  ) : (
                    filteredOptions.map((option) => (
                      <SelectItem key={option.slug} value={option.slug}>
                        {option.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {selected ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{selected.title}</p>
                <Badge variant="secondary">{selected.categoryLabel}</Badge>
                <Badge variant="secondary">{selected.genderLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.availabilityCount} kamar tersedia (agregat) · Grup publik:{" "}
                {selected.publicGroupKey}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {images.length}/{HUNIAN_GALLERY_MAX_IMAGES} foto · {publishedCount} dipublikasikan
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!selected ? (
        <EmptyState
          icon={<Images className="h-5 w-5" />}
          title="Pilih hunian terlebih dahulu"
          description="Pilih item katalog hunian di atas untuk melihat dan mengelola foto galerinya."
        />
      ) : (
        <div className="space-y-6">
          {canManage ? (
            <GalleryDropzone
              disabled={isProcessing || maxReached}
              disabledReason={
                maxReached
                  ? "Maksimal 10 foto per hunian tercapai. Hapus foto lama untuk menambah yang baru."
                  : isProcessing
                    ? "Sedang memproses upload..."
                    : undefined
              }
              remainingSlots={remainingSlots}
              onFilesSelected={addFiles}
            />
          ) : null}

          {queue.length > 0 ? (
            <div className="space-y-3">
              {queue.map((item) => (
                <Card key={item.key}>
                  <CardContent className="flex flex-col gap-3 p-3 sm:flex-row">
                    <img
                      src={item.previewUrl}
                      alt={`Preview ${item.file.name}`}
                      className="h-24 w-full rounded-lg object-cover sm:w-36"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(item.file.size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === "uploading" || item.status === "attaching" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {item.status === "uploading" ? "Mengupload..." : "Menyimpan..."}
                            </span>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Hapus ${item.file.name} dari antrean`}
                            disabled={isProcessing}
                            onClick={() => removeQueueItem(item.key)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`alt-${item.key}`} className="text-xs">
                            Teks alternatif
                          </Label>
                          <Input
                            id={`alt-${item.key}`}
                            value={item.altText}
                            maxLength={180}
                            disabled={isProcessing}
                            onChange={(e) => updateQueueItem(item.key, { altText: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`caption-${item.key}`} className="text-xs">
                            Caption (opsional)
                          </Label>
                          <Input
                            id={`caption-${item.key}`}
                            value={item.caption}
                            maxLength={240}
                            disabled={isProcessing}
                            onChange={(e) => updateQueueItem(item.key, { caption: e.target.value })}
                          />
                        </div>
                      </div>
                      {item.errorMessage ? (
                        <p className="text-xs text-destructive">{item.errorMessage}</p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Foto tersimpan sebagai Draft dan belum tampil ke publik sampai dipublikasikan.
              </p>
              <Button onClick={() => void uploadAll()} disabled={isProcessing || !hasUploadable}>
                {isProcessing ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
                  </span>
                ) : (
                  `Upload ${queue.length} Foto`
                )}
              </Button>
            </div>
          ) : null}

          {isForbidden ? (
            <ForbiddenState
              title="Tidak berwenang"
              description="Anda tidak memiliki izin mengelola galeri."
            />
          ) : galleryQuery.error ? (
            <ErrorState
              error={galleryQuery.error}
              onRetry={() => galleryQuery.refetch()}
              title="Galeri hunian belum dapat dimuat."
            />
          ) : galleryQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-video w-full rounded-xl" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : images.length === 0 ? (
            <EmptyState
              icon={<Images className="h-5 w-5" />}
              title="Belum ada foto untuk hunian ini"
              description={
                canManage
                  ? "Tarik atau pilih foto di area upload untuk mulai mengisi galeri."
                  : "Foto akan tampil di sini setelah admin menambahkannya."
              }
            />
          ) : (
            <div className="space-y-3">
              {publishedCount === 0 ? (
                <Alert>
                  <AlertTitle>Belum ada foto berstatus Publik</AlertTitle>
                  <AlertDescription>
                    Galeri publik /kamar masih menampilkan placeholder sampai minimal satu foto
                    dipublikasikan.
                  </AlertDescription>
                </Alert>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Cover tampil sebagai foto utama di katalog publik. Jika belum ada cover, foto
                Publik pertama sesuai urutan yang dipakai.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {images.map((image, index) => (
                  <GalleryImageCard
                    key={image.id}
                    image={image}
                    position={index + 1}
                    total={images.length}
                    canManage={canManage}
                    busy={busy}
                    onSetCover={() => coverMut.mutate({ imageId: image.id })}
                    onTogglePublish={(next) =>
                      updateMut.mutate({ imageId: image.id, publicVisible: next })
                    }
                    onMoveUp={() => moveImage(index, -1)}
                    onMoveDown={() => moveImage(index, 1)}
                    onEdit={() => setEditImage(image)}
                    onDelete={() => setPendingDelete(image)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Hapus foto dari galeri?"
        description={
          pendingDelete
            ? `"${pendingDelete.altText}" akan dihapus dari galeri dan tidak lagi tampil di katalog publik.`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        pending={deleteMut.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteMut.mutateAsync({ imageId: pendingDelete.id });
            setPendingDelete(null);
          } catch {
            // Already toasted by the mutation hook.
          }
        }}
      />

      <GalleryEditDialog
        image={editImage}
        pending={updateMut.isPending}
        onOpenChange={(o) => {
          if (!o) setEditImage(null);
        }}
        onSave={async (values) => {
          if (!editImage) return;
          try {
            await updateMut.mutateAsync({
              imageId: editImage.id,
              altText: values.altText,
              caption: values.caption,
            });
            setEditImage(null);
          } catch {
            // Already toasted by the mutation hook.
          }
        }}
      />
    </AppShell>
  );
}
