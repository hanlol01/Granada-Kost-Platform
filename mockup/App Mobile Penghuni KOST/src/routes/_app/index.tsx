import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Wifi,
  Receipt,
  Wrench,
  MessageCircle,
  Megaphone,
  ChevronRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  currentUser,
  currentBill,
  announcements,
  paymentHistory,
  formatIDR,
} from "@/lib/dummy-data";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const daysToDue = Math.ceil(
    (new Date(currentBill.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const paidMonths = paymentHistory.length;
  const progress = Math.min(100, (paidMonths / (paidMonths + 1)) * 100);

  return (
    <div className="flex flex-col gap-5 animate-[fade-in_0.4s_ease-out]">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-b-3xl bg-[image:var(--gradient-primary)] px-5 pt-6 pb-10 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80">Selamat datang,</p>
            <h1 className="text-xl font-semibold">{currentUser.name} 👋</h1>
            <p className="mt-1 text-xs opacity-80">
              Kamar <span className="font-medium opacity-100">{currentUser.room}</span> · {currentUser.status}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-base font-semibold backdrop-blur">
            {currentUser.avatar}
          </div>
        </div>

        {/* Bill card overlay */}
        <Link
          to="/billing"
          className="mt-6 block rounded-2xl bg-white/15 p-4 backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/20"
        >
          <div className="flex items-center justify-between text-xs opacity-90">
            <span>Tagihan {currentBill.period}</span>
            <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
              Belum Lunas
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight">
            {formatIDR(currentBill.amount)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs opacity-90">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Jatuh tempo {daysToDue} hari lagi
            </span>
            <span className="inline-flex items-center gap-0.5 font-medium">
              Bayar <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>
      </section>

      {/* Quick actions */}
      <section className="-mt-4 px-5">
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)]">
          <QuickAction to="/billing" icon={Receipt} label="Bayar" />
          <QuickAction to="/complaints" icon={Wrench} label="Komplain" />
          <QuickAction to="/info" icon={Megaphone} label="Info" />
          <QuickAction to="/chat" icon={MessageCircle} label="Chat" />
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 px-5">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          label="Bulan Lunas"
          value={`${paidMonths}x`}
          hint="Track pembayaran"
        />
        <StatCard
          icon={<Wifi className="h-4 w-4 text-primary" />}
          label="WiFi Kos"
          value="98 Mbps"
          hint="Status: Online"
        />
      </section>

      {/* Progress */}
      <section className="mx-5 rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Progress pembayaran tahun ini</p>
            <p className="mt-1 text-sm font-semibold">
              {paidMonths} dari {paidMonths + 1} bulan
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      {/* Announcements */}
      <section className="px-5">
        <SectionTitle title="Pengumuman Terbaru" to="/info" />
        <div className="mt-3 flex flex-col gap-2">
          {announcements.slice(0, 2).map((a) => (
            <Link
              key={a.id}
              to="/info"
              className="flex items-start gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)] transition hover:bg-accent"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Megaphone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{a.title}</p>
                  <PriorityBadge p={a.priority} />
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {a.body}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent payments */}
      <section className="px-5">
        <SectionTitle title="Pembayaran Terakhir" to="/billing" />
        <div className="mt-3 flex flex-col gap-2">
          {paymentHistory.slice(0, 3).map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.period}</p>
                <p className="text-xs text-muted-foreground">{p.method} · {p.id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatIDR(p.amount)}</p>
                <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {p.date}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1.5 rounded-xl py-2 text-xs font-medium text-foreground transition active:scale-95"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </Link>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-1.5 text-lg font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionTitle({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Link to={to} className="text-xs font-medium text-primary inline-flex items-center">
        Lihat <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    high: "bg-destructive/15 text-destructive",
    medium: "bg-warning/20 text-warning-foreground",
    low: "bg-success/15 text-success",
  };
  return (
    <span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase " + (map[p] ?? "")}>
      {p}
    </span>
  );
}
