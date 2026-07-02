import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import { bookingRooms as initialRooms, type BookingRoom, BOOKING_FEE } from "@/lib/mock-data";
import { formatIDR } from "@/lib/format";
import { isBookingEnabled } from "@/lib/features";
import { useMemo, useState } from "react";
import { Search, MapPin, Maximize2, Wallet, CheckCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/booking")({ component: BookingPage });

const statusMap = {
  vacant: { label: "Kosong", dot: "bg-success", ring: "ring-success/40 hover:ring-success" },
  occupied: { label: "Terisi", dot: "bg-destructive", ring: "ring-destructive/30" },
  reserved: { label: "Dibooking", dot: "bg-warning", ring: "ring-warning/30" },
  maintenance: {
    label: "Maintenance",
    dot: "bg-muted-foreground",
    ring: "ring-muted-foreground/30",
  },
} as const;

function BookingPage() {
  const [rooms, setRooms] = useState<BookingRoom[]>(initialRooms);
  const [q, setQ] = useState("");
  const [floor, setFloor] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [price, setPrice] = useState<string>("all");
  const [selected, setSelected] = useState<BookingRoom | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [lastBookingRoom, setLastBookingRoom] = useState<string>("");

  const filtered = useMemo(
    () =>
      rooms.filter((r) => {
        if (q && !r.number.includes(q)) return false;
        if (floor !== "all" && String(r.floor) !== floor) return false;
        if (type !== "all" && r.type !== type) return false;
        if (price === "low" && r.price >= 1000000) return false;
        if (price === "mid" && (r.price < 1000000 || r.price >= 1500000)) return false;
        if (price === "high" && r.price < 1500000) return false;
        return true;
      }),
    [rooms, q, floor, type, price],
  );

  const byFloor = (f: number) => filtered.filter((r) => r.floor === f);

  if (!isBookingEnabled()) {
    return (
      <AppShell title="Booking Kamar" subtitle="Fitur dinonaktifkan untuk release saat ini">
        <EmptyState
          title="Booking kamar belum tersedia"
          description="Menu Booking disembunyikan karena VITE_FEATURE_BOOKING_ENABLED=false. Fitur ini menunggu scope backend booking dan payment flow yang aman."
          icon={<Building2 className="h-5 w-5" />}
        />
      </AppShell>
    );
  }

  const submitBooking = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    setRooms((p) =>
      p.map((r) => (r.number === selected.number ? { ...r, status: "reserved" } : r)),
    );
    setLastBookingRoom(selected.number);
    setFormOpen(false);
    setSelected(null);
    toast.success("Booking berhasil dibuat", {
      description: "Silakan lanjutkan pembayaran booking fee",
    });
    setTimeout(() => setPayOpen(true), 300);
  };

  const payFee = () => {
    setPayOpen(false);
    toast.success("Pembayaran diterima", {
      description: `Booking kamar ${lastBookingRoom} menunggu verifikasi`,
    });
  };

  return (
    <AppShell
      title="Booking Kamar"
      subtitle="Pilih kamar yang tersedia dan lakukan pemesanan online"
    >
      <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <p className="font-semibold text-warning-foreground">Mode placeholder booking</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Alur ini belum terhubung ke backend booking atau payment gateway. Aktifkan hanya untuk
          preview internal, bukan operasi produksi.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {(Object.keys(statusMap) as Array<keyof typeof statusMap>).map((s) => (
          <div key={s} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
            <span className={cn("h-2 w-2 rounded-full", statusMap[s].dot)} />
            <span className="font-medium">{statusMap[s].label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor kamar..."
            className="pl-9"
          />
        </div>
        <Select value={floor} onValueChange={setFloor}>
          <SelectTrigger>
            <SelectValue placeholder="Lantai" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Lantai</SelectItem>
            <SelectItem value="1">Lantai 1</SelectItem>
            <SelectItem value="2">Lantai 2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="Standard">Standard</SelectItem>
            <SelectItem value="Deluxe">Deluxe</SelectItem>
            <SelectItem value="Premium">Premium</SelectItem>
          </SelectContent>
        </Select>
        <Select value={price} onValueChange={setPrice}>
          <SelectTrigger>
            <SelectValue placeholder="Harga" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Harga</SelectItem>
            <SelectItem value="low">&lt; 1 Juta</SelectItem>
            <SelectItem value="mid">1 - 1.5 Juta</SelectItem>
            <SelectItem value="high">&gt; 1.5 Juta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Floor map */}
      {[1, 2].map((f) => (
        <div key={f} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Lantai {f}</h2>
            <span className="text-xs text-muted-foreground">({byFloor(f).length} kamar)</span>
          </div>
          {byFloor(f).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada kamar sesuai filter
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {byFloor(f).map((r) => {
                const s = statusMap[r.status];
                const clickable = r.status === "vacant";
                return (
                  <button
                    key={r.number}
                    disabled={!clickable}
                    onClick={() => {
                      setSelected(r);
                    }}
                    className={cn(
                      "relative group text-left p-4 rounded-xl bg-card border ring-1 transition-all",
                      s.ring,
                      clickable
                        ? "hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
                        : "opacity-70 cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Kamar</p>
                        <p className="text-2xl font-bold tracking-tight">{r.number}</p>
                      </div>
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full mt-1",
                          s.dot,
                          clickable && "animate-pulse",
                        )}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{r.type}</p>
                    <p className="text-sm font-semibold text-primary mt-1">{formatIDR(r.price)}</p>
                    <span className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Detail modal */}
      <Dialog
        open={!!selected && !formOpen}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Kamar {selected.number} · {selected.type}
                </DialogTitle>
              </DialogHeader>
              <img
                src={selected.photo}
                alt={`Kamar ${selected.number}`}
                className="w-full h-48 object-cover rounded-lg"
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Harga / bulan</p>
                  <p className="font-semibold text-primary">{formatIDR(selected.price)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Deposit</p>
                  <p className="font-semibold">{formatIDR(selected.deposit)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{selected.size}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Lantai {selected.floor}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Fasilitas</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.facilities.map((f) => (
                    <span key={f} className="text-xs px-2 py-1 rounded-full bg-muted">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Tutup
                </Button>
                <Button onClick={() => setFormOpen(true)}>Booking Sekarang</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Form modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Form Booking · Kamar {selected?.number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitBooking} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">Nama lengkap</Label>
                <Input id="name" required />
              </div>
              <div>
                <Label htmlFor="phone">Nomor HP</Label>
                <Input id="phone" required />
              </div>
              <div className="col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="ktp">Nomor KTP</Label>
                <Input id="ktp" required />
              </div>
              <div>
                <Label htmlFor="gender">Jenis Kelamin</Label>
                <Select defaultValue="L">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="checkin">Tanggal Masuk</Label>
                <Input id="checkin" type="date" required />
              </div>
              <div>
                <Label htmlFor="duration">Durasi Sewa</Label>
                <Select defaultValue="6">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 bulan</SelectItem>
                    <SelectItem value="6">6 bulan</SelectItem>
                    <SelectItem value="12">12 bulan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="note">Catatan tambahan</Label>
              <Textarea id="note" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Booking</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment modal */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Pembayaran Booking Fee</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="h-16 w-16 rounded-full bg-primary-soft flex items-center justify-center">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Kamar {lastBookingRoom}</p>
            <p className="text-3xl font-bold text-primary">{formatIDR(BOOKING_FEE)}</p>
            <p className="text-xs text-muted-foreground">
              Wajib dibayar dalam 1x24 jam, jika tidak booking akan kadaluarsa.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Nanti Saja
            </Button>
            <Button onClick={payFee}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Bayar Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
