import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useComplaints,
  useComplaintCategories,
  type ComplaintPriority,
  type ComplaintRecord,
  type StoredComplaintStatus,
} from "@/hooks/useComplaints";
import { formatDate } from "@/lib/format";
import {
  Search,
  MessageSquareWarning,
  Clock,
  CheckCircle2,
  Loader2,
  Inbox,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/complaints")({ component: ComplaintsPage });

type ComplaintTab = "all" | "open" | "in_progress" | "resolved" | "closed";

function isComplaintTab(value: string): value is ComplaintTab {
  return ["all", "open", "in_progress", "resolved", "closed"].includes(value);
}

// Map UI tab -> backend status. The backend has 9 stored statuses; we group
// them visually into the 4 buckets the Lovable design exposes.
function tabToStatusFilter(tab: ComplaintTab): StoredComplaintStatus | undefined {
  switch (tab) {
    case "open":
      return "submitted";
    case "in_progress":
      return "in_progress";
    case "resolved":
      return "resolved";
    case "closed":
      return "closed";
    default:
      return undefined;
  }
}

const STATUS_META: Record<StoredComplaintStatus, { label: string; cls: string; icon: LucideIcon }> =
  {
    submitted: {
      label: "Menunggu",
      cls: "bg-warning/20 text-warning-foreground border-warning/30",
      icon: Clock,
    },
    acknowledged: {
      label: "Dilihat",
      cls: "bg-primary-soft text-primary border-primary/20",
      icon: Clock,
    },
    in_progress: {
      label: "Diproses",
      cls: "bg-primary-soft text-primary border-primary/20",
      icon: Loader2,
    },
    on_hold: {
      label: "Ditahan",
      cls: "bg-muted text-muted-foreground border-border",
      icon: Clock,
    },
    escalated: {
      label: "Eskalasi",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      icon: MessageSquareWarning,
    },
    resolved: {
      label: "Selesai",
      cls: "bg-success/15 text-success border-success/30",
      icon: CheckCircle2,
    },
    reopened: {
      label: "Dibuka Ulang",
      cls: "bg-warning/20 text-warning-foreground border-warning/30",
      icon: MessageSquareWarning,
    },
    closed: {
      label: "Ditutup",
      cls: "bg-muted text-muted-foreground border-border",
      icon: CheckCircle2,
    },
    cancelled: {
      label: "Dibatalkan",
      cls: "bg-muted text-muted-foreground border-border line-through",
      icon: MessageSquareWarning,
    },
  };

const PRIO_META: Record<ComplaintPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/20 text-warning-foreground",
  high: "bg-destructive/15 text-destructive",
  urgent: "bg-destructive/25 text-destructive",
};

function ComplaintsPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ComplaintTab>("all");
  const [selected, setSelected] = useState<ComplaintRecord | null>(null);

  const status = tabToStatusFilter(tab);
  const { data, isLoading, error, refetch, isFetching } = useComplaints({
    status,
    limit: 100,
  });
  const categoriesQuery = useComplaintCategories();

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    (categoriesQuery.data ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categoriesQuery.data]);

  const items = data ?? [];

  const filtered = useMemo(() => {
    if (!q) return items;
    const needle = q.toLowerCase();
    return items.filter(
      (c) =>
        c.snapshotResidentName.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        c.description.toLowerCase().includes(needle) ||
        (c.snapshotRoomNumber?.toLowerCase().includes(needle) ?? false) ||
        (categoryById.get(c.categoryId)?.toLowerCase().includes(needle) ?? false),
    );
  }, [items, q, categoryById]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => ["resolved", "closed"].includes(i.complaintStatus)).length;
    const inProgress = items.filter((i) =>
      ["submitted", "acknowledged", "in_progress", "reopened"].includes(i.complaintStatus),
    ).length;
    return { total, done, inProgress };
  }, [items]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      const name = categoryById.get(i.categoryId) ?? "Lainnya";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map, ([category, count]) => ({ category, count }));
  }, [items, categoryById]);

  return (
    <AppShell title="Komplain Penghuni" subtitle="Kelola tiket keluhan & maintenance">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          [
            {
              l: "Total Bulan Ini",
              v: stats.total,
              c: "bg-primary-soft text-primary",
              i: MessageSquareWarning,
            },
            { l: "Selesai", v: stats.done, c: "bg-success/15 text-success", i: CheckCircle2 },
            {
              l: "Diproses",
              v: stats.inProgress,
              c: "bg-warning/20 text-warning-foreground",
              i: Loader2,
            },
            {
              l: "Kategori",
              v: categoriesQuery.data?.length ?? 0,
              c: "bg-chart-4/15 text-chart-4",
              i: Clock,
            },
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
          ))
        )}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Komplain per Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            {byCategory.length === 0 ? (
              <EmptyState
                title="Belum ada data"
                description="Distribusi muncul setelah tiket komplain pertama dibuat."
              />
            ) : (
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
                  <RTooltip
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
            )}
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
              <TabsTrigger value="open">Menunggu</TabsTrigger>
              <TabsTrigger value="in_progress">Diproses</TabsTrigger>
              <TabsTrigger value="resolved">Selesai</TabsTrigger>
              <TabsTrigger value="closed">Ditutup</TabsTrigger>
            </TabsList>
          </Tabs>

          {error ? (
            <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat komplain" />
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={q ? "Tidak ada tiket cocok" : "Belum ada komplain"}
              description={
                q
                  ? "Coba ubah kata kunci pencarian atau pindah tab."
                  : "Tiket akan tampil saat penghuni mengajukan komplain."
              }
            />
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 md:grid-cols-2 gap-3",
                isFetching && "opacity-90 transition-opacity",
              )}
            >
              {filtered.map((c) => {
                const meta = STATUS_META[c.complaintStatus];
                const Icon = meta.icon;
                const categoryName = categoryById.get(c.categoryId) ?? "–";
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
                            {c.complaintCode} · {categoryName}
                          </p>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${PRIO_META[c.priority]}`}
                          >
                            {c.priority}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-1 truncate">{c.title}</p>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {c.description}
                        </p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 gap-1 ${meta.cls}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                      <span>
                        {c.snapshotResidentName}
                        {c.snapshotRoomNumber ? ` · Kamar ${c.snapshotRoomNumber}` : ""}
                      </span>
                      <span>{formatDate(c.submittedAt.slice(0, 10))}</span>
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
                  Tiket {selected.complaintCode}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${PRIO_META[selected.priority]}`}
                  >
                    {selected.priority}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Penghuni" value={selected.snapshotResidentName} />
                  <Info label="Kamar" value={selected.snapshotRoomNumber ?? "–"} />
                  <Info label="Kategori" value={categoryById.get(selected.categoryId) ?? "–"} />
                  <Info label="Tanggal" value={formatDate(selected.submittedAt.slice(0, 10))} />
                  <Info label="Status" value={STATUS_META[selected.complaintStatus].label} />
                  <Info
                    label="SLA"
                    value={selected.resolutionSlaBreached ? "Terlampaui" : "Aman"}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Judul</p>
                  <p className="text-sm font-medium">{selected.title}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Deskripsi</p>
                  <p className="text-sm whitespace-pre-wrap">{selected.description}</p>
                </div>
                {selected.locationNote ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Catatan Lokasi</p>
                    <p className="text-sm">{selected.locationNote}</p>
                  </div>
                ) : null}
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="sm:flex-1">
                          <Button variant="outline" className="w-full" disabled>
                            <UserCog className="h-4 w-4 mr-1" /> Assign Teknisi
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Assign teknisi tersedia di M11E.</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="sm:flex-1">
                          <Button className="w-full" disabled>
                            Ubah Status
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Transisi status komplain tersedia di M11E.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  );
}
