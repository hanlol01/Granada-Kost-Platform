import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ImageOff, Images, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { GalleryDropzone } from "@/components/gallery/GalleryDropzone";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFilePreview, useFileUpload } from "@/hooks/useFileUpload";
import { useM4Gallery, useM4KostTypes, useM4Mutation } from "@/hooks/useAdminUxMaster";
import {
  adminUxMasterApi,
  type CommonAreaKey,
  type GalleryImage,
  type GalleryTarget,
  type KostType,
} from "@/lib/admin-ux-master-api";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";

const COMMON_AREAS: Record<CommonAreaKey, string> = {
  lobby: "Lobby",
  dapur: "Dapur",
  rooftop: "Rooftop",
  koridor: "Koridor",
  parkir: "Parkir",
};

type GallerySearch = {
  target: "rumah-kost" | "apart-kost" | "common-area";
  offset: number;
  limit: number;
};

function normalizedPositive(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

export const Route = createFileRoute("/rooms/galeri")({
  validateSearch: (raw: Record<string, unknown>): GallerySearch => ({
    target: raw.target === "apart-kost" || raw.target === "common-area" ? raw.target : "rumah-kost",
    offset: normalizedPositive(raw.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: normalizedPositive(raw.limit, 100, 1, 100),
  }),
  component: GaleriRoute,
});

function GaleriRoute() {
  const { hasPermission } = useAuth();
  const { currentPropertyId } = useProperty();
  const canManage = hasPermission("room.manage");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const typesQuery = useM4KostTypes({ status: "active", limit: 100 });
  const [commonAreaKey, setCommonAreaKey] = useState<CommonAreaKey>("lobby");
  const [editing, setEditing] = useState<GalleryImage | null>(null);
  const types = typesQuery.data?.items ?? [];
  const target = resolveTarget(search.target, types, commonAreaKey);
  const galleryQuery = useM4Gallery(target, { limit: search.limit, offset: search.offset });
  const upload = useFileUpload();
  const attach = useM4Mutation<
    GalleryImage,
    { target: GalleryTarget; fileId: string; altText: string }
  >("gallery", "Foto galeri ditambahkan", (propertyId, { target, ...values }, key) =>
    adminUxMasterApi.gallery.create({ ...values, ...target, propertyId }, key),
  );
  const update = useM4Mutation<
    GalleryImage,
    { id: string; input: { altText?: string; caption?: string | null; publicVisible?: boolean } }
  >("gallery", "Foto galeri diperbarui", (_propertyId, values, key) =>
    adminUxMasterApi.gallery.update(values.id, values.input, key),
  );
  const cover = useM4Mutation<GalleryImage, { id: string }>(
    "gallery",
    "Cover galeri diperbarui",
    (_propertyId, values, key) => adminUxMasterApi.gallery.setCover(values.id, key),
  );
  const remove = useM4Mutation<unknown, { id: string }>(
    "gallery",
    "Foto galeri dihapus",
    (_propertyId, values, key) => adminUxMasterApi.gallery.remove(values.id, key),
  );
  const reorder = useM4Mutation<
    GalleryImage[],
    { target: GalleryTarget; items: { id: string; sortOrder: number }[] }
  >("gallery", "Urutan galeri disimpan", (propertyId, values, key) =>
    adminUxMasterApi.gallery.reorder(propertyId, values.target, values.items, key),
  );

  const images = galleryQuery.data?.items ?? [];
  const resolvedTargetLabel = targetLabel(search.target, types, commonAreaKey);
  const canReorder = Boolean(
    target && galleryQuery.data && galleryQuery.data.total === images.length,
  );
  const busy =
    upload.isUploading ||
    attach.isPending ||
    update.isPending ||
    cover.isPending ||
    remove.isPending ||
    reorder.isPending;

  const uploadFiles = async (files: File[]) => {
    if (!currentPropertyId || !target) return;
    for (const file of files) {
      const saved = await upload.uploadAsync({
        file,
        propertyId: currentPropertyId,
        filePurpose: "hunian_gallery",
      });
      await attach.mutateAsync({
        target,
        fileId: saved.id,
        altText: `Foto ${resolvedTargetLabel}`,
      });
    }
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!target) return;
    const destination = index + direction;
    if (destination < 0 || destination >= images.length) return;
    const next = [...images];
    [next[index], next[destination]] = [next[destination], next[index]];
    void reorder.mutateAsync({
      target,
      items: next.map((item, sortOrder) => ({ id: item.id, sortOrder })),
    });
  };

  if (typesQuery.isLoading || galleryQuery.isLoading) {
    return (
      <AppShell title="Galeri" subtitle="Galeri per tipe kost dan area bersama">
        <LoadingState label="Memuat galeri..." />
      </AppShell>
    );
  }
  if (typesQuery.error || galleryQuery.error) {
    return (
      <AppShell title="Galeri" subtitle="Galeri per tipe kost dan area bersama">
        <ErrorState
          error={typesQuery.error ?? galleryQuery.error}
          title="Gagal memuat galeri"
          onRetry={() => {
            void typesQuery.refetch();
            void galleryQuery.refetch();
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Galeri"
      subtitle="Pilih target eksplisit: tipe kost atau area bersama yang diizinkan."
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <Card className="border-slate-800 bg-slate-900/85">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            <Select
              value={search.target}
              onValueChange={(target) =>
                navigate({
                  search: {
                    target: target as GallerySearch["target"],
                    offset: 0,
                    limit: search.limit,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rumah-kost">Rumah Kost</SelectItem>
                <SelectItem value="apart-kost">Apart Kost</SelectItem>
                <SelectItem value="common-area">Area Bersama</SelectItem>
              </SelectContent>
            </Select>
            {search.target === "common-area" ? (
              <Select
                value={commonAreaKey}
                onValueChange={(value) => setCommonAreaKey(value as CommonAreaKey)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMON_AREAS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300">
                {resolvedTargetLabel}
              </div>
            )}
          </CardContent>
        </Card>
        {target ? (
          <>
            {canManage ? (
              <GalleryDropzone
                disabled={busy}
                disabledReason={busy ? "Upload atau perubahan sedang diproses" : undefined}
                remainingSlots={Math.max(0, 100 - images.length)}
                onFilesSelected={(files) => void uploadFiles(files)}
              />
            ) : null}
            {!canReorder && images.length > 1 ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                Urutan hanya dapat diubah setelah seluruh foto target dimuat dalam satu halaman.
              </p>
            ) : null}
            {images.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {images.map((image, index) => (
                  <M4GalleryCard
                    key={image.id}
                    image={image}
                    index={index}
                    total={images.length}
                    canManage={canManage}
                    busy={busy}
                    canReorder={canReorder}
                    onEdit={() => setEditing(image)}
                    onCover={() => void cover.mutateAsync({ id: image.id })}
                    onPublish={(publicVisible) =>
                      void update.mutateAsync({ id: image.id, input: { publicVisible } })
                    }
                    onMoveUp={() => move(index, -1)}
                    onMoveDown={() => move(index, 1)}
                    onDelete={() => {
                      if (window.confirm("Hapus foto dari galeri?"))
                        void remove.mutateAsync({ id: image.id });
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Images className="h-5 w-5" />}
                title="Belum ada foto"
                description={
                  canManage
                    ? "Upload foto untuk target yang dipilih."
                    : "Tidak ada foto pada target ini."
                }
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={<Images className="h-5 w-5" />}
            title="Tipe kost belum tersedia"
            description="Buat tipe kost aktif sebelum menambah galeri kategori."
          />
        )}
      </div>
      <GalleryEditor
        image={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(input) =>
          editing ? update.mutateAsync({ id: editing.id, input }) : Promise.resolve(undefined)
        }
        pending={update.isPending}
      />
    </AppShell>
  );
}

function resolveTarget(
  target: GallerySearch["target"],
  types: KostType[],
  commonAreaKey: CommonAreaKey,
): GalleryTarget | null {
  if (target === "common-area") return { targetType: "common_area", commonAreaKey };
  const category = target === "rumah-kost" ? "rukost" : "apartkost";
  const kostType = types.find((item) => item.category === category);
  return kostType ? { targetType: "kost_type", kostTypeId: kostType.id } : null;
}

function targetLabel(
  target: GallerySearch["target"],
  types: KostType[],
  commonAreaKey: CommonAreaKey,
): string {
  if (target === "common-area") return `Area Bersama · ${COMMON_AREAS[commonAreaKey]}`;
  const category = target === "rumah-kost" ? "rukost" : "apartkost";
  return types.find((item) => item.category === category)?.name ?? "Tipe kost belum tersedia";
}

function M4GalleryCard({
  image,
  index,
  total,
  canManage,
  busy,
  canReorder,
  onEdit,
  onCover,
  onPublish,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  image: GalleryImage;
  index: number;
  total: number;
  canManage: boolean;
  busy: boolean;
  canReorder: boolean;
  onEdit: () => void;
  onCover: () => void;
  onPublish: (publicVisible: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const preview = useFilePreview(image.fileId);
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/85">
      <div className="relative aspect-video bg-slate-950">
        {preview.isLoading ? (
          <div className="h-full animate-pulse bg-slate-800" />
        ) : preview.data ? (
          <img
            src={preview.data}
            alt={image.altText}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            <ImageOff className="h-7 w-7" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-2">
          {image.isCover ? (
            <Badge className="bg-blue-600 text-white">
              <Star className="mr-1 h-3 w-3" /> Cover
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className={
              image.publicVisible
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900/80 text-slate-300"
            }
          >
            {image.publicVisible ? "Publik" : "Draft"}
          </Badge>
        </div>
        <span className="absolute right-2 top-2 rounded-full bg-slate-950/80 px-2 py-0.5 text-xs text-slate-200">
          {index + 1}/{total}
        </span>
      </div>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="truncate font-medium text-slate-100">{image.altText}</p>
          <p className="truncate text-xs text-slate-500">{image.caption || "Tanpa caption"}</p>
        </div>
        {canManage ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <Switch checked={image.publicVisible} disabled={busy} onCheckedChange={onPublish} />{" "}
                {image.publicVisible ? "Dipublikasikan" : "Disembunyikan"}
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || image.isCover}
                onClick={onCover}
              >
                <Star className="mr-1 h-3.5 w-3.5" /> Cover
              </Button>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={busy || !canReorder || index === 0}
                  onClick={onMoveUp}
                  aria-label="Pindahkan foto ke atas"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={busy || !canReorder || index === total - 1}
                  onClick={onMoveDown}
                  aria-label="Pindahkan foto ke bawah"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={busy}
                  onClick={onEdit}
                  aria-label="Edit foto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="text-rose-300 hover:text-rose-200"
                  disabled={busy}
                  onClick={onDelete}
                  aria-label="Hapus foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GalleryEditor({
  image,
  open,
  onOpenChange,
  onSave,
  pending,
}: {
  image: GalleryImage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { altText: string; caption: string | null }) => Promise<unknown>;
  pending: boolean;
}) {
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  useEffect(() => {
    if (open) {
      setAltText(image?.altText ?? "");
      setCaption(image?.caption ?? "");
    }
  }, [image, open]);
  const submit = async () => {
    if (!altText.trim()) return;
    try {
      await onSave({ altText: altText.trim(), caption: caption.trim() || null });
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Edit teks foto</DialogTitle>
          <DialogDescription>
            Jangan menuliskan nomor kamar spesifik atau data pribadi pada teks publik.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Teks alternatif</Label>
            <Input
              value={altText}
              maxLength={180}
              onChange={(event) => setAltText(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Caption</Label>
            <Textarea
              value={caption}
              maxLength={240}
              rows={3}
              onChange={(event) => setCaption(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!altText.trim() || pending} onClick={() => void submit()}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
