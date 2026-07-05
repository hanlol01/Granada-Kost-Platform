import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Filter,
  ImagePlus,
  Receipt,
  RefreshCw,
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
import {
  isPaymentSessionExpired,
  paymentErrorCode,
  paymentErrorMessage,
  useCreatePaymentSession,
  useInvoicePaymentStatus,
} from "@/hooks/usePaymentGateway";
import { env } from "@/lib/env";
import { qk } from "@/lib/query-client";
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
  // True when the backend confirms the current invoice is settled by the
  // payment gateway (webhook source of truth). Hides both payment CTAs.
  const [gatewayPaid, setGatewayPaid] = useState(false);

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

            {/* Online payment (gateway). Paid status only comes from the
                backend (webhook-settled) — never from redirect/return. */}
            {current ? <OnlinePaymentCard invoice={current} onPaidChange={setGatewayPaid} /> : null}

            {/* Manual payment proof upload — fallback path (M12C3). Hidden
                once the gateway reports the invoice as paid. */}
            {current && !gatewayPaid ? (
              <div id="manual-proof-section">
                <ManualPaymentProofUpload invoice={current} />
              </div>
            ) : null}

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

const GATEWAY_FAILED_LABEL: Record<string, string> = {
  failed: "Pembayaran Gagal",
  denied: "Pembayaran Gagal",
  expired: "Kadaluarsa",
  cancelled: "Dibatalkan",
};

function hasReturnFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setReturnFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage unavailable: post-return copy simply won't show; status polling
    // and webhook settlement are unaffected.
  }
}

function clearReturnFlag(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * Online payment card (M15C-E2A).
 *
 * States follow the M15C-E1 plan: A unpaid → B pending → C post-return →
 * D paid / E failed-expired-cancelled-denied / F requires_review-challenge.
 * The backend payment-status endpoint is the only source of truth; the
 * redirect/return URL never marks the invoice paid.
 */
function OnlinePaymentCard({
  invoice,
  onPaidChange,
}: {
  invoice: MyInvoiceRecord;
  onPaidChange: (paid: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const returnFlagKey = `kst-payment-return-${invoice.id}`;

  const [justReturned, setJustReturned] = useState<boolean>(() => hasReturnFlag(returnFlagKey));
  const [pollingStartedAt, setPollingStartedAt] = useState<number | null>(() =>
    hasReturnFlag(returnFlagKey) ? Date.now() : null,
  );
  const [snapOnlyNotice, setSnapOnlyNotice] = useState(false);

  const statusQuery = useInvoicePaymentStatus(invoice.id, { pollingStartedAt });
  const createSession = useCreatePaymentSession();

  const status = statusQuery.data ?? null;
  const paymentStatus = status?.paymentStatus ? String(status.paymentStatus) : null;
  const isPaid = status?.invoiceStatus === "paid" || paymentStatus === "paid";
  const isPendingOnline =
    !isPaid && (paymentStatus === "pending" || paymentStatus === "created");
  const isFailedRetryable =
    !isPaid && paymentStatus !== null && paymentStatus in GATEWAY_FAILED_LABEL;
  const needsReview =
    !isPaid &&
    (paymentStatus === "requires_review" ||
      paymentStatus === "challenge" ||
      paymentStatus === "unknown");

  useEffect(() => {
    onPaidChange(isPaid);
    if (isPaid) {
      clearReturnFlag(returnFlagKey);
      setJustReturned(false);
      setPollingStartedAt(null);
      // Refresh invoice/payment lists so the paid invoice moves to history.
      void queryClient.invalidateQueries({ queryKey: qk.penghuni.billingHistory() });
    }
  }, [isPaid, onPaidChange, queryClient, returnFlagKey]);

  useEffect(() => {
    // Once a non-pending result arrives after returning, drop the
    // "being confirmed" copy in favor of the concrete state.
    if (justReturned && paymentStatus && !isPendingOnline) {
      clearReturnFlag(returnFlagKey);
      setJustReturned(false);
    }
  }, [justReturned, paymentStatus, isPendingOnline, returnFlagKey]);

  const canPayOnline = ["issued", "unpaid", "overdue", "partially_paid"].includes(
    invoice.invoiceStatus,
  );

  // Gateway disabled / not configured: hide the online card entirely.
  // Manual payment proof below remains the visible payment path.
  const statusErrorCode = paymentErrorCode(statusQuery.error);
  if (statusErrorCode === "PAYMENT_GATEWAY_DISABLED" || statusErrorCode === "PAYMENT_CONFIG_MISSING") {
    return null;
  }
  if (!canPayOnline && !isPaid) return null;

  const canContinue =
    Boolean(status?.paymentUrl) && !isPaymentSessionExpired(status?.expiresAt);

  async function handlePayOnline() {
    setSnapOnlyNotice(false);
    try {
      const session = await createSession.mutateAsync({ invoiceId: invoice.id });
      if (session.paymentUrl) {
        // Mark the in-flight attempt so the post-return copy shows when the
        // resident lands back on this page. Redirect NEVER marks paid.
        setReturnFlag(returnFlagKey);
        setPollingStartedAt(Date.now());
        window.location.assign(session.paymentUrl);
        return;
      }
      if (session.snapToken) {
        // Snap.js popup integration is intentionally not enabled in this
        // milestone (no client key env is added). Backend normally returns
        // paymentUrl; this is a defensive path.
        setSnapOnlyNotice(true);
      }
      setPollingStartedAt(Date.now());
    } catch (error) {
      const code = paymentErrorCode(error);
      if (code === "PAYMENT_INVOICE_ALREADY_PAID" || code === "PAYMENT_TRANSACTION_PENDING") {
        void statusQuery.refetch();
      }
    }
  }

  function handleContinuePayment() {
    if (!status?.paymentUrl) return;
    setReturnFlag(returnFlagKey);
    setPollingStartedAt(Date.now());
    window.location.assign(status.paymentUrl);
  }

  function handleCheckStatus() {
    setPollingStartedAt(Date.now());
    void statusQuery.refetch();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Pembayaran Online</p>
            {isPaid ? (
              <span className="rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-success-foreground">
                Lunas
              </span>
            ) : isPendingOnline ? (
              <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                Menunggu Pembayaran Online
              </span>
            ) : isFailedRetryable && paymentStatus ? (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                {GATEWAY_FAILED_LABEL[paymentStatus]}
              </span>
            ) : needsReview ? (
              <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                Perlu Tinjauan
              </span>
            ) : null}
          </div>

          {statusQuery.isLoading ? (
            <p className="mt-2">Memeriksa status pembayaran online...</p>
          ) : isPaid ? (
            <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-3 text-xs text-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="font-semibold">Tagihan sudah lunas.</p>
                  {status?.paidAt ? (
                    <p className="mt-0.5 text-muted-foreground">
                      Dibayar pada {formatDate(status.paidAt)}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-muted-foreground">
                    {paymentStatus === "paid"
                      ? "Dibayar via Pembayaran Online"
                      : "Diverifikasi Manual"}
                  </p>
                </div>
              </div>
            </div>
          ) : needsReview ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                <p className="font-semibold">Pembayaran perlu ditinjau.</p>
                <p className="mt-0.5 text-muted-foreground">
                  Pembayaran perlu ditinjau. Silakan hubungi admin apabila status tidak berubah.
                </p>
                {status?.safeMessage ? (
                  <p className="mt-0.5 text-muted-foreground">{status.safeMessage}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={statusQuery.isFetching}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground disabled:opacity-60"
              >
                <RefreshCw className={"h-3.5 w-3.5" + (statusQuery.isFetching ? " animate-spin" : "")} />
                Cek Status Pembayaran
              </button>
            </div>
          ) : isPendingOnline ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-foreground">
                  Status lunas akan diperbarui otomatis setelah pembayaran dikonfirmasi.
                </p>
                {justReturned ? (
                  <p className="mt-1">
                    Pembayaran sedang dikonfirmasi. Silakan tunggu beberapa saat atau tekan Cek
                    Status.
                  </p>
                ) : null}
                {status?.safeMessage ? <p className="mt-1">{status.safeMessage}</p> : null}
              </div>
              {canContinue ? (
                <button
                  type="button"
                  onClick={handleContinuePayment}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Lanjutkan Pembayaran
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={statusQuery.isFetching}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground disabled:opacity-60"
              >
                <RefreshCw className={"h-3.5 w-3.5" + (statusQuery.isFetching ? " animate-spin" : "")} />
                Cek Status Pembayaran
              </button>
              <p>
                Bukti pembayaran manual di bawah tetap tersedia sebagai fallback — gunakan hanya
                jika Anda membayar di luar pembayaran online.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {isFailedRetryable ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
                  <p className="font-semibold">
                    Pembayaran gagal. Anda dapat mencoba kembali atau menggunakan pembayaran
                    manual.
                  </p>
                  {status?.safeMessage ? (
                    <p className="mt-0.5 text-muted-foreground">{status.safeMessage}</p>
                  ) : null}
                </div>
              ) : (
                <p>Pembayaran online diproses melalui halaman pembayaran aman.</p>
              )}

              {snapOnlyNotice ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3">
                  Pembayaran online belum dapat dibuka di aplikasi ini. Silakan coba lagi nanti
                  atau gunakan pembayaran manual di bawah.
                </div>
              ) : null}

              {createSession.isError ? (
                <InlineError message={paymentErrorMessage(createSession.error)} />
              ) : null}

              <button
                type="button"
                onClick={() => void handlePayOnline()}
                disabled={createSession.isPending}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition active:scale-[0.98] disabled:opacity-70"
              >
                {createSession.isPending ? "Memproses..." : "Bayar Online"}
              </button>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("manual-proof-section")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                Upload Bukti Manual
              </button>
            </div>
          )}
        </div>
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
            Jalur utama adalah Pembayaran Online di atas. Upload ini tetap menjadi fallback untuk
            transfer manual, tunai, gangguan gateway, atau rekonsiliasi.
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
