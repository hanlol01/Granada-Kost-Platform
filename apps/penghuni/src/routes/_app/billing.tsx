import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
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
import {
  useMyBillingHistory,
  useMyW06Billing,
  useMyW06Receipt,
  useW06BillingAccountId,
} from "@/hooks/useW06Billing";
import {
  downloadMyBillingEvidence,
  downloadMyInvoiceDocument,
  downloadMyLeaseExitDocument,
  downloadMyReceiptDocument,
} from "@/lib/penghuni-w06-billing";
import { paymentPlanLabel } from "@/lib/format";
import type {
  MyW06Billing,
  MyBillingEvidence,
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
type FinancialEvent = MyW06Billing["financial_timeline"][number];
type Settlement = NonNullable<MyW06Billing["contract_settlement"]>;
type TerminationStatus = NonNullable<Settlement["termination_case"]>["status"];

function BillingPage() {
  const accountId = useW06BillingAccountId();
  return <BillingWorkspace key={accountId ?? "signed-out"} />;
}

function BillingWorkspace() {
  const [historicalLeaseId, setHistoricalLeaseId] = useState<string | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const history = useMyBillingHistory(historyOffset);
  const query = useMyW06Billing(historicalLeaseId);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const billing = query.data;
  const isCancelled = billing?.lease.status === "cancelled";
  return (
    <Page
      subtitle={
        historicalLeaseId ? "Riwayat tagihan dan pembayaran penyewaan sebelumnya" : undefined
      }
    >
      <section
        aria-labelledby="lease-history-heading"
        className="rounded-2xl border border-border bg-card p-4"
      >
        <h2 id="lease-history-heading" className="text-base font-semibold">
          Penyewaan yang ditinjau
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pembayaran lama tetap terpisah dari penyewaan baru. Riwayat hanya dapat dibaca.
        </p>
        <Button
          className="mt-3 min-h-11"
          variant={historicalLeaseId ? "outline" : "default"}
          aria-pressed={!historicalLeaseId}
          onClick={() => {
            setHistoricalLeaseId(null);
            setReceiptId(null);
          }}
        >
          Penyewaan saat ini
        </Button>
        <details
          className="mt-4 border-t border-border pt-3"
          open={historicalLeaseId ? true : undefined}
        >
          <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Riwayat penyewaan
          </summary>
          {history.isPending ? (
            <LoadingState label="Memuat riwayat penyewaan..." />
          ) : history.isError && !history.data ? (
            <ErrorState
              title="Riwayat belum dapat dimuat"
              error={history.error}
              onRetry={() => void history.refetch()}
            />
          ) : history.data ? (
            <>
              {history.isError ? (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  Pembaruan riwayat belum berhasil. Daftar sebelumnya tetap ditampilkan.
                </p>
              ) : null}
              <div className="divide-y divide-border">
                {history.data.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">
                        {item.lease_code} · {item.room_number}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.status === "cancelled"
                          ? "Dibatalkan dan diarsipkan"
                          : "Penyewaan berakhir"}{" "}
                        · {item.term_months} bulan
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.start_date && item.end_date
                          ? `${jakartaDate(item.start_date)} – ${jakartaDate(item.end_date)}`
                          : "Masa sewa belum dimulai"}
                      </p>
                    </div>
                    <Button
                      className="min-h-11 shrink-0"
                      variant={item.id === historicalLeaseId ? "default" : "outline"}
                      aria-pressed={item.id === historicalLeaseId}
                      onClick={() => {
                        setHistoricalLeaseId(item.id);
                        setReceiptId(null);
                      }}
                    >
                      Lihat riwayat
                    </Button>
                  </div>
                ))}
              </div>
              {!history.data.total ? (
                <p className="py-3 text-sm text-muted-foreground">
                  Belum ada penyewaan sebelumnya. Tagihan penyewaan aktif tampil di bawah.
                </p>
              ) : null}
              {history.data.total > history.data.limit ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {history.data.offset + 1}–
                    {Math.min(history.data.offset + history.data.limit, history.data.total)} dari{" "}
                    {history.data.total} penyewaan
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={history.isFetching || historyOffset === 0}
                      onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={history.isFetching || historyOffset + 20 >= history.data.total}
                      onClick={() => setHistoryOffset(historyOffset + 20)}
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </details>
      </section>
      {query.isPending ? (
        <LoadingState label="Memuat tagihan penyewaan..." />
      ) : !billing ? (
        <ErrorState
          title={
            historicalLeaseId
              ? "Riwayat belum dapat dimuat"
              : "Tagihan penyewaan saat ini belum tersedia"
          }
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {query.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Pembaruan tagihan belum berhasil. Data terakhir tetap ditampilkan; coba perbarui
              kembali.
            </p>
          ) : null}
          {historicalLeaseId || isCancelled ? (
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h2 className="text-base font-semibold">
                {isCancelled
                  ? "Penyewaan dibatalkan — riwayat tetap tersedia"
                  : "Riwayat penyewaan berakhir"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">
                {billing.lease.room_number} · Catatan tagihan, pembayaran, dan kuitansi di bawah
                berasal dari penyewaan lama. Membuka riwayat tidak mengaktifkan kembali penyewaan
                atau memindahkan pembayaran ke kontrak baru.
                {isCancelled
                  ? " Jika penyelesaian pembayaran masih diperlukan, hubungi Pihak Pengelola."
                  : ""}
              </p>
            </section>
          ) : null}
          <ReadOnlyNotice />
          {!isCancelled ? <BalanceHero billing={billing} /> : null}
          {!historicalLeaseId && !isCancelled ? <BillingNotice billing={billing} /> : null}
          {!historicalLeaseId && !isCancelled && !billing.lease.service_period_pending ? (
            <SettlementProgress billing={billing} />
          ) : null}
          <ContractSummary
            billing={billing}
            historical={Boolean(historicalLeaseId) || isCancelled}
          />
          <FinancialSeparationSummary billing={billing} />
          <section aria-labelledby="invoice-heading">
            <SectionHeading
              id="invoice-heading"
              title="Tagihan kontrak"
              description="Saldo berasal dari invoice persisten dan alokasi pembayaran terverifikasi."
            />
            <div className="mt-3 space-y-3">
              {billing.invoices.length ? (
                billing.invoices.map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    servicePeriodPending={billing.lease.service_period_pending}
                  />
                ))
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
          <PaymentHistory billing={billing} onReceipt={setReceiptId} onEvidenceRefresh={() => query.refetch()} />
          <FinancialTimeline billing={billing} onReceipt={setReceiptId} />
          <OfficialLeaseDocuments billing={billing} />
          <ProofHistory
            leaseId={billing.lease.id}
            proofs={billing.proofs}
            invoices={billing.invoices}
            onEvidenceRefresh={() => query.refetch()}
          />
        </>
      )}
      <ReceiptDialog
        key={receiptId ?? "closed"}
        receiptId={receiptId}
        onClose={() => setReceiptId(null)}
      />
    </Page>
  );
}

function SettlementProgress({ billing }: { billing: MyW06Billing }) {
  const settlement = billing.contract_settlement;
  if (!settlement) return null;

  const finalSettlementDueAt = settlement.final_settlement_due_at ?? settlement.effective_due_at;

  return (
    <section aria-labelledby="settlement-progress-heading">
      <SectionHeading
        id="settlement-progress-heading"
        title="Pelunasan sewa kontrak"
        description="Lihat sisa kewajiban sewa dan batas waktu pelunasan kontrak Anda."
      />
      <Card className="mt-3 border-primary/25">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Sisa kewajiban sewa</p>
              <p className="mt-1 text-2xl font-bold">{idr(settlement.outstanding_amount)}</p>
            </div>
            <SettlementBadge status={settlement.status} />
          </div>

          <div className="grid gap-y-2 rounded-xl bg-muted p-3 text-sm">
            <BillingDetailRow
              label="Total sewa kontrak"
              value={idr(settlement.contract_rent_amount)}
            />
            <BillingDetailRow label="Sudah dibayar" value={idr(billing.summary.rent_paid)} />
            <BillingDetailRow
              label="Batas pelunasan kontrak"
              value={
                finalSettlementDueAt ? jakartaFinancialDate(finalSettlementDueAt) : "Belum tersedia"
              }
            />
          </div>

          {settlement.extension_due_at ? (
            <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed">
              Perpanjangan resmi berlaku sampai {jakartaFinancialDate(settlement.extension_due_at)}
              {settlement.extension_reason ? ` · ${settlement.extension_reason}` : ""}.
            </p>
          ) : null}

          {settlement.payment_promise ? (
            <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
              Janji bayar tercatat untuk{" "}
              {jakartaDate(settlement.payment_promise.promised_payment_date)}
              {` sebesar ${idr(settlement.payment_promise.promised_amount)}`}. Janji bayar tidak
              mengubah status jatuh tempo tanpa perpanjangan resmi.
            </p>
          ) : null}

          {settlement.termination_case ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
              <p className="text-sm font-semibold">Proses pemberhentian sewa</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Status {terminationStatusLabel(settlement.termination_case.status)} · rencana
                check-out {jakartaDate(settlement.termination_case.planned_checkout_date)}. Kamar,
                tagihan, dan refund baru berubah setelah keputusan serta finalisasi pengelola.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground">
        Sisa sewa kontrak
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight">
        {idr(billing.summary.rent_outstanding)}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-primary-foreground/20 pt-4 text-sm">
        <div>
          <p className="text-primary-foreground">Sudah dibayar</p>
          <p className="mt-1 font-semibold">{idr(billing.summary.rent_paid)}</p>
        </div>
        <div>
          <p className="text-primary-foreground">Jatuh tempo berikutnya</p>
          <p className="mt-1 font-semibold">{nextDue ? jakartaDate(nextDue) : "Tidak ada"}</p>
        </div>
      </div>
    </section>
  );
}

function ContractSummary({
  billing,
  historical = false,
}: {
  billing: MyW06Billing;
  historical?: boolean;
}) {
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
            value={
              billing.lease.service_period_pending
                ? `${billing.lease.term_months ?? "—"} bulan · Masa sewa belum dimulai—menunggu check-in`
                : `${jakartaDate(billing.lease.start_date)} – ${jakartaDate(billing.lease.end_date)}`
            }
          />
          <SummaryRow label="Nilai sewa" value={idr(billing.lease.contract_rent)} />
          <SummaryRow label="Tarif bulanan kontrak" value={idr(billing.lease.monthly_rate)} />
          {billing.lease.pricing_source === "negotiated" ? (
            <Badge variant="outline" className="border-sky-500/35 bg-sky-500/10 text-sky-700">
              Tarif kesepakatan khusus
            </Badge>
          ) : null}
          <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            Tarif ini mengikuti durasi dan ketentuan kontrak yang dicatat Pihak Pengelola.
          </p>
          {!historical ? (
            <SummaryRow
              label="Sisa masa kontrak"
              value={
                billing.lease.service_period_pending
                  ? "Menunggu check-in"
                  : `${billing.lease.remaining_days} hari`
              }
            />
          ) : null}
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
          <SummaryRow
            label="Deposit yang masih tercatat"
            value={idr(billing.summary.deposit_balance)}
          />
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

function InvoiceCard({
  invoice,
  servicePeriodPending,
}: {
  invoice: Invoice;
  servicePeriodPending?: boolean;
}) {
  const [documentState, setDocumentState] = useState<"idle" | "loading" | "error">("idle");
  return (
    <Card className={invoice.invoice_status === "overdue" ? "border-destructive/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{invoice.invoice_code}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {invoice.invoice_purpose === "rent" ? "Sewa" : "Tagihan lainnya"} ·{" "}
              {servicePeriodPending && invoice.invoice_purpose === "rent"
                ? "Masa sewa belum dimulai—menunggu check-in"
                : `${jakartaDate(invoice.coverage_start)} – ${jakartaDate(invoice.coverage_end)}`}
            </p>
          </div>
          <InvoiceBadge status={invoice.invoice_status} />
        </div>
        <div className="mt-4 grid gap-y-2 rounded-xl bg-muted p-3 text-sm">
          <BillingDetailRow label="Total" value={idr(invoice.total_amount)} />
          <BillingDetailRow label="Sisa" value={idr(invoice.outstanding_amount)} />
          <BillingDetailRow
            label="Jatuh tempo"
            value={
              servicePeriodPending && invoice.invoice_purpose === "rent"
                ? "Ditentukan setelah check-in"
                : jakartaDate(invoice.due_date)
            }
          />
          <BillingDetailRow
            label="Status pembayaran"
            value={invoiceStatusLabel(invoice.invoice_status)}
          />
        </div>
        <div className="mt-4">
          {invoice.invoice_status !== "draft" ? (
            <Button
              variant="default"
              className="min-h-11 w-full shadow-sm"
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
  onEvidenceRefresh,
}: {
  billing: MyW06Billing;
  onReceipt: (id: string) => void;
  onEvidenceRefresh: () => Promise<unknown>;
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
                      {payment.paid_at
                        ? jakartaFinancialDate(payment.paid_at)
                        : "Tanggal belum tersedia"}
                    </p>
                  </div>
                  {payment.receipt_id ? (
                    <Button
                      variant="default"
                      className="min-h-11 shadow-sm"
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
                <BillingEvidenceFiles
                  leaseId={billing.lease.id}
                  evidence={payment.evidence ?? []}
                  onRefresh={onEvidenceRefresh}
                />
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

function FinancialTimeline({
  billing,
  onReceipt,
}: {
  billing: MyW06Billing;
  onReceipt: (id: string) => void;
}) {
  return (
    <section aria-labelledby="financial-timeline-heading">
      <SectionHeading
        id="financial-timeline-heading"
        title="Timeline finansial"
        description="Urutan uang masuk, koreksi, deposit, dan refund. Riwayat lama tetap dipertahankan ketika ada pembatalan atau penyesuaian."
      />
      <div className="mt-3 space-y-3">
        {billing.financial_timeline.length ? (
          billing.financial_timeline.map((event) => {
            const DirectionIcon =
              event.direction === "inbound"
                ? ArrowDownLeft
                : event.direction === "outbound"
                  ? ArrowUpRight
                  : RefreshCcw;
            return (
              <article
                key={`${event.event_type}-${event.id}`}
                className="rounded-2xl border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${financialDirectionClass(event.direction)}`}
                  >
                    <DirectionIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">
                          {financialEventLabel(event.event_type)}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {jakartaFinancialDate(event.occurred_at)} · {event.actor_name}
                        </p>
                      </div>
                      <p className="font-bold">{financialAmount(event.direction, event.amount)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge
                        label={financialStatusLabel(event.status)}
                        tone={
                          event.status === "posted"
                            ? "success"
                            : event.status === "reversed"
                              ? "neutral"
                              : "warning"
                        }
                      />
                      {event.reference ? <span>{event.reference}</span> : null}
                      {event.subtype ? <span>· {financialSubtypeLabel(event.subtype)}</span> : null}
                    </div>
                    {event.note ? (
                      <p className="mt-3 rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                        {event.note}
                      </p>
                    ) : null}
                    {event.receipt_id ? (
                      <Button
                        variant="default"
                        className="mt-3 min-h-11"
                        onClick={() => onReceipt(event.receipt_id!)}
                      >
                        <ReceiptText className="mr-2 h-4 w-4" /> Lihat kuitansi
                      </Button>
                    ) : event.exit_document_id ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Dokumen terkait tersedia pada bagian dokumen resmi penyewaan.
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Belum ada aktivitas finansial yang tercatat.
          </p>
        )}
      </div>
    </section>
  );
}

function OfficialLeaseDocuments({ billing }: { billing: MyW06Billing }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  if (!billing.exit_documents.length) return null;
  return (
    <section aria-labelledby="official-document-heading">
      <SectionHeading
        id="official-document-heading"
        title="Dokumen resmi penyewaan"
        description="Berita acara checkout, final settlement, dan bukti refund diterbitkan sebagai PDF tetap."
      />
      <div className="mt-3 space-y-3">
        {billing.exit_documents.map((document) => (
          <Card key={document.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">
                  {document.document_kind === "checkout_handover"
                    ? "Berita acara checkout"
                    : document.document_kind === "final_settlement"
                      ? "Final settlement"
                      : "Bukti pengembalian refund"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {document.document_code} · {jakartaFinancialDate(document.issued_at)}
                </p>
              </div>
              <Button
                className="min-h-11 shrink-0"
                disabled={downloadingId === document.id}
                onClick={() => {
                  setDownloadingId(document.id);
                  setDownloadError(false);
                  void downloadMyLeaseExitDocument(document.id, document.document_code)
                    .catch(() => setDownloadError(true))
                    .finally(() => setDownloadingId(null));
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingId === document.id ? "Menyiapkan..." : "Unduh PDF"}
              </Button>
            </CardContent>
          </Card>
        ))}
        {downloadError ? (
          <p role="alert" className="text-xs text-destructive">
            Dokumen belum dapat diunduh. Silakan coba lagi.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BillingEvidenceFiles({
  leaseId,
  evidence,
  onRefresh,
}: {
  leaseId: string;
  evidence: MyBillingEvidence[];
  onRefresh: () => Promise<unknown>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!evidence.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-sm font-semibold">Berkas bukti pembayaran</p>
      {evidence.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
            {file.original_filename}
          </p>
          {file.availability === "available" ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pendingId !== null}
              onClick={() => {
                setPendingId(file.id);
                setError(null);
                void downloadMyBillingEvidence(leaseId, file)
                  .catch(async (error) => {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Bukti belum dapat diunduh. Coba kembali.",
                    );
                    // Refresh authoritative availability, without interpreting
                    // a network/storage error as physical deletion locally.
                    await onRefresh().catch(() => undefined);
                  })
                  .finally(() => setPendingId(null));
              }}
            >
              {pendingId === file.id ? "Menyiapkan bukti..." : "Lihat / unduh bukti"}
            </Button>
          ) : (
            <p className="w-full text-sm">
              {file.availability === "purged"
                ? `Berkas dihapus permanen pada ${jakartaFinancialDate(file.purged_at!)}. Riwayat tetap tersedia.`
                : file.availability === "purge_pending"
                  ? "Berkas sedang dalam pengajuan penghapusan. Hasilnya belum dipastikan."
                  : "Berkas belum tersedia. Riwayat tetap tersimpan; hubungi Pihak Pengelola."}
            </p>
          )}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ProofHistory({
  leaseId,
  proofs,
  invoices,
  onEvidenceRefresh,
}: {
  leaseId: string;
  proofs: Proof[];
  invoices: Invoice[];
  onEvidenceRefresh: () => Promise<unknown>;
}) {
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
                    {idr(proof.claimed_amount)} · {jakartaFinancialDate(proof.uploaded_at)}
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
              <BillingEvidenceFiles leaseId={leaseId} evidence={proof.evidence ?? []} onRefresh={onEvidenceRefresh} />
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
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");
  return (
    <Dialog open={Boolean(receiptId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kuitansi pembayaran</DialogTitle>
          <DialogDescription>
            Catatan kuitansi tetap disimpan setelah diterbitkan.
          </DialogDescription>
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
                <p className="text-xs text-muted-foreground">
                  {jakartaFinancialDate(query.data.issued_at)}
                </p>
              </div>
            </div>
            <SummaryRow label="Pembayaran" value={query.data.snapshot.payment_code} />
            <SummaryRow label="Metode" value={methodLabel(query.data.snapshot.payment_method)} />
            <SummaryRow label="Tujuan" value={purposeLabel(query.data.snapshot.payment_purpose)} />
            <SummaryRow label="Nominal" value={idr(query.data.amount)} />
          </div>
        ) : null}
        <DialogFooter>
          {query.data ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={downloadState === "loading"}
              onClick={() => {
                setDownloadState("loading");
                void downloadMyReceiptDocument(query.data.id, query.data.receipt_code)
                  .then(() => setDownloadState("idle"))
                  .catch(() => setDownloadState("error"));
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloadState === "loading" ? "Menyiapkan..." : "Unduh PDF"}
            </Button>
          ) : null}
          <Button className="min-h-11" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
        {downloadState === "error" ? (
          <p role="alert" className="text-xs text-destructive">
            PDF kuitansi belum dapat diunduh. Silakan coba lagi.
          </p>
        ) : null}
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
function BillingDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        :
      </span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}
function InvoiceBadge({ status }: { status: W06InvoiceStatus }) {
  const tones: Record<W06InvoiceStatus, StatusTone> = {
    draft: "neutral",
    issued: "info",
    partially_paid: "warning",
    paid: "success",
    overdue: "danger",
    void: "neutral",
  };
  return <StatusBadge label={invoiceStatusLabel(status)} tone={tones[status]} />;
}
function ProofBadge({ status }: { status: W06ProofStatus }) {
  const labels: Record<W06ProofStatus, string> = {
    pending_review: "Menunggu review",
    verified: "Diterima",
    rejected: "Ditolak",
    expired: "Kedaluwarsa",
  };
  const tones: Record<W06ProofStatus, StatusTone> = {
    pending_review: "warning",
    verified: "success",
    rejected: "danger",
    expired: "danger",
  };
  return <StatusBadge label={labels[status]} tone={tones[status]} />;
}
function PaymentBadge({ status }: { status: MyW06Billing["payments"][number]["payment_status"] }) {
  const labels = {
    verified: "Terverifikasi",
    pending_confirmation: "Menunggu konfirmasi",
    rejected: "Ditolak",
    reversed: "Dibatalkan",
  } as const;
  const tones: Record<MyW06Billing["payments"][number]["payment_status"], StatusTone> = {
    verified: "success",
    pending_confirmation: "warning",
    rejected: "danger",
    reversed: "neutral",
  } as const;
  return <StatusBadge label={labels[status]} tone={tones[status]} />;
}
function SettlementBadge({ status }: { status: Settlement["status"] }) {
  const labels: Record<Settlement["status"], string> = {
    awaiting_activation: "Menunggu aktivasi",
    open: "Berjalan",
    extended: "Diperpanjang",
    overdue: "Terlambat",
    admin_action_required: "Tindakan pengelola diperlukan",
    termination_pending: "Pemberhentian diproses",
    terminated: "Dihentikan",
    cancelled: "Dibatalkan",
    paid: "Lunas",
  };
  const tones: Record<Settlement["status"], StatusTone> = {
    awaiting_activation: "warning",
    open: "info",
    extended: "info",
    overdue: "danger",
    admin_action_required: "danger",
    termination_pending: "warning",
    terminated: "neutral",
    cancelled: "neutral",
    paid: "success",
  };
  return <StatusBadge label={labels[status]} tone={tones[status]} />;
}
function financialEventLabel(eventType: FinancialEvent["event_type"]) {
  const labels: Record<FinancialEvent["event_type"], string> = {
    payment_recorded: "Pembayaran dicatat",
    payment_reversed: "Pembayaran dibatalkan",
    booking_refund: "Refund pra-aktivasi",
    deposit_collected: "Security deposit diterima",
    deposit_deducted: "Potongan security deposit",
    deposit_refunded: "Security deposit dikembalikan",
    invoice_adjustment: "Penyesuaian tagihan",
    exit_refund: "Refund akhir penyewaan",
  };
  return labels[eventType];
}
function financialDirectionClass(direction: FinancialEvent["direction"]) {
  if (direction === "inbound") return "bg-success/10 text-success";
  if (direction === "outbound") return "bg-warning/10 text-warning";
  return "bg-primary/10 text-primary";
}
function financialAmount(direction: FinancialEvent["direction"], amount: number) {
  const prefix = direction === "inbound" ? "+" : direction === "outbound" ? "−" : "±";
  return `${prefix}${idr(amount)}`;
}
function financialStatusLabel(status: string) {
  const labels: Record<string, string> = {
    verified: "Terverifikasi",
    reversed: "Dibatalkan",
    refunded: "Dikembalikan",
    recorded: "Tercatat",
    approved: "Disetujui",
    paid: "Dibayar",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
function financialSubtypeLabel(subtype: string) {
  return (
    {
      rent: "Sewa",
      dp: "DP sewa",
      security_deposit: "Security deposit",
      other_charge: "Tagihan lain",
      collection: "Penerimaan deposit",
      top_up: "Penambahan deposit",
      deduction: "Potongan deposit",
      refund: "Refund",
    }[subtype] ?? subtype.replaceAll("_", " ")
  );
}
function terminationStatusLabel(status: TerminationStatus) {
  return (
    {
      pending: "menunggu keputusan",
      cancelled: "dibatalkan",
      checked_out: "check-out selesai",
    } as const
  )[status];
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
      className: "border-success/35 bg-success/10 text-success",
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
function jakartaFinancialDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
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
        booking_fee: "Booking Fee / tahan kamar",
        down_payment: "DP / uang muka sewa",
        full_settlement: "Pelunasan sewa penuh",
        security_deposit: "Deposit keamanan",
        other_charge: "Tagihan lainnya",
        management_fee: "Biaya pengelolaan",
      } as Record<string, string>
    )[value ?? ""] ?? "Pembayaran lama"
  );
}
