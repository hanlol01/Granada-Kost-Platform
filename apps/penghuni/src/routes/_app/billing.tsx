import { createFileRoute } from "@tanstack/react-router";
import type { FileResponse } from "@granada-kost/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  Landmark,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FileUploadField } from "@/components/file/FileUploadField";
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
import { Input } from "@/components/ui/input";
import {
  useMyW06Billing,
  useMyW06Receipt,
  useSubmitMyW06Proof,
  useW06BillingAccountId,
} from "@/hooks/useW06Billing";
import { newIdempotencyKey } from "@/lib/idempotency";
import { downloadMyInvoiceDocument } from "@/lib/penghuni-w06-billing";
import type {
  MyW06Billing,
  W06InvoiceStatus,
  W06PaymentPurpose,
  W06ProofStatus,
} from "@/lib/penghuni-w06-billing";

export const Route = createFileRoute("/_app/billing")({ component: BillingPage });

type Invoice = MyW06Billing["invoices"][number];
type Proof = MyW06Billing["proofs"][number];

function BillingPage() {
  const query = useMyW06Billing();
  const accountId = useW06BillingAccountId();
  const [proofInvoice, setProofInvoice] = useState<Invoice | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  useEffect(() => {
    setProofInvoice(null);
    setReceiptId(null);
  }, [accountId]);

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
      <BalanceHero billing={billing} />
      <ContractSummary billing={billing} />
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
                proofs={billing.proofs.filter((proof) => proof.invoice_id === invoice.id)}
                onProof={() => setProofInvoice(invoice)}
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
      <PaymentHistory billing={billing} onReceipt={setReceiptId} />
      <ProofHistory proofs={billing.proofs} invoices={billing.invoices} />
      <ProofDialog invoice={proofInvoice} billing={billing} onClose={() => setProofInvoice(null)} />
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

function InvoiceCard({
  invoice,
  proofs,
  onProof,
}: {
  invoice: Invoice;
  proofs: Proof[];
  onProof: () => void;
}) {
  const [documentState, setDocumentState] = useState<"idle" | "loading" | "error">("idle");
  const actionable =
    invoice.outstanding_amount > 0 &&
    ["issued", "partially_paid", "overdue"].includes(invoice.invoice_status);
  const pending = proofs.some((proof) => proof.proof_status === "pending_review");
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
            label="Bukti"
            value={pending ? "Menunggu review" : `${proofs.length} tercatat`}
            stacked
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
          {actionable ? (
            <Button className="min-h-11 w-full" onClick={onProof} disabled={pending}>
              <FileCheck2 className="mr-2 h-4 w-4" />
              {pending ? "Bukti sedang direview" : "Kirim bukti transfer"}
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
                  <Badge variant="outline">
                    {payment.payment_status === "verified"
                      ? "Terverifikasi"
                      : payment.payment_status === "pending_confirmation"
                        ? "Menunggu konfirmasi"
                        : payment.payment_status === "rejected"
                          ? "Ditolak"
                          : "Dibalik"}
                  </Badge>
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
        title="Status bukti transfer"
        description="Transfer tidak mengubah saldo sampai bukti diverifikasi admin."
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
            Belum ada bukti transfer yang dikirim.
          </p>
        )}
      </div>
    </section>
  );
}

function ProofDialog({
  invoice,
  billing,
  onClose,
}: {
  invoice: Invoice | null;
  billing: MyW06Billing;
  onClose: () => void;
}) {
  const [purpose, setPurpose] = useState<W06PaymentPurpose>("rent");
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<FileResponse | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const submit = useSubmitMyW06Proof();
  const normalizedPurpose = invoice?.invoice_purpose === "other_charge" ? "other_charge" : purpose;
  const fingerprint = JSON.stringify({
    invoice: invoice?.id,
    normalizedPurpose,
    amount,
    notes,
    fileId: evidenceFile?.id ?? null,
  });
  const key = useLogicalKey(fingerprint);
  const totalRentOutstanding = billing.invoices
    .filter((item) => item.invoice_purpose === "rent")
    .reduce((sum, item) => sum + item.outstanding_amount, 0);
  const depositRemaining = Math.max(
    0,
    billing.summary.security_deposit_required - billing.summary.deposit_collected,
  );
  const maximum =
    normalizedPurpose === "dp"
      ? totalRentOutstanding
      : normalizedPurpose === "security_deposit"
        ? depositRemaining
        : (invoice?.outstanding_amount ?? 0);

  function close() {
    if (submit.isPending || evidenceBusy) return;
    setPurpose("rent");
    setAmount(0);
    setNotes("");
    setEvidenceFile(null);
    setEvidenceBusy(false);
    submit.reset();
    onClose();
  }

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kirim bukti transfer</DialogTitle>
          <DialogDescription>
            Bukti akan masuk antrean review. Saldo hanya berubah setelah verifikasi admin.
          </DialogDescription>
        </DialogHeader>
        {invoice ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">{invoice.invoice_code}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sisa invoice {idr(invoice.outstanding_amount)}
              </p>
            </div>
            {invoice.invoice_purpose === "rent" ? (
              <Field label="Tujuan pembayaran">
                <select
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                  value={purpose}
                  onChange={(event) => {
                    setPurpose(event.target.value as W06PaymentPurpose);
                    setAmount(0);
                  }}
                >
                  <option value="rent">Sewa</option>
                  <option value="dp">DP sewa</option>
                  <option value="security_deposit">Deposit keamanan</option>
                </select>
              </Field>
            ) : null}
            <Field label="Nominal transfer">
              <Input
                type="number"
                min={1}
                max={maximum}
                value={amount || ""}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <p className="text-xs font-normal text-muted-foreground">
                Maksimum yang dapat diklaim: {idr(maximum)}
              </p>
            </Field>
            <FileUploadField
              propertyId={billing.lease.property_id}
              filePurpose="payment_proof"
              label="Bukti transfer"
              description="Wajib untuk proses verifikasi. File dapat dilihat, diganti, atau dihapus sebelum dikirim."
              value={evidenceFile}
              onChange={setEvidenceFile}
              onBusyChange={setEvidenceBusy}
              required
            />
            <Field label="Catatan (opsional)">
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            {submit.isError ? (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                Bukti belum terkirim. Periksa nominal dan file, lalu coba lagi dengan data yang
                sama.
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={close}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            disabled={
              !invoice ||
              submit.isPending ||
              evidenceBusy ||
              !evidenceFile ||
              amount <= 0 ||
              amount > maximum
            }
            onClick={() => {
              if (!invoice || !evidenceFile) return;
              submit.mutate(
                {
                  input: {
                    invoice_id: invoice.id,
                    claimed_amount: amount,
                    payment_method: "bank_transfer",
                    payment_purpose: normalizedPurpose,
                    notes: notes.trim() || undefined,
                    file_ids: [evidenceFile.id],
                  },
                  idempotencyKey: key.current.key,
                },
                { onSuccess: close },
              );
            }}
          >
            {submit.isPending ? "Mengirim..." : "Kirim untuk review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function InvoiceBadge({ status }: { status: W06InvoiceStatus }) {
  const labels: Record<W06InvoiceStatus, string> = {
    draft: "Terjadwal",
    issued: "Terbit",
    partially_paid: "Sebagian",
    paid: "Lunas",
    overdue: "Terlambat",
    void: "Void",
  };
  return <Badge variant="outline">{labels[status]}</Badge>;
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
    <Badge variant="outline">
      {icon}
      {labels[status]}
    </Badge>
  );
}
function useLogicalKey(fingerprint: string) {
  const ref = useRef({ fingerprint, key: newIdempotencyKey() });
  if (ref.current.fingerprint !== fingerprint)
    ref.current = { fingerprint, key: newIdempotencyKey() };
  return ref;
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
