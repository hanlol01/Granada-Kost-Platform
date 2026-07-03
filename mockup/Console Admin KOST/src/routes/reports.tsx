import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { monthlyIncome, rooms } from "@/lib/mock-data";
import { formatIDR } from "@/lib/format";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

function ReportsPage() {
  const occData = [
    { name: "Terisi", value: rooms.filter(r => r.status === "occupied").length, color: "var(--color-primary)" },
    { name: "Kosong", value: rooms.filter(r => r.status === "vacant").length, color: "var(--color-success)" },
    { name: "Maintenance", value: rooms.filter(r => r.status === "maintenance").length, color: "var(--color-warning)" },
  ];
  const total = monthlyIncome.reduce((s, m) => s + m.income, 0);
  const avg = Math.round(total / monthlyIncome.length);

  return (
    <AppShell
      title="Laporan"
      subtitle="Analisis pendapatan dan okupansi"
      actions={
        <Button variant="outline" onClick={() => toast.success("Laporan diekspor (dummy)")}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select defaultValue="2026">
          <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="2026">2026</SelectItem><SelectItem value="2025">2025</SelectItem></SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Bulan</SelectItem>
            <SelectItem value="q1">Q1</SelectItem><SelectItem value="q2">Q2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card><CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Pendapatan</p>
          <p className="text-2xl font-semibold mt-2">{formatIDR(total)}</p>
          <p className="text-xs text-muted-foreground mt-1">7 bulan terakhir</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Rata-rata Bulanan</p>
          <p className="text-2xl font-semibold mt-2">{formatIDR(avg)}</p>
          <p className="text-xs text-success mt-1">Tren naik</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bulan Terbaik</p>
          <p className="text-2xl font-semibold mt-2">{formatIDR(Math.max(...monthlyIncome.map(m => m.income)))}</p>
          <p className="text-xs text-muted-foreground mt-1">Mei 2026</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Pendapatan Bulanan</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyIncome}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000000}jt`} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatIDR(v)} />
                  <Bar dataKey="income" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Okupansi Kamar</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={occData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={4}>
                    {occData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
