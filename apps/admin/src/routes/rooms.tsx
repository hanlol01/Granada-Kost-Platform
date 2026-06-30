import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { rooms as initial, type Room, type RoomStatus } from "@/lib/mock-data";
import { formatIDR } from "@/lib/format";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, BedDouble } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rooms")({ component: RoomsPage });

function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  const filtered = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (filter === "all" || r.status === filter) &&
          (q === "" || r.number.includes(q) || r.type.toLowerCase().includes(q.toLowerCase())),
      ),
    [rooms, q, filter],
  );

  const onSave = (data: Room) => {
    if (editing) {
      setRooms((p) => p.map((r) => (r.id === editing.id ? data : r)));
      toast.success("Kamar diperbarui");
    } else {
      setRooms((p) => [...p, { ...data, id: `r${Date.now()}` }]);
      toast.success("Kamar ditambahkan");
    }
    setOpen(false);
    setEditing(null);
  };

  const onDelete = (id: string) => {
    setRooms((p) => p.filter((r) => r.id !== id));
    toast.success("Kamar dihapus");
  };

  return (
    <AppShell
      title="Manajemen Kamar"
      subtitle={`${rooms.length} kamar terdaftar`}
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Tambah Kamar
        </Button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor atau tipe kamar..."
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="occupied">Terisi</SelectItem>
            <SelectItem value="vacant">Kosong</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BedDouble className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="mt-3 font-medium">Tidak ada kamar ditemukan</p>
            <p className="text-sm text-muted-foreground">Coba ubah pencarian atau filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-all hover:-translate-y-0.5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Kamar</p>
                    <p className="text-2xl font-bold tracking-tight">{r.number}</p>
                    <p className="text-sm text-muted-foreground">{r.type}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-lg font-semibold text-primary">
                  {formatIDR(r.price)}
                  <span className="text-xs text-muted-foreground font-normal">/bulan</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-3 mb-4 min-h-[2rem]">
                  {r.facilities.slice(0, 4).map((f) => (
                    <span
                      key={f}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                  {r.facilities.length > 4 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      +{r.facilities.length - 4}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoomDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        room={editing}
        onSave={onSave}
      />
    </AppShell>
  );
}

function RoomDialog({
  open,
  onOpenChange,
  room,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: Room | null;
  onSave: (r: Room) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room ? "Edit Kamar" : "Tambah Kamar Baru"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onSave({
              id: room?.id ?? "",
              number: f.get("number") as string,
              type: f.get("type") as string,
              price: Number(f.get("price")),
              status: f.get("status") as RoomStatus,
              facilities: (f.get("facilities") as string)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="number">Nomor</Label>
              <Input id="number" name="number" defaultValue={room?.number} required />
            </div>
            <div>
              <Label htmlFor="type">Tipe</Label>
              <Input id="type" name="type" defaultValue={room?.type ?? "Standard"} required />
            </div>
          </div>
          <div>
            <Label htmlFor="price">Harga / bulan</Label>
            <Input
              id="price"
              name="price"
              type="number"
              defaultValue={room?.price ?? 800000}
              required
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={room?.status ?? "vacant"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacant">Kosong</SelectItem>
                <SelectItem value="occupied">Terisi</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="facilities">Fasilitas (pisah dengan koma)</Label>
            <Input
              id="facilities"
              name="facilities"
              defaultValue={room?.facilities.join(", ") ?? "Kasur, Lemari"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit">Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
