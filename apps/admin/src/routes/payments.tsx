import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvoices, type InvoiceRecord, type InvoiceStatus } from "@/hooks/useBilling";
import { formatIDR, formatDate } from "@/lib/format";
import { CheckCircle2, CreditCard, Clock, AlertTriangle, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

type InvoiceTab = "all" | "unpaid" | "paid";

function isInvoiceTab(value: string): value is InvoiceTab {
  return value === "all" || value === "unpaid" || value === "paid";
}

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Terkirim", cls: "bg-primary-soft text-primary" },
  unpaid: { label: "Belum Lunas", cls: "bg-warning/20 text-warning-foreground" },
  partially_paid: {
    label: "Bayar Sebagian",
    cls: "bg-chart-4/15 text-chart-4",
  },
  paid: { label: "Lunas", cls: "bg-success/15 text-success" },
  overdue: { label: "Jatuh Tempo", cls: "bg-destructive/15 text-destructive" },
  void: { label: "Void", cls: "bg-muted text-muted-foreground line-through" },
};

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const item = INVOICE_STATUS_LABEL[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
        item.cls,
      )}
    >
      {item.label}
    </span>
  );
}

function PaymentsPage() {
  const [tab, setTab] = useState<InvoiceTab>("all");

  // Backend supports a single status filter. The 'all' tab calls without it.
  const statusParam: InvoiceStatus | undefined =
    tab === "unpaid" ? "unpaid" : tab === "paid" ? "paid" : undefined;

  const { data, isLoading, error, refetch, isFetching } = useInvoices({
    status: statusParam,
    limit: 100,
  });
  const items = data ?? [];

  const stats = useMemo(() => {
    const total = items.reduce((s, p) => s + p.totalAmount, 0);
    const paid = items
      .filter((p) => p.invoiceStatus === "paid")
      .reduce((s, p) => s + p.totalAmount, 0);
    const unpaid = items
      .filter((p) =>
        ["unpaid", "overdue", "partially_paid", "issued"].includes(p.invoiceStatus),
      )
      .reduce((s, p) => s + p.totalAmount, 0);
    const overdue = items.filter((p) => p.invoiceStatus === "overdue").length;
    return { total, paid, unpaid, overdue };
  }, [items]);

  return (
    <AppShell title="Pembayaran" subtitle="Kelola tagihan dan transaksi sewa">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <Stat
              icon={CreditCard}
              label="Total Tagihan"
              value={formatIDR(stats.total)}
              accent="bg-primary-soft text-primary"
            />
            <Stat
              icon={CheckCircle2}
              label="Sudah Lunas"
              value={formatIDR(stats.paid)}
              accent="bg-success/15 text-success"
            />
            <Stat
              icon={Clock}
              label="Belum Dibayar"
              value={formatIDR(stats.unpaid)}
              accent="bg-warning/20 text-warning-foreground"
            />
            <Stat
              icon={AlertTriangle}
              label="Jatuh Tempo"
              value={`${stats.overdue} tagihan`}
              accent="bg-destructive/15 text-destructive"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Tagihan</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(isInvoiceTab(v) ? v : "all")}>
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="unpaid">Belum Lunas</TabsTrigger>
              <TabsTrigger value="paid">Riwayat</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {error ? (
                <ErrorState error={error} onRetry={() => refetch()} title="Gagal memuat tagihan" />
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-5 w-5" />}
                  title="Tidak ada tagihan"
                  description={
                    tab === "unpaid"
                      ? "Tidak ada tagihan menunggu pembayaran saat ini."
                      : tab === "paid"
                        ? "Belum ada riwayat pembayaran."
                        : "Tagihan akan tampil saat invoice diterbitkan."
                  }
                />
              ) : (
                <PaymentList items={items} isFetching={isFetching} />
              )}
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

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-32" />
      </CardContent>
    </Card>
  );
}

function PaymentList({ items, isFetching }: { items: InvoiceRecord[]; isFetching: boolean }) {
  return (
    <div className={cn("space-y-2", isFetching && "opacity-90 transition-opacity")}>
      {items.map((p) => (
        <div
          key={p.id}
          className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold shrink-0">
            {p.snapshotResidentName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{p.snapshotResidentName}</p>
            <p className="text-xs text-muted-foreground">
              Kamar #{p.snapshotRoomNumber} · {p.invoiceCode} · Jatuh tempo{" "}
              {formatDate(p.dueDate)}
            </p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
            <p className="font-semibold">{formatIDR(p.totalAmount)}</p>
            <InvoiceStatusBadge status={p.invoiceStatus} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" disabled>
                      Catat Bayar
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Pencatatan pembayaran &amp; verifikasi bukti tersedia di M11E.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      ))}
    </div>
  );
}
