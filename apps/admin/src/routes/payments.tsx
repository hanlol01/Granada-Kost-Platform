import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { payments as initial, type Payment } from "@/lib/mock-data";
import { formatIDR, formatDate } from "@/lib/format";
import { CheckCircle2, CreditCard, Clock, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const [list, setList] = useState<Payment[]>(initial);
  const total = list.reduce((s, p) => s + p.amount, 0);
  const paid = list.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const unpaid = list.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount, 0);
  const overdue = list.filter((p) => p.status === "overdue").length;

  const pay = (id: string) => {
    setList((p) =>
      p.map((x) =>
        x.id === id ? { ...x, status: "paid", paidDate: new Date().toISOString().slice(0, 10) } : x,
      ),
    );
    toast.success("Pembayaran berhasil dicatat");
  };

  return (
    <AppShell title="Pembayaran" subtitle="Kelola tagihan dan transaksi sewa">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat
          icon={CreditCard}
          label="Total Tagihan"
          value={formatIDR(total)}
          accent="bg-primary-soft text-primary"
        />
        <Stat
          icon={CheckCircle2}
          label="Sudah Lunas"
          value={formatIDR(paid)}
          accent="bg-success/15 text-success"
        />
        <Stat
          icon={Clock}
          label="Belum Dibayar"
          value={formatIDR(unpaid)}
          accent="bg-warning/20 text-warning-foreground"
        />
        <Stat
          icon={AlertTriangle}
          label="Jatuh Tempo"
          value={`${overdue} tagihan`}
          accent="bg-destructive/15 text-destructive"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Tagihan</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="unpaid">Belum Lunas</TabsTrigger>
              <TabsTrigger value="paid">Riwayat</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <PaymentList items={list} onPay={pay} />
            </TabsContent>
            <TabsContent value="unpaid" className="mt-4">
              <PaymentList items={list.filter((p) => p.status !== "paid")} onPay={pay} />
            </TabsContent>
            <TabsContent value="paid" className="mt-4">
              <PaymentList items={list.filter((p) => p.status === "paid")} onPay={pay} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="text-lg lg:text-xl font-semibold mt-2 tracking-tight">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentList({ items, onPay }: { items: Payment[]; onPay: (id: string) => void }) {
  if (items.length === 0)
    return <div className="py-12 text-center text-muted-foreground text-sm">Tidak ada tagihan</div>;
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div
          key={p.id}
          className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold shrink-0">
            {p.tenantName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{p.tenantName}</p>
            <p className="text-xs text-muted-foreground">
              Kamar #{p.roomNumber} · Jatuh tempo {formatDate(p.dueDate)}
            </p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
            <p className="font-semibold">{formatIDR(p.amount)}</p>
            <StatusBadge status={p.status} />
            {p.status !== "paid" && (
              <Button size="sm" onClick={() => onPay(p.id)}>
                Bayar
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
