import { createFileRoute, Link } from "@tanstack/react-router";
import {
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
import { LoadingState, ErrorState, EmptyState } from "@/components/state";
import { usePenghuniHome } from "@/hooks/usePenghuniHome";
import { daysUntil, formatDate, formatIDR, formatPeriodKey } from "@/lib/format";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  // M11F: home is composed from /auth/me + /my/invoices + /my/payments +
  // /my/notifications/unread-count. Announcements remain a placeholder until
  // a resident-scoped endpoint ships.
  const home = usePenghuniHome();

  if (home.isLoading) {
    return <LoadingState label="Memuat data..." />;
  }
  if (home.isError) {
    return <ErrorState error={home.error} onRetry={() => void home.refetch()} />;
  }

  const { profile, currentInvoice, recentPayments, unreadNotifications } = home;
  const daysToDue = currentInvoice ? daysUntil(currentInvoice.dueDate) : null;
  const paidCount = recentPayments.filter((p) => p.paymentStatus === "verified").length;
  const progressDenominator = paidCount + (currentInvoice ? 1 : 0);
  const progress =
    progressDenominator > 0 ? Math.min(100, (paidCount / progressDenominator) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 animate-[fade-in_0.4s_ease-out]">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-b-3xl bg-[image:var(--gradient-primary)] px-5 pt-6 pb-10 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80">Selamat datang,</p>
            <h1 className="text-xl font-semibold">{profile.displayName} 👋</h1>
            <p className="mt-1 text-xs opacity-80">
              {currentInvoice ? (
                <>
                  Kamar{" "}
                  <span className="font-medium opacity-100">
                    {currentInvoice.snapshotRoomNumber}
                  </span>{" "}
                  · Aktif
                </>
              ) : profile.roomLabel ? (
                <>
                  Properti <span className="font-medium opacity-100">{profile.roomLabel}</span>
                </>
              ) : (
                <>Status hunian akan tampil di sini</>
              )}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-base font-semibold backdrop-blur">
            {profile.initials}
          </div>
        </div>

        {/* Bill card overlay */}
        {currentInvoice ? (
          <Link
            to="/billing"
            className="mt-6 block rounded-2xl bg-white/15 p-4 backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/20"
          >
            <div className="flex items-center justify-between text-xs opacity-90">
              <span>Tagihan {formatPeriodKey(currentInvoice.snapshotPeriodKey)}</span>
              <InvoiceStatusBadge status={currentInvoice.invoiceStatus} />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {formatIDR(currentInvoice.totalAmount)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs opacity-90">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {daysToDue === null
                  ? `Jatuh tempo ${formatDate(currentInvoice.dueDate)}`
                  : daysToDue >= 0
                    ? `Jatuh tempo ${daysToDue} hari lagi`
                    : `Telat ${Math.abs(daysToDue)} hari`}
              </span>
              <span className="inline-flex items-center gap-0.5 font-medium">
                Detail <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ) : (
          <div className="mt-6 rounded-2xl bg-white/15 p-4 backdrop-blur-md ring-1 ring-white/20 text-xs opacity-90">
            Tidak ada tagihan yang menunggu pembayaran.
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="-mt-4 px-5">
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)]">
          <QuickAction to="/billing" icon={Receipt} label="Tagihan" />
          <QuickAction to="/complaints" icon={Wrench} label="Komplain" />
          <QuickAction to="/info" icon={Megaphone} label="Info" />
          <QuickAction
            to="/notifications"
            icon={MessageCircle}
            label="Notif"
            badge={unreadNotifications > 0 ? unreadNotifications : undefined}
          />
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 px-5">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          label="Pembayaran Diverifikasi"
          value={`${paidCount}x`}
          hint="Terhitung dari riwayat terbaru"
        />
        <StatCard
          icon={<Receipt className="h-4 w-4 text-primary" />}
          label="Tagihan Aktif"
          value={currentInvoice ? "1" : "0"}
          hint={currentInvoice ? formatPeriodKey(currentInvoice.snapshotPeriodKey) : "Tidak ada"}
        />
      </section>

      {/* Progress */}
      <section className="mx-5 rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Progress pembayaran (riwayat terbaru)</p>
            <p className="mt-1 text-sm font-semibold">
              {paidCount} dari {progressDenominator || "-"} entri
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

      {/* Announcements (placeholder until M11F+ backend endpoint) */}
      <section className="px-5">
        <SectionTitle title="Pengumuman Terbaru" to="/info" />
        <div className="mt-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
          <EmptyState
            title="Belum tersedia"
            description="Endpoint pengumuman untuk Penghuni belum dirilis di Phase 1."
          />
        </div>
      </section>

      {/* Recent payments */}
      <section className="px-5">
        <SectionTitle title="Pembayaran Terakhir" to="/billing" />
        <div className="mt-3 flex flex-col gap-2">
          {recentPayments.length === 0 ? (
            <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
              <EmptyState
                title="Belum ada pembayaran"
                description="Pembayaran yang sudah diverifikasi akan tampil di sini."
              />
            </div>
          ) : (
            recentPayments.slice(0, 3).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]"
              >
                <div
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-xl " +
                    (p.paymentStatus === "verified"
                      ? "bg-success/15 text-success"
                      : "bg-warning/20 text-warning-foreground")
                  }
                >
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.paymentCode}</p>
                  <p className="text-xs text-muted-foreground">
                    {paymentMethodLabel(p.paymentMethod)} · {paymentStatusLabel(p.paymentStatus)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatIDR(p.amount)}</p>
                  <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDate(p.paidAt ?? p.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="relative flex flex-col items-center gap-1.5 rounded-xl py-2 text-xs font-medium text-foreground transition active:scale-95"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="h-5 w-5" />
      </span>
      {label}
      {badge ? (
        <span className="absolute right-0 top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    overdue: { label: "Telat", cls: "bg-destructive text-destructive-foreground" },
    unpaid: { label: "Belum Lunas", cls: "bg-warning text-warning-foreground" },
    issued: { label: "Diterbitkan", cls: "bg-warning text-warning-foreground" },
    partially_paid: { label: "Sebagian", cls: "bg-warning text-warning-foreground" },
    draft: { label: "Draft", cls: "bg-secondary text-foreground" },
    paid: { label: "Lunas", cls: "bg-success text-success-foreground" },
    void: { label: "Dibatalkan", cls: "bg-secondary text-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "bg-secondary text-foreground" };
  return (
    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + s.cls}>{s.label}</span>
  );
}

function paymentMethodLabel(method: string): string {
  switch (method) {
    case "bank_transfer":
      return "Transfer Bank";
    case "qris":
      return "QRIS";
    case "ewallet":
      return "E-Wallet";
    case "cash":
      return "Tunai";
    default:
      return "Lainnya";
  }
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Terverifikasi";
    case "pending":
      return "Menunggu";
    case "void":
      return "Dibatalkan";
    default:
      return status;
  }
}
