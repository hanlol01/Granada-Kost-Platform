import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { complaints as seed, type Complaint, type ComplaintStatus } from "@/lib/mock-data";
import { formatDate } from "@/lib/format";
import {
  Search,
  MessageSquareWarning,
  Clock,
  CheckCircle2,
  Loader2,
  Upload,
  UserCog,
  Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/complaints")({ component: ComplaintsPage });

type ComplaintTab = "all" | ComplaintStatus;

const statusMeta: Record<ComplaintStatus, { label: string; cls: string; icon: LucideIcon }> = {
  waiting: {
    label: "Menunggu",
    cls: "bg-warning/20 text-warning-foreground border-warning/30",
    icon: Clock,
  },
  processing: {
    label: "Diproses",
    cls: "bg-primary-soft text-primary border-primary/20",
    icon: Loader2,
  },
  done: {
    label: "Selesai",
    cls: "bg-success/15 text-success border-success/30",
    icon: CheckCircle2,
  },
};

function isComplaintTab(value: string): value is ComplaintTab {
  return value === "all" || value === "waiting" || value === "processing" || value === "done";
}

const prioMeta = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/20 text-warning-foreground",
  high: "bg-destructive/15 text-destructive",
} as const;

function ComplaintsPage() {
  const [items, setItems] = useState<Complaint[]>(seed);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | ComplaintStatus>("all");
  const [selected, setSelected] = useState<Complaint | null>(null);

  const filtered = useMemo(
    () =>
      items.filter((c) => {
        if (tab !== "all" && c.status !== tab) return false;
        if (
          q &&
          !`${c.tenantName} ${c.roomNumber} ${c.category} ${c.description}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [items, q, tab],
  );

  const stats = {
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
    processing: items.filter((i) => i.status === "processing").length,
    avg: "1.4 hari",
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.category, (map.get(i.category) || 0) + 1));
    return Array.from(map, ([category, count]) => ({ category, count }));
  }, [items]);

  const updateStatus = (id: string, status: ComplaintStatus) => {
    setItems((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status,
              timeline: [
                ...c.timeline,
                {
                  time: new Date().toLocaleString("id-ID"),
                  label: `Status diubah ke ${statusMeta[status].label}`,
                },
              ],
            }
          : c,
      ),
    );
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    toast.success(`Status komplain diperbarui: ${statusMeta[status].label}`);
  };

  return (
    <AppShell title="Komplain Penghuni" subtitle="Kelola tiket keluhan & maintenance">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            l: "Total Bulan Ini",
            v: stats.total,
            c: "bg-primary-soft text-primary",
            i: MessageSquareWarning,
          },
          { l: "Selesai", v: stats.done, c: "bg-success/15 text-success", i: CheckCircle2 },
          {
            l: "Diproses",
            v: stats.processing,
            c: "bg-warning/20 text-warning-foreground",
            i: Loader2,
          },
          { l: "Rata-rata Penyelesaian", v: stats.avg, c: "bg-chart-4/15 text-chart-4", i: Clock },
        ].map((s) => (
          <Card key={s.l} className="hover:shadow-md transition-all">
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Komplain per Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-base">Daftar Tiket</CardTitle>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari komplain..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(isComplaintTab(v) ? v : "all")}
            className="mb-4"
          >
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="waiting">Menunggu</TabsTrigger>
              <TabsTrigger value="processing">Diproses</TabsTrigger>
              <TabsTrigger value="done">Selesai</TabsTrigger>
            </TabsList>
          </Tabs>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Belum ada komplain</p>
              <p className="text-sm text-muted-foreground">
                Tiket akan tampil di sini saat penghuni mengajukan.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((c) => {
                const Icon = statusMeta[c.status].icon;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="text-left rounded-xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">
                            #{c.id.toUpperCase()} · {c.category}
                          </p>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${prioMeta[c.priority]}`}
                          >
                            {c.priority}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {c.description}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 gap-1 ${statusMeta[c.status].cls}`}
                      >
                        <Icon className="h-3 w-3" /> {statusMeta[c.status].label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                      <span>
                        {c.tenantName} · Kamar {c.roomNumber}
                      </span>
                      <span>{formatDate(c.date)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Tiket #{selected.id.toUpperCase()}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${prioMeta[selected.priority]}`}
                  >
                    {selected.priority}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <img
                  src={selected.photo}
                  alt="kerusakan"
                  className="w-full h-56 object-cover rounded-lg border border-border"
                />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Penghuni</p>
                    <p className="font-medium">{selected.tenantName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Kamar</p>
                    <p className="font-medium">{selected.roomNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Kategori</p>
                    <p className="font-medium">{selected.category}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tanggal</p>
                    <p className="font-medium">{formatDate(selected.date)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Teknisi</p>
                    <p className="font-medium flex items-center gap-1.5">
                      <UserCog className="h-3.5 w-3.5" />
                      {selected.technician || "Belum ditugaskan"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Deskripsi</p>
                  <p className="text-sm">{selected.description}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Timeline Progress</p>
                  <ol className="relative border-l border-border ml-2 space-y-3">
                    {selected.timeline.map((t, i) => (
                      <li key={i} className="ml-4">
                        <span className="absolute -left-1.5 h-3 w-3 rounded-full bg-primary" />
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.time}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                  <Select
                    value={selected.status}
                    onValueChange={(v) => updateStatus(selected.id, v as ComplaintStatus)}
                  >
                    <SelectTrigger className="sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="waiting">Menunggu</SelectItem>
                      <SelectItem value="processing">Diproses</SelectItem>
                      <SelectItem value="done">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => toast.success("Foto berhasil diupload (dummy)")}
                  >
                    <Upload className="h-4 w-4 mr-1" /> Upload Foto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast.success("Teknisi ditugaskan (dummy)")}
                  >
                    <UserCog className="h-4 w-4 mr-1" /> Assign Teknisi
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
