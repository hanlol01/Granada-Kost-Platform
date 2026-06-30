import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cameras, type Camera } from "@/lib/mock-data";
import {
  Search,
  Camera as CameraIcon,
  Wifi,
  WifiOff,
  Maximize2,
  RefreshCw,
  Aperture,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cctv")({ component: CctvPage });

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function CameraTile({
  cam,
  onOpen,
  onSnapshot,
  loading,
}: {
  cam: Camera;
  onOpen: () => void;
  onSnapshot: () => void;
  loading: boolean;
}) {
  const now = useNow();
  return (
    <div className="group relative rounded-xl overflow-hidden border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="relative aspect-video bg-black">
        {loading ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : (
          <>
            <img
              src={cam.thumbnail}
              alt={cam.name}
              className={`h-full w-full object-cover ${!cam.online ? "grayscale opacity-50" : ""}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
            {cam.online ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-destructive/90 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-md">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-white/80">
                  <WifiOff className="h-8 w-8 mx-auto mb-1" />
                  <p className="text-xs font-medium">Offline</p>
                </div>
              </div>
            )}
            <div className="absolute top-2 right-2 bg-black/50 backdrop-blur text-white text-[10px] font-mono px-2 py-1 rounded-md">
              {now.toLocaleTimeString("id-ID")}
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
              <div className="text-white">
                <p className="text-sm font-semibold drop-shadow">{cam.name}</p>
                <p className="text-[11px] text-white/80">{cam.location}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={onSnapshot}>
                  <Aperture className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={onOpen}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CctvPage() {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Camera | null>(null);
  const now = useNow();

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const areas = useMemo(() => Array.from(new Set(cameras.map((c) => c.location))), []);
  const filtered = cameras.filter(
    (c) =>
      (area === "all" || c.location === area) &&
      (q === "" || `${c.name} ${c.location}`.toLowerCase().includes(q.toLowerCase())),
  );

  const online = cameras.filter((c) => c.online).length;
  const offline = cameras.length - online;

  const refresh = () => {
    setLoading(true);
    toast.success("Stream di-refresh");
    setTimeout(() => setLoading(false), 700);
  };

  return (
    <AppShell
      title="Monitoring CCTV"
      subtitle="Pantau seluruh area rumah kos secara real-time"
      actions={
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: "Kamera Aktif", v: online, c: "bg-success/15 text-success", i: Wifi },
          { l: "Kamera Offline", v: offline, c: "bg-destructive/15 text-destructive", i: WifiOff },
          {
            l: "Area Terpantau",
            v: areas.length,
            c: "bg-primary-soft text-primary",
            i: CameraIcon,
          },
          { l: "Sistem", v: "Online", c: "bg-chart-4/15 text-chart-4", i: Radio },
        ].map((s) => (
          <Card key={s.l}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.l}</p>
                <p className="text-2xl font-semibold mt-1.5">{s.v}</p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${s.c}`}>
                <s.i className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {offline > 0 && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 backdrop-blur p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">
              Peringatan: {offline} kamera offline
            </p>
            <p className="text-xs text-muted-foreground">Periksa koneksi atau hubungi teknisi.</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground hidden sm:block">
            {now.toLocaleTimeString("id-ID")}
          </span>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-base">Live View</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari kamera..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <CameraIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Tidak ada kamera ditemukan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((cam) => (
                <CameraTile
                  key={cam.id}
                  cam={cam}
                  loading={loading}
                  onOpen={() => setOpen(cam)}
                  onSnapshot={() => toast.success(`Snapshot ${cam.name} disimpan`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-border">
          {open && (
            <div className="relative aspect-video bg-black">
              <img
                src={open.thumbnail}
                alt={open.name}
                className={`h-full w-full object-cover ${!open.online && "grayscale"}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
              {open.online && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-destructive/90 text-white text-xs font-bold px-2.5 py-1 rounded-md">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> LIVE
                </div>
              )}
              <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-mono px-2.5 py-1 rounded-md">
                {now.toLocaleString("id-ID")}
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                <div className="text-white">
                  <p className="font-semibold">{open.name}</p>
                  <p className="text-sm text-white/80">{open.location}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toast.success(`Snapshot ${open.name} disimpan`)}
                  >
                    <Aperture className="h-4 w-4 mr-1" /> Snapshot
                  </Button>
                  <Button size="sm" variant="secondary" onClick={refresh}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
