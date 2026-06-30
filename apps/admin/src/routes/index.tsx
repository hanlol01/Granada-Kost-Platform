import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/state/ErrorState";
import { EmptyState } from "@/components/state/EmptyState";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { formatIDR } from "@/lib/format";
import {
  BedDouble,
  Users,
  DollarSign,
  AlertCircle,
  Plus,
  TrendingUp,
  CreditCard,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <Card className="border-border/60 hover:shadow-md transition-all hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
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

function StatCardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-20" />
        <Skeleton className="mt-2 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { summary, isLoading, error, refetch } = useDashboardSummary();

  return (
    <AppShell
      title="Dashboard"
      subtitle="Ringkasan pengelolaan rumah kos Anda"
      actions={
        <Button asChild className="hidden sm:inline-flex">
          <Link to="/rooms">
            <Plus className="h-4 w-4 mr-1" /> Tambah Kamar
          </Link>
        </Button>
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={refetch} title="Gagal memuat ringkasan" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading || !summary ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  icon={BedDouble}
                  label="Total Kamar"
                  value={String(summary.totalRooms)}
                  hint={`${summary.vacantRooms} kosong tersedia`}
                  accent="bg-primary-soft text-primary"
                />
                <StatCard
                  icon={Users}
                  label="Total Penghuni"
                  value={String(summary.totalResidents)}
                  hint={`${summary.occupiedRooms} kamar terisi`}
                  accent="bg-success/15 text-success"
                />
                <StatCard
                  icon={DollarSign}
                  label="Total Piutang"
                  value={formatIDR(summary.totalReceivable)}
                  hint={`${summary.overdueInvoices} overdue`}
                  accent="bg-chart-4/15 text-chart-4"
                />
                <StatCard
                  icon={AlertCircle}
                  label="Tagihan Belum Dibayar"
                  value={String(summary.unpaidInvoices)}
                  hint="Perlu tindak lanjut"
                  accent="bg-destructive/15 text-destructive"
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pemasukan Bulanan</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tersedia setelah modul Billing terintegrasi penuh
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <EmptyState
                    title="Belum tersedia"
                    description="Grafik pemasukan bulanan akan aktif setelah endpoint laporan revenue terintegrasi pada M11D."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Okupansi Kamar</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Tingkat hunian saat ini</p>
              </CardHeader>
              <CardContent className="space-y-5">
                {isLoading || !summary ? (
                  <>
                    <div className="py-4 text-center">
                      <Skeleton className="mx-auto h-12 w-24" />
                      <Skeleton className="mx-auto mt-2 h-3 w-32" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                    <div className="grid grid-cols-3 gap-2">
                      <Skeleton className="h-14" />
                      <Skeleton className="h-14" />
                      <Skeleton className="h-14" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center py-4">
                      <p className="text-5xl font-bold tracking-tight text-primary">
                        {summary.occupancyPercent}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {summary.occupiedRooms} dari {summary.totalRooms} kamar terisi
                      </p>
                    </div>
                    <Progress value={summary.occupancyPercent} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-primary-soft p-3">
                        <p className="text-lg font-semibold text-primary">
                          {summary.occupiedRooms}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">Terisi</p>
                      </div>
                      <div className="rounded-lg bg-success/15 p-3">
                        <p className="text-lg font-semibold text-success">{summary.vacantRooms}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Kosong</p>
                      </div>
                      <div className="rounded-lg bg-warning/20 p-3">
                        <p className="text-lg font-semibold">{summary.maintenanceRooms}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Maint.</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" />
                </span>
              </CardHeader>
              <CardContent>
                <EmptyState
                  title="Akan tersedia di M11D"
                  description="Aktivitas lintas modul (pembayaran, komplain, check-in) muncul setelah integrasi Billing dan Complaint."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aksi Cepat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link to="/rooms">
                    <BedDouble className="h-4 w-4 mr-2" />
                    Kelola Kamar
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link to="/tenants">
                    <Users className="h-4 w-4 mr-2" />
                    Tambah Penghuni
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link to="/payments">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Catat Pembayaran
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link to="/reports">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Lihat Laporan
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
