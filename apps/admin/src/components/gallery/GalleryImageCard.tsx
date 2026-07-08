// Managed gallery image card (M19C): authorized blob preview + manage actions.
// `fileId` is used only for the authorized preview fetch (GET /files/:fileId/
// content) and is never rendered as text. No storage_path, roomId, room_code,
// exact room numbers, or PII exist on this contract or in this UI.

import { ArrowDown, ArrowUp, ImageOff, Pencil, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFilePreview } from "@/hooks/useFileUpload";
import type { HunianGalleryImage } from "@/hooks/useHunianGallery";
import { cn } from "@/lib/utils";

type Props = {
  image: HunianGalleryImage;
  /** 1-based display position within the sorted gallery. */
  position: number;
  total: number;
  canManage: boolean;
  busy?: boolean;
  onSetCover: () => void;
  onTogglePublish: (next: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function GalleryImageCard({
  image,
  position,
  total,
  canManage,
  busy = false,
  onSetCover,
  onTogglePublish,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: Props) {
  // The preview object URL lifetime is managed by the TanStack Query cache
  // (staleTime/gcTime in useFilePreview); it is intentionally not revoked per
  // card so cached entries remain usable across re-renders on this page.
  const preview = useFilePreview(image.fileId);

  return (
    <Card className={cn("overflow-hidden", !image.publicVisible && "opacity-90")}>
      <div className="relative aspect-video bg-muted">
        {preview.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : preview.data ? (
          <img
            src={preview.data}
            alt={image.altText}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-muted-foreground"
            aria-label="Preview foto tidak tersedia"
          >
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {image.isCover ? (
            <Badge className="bg-primary text-primary-foreground">
              <Star className="mr-1 h-3 w-3" /> Cover
            </Badge>
          ) : null}
          {image.publicVisible ? (
            <Badge variant="secondary" className="bg-success/15 text-success">
              Publik
            </Badge>
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )}
        </div>
        <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium">
          #{position} / {total}
        </span>
      </div>
      <CardContent className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={image.altText}>
            {image.altText}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {image.caption ?? "Tanpa caption"}
          </p>
        </div>
        {canManage ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <label
                className="flex items-center gap-2 text-xs font-medium"
                htmlFor={`gallery-publish-${image.id}`}
              >
                <Switch
                  id={`gallery-publish-${image.id}`}
                  checked={image.publicVisible}
                  disabled={busy}
                  onCheckedChange={onTogglePublish}
                  aria-label={
                    image.publicVisible ? "Sembunyikan foto dari publik" : "Publikasikan foto"
                  }
                />
                {image.publicVisible ? "Dipublikasikan" : "Disembunyikan"}
              </label>
              <Button
                size="sm"
                variant={image.isCover ? "secondary" : "outline"}
                disabled={busy || image.isCover}
                onClick={onSetCover}
              >
                <Star className="mr-1 h-3.5 w-3.5" />
                {image.isCover ? "Cover" : "Jadikan Cover"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || position <= 1}
                  onClick={onMoveUp}
                  aria-label="Pindahkan foto ke atas"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || position >= total}
                  onClick={onMoveDown}
                  aria-label="Pindahkan foto ke bawah"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy}
                  onClick={onEdit}
                  aria-label="Edit teks alternatif dan caption"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={onDelete}
                  aria-label="Hapus foto dari galeri"
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
