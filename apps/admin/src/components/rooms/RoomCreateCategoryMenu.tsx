import { Link } from "@tanstack/react-router";
import { Building2, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Props = {
  className?: string;
  variant?: "default" | "outline";
};

const CREATE_SEARCH = { q: "", offset: 0, limit: 20, create: true } as const;

export function RoomCreateCategoryMenu({ className, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={cn("min-h-11", className)}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" /> Tambah Kamar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pilih kategori kamar</DialogTitle>
            <DialogDescription>
              Editor akan memakai tipe kost dan referensi bangunan dari properti aktif.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              asChild
              variant="outline"
              className={cn("h-auto min-h-24 justify-start whitespace-normal p-4 text-left")}
            >
              <Link to="/rooms/rumah-kost" search={CREATE_SEARCH} onClick={() => setOpen(false)}>
                <Building2 className="mr-3 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">Rumah Kost</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Tambah inventori pada bangunan Rumah Kost.
                  </span>
                </span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto min-h-24 justify-start whitespace-normal p-4 text-left"
            >
              <Link to="/rooms/apart-kost" search={CREATE_SEARCH} onClick={() => setOpen(false)}>
                <Layers className="mr-3 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">Apart Kost</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Tambah inventori pada bangunan Apart Kost.
                  </span>
                </span>
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
