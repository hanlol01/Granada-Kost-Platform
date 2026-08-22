import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDashboardIDR } from "@/lib/admin-ux-dashboard";
import type { RevenueSummary } from "@/lib/reports-selectors";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const chartConfig = {
  amount: {
    label: "Pemasukan",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

function formatCompactAmount(amount: number): string {
  if (amount >= 1_000_000)
    return `Rp ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)} jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)} rb`;
  return formatDashboardIDR(String(amount));
}

type MonthlyRevenueChartProps = {
  revenue: RevenueSummary | null;
  year: number;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
};

export function MonthlyRevenueChart({
  revenue,
  year,
  isLoading,
  error,
  onRetry,
}: MonthlyRevenueChartProps) {
  if (isLoading) {
    return (
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="hidden h-16 sm:block" />
        </div>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    );
  }

  if (error) {
    return (
      <CardContent>
        <ErrorState error={error} onRetry={onRetry} title="Gagal memuat pemasukan" />
      </CardContent>
    );
  }

  if (!revenue || revenue.verifiedPayments === 0) {
    return (
      <CardContent>
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title={`Belum ada pemasukan terverifikasi pada ${year}`}
          description="Grafik akan terisi otomatis setelah pembayaran penghuni diverifikasi oleh Admin. Pembayaran pending atau dibatalkan tidak dihitung sebagai pemasukan."
        />
      </CardContent>
    );
  }

  const chartData = revenue.monthly.map(({ month, amount }) => ({
    label: MONTH_LABELS[month],
    amount,
  }));
  const bestMonthLabel = revenue.bestMonth ? MONTH_LABELS[revenue.bestMonth.month] : "—";

  return (
    <CardContent className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Terverifikasi tahun ini
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {formatDashboardIDR(String(revenue.verifiedAmount))}
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Rata-rata bulan berisi
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {formatDashboardIDR(String(revenue.averageMonthlyAmount))}
          </p>
        </div>
        <div className="col-span-2 rounded-lg border border-border/70 bg-primary-soft/50 p-3 sm:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bulan tertinggi
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-primary">
            {bestMonthLabel} · {formatCompactAmount(revenue.bestMonth?.amount ?? 0)}
          </p>
        </div>
      </div>

      <ChartContainer
        config={chartConfig}
        className="h-64 min-h-[16rem] w-full aspect-auto"
        aria-label={`Grafik pemasukan bulanan tahun ${year}`}
      >
        <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="monthlyRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-amount)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--color-amount)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, "auto"]} />
          <ChartTooltip
            cursor={{ stroke: "var(--color-border)", strokeDasharray: "4 4" }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `${label} ${year}`}
                formatter={(value) => formatDashboardIDR(String(value))}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="amount"
            name="Pemasukan"
            stroke="var(--color-amount)"
            strokeWidth={2.5}
            fill="url(#monthlyRevenueFill)"
            dot={{ r: 3, fill: "var(--color-amount)", strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-card)" }}
          />
        </AreaChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Sumber: pembayaran terverifikasi pada properti aktif · zona waktu Asia/Jakarta. Data pending
        dan dibatalkan tidak masuk grafik.
      </p>
    </CardContent>
  );
}
