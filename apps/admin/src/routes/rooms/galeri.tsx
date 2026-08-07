import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArrowDown, ArrowUp, ImageOff, Pencil, RotateCcw, Star } from "lucide-react";
import { GalleryDropzone } from "@/components/gallery/GalleryDropzone";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createPublicGalleryDerivative,
  useFileDelete,
  useFilePreview,
  useFileUpload,
} from "@/hooks/useFileUpload";
import {
  useCategoryContent,
  useContentPublicationMutation,
  useM4KostTypes,
} from "@/hooks/useAdminUxMaster";
import {
  adminUxMasterApi,
  type CategoryContentWorkspace,
  type GalleryImage,
  type GalleryImageUpdateInput,
  type KostType,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";

type GallerySearch = {
  target: "rumah-kost" | "apart-kost";
};

type UploadState = {
  name: string;
  file: File;
  state: "processing" | "attached" | "failed";
};

export const Route = createFileRoute("/rooms/galeri")({
  validateSearch: (raw: Record<string, unknown>): GallerySearch => ({
    target: raw.target === "apart-kost" ? "apart-kost" : "rumah-kost",
  }),
  component: GaleriRoute,
});

const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function GaleriRoute() {
  const { hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const canManage = hasPermission("room.manage");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const typesQuery = useM4KostTypes({ status: "active", limit: 100 });
  const types = typesQuery.data?.items ?? [];
  const selectedType = types.find(
    (type) => type.category === (search.target === "apart-kost" ? "apartkost" : "rukost"),
  );
  const workspaceQuery = useCategoryContent(selectedType?.id);
  const upload = useFileUpload({ silent: true });
  const fileDelete = useFileDelete({ silent: true });
  const [editing, setEditing] = useState<CategoryContentWorkspace["gallery"][number] | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const scopeRef = useRef({ propertyId: currentPropertyId, kostTypeId: selectedType?.id });
  scopeRef.current = { propertyId: currentPropertyId, kostTypeId: selectedType?.id };

  useEffect(() => setUploads([]), [currentPropertyId, selectedType?.id]);

  const attach = useContentPublicationMutation<
    GalleryImage,
    {
      kostTypeId: string;
      sourceFileId: string;
      publicDerivativeFileId: string;
      altText: string;
    }
  >("category-content", "Foto galeri ditambahkan ke draft", (propertyId, values, key) =>
    adminUxMasterApi.gallery.create(
      {
        propertyId,
        targetType: "kost_type",
        kostTypeId: values.kostTypeId,
        sourceFileId: values.sourceFileId,
        publicDerivativeFileId: values.publicDerivativeFileId,
        altText: values.altText,
      },
      key,
    ),
  );
  const update = useContentPublicationMutation<
    GalleryImage,
    { id: string; kostTypeId: string; input: GalleryImageUpdateInput }
  >("category-content", "Teks foto diperbarui", (propertyId, values, key) =>
    adminUxMasterApi.gallery.update(propertyId, values.kostTypeId, values.id, values.input, key),
  );
  const cover = useContentPublicationMutation<GalleryImage, { id: string; kostTypeId: string }>(
    "category-content",
    "Cover draft diperbarui",
    (propertyId, values, key) =>
      adminUxMasterApi.gallery.setCover(propertyId, values.kostTypeId, values.id, key),
  );
  const archive = useContentPublicationMutation<
    { id: string; archived: true },
    { id: string; kostTypeId: string }
  >("category-content", "Foto diarsipkan dari draft", (propertyId, values, key) =>
    adminUxMasterApi.gallery.remove(propertyId, values.id, key),
  );
  const reorder = useContentPublicationMutation<
    GalleryImage[],
    { kostTypeId: string; items: { id: string; sortOrder: number }[] }
  >("category-content", "Urutan galeri disimpan", (propertyId, values, key) =>
    adminUxMasterApi.gallery.reorder(
      propertyId,
      { targetType: "kost_type", kostTypeId: values.kostTypeId },
      values.items,
      key,
    ),
  );
  const publish = useContentPublicationMutation<
    CategoryContentWorkspace,
    { kostTypeId: string; effectiveDate: string }
  >("category-content", "Galeri dijadwalkan untuk publikasi", (propertyId, values, key) =>
    adminUxMasterApi.categoryContent.publish(
      propertyId,
      values.kostTypeId,
      "gallery",
      values.effectiveDate,
      key,
    ),
  );
  const restore = useContentPublicationMutation<
    CategoryContentWorkspace,
    { kostTypeId: string; versionId: string }
  >("category-content", "Versi galeri dipulihkan sebagai draft", (propertyId, values, key) =>
    adminUxMasterApi.categoryContent.restore(propertyId, values.kostTypeId, values.versionId, key),
  );
  const unpublish = useContentPublicationMutation<CategoryContentWorkspace, { kostTypeId: string }>(
    "category-content",
    "Publikasi galeri dinonaktifkan",
    (propertyId, values, key) =>
      adminUxMasterApi.categoryContent.unpublish(propertyId, values.kostTypeId, "gallery", key),
  );

  if (typesQuery.isLoading || workspaceQuery.isLoading) {
    return (
      <AppShell title="Galeri Kategori" subtitle="Draft dan publikasi foto hunian">
        <LoadingState label="Memuat galeri kategori..." />
      </AppShell>
    );
  }
  if (typesQuery.error || workspaceQuery.error) {
    return (
      <AppShell title="Galeri Kategori" subtitle="Draft dan publikasi foto hunian">
        <ErrorState
          error={typesQuery.error ?? workspaceQuery.error}
          title="Gagal memuat galeri kategori"
          onRetry={() => {
            void typesQuery.refetch();
            void workspaceQuery.refetch();
          }}
        />
      </AppShell>
    );
  }
  if (!selectedType || types.length !== 2) {
    return (
      <AppShell title="Galeri Kategori" subtitle="Draft dan publikasi foto hunian">
        <EmptyState
          title="Authority kategori perlu direkonsiliasi"
          description="Galeri hanya tersedia untuk tepat satu Rumah Kost dan satu Apart Kost."
        />
      </AppShell>
    );
  }

  const images = (workspaceQuery.data?.gallery ?? []).filter(
    (image) => image.contentState === "draft",
  );
  const versions = workspaceQuery.data?.publication.gallery ?? [];
  const busy =
    upload.isUploading ||
    attach.isPending ||
    update.isPending ||
    cover.isPending ||
    archive.isPending ||
    reorder.isPending ||
    publish.isPending ||
    restore.isPending ||
    unpublish.isPending;

  const uploadFiles = async (files: File[]) => {
    if (!currentPropertyId) return;
    const accepted = files.slice(0, Math.max(0, 10 - images.length));
    const scope = { propertyId: currentPropertyId, kostTypeId: selectedType.id };
    const scopeIsCurrent = () =>
      scopeRef.current.propertyId === scope.propertyId &&
      scopeRef.current.kostTypeId === scope.kostTypeId;
    setUploads(accepted.map((file) => ({ name: file.name, file, state: "processing" })));
    for (let index = 0; index < accepted.length; index += 1) {
      const file = accepted[index];
      const uploadedIds: string[] = [];
      let attachStarted = false;
      try {
        const derivative = await createPublicGalleryDerivative(file);
        if (!scopeIsCurrent()) throw new Error("PROPERTY_SCOPE_CHANGED");
        const source = await upload.uploadAsync({
          file,
          propertyId: scope.propertyId,
          filePurpose: "hunian_gallery",
          compress: false,
        });
        uploadedIds.push(source.id);
        if (!scopeIsCurrent()) throw new Error("PROPERTY_SCOPE_CHANGED");
        const publicFile = await upload.uploadAsync({
          file: derivative,
          propertyId: scope.propertyId,
          filePurpose: "hunian_gallery",
          compress: false,
        });
        uploadedIds.push(publicFile.id);
        if (!scopeIsCurrent()) throw new Error("PROPERTY_SCOPE_CHANGED");
        attachStarted = true;
        await attach.mutateAsync({
          kostTypeId: scope.kostTypeId,
          sourceFileId: source.id,
          publicDerivativeFileId: publicFile.id,
          altText: `Foto ${selectedType.name}`,
        });
        if (!scopeIsCurrent()) return;
        setUploads((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, state: "attached" } : item,
          ),
        );
      } catch {
        if (!attachStarted) {
          await Promise.allSettled(uploadedIds.map((id) => fileDelete.mutateAsync(id)));
        }
        if (!scopeIsCurrent()) return;
        setUploads((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, state: "failed" } : item,
          ),
        );
      }
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= images.length) return;
    const next = [...images];
    [next[index], next[destination]] = [next[destination], next[index]];
    void reorder.mutateAsync({
      kostTypeId: selectedType.id,
      items: next.map((image, sortOrder) => ({ id: image.id, sortOrder })),
    });
  };

  return (
    <AppShell
      title="Galeri Kategori"
      subtitle="Sumber asli disimpan privat; publik hanya menerima derivative aman dari versi published."
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kategori galeri">
          <Button
            role="tab"
            aria-selected={search.target === "rumah-kost"}
            variant={search.target === "rumah-kost" ? "default" : "outline"}
            className="min-h-11"
            onClick={() => void navigate({ search: { target: "rumah-kost" } })}
          >
            Rumah Kost
          </Button>
          <Button
            role="tab"
            aria-selected={search.target === "apart-kost"}
            variant={search.target === "apart-kost" ? "default" : "outline"}
            className="min-h-11"
            onClick={() => void navigate({ search: { target: "apart-kost" } })}
          >
            Apart Kost
          </Button>
        </div>

        {canManage ? (
          <GalleryDropzone
            disabled={busy || images.length >= 10}
            disabledReason={images.length >= 10 ? "Maksimal 10 foto per kategori." : undefined}
            remainingSlots={Math.max(0, 10 - images.length)}
            onFilesSelected={(files) => void uploadFiles(files)}
          />
        ) : null}

        {uploads.length ? (
          <Card role="status" aria-live="polite">
            <CardContent className="space-y-2 p-4">
              {uploads.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.name}</span>
                  <Badge variant="outline">
                    {item.state === "processing"
                      ? "Memproses"
                      : item.state === "attached"
                        ? "Siap di draft"
                        : "Gagal — coba lagi"}
                  </Badge>
                  {item.state === "failed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void uploadFiles([item.file])}
                    >
                      Coba lagi
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Draft {workspaceQuery.data?.category.label}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Arsip tidak menghapus histori published.
              </p>
            </div>
            <Badge variant="outline">
              {versions.find((version) => version.publicationStatus === "published")
                ? `Published v${versions.find((version) => version.publicationStatus === "published")?.version}`
                : "Belum published"}
            </Badge>
          </CardHeader>
          <CardContent>
            {images.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {images.map((image, index) => (
                  <GalleryCard
                    key={image.id}
                    image={image}
                    index={index}
                    total={images.length}
                    disabled={!canManage || busy}
                    onEdit={() => setEditing(image)}
                    onCover={() =>
                      void cover.mutateAsync({ id: image.id, kostTypeId: selectedType.id })
                    }
                    onMove={(direction) => move(index, direction)}
                    onArchive={() => {
                      if (!window.confirm("Arsipkan foto ini dari draft galeri?")) return;
                      void archive.mutateAsync({ id: image.id, kostTypeId: selectedType.id });
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ImageOff className="h-5 w-5" />}
                title="Belum ada foto draft"
                description="Unggah foto kategori; area bersama bukan taxonomy publik pada workflow ini."
              />
            )}
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardContent className="flex flex-wrap items-end justify-end gap-3 p-4">
              <HeroUiDatePicker
                id="gallery-effective-date"
                className="min-w-48"
                label="Tanggal efektif publikasi"
                value={effectiveDate}
                onChange={(value) => setEffectiveDate(value ?? "")}
              />
              <Button
                className="min-h-11"
                disabled={
                  busy ||
                  !effectiveDate ||
                  !images.length ||
                  images.filter((image) => image.isCover).length !== 1
                }
                onClick={() => {
                  if (!window.confirm("Publikasikan snapshot galeri pada tanggal efektif ini?")) {
                    return;
                  }
                  void publish.mutateAsync({
                    kostTypeId: selectedType.id,
                    effectiveDate,
                  });
                }}
              >
                Publikasikan galeri
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  busy || !versions.some((version) => version.publicationStatus === "published")
                }
                onClick={() => {
                  if (!window.confirm("Hentikan seluruh publikasi galeri kategori ini?")) return;
                  void unpublish.mutateAsync({ kostTypeId: selectedType.id });
                }}
              >
                Unpublish galeri
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Riwayat publikasi galeri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.length ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="text-sm">
                    Versi {version.version} · efektif {version.effectiveDate}
                  </span>
                  <Badge variant="outline">
                    {version.publicationStatus === "published" ? "Published" : "Archived"}
                  </Badge>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={!canManage || busy}
                    onClick={() => {
                      if (!window.confirm("Pulihkan versi ini sebagai draft baru?")) return;
                      void restore.mutateAsync({
                        kostTypeId: selectedType.id,
                        versionId: version.id,
                      });
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Pulihkan sebagai draft
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada versi published.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <GalleryEditor
        image={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          if (!editing) return;
          await update.mutateAsync({ id: editing.id, kostTypeId: selectedType.id, input });
          setEditing(null);
        }}
      />
    </AppShell>
  );
}

function GalleryCard({
  image,
  index,
  total,
  disabled,
  onEdit,
  onCover,
  onMove,
  onArchive,
}: {
  image: CategoryContentWorkspace["gallery"][number];
  index: number;
  total: number;
  disabled: boolean;
  onEdit: () => void;
  onCover: () => void;
  onMove: (direction: -1 | 1) => void;
  onArchive: () => void;
}) {
  const preview = useFilePreview(image.publicDerivativeFileId);
  useEffect(
    () => () => {
      if (preview.data) URL.revokeObjectURL(preview.data);
    },
    [preview.data],
  );
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-video bg-muted">
        {preview.isLoading ? (
          <div className="h-full animate-pulse bg-muted" />
        ) : preview.data ? (
          <img src={preview.data} alt={image.altText} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-7 w-7" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-2">
          {image.isCover ? (
            <Badge>
              <Star className="mr-1 h-3 w-3" /> Cover
            </Badge>
          ) : null}
          <Badge variant="outline">Draft</Badge>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="break-words font-medium">{image.altText}</p>
          <p className="break-words text-sm text-muted-foreground">
            {image.caption || "Tanpa caption"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={disabled || index === 0}
            aria-label="Naikkan foto"
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={disabled || index === total - 1}
            aria-label="Turunkan foto"
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={disabled || image.isCover}
            aria-label="Jadikan cover"
            onClick={onCover}
          >
            <Star className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={disabled}
            aria-label="Edit teks foto"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11"
            disabled={disabled}
            aria-label="Arsipkan foto"
            onClick={onArchive}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GalleryEditor({
  image,
  pending,
  onClose,
  onSave,
}: {
  image: CategoryContentWorkspace["gallery"][number] | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: GalleryImageUpdateInput) => Promise<void>;
}) {
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  useEffect(() => {
    setAltText(image?.altText ?? "");
    setCaption(image?.caption ?? "");
  }, [image]);
  return (
    <Dialog open={Boolean(image)} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit teks publik foto</DialogTitle>
          <DialogDescription>
            Jangan masukkan nomor kamar, identitas penghuni, atau data pribadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="gallery-alt">Teks alternatif</Label>
            <Input
              id="gallery-alt"
              className="min-h-11"
              value={altText}
              maxLength={180}
              onChange={(event) => setAltText(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gallery-caption">Caption</Label>
            <Textarea
              id="gallery-caption"
              value={caption}
              maxLength={240}
              onChange={(event) => setCaption(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={pending} onClick={onClose}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            disabled={pending || !altText.trim()}
            onClick={() =>
              void onSave({ altText: altText.trim(), caption: caption.trim() || null })
            }
          >
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
