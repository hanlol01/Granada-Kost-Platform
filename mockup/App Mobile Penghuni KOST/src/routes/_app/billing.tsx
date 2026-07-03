import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { currentBill, paymentHistory, formatIDR } from "@/lib/dummy-data";
import {
  CheckCircle2,
  Download,
  Filter,
  CreditCard,
  Smartphone,
  QrCode,
  Loader2,
  Sparkles,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Method = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };
const methods: Method[] = [
  { id: "qris", label: "QRIS", icon: QrCode },
  { id: "bank", label: "Transfer Bank", icon: CreditCard },
  { id: "ewallet", label: "E-Wallet", icon: Smartphone },
];

function BillingPage() {
  const [method, setMethod] = useState("qris");
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [filter, setFilter] = useState<"all" | "paid">("all");

  const handlePay = () => {
    setPaying(true);
    setTimeout(() => {
      setPaying(false);
      setSuccess(true);
    }, 1600);
  };

  const list = paymentHistory.filter((p) => (filter === "all" ? true : p.status === "paid"));

  return (
    <>
      <AppHeader title="Tagihan & Pembayaran" subtitle={`Periode ${currentBill.period}`} />
      <div className="flex flex-col gap-5 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        {/* Bill summary */}
        <div className="overflow-hidden rounded-2xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
          <p className="text-xs opacity-80">Total Tagihan</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{formatIDR(currentBill.amount)}</p>
          <div className="mt-3 flex items-center gap-2 text-xs opacity-90">
            <Calendar className="h-3.5 w-3.5" />
            Jatuh tempo {currentBill.dueDate}
          </div>
          <div className="mt-4 space-y-1.5 rounded-xl bg-white/10 p-3 text-xs backdrop-blur">
            {currentBill.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between">
                <span className="opacity-90">{b.label}</span>
                <span className="font-medium">{formatIDR(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Methods */}
        <div>
          <p className="mb-2 text-sm font-semibold">Metode Pembayaran</p>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => {
              const active = m.id === method;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium transition active:scale-95 " +
                    (active
                      ? "border-primary bg-accent text-primary shadow-[var(--shadow-soft)]"
                      : "border-border bg-card text-foreground")
                  }
                >
                  <m.icon className="h-5 w-5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={paying || success}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition active:scale-[0.98] disabled:opacity-70"
        >
          {paying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Pembayaran Berhasil
            </>
          ) : (
            <>Bayar {formatIDR(currentBill.amount)}</>
          )}
        </button>

        {/* History */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Riwayat Pembayaran</p>
            <button
              onClick={() => setFilter(filter === "all" ? "paid" : "all")}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
            >
              <Filter className="h-3 w-3" /> {filter === "all" ? "Semua" : "Lunas"}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {list.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.period}</p>
                  <p className="text-xs text-muted-foreground">{p.method} · {p.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatIDR(p.amount)}</p>
                  <button className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-primary">
                    <Download className="h-3 w-3" /> Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {success && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
          onClick={() => setSuccess(false)}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-3xl bg-card p-6 text-center animate-[slide-up_0.35s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success animate-[scale-in_0.3s_ease-out]">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="mt-3 text-lg font-semibold">Pembayaran Berhasil!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Terima kasih, tagihan {currentBill.period} sudah lunas.
            </p>
            <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs text-primary">
              <Sparkles className="h-3 w-3" /> Invoice dikirim ke email
            </div>
            <button
              onClick={() => setSuccess(false)}
              className="mt-5 h-11 w-full rounded-2xl bg-[image:var(--gradient-primary)] text-sm font-semibold text-primary-foreground"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </>
  );
}
