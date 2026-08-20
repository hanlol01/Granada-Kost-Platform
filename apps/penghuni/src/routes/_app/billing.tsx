import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyW06Billing, useMyW06Receipt } from "@/hooks/useW06Billing";
import { downloadMyInvoiceDocument } from "@/lib/penghuni-w06-billing";
import type {
  MyW06Billing,
  W06InvoiceStatus,
  W06PaymentPurpose,
  W06ProofStatus,
} from "@/lib/penghuni-w06-billing";
import {
  deriveResidentBillingNotice,
  verifiedDpTotal,
  type ResidentBillingNotice,
} from "@/lib/w11c-resident-billing";

export const Route = createFileRoute("/_app/billing")({ component: BillingPage });

type Invoice = MyW06Billing["invoices"][number];
type Proof = MyW06Billing["proofs"][number];

function BillingPage() {
  const query = useMyW06Billing();
  const [receiptId, setReceiptId] = useState<string | null>(null);

  if (query.isPending)
    return (
      <Page>
        <LoadingState label="Memuat billing kontrak..." />
      </Page>
    );
  if (query.isError)
    return (
      <Page>
        <ErrorState
          title="Billing belum dapat dimuat"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );

  const billing = query.data;
  return (
    <Page
      subtitle={`${planLabel(billing.lease.payment_plan)} · ${billing.summary.installment_paid}/${billing.summary.installment_total} tahap lunas`}
    >
      <ReadOnlyNotice />
      <BalanceHero billing={billing} />
      <BillingNotice billing={billing} />
      <ContractSummary billing={billing} />
      <FinancialSeparationSummary billing={billing} />
      <section aria-labelledby="invoice-heading">
        <SectionHeading
          id="invoice-heading"
          title="Tagihan kontrak"
          description="Saldo berasal dari invoice persisten dan alokasi pembayaran terverifikasi."
        />
        <div className="mt-3 space-y-3">
          {billing.invoices.length ? (
            billing.invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />)
          ) : (
            <Card>
              <CardContent className="p-4">
                <EmptyState
                  title="Belum ada invoice"
                  description="Invoice akan muncul sesuai jadwal kontrak yang dibekukan."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </section>
      <PaymentHistory billing={billing} onReceipt={setReceiptId} />
      <ProofHistory proofs={billing.proofs} invoices={billing.invoices} />
      <ReceiptDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />
    </Page>
  );
}

function Page({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <>
      <AppHeader
        title="Tagihan & Pembayaran"
        subtitle={subtitle ?? "Sumber billing resmi kontrak Anda"}
      />
      <main className="flex flex-col gap-6 px-5 py-5 animate-[fade-in_0.35s_ease-out]">
        {children}
      </main>
    </>
  );
}

function ReadOnlyNotice() {
  return (
    <section className="flex gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Info className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">Informasi pembayaran resmi</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Halaman ini hanya menampilkan tagihan dan pembayaran yang sudah dicatat pengelola.
          Pembayaran tidak dilakukan melalui aplikasi ini.
        </p>
      </div>
    </section>
  );
}

function BillingNotice({ billing }: { billing: MyW06Billing }) {
  const notice = deriveResidentBillingNotice(billing.summary);
  const presentation = noticePresentation(notice, billing.summary.next_due_date);
  const Icon = presentation.icon;
  return (
    <section
      aria-live="polite"
      className={`flex gap-3 rounded-2xl border p-4 ${presentation.className}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold">{presentation.title}</h2>
        <p className="mt-1 text-sm leading-relaxed opacity-85">{presentation.description}</p>
      </div>
    </section>
  );
}

function BalanceHero({ billing }: { billing: MyW06Billing }) {
  const nextDue = billing.summary.next_due_date;
  return (
    <section className="overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-glow)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
        Sisa sewa kontrak
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight">
        {idr(billing.summary.rent_outstanding)}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-primary-foreground/20 pt-4 text-sm">
        <div>
          <p className="text-primary-foreground/70">Sudah dibayar</p>
          <p className="mt-1 font-semibold">{idr(billing.summary.rent_paid)}</p>
        </div>
        <div>
          <p className="text-primary-foreground/70">Jatuh tempo berikutnya</p>
          <p className="mt-1 font-semibold">{nextDue ? jakartaDate(nextDue) : "Tidak ada"}</p>
        </div>
      </div>
    </section>
  );
}

function ContractSummary({ billing }: { billing: MyW06Billing }) {
  const depositRemaining = Math.max(
    0,
    billing.summary.security_deposit_required - billing.summary.deposit_collected,
  );
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Kontrak sewa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <SummaryRow
            label="Periode"
            value={`${jakartaDate(billing.lease.start_date)} – ${jakartaDate(billing.lease.end_date)}`}
          />
          <SummaryRow label="Nilai sewa" value={idr(billing.lease.contract_rent)} />
          <SummaryRow label="Tarif bulanan" value={idr(billing.lease.monthly_rate)} />
          <SummaryRow label="Sisa masa kontrak" value={`${billing.lease.remaining_days} hari`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Deposit keamanan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <SummaryRow label="Kewajiban" value={idr(billing.summary.security_deposit_required)} />
          <SummaryRow label="Saldo ledger" value={idr(billing.summary.deposit_balance)} />
          <SummaryRow label="Belum terkumpul" value={idr(depositRemaining)} />
          <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            Deposit adalah liabilitas terpisah. Saldo ini tidak mengurangi tagihan sewa.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function FinancialSeparationSummary({ billing }: { billing: MyW06Billing }) {
  const dpTotal = verifiedDpTotal(billing.payments);
  return (
    <section aria-labelledby="financial-separation-heading">
      <SectionHeading
        id="financial-separation-heading"
        title="DP dan security deposit"
        description="Keduanya dicatat terpisah agar nilai pembayaran sewa tidak tercampur dengan jaminan."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card className="border-primary/25">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Banknote className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-muted-foreground">DP / uang muka sewa</p>
                <p className="mt-1 text-xl font-bold">{idr(dpTotal)}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  DP yang terverifikasi menjadi kredit dan mengurangi kewajiban sewa kontrak.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Security deposit tercatat
                </p>
                <p className="mt-1 text-xl font-bold">{idr(billing.summary.deposit_balance)}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Security deposit adalah dana jaminan terpisah dan tidak mengurangi tagihan sewa.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const [documentState, setDocumentState] = useState<"idle" | "loading" | "error">("idle");
  return (
    <Card className={invoice.invoice_status === "overdue" ? "border-destructive/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{invoice.invoice_code}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {invoice.invoice_purpose === "rent" ? "Sewa" : "Tagihan lainnya"} ·{" "}
              {jakartaDate(invoice.coverage_start)} – {jakartaDate(invoice.coverage_end)}
            </p>
          </div>
          <InvoiceBadge status={invoice.invoice_status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-sm">
          <SummaryRow label="Total" value={idr(invoice.total_amount)} stacked />
          <SummaryRow label="Sisa" value={idr(invoice.outstanding_amount)} stacked />
          <SummaryRow label="Jatuh tempo" value={jakartaDate(invoice.due_date)} stacked />
          <SummaryRow
            label="Status pembayaran"
            value={invoiceStatusLabel(invoice.invoice_status)}
            stacked
          />
        </div>
        <div className="mt-4">
          {invoice.invoice_status !== "draft" ? (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              disabled={documentState === "loading"}
              onClick={() => {
                setDocumentState("loading");
                void downloadMyInvoiceDocument(invoice.id, invoice.invoice_code)
                  .then(() => setDocumentState("idle"))
                  .catch(() => setDocumentState("error"));
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {documentState === "loading" ? "Menyiapkan PDF..." : "Unduh invoice"}
            </Button>
          ) : null}
        </div>
        {documentState === "error" ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            PDF invoice belum dapat diunduh. Silakan coba lagi.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentHistory({
  billing,
  onReceipt,
}: {
  billing: MyW06Billing;
  onReceipt: (id: string) => void;
}) {
  return (
    <section aria-labelledby="payment-heading">
      <SectionHeading
        id="payment-heading"
        title="Riwayat pembayaran"
        description="Kuitansi hanya tersedia untuk pembayaran yang sudah terverifikasi."
      />
      <div className="mt-3 space-y-3">
        {billing.payments.length ? (
          billing.payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{payment.payment_code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {methodLabel(payment.payment_method)} ·{" "}
                      {purposeLabel(payment.payment_purpose)}
                    </p>
                  </div>
                  <PaymentBadge status={payment.payment_status} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{idr(payment.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.paid_at ? jakartaTime(payment.paid_at) : "Waktu belum tersedia"}
                    </p>
                  </div>
                  {payment.receipt_id ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => onReceipt(payment.receipt_id!)}
                    >
                      <ReceiptText className="mr-2 h-4 w-4" /> Kuitansi
                    </Button>
                  ) : null}
                </div>
                {payment.allocations.length ? (
                  <p className="mt-3 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                    Dialokasikan ke {payment.allocations.length} invoice sebesar{" "}
                    {idr(payment.allocations.reduce((sum, item) => sum + item.amount, 0))}.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-4">
              <EmptyState
                title="Belum ada pembayaran"
                description="Pembayaran manual yang tercatat akan muncul di sini."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function ProofHistory({ proofs, invoices }: { proofs: Proof[]; invoices: Invoice[] }) {
  const invoiceCodes = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice.invoice_code])),
    [invoices],
  );
  return (
    <section aria-labelledby="proof-heading">
      <SectionHeading
        id="proof-heading"
        title="Riwayat bukti pembayaran"
        description="Arsip bukti lama ditampilkan untuk referensi. Pengiriman bukti baru dilakukan melalui pengelola."
      />
      <div className="mt-3 space-y-2">
        {proofs.length ? (
          proofs.map((proof) => (
            <div key={proof.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {invoiceCodes.get(proof.invoice_id) ?? "Invoice kontrak"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {idr(proof.claimed_amount)} · {jakartaTime(proof.uploaded_at)}
                  </p>
                </div>
                <ProofBadge status={proof.proof_status} />
              </div>
              {proof.reject_reason ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"
                >
                  Alasan penolakan: {proof.reject_reason}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Belum ada riwayat bukti pembayaran.
          </p>
        )}
      </div>
    </section>
  );
}

function ReceiptDialog({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const query = useMyW06Receipt(receiptId);
  return (
    <Dialog open={Boolean(receiptId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kuitansi pembayaran</DialogTitle>
          <DialogDescription>Snapshot ini tidak berubah setelah diterbitkan.</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState label="Memuat kuitansi..." />
        ) : query.isError ? (
          <ErrorState
            title="Kuitansi tidak dapat dimuat"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.data ? (
          <div className="space-y-3 rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div>
                <p className="font-semibold">{query.data.receipt_code}</p>
                <p className="text-xs text-muted-foreground">{jakartaTime(query.data.issued_at)}</p>
              </div>
            </div>
            <SummaryRow label="Pembayaran" value={query.data.snapshot.payment_code} />
            <SummaryRow label="Metode" value={methodLabel(query.data.snapshot.payment_method)} />
            <SummaryRow label="Tujuan" value={purposeLabel(query.data.snapshot.payment_purpose)} />
            <SummaryRow label="Nominal" value={idr(query.data.amount)} />
          </div>
        ) : null}
        <DialogFooter>
          <Button className="min-h-11" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
function SummaryRow({
  label,
  value,
  stacked = false,
}: {
  label: string;
  value: string;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "space-y-1" : "flex items-start justify-between gap-3"}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
function InvoiceBadge({ status }: { status: W06InvoiceStatus }) {
  const styles: Record<W06InvoiceStatus, string> = {
    draft: "border-border bg-muted text-muted-foreground",
    issued: "border-primary/30 bg-primary/10 text-primary",
    partially_paid: "border-warning/30 bg-warning/10 text-warning",
    paid: "border-success/30 bg-success/10 text-success",
    overdue: "border-destructive/30 bg-destructive/10 text-destructive",
    void: "border-border bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={styles[status]}>
      {invoiceStatusLabel(status)}
    </Badge>
  );
}
function ProofBadge({ status }: { status: W06ProofStatus }) {
  const labels: Record<W06ProofStatus, string> = {
    pending_review: "Menunggu review",
    verified: "Diterima",
    rejected: "Ditolak",
    expired: "Kedaluwarsa",
  };
  const icon =
    status === "verified" ? (
      <CheckCircle2 className="mr-1 h-3 w-3" />
    ) : status === "rejected" ? (
      <AlertTriangle className="mr-1 h-3 w-3" />
    ) : (
      <Clock3 className="mr-1 h-3 w-3" />
    );
  return (
    <Badge
      variant="outline"
      className={
        status === "verified"
          ? "border-success/30 bg-success/10 text-success"
          : status === "rejected" || status === "expired"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-warning/30 bg-warning/10 text-warning"
      }
    >
      {icon}
      {labels[status]}
    </Badge>
  );
}
function PaymentBadge({ status }: { status: MyW06Billing["payments"][number]["payment_status"] }) {
  const labels = {
    verified: "Terverifikasi",
    pending_confirmation: "Menunggu konfirmasi",
    rejected: "Ditolak",
    reversed: "Dibalik",
  } as const;
  const classes = {
    verified: "border-success/30 bg-success/10 text-success",
    pending_confirmation: "border-warning/30 bg-warning/10 text-warning",
    rejected: "border-destructive/30 bg-destructive/10 text-destructive",
    reversed: "border-border bg-muted text-muted-foreground",
  } as const;
  return (
    <Badge variant="outline" className={classes[status]}>
      {labels[status]}
    </Badge>
  );
}
function invoiceStatusLabel(status: W06InvoiceStatus) {
  const labels: Record<W06InvoiceStatus, string> = {
    draft: "Terjadwal",
    issued: "Terbit",
    partially_paid: "Dibayar sebagian",
    paid: "Lunas",
    overdue: "Terlambat",
    void: "Dibatalkan",
  };
  return labels[status];
}
function noticePresentation(notice: ResidentBillingNotice, nextDueDate: string | null) {
  if (notice.kind === "settled")
    return {
      icon: CheckCircle2,
      title: "Tagihan sewa telah lunas",
      description: "Tidak ada sisa kewajiban sewa pada kontrak aktif Anda.",
      className: "border-success/35 bg-success/10 text-success",
    };
  if (notice.kind === "overdue")
    return {
      icon: AlertTriangle,
      title: "Ada tagihan yang melewati jatuh tempo",
      description: "Hubungi pengelola untuk memastikan status dan tindak lanjut pembayaran Anda.",
      className: "border-destructive/35 bg-destructive/10 text-destructive",
    };
  if (notice.kind === "due_soon")
    return {
      icon: Clock3,
      title: "Jatuh tempo dalam tujuh hari",
      description: `Tagihan berikutnya jatuh tempo ${nextDueDate ? jakartaDate(nextDueDate) : "dalam waktu dekat"}.`,
      className: "border-warning/35 bg-warning/10 text-warning",
    };
  if (notice.kind === "upcoming")
    return {
      icon: CalendarDays,
      title: "Jadwal pembayaran berikutnya",
      description: `Jatuh tempo berikutnya ${nextDueDate ? jakartaDate(nextDueDate) : "belum tersedia"}.`,
      className: "border-primary/35 bg-primary/10 text-primary",
    };
  return {
    icon: Info,
    title: "Jadwal pembayaran belum tersedia",
    description: "Belum ada tanggal jatuh tempo berikutnya pada data kontrak Anda.",
    className: "border-border bg-muted/60 text-foreground",
  };
}
function idr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
function jakartaDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}
function jakartaTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
function planLabel(value: MyW06Billing["lease"]["payment_plan"]) {
  return value === "annual_full" ? "Bayar tahunan" : "Angsuran dua bulanan";
}
function methodLabel(value: string) {
  return value === "cash" ? "Kas" : "Transfer bank";
}
function purposeLabel(value: W06PaymentPurpose | null) {
  return (
    (
      {
        rent: "Sewa",
        dp: "DP sewa",
        security_deposit: "Deposit keamanan",
        other_charge: "Tagihan lainnya",
      } as Record<string, string>
    )[value ?? ""] ?? "Pembayaran lama"
  );
}
