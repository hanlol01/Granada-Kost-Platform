import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock, Filter, ImagePlus, Receipt } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import {
  selectCurrentInvoice,
  useMyInvoices,
  useMyPayments,
  type MyInvoiceRecord,
  type MyInvoiceStatus,
  type MyPaymentRecord,
} from "@/hooks/usePenghuniBilling";
import { daysUntil, formatDate, formatIDR, formatPeriodKey } from "@/lib/format";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type HistoryFilter = "all" | "paid";

function BillingPage() {
  const invoicesQuery = useMyInvoices({ limit: 50 });
  const paymentsQuery = useMyPayments({ limit: 50 });
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const current = useMemo(() => selectCurrentInvoice(invoicesQuery.data), [invoicesQuery.data]);

  // History: combine paid/closed invoices and verified payments into a single
  // list. We keep them in two visual groups so resident can audit both sides.
  const closedInvoices = useMemo(
    () => (invoicesQuery.data ?? []).filter((inv) => inv.id !== current?.id),
    [invoicesQuery.data, current],
  );
  const filteredHistory = useMemo(
    () =>
      filter === "all"
        ? closedInvoices
        : closedInvoices.filter((inv) => inv.invoiceStatus === "paid"),
    [closedInvoices, filter],
  );

  const isLoading = invoicesQuery.isLoading || paymentsQuery.isLoading;
  const isError = invoicesQuery.isError;

  return (
    <>
      <AppHeader
        title="Tagihan & Pembayaran"
        subtitle={
          current
            ? `Periode ${formatPeriodKey(current.snapshotPeriodKey)}`
            : "Tidak ada tagihan aktif"
        }
      />
      <div className="flex flex-col gap-5 px-5 py-5 animate-[fade-in_0.4s_ease-out]">
        {isLoading ? (
          <LoadingState label="Memuat tagihan..." />
        ) : isError ? (
          <ErrorState error={invoicesQuery.error} onRetry={() => void invoicesQuery.refetch()} />
        ) : (
          <>
            {/* Current bill */}
            {current ? <CurrentBillCard invoice={current} /> : <NoBillCard />}

            {/* Payment action (disabled until File API ships) */}
            <PayActionDisabled />

            {/* History */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Riwayat Tagihan</p>
                <button
                  onClick={() => setFilter(filter === "all" ? "paid" : "all")}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                >
                  <Filter className="h-3 w-3" /> {filter === "all" ? "Semua" : "Lunas"}
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {closedInvoices.length === 0 ? (
                  <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                    <EmptyState
                      title="Belum ada riwayat"
                      description="Riwayat tagihan akan muncul setelah invoice diterbitkan."
                    />
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                    <EmptyState
                      title="Tidak ada hasil"
                      description="Tidak ada tagihan yang cocok dengan filter saat ini."
                    />
                  </div>
                ) : (
                  filteredHistory.map((inv) => <InvoiceRow key={inv.id} invoice={inv} />)
                )}
              </div>
            </div>

            {/* Payments ledger */}
            <div>
              <p className="text-sm font-semibold">Pembayaran Anda</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Sumber: pembayaran yang sudah tercatat di sistem.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {paymentsQuery.isError ? (
                  <ErrorState
                    error={paymentsQuery.error}
                    onRetry={() => void paymentsQuery.refetch()}
                    title="Gagal memuat pembayaran"
                  />
                ) : (paymentsQuery.data ?? []).length === 0 ? (
                  <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]">
                    <EmptyState
                      title="Belum ada pembayaran"
                      description="Pembayaran yang sudah dicatat oleh admin akan muncul di sini."
                    />
                  </div>
                ) : (
                  paymentsQuery.data!.map((p) => <PaymentRow key={p.id} payment={p} />)
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function CurrentBillCard({ invoice }: { invoice: MyInvoiceRecord }) {
  const dueIn = daysUntil(invoice.dueDate);
  return (
    <div className="overflow-hidden rounded-2xl bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
      <div className="flex items-center justify-between text-xs opacity-90">
        <span>Invoice {invoice.invoiceCode}</span>
        <InvoiceStatusBadge status={invoice.invoiceStatus} />
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight">{formatIDR(invoice.totalAmount)}</p>
      <div className="mt-3 flex items-center gap-2 text-xs opacity-90">
        <Calendar className="h-3.5 w-3.5" />
        {dueIn === null
          ? `Jatuh tempo ${formatDate(invoice.dueDate)}`
          : dueIn >= 0
            ? `Jatuh tempo ${dueIn} hari lagi (${formatDate(invoice.dueDate)})`
            : `Telat ${Math.abs(dueIn)} hari (${formatDate(invoice.dueDate)})`}
      </div>
      <div className="mt-4 space-y-1.5 rounded-xl bg-white/10 p-3 text-xs backdrop-blur">
        <BreakdownRow label="Subtotal" amount={invoice.subtotalAmount} />
        {invoice.lateFeeAmount > 0 ? (
          <BreakdownRow label="Denda Keterlambatan" amount={invoice.lateFeeAmount} />
        ) : null}
        <BreakdownRow label="Total" amount={invoice.totalAmount} bold />
      </div>
    </div>
  );
}

function NoBillCard() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Tidak ada tagihan aktif</p>
          <p className="text-xs text-muted-foreground">
            Anda akan diberi tahu saat tagihan periode berikutnya diterbitkan.
          </p>
        </div>
      </div>
    </div>
  );
}

function PayActionDisabled() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-xs text-muted-foreground">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
          <ImagePlus className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Upload bukti pembayaran</p>
          <p className="mt-0.5">
            Fitur ini menunggu File API yang stabil. Saat tersedia, Anda dapat mengirim bukti
            transfer langsung dari aplikasi.
          </p>
          <button
            type="button"
            disabled
            aria-disabled
            className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-secondary px-4 text-xs font-semibold text-muted-foreground"
          >
            Tersedia setelah File API rilis
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold opacity-100" : "opacity-90"}>{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{formatIDR(amount)}</span>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: MyInvoiceRecord }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]">
      <div
        className={
          "flex h-9 w-9 items-center justify-center rounded-xl " +
          (invoice.invoiceStatus === "paid"
            ? "bg-success/15 text-success"
            : invoice.invoiceStatus === "overdue"
              ? "bg-destructive/15 text-destructive"
              : "bg-warning/20 text-warning-foreground")
        }
      >
        <Receipt className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{formatPeriodKey(invoice.snapshotPeriodKey)}</p>
        <p className="text-xs text-muted-foreground">
          {invoice.invoiceCode} · {formatDate(invoice.dueDate)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{formatIDR(invoice.totalAmount)}</p>
        <div className="mt-0.5">
          <InvoiceStatusBadge status={invoice.invoiceStatus} compact />
        </div>
      </div>
    </div>
  );
}

function PaymentRow({ payment }: { payment: MyPaymentRecord }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]">
      <div
        className={
          "flex h-9 w-9 items-center justify-center rounded-xl " +
          (payment.paymentStatus === "verified"
            ? "bg-success/15 text-success"
            : payment.paymentStatus === "void"
              ? "bg-secondary text-muted-foreground"
              : "bg-warning/20 text-warning-foreground")
        }
      >
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{payment.paymentCode}</p>
        <p className="text-xs text-muted-foreground">{paymentMethodLabel(payment.paymentMethod)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{formatIDR(payment.amount)}</p>
        <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatDate(payment.paidAt ?? payment.createdAt)}
        </p>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status, compact }: { status: MyInvoiceStatus; compact?: boolean }) {
  const map: Record<MyInvoiceStatus, { label: string; cls: string }> = {
    overdue: { label: "Telat", cls: "bg-destructive text-destructive-foreground" },
    unpaid: { label: "Belum Lunas", cls: "bg-warning text-warning-foreground" },
    issued: { label: "Diterbitkan", cls: "bg-warning text-warning-foreground" },
    partially_paid: { label: "Sebagian", cls: "bg-warning text-warning-foreground" },
    draft: { label: "Draft", cls: "bg-secondary text-foreground" },
    paid: { label: "Lunas", cls: "bg-success text-success-foreground" },
    void: { label: "Dibatalkan", cls: "bg-secondary text-foreground" },
  };
  const s = map[status];
  return (
    <span
      className={
        "rounded-full font-semibold " +
        (compact ? "px-1.5 py-0.5 text-[10px] " : "px-2 py-0.5 text-[10px] ") +
        s.cls
      }
    >
      {s.label}
    </span>
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
