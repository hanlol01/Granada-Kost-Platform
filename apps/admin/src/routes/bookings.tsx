import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bookings as initial,
  monthlyBookings,
  bookingRooms,
  type Booking,
  type BookingStatus,
} from "@/lib/mock-data";
import { formatIDR, formatDate } from "@/lib/format";
import { isBookingEnabled } from "@/lib/features";
import { useMemo, useState } from "react";
import {
  Search,
  Check,
  X,
  Ban,
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/bookings")({ component: BookingsAdminPage });

const statusMeta: Record<BookingStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending_payment: {
    label: "Menunggu Pembayaran",
    cls: "bg-warning/20 text-warning-foreground",
    icon: Clock,
  },
  pending_verification: {
    label: "Menunggu Verifikasi",
    cls: "bg-primary-soft text-primary",
    icon: AlertCircle,
  },
  approved: { label: "Disetujui", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  rejected: { label: "Ditolak", cls: "bg-destructive/15 text-destructive", icon: XCircle },
  expired: { label: "Kadaluarsa", cls: "bg-muted text-muted-foreground", icon: Ban },
};

function BookingsAdminPage() {
  const [data, setData] = useState<Booking[]>(initial);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [filter, setFilter] = useState<string>("all");
  const [detail, setDetail] = useState<Booking | null>(null);

  const stats = useMemo(
    () => ({
      total: data.length,
      pending_payment: data.filter((b) => b.status === "pending_payment").length,
      pending_verification: data.filter((b) => b.status === "pending_verification").length,
      approved: data.filter((b) => b.status === "approved").length,
      rejected: data.filter((b) => b.status === "rejected").length,
    }),
    [data],
  );

  const filtered = useMemo(
    () =>
      data.filter((b) => {
        if (tab !== "all" && b.status !== tab) return false;
        if (filter !== "all" && b.status !== filter) return false;
        if (
          q &&
          !`${b.code} ${b.name} ${b.roomNumber} ${b.phone}`.toLowerCase().includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [data, tab, filter, q],
  );

  const occupancyData = useMemo(() => {
    const counts = { Kosong: 0, Terisi: 0, Dibooking: 0, Maintenance: 0 };
    bookingRooms.forEach((r) => {
      if (r.status === "vacant") counts.Kosong++;
      else if (r.status === "occupied") counts.Terisi++;
      else if (r.status === "reserved") counts.Dibooking++;
      else counts.Maintenance++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, []);

  const updateStatus = (id: string, status: BookingStatus, msg: string) => {
    setData((p) => p.map((b) => (b.id === id ? { ...b, status } : b)));
    toast.success(msg);
    setDetail(null);
  };

  const cards = [
    {
      label: "Total Booking",
      value: stats.total,
      icon: ClipboardList,
      color: "text-primary bg-primary-soft",
    },
    {
      label: "Menunggu Pembayaran",
      value: stats.pending_payment,
      icon: Clock,
      color: "text-warning-foreground bg-warning/20",
    },
    {
      label: "Menunggu Verifikasi",
      value: stats.pending_verification,
      icon: AlertCircle,
      color: "text-primary bg-primary-soft",
    },
    {
      label: "Disetujui",
      value: stats.approved,
      icon: CheckCircle2,
      color: "text-success bg-success/15",
    },
    {
      label: "Ditolak",
      value: stats.rejected,
      icon: XCircle,
      color: "text-destructive bg-destructive/15",
    },
  ];

  if (!isBookingEnabled()) {
    return (
      <AppShell title="Manajemen Booking" subtitle="Fitur dinonaktifkan untuk release saat ini">
        <EmptyState
          title="Manajemen booking belum tersedia"
          description="Menu Manajemen Booking disembunyikan karena VITE_FEATURE_BOOKING_ENABLED=false. Fitur ini menunggu backend booking, verifikasi fee, dan kebijakan operasional."
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Manajemen Booking"
      subtitle={`${stats.total} booking total — kelola permintaan booking online`}
    >
      <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <p className="font-semibold text-warning-foreground">Mode placeholder booking</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Data dan aksi approval di halaman ini masih preview internal. Belum ada kontrak backend
          booking/payment fee untuk dipakai sebagai alur produksi.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="p-4">
                <div
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center mb-2",
                    c.color,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Bulanan</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyBookings}>
                <defs>
                  <linearGradient id="bookFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="bookings"
                  stroke="hsl(var(--primary))"
                  fill="url(#bookFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Okupansi Kamar</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={occupancyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Semua</TabsTrigger>
          <TabsTrigger value="pending_payment">Menunggu Bayar</TabsTrigger>
          <TabsTrigger value="pending_verification">Verifikasi</TabsTrigger>
          <TabsTrigger value="approved">Disetujui</TabsTrigger>
          <TabsTrigger value="rejected">Ditolak</TabsTrigger>
          <TabsTrigger value="expired">Kadaluarsa</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kode, nama, atau kamar..."
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {(Object.keys(statusMeta) as BookingStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {statusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="mt-3 font-medium">Tidak ada booking ditemukan</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Kode</th>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">HP</th>
                  <th className="px-4 py-3 font-medium">Kamar</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Fee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const m = statusMeta[b.status];
                  return (
                    <tr
                      key={b.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{b.code}</td>
                      <td className="px-4 py-3 font-medium">{b.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.phone}</td>
                      <td className="px-4 py-3">{b.roomNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(b.bookingDate)}
                      </td>
                      <td className="px-4 py-3">{formatIDR(b.fee)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
                            m.cls,
                          )}
                        >
                          {m.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetail(b)}>
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((b) => {
              const m = statusMeta[b.status];
              return (
                <Card key={b.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono text-[10px] text-muted-foreground">{b.code}</p>
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.phone} · Kamar {b.roomNumber}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                          m.cls,
                        )}
                      >
                        {m.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground">{formatDate(b.bookingDate)}</p>
                      <Button variant="ghost" size="sm" onClick={() => setDetail(b)}>
                        Detail
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Booking</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <Row label="Kode" value={detail.code} />
                <Row label="Nama" value={detail.name} />
                <Row label="HP" value={detail.phone} />
                <Row label="Email" value={detail.email} />
                <Row label="KTP" value={detail.ktp} />
                <Row label="Kamar" value={detail.roomNumber} />
                <Row label="Check-in" value={formatDate(detail.checkInDate)} />
                <Row label="Durasi" value={`${detail.duration} bulan`} />
                <Row label="Booking Fee" value={formatIDR(detail.fee)} />
                <Row label="Tanggal Booking" value={formatDate(detail.bookingDate)} />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
                      statusMeta[detail.status].cls,
                    )}
                  >
                    {statusMeta[detail.status].label}
                  </span>
                </div>
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {detail.status !== "approved" && (
                  <Button
                    onClick={() =>
                      updateStatus(
                        detail.id,
                        "approved",
                        "Booking disetujui — kamar otomatis berstatus Dibooking",
                      )
                    }
                  >
                    <Check className="h-4 w-4 mr-1" /> Setujui
                  </Button>
                )}
                {detail.status !== "rejected" && (
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(detail.id, "rejected", "Booking ditolak")}
                  >
                    <X className="h-4 w-4 mr-1" /> Tolak
                  </Button>
                )}
                {detail.status !== "expired" && (
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(detail.id, "expired", "Booking dibatalkan")}
                  >
                    <Ban className="h-4 w-4 mr-1" /> Batalkan
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
