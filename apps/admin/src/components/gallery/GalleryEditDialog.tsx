// Edit altText/caption dialog for a gallery image (M19C). Mirrors the backend
// DTO limits (UpdateHunianGalleryImageDto): altText required <= 180 chars,
// caption optional <= 240 chars. Frontend limits are UX-only; the backend
// remains authoritative.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { HunianGalleryImage } from "@/hooks/useHunianGallery";

type Props = {
  image: HunianGalleryImage | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: { altText: string; caption: string | null }) => void;
};

export function GalleryEditDialog({ image, pending, onOpenChange, onSave }: Props) {
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (image) {
      setAltText(image.altText);
      setCaption(image.caption ?? "");
    }
  }, [image]);

  const altInvalid = altText.trim().length === 0 || altText.trim().length > 180;

  return (
    <Dialog open={Boolean(image)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Teks Foto</DialogTitle>
          <DialogDescription>
            Teks alternatif membantu aksesibilitas dan tampil jika gambar gagal dimuat. Jangan
            menuliskan nomor kamar spesifik atau data pribadi pada teks maupun caption.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gallery-alt-text">Teks alternatif (wajib)</Label>
            <Input
              id="gallery-alt-text"
              value={altText}
              maxLength={180}
              disabled={pending}
              onChange={(e) => setAltText(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {altText.trim().length}/180 karakter.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-caption">Caption (opsional)</Label>
            <Textarea
              id="gallery-caption"
              value={caption}
              maxLength={240}
              rows={3}
              disabled={pending}
              onChange={(e) => setCaption(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {caption.trim().length}/240 karakter.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={pending || altInvalid}
            onClick={() =>
              onSave({
                altText: altText.trim(),
                caption: caption.trim() === "" ? null : caption.trim(),
              })
            }
          >
            {pending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan...
              </span>
            ) : (
              "Simpan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
