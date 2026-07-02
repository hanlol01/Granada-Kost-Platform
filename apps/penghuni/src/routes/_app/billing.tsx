import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  Filter,
  ImagePlus,
  Receipt,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FilePickerButton } from "@/components/file/FilePickerButton";
import { FilePreview } from "@/components/file/FilePreview";
import { FileUploadProgress } from "@/components/file/FileUploadProgress";
import { WhatsAppFallbackButton } from "@/components/file/WhatsAppFallbackButton";
import { LoadingState, EmptyState, ErrorState } from "@/components/state";
import { useFileUpload } from "@/hooks/useFileUpload";
import {
  selectCurrentInvoice,
  useMyInvoices,
  useMyPayments,
  useSubmitPaymentProof,
  type MyInvoiceRecord,
  type MyInvoiceStatus,
  type MyPaymentMethod,
  type MyPaymentRecord,
  type MyPaymentProofRecord,
} from "@/hooks/usePenghuniBilling";
import { env } from "@/lib/env";
import { daysUntil, formatDate, formatIDR, formatPeriodKey } from "@/lib/format";
import type { FileResponse, FileValidationResult } from "@granada-kost/domain";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type HistoryFilter = "all" | "paid";
type FilePickerValidationError = Extract<FileValidationResult, { valid: false }>;

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

            {/* Manual payment proof upload */}
            {current ? <ManualPaymentProofUpload invoice={current} /> : null}

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

function ManualPaymentProofUpload({ invoice }: { invoice: MyInvoiceRecord }) {
  const [uploadedFile, setUploadedFile] = useState<FileResponse | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<MyPaymentMethod>("bank_transfer");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<FilePickerValidationError | null>(null);
  const [submittedProof, setSubmittedProof] = useState<MyPaymentProofRecord | null>(null);

  const upload = useFileUpload({
    onUploadSuccess: (file) => {
      setUploadedFile(file);
      setSubmittedProof(null);
      setValidationError(null);
    },
  });
  const submitProof = useSubmitPaymentProof();

  const canSubmitForInvoice = ["issued", "unpaid", "overdue", "partially_paid"].includes(
    invoice.invoiceStatus,
  );
  const showWhatsAppFallback =
    validationError?.code === "CLIENT_FILE_TOO_LARGE" ||
    Boolean(upload.uploadError) ||
    submitProof.isError;
  const isBusy = upload.isUploading || submitProof.isPending;

  async function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;

    setSelectedFilename(file.name);
    setUploadedFile(null);
    setSubmittedProof(null);
    setValidationError(null);

    try {
      await upload.uploadAsync({
        file,
        propertyId: invoice.propertyId,
        filePurpose: "payment_proof",
      });
    } catch {
      // Toast + inline fallback are handled by the hook and render state.
    }
  }

  async function handleSubmit() {
    if (!uploadedFile || !canSubmitForInvoice) return;

    try {
      const proof = await submitProof.mutateAsync({
        invoice_id: invoice.id,
        claimed_amount: invoice.totalAmount,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        file_ids: [uploadedFile.id],
      });
      setSubmittedProof(proof);
    } catch {
      // Toast + inline fallback are handled by mutation state.
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ImagePlus className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Upload Bukti Pembayaran Manual</p>
          <p className="mt-0.5">
            Bukti akan diperiksa admin. Status tagihan belum otomatis lunas sampai admin
            memverifikasi pembayaran manual ini.
          </p>
          <p className="mt-1">
            Pembayaran online/payment gateway akan ditangani di milestone berikutnya. Upload ini
            tetap menjadi fallback untuk transfer manual, tunai, gangguan gateway, atau
            rekonsiliasi.
          </p>

          {!canSubmitForInvoice ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/40 p-3">
              Tagihan ini belum siap untuk upload bukti manual. Upload tersedia untuk tagihan yang
              sudah diterbitkan, belum lunas, terlambat, atau sebagian terbayar.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Invoice dipilih
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {invoice.invoiceCode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPeriodKey(invoice.snapshotPeriodKey)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-foreground">
                    {formatIDR(invoice.totalAmount)}
                  </p>
                </div>
              </div>

              <FilePickerButton
                filePurpose="payment_proof"
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onValidationError={(result) =>
                  setValidationError(result?.valid === false ? result : null)
                }
                disabled={isBusy}
              />

              {upload.isUploading && selectedFilename ? (
                <FileUploadProgress filename={selectedFilename} />
              ) : null}

              {uploadedFile ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                  <FilePreview file={uploadedFile} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {uploadedFile.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      File sudah diupload. Lanjutkan dengan kirim bukti manual.
                    </p>
                  </div>
                  <FileCheck2 className="h-5 w-5 shrink-0 text-success" />
                </div>
              ) : null}

              <label className="block">
                <span className="text-xs font-medium text-foreground">Metode pembayaran</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as MyPaymentMethod)}
                  disabled={isBusy || Boolean(submittedProof)}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="bank_transfer">Transfer Bank</option>
                  <option value="qris">QRIS Manual</option>
                  <option value="ewallet">E-Wallet</option>
                  <option value="cash">Tunai</option>
                  <option value="other">Lainnya</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-foreground">Catatan opsional</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={isBusy || Boolean(submittedProof)}
                  rows={3}
                  placeholder="Contoh: Transfer BCA dari Farhan, 3 Juli 2026."
                  className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              </label>

              {upload.uploadError ? (
                <InlineError message={errorMessage(upload.uploadError)} />
              ) : null}
              {submitProof.isError ? (
                <InlineError message={errorMessage(submitProof.error)} />
              ) : null}

              {showWhatsAppFallback ? (
                <div className="rounded-xl border border-dashed border-green-600/40 bg-green-50 p-3 text-xs text-green-900">
                  <p className="mb-2 font-medium">
                    Jika upload gagal atau file terlalu besar, kirim bukti ke admin via WhatsApp.
                  </p>
                  <WhatsAppFallbackButton
                    context={`bukti pembayaran manual untuk invoice ${invoice.invoiceCode}`}
                    adminPhone={env.VITE_ADMIN_WHATSAPP_PHONE}
                    className="w-full"
                  />
                </div>
              ) : null}

              {submittedProof ? (
                <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-xs text-foreground">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <div>
                      <p className="font-semibold">Bukti manual terkirim.</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Status: menunggu review admin. Tagihan belum otomatis lunas sampai
                        diverifikasi.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!uploadedFile || isBusy || Boolean(submittedProof)}
                onClick={() => void handleSubmit()}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
              >
                {submitProof.isPending
                  ? "Mengirim bukti..."
                  : submittedProof
                    ? "Menunggu review admin"
                    : "Kirim Bukti Manual"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Terjadi kendala. Coba lagi atau hubungi admin.";
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
