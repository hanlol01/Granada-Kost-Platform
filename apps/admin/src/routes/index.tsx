import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { rooms, tenants, payments, monthlyIncome, recentActivity } from "@/lib/mock-data";
import { formatIDR } from "@/lib/format";
import { BedDouble, Users, DollarSign, AlertCircle, Plus, ArrowUpRight, TrendingUp, CreditCard, BellRing } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/")({ component: Dashboard });

function StatCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string; hint?: string; accent: string }) {
  return (
    <Card className="border-border/60 hover:shadow-md transition-all hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-semibold mt-2 tracking-tight">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const total = rooms.length;
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const vacant = rooms.filter((r) => r.status === "vacant").length;
  const occupancy = Math.round((occupied / total) * 100);
  const income = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const unpaid = payments.filter((p) => p.status !== "paid").length;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Ringkasan pengelolaan rumah kos Anda"
      actions={
        <Button asChild className="hidden sm:inline-flex">
          <Link to="/rooms"><Plus className="h-4 w-4 mr-1" /> Tambah Kamar</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BedDouble} label="Total Kamar" value={String(total)} hint={`${vacant} kosong tersedia`} accent="bg-primary-soft text-primary" />
        <StatCard icon={Users} label="Total Penghuni" value={String(tenants.length)} hint={`${occupied} kamar terisi`} accent="bg-success/15 text-success" />
        <StatCard icon={DollarSign} label="Pendapatan Bulan Ini" value={formatIDR(income)} hint="+8.2% dari bulan lalu" accent="bg-chart-4/15 text-chart-4" />
        <StatCard icon={AlertCircle} label="Tagihan Belum Dibayar" value={String(unpaid)} hint="Perlu tindak lanjut" accent="bg-destructive/15 text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Pemasukan Bulanan</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">7 bulan terakhir</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-success font-medium">
              <TrendingUp className="h-3.5 w-3.5" /> +24%
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyIncome}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000000}jt`} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatIDR(v)}
                  />
                  <Area type="monotone" dataKey="income" stroke="var(--color-primary)" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Okupansi Kamar</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Tingkat hunian saat ini</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="text-center py-4">
              <p className="text-5xl font-bold tracking-tight text-primary">{occupancy}%</p>
              <p className="text-xs text-muted-foreground mt-2">{occupied} dari {total} kamar terisi</p>
            </div>
            <Progress value={occupancy} className="h-2" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-primary-soft p-3">
                <p className="text-lg font-semibold text-primary">{occupied}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Terisi</p>
              </div>
              <div className="rounded-lg bg-success/15 p-3">
                <p className="text-lg font-semibold text-success">{vacant}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Kosong</p>
              </div>
              <div className="rounded-lg bg-warning/20 p-3">
                <p className="text-lg font-semibold">{rooms.filter(r => r.status === "maintenance").length}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Maint.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs">Lihat semua <ArrowUpRight className="h-3 w-3 ml-1" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((a) => {
              const iconMap = { payment: CreditCard, tenant: Users, room: BedDouble, alert: BellRing };
              const Icon = iconMap[a.type];
              const color = a.type === "alert" ? "bg-destructive/15 text-destructive" : a.type === "payment" ? "bg-success/15 text-success" : "bg-primary-soft text-primary";
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.text}</p>
                    <p className="text-xs text-muted-foreground">{a.time}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aksi Cepat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/rooms"><BedDouble className="h-4 w-4 mr-2" />Kelola Kamar</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/tenants"><Users className="h-4 w-4 mr-2" />Tambah Penghuni</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/payments"><CreditCard className="h-4 w-4 mr-2" />Catat Pembayaran</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/reports"><TrendingUp className="h-4 w-4 mr-2" />Lihat Laporan</Link></Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
